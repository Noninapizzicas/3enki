# plugin-manager — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar código.

## Identidad

- **Path**: `modules/plugin-manager/`
- **Versión actual**: 2.0.0 (sí, ya estaba en 2.0.0 sin reescritura canónica)
  → bump a **2.1.0** post-rewrite (canon real + drifts cerrados).
- **LOC index.js**: 515.
- **Drifts en baseline**: 22 distribuidos en 8 tipos.
- **Categoría**: core (#7 del roadmap, 0 deps upstream).

## Responsabilidad acotada (NO descomponer)

Descubrir y gestionar plugins JSON con funciones ejecutables que viven en
`<pluginsPath>/<plugin-name>/<plugin-name>.functions.json`.

Sub-áreas (todas en el mismo dominio):
- **Discovery**: escanear directorio + cargar definiciones.
- **Storage in-memory**: `Map<name, definition>`.
- **Bus**: responder a `plugin.get.request` y `plugin.list.request` con
  par success/failure.
- **HTTP API**: 5 endpoints (GET/LIST/RELOAD/health/metrics).
- **Auto-reload**: opcional cada N ms via setInterval.

## Inventario completo de métodos (16 totales)

### Lifecycle (2)
- `onLoad(core)` — inyecta deps, resuelve pluginsPath, ensure dir, discover,
  start watcher si configurado.
- `onUnload()` — clear watch interval + emite `plugin.unloaded` por cada
  plugin + clear Map.

### Init helpers (3)
- `ensurePluginsDirectory()` — crea directorio si no existe.
- `startWatching()` — setInterval de discoverPlugins cada `watchInterval`.
- `updateMetrics()` — counters/gauges (la implementación legacy tiene
  `// REMOVED` comments — métricas eliminadas en migración previa).

### Bus handlers (2)
- `onGetPluginRequest(event)` — busca plugin por nombre, responde con
  `plugin.get.response` success/failure.
- `onListPluginsRequest(event)` — devuelve listado, publica
  `plugin.list.response`.

### HTTP API handlers (5)
- `handleGetPlugin(req, context)` — GET /plugins/:name. Devuelve 404 con
  shape no canónico (drift).
- `handleListPlugins(req, context)` — GET /plugins. Calcula totalFunctions
  en bucle con logger después (drift `log_spam_en_bucle`).
- `handleReloadPlugins(req, context)` — POST /plugins/reload. Devuelve 500
  con shape no canónico (drift).
- `handleHealthCheck(req, context)` — GET /health.
- `handleGetMetrics(req, context)` — GET /metrics.

### Core logic (4)
- `discoverPlugins()` — escanea + loadPluginFromFile por cada
  `*.functions.json`. Publica `plugin.error` en catch.
- `loadPluginFromFile(filePath)` — lee/parse JSON, valida estructura, mete
  en Map, publica `plugin.loaded` o `plugin.error`.
- `reloadPlugins(correlationId)` — clear + discoverPlugins.
- `getPluginsSummary()` — array de plugin metadata.

## Eventos

### Publishes (6 únicos)
1. `plugin.loaded` — tras loadPluginFromFile success. Payload:
   `{ name, definition, version, description, functions, function_count, loaded_at }`.
2. `plugin.unloaded` — en onUnload por cada plugin. Payload:
   `{ name, unloaded_at }`.
3. `plugin.error` — en discovery/load error. Payload:
   `{ error, context, file? }`.
4. `plugin.reloaded` — tras handleReloadPlugins success. Payload:
   `{ count, loaded, errors, reloaded_at }`.
5. `plugin.get.response` — par success/failure de plugin.get.request.
   Correlacionado por `request_id`.
6. `plugin.list.response` — par success de plugin.list.request.

### Subscribes (2)
1. `plugin.get.request` → `onGetPluginRequest` (auto-wired desde manifest).
2. `plugin.list.request` → `onListPluginsRequest` (auto-wired).

## Estado interno

- `plugins: Map<name, definition>` — plugins en memoria.
- `pluginsPath: string` — directorio escaneado (resolvido en onLoad).
- `watchInterval: Timer | null` — auto-reload watcher (cleared en onUnload).

## HTTP APIs (5)

| Método | Path | Handler | Notas |
|---|---|---|---|
| GET  | /plugins/:name      | handleGetPlugin     | 404 con drift de shape |
| GET  | /plugins            | handleListPlugins   | log_spam_en_bucle |
| POST | /plugins/reload     | handleReloadPlugins | 500 con drift de shape |
| GET  | /health             | handleHealthCheck   | OK |
| GET  | /metrics            | handleGetMetrics    | OK |

## Drifts conocidos en baseline (22)

| Tipo | Count | Naturaleza |
|---|---|---|
| `publish_dominio_sin_project_id` | 9 | Falso positivo: plugins son globales, no project-scoped. |
| `rpc_over_pubsub` | 3 | Falso positivo: `.response` es el patrón canónico request/response correlacionado por `request_id`. |
| `generic_verb` | 3 | Falso positivo: `response` es canónico para responses correlacionadas. |
| `error_sin_metric` | 2 | Returns 404/500 sin `metrics.increment`. Drift real. |
| `error_como_string_suelto` | 2 | Returns con shape `{ status, data: { error: 'string' } }`. Drift real. |
| `log_spam_en_bucle` | 1 | Loop sobre `pluginsList` con `this.logger` dentro del rango. Drift real. |
| `correlation_id_no_propagado` | 1 | manifest sin `tracing.propaga_correlation_id=true` a pesar de propagarlo en código. Drift real. |
| `auth_undeclared` | 1 | 5/5 apis sin `auth_required` en module.json. Drift real. |

**Patrón principal**: HTTP error handlers con shape `{ status, data: {
success: false, error: 'string' } }` en lugar del canónico `{ status,
error: { code, message, details? } }`. Plus 7 falsos positivos cross-system
(plugins son globales — no llevan project_id; `.response` es canónica).

## Cosas críticas a preservar (validación post-rewrite)

1. **6 eventos del bus** invariantes (loaded/unloaded/error/reloaded +
   par get.response/list.response).
2. **2 subscribes auto-wired** (plugin.get.request / plugin.list.request).
3. **5 APIs HTTP** con sus paths exactos.
4. **Discovery pattern**: `<pluginsPath>/<dir>/<*.functions.json>`.
5. **Auto-reload opcional** con `config.autoReload` + `config.watchInterval`.
6. **Validación de estructura**: `metadata.name` + `functions` requeridos
   en plugin JSON.
7. **Skip si ya cargado** (idempotencia en discovery).

## Plan del rewrite

1. Archivar monolito (515 LOC) en
   `_legacy/plugin-manager-monolito-pre-rewrite.js.bak`.
2. Reescribir `index.js` v2.1.0 al canon:
   - Helpers POC2 (5).
   - HTTP error responses con shape canónico.
   - Cada error path con log + metric.
   - `_publicarEvento` con correlation_id propagado.
   - log_spam_en_bucle resuelto con cálculo previo a logger.
3. `module.json` v2.1.0:
   - `tracing.propaga_correlation_id: true` en observability.
   - `auth_required: false` en cada API (declarando explícitamente que es
     no-auth — cierra el drift `auth_undeclared`).
   - Métricas con prefix `plugin-manager.*`.
4. Tests por capas:
   - Group 1: Lifecycle (onLoad con/sin pluginsPath, onUnload limpia).
   - Group 2: Validación canónica HTTP (404/500 shape canónico).
   - Group 3: Discovery + load (con plugin valido / inválido).
   - Group 4: Bus handlers (request/response + correlation_id propagado).
   - Group 5: handleReloadPlugins.
   - Group 6: handleHealthCheck + handleGetMetrics.
   - Group 7: Helpers POC2.
5. Wire CI + verificar drift count ≤30%.
6. Commit + regenerar PROGRESO.
