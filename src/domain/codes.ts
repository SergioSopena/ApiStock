import type { ItemType, System } from './types';

export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

/** Prefijo del código: letra(s) del tipo + letra del sistema si el tipo usa sistema (AL, AI, EXT…). */
export function buildPrefix(
  type: Pick<ItemType, 'code_prefix' | 'uses_system'>,
  system?: Pick<System, 'code_letter'> | null,
): string {
  return type.uses_system && system ? type.code_prefix + system.code_letter : type.code_prefix;
}

export function formatCode(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(2, '0')}`;
}

export function parseCode(code: string): { prefix: string; n: number } | null {
  const m = /^([A-Z0-9]{1,5})-(\d{1,9})$/.exec(code);
  return m ? { prefix: m[1], n: parseInt(m[2], 10) } : null;
}

/** "al17", "AL 17", "al-7" → "AL-17", "AL-07". El resto se devuelve en mayúsculas. */
export function normalizeCode(input: string): string {
  const s = input.trim().toUpperCase().replace(/\s+/g, '-');
  const noHyphen = /^([A-Z]{1,5})(\d{1,9})$/.exec(s);
  if (noHyphen) return formatCode(noHyphen[1], parseInt(noHyphen[2], 10));
  const hyphen = /^([A-Z0-9]{1,5})-(\d{1,9})$/.exec(s);
  if (hyphen) return formatCode(hyphen[1], parseInt(hyphen[2], 10));
  return s;
}

/** Orden natural: por prefijo y luego por número (AL-2 antes que AL-10). */
export function compareCodes(a: string, b: string): number {
  const pa = parseCode(a);
  const pb = parseCode(b);
  if (pa && pb) {
    if (pa.prefix !== pb.prefix) return pa.prefix < pb.prefix ? -1 : 1;
    return pa.n - pb.n;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
