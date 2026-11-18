import { describe, expect, it } from 'vitest';
import { buildPrefix, compareCodes, formatCode, normalizeCode, parseCode } from './codes';
import { buildTree, descendantIds, flattenTree, indexById, locationPath, wouldCreateCycle } from './locations';
import { countByType, lotKey } from './stock';
import { DomainError, draftCreateLot, draftCreateUnits, draftUpdateUnit } from './builders';
import type { ItemType, Location, StockLot, System, Unit } from './types';

const sysL: System = { id: 'sL', name: 'Langstroth', code_letter: 'L', color: null, sort_order: 1, version: 1 };
const sysI: System = { id: 'sI', name: 'Layens', code_letter: 'I', color: null, sort_order: 2, version: 1 };

const alza: ItemType = {
  id: 'tAlza', category_id: 'c1', name: 'Alza', icon: null, mode: 'unit', code_prefix: 'A',
  uses_system: true, attribute_defs: [], sort_order: 1, version: 1,
};
const extractor: ItemType = { ...alza, id: 'tExt', name: 'Extractor', code_prefix: 'EXT', uses_system: false };
const cuadro: ItemType = { ...alza, id: 'tCuadro', name: 'Cuadro', code_prefix: 'CU', mode: 'bulk' };

const loc = (id: string, name: string, parent: string | null = null, sort = 0): Location =>
  ({ id, name, parent_id: parent, sort_order: sort, version: 1 });

describe('códigos', () => {
  it('construye el prefijo con la letra del sistema', () => {
    expect(buildPrefix(alza, sysL)).toBe('AL');
    expect(buildPrefix(alza, sysI)).toBe('AI');
    expect(buildPrefix(extractor, null)).toBe('EXT');
  });
  it('formatea y analiza códigos', () => {
    expect(formatCode('AL', 7)).toBe('AL-07');
    expect(formatCode('AL', 123)).toBe('AL-123');
    expect(parseCode('AL-07')).toEqual({ prefix: 'AL', n: 7 });
    expect(parseCode('mi-codigo')).toBeNull();
  });
  it('normaliza lo que escribe el usuario', () => {
    expect(normalizeCode('al17')).toBe('AL-17');
    expect(normalizeCode(' AL 17 ')).toBe('AL-17');
    expect(normalizeCode('al-7')).toBe('AL-07');
    expect(normalizeCode('MI-ALZA')).toBe('MI-ALZA');
  });
  it('ordena de forma natural', () => {
    expect(['AL-10', 'AL-2', 'AI-3'].sort(compareCodes)).toEqual(['AI-3', 'AL-2', 'AL-10']);
  });
});

describe('ubicaciones', () => {
  const locs = [loc('a', 'Almacén'), loc('b', 'Estantería 1', 'a'), loc('c', 'Cajón 3', 'b'), loc('d', 'Apiario')];
  it('construye el árbol ordenado y lo aplana', () => {
    const tree = buildTree(locs);
    expect(tree.map((n) => n.location.name)).toEqual(['Almacén', 'Apiario']);
    expect(flattenTree(tree).map((n) => [n.location.name, n.depth])).toEqual([
      ['Almacén', 0], ['Estantería 1', 1], ['Cajón 3', 2], ['Apiario', 0],
    ]);
  });
  it('compone la ruta completa', () => {
    expect(locationPath('c', indexById(locs))).toBe('Almacén › Estantería 1 › Cajón 3');
  });
  it('incluye sububicaciones al consultar una ubicación padre', () => {
    expect([...descendantIds('a', locs)].sort()).toEqual(['a', 'b', 'c']);
    expect([...descendantIds('d', locs)]).toEqual(['d']);
  });
  it('detecta ciclos', () => {
    expect(wouldCreateCycle('a', 'c', locs)).toBe(true);
    expect(wouldCreateCycle('a', 'a', locs)).toBe(true);
    expect(wouldCreateCycle('c', 'd', locs)).toBe(false);
    expect(wouldCreateCycle('a', null, locs)).toBe(false);
  });
});

