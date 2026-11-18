import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiStockDB, getMeta } from '../data/db';
import { SyncEngine } from '../sync/engine';
import { supabase } from '../sync/client';
import { useSyncState } from '../sync/store';

interface DataContextValue {
  db: ApiStockDB;
  engine: SyncEngine;
  userId: string;
  email: string | null;
}

const DataContext = createContext<DataContextValue | null>(null);

/** Abre la base local del usuario, arranca la sincronización y espera a la primera descarga si hace falta. */
export function DataProvider({ userId, email, children }: { userId: string; email: string | null; children: ReactNode }) {
  const [value, setValue] = useState<DataContextValue | null>(null);
  const [firstLoad, setFirstLoad] = useState<'checking' | 'downloading' | 'ready' | 'needs_connection'>('checking');
  const sync = useSyncState();

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    const db = new ApiStockDB(userId);
    const engine = new SyncEngine(db, supabase!);

    (async () => {
      await db.open();
      const cursor = await getMeta<number>(db, 'cursor');
      if (cancelled) return;
      setValue({ db, engine, userId, email });
      if (cursor !== undefined) {
        setFirstLoad('ready');
        stop = engine.start();
      } else if (!navigator.onLine) {
        setFirstLoad('needs_connection');
      } else {
        setFirstLoad('downloading');
        await engine.syncNow();
        if (cancelled) return;
        const after = await getMeta<number>(db, 'cursor');
        if (after !== undefined) {
          setFirstLoad('ready');
          stop = engine.start();
        } else {
          setFirstLoad('needs_connection');
        }
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
      db.close();
    };
  }, [userId, email]);

  if (firstLoad !== 'ready' || !value) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-honey-500" aria-hidden />
        {firstLoad === 'needs_connection' ? (
          <>
            <h1 className="font-display text-xl font-bold">Primera descarga pendiente</h1>
            <p className="text-ink-soft">
              ApiStock necesita conexión la primera vez en este dispositivo para descargar tu inventario.
              {sync.message ? ` (${sync.message})` : ''}
            </p>
            <button className="tap rounded-ctl bg-honey-400 px-5 font-semibold" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </>
        ) : (
          <p className="text-ink-soft">{firstLoad === 'downloading' ? 'Descargando tu inventario…' : 'Abriendo…'}</p>
        )}
      </main>
    );
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData fuera de DataProvider');
  return ctx;
}
