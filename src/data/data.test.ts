import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyMutationsLocal, LocalApplyError } from './applyLocal';
import { ApiStockDB } from './db';

let db: ApiStockDB;
let n = 0;

beforeEach(async () => {
  db = new ApiStockDB(`test-${++n}-${Math.random()}`);
  await db.open();
});

const run = (mutations: Parameters<typeof applyMutationsLocal>[1]) =>
  db.transaction('rw', db.tables, () => applyMutationsLocal(db, mutations));

describe('aplicación local de mutaciones', () => {
  it('lot_delta crea, suma y resta sobre la clave natural', async () => {
    const base = { m: 'lot_delta' as const, type_id: 't1', system_id: 'sL', location_id: 'l1' };
    await run([{ ...base, delta: 100 }]);
    await run([{ ...base, delta: -5 }]);
    const lots = await db.stock_lots.toArray();
    expect(lots).toHaveLength(1);
    expect(lots[0].quantity).toBe(95);
  });

  it('lot_delta no permite totales negativos y no deja cambios a medias', async () => {
    const base = { m: 'lot_delta' as const, type_id: 't1', system_id: null, location_id: 'l1' };
    await run([{ ...base, delta: 10 }]);
    await expect(run([{ ...base, delta: -3 }, { ...base, delta: -8 }])).rejects.toBeInstanceOf(LocalApplyError);
    expect((await db.stock_lots.toArray())[0].quantity).toBe(10);
  });

  it('individualizar: descuenta del lote y crea la ficha de forma atómica', async () => {
    await run([{ m: 'lot_delta', type_id: 't1', system_id: 'sL', location_id: 'l1', delta: 100 }]);
    await run([
      { m: 'lot_delta', type_id: 't1', system_id: 'sL', location_id: 'l1', delta: -1 },
      { m: 'insert', t: 'units', row: { id: 'u1', type_id: 't1', system_id: 'sL', code: 'CUL-01', status: 'used', location_id: 'l1' } },
    ]);
    expect((await db.stock_lots.toArray())[0].quantity).toBe(99);
    expect(await db.units.count()).toBe(1);
  });

  it('update sube la versión en 1 y delete de una unidad borra sus compatibilidades', async () => {
    await run([
      { m: 'insert', t: 'units', row: { id: 'u1', type_id: 't', code: 'A-01', status: 'new', location_id: 'l' } },
      { m: 'insert', t: 'units', row: { id: 'u2', type_id: 't', code: 'A-02', status: 'new', location_id: 'l' } },
      { m: 'compat_set', unit_a: 'u2', unit_b: 'u1', result: 'compatible' },
    ]);
    await run([{ m: 'update', t: 'units', id: 'u1', base_version: 1, set: { status: 'good' } }]);
    expect((await db.units.get('u1'))!.version).toBe(2);
    const compat = await db.compatibilities.toArray();
    expect(compat).toHaveLength(1);
    expect(compat[0].unit_a < compat[0].unit_b).toBe(true);
    await run([{ m: 'delete', t: 'units', id: 'u1', base_version: 2 }]);
    expect(await db.compatibilities.count()).toBe(0);
  });

  it('insert aplica valores por defecto coherentes con el servidor', async () => {
    await run([{ m: 'insert', t: 'units', row: { id: 'u1', type_id: 't', code: 'A-01', status: 'new', location_id: 'l' } }]);
    const u = (await db.units.get('u1'))!;
    expect(u).toMatchObject({ system_id: null, description: null, attrs: {}, notes: null, version: 1 });
  });
});
