# conversacion__ai-agent-framework — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/conversacion/ai-agent-framework/`
- **Version actual**: 1.2.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 611.
- **Drifts en baseline**: 131 (15 tipos).
- **Categoria**: core.
- **Description oficial**: Carga agentes desde agents/*.json + prompts/*.json. Registra la tool invoke_agent (para el LLM) y escucha agent.execute.request (para módulos del dominio). Ambos paths usan el mismo helper interno _runAgent: arma el prompt del agente y llama al LLM via llm.complete.request. Emite agent.execute.progress (canonico v1.1.0) en step='started' y step='finalizing' para que la tarjeta del agente en el chat se actualice. Cuando se incluye conversation_id, también publica el resultado como mensaje en la conversación con metadata.author del agente (preparado para chat multi-participante).

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (6)

- `${responseEventName}` — emitido en `_runAgent` (handler de `agente no encontrado — error path`).
- `${responseEventName} (timeout path)` — emitido en `_runAgent` (handler de `timeout del LLM — callback de setTimeout`).
- `llm.complete.request` — emitido en `_runAgent`.
- `${pending.response_event} (error path)` — emitido en `onLlmCompleteResponse` (handler de `llm.complete.response — LLM devolvio error`).
- `chat.assistant.saved` — emitido en `onLlmCompleteResponse` (handler de `llm.complete.response — inyeccion en conversacion cuando hay conversation_id`).
- `${pending.response_event} (success path)` — emitido en `onLlmCompleteResponse` (handler de `llm.complete.response — respuesta exitosa del agente`).

### Subscribes (3)

- `invoke_agent` → `onInvokeAgent`
- `agent.execute.request` → `onAgentExecuteRequest`
- `llm.complete.response` → `onLlmCompleteResponse`

## Drifts conocidos en baseline (131)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_agent_no_cumple_schema` | 30 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_markdown_con_shape_estructurable` | 25 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_agent_stats_persistido` | 24 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_agent_idioma_inconsistente_con_modulo` | 14 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_agent_prompt_file_sin_h1` | 11 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_agent_tools_fantasma` | 10 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 5 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_agent_disabled_sin_razon_documentada` | 4 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_uso_de_alias_agentName` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_agent_demasiadas_tools` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_design_doc_propio_de_modulo` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_generic_verb` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_rpc_over_pubsub` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_log_spam_en_bucle` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_hard_coupled_to_external_module` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (611 LOC) en `_legacy/conversacion__ai-agent-framework-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `ai-agent-framework.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/conversacion__ai-agent-framework.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
