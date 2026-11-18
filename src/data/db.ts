import Dexie, { type Table } from 'dexie';
import type {
  Category, Compatibility, ItemType, Location, OperationPayload, RecentOperation, StockLot, System, Unit,
} from '../domain/types';

export interface OutboxItem {
  seq?: number;
  op_id: string;
  op: OperationPayload;
  status: 'pending' | 'conflict' | 'rejected' | 'epoch';
  summary: string;
  created_at: string;
  /** Respuesta del servidor cuando status != pending */
  result?: unknown;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface BufferedCode {
  code: string;
  prefix: string;
  n: number;
}

/** Una base de datos local por usuario: nunca se mezclan inventarios en un mismo dispositivo. */
export class ApiStockDB extends Dexie {
  categories!: Table<Category, string>;
  systems!: Table<System, string>;
  locations!: Table<Location, string>;
  item_types!: Table<ItemType, string>;
  units!: Table<Unit, string>;
  stock_lots!: Table<StockLot, string>;
  compatibilities!: Table<Compatibility, string>;
  recent_operations!: Table<RecentOperation, string>;
  outbox!: Table<OutboxItem, number>;
  meta!: Table<MetaRow, string>;
  code_buffer!: Table<BufferedCode, string>;

  constructor(userId: string) {
    super(`apistock-${userId}`);
    this.version(1).stores({
      categories: 'id',
      systems: 'id',
      locations: 'id, parent_id',
      item_types: 'id, category_id',
      units: 'id, type_id, location_id, code',
      stock_lots: 'id, key, type_id, location_id',
      compatibilities: 'id, unit_a, unit_b',
      recent_operations: 'id, created_at',
      outbox: '++seq, &op_id, status',
      meta: 'key',
      code_buffer: 'code, prefix',
    });
  }

  /** Tablas que reflejan datos del servidor (se vacían en una resincronización completa). */
  get syncedTables(): Table<any, string>[] {
    return [
      this.categories, this.systems, this.locations, this.item_types, this.units,
      this.stock_lots, this.compatibilities, this.recent_operations,
    ];
  }
}

export async function getMeta<T>(db: ApiStockDB, key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(db: ApiStockDB, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Identificador estable de este dispositivo/navegador (para reservar códigos y trazar operaciones). */
export function getDeviceId(): string {
  const KEY = 'apistock:device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
