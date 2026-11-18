import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../../app/DataProvider';
import { CodesExhaustedError, ensureCodes, peekCodes } from '../../data/codeBuffer';
import { commitOperation } from '../../data/commit';
import { useInventory } from '../../data/hooks';
import { DomainError, draftCreateLot, draftCreateUnits, MAX_BULK_CREATE } from '../../domain/builders';
import { buildPrefix } from '../../domain/codes';
import { STATUS_META, STATUS_ORDER, type UnitStatus } from '../../domain/types';
import { supabase } from '../../sync/client';
import { LocationPicker } from '../../ui/LocationPicker';
import {
  EmptyState, PageHeader, QuantityStepper, fieldLabel, inputCls, primaryBtn, secondaryBtn,
} from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { UnitRow } from '../inventory/shared';

export function CreatePage() {
  const { db, engine } = useData();
  const inv = useInventory();
  const toast = useToast();
  const [sp] = useSearchParams();

  const [typeId, setTypeId] = useState<string>(sp.get('tipo') ?? '');
  const [systemId, setSystemId] = useState<string>('');
  const [count, setCount] = useState(1);
  const [status, setStatus] = useState<UnitStatus>('new');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ summary: string; unitIds: string[] } | null>(null);

  const type = inv.typeById.get(typeId);
  const system = inv.systemById.get(systemId) ?? null;
  const isUnit = type?.mode === 'unit';

  // Preselecciones razonables
  useEffect(() => {
    if (type?.uses_system && !inv.systemById.has(systemId) && inv.systems[0]) setSystemId(inv.systems[0].id);
    if (type && !type.uses_system) setSystemId('');
  }, [type, systemId, inv.systems, inv.systemById]);
  useEffect(() => {
    if (!locationId && inv.locations.length === 1) setLocationId(inv.locations[0].id);
  }, [locationId, inv.locations]);

  const ready = !!type && (!type.uses_system || !!system);
  const prefix = ready && type && isUnit ? buildPrefix(type, system) : null;
  const preview = useLiveQuery(
    async () => (prefix ? peekCodes(db, prefix, count) : []),
    [db, prefix, count],
  ) ?? [];
  const missing = prefix ? Math.max(0, count - preview.length) : 0;

  const groupedTypes = useMemo(
    () => inv.categories
      .map((c) => ({ category: c, types: inv.types.filter((t) => t.category_id === c.id) }))
      .filter((g) => g.types.length > 0),
    [inv.categories, inv.types],
  );

  if (!inv.ready) return null;

  if (inv.locations.length === 0) {
    return (
      <>
        <PageHeader title="Añadir material" />
        <EmptyState icon={<MapPin size={36} strokeWidth={1.5} />} title="Primero crea una ubicación"
          action={{ label: 'Crear ubicaciones', to: '/configuracion/ubicaciones' }}>
          Cada material tiene una ubicación actual (por ejemplo, «Almacén Eraul»).
        </EmptyState>
      </>
    );
  }

  if (done) {
    const created = inv.units.filter((u) => done.unitIds.includes(u.id));
    return (
      <>
        <PageHeader title="Añadir material" />
        <div className="rounded-tile border border-pine-600/30 bg-pine-100 p-5">
          <p className="flex items-center gap-2 font-display text-lg font-bold text-pine-700"><CheckCircle2 size={22} aria-hidden /> Registrado</p>
          <p className="mt-1 text-pine-700">{done.summary}</p>
        </div>
        {created.length > 0 && (
          <ul className="mt-4 space-y-2">{created.map((u) => <li key={u.id}><UnitRow unit={u} inv={inv} /></li>)}</ul>
        )}
        {created.length > 0 && <p className="mt-2 text-sm text-ink-mute">Toca una unidad para añadirle una descripción o cambiar su ubicación.</p>}
        <div className="mt-5 flex gap-2">
          <button className={`${secondaryBtn} flex-1`} onClick={() => { setDone(null); setCount(1); setDescription(''); }}>Añadir más</button>
          <Link to={type ? `/inventario/t/${type.id}` : '/inventario'} className={`${primaryBtn} flex-1`}>Ver en inventario</Link>
        </div>
      </>
    );
  }

  const submit = async () => {
    if (!type || !locationId || !ready) return;
    setBusy(true);
    try {
      if (isUnit && prefix) {
        const codes = await ensureCodes(db, supabase, prefix, count);
        const draft = draftCreateUnits({ type, system, count, status, locationId, description, codes });
        await commitOperation(db, draft, { consumedCodes: codes });
        setDone({ summary: draft.summary, unitIds: draft.createdUnitIds ?? [] });
      } else {
        const draft = draftCreateLot({ type, system, count, locationId });
        await commitOperation(db, draft);
        setDone({ summary: draft.summary, unitIds: [] });
      }
      engine.request();
    } catch (e) {
      const msg = e instanceof CodesExhaustedError || e instanceof DomainError || e instanceof Error ? e.message : 'No se pudo registrar.';
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const online = typeof navigator !== 'undefined' && navigator.onLine;

  return (
    <>
      <PageHeader title="Añadir material" subtitle="Registra una o varias unidades de golpe" />
      <div className="space-y-5 rounded-tile border border-line bg-surface p-5">
        <label className="block">
          <span className={fieldLabel}>Tipo de material</span>
          <select className={inputCls} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Elegir tipo…</option>
            {groupedTypes.map((g) => (
              <optgroup key={g.category.id} label={g.category.name}>
                {g.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        {type?.uses_system && (
          <div>
            <span className={fieldLabel}>Sistema</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Sistema">
              {inv.systems.map((s) => (
                <button key={s.id} type="button" onClick={() => setSystemId(s.id)} aria-pressed={systemId === s.id}
                  className={`tap rounded-full border px-5 text-sm font-semibold ${systemId === s.id ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-surface text-ink-soft'}`}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {type && (
          <>
            <div>
              <span className={fieldLabel}>{isUnit ? 'Cuántas unidades' : 'Cantidad'}</span>
              <QuantityStepper value={count} onChange={setCount} min={1} max={isUnit ? MAX_BULK_CREATE : 100000} />
            </div>

            {isUnit && (
              <label className="block">
                <span className={fieldLabel}>Estado</span>
                <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as UnitStatus)}>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </label>
            )}

            <div>
              <span className={fieldLabel}>Ubicación</span>
              <LocationPicker locations={inv.locations} value={locationId} onChange={setLocationId} />
            </div>

            {isUnit && count === 1 && (
              <label className="block">
                <span className={fieldLabel}>Descripción corta (opcional)</span>
                <input className={inputCls} value={description} maxLength={120} placeholder="Alza verde" onChange={(e) => setDescription(e.target.value)} />
              </label>
            )}

            {isUnit && prefix && (
              <div className="rounded-ctl bg-paper p-4 text-sm">
                {missing === 0 ? (
                  <p>Códigos que se asignarán: <strong className="tnum">{preview[0]}{count > 1 ? ` … ${preview[preview.length - 1]}` : ''}</strong></p>
                ) : online ? (
                  <p className="text-ink-soft">Se reservarán {missing} códigos nuevos al crear.</p>
                ) : (
                  <p className="text-st-bad-fg">Sin conexión: solo quedan {preview.length} códigos {prefix} reservados en este dispositivo. Reduce la cantidad o conéctate.</p>
                )}
              </div>
            )}
          </>
        )}

        <button className={`${primaryBtn} w-full`} onClick={submit}
          disabled={busy || !ready || !locationId || (isUnit && missing > 0 && !online)}>
          {busy ? 'Registrando…' : type ? `${isUnit ? 'Crear' : 'Añadir'} ${count} ${isUnit ? (count === 1 ? 'unidad' : 'unidades') : (count === 1 ? 'elemento' : 'elementos')}` : 'Elige un tipo'}
        </button>
      </div>
    </>
  );
}
