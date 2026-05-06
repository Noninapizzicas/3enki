# gateway-manager — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar código.

## Identidad

- **Path**: `modules/gateway-manager/`
- **Versión actual**: 1.0.0 → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 311. **LOC base.js**: 350. **LOC gateways/{tcp,ble,usb,cmd}.js**: 411. **Total LOC del módulo**: 1072.
- **Drifts en baseline**: 44 distribuidos en 10 tipos.
- **Categoría**: core (#5 del roadmap, 0 deps upstream).

## Responsabilidad acotada (NO descomponer)

Ciclo de vida de **gateways software** que traducen MQTT a protocolos nativos
(TCP, BLE, USB, CMD). Un gateway es un "ESP32 virtual" — desde el servidor
es indistinguible de un ESP32 real. Mismo contrato MQTT por dispositivo:
birth, status, command, ack.

Sub-piezas (todas pertenecen a la misma responsabilidad acotada):
- **`base.js`**: GatewayBase abstracto con el contrato MQTT (birth, lwt,
  status, command/ack) + lifecycle compartido (start, stop, _addDevice,
  _publishStatus periódico, _handleCommand traducción a protocolo).
- **`gateways/tcp.js | ble.js | usb.js | cmd.js`**: implementaciones por
  protocolo (descubrimiento + creación de transporte).
- **`index.js`**: módulo manager que arranca/para gateways según config y
  expone UI handlers + eventos al bus.

NO se descomponen — es **el mismo dominio** con 4 modalidades de transporte.
La factory map `GATEWAY_TYPES` mantiene el patrón cerrado.

## Inventario completo de métodos (`index.js`, 12 métodos)

### Lifecycle (2)
- `onLoad(core)` — inyecta deps, mergea config (legacy + canónico), arranca
  gateways habilitados.
- `onUnload()` — para todos los gateways + emite `gateway.stopped` por cada
  uno + clear Map.

### Gateway lifecycle privados (2)
- `_startEnabledGateways()` — instancia GatewayClass por tipo habilitado,
  start() + emite eventos. Maneja error sin reintento.
- `_restartGateway(type)` — stop → instanciar de nuevo → start. Devuelve
  `{ success, devices | error }` (drift: shape no canónico).

### UI Handlers (4)
- `handleList()` — todos los gateways con enabled/running/info. Return
  canónico (`{ status, data }`).
- `handleStatus(data)` — info de un gateway. Si no existe devuelve estado
  básico desde config. Return canónico salvo en error 400 → `{ status, error }`
  con string suelto (drift).
- `handleRestart(data)` — para+arranca. Maneja errores con `{ status, error }`
  string suelto (drift).
- `handleDiscover(data)` — instancia gateway temporal solo para descubrir.
  Return canónico salvo errores (drift).

### Métricas (1)
- `internalMetrics` (Object, nunca se reset) — counters: `started_total`,
  `devices_found_total`, `commands_processed_total`, `errors_total`.

## Eventos

### Publishes (4 emitidos, 5 declarados)
1. `gateway.started` — tras gateway.start() exitoso. Payload: `{ type,
   devices_count, timestamp }`.
2. `gateway.stopped` — en onUnload por cada gateway. Payload: `{ type,
   timestamp }`.
3. `gateway.device_found` — por cada device en `gateway.devices`. Payload:
   `{ device_id, gateway_type, device_type, capabilities, timestamp }`.
4. `gateway.error` — catch en _startEnabledGateways. Payload: `{ type,
   error, timestamp }`.

**Drift**: `gateway.device_lost` está declarado en manifest pero NO se
emite. Decisión: en v2.0.0, mantener declarado para que cualquier subclase
pueda emitirlo (extension point) y documentar como tal en module.json,
o removerlo. Plan: **mantenerlo y documentarlo como punto de extensión
para el futuro device-shadow**.

### Subscribes (0)
Ninguno — el flujo de comandos llega via MQTT directo (no por eventBus).
GatewayBase se suscribe directamente a `mqtt.on('message', ...)`.

## Estado interno

- `gateways: Map<type, GatewayBase>` — gateways activos.
- `internalMetrics: Object` — counters in-memory (sin persistencia).
- `config.gateways: { tcp, ble, usb, cmd: { enabled, autodiscovery, manual_devices } }`.

## Drifts conocidos en baseline (44)

| Tipo | Count | Naturaleza |
|---|---|---|
| `error_sin_metric` | 8 | Returns `{ status, error }` sin `metrics.increment`. Drift real. |
| `error_sin_log` | 8 | Returns `{ status, error }` sin `logger.error`. Drift real. |
| `error_como_string_suelto` | 8 | Shape `{ status, error: 'string' }` en handlers. Drift real. |
| `ui_handler_sin_zone_canonica` | 4 | Falso positivo cross-system: ningún módulo declara `zone` aún. |
| `ui_handler_sin_type_canonico` | 4 | Falso positivo cross-system: ningún módulo declara `type` aún. |
| `respuesta_no_canonica` | 4 | Idem error_como_string_suelto desde otro validator. Drift real. |
| `publish_dominio_sin_project_id` | 4 | Falso positivo: gateways operan en plano device, no project. Los devices SÍ tienen `project_id` propio (gateway.projectId). |
| `signature_no_canonica` | 2 | Métricas internas con shape no canónico. |
| `missing_onUnload_with_reservations` | 1 | `internalMetrics` no se limpia (decisión consciente — métricas acumulativas). |
| `log_spam_en_bucle` | 1 | Loop sobre devices con this.logger dentro. |

**Patrón principal**: 4 UI handlers con drift de error shape (return
`{ status, error: 'string' }` en lugar de `{ status, error: { code,
message, details? } }`) + falta de log/metric en error path.

## Cosas críticas a preservar (validación post-rewrite)

1. **5 eventos del bus** (4 emitidos + 1 punto de extensión `gateway.device_lost`).
2. **4 UI handlers** con sus inputs/outputs (list/status/restart/discover).
3. **Compat doble-merge de config**: `core.config['gateway-manager'].gateways`
   (canónico) + `core.config.gateways` (legacy) — ambos deben seguir
   funcionando.
4. **Factory map `GATEWAY_TYPES`** invariante (tcp/ble/usb/cmd).
5. **GatewayBase + 4 subclases** SE PRESERVAN tal cual — la reescritura
   afecta SOLO `index.js` (la lógica de manager).
6. **Resilencia ante MQTT desconectado**: si `eventBus.mqtt` no disponible,
   warn + return graceful (no crash).
7. **handleDiscover sin persistir**: el gateway temporal no se mete en
   `this.gateways` (workaround documentado).
8. **internalMetrics counters** (started_total, devices_found_total,
   commands_processed_total, errors_total).

## Plan del rewrite

1. Archivar monolito (`index.js` 311 LOC) en
   `_legacy/gateway-manager-monolito-pre-rewrite.js.bak`.
   `base.js` y `gateways/*.js` SE PRESERVAN — son la implementación del
   contrato MQTT y no son drift.
2. Reescribir `index.js` v2.0.0 al canon:
   - Helpers POC2 (5).
   - Errors canónicos: throws con `_code` + `_details` en métodos privados.
   - UI handlers con shape canónico `{ status, data | error: { code, message, details? } }`.
   - Telemetría completa (counters por sub-área + errors).
   - `_publicarEvento` con correlation_id (nuevo en cada lifecycle).
3. `module.json` v2.0.0 con observability completa + tracing
   (`propaga_correlation_id: true` aunque no haya subscribes — los
   eventos sí llevan correlation_id).
4. Tests por capas:
   - Group 1: Lifecycle (onLoad sin MQTT vs con MQTT, onUnload limpia).
   - Group 2: Validación canónica (cada UI handler con error 400 + shape canónico).
   - Group 3: handleList con factory map completa.
   - Group 4: handleStatus running vs no running.
   - Group 5: handleRestart success y errors.
   - Group 6: handleDiscover con MQTT y sin MQTT.
   - Group 7: Helpers POC2 internos + factory ext fallback.
5. Wire CI + verificar drift count ≤30%.
6. Commit con métricas + regenerar PROGRESO.

## Decisiones especiales

- **No subscribes a bus**: gateway-manager es un publisher puro al bus
  + listener directo de MQTT. Eso se mantiene (no hay nada que arreglar
  ahí — el contrato MQTT vive fuera del bus interno).
- **`gateway.device_lost` como extension point**: documentar en module.json
  con `notas_extension` para que device-shadow o similares lo puedan emitir.
- **Mocks para tests**: mqtt mock con `isConnected`, `publish`, `subscribe`,
  `on`, `removeListener`. No tocar disco. No abrir sockets reales.
