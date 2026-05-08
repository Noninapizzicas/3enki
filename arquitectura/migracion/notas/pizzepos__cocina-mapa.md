# pizzepos__cocina — Mapa exhaustivo (PASO 0 del rewrite)

## Identidad

- **Path**: `modules/pizzepos/cocina/`
- **Version actual**: 3.1.0 (cosmetic bump previo, sin migracion canonica) → bump a **3.2.0**.
- **LOC index.js**: 1232.
- **Drifts en baseline**: 36 (path-matching `pizzepos/cocina`).
- **Categoria**: dominio negocio_alimentario (pizzepos).
- **Idioma**: `es`.
- **Description oficial**: Display de cocina en tiempo real. Sistema de pases multi-estacion (general, horno) + multi-device (devices con color asignado), snapshot persistente atomico, integracion con perifericos (display + impresoras).

## Responsabilidad acotada

Display de cocina en tiempo real: ingesta de `pedido.enviado_cocina`, tracking item-a-item por estaciones (sistema de pases acumulativo), gestion de devices fisicos (registro + asignacion de color), snapshot persistente y publicacion de eventos de progreso. **NO se descompone**: aunque tiene 1232 LOC, todo orbita 2 estructuras (`pedidosActivos`, `devices`) cohesionadas — descomponer device-management aparte rompe el dominio "lo que ve el cocinero". 12 ui_handlers + 7 subscribes + 9 publishes + snapshot atomic — un modulo, una responsabilidad clara.

## Inventario

### Publishes (9) — preservados invariantes

- `cocina.item_preparando` — primer tap (pendiente → preparando). Declarado en manifest.
- `cocina.item_avanzado` — tap intermedio: pase++, item pasa a siguiente estacion. **Drift: no declarado** → declarar.
- `cocina.item_preparado` — item terminado en estacion final. Declarado.
- `cocina.item_ticket` — ticket de pieza individual cuando estacion tiene `imprime_al_completar`. Declarado.
- `cocina.pedido_listo` — todos los items del pedido listos. Declarado.
- `periferico.display` — notifica display externo (TV/LED). Declarado.
- `cocina.device_registered` — device fisico registrado. **Drift: no declarado** → declarar.
- `cocina.device_unregistered` — device removido. **Drift: no declarado** → declarar.
- `cocina.device_updated` — device re-conectado / metadata actualizada. **Drift: no declarado** → declarar.

### Subscribes (7) — preservados invariantes

- `pedido.enviado_cocina` → `onPedidoEnviadoCocina` (auto-wired desde manifest).
- `pedido.cancelado` → `onPedidoCancelado`.
- `cuenta.creada` → `onCuentaCreada` (cache `cuentaNombres`).
- `cuenta.actualizada` → `onCuentaActualizada`.
- `cuenta.eliminada` → `onCuentaEliminada` (housekeeping huerfanos).
- `caja.cerrada` → `onCajaCerrada` (reset).
- `dia.iniciado` → `onDiaIniciado` (reset).

### UI handlers (12) — antes en `apis` HTTP-shape

`list-active`, `get`, `history`, `prepare-item`, `mark-ready`, `health`, `metrics`, `register-device`, `unregister-device`, `list-devices`, `list-station-types`, `list-displays`.

Tipo: `workspace_module` (panel de cocina). Zone: `barra_modulos`.

