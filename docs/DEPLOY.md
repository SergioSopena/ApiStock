# ApiStock · Publicación en GitHub Pages (sin instalar nada en tu ordenador)

GitHub compila y publica la aplicación solo cada vez que subes cambios a la rama `main`.

## Una sola vez

1. **Repositorio público** en GitHub (Pages es gratis en repositorios públicos; no hay secretos en el código).
2. Sube TODO el contenido de la carpeta `apistock` a la raíz del repositorio: `.github/`, `docs/`, `public/`, `src/`, `supabase/`, `.env.example`, `.gitignore`, `index.html`, `package.json`, `tsconfig.json`, `vite.config.ts`.
   - La carpeta `.github` empieza por punto y algunos sistemas la ocultan. Si no se sube al arrastrar, créala desde la web: **Add file → Create new file**, escribe `.github/workflows/deploy.yml` como nombre (las barras crean las carpetas), pega el contenido del archivo y confirma. Repite con `ci.yml`.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
4. **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable** (dos variables, nombres exactos):
   - `VITE_SUPABASE_URL` = la URL de tu proyecto (Supabase → Project Settings → API → Project URL).
   - `VITE_SUPABASE_ANON_KEY` = la clave pública (Project Settings → API Keys → **anon** / *publishable*). **Nunca** la `service_role` / *secret*.
5. En Supabase → **Authentication → URL Configuration**:
   - *Site URL*: `https://TU_USUARIO.github.io/apistock/`
   - *Redirect URLs*: la misma URL. (Necesario para «He olvidado mi contraseña».)
6. Lanza la publicación: pestaña **Actions → Publicar en GitHub Pages → Run workflow** (o cualquier cambio en `main`).
7. Cuando termine (círculo verde, 1–2 minutos), la app está en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`.

## Cada actualización
Sube los archivos cambiados al repositorio (web de GitHub → Add file → Upload files, sobre la misma ruta). Se publica sola.

## Si algo falla
- **Actions** muestra el paso que falla; copia el mensaje de error.
- El workflow «Comprobaciones» (tipos y pruebas) es independiente y **no bloquea** la publicación.
- Pantalla «Falta configurar Supabase»: las variables del paso 4 no están o tienen otro nombre; corrígelas y vuelve a ejecutar el workflow.

## Copias de seguridad
Se añaden en la Fase 7 (Configuración → Copias de seguridad).
