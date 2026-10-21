---
name: enki-fusion-hermes
description: >-
  La capa conversacional de Enki ES Hermes (fusión 2026-08): hermes-bridge
  (dispatcher de tools por HTTP autenticado), hermes-relay (chat.message.saved →
  Hermes → ai.chat.response) y el API server del gateway de Hermes (:8642) como
  mente. Úsala para operar/depurar la fusión, añadir tools de Enki a Hermes,
  configurar relay/bridge, verificar la cadena chat→Hermes, o entender qué hay
  detrás de los puertos :3000 y :8642.
when-to-use: >-
  · El chat de Enki no responde o responde raro tras la fusión.
  · Añadir/verificar tools de Enki visibles para Hermes (bridge/catálogo).
  · Configurar hermes-relay (URL, API key, context_window) o el token del bridge.
  · Verificar la cadena completa: mensaje real → relay → Hermes → ai.chat.response.
  · Cualquier tarea que toque hermes-bridge, hermes-relay, enki_tools o :8642.
tags: [enki, hermes, fusion, bridge, relay, api-server, integracion]
---

# Fusión Hermes ↔ Enki — operar la capa conversacional

## La arquitectura (3 piezas + la mente)

```
frontend/bus → chat-io (persiste, push) ─ chat.message.saved → hermes-relay
      │                                                          │
      │                                  POST /v1/chat/completions (Bearer)
      │                                                          ▼
      │                                          API server Hermes (:8642)
      │                                          (AGENTE COMPLETO, no proxy)
      │                                                          │
      │                          tool calls vía enki_tools (Python) o MCP
      │                                                          ▼
      │                              hermes-bridge POST /modules/hermes-bridge/execute
      │                                                          │
      └── ai.chat.response ◄────────────────── dispatcher de tools de Enki (430+)
```

- **hermes-bridge** (módulo Enki): las manos de Hermes sobre Enki. HTTP
  autenticado (Bearer, token compartido en `data/.hermes-bridge-token`, modo
  0600, generado al primer arranque). Dispatcher = `_executeToolCall` del
  ai-gateway EXTRAÍDO, con 3 rutas en orden:
  1. `bus.publish` / `bus.publishAndWait` (tool universal, correlación por
     request_id, enriquecimiento de payload con project_id/user_id/correlation_id)
  2. RUTA DIRECTA: `toolsRegistry.get(name)` → `loadedModules.get(module)[handler](enrichedArgs)`
  3. BUS FALLBACK: publica `toolName` + espera `${toolName}.response` por
     request_id (timeouts graduados: 15s default, 65s `code.orquestar`, 300s
     `invoke_agent`)
  Rutas HTTP: `/execute` (POST), `/catalog` (GET, formato OpenAI function-calling),
  `/health` (GET, SIN auth). Las rutas se registran en `module.json` → `apis` y
  `core/modules/registry.js` las monta bajo `/modules/<nombre><path>`.
- **hermes-relay** (módulo Enki): tubería PURA. `chat.message.saved` → Hermes
  `/v1/chat/completions` (`stream:false`) → `ai.chat.response`. Cero lógica de
  agente (ni system prompt construido, ni loop de tools — eso es de Hermes).
  Config: `modules_config.hermes-relay {hermes_url, hermes_api_key,
  hermes_model, context_window, request_timeout_ms}`.
- **enki_tools** (Python, `hermes/enki_tools/`): cliente HTTP del bridge para el
  agente Hermes (`EnkiBridge.call(tool_name, context?, **args)` + `load_tools()`
  que genera una función Python por tool). Lee el token del MISMO fichero. NO
  MQTT raw (el bus-guard bloquea clients anónimos).
- **API server de Hermes (:8642)** = la MENTE: `POST /v1/chat/completions`
  (`gateway/platforms/api_server.py:2665`) ejecuta un AGENTE COMPLETO, no un
  proxy. El system message que manda el relay (CLAUDE.md + contexto activo) se
  apila ON TOP del core de Hermes; soporta continuidad de sesión
  (`X-Hermes-Session-Id`) y memoria a largo plazo (`X-Hermes-Session-Key`).
  **Esto NO es "Hermes como provider"** (el patrón v2.34 que disparó el consumo):
  es UN salto (chat → Hermes agente), no una cadena Enki→Hermes→LLM.

## Datos de operación (verificados 2026-08)

