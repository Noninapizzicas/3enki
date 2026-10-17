# ESQUEMA — cara del JEFE del módulo `ingredientes` (pizzepos v5.0.0)

> Árbol maestro consolidado (pasadas 1-3). Alimenta al agente de UI que escribe
> el panel. Ley de agnosticismo: cero tecnología de sistema ambiente. El análisis
> es de la CARA DEL JEFE — la utilización (POS/motor-opciones) quedó fuera.

## 1. Quién es el jefe y qué decide

Dueño del catálogo de ingredientes y de SUS PRECIOS. Decide:
- **D1** corregir fichas (nombre, familia, alérgenos) — `update`
- **D2** retar precios cuando suben costes: suelto o en lote — `update` / `update_precios`
- **D3** declarar alérgenos (seguridad alimentaria) — `update`

Lo que NO decide: sembrar el catálogo (llega de carta/producto), retirar
ingredientes (no hay delete), ni consumirlos en la venta (motor-opciones).

## 2. Invariantes (restricciones honestas)

- INV1 — **precio_extra es FUENTE ÚNICA**: los extras de variaciones sin precio
  caen aquí; el motor-opciones lee este valor al vender. Editar aquí = regar la venta.
- INV2 — **moneda = EUROS float (2 dec)**: el motor persiste € y redondea
  (Math.round(x*100)/100). La UI edita € → envía €. Cero céntimos (R6 resuelto:
  no hay conversión; se anota).
- INV3 — **update_precios = cifra o % para un ALCANCE** (`id` | `tipo` | `grupo`
  | todo), NO `[{id, precio}...]`. % = COMPUESTO sobre el vigente de cada uno.
- INV4 — **N señales por lote**: una `ingrediente.actualizado` POR ingrediente
  afectado (publica dentro del for). La señal no dice "lote": dice fila.
- INV5 — la ficha completa viene EN `list` (precio_extra, es_alergeno,
  alergenos[], grupos[], tipo, disponible) — no get por tarjeta.
- INV6 — `grupos` es multi-pertenencia (array); un ingrediente puede figurar
  en varios grupos sin ser duplicado.
- INV7 — el catálogo lo siembran eventos externos (`carta.actualizada`,
  `producto.creado`) → puede late sin que el jefe toque nada.

## 3. Señales pareadas (verificadas en index.js)

| Declaración | Señal de confirmación | Granularidad |
|---|---|---|
| `update` | `ingrediente.actualizado` con diff `{anterior, nuevo}` por campo | 1 evento |
| `update_precios` | `ingrediente.actualizado` con diff de `precio_extra` | **N eventos (1 por ingrediente)** |
| sincronía externa | `ingrediente.creado` / `carta.actualizada` | re-puebla |

## 4. Composición de la vista del jefe

```
1. SELECCIONAR  ref-select grupo (derivado de list) + búsqueda local + alcance
2. INFORMARSE   cinta-estado (total · grupos · con precio · alérgenos)
                tarjetas-ficha (nombre, grupos, precio €, alérgenos)
3. DECLARAR     precio inline-gesture (H1) · ficha editor-bloque (H2)
                LOTE editor tabla (H3) con dictamen de la respuesta
```

+ principios que trascienden: frecuencia→jerarquía (inline lo diario), la
señal manda (debounce absorbe el tándem N×1 del lote), el informe distingue
origen (dictamen `actualizados[]{nombre, anterior, nuevo}` = lo que el jefe
declaró; cinta = lo que el sistema derivó).

## 5. Formas UI asignadas

| Hoja | Forma | RPC | Señal |
|---|---|---|---|
| H1 precio de un ingrediente | inline-gesture | `update {id, precio_extra}` | ingrediente.actualizado |
| H2 ficha completa | editor-bloque | `update {id, nombre?, familia?, es_alergeno?, alergenos?}` | ingrediente.actualizado |
| H3 lote de precios | editor de LOTE (tabla) | `update_precios {grupo?/todo, precio_extra | porcentaje}` | N× ingrediente.actualizado |
| H4 selección/alcance | ref-select | — (filtra/list) | — |
| H5 cinta de estado | cinta-estado | `list` + `health` | ingrediente.creado |
| H6 lista/grupo | tarjetas-ficha | `list {grupo?}` | — |
| H7 pulso alérgenos | cinta-estado secundaria | `alergenos` | — |

## 6. Huecos [ABIERTO] (decisiones del dueño — nombrados, no suplidos)

- [ABIERTO] política de alza: precio fijo vs % (el módulo soporta ambas).
- [ABIERTO] qué grupo se encarece primero (margen por grupo).
- [ABIERTO] umbral de "precio razonable" por tipo.
- [ABIERTO] cuándo etiquetar como alérgeno un ingrediente que llega sin etiquetar.

## 7. Fuera del árbol del jefe

Consumo al elegir producto (utilización → POS/motor-opciones) · siembra del
catálogo (carta-manager/menu-generator) · ningún flujo de venta.

## 8. Nota para el panel (consumo de precios)

El informe deseable "consumido por N productos" NO viene en el shape real:
`list`/`get` no exponen qué productos usan el ingrediente, y `get_precio` solo
trae `{ingrediente_id, precio_extra, disponible}`. La UI NO lo inventa: muestra
el valor como fuente única ("precio que consume el motor de extras") sin cifra
de consumo. Queda como mejora de módulo, no de panel.