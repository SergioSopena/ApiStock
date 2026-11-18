import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../sync/client';

export type AuthState =
  | { status: 'loading' }
  | { status: 'anon'; recovery: boolean }
  | { status: 'authed'; userId: string; email: string | null; offline: boolean };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  sendRecovery: (email: string) => Promise<string | null>;
  setNewPassword: (password: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const LAST_USER_KEY = 'apistock:last_user';

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.';
  if (/failed to fetch|network/i.test(message)) return 'No hay conexión. Inténtalo de nuevo cuando vuelva.';
  if (/rate limit|too many/i.test(message)) return 'Demasiados intentos. Espera unos minutos.';
  if (/password should be at least/i.test(message)) return 'La contraseña debe tener al menos 10 caracteres.';
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    let recovery = false;

    const fromSession = (session: { user: { id: string; email?: string | null } } | null) => {
      if (session) {
        localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: session.user.id, email: session.user.email ?? null }));
        setState({ status: 'authed', userId: session.user.id, email: session.user.email ?? null, offline: false });
        return;
      }
      // Sin sesión y sin red: seguir con el último usuario (la app funciona offline con sus datos locales)
      const cached = localStorage.getItem(LAST_USER_KEY);
      if (!navigator.onLine && cached) {
        const u = JSON.parse(cached) as { id: string; email: string | null };
        setState({ status: 'authed', userId: u.id, email: u.email, offline: true });
        return;
      }
      setState({ status: 'anon', recovery });
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) fromSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recovery = true;
        setState({ status: 'anon', recovery: true });
        return;
      }
      if (event === 'SIGNED_OUT') localStorage.removeItem(LAST_USER_KEY);
      if (!cancelled && !(recovery && event === 'SIGNED_IN')) fromSession(session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    return error ? friendly(error.message) : null;
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(LAST_USER_KEY);
    await supabase!.auth.signOut();
    setState({ status: 'anon', recovery: false });
  }, []);

  const sendRecovery = useCallback(async (email: string) => {
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    return error ? friendly(error.message) : null;
  }, []);

  const setNewPassword = useCallback(async (password: string) => {
    const { error } = await supabase!.auth.updateUser({ password });
    if (error) return friendly(error.message);
    const { data } = await supabase!.auth.getSession();
    if (data.session) {
      setState({ status: 'authed', userId: data.session.user.id, email: data.session.user.email ?? null, offline: false });
    }
    return null;
  }, []);

  const value = useMemo(
    () => ({ state, signIn, signOut, sendRecovery, setNewPassword }),
    [state, signIn, signOut, sendRecovery, setNewPassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
