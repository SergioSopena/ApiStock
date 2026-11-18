import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useData } from '../app/DataProvider';
import { useSyncState } from '../sync/store';
import { Sheet, dangerBtn, primaryBtn, secondaryBtn } from './primitives';
import { useToast } from './Toast';

const REASONS: Record<string, string> = {
  insufficient_stock: 'No hay existencias suficientes.',
  code_taken: 'Ese código ya está en uso.',
  version_mismatch: 'Otro dispositivo modificó este elemento antes.',
  row_missing: 'El elemento ya no existe.',
  location_has_stock: 'La ubicación todavía contiene material.',
  location_has_children: 'La ubicación tiene sububicaciones.',
};

export function SyncPill() {
  const { db, engine } = useData();
  const sync = useSyncState();
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const items = useLiveQuery(() => db.outbox.orderBy('seq').toArray(), [db]) ?? [];
  const pending = items.length;
  const problem = items.find((i) => i.status !== 'pending');

  let dot = 'bg-pine-600';
  let label = 'Sincronizado';
  if (problem) { dot = 'bg-honey-500'; label = 'Requiere atención'; }
  else if (sync.phase === 'syncing') { dot = 'bg-honey-400 animate-pulse'; label = 'Sincronizando…'; }
  else if (sync.phase === 'offline' || !navigator.onLine) { dot = 'bg-ink-mute'; label = pending ? `Sin conexión · ${pending} pendientes` : 'Sin conexión'; }
  else if (sync.phase === 'error') { dot = 'bg-st-bad-fg'; label = pending ? `Reintentando · ${pending}` : 'Error de sincronización'; }
  else if (pending) { label = `${pending} pendientes`; dot = 'bg-honey-400'; }

  const exportPending = () => {
    const blob = new Blob([JSON.stringify({ app_signature: 'apistock-pending', exported_at: new Date().toISOString(), operations: items }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `apistock-pendientes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const discardAndReload = async () => {
    if (!window.confirm('Se descartarán los cambios pendientes de este dispositivo y se recargará el inventario desde el servidor. ¿Continuar?')) return;
    await db.outbox.clear();
    await db.meta.delete('cursor');
    await engine.syncNow();
    toast('Datos recargados desde el servidor.');
  };

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Estado de sincronización"
        className="tap flex items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-ink-soft">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
        <span className="max-w-[10rem] truncate">{label}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Sincronización">
        <p className="text-ink-soft">
          {sync.lastSyncAt ? `Última sincronización: ${new Date(sync.lastSyncAt).toLocaleTimeString('es-ES')}.` : 'Aún no se ha sincronizado en esta sesión.'}
          {sync.message ? ` ${sync.message}` : ''}
        </p>
        {items.length > 0 && (
          <ul className="mt-4 space-y-2">
            {items.map((i) => {
              const reason = (i.result as { reason?: string } | undefined)?.reason;
              return (
                <li key={i.op_id} className="rounded-ctl border border-line p-3 text-sm">
                  <p className="font-medium">{i.summary}</p>
                  <p className={i.status === 'pending' ? 'text-ink-mute' : 'text-st-bad-fg'}>
                    {i.status === 'pending' ? 'Pendiente de enviar' :
                      `${i.status === 'conflict' ? 'Conflicto' : i.status === 'epoch' ? 'Datos reemplazados desde otro dispositivo' : 'Rechazada'}${reason ? ': ' + (REASONS[reason] ?? reason) : ''}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <button className={primaryBtn} onClick={() => void engine.syncNow()} disabled={sync.phase === 'syncing'}>Sincronizar ahora</button>
          {items.length > 0 && <button className={secondaryBtn} onClick={exportPending}>Exportar cambios pendientes (JSON)</button>}
          {problem && <button className={dangerBtn} onClick={discardAndReload}>Descartar pendientes y recargar del servidor</button>}
        </div>
        {problem && (
          <p className="mt-3 text-xs text-ink-mute">
            Una operación pendiente no se pudo aplicar y bloquea las siguientes. La pantalla de resolución de conflictos con ambas versiones llega en la Fase 6;
            mientras tanto puedes exportar los cambios y recargar.
          </p>
        )}
      </Sheet>
    </>
  );
}
