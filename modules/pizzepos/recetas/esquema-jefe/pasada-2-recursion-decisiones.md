# PASADA 2 — disecar las decisiones del jefe de `recetas` (recursión de decisiones)

> Continúa pasada-1. Cada decisión → gesto atómico → forma UI exacta op por op,
> con canal y señal verificados en código (nota de árbol: `core/{ASTERISCO}/…`
> es el patrón de canal; aquí se nombra el CANAL sin literales crudos — el
> molde correcto muerde en comentarios JSDoc).

## D1 — CREAR una receta (la decisión GORDA)

Gesto atómico, desmenuzado:

1. **nombrar** — nombre comercial único (dedup activo por nombre normalizado;
   409 ALREADY_EXISTS si choca) → inline-gesture en el editor.
2. **clasificar** — tipo en slug (`pizza|masa|salsa|base|…` — contrato
   `^[a-z0-9-]+$`, LIBRE: se normaliza a slug y default 'pizza') →
   inline-gesture (input con datalist de tipos ya usados).
3. **declarar líneas** — LA forma grande del panel: filas
   { ingrediente (ref-select del catálogo o texto nuevo), cantidad (>0),
   unidad (g|ml|ud), notas? }. Cada línea es un gesto atómico "añadir línea".
4. **rinde** — {cantidad, unidad} opcional; si falta, infiere por tipo
   (pizza={1,ud}; masa={nº bolas,ud}; salsa={peso,g}) → inline par cantidad+unidad.
5. **guardar** — `recetas.crear`. El reflejo: dedup 409, id slug estable,
   normaliza líneas (unidad no canónica→g), persiste atómico, VERIFICA el
   aterrizaje y SOLO ENTONCES publica `receta.creada` con firma de forma.
   Nunca éxito fantasma por diseño: 201 verificada · 409 ya existe · 503 NO guardada.

Canales/frenos del editor (INV del módulo):
- el catálogo para resolver `ref` viene de `recetas.ingredientes` (lectura
  neutra) — el editor sugiere, NO inventa ids.
- el FRENO formal pre-guardado es `recetas.validar` (D2) — el editor lo llama
  en vivo mientras el jefe escribe (función pura, sin persistir nada).
- cantidades sin decidir → línea FUERA (nace borrador `incompleta:true` con
  `campos_pendientes`); no coacción silenciosa a 0.

## D2 — VALIDAR (EL FRENO, hoja de gesto propia)

- entrada: el borrador de receta tal cual lo lleva el editor.
- salida SIEMPRE 200: `data.valid` + `errors[{path, keyword, message}]` con
  path puntero (`/lineas/2/cantidad debe ser > 0`, `unidad in {g,ml,ud}`).
- granularidad de la señal: NINGUNA (función pura — el dictamen es la
  respuesta; parearían una señal inventada).
- forma: informe/dictamen bajo el editor; errores clicables en su fila.

## Gesto de LECTURA — el RECETARIO (la tabla del jefe)

- `listar {estado?, limit?, incluir_lineas:true}` →
  `{total, recetas[]{receta_id, nombre, tipo, rinde, lineas_count, incompleta,
  campos_pendientes, estado_operativo, version, updated_at, lineas[], coste_unidad}}`.
- la tabla por receta: línea = {nombre, cantidad, unidad} (+ notas) y su
  desglose de coste si escandallo ya write-ó (`lineas_detalle`/`lineas_sin_precio`
  via `obtener`).
- `obtener {receta_id|nombre}` → ficha completa (spread directo, sin history)
  + `versiones_anteriores` — para el detalle de una sola receta.
- `ingredientes {categoria?}` → `{total, ingredientes[]{id,nombre,compra_unidad,precio,fuente}}`
  — catálogo para el ref-select de líneas (y para mostrar el precio por unidad
  de compra al lado de cada línea, lo que hace legible el futuro coste).
- estado del catálogo a mostrar: `en_servicio` default + posibilidad de mirar
  `borrador` (las incompletas son TRABAJO pendiente, no basura).

## Síntesis para el blueprint (hojas asignadas)

- H1 cinta: `n recetas · n con coste · n incompletas` (de listar).
- H2 selector: ref-select receta (borrador/en_servicio).
- H3 tabla-del-recetario: líneas ingrediente×cantidad + coste si existe.
- H4 crear: editor-bloque con líneas dinámicas + validar en vivo (dictamen
  errors[].path) + CREAR con dictamen de la respuesta (201/409/503 nombrados).
- H5 informes: campos_pendientes + lineas_sin_precio (lo que impide costear).

No hay hoja para editar receta existente: sin op real hoy [ABIERTO].
No hay hoja de coste editable: el coste lo escribe escandallo, se muestra.