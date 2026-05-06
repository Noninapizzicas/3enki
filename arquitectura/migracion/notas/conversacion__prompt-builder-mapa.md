# conversacion__prompt-builder — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/conversacion/prompt-builder/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 346.
- **Drifts en baseline**: 7 (5 tipos).
- **Categoria**: core.
- **Description oficial**: Construye el system prompt al recibir chat.message.saved. Mantiene en cache los prompt.json y context.json de los módulos (FS) y los prompts del usuario (prompt-manager). Emite chat.prompt.ready con los 9 campos.

## Responsabilidad acotada

Construye el system prompt para el LLM al recibir `chat.message.saved`.
Hidrata caches in-memory de **3 fuentes** (base + modulos del FS +
prompts del usuario via `prompt-manager`), agrega historial filtrado por
`in_context = 1`, y escucha `chat.context.enriched` (extension point) para
incorporar contexto de memorias modulares por priority. NO se descompone:
es UN dominio (build prompt), un solo evento de salida (`chat.prompt.ready`)
y ningun storage propio.

## Inventario de eventos (extraido del audit)

### Publishes (3)

- `prompt.list.request` — emitido en `_requestUserPrompts`.
- `db.query.request` — emitido en `_db`.
- `chat.prompt.ready` — emitido en `onMessageSaved` (handler de `chat.message.saved`).

### Subscribes (6)

- `chat.message.saved` → `onMessageSaved`
- `prompt.list.response` → `onPromptListResponse`
- `prompt.created` → `onPromptUpserted`
- `prompt.updated` → `onPromptUpserted`
- `prompt.deleted` → `onPromptDeleted`
- `db.query.response` → `onDbQueryResponse`

## Drifts conocidos en baseline (7)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_generic_verb` | 2 | _(detalles abajo)_ |
| `drift_rpc_over_pubsub` | 2 | _(detalles abajo)_ |
| `drift_publish_chat_flow_sin_correlation_id` | 1 | _(detalles abajo)_ |
| `drift_publish_dominio_sin_project_id` | 1 | _(detalles abajo)_ |
| `drift_log_spam_en_bucle` | 1 | _(detalles abajo)_ |

**Patron principal**: el codigo legacy ya estaba 90% canonico (chat-flow
v1.0.0 ya implementado, pendingDb con timeout, extension point
chat.context.enriched ya integrado). Los 7 drifts en baseline son falsos
positivos sistemicos: 2 generic_verb + 2 rpc_over_pubsub sobre
`prompt.list.request/response` (canonico request/response correlacionado
con prompt-manager), 2 multi-tenancy false positives sobre chat.prompt.ready
(ya lleva project_id en payload — el audit JSON esta stale), y 1
log_spam_en_bucle de heuristica sobre `_scanModules` (recursion sin logger
inside). Patch quirurgico: anyadir 5 helpers POC2 + observability completa
+ onUnload limpia caches + metrics en error paths. Sin tocar la logica
core del pipeline.

## Cosas criticas a preservar (validacion post-rewrite)

1. **chat.prompt.ready** con shape chat-flow v1.0.0 (correlation_id,
   project_id, user_id, channel, channel_context, message_id,
   system_prompt, messages[], settings, intencion?, attachments?).
2. **3 niveles de prompt resolution**: prompt_id (UUID) en cache de
   usuario → fallback a `prompt.json` del modulo → fallback a `_base`.
3. **`_scanModules` recursivo**: anidados (pizzepos/cocina) descubiertos
   solo si el padre NO tiene `prompt.json`/`context.json` propio.
4. **Cache invalidation** por eventos: prompt.created/updated/deleted
   invalidan/actualizan `_userPrompts` Map sin reload.
5. **Extension point chat.context.enriched**: acumula por message_id,
   ordena por priority asc (0-99 base, 100-499 perfil, 500-999 RAG,
   1000+ especulativa), descarta expirados (`expires_at` en pasado),
   limpia tras consumir en onMessageSaved.
6. **Historial filtrado por `in_context = 1`**: respeta el toggle del
   usuario (`manually_toggled = 1` desde chat-io).
7. **Resilience**: `prompt.list.request` falla soft (warn), `_db` falla
   soft (warn + history vacio), base.prompt.json missing falla soft (warn).

## Plan del rewrite

1. Archivar monolito (346 LOC) en `_legacy/conversacion__prompt-builder-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `prompt-builder.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/conversacion__prompt-builder.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
