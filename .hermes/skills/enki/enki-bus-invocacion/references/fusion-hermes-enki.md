# Fusión Hermes ↔ Enki — mapa del terreno y estado (2026-08-11)

Fusión aprobada por Paco: Hermes como **cerebro** (capa conversacional y de
proceso) y Enki como **cuerpo** (módulos, bus, stores). La capa de razonamiento
de Hermes es imperativa por diseño — la filosofía event-driven de Enki gobierna
el interior del sistema, no la mente que lo opera. Todo lo trabajado (módulos,
cimiento JEFE/bitácora, registro) mantiene la filosofía.

## La regla del consumo: provider ≠ cerebro

- **Hermes como PROVIDER** (v2.34, retirado en v2.35): el ai-gateway llamaba a
  Hermes como backend LLM → doble salto (chat → Hermes → LLM) pagando el
  contexto de Hermes encima → **consumo disparado**. Paco lo rechazó
  explícitamente ("no quiero a Hermes como providers").
- **Hermes como CEREBRO**: Hermes ejecuta directamente con sus credenciales,
  un salto. El API server del gateway de Hermes (`:8642`,
  `gateway/platforms/api_server.py`) ejecuta un **AGENTE COMPLETO** en
  `POST /v1/chat/completions`: el system message se apila "ON TOP of core"
  (layered sobre el system prompt nativo), soporta continuación de sesión
  (`X-Hermes-Session-Id`), memoria a largo plazo (`X-Hermes-Session-Key`) y
  ejecuta agent runs con límites de concurrencia.
- **Cómo distinguirlos en vivo**: `POST /v1/chat/completions` con Bearer key →
  `usage.prompt_tokens` ~15K = core de Hermes cargado = agente completo; ~1K =
  proxy pelado. La key del API server: `API_SERVER_KEY` en el `.env` del
  usuario dueño, o `api_server.key` en su `config.yaml`.

## El terreno (verificado en vivo)

- **`executeTool` NO es el dispatcher real**: `core/modules/loader.js:1910`
  tiene `executeTool(toolName, args)` pero es un wrapper simple (valida params
  contra schema + llama `tool.handler(args)`). El dispatcher real es
  `ai-gateway._executeToolCall` (~líneas 2434-2552): interceptación
  bus.publish/publishAndWait, cajones, nav, ruta directa
  (`toolsRegistry.get(name)` → `mod[handler](enrichedArgs)`), fallback por bus
  con timeouts graduados (15s default, 65s code.orquestar, 300s invoke_agent).
  `_selectProvider` NO está dentro del dispatcher (pertenece a `_executeLLM`,
  línea 2554+) — la extracción es limpia salvo cajones/nav (dependen de estado
  en memoria del gateway: blueprintModules, conversationPageFoco).
- **HTTPGateway** (`core/gateway/http.js`): escucha `0.0.0.0` (sin auth en sus
  rutas), formato `/modules/{moduleName}/{path}`. Los módulos registran rutas
  declarando `apis` en module.json → `core/modules/registry.js` monta bajo
  `/modules/<nombre><path>`. El módulo que expone ejecución DEBE añadir su
  propia auth (Bearer token compartido, generado al primer arranque, persistido
  `data/.hermes-bridge-token` modo 0600; el cliente Python lee el mismo fichero).
- **El bridge (hermes-bridge)** = dispatcher extraído como módulo: 3 rutas
  (bus universal con publishAndWait correlado por request_id, ruta directa
  handler-en-módulo con enriquecimiento de 9 campos de contexto, fallback por
  bus). API: `POST /execute`, `GET /catalog` (OpenAI function-calling), `GET
  /health` (sin auth). Verificado en prod: 434 tools, 401 sin Bearer, tool real
  `project-profile.get` ejecutada con un project_id real.
- **El relay (hermes-relay)** = pipe puro: `chat.message.saved` → `POST
  /v1/chat/completions` a Hermes → `ai.chat.response`. Cero lógica de agente.
  Hereda persistencia SQLite de chat-io (vía `db.query.request`). Config en
  `modules_config.hermes-relay`: `hermes_url`, `hermes_model`, `hermes_api_key`,
  `context_window` (40), `request_timeout_ms` (300000), `claude_md_path`.
- **Separación de credenciales** (en el manifest): Hermes = LLM keys
  (OpenAI/Anthropic/DeepSeek...); credential-manager = dominio (WhatsApp,
  Glovo, Telegram...). credential-manager NO se desactiva.
- **DOS Hermes en el VPS**: usuario `hermes` (gateway con `enki-mcp-server.js`
  conectado, sirve `:8642` — home `/home/hermes/.hermes`, no legible sin sudo)
  y usuario `admin` (este chat). Identificar el dueño de cada servicio antes de
  tocar venvs/configs.
