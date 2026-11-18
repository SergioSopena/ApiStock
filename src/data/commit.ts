import { config } from '../config';
import type { OperationDraft, OperationPayload, RecentOperation } from '../domain/types';
import { applyMutationsLocal } from './applyLocal';
import { type ApiStockDB, getDeviceId, getMeta } from './db';

export class CommitError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

/**
 * Confirma una operación: aplica los cambios a la base local, los anota en la cola de envío y consume
 * los códigos usados, todo en UNA transacción local. Si algo falla no queda nada a medias.
 */
export async function commitOperation(
  db: ApiStockDB,
  draft: OperationDraft,
  opts: { consumedCodes?: string[]; recordRecent?: boolean } = {},
): Promise<string> {
  const opId = crypto.randomUUID();
  const epoch = (await getMeta<number>(db, 'epoch')) ?? 1;
  const recent = opts.recordRecent !== false && draft.inverse
    ? { kind: draft.kind, summary: draft.summary, inverse: { mutations: draft.inverse } }
    : undefined;
  const payload: OperationPayload = {
    op_id: opId,
    device_id: getDeviceId(),
    epoch,
    mutations: draft.mutations,
    ...(recent ? { recent } : {}),
  };

  await db.transaction('rw', db.tables, async () => {
    if (opts.consumedCodes?.length) {
      const present = await db.code_buffer.bulkGet(opts.consumedCodes);
      if (present.some((c) => !c)) {
        throw new CommitError('codes_changed', 'Los códigos reservados han cambiado. Inténtalo de nuevo.');
      }
      await db.code_buffer.bulkDelete(opts.consumedCodes);
    }
    await applyMutationsLocal(db, draft.mutations);
    if (recent) {
      const row: RecentOperation = {
        id: opId, kind: recent.kind, summary: recent.summary, inverse: recent.inverse,
        device_id: payload.device_id, created_at: new Date().toISOString(), version: 1,
      };
      await db.recent_operations.put(row);
      const all = await db.recent_operations.orderBy('created_at').reverse().toArray();
      const surplus = all.slice(config.recentOperations).map((r) => r.id);
      if (surplus.length) await db.recent_operations.bulkDelete(surplus);
    }
    await db.outbox.add({
      op_id: opId, op: payload, status: 'pending', summary: draft.summary, created_at: new Date().toISOString(),
    });
  });
  return opId;
}
