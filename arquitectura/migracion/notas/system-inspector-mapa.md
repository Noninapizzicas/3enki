# system-inspector — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — secciones `<TODO>` cerradas.

## Identidad

- **Path**: `modules/system-inspector/`
- **Version actual**: 1.0.0 → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 235 (monolito archivado).
- **Drifts en baseline**: 20 (12 tipos).
- **Categoria**: infra.
- **Description oficial**: Captura estado del sistema (HTTP, MQTT, errores, logs) para consulta por IA.

## Responsabilidad acotada

Observador pasivo dev-only del sistema: captura HTTP/MQTT/errores/logs en buffer circular in-memory, persiste snapshot a archivo JSON cada N segundos, expone 4 APIs HTTP read-only (status/errors/network/clear) para que la IA consulte el estado del runtime. NO se descompone — los 4 interceptores (HTTP, MQTT, errores, archivo) son helpers internos coordinados por una sola entidad cuya responsabilidad unica es "consola tipo DevTools del backend". Separar en 4 modulos crearia falsa simetria (cada interceptor depende del mismo buffer compartido in-memory).

## Inventario de eventos (extraido del audit)

### Publishes (0)

- _(ninguno por diseno — modulo puramente observador, NO emite al bus para evitar recursion via los wildcards `core/+/events/#`)._

### Subscribes (2 — wildcards MQTT, observacion pasiva)

- `core/+/events/#` → captura via MqttInterceptor en buffer (no hay handler nominal, son wildcards observacionales del bus).
- `core/+/errors/#` → captura via MqttInterceptor en buffer.

## Drifts conocidos en baseline (20)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_como_string_suelto` | 4 | real — handlers HTTP devuelven `{ error: 'string' }` en vez de `{ status, error: { code, message } }`. **Cierra con helpers POC2.** |
| `drift_non_canonical_routing` | 4 | falso positivo — `core/+/events/#` y `core/+/errors/#` son wildcards declarados intencionalmente para observacion pasiva (uno de los 2 modulos del repo con este patron, declarado en outliers del audit). Se mantienen — son la naturaleza del modulo. |
| `drift_signature_no_canonica` | 2 | real — `handleGetStatus(req, res)` etc. firma legacy. **Cierra cambiando a `(req, context)` canonico**. |
| `drift_console_log_directo` | 2 | real — `lib/file-writer.js` y `lib/error-interceptor.js` usan `console.error`. **Cierra mediante callback opcional al logger del modulo (sin acoplar libs al core).** |
| `drift_design_doc_propio_de_modulo` | 1 | falso positivo — `MEJORAS.md` es documento de roadmap propio. **Mantener (deuda documental, no de codigo).** |
| `drift_respuesta_no_canonica` | 1 | real — handlers devuelven shape libre. **Cierra con helpers POC2.** |
| `drift_auth_undeclared` | 1 | real, parcial — endpoints sin auth. **Documentar como deuda en `MEJORAS.md` P0; el modulo es `dev_only=true` por lo que el riesgo es acotado.** Mitigacion sin auth real: declaracion explicita en `module.json.security`. |
| `drift_missing_onUnload_with_reservations` | 1 | real — onUnload no limpia `buffer`/`fileWriter`/`mqttInterceptor` correctamente. **Cierra con onUnload canonico.** |
| `drift_correlation_id_no_propagado` | 1 | falso positivo segun audit (modulo no publica eventos), pero igualmente se anyade `tracing.propaga_correlation_id=true` en module.json + helper `_publicarEvento` listo para futuras emisiones. |
| `drift_non_atomic_write` | 1 | real — `file-writer.js` escribe directo. **Cierra con tmp+rename atomico.** |
| `drift_silent_io_failure` | 1 | real, parcial — file-writer ya silencia repetidos pero pierde la senal. **Cierra reportando primer fallo via callback al logger del modulo.** |
| `drift_undeclared_persistence_pattern` | 1 | real — module.json no declara `config.persistence`. **Cierra con `persistence: { type: "json-file", path, atomic: true }`.** |

