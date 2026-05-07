# staff-manager — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/staff-manager/`
- **Version actual**: 1.0.0 → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 393.
- **Drifts en baseline**: 67 (8 tipos).
- **Categoria**: dominio.
- **Idioma**: `en` (verbos compuestos `tap_in`, `tap_out`, `auto_timeout`, `manager_close` permitidos por whitelist).
- **Description oficial**: Control de personal con tarjetas NFC (NTAG215) — jornada y distribucion de llaves. NTAG215 = chip NFC de 540 bytes utiles para empleados y onboarding de tablets via core-tag.

## Responsabilidad acotada

Gestiona empleados (CRUD), sesiones de jornada por tap NFC (tap_in/tap_out con auto_timeout y manager_close), y generacion/parsing de payloads NFC NTAG215 (tarjeta de empleado + tag del core para onboarding de tablets). NO se descompone porque las 3 sub-libs (`employee-registry`, `session-manager`, `nfc-card`) ya estan separadas en `lib/` y comparten el mismo dominio del personal: `index.js` orquesta los 3 + emite eventos canonicos del bus.

## Inventario (post-rewrite shape)

### Publishes (4) — declarados en manifest, EMITIDOS via `_publicarEvento`

- `staff.session.tap_in` — emitido cuando `SessionManager.tapIn()` crea sesion via callback `onSessionEvent`.
- `staff.session.tap_out` — emitido cuando `SessionManager.tapOut()` cierra sesion.
- `staff.session.auto_timeout` — emitido por el monitor periodico de `SessionManager` cuando una sesion supera `maxShiftHours`.
- `staff.session.manager_close` — emitido cuando un manager cierra sesion ajena via API.

**Drift critico cerrado**: el monolito usa `eventBus.emit()` (Node EventEmitter) en lugar de `eventBus.publish()` — patron unico en el repo. El validator de eventos NO detecta los publishes y los marca como "declarados pero no emitidos". El rewrite usa `_publicarEvento(name, payload, sourcePayload)` que llama a `eventBus.publish` con `correlation_id + project_id + timestamp` enriquecidos.

### Subscribes (0)

Modulo no consume eventos del bus — solo emite. Documentado.

### Tools (0)

No expuesto al LLM. Si se quisieran exponer (ej: `staff.tap_in`, `staff.list_employees`), seria un sub-contrato futuro. Drift residual aceptado.

### UI handlers (15) — antes en `provides.apis` (HTTP-shape), AHORA en `ui_handlers` (mqttRequest cross-modulo)

| action | handler |
|---|---|
| `status` | `handleStatus` |
| `employee.create` | `handleEmployeeCreate` |
| `employee.list` | `handleEmployeeList` |
| `employee.get` | `handleEmployeeGet` |
| `employee.update` | `handleEmployeeUpdate` |
| `employee.delete` | `handleEmployeeDelete` |
| `session.tap_in` | `handleTapIn` |
| `session.tap_out` | `handleTapOut` |
| `session.active` | `handleActiveSessions` |
| `session.history` | `handleSessionHistory` |
| `session.stale` | `handleStaleSessions` |
| `session.manager_close` | `handleManagerClose` |
| `nfc.employee_card` | `handleNfcEmployeeCard` (case normalizado: `NFC` → `Nfc`) |
| `nfc.core_tag` | `handleNfcCoreTag` |
| `nfc.parse` | `handleNfcParse` |

**Cambios de signatura**:
- Antes: `handleX({ body, query, params })` (HTTP-shape).
- Ahora: `handleX(data)` con un solo arg (mqttRequest pattern). Los campos vienen flat en `data`: `data.name`, `data.id`, `data.active_only`, etc.

## Drifts conocidos en baseline (67 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_error_sin_log` | 19 | Real — `return { status: 400, error: '...' }` sin logger en proximidad. | `_handleHandlerError` o `_logError` antes del return. |
| `drift_error_sin_metric` | 19 | Real — mismos sites sin `metrics.increment`. | Mismo helper. |
| `drift_error_como_string_suelto` | 13 | Real — `error: 'name y role son requeridos'`. | `_errorResponse(400, 'INVALID_INPUT', ..., { fields: [...] })`. |
| `drift_non_canonical_routing` | 12 | Real — `provides.apis` con HTTP-shape (`method/path`) en lugar de `ui_handlers` con `domain/action/handler`. | Migrar manifest a `ui_handlers` canonico + eliminar `_registerUIHandlers` (auto-wired por loader). |
| `drift_emit_bypass` | 1 | Real — `eventBus.emit()` en lugar de `eventBus.publish()`. | `_publicarEvento` usa `publish`. |
| `drift_undeclared_persistence_pattern` | 1 | Real — module.json sin `config.persistence`. | Declarar `persistence: { type: "sqlite-via-sql.js", path: "data/staff/", ... }`. |
| `drift_signature_no_canonica` | 1 | Real — handlers con `({ body })` en vez de `(data)`. | Normalizar a `(data)`. |
| `drift_missing_onUnload_with_reservations` | 1 | Real — onUnload no clear de `this.core` ni `this.metrics`. | Limpiar referencias en onUnload. |

