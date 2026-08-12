# Mapa del código verificado — fusión Hermes↔Enki (2026-08-11)

Verificado con grep/curl/lectura directa sobre `~/3enki` y `/opt/enki` (prod).

## Dispatcher de tools — dónde vive la lógica real

| Pieza | Ubicación | Qué es |
|---|---|---|
| `moduleLoader.executeTool` | `core/modules/loader.js:1910` | Wrapper SIMPLE: valida `parameters.required` y llama `tool.handler(args)`. NO es el dispatcher real. |
| `moduleLoader.getToolsForAI` | `core/modules/loader.js` (usado en `modules/conversacion/ai-gateway/index.js:386`) | Catálogo de tools del registry. |
| `ai-gateway._executeToolCall` | `modules/conversacion/ai-gateway/index.js:2434-2552` | **El dispatcher REAL**: 1) intercepta `bus.publish`/`bus.publishAndWait` → `_executeUniversalBusTool` (2441); 2) cajones `cajon.listar/abrir` → `_executeCajonTool` (2446); 3) nav `chat.cambiar_foco`/`page.related` → `_executeNavTool` (2451); 4) ruta directa `toolsRegistry.get(name)` → `mod[handler](enrichedArgs)` (2473-2482); 5) bus fallback `eventBus.publish(toolName, {request_id, ...})` + subscribe `${toolName}.response` (2522-2548). Enriquecimiento de 9 campos de contexto + timeouts graduados (15s default, 65s code.orquestar, 300s invoke_agent, presupuesto dinámico por pipeline vía `pipeline.obtener.request`). |
| `_selectProvider` | `modules/conversacion/ai-gateway/index.js:322` | **NO está dentro de `_executeToolCall`** (la línea 2556 pertenece a `_executeLLM` que empieza en 2554). La extracción del dispatcher es limpia: depende de moduleLoader + eventBus + config + sus helpers internos. |
| `_executeLLM` | `modules/conversacion/ai-gateway/index.js:2554` | La generación LLM (donde vive `_selectProvider`) — esto es lo que NO se extrae al bridge. |
| `toolsRegistry` | `core/modules/loader.js` + `modules/conversacion/ai-agent-framework-v3/index.js` + `modules/cupula-eventos/index.js` | Registro central de tools. |

## HTTPGateway — rutas de módulo

- `core/gateway/http.js` — servidor HTTP del core. Formato de rutas: `/modules/{moduleName}/{path}` (comentario línea 7). Escucha en `0.0.0.0` por defecto (línea 51), **sin auth en las rutas** (solo CORS menciona Authorization, no lo valida — línea 677).
- `core/gateway/http.js:442` — `this.registry.findAPI(pathname, req.method)` resuelve la ruta.
- `core/modules/registry.js` — `register(moduleName, {apis})` monta cada api en `/modules/{moduleName}{api.path}` y lo indexa en `apiIndex` (líneas 78-111). **Un módulo nuevo solo necesita declarar `apis` en module.json** para tener ruta HTTP real — no hay que tocar el core.
- Rutas especiales existentes: `/health`, `/ready`, `/stats`, `/cache/*`, `/blueprints`, `/ui/...`.

## Bus MQTT — lo que un topic plano NO hace

- `core/events/bus.js:126-129` — el bus se suscribe a `core/{coreId}/events/#` y `core/*/events/#`. Un topic plano tipo `hermes/tool/request` NO llega al core.
- Envelope canónico obligatorio (`core/events/envelope.js`): `{event_id, event_type, timestamp, source:{core_id}, data}`. El `source.core_id` debe ser distinto de `core-a` (anti-loop).
- `bus-guard` (core/broker/bus-guard.js) bloquea suscripciones de clients MQTT anónimos — un `publishAndWait` con paho anónimo da timeout SIEMPRE. Credenciales válidas: `enki:token:<jws>` o `enki:cert:<b64pem>` (observe: recibe pero no publica). Patrón que funciona: 2 clients (anónimo publica + observe recibe filtrando por request_id).

## El plan corregido — piezas nuevas (estado verificado)

