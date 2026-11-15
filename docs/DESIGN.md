# ApiStock · Diseño UX/UI (Fase 2)

Tokens implementados en `src/ui/tokens.css`. Solo modo claro, solo español, unidades métricas.

---

## 1. Concepto

ApiStock se usa de pie, en un almacén o junto a un apiario, a menudo con una mano ocupada y con poca cobertura. El diseño parte de tres ideas:

1. **El código es el protagonista.** Lo que se lee en una caja es `AL-17`, escrito con rotulador. Toda la app muestra los códigos como una **placa de código** (borde de tinta, fondo miel pálido, tipografía display): se reconoce al instante en cualquier lista.
2. **Tinta, papel y miel.** Fondo de papel ligeramente verdoso, texto en tinta de bosque, miel solo para la acción principal y para lo que requiere atención. Sin fondos decorativos de abejas ni panales.
3. **El estado nunca depende solo del color.** Todo estado lleva etiqueta de texto y, en las unidades, un medidor de seis pasos.

### Lo que se descarta a propósito
- Tarjetas idénticas para todo: las tarjetas de **categoría** son grandes y táctiles; las de **unidad** son filas compactas; las de **resultado de compatibilidad** llevan la información de cada referencia dentro.
- Sombras en las tarjetas: se separan con borde. La sombra queda para hojas y menús.
- Animaciones de entrada: solo se anima la respuesta a una acción del usuario (abrir una hoja, confirmar una operación, cambiar de estado).

---

## 2. Sistema visual

### Color
| Token | Valor | Uso |
|---|---|---|
| `paper` | `#F4F5F0` | Fondo de la app |
| `surface` | `#FFFFFF` | Tarjetas, hojas, campos |
| `ink` / `ink-soft` / `ink-mute` | `#17211C` / `#44504A` / `#5F6A64` | Texto (todos ≥ 4,5:1 sobre `paper`) |
| `honey-400` | `#F2B01E` | Relleno del botón principal, texto `ink` encima |
| `honey-700` | `#8A5A00` | Texto o icono de acento sobre claro |
| `pine-600/700` | `#357055` / `#2B5A43` | Éxito, «compatible» |
| `line` / `line-strong` | `#DEE1D8` / `#C3C8BB` | Bordes de tarjeta / de control |

**Estados de unidad** (etiqueta + medidor de 6 segmentos):

| Estado | Segmentos llenos | Color |
|---|---|---|
| Nuevo | 6 | Azul petróleo |
| Muy buen estado | 5 | Verde |
| Buen estado | 4 | Verde oliva |
| Usado pero funcional | 3 | Ámbar |
| Malo pero usable | 2 | Naranja |
| Mal estado / no utilizable | 1 | Rojo |

**Compatibilidad** (siempre icono + texto):

| Resultado | Icono | Color |
|---|---|---|
| Compatible | check | Pino |
| Encaja, pero no es óptimo | check con signo menos | Ámbar |
| No compatible | aspa | Rojo |
| Sin probar | círculo discontinuo | Gris, borde discontinuo |

**Sistemas:** pastilla con nombre y color propio (Langstroth azul, Layens violeta). Un sistema nuevo recibe un color de una paleta fija de 8.

### Tipografía
- **Bricolage Grotesque** (display): títulos, cifras y placas de código. Eje de anchura en 92 para un trazo algo condensado.
- **Instrument Sans** (texto): cuerpo, campos, tablas. Cifras tabulares (`.tnum`) en cantidades.
- Escala: 12 / 14 / **16** / 18 / 22 / 28 / 40. Los campos son siempre ≥ 16 px (iOS no amplía la pantalla al enfocarlos). Líneas de texto ≤ 70 caracteres.
- Frases en minúscula inicial de oración, sin versalitas ni etiquetas decorativas sobre los títulos.

### Forma
Radio según jerarquía: chips 8 · controles 12 · tarjetas 16 · mosaicos de categoría 22 · hojas 24 (solo esquinas superiores en móvil).

### Iconografía
- Lucide para acciones y navegación (trazo 1,75 px, redondeado).
- **Iconos propios** (mismo trazo) para piezas de colmena que Lucide no tiene: alza, cámara de cría, tapa, entretapa, fondo, cuadro, núcleo, extractor, ahumador. Se dibujan en la Fase 4.
- Selector de icono: rejilla de ~60 iconos con buscador por nombre. No se suben imágenes.

