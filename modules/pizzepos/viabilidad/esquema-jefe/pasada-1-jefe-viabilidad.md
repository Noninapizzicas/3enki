# PASADA 1 — prisma de 5 huecos con lente JEFE · módulo `viabilidad`

> Sujeto: **la cara del ROL JEFE del EVALUADOR ECONÓMICO previo del recetario**
> (no el módulo entero). Ley de agnosticismo: cero tecnología de sistema
> ambiente. El reflejo se llama `viabilidad.evaluar` — es la operación del
> jefe por excelencia: el FRENO de negocio que dictamina si una receta o
> propuesta es viable en coste/margen ANTES de darla de alta.
>
> Fuente (leída, no presumida): `modules/pizzepos/viabilidad/index.js`
> (reflejo-1.0.0 — _atender L47-50 · _evaluar L94-225 · _obtener L244 ·
> _listar L256 · _descartar L271 · señales L208/L295) + module.json (v2.0.0,
> HÍBRIDO, 4 ops RPC por evento, SIN ui_handlers) + blueprint v2.1.0.

## Hueco 1 — IDENTIDAD: ¿qué DECIDE el jefe aquí?

El jefe es el **freno económico del recetario**: decide si una receta o
propuesta de producto es VIABLE en coste/margen antes de que entre en
producción. Dos decisiones:

- **D1 — EVALUAR la viabilidad** (`viabilidad.evaluar`): el jefe elige una
  receta (o propuesta con ingredientes) + un PVP objetivo opcional → el
  reflejo delega el coste a escandallo.costear, aplica las reglas de food
  cost y emite el DICTAMEN económico: `{viable, coste_porcion, margen_porcion,
  food_cost_pct, veredicto, advertencias, caminos}`. Es la decisión que
  aprueba o frena un producto.
- **D2 — DESCARTAR un expediente** (`viabilidad.descartar`): soft-delete de
  una evaluación (estado='descartado', audit trail). El jefe decide que una
  evaluación ya no cuenta.

Frecuencia: media (cada alta de receta/producto pasa por aquí). El gesto
frecuente es EVALUAR (ref-select receta + PVP → dictamen visible).

Lo que NO decide: el coste real (escandallo), el contenido de la receta
(recetas), ni cómo se vende (POS/PWA — utilización).

## Hueco 2 — RESTRICCIONES: ¿de qué NO depende él?

- **El coste lo calcula escandallo** (`escandallo.costear.request`, L109 —
  REFLEJO determinista, catálogo cacheado, orientativo). El reflejo NO usa
  escandallo.calcular (cajón fuzzy Mercadona, turno LLM). El coste es
  orientativo, no preciso.
- **El nombre de la receta lo resuelve recetas** (`recetas.obtener.request`,
  L125) cuando se evalúa por receta_id sin nombre — NO se inventa.
- **Los umbrales de food cost** (25/35/45) son del proyecto vía
  `/pizzepos/viabilidad/config.json` (patrón carta-digital), con fallback a
  los DEFAULT (L37, L77-88). El jefe no los edita aquí.
- **El canal es RPC por evento** (`viabilidad.<op>.request` → `.response`),
  NO ui/request (sin ui_handlers en module.json — HÍBRIDO fuzzy como
  menu-generator). El reflejo responde top-level `{request_id, status,
  data|error}`.
- **Multi-tenant**: todo RPC lleva `project_id` (proyecto activo). Las
  señales se correelan por `project_id`.

## Hueco 3 — CONTRATO: qué necesita VER y qué SEÑAL confirma su decisión

**VER ANTES de decidir** (todo neutro, alimenta la decisión):

- La receta a evaluar: `recetas.listar.request` (ref-select — receta_id +
  nombre) o `recetas.obtener.request`.
- El PVP objetivo (opcional): si no se pasa, el reflejo calcula pvp_sugerido
  al food cost objetivo (default 30%) y el veredicto es 'sin_pvp_objetivo'
  (orientativo).
- Tras el 201: el DICTAMEN económico `{viable, coste_porcion, margen_porcion,
  food_cost_pct, veredicto, advertencias, caminos}` (L168-189) — la respuesta
  nombra las cifras de la decisión.

**SEÑAL pareada** — el módulo SÍ publica señal propia (verificado en código,
aunque module.json no declare publishes — lección carta-digital):

- `viabilidad.evaluacion.completada` (L208) — confirma la evaluación.
- `viabilidad.evaluacion.descartada` (L295) — confirma el descarte.
- **Doble confirmación** (como entrega/masa): dictamen en la respuesta RPC +
  señal que re-confirma con debounce 60ms — nunca recarga, nunca estado
  optimista.

## Hueco 4 — NO-OBJETIVOS (caras que NO son del jefe)

- **La venta / consumo del producto** — utilización: el producto evaluado se
  vende en POS/PWA/cocina. El evaluador NO participa en venta; es previo.
- **El coste real con precios Mercadona frescos** — escandallo.calcular (cajón
  fuzzy, turno LLM) — fuera del panel del jefe (hueco [ABIERTO] del blueprint:
  coste_fresco_vs_cacheado).
- **La edición de la receta** — recetas (custodio). El evaluador NO edita
  recetas: las evalúa.
- **Los umbrales de food cost** — config del proyecto (config.json), no se
  editan aquí.

## Hueco 5 — PREGUNTAS_ABIERTAS — decisiones del dueño pendientes

Ninguna decisión de UI se presupone. Los huecos se NOMBRAN y se dejan:

- ver pasada-2-diseccion.md — huecos: coste fresco vía escandallo.calcular
  bajo demanda, re-evaluación automática cuando suben los precios, umbrales
  editables desde el panel.
