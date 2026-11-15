# ApiStock · Arquitectura

Documento vivo. Última revisión: Fase 3. Las decisiones y su motivo están en `DECISIONS.md`.

## 1. Stack

| Capa | Elección | Motivo |
|---|---|---|
| UI | React 18 + TypeScript + Vite | Pedido en la especificación |
| Estilos | Tailwind CSS v4 (tokens en `src/ui/tokens.css`) | Tokens como CSS nativo, sin `tailwind.config` |
| Router | `react-router` con `HashRouter` | GitHub Pages no admite rutas de SPA |
| Datos locales | IndexedDB con Dexie (consultas reactivas) | Offline real; la UI lee siempre de local |
| Validación | Zod | Mismo esquema para formularios, importación y cola |
| PWA | `vite-plugin-pwa` (Workbox) | Precaché de la app y actualización controlada |
| Backend | Supabase (Auth + PostgreSQL + RLS + 1 Edge Function) | Pedido en la especificación |
| Fuentes | `@fontsource-variable` autoalojadas | Funcionan sin conexión |
| Iconos | Lucide (subconjunto) + iconos propios de piezas de colmena | Catálogo integrado y elegible por el usuario |
| Pruebas | Vitest (dominio), pgTAP (RLS y RPC), Playwright (offline) | |

## 2. Principio rector: local-first

La interfaz **nunca** lee de Supabase. Cada acción:

1. Se valida en `domain/` (funciones puras, sin I/O).
2. Se aplica a IndexedDB y se anota en la cola `outbox` en **una sola transacción local**.
3. El motor de sincronización envía la cola a Supabase y descarga los cambios ajenos.

Las reglas de negocio viven solo en TypeScript. El servidor garantiza integridad (constraints, claves foráneas compuestas, RLS, idempotencia) pero no reimplementa reglas.

## 3. Estructura

```
src/
  app/            rutas, layout, proveedores, guardas de sesión
  features/       home, inventory, operations, compatibility, settings, auth
  domain/         movimientos, individualizar, códigos, compatibilidad, deshacer (puro)
  data/           esquema Dexie, repositorios, outbox
  sync/           push/pull, conflictos, reserva de códigos, estado de red
  backup/         exportar, importar, migraciones de esquema
  ui/             tokens.css, componentes base, iconos
supabase/
  migrations/     esquema, RLS, RPC
  functions/admin-create-user/
  tests/          pgTAP
docs/             ARCHITECTURE.md, DECISIONS.md, DESIGN.md, DEPLOY.md
public/           manifest, iconos generados desde el logotipo
```

## 4. Modelo de datos

Todas las tablas incluyen `user_id`, `id uuid` (generado en cliente), `version int`, `updated_at` y `server_seq`. Las claves foráneas son **compuestas** `(user_id, id)`: aunque el cliente enviara un id ajeno, la base de datos lo rechaza.

| Tabla | Contenido clave |
|---|---|
| `profiles` | `is_admin`, `data_epoch` |
| `categories` | nombre, icono, orden |
| `systems` | nombre, letra de código (Langstroth = `L`, Layens = `I`), orden |
| `item_types` | `category_id`, `mode` (`unit`/`bulk`), `code_prefix`, `uses_system`, `attribute_defs jsonb`, icono, orden |
| `locations` | `parent_id` (jerarquía libre), nombre, orden. Ciclos prohibidos por trigger |
| `units` | `type_id`, `system_id?`, `code` (único por usuario), `description`, `status`, `location_id`, `attrs jsonb`, `notes` |
| `stock_lots` | `type_id`, `system_id?`, `location_id`, `quantity >= 0`. **Único por (tipo, sistema, ubicación)** con `NULLS NOT DISTINCT` |
| `compatibilities` | `unit_a`, `unit_b`, `result`, `note`. `CHECK (unit_a < unit_b)` y `UNIQUE (unit_a, unit_b)`: una fila por pareja, imposible la contradicción. `ON DELETE CASCADE` por ambos lados |
| `code_counters` · `code_registry` · `code_reservations` | Ver apartado 6 |
| `recent_operations` | Últimas 10, con `inverse jsonb` |
| `applied_ops` · `tombstones` | Idempotencia y borrados para sincronización incremental |

**Granularidad del material agrupado:** categoría → tipo → sistema. Un lote es la cantidad de un tipo y sistema en una ubicación. No hay variantes: si el usuario quiere separar «cuadro de madera» de «cuadro de plástico», crea dos tipos. Los atributos del tipo solo se aplican a unidades individualizadas.

## 5. Offline y sincronización

- **Operación** = lote atómico de mutaciones de fila (con `base_version`) más **deltas de cantidad** para lotes. Una baja de 5 cuadros es `-5`, no «poner 95»: dos dispositivos que descuentan a la vez no chocan; solo se rechaza si el total quedaría negativo.
- **Envío:** RPC `apply_batch(op_id, device_id, epoch, mutations)`, transaccional e idempotente por `op_id`.
- **Descarga:** por cursor `server_seq` con tombstones; si se superó su retención, resincronización completa.
- **Conflictos:** `base_version` distinta → operación en estado `conflicto`. Se muestran ambas versiones. «Mantener existente» descarta la local; «Usar la nueva» reenvía sobre la versión actual. Las operaciones dependientes se bloquean hasta resolver. Los pendientes se pueden exportar a JSON.
- **Deshacer** = operación inversa generada desde la instantánea. Si las filas cambiaron después, se avisa en lugar de sobrescribir.
- **Disparadores:** evento `online`, `visibilitychange`, arranque y reintento con espera creciente. Sin Background Sync (no existe en iOS).
- **Persistencia:** `navigator.storage.persist()` y aviso para instalar la PWA (Safari purga datos de webs no instaladas).
- **Importación y otros dispositivos:** `data_epoch` aumenta al importar; un dispositivo con otra época exporta sus pendientes y resincroniza.

## 6. Códigos

Prefijo = letra del tipo + letra del sistema (`AL`, `AI`); para tipos sin sistema, el prefijo del tipo (hasta 3 letras). Configurable y único por combinación. Contador monotónico por prefijo.

- **Con conexión:** el servidor asigna los N códigos siguientes.
- **Sin conexión:** buffer reservado por dispositivo (20 por prefijo activo; se rellena al bajar de 8). Si se agota sin red, la alta se bloquea con un mensaje claro: no existen códigos provisionales.
- **Huecos aceptados:** los números reservados y no usados quedan sin asignar.
- **Doble protección:** `UNIQUE (user_id, code)` y `code_registry` (todo código asignado alguna vez; nunca se borra). Editar un código a uno ya registrado se rechaza.

## 7. Seguridad

- RLS en todas las tablas. El cliente solo tiene políticas y privilegios de **SELECT** (`user_id = auth.uid()`); no existe ninguna política de escritura.
- Toda escritura pasa por RPC `SECURITY DEFINER` con `search_path` fijo, identidad desde `auth.uid()` y `EXECUTE` solo para `authenticated` (D21). Las lecturas (`pull_changes`) son `SECURITY INVOKER` y por tanto sujetas a RLS.
- Funciones internas en el esquema `private`, no accesible desde la API.
- Únicos puntos privilegiados: Edge Function `admin-create-user` (usa `service_role` en servidor y comprueba `is_admin`) y la importación (RPC transaccional con límite de tamaño).
- Registro público desactivado en Auth. Solo claves `anon` en el cliente.
- Recuperación de contraseña con flujo PKCE; URL de redirección registrada en Supabase.
- Los tests de permisos son obligatorios: toda la protección descansa en RLS.
