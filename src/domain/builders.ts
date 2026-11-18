import { buildPrefix } from './codes';
import { lotKey } from './stock';
import type { ItemType, Mutation, OperationDraft, System, Unit, UnitStatus } from './types';

export const newId = (): string => crypto.randomUUID();

export const MAX_BULK_CREATE = 200;

export interface CreateUnitsInput {
  type: ItemType;
  system: System | null;
  count: number;
  status: UnitStatus;
  locationId: string;
  description?: string | null;
  /** Un código por unidad, ya reservados */
  codes: string[];
  idFactory?: () => string;
}

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function assertSystem(type: ItemType, system: System | null) {
  if (type.uses_system && !system) throw new DomainError('system_required', `«${type.name}» necesita un sistema.`);
  if (!type.uses_system && system) throw new DomainError('system_not_allowed', `«${type.name}» no usa sistema.`);
}

function label(type: ItemType, system: System | null): string {
  return system ? `${type.name} ${system.name}` : type.name;
}

/** Alta múltiple de unidades individualizadas. */
export function draftCreateUnits(input: CreateUnitsInput): OperationDraft {
  const { type, system, count, status, locationId, codes } = input;
  const nextId = input.idFactory ?? newId;
  assertSystem(type, system);
  if (!Number.isInteger(count) || count < 1 || count > MAX_BULK_CREATE) {
    throw new DomainError('invalid_count', `La cantidad debe estar entre 1 y ${MAX_BULK_CREATE}.`);
  }
  if (codes.length !== count) throw new DomainError('codes_mismatch', 'No hay un código por cada unidad.');
  if (new Set(codes).size !== codes.length) throw new DomainError('codes_duplicated', 'Hay códigos repetidos.');

  const ids = codes.map(() => nextId());
  const mutations: Mutation[] = codes.map((code, i) => ({
    m: 'insert',
    t: 'units',
    row: {
      id: ids[i],
      type_id: type.id,
      system_id: system?.id ?? null,
      code,
      description: count === 1 ? (input.description?.trim() || null) : null,
      status,
      location_id: locationId,
      attrs: {},
      notes: null,
    },
  }));
  const range = count === 1 ? codes[0] : `${codes[0]} … ${codes[codes.length - 1]}`;
  return {
    kind: 'create_units',
    summary: `Alta de ${count} × ${label(type, system)} (${range})`,
    mutations,
    inverse: ids.map((id) => ({ m: 'delete', t: 'units', id, base_version: 1 }) as Mutation),
    createdUnitIds: ids,
  };
}

/** Alta de material agrupado (suma cantidad a un lote). */
export function draftCreateLot(p: {
  type: ItemType;
  system: System | null;
  count: number;
  locationId: string;
  lotId?: string;
}): OperationDraft {
  assertSystem(p.type, p.system);
  if (!Number.isInteger(p.count) || p.count < 1) {
    throw new DomainError('invalid_count', 'La cantidad debe ser un número entero positivo.');
  }
  const base = { type_id: p.type.id, system_id: p.system?.id ?? null, location_id: p.locationId };
  return {
    kind: 'create_lot',
    summary: `Alta de ${p.count} × ${label(p.type, p.system)}`,
    mutations: [{ m: 'lot_delta', ...base, delta: p.count, lot_id: p.lotId }],
    inverse: [{ m: 'lot_delta', ...base, delta: -p.count }],
  };
}

export type UnitEditable = Partial<Pick<Unit, 'description' | 'status' | 'location_id' | 'notes' | 'attrs' | 'code'>>;

/** Edición de una unidad. Solo envía los campos que cambian realmente. */
export function draftUpdateUnit(unit: Unit, changes: UnitEditable): OperationDraft | null {
  const set: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  for (const key of Object.keys(changes) as (keyof UnitEditable)[]) {
    const next = changes[key];
    const prev = unit[key];
    if (JSON.stringify(next) !== JSON.stringify(prev)) {
      set[key] = next ?? null;
      previous[key] = prev ?? null;
    }
  }
  if (Object.keys(set).length === 0) return null;
  return {
    kind: 'edit_unit',
    summary: `Editada la unidad ${unit.code}`,
    mutations: [{ m: 'update', t: 'units', id: unit.id, base_version: unit.version, set }],
    inverse: [{ m: 'update', t: 'units', id: unit.id, base_version: unit.version + 1, set: previous }],
  };
}

export { buildPrefix, lotKey };
