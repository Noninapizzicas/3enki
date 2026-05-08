# conversacion__agent-observer — Mapa exhaustivo (PASO 0)

## Identidad

- **Path**: `modules/conversacion/agent-observer/`
- **Version actual**: 1.0.0 → bump a **2.0.0**.
- **LOC index.js**: 216.
- **Drifts en baseline**: 0.
- **Categoria**: core (agent-flow inline rendering).
- **Idioma**: `en`.

## Responsabilidad acotada

Observer del subsistema agentes: escucha los 4 eventos canonicos de `agent-flow` (request, progress, response, failed) y los traduce a `chat.assistant.saved` con `metadata.block.type='agent_intervention'` para que las tarjetas colapsables del agente aparezcan inline en el chat. Sin este modulo, los agentes invocados desde modulos del dominio son silenciosos para el usuario.

**NO se descompone**: 216 LOC, una sola responsabilidad clara (translate agent-flow → chat-flow).

## Inventario

### Publishes (1) — preservado invariante

- `chat.assistant.saved` — payload con `correlation_id`, `conversation_id`, `message_id`, `assistant_message`, `metadata` (JSON-stringified con `author.kind='agent'` + `block`). `project_id` opcional.

### Subscribes (4) — preservados invariantes

- `agent.execute.request` → `onAgentExecuteRequest` (abre tarjeta status=open).
- `agent.execute.progress` → `onAgentExecuteProgress` (actualiza tarjeta abierta).
- `agent.execute.response` → `onAgentExecuteResponse` (cierra tarjeta status=closed).
- `agent.execute.failed` → `onAgentExecuteFailed` (cierra tarjeta status=failed).

### UI handlers / HTTP / Tools

Ninguno. Modulo bus-only.

## Drifts

0 en baseline. Migracion al canon POC2 sin regresion esperada.

## Cosas criticas a preservar

1. **Politica fail-silent**: si NO hay `conversation_id` en el evento, no emitir nada.
2. **Cache `openCards`** correlacionada por `request_id`.
3. **`config.enabled === false`** corta toda la actividad sin error.
4. **`min_message_for_progress`** filtra steps de progress (default `'thinking'`).
5. **`summary_max_chars`** (default 280) trunca content del response.
6. **`detail_voluminoso`** flag con `detail_url` cuando content excede summary_max_chars.
7. **Schema refs** en module.json preservados.

## Plan del rewrite

1. Archivar monolito en `_legacy/`. _(automatico)_
2. Reescribir `index.js` v2.0.0 con 5 helpers POC2 + `_publicarEvento` para `chat.assistant.saved`.
3. `module.json` v2.0.0 con `tracing.propaga_correlation_id: true`, `events.{publishes,subscribes}` shape canonico, observability counters.
4. Tests por capas:
   - Group 1+7 ya scaffoldeados.
   - Group 2: Bus handlers (request/progress/response/failed).
   - Group 3: Politica fail-silent.
   - Group 4: Filtro min_message_for_progress.
   - Group 5: Truncate + detail_voluminoso.
5. Commit via `finish-rewrite`.
