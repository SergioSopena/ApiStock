// Configuración de la aplicación (modificable aquí).
export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  /** Tamaño máximo de un archivo de importación (el servidor aplica además su propio límite). */
  maxImportBytes: 5 * 1024 * 1024,
  /** Búfer de códigos reservados por dispositivo. */
  codeBuffer: { target: 20, refillBelow: 8, warmUp: 10 },
  /** Operaciones recientes que se conservan. */
  recentOperations: 10,
  /** Intervalo de sincronización periódica con la app abierta (ms). */
  syncIntervalMs: 60_000,
} as const;
