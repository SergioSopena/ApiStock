import { lotKey } from '../domain/stock';
import type { Compatibility, Mutation, RowTable, StockLot } from '../domain/types';
import type { ApiStockDB } from './db';

export class LocalApplyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const DEFAULTS: Record<RowTable, Record<string, unknown>> = {
  categories: { icon: null, sort_order: 0 },
  systems: { color: null, sort_order: 0 },
  locations: { parent_id: null, sort_order: 0 },
  item_types: { icon: null, uses_system: false, attribute_defs: [], sort_order: 0 },
  units: { system_id: null, description: null, attrs: {}, notes: null },
};

function tableOf(db: ApiStockDB, t: RowTable) {
  return db[t] as unknown as import('dexie').Table<{ id: string; version: number } & Record<string, unknown>, string>;
}

/**
 * Aplica mutaciones a la copia local con la MISMA semántica que apply_batch en el servidor:
 *  - cada update sube la versión en 1 (así las operaciones encadenadas llevan base_version coherente);
 *  - lot_delta suma sobre el lote por clave natural y nunca deja el total en negativo;
 *  - borrar una unidad borra sus compatibilidades.
 * Debe llamarse dentro de una transacción de Dexie sobre todas las tablas.
 */
export async function applyMutationsLocal(db: ApiStockDB, mutations: Mutation[]): Promise<void> {
  for (const m of mutations) {
    switch (m.m) {
      case 'insert': {
        const row = { ...DEFAULTS[m.t], ...m.row, version: 1 };
        await tableOf(db, m.t).add(row as never);
        break;
      }
      case 'update': {
        const table = tableOf(db, m.t);
        const current = await table.get(m.id);
        if (!current) throw new LocalApplyError('row_missing', 'El elemento ya no existe.');
        await table.put({ ...current, ...m.set, version: current.version + 1 });
        break;
      }
      case 'delete': {
        if (m.t === 'compatibilities') {
          await db.compatibilities.delete(m.id);
        } else {
          await tableOf(db, m.t).delete(m.id);
          if (m.t === 'units') {
            await db.compatibilities.where('unit_a').equals(m.id).delete();
            await db.compatibilities.where('unit_b').equals(m.id).delete();
          }
        }
        break;
      }
      case 'compat_set': {
        const [lo, hi] = m.unit_a < m.unit_b ? [m.unit_a, m.unit_b] : [m.unit_b, m.unit_a];
        const existing = await db.compatibilities.where('unit_a').equals(lo).and((c) => c.unit_b === hi).first();
        if (existing) {
          await db.compatibilities.put({ ...existing, result: m.result, note: m.note ?? null, version: existing.version + 1 });
        } else {
          const row: Compatibility = {
            id: m.id ?? crypto.randomUUID(), unit_a: lo, unit_b: hi, result: m.result, note: m.note ?? null, version: 1,
          };
          await db.compatibilities.add(row);
        }
        break;
      }
      case 'lot_delta': {
        const key = lotKey(m.type_id, m.system_id, m.location_id);
        const lot = await db.stock_lots.where('key').equals(key).first();
        if (!lot) {
          if (m.delta < 0) throw new LocalApplyError('insufficient_stock', 'No hay existencias suficientes.');
          const row: StockLot = {
            id: m.lot_id ?? crypto.randomUUID(), type_id: m.type_id, system_id: m.system_id ?? null,
            location_id: m.location_id, quantity: m.delta, key, version: 1,
          };
          await db.stock_lots.add(row);
        } else {
          if (lot.quantity + m.delta < 0) {
            throw new LocalApplyError('insufficient_stock', `Solo hay ${lot.quantity} disponibles.`);
          }
          await db.stock_lots.put({ ...lot, quantity: lot.quantity + m.delta, version: lot.version + 1 });
        }
        break;
      }
      case 'drop_recent':
        await db.recent_operations.delete(m.id);
        break;
    }
  }
}