| Pieza | Path | Contenido verificado |
|---|---|---|
| hermes-bridge | `modules/hermes-bridge/{index.js,module.json}` | Dispatcher extraído con 3 rutas (universal, directa, fallback), auth Bearer token compartido (`data/.hermes-bridge-token`, 0600, generado al primer arranque), `apis`: POST /execute, GET /catalog, GET /health. |
| enki_tools | `hermes/enki_tools/{__init__.py,bridge.py,loader.py}` | EnkiBridge HTTP (no MQTT raw), lee token de fichero o `ENKI_BRIDGE_TOKEN`, `call(tool_name, context, **args)`; loader genera funciones Python por tool del catálogo. |
| hermes-relay | `modules/hermes-relay/{index.js,module.json}` | Tubería pura: `chat.message.saved` → POST `{hermes_url}/v1/chat/completions` (stream:false) → `ai.chat.response`/`ai.chat.failed`. Hereda persistencia SQLite vía `db.query.request` (patrón `_db` con pendingDb + request_id, timeout 10s). Inyecta CLAUDE.md (TTL 60s) + CONTEXTO ACTIVO + vista_frontend como system. Cero loop de tool_calls. Config default: `hermes_url=http://localhost:8642/v1/chat/completions`, `hermes_model=hermes`, `request_timeout_ms=300000`. |
| config.json | raíz | `modules.disabled += [ai-gateway, prompt-builder, ai-agent-framework-v3, agent-observer, memory-conversation-summary, memory-rag, memory-user-profile]` — 7 módulos, **chat-io NO se deshabilita** (el relay se apoya en su contrato). |

## Estado de prod verificado (2026-08-11, 15:33-15:36 UTC)

- `systemctl show enki -p ActiveEnterTimestamp` → `Tue 2026-08-11 15:33:29 UTC` (core reiniciado con el disable activo).
- `/opt/enki/modules/hermes-bridge/` y `/opt/enki/modules/hermes-relay/` EXISTEN (deploy hecho).
- `/opt/enki/data/.hermes-bridge-token` existe (65 bytes, www-data, creado 15:33).
- `curl http://127.0.0.1:3000/modules/hermes-bridge/health` → `{"ok":true,"tools":430}`.
- `config.json` prod: los 7 módulos en `disabled`; `chat-io` enabled:True, `ai-gateway` enabled:True (pero el loader FILTRA por disabled — el gateway no carga).
- `modules_config['hermes-relay']` en prod: **VACÍO** (hermes_url no configurado → default :8642, hermes_api_key VACÍA).
- `curl -X POST http://127.0.0.1:8642/v1/chat/completions` sin key → `{"error":{"message":"Invalid API key",...}}` — el relay en prod fallaría con 401 en el primer mensaje real.
- Dos procesos Hermes corriendo: usuario `hermes` (PID 684, gateway con enki-mcp-server) y usuario `admin` (PID 981, gateway de Telegram). El :8642 responde `{"status":"ok","platform":"hermes-agent","version":"0.18.2"}`.

## Comandos de verificación reutilizables

```bash
# ¿La rama existe y qué trae?
git fetch origin && git branch -a | grep -i hermes-enki
git log --oneline origin/claude/hermes-enki-integration-kgwt96 -8
git diff --stat main...origin/claude/hermes-enki-integration-kgwt96

# ¿El dispatcher real vs el wrapper?
grep -n "executeTool" core/modules/loader.js | head
grep -n "_selectProvider\|async _executeToolCall\|async _executeLLM" modules/conversacion/ai-gateway/index.js

# ¿Rutas HTTP del core y auth?
grep -nE "auth|token|findAPI|/modules/" core/gateway/http.js | head -20
grep -n "register\|apiIndex\|/modules/" core/modules/registry.js | head -15

# ¿Estado de prod (config vs proceso)?
python3 -c "import json; d=json.load(open('/opt/enki/config.json')); print(d['modules'].get('disabled',[])); print(d.get('modules_config',{}).get('hermes-relay',{}))"
ps -o lstart= -p $(pgrep -f "node.*enki" | head -1)
systemctl show enki -p ActiveEnterTimestamp --value

# ¿El bridge/relay viven y responden?
curl -s http://127.0.0.1:3000/modules/hermes-bridge/health
curl -s -X POST http://127.0.0.1:8642/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"hermes","messages":[{"role":"user","content":"di OK"}]}'
```
