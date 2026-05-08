# pizzepos__tarifas — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/pizzepos/tarifas/`
- **Version actual**: 3.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 408.
- **Drifts en baseline**: 37 (8 tipos).
- **Categoria**: core.
- **Description oficial**: Asignacion carta+canal + registro de variantes pizzepos. Cada canal tiene su carta con precios finales escritos. Sin calculos en runtime, sin duplicacion (tarifas-creator y tarifas-sync agentes lo hacen). Comandero llama resolverCarta(canal) para obtener el carta_id efectivo.

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (3)

- `tarifas.config.actualizada` — emitido en `toolSetGeneral (probable)` (handler de `tool tarifas.set_general`).
- `tarifas.config.actualizada` — emitido en `toolAssign (probable)` (handler de `tool tarifas.assign`).
- `tarifas.config.actualizada` — emitido en `toolRegisterVariant (probable)` (handler de `tool tarifas.register_variant`).

### Subscribes (2)

- `project.activated` → `onProjectActivated`
- `project.deactivated` → `onProjectDeactivated`

## Drifts conocidos en baseline (37)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_como_string_suelto` | 7 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_log` | 7 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 7 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_handler_que_devuelve_valor_pelado` | 5 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 4 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_type_canonico` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_zone_canonica` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_non_atomic_write` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (408 LOC) en `_legacy/pizzepos__tarifas-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `tarifas.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/pizzepos__tarifas.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