## Cosas criticas a preservar

1. **4 nombres de eventos** invariantes: `staff.session.{tap_in, tap_out, auto_timeout, manager_close}`.
2. **Sub-libs en `lib/`**: `employee-registry.js`, `session-manager.js`, `nfc-card.js` — no se tocan en este rewrite. APIs publicas:
   - `EmployeeRegistry`: `initialize(SQL)`, `close()`, `createEmployee/listEmployees/getEmployee/updateEmployee/deleteEmployee`.
   - `SessionManager`: `initialize(SQL)`, `close()`, `tapIn/tapOut/listActiveSessions/listSessionsByEmployee/listSessionsByDate/listStaleSessions/managerClose`, callback `onSessionEvent(type, data)`.
   - `NFCCard`: `generateEmployeeCard(employee)`, `generateCoreInfoTag({ core_id, endpoint, publicKeyPEM })`, `parsePayload(raw)`, `serialize(payload)`, `byteSize(payload)`.
3. **`maxShiftHours` configurable** con default 16 — preservado.
4. **`dataPath` configurable** con default `./data/staff` — preservado.
5. **Capacidad NTAG215 = 504 bytes** — chequeo `fits` en payloads NFC preservado.
6. **Acceso a `security-p2p` para core-tag** — `_getSecurityP2PPublicKey` accede via `core.moduleLoader.loadedModules.get('security-p2p')` con manejo defensivo (devuelve null sin crashear). Preservado.
7. **`sql.js`** — `initSqlJs()` se inicializa en onLoad y se pasa a `registry.initialize(SQL)` y `sessions.initialize(SQL)`. Preservado.

## Naming/manifest mismatches a cerrar

- **`provides.apis` con HTTP-shape** → `ui_handlers` con canonical shape (`domain/action/handler/type/zone`).
- **`handleNFCEmployeeCard/CoreTag/Parse`** (acronimo CapitalCase) → `handleNfcEmployeeCard/CoreTag/Parse` (camelCase canonico). El audit mismo lo reporta como inconsistente.
- **Eliminar `_registerUIHandlers`** y `_uiActions` — el loader del repo ya auto-wirea `module.json.ui_handlers`.
- **`eventBus.emit`** → `eventBus.publish` via `_publicarEvento`.

## Plan del rewrite

1. Archivar monolito (393 LOC) en `_legacy/`. _(automatico)_
2. Reescribir `index.js` v2.0.0 al canon:
   - 5 helpers POC2: `_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, auxiliar `_emitSessionEvent` (refactorizado para usar `_publicarEvento` con metric).
   - Auxiliar segundo: `_getSecurityP2PPublicKey` (preservado del monolito).
   - 15 ui_handlers normalizados a `(data)` + shape canonico `{ status, data | error: { code, message, details? } }`.
   - Telemetria: emit metrics `staff.tap_in.count`, `staff.tap_out.count`, `staff.auto_close.count` (declaradas en manifest, no emitidas en monolito), `staff.manager_close.count` (nuevo) + `staff-manager.errors`.
   - onUnload limpia `core`, `metrics`, `registry`, `sessions`.
   - Eliminar `_registerUIHandlers` + `_uiActions` (auto-wired).
3. `module.json` v2.0.0:
   - `tracing.propaga_correlation_id: true`.
   - Migrar `provides.apis` → `ui_handlers` con `type: "system_panel"`, `zone: "lateral_derecha"` (admin/staff control).
   - Declarar `config.persistence: { type: "sqlite-via-sql.js", paths: ["data/staff/staff.db", "data/staff/staff_sessions.db"], concurrency: "single-instance-per-process" }`.
   - `observability.metrics.counters` ampliado.
4. Tests por capas:
   - Group 1 Lifecycle: onLoad inicializa registry+sessions, onUnload limpia.
   - Group 2 Validacion canonica: 15 ui_handlers con args ausentes → 400 INVALID_INPUT.
   - Group 3 Empleados CRUD success: create, get, update, delete con mocks de registry.
   - Group 4 Sesiones success: tap_in / tap_out / manager_close emiten eventos canonicos via `eventBus.publish` (no emit).
   - Group 5 NFC: generate employee_card / core_tag / parse devuelven shape canonico + chequean limite NTAG215.
   - Group 6 Bus: `_emitSessionEvent` propaga correlation_id + project_id + timestamp.
   - Group 7 Helpers POC2.
5. Wire CI _(automatico)_.
6. Verificar drift count → cerrar baseline. Esperado: 67 → ≤20 (~70%).
7. Commit con metricas.
