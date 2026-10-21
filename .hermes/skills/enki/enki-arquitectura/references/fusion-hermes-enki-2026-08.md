# Fusión Hermes↔Enki — detalle de la integración (2026-08-11)

## Incidente que lo empezó todo: el deploy prematuro

Claude Code completó la rama `claude/hermes-enki-integration-kgwt96` (7 commits:
hermes-bridge, enki_tools Python, hermes-relay, disable de 7 módulos, rebanada)
y la desplegó a prod ANTES de configurar el relay. Estado resultante:
`hermes_url` vacío (default `:8642`) + `hermes_api_key` vacía → el relay llamaba
a Hermes sin key → 401 "Invalid API key" → `ai.chat.failed`. Prod quedó en modo
**"primer mensaje = fallo"**: chat-io persistía → emitía `chat.message.saved` →
hermes-relay (único suscriptor, ai-gateway ya disabled) → 401. Nadie lo notó
porque nadie escribió en el chat entre el reinicio (15:33) y la verificación.

Regla durable (también en `enki-bus-invocacion`): **el disable del sistema viejo
es SIEMPRE el último paso, y solo después de probar la cadena nueva end-to-end
con un mensaje real** — no con el health del puente.

## Los scripts de la operación (backup: /home/admin/hermes-backups/2026-08-11-fusion-hermes/)

- `estabilizar-prod.sh` — re-habilita los 7 módulos + para bridge/relay + restart.
  Reversible, idempotente. Es la RED DE SEGURIDAD de toda la fusión.
- `configurar-relay.sh` — FASE 1: localiza `API_SERVER_KEY` del gateway hermes
  (primero en `/home/hermes/.hermes/.env`, fallback `config.yaml` → `api_server.key`),
  escribe `modules_config.hermes-relay`, activa SOLO el bridge (relay sigue parado,
  gateway intacto → el chat NO se toca), restart.
- `saltar-a-hermes.sh` — FASE 2 (el salto): relay ACTIVO + cadena vieja apagada
  (los 7) + restart. Reversible con `estabilizar-prod.sh`.

## Evidencia de la cadena completa (verificación real)

```
16:36:31  chat.message.saved (user: "Prueba de integración Hermes...")
16:36:34  ai.chat.response → chat.assistant.saved (content: "ACEPTADO")
          metadata: provider=hermes, model=hermes, tokens=28041, duration_ms=2716
```

Revisar con: `cd ~/3enki && NODE_PATH=$PWD/node_modules node .claude/skills/conexion-mqtt/enki-rpc.js reach <proyecto> <conv_id>`.

## Errores vistos en el log del agente Hermes (/home/hermes/.hermes/logs/agent.log)

| Síntoma | Causa real | Fix |
|---|---|---|
| `HERMES_TIMEOUT` en el chat (relay 300s) | El agente TRABAJABA (tools: mv, write_file, search…) y superó el timeout del relay — no es que fallara | `request_timeout_ms: 900000`; el agente sigue vivo tras el timeout del esperador |
| `Tool terminal returned error (300.16s): [Command timed out after 300s]` | Un comando del agente se colgó su propio timeout de tool (300s) | El agente debe usar tools de Enki (MCP/bridge), no terminal crudo |
| `Permission denied` en mv/write_file sobre `/opt/enki/modules/<m>` | Módulos generados por el motor salen 755 sin `g+w`; hermes es del grupo www-data pero el grupo no escribe | `sudo chmod -R g+w /opt/enki/modules/` |
| `Path not found: /opt/enki/modules/ai-gateway` | El agente buscaba el ai-gateway… que ya está DISABLED (no existe en disco) | No es un bug del agente; es un path legítimamente desaparecido |
| `search_files: rg: regex parse error` | El agente generó un regex mal formado (grupo sin cerrar) | Reintento/reescritura del patrón |

## Los DOS Hermes del VPS (no confundir)