### Movimiento
Respuesta a acciones: hojas que suben 200 ms (`ease-snap`), el contador de una cantidad que cambia hace un pequeño salto, un movimiento confirmado muestra una marca que se dibuja. Todo se desactiva con `prefers-reduced-motion`.

### Accesibilidad
Objetivos táctiles ≥ 48 px. Foco visible de 3 px en miel. Contraste AA. Roles ARIA en hojas, diálogos y pestañas. Los diálogos atrapan el foco. Navegación completa por teclado en escritorio.

---

## 3. Navegación y estructura

Cinco apartados, siempre los mismos en móvil y en escritorio: **Inicio · Inventario · Operaciones · Compatibilidad · Configuración**.

### Móvil (< 1024 px)
```
┌─────────────────────────────┐
│ Inventario       🔍  ● Sincr│  cabecera: título · buscador · estado de sync
├─────────────────────────────┤
│                             │
│        contenido            │
│                             │
├─────────────────────────────┤
│ 🏠   📦    ⇄     ✓✓    ⚙   │  navegación inferior (5 destinos, 64 px)
└─────────────────────────────┘
```
- El buscador abre una pantalla completa con teclado, resultados al instante y el último buscado.
- El estado de sincronización está siempre visible en la cabecera (apartado 5.1).
- Los selectores (ubicación, tipo, unidades) se abren como **hojas inferiores** con buscador y zona de pulgar.

### Escritorio (≥ 1024 px)
```
┌────────┬────────────────────────────────────────────┐
│ ApiStock│ 🔍 Buscar código, tipo, ubicación…  Ctrl+K  ● Sincronizado │
│ Inicio │────────────────────────────────────────────│
│ Invent.│  contenido (máx. 1280 px)        │ panel   │
│ Operac.│                                  │ lateral │
│ Compat.│                                  │ (ficha) │
│ Config.│                                  │         │
└────────┴────────────────────────────────────────────┘
```
- Barra lateral de 232 px (colapsable a iconos).
- El buscador global es un campo fijo y también una paleta de comandos con `Ctrl/⌘ + K`.
- Las fichas se abren en **panel lateral** sin salir de la lista; las tablas permiten selección múltiple.
- Los selectores son menús desplegables con buscador, no hojas.

### Rutas (`HashRouter`)
```
#/                                   Inicio
#/inventario                         Categorías (global o por ubicación)
#/inventario/c/:categoria            Tipos de la categoría
#/inventario/t/:tipo                 Unidades y cantidades del tipo
#/unidad/:id                         Ficha de unidad
#/operaciones                        Centro de operaciones
#/operaciones/alta | mover | editar | baja
#/operaciones/recientes
#/compatibilidad                     Centro de compatibilidad
#/compatibilidad/buscar              Configurar y ver resultados
#/compatibilidad/comprobar           Comprobaciones múltiples
#/configuracion/…                    Secciones de configuración
#/acceso | #/recuperar               Sin sesión
```
La ubicación activa del inventario viaja como parámetro (`?u=<id>`) para que «atrás» la conserve.

---

## 4. Componentes base

