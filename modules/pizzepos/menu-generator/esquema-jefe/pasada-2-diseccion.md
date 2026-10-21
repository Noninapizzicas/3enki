# PASADA 2 — disección hoja a hoja con FORMA UI · cara del JEFE de `menu-generator`

> El árbol de la pasada-1 prisado hasta hojas atómicas (agente de UI puede
> DIBUJARLAS). Cada hoja-jefe lleva su forma de captura y su señal pareada.
> Ley: si una hoja aún describe "una experiencia", sigue prismando.

## Árbol bajado a hojas

```
IMPORTADOR (la única decisión: qué catálogo entra y con qué nombre)
├─ H1 · ELEGIR LA FUENTE DEL CATÁLOGO .......... editor-json (hoja-jefe, forma editor-json)
│   ├─ H1a · PEGAR el JSON → puente fs.write → material_ref
│   └─ H1b · ARRASTRAR un fichero .json → FileReader → mismo puente
├─ H2 · PONER EL NOMBRE DE LA CARTA ............ inline-gesture (input corto)
├─ H3 · REVISAR ANTES DE IMPORTAR .............. informes-captura (validación local)
├─ H4 · IMPORTAR (LA ÚNICA ESCRITURA) .......... transición (1 llamada menu.import)
│   └─ señal-refresh: carta.actualizada (INDIRECTA del custodio)
└─ H5 · LEER EL DICTAMEN ....................... cinta-dictamen (hoja-neutro → alimenta)
```

### H1 · ELEGIR LA FUENTE — forma: `editor-json` (la hoja grande, atómica)

Qué: el jefe VE y AJUSTA el catálogo antes de incorporarlo — el JSON completo
en un editor de texto grande. Dos entradas al MISMO editor (el puente fs.write
es la única vía activa hoy):

- **H1a · PEGAR**: paste del JSON → validación mínima local → 1 fs.write a
  `/pizzepos/imports/<slug>.json` → `menu.import.request { material_ref }`.
- **H1b · ARRASTRAR**: drag-file sobre el editor (o seleccionar) →
  `FileReader.readAsText` → el texto cae en el MISMO editor → mismo camino
  (fs.write → material_ref). La UI no compone nada: el fichero viaja VERBATIM.

Forma: `editor-json` (textarea grande con validación en vivo + estado del
puente). NO es editor de carta — es la puerta del catálogo: se lee, se corrige
lo obvio (comas, encoding), no se edita contenido.

- RPC pareada: `menu.import.request` → `menu.import.response` (top-level
  `{request_id, status, data|error}`).
- señal-refresh: `carta.actualizada` del custodio (INDIRECTA — invariante
  del módulo: SIN señal propia).

### H2 · EL NOMBRE — forma: `inline-gesture`

Input corto en la misma tarjeta de import (el reflejo lo exige: 400
INVALID_INPUT 'nombre' si falta). Se valida localmente ANTES de abrir el RPC
(freno local, como publicar en carta-digital). El slug del fichero de imports
se deriva del nombre.

- señal: ninguna propia (es dato del request, no escritura).

### H3 · REVISAR ANTES DE IMPORTAR — forma: `informes-captura` (validación mínima)

La validación LOCAL no sustituye al dictamen del reflejo (ese es el que
cuenta); solo frena el gesto obvio: JSON roto (JSON.parse falla), sin
`categorias[]`, sin `productos[]`. Cuando frena, NOMBRA el porqué + los
errores del reflejo en el editor (400 INVALID_INPUT · 404 JSON ilegible ·
422 sin productos/categorías) para que el jefe sepa qué va a pasar con su
JSON antes de dispararlo.

### H4 · IMPORTAR — forma: `transicion-un-llamado` (la escritura ÚNICA)

1 clic → 1 `menu.import.request` → espera ≥ 20s (el reflejo anida carta.save
interno de 15s: espera larga REAL) → dictamen en la respuesta. Botón con
deshabilitado durante el vuelo (no hay doble import: el botón muere mientras
viaja).

- RPC: `menu.import.request { project_id, nombre, material_ref }`.
- señal-refresh: `carta.actualizada` (custodio) — la vista NO recarga; si el
  jefe tiene abierto un listado de cartas, ese se refresca por su propia señal.
- errores nombrados en la respuesta: 400 INVALID_INPUT (falta fuente/nombre) ·
  404 RESOURCE_NOT_FOUND (JSON ilegible en ruta) · 422 UPSTREAM_INVALID_RESPONSE
  (sin productos/categorías detectables) · 503/502 (carta-manager/filesystem
  caídos).

### H5 · DICTAMEN — forma: `cinta-dictamen`

La respuesta 200 nombra el resultado: `{carta_id, nombre, categorias,
productos}` → banner de dictamen: carta creada en BORRADOR (version 1),
con sus cifras + nota fija: "revísala y actívala en carta-manager". La señal
`carta.actualizada` re-confirma por detrás (debounce 60ms).

## Hojas de UTILIZACIÓN (FUERA del árbol del jefe — no se dibujan aquí)

- El consumo de la carta importada por POS/PWA/carta-digital (la carta es una
  más — su cara de utilización es la de cualquier carta).
- El flujo del CLIENTE (ya sea en la PWA o en el POS) — el importador NO
  participa en venta; solo incorpora.

## Huecos [ABIERTO] — nombrados, NO cerrados

- [ABIERTO] **drag&drop nativo con FilePicker del core**: el reflejo acepta
  `attachments[].path` (L112-119) apuntando al storage del proyecto — la vía
  FilePicker nativa queda ABIERTA (requiere picker del core; hoy FileReader +
  fs.write cubre el gesto sin él).
- [ABIERTO] **OCR / PDF**: menu-ocr / menu-pdf2img / menu-prepare (módulos
  frontend hermanos de la página /menu-generator) podrían alimentar el
  importador (su salida → JSON → import). Integración decisión del dueño — el
  panel no la pide hoy.
- [ABIERTO] **multi-fichero / lote**: `attachments[]` acepta N rutas pero el
  reflejo lee hasta la PRIMERA válida (1 JSON = 1 carta por llamada). ¿Lote?
  Decisión del dueño.
- [ABIERTO] **cara agéntica aparcada**: el blueprint v12.2.0 describía
  `generar` (TEXTO_LIBRE, estructurar(), freño validar×3). El módulo real es
  reflejo de UNA op; si la face agéntica vuelve, tendrá su propio análisis
  (y su propia fuente de verdad: hoy NO existe op detrás).