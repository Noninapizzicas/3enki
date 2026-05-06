# channel-manager — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/channel-manager/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 493.
- **Drifts en baseline**: 29 (8 tipos).
- **Categoria**: core.
- **Description oficial**: Registry de canales externos: mapea identificadores externos (chat_id, email, telefono) a proyectos y propositos internos

## Responsabilidad acotada

Registry de canales externos que mapea `{channel_type, external_id}` →
`{project_id, purpose, label, metadata}`. NO se descompone — es UN dominio
(routing/lookup) con una sola tabla owned, cache in-memory + bus handler +
6 UI handlers + 2 tools del LLM. Diferenciado explicitamente de
credential-manager: este modulo es "a donde va este mensaje", no "con que
token me autentico".

## Inventario de eventos (extraido del audit)

### Publishes (9)

- `channel.registered` — emitido en `?`.
- `channel.updated` — emitido en `?`.
- `channel.removed` — emitido en `?`.
- `channel.resolved` — emitido en `?` (handler de `channel-manager.resolve.request`).
- `channel-manager.resolve.response` — emitido en `?` (handler de `channel-manager.resolve.request`).
- `channel-manager.resolve.response` — emitido en `?` (handler de `channel-manager.resolve.request`).
- `db.query.request` — emitido en `?`.
- `eventType` — emitido en `?`.
- `eventType` — emitido en `?`.

### Subscribes (1)

- `channel-manager.resolve.request` → `?`

## Drifts conocidos en baseline (29)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_publish_dominio_sin_project_id` | 8 | _(detalles en patron principal abajo)_ |
| `drift_error_sin_log` | 5 | _(detalles en patron principal abajo)_ |
| `drift_error_sin_metric` | 5 | _(detalles en patron principal abajo)_ |
| `drift_generic_verb` | 3 | _(detalles en patron principal abajo)_ |
| `drift_rpc_over_pubsub` | 3 | _(detalles en patron principal abajo)_ |
| `drift_error_como_string_suelto` | 2 | _(detalles en patron principal abajo)_ |
| `drift_tool_handler_que_devuelve_valor_pelado` | 2 | _(detalles en patron principal abajo)_ |
| `drift_correlation_id_no_propagado` | 1 | _(detalles en patron principal abajo)_ |

**Patron principal**: 12 drifts reales del legacy (5 error_sin_log + 5 error_sin_metric + 2 error_como_string_suelto + 2 tool_handler_que_devuelve_valor_pelado + 1 correlation_id_no_propagado) — todos cerrados al canonizar handlers con `_handleHandlerError` (log+metric+shape). Los 17 restantes son falsos positivos cross-system: 8 publish_dominio_sin_project_id (los channel.* SI llevan project_id en payload — el audit JSON es stale), 3 generic_verb + 3 rpc_over_pubsub sobre `channel-manager.resolve.response` (canonico request/response correlacionado por request_id).

## Cosas criticas a preservar (validacion post-rewrite)

1. **5 eventos del bus invariantes**: `channel.registered`, `channel.updated`,
   `channel.removed`, `channel.resolved`, `channel-manager.resolve.response`.
2. **6 UI handlers** con sus action names exactos (register, update, remove,
   resolve, list, list-by-project).
3. **2 tools del LLM** (`channel.resolve`, `channel.list`) con shape canonico
   `{ status, data }` — fix del drift `tool_handler_que_devuelve_valor_pelado`.
4. **Schema SQLite idempotente** (CREATE TABLE IF NOT EXISTS + UNIQUE constraint
   en `(channel_type, external_id)` + ON CONFLICT DO UPDATE en register).
5. **Cache in-memory** con clave `<channel_type>:<external_id>` — invalidado en
   update con enabled=false y en remove.
6. **5 valid channel_types**: telegram, gmail, whatsapp, glovo, web.
7. **Subscribe a `db.query.response` + `db.schema.init.response`** para resolver
   pendingDbRequests Map por correlation_id (NO el patron antiguo
   subscribe-y-unsub por handler).
8. **onUnload con clearTimeout sobre pendingDbRequests** + reject + clear cache.

## Plan del rewrite

1. Archivar monolito (493 LOC) en `_legacy/channel-manager-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v2.0.0 al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `_cacheKey`).
   - Throws con `_code` canonico (`VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`).
   - Handlers UI + tools devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `channel-manager.*`.
   - pendingDbRequests Map con timeout/cleanup en `_publishDb` (sustituye al patron subscribe-and-unsub del legacy).
3. `module.json` v2.0.0:
   - `tracing.propaga_correlation_id: true`.
   - Renombrar `handlers` -> `ui_handlers`.
   - Counters/gauges con prefix `channel-manager.*` (antes `channel.*`).
4. Tests por capas (7 grupos, 27 tests):
   - Group 1: Lifecycle (schema init + cache load + onUnload con leak test).
   - Group 2: Validacion canonica (8 tests, cada handler con payload invalido).
   - Group 3: CRUD register/update/remove (eventos + cache + 404 RESOURCE_NOT_FOUND).
   - Group 4: Resolve cache hit/miss + list/listByProject.
   - Group 5: Bus handler `onResolveRequest` (par success/found:false + warn sin request_id).
   - Group 6: Tool handlers (resolve hit/miss + list).
   - Group 7: Helpers POC2 (4 tests estandar).
   - Mock SQLite via sql.js + bus reactivo que responde a `db.query.request` + `db.schema.init.request`.
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
