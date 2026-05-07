# prompt-manager — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completadas las decisiones de dominio.

## Identidad

- **Path**: `modules/prompt-manager/`
- **Version actual**: 2.0.0 → bump a **3.0.0** post-rewrite (rompe shape interno: handlers HTTP/UI/tool comparten internals; analytics solo persistida; tools devuelven shape canonico).
- **LOC index.js**: 1703.
- **Drifts en baseline**: 134 (17 tipos).
- **Categoria**: infra.
- **Description oficial**: Sistema de gestion de prompts con versionado, slots, presets y analytics. Usa database-manager para persistencia.

## Responsabilidad acotada

Gestor canonico de prompts del sistema con cinco responsabilidades coherentes alrededor del mismo estado (CRUD de prompts, versionado, slots/presets como composicion declarativa, render de templates con variables, analytics de uso). NO se descompone: las cinco comparten los mismos Maps in-memory y el dominio es internamente cohesionado. Una descomposicion posible a futuro (`prompt-analytics` separado) queda fuera del scope porque los analytics actuales son lecturas+escrituras puntuales que no justifican un modulo aparte.

## Inventario de eventos (extraido del audit)

### Publishes canonicos (post-rewrite)

- `prompt.created` — CRUD: prompt creado. Payload: `{ id, name, slot_type, project_id, correlation_id, timestamp }`.
- `prompt.updated` — CRUD: prompt actualizado. Payload: `{ id, name, version, project_id, correlation_id, timestamp }`.
- `prompt.deleted` — CRUD: prompt eliminado. Payload: `{ id, project_id, correlation_id, timestamp }`.
- `preset.created` — preset creado. Payload: `{ id, name, project_id, correlation_id, timestamp }`.
- `preset.deleted` — preset eliminado. Payload: `{ id, project_id, correlation_id, timestamp }`.
- `prompt.get.response` — par success/failure separados; success: `{ request_id, prompt, correlation_id }`, failure: `{ request_id, error: { code, message }, correlation_id }`.
- `prompt.list.response` — `{ request_id, prompts[], correlation_id }`.

### Publishes internos (RPC a database-manager — NO se declaran en module.json.publishes)

- `db.query.request` — emitido en helper `_db()` para queries SQL.
- `db.schema.init.request` — emitido en `onLoad` para inicializar schema una vez.

### Subscribes (canonicos post-rewrite)

- `db.query.response` → `onDbQueryResponse` (resuelve pending por request_id).
- `db.schema.init.response` → `onDbSchemaInitResponse` (resuelve pending del schema init).
- `prompt.get.request` → `onPromptGetRequest` (RPC cross-modulo: prompt-builder, agentes).
- `prompt.list.request` → `onPromptListRequest` (RPC cross-modulo).
- `ai.completion.completed` → `onAICompletionCompleted` (analytics de uso si event trae prompt_id).
- `ai.request.started` → `onAIRequestStarted` (idem; declarado solo si el publisher lo emite).

