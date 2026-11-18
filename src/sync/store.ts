import { useSyncExternalStore } from 'react';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error' | 'blocked';

export interface SyncState {
  phase: SyncPhase;
  lastSyncAt: number | null;
  message: string | null;
}

let state: SyncState = { phase: 'idle', lastSyncAt: null, message: null };
const listeners = new Set<() => void>();

export function setSyncState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
