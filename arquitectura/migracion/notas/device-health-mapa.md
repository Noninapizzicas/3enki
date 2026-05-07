# device-health — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/device-health/`
- **Version actual**: 1.0.0 → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 477.
- **Drifts en baseline**: 24 (14 tipos).
- **Categoria**: infra (tier_3_core declarado en manifest, aunque conceptualmente es infra observador — lo migramos como infra siguiendo a sus dos hermanos device-registry y device-shadow).
- **Description oficial**: Monitorización de liveness, uptime, alertas y métricas de la flota de dispositivos IoT.

## Responsabilidad acotada

device-health es el **observador puro** de la flota IoT: escucha eventos `device.online/offline` (de device-registry) y `firmware.ota_failed/completed` (de firmware-manager), mantiene state por dispositivo (uptime%, reconexiones, periodos offline, historial OTA) y emite alertas (`health.alert.<type>`) + reportes periódicos (`health.report`). NO toma acciones correctivas — sólo informa. NO se descompone porque las 4 responsabilidades (tracking de state, detección de offline prolongado, detección de reconnect-loops, generación de alertas + reporte periódico) son intrínsecamente la misma cosa: "vigilancia continua de la flota". Modulos hermanos `device-registry` (registro autoritativo) y `device-shadow` (estado desired/reported) son responsabilidades distintas ya separadas correctamente — la trifecta queda completa con esta migración.

## Inventario de eventos (extraido del audit)

### Publishes (4 nombres canónicos, 2 sites en monolito)

- `health.alert.offline` / `health.alert.reconnect_loop` / `health.alert.ota_failed` — emitidos en `_createAlert` (l.363) via template literal `health.alert.${type}`. Manifest declara los 3 explícitamente; audit los marca como `declarados_no_emitidos` por el patrón dinámico (cosmético, no es bug). Rewrite los conserva como dynamic publish con whitelist.
- `health.report` — emitido en `_publishReport` (l.389), tick periódico cada `report_interval_min` (default 60min).

### Subscribes (4)

- `device.online` → `onDeviceOnline` (l.114): registra reconexión, calcula offline_period si venía offline, detecta reconnect-loop si supera threshold en ventana, cancela offline-timer.
- `device.offline` → `onDeviceOffline` (l.159): marca offline, programa setTimeout para alerta de offline prolongado (cancelable si vuelve online antes).
- `firmware.ota_failed` → `onOtaFailed` (l.186): genera alerta `health.alert.ota_failed`, guarda registro en ota_history.
- `firmware.ota_completed` → `onOtaCompleted` (l.203): guarda registro `completed` en ota_history (sin alerta).

### Tools (3)

- `health.dashboard` → `handleDashboard` — resumen de la flota.
- `health.device_history` → `handleDeviceHistory` — historial detallado por device_id.
- `health.alerts` → `handleAlerts` — listado/filtrado de alertas.

## Drifts conocidos en baseline (24)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_ui_handler_sin_type_canonico` | 3 | FALSO POSITIVO sistemico — validator espera `type` por handler signature; `module.json` declara `domain`+`action` canonicos. Mismo patron que device-shadow/registry. No se cierra. |
| `drift_ui_handler_sin_zone_canonica` | 3 | FALSO POSITIVO sistemico — idem. |
| `drift_tool_handler_que_devuelve_valor_pelado` | 3 | REAL — handlers devuelven mezcla de shapes; rewrite uniformiza al `{status, data | error}` canonico. |
| `drift_error_como_string_suelto` | 2 | REAL — `handleDeviceHistory` devuelve `{ status: 400, error: 'device_id requerido' }` con error string. Canonizado. |
| `drift_error_sin_log` | 2 | REAL — error returns no llaman `logger.warn/error`. Canonizado via `_handleHandlerError`. |
| `drift_error_sin_metric` | 2 | REAL — error returns no emiten `metrics.increment('device-health.errors', ...)`. Canonizado. |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 2 | REAL — `module.json` tools sin `errores_conocidos`. Añadido. |
| `drift_missing_onUnload_with_reservations` | 1 | DUDOSO — onUnload SI existe y limpia timers + persiste, pero no resetea `deviceStates`/`alerts`/`internalMetrics`. Rewrite anyade el reset al final del onUnload. |
| `drift_publish_dominio_sin_project_id` | 1 | REAL en `health.report` (no lleva project_id porque es agregado de toda la flota). FALSO POSITIVO contextual: este evento es global, no por proyecto. Las alertas SI llevan project_id top-level. Documentado en module.json description. |
| `drift_correlation_id_no_propagado` | 1 | REAL — ningún publish lleva correlation_id. Rewrite usa `_publicarEvento` que genera uno nuevo (modulo origen de eventos derivados de bus, no aguas abajo de un canal). |
| `drift_mensaje_sin_estructura` | 1 | REAL — los `message` de las alertas son strings con interpolación de fields. Rewrite anyade `details` estructurado al evento (`reason`, `count`, `window_min`) ademas del message human-readable. |
| `drift_non_atomic_write` | 1 | REAL — `_saveHistory` escribe directo con `writeFile`. Rewrite usa patron tmp+rename como device-shadow/registry. |
| `drift_unbounded_growth_no_eviction` | 1 | DUDOSO — el audit menciona `deviceStates` Map sin invalidación, pero la realidad es que crece según unique device_ids (acotado por la flota real, no por uso). FALSO POSITIVO en este contexto; los sub-arrays (offline_periods, ota_history, reconnections_24h) SÍ tienen eviction. Documentado en mapa. |
| `drift_undeclared_persistence_pattern` | 1 | REAL — `module.json.config` no declara `persistence`. Rewrite anyade `persistence: { type: 'json-file', path, atomic }`. |

