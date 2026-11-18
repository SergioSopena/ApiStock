// Tipos del dominio. Reflejan las filas del servidor (sin user_id).

export type UnitStatus = 'new' | 'very_good' | 'good' | 'used' | 'poor' | 'unusable';

export const STATUS_ORDER: UnitStatus[] = ['new', 'very_good', 'good', 'used', 'poor', 'unusable'];

/** `level` = segmentos llenos del medidor (6 = mejor). Las clases están completas para que Tailwind las detecte. */
export const STATUS_META: Record<UnitStatus, { label: string; level: number; cls: string; bar: string }> = {
  new:       { label: 'Nuevo',                      level: 6, cls: 'bg-st-new-bg text-st-new-fg',     bar: 'bg-st-new-fg' },
  very_good: { label: 'Muy buen estado',            level: 5, cls: 'bg-st-great-bg text-st-great-fg', bar: 'bg-st-great-fg' },
  good:      { label: 'Buen estado',                level: 4, cls: 'bg-st-good-bg text-st-good-fg',   bar: 'bg-st-good-fg' },
  used:      { label: 'Usado pero funcional',       level: 3, cls: 'bg-st-used-bg text-st-used-fg',   bar: 'bg-st-used-fg' },
  poor:      { label: 'Malo pero usable',           level: 2, cls: 'bg-st-poor-bg text-st-poor-fg',   bar: 'bg-st-poor-fg' },
  unusable:  { label: 'Mal estado / no utilizable', level: 1, cls: 'bg-st-bad-bg text-st-bad-fg',     bar: 'bg-st-bad-fg' },
};

export interface AttributeDef {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'boolean' | 'select';
  options?: string[];
}

interface Versioned {
  id: string;
  version: number;
}

export interface Category extends Versioned {
  name: string;
  icon: string | null;
  sort_order: number;
}

export interface System extends Versioned {
  name: string;
  code_letter: string;
  color: string | null;
  sort_order: number;
}

export interface Location extends Versioned {
  parent_id: string | null;
  name: string;
  sort_order: number;
}

export type TypeMode = 'unit' | 'bulk';

export interface ItemType extends Versioned {
  category_id: string;
  name: string;
  icon: string | null;
  mode: TypeMode;
  code_prefix: string;
  uses_system: boolean;
  attribute_defs: AttributeDef[];
  sort_order: number;
}

export interface Unit extends Versioned {
  type_id: string;
  system_id: string | null;
  code: string;
  description: string | null;
  status: UnitStatus;
  location_id: string;
  attrs: Record<string, unknown>;
  notes: string | null;
}

export interface StockLot extends Versioned {
  type_id: string;
  system_id: string | null;
  location_id: string;
  quantity: number;
  /** Clave natural local: tipo|sistema|ubicación. Identifica el lote entre dispositivos. */
  key: string;
}

export type CompatResult = 'compatible' | 'fits' | 'incompatible';

export interface Compatibility extends Versioned {
  unit_a: string;
  unit_b: string;
  result: CompatResult;
  note: string | null;
}

export interface RecentOperation extends Versioned {
  kind: string;
  summary: string;
  inverse: { mutations: Mutation[] } | null;
  device_id: string;
  created_at: string;
}

// ---------- Mutaciones (mismo formato que apply_batch en el servidor) ----------
export type RowTable = 'categories' | 'systems' | 'locations' | 'item_types' | 'units';

export type Mutation =
  | { m: 'insert'; t: RowTable; row: Record<string, unknown> }
  | { m: 'update'; t: RowTable; id: string; base_version: number; set: Record<string, unknown> }
  | { m: 'delete'; t: RowTable | 'compatibilities'; id: string; base_version: number }
  | { m: 'compat_set'; unit_a: string; unit_b: string; result: CompatResult; note?: string | null; id?: string; base_version?: number | null }
  | { m: 'lot_delta'; type_id: string; system_id?: string | null; location_id: string; delta: number; lot_id?: string }
  | { m: 'drop_recent'; id: string };

export interface OperationPayload {
  op_id: string;
  device_id: string;
  epoch: number;
  mutations: Mutation[];
  recent?: { kind: string; summary: string; inverse: { mutations: Mutation[] } | null };
}

/** Resultado de construir una operación, antes de asignarle id y época. */
export interface OperationDraft {
  kind: string;
  summary: string;
  mutations: Mutation[];
  /** Mutaciones que deshacen la operación. null = no se registra como operación reciente. */
  inverse: Mutation[] | null;
  createdUnitIds?: string[];
}
