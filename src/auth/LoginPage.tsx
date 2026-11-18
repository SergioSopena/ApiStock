import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider';

const field =
  'tap w-full rounded-ctl border border-line-strong bg-surface px-4 text-base text-ink placeholder:text-ink-mute focus:border-honey-500';
const primary =
  'tap w-full rounded-ctl bg-honey-400 px-5 font-semibold text-ink transition active:scale-[0.99] hover:bg-honey-500 disabled:opacity-60';

export function LoginPage() {
  const { state, signIn, sendRecovery, setNewPassword } = useAuth();
  const recovery = state.status === 'anon' && state.recovery;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<string | null>, success?: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    else if (success) setInfo(success);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (recovery) {
      if (password.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.');
      void run(() => setNewPassword(password));
    } else {
      void run(() => signIn(email, password));
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10 pt-safe">
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">ApiStock</h1>
      <p className="mt-1 text-ink-soft">Gestión inteligente de material apícola</p>

      <form onSubmit={onSubmit} className="mt-10 space-y-4" noValidate>
        {recovery ? (
          <>
            <h2 className="text-xl font-semibold">Elige una contraseña nueva</h2>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Contraseña nueva (mínimo 10 caracteres)</span>
              <input className={field} type="password" autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className={primary} disabled={busy}>Guardar contraseña</button>
          </>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Correo electrónico</span>
              <input className={field} type="email" autoComplete="username" inputMode="email" value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Contraseña</span>
              <input className={field} type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className={primary} disabled={busy || !email || !password}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <button
              type="button"
              className="w-full py-3 text-sm font-medium text-honey-700 underline-offset-4 hover:underline"
              disabled={busy || !email}
              onClick={() => run(() => sendRecovery(email), 'Si el correo existe, recibirás un enlace para elegir una contraseña nueva.')}
            >
              He olvidado mi contraseña
            </button>
          </>
        )}
        {error && <p role="alert" className="rounded-ctl bg-st-bad-bg px-4 py-3 text-sm text-st-bad-fg">{error}</p>}
        {info && <p role="status" className="rounded-ctl bg-pine-100 px-4 py-3 text-sm text-pine-700">{info}</p>}
      </form>
      <p className="mt-10 text-center text-xs text-ink-mute">
        El acceso es solo por invitación. Si necesitas una cuenta, pídesela al administrador.
      </p>
    </main>
  );
}
