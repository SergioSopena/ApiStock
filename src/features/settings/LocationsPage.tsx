import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { commitOperation } from '../../data/commit';
import { useInventory } from '../../data/hooks';
import { newId } from '../../domain/builders';
import { buildTree, descendantIds, flattenTree, wouldCreateCycle } from '../../domain/locations';
import { countByType, sumCounts } from '../../domain/stock';
import type { Location, OperationDraft } from '../../domain/types';
import { LocationPicker } from '../../ui/LocationPicker';
import { EmptyState, PageHeader, Sheet, dangerBtn, fieldLabel, inputCls, primaryBtn, secondaryBtn } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { BackLink } from '../inventory/shared';

type Editing = { mode: 'new'; parentId: string | null } | { mode: 'edit'; location: Location } | null;

const norm = (s: string) => s.trim().toLowerCase();

export function LocationsPage() {
  const { db, engine } = useData();
  const inv = useInventory();
  const toast = useToast();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nodes = useMemo(() => flattenTree(buildTree(inv.locations)), [inv.locations]);
  const totalIn = (id: string) => sumCounts(countByType(inv.units, inv.lots, descendantIds(id, inv.locations)));

  const open = (e: NonNullable<Editing>) => {
    setEditing(e);
    setName(e.mode === 'edit' ? e.location.name : '');
    setParentId(e.mode === 'edit' ? e.location.parent_id : e.parentId);
  };

  const run = async (draft: OperationDraft, okMessage: string) => {
    setBusy(true);
    try {
      await commitOperation(db, draft, { recordRecent: false });
      engine.request();
      toast(okMessage);
      setEditing(null);
      setDeleting(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const clean = name.trim();
    if (!editing || !clean) return;
    const siblings = inv.locations.filter((l) => (l.parent_id ?? null) === (parentId ?? null) && (editing.mode === 'new' || l.id !== editing.location.id));
    if (siblings.some((l) => norm(l.name) === norm(clean))) {
      return toast('Ya existe una ubicación con ese nombre en el mismo nivel.', 'error');
    }
    if (editing.mode === 'new') {
      const order = siblings.reduce((m, l) => Math.max(m, l.sort_order), 0) + 1;
      await run({
        kind: 'location_create', summary: `Ubicación creada: ${clean}`, inverse: null,
        mutations: [{ m: 'insert', t: 'locations', row: { id: newId(), parent_id: parentId, name: clean, sort_order: order } }],
      }, 'Ubicación creada');
    } else {
      const loc = editing.location;
      if (wouldCreateCycle(loc.id, parentId, inv.locations)) return toast('No se puede colocar una ubicación dentro de sí misma.', 'error');
      const set: Record<string, unknown> = {};
      if (clean !== loc.name) set.name = clean;
      if (parentId !== loc.parent_id) set.parent_id = parentId;
      if (Object.keys(set).length === 0) return setEditing(null);
      await run({
        kind: 'location_edit', summary: `Ubicación editada: ${clean}`, inverse: null,
        mutations: [{ m: 'update', t: 'locations', id: loc.id, base_version: loc.version, set }],
      }, 'Cambios guardados');
    }
  };

  const remove = async (loc: Location) => {
    await run({
      kind: 'location_delete', summary: `Ubicación eliminada: ${loc.name}`, inverse: null,
      mutations: [{ m: 'delete', t: 'locations', id: loc.id, base_version: loc.version }],
    }, 'Ubicación eliminada');
  };

  const blockers = (loc: Location): string | null => {
    if (inv.locations.some((l) => l.parent_id === loc.id)) return 'Tiene sububicaciones. Elimínalas o muévelas primero.';
    const n = totalIn(loc.id);
    if (n > 0) return `Contiene ${n} ${n === 1 ? 'elemento' : 'elementos'}. Muévelos o dalos de baja primero.`;
    return null;
  };

  return (
    <>
      <PageHeader title="Ubicaciones" subtitle="Almacenes, apiarios, estanterías… con los niveles que quieras"
        back={<BackLink to="/configuracion">Configuración</BackLink>}
        actions={<button className={`${primaryBtn} shrink-0 gap-1.5`} onClick={() => open({ mode: 'new', parentId: null })}><Plus size={18} aria-hidden /> Nueva</button>} />

      {nodes.length === 0 ? (
        <EmptyState icon={<MapPin size={36} strokeWidth={1.5} />} title="Aún no hay ubicaciones"
          action={{ label: 'Crear la primera', onClick: () => open({ mode: 'new', parentId: null }) }}>
          Empieza por tus lugares principales, por ejemplo «Almacén» o «Apiario». Después puedes añadir niveles dentro.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {nodes.map(({ location: l, depth }) => (
            <li key={l.id} style={{ marginLeft: Math.min(depth, 6) * 16 }}
              className="flex items-center gap-2 rounded-card border border-line bg-surface py-2 pl-4 pr-2">
              <MapPin size={16} className="shrink-0 text-ink-mute" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
              <span className="tnum text-sm text-ink-mute">{totalIn(l.id)}</span>
              <button className="tap grid place-items-center rounded-ctl text-ink-soft hover:bg-paper" aria-label={`Añadir dentro de ${l.name}`} onClick={() => open({ mode: 'new', parentId: l.id })}><Plus size={18} /></button>
              <button className="tap grid place-items-center rounded-ctl text-ink-soft hover:bg-paper" aria-label={`Editar ${l.name}`} onClick={() => open({ mode: 'edit', location: l })}><Pencil size={17} /></button>
              <button className="tap grid place-items-center rounded-ctl text-ink-soft hover:bg-paper" aria-label={`Eliminar ${l.name}`} onClick={() => setDeleting(l)}><Trash2 size={17} /></button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.mode === 'edit' ? 'Editar ubicación' : 'Nueva ubicación'}>
        <div className="space-y-4">
          <label className="block"><span className={fieldLabel}>Nombre</span>
            <input className={inputCls} autoFocus maxLength={80} value={name} placeholder="Almacén Eraul"
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} /></label>
          <div><span className={fieldLabel}>Dentro de</span>
            <LocationPicker locations={inv.locations} value={parentId} onChange={setParentId} allowRoot
              exclude={editing?.mode === 'edit' ? descendantIds(editing.location.id, inv.locations) : undefined} /></div>
          <div className="flex gap-2">
            <button className={`${secondaryBtn} flex-1`} onClick={() => setEditing(null)}>Cancelar</button>
            <button className={`${primaryBtn} flex-1`} onClick={() => void save()} disabled={busy || !name.trim()}>Guardar</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={!!deleting} onClose={() => setDeleting(null)} title="Eliminar ubicación">
        {deleting && (blockers(deleting) ? (
          <>
            <p className="mb-4 text-ink-soft"><strong>{deleting.name}</strong>: {blockers(deleting)}</p>
            <button className={`${secondaryBtn} w-full`} onClick={() => setDeleting(null)}>Entendido</button>
          </>
        ) : (
          <>
            <p className="mb-4 text-ink-soft">¿Eliminar la ubicación <strong>{deleting.name}</strong>? Está vacía.</p>
            <div className="flex gap-2">
              <button className={`${secondaryBtn} flex-1`} onClick={() => setDeleting(null)}>Cancelar</button>
              <button className={`${dangerBtn} flex-1`} onClick={() => void remove(deleting)} disabled={busy}>Eliminar</button>
            </div>
          </>
        ))}
      </Sheet>
    </>
  );
}
