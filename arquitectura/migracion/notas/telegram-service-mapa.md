# telegram-service — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/telegram-service/`
- **Version actual**: 3.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 753.
- **Drifts en baseline**: 91 (8 tipos).
- **Categoria**: core.
- **Description oficial**: Multi-bot Telegram service - centralized management, credential-manager integration

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (20)

- `telegram.send_message.response` — emitido en `?` (handler de `telegram.send_message.request`).
- `telegram.get_file.response` — emitido en `?` (handler de `telegram.get_file.request`).
- `telegram.send_photo.response` — emitido en `?` (handler de `telegram.send_photo.request`).
- `telegram.send_document.response` — emitido en `?` (handler de `telegram.send_document.request`).
- `telegram.send_video.response` — emitido en `?` (handler de `telegram.send_video.request`).
- `telegram.send_location.response` — emitido en `?` (handler de `telegram.send_location.request`).
- `telegram.edit_message.response` — emitido en `?` (handler de `telegram.edit_message.request`).
- `telegram.delete_message.response` — emitido en `?` (handler de `telegram.delete_message.request`).
- `telegram.answer_callback.response` — emitido en `?` (handler de `telegram.answer_callback.request`).
- `telegram.get_chat.response` — emitido en `?` (handler de `telegram.get_chat.request`).
- `telegram.set_commands.response` — emitido en `?` (handler de `telegram.set_commands.request`).
- `telegram.list_bots.response` — emitido en `?` (handler de `telegram.list_bots.request`).
- `telegram.bot.started` — emitido en `?`.
- `telegram.bot.error` — emitido en `?`.
- `telegram.bot.stopped` — emitido en `?`.
- `busEvent` — emitido en `?` (handler de `callback dinámico de telegram client.on(clientEvent)`).
- `telegram.bot.error` — emitido en `?`.
- `telegram.queue.overflow` — emitido en `?`.
- `telegram.message.sent` — emitido en `?`.
- `telegram.send.failed` — emitido en `?`.

### Subscribes (14)

- `credential.saved` → `?`
- `credential.deleted` → `?`
- `telegram.send_message.request` → `?`
- `telegram.get_file.request` → `?`
- `telegram.send_photo.request` → `?`
- `telegram.send_document.request` → `?`
- `telegram.send_video.request` → `?`
- `telegram.send_location.request` → `?`
- `telegram.edit_message.request` → `?`
- `telegram.delete_message.request` → `?`
- `telegram.answer_callback.request` → `?`
- `telegram.get_chat.request` → `?`
- `telegram.set_commands.request` → `?`
- `telegram.list_bots.request` → `?`

## Drifts conocidos en baseline (91)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_respuesta_no_canonica` | 22 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 20 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_generic_verb` | 12 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_rpc_over_pubsub` | 12 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_handler_que_devuelve_valor_pelado` | 12 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 11 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_correlation_id_no_propagado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_log_spam_en_bucle` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (753 LOC) en `_legacy/telegram-service-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `telegram-service.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/telegram-service.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
