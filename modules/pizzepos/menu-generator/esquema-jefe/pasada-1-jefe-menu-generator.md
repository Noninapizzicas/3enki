# PASADA 1 — prisma de 5 huecos con lente JEFE · módulo `menu-generator`

> Sujeto: **la cara del ROL JEFE del IMPORTADOR de catálogos** (no el módulo
> entero). Ley de agnosticismo: cero tecnología de sistema ambiente. El reflejo
> se llama `menu.import` — es la operación del jefe por excelencia: trae un
> catálogo FUERA (un JSON de carta ya formado, exportado de otro sistema) y lo
> entrega al custodio como carta nueva en BORRADOR.
>
> Fuente (leída, no presumida): `modules/pizzepos/menu-generator/index.js`
> (reflejo v1.1.0 — _atender L56 · _import L58-105 · _rutasFuente L108-120 ·
> dictamen 200 L98-105 · errores 400/404/422/503) + blueprint agéntico v12.2.0
> + module.json. ÚNICO reflejo: `menu.import.request` → `menu.import.response`.

## Hueco 1 — IDENTIDAD: ¿qué DECIDE el jefe aquí?

Una decisión, y es grande: **qué catálogo entra en el proyecto y con qué
nombre**. Es el gesto de incorporación masiva — "esta carta (el JSON de otro
sistema, de la PWA anterior, el que trae el cliente) ENTRA como carta nueva en
BORRADOR; la reviso y, si vale, la activo".

- **El nombre**: lo pide el reflejo (400 INVALID_INPUT si falta) — lo escribe
  el jefe antes de importar.
- **La fuente**: el JSON de carta ya formado. DETERMINISTA: el reflejo no
  inventa nada — re-proyecta el JSON tal cual a la shape canónica de carta
  (FIDELIDAD: datos son datos; precio ausente nace 0).
- **El momento**: el import NUNCA toca cartas en servicio — nace BORRADOR
  (version 1). La activación es del custodio (carta-manager), no del
  importador.

## Hueco 2 — RESTRICCIONES: ¿de qué NO depende él?

- **Custodio distinto**: la carta la persiste `carta-manager` (el reflejo
  hace 1 `carta.save.request` interno, timeout 15s). El reflejo NO es dueño de
  /cartas/ — por eso su señal de confirmación es INDIRECTA del custodio.
- **La fuente es FICHERO, no JSON inline**: el reflejo NO acepta el catálogo
  inline — exige `material_path | material_ref | attachments[]` (rutas
  candidatas en L108-120). El JSON del editor viaja PRIMERO a fichero (puente
  fs.write del módulo filesystem, paths relativos a la raíz del proyecto,
  escribe a `/pizzepos/imports/<slug>.json`) y después entra por
  `material_ref`. Editor → fichero → import: la VÍA DEL PUENTE.
- **El canal es RPC por evento con asterisco literal**: publish
  `core/*/events/menu/import/request` → respuesta `menu.import.response`
  top-level `{request_id, status, data|error}` (molde carta-jefe.ts — canal
  probado en vivo contra el core real; dot-notation NO sirve aquí).
- **Multi-tenant**: todo lleva `project_id` (del proyecto activo). El
  `carta_id` lo resuelve el reflejo (reusa la carta general del proyecto o id
  determinista) — decisión del módulo, la UI no compone ids.

## Hueco 3 — CONTRATO: qué necesita VER y qué SEÑAL confirma su decisión

**VER ANTES de decidir** (todo neutro, alimenta la decisión):

- El JSON de la fuente, legible/editable ANTES de disparar: editor-JSON grande
  (paste o drag-file) con validación mínima local (¿es JSON? ¿trae
  `categorias[]` y `productos[]`?).
- El nombre que llevará la carta (input corto, obligatorio).
- Tras el 200: el DICTAMEN numérico `{carta_id, nombre, categorias,
  productos}` (L98-105) — la respuesta nombra las cifras del import.

**SEÑAL pareada** — invariante DISTINTA de los módulos con señal propia:

- menu-generator **NO emite señal propia** (manifest sin publishes; el módulo
  entero es un reflejo de UNA op). La confirmación es la **SEÑAL INDIRECTA
  del custodio**: `carta.actualizada` (carta-manager L294; nueva carta =
  version 1, 'borrador'), opcional `carta.editada` (_mutar L15). Se correlo
  por `project_id`.
- **Doble confirmación** (como entrega/masa): dictamen en la respuesta RPC +
  señal del custodio que re-confirma — nunca recarga, nunca estado optimista.
- **Timeout ≥ 20s**: el reflejo anida 1 RPC interno a carta.save (15s) —
  espera larga REAL; el panel espera antes de cantar timeout.

## Hueco 4 — NO-OBJETIVOS (caras que NO son del jefe)

- **La estructuración fuzzy / texto libre** (`generar` via TEXTO_LIBRE,
  `estructurar()`): era la cara del blueprint AGÉNTICO v12.2.0. El módulo es
  HOY reflejo determinista de UNA op (`reflejo-1.1.0`); la estructuración por
  LLM no tiene op real detrás. Fuera del panel del jefe — si vuelve, será su
  propia cara con su propio análisis.
- **La PWA / comandero / cocina** que consume la carta importada —
  utilización: la carta se consume donde cualquier otra (POS, carta-digital).
  El panel del jefe no las sirve.
- **La edición del contenido importado** — custodio: se edita en
  carta-manager (add_product, update_prices...). El importador NO edita:
  importa y da dictamen.
- **OCR / PDF / multi-fichero con FilePicker** — huecos [ABIERTO] (pasada 2).

## Hueco 5 — PREGUNTAS_ABIERTAS — decisiones del dueño pendientes

Ninguna decisión de UI se presupone. Los huecos se NOMBRAN y se dejan:

- ver pasada-2-diseccion.md — huecos: drag&drop nativo con FilePicker del core,
  OCR/PDF (menu-ocr / menu-pdf2img / menu-prepare son módulos hermanos de la
  página), multi-fichero/lote, y la cara agéntica aparcada.