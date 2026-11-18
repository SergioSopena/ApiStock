import { ChevronRight, MapPin, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../../app/DataProvider';
import { useInventory, type Inventory } from '../../data/hooks';
import { commitOperation } from '../../data/commit';
import { draftUpdateUnit } from '../../domain/builders';
import { descendantIds, locationPath } from '../../domain/locations';
import { countByType, sumCounts, totalByCategory } from '../../domain/stock';
import { STATUS_META, STATUS_ORDER, type ItemType, type Unit, type UnitStatus } from '../../domain/types';
import { iconFor } from '../../ui/icons';
import { LocationPicker } from '../../ui/LocationPicker';
import {
  CodePlate, EmptyState, PageHeader, Sheet, StatusPill, SystemPill, fieldLabel, inputCls, primaryBtn, secondaryBtn,
} from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { BackLink, UnitRow, qs } from './shared';

/** Filtro de ubicación compartido por toda la navegación (?u=<id>). Incluye sububicaciones. */
function useLocationFilter(inv: Inventory) {
  const [sp] = useSearchParams();
  const u = sp.get('u');
  const valid = u && inv.locationById.has(u) ? u : null;
  const ids = useMemo(() => (valid ? descendantIds(valid, inv.locations) : null), [valid, inv.locations]);
  return { u: valid, ids };
}

function Loading() {
  return <div className="h-40 animate-pulse rounded-card bg-line/40" aria-label="Cargando" />;
}

function LocationChip({ inv, u }: { inv: Inventory; u: string | null }) {
  if (!u) return null;
  return (
    <p className="mb-4 inline-flex max-w-full items-center gap-1.5 rounded-full bg-honey-100 px-3 py-1 text-sm font-medium">
      <MapPin size={14} aria-hidden /> <span className="truncate">{locationPath(u, inv.locationById)}</span>
    </p>
  );
}

// ───────────────────────────── Inventario (global / por ubicación)
export function InventoryPage() {
  const inv = useInventory();
  const [sp, setSp] = useSearchParams();
  const vista = sp.get('vista') === 'ubicacion' ? 'ubicacion' : 'todo';
  const { u, ids } = useLocationFilter(inv);
  const filter = vista === 'ubicacion' ? ids : null;
  const counts = useMemo(() => countByType(inv.units, inv.lots, filter), [inv.units, inv.lots, filter]);
  const catTotals = useMemo(() => totalByCategory(inv.categories, inv.types, counts), [inv.categories, inv.types, counts]);

  const children = useMemo(
    () => inv.locations.filter((l) => (l.parent_id ?? null) === (u ?? null)),
    [inv.locations, u],
  );
  const locTotal = (id: string) => sumCounts(countByType(inv.units, inv.lots, descendantIds(id, inv.locations)));

  if (!inv.ready) return <Loading />;

  const segment = (value: 'todo' | 'ubicacion', label: string) => (
    <button
      onClick={() => setSp(value === 'todo' ? {} : { vista: 'ubicacion' })}
      aria-pressed={vista === value}
      className={`tap flex-1 rounded-ctl px-4 text-sm font-semibold transition ${vista === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'}`}>
      {label}
    </button>
  );

  return (
    <>
      <PageHeader title="Inventario" subtitle={`${sumCounts(countByType(inv.units, inv.lots))} elementos en total`} />
      <div className="mb-5 flex gap-1 rounded-card bg-line/60 p-1" role="group" aria-label="Vista">
        {segment('todo', 'Todo el inventario')}
        {segment('ubicacion', 'Por ubicación')}
      </div>

      {vista === 'ubicacion' && (
        <section className="mb-6">
          {u && (
            <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
              <button className="font-medium text-honey-700 underline-offset-2 hover:underline" onClick={() => setSp({ vista: 'ubicacion' })}>Todas</button>
              {locationPath(u, inv.locationById).split(' › ').map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1 text-ink-soft"><ChevronRight size={14} aria-hidden />{part}{i === arr.length - 1 ? '' : ''}</span>
              ))}
            </div>
          )}
          {inv.locations.length === 0 ? (
            <EmptyState icon={<MapPin size={36} strokeWidth={1.5} />} title="Aún no hay ubicaciones"
              action={{ label: 'Crear ubicaciones', to: '/configuracion/ubicaciones' }}>
              Crea tus almacenes y apiarios para saber dónde está cada material.
            </EmptyState>
          ) : children.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {children.map((l) => (
                <li key={l.id}>
                  <button onClick={() => setSp({ vista: 'ubicacion', u: l.id })}
                    className="tap flex w-full items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left hover:border-line-strong">
                    <span className="flex min-w-0 items-center gap-2"><MapPin size={18} className="shrink-0 text-ink-mute" aria-hidden /><span className="truncate font-medium">{l.name}</span></span>
                    <span className="tnum flex items-center gap-1 text-ink-soft">{locTotal(l.id)}<ChevronRight size={16} aria-hidden /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(vista === 'todo' || u) && (
        <>
          {vista === 'ubicacion' && u && <p className="mb-3 text-sm text-ink-soft">Material en esta ubicación{children.length ? ' y sus sububicaciones' : ''}:</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {inv.categories
              .filter((c) => vista === 'todo' || (catTotals.get(c.id) ?? 0) > 0)
              .map((c) => {
                const Icon = iconFor(c.icon);
                const total = catTotals.get(c.id) ?? 0;
                return (
                  <Link key={c.id} to={`/inventario/c/${c.id}${qs({ u: vista === 'ubicacion' ? u : null })}`}
                    className="flex min-h-32 flex-col justify-between rounded-tile border border-line bg-surface p-4 transition hover:border-line-strong active:bg-paper">
                    <Icon size={28} strokeWidth={1.5} className="text-honey-700" aria-hidden />
                    <div>
                      <p className="font-display text-base font-bold leading-tight">{c.name}</p>
                      <p className="tnum text-sm text-ink-soft">{total} {total === 1 ? 'elemento' : 'elementos'}</p>
                    </div>
                  </Link>
                );
              })}
          </div>
          {vista === 'ubicacion' && u && inv.categories.every((c) => (catTotals.get(c.id) ?? 0) === 0) && (
            <EmptyState title="No hay material en esta ubicación" action={{ label: 'Añadir material', to: '/operaciones/alta' }} />
          )}
        </>
      )}
    </>
  );
}

// ───────────────────────────── Categoría → tipos
export function CategoryPage() {
  const { id } = useParams();
  const inv = useInventory();
  const { u, ids } = useLocationFilter(inv);
  const counts = useMemo(() => countByType(inv.units, inv.lots, ids), [inv.units, inv.lots, ids]);
  if (!inv.ready) return <Loading />;
  const category = inv.categoryById.get(id ?? '');
  if (!category) return <EmptyState title="Categoría no encontrada" action={{ label: 'Volver al inventario', to: '/inventario' }} />;
  const types = inv.types.filter((t) => t.category_id === category.id);

  return (
    <>
      <PageHeader title={category.name} back={<BackLink to={`/inventario${qs({ vista: u ? 'ubicacion' : null, u })}`}>Inventario</BackLink>} />
      <LocationChip inv={inv} u={u} />
      {types.length === 0 ? (
        <EmptyState title="Esta categoría no tiene tipos">Los tipos se crean en Configuración (disponible en la siguiente entrega).</EmptyState>
      ) : (
        <ul className="space-y-2">
          {types.map((t) => {
            const c = counts.get(t.id);
            const Icon = iconFor(t.icon);
            const breakdown = t.uses_system && c
              ? [...c.bySystem.entries()].map(([sid, n]) => `${n} ${inv.systemById.get(sid ?? '')?.name ?? ''}`).join(' · ')
              : '';
            return (
              <li key={t.id}>
                <Link to={`/inventario/t/${t.id}${qs({ u })}`}
                  className="flex items-center gap-4 rounded-card border border-line bg-surface p-4 transition hover:border-line-strong active:bg-paper">
                  <Icon size={26} strokeWidth={1.5} className="shrink-0 text-honey-700" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-bold">{t.name}</p>
                    <p className="truncate text-sm text-ink-mute">
                      {breakdown || (t.mode === 'unit' ? 'Unidades con código' : 'Material por cantidad')}
                    </p>
                  </div>
                  <span className="tnum font-display text-2xl font-bold">{c?.total ?? 0}</span>
                  <ChevronRight size={18} className="text-ink-mute" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ───────────────────────────── Tipo → unidades / cantidades
export function TypePage() {
  const { id } = useParams();
  const inv = useInventory();
  const { u, ids } = useLocationFilter(inv);
  const [systemFilter, setSystemFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const type = inv.typeById.get(id ?? '');

  const units = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inv.units
      .filter((x) => x.type_id === id)
      .filter((x) => !ids || ids.has(x.location_id))
      .filter((x) => !systemFilter || x.system_id === systemFilter)
      .filter((x) => !q || x.code.toLowerCase().includes(q) || (x.description ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
  }, [inv.units, id, ids, systemFilter, query]);

  const lots = useMemo(
    () => inv.lots
      .filter((l) => l.type_id === id && l.quantity > 0)
      .filter((l) => !ids || ids.has(l.location_id))
      .filter((l) => !systemFilter || l.system_id === systemFilter),
    [inv.lots, id, ids, systemFilter],
  );

  if (!inv.ready) return <Loading />;
  if (!type) return <EmptyState title="Tipo no encontrado" action={{ label: 'Volver al inventario', to: '/inventario' }} />;
  const total = units.length + lots.reduce((s, l) => s + l.quantity, 0);

  const chip = (value: string | null, label: string) => (
    <button key={label} onClick={() => setSystemFilter(value)} aria-pressed={systemFilter === value}
      className={`tap rounded-full border px-4 text-sm font-semibold ${systemFilter === value ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-surface text-ink-soft'}`}>
      {label}
    </button>
  );

  return (
    <>
      <PageHeader
        title={type.name}
        subtitle={`${total} ${total === 1 ? 'elemento' : 'elementos'} · ${inv.categoryById.get(type.category_id)?.name ?? ''}`}
        back={<BackLink to={`/inventario/c/${type.category_id}${qs({ u })}`}>{inv.categoryById.get(type.category_id)?.name ?? 'Categoría'}</BackLink>}
        actions={
          <Link to={`/operaciones/alta?tipo=${type.id}`} className={`${primaryBtn} shrink-0 gap-1.5`}>
            <Plus size={18} aria-hidden /> Añadir
          </Link>
        }
      />
      <LocationChip inv={inv} u={u} />

      {type.uses_system && inv.systems.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Sistema">
          {chip(null, 'Todos')}
          {inv.systems.map((s) => chip(s.id, s.name))}
        </div>
      )}

      {lots.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-display text-base font-bold">Material por cantidad</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {lots.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
                <div className="min-w-0">
                  <SystemPill system={inv.systemById.get(l.system_id ?? '')} />
                  <p className="mt-1 truncate text-sm text-ink-soft">{locationPath(l.location_id, inv.locationById)}</p>
                </div>
                <span className="tnum font-display text-3xl font-bold">{l.quantity}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(type.mode === 'unit' || units.length > 0) && (
        <section>
          {type.mode === 'bulk' && <h2 className="mb-2 font-display text-base font-bold">Unidades individualizadas</h2>}
          {inv.units.some((x) => x.type_id === id) && (
            <input className={`${inputCls} mb-3`} placeholder="Buscar por código o descripción…" value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
          {units.length === 0 ? (
            lots.length === 0 && (
              <EmptyState title="No hay material de este tipo" action={{ label: `Añadir ${type.name.toLowerCase()}`, to: `/operaciones/alta?tipo=${type.id}` }}>
                {u || systemFilter || query ? 'Prueba a quitar los filtros.' : 'Registra las primeras unidades.'}
              </EmptyState>
            )
          ) : (
            <ul className="space-y-2">
              {units.map((x) => <li key={x.id}><UnitRow unit={x} inv={inv} /></li>)}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

// ───────────────────────────── Ficha de unidad
export function UnitPage() {
  const { id } = useParams();
  const inv = useInventory();
  const [editing, setEditing] = useState(false);
  if (!inv.ready) return <Loading />;
  const unit = inv.units.find((x) => x.id === id);
  if (!unit) return <EmptyState title="Unidad no encontrada" action={{ label: 'Volver al inventario', to: '/inventario' }}>Puede que se haya dado de baja desde otro dispositivo.</EmptyState>;
  const type = inv.typeById.get(unit.type_id);
  const category = type ? inv.categoryById.get(type.category_id) : undefined;

  return (
    <>
      <BackLink to={type ? `/inventario/t/${type.id}` : '/inventario'}>{type?.name ?? 'Inventario'}</BackLink>
      <div className="rounded-tile border border-line bg-surface p-5">
        <CodePlate code={unit.code} large />
        {unit.description && <p className="mt-3 text-lg font-medium">{unit.description}</p>}
        <p className="mt-1 text-sm text-ink-soft">{category?.name} › {type?.name}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SystemPill system={inv.systemById.get(unit.system_id ?? '')} />
          <StatusPill status={unit.status} />
        </div>
        <dl className="mt-5 space-y-4 border-t border-line pt-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Ubicación actual</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 font-medium"><MapPin size={16} aria-hidden />{locationPath(unit.location_id, inv.locationById)}</dd>
          </div>
          {type?.attribute_defs.map((d) => {
            const v = unit.attrs[d.key];
            if (v === undefined || v === null || v === '') return null;
            return (
              <div key={d.key}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{d.label}</dt>
                <dd className="mt-0.5">{typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v)}</dd>
              </div>
            );
          })}
          {unit.notes && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Observaciones</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{unit.notes}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={primaryBtn} onClick={() => setEditing(true)}>Editar</button>
      </div>
      <p className="mt-4 text-sm text-ink-mute">Mover, dar de baja y compatibilidad se activan en las siguientes entregas.</p>
      {type && <EditUnitSheet key={`${unit.id}-${unit.version}`} open={editing} onClose={() => setEditing(false)} unit={unit} type={type} inv={inv} />}
    </>
  );
}

function EditUnitSheet({ open, onClose, unit, type, inv }: { open: boolean; onClose: () => void; unit: Unit; type: ItemType; inv: Inventory }) {
  const { db, engine } = useData();
  const toast = useToast();
  const [description, setDescription] = useState(unit.description ?? '');
  const [status, setStatus] = useState<UnitStatus>(unit.status);
  const [locationId, setLocationId] = useState<string | null>(unit.location_id);
  const [notes, setNotes] = useState(unit.notes ?? '');
  const [attrs, setAttrs] = useState<Record<string, unknown>>(unit.attrs ?? {});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!locationId) return;
    const cleanAttrs = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== '' && v !== undefined && v !== null));
    const draft = draftUpdateUnit(unit, {
      description: description.trim() || null, status, location_id: locationId, notes: notes.trim() || null, attrs: cleanAttrs,
    });
    if (!draft) return onClose();
    setBusy(true);
    try {
      await commitOperation(db, draft, { recordRecent: false });
      engine.request();
      toast('Cambios guardados');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Editar ${unit.code}`}>
      <div className="space-y-4">
        <label className="block"><span className={fieldLabel}>Descripción corta (opcional)</span>
          <input className={inputCls} value={description} maxLength={120} placeholder="Alza verde" onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="block"><span className={fieldLabel}>Estado</span>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as UnitStatus)}>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select></label>
        <div><span className={fieldLabel}>Ubicación</span>
          <LocationPicker locations={inv.locations} value={locationId} onChange={setLocationId} /></div>
        {type.attribute_defs.map((d) => (
          <label key={d.key} className="block"><span className={fieldLabel}>{d.label}</span>
            {d.kind === 'boolean' ? (
              <select className={inputCls} value={attrs[d.key] === true ? 'si' : attrs[d.key] === false ? 'no' : ''}
                onChange={(e) => setAttrs({ ...attrs, [d.key]: e.target.value === '' ? undefined : e.target.value === 'si' })}>
                <option value="">Sin indicar</option><option value="si">Sí</option><option value="no">No</option>
              </select>
            ) : d.kind === 'select' ? (
              <select className={inputCls} value={String(attrs[d.key] ?? '')} onChange={(e) => setAttrs({ ...attrs, [d.key]: e.target.value })}>
                <option value="">Sin indicar</option>
                {d.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input className={inputCls} type={d.kind === 'number' ? 'number' : 'text'} inputMode={d.kind === 'number' ? 'decimal' : undefined}
                value={String(attrs[d.key] ?? '')}
                onChange={(e) => setAttrs({ ...attrs, [d.key]: d.kind === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value })} />
            )}
          </label>
        ))}
        <label className="block"><span className={fieldLabel}>Observaciones (opcional)</span>
          <textarea className={`${inputCls} min-h-24 py-3`} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="flex gap-2 pt-1">
          <button className={`${secondaryBtn} flex-1`} onClick={onClose}>Cancelar</button>
          <button className={`${primaryBtn} flex-1`} onClick={save} disabled={busy || !locationId}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </Sheet>
  );
}
