# ApiStock · Protocolo cliente ↔ servidor

Contrato de las RPC de Supabase. Es lo que implementará el motor de sincronización (Fase 6) y lo que cubren los tests `supabase/tests/database/`.

## Principios
- El cliente **lee** tablas (solo SELECT) y **escribe** únicamente mediante RPC.
- La identidad sale siempre del token (`auth.uid()`); ningún parámetro lleva `user_id`.
- Los ids de fila los genera el cliente (UUID v4). Los códigos legibles los reserva el servidor.
- Los resultados de negocio se devuelven como JSON con `status`; los errores de red/permisos son errores HTTP normales.

## 1. `apply_batch(p_op)` · aplicar una operación

```jsonc
{
  "op_id": "uuid",            // idempotencia: reenviar la misma op nunca duplica
  "device_id": "texto ≤ 64",
  "epoch": 1,                 // data_epoch conocido por el cliente
  "mutations": [ /* 1..500, se aplican en orden */ ],
  "recent": {                 // opcional: añade la op a «operaciones recientes» (máx. 10)
    "kind": "move", "summary": "Movidas 3 alzas…", "inverse": { /* instantánea para deshacer */ }
  }
}
```

### Mutaciones
| `m` | Campos | Notas |
|---|---|---|
| `insert` | `t`, `row` | Tablas: `categories`, `systems`, `locations`, `item_types`, `units`. `row.id` obligatorio. Campos no permitidos → `invalid_field` |
| `update` | `t`, `id`, `base_version`, `set` | `base_version` obligatorio. El tipo (`type_id`) de una unidad es inmutable |
| `delete` | `t`, `id`, `base_version` | Tablas anteriores + `compatibilities`. Si ya no existe: éxito silencioso |
| `compat_set` | `unit_a`, `unit_b`, `result`, `note?`, `id?`, `base_version?` | Orden de la pareja indiferente. `result`: `compatible` · `fits` · `incompatible`. Idéntico a lo existente = sin efecto |
| `lot_delta` | `type_id`, `system_id?`, `location_id`, `delta`, `lot_id?` | Suma/resta cantidad. Crea el lote si no existe. Total negativo → `insufficient_stock` |
| `drop_recent` | `id` | Elimina una operación reciente (al deshacerla) |

### Respuesta
| `status` | Significado | Qué hace el cliente |
|---|---|---|
| `applied` | Aplicada (`server_seq`, `epoch`). Si `duplicate: true`, ya lo estaba | Marca la op como enviada y ejecuta `pull_changes` |
| `conflict` | `reason` = `version_mismatch` \| `row_missing`; `detail.server_row` = versión del servidor; `mutation_index` | Op en estado *conflicto*: mostrar ambas versiones (apartado 5.8 de DESIGN.md) |
| `rejected` | Regla de negocio o validación: `reason`, `sqlstate`, `detail`, `constraint` | No reintentar igual. Mostrar el motivo. Cola bloqueada hasta que el usuario decida |
| `epoch_mismatch` | Se importó una copia desde otro dispositivo | Exportar pendientes y resincronizar por completo |

Una op **nunca se aplica a medias**: ante `conflict` o `rejected` se deshace entera.

### Motivos de rechazo (`reason`)
`insufficient_stock` · `code_taken` · `system_required` · `system_not_allowed` · `lots_only_for_bulk` · `type_has_stock` · `category_has_stock` · `system_has_stock` · `location_has_stock` · `location_has_children` · `location_cycle` · `location_too_deep` · `type_in_use` · `invalid_field` · `invalid_table` · `invalid_row` · `invalid_set` · `invalid_delta` · `invalid_result` · `missing_base_version` · `compat_same_unit` · `unknown_mutation` · `op_too_large` · `invalid_mutations` · `missing_op_id` · `missing_device_id`. Los fallos de constraints (`23xxx`) incluyen `constraint` y `sqlstate`.

