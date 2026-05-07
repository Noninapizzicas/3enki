# perifericos — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — secciones completadas tras
leer audit, monolito legacy, naming.json, glossary.json, frontend.contract,
errors.contract y module-rewrite.contract.

## Identidad

- **Path**: `modules/perifericos/`
- **Version actual**: 1.1.0 (manifest) / 1.2.0 (codigo — drift) → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 738.
- **Drifts en baseline**: 79 (9 tipos).
- **Categoria**: tier_2_platform (carga antes que dominios pizzepos/cocina/etc.).
- **Idioma**: `es` (segun module.json.language).
- **Description oficial**: Servicio core de perifericos — descubrimiento, registro y routing de dispositivos hardware. Capacidades genericas: imprimir, display, abrir-cajon.

## Responsabilidad acotada

Resuelve `nombre logico de capacidad → dispositivo fisico → transporte`. Los modulos
de dominio (pizzepos, cocina, cobros, cnc) publican eventos de capacidad
(`periferico.imprimir`, `.display`, `.abrir-cajon`) sin saber qué dispositivo lo
ejecuta ni cómo viaja (BLE, TCP, ESP32-MQTT, comando shell). Perifericos resuelve el
routing y delega al provider `local.perifericos`. NO se descompone porque las 7 caps
+ 9 ui_handlers comparten la misma maquinaria (provider + transportes + registry +
auto-descubrimiento MQTT) — descomponer separaria handlers homogeneos sin ganancia.

## Inventario de eventos (post-deduplicacion del audit)

### Publishes (8 unicos — 12 paths en monolito por duplicacion en handlers/UI/auto-discovery)

- `periferico.impreso` — emitido tras `provider.send` exitoso en `onImprimir`. Payload: `{ destino, formato, copias }`.
- `periferico.displayed` — emitido tras `provider.send` exitoso en `onDisplay`. Payload: `{ destino, accion }`.
- `periferico.cajon-abierto` — emitido tras enviar comando ESC/POS de apertura en `onAbrirCajon`. Payload: `{ destino, pin }`.
- `periferico.estado.respuesta` — emitido tras `provider.status` (ambos paths: validacion `nombre` ausente Y respuesta normal). En el rewrite UNIFICADO en `_publicarEvento`. Payload: `{ nombre, ...status }`.
- `periferico.listado` — emitido tras `provider.list`. Payload: `{ dispositivos, total }`.
- `periferico.dispositivo.registrado` — emitido en 3 paths del monolito: bus handler `onRegistrar` (339), UI handler `handleRegistrar` (406), auto-discovery `_handleDiscoveryMessage` (701). UNIFICADO en rewrite. Payload: `{ dispositivo, source }`.
- `periferico.dispositivo.desregistrado` — emitido en 2 paths: bus handler `onDesregistrar` (361), UI handler `handleDesregistrar` (435). UNIFICADO. Payload: `{ nombre }`.
- `periferico.error` — emitido por helper `_emitError`. Payload: `{ error, contexto }`.

### Subscribes (7) — handlers preservados

- `periferico.imprimir` → `onImprimir` (envia datos a impresora).
- `periferico.display` → `onDisplay` (envia contenido a pantalla externa).
- `periferico.abrir-cajon` → `onAbrirCajon` (envia comando ESC/POS pulse).
- `periferico.estado` → `onEstado` (consulta estado de dispositivo).
- `periferico.listar` → `onListar` (lista dispositivos del registry).
- `periferico.registrar` → `onRegistrar` (registro manual de dispositivo).
- `periferico.desregistrar` → `onDesregistrar` (eliminar del registry).

### UI handlers (mqttRequest cross-modulo) — 9

- `perifericos/list` → `handleListar` — lista dispositivos.
- `perifericos/get` → `handleGet` — info de un dispositivo por nombre.
- `perifericos/create` → `handleRegistrar` — alta manual.
- `perifericos/update` → `handleActualizar` — actualizar dispositivo existente.
- `perifericos/delete` → `handleDesregistrar` — baja manual.
- `perifericos/test` → `handleTestDispositivo` — envio de prueba.
- `perifericos/status` → `handleEstado` — estado actual.
- `perifericos/discover` → `handleDescubrir` — combina transportes activos + registry.
- `perifericos/listar-por-capacidad` → `handleListarPorCapacidad` — filtro por capacidad + estado.