- **usuario `hermes`** (uid 1001, PID ~684): `hermes-gateway` systemd, sirve
  `:8642` (API server), tiene el MCP de Enki conectado, escribe en
  `/home/hermes/.hermes/`. **ES la mente del chat de Enki.**
- **usuario `admin`** (PID ~981): el gateway que atiende este Telegram.
- Config/venv por usuario: `/home/hermes/.hermes/` vs `/home/admin/.hermes/`.
  Copiar paquetes Python al venv equivocado no sirve.
- `hermes-gateway` NO se puede reiniciar desde dentro de un gateway
  (el harness lo bloquea: "cannot restart the gateway from inside the gateway
  process") — lanzar el restart desde la terminal del dueño.

## API server de Hermes (:8642) — datos de la integración

- `gateway/platforms/api_server.py` — `POST /v1/chat/completions` ejecuta un
  agente COMPLETO (run de agente con límites de concurrencia), no un proxy LLM.
- El system message del request (CLAUDE.md + contexto activo) se apila ON TOP
  del core de Hermes ("ephemeral system prompt").
- Auth: `API_SERVER_KEY` (env o extra key). Sin key → 401/403 en sesión.
- Continuidad: `X-Hermes-Session-Id` (rotación tipo /new) y
  `X-Hermes-Session-Key` (scoping de memoria a largo plazo, ej. Honcho).
- **No hay slash commands**: 0 `process_command` / `startswith("/")` en
  api_server.py. `/model` escrito en el chat de Enki llega como texto al LLM.
  Cambiar modelo = `modules_config.hermes-relay.hermes_model` + restart.
- `/health` responde `{"platform": "hermes-agent", "version": "0.18.2"}`.

## MCP de Enki → portal (la vía por la que Hermes ve tools de Enki)

- `enki-mcp-server.js` — MCP stdio: `tools/list` → `ui/request/portal/list_tools`,
  `tools/call` → `ui/request/portal/call` (con `confirmado` para write).
- Guard: interruptores `portal-mcp` y `portal-mcp-write` (ON en prod).
- El portal expone ~420 tools (catálogo real: productos.*, variaciones.*, tarifas.*…).
- **PITFALL**: el gateway de Hermes filtra con `mcp_servers.enki.tools.include`
  (solo 3 tools por defecto: productos.list/get/search). El agente NO ve las
  tools de escandallo/coste → recurre a terminal crudo. Fix: eliminar el bloque
  `tools.include` de `/home/hermes/.hermes/config.yaml` + restart hermes-gateway.
- PITFALL al editar config.yaml con Python: el regex de borrado pegó la línea
  siguiente (`...1883session_reset:`) — validar SIEMPRE con
  `python3 -c "import yaml; yaml.safe_load(open(...))"` tras editar.

## El flujo conversacional tras la fusión

```
frontend → chat-io (persiste SQLite, emite chat.message.saved, escucha ai.chat.response)
         → hermes-relay (pipe puro: chat.message.saved → POST :8642 → ai.chat.response)
         → Hermes agente (API server :8642, agente completo con sus tools)
```

- chat-io NO se desactiva — es la persistencia + push al frontend.
- prompt-builder y ai-gateway SÍ se apagan (el relay los sustituye).
- El relay y prompt-builder escuchan el MISMO evento (`chat.message.saved`) —
  NO pueden convivir sin doble respuesta. La activación es un salto, no gradual.

## Pendientes abiertos (no bloquean)

1. `enki_tools` (Python) en el agente Hermes: el MCP ya da las tools del portal
   (420) una vez abierto el filtro; decidir si además se registra el paquete.
2. Monitorizar consumo: ~28K tokens/turno = contexto del agente completo.
   Ajustar `context_window` del relay (40) o el modelo si es alto.
3. Pipelines F0-F7: `ai-agent-framework-v3` apagado → los pipelines pasan a
   skills de Hermes (preferencia del dueño); el registro queda como catálogo
   consultable (`pipeline.listar`); JEFE+bitácora sobreviven como tools del cuerpo.
