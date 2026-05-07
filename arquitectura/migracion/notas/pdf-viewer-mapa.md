# pdf-viewer — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/pdf-viewer/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 1097.
- **Drifts en baseline**: 101 (15 tipos).
- **Categoria**: core.
- **Description oficial**: PDF viewer and text extraction module

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (10)

- `pdf.view.response` — emitido en `?` (handler de `pdf.view.request`).
- `pdf.view.response` — emitido en `?` (handler de `pdf.view.request`).
- `pdf.extract.response` — emitido en `?` (handler de `pdf.extract.request`).
- `pdf.extract.response` — emitido en `?` (handler de `pdf.extract.request`).
- `pdf.metadata.response` — emitido en `?` (handler de `pdf.metadata.request`).
- `pdf.metadata.response` — emitido en `?` (handler de `pdf.metadata.request`).
- `pdf.list.response` — emitido en `?` (handler de `pdf.list.request`).
- `pdf.list.response` — emitido en `?` (handler de `pdf.list.request`).
- `db.query.request` — emitido en `?`.
- `local.pdf.create.request` — emitido en `?`.

### Subscribes (4)

- `pdf.view.request` → `?`
- `pdf.extract.request` → `?`
- `pdf.metadata.request` → `?`
- `pdf.list.request` → `?`

## Drifts conocidos en baseline (101)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_como_string_suelto` | 16 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 14 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_log` | 10 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_generic_verb` | 10 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_rpc_over_pubsub` | 10 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 9 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_inventar_error_code` | 6 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_nombre_log_metric_critico` | 6 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 4 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_handler_que_devuelve_valor_pelado` | 4 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_type_canonico` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_zone_canonica` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_silent_io_failure` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_auth_undeclared` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_correlation_id_no_propagado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (1097 LOC) en `_legacy/pdf-viewer-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `pdf-viewer.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/pdf-viewer.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
