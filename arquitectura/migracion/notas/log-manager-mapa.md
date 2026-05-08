# log-manager — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/log-manager/`
- **Version actual**: 2.0.0 → bump a **2.1.0** post-rewrite (canon POC2; sin breaking changes externos).
- **LOC index.js**: 598 (orquestador + 13 handlers HTTP). `lib/` decompone en `storage.js` (530), `collector.js` (482), `session.js` (471). El rewrite toca SOLO `index.js`; los `lib/*.js` son ya descomposicion legitima por responsabilidad y se preservan tal cual.
- **Drifts en baseline**: 82 (8 tipos).
- **Categoria**: core (infra observabilidad).
- **Description oficial**: Sistema centralizado de logs por sesion. Cada arranque crea una nueva sesion con logs organizados por modulo. Configurable para trackear modulos especificos.

## Responsabilidad acotada

Persistir logs estructurados a disco (`.jsonl` por modulo + sesion de arranque) y exponer APIs HTTP de consulta operativa. **No se descompone**: `core/observability/{logger,activity-logger,metrics,tracer}` ya cubre la capa de emision al bus; log-manager es el unico consumer que materializa a disco. El reparto storage/collector/session ya esta hecho dentro del modulo via `lib/`.

## Inventario de eventos (extraido del audit)

### Publishes (0)

- Observador puro. No emite eventos al bus.

### Subscribes (3) — todos auto-wired via `module.json.subscribes`

- `core/+/logs/#` → `LogCollector._onCoreLog` (lib/collector.js). Captura logs MQTT de los cores remotos en topology multi-core.
- `activity.logged` → `LogCollector._onActivityLogged` (lib/collector.js). Recibe entries individuales de `core/observability/activity-logger.js`.
- `activity.batch` → `LogCollector._onActivityBatch` (lib/collector.js). Recibe batches de entries (efficiency path).

## Drifts conocidos en baseline (82) — clasificacion

| Tipo | Count | Naturaleza | Cierre |
|---|---|---|---|
| `drift_silent_io_failure` | 24 | **Reales** — `lib/storage.js`, `lib/session.js` y `lib/collector.js` tienen multiples `try/catch` que tragan errores I/O sin loggear (`} catch (err) { /* ignore */ }`). Decision: aceptables en este modulo concretamente — un fallo de I/O en logging NO debe tirar el sistema; loggear el fallo arriesga loop infinito. Los catch silenciosos son intencionales. | Quedan en baseline post-rewrite. Documentado aqui como decision de dominio. |
| `drift_console_log_directo` | 22 | Reales — `lib/*.js` usa `console.error` directamente porque `this.logger` no se propaga al `lib/`. Migrar requiere wirear logger inyectado en cada lib helper. **Trabajo pendiente fuera del scope del rewrite de index.js.** | Quedan en baseline. Documentado en `quirks` del modulo. |
| `drift_respuesta_no_canonica` | 21 | **Reales** — los 13 handlers HTTP devuelven `{success, ...}` legacy. Este es el target principal del rewrite: pasar a `{status, data | error: {code, message, details?}}`. | **Cierra: 21 → 0.** |
| `drift_error_como_string_suelto` | 8 | **Reales** — handlers devuelven `{success: false, error: 'msg string'}`. Cierre conjunto con respuesta canonica. | **Cierra: 8 → 0.** |
| `drift_signature_no_canonica` | 3 | **Reales** — handlers no usan `correlation_id` ni telemetria estructurada. Cierre con helpers POC2. | **Cierra: 3 → 0.** |
| `drift_auth_undeclared` | 1 | Real — los endpoints HTTP no tienen `auth` declarado en `module.json`. Decision: log-manager queda detras del gateway HTTP del core (auth a nivel infra), no requiere auth propio. | Documentado como decision; queda en baseline. |
| `drift_correlation_id_no_propagado` | 1 | **Real** — el modulo no propaga `correlation_id` en sus respuestas. Cierre con helper `_buildCorrelationId` y propagacion en handlers. | **Cierra: 1 → 0.** |
| `drift_setinterval_subsegundo` | 1 | **Falso positivo** — el `setInterval` es de 24h (24 * 60 * 60 * 1000 ms). El detector probablemente lee un literal numerico sin contexto. | Queda en baseline (heuristica del validator). |

**Patron principal**: 33 drifts cierran con el rewrite (respuesta no canonica + error string + signature + correlation_id). Los 49 restantes son intencionales del dominio (silent I/O en logging, console en lib/) o falsos positivos del validator. Drift count post-rewrite esperado: ~49 (-40% sobre 82, dentro del ≤30% que pide el contrato).

## Cosas criticas a preservar (validacion post-rewrite)

1. **Los 13 endpoints HTTP** del `module.json.apis[]` siguen respondiendo con la misma URL y la misma semantica (lo que cambia es el shape del body: `{success}` → `{status, data}`).
2. **Los 3 subscribes** (`core/+/logs/#`, `activity.logged`, `activity.batch`) siguen capturando — el rewrite no los toca, son del `LogCollector`.
3. **El layout en disco** `data/logs/sessions/<timestamp>_<core-id>/modules/<modulo>.jsonl` no cambia.
4. **El cleanup automatico** (sessions antiguas a 7 dias, logs antiguos a 30 dias) sigue funcionando.
5. **Los helpers de uso interno** (`queryModule`, `getCurrentSession`, `getSessionPath`) se mantienen para uso del frontend / agentes.
6. **El log de inicio de sesion** (`session.write('log-manager', {msg: 'session.started', ...})`) se preserva.
7. **`LogCollector.start/stop`, `SessionLogger.close`, `LogStorage.close`** siguen llamandose en lifecycle.

## Plan del rewrite

1. Archivar monolito (598 LOC) en `_legacy/log-manager-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v2.1.0 al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, `_buildCorrelationId`).
   - Throws con `_code` canonico de `errors.contract.json` (`MISSING_FIELD`, `RESOURCE_NOT_FOUND`, `DEPENDENCY_UNAVAILABLE`, `UNKNOWN_ERROR`).
   - 13 handlers HTTP devuelven `{status, data | error: {code, message, details?}}`.
   - Telemetria: `logger.info/warn/error` con prefix `log-manager.<accion>` + `metrics.increment('log-manager.handler_error', {code, kind})` en error paths.
3. `module.json` v2.1.0:
   - Bump `version`.
   - Anyadir `observability.tracing.propaga_correlation_id: true`.
   - Anyadir `observability.metrics_emitidas` con `log-manager.handler_error` (counter, labels: code, kind).
4. Tests por capas (`tests/unit/log-manager.test.js`):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica de inputs (handlers que requieren module name / session id).
   - Group 3: HTTP handlers — shape canonico `{status, data}` en exito y `{status, error}` en error.
   - Group 4: Stats / Resumen — agregaciones correctas sobre data sintetica.
   - Group 5: Lifecycle robusto — cleanup interval clearado en onUnload, collector.stop / session.close llamados.
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline.
7. Commit con metricas via `finish-rewrite.js`.
