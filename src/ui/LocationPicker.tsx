import { useMemo, useState } from 'react';
import { buildTree, flattenTree, locationPath } from '../domain/locations';
import type { Location } from '../domain/types';
import { Sheet, inputCls } from './primitives';

/** Selector jerárquico con buscador. `exclude` oculta ubicaciones (p. ej. descendientes al reubicar). */
export function LocationPicker({ locations, value, onChange, placeholder = 'Elegir ubicación', exclude, allowRoot, rootLabel = 'Sin padre (nivel superior)' }: {
  locations: Location[]; value: string | null; onChange: (id: string | null) => void;
  placeholder?: string; exclude?: Set<string>; allowRoot?: boolean; rootLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const nodes = useMemo(() => flattenTree(buildTree(locations)).filter((n) => !exclude?.has(n.location.id)), [locations, exclude]);
  const q = query.trim().toLowerCase();
  const visible = q ? nodes.filter((n) => locationPath(n.location.id, byId).toLowerCase().includes(q)) : nodes;

  const pick = (id: string | null) => { onChange(id); setOpen(false); setQuery(''); };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`${inputCls} flex items-center justify-between text-left`}>
        <span className={value ? 'truncate' : 'text-ink-mute'}>
          {value ? locationPath(value, byId) : allowRoot && value === null ? rootLabel : placeholder}
        </span>
        <span aria-hidden className="ml-2 text-ink-mute">▾</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Ubicación">
        <input className={inputCls} placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="mt-3 space-y-1">
          {allowRoot && !q && (
            <li>
              <button type="button" onClick={() => pick(null)}
                className="tap w-full rounded-ctl px-3 text-left font-medium text-ink-soft hover:bg-paper">{rootLabel}</button>
            </li>
          )}
          {visible.map((n) => (
            <li key={n.location.id}>
              <button type="button" onClick={() => pick(n.location.id)}
                style={{ paddingLeft: q ? 12 : 12 + n.depth * 20 }}
                className={`tap w-full rounded-ctl pr-3 text-left hover:bg-paper ${n.location.id === value ? 'bg-honey-100 font-semibold' : ''}`}>
                {q ? locationPath(n.location.id, byId) : n.location.name}
              </button>
            </li>
          ))}
          {visible.length === 0 && <li className="px-3 py-6 text-center text-ink-soft">No hay ubicaciones que coincidan.</li>}
        </ul>
      </Sheet>
    </>
  );
}