## Drifts en baseline (134) — clasificacion

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_como_string_suelto` | 27 | **REAL** — handlers throw `{ status, code, message }` no canonico; HTTP devuelve `{ error: 'CODE' }` en lugar de `{ error: { code } }`. |
| `drift_error_sin_metric` | 26 | **REAL** — error paths no llaman `metrics.increment`. |
| `drift_inventar_error_code` | 17 | **REAL** — codigos custom (`PROMPT_NOT_FOUND`, `CREATE_FAILED`, etc.) en lugar de `RESOURCE_NOT_FOUND` + `details.entity_type`. |
| `drift_publish_dominio_sin_project_id` | 12 | **REAL** — `prompt.created/updated/deleted` y `preset.created/deleted` emitidos desde flujo MQTT sin `project_id`. |
| `drift_error_sin_log` | 11 | **REAL** — algunos catch silentes en analytics y composer. |
| `drift_ui_handler_sin_type_canonico` | 9 | **REAL** — UI handlers throwean en lugar de devolver shape canonico. |
| `drift_ui_handler_sin_zone_canonica` | 9 | **REAL** — idem. |
| `drift_generic_verb` | 5 | **REAL** — algunos logs usan verbos genericos (`error`, `failed`) sin entidad. |
| `drift_rpc_over_pubsub` | 5 | **REAL** — pendingRequests sin clearTimeout en onUnload + RPC mezclado con pub/sub. |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 3 | **REAL** — module.json.tools[] no declara `errores_conocidos`. |
| `drift_tool_handler_que_devuelve_valor_pelado` | 3 | **REAL** — tools devuelven `{status, data: { error: 'msg' }}` mezcla de shapes. |
| `drift_auth_undeclared` | 1 | **STALE** — auth no aplica a este modulo (es backend interno). Falso positivo. |
| `drift_missing_onUnload_with_reservations` | 1 | **REAL** — onUnload no clearTimeout sobre pendingRequests. |
| `drift_correlation_id_no_propagado` | 1 | **REAL** — solo 2/40 metodos lo propagan. |
| `drift_log_spam_en_bucle` | 1 | **REAL** — `prompt.tool.list.called`/`.result` por cada call sin sampling. |
| `drift_unbounded_growth_no_eviction` | 1 | **REAL** — `analytics` Map sin invalidacion → leak. Decision: eliminar Map y persistir solo en DB. |
| `drift_undeclared_persistence_pattern` | 1 | **REAL** — module.json.config.persistence ausente. |

**Patron principal**: ~95% de los drifts son **reales** y se cierran con (a) shape canonico de errores, (b) helpers POC2, (c) propagacion de correlation_id, (d) declaraciones canonicas en module.json (persistence + observability + errores_conocidos), (e) eliminar Map de analytics. Solo `drift_auth_undeclared` es stale/falso positivo.

## Cosas criticas a preservar (validacion post-rewrite)

1. **Schema SQL en disco se preserva** (`schema.sql`). Schema cargado en onLoad y enviado a database-manager para inicializar la DB `_prompts`.
2. **GLOBAL_PROJECT_ID = `_prompts`** sigue siendo el project_id sentinela para prompts compartidos cross-projects (no es un project real, es un tenant logico).
3. **5 SLOT_TYPES**: `system`, `context`, `prefix`, `suffix`, `format`. Es contrato del frontend del prompt-manager UI.
4. **Versionado patch-bump** automatico cuando cambia `content`. Versiones anteriores accesibles via render(version=X).
5. **Eventos del bus se mantienen invariantes**: `prompt.created/updated/deleted`, `preset.created/deleted`, `prompt.get.response`, `prompt.list.response`. Los consumers actuales (prompt-builder, agentes) siguen funcionando.
6. **Tools del LLM se mantienen**: `prompt.list`, `prompt.get`, `prompt.render` con la misma semantica (solo cambia el shape del retorno a canonico).
7. **UI handlers se mantienen** para el frontend actual (12 handlers `domain=prompt|preset|composer`).
8. **APIs HTTP** se mantienen pero devuelven shape canonico `{status, data | error: { code, message }}`.
9. **Analytics**: persistido en `prompt_analytics` (DB), NO en memoria. Lectura on-demand para `handleUIAnalytics` y `handleGetAnalytics`.

## Plan del rewrite

1. Archivar monolito (1703 LOC) en `_legacy/prompt-manager-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_ ✓
2. Reescribir `index.js` v3.0.0 al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `_db` para queries DB).
   - `_ensureSchema` que enviar `db.schema.init.request` una sola vez por GLOBAL_PROJECT_ID.
   - Internals deduplicados: `_createPromptInternal`, `_updatePromptInternal`, `_deletePromptInternal`, `_createPresetInternal`, `_deletePresetInternal`. Handlers HTTP/UI son thin wrappers que adaptan I/O.
   - Throws con `_code` canonico (RESOURCE_NOT_FOUND, VALIDATION_FAILED, ALREADY_EXISTS, INTERNAL_ERROR).
   - Handlers UI/HTTP/Tool devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `prompt-manager.*`.
   - `correlation_id` propagado en todos los publishes via `_publicarEvento`.
   - `onUnload` limpia pendingDb (clearTimeout cada uno) + Maps.
3. `module.json` v3.0.0:
   - `tracing.propaga_correlation_id: true`.
   - `config.persistence` declarado (sqlite-via-database-manager, project_id=`_prompts`).
   - `observability.metrics` con counters/timings canonicos.
   - `tools[].errores_conocidos` rellenado (VALIDATION_FAILED, RESOURCE_NOT_FOUND, INTERNAL_ERROR).
   - Subscribes documentando que `ai.completion.completed` y `ai.request.started` son opcionales (analytics).
4. Tests por capas (`tests/unit/prompt-manager.test.js`):
   - Group 1: Lifecycle. _(skeleton listo)_ + asserts de estado limpio + onUnload sin leak.
   - Group 2: Validacion canonica de los 3 tools y de UI/HTTP handlers principales.
   - Group 3: CRUD prompts (create+publish+cache + update bumps version + delete cascade).
   - Group 4: CRUD presets (create con slots + delete).
   - Group 5: Bus handlers RPC (`prompt.get.request` + `prompt.list.request`) — par success/failure correlacionado por request_id.
   - Group 6: Render template + recordUsage analytics.
   - Group 7: Helpers POC2. _(skeleton listo, asserts canonicos)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_ ✓
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con mensaje canonico via `finish-rewrite.js prompt-manager --commit`.
