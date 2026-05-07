# pizzepos/impresion — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/pizzepos/impresion/`
- **Version actual**: 3.0.0 (codigo dice 3.1.0 — drift) → bump a **4.0.0** post-rewrite.
- **LOC index.js**: 1257.
- **Drifts en baseline**: 43 (scaffold detecta 40).
- **Categoria**: dominio pizzepos.
- **Idioma**: `es`.
- **Description oficial**: Formateo ESC/POS y envio directo a impresoras ESP32 via MQTT. Autodescubrimiento de impresoras. Sin capas intermedias.

## Responsabilidad acotada

Formatea ESC/POS y envia directo a ESP32 (impresoras termicas) via MQTT. Autodiscover de impresoras. Cache de `ref_display` canonico para tickets. Generacion de tres tipos de output: comanda cocina, ticket pieza, ticket venta. NO se descompone — el dominio es coherente (impresion fisica) y los 7 ui_handlers operan sobre el mismo Map de impresoras.

## Inventario

### Publishes (4 — preservados invariantes)

- `impresion.error` — emitido en `_handlePrintAck` cuando ESP32 reporta error. Payload con `error_code`, `error_detail`, `bt_mode`, `attempts`, `latency_ms`, etc.
- `impresion.ticket_pieza_generado` — tras formatear ticket pieza (`onItemTicket` handler).
- `impresion.comanda_generada` — tras reimprimir comanda (`handleImprimirComanda`).
- `impresion.ticket_venta_generado` — tras imprimir ticket venta (`handleImprimirTicketVenta`).

### Subscribes (10 — preservados invariantes)

- `cocina.item_ticket` → `onItemTicket` (genera ticket pieza por item).
- `cuenta.creada` → `onCuentaCreada` (cachea ref_display).
- `mesa.abierta` → `onMesaAbierta` (cache nombre legacy).
- `mesa.renombrada` → `onMesaRenombrada` (actualiza nombre).
- `mesa.cerrada` → `onMesaCerrada` (limpia cache).
- `cuenta.eliminada` → `onCuentaEliminada` (limpia cache).
- `cuenta.actualizada` → `onCuentaActualizada` (actualiza ref_display).
- `llevar.ticket_creado` → `onLlevarTicketCreado` (cache ticket llevar).
- `caja.cerrada` → `onCajaCerrada` (reset metricas + cache).
- `dia.iniciado` → `onDiaIniciado` (reset cache).

### UI handlers (7 — antes en `apis` HTTP-shape, AHORA `ui_handlers` canonicos)

- `ticket` → `handleImprimirComanda` — reimpresion manual.
- `ticket-venta` → `handleImprimirTicketVenta` — recibo cliente.
- `estado` → `handleGetEstado` — estado modulo + impresoras.
- `historial` → `handleGetHistorial` — historico de comandas.
- `health` → `handleHealthCheck` — health (200/503 segun impresoras listas).
- `metrics` → `handleGetMetrics` — metrics dashboard.
- `impresoras` → `handleListarImpresoras` — lista impresoras descubiertas.

### MQTT directo

- `impresion/+/status/+` (subscribe) — descubrimiento ESP32.
- `enki/+/status/+` (subscribe) — descubrimiento generico.
- `impresion/+/printed/+` (subscribe) — ACK de impresion.
- `impresion/<projectId>/print/<deviceId>` (publish via `mqtt.publish`) — envio a ESP32.

## Drifts (43 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_ui_handler_sin_zone_canonica` | 7 | Real — sin `zone`. | `zone: "barra_modulos"`. |
| `drift_ui_handler_sin_type_canonico` | 7 | Real — sin `type`. | `type: "workspace_module"`. |
| `drift_error_sin_metric` | 7 | Real — returns sin metric. | `_handleHandlerError`. |
| `drift_error_como_string_suelto` | 7 | Real — `error: 'Se requiere cuenta_id'`. | `_errorResponse`. |
| `drift_error_sin_log` | 5 | Real — returns sin logger. | Mismo helper. |
| `drift_publish_dominio_sin_project_id` | 4 | Real — los 4 publishes usan `registro` variable que no incluye project_id top-level. | `_publicarEvento` enriquece con project_id desde sourcePayload o default. |
| `drift_raw_topic_in_publish` | 3 | **Falso positivo** — son `mqtt.subscribe` patterns para autodiscovery (impresion/+/status/+, etc.), NO `eventBus.publish`. Mismo patron que device-registry. | Documentar. |
| `module_http_audit_completeness` | 1 | Real — `apis` HTTP-shape pero codigo usa uiHandler. | Migrar a `ui_handlers`. |
| `drift_correlation_id_no_propagado` | 1 | Real — `tracing.propaga_correlation_id: false`. | `tracing: true`. |
| `drift_auth_undeclared` | 1 | **Falso positivo** — modulo de proyecto sin auth de usuario. | Documentar. |

