import type { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { buildPrefix, compareCodes, parseCode } from '../domain/codes';
import type { ApiStockDB } from './db';
import { getDeviceId } from './db';

export class CodesExhaustedError extends Error {
  constructor(public readonly prefix: string, public readonly available: number, public readonly needed: number) {
    super(`Sin conexión: solo quedan ${available} códigos ${prefix} reservados y necesitas ${needed}.`);
  }
}

/** Primeros n códigos del búfer para un prefijo, sin consumirlos. */
export async function peekCodes(db: ApiStockDB, prefix: string, n: number): Promise<string[]> {
  const all = await db.code_buffer.where('prefix').equals(prefix).toArray();
  return all.map((c) => c.code).sort(compareCodes).slice(0, n);
}

export async function bufferCount(db: ApiStockDB, prefix: string): Promise<number> {
  return db.code_buffer.where('prefix').equals(prefix).count();
}

/** Pide al servidor bloques de códigos y los guarda en el búfer local. Requiere conexión. */
export async function reserveCodes(
  db: ApiStockDB,
  sb: SupabaseClient,
  requests: { prefix: string; count: number }[],
): Promise<void> {
  if (requests.length === 0) return;
  const { data, error } = await sb.rpc('reserve_codes', { p_device_id: getDeviceId(), p_requests: requests });
  if (error) throw error;
  if (data?.status !== 'ok') throw new Error('No se pudieron reservar códigos.');
  const rows = Object.entries(data.codes as Record<string, string[]>).flatMap(([prefix, codes]) =>
    codes.map((code) => ({ code, prefix, n: parseCode(code)?.n ?? 0 })),
  );
  await db.code_buffer.bulkPut(rows);
}

/**
 * Garantiza n códigos para el prefijo. Si el búfer no alcanza y hay conexión, reserva más;
 * si no hay conexión, falla con un mensaje claro (no existen códigos provisionales).
 */
export async function ensureCodes(
  db: ApiStockDB,
  sb: SupabaseClient | null,
  prefix: string,
  n: number,
): Promise<string[]> {
  let codes = await peekCodes(db, prefix, n);
  if (codes.length >= n) return codes;
  if (sb && navigator.onLine) {
    try {
      await reserveCodes(db, sb, [{ prefix, count: Math.min(200, n - codes.length + config.codeBuffer.target) }]);
      codes = await peekCodes(db, prefix, n);
    } catch {
      /* cae al error de códigos agotados */
    }
  }
  if (codes.length < n) throw new CodesExhaustedError(prefix, codes.length, n);
  return codes;
}

/** Mantiene un búfer mínimo para los tipos individualizados y rellena los que bajan del umbral. */
export async function topUpCodeBuffer(db: ApiStockDB, sb: SupabaseClient): Promise<void> {
  const [types, systems] = await Promise.all([db.item_types.toArray(), db.systems.toArray()]);
  const requests: { prefix: string; count: number }[] = [];
  for (const type of types) {
    if (type.mode !== 'unit') continue;
    const prefixes = type.uses_system ? systems.map((s) => buildPrefix(type, s)) : [buildPrefix(type, null)];
    for (const prefix of prefixes) {
      const have = await bufferCount(db, prefix);
      const used = have > 0; // ya tiene búfer: rellenar al bajar del umbral; si no, calentar con menos
      if (used && have < config.codeBuffer.refillBelow) {
        requests.push({ prefix, count: config.codeBuffer.target - have });
      } else if (!used) {
        requests.push({ prefix, count: config.codeBuffer.warmUp });
      }
    }
  }
  // El servidor admite hasta 20 prefijos y 500 códigos por llamada
  for (let i = 0; i < requests.length; i += 20) {
    const slice = requests.slice(i, i + 20);
    const total = slice.reduce((s, r) => s + r.count, 0);
    if (total > 500) {
      for (const r of slice) await reserveCodes(db, sb, [r]);
    } else {
      await reserveCodes(db, sb, slice);
    }
  }
}