Patron principal: **~14 de 20 drifts son reales y se cierran con el patron POC2 estandar** (helpers + onUnload + atomic write). Los 6 falsos positivos son justificables (wildcards pasivos por diseno, design-doc auxiliar) o se compensan declarativamente (auth en `MEJORAS.md`, correlation_id en `module.json` aunque no se use ahora).

## Cosas criticas a preservar (validacion post-rewrite)

1. **Early exit dev-only**: `NODE_ENV=production && !force_in_production` → log `system-inspector.skipped` + return. **Sin esto el modulo se cargaria en prod, lo cual no debe ocurrir.**
2. **Buffer circular FIFO** (`maxSize` con `unshift` + `pop`): preservado en `lib/console-buffer.js` (no se toca).
3. **4 endpoints HTTP read-only intactos**: `/status`, `/errors`, `/network`, `/clear`. Mismas paths, mismos handler names. Cambia el shape de retorno a canonico.
4. **5 interceptores activables independientemente** via `config.capture.{http,mqtt,errors,logs,validation}`: cada uno se inicializa solo si su flag esta on.
5. **No-loop con propio modulo**: MqttInterceptor ignora topics que matcheen `system-inspector` (ya implementado en `lib/mqtt-interceptor.js`). ErrorInterceptor descarta logs cuyo `source === 'system-inspector'`. Preservar.
6. **Wildcards declarados en module.json.events.subscribes** (`core/+/events/#`, `core/+/errors/#`): son la naturaleza del modulo. Conservar declaracion exacta.
7. **lib/* helpers internos**: `console-buffer.js`, `http-interceptor.js`, `error-interceptor.js`, `mqtt-interceptor.js`, `file-writer.js`. Solo se tocan minimos:
   - file-writer.js: anyadir tmp+rename atomico + callback al logger del modulo (sin `console.error`).
   - error-interceptor.js: cambiar `console.error` interno (ninguno actual — todo va via this.logger ya).
   Resto del comportamiento se preserva.
8. **No emitir al bus**: aunque se anyade `_publicarEvento` por consistencia POC2, el modulo NO publica nada hoy (recursion). Tests deben verificar `published.length === 0` en cualquier flujo.

## Plan del rewrite

1. Archivar monolito (235 LOC) en `_legacy/system-inspector-monolito-pre-rewrite.js.bak`. _(automatico via scaffold — hecho)_
2. Reescribir `index.js` v2.0.0 al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `_buildLogProxy` para inyectar logger del modulo en libs sin acoplarlas al core).
   - Throws con `_code` canonico (no aplica masivo — solo HTTP handlers).
   - Handlers HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `system-inspector.*`: counters `entries.captured`, `errors.captured`, `http.captured`, `mqtt.captured`, gauges `buffer.size`, `entries.count`, `pending_requests.size`.
   - Firma canonica `handle*(req, context)`.
   - onUnload limpia buffer + interceptores + fileWriter + clear maps.
3. `lib/file-writer.js`: tmp+rename atomico + callback al logger del modulo.
4. `module.json` v2.0.0:
   - `tracing.propaga_correlation_id: true`.
   - `config.persistence: { type: "json-file", path, atomic: true }`.
   - `observability.metrics.counters` y `gauges` declarados explicitamente.
   - `dev_only: true` mantenido + nota de seguridad.
5. Tests por capas (`tests/unit/system-inspector.test.js` ya scaffoldeado):
   - Group 1: Lifecycle (onLoad inicializa buffer + interceptores condicionales; onUnload limpia todo; early-exit en production).
   - Group 2: HTTP handlers shape canonico (status, errors, network, clear).
   - Group 3: Buffer behavior (FIFO, getFullState, getSummary).
   - Group 4: Atomic file write (tmp+rename, error path).
   - Group 5: Buffer clear via DELETE.
   - Group 6: Helpers POC2 internos (Group 7 del template).
   - Group 7: Helpers POC2 internos (igual a todos los modulos canonicos).
6. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold — hecho)_
7. Verificar drift count post-rewrite ≤ 50% del valor previo (20 → ≤10). Regenerar baseline.
8. Commit con metricas via `finish-rewrite.js`.
