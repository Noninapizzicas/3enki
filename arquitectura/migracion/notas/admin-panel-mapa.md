# admin-panel — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/admin-panel/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 543.
- **Drifts en baseline**: 22 (8 tipos).
- **Categoria**: core.
- **Description oficial**: Web-based admin panel for managing Event Core system

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (5)

- `admin.action` — emitido en `?`.
- `admin.action` — emitido en `?`.
- `admin.action` — emitido en `?`.
- `admin.action` — emitido en `?`.
- `admin.action` — emitido en `?`.

### Subscribes (1)

- `plugin.loaded` → `?`

## Drifts conocidos en baseline (22)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_nombre_log_metric_critico` | 6 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_generic_verb` | 5 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 5 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_como_string_suelto` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_log` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_auth_undeclared` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_correlation_id_no_propagado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (543 LOC) en `_legacy/admin-panel-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `admin-panel.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/admin-panel.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
