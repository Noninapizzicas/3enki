# metricas — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/metricas/`
- **Version actual**: 1.0.0 → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 714.
- **Drifts en baseline**: 29 (11 tipos).
- **Categoria**: infra (instrumentación cross-system).
- **Estado en sistema**: dormido_por_diseno — disabled en config. La migración lo deja canónico para cuando se active.
- **Description oficial**: Módulo de métricas centralizado — escucha eventos del sistema y genera métricas en tiempo real.

## Responsabilidad acotada

metricas es la **instrumentación pasiva del sistema completo**: se suscribe a wildcards de sufijo (`*.creado`, `*.actualizado`, `*.eliminado`, `*.error`, `*.completado`) y mantiene contadores + gauges + histograma de timings + agregados por evento. Publica `metricas.snapshot` cada 10s. Persiste estado a disco cada 60s. Expone 7 endpoints HTTP read-only (más uno de reset). NO se descompone — es un observador único cross-vertical, su valor está precisamente en agregar de forma uniforme TODAS las trazas del sistema.

## Inventario de eventos (extraido del audit)

### Publishes (1 site → 2 nombres declarados)

- `metricas.snapshot` — emitido en `publishSnapshot` (l.567), tick periódico cada 10s. Lleva `counters`, `gauges`, `timestamp`, `uptime`.
- `metricas.alerta` — declarado en manifest pero NO emitido (sistema de alertas no implementado). El rewrite lo deja documentado como `trabajo_pendiente` y NO lo declara hasta que exista lógica que dispare alertas. Eliminar del manifest.

### Subscribes (5 — wildcards de sufijo cross-system)

- `*.creado` → `onEntityCreated` (l.118): increment `<event>.total` + `<domain>.creado.total` + record timing si hay `metadata.duration`.
- `*.actualizado` → `onEntityUpdated` (l.162): increment `<event>.total` + `<domain>.actualizado.total` + timing.
- `*.eliminado` → `onEntityDeleted` (l.195): increment `<event>.total` + `<domain>.eliminado.total`.
- `*.error` → `onError` (l.220): increment `errores.total` + `<event>.total` + `<domain>.error.total`.
- `*.completado` → `onOperationCompleted` (l.254): increment `<event>.total` + `<domain>.completado.total` + timing.

### APIs HTTP (7)

- `GET  /metrics`        → `handleGetAllMetrics`
- `GET  /metrics/counters` → `handleGetCounters`
- `GET  /metrics/gauges`   → `handleGetGauges`
- `GET  /metrics/timings`  → `handleGetTimings`
- `GET  /metrics/eventos`  → `handleGetEventMetrics`
- `DELETE /metrics/reset`  → `handleResetMetrics`
- `GET  /health`           → `handleHealthCheck`

## Drifts conocidos en baseline (29)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_non_canonical_routing` | 7 | FALSO POSITIVO sistemico — los 7 endpoints HTTP usan signatures `(req, context)` que el catalogo del validator marca como no canónicas (espera `(data)` estilo UI handler). Es un patron HTTP API legítimo distinto al de UI handlers. No se cierra. |
| `drift_error_como_string_suelto` | 6 | REAL — los handlers devuelven `{ status: 500, data: { error: 'Error interno del servidor' } }` (string en `data.error`, no en `error.code/message`). Canonizado a `{status, error: {code, message}}` via helpers. |
| `drift_error_sin_metric` | 6 | REAL — error returns no emiten `metrics.increment('metricas.errors', ...)`. Pero ojo: este modulo ES el sistema de metricas, **no se mide a sí mismo** por diseño (recursión). El rewrite usa el counter interno `this.counters.set('metricas.errors.total', ...)` en lugar de `this.metrics.increment` para no recursionar. |
| `drift_auth_undeclared` | 1 | REAL — endpoints como `DELETE /metrics/reset` no declaran auth. Comentario de README dice "admin only" pero no hay enforcement. Documentado como `trabajo_pendiente` en mapa. NO se anyade auth (queda fuera de scope del rewrite POC2). |
| `drift_missing_onUnload_with_reservations` | 1 | REAL parcial — onUnload limpia timers + persiste, pero NO hace `.clear()` de los Maps (counters/gauges/timings/eventMetrics). Rewrite anyade reset al final. |
| `drift_publish_dominio_sin_project_id` | 1 | FALSO POSITIVO contextual — `metricas.snapshot` agrega métricas globales del sistema (no por proyecto). Sin `project_id` por diseño. Documentado en module.json description. |
| `drift_correlation_id_no_propagado` | 1 | REAL — el publish actual usa correlationId hardcoded (`snapshot_${Date.now()}`). Rewrite usa `_publicarEvento` que genera UUID por snapshot. |
| `drift_non_atomic_write` | 1 | FALSO POSITIVO — el código YA usa tmp+rename atómico (l.689-693). Probablemente el validator no detecta el patrón porque la temp filename es interpolada. No hay nada que cerrar. |
| `drift_silent_io_failure` | 1 | REAL parcial — `loadFromJSON` y `persistToJSON` capturan err y solo loguean (sin metric ni rethrow). Es POR DISEÑO ("NO relanzar - continuar con métricas vacías") pero el counter interno `metricas.errors.persist` sí se debe registrar. Anyadido. |
| `drift_unbounded_growth_no_eviction` | 1 | REAL — `eventMetrics` Map crece con N eventos únicos del sistema sin TTL. Real pero acotado en práctica (N eventos canónicos del sistema es finito). Rewrite anyade cap `maxEventMetricsTracked=500` con eviction LRU básica por `ultimo` timestamp. |
| `drift_undeclared_persistence_pattern` | 1 | REAL — `module.json.config` no declara `persistence`. Rewrite anyade `persistence: { type: 'json-file', path: 'data/metricas.json', atomic: true }`. |

