import type { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { lotKey } from '../domain/stock';
import { topUpCodeBuffer } from '../data/codeBuffer';
import { type ApiStockDB, getMeta, setMeta } from '../data/db';
import { setSyncState } from './store';

type Change = { seq: number; t: string; r: Record<string, unknown> };

class NetworkError extends Error {}
class ServerError extends Error {}

/** Un error de PostgREST trae `code`; un fallo de red no. */
function classify(error: { message?: string; code?: string; status?: number }): Error {
  if (!error.code && !error.status) return new NetworkError(error.message ?? 'Sin conexión');
  if (error.code === 'PGRST301' || error.status === 401) return new ServerError('La sesión ha caducado. Vuelve a iniciar sesión.');
  return new ServerError(error.message ?? 'Error del servidor');
}

/**
 * Sincronización mínima (Fase 4): envía la cola en orden y, cuando está vacía, descarga los cambios.
 * El motor completo con resolución de conflictos en pantalla llega en la Fase 6.
 * Se ejecuta al abrir la app, al recuperar conexión, al volver a la pestaña, tras cada operación y cada minuto.
 */
export class SyncEngine {
  private running = false;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly db: ApiStockDB, private readonly sb: SupabaseClient) {}

  start(): () => void {
    const onOnline = () => void this.syncNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.syncNow();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', () => setSyncState({ phase: 'offline' }));
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(() => void this.syncNow(), config.syncIntervalMs);
    void this.syncNow();
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }

  /** Pide una sincronización en breve (agrupa varias operaciones seguidas). */
  request(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, 400);
  }

  async syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      if (!navigator.onLine) {
        setSyncState({ phase: 'offline', message: null });
        return;
      }
      setSyncState({ phase: 'syncing', message: null });
      const pushed = await this.push();
      if (!pushed) {
        setSyncState({ phase: 'blocked', message: 'Hay una operación que requiere tu atención.' });
        return;
      }
      await this.pull();
      try {
        await topUpCodeBuffer(this.db, this.sb);
      } catch {
        /* el búfer se rellenará en la siguiente ronda */
      }
      setSyncState({ phase: 'idle', lastSyncAt: Date.now(), message: null });
    } catch (e) {
      if (e instanceof NetworkError || (e instanceof TypeError && /fetch|network/i.test(e.message))) {
        setSyncState({ phase: 'offline', message: null });
      } else {
        setSyncState({ phase: 'error', message: e instanceof Error ? e.message : 'Error de sincronización' });
      }
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.request();
      }
    }
  }

  /** Devuelve false si una operación quedó en conflicto o rechazada (bloquea las siguientes). */
  private async push(): Promise<boolean> {
    const items = await this.db.outbox.orderBy('seq').toArray();
    for (const item of items) {
      if (item.status !== 'pending') return false;
      const { data, error } = await this.sb.rpc('apply_batch', { p_op: item.op });
      if (error) throw classify(error);
      switch (data?.status) {
        case 'applied':
          await this.db.outbox.delete(item.seq!);
          break;
        case 'conflict':
        case 'rejected':
          await this.db.outbox.update(item.seq!, { status: data.status, result: data });
          return false;
        case 'epoch_mismatch':
          await this.db.outbox.update(item.seq!, { status: 'epoch', result: data });
          return false;
        default:
          throw new ServerError('Respuesta inesperada del servidor.');
      }
    }
    return true;
  }

  private async clearSynced(): Promise<void> {
    if ((await this.db.outbox.count()) > 0) throw new ServerError('Hay cambios pendientes; se enviarán antes de resincronizar.');
    await this.db.transaction('rw', this.db.tables, async () => {
      for (const t of this.db.syncedTables) await t.clear();
    });
  }

  private async pull(): Promise<void> {
    let cursor = (await getMeta<number>(this.db, 'cursor')) ?? 0;
    let epoch = await getMeta<number>(this.db, 'epoch');
    for (let guard = 0; guard < 500; guard++) {
      const { data, error } = await this.sb.rpc('pull_changes', { p_cursor: cursor, p_limit: 1000 });
      if (error) throw classify(error);
      if (data.status === 'full_resync_required') {
        await this.clearSynced();
        cursor = 0;
        await setMeta(this.db, 'cursor', 0);
        continue;
      }
      if (epoch !== undefined && data.epoch !== epoch) {
        // Se importó una copia desde otro dispositivo: toca descargar todo de nuevo.
        await this.clearSynced();
        epoch = data.epoch;
        cursor = 0;
        await setMeta(this.db, 'epoch', epoch);
        await setMeta(this.db, 'cursor', 0);
        continue;
      }
      if (epoch === undefined) {
        epoch = data.epoch as number;
        await setMeta(this.db, 'epoch', epoch);
      }
      // Si el usuario hizo cambios mientras se descargaba, no se pisan: se enviarán primero en la siguiente ronda
      if ((await this.db.outbox.count()) > 0) {
        this.again = true;
        return;
      }
      await this.applyChanges(data.changes as Change[]);
      cursor = data.next_cursor as number;
      await setMeta(this.db, 'cursor', cursor);
      if (!data.has_more) return;
    }
  }

  private async applyChanges(changes: Change[]): Promise<void> {
    if (changes.length === 0) return;
    const db = this.db;
    await db.transaction('rw', db.tables, async () => {
      for (const c of changes) {
        if (c.t === 'tombstones') {
          const table = db.table(c.r.table as string);
          await table.delete(c.r.id as string);
          continue;
        }
        if (c.t === 'stock_lots') {
          const lot = { ...c.r, key: lotKey(c.r.type_id as string, c.r.system_id as string | null, c.r.location_id as string) };
          // Reconciliar por clave natural: si otro dispositivo creó el mismo lote con otro id, se adopta el del servidor
          await db.stock_lots.where('key').equals(lot.key).filter((l) => l.id !== lot.id).delete();
          await db.stock_lots.put(lot as never);
          continue;
        }
        await db.table(c.t).put(c.r);
      }
    });
  }
}
