# Arquitectura verificada — Fusión Hermes↔Enki (2026-08-11)

Hechos comprobados contra el código y el terreno, para no re-grep en cada sesión.

## Código de Hermes (0.18.2, instalado en /home/admin/.hermes/hermes-agent/)

### :8642 = API server del gateway (NO el proxy)
- `gateway/platforms/api_server.py` — el adaptador `api_server` del gateway.
  - `DEFAULT_PORT` del PROXY es **8645** (`hermes_cli/proxy/server.py:51`); el
    API server del gateway usa **8642** (`config.py:4620`, `web_server.py:2820`).
  - Rutas: `("POST", "/v1/chat/completions", self._handle_chat_completions)` (~1506),
    también `/v1/responses`, `/v1/models`, `/v1/runs` (SSE lifecycle), `/p/<profile>/...`.
  - **Ejecuta un AGENTE COMPLETO**: `_handle_chat_completions` (~2665) extrae el
    system message y lo apila "ON TOP of core" (system prompt efímero sobre el
    nativo), soporta `X-Hermes-Session-Id` (continuidad; requiere key) y
    `X-Hermes-Session-Key` (memory scoping), y corre agent runs con límites de
    concurrencia. → NO es un proxy LLM pelado: es la mente de Hermes.
  - **Auth**: `self._api_key = extra.get("key", os.getenv("API_SERVER_KEY", ""))`
    (~950); sin key, el `connect()` no arranca el API server (~1248);
    `hmac.compare_digest(token, self._api_key)` (~1263); falla con
    `{"error":{"message":"Invalid API key",...}}` (~1271).
- Health del API server: `GET /health` → `{"status":"ok","platform":"hermes-agent","version":"0.18.2"}`.

### Dos gateways Hermes en el VPS (verificado por ps)
- Usuario `hermes` (PID 684): `/home/hermes/.hermes/hermes-agent/venv/bin/python
  ... hermes gateway run` — es el que tiene `enki-mcp-server.js` conectado
  (mcp_stdio_watchdog → `/opt/enki/mcp/enki-mcp-server.js`).
- Usuario `admin` (PID 981): el gateway de Telegram de Hermes.
- `/home/hermes/.hermes/config.yaml` NO es legible sin sudo (Permission denied).
  → El destino de enki_tools y la API_SERVER_KEY dependen de CUÁL gateway sirve
  :8642; el plan de Claude copiaba a `/home/admin/...` (posible destino erróneo).

### enki-mcp-server.js (camino MCP alternativo)
- `/opt/enki/mcp/enki-mcp-server.js`: bridge MCP stdio ↔ bus de Enki por
  `ui/request/portal/*` (módulo `portal` aplica el GUARD 'portal-mcp', scope,
  mode, allowlist, audit). `tools/list → portal/list_tools`,
  `tools/call → portal/call`. Si el portal está OFF: list vacío, call 503.
- Sirve para agentes externos (Claude Code, Cursor) — distinto del bridge HTTP.

## Código de Enki (~/3enki)

### hermes-bridge (módulo de la fusión, en main tras PR #183)
- `modules/hermes-bridge/index.js`:
  - `_initToken()` — genera `data/.hermes-bridge-token` (32 bytes hex, mode
    0600) al primer arranque si no existe; `_authenticate(req)` compara con
    `crypto.timingSafeEqual` (Bearer).
  - `_dispatch(toolName, args, ctx)` (3 rutas, en orden):
    1. `bus.publish` / `bus.publishAndWait` → `_universalBusTool` (enriquece
       payload con project_id/user_id/correlation_id/attachments/timestamp;
       publishAndWait suscribe `${ev}.response` filtrando por request_id,
       timeout clamp 100ms..60s, default 10s).
    2. Ruta directa: `toolsRegistry.get(name)` + `loadedModules.get(module)`
       → `mod[handler](enrichedArgs)`.
    3. Fallback bus: `eventBus.publish(toolName, {request_id, ...args})` +
       suscribe `${toolName}.response` por request_id; timeouts graduados:
       15s default · 65s `code.orquestar` · 300s `invoke_agent`.
  - `_enrichArgs` inyecta project_id/page_id/conversation_id/settings/
    attachments/prompt/intencion/_chat_context desde ctx.
  - `_buildCatalog()` — tools del toolsRegistry en formato OpenAI function-calling.
- `modules/hermes-bridge/module.json` — `apis`: POST /execute (auth),
  GET /catalog (auth), GET /health (sin auth). `subscribes: [core.started]`.
  Config: token_path, tool_timeout_ms/code_ms/agent_ms.

### Cómo se montan las rutas HTTP de un módulo
- `core/gateway/http.js` — servidor HTTP del core; formato `/modules/{mod}/{path}`.
- `core/modules/registry.js` — `register(moduleName, {apis})` monta
  `/modules/${moduleName}${api.path}` desde `module.json → apis[]`
  (apiIndex por `METHOD:/modules/...`). `findAPI(pathname, method)` lo resuelve.
- El HTTPGateway escucha en `0.0.0.0` (default) — por eso el bridge necesita
  su propia auth Bearer (el endpoint /execute no puede depender de "localhost").

### executeTool del loader (lo que NO es)
- `core/modules/loader.js:1910` — `async executeTool(toolName, args)`: valida
  params requeridos contra el schema y llama `tool.handler(args)`. Sin
  enriquecimiento de contexto, sin interceptación bus, sin timeouts graduados.
  El dispatcher REAL con toda la lógica es `ai-gateway._executeToolCall`
  (modules/conversacion/ai-gateway/index.js:2434-2552 — termina ANTES de
  `_executeLLM` que empieza en 2554; `_selectProvider` de la línea 2556 es de
  `_executeLLM`, NO del dispatcher). Cajones (`cajon.listar/abrir`) y nav
  (`chat.cambiar_foco/page.related`) dependen de estado en memoria del gateway
  (blueprintModules, conversationPageFoco) — se omiten en el bridge.

### Coexistencia relay ↔ gateway
- `hermes-relay` y `prompt-builder` escuchan el MISMO `chat.message.saved`
  (verificando module.json de ambos) → no pueden convivir sin doble respuesta.
- `ai-gateway` escucha `chat.prompt.ready` (no chat.message.saved); `chat-io`
  escucha `ai.chat.response` y `ai.chat.failed` (contrato que el relay emite).

## Configuración del relay
- `modules_config.hermes-relay` en `/opt/enki/config.json`:
  `hermes_url` (default `http://localhost:8642/v1/chat/completions`),
  `hermes_model` (default 'hermes'), `hermes_api_key` (OBLIGATORIA — sin ella
  el API server responde "Invalid API key"), `context_window` (40),
  `request_timeout_ms` (300000), `claude_md_path`.
- CLAUDE.md se lee del filesystem del repo como identidad (cache TTL 60s);
  el system message se apila ENCIMA del core de Hermes en el API server.

## Scripts de operación (backup 2026-08-11-fusion-hermes)
- `estabilizar-prod.sh` — restaura el estado pre-fusión: re-habilita los 7
  conversacionales, para bridge+relay (disabled), restart. Idempotente.
- `configurar-relay.sh` — FASE 1: localiza API_SERVER_KEY del Hermes dueño,
  escribe modules_config.hermes-relay, activa SOLO hermes-bridge, restart.
