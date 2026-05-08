# viabilidad — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/viabilidad/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 651.
- **Drifts en baseline**: 74 (21 tipos).
- **Categoria**: core.
- **Description oficial**: Estudio de viabilidad de negocio: punto de equilibrio, proyecciones, escenarios, análisis de rentabilidad.

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (2)

- `viabilidad.estudio.generado` — emitido en `handleEstudio (probable)`.
- `viabilidad.escenario.calculado` — emitido en `handleEscenario`.

### Subscribes (6)

- `project.activated` → `onProjectActivated`
- `project.deactivated` → `onProjectDeactivated`
- `receta.creada` → `onRecetaChanged`
- `receta.actualizada` → `onRecetaChanged`
- `receta.eliminada` → `onRecetaChanged`
- `escandallo.calculado` → `onEscandalloCalculado`

## Drifts conocidos en baseline (74)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_sin_log` | 14 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 14 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 6 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_color_hex_custom_en_frontend_src` | 5 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_handler_que_devuelve_valor_pelado` | 5 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_silent_io_failure` | 4 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_design_doc_propio_de_modulo` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_type_canonico` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_zone_canonica` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_markdown_con_shape_estructurable` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_inventar_error_code` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_swallow_error_silently` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_agent_no_cumple_schema` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_agent_prompt_file_sin_h1` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_agent_stats_persistido` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_como_string_suelto` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_missing_onUnload_with_reservations` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_correlation_id_no_propagado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_unbounded_growth_no_eviction` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_undeclared_persistence_pattern` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (651 LOC) en `_legacy/viabilidad-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `viabilidad.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/viabilidad.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
