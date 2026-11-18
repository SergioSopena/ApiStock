import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { useData } from '../../app/DataProvider';
import { dangerBtn, PageHeader, secondaryBtn, Sheet } from '../../ui/primitives';

export function SettingsPage() {
  const { db, email } = useData();
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const pending = useLiveQuery(() => db.outbox.count(), [db]) ?? 0;

  const soon = ['Categorías y tipos', 'Sistemas apícolas', 'Prefijos de códigos', 'Usuarios y acceso', 'Copias de seguridad'];

  return (
    <>
      <PageHeader title="Configuración" />
      <ul className="space-y-2">
        <li>
          <Link to="/configuracion/ubicaciones" className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 hover:border-line-strong">
            <MapPin size={22} strokeWidth={1.5} className="text-honey-700" aria-hidden />
            <span className="flex-1 font-medium">Ubicaciones</span>
            <ChevronRight size={18} className="text-ink-mute" aria-hidden />
          </Link>
        </li>
        {soon.map((s) => (
          <li key={s} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 text-ink-mute" aria-disabled>
            <span className="flex-1 font-medium">{s}</span><span className="text-xs">Próximamente</span>
          </li>
        ))}
      </ul>

      <section className="mt-8 rounded-card border border-line bg-surface p-4">
        <h2 className="font-display text-base font-bold">Cuenta</h2>
        <p className="mt-1 text-ink-soft">{email ?? 'Sin conexión: usando la última sesión'}</p>
        <button className={`${secondaryBtn} mt-3`} onClick={() => setConfirming(true)}>Cerrar sesión</button>
      </section>
      <p className="mt-6 text-center text-xs text-ink-mute">ApiStock 0.4 · Fase 4A</p>

      <Sheet open={confirming} onClose={() => setConfirming(false)} title="Cerrar sesión">
        {pending > 0 ? (
          <p className="mb-4 rounded-ctl bg-st-used-bg p-3 text-st-used-fg">
            Tienes {pending} {pending === 1 ? 'cambio pendiente' : 'cambios pendientes'} de enviar. Se conservan en este dispositivo y se enviarán cuando vuelvas a entrar con esta cuenta,
            pero te recomiendo sincronizar antes (botón de estado arriba).
          </p>
        ) : (
          <p className="mb-4 text-ink-soft">Tu inventario se conserva en este dispositivo para cuando vuelvas a entrar.</p>
        )}
        <div className="flex gap-2">
          <button className={`${secondaryBtn} flex-1`} onClick={() => setConfirming(false)}>Cancelar</button>
          <button className={`${dangerBtn} flex-1`} onClick={() => void signOut()}>Cerrar sesión</button>
        </div>
      </Sheet>
    </>
  );
}