## Cosas criticas a preservar

1. **4 publishes** invariantes (impresion.{error, ticket_pieza_generado, comanda_generada, ticket_venta_generado}).
2. **10 subscribes** invariantes (alto coupling con dominio pizzepos).
3. **MQTT directo a ESP32** (linea 1187): `mqtt.publish('impresion/<pid>/print/<deviceId>', { job_id, data: base64 }, { qos: 1 })`. Patron preservado.
4. **Autodescubrimiento ESP32** via 3 topics (impresion/+/status/+, enki/+/status/+, impresion/+/printed/+).
5. **TTL de 90s** para marcar offline impresoras que dejan de reportar.
6. **Pending jobs con ACK + timeout 15s** (`_pendingJobs` Map + `_handlePrintAck`).
7. **Cache `cuentaNombres`** alimentado por cuenta.creada/actualizada/mesa.* — fuente de `ref_display` canonico para tickets.
8. **Reset en caja.cerrada y dia.iniciado** (limpia cache + historial + metricas).
9. **ESC/POS constants completos** (`CMD.*`, `CP437.*`, `ANCHOS`).
10. **`extraerRefCuenta`** con cache + fallback legacy de prefijos (`mesa_`, `llevadoo_`, etc.).
11. **`formatearComanda`, `formatearTicketPieza`, `formatearTicketVenta`** — preservados byte a byte (formato fiscal HORECA visible).
12. **`enviarImpresora`**: `mqtt.publish` con qos:1 + ACK promise + timeout. Preservado.
13. **`_mensajeError`** — diccionario de error_codes del firmware ESP32 a mensajes legibles.
14. **Datos del negocio hardcoded en ticket venta** ("NO NI NA", CIF, direccion). Preservado byte a byte.

## Plan del rewrite

1. Archivar monolito (1257 LOC) en `_legacy/`. _(automatico)_
2. Reescribir `index.js` v4.0.0:
   - 5 helpers POC2 + auxiliar `_parsePayload` (parser MQTT canonico, mismo que device-registry/perifericos) + auxiliar `_truncar` (preservado).
   - 7 ui_handlers con shape canonico `{ status, data | error: { code, message, details? }}`.
   - 10 bus handlers preservados (+ correlation_id en logs).
   - `_publicarEvento` para los 4 publishes — añade project_id + correlation_id + timestamp.
   - `enviarImpresora` preservado (mqtt directo + ACK + timeout).
   - Telemetria con prefix `impresion.*` + `impresion.errors`.
   - onUnload limpia pending jobs + impresoras + historial.
3. `module.json` v4.0.0:
   - `tracing.propaga_correlation_id: true`.
   - 7 ui_handlers con `type: "workspace_module"`, `zone: "barra_modulos"`.
   - Eliminar `apis` HTTP-shape.
   - `config.persistence` declarado: `{ type: "in-memory + mqtt-passthrough" }` (no persiste a disco).
   - `observability.metrics.counters` ampliado.
4. Tests por capas:
   - Group 1 Lifecycle.
   - Group 2 Validacion canonica (handlers sin args).
   - Group 3 Bus subscribes: cuenta.creada cachea ref_display, mesa.renombrada actualiza, etc.
   - Group 4 onItemTicket: formatea + envia MQTT + publica `ticket_pieza_generado`.
   - Group 5 UI handlers: handleImprimirComanda, handleImprimirTicketVenta success + edge cases.
   - Group 6 Autodiscovery: `_handleStatusMessage` registra impresora, TTL marca offline, `_handlePrintAck` resuelve pending y publica `impresion.error` en fallo.
   - Group 7 Helpers POC2.
5. Wire CI _(automatico)_.
6. Drift count → ≤14 (~67%).
7. Commit con metricas.
