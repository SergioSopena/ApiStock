import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

/** Cliente con la clave ANON (pública). La clave service_role jamás se usa en el navegador. */
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null;
