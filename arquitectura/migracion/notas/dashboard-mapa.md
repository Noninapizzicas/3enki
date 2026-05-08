# dashboard — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/dashboard/`
- **Version actual**: 2.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 361.
- **Drifts en baseline**: 17 (9 tipos).
- **Categoria**: core.
- **Description oficial**: Observability Dashboard - Web UI para monitorear todos los cores

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (0)

- _(ninguno)_

### Subscribes (3)

- `core/+/logs/#` → `?`
- `core/+/events/#` → `?`
- `core/+/metrics/#` → `?`

## Drifts conocidos en baseline (17)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_non_canonical_routing` | 5 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_como_string_suelto` | 4 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_swallow_error_silently` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_type_canonico` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_zone_canonica` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_missing_onUnload_with_reservations` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_correlation_id_no_propagado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_declaration_no_cumple_schema` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_handler_que_devuelve_valor_pelado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (361 LOC) en `_legacy/dashboard-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `dashboard.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/dashboard.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
