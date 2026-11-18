import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useData } from '../app/DataProvider';
import { compareLocations } from '../domain/locations';
import type { Category, ItemType, Location, StockLot, System, Unit } from '../domain/types';

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const byOrder = <T extends { sort_order: number; name: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || collator.compare(a.name, b.name);

export interface Inventory {
  ready: boolean;
  categories: Category[];
  types: ItemType[];
  systems: System[];
  locations: Location[];
  units: Unit[];
  lots: StockLot[];
  categoryById: Map<string, Category>;
  typeById: Map<string, ItemType>;
  systemById: Map<string, System>;
  locationById: Map<string, Location>;
}

/** Todo el inventario local, reactivo: se actualiza solo al cambiar IndexedDB. */
export function useInventory(): Inventory {
  const { db } = useData();
  const raw = useLiveQuery(async () => {
    const [categories, types, systems, locations, units, lots] = await Promise.all([
      db.categories.toArray(), db.item_types.toArray(), db.systems.toArray(),
      db.locations.toArray(), db.units.toArray(), db.stock_lots.toArray(),
    ]);
    return { categories, types, systems, locations, units, lots };
  }, [db]);

  return useMemo(() => {
    const categories = [...(raw?.categories ?? [])].sort(byOrder);
    const types = [...(raw?.types ?? [])].sort(byOrder);
    const systems = [...(raw?.systems ?? [])].sort(byOrder);
    const locations = [...(raw?.locations ?? [])].sort(compareLocations);
    return {
      ready: raw !== undefined,
      categories, types, systems, locations,
      units: raw?.units ?? [],
      lots: raw?.lots ?? [],
      categoryById: new Map(categories.map((c) => [c.id, c])),
      typeById: new Map(types.map((t) => [t.id, t])),
      systemById: new Map(systems.map((s) => [s.id, s])),
      locationById: new Map(locations.map((l) => [l.id, l])),
    };
  }, [raw]);
}
