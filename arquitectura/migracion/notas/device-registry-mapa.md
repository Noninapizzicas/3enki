# device-registry — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js`.

## Identidad

- **Path**: `modules/device-registry/`
- **Version actual**: 1.0.0 → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 702.
- **Drifts en baseline**: 43 (11 tipos).
- **Categoria**: infra (tier_2_platform).
- **Description oficial**: Fuente única de verdad de todos los dispositivos IoT del sistema — ESP32, gateways, periféricos manuales.

## Responsabilidad acotada

device-registry mantiene el registro autoritativo de cada dispositivo IoT del sistema (device_id, project_id, type, capabilities, firmware, metadata, estado online/offline, last_seen). NO se descompone porque sus 3 responsabilidades (auto-descubrimiento via MQTT birth/status, tracking online/offline via LWT+heartbeat, API de consulta para otros modulos) son intrinsecamente la misma cosa: "registro de dispositivos vivo". Modulos hermanos `device-shadow` (estado desired/reported/delta) y `device-health` (metricas de salud) son responsabilidades distintas que ya estan separadas correctamente.

## Inventario de eventos (extraido del audit)

### Publishes (5 nombres, 9 sites en monolito)

- `device.registered` — emitido en 3 paths: `_handleBirth` (l.252), `_handleStatus` auto-discovery (l.327), `onDeviceRegister` event handler (l.443).
- `device.online` — emitido en 3 paths: `_handleBirth` (l.255), `_handleStatus` auto-discovery (l.328), `_handleStatus` cuando wasOffline (l.352).
- `device.offline` — emitido en 2 paths: `_handleLwt` (l.278), heartbeat timeout (l.380).
- `device.unregistered` — emitido en 1 path: `onDeviceUnregister` (l.463).
- `device.updated` — declarado en manifest pero NO emitido (drift del audit). En el rewrite se emite cuando cambian firmware/driver/metadata en `_handleStatus` para device existente.

### Subscribes (2)

- `device.register` → `onDeviceRegister` (registro manual via bus).
- `device.unregister` → `onDeviceUnregister` (desregistro via bus).

### Listeners MQTT (no eventos del bus)

- `devices/+/+/birth` → auto-registro como online.
- `devices/+/+/lwt` → marcar offline (Last Will).
- `enki/+/status/+` → auto-discovery / heartbeat reset.
- `impresion/+/status/+` → auto-discovery legacy (compat firmware antiguo).

## Drifts conocidos en baseline (43)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_publish_dominio_sin_project_id` | 9 | REAL — `device.registered` lleva `{ device: {…} }` con `project_id` anidado dentro de `device`, no top-level. Resto de publishes ya llevan `project_id` top-level. Rewrite añade `project_id` top-level a TODOS los publishes. |
| `drift_ui_handler_sin_type_canonico` | 5 | FALSO POSITIVO sistemico — el catalogo del validator espera `type` por handler en signature; `module.json` ya declara `domain`+`action` canonicos. Mismo patron observado en `device-shadow` ya migrado (no se cierra). |
| `drift_ui_handler_sin_zone_canonica` | 5 | FALSO POSITIVO sistemico — idem `type`, validator espera `zone`. Patron compartido con `device-shadow`. |
| `drift_error_como_string_suelto` | 4 | REAL — UI handlers devuelven `{ status: 400, error: 'device_id requerido' }` con `error` como string. Rewrite canoniza a `{ status, error: { code, message, details? } }`. |
| `drift_error_sin_log` | 4 | REAL — error returns de UI handlers no llaman a `logger.error` ni `logger.warn`. Rewrite añade log via `_handleHandlerError`. |
| `drift_error_sin_metric` | 4 | REAL — error returns no emiten `metrics.increment('device-registry.errors', { kind, code })`. Rewrite añade via `_handleHandlerError`. |
| `drift_raw_topic_in_publish` | 4 | FALSO POSITIVO — son strings literales en `mqtt.subscribe('devices/+/+/birth')` que el validator confunde con publishes raw a MQTT. Las suscripciones MQTT son legitimas (modulo infra que escucha hardware). |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 3 | REAL — los 3 tools (`devices.list`, `devices.get`, `devices.stats`) no declaran `errores_conocidos` y sus handlers devuelven errores. Rewrite añade `errores_conocidos` al `module.json`. |
| `drift_tool_handler_que_devuelve_valor_pelado` | 3 | REAL — handlers a veces devuelven `{ status, data }` y a veces `{ status, error }` con shape no canonico. Rewrite uniforma. |
| `drift_correlation_id_no_propagado` | 1 | REAL — ningun publish lleva `correlation_id`. Rewrite usa `_publicarEvento` que genera uno nuevo (modulo infra origen de eventos hardware). |
| `drift_log_spam_en_bucle` | 1 | DUDOSO — probable detector falso por `_recalcMetrics` llamado tras cada mutacion. No es spam (cada llamada es 1 log info), pero rewrite reduce frecuencia y silencia el recompute. |