- **`/opt/enki` NO es repo git** (`fatal: not a git repository`). El repo es
  `~/3enki` (admin); `deployment/deploy.sh` corre DESDE el repo con
  `rsync -a --delete` hacia `/opt/enki` (excluye data, node_modules, .git,
  public). **Desplegar desde main sin mergear la rama de la feature BORRA de
  prod los módulos que solo existen en la rama.** Orden: merge (PR) → deploy.
- **Coexistencia**: relay y prompt-builder escuchan AMBOS `chat.message.saved`
  → no pueden convivir sin doble respuesta. chat-io NO se toca (persistencia +
  push al frontend lo necesitan vivo).

## Patrón de activación en fases

1. **FASE 1 — probar la pieza nueva AISLADA, sin tocar la capa viva**: activar
   solo `hermes-bridge` (quitar de disabled), configurar `hermes-relay` en
   `modules_config` (url + key), restart. Verificar: health (434 tools),
   catalog 200 con Bearer / 401 sin, tool real de dominio. El chat sigue en el
   gateway viejo. Script: `configurar-relay.sh`.
2. **FASE 2 — el SALTO (atómico y reversible)**: quitar `hermes-relay` de
   disabled + añadir a disabled la cadena vieja (ai-gateway, prompt-builder,
   ai-agent-framework-v3, agent-observer, memory-conversation-summary,
   memory-rag, memory-user-profile) + restart. Reversible con el script de
   estabilización (re-habilita los 7 + para bridge/relay). Verificación: un
   mensaje REAL cruzando la cadena completa.
3. **Regla dura**: el disable del sistema viejo es SIEMPRE el último paso, solo
   después de probar la cadena nueva end-to-end con un mensaje real.

## Scripts (backup en /home/admin/hermes-backups/2026-08-11-fusion-hermes/)

- `estabilizar-prod.sh` — REVERTIR: re-habilita los 7 + añade bridge/relay a
  disabled + restart (idempotente).
- `configurar-relay.sh` — FASE 1: localiza API_SERVER_KEY (sin exponerla),
  escribe `modules_config.hermes-relay`, activa solo bridge, restart.
- `saltar-a-hermes.sh` — FASE 2: activa relay + apaga la cadena vieja, restart.
- `config.json.pre-estabilizacion` + `MANIFIESTO.md` — estado original.

## Estado de la fusión (al cierre de la sesión 2026-08-11)

- ✅ PR #183 mergeado a main (rama de Claude corregida: SIN disable prematuro;
  bridge/relay en disabled, gateway activo). Ramas locales y remotas limpias.
- ✅ FASE 1 completa y verificada en prod: bridge vivo (434 tools, auth OK,
  tool real ejecutada), relay configurado con key (long 22), gateway intacto.
- ✅ FASE 2 (el salto) EJECUTADA y verificada con mensaje real: `"ACEPTADO"`
  respondido por Hermes en 2.7s (provider=hermes, tokens 28K = core del agente).
  Cadena: conversation/send → chat.message.saved → relay → :8642 → ai.chat.response
  → chat.assistant.saved. El chat de Enki responde a través de Hermes.
- ✅ Capados del runtime corregidos tras el incidente HERMES_TIMEOUT:
  (1) `request_timeout_ms` 300000 → 900000 (el agente trabaja con tools reales y
  superaba el timeout del esperador — lección: timeout del esperador NO mata al
  trabajador; verificar `/home/hermes/.hermes/logs/agent.log` antes de concluir);
  (2) `sudo chmod -R g+w /opt/enki/modules/` (7 módulos estaban 755 sin g+w →
  el agente, grupo www-data, no podía escribir); (3) filtro MCP `tools.include`
  eliminado de la config del gateway de hermes (portal 448 tools, el include
  solo dejaba ver 3 → el agente usaba terminal crudo).
- Pendientes de diseño: los pipelines de proceso (F0-F7, construir-modulos,
  adaptar-a-enki) pasan a Hermes como skills; el registro queda como catálogo
  (`pipeline.listar` consultable); JEFE + bitácora sobreviven como tools del
  cuerpo que Hermes invoca (contra el humo: success = entregable verificado).
- Pendiente operativo: copiar las skills de Enki al perfil del agente
  (`sudo cp -r /home/admin/.hermes/skills/enki /home/hermes/.hermes/skills/`)
  y reiniciar `hermes-gateway` para cargar las 448 tools del MCP.
- Slash commands de Hermes (`/model`...) NO funcionan en el chat de Enki: el
  relay manda el texto crudo y el API server no procesa comandos (0
  process_command en api_server.py). Cambiar modelo = config del relay.
