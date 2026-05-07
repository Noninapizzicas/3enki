# conversacion/ai-gateway — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar código.

## Identidad

- **Path**: `modules/conversacion/ai-gateway/`
- **Versión actual**: 1.0.0 → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 709. **LOC providers/**: 2578 (8 archivos: anthropic,
  base, claude-cli, deepseek, gemini, groq, ollama, openai). **LOC tests
  internos**: 285. **Total**: 3572.
- **Drifts en baseline**: 19 — mayoría stale audit JSON + system-wide FPs.
- **Categoría**: core (#8 del roadmap).

## Responsabilidad acotada (NO descomponer)

**Ejecutor del LLM**. Tres entry points (chat, llm genérico, embedding)
que comparten el motor `_executeLLM`/`_selectEmbeddingProvider`:

1. `chat.prompt.ready` → `ai.chat.response` | `ai.chat.failed` (flujo del chat).
2. `llm.complete.request` → `llm.complete.response` | `llm.complete.failed` (flujo genérico, agentes).
3. `embedding.generate.request` → `embedding.generate.response` | `embedding.generate.failed`.

Sub-piezas (preservar intactas):
- `providers/{anthropic,openai,deepseek,groq,gemini,ollama,claude-cli}.js`:
  adapters por provider (HTTP/CLI directo). NO son drift — son
  integraciones externas estabilizadas.
- `providers/base-provider.js`: clase abstracta común con tool calling
  spec + retry + cost calculation.

NO se descompone — es UN ejecutor con 3 modalidades de invocación
(chat / generic / embedding) sobre el mismo agentic loop.

## Estado del código pre-rewrite

A diferencia de los módulos anteriores, ai-gateway ya tiene una fracción
considerable de canon implementado:

- **Chat path (onChatPromptReady)**: ya canónico — `correlation_id` propagado,
  `user_id`, `project_id`, `conversation_id`, par `ai.chat.response /
  ai.chat.failed` separados, `_classifyError` canónico.
- **Embedding path (onEmbeddingGenerateRequest)**: ya canónico — par
  `embedding.generate.response / .failed`, validación de payload,
  `_classifyError` aplicado.
- **onUnload**: ya limpia maps + `clearTimeout` sobre pendings.
- **`_classifyError`**: ya devuelve `{ code, message }` con codes canónicos
  (`AUTH_ERROR`, `RATE_LIMIT`, `TIMEOUT`, `INTERNAL_ERROR`, ...).

**El audit JSON está stale** (audited 2026-04-29, antes de varias mejoras
2026-05-02 a 2026-05-04) — flagea como drift cosas que ya están
arregladas en el código actual.

## Inventario completo de métodos (~30 totales)

### Lifecycle (2)
- `onLoad(context)` — guarda deps, `_initializeProviders`.
- `onUnload()` — clear maps + clearTimeout sobre pendings (✅ ya canónico).

### Providers (1)
- `_initializeProviders()` — instancia clases de providers/ por config.

### Resolución cross-módulo (4)
- `_resolveCredential(provider, projectId)` — publica
  `credential.resolve.request`, espera response con timeout.
- `onCredentialResponse(event)` — handler.
- `onCredentialSaved(event)` — invalida cache.
- `onCredentialDeleted(event)` — invalida cache.

### Filesystem (2)
- `_readAttachment(path, project_id)` — publica `fs.read.request`, espera
  response.
- `onFsReadResponse(event)` — handler.

### LLM execution (~6)
- `_executeLLM(...)` — núcleo del agentic loop (provider fallback +
  tool calls).
- `_executeToolCall(toolName, args, ...)` — invoca tool via moduleLoader
  (PATH 1) o vía evento dinámico (PATH 2).
- `_getTools(page_id)` — filtra tools por página + globales.
- `_buildPagePrefixes()` — construye lookup de prefijos por página.
- `_selectProvider(...)` — selección con priority order y fallback.
- `_selectEmbeddingProvider(...)` — selección específica para embeddings.

### Entry points (3 — los que migran al canon)
- `onChatPromptReady(event)` — chat (✅ ya canónico).
- `onLlmCompleteRequest(event)` — generic LLM (⚠️ DRIFT: success+error
  inyectados en mismo evento).
- `onEmbeddingGenerateRequest(event)` — embedding (✅ ya canónico).

### Clasificación (1)
- `_classifyError(err)` — mapeo a `{ code, message }` canónico.

## Bus map

### Publishes declarados (5)
1. `ai.chat.response` (chat path) — payload completo con tool_calls_executed.
2. `ai.chat.failed` (chat path) — par failure.
3. `llm.complete.response` (generic) — **DRIFT**: incluye `success` flag y
   `error` inyectado. Debe split en response (success) + failed (error).
4. `llm.complete.failed` (generic) — declarado pero NO emitido en código
   actual. La rewrite lo activa.
5. `embedding.generate.response` / `.failed` (embedding path).

### Publishes lateral (3 — usados internamente)
- `credential.resolve.request` (a credential-manager).
- `fs.read.request` (a filesystem).
- `<toolName>` (dinámico — PATH 2 fallback en agentic loop, agrupa
  cualquier evento de tool).

### Subscribes (7)
- `chat.prompt.ready` → `onChatPromptReady`.
- `llm.complete.request` → `onLlmCompleteRequest`.
- `embedding.generate.request` → `onEmbeddingGenerateRequest`.
- `credential.resolve.response` → `onCredentialResponse`.
- `credential.saved` / `credential.updated` → `onCredentialSaved`.
- `credential.deleted` → `onCredentialDeleted`.
- `fs.read.response` → `onFsReadResponse`.

## Estado interno

- `providers: Map<name, ProviderInstance>` — providers cargados.
- `credentialCache: Map<provider, { apiKey, resolvedAt, projectId }>` —
  invalidado por eventos de credential-manager.
- `pendingCredentials: Map<request_id, { resolve, reject, timeout }>` —
  promises pendientes de respuesta.
- `pendingFsReads: Map<request_id, { resolve, reject, timeout }>` — idem.
- `pagePrefixes: Map<page_id, prefix>` — lookup de prefijos para tool
  filtering.

## Drifts conocidos en baseline (19)

| Tipo | Count | Naturaleza |
|---|---|---|
| `rpc_over_pubsub` | 4 | Falso positivo: par request/response correlacionados por `request_id`. |
| `generic_verb` | 4 | Falso positivo: `response`/`request` son canónicos. |
| `publish_dominio_sin_project_id` | 2 | Falso positivo cross-system: `ai.*` y `embedding.*` son del subsistema chat — sí llevan project_id en cuerpo. |
| `modulo_subsistema_sin_schema_ref` | 2 | Real: faltan `$ref` a schemas en module.json para 2 publishes. |
| `signature_no_canonica` | 1 | Falso positivo: detecta `start`/`stop` en provider classes (no en index). |
| `publish_response_con_success_flag` | 1 | **REAL**: `llm.complete.response` mezcla success flag + error. Se cierra. |
| `publish_response_con_error_inyectado` | 1 | **REAL**: idem anterior. Se cierra al split. |
| `publish_chat_flow_sin_correlation_id` | 1 | Stale audit: el código actual SÍ propaga correlation_id (ai.chat.response payload línea 496). |
| `publish_atribuible_sin_user_id` | 1 | Stale audit: el código actual SÍ incluye user_id (línea 499). |
| `missing_onUnload_with_reservations` | 1 | Stale audit: el código actual SÍ limpia (líneas 56-59). |
| `correlation_id_no_propagado` | 1 | Stale audit JSON con `tracing.propaga_correlation_id=false` — el manifest v2.0.0 lo declarará true. |

**Patrón principal**: 2 drifts reales en `onLlmCompleteRequest`
(success+error mezclados) + 2 schema refs faltantes en module.json. Resto:
audit stale o false positives sistémicos.

## Cosas críticas a preservar (validación post-rewrite)

1. **3 entry points** (chat / llm complete / embedding) con sus pares
   success/failure separados.
2. **Agentic loop con tool calls** — PATH 1 (moduleLoader) y PATH 2
   (evento dinámico).
3. **Provider fallback** — priority order + reintento con backoff.
4. **credentialCache invalidation** por eventos
   (`credential.saved/updated/deleted`).
5. **Timeouts en pendingCredentials/pendingFsReads** con cleanup en
   onUnload.
6. **8 archivos en providers/** intactos — son adapters externos
   estabilizados.
7. **`_classifyError` codes canónicos** — AUTH_ERROR, RATE_LIMIT,
   TIMEOUT, NETWORK_ERROR, MODEL_NOT_FOUND, INTERNAL_ERROR.

## Plan del rewrite (surgical)

A diferencia de los anteriores, este rewrite es **quirúrgico** porque el
80% del código ya es canónico. El monolito NO se reescribe entero — se
parchea targeted.

1. Archivar versión actual (709 LOC) en
   `_legacy/ai-gateway-monolito-pre-rewrite.js.bak` para diff histórico.
2. Patch `index.js` v2.0.0 con cambios mínimos:
   - **Split `onLlmCompleteRequest`**: separar success → `llm.complete.response`
     (sin `success` flag) + failure → `llm.complete.failed` con `{ code,
     message, details? }`.
   - **Añadir 5 helpers POC2** (`_errorResponse`, `_handleHandlerError`,
     `_classifyHandlerError`, `_publicarEvento`, + auxiliar
     `_classifyExecutionError`). `_classifyError` se preserva (es el
     auxiliar específico para LLM/network/etc — quedará renombrado a
     `_classifyExecutionError` para alinear con el contrato).
   - **`_publicarEvento`** envoltorio para `eventBus.publish` con
     timestamp + correlation_id automático.
3. `module.json` v2.0.0:
   - `tracing.propaga_correlation_id: true`.
   - `$ref` a schemas en publishes (chat-flow + llm-flow + embedding-flow).
   - Counters/gauges con prefix `ai-gateway.*` (mantener compat con
     existentes).
4. Tests `tests/unit/conversacion__ai-gateway.test.js` (≥3 grupos):
   - Group 1: Lifecycle + onUnload limpia pendings.
   - Group 2: `onLlmCompleteRequest` split (response sin success flag,
     failed con `{ code, message }`).
   - Group 3: Helpers POC2 (`_errorResponse`, `_classifyHandlerError`,
     `_classifyExecutionError`, `_publicarEvento` correlation_id).
   - Group 4: Bus handlers de credential/fs (resolve/timeout).
   - Group 5: `_executeToolCall` PATH 1 vs PATH 2 (mocks).

   Mocks: providers retornan `{ content, tokens, model, provider }` sin
   tocar HTTP real. moduleLoader.toolsRegistry stub.

5. Wire CI + verificar drift count.
6. Commit + regenerar PROGRESO.