### Eventos declarados-no-emitidos (drift bidireccional)

- `periferico.dispositivo.online` — declarado en manifest, NO emitido en codigo.
- `periferico.dispositivo.offline` — declarado en manifest, NO emitido en codigo.

**Decision rewrite**: ELIMINAR de `module.json.events.publishes`. La fuente de verdad
del estado online/offline de dispositivos es `device-registry` (heartbeat MQTT + LWT).
Perifericos NO debe duplicar esa responsabilidad. Documentar en commit.

### Auto-descubrimiento MQTT (preservar invariante)

`_iniciarAutoDescubrimiento` suscribe a 3 topics y auto-registra dispositivos:

- `impresion/+/status/+` → status de print-proxy ESP32 (legacy compat).
- `enki/+/status/+` → status generico de cualquier ESP32.
- `devices/+/+/birth` → birth messages canonicos.

**Falso positivo del validator**: estos son patrones MQTT pasados a `mqtt.subscribe`,
NO `eventBus.publish`. El validator de events los marca como `drift_raw_topic_in_publish`.
Mismo patron en `device-registry` — drift residual aceptado.

## Drifts conocidos en baseline (79 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_error_sin_log` | 14 | Real — UI handlers devuelven `{ status, error: 'string' }` sin `logger.error` cerca. | Helper `_handleHandlerError` que SIEMPRE loguea + metrica. |
| `drift_error_sin_metric` | 14 | Real — mismos sites, sin `metrics.increment`. | Mismo helper. |
| `drift_publish_dominio_sin_project_id` | 12 | Real — los 8 publishes no llevan `project_id` top-level. | Helper `_publicarEvento` enriquece payload con `project_id` cuando viene del request, defaulta a `'default'`. |
| `drift_error_como_string_suelto` | 9 | Real — `{ status: 400, error: 'nombre requerido' }`. | `_errorResponse(status, code, message, details?)` devuelve shape canonico. |
| `drift_ui_handler_sin_type_canonico` | 9 | Real — module.json.ui_handlers no declara `type`. | Añadir `type: "system_panel"` en cada uno (perifericos es admin/IoT, no workspace de cocina). |
| `drift_ui_handler_sin_zone_canonica` | 9 | Real — sin `zone`. | Añadir `zone: "lateral_derecha"` (panel de admin sistema). |
| `drift_raw_topic_in_publish` | 3 | **Falso positivo** — son `mqtt.subscribe('topic/+/...')` para auto-discovery, no `eventBus.publish`. Mismo patron canonico que device-registry. | Drift residual documentado. |
| `drift_signature_no_canonica` | 1 | **Falso positivo** — el validator marca `provider._initialize()` (linea 73) como metodo `initialize` prohibido. NO es metodo del modulo, es del provider externo. | Drift residual documentado. |
| `drift_correlation_id_no_propagado` | 1 | Real — `tracing.propaga_correlation_id` falta y publishes no llevan correlation_id. | `module.json.tracing.propaga_correlation_id: true` + helper `_publicarEvento` lo propaga. |

**Patron principal**: 75/79 drifts son reales y se cierran por construccion via los 5
helpers POC2 + module.json al ancho canonico. 4/79 son falsos positivos de validator
(3 raw_topic + 1 signature) que se documentan en commit como drift residual aceptado.

## Naming convention check (idioma=es)

Los nombres de eventos actuales no todos casan con la whitelist de verbos `es` de
`naming.json`:

- `impreso` ✗ (whitelist no lo lista — el verbo canonico de "envio exitoso" seria `enviado`).
- `displayed` ✗ (anglicismo en modulo `language=es`).
- `cajon-abierto` ✓ (`abierto` esta en whitelist).
- `estado.respuesta` ✗ (`respuesta` es sustantivo, no verbo).
- `listado` ✗ (sustantivo, no verbo).
- `registrado` ✓ (whitelist).
- `desregistrado` ✗ (whitelist tiene `eliminado`).
- `error` ✗ (no es verbo — el patron canonico es `*.fallido`).

