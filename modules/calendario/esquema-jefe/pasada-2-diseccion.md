# PASADA 2 — disección hoja a hoja con FORMA UI · cara del JEFE de `calendario`

> El árbol de la pasada-1 prisado hasta hojas atómicas (el agente de UI las puede
> DIBUJAR). Cada hoja-jefe lleva su forma de captura y su señal pareada. Ley: si
> una hoja aún describe "una experiencia", sigue prismando.

## Árbol bajado a hojas

```
CALENDARIO DE PRODUCCIÓN/DISTRIBUCIÓN (el jefe agenda CUÁNDO sale cada producto)
├─ H1 · ELEGIR EL PRODUCTO .......... ref-select (productos.carta_completa → producto_id)
├─ H2 · VER LA AGENDA DEL DÍA ......... cinta-estado (productos.leer → agenda por día)
├─ H3 · AGENDAR LA PRODUCCIÓN (LA DECISIÓN) ... editor-bloque (producto.actualizar)
│   │   → días de salida (chips ISO 1..7) + margen de antelación (horas)
│   └─ señal-refresh: calendario.producto.actualizado
├─ H4 · DICTAMEN SOBRE LA AGENDA ....... dictamen (validar: ¿una fecha cuadra? + propuesta)
│   └─ señal-refresh: ninguna propia (lectura; se consulta bajo demanda)
├─ H5 · PULSO DE ANTELACIÓN ........... cinta-estado secundaria (margen.leer por selección)
└─ H6 · FICHA DE UN PRODUCTO ......... detalle (producto.leer → calendario de uno)
```

### H1 · ELEGIR EL PRODUCTO — forma: `ref-select`

Quién: el jefe elige el producto a agendar desde la carta del proyecto
(`productos.carta_completa.request` → `{ productos: [{id, nombre, ...}] }`). El
ref-select SIEMPRE desde el list (nunca teclear el id). Si un producto con
calendario ya no está en la carta, aparece igual (se conserva).

- RPC pareada: `productos.carta_completa.request` → `productos.carta_completa.response`
  (neutro, otro módulo — proyector — que alimenta la decisión).
- señal: ninguna propia (es lectura).

### H2 · VER LA AGENDA DEL DÍA — forma: `cinta-estado` (la hoja grande)

La agenda completa del proyecto en una llamada (`productos.leer` →
`{ calendarios: { id: {dias_salida, margen_antelacion_h} } }`). La cinta agrega
en claro: **cuántos productos hay agendados, cuántos salen HOY (día de semana
ISO actual), cuántos con margen ≥ 0**. Deriva el "día de hoy" local para marcar
qué productos salen hoy.

- RPC pareada: `productos.leer.request` (sin args) → `{ calendarios }`.
- señal de refresco: `calendario.producto.actualizado` (cuando el jefe agende,
  la cinta late).

### H3 · AGENDAR LA PRODUCCIÓN — forma: `editor-bloque` (LA DECISIÓN ÚNICA)

1 edición = 1 `producto.actualizar` con `{ producto_id, cambios: {
dias_salida: [1..7], margen_antelacion_h: ≥0 } }`. El editor es un panel que
agrupa la declaración multi-campo del jefe:
- **Días de salida**: 7 chips toggle (L M X J V S D, ISO 1..7 — respetar que
  1=Lun, NO 0-based, validador real del index.js).
- **Margen de antelación (horas)**: input numérico ≥ 0.

El handler hace merge profundo en `productos.<id>` y valida los campos presentes
(400 INVALID_INPUT si `dias_salida` no es array 1..7 o `margen < 0`).

- RPC: `calendario.producto.actualizar.request { project_id, producto_id,
  cambios: {dias_salida?, margen_antelacion_h?} }` → `{ calendario }`.
- señal-refresh: `calendario.producto.actualizado` (ConfigCustodio L119, con
  `{ project_id, calendario }`) — la vista NO recarga a ciegas; el dictamen de lo
  agendado vuelve en la respuesta `{ calendario }` y la señal re-confirma.
- errores nombrados: 400 INVALID_INPUT (falta producto_id/cambios o validación
  de esquema) · los del fs al persistir.

### H4 · DICTAMEN SOBRE LA AGENDA — forma: `dictamen`

El jefe puede comprobar si una fecha de encargo propuesta cuadra con la agenda de
un producto: `validar.request { producto_id, fecha_deseada }` → dictamen
`{ producto_id, fecha_deseada, dia_semana, valido, motivo, propuesta?: {fecha,
dia} }`. Si no cuadra, propone el día de salida válido más cercano. Es una
CONFIRMACIÓN de la agenda — útil para el jefe al decidir días de salida nuevos.

- RPC: `calendario.validar.request { project_id, producto_id, fecha_deseada }` →
  dictamen en la respuesta (sin señal propia — es lectura; se consulta bajo
  demanda).
- señal refetch: como no hay señal que lo confirme, la UI refetch el dictamen
  tras `calendario.producto.actualizado` (si una edición cambia los días, el
  dictamen previo puede quedar obsoleto) o simplemente lo re-consulta al pedirlo.

### H5 · PULSO DE ANTELACIÓN — forma: `cinta-estado secundaria` (dictamen)

Para el producto seleccionado, `margen.leer` devuelve la antelación mínima en
horas (`{ producto_id, margen_antelacion_h, dias_salida }`). Es el "cuánto antes
hay que encargar" de ese producto.

- RPC: `calendario.margen.leer.request { project_id, producto_id }` → dictamen.
- señal: ninguna propia (lectura).

### H6 · FICHA DE UN PRODUCTO — forma: `detalle` (opcional)

`producto.leer` trae el calendario completo de un producto
(`{ producto_id, calendario }`). Se puede mostrar como línea del ref-select
(día + margen) sin llamada extra — `productos.leer` ya trae todo. No hace falta
una llamada por selección.

- RPC: `calendario.producto.leer.request { project_id, producto_id }` → `{ producto_id, calendario }` o 404.

## Composición en 3 capas (SELECCIONAR → INFORMARSE → DECLARAR)

```
1. SELECCIONAR  H1 ref-select producto (productos.carta_completa → id)
2. INFORMARSE   H2 cinta-estado agenda del día (productos.leer → agregado)
                H4 dictamen (validar, bajo demanda) · H5 pulso antelación (margen.leer, selección)
3. DECLARAR     H3 editor-bloque (producto.actualizar — LA ÚNICA escritura)
                señal-refresh: calendario.producto.actualizado
```

+ principios que trascienden: **la señal manda** (tras agendar, la cinta late por
`calendario.producto.actualizado`, nunca recarga a ciegas); **frecuencia→jerarquía**
(agendar es lo frecuente del jefe: está en la vista, editor en bloque); el informe
distingue origen (la agenda la declaró el jefe; el dictamen `validar` es el sistema
derivando sobre esa declaración).
