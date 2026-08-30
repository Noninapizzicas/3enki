# Pasada 2 — Formas UI y señales, hoja a hoja (19 reflejos de carta-manager v2.8.0)

Contrato real: `modules/_shared/modulo-hibrido-reflejo.js` (`_atender`) + el
`manifest` del reflejo. Cada fila dice QUÉ op es, QUIÉN la maneja (rol árbitro),
QUÉ FORMA de UI exige y QUÉ SEÑAL cierra el círculo.

Leyenda de formas: **cinta-estado** (agregados vivos arriba) · **ref-select**
(elegir de una lista real, no teclear) · **editor-bloque** (ficha con campos
agrupados) · **confirmador-nombrado** (diálogo que dice EXACTAMENTE qué va a pasar)
· **lista-acciones** (filas con gesto por fila) · **dictamen-bloque** (resultado
verdadero/falso con errores enumerados) · **lista-desc** (historial ordenado recientes
primero).

Arbitro aplicado: `futuro→jefe | ahora→utilizacion | solo-lee→neutro`.

## JEFE — 12 (escriben el futuro del catálogo; TODAS publican señal)

| # | Op | RPC request → response | Señal pareada | Forma UI |
|---|---|---|---|---|
| 1 | save | `carta.save.request → .response` | `carta.actualizada` | editor-bloque (alta/edición de carta: nombre, meta) |
| 2 | add_product | `carta.add_product.request → .response` | `carta.editada` + version++ | editor-bloque {nombre, precio €, categoria_id(ref-select), ingredientes_base?} |
| 3 | remove_product | `carta.remove_product.request → .response` | `carta.editada` + version++ | confirmador-nombrado por fila (lista-acciones) |
| 4 | update_product | `carta.update_product.request → .response` | `carta.editada` + version++ | editor-bloque por producto (campos: nombre/precio/categoria_id/descripcion/etiquetas/alergenos/disponible/tipo/emoji/estaciones/ingredientes_base/dietas/variaciones) |
| 5 | update_products | `carta.update_products.request → .response` | `carta.editada` + version++ | lista-acciones editorial (lote; cada producto con sus campos) |
| 6 | add_category | `carta.add_category.request → .response` | `carta.editada` + version++ | editor-bloque corto {nombre/categoria} |
| 7 | update_prices | `carta.update_prices.request → .response` | `carta.editada` + version++ | editor-bloque-tabla (precio € por fila) |
| 8 | update_extras | `carta.update_extras.request → .response` | `carta.editada` + version++ | editor-bloque (extras por producto) |
| 9 | clonar | `carta.clonar.request → .response` | `carta.actualizada` (201, id `carta_<slug>`) | confirmador-nombrado + input (default `<nombre> (copia)`) |
| 10 | restore | `carta.restore.request → .response` | `carta.actualizada` | confirmador-nombrado desde lista-desc de versiones (acepta path; guarda basename) |
| 11 | activar | `carta.activar.request → .response` | `carta.actualizada` | confirmador-nombrado OBLIGATORIO: "activa AHORA '$nombre' — degrada la activa y cambia el catálogo vivo" |
| 12 | delete | `carta.delete.request → .response` | `carta.borrada` (soft: estado→archivada) | confirmador-nombrado "archiva '$nombre'" |

Notas del bloque jefe:

- `add_product` exige `producto{nombre, precio:number>=0 EUROS, categoria_id}`.
  El id lo calcula el custodio: `slug(categoria)_slug(nombre)` — la UI no lo
  inventa. Errores nombrados: **409 ALREADY_EXISTS** → "ya existe (id
  determinista)" · **412 PRECONDITION_FAILED** → "crea antes la categoría".
- `activar` degrada LAS DEMÁS cartas en_servicio automáticamente (motivo
  'activar'): una sola transición cambia el catálogo vivo entero.
- `delete` es SOFT: la carta pasa a archivada (no desaparece).
- `restore` acepta la ruta del snapshot y reduce al basename — el UI puede pasar
  el path tal cual lo devolvió `versions`.

## CONSULTA — 6 (leen el ahora; SIN señal: no publican nada)

| # | Op | RPC request → response | Devuelve | Forma UI |
|---|---|---|---|---|
| 13 | get | `carta.get.request → .response` | carta completa `{meta:{nombre,...}, categorias, productos,...}` | ref-select + detalle |
| 14 | list | `carta.list.request → .response` | catálogo de cartas + estado de cada una | cinta-estado + ref-select por estado |
| 15 | search | `carta.search.request → .response` | resultados filtrados | buscador |
| 16 | stats | `carta.stats.request → .response` | agregados del catálogo | cinta-estado |
| 17 | versions | `carta.versions.request → .response` | `{timestamp, filename}[]` desc | lista-desc |
| 18 | validar | `carta.validar.request → .response` | `{valid, errors[], productos}` | dictamen-bloque |

## VALIDAR — el FRENO (1)

| # | Op | Función |
|---|---|---|
| 19 | validar (como freño) | `_validar` es un FRENO PURO: dictamen {valid, errors[], productos} que la UI del jefe ejecuta ANTES de `activar` y — si `!valid` — BLOQUEA el botón de activar. No muta, no publica señal: solo dictamina. En el árbitro cuenta dentro de consulta (neutro-freno). |

## Pareo señal → re-list (regla R3 del esquema-jefe)

| Señal | La dispara | Reacción de la UI jefe |
|---|---|---|
| `carta.actualizada` | save · clonar · restore · activar | re-list del catálogo (debounce 60ms) |
| `carta.editada` | add/remove/update_product(s) · add_category · update_prices · update_extras | re-list + re-detalle de la carta abierta |
| `carta.borrada` | delete (soft → archivada) | re-list |
| `carta.creada` | alta externa de carta | re-list |

Las N señales en tándem se ABSORBEN con debounce 60ms y UNA sola re-lectura RPC.
Nunca recarga: siempre re-list (el estado solo se escribe desde lecturas, R2).