**Patron principal**: ~30 drifts reales de canonizacion estandar (errors shape, correlation_id, project_id top-level, errores_conocidos en tools), ~13 falsos positivos sistemicos del catalogo del validator (mismo patron sufrido por `device-shadow`). El rewrite cierra los reales; los sistemicos quedan como remanente esperable < 50% (objetivo del threshold).

## Cosas criticas a preservar (validacion post-rewrite)

1. **Auto-descubrimiento MQTT** — los 4 patrones de topic deben seguir funcionando: `devices/+/+/birth`, `devices/+/+/lwt`, `enki/+/status/+`, `impresion/+/status/+`. Ningun firmware existente puede dejar de ser visto.
2. **Heartbeat timeout** — sin status MQTT durante `heartbeat_timeout_ms` (default 90s) → publica `device.offline` con `reason: 'heartbeat_timeout'`. Critico para detectar dispositivos muertos.
3. **Persistencia atomica al disco** — `registry.json` se escribe via `tmp + rename` (rewrite usa el mismo patron que `device-shadow`). Se hidrata al `onLoad` y todos los devices arrancan en estado `offline` hasta que llegue su primer status/birth (sano: la realidad MQTT manda).
4. **Public API consumida por otros modulos** — `getDevice(id)`, `listDevices(filter)`, `isOnline(id)`. Otros modulos hacen `core.modules.get('device-registry')` y los llaman directamente. NO romper signatures.
5. **UI handlers** — los 5 (`list`, `get`, `register`, `unregister`, `stats`) sobre `domain: devices`. Frontend del admin-panel los usa.
6. **Tools** — los 3 (`devices.list`, `devices.get`, `devices.stats`) los usa el LLM via ai-agent-framework.
7. **Bus handlers** — `device.register` / `device.unregister` los usan modulos de dominio para registrar dispositivos manuales no descubiertos via MQTT.
8. **Eventos del bus** — los 5 (`device.registered`, `device.unregistered`, `device.online`, `device.offline`, `device.updated`) los consumen otros modulos. `device.updated` empieza a emitirse de verdad en este rewrite (drift cerrado).
9. **Auto-registro desde status** — un status MQTT de un device no registrado lo registra automaticamente (path en `_handleStatus`). Critico para descubrir devices que arrancaron antes que el modulo.
10. **Metricas internas** — `internalMetrics` (contadores totales) se preserva para consultas via `handleStats`.

## Plan del rewrite

1. Archivar monolito (702 LOC) en `_legacy/device-registry-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v2.0.0 al canon (Write completo, ~580 LOC esperadas):
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, `_parsePayload` como auxiliar canonico de parsing MQTT).
   - Throws con `_code` canonico en errores internos.
   - Handlers UI/tools devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `device-registry.*` (counters por tipo de evento + errors counter).
   - Todos los publishes llevan `correlation_id` + `timestamp` via `_publicarEvento`.
   - Todos los publishes llevan `project_id` top-level (no anidado en `device`).
   - `device.updated` se emite en `_handleStatus` cuando cambian firmware/driver/metadata en device existente.
3. `module.json` v2.0.0:
   - `tracing.propaga_correlation_id: true`.
   - `errores_conocidos` en cada tool.
   - `config.persistence` declarada (json-file, atomic).
   - Counters canonicos.
4. Tests por capas (`tests/unit/device-registry.test.js`):
   - Group 1: Lifecycle (skeleton + state cleanup en onUnload).
   - Group 2: Validacion canonica de UI handlers.
   - Group 3: Bus handlers (register/unregister) con `device.registered`/`device.unregistered` validados.
   - Group 4: MQTT handlers (`_handleBirth`, `_handleLwt`, `_handleStatus`) y emision de eventos del bus correspondientes.
   - Group 5: Heartbeat timeout → publica `device.offline`.
   - Group 6: UI handlers exitosos (list/get/stats) + Public API + persistencia atomica.
   - Group 7: Helpers POC2 (skeleton listo).
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline.
7. Commit con metricas via `finish-rewrite.js`.
