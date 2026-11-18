import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { LoginPage } from '../auth/LoginPage';
import { isConfigured } from '../sync/client';
import { ToastProvider } from '../ui/Toast';
import { ComingSoonPage } from '../features/compatibility/ComingSoonPage';
import { HomePage } from '../features/home/HomePage';
import { CategoryPage, InventoryPage, TypePage, UnitPage } from '../features/inventory/InventoryPages';
import { SearchPage } from '../features/inventory/SearchPage';
import { CreatePage } from '../features/operations/CreatePage';
import { OperationsPage } from '../features/operations/OperationsPage';
import { LocationsPage } from '../features/settings/LocationsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { DataProvider } from './DataProvider';
import { Layout } from './Layout';

function Gate() {
  const { state } = useAuth();
  if (state.status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-honey-500" aria-label="Cargando" />
      </div>
    );
  }
  if (state.status === 'anon') return <LoginPage />;
  return (
    <DataProvider userId={state.userId} email={state.email}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="inventario" element={<InventoryPage />} />
          <Route path="inventario/c/:id" element={<CategoryPage />} />
          <Route path="inventario/t/:id" element={<TypePage />} />
          <Route path="unidad/:id" element={<UnitPage />} />
          <Route path="buscar" element={<SearchPage />} />
          <Route path="operaciones" element={<OperationsPage />} />
          <Route path="operaciones/alta" element={<CreatePage />} />
          <Route path="compatibilidad" element={<ComingSoonPage />} />
          <Route path="configuracion" element={<SettingsPage />} />
          <Route path="configuracion/ubicaciones" element={<LocationsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}

export function App() {
  if (!isConfigured) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-2xl font-bold">Falta configurar Supabase</h1>
        <p className="mt-3 text-ink-soft">
          Define las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (en GitHub: Settings → Secrets and variables → Actions → Variables)
          y vuelve a publicar la aplicación.
        </p>
      </main>
    );
  }
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}
