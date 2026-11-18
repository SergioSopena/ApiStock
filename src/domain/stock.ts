import type { Category, ItemType, StockLot, Unit } from './types';

export const lotKey = (typeId: string, systemId: string | null | undefined, locationId: string): string =>
  `${typeId}|${systemId ?? '-'}|${locationId}`;

export interface TypeCount {
  /** Unidades individualizadas + cantidad agrupada */
  total: number;
  units: number;
  lots: number;
  /** Total por sistema (clave null = sin sistema) */
  bySystem: Map<string | null, number>;
}

/** Cuenta el material por tipo. Si `locationIds` existe, solo cuenta lo que está en esas ubicaciones. */
export function countByType(
  units: Unit[],
  lots: StockLot[],
  locationIds?: Set<string> | null,
): Map<string, TypeCount> {
  const result = new Map<string, TypeCount>();
  const get = (typeId: string): TypeCount => {
    let c = result.get(typeId);
    if (!c) {
      c = { total: 0, units: 0, lots: 0, bySystem: new Map() };
      result.set(typeId, c);
    }
    return c;
  };
  const add = (c: TypeCount, systemId: string | null, qty: number, kind: 'units' | 'lots') => {
    c.total += qty;
    c[kind] += qty;
    c.bySystem.set(systemId, (c.bySystem.get(systemId) ?? 0) + qty);
  };
  for (const u of units) {
    if (locationIds && !locationIds.has(u.location_id)) continue;
    add(get(u.type_id), u.system_id, 1, 'units');
  }
  for (const l of lots) {
    if (l.quantity <= 0) continue;
    if (locationIds && !locationIds.has(l.location_id)) continue;
    add(get(l.type_id), l.system_id, l.quantity, 'lots');
  }
  return result;
}

export function totalByCategory(
  categories: Category[],
  types: ItemType[],
  counts: Map<string, TypeCount>,
): Map<string, number> {
  const result = new Map<string, number>(categories.map((c) => [c.id, 0]));
  for (const t of types) {
    result.set(t.category_id, (result.get(t.category_id) ?? 0) + (counts.get(t.id)?.total ?? 0));
  }
  return result;
}

export function sumCounts(counts: Map<string, TypeCount>): number {
  let n = 0;
  for (const c of counts.values()) n += c.total;
  return n;
}