### Cómo se expresa cada operación de usuario
| Acción | Mutaciones |
|---|---|
| Alta múltiple (unidades) | N × `insert units` (códigos de un bloque reservado) |
| Alta de material agrupado | `lot_delta +n` |
| Mover unidades | N × `update units {location_id}` |
| Mover cantidad | `lot_delta -n` (origen) + `lot_delta +n` (destino) |
| Individualizar | `lot_delta -k` + k × `insert units` |
| Baja de unidades | N × `delete units` (las compatibilidades caen en cascada) |
| Baja de cantidad | `lot_delta -n` |
| Deshacer | Mutaciones inversas con las `base_version` posteriores + `drop_recent`. Si algo cambió después → `conflict` → avisar |

Los lotes se identifican por **clave natural** (tipo, sistema, ubicación). Si dos dispositivos crean el mismo lote, el servidor los fusiona; el cliente reemplaza el id local por el que le llega en `pull_changes`.

## 2. `reserve_codes(p_device_id, p_requests)`
```jsonc
// p_requests: un elemento por prefijo, count 1..200, máx. 500 en total
[{ "prefix": "AL", "count": 20 }]
// → { "status":"ok", "codes": { "AL": ["AL-21","AL-22", …] } }
```
- Los códigos son únicos por usuario y quedan reservados para ese `device_id`: solo ese dispositivo puede asignarlos a una unidad. Los no usados quedan como huecos (D03).
- Se saltan códigos ya asignados manualmente.
- Formato: `PREFIJO-NN` (mínimo 2 dígitos). El prefijo es letra de tipo + letra de sistema (`AL`) o el prefijo del tipo.
- Política de búfer del cliente: reservar 20 por prefijo activo; rellenar al bajar de 8.

## 3. `pull_changes(p_cursor, p_limit)`
```jsonc
// → { "status":"ok", "epoch":1, "server_seq":812, "next_cursor":790, "has_more":true,
//     "changes":[ {"seq":771,"t":"units","r":{…fila…}}, {"seq":772,"t":"tombstones","r":{"table":"units","id":"…"}} ] }
```
- `cursor = 0` → descarga completa (sin lápidas). Repetir con `next_cursor` mientras `has_more`.
- `server_seq` de cada fila es único y ordena los cambios; aplicarlos en ese orden.
- `status: "full_resync_required"` si el cursor es anterior a la retención de lápidas (90 días) o a una importación: borrar la copia local de datos sincronizados y volver a `cursor = 0` (tras exportar pendientes si los hay).
- Tablas incluidas: `categories`, `systems`, `locations`, `item_types`, `units`, `stock_lots`, `compatibilities`, `recent_operations`.
- La época (`epoch`) distinta a la local implica el mismo procedimiento.

## 4. `export_backup()` / `import_backup(p_payload)`
```jsonc
{
  "app_signature": "apistock-backup",
  "schema_version": 1,
  "exported_at": "2026-…Z",
  "data": {
    "categories": [], "systems": [], "locations": [], "item_types": [],
    "units": [], "stock_lots": [], "compatibilities": [],
    "code_counters": [ { "prefix": "AL", "next_value": 21 } ]   // opcional
  }
}
```
- Las filas no llevan `user_id`, `version`, `updated_at` ni `server_seq`; sí conservan sus `id`.
- **Importar sustituye todo**, atómicamente. Estados: `imported` (`epoch` nueva, `counts`) o `rejected` (`reason`: `invalid_signature`, `import_too_large`, `unsupported_schema_version`, `invalid_structure`, `too_many_rows`, o error de constraint, p. ej. `23503` = referencia rota).
- Los contadores y el registro de códigos **no retroceden**: tras importar no se reutiliza ningún código ya emitido.
- Límite de tamaño: 5 MiB en servidor (`private.max_import_bytes()`); el cliente aplicará el suyo desde `src/config`.
- **Versiones:** el servidor acepta la versión actual. Para copias antiguas, el cliente las migra a la actual antes de enviarlas (cadena de migraciones `vN → vN+1` en `src/backup/migrations`), y `private.migrate_backup` queda como punto de ampliación en servidor.
- **Recuperar un JSON antiguo a mano:** basta con añadirle `"app_signature": "apistock-backup"` y `"schema_version": 1`.

## 5. Garantías que cubren los tests
Idempotencia · atomicidad · conflicto de versión con ambas versiones · cantidades por delta sin negativos · unicidad y no reutilización de códigos · simetría de compatibilidad · cascada sin huérfanos · lápidas · paginación · importación atómica y sustitutiva · aislamiento entre usuarios y permisos.