| Componente | Comportamiento |
|---|---|
| **CodePlate** | Placa de código. Tamaño normal y grande (ficha). Toca para copiar en escritorio. |
| **StatusPill** | Etiqueta del estado + medidor de 6 segmentos. |
| **SystemPill** | Nombre del sistema con su color. Solo aparece si el tipo usa sistema. |
| **CompatBadge** | Icono + texto de uno de los cuatro resultados. |
| **CategoryTile** | Mosaico grande: icono, nombre, total. Rejilla de 2 columnas (móvil) / 3–4 (escritorio). |
| **TypeRow** | Fila de tipo: icono, nombre, total, desglose por sistema («12 Langstroth · 3 Layens»). |
| **UnitRow** | Placa de código, descripción, pastillas de sistema y estado, ubicación. Casilla de selección a la izquierda en modo selección. |
| **LocationPicker** | Árbol colapsable con buscador. Muestra la ruta completa («Almacén Eraul › Estantería 1 › Cajón 3»). Móvil: hoja. Escritorio: desplegable. Permite crear ubicación sin salir del selector. |
| **QuantityStepper** | − / cifra editable / +, botones de 48 px. Pulsación larga acelera. Límites visibles («disponibles: 100»). |
| **UnitPicker** | Lista de unidades disponibles en el origen con casillas, buscador por código, «Elegir las primeras N» y contador «3 de 3 elegidas». |
| **SyncPill** | Estado de sincronización (apartado 5.1). |
| **Sheet** | Hoja inferior (móvil) o panel (escritorio), con foco atrapado. |
| **ConfirmDialog** | Título que nombra la acción y el alcance («Dar de baja 3 alzas»), lista de lo afectado, botón destructivo con el mismo verbo. |
| **Toast** | Confirmación con acción **Deshacer** durante 8 s en operaciones reversibles. |
| **EmptyState** | Icono, una frase que dice qué falta y un botón con la acción. |
| **SelectionBar** | Barra flotante al seleccionar varias unidades: contador y acciones (Mover, Editar, Dar de baja). |

---

## 5. Pantallas

### 5.1. Estado de sincronización (transversal)
Pastilla en la cabecera, siempre visible. Al tocarla se abre una hoja con detalle.

| Situación | Pastilla |
|---|---|
| Todo enviado | ● Sincronizado |
| Enviando | ◐ Sincronizando… |
| Sin conexión, sin cambios | ○ Sin conexión |
| Sin conexión, con cambios | ○ Sin conexión · 4 pendientes |
| Error reintentable | ! Reintentando · 2 pendientes |
| Conflicto | ▲ 1 conflicto (color ámbar, requiere acción) |

La hoja muestra la lista de pendientes, el último envío correcto y los botones **Sincronizar ahora** y **Exportar pendientes**. Una franja discreta «Trabajando sin conexión» aparece bajo la cabecera.

### 5.2. Inicio
```
Buenos días                                 ● Sincronizado
┌──────────────────────────────────────┐
│ 312 unidades y cuadros en total      │  cifra grande + 1 línea
└──────────────────────────────────────┘
[ + Añadir ] [ ⇄ Mover ] [ − Dar de baja ] [ ✓✓ Compatibilidad ]   4 botones grandes
Material por categoría       (mosaicos compactos: icono · nombre · total)
Últimas operaciones          (5 filas: «Movidas 3 alzas · Almacén Eraul → Apiario»)  Ver todas
```
No hay resumen por ubicación (se consulta en Inventario). Las operaciones se abren en Operaciones → Recientes.

### 5.3. Inventario

**Selector de vista** en la parte superior: segmento `Todo el inventario | Por ubicación`.

- **Todo el inventario:** mosaicos de categoría con totales.
- **Por ubicación:** primero se elige ubicación (árbol); al entrar se ve la **misma estructura** filtrada, con una barra de ruta («Almacén Eraul › Estantería 1») que permite subir de nivel. Una ubicación padre incluye todas sus sububicaciones, y lo indica: «Incluye 3 sububicaciones».

**Categoría → tipos** (`TypeRow`): total y desglose por sistema; orden manual o alfabético (conmutador en la cabecera).

**Tipo → contenido.** Cabecera con total y filtros en chips (sistema, estado, ubicación). Para tipos individualizados, lista de `UnitRow` con buscador de código; para tipos agrupados, tarjetas de lote (sistema · ubicación · cantidad) y, debajo, las unidades individualizadas de ese tipo si existen.
- Móvil: toque en una fila abre la ficha; mantener pulsado activa la selección.
- Escritorio: tabla compacta con columnas ordenables (código, descripción, sistema, estado, ubicación), selección múltiple y panel lateral de ficha.
- Acciones de un lote: **Mover**, **Dar de baja**, **Individualizar unidades**.

**Individualizar unidades** (hoja):
```
Individualizar cuadros Langstroth · Almacén Eraul
Disponibles en el lote: 100
Cuántas:        [ − ]  1  [ + ]
Estado:         Usado pero funcional ▾
Ubicación:      Almacén Eraul (la del lote)
Descripción:    (opcional)
Resultado:      lote → 99 · se crea 1 ficha  AL-… (se verá el código al crear)
                                    [ Individualizar ]
```
Muestra siempre el resultado numérico antes de confirmar. No cambia la configuración del tipo.

