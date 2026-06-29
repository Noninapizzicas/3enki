---
name: conexion-mqtt
description: Conectar a un Enki vivo por MQTT (sobre WebSocket Secure, 443) y hablar con él vía RPC ui/request → ui/response. Deja una conexión abierta para llegar a un proyecto y cargar una conversación (o cualquier dominio del bus). Útil cuando Claude corre FUERA del VPS (entorno cloud aislado) y necesita leer/operar el sistema vivo sin tener el Portal MCP cableado.
when-to-use: Cuando hace falta leer o tocar el Enki vivo desde una sesión que no está en el VPS — p.ej. "lee la última conversación del proyecto X", "lista los proyectos", "saca la carta viva", o cualquier RPC ui/request/{domain}/{action}. NO usar si Claude ya corre dentro del VPS con el Portal MCP o los audit-helpers a mano.
---

# conexion-mqtt

Hablar con un Enki **vivo** por MQTT desde fuera del VPS. El frontend de Enki es
un core más conectado al broker; aquí hacemos lo mismo: RPC sobre `ui/request` →
`ui/response`. Una conexión abierta sirve para varias llamadas (proyecto →
conversación → carga) sin reconectar.

## El gotcha que lo decide todo: solo sale 443

En un contenedor cloud aislado el **MQTT crudo (1883/8883) está BLOQUEADO**; lo
único que sale es **HTTPS/443**. Por eso el broker es **`wss://enki-ai.online/mqtt`**
(MQTT sobre WebSocket Secure, 443) — el mismo `AUDIT_BROKER` que usan los
`scripts/audit-helpers`. `mqtt://host:1883` NO conecta desde fuera; `wss://…/mqtt` sí.

Diagnóstico rápido de alcance antes de nada:
```bash
timeout 5 bash -c 'echo > /dev/tcp/enki-ai.online/443' && echo "443 SALE" || echo "443 bloqueado"
```

## El patrón RPC (lo que hace el frontend)

```
publish  ui/request/{domain}/{action}   { request_id, data:{…} }
listen   ui/response/{request_id}        → { request_id, status, success, data }
```

Para llegar a una conversación se encadenan 3 RPCs sobre la MISMA conexión:
```
project/list                         → resolver el project_id por nombre
conversation/list  {project_id}      → elegir la conversación (la última, o por título)
conversation/load  {project_id, conversation_id}  → mensajes completos
```

## Cómo se usa (helper incluido)

`enki-rpc.js` (en esta carpeta) abre UNA conexión y cierra al terminar. Requiere
la dep `mqtt` del repo — exporta `NODE_PATH` si no resuelve:

```bash
cd <repo>                        # 2enki
export NODE_PATH="$PWD/node_modules"
S=.claude/skills/conexion-mqtt/enki-rpc.js

# instalar mqtt si falta (sale por 443):
node -e "require('mqtt')" 2>/dev/null || npm install mqtt --no-save --no-audit --no-fund

node "$S" projects                       # lista proyectos (updatedAt · id · name)
node "$S" project nonina                 # resuelve "nonina" → su UUID
node "$S" convs nonina                   # conversaciones del proyecto
node "$S" reach nonina latest            # proyecto → última conversación → CARGA (1 conexión)
node "$S" reach nonina "2"               # …o la conversación con título "2"
node "$S" rpc carta get '{"project_id":"<uuid>"}'   # RPC genérico a cualquier dominio
```

`<proyecto>` acepta **nombre** (case-insensitive, slug-tolerante) o **UUID**.
Los logs van a **stderr**; la respuesta JSON a **stdout** (pipeable a `node`/`jq`).

ENV: `ENKI_BROKER`/`AUDIT_BROKER` (default `wss://enki-ai.online/mqtt`) ·
`ENKI_RPC_TIMEOUT` (ms por RPC, default 12000).

## Contrato (JSON)

```json
{
  "transporte": "wss://enki-ai.online/mqtt (MQTT over WSS, 443)",
  "rpc": { "request": "ui/request/{domain}/{action}", "envelope": {"request_id":"uuid","data":"{}"},
           "response": "ui/response/{request_id}", "shape": {"status":"int","success":"bool","data":"{}"} },
  "dominios_lectura_utiles": {
    "project":      ["list"],
    "conversation": ["list", "load"],
    "carta":        ["get", "list"]
  },
  "una_conexion": "withConnection() conecta 1 vez → N RPCs → cierra. No reconectar por paso."
}
```

## Pseudocódigo (el núcleo)

```
FUNCION withConnection(fn):
  c ← mqtt.connect(BROKER, {reconnectPeriod:0})   // wss/443
  ESPERA c.'connect'  (timeout 8s)
  c.on('message', (topic,payload) →                // demux por request_id
     SI topic empieza 'ui/response/': resolver pending[payload.request_id])
  rpc ← (domain,action,data) →                     // publica y espera su response
     id ← uuid ; subscribe ui/response/{id}
     publish ui/request/{domain}/{action} {request_id:id, data}
     RETORNA promesa (timeout ENKI_RPC_TIMEOUT)
  TRY  RETORNA await fn(rpc)   FINALLY  c.end()

FUNCION reach(proyecto, objetivo='latest'):
  withConnection(async rpc →
    pid  ← resolveProject(rpc, proyecto)                 // project/list → match por nombre/slug/uuid
    cs   ← rpc('conversation','list',{project_id:pid})   // ordena por updated_at desc
    conv ← objetivo=='latest' ? cs[0] : cs.por_titulo(objetivo) ?? cs[0]
    RETORNA rpc('conversation','load',{project_id:pid, conversation_id:conv.id}))
```

## Garantías y límites

- **Solo lo que el bus expone como ui_handler.** Lectura (project/conversation/
  carta…) va fina. Para MUTAR (escribir) usa el dominio que corresponda
  (p.ej. `carta.update_product`) — y confírmalo antes: tocar el sistema vivo no
  es reversible solo con cerrar la conexión.
- **No es el Portal MCP.** El Portal (`mcp/enki-mcp-server.js`) es la puerta
  guardada con interruptor/scope/audit. Esto es el camino directo del frontend,
  sin guard: úsalo para leer, y con cuidado para escribir.
- **Best-effort de red.** Si 443 no sale o el broker no responde, falla limpio
  (timeout) sin colgar.
- **Export HTTP alternativo** (cuando el path de datos del módulo responde):
  `GET https://enki-ai.online/modules/conversation-export/latest/<project_id>?token=<TOKEN>&verbose=true`.
  Da el timeline completo (tool calls + eventos). Ojo: depende de que el módulo
  `conversation-export` no esté devolviendo 500 en su path DB.
```
