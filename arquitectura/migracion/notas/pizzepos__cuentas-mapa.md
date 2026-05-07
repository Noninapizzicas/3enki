# pizzepos/cuentas — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/pizzepos/cuentas/`
- **Version actual**: 2.3.0 → bump a **3.0.0** post-rewrite.
- **LOC index.js**: 1223.
- **Drifts en baseline**: 65 (13 tipos).
- **Categoria**: dominio pizzepos.
- **Idioma**: `es`.
- **Description oficial**: Gestion de cuentas con ciclo de vida completo — orquesta items + cocina + cobro + estado de cuenta (POS ticket lifecycle). 100% Event-Driven.

## Decision sobre descomposicion

**NO descomponer**, aunque el modulo supera 1000 LOC. La responsabilidad es UNA: la maquina de estados de una `cuenta` (POS ticket). Los 8 subscribes son todos triggers del lifecycle (item agregado, item eliminado, enviar cocina, pedido listo, cobro iniciado, cobro procesado, cierre externo). Los 4 Maps en memoria son estado coherente del MISMO objeto:

- `cuentas` — Map cuenta_id → cuenta (snapshot de estado)
- `_pendingTimeouts` — Map cuenta_id → timeout (auto-eliminacion post-cobrado)
- `_alertaTimers` — Map cuenta_id → timeout (alerta visual a los 30 min en pendiente)
- `_pedidosEnCocina` — Map cuenta_id → Set(pedido_id) (tracking multi-pedido por cuenta)

Splitting rompe la cohesion: la transicion `en_preparacion → listo` requiere consultar `_pedidosEnCocina`; la `listo → cobrado` requiere consultar `_pendingTimeouts`. Mover esos a otro modulo crearia ping-pong de eventos para preguntas estructurales sobre la misma cuenta.

La complejidad viene de la **state machine de 7 estados con re-entradas validas** — eso es esencial del dominio, no acoplamiento accidental.

## Inventario

### Publishes — estado actual

- **Declarados Y emitidos** (4): `cuenta.creada`, `cuenta.actualizada`, `cuenta.eliminada`, `cuenta.estado_cambiado`. Preservados invariantes.
- **Emitido PERO no declarado** (1): `comandero.enviar_cocina` — emitido en `_inyectarPedidoInicial` para integracion delivery (Glovo, Llevadoo, webhooks externos). El audit lo marca como `emitido_no_declarado`. **Decision rewrite**: AÑADIR a `events.publishes` con descripcion. Cierra el drift de manifest. Comportamiento bus invariante.

### Subscribes (8) — preservados literal

| Evento | Handler | Trigger del state machine |
|---|---|---|
| `comandero.item_agregado` | `onComanderoItemAgregado` | `pendiente → con_pedido` (primer item) o ajuste de totales |
| `comandero.item_eliminado` | `onComanderoItemEliminado` | `con_pedido → pendiente` si items=0 |
| `comandero.item_actualizado` | `onComanderoItemActualizado` | Ajuste de items/total con diff |
| `comandero.enviar_cocina` | `onComanderoEnviarCocina` | `con_pedido | listo | entregado | en_preparacion → en_preparacion` |
| `cocina.pedido_listo` | `onCocinaPedidoListo` | `en_preparacion → listo` cuando todos los pedidos terminan |
| `cobro.iniciado` | `onCobroIniciado` | `listo | entregado → para_cobrar` (excepto pago_externo) |
| `cobro.procesado` | `onCobroProcesado` | Marca `pagado=true` y opcional `→ cobrado` con auto-eliminacion |
| `cuenta.cerrada` | `onCuentaExternaCerrada` | Limpieza inmediata desde cuentas-canales |

### State Machine

```
pendiente ─┬─→ con_pedido (primer item)
           ↑           ├─→ en_preparacion (enviar cocina)
           │           │           ├─→ listo (todos pedidos OK)
           └─items=0   │           │       ├─→ entregado / para_cobrar
                       │           │       │       └─→ cobrado (cobro procesado)
                       │           └─re-entrada (mas items)
                       └─pago_rapido_sin_cocina─→ cobrado
```

7 estados, transiciones definidas en constante `TRANSICIONES_VALIDAS`. Re-entradas validas:
- `con_pedido → con_pedido` (mas items)
- `pendiente` re-alcanzable desde `con_pedido` cuando `items=0`
- `en_preparacion → en_preparacion` (mas pedidos a cocina)
- `listo → en_preparacion` (cliente pide mas)