**Ficha de unidad** (hoja en móvil, panel lateral en escritorio):
```
 [ AL-17 ]  placa grande          ⋮
 Alza verde
 Colmenas y cuerpos › Alza · [Langstroth] · [Buen estado ▮▮▮▮▯▯]
 Ubicación   Almacén Eraul › Estantería 1                [ Mover ]
 Atributos   Dimensiones exteriores…  (solo los del tipo)
 Observaciones
 Compatibilidad   3 compatibles · 1 no óptimo · 0 no compatibles    Ver todas
 ───────────────────────────────────────────
 [ Editar ]  [ Mover ]  [ Compatibilidad ]  [ Dar de baja ]
```
Sin historial de movimientos. Las relaciones de compatibilidad se listan agrupadas por resultado, con la observación y la placa de la otra unidad.

**Resultados del buscador global:** cada fila es un `UnitRow` completo (código, descripción, tipo, sistema, ubicación) agrupado en «Unidades», «Tipos» y «Ubicaciones»; tocar lleva a la ficha, al tipo o a la ubicación. El código se reconoce aunque se escriba sin guion ni mayúsculas (`al17` → `AL-17`).

### 5.4. Operaciones

**Centro:** cuatro botones grandes (Alta, Mover, Editar, Dar de baja) y debajo la lista de **Operaciones recientes** (máximo 10).

**Recientes:** cada fila resume la operación («Movidas 3 alzas, 2 tapas y 20 cuadros · Almacén → Apiario · hace 12 min»), con **Ver detalle**, **Editar** y **Deshacer**. Deshacer abre un resumen de lo que se restaurará; si algún elemento cambió después, lo indica y pregunta antes de continuar. Una operación deshecha desaparece de la lista.

**Alta múltiple** (un solo formulario de una pantalla):
```
Tipo           Alza ▾
Sistema        ( Langstroth )  ( Layens )         ← solo si el tipo lo usa
Cantidad       [ − ] 10 [ + ]    ← unidades individualizadas / «cantidad» si es agrupado
Estado         Nuevo ▾           ← solo individualizadas
Ubicación      Almacén Eraul ▾
Atributos del tipo (opcionales, plegados)
Vista previa:  AL-21 … AL-30       ← códigos que se crearán (indica si faltan códigos offline)
                                  [ Crear 10 alzas ]
```
Tras crear, la pantalla de éxito lista las unidades con acceso directo a cada ficha para añadir descripción.

**Movimiento múltiple** (flujo en 3 pasos con resumen persistente):

1. **Origen y destino.** Dos selectores de ubicación y un botón de intercambio. No pueden ser iguales.
2. **Líneas de material.** Botón «Añadir material»; cada línea es una tarjeta:
   - *Individualizado:* tipo (y sistema) → cantidad → **UnitPicker** con los códigos disponibles en el origen (con descripción). «Elegir las primeras N» rellena la selección, que se puede ajustar a mano. La línea queda en verde cuando las unidades elegidas = cantidad.
   - *Agrupado:* tipo (y sistema) → cantidad con límite = existencias del origen. Si el origen es una ubicación padre con lotes en varias sububicaciones, se elige de cuál se descuenta, mostrando las existencias de cada una.
   - Una operación puede mezclar ambos tipos de línea.
3. **Revisión.** Resumen de todas las líneas, origen → destino, totales. Botón **Mover N elementos**. Al terminar, toast «Movimiento registrado · Deshacer».

En escritorio los pasos 2 y 3 son dos columnas: líneas a la izquierda, resumen vivo a la derecha.

**Edición múltiple:** (1) elegir unidades (por tipo, ubicación o buscando códigos; en escritorio, desde la tabla de Inventario con la `SelectionBar`), (2) elegir los campos a cambiar (ubicación, estado, atributos del tipo comunes; solo se cambia lo marcado), (3) revisión con la lista de las unidades afectadas.

**Baja:** selecciona unidades concretas o cantidad de un lote. La confirmación lista lo que se eliminará y avisa de que también se borrarán sus compatibilidades. Tras confirmar: toast con **Deshacer**.

### 5.5. Compatibilidad

