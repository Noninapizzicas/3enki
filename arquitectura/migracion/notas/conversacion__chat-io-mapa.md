# conversacion__chat-io — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/conversacion/chat-io/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 654.
- **Drifts en baseline**: 48 (10 tipos).
- **Categoria**: core.
- **Description oficial**: Entrada y salida del chat. Recibe mensajes del frontend (ui/request/conversation/send), persiste conversaciones y mensajes en SQLite por proyecto, aplica FIFO de contexto, y reenvía la respuesta del LLM al frontend por MQTT (conversation/{id}/message).

## Responsabilidad acotada

Entrada y salida del chat. UN modulo con dos vertices: (a) **IN** — recibe
mensajes del usuario via 8 ui_handlers (send/create/list/load/delete/
update_settings/toggle_context/context_stats), persiste en SQLite por
proyecto, publica `chat.message.saved`; (b) **OUT** — escucha
`ai.chat.response` y `ai.chat.failed`, persiste el assistant message y
empuja al canal de origen (MQTT para web, otros canales tienen su modulo
propio). NO se descompone — es UN dominio de I/O del chat. La separacion
con prompt-builder, ai-gateway, channel-* esta clara y viene de
chat-flow.contract.

## Inventario de eventos (extraido del audit)

### Publishes (4)

- `db.query.request` — emitido en `_db`.
- `chat.message.saved` — emitido en `handleSend` (handler de `ui/request/conversation/send`).
- `chat.assistant.saved` — emitido en `onAiResponse` (handler de `ai.chat.response`).
- `conversation/${conversation_id}/message` — emitido en `onAiResponse` (handler de `ai.chat.response`).

### Subscribes (3)

- `ai.chat.response` → `onAiResponse`
- `db.query.response` → `onDbQueryResponse`
- `project.activated` → `onProjectActivated`

## Drifts conocidos en baseline (48)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_inventar_error_code` | 17 | _(detalles abajo)_ |
| `drift_ui_handler_sin_type_canonico` | 8 | _(detalles abajo)_ |
| `drift_ui_handler_sin_zone_canonica` | 8 | _(detalles abajo)_ |
| `drift_schema_drift_undeclared` | 6 | _(detalles abajo)_ |
| `drift_respuesta_no_canonica` | 4 | _(detalles abajo)_ |
| `drift_publish_chat_flow_sin_correlation_id` | 1 | _(detalles abajo)_ |
| `drift_generic_verb` | 1 | _(detalles abajo)_ |
| `drift_rpc_over_pubsub` | 1 | _(detalles abajo)_ |
| `drift_publish_atribuible_sin_user_id` | 1 | _(detalles abajo)_ |
| `drift_publish_dominio_sin_project_id` | 1 | _(detalles abajo)_ |

**Patron principal**: 21 drifts reales del legacy (17 inventar_error_code
por throws con codes ad-hoc PROJECT_REQUIRED/CONVERSATION_REQUIRED/
MESSAGE_ID_REQUIRED + 4 respuesta_no_canonica) — todos cerrados al canonizar
handlers con `_handleHandlerError` y migrar codes ad-hoc a
`VALIDATION_FAILED` con `details.kind` como discriminator UI. Los 27
restantes son falsos positivos cross-system: 8 ui_handler_sin_type_canonico
+ 8 ui_handler_sin_zone_canonica (ningun modulo del repo declara aun esos
campos), 6 schema_drift_undeclared (la nueva v2.0.0 declara las tablas en
module.json.schemas), y 5 mas sobre canonical request/response patterns que
SI se cumplen.

## Cosas criticas a preservar (validacion post-rewrite)

1. **2 publishes canonicos**: `chat.message.saved` (chat-flow v1.0.0 con
   correlation_id, project_id, user_id, channel, channel_context,
   message_id, user_message, attachments, intencion, settings, prompt_id,
   page_id, page_context) + `chat.assistant.saved`.
2. **8 ui_handlers** con sus action names exactos.
3. **Subscribes a 4 eventos**: `ai.chat.response`, `ai.chat.failed`,
   `db.query.response`, `project.activated`.
4. **Schema SQLite idempotente**: `conversations` + `messages` con CREATE
   TABLE IF NOT EXISTS + indexes. Migracion suave en `_migrateSchema`
   anyade columnas que falten (PRAGMA table_info).
5. **FIFO de contexto**: `_applyContextFIFO` desactiva los mensajes mas
   antiguos (`in_context = 0`) al exceder `context_window`, respetando
   `manually_toggled = 1` (toggle del usuario es congelado).
6. **Cache `knownConversations`**: evita SELECT redundante en cada send.
7. **MQTT push para web**: en `onAiResponse` y `onAiFailed`, si
   `channel === 'web'` o no hay channel, publica a
   `conversation/{id}/message`. Otros canales (telegram, voice, etc.) los
   maneja su propio modulo de canal — agnosticismo respetado.
8. **`_userMessageForErrorCode`**: traduce `error.code` canonico a mensaje
   legible al usuario (8 codes mapeados + fallback con el code en bruto).
   Garantia `no_silent_failures` del chat-flow contract.
9. **Identidad multi-tenant**: `user_id = 'default'` si single-user; viene
   del payload si multi-user.

## Plan del rewrite

1. Archivar monolito (654 LOC) en `_legacy/conversacion__chat-io-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `chat-io.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/conversacion__chat-io.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