### UI handlers (9) — antes en `apis` (HTTP-shape), AHORA en `ui_handlers` (mqttRequest cross-modulo)

| action | handler | descripcion |
|---|---|---|
| `cuenta.create` | `handleCreateCuenta` | Crear cuenta + opcional pedido_inicial (delivery webhooks) |
| `cuenta.list` | `handleListCuentas` | Listar con filtros project_id/tipo/estado |
| `cuenta.get` | `handleGetCuenta` | Obtener por id (verifica project_id) |
| `cuenta.delete` | `handleDeleteCuenta` | Borrar cuenta + cleanup timers |
| `cuenta.marcar_entregado` | `handleMarcarEntregado` | `listo | en_preparacion → entregado` (manual) |
| `cuenta.rename` | `handleRenameCuenta` | Renombrar preservando turno + ref_display |
| `cuenta.stats` | `handleGetStats` | Stats agregadas |
| `cuenta.health` | `handleHealthCheck` | Health check (200/503) |
| `cuenta.metrics` | `handleGetMetrics` | Metrics dashboard |

## Drifts conocidos en baseline (65 — desglose, scaffold detecta 56 ahora)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_error_sin_metric` | 13 | Real — returns de error sin `metrics.increment`. | Helper `_handleHandlerError`. |
| `drift_metrica_sin_prefix_modulo` | 12 | Real — metricas como `cuenta.creada.total` sin prefix `pizzepos__cuentas.*`. **Falso positivo parcial**: el modulo es `pizzepos/cuentas` y declara prefix `cuenta.*` (entidad), no `pizzepos__cuentas.*`. Se mantiene `cuenta.*` como prefix de dominio (consumidores externos lo conocen) + se añade `pizzepos-cuentas.errors` para metricas de error del modulo. | Conservar prefix `cuenta.*` (dominio) + añadir `pizzepos-cuentas.errors` (modulo). Drift residual aceptado. |
| `drift_error_sin_log` | 12 | Real — returns de error sin `logger.error`. | Mismo helper. |
| `drift_error_como_string_suelto` | 11 | Real — `error: 'project_id es requerido'`. | `_errorResponse(400, 'INVALID_INPUT', ...)`. |
| `drift_publish_dominio_sin_project_id` | 6 | **Falso positivo parcial** — los 4 publishes ya llevan `project_id` top-level. El validator probablemente cuenta los publishes de `cuenta.actualizada` con shape minimo (solo `project_id, cuenta_id, cambios, updated_at`) — el campo SI esta. | Documentar. Helper `_publicarEvento` reafirma el shape. |
| `drift_silent_io_failure` | 2 | Real — `try {} catch (_) { /* ignore */ }` en `_loadTurno` y `restaurarDesdeArchivo` para ENOENT. | Reescribir con check explicito de `err.code === 'ENOENT'` (silencioso solo para ese caso) + warn + metric para otros. |
| `drift_correlation_id_no_propagado` | 2 | Real — `tracing.propaga_correlation_id` falta + publishes sin `correlation_id`. | `tracing: true` + helper `_publicarEvento`. |
| `module_http_audit_completeness` | 1 | Audit reporta `apis_http: []` pero module.json declara `apis` con HTTP shape. Inconsistencia. | Migracion `apis` → `ui_handlers` cierra el drift. |
| `drift_undeclared_persistence_pattern` | 1 | Real — module.json.config.persistence dice `enabled: false, type: memory` pero el codigo SI persiste el contador de turnos a disco. | Declarar `persistence: { type: "json-file", atomic: true, paths: [...] }` con honestidad. |
| `drift_signature_no_canonica` | 1 | Real — `registerUIHandlers` no es lifecycle canonico (ni `onLoad/onUnload`), es metodo helper que se llama desde onLoad. | Eliminar el metodo (auto-wiring desde manifest). |
| `drift_non_atomic_write` | 1 | Real — `_saveTurno` hace `fs.writeFile` directo sin tmp+rename. | Helper auxiliar `_atomicWriteFile` (mismo patron que carta-design). |
| `drift_missing_onUnload_with_reservations` | 1 | **Falso positivo** — onUnload SI limpia los 4 timers (`_metricsInterval`, `_pendingTimeouts`, `_alertaTimers`, `_turnoSaveTimer`) y los 2 Maps (`cuentas`, `_pedidosEnCocina`). | Documentar. |
| `drift_auth_undeclared` | 1 | El audit detecta `apis` con `auth_observada: ninguna`. **Falso positivo en este modulo**: las cuentas son operaciones del POS (no requieren auth de usuario, se autorizan a nivel de proyecto). Documentar. | Documentar como residual aceptado. |