describe('recuento de material', () => {
  const unit = (id: string, system: string | null, location: string): Unit => ({
    id, type_id: alza.id, system_id: system, code: id, description: null, status: 'new',
    location_id: location, attrs: {}, notes: null, version: 1,
  });
  const units = [unit('u1', 'sL', 'a'), unit('u2', 'sL', 'b'), unit('u3', 'sI', 'd')];
  const lots: StockLot[] = [
    { id: 'l1', type_id: cuadro.id, system_id: 'sL', location_id: 'a', quantity: 100, key: lotKey(cuadro.id, 'sL', 'a'), version: 1 },
    { id: 'l2', type_id: cuadro.id, system_id: 'sL', location_id: 'd', quantity: 0, key: lotKey(cuadro.id, 'sL', 'd'), version: 1 },
  ];
  it('suma unidades y cantidades, con desglose por sistema', () => {
    const counts = countByType(units, lots);
    expect(counts.get(alza.id)?.total).toBe(3);
    expect(counts.get(alza.id)?.bySystem.get('sL')).toBe(2);
    expect(counts.get(cuadro.id)?.total).toBe(100);
  });
  it('filtra por ubicaciones y su descendencia', () => {
    const counts = countByType(units, lots, new Set(['a', 'b']));
    expect(counts.get(alza.id)?.total).toBe(2);
    expect(counts.get(cuadro.id)?.total).toBe(100);
    expect(countByType(units, lots, new Set(['d'])).get(cuadro.id)).toBeUndefined();
  });
});

describe('constructores de operaciones', () => {
  let n = 0;
  const idFactory = () => `id-${++n}`;

  it('alta múltiple: una inserción por unidad y operación inversa', () => {
    const d = draftCreateUnits({
      type: alza, system: sysL, count: 3, status: 'new', locationId: 'a',
      codes: ['AL-01', 'AL-02', 'AL-03'], idFactory,
    });
    expect(d.mutations).toHaveLength(3);
    expect(d.mutations.every((m) => m.m === 'insert')).toBe(true);
    expect(d.inverse).toHaveLength(3);
    expect(d.summary).toContain('AL-01 … AL-03');
    expect(d.createdUnitIds).toHaveLength(3);
  });
  it('exige sistema cuando el tipo lo usa y lo prohíbe si no', () => {
    expect(() => draftCreateUnits({ type: alza, system: null, count: 1, status: 'new', locationId: 'a', codes: ['A-01'] }))
      .toThrowError(DomainError);
    expect(() => draftCreateUnits({ type: extractor, system: sysL, count: 1, status: 'new', locationId: 'a', codes: ['EXT-01'] }))
      .toThrowError(DomainError);
  });
  it('valida cantidad y códigos', () => {
    expect(() => draftCreateUnits({ type: alza, system: sysL, count: 0, status: 'new', locationId: 'a', codes: [] })).toThrow();
    expect(() => draftCreateUnits({ type: alza, system: sysL, count: 2, status: 'new', locationId: 'a', codes: ['AL-01'] })).toThrow();
    expect(() => draftCreateUnits({ type: alza, system: sysL, count: 2, status: 'new', locationId: 'a', codes: ['AL-01', 'AL-01'] })).toThrow();
  });
  it('la descripción solo se aplica cuando se crea una unidad', () => {
    const one = draftCreateUnits({ type: alza, system: sysL, count: 1, status: 'new', locationId: 'a', codes: ['AL-01'], description: ' Alza verde ', idFactory });
    expect((one.mutations[0] as { row: { description: string } }).row.description).toBe('Alza verde');
    const many = draftCreateUnits({ type: alza, system: sysL, count: 2, status: 'new', locationId: 'a', codes: ['AL-01', 'AL-02'], description: 'x', idFactory });
    expect((many.mutations[0] as { row: { description: null } }).row.description).toBeNull();
  });
  it('alta de lote: delta positivo y su inverso negativo', () => {
    const d = draftCreateLot({ type: cuadro, system: sysL, count: 100, locationId: 'a' });
    expect(d.mutations[0]).toMatchObject({ m: 'lot_delta', delta: 100 });
    expect(d.inverse?.[0]).toMatchObject({ m: 'lot_delta', delta: -100 });
  });
  it('edición: solo envía lo que cambia y no genera operación si no hay cambios', () => {
    const unit: Unit = {
      id: 'u1', type_id: alza.id, system_id: 'sL', code: 'AL-01', description: null, status: 'new',
      location_id: 'a', attrs: {}, notes: null, version: 3,
    };
    expect(draftUpdateUnit(unit, { status: 'new', description: null })).toBeNull();
    const d = draftUpdateUnit(unit, { status: 'good', description: 'Verde' })!;
    expect(d.mutations[0]).toMatchObject({ m: 'update', base_version: 3, set: { status: 'good', description: 'Verde' } });
    expect(d.inverse?.[0]).toMatchObject({ base_version: 4, set: { status: 'new', description: null } });
  });
});
