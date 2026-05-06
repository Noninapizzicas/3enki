# database-manager — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar código.

## Identidad

- **Path**: `modules/database-manager/`
- **Versión actual**: 2.0.0 → bump a **3.0.0** post-rewrite.
- **LOC monolito**: 1321 (index.js).
- **Drifts en baseline**: 92 distribuidos en 10 tipos.
- **Categoría**: core (#5 del roadmap, 0 deps upstream).

## Responsabilidad acotada (NO descomponer — un solo dominio)

SQLite database management por proyecto:
- Una DB SQLite por proyecto en `<basePath>/db/<slug>.sqlite` (estructura nueva).
- Legacy: `data/projects/<projectId>/db.sqlite` (sistema + _prompts).
- Persistencia automática (sqlite3 native escribe a disco directo).
- Ejecución de queries SQL + esquemas + persist (insert/update/delete sin SQL).
- Tools del LLM para query/tables/schema/execute.

NO mezcla 5+ responsabilidades — es **un solo dominio acotado** (acceso a SQLite). NO se descompone.

## Inventario completo de métodos (28 totales)

### Lifecycle (2)
- `onLoad(core)` — inyecta deps, configura `projectsPath`, crea directorio si falta.
- `onUnload()` — cierra todas las conexiones SQLite + clear maps.

### Helpers internos privados (3)
- `_all(db, query, params)` — Promise-wrapper de `db.all()`.
- `_run(db, query, params)` — Promise-wrapper de `db.run()` (devuelve {changes, lastID}).
- `_exec(db, sql)` — Promise-wrapper de `db.exec()`.

### Inicialización (2)
- `ensureProjectsDirectory()` — mkdir recursive si `projectsPath` no existe.
- `countProjects()` — cuenta directorios en `projectsPath` (para metrics gauge).

### Event handlers del bus (3)
- `onQueryRequest(event)` — handler de `db.query.request`. Ejecuta query, publica `db.query.response` (success o error). Publica también `db.query.executed` en background.
- `onPersistRequest(event)` — handler de `db.persist.request`. Construye SQL desde `{operation, data, where}` (insert/update/delete), ejecuta, responde con `db.persist.response`.
- `onSchemaInitRequest(event)` — handler de `db.schema.init.request`. Valida schema string, ejecuta statements separados por `;`, ignora errores `already exists` y `more than one primary key`. Responde con `db.schema.init.response`. Publica también `db.schema.initialized`.

### HTTP API handlers (8)
- `handleListDatabases(req, context)` — lista DBs disponibles.
- `handleExecuteQuery(req, context)` — ejecuta query desde HTTP.
- `handleGetSchema(req, context)` — devuelve schema de tablas.
- `handleInitSchema(req, context)` — inicializa schema desde HTTP.
- `handleDeleteDatabase(req, context)` — elimina DB de un proyecto.
- `handleListTables(req, context)` — lista tablas de un proyecto.
- `handleHealthCheck(req, context)` — health.
- `handleGetMetrics(req, context)` — metrics.

### Tools del LLM (4)
- `handleToolQuery(args)` — query SQL al LLM.
- `handleToolTables(args)` — listar tablas.
- `handleToolSchema(args)` — schema de tabla.
- `handleToolExecute(args)` — ejecutar SQL arbitrario.

### Helpers internos privados (3)
- `resolveDatabasePath(projectId)` — resuelve path SQLite (system, cache, query a system DB para nuevos proyectos, fallback legacy).
- `getDatabase(projectId)` — abre/cachea instancia sqlite3.Database. Si DB es nueva, publica `db.created`.
- `saveDatabase(projectId)` — no-op (sqlite3 escribe directo a disco). Mantenido para API symmetry.

### Event publishers (3)
- `publishQueryExecuted(projectId, resultCount, readOnly, duration, correlationId)` — publica `db.query.executed`.
- `publishQueryResponse(projectId, requestId, success, data, error, correlationId)` — publica `db.query.response` con success/error.
- `publishSchemaInitResponse(projectId, requestId, success, error, correlationId)` — publica `db.schema.init.response`.

## Eventos

### Publishes (8 declarados en module.json)
1. `db.created` — DB creada (al primer `getDatabase` de un projectId).
2. `db.deleted` — DB eliminada.
3. `db.query.executed` — query ejecutada con métricas (background after success).
4. `db.schema.initialized` — schema inicializado.
5. `db.query.response` — response correlacionada por `request_id`.
6. `db.schema.init.response` — response correlacionada por `request_id`.
7. `db.persist.response` — response correlacionada por `request_id`.

### Subscribes (3)
1. `db.query.request` → `onQueryRequest`.
2. `db.schema.init.request` → `onSchemaInitRequest`.
3. `db.persist.request` → `onPersistRequest`.

## Estado interno

- `databases` (Map): `projectId → db instance` (sqlite3.Database).
- `projectPaths` (Map): `projectId → { basePath, slug }` cache de resolución.
- `projectsPath` (string): root de proyectos (`./data/projects` por defecto).
- `systemProjects` (Set): `['system', '_prompts']` — usan estructura legacy.

## Dependencias cross-módulo

- **Upstream**: `sqlite3` (npm package). Lee `core/constants` (EVENTS, FIELDS, HELPERS, CONFIG, ERRORS).
- **Downstream**: cualquier módulo que publique `db.query.request`, `db.schema.init.request`, `db.persist.request`. Probablemente: `project-manager`, `chat-io`, `memory-user-profile`, `memory-conversation-summary`, `memory-rag`, `cocina-poc`, etc.

## Side effects en lifecycle

- **`onLoad`**: crea `projectsPath` directory si no existe. NO emite eventos (excepto `module.loading` y `module.loaded` log).
- **`onUnload`**: cierra TODAS las conexiones DB en cascada (sin Promise.all — secuencial). Loguea errores per-DB.
- **`getDatabase` (lazy)**: la primera vez que se solicita una DB, abre instancia y publica `db.created` SI el archivo es nuevo. Si existe, abre y loguea `db.loaded.existing`.

## Drifts conocidos en baseline (92)

| Tipo | Count | Origen |
|---|---|---|
| `error_sin_metric` | 21 | Cada catch sin `metrics.increment`. |
| `error_como_string_suelto` | 17 | Returns con `error: 'mensaje'` (en HTTP handlers + tools). |
| `metrica_sin_prefix_modulo` | 15 | Métricas sin prefijo `database-manager.*`. |
| `error_sin_log` | 11 | Catches sin log estructurado. |
| `nombre_log_metric_critico` | 7 | Log/metric names sin convención. |
| `generic_verb` | 5 | Eventos `*.response` (falso positivo del validator). |
| `rpc_over_pubsub` | 5 | Eventos `*.response` (falso positivo del validator). |
| `tool_errores_conocidos_vacio_handler_devuelve_error` | 4 | Tools sin `errores_conocidos[]` declarados. |
| `tool_handler_que_devuelve_valor_pelado` | 4 | Tools sin shape canónico. |
| `log_spam_en_bucle` | 3 | Loops con `logger.info` por iteración. |

**Patrón principal**: errores sin metric/log + returns con string suelto + métricas sin prefijo + tools sin contrato canónico. Mismo patrón que scheduler/credential-manager.

## Cosas críticas a preservar (validación post-rewrite)

1. **8 eventos del bus invariantes**: `db.created`, `db.deleted`, `db.query.executed`, `db.schema.initialized`, `db.query.response`, `db.schema.init.response`, `db.persist.response`, y `db.created` al crear DB nueva.
2. **Backward compatibility con legacy paths**: `system` y `_prompts` siguen usando `data/projects/<id>/db.sqlite`.
3. **Cache de `projectPaths`**: evita queries repetidas al system DB para resolver paths.
4. **`saveDatabase` no-op pero presente**: API symmetry para callers que esperan ese método.
5. **Tolerancia a `already exists`**: en schema init, ignorar errores de tabla/índice duplicados.
6. **Resolución cascada de path**: system → cache → query system DB → fallback legacy.
7. **Cleanup ordenado en onUnload**: cerrar TODAS las conexiones antes de clear maps.

## Plan del rewrite

1. **Archivar monolito** en `arquitectura/migracion/_legacy/database-manager-monolito-pre-rewrite.js.bak`.
2. **Reescribir index.js** preservando dominio + 5 helpers POC2 + telemetría canónica.
3. **module.json v3.0.0** con observability completa + tools al ancho canónico (errores_conocidos declarados).
4. **Tests por capas** con mock de sqlite3 (in-memory `:memory:`):
   - Group 1: Lifecycle (onLoad/onUnload).
   - Group 2: Validación canónica (queries inválidas, schemas vacíos).
   - Group 3: Success paths (query, schema init, persist).
   - Group 4: HTTP handlers shape canónico.
   - Group 5: Tools del LLM con shape `{status, data | error}`.
   - Group 6: Resolución de paths (system, cache, fallback).
   - Group 7: Helpers POC2 internos.
5. **Wire CI** + verificar drift count ≤30% original.
6. **Commit con métricas antes/después** + regenerar PROGRESO.