## Cosas criticas a preservar

1. **State machine de 7 estados** + `TRANSICIONES_VALIDAS` invariante.
2. **Re-entradas validas** (especialmente `con_pedido → pendiente` por items=0 y `listo → en_preparacion` por mas pedidos).
3. **Timer de alerta a 30 minutos** en estado `pendiente` (constante `ALERTA_PENDIENTE_MS`).
4. **Auto-eliminacion 5 min post-cobrado** + cancelacion si llega `cuenta.cerrada` antes.
5. **Contador global de turnos 001→999→001** persistido (`./data/current/contador_global.json`), inmutable por cuenta.
6. **Restauracion desde `cuentas_activas.json`** en onLoad (sobrevive restart) — leer estado `abierta` legacy y mapear a `pendiente | con_pedido` segun items.
7. **`comandero.enviar_cocina` cross-module publish** desde `_inyectarPedidoInicial` (delivery webhooks Glovo/Llevadoo).
8. **Pago externo y cerrar_al_cobrar flags** (legacy `tipo === 'llevadoo'` y `tipo === 'llevar'` sin metadata.flag).
9. **Idempotencia en `cobro.procesado`** (ignorar duplicados via `cuenta.pagado || estado === 'cobrado'`).
10. **`generateRefDisplay`** con simbolo por tipo (M/L/T/W/G/D/V) + numero 3-digit + nombre opcional. Excluir nombres automaticos (`Mesa 5`, `Cliente Glovo`, etc).
11. **Tracking multi-pedido por cuenta** (`_pedidosEnCocina[cuenta_id]: Set<pedido_id>`) — solo transitar a `listo` cuando el Set queda vacio.
12. **Aliases de tipo**: `local → mesa` para `_buildCuentaId` (compat frontend).
13. **`startMetricsReporting`** interval cada 10s con gauges de cuentas.* — preservar.

## Plan del rewrite

1. Archivar monolito (1223 LOC) en `_legacy/`. _(automatico)_
2. Reescribir `index.js` v3.0.0 al canon:
   - 5 helpers POC2: `_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, auxiliar `_atomicWriteFile` (escritura atomica `.tmp + rename`).
   - Auxiliar segundo: `_readJsonSafe(path, kind)` (mismo patron que carta-design).
   - 9 ui_handlers normalizados con shape canonico `{ status, data | error: { code, message, details? } }`.
   - State machine preservada con todas las transiciones validas.
   - Eliminar `registerUIHandlers` (auto-wired).
   - `_publicarEvento` enriquece con `correlation_id + timestamp` (project_id ya viene en payload).
   - Telemetria con prefix `cuenta.*` para metricas de dominio + `pizzepos-cuentas.errors` para errores.
   - `_saveTurno` y futuros writes via `_atomicWriteFile`.
3. `module.json` v3.0.0:
   - `tracing.propaga_correlation_id: true`.
   - Migrar `apis` → `ui_handlers` con `domain: "cuenta"`, `type: "workspace_module"`, `zone: "barra_modulos"` (POS workspace).
   - Añadir `comandero.enviar_cocina` a `events.publishes` con descripcion.
   - Declarar `config.persistence: { type: "json-file", atomic: true, paths: [...] }` con honestidad.
   - `observability.metrics.counters/gauges/timings` ampliado con `pizzepos-cuentas.errors`.
4. Tests por capas:
   - Group 1 Lifecycle: onLoad/onUnload limpian timers y Maps.
   - Group 2 Validacion canonica: 9 ui_handlers con args ausentes → 400.
   - Group 3 State machine: cada transicion valida + invalida + re-entradas.
   - Group 4 Bus subscribes: 8 handlers con event payloads + verificar publishes enriquecidos.
   - Group 5 UI handlers success: create con pedido_inicial, list con filtros, rename con turno preservado.
   - Group 6 Persistencia: `_loadTurno` ENOENT silencioso, `_atomicWriteFile`, restauracion desde archivo.
   - Group 7 Helpers POC2.
5. Wire CI _(automatico)_.
6. Verificar drift count → cerrar baseline. Esperado: 65 → ≤20 (~70%).
7. Commit con metricas.
