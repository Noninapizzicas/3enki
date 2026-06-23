# `mcp/` — Enki como servidor MCP

Expone las capacidades de Enki (las 215 tools del `toolsRegistry`) a agentes externos
(Claude Code, Cursor, …) vía **MCP**, sin tocar el core. La pieza es un **bridge stdio**
(`enki-mcp-server.js`) que traduce MCP ↔ MQTT hablando con el módulo `portal`.

```
agente externo  ──MCP (stdio)──►  enki-mcp-server.js  ──MQTT (ui/request/portal/*)──►  módulo portal
                                                                                          │ GUARD
                                                                                          ▼
                                                                         getToolsForAI() / executeTool()
```

## El guard vive en el módulo `portal` (no en el bridge)

El bridge es tonto; la seguridad la pone `modules/portal`:

- **interruptor `portal-mcp`** (panel central, grupo `sistema`) — **OFF por defecto**. OFF = puerta
  cerrada: `tools/list` llega vacío y `tools/call` responde 503. Se enciende/apaga en caliente.
- **scope** `project` (default) | `system` — `project` no sale de su `project_id` ni toca tools de
  sistema (db, module, interruptor, plugin, code, …). `system` abre cross-project + sistema.
- **mode** `read` (default) | `write` — `read` solo expone/ejecuta tools de LECTURA (sin mutación).
- **allowlist** opcional — si se define en config, SOLO esas tools.
- **confirmación** — una tool con `confirmation:true` exige `confirmado:true`.
- **audit** — cada acceso emite `portal.invocado` → lo capta la propiocepción. Nada invisible.

Config en `modules/portal/module.json`:

```json
{ "portal_enabled_default": false, "mode": "read", "scope": "project", "project_id": null, "allowlist": [] }
```

## Arrancar

1. Enki corriendo (su broker MQTT accesible).
2. Enciende el portal: pulsa el interruptor **`portal-mcp`** en el panel (o `interruptores.set {id:'portal-mcp', enabled:true}`).
3. Registra el bridge en Claude Code:

```bash
claude mcp add enki -- node /ruta/a/2enki/mcp/enki-mcp-server.js
```

Con variables de entorno (broker + proyecto a scopear):

```bash
ENKI_BROKER_URL=mqtt://localhost:1883 ENKI_PROJECT=<project_id> \
  claude mcp add enki -- node /ruta/a/2enki/mcp/enki-mcp-server.js
```

| Variable | Default | Qué |
|---|---|---|
| `ENKI_BROKER_URL` | `mqtt://localhost:1883` | broker MQTT de Enki (`mqtt://`, `ws://` o `wss://`) |
| `ENKI_PROJECT` | (ninguno) | `project_id` que se inyecta en cada call (el portal lo re-valida) |
| `ENKI_PORTAL_TIMEOUT` | `8000` | ms de espera por respuesta del portal |

## Dos caminos de conexión

```
A) Claude Code EN el VPS (cero exposición):
   ssh al VPS → claude mcp add enki -- node /opt/enki/mcp/enki-mcp-server.js
   (el bridge habla con localhost:1883)

B) Claude Code REMOTO (tu portátil) vía wss — SIN exponer puertos:
   el broker embebido tiene WebSocket en 9001; Caddy ya rutea wss://<dominio>/mqtt → :9001.
   ENKI_BROKER_URL=wss://enki-ai.online/mqtt ENKI_PROJECT=<id> \
     claude mcp add enki -- node /ruta/local/mcp/enki-mcp-server.js
   (mqtt.js habla wss nativo; Caddy/Let's Encrypt pone el TLS. Verificado: ws+path /mqtt conecta.)
```

## Smoke-test en vivo (con Enki corriendo)

Verifica el camino completo de punta a punta — enciende `portal-mcp`, comprueba el portal por
MQTT (health · list_tools · una call de lectura), y arranca el bridge real para el handshake MCP
por stdio (initialize + tools/list):

```bash
ENKI_BROKER_URL=mqtt://localhost:1883 ENKI_PROJECT=<project_id> node mcp/smoke.js
```

Reporta `N ok · M fallos` y sale 0 si todo late. Requiere deps instaladas (`mqtt`) y Enki arrancado.

## Probar a mano (sin Claude Code)

```bash
# lista de tools (con el portal ON)
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | ENKI_PROJECT=demo node mcp/enki-mcp-server.js
```

## Seguridad — el orden de apertura

Nace **scoped-a-proyecto, modo lectura, apagado**. Súbelo de a poco:
`read→write` (mutaciones de un proyecto) antes de `project→system` (operar el cerebro entero).
La puerta-dios MQTT (scope `system`, `module.reload`, etc.) reusará este mismo guard una vez rodado.
