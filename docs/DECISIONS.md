# ApiStock · Registro de decisiones

Estado: **P** = propuesta pendiente de confirmar · **C** = confirmada por el usuario · **T** = decisión técnica tomada.

| ID | Decisión | Estado |
|---|---|---|
| D01 | El logotipo se usa solo como icono (PWA, instalación, favicon). El diseño interno es independiente. Originales conservados en `public/icons/`. | C |
| D02 | Granularidad del material agrupado: **categoría → tipo → sistema** (Langstroth / Layens). Un lote = tipo + sistema + ubicación. Sin variantes. | C |
| D03 | Se aceptan huecos en la numeración de códigos a cambio de unicidad offline. | C |
| D04 | El código se desarrolla aquí; el usuario lo ejecuta en local. No se puede verificar compilación ni tests desde este entorno. | C |
| D05 | Se añade la categoría inicial **Extracción y envasado** (extractor, desoperculadora, madurador…), separada de **Colmenas y cuerpos**. | C (contenido exacto en D17) |
| D06 | Usuarios nuevos: Edge Function con `service_role` en servidor. Sin registro público. | T |
| D07 | Códigos offline mediante buffer reservado por dispositivo; si se agota sin red, la alta se bloquea. | T |
| D08 | `code_registry` impide reutilizar un código alguna vez asignado, incluso al editarlo. | T |
| D09 | Dos mecanismos separados: cola de sincronización (técnica) y últimas 10 operaciones (deshacer). Sin historial permanente. | T |
| D10 | `data_epoch` por usuario para gestionar importaciones frente a dispositivos con cambios pendientes. | T |
| D11 | Un tipo agrupado admite lotes y unidades individualizadas; un tipo individualizado solo admite unidades. Total = lotes + unidades. | T |
| D12 | La modalidad de un tipo solo se puede cambiar si no tiene material. | T |
| D13 | Reglas de negocio solo en TypeScript; el servidor garantiza integridad, no duplica reglas. | T |
| D14 | La app es local-first desde la Fase 4; la Fase 6 completa red y conflictos. | T |
| D15 | `HashRouter` + PKCE para GitHub Pages y recuperación de contraseña. | T |
| D16 | Tailwind v4 (tokens en CSS) y fuentes autoalojadas para funcionar offline. | T |
| D17 | Catálogo inicial de tipos (abajo). Editable y eliminable. Se crea al dar de alta cada usuario (migración 0004). | C |
| D18 | Reglas de agrupación de resultados de compatibilidad (abajo). | C |
| D19 | Un tipo **sin sistema** puede existir (extractor, ahumador); un tipo **con sistema** lo exige en cada unidad y lote. | T |
| D20 | Al mover material agrupado desde una ubicación padre con lotes en varias sububicaciones, el usuario elige de qué lote descuenta. | T |
| D21 | **Cambia respecto a la Fase 1:** las RPC de escritura son `SECURITY DEFINER` (no `INVOKER`) y las tablas son de solo lectura para el cliente. Así la única vía de escritura es validada, ordenada e idempotente, y un cliente manipulado no puede saltarse las reglas con escrituras directas. Cada RPC deriva la identidad de `auth.uid()` y filtra siempre por usuario. | T |
| D22 | `server_seq` es un contador **por usuario** guardado en `profiles`: el bloqueo de esa fila serializa las escrituras del usuario y garantiza que el orden de secuencia coincide con el de commit (sin cambios perdidos al descargar por cursor). | T |
| D23 | Los lotes se identifican por clave natural (tipo, sistema, ubicación); los ids de lote son técnicos y el cliente adopta el del servidor. Lotes a cero se conservan (la UI los oculta). | T |
| D24 | Los códigos reservados se registran en `code_registry` a nombre del dispositivo: solo ese dispositivo puede asignarlos. Importar no reinicia contadores ni registro. | T |
| D25 | `tombstones.user_id` no tiene FK a `auth.users`: evita errores al borrar un usuario en cascada. La Edge Function limpia sus lápidas al borrarlo. Retención de lápidas: 90 días. | T |
| D26 | Unidades de un tipo por cantidad pueden coexistir con lotes (individualización). Un tipo individualizado nunca tiene lotes (trigger). | T |
| D27 | La importación acepta solo la versión de esquema actual; las copias antiguas las migra el cliente. Límite servidor 5 MiB. | T |
| D28 | La Edge Function de usuarios ofrece crear, listar, cambiar contraseña y eliminar. La recuperación de contraseña por correo la hace el propio usuario con Auth. | T |

## D17 · Catálogo inicial propuesto

Para que la primera apertura no sea una pantalla vacía. El usuario puede borrar, renombrar y ampliar todo.

| Categoría | Tipos | Gestión | Sistema |
|---|---|---|---|
| Colmenas y cuerpos | Fondo (atributo: sanitario) · Cámara de cría · Alza · Entretapa · Tapa · Colmena vacía | Unidades | Sí |
| Componentes | Excluidor de reina · Rejilla | Cantidad | Sí |
| Núcleos | Núcleo (atributos: nº de cuadros, material) | Unidades | Sí |
| Cuadros | Cuadro | Cantidad | Sí |
| Herramientas | Ahumador · Palanca · Cepillo | Cantidad | No |
| Accesorios | (vacía) | | |
| Alimentación y tratamientos | (vacía) | | |
| Extracción y envasado | Extractor · Desoperculadora · Madurador | Unidades | No |
| Otros | (vacía) | | |

Prefijos: Alza `A`, Tapa `T`, Entretapa `E`, Cámara de cría `C`, Fondo `F`, Colmena vacía `V`, Núcleo `N` + letra de sistema (`AL-01`, `AI-01`). Sin sistema: Extractor `EXT`, Desoperculadora `DES`, Madurador `MAD`.

## D18 · Orden de resultados de compatibilidad

Para cada candidato se evalúa la relación con **todos** los elementos de referencia. Primera regla que se cumpla:

1. Alguna relación **no compatible** → grupo 4, *No compatibles*.
2. Alguna relación **sin probar** → grupo 3, *Pendientes de comprobar* (contraído). Aquí cae también quien tenga relaciones «no óptimas» y alguna sin probar: aún no se conoce el conjunto completo.
3. Alguna relación **«encaja, no óptimo»** → grupo 2.
4. Todas **compatibles** → grupo 1.

Cada tarjeta indica qué referencias cumple, cuáles no y cuáles faltan, y desde las pendientes se puede lanzar la comprobación directamente.
