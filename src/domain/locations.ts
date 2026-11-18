import type { Location } from './types';

export interface LocationNode {
  location: Location;
  children: LocationNode[];
  depth: number;
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

export function compareLocations(a: Location, b: Location): number {
  return a.sort_order - b.sort_order || collator.compare(a.name, b.name);
}

export function buildTree(locations: Location[]): LocationNode[] {
  const byParent = new Map<string | null, Location[]>();
  for (const l of locations) {
    const key = l.parent_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(l);
  }
  const build = (parent: string | null, depth: number): LocationNode[] =>
    (byParent.get(parent) ?? [])
      .sort(compareLocations)
      .map((location) => ({ location, depth, children: build(location.id, depth + 1) }));
  return build(null, 0);
}

export function flattenTree(nodes: LocationNode[]): LocationNode[] {
  const out: LocationNode[] = [];
  const walk = (list: LocationNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function indexById(locations: Location[]): Map<string, Location> {
  return new Map(locations.map((l) => [l.id, l]));
}

/** "Almacén Eraul › Estantería 1 › Cajón 3" */
export function locationPath(id: string | null | undefined, byId: Map<string, Location>, sep = ' › '): string {
  if (!id) return '';
  const parts: string[] = [];
  let current = byId.get(id);
  let guard = 0;
  while (current && guard++ < 30) {
    parts.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return parts.join(sep);
}

/** Ids de la ubicación y de todas sus sububicaciones. */
export function descendantIds(id: string, locations: Location[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const l of locations) {
    if (l.parent_id) {
      if (!children.has(l.parent_id)) children.set(l.parent_id, []);
      children.get(l.parent_id)!.push(l.id);
    }
  }
  const result = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    for (const child of children.get(stack.pop()!) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        stack.push(child);
      }
    }
  }
  return result;
}

export function wouldCreateCycle(movingId: string, newParentId: string | null, locations: Location[]): boolean {
  if (!newParentId) return false;
  return descendantIds(movingId, locations).has(newParentId);
}
