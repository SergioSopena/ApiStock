import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Inventory } from '../../data/hooks';
import { locationPath } from '../../domain/locations';
import type { Unit } from '../../domain/types';
import { CodePlate, StatusPill, SystemPill } from '../../ui/primitives';

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="mb-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink">
      <ChevronLeft size={16} aria-hidden /> {children}
    </Link>
  );
}

export function UnitRow({ unit, inv }: { unit: Unit; inv: Inventory }) {
  const type = inv.typeById.get(unit.type_id);
  return (
    <Link to={`/unidad/${unit.id}`}
      className="flex items-start gap-3 rounded-card border border-line bg-surface p-3 transition hover:border-line-strong active:bg-paper">
      <CodePlate code={unit.code} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{unit.description || type?.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {unit.description && <span className="text-xs text-ink-mute">{type?.name}</span>}
          <SystemPill system={inv.systemById.get(unit.system_id ?? '')} />
          <StatusPill status={unit.status} />
        </div>
        <p className="mt-1 truncate text-xs text-ink-mute">{locationPath(unit.location_id, inv.locationById)}</p>
      </div>
    </Link>
  );
}

export const qs = (params: Record<string, string | null | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