**Centro:** dos tarjetas grandes: **Buscar material compatible** y **Comprobar compatibilidad**.

#### Buscar material compatible
Una sola pantalla con tres bloques y un botón fijo abajo:

```
1  ¿Con qué debe encajar?   (referencias)
   [AL-03 ✕] [TL-08 ✕] [FL-02 ✕]            [ + Añadir ]   ← por código o desde un selector
2  ¿Qué quieres encontrar?
   Tipo  Alza ▾      Sistema  ( Cualquiera ) ( Langstroth ) ( Layens )
3  ¿Dónde buscar?
   Ubicaciones: [Almacén Eraul ✕] [Almacén 2 ✕]  [ + ]     (vacío = todas)
                                      [ Buscar compatibles ]
```
El sistema del candidato **no se filtra por defecto**, porque la compatibilidad no se deduce por sistema. Las referencias se excluyen de los candidatos. Para añadir referencias se puede escribir el código directamente.

**Resultados** (la configuración se resume en una cabecera fija editable; nada se pierde al cambiarla):

```
Con AL-03 · TL-08 · FL-02 · en Almacén Eraul, Almacén 2          [ Editar búsqueda ]
┌ Comprobar un código ───────────────────────────────┐
│ 🔍  AL-17                                           │   ← buscador integrado
└─────────────────────────────────────────────────────┘
  Resultado: AL-17 · Compatible con todos ✔ · Almacén Eraul › Est. 1
 ▾ Compatibles con todo (6)
     [AL-05] Alza verde      ✔ AL-03  ✔ TL-08  ✔ FL-02      Almacén Eraul
 ▾ Encajan, con alguna relación no óptima (2)
     [AL-09]                 ✔ AL-03  ~ TL-08 «sobresale 1 cm»  ✔ FL-02    Almacén 2
 ▸ Pendientes de comprobar (14)          ← contraído al inicio
 ▾ No compatibles (3)                    ← siempre al final
     [AL-12]                 ✔ AL-03  ✘ TL-08  — FL-02       Almacén Eraul
```
Cada tarjeta muestra, para **cada referencia**, el resultado con icono y texto corto, más la observación si existe y la ubicación actual. Las unidades con alguna relación incompatible nunca aparecen como compatibles (D18).

**Buscador de código integrado** (obligatorio, distinto del global): acepta `al17`, `AL-17` o `AL 17`; no reinicia la búsqueda ni cambia los resultados. Muestra un panel de resultado propio con:
- Compatible con todos / alguna relación no óptima / alguna incompatible, y el detalle por referencia.
- Relaciones sin probar, con botón **Probar ahora** (abre la comprobación solo para esas parejas).
- Ubicación actual.
- Si el código no existe: «No hay ninguna unidad con el código AL-170». Si es de otro tipo: «AL-17 es una alza, pero se está buscando una tapa».
Al borrar el campo, el panel desaparece y la lista vuelve a verse tal cual.

#### Comprobar compatibilidad (comprobaciones múltiples)
Se eligen **referencias** y **candidatos** (por código, por selector o «todas las del tipo en esta ubicación»). Se genera la cuadrícula de parejas.

- **Móvil:** una tarjeta por candidato, con una fila por referencia y tres botones grandes (✔ / ~ / ✘). Progreso arriba («4 de 9 pendientes»). Las relaciones ya registradas aparecen precargadas y en tono apagado, y **no se piden de nuevo**; un conmutador «Mostrar ya probadas» permite revisarlas. Botón «Todas compatibles» por candidato.
- **Escritorio:** matriz con referencias en columnas y candidatos en filas. Cada celda alterna con un clic: sin probar → compatible → encaja, no óptimo → no compatible; el botón derecho o `N` añade una observación breve. Las ya registradas se muestran apagadas.
- Cambiar una relación de **incompatible a compatible** pide una confirmación sencilla («AL-12 y TL-08 estaban como no compatibles. ¿Cambiar a compatible?»). Los demás cambios no piden confirmación.
- Un solo botón **Guardar N relaciones** aplica todo en una operación. La relación es simétrica: una única fila por pareja, y se muestra igual desde cualquiera de las dos unidades.

