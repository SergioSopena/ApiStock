import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRightLeft, Minus, Pencil, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useData } from '../../app/DataProvider';
import { PageHeader } from '../../ui/primitives';

export function OperationsPage() {
  const { db } = useData();
  const recent = useLiveQuery(() => db.recent_operations.orderBy('created_at').reverse().toArray(), [db]) ?? [];

  const card = (label: string, hint: string, Icon: typeof Plus, to?: string) => {
    const cls = 'flex min-h-28 flex-col justify-between rounded-tile border p-4';
    return to ? (
      <Link to={to} className={`${cls} border-honey-500 bg-honey-400 active:brightness-95`}>
        <Icon size={26} aria-hidden /><span><span className="block font-display text-lg font-bold">{label}</span><span className="text-sm">{hint}</span></span>
      </Link>
    ) : (
      <div className={`${cls} border-line bg-surface text-ink-mute`} aria-disabled>
        <Icon size={26} strokeWidth={1.5} aria-hidden /><span><span className="block font-display text-lg font-bold">{label}</span><span className="text-sm">Próximamente</span></span>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Operaciones" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {card('Alta', 'Registrar material nuevo', Plus, '/operaciones/alta')}
        {card('Mover', '', ArrowRightLeft)}
        {card('Editar', '', Pencil)}
        {card('Dar de baja', '', Minus)}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-bold">Operaciones recientes</h2>
        {recent.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong p-5 text-ink-soft">Aquí aparecerán tus últimas 10 operaciones.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r.id} className="rounded-card border border-line bg-surface p-4">
                <p className="font-medium">{r.summary}</p>
                <p className="text-xs text-ink-mute">{new Date(r.created_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-ink-mute">Deshacer y editar operaciones recientes llega en la siguiente entrega.</p>
      </section>
    </>
  );
}
