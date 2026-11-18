import { ArrowRightLeft, Boxes, CheckCheck, Home, Search, Settings } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { SyncPill } from '../ui/SyncPill';
import { useData } from './DataProvider';

const NAV = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/inventario', label: 'Inventario', icon: Boxes, end: false },
  { to: '/operaciones', label: 'Operaciones', icon: ArrowRightLeft, end: false },
  { to: '/compatibilidad', label: 'Compatibilidad', icon: CheckCheck, end: false },
  { to: '/configuracion', label: 'Configuración', icon: Settings, end: false },
];

export function Layout() {
  const navigate = useNavigate();
  const { engine } = useData();
  void engine;

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="px-3 pb-6">
          <p className="font-display text-2xl font-extrabold tracking-tight">ApiStock</p>
          <p className="text-xs text-ink-mute">Gestión inteligente de material apícola</p>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Principal">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `tap flex items-center gap-3 rounded-ctl px-3 font-medium transition ${
                  isActive ? 'bg-honey-100 text-ink' : 'text-ink-soft hover:bg-paper'}`}>
              <Icon size={20} strokeWidth={1.75} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 pb-2 pt-safe backdrop-blur lg:px-8">
          <p className="font-display text-lg font-extrabold tracking-tight lg:hidden">ApiStock</p>
          <button onClick={() => navigate('/buscar')}
            className="tap hidden flex-1 items-center gap-2 rounded-ctl border border-line bg-surface px-4 text-left text-ink-mute lg:flex lg:max-w-md">
            <Search size={18} aria-hidden /> Buscar código, tipo, ubicación…
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/buscar')} aria-label="Buscar"
              className="tap grid place-items-center rounded-full border border-line bg-surface lg:hidden">
              <Search size={18} aria-hidden />
            </button>
            <SyncPill />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
          <Outlet />
        </main>

        {/* Navegación inferior (móvil) */}
        <nav aria-label="Principal"
          className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface lg:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                  isActive ? 'text-ink' : 'text-ink-mute'}`}>
              {({ isActive }) => (
                <>
                  <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive ? 'bg-honey-400' : ''}`}>
                    <Icon size={20} strokeWidth={1.75} aria-hidden />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