**Patron principal**: ~14 drifts reales de canonizacion estandar (errors shape, correlation_id, persistencia atomica, errores_conocidos), ~6 falsos positivos sistemicos (los mismos que afectaron a device-shadow y device-registry), ~4 dudosos donde el audit es mas estricto que el codigo real. Esperado quedar < 50% drift residual tras rewrite.

## Cosas criticas a preservar (validacion post-rewrite)

1. **Observador puro**: NO emitir actuators ni hacer requests al bus para corregir nada. Solo escuchar y emitir alertas/reportes. Doctrina explicita en comentario del monolito (l.14).
2. **Alertas dinámicas con type whitelist**: `offline`, `reconnect_loop`, `ota_failed`. Manifest declara los 3 explicitamente — el rewrite mantiene el patron dinamico pero con `KNOWN_ALERT_TYPES` = whitelist constant.
3. **Detección de offline prolongado** via setTimeout por device, cancelable. Es el corazón del valor del módulo: sin este timer no hay alerta.
4. **Detección de reconnect-loop** via sliding window de timestamps en `reconnections_24h`. Calcula reconexiones dentro de `reconnect_loop_window_min` (default 30min). Si > `reconnect_loop_threshold` (default 5) → alerta.
5. **Cálculo de uptime% últimas 24h** en `handleDashboard`: usa `offline_periods` para reconstruir tiempo offline; si actualmente offline, descuenta hasta `now`.
6. **Persistencia de state + alerts** en `data/devices/health-history.json`. Se carga al onLoad, se guarda al onUnload. Cambia a atómica (tmp+rename) en el rewrite.
7. **FIFO de alertas** con cap `maxAlerts=200`: `unshift` al frente, `pop` cuando supera el cap. Crítico para evitar growth ilimitado.
8. **Eviction de sub-arrays**: `offline_periods` cap 50, `ota_history` cap 20. Preservados.
9. **Reporte periódico** en `setInterval` cada `report_interval_min`. Limpia interval en `onUnload`.
10. **Multi-shape unwrap del evento**: `event?.data || event?.payload || event` — patrón compartido con device-shadow para tolerar variantes del bus.

## Plan del rewrite

1. Archivar monolito (477 LOC) en `_legacy/device-health-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v2.0.0 al canon (Write completo, ~510 LOC esperadas):
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, `_publishAlertEvent` como auxiliar del dominio que aplica whitelist + correlación + estructura `details`).
   - Handlers UI/tools devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `device-health.*` (counters por tipo de alerta + errors counter + gauges de flota).
   - Todos los publishes llevan `correlation_id` + `timestamp` via `_publicarEvento`.
   - Whitelist `KNOWN_ALERT_TYPES = ['offline', 'reconnect_loop', 'ota_failed']` enforced en `_createAlert`.
   - Persistencia atómica via tmp+rename.
   - `onUnload` resetea state runtime al final (devices, alerts, metrics).
3. `module.json` v2.0.0:
   - `tracing.propaga_correlation_id: true`.
   - `errores_conocidos` en cada tool.
   - `config.persistence: { type: 'json-file', path: 'data/devices/health-history.json', atomic: true }`.
   - Counters canonicos + gauges.
4. Tests por capas (`tests/unit/device-health.test.js`):
   - Group 1: Lifecycle (skeleton + state cleanup en onUnload).
   - Group 2: Validacion canonica de UI handlers.
   - Group 3: Bus handlers (online/offline/ota_failed/ota_completed) con state transitions verificadas.
   - Group 4: Detección de reconnect-loop (sliding window + threshold).
   - Group 5: Detección de offline prolongado (setTimeout cancelable).
   - Group 6: UI handlers exitosos (dashboard/history/alerts) + persistencia atomica.
   - Group 7: Helpers POC2 (skeleton listo).
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline.
7. Commit con metricas via `finish-rewrite.js`.
