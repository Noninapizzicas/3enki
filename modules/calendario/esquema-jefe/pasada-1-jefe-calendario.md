# PASADA 1 — prisma de 5 huecos con lente JEFE · módulo `calendario`

> Sujeto: **la cara del ROL JEFE de la base del TIEMPO de producción/distribución**
> (no el módulo entero). Ley de agnosticismo: cero tecnología de sistema ambiente.
> El jefe es el DUEÑO de cuándo sale cada producto: agenda la PRODUCCIÓN/distribución
> por tiempo (días de salida + margen de antelación).
>
> Fuente (leída, no presumida): `modules/calendario/index.js` (reflejo-0.1.0,
> 206 líneas — on*Request L151-155 · _productoLeer L160 · _productosLeer L169 ·
> _productoActualizar L175 · _validar L184 · _margen L193) + `module.json` (v0.1.0,
> RAÍZ no pizzepos — "Base compartida del tiempo de Prisma (órgano agenda)":
> 5 ui_handlers: producto.leer · producto.actualizar · productos.leer · validar ·
> margen.leer).

## Hueco 1 — IDENTIDAD: ¿qué DECIDE el jefe aquí?

El jefe es el **dueño del calendario de producción/distribución de los productos**:
decide CUÁNDO sale cada producto y con cuánta antelación debe encargarse.

- **D1 — AGENDAR la producción de un producto** (`producto.actualizar`): declara
  los DÍAS DE SALIDA (`dias_salida`, array 1..7 ISO, 1=Lun..7=Dom) y el MARGEN DE
  ANTELACIÓN mínimo en horas (`margen_antelacion_h ≥ 0`). Es la decisión: qué
  producto se produce/cocina/distribuye en qué días y con cuánta premura debe
  encargarse.

Lo que el jefe decide es el FUTURO del tiempo de producción: días en que el
obrador produce + la ventana de encargo (margen). No decide qué se vende (POS)
ni si un pedido concreto es válido HOY (eso lo calcula `validar`, lectura/neutro).

## Hueco 2 — RESTRICCIONES: ¿de qué NO depende él?

- **La lista de productos candidatos NO es suya**: el jefe selecciona de un
  catálogo de productos de la carta (los trae `productos.carta_completa`/list —
  proyector, otro módulo). El calendario se cuelga de productos que YA existen.
- **Escritura single-writer**: `producto.actualizar` es la ÚNICA escritura del
  módulo. Los campos presentes se validan contra el esquema `calendario-v1`
  (dias_salida array 1..7, margen ≥ 0) y se persisten por merge en
  `calendario.json` del proyecto. El resto del sistema (motor de validación H2,
  encargos, cobro anticipado) BEBE sus valores por RPC (`validar`/`margen.leer`).
- **Los días son ISO 1..7** (1=Lun..7=Dom), según el validador real del index.js.
  No 0-based (0=Dom). La UI debe respetar este contrato.
- **No hay eliminación de calendario**: si un producto deja de producirse, se
  actualizan sus días (no existe delete).
- **Cero productos con calendario ≠ catálogo vacío**: `productos.leer` devuelve
  `{calendarios: {}}` si nadie ha agendado nada todavía.

## Hueco 3 — CONTRATO: ¿qué VER antes de decidir y qué SEÑAL confirma?

**Ver antes de decidir (lecturas):**
| Lectura | Payload | Da |
|---------|---------|-----|
| `productos.leer` | — (sin args) | `{ calendarios: { producto_id: {dias_salida, margen_antelacion_h} } }` — TODO el calendario del proyecto en una llamada |
| `producto.leer` | `{ producto_id }` | `{ producto_id, calendario: {dias_salida, margen_antelacion_h} }` o 404 |
| `margen.leer` | `{ producto_id }` | `{ producto_id, margen_antelacion_h, dias_salida }` — dictamen de antelación mínima |
| `validar` | `{ producto_id, fecha_deseada }` | `{ producto_id, fecha_deseada, dia_semana, valido, motivo, propuesta?: {fecha, dia} }` — confirma si una fecha de encargo cuadra y propone el día válido más cercano |
| `productos.carta_completa` (externo) | `{ project_id }` | lista de productos con `{ id, nombre, ... }` — ref-select del jefe |

**Señal que confirma (pareada):**
- `producto.actualizar` → **`calendario.producto.actualizado`** — publicado por
  el ConfigCustodio al persistir (config-custodio.js L119) con `{ project_id,
  calendario }`. 1 evento por actualización (1 producto). El dictamen de lo
  guardado también vuelve en la respuesta RPC (`{ calendario }`), pero la señal
  es la que re-lee la vista del jefe.

Lecturas puras (`producto.leer`, `productos.leer`, `margen.leer`, `validar`) NO
emiten señal propia — son alimentadoras.

## Hueco 4 — NO-OBJETIVOS: ¿qué caras NO son del jefe?

- **UTILIZACIÓN (fuera de este panel)**: en el momento del encargo/venta, el
  POS / portal de llamada / cobro anticipado consume `validar` y `margen.leer`
  para decidir si un pedido HOY es aceptable. Esa es la cara de utilización:
  se EJECUTA en la venta. El árbitro: `validar` y `margen.leer` son ambivalentes
  — los usa la utilización AHORA, pero SOLO leen (no deciden el futuro del
  calendario) → los coloco NEUTRO que alimentan tanto al jefe (dictamen sobre la
  agenda) como al POS (dictamen de encargo). El jefe no los ejecuta en la venta.
- **SIEMBRA de productos**: el catálogo de productos lo proyecta `productos`
  (carta), no el calendario. El jefe agenda productos ya existentes.
- **Neutras que ALIMENTAN la vista del jefe**: `productos.leer` (cinta de la
  agenda), `producto.leer` (ficha de uno), `validar` (dictamen de una fecha),
  `margen.leer` (pulso de antelación), `productos.carta_completa` (ref-select).

## Hueco 5 — PREGUNTAS_ABIERTAS — decisiones SUYAS pendientes [ABIERTO]

- [ABIERTO] ¿Qué productos entran al calendario? El jefe agenda los que YA están
  en la carta; el alta de producto en el calendario es decisión suya (no se
  declaran por defecto).
- [ABIERTO] ¿Criterio de días de salida por familia/producto? (todo el pan sale
  M/X/V, la bollería también, etc.) — nada en el código; lo decide el jefe.
- [ABIERTO] ¿Margen de antelación por defecto para un producto nuevo sin
  calendario? Hoy `validar`/`margen.leer` devuelven null/0 si no hay calendario
  (`cal ? cal.margen_antelacion_h ?? null : null`). Política por declarar.
- [ABIERTO] ¿Horario del día de salida? El módulo agenda por DÍA (ISO), no hay
  franja horaria de salida. Si se quiere "sale a las 8:00" es decisión/ampliación
  del dueño.

Todos quedan NOMBRADOS para el dueño — ni el módulo ni la UI los suplen.
