import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRightLeft, CheckCheck, Minus, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../app/DataProvider';
import { useInventory } from '../../data/hooks';
import { countByType, sumCounts, totalByCategory } from '../../domain/stock';
import { iconFor } from '../../ui/icons';
import { PageHeader } from '../../ui/primitives';

export function HomePage() {
  const { db } = useData();
  const inv = useInventory();
  const counts = useMemo(() => countByType(inv.units, inv.lots), [inv.units, inv.lots]);
  const catTotals = useMemo(() => totalByCategory(inv.categories, inv.types, counts), [inv.categories, inv.types, counts]);
  const recent = useLiveQuery(() => db.recent_operations.orderBy('created_at').reverse().limit(5).toArray(), [db]) ?? [];
  const total = sumCounts(counts);

  const action = (to: string, label: string, Icon: typeof Plus, enabled = true) => {
    const cls = 'tap flex min-h-24 flex-col items-start justify-between rounded-tile border p-4 text-left font-display font-bold';
    return enabled ? (
      <Link to={to} className={`${cls} border-honey-500 bg-honey-400 text-ink active:brightness-95`}>
        <Icon size={24} strokeWidth={2} aria-hidden /> {label}
      </Link>
    ) : (
      <div className={`${cls} border-line bg-surface text-ink-mute`} aria-disabled>
        <Icon size={24} strokeWidth={1.75} aria-hidden />
        <span>{label}<span className="block font-sans text-xs font-medium">Próximamente</span></span>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Inicio" />
      <section className="rounded-tile border border-line bg-surface p-5">
        <p className="text-sm font-medium text-ink-soft">Material en total</p>
        <p className="tnum font-display text-4xl font-extrabold">{total}</p>
        <p className="text-sm text-ink-mute">{inv.units.length} unidades con código · {total - inv.units.length} por cantidad</p>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Acciones rápidas">
        {action('/operaciones/alta', 'Añadir material', Plus)}
        {action('/operaciones', 'Mover material', ArrowRightLeft, false)}
        {action('/operaciones', 'Dar de baja', Minus, false)}
        {action('/compatibilidad', 'Compatibilidad', CheckCheck, false)}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-bold">Material por categoría</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {inv.categories.map((c) => {
            const Icon = iconFor(c.icon);
            return (
              <li key={c.id}>
                <Link to={`/inventario/c/${c.id}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
                  <Icon size={20} strokeWidth={1.5} className="shrink-0 text-honey-700" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                  <span className="tnum font-display font-bold">{catTotals.get(c.id) ?? 0}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold">Últimas operaciones</h2>
          <Link to="/operaciones" className="text-sm font-medium text-honey-700">Ver todas</Link>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong p-5 text-ink-soft">Todavía no has registrado operaciones.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r.id} className="rounded-card border border-line bg-surface p-3">
                <p className="font-medium">{r.summary}</p>
                <p className="text-xs text-ink-mute">{new Date(r.created_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
