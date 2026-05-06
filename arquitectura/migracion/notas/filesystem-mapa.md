# filesystem — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/filesystem/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 1290.
- **Drifts en baseline**: 196 (18 tipos).
- **Categoria**: core.
- **Description oficial**: Core filesystem operations for the entire system

## Responsabilidad acotada

Operaciones de filesystem para todo el sistema con scoping por proyecto
activo (storage/ subdir) + system mode (Sistema project = root). UN dominio:
acceso seguro a fichero/directorio, expuesto en 3 superficies (UI handlers,
tools del LLM, bus events). NO se descompone: la logica de path security
(`validatePath`) es transversal a las 3 superficies y separarlas duplicaria
codigo critico de seguridad.

## Inventario de eventos (extraido del audit)

### Publishes (24)

- `archivo.listado` — emitido en `onArchivoListarSolicitado` (handler de `archivo.listar.solicitado (legacy en español)`).
- `archivo.listar.fallido` — emitido en `onArchivoListarSolicitado` (handler de `archivo.listar.solicitado (legacy en español)`).
- `archivo.leido` — emitido en `onArchivoLeerSolicitado` (handler de `archivo.leer.solicitado (legacy en español)`).
- `archivo.leer.fallido` — emitido en `onArchivoLeerSolicitado` (handler de `archivo.leer.solicitado (legacy en español)`).
- `archivo.borrado` — emitido en `onArchivoBorrarSolicitado` (handler de `archivo.borrar.solicitado (legacy en español)`).
- `archivo.borrar.fallido` — emitido en `onArchivoBorrarSolicitado` (handler de `archivo.borrar.solicitado (legacy en español)`).
- `fs.write.response` — emitido en `onWriteRequest` (handler de `fs.write.request`).
- `fs.copy.response` — emitido en `onCopyRequest` (handler de `fs.copy.request`).
- `fs.read.response` — emitido en `onReadRequest` (handler de `fs.read.request`).
- `fs.delete.response` — emitido en `onDeleteRequest` (handler de `fs.delete.request`).
- `fs.list.response` — emitido en `onListRequest` (handler de `fs.list.request`).
- `fs.mkdir.response` — emitido en `onMkdirRequest` (handler de `fs.mkdir.request`).
- `responseEvent` — emitido en `onMoveRequest` (handler de `fs.move.request | fs.rename.request`).
- `fs.exists.response` — emitido en `onExistsRequest` (handler de `fs.exists.request`).
- `fs.exists.response` — emitido en `onExistsRequest` (handler de `fs.exists.request`).
- `fs.exists.response` — emitido en `onExistsRequest` (handler de `fs.exists.request`).
- `fs.info.response` — emitido en `onInfoRequest` (handler de `fs.info.request`).
- `fs.append.response` — emitido en `onAppendRequest` (handler de `fs.append.request`).
- `fs.append.response` — emitido en `onAppendRequest` (handler de `fs.append.request`).
- `fs.search.response` — emitido en `onSearchRequest` (handler de `fs.search.request`).
- `fs.stats.response` — emitido en `onStatsRequest` (handler de `fs.stats.request`).
- `eventType` — emitido en `handleWrite`.
- `fs.file.deleted` — emitido en `handleDelete`.
- `fs.directory.created` — emitido en `handleMkdir`.

### Subscribes (18)

- `project.activated` → `onProjectActivated`
- `project.deactivated` → `onProjectDeactivated`
- `archivo.listar.solicitado` → `onArchivoListarSolicitado`
- `archivo.leer.solicitado` → `onArchivoLeerSolicitado`
- `archivo.borrar.solicitado` → `onArchivoBorrarSolicitado`
- `fs.read.request` → `onReadRequest`
- `fs.write.request` → `onWriteRequest`
- `fs.copy.request` → `onCopyRequest`
- `fs.delete.request` → `onDeleteRequest`
- `fs.list.request` → `onListRequest`
- `fs.mkdir.request` → `onMkdirRequest`
- `fs.move.request` → `onMoveRequest`
- `fs.rename.request` → `onMoveRequest`
- `fs.exists.request` → `onExistsRequest`
- `fs.info.request` → `onInfoRequest`
- `fs.append.request` → `onAppendRequest`
- `fs.search.request` → `onSearchRequest`
- `fs.stats.request` → `onStatsRequest`