## Drifts conocidos en baseline (36)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_error_como_string_suelto` | 7 | Real — `error: 'Pedido no encontrado'` etc. | `_errorResponse(status, code, msg)` con codes canonicos. |
| `drift_error_sin_metric` | 7 | Real — returns sin `cocina.errors` increment. | `_handleHandlerError`. |
| `drift_error_sin_log` | 6 | Real — returns sin logger. | Mismo helper. |
| `drift_publish_dominio_sin_project_id` | 9 | Real — algunos publishes no llevan `project_id` top-level. | `_publicarEvento` lo añade. |
| `drift_silent_io_failure` | 2 | Real — snapshot save/load swallow ENOENT/parse errors. | `_readJsonSafe` con log + ENOENT silencioso autorizado. |
| `drift_log_spam_en_bucle` | 1 | Real — log dentro de loop por pedido. | Agregado fuera del loop. |
| `drift_severity_invertida` | 1 | Real — `logger.debug` para errores best-effort de display. | `logger.warn`. |
| `drift_tool_errores_conocidos_vacio` | — | Manifest sin tools (no aplica). | N/A. |
| `drift_ui_handler_sin_zone_canonica` | — | Manifest no tiene `ui_handlers` (estaba en `apis`). | Migrar 12 handlers. |
| `drift_undeclared_persistence_pattern` | — | Sin `config.persistence`. | Declarar `filesystem-snapshot`. |
| `drift_correlation_id_no_propagado` | — | Sin `tracing` top-level. | `tracing.propaga_correlation_id: true`. |

## Cosas criticas a preservar

1. **9 publishes** invariantes con sus shapes exactos (incluso los 4 no declarados — son consumidos por frontend/UI).
2. **7 subscribes** invariantes con sus handlers actuales (cache invalidation pattern preservado).
3. **Sistema de pases acumulativo**: `pase=0` general, `pase=1` horno; `siguienteTipo` calculado por `pase_minimo === item.pase`. Sin pase ni shadow rewrite.
4. **`tiposEstacion`** map con `general` + `horno` + `comportamientos` (`imprime_al_completar`, `auto_preparar`).
5. **Snapshot atomico** (`tmp + rename`) en `data/current/cocina_snapshot.json` con debounce 1s. **Restart-resilient**.
6. **Fallback restauracion** desde `cuentas_activas.json` (legacy) si snapshot vacio.
7. **`DEVICE_COLORS` paleta** asignada round-robin por `devices.size % 8`.
8. **Cache `cuentaNombres`** + actualizacion en `onCuentaActualizada` que propaga a pedidos activos.
9. **Auto-completar pedido** cuando todos los items en estado `listo` → `marcarPedidoListo`.
10. **Rolling average** `tiemposPreparacion` (ultimos 100) + `historial` (ultimos 50).
11. **Display externo** (`publishDisplayCocina`) best-effort — no rompe flujo si falla.
12. **`handleListarDisplays`** consulta `perifericos` via `eventBus.request` con fallback graceful.

## Plan del rewrite

1. Archivar monolito (1232 LOC) en `_legacy/`. _(automatico via scaffold)_
2. Reescribir `index.js` v3.2.0 al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`) + 2 auxiliares (`_atomicWriteFile`, `_readJsonSafe`).
   - 12 ui_handlers normalizados (`{ status, data | error: { code, message } }`).
   - Eventos publicados via `_publicarEvento` (project_id top-level + correlation_id + timestamp).
   - Telemetria `cocina.*` + `cocina.errors`.
3. `module.json` v3.2.0:
   - `tracing.propaga_correlation_id: true`.
   - Migrar `apis` → `ui_handlers` (12 entradas).
   - Declarar los 4 publishes faltantes (`cocina.item_avanzado`, `cocina.device_registered/unregistered/updated`).
   - `config.persistence` declarada (filesystem-snapshot atomic).
   - Eliminar `routes` y `provides` (legacy POC1).
4. Tests por capas (`tests/unit/pizzepos__cocina.test.js`):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica (handlers con `_errorResponse`).
   - Group 3: Sistema de pases (general → horno → listo).
   - Group 4: Devices (register, color round-robin, unregister).
   - Group 5: Pedidos lifecycle (recibido, cancelado, listo, auto-complete).
   - Group 6: Reset events (caja.cerrada, dia.iniciado, cuenta.eliminada huerfanos).
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI _(automatico via scaffold)_.
6. Drift count → ≤15 (~58% reduccion).
7. Commit via `finish-rewrite`.
