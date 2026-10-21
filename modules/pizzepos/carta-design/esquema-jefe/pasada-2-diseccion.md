# PASADA 2 — disección hoja a hoja con FORMA UI · cara del JEFE de `carta-design`

> El árbol de la pasada-1 prisado hasta hojas atómicas (agente de UI puede
> DIBUJARLAS). Cada hoja-jefe lleva su forma de captura y su señal pareada.
> Ley: si una hoja aún describe "una experiencia", sigue prismando.

## Árbol bajado a hojas

```
COMPOSITOR DEL DISEÑO IMPRESO (el look del PDF: ¿cómo se ve la carta impresa?)
├─ H1 · ELEGIR LA CARTA ................. ref-select (carta.list → id)
├─ H2 · COMPONER (LA DECISIÓN) .......... transición (1 llamada design.contexto_diseno)
│   └─ señal-refresh: carta.html.generada (tras guardar)
├─ H3 · LEER EL DICTAMEN VISUAL ......... dictamen-visual (carta + marca + alergenos)
├─ H4 · VALIDAR EL DISEÑO (FRENO) ....... transición (design.validar → {valid, errors})
├─ H5 · GUARDAR EL DISEÑO ............... transición (design.save → 201 meta)
│   └─ señal-refresh: carta.html.generada
├─ H6 · VER LA GALERÍA ................. cinta-estado (design.gallery → metas)
└─ H7 · VER EL DISEÑO (preview) ......... dictamen-visual (fs.read del HTML)
```

### H1 · ELEGIR LA CARTA — forma: `ref-select`

Qué: el jefe elige la carta a diseñar desde el listado de cartas del proyecto
(`carta.list.request` → `[{id, nombre, estado, version, productos_count,
categorias_count}]`). El ref-select SIEMPRE desde el list (nunca teclear el id).

- RPC pareada: `carta.list.request` → `carta.list.response` (neutro, alimenta la
  decisión).
- señal: ninguna propia (es lectura).

### H2 · COMPONER — forma: `transicion-un-llamado` (la decisión ÚNICA)

1 clic → 1 `design.contexto_diseno.request { project_id, carta_id }` → el reflejo
HIDRATA en UNA RPC `{carta, marca, alergenos_catalogo}` (L78-99). Es el DICTAMEN
VISUAL del impreso: la carta a diseñar + la identidad de marca (colores,
tipografías, logo, voz) + los 14 alérgenos. Botón deshabilitado durante el vuelo.

- RPC: `design.contexto_diseno.request { project_id, carta_id }` → 200 `{carta,
  marca, alergenos_catalogo}`.
- señal-refresh: `carta.html.generada` (L205) — la vista NO recarga; el dictamen
  llega en la respuesta y la señal re-confirma.
- errores nombrados: 400 INVALID_INPUT (falta carta_id) · 503 UPSTREAM_UNREACHABLE
  (carta-manager no responde) · 502 (status del upstream).

### H3 · LEER EL DICTAMEN VISUAL — forma: `dictamen-visual` (la hoja grande)

La respuesta 200 de contexto_diseno nombra el material del diseño: `{carta,
marca, alergenos_catalogo}` (L94-98). El dictamen se muestra EN CLARO: la carta
(productos/categorías/precios), la identidad de marca (visual:{colores,
tipografias,estilo,logo} + esencia/voz) y el catálogo de alérgenos. Es lo que el
diseño va a encarnar.

- señal-refresh: `carta.html.generada` (re-confirma con debounce 60ms).

### H4 · VALIDAR EL DISEÑO — forma: `transicion-un-llamado` (el FRENO)

El jefe pega/refiere el HTML compuesto → `design.validar.request { project_id,
carta_id, html }` → `{valid, errors[{code,message,faltan}], productos_total,
productos_faltan}` (L161-169). El freno compara contra la carta REAL (carta.get),
NO contra lo que el LLM afirme. Si !valid, el jefe sabe qué falta (productos
omitidos, alérgenos sin declarar).

- RPC: `design.validar.request { project_id, carta_id, html }` → 200 `{valid,
  errors, productos_total, productos_faltan}`.
- señal: ninguna propia (es función pura, no escribe).

### H5 · GUARDAR EL DISEÑO — forma: `transicion-un-llamado`

`design.save.request { project_id, carta_id, html, nombre?, formato?,
generado_por? }` → RE-VALIDA (gate inquebrantable) + 2º freno de render real
(best-effort) → 201 `{carta_id, nombre, formato, generado_at, generado_por,
filename, size_bytes}` (L172-210). Emite `carta.html.generada`.

- RPC: `design.save.request` → 201 meta.
- señal-refresh: `carta.html.generada` (L205) — refresca la galería.
- errores nombrados: 400 INVALID_INPUT · 404 RESOURCE_NOT_FOUND (carta no
  existe) · 422 UPSTREAM_INVALID_RESPONSE (el diseño no representa la carta —
  faltan productos/alérgenos, o renderiza roto) · 503 UPSTREAM_UNREACHABLE.

### H6 · VER LA GALERÍA — forma: `cinta-estado`

El historial de diseños guardados (`design.gallery.request { project_id,
carta_id? }` → metas, orden por fecha desc, L213-227). El jefe ve el pulso de lo
compuesto sin navegar.

- RPC: `design.gallery.request { project_id, carta_id? }` → metas.
- señal-refresh: `carta.html.generada`.

### H7 · VER EL DISEÑO — forma: `dictamen-visual` (preview)

El jefe revisa el HTML guardado como lo verá el consumidor final ANTES de la
transición de publicación. Se lee por fs (`fs.read` del `.html` en
`/pizzepos/carta-design/designs/`) y se muestra en iframe/visor (sandbox sin
scripts — el HTML del diseño no usa JS).

- RPC: `fs.read.request { project_id, path }` → content (HTML).
- señal: ninguna propia (es lectura).

## Hojas de UTILIZACIÓN (FUERA del árbol del jefe — no se dibujan aquí)

- El consumo del producto por POS/PWA/cocina — el diseño impreso es previo a la
  venta; no participa en ella.
- El flujo del CLIENTE — el diseño no se vende; se imprime/publica.

## Huecos [ABIERTO] — nombrados, NO cerrados

- [ABIERTO] **composición del HTML en el panel**: hoy la hace el LLM de PÁGINA
  en el chat (fuzzy, sin agente). El panel del jefe dispara (contexto_diseno),
  valida y guarda — no compone. ¿Editor de HTML aquí? Decisión del dueño.
- [ABIERTO] **edición de la marca desde el panel**: la identidad vive en
  carta-marketing (custodio). El diseño la BEBE, no la edita. ¿Editor aquí?
  Decisión del dueño.
- [ABIERTO] **re-composición automática cuando cambia la carta**: un diseño es
  snapshot del momento. Si la carta cambia, ¿re-componer? Decisión del dueño.