**Decision rewrite**: NO cambiar nombres de eventos en este commit. Por contrato
`module-rewrite.eventos_canonicos_preservados` los consumidores del bus NO deben
enterarse de la reescritura. La canonizacion de nombres se hara en un sub-contrato
derivado `perifericos-flow.contract.json` futuro (analogo a chat-flow / agent-flow)
con su propio plan de migracion 6-pasos. Drift residual documentado.

## Cosas criticas a preservar (validacion post-rewrite)

1. **Los 8 nombres de eventos publicados** — invariantes literal a literal (legacy compat).
2. **Los 7 subscribes** con sus handlers `on*` — invariantes.
3. **Los 9 ui_handlers** con sus `domain/action` — invariantes (consumidos por `mqttRequest` cross-modulo y por frontend).
4. **API del provider `local.perifericos`** — `register|unregister|send|status|list|discover|_initialize|_getRegistry` — invariante. El monolito legacy se conserva como referencia en `_legacy/`.
5. **Auto-descubrimiento MQTT con los 3 topics** — patron de subscripcion preservado.
6. **Comando ESC/POS de apertura de cajon** — `\x1B\x70<pin>\x19\xFA` byte a byte.
7. **`provider._getRegistry()` para acceso al registry interno** — usado por `handleActualizar` y por auto-discovery.
8. **El test de prueba `handleTestDispositivo` con default `'TEST PERIFERICO\\n\\n\\n'`**.

## Plan del rewrite

1. Archivar monolito (738 LOC) en `_legacy/perifericos-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v2.0.0 al canon:
   - 5 helpers POC2: `_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, auxiliar `_parsePayload` (parser MQTT canonico, mismo que device-registry).
   - Throws con `_code` canonico cuando los caminos lo requieran.
   - 9 UI handlers devuelven `{ status, data | error: { code, message, details? } }` via helpers.
   - 7 bus handlers loguean + emiten via `_publicarEvento` con `correlation_id + project_id + timestamp` automaticos.
   - Telemetria con prefix `perifericos.*` (`envios.total/ok/error`, `registros.total`, `errors`).
   - Provider load resiliente: si el require falla (error en transportes), modulo carga sin auto-descubrimiento y devuelve `503 DEPENDENCY_UNAVAILABLE` en handlers que lo necesiten.
3. `module.json` v2.0.0:
   - `tracing.propaga_correlation_id: true`.
   - 9 ui_handlers con `type: "system_panel"`, `zone: "lateral_derecha"`.
   - Eliminar `dispositivo.online` / `dispositivo.offline` de `events.publishes` (responsabilidad de device-registry).
   - `observability.metrics.counters` ampliado con `perifericos.errors`.
   - Persistencia: declarar `config.persistence` = no-aplica (perifericos delega al provider/registry; el modulo en si no escribe a disco directamente — el provider tiene su propio registry.js).
4. Tests por capas (`tests/unit/perifericos.test.js`):
   - Group 1 Lifecycle: onLoad/onUnload sin leak (skeleton listo).
   - Group 2 Validacion canonica: 9 ui_handlers con payload incompleto devuelven `400 VALIDATION_FAILED`.
   - Group 3 Bus handlers success: par publish correcto (ej. `onImprimir` exitoso publica `periferico.impreso` con correlation_id + project_id + timestamp).
   - Group 4 Bus handlers error: cuando provider.send devuelve `success:false`, se publica `periferico.error` y se incrementa `envios.error`.
   - Group 5 UI handlers success/error: shape canonico, codes del catalogo.
   - Group 6 Auto-descubrimiento MQTT: parser de topics + auto-registro idempotente.
   - Group 7 Helpers POC2: skeleton listo.
5. Wire CI: `package.json` + `workflow.yml` _(automatico via scaffold)_.
6. Verificar drift count → cerrar baseline. Esperado: 79 → ≤24 (~70% reduccion). Residual: 4 falsos positivos + drifts del naming legacy de eventos.
7. Commit con metricas via `finish-rewrite.js`.