**Patron principal**: ~17 drifts reales de canonizacion estandar (errors shape, correlation_id, persistence pattern, eviction LRU, onUnload reset), ~9 falsos positivos sistemicos (routing, project_id contextual, atomic write detector). Esperado quedar < 50% drift residual.

## Cosas criticas a preservar (validacion post-rewrite)

1. **Wildcards de sufijo** (`*.creado/*.actualizado/*.eliminado/*.error/*.completado`) — patrón único en el sistema, NO romper. Es el mecanismo central de instrumentación cross-vertical.
2. **No-recursion**: este módulo NO usa `this.metrics.increment(...)` (sería recursivo — los counters internos saltarían sus propios subscribes). Mantener como está: counters internos via `this.counters.set(...)`. Documentado en module.json.observability.metrics.comment.
3. **Snapshot interval 10s + Persist interval 60s**: hardcoded en monolito (no configurables). Rewrite los expone en `config` (`snapshot_interval_ms`, `persist_interval_ms`).
4. **Persistencia atómica via tmp+rename** ya existente — preservada.
5. **Robustez en publishSnapshot**: si `eventBus.isConnected()` es false, skip silencioso (sin throw). Crítico porque MQTT puede caerse y este módulo no debe matarse.
6. **Robustez en handlers de eventos**: cada handler tiene try/catch que loguea y sigue. Sin rethrow. Es subscriber a wildcards — un evento corrupto no puede tirar abajo la instrumentación.
7. **Counters / Gauges / Timings / EventMetrics** preservados como Maps in-memory.
8. **maxTimingsStored=1000** FIFO sliding (`shift()` cuando supera el cap). Crítico para evitar growth ilimitado.
9. **7 endpoints HTTP** con shape `{status, data}` (rewrite los canoniza a `{status, data | error: {code, message}}`).
10. **Inicialización de gauges del sistema** (`sistema.uptime`, `metricas.counters.count`, `metricas.timings.count`) en `initializeSystemGauges`. Llamado en onLoad y tras reset.
11. **Versión guardada en JSON persistido**: si hay version mismatch al cargar, log warn pero NO fallar — cargar lo que se pueda.

## Plan del rewrite

1. Archivar monolito (714 LOC) en `_legacy/metricas-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v2.0.0 al canon (Write completo, ~660 LOC esperadas):
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, `_recordHandlerInternalError` como auxiliar — counter interno sin recurrir a `this.metrics`).
   - Handlers HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - `metricas.alerta` ELIMINADO del manifest publishes (no se emite en código, declararlo es drift).
   - `eventMetrics` con cap LRU `maxEventMetricsTracked=500`.
   - `onUnload` limpia Maps al final tras persistir.
   - `snapshot_interval_ms` y `persist_interval_ms` configurables via `core.config['metricas']`.
3. `module.json` v2.0.0:
   - `tracing.propaga_correlation_id: true`.
   - `config.persistence: { type: 'json-file', path: 'data/metricas.json', atomic: true }`.
   - Eliminar `metricas.alerta` de publishes (mover a `trabajo_pendiente` doc en CLAUDE.md o nota interna).
   - Limpiar referencias a `schemas/events.json` y `schemas/metrics.json` si no existen (verificar).
   - Counters declarados internamente (sin `metrics.increment` enabled).
4. Tests por capas:
   - Group 1: Lifecycle.
   - Group 2: Validacion de handlers HTTP (shape canonico de errores).
   - Group 3: Bus handlers wildcards (creado/actualizado/eliminado/error/completado) — cada uno verifica que incrementa correct counters.
   - Group 4: Snapshot timer publica `metricas.snapshot` con shape correcto.
   - Group 5: Persistencia tmp+rename + load post-restart.
   - Group 6: HTTP handlers exitosos + reset.
   - Group 7: Helpers POC2.
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline.
7. Commit con metricas via `finish-rewrite.js`.
