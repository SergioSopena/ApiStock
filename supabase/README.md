# ApiStock · Backend (Supabase)

## Contenido
```
migrations/
  …0001_schema.sql        tablas, claves compuestas, triggers de integridad
  …0002_rls.sql           RLS + privilegios (el cliente solo lee)
  …0003_rpc.sql           apply_batch, reserve_codes, pull_changes, export/import
  …0004_new_user_seed.sql perfil y catálogo inicial al crear usuario
functions/admin-create-user/   Edge Function (única que usa service_role)
tests/database/                pruebas pgTAP
config.toml                    configuración local
```

## Desarrollo local (necesita Docker y la CLI de Supabase)
```bash
supabase start                 # levanta Postgres, Auth y funciones en local
supabase db reset              # aplica las migraciones desde cero
supabase test db               # ejecuta las pruebas pgTAP (93 comprobaciones)
```
> **Estado de verificación:** estas migraciones y pruebas se han escrito y revisado estáticamente, pero **no se han podido ejecutar** en el entorno donde se generaron (sin PostgreSQL ni red). El primer `supabase db reset` y `supabase test db` son la verificación real. Si algo falla, pega aquí el mensaje de error: se corrige antes de pasar a la Fase 4.

## Proyecto en la nube
1. Crea el proyecto en supabase.com (región UE recomendada).
2. **Authentication → Providers → Email**: desactiva *Allow new users to sign up*. Mínimo de contraseña: 10.
3. **Authentication → URL Configuration**: *Site URL* y *Redirect URLs* = la URL de GitHub Pages (`https://TU_USUARIO.github.io/apistock/`). Es necesaria para recuperar contraseña.
4. Enlaza y publica:
   ```bash
   supabase link --project-ref TU_REF
   supabase db push
   supabase secrets set ALLOWED_ORIGIN=https://TU_USUARIO.github.io
   supabase functions deploy admin-create-user
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase en la función; **no los pongas en el repositorio ni en el frontend**.
5. En el frontend solo van la URL del proyecto y la clave `anon` (pública).

## Crear el primer administrador
El registro público está cerrado, así que el primer usuario se crea desde el panel:
1. **Authentication → Users → Add user**: tu correo y una contraseña de 10+ caracteres (marca *Auto confirm user*). El trigger crea su perfil y el catálogo inicial.
2. En el **SQL Editor** ejecuta, con tu correo:
   ```sql
   update public.profiles set is_admin = true
    where user_id = (select id from auth.users where email = 'tu@correo.com');
   ```
3. Desde la app (Configuración → Usuarios y acceso) ya puedes crear el resto de cuentas; la Edge Function comprueba `is_admin` en el servidor.

Ningún usuario puede concederse `is_admin` por sí mismo: no tiene permiso de escritura sobre `profiles`.

## Copias de seguridad
- Desde la app: Configuración → Copias de seguridad → Exportar (JSON con fecha y hora).
- Adicionalmente, en un proyecto de pago, activa las copias diarias de Supabase.

## Cambios de esquema
Nunca edites una migración ya publicada: crea una nueva (`supabase migration new nombre`). Si cambia el formato de la copia JSON, sube `schema_version` y añade el paso de migración (ver `docs/SYNC_PROTOCOL.md`).
