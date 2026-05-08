# esp32-flasher — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/esp32-flasher/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 1138.
- **Drifts en baseline**: 151 (30 tipos).
- **Categoria**: core.
- **Description oficial**: Flash de firmware a ESP32 via serial (esptool/platformio) y monitor serial en tiempo real

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (9)

- `flash.started` — emitido en `handleStart`.
- `flash.failed` — emitido en `handleCancel`.
- `flash.progress` — emitido en `_parseEsptoolProgress`.
- `flash.completed` — emitido en `_onFlashComplete`.
- `flash.failed` — emitido en `_onFlashComplete (path failure)`.
- `flash.failed` — emitido en `_onFlashError`.
- `flash.serial_output` — emitido en `_startMonitor (cat stdout)`.
- `flash.serial_output` — emitido en `_startDebugListener (MQTT message)`.
- `flash.serial_output` — emitido en `handleSerialRelay (POST /serial-relay)`.

### Subscribes (1)

- `firmware.build_completed` → `onBuildCompleted`

## Drifts conocidos en baseline (151)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_como_string_suelto` | 22 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 22 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_log` | 21 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_metrica_sin_prefix_modulo` | 21 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 9 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_type_canonico` | 8 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_zone_canonica` | 8 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 6 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_silent_io_failure` | 5 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_handler_que_devuelve_valor_pelado` | 5 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_non_canonical_routing` | 4 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_test_filesystem_persistente` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_instruccion_en_message` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_swallow_error_silently` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_raw_topic_in_publish` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_silent_catch` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_auth_undeclared` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_missing_onUnload_with_reservations` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_module_json_incompleto` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_returns_con_error_string` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_sin_5_helpers_poc2` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_sin_helper_auxiliar` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_sin_legacy_archivado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_tests_sin_capas` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_correlation_id_no_propagado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_log_spam_en_bucle` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_severity_invertida` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_non_atomic_write` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_undeclared_persistence_pattern` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_test_sin_npm_script` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (1138 LOC) en `_legacy/esp32-flasher-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `esp32-flasher.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/esp32-flasher.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