## Drifts conocidos en baseline (196)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_como_string_suelto` | 24 | _(detalles abajo)_ |
| `drift_error_sin_metric` | 23 | _(detalles abajo)_ |
| `drift_error_sin_log` | 22 | _(detalles abajo)_ |
| `drift_test_filesystem_persistente` | 17 | _(detalles abajo)_ |
| `drift_generic_verb` | 14 | _(detalles abajo)_ |
| `drift_rpc_over_pubsub` | 14 | _(detalles abajo)_ |
| `drift_silent_io_failure` | 14 | _(detalles abajo)_ |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 13 | _(detalles abajo)_ |
| `drift_tool_handler_que_devuelve_valor_pelado` | 13 | _(detalles abajo)_ |
| `drift_respuesta_no_canonica` | 9 | _(detalles abajo)_ |
| `drift_tool_declaration_no_cumple_schema` | 4 | _(detalles abajo)_ |
| `drift_publish_dominio_sin_project_id` | 2 | _(detalles abajo)_ |
| `drift_tool_name_sin_prefijo_de_modulo` | 2 | _(detalles abajo)_ |
| `drift_inventar_status_no_canonico` | 1 | _(detalles abajo)_ |
| `drift_missing_onUnload_with_reservations` | 1 | _(detalles abajo)_ |
| `drift_log_spam_en_bucle` | 1 | _(detalles abajo)_ |
| `drift_non_atomic_write` | 1 | _(detalles abajo)_ |
| `drift_undeclared_persistence_pattern` | 1 | _(detalles abajo)_ |

**Patron principal**: ~120 drifts reales del legacy (24
error_como_string_suelto + 23 error_sin_metric + 22 error_sin_log + 14
silent_io_failure + 13 tool_handler_que_devuelve_valor_pelado + 13
tool_errores_conocidos_vacio + 9 respuesta_no_canonica + 1
inventar_status_no_canonico) — todos cerrados al canonizar handlers con
`_handleHandlerError` (log+metric+shape canonico) y declarar
`errores_conocidos` en cada tool del module.json. Los ~30 restantes son
falsos positivos sistemicos: 14 generic_verb + 14 rpc_over_pubsub sobre
`fs.*.request/response` (canonico request/response correlacionado),
2 publish_dominio_sin_project_id (publishes infra fs.* — eventos a nivel
filesystem, no project), 1 non_atomic_write (real pero documentado: el
escenario es escritura no-atomica intencional para append/cleanup).

## Cosas criticas a preservar (validacion post-rewrite)

1. **14 ui_handlers + 14 tools del LLM** con sus action names exactos
   (list/read/write/delete/mkdir/move/copy/search/info/cleanup/stats/
   setWorkDir/getWorkDir/append).
2. **14 fs.*.request/response** del bus pattern + 3 spanish handlers
   archivo.{listar,leer,borrar}.solicitado.
3. **5 eventos de dominio**: fs.file.created/updated/deleted,
   fs.directory.created, fs.workdir.changed.
4. **`validatePath` publica** preservada (modulos externos pueden usarla).
   Patron de seguridad: `@/` bypass project context, `~`/`~/x` alias del
   project storage root, systemMode (Sistema project) permite acceso al cwd.
5. **AUTHORIZATION_REQUIRED** en path traversal (antes era code 403 con
   `error.code = 'PATH_TRAVERSAL'`; ahora canonico
   `error.code = 'AUTHORIZATION_REQUIRED'` + `details.kind = 'path_traversal'`).
6. **Project lifecycle**: onProjectActivated cambia working dir al
   storage; metadata.is_system → systemMode + cwd como activeProjectPath.
7. **Limites**: MAX_READ_SIZE = 10MB, MAX_SEARCH_RESULTS = 100, files
   text/binary detectados por extension.
8. **Compat naming en bus events**: `from`/`source` y `to`/`destination`
   ambos aceptados en move/copy.

## Plan del rewrite

1. Archivar monolito (1290 LOC) en `_legacy/filesystem-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `filesystem.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/filesystem.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