- **DOS gateways de Hermes**: usuario `hermes` (sirve a Enki, :8642, tiene el
  enki-mcp-server) vs usuario `admin` (el Hermes de Telegram). `/home/hermes/`
  NO es legible por admin sin sudo.
- **Key del API server**: `API_SERVER_KEY` en `/home/hermes/.hermes/.env` o
  `api_server.key` en su config.yaml. El relay la necesita; sin ella :8642
  responde `{"error":"Invalid API key"}`. No confundir con el PROXY de Hermes
  (puerto 8645, `hermes_cli/proxy/server.py`) — son cosas distintas.
- **El HTTPGateway del core (:3000) NO tiene auth propia** (escucha 0.0.0.0,
  `core/gateway/http.js`) — la auth Bearer la implementa CADA módulo (el bridge
  la hace; no asumir que una ruta /modules/* está protegida).
- **`moduleLoader.executeTool` existe pero es wrapper simple** (valida params
  contra schema y llama `tool.handler`; sin enriquecimiento ni interceptación).
  El dispatcher real vivía en `ai-gateway._executeToolCall` y ahora vive en el
  bridge — si el gateway muere, esa lógica sigue en el bridge.
- **Coexistencia**: hermes-relay y prompt-builder escuchan el MISMO evento
  (`chat.message.saved`) → NO pueden convivir (doble respuesta al frontend). El
  relay sustituye a prompt-builder + ai-gateway; chat-io queda VIVO
  (persistencia SQLite + push `ai.chat.response` al frontend).

## LA regla de activación (pagada en prod 2026-08-11)

> **El disable del sistema viejo es SIEMPRE el último paso**, y solo después de
> probar la cadena nueva end-to-end con un MENSAJE REAL — no con el health del
> puente. Desplegar el disable antes de configurar la pieza nueva = prod en modo
> "primer mensaje = fallo" sin que nadie lo note hasta que alguien escribe.

Secuencia en fases (reversible):
1. **FASE 1**: configurar el relay (key del API server) + activar SOLO el bridge
   (el relay sigue en `disabled`, el chat intacto) → probar el bridge con una
   tool REAL (ej. `project-profile.get` con un project_id real).
2. **FASE 2 (el salto)**: relay activo + cadena vieja en `disabled`
   (ai-gateway, prompt-builder, ai-agent-framework-v3, agent-observer, memory-*).
3. **Prueba**: mensaje real → `chat.message.saved` → `ai.chat.response` →
   `chat.assistant.saved`; verificar con `reach <proyecto> latest` que la
   respuesta lleva metadata `provider=hermes`.

Scripts (backup `/home/admin/hermes-backups/2026-08-11-fusion-hermes/`):
`estabilizar-prod.sh` (revertir TODO — re-habilita los 7, para bridge/relay),
`configurar-relay.sh` (FASE 1), `saltar-a-hermes.sh` (FASE 2).

## Verificación rápida

```bash
curl -s http://localhost:3000/modules/hermes-bridge/health              # {ok:true, tools:430}
TOKEN=$(sudo cat /opt/enki/data/.hermes-bridge-token)                   # www-data 0600 → sudo
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/modules/hermes-bridge/catalog | python3 -m json.tool | head
curl -s -X POST http://localhost:3000/modules/hermes-bridge/execute \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"tool_name":"project-profile.get","args":{"project_id":"<pid>"},"context":{}}'
# sin auth → HTTP 401 (la auth del bridge funciona)
```

## Los capados silenciosos del runtime (lección 2026-08-11c — "Claude va pasando y capando")

Cuando la integración la preparó OTRO agente, el código puede ser correcto pero el
RUNTIME quedar CAPADO por capas — cada una parece "config razonable" por separado,
juntas impiden que el agente trabaje. Auditar SIEMPRE estos 3 puntos en el runtime
del agente (no solo el diff del repo):

1. **MCP `tools.include` filtra el catálogo en silencio**: el portal expone ~448
   tools (`ui/request/portal/list_tools`), pero la config del gateway
   (`/home/hermes/.hermes/config.yaml` → `mcp_servers.enki.tools.include`) puede
   limitar a 3 (`productos.list/get/search`) → el agente NO ve
   `productos.update`/escandallo/variaciones y recurre a terminal crudo. Fix:
   eliminar el bloque `tools.include` (catálogo completo) + **restart del
   gateway de hermes** (el client MCP lo mantiene el gateway en memoria desde
   el arranque con el filtro viejo — editar la config NO basta).
   **⚠️ Cómo verificar de verdad que el MCP quedó abierto**: el endpoint
   `GET /v1/toolsets` en :8642 NO sirve — usa `include_default_mcp_servers=False`
   y solo lista los toolsets configurables (~25), nunca las tools del MCP
   (grep de `productos.update`/`variaciones.calcular_precio` da vacío aunque el
   MCP esté abierto). La evidencia real está en el log del gateway:
   `sudo grep "registered" /home/hermes/.hermes/logs/agent.log` → justo tras el
   `ActiveEnterTimestamp` del restart debe aparecer
   `MCP server 'enki' (stdio): registered 420 tool(s): mcp__enki__…`.
   El restart del gateway lo bloquea el harness de Hermes desde dentro de un
   gateway (protección anti-suicidio — no distingue el gateway de admin del de
   hermes): lo lanza Paco con `sudo systemctl restart hermes-gateway`.
2. **Permisos 755 sin `g+w` en módulos creados por www-data**: el motor Enki crea
   `drwxr-xr-x www-data`; el agente (grupo www-data) no puede escribir →
   `Permission denied` en mv/write_file. Fix: `sudo chmod -R g+w /opt/enki/modules/`.
3. **Skills de Enki AUSENTES en el perfil del agente**: `/home/hermes/.hermes/skills/`
   con solo genéricas (4) → el agente no sabe rail/cantera/patrones de módulos y
   "se pierde" (busca módulos apagados, usa SO crudo). Fix:
   `sudo cp -r /home/admin/.hermes/skills/enki /home/hermes/.hermes/skills/`.

Síntoma común de los tres: el agente usa terminal/file crudo sobre /opt/enki en
vez de las tools de Enki. **No es torpe — está sin formación y con las manos
atadas.** El orden de auditoría: toolsets del API server → filtro MCP → permisos
del dir de datos → skills del perfil.

## Prueba end-to-end de que el agente USA las tools de Enki (no terminal crudo)

**PITFALL del envío de prueba — resolver el UUID REAL del proyecto antes de
`conversation send`**: el RPC falla con `RESOURCE_NOT_FOUND: Conversation not
found in project` si el `project_id` no es el UUID canónico. El slug (B, C,
nonina) NO es el UUID; resolver con `enki-rpc.js project <slug>` (→ UUID) y
`enki-rpc.js convs <slug>` (→ conversation_id). Confundir los UUIDs de dos
proyectos da exactamente ese 404. Tras enviar, la verificación canónica es
`reach <slug> <conv>` (lee los mensajes de la DB con metadata `provider`).

Tras abrir las capas, la prueba definitiva es pedirle al chat que use UNA tool de
Enki por su nombre y verificar en el log del gateway que la llamó por el MCP:

```bash
# 1. Enviar al chat: "Lista los ingredientes usando tu herramienta productos.ingredientes.
#    Responde solo con el número total." (rpc conversation send, vía enki-rpc.js)
# 2. Verificar en el log del gateway de hermes que llamó la tool MCP (NO terminal):
sudo grep -E "20:0[0-9]" /home/hermes/.hermes/logs/agent.log | grep -oE "mcp__enki__[a-z_.]+" | sort | uniq -c
#    → debe aparecer mcp__enki__productos_ingredientes (o la tool pedida)
# 3. Confirmar la respuesta en la conversación (reach <proyecto> <conv>):
#    metadata con provider=hermes + el resultado real (ej. "52")
```

Firma de ÉXITO: en el log aparece `mcp__enki__<tool>` (prefijo MCP). Firma de
CAPADO (antes del fix): `Tool terminal returned error` con `Permission denied`
y comandos SO crudos (`mv`, `grep`, `python3 -c`) — el agente no ve las tools de
Enki y se las apaña con el SO.

## Tools `event_based` por el MCP — fix "tool.handler is not a function" (PR #184)

El agente Hermes opera Enki por el MCP → `portal.handleCall` → `moduleLoader.executeTool`
(wrapper simple que llama `tool.handler(args)`). PERO las tools registradas con
`event_based: true` (ej. `buscar_capacidad`, `detalle_capacidad` de `cupula-eventos`)
NO tienen `handler` directo en el registry: su handler espera un EVENTO del bus
(`onBuscarCapacidad(event)` lee `event.data`). Resultado: `UNKNOWN_ERROR "tool.handler
is not a function"` — el agente no podía descubrir/conducir las capacidades del sistema.

**Fix (mergeado, PR #184)**: `portal.handleCall` detecta `toolDef?.event_based` y enruta
por un helper `_callToolEventBased` (`modules/_shared/motor/event-based-call.js`):
publish `toolName` + espera `${toolName}.response` correlado por `request_id` (el patrón
de `ai-gateway._executeToolCall`), timeout 15s. El resto de tools sigue por `executeTool`.

**Síntoma y verificación**: `buscar_capacidad {query:"costear receta"}` por MCP devuelve
"tool.handler is not a function" → el fix está pendiente de desplegar. Tras el fix, el
mismo call devuelve `{total: 8, capacidades:[...]}`. Alcance real: ~847 tools con handler
directo funcionan por MCP (fs_read, productos_ingredientes…); solo las 2 event_based de
la cúpula (y 2 del framework v3 apagado) fallaban.

**Regla durable**: al añadir/auditar una tool del MCP, distinguir `handler` directo
(firma de tool: `fn(args)`) vs `event_based` (firma de evento: `fn(event)` con
`event.data`) — el dispatcher que la sirva debe enrutar cada una por su vía. El
`moduleLoader.executeTool` (wrapper simple) SOLO cubre la primera.

## Los RPCs de módulos (pizzepos/prisma) NO se invocan por ui/request

`enki-rpc.js rpc escandallo costear {…}` → `HANDLER_NOT_FOUND` (los módulos de dominio
no declaran `ui_handlers` — solo `subscribes` del bus). La vía canónica para probarlos
desde fuera es el **envelope del bus** (patrón 2-client: publicador anónimo + suscriptor
observe con `enki:cert:`): publicar `escandallo.costear.request` y escuchar
`escandallo.costear.response` filtrando por `request_id` Y por topic que contenga
`.response` (el eco del propio request también lleva el request_id — filtrar solo por
request_id captura el eco y parece timeout). El log del core confirma el ciclo:
`receive:escandallo.costear.request` → `publish:escandallo.costear.response` →
`fs.write.request` (el módulo persistió).

## El agente aplica la filosofía de verificación (la mente hereda el ADN)

Prueba en vivo (nonina 2026-08-11): el agente condujo `escandallo.costear.request →
response` por `bus.publishAndWait`, detectó un coste corrupto (receta con anchoas en
unidades vs catálogo en €/kg → 8×36=288€ erróneo), lo REVIRTIÓ vía `fs.edit` (6 patches)
y reportó honesto: "30 de 32 con coste, bachata y folk pendientes — no con un número
inventado". Firma de mente sana: trabaja, verifica contra disco, detecta basura, la
revierte y NO certifica éxito falso. Si el agente "hace el trabajo" pero el resultado en
disco es absurdo, el dato de negocio (factor de conversión ud↔kg ausente) es la causa,
no la fusión.

## Slash commands de Hermes NO funcionan en el chat de Enki

`/model`, `/new`, `/help`… viven en el CLI y en los adaptadores de mensajería
(Telegram, etc.), NO en `/v1/chat/completions` (verificado: 0 `process_command` /
`startswith("/")` en `gateway/platforms/api_server.py`). El relay manda el texto
crudo como `role:user` → el LLM lo trata como mensaje normal. Cambiar el modelo
del chat de Enki = editar `modules_config.hermes-relay.hermes_model` + restart
enki (no hay vía conversacional). Si se quiere `/model` de verdad: feature nueva
del relay (interceptar `/`, traducir a config o a `X-Hermes-Session-Key` +
session /model override que el API server SÍ soporta).

## El repo y prod se DESALINEAN al activar la fusión a mano en prod (PR #185)

Pagado en vivo 2026-08-11: tras la FASE 2 (el salto en prod), `config.json` del
REPO seguía con la fusión INERTE (bridge/relay en disabled, gateway viejo activo
— el PR #183 lo dejó así a propósito "hasta probar"), mientras PROD ya tenía la
fusión ACTIVA. Un `deploy.sh` (rsync --delete repo→prod) desde ese estado habría:
(1) reactivado ai-gateway y apagado bridge/relay → DESHACE la fusión en silencio,
(2) BORRADO `modules_config.hermes-relay` — la key del API server solo vivía en
el config de prod → el chat pierde Hermes sin aviso.

Fix (patrón a repetir): **todo cambio de estado hecho a mano en prod debe
reflejarse en el repo ANTES del siguiente deploy, y los secretos NUNCA viven
solo en el config de prod** (el rsync los pisa):
1. Alinear `config.json` del repo con la realidad de prod (fusión activa:
   bridge/relay fuera de disabled, cadena vieja en disabled).
2. Mover el secreto FUERA del JSON a una env var que el relay ya lee
   (`mc.hermes_api_key || process.env.HERMES_API_KEY`): añadir
   `Environment=HERMES_API_KEY=` a `deployment/systemd/enki.service.tmpl` Y al
   unit vivo `/etc/systemd/system/enki.service` + `daemon-reload` + restart
   enki. En el repo la key queda VACÍA (nunca committear el secreto).
3. Verificar con un mensaje real que el relay sigue funcionando con la key por
   env (metadata `provider=hermes` en la respuesta), y `diff config.json
   repo vs prod` → IDÉNTICOS antes de declarar deploy seguro.

Diagnóstico rápido de desalineación: `diff <(python3 -m json.tool config.json)
<(python3 -m json.tool /opt/enki/config.json)` — si difiere en disabled o
modules_config, el deploy cambiará estado.

## Pitfalls

- **`HERMES_TIMEOUT` en el chat NO significa Hermes caído — significa que el
  agente está TRABAJANDO y superó el timeout del esperador** (pagado en vivo
  2026-08-11): tras un "Ok" del usuario, el agente Hermes interpretó que debía
  seguir con la tarea pendiente (restaurar `banco-ideas`) y se puso a ejecutar
  tools reales (terminal, mv, write_file); a los 300s el relay cortó con
  `HERMES_TIMEOUT` y escribió el mensaje de sistema en la conversación, aunque
  el agente seguía vivo. Diagnóstico: mirar el log del gateway de Hermes
  (`/home/hermes/.hermes/logs/agent.log` vía sudo — franja temporal del fallo:
  tool_executor en acción = trabajando, no colgado). Fix: `request_timeout_ms`
  del relay 300000 → 900000 (config se carga en onLoad → restart enki). Es la
  MISMA lección que el timeout de `invoke_agent`: el timeout del esperador no
  mata al trabajador; verificar la bitácora/log antes de concluir.
- **El agente Hermes opera sobre /opt/enki con tools del SO (terminal/file) y
  choca con permisos** — no es un fallo de la fusión: debería operar por el MCP
  enki-mcp-server (ya conectado a su gateway, PID del proceso `enki-mcp-server.js`)
  o por enki_tools/bridge, no con filesystem crudo (ej. `mv` a `/opt/enki/backup/`
  falla porque el dir no existe; write_file a /opt/enki puede fallar por
  permisos www-data). Diagnóstico: (1) el MCP estaba CAPADO con `tools.include`
  a 3 tools en la config del gateway — quitarlo abre el catálogo completo
  (ver sección de capados arriba); (2) `chmod -R g+w /opt/enki/modules/` para
  que el grupo www-data (al que pertenece el usuario hermes) pueda escribir;
  (3) las skills de Enki deben copiarse al perfil del agente.
- Token del bridge es `www-data 0600` → admin necesita sudo para leerlo.
- `SUDO_PASSWORD` vive en `~/.hermes/.env` (línea comentada por defecto). El
  `.env` está protegido contra write_file/patch pero `sed -i` funciona. El
  harness lo inyecta en `sudo` normal (NO en `sudo -n`), y el gateway solo lo
  lee si arrancó DESPUÉS del cambio — el patrón fiable es que Paco ejecute los
  scripts con sudo él mismo.
- Consumo: ~28K tokens/turno = core del agente Hermes + historial (un salto,
  no doble). Si es alto: ajustar `context_window` del relay (40) o el modelo.
- No asumir que un endpoint OpenAI-compat es un proxy: VERIFICAR qué hay detrás
  (el API server ejecuta agente completo; el proxy es otro proceso, :8645).
- config.json de prod es de www-data: editar vía scripts con sudo, no con patch
  directo (Permission denied).
- El chat de Enki ahora se presenta como "Hermes Agent bajo la persona
  Arquitecto Event-Driven" (el CLAUDE.md llega como system prompt) — si el dueño
  quiere otra identidad, se ajusta en la cabecera o en el prompt del relay.

Referencias: `references/fusion-2026-08-11.md` — cronología del incidente,
líneas clave del código (dispatcher, registry, api_server), salidas de
verificación reales y el estado final de prod.