### 5.6. Configuración
Lista de secciones: Categorías · Tipos · Sistemas · Ubicaciones · Códigos (prefijos) · Iconos y orden · Usuarios y acceso · Copias de seguridad · Cuenta.

- **Categorías y tipos:** listas con asa para ordenar, conmutador «Orden alfabético», selector de icono. Un tipo se configura en una hoja: nombre, icono, categoría, modalidad (**Unidades individualizadas** / **Material por cantidad**), si usa sistema, prefijo, atributos adicionales (nombre y tipo de dato, opcionales). La modalidad queda bloqueada si hay material (D12).
- **Eliminar** una categoría o tipo con material: bloqueado con mensaje «Tiene 15 alzas. Muévelas o dáles de baja antes» y enlace a ese contenido. Nunca se borra en cascada.
- **Ubicaciones:** árbol editable (arrastrar para reordenar o mover, toque para renombrar, «+» para añadir hija). Eliminar solo si está vacía.
- **Prefijos:** tabla tipo × sistema con vista previa del siguiente código. Se avisa de que cambiar un prefijo no modifica los códigos ya asignados.
- **Usuarios y acceso** (solo administrador): lista de cuentas, crear usuario (correo y contraseña temporal), restablecer contraseña. Los usuarios sin permisos ven solo «Cuenta»: cambiar contraseña y cerrar sesión.
- **Copias de seguridad:** exportar (descarga inmediata con fecha y hora en el nombre) e importar (flujo de 5 pasos, apartado 5.7).
- **Cerrar sesión con cambios pendientes:** aviso con la cuenta de pendientes y opciones «Exportar pendientes», «Sincronizar ahora» o «Cerrar sesión igualmente».

### 5.7. Importación
Seleccionar archivo → comprobaciones automáticas visibles (tamaño, estructura, firma `app_signature`, referencias) → **resumen** («12 tipos · 148 unidades · 6 lotes · 34 compatibilidades · versión de esquema 1») → advertencia en rojo «Esto sustituirá todo tu inventario actual» → confirmación escribiendo la palabra `SUSTITUIR` → barra de progreso → resultado. Los errores de validación indican qué fila o referencia falla.

### 5.8. Acceso y casos especiales
- **Inicio de sesión:** correo, contraseña, «He olvidado mi contraseña». Sin enlace de registro. El logotipo aparece **solo** como icono de la app, no en esta pantalla.
- **Primera carga:** pantalla de progreso «Descargando tu inventario» (requiere conexión una vez).
- **Conflicto de sincronización:** hoja a pantalla completa con dos columnas **Versión guardada** / **Tu versión** (campos distintos resaltados), botones «Mantener la guardada» y «Usar la mía», y enlace «Exportar mis cambios». Solo bloquea las operaciones dependientes, no el resto de la app.
- **Códigos agotados sin conexión:** al crear unidades, aviso «Sin conexión: puedes crear 6 alzas Langstroth más hasta volver a conectar».
- **Instalación:** una vez, tarjeta discreta en Inicio «Instala ApiStock para usarla sin conexión» (en iOS, con instrucciones de Compartir → Añadir a pantalla de inicio).
- **Actualización de la app:** aviso «Hay una versión nueva» con botón **Actualizar**; nunca recarga sola con cambios sin guardar.

---

## 6. Redacción de la interfaz

- Verbos claros y el mismo nombre durante todo el flujo: el botón **Dar de baja** produce un mensaje «Alzas dadas de baja».
- Errores: dicen qué ocurrió y cómo arreglarlo, sin disculpas: «No se puede mover: el origen y el destino son iguales».
- Estados vacíos: invitan a actuar. Inventario vacío: «Aún no hay material. Añade tus primeras alzas» + botón.
- Términos: *unidad* (individualizada), *cantidad* o *lote* (agrupado), *ubicación*, *sistema*.

---

## 7. Criterios de aceptación de la Fase 2

- Los cinco apartados y todas las funciones de la especificación tienen pantalla definida en móvil y escritorio.
- Alta múltiple, movimiento múltiple, individualización, comprobación múltiple y buscador de código integrado tienen flujo completo, incluidos casos límite (origen padre con varios lotes, códigos agotados, relaciones ya probadas).
- Ningún estado se comunica solo con color.
- Tokens implementados y listos para usar en la Fase 4.
