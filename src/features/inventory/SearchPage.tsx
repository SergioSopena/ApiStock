import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInventory } from '../../data/hooks';
import { normalizeCode } from '../../domain/codes';
import { locationPath } from '../../domain/locations';
import { iconFor } from '../../ui/icons';
import { EmptyState, PageHeader, inputCls } from '../../ui/primitives';
import { UnitRow } from './shared';

/** Búsqueda global: código, descripción, categoría, tipo, sistema y ubicación. */
export function SearchPage() {
  const inv = useInventory();
  const [query, setQuery] = useState('');

  const { units, types } = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return { units: [], types: [] };
    const asCode = normalizeCode(query);
    const matchedUnits = inv.units
      .filter((u) => {
        const type = inv.typeById.get(u.type_id);
        const hay = [
          u.code, u.description ?? '', type?.name ?? '', inv.categoryById.get(type?.category_id ?? '')?.name ?? '',
          inv.systemById.get(u.system_id ?? '')?.name ?? '', locationPath(u.location_id, inv.locationById),
        ].join(' ').toLowerCase();
        return tokens.every((t) => hay.includes(t)) || u.code === asCode;
      })
      .sort((a, b) => Number(b.code === asCode) - Number(a.code === asCode) || a.code.localeCompare(b.code, 'es', { numeric: true }));
    const matchedTypes = inv.types.filter((t) => tokens.every((tk) => t.name.toLowerCase().includes(tk)));
    return { units: matchedUnits.slice(0, 60), types: matchedTypes };
  }, [query, inv]);

  return (
    <>
      <PageHeader title="Buscar" />
      <div className="relative mb-5">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" aria-hidden />
        <input autoFocus className={`${inputCls} pl-11`} placeholder="Código, descripción, tipo, sistema, ubicación…"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {query.trim() === '' ? (
        <p className="text-ink-soft">Escribe un código (por ejemplo «al17») o cualquier palabra del material.</p>
      ) : units.length === 0 && types.length === 0 ? (
        <EmptyState title="Sin resultados">No hay nada que coincida con «{query.trim()}».</EmptyState>
      ) : (
        <div className="space-y-6">
          {types.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-base font-bold">Tipos</h2>
              <ul className="space-y-2">
                {types.map((t) => {
                  const Icon = iconFor(t.icon);
                  return (
                    <li key={t.id}>
                      <Link to={`/inventario/t/${t.id}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
                        <Icon size={22} strokeWidth={1.5} className="text-honey-700" aria-hidden />
                        <span className="font-medium">{t.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {units.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-base font-bold">Unidades</h2>
              <ul className="space-y-2">{units.map((u) => <li key={u.id}><UnitRow unit={u} inv={inv} /></li>)}</ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
