---
name: enki-mqtt-rpc
description: >-
  CÓMO invocar tools de Enki por MQTT desde procesos externos (Rust, Python,
  Node.js) sin depender del core Node.js ni del MCP. Cubre el patrón correcto
  (ui/request/{domain}/{action}), los dos event buses (in-process vs MQTT),
  motor-hermes como bridge HTTP→MQTT, y el helper enki-rpc.js.
tags:
  - enki
  - mqtt
  - motor-hermes
  - rpc
  - bridge
  - arquitectura
---

# enki-mqtt-rpc — Cómo invocar Enki por MQTT desde fuera del core

## Regla #1 (corregida en vivo 2026-08-30): hay TRES rutas hasta el EventBus

El `EventBus` del core (`core/events/bus.js`) es in-process **pero está puenteado a MQTT en
ambos sentidos**: `setupMQTTSubscriptions()` subscribe `core/<coreId>/events/#` **y también el
topic LITERAL `core/*/events/#`**. Desde fuera tienes 3 rutas (elige según el módulo):

### Ruta 1 — Puente `core/*/events/…` con ASTERISCO LITERAL (la canónica del frontend)
Alcanza a TODOS los módulos, incluidos los **pure-evento** sin handlers UI (ej. carta-manager):
```
publish   core/*/events/<evento.con.puntos→/barras>    envelope, con {request_id,...} en data
subscribe core/*/events/<…>/response                   (el * LITERAL casa como wildcard MQTT)
```
- El topic se construye A PARTIR DEL PATRÓN del evento: `frontend client.ts
  #normalizeEventPattern` mapea `carta.get.request` → publicar a `core/*/events/carta/get/request`
  (asterisco literal; verificado EN VIVO 2026-08-30: respuesta 200 real de carta-manager).
- **Publicar a `core/ui-frontend/events/…` NO llega** — nadie del core está suscrito a ese
  topic real → silencio total. El broker (aedes, bus-guard nacido en `off`) te entregará solo
  tu propio eco si estás suscrito al topic de tu request; no es señal de broker roto.
- Envelope EXACTO que espera el core (`EventEnvelope.validate`): 
  `{event_id, event_type, timestamp, source:{core_id:'ui-frontend'}, data, metadata:{}}`.
  El core valida y hace `emitLocal(event_type, envelope)` — el handler registrado es el
  event_type COMPLETO (con `.request`).
- Respuesta: `envelope.data = {request_id, status, data|error}` **TOP-LEVEL**
  (`modulo-hibrido-reflejo._atender` hace spread del result). El `result:{}` anidado
  solo aparece por la ruta 3 — no lo tomes como el shape del bus.

### Ruta 2 — Bridge `ui/request/…` (UIRequestHandler)
```
publish   ui/request/{domain}/{action}   { request_id, data: {…} }
subscribe ui/response/{request_id}       → { request_id, status, success, data|error }
```
Esto lo procesa `UIRequestHandler` (`core/ui/UIRequestHandler.js`), que subscribe
`ui/request/#` por MQTT y despacha a los handlers UI registrados por cada módulo.
Limitación: solo módulos CON handlers UI. Un 404 `HANDLER_NOT_FOUND` aquí **NO** significa
que el módulo esté caído — los pure-evento solo responden por la ruta 1 (verificado:
`carta-manager/list` → HANDLER_NOT_FOUND por ui/request, pero respuesta 200 instantánea por ruta 1).

### Ruta 3 — Bridge HTTP motor-hermes :8130 (`bus.publishAndWait`)
`args:{event, payload}` — **`payload`, no `data`** else INVALID_INPUT — y anida la respuesta
bajo `result:{}`. Publica DENTRO del core: herramienta de diagnóstico ideal para separar
"el backend no responde" de "mi transporte está mal" (verificación viva de contratos sin
pelear con el transporte). Ejemplo en Pitfalls.

## Patrón RPC canónico (por evento — reflejos híbridos)

```
1. Conectar al broker (localhost:1883 TCP, o wss://enki-ai.online/mqtt para remoto)
2. Suscribirse a core/*/events/<dom>/<acc>/response   (asterisco literal)
3. Publicar a core/*/events/<dom>/<acc>/request con envelope del frontend + request_id en data
4. Correlar por request_id → respuesta {request_id, status, data|error} TOP-LEVEL
```

Si el módulo tiene handlers UI (varía por módulo), también vale la ruta 2:
```
1. Sub ui/response/{request_id} (o #)   2. Pub ui/request/{domain}/{action} = {request_id, data}
   → {request_id, status, success, data|error}
```

## Receta de diagnóstico cuando un RPC no responde (orden que funcionó en vivo)

1. **Sonda dentro del core** — `motor-hermes :8130` `bus.publishAndWait` (ruta 3): si responde,
   el backend está sano y el problema es TU transporte; si no, el módulo o el core.
2. **Escuchar `#` 8-10s** con un script mqtt efímero: mide si el broker circula algo y si tu
   publish rebotó. Broker callado ≠ broker roto (horas muertas reales = solo tu eco).
3. **Revisar el mapeo evento→topic**: dots→slashes, y el topic de publish sale del
   `#normalizeEventPattern` del frontend. Sospecha primero de `core/ui-frontend/...` vs
   `core/*/events/...` literal — ese detalle costó un ciclo entero de debugging.

`tool_name` como "project.list" se parsea → domain="project", action="list".
Si el action tiene punto (ej. "resolver.pedido"), se usa el action completo.

## motor-hermes (Rust)

Bridge HTTP→MQTT en puerto 8130. Service systemd activo.

| Endpoint | Descripción |
|----------|-------------|
| `POST /execute` | Ejecuta tool. Body: `{tool_name, args, context}`. Auth: Bearer token. |
| `GET /catalog` | Tools disponibles (proxy al bridge Node.js). Auth: Bearer token. |
| `GET /health` | Health check (sin auth). |

**Cómo activarlo:** Hermes Python lee `ENKI_BRIDGE_URL` (default `http://localhost:8130`).
Setear `ENKI_BRIDGE_URL=http://localhost:8130` en el servicio hermes-gateway y reiniciar.

**Patrón de dispatch:** `tool_name` → split por primer punto → `ui/request/{domain}/{action}`.
Si el action contiene punto (ej. `resolver.pedido`), se usa completo.

**Timeouts:** 15s default, 65s code.orquestar, 300s invoke_agent.

**Token:** `data/.hermes-bridge-token` (compartido con hermes-bridge Node.js).
Leer con `cat data/.hermes-bridge-token`.

**Health:**
```bash
curl -s http://localhost:8130/health
```

**Ejemplo de tool call:**
```bash
TOKEN=$(cat data/.hermes-bridge-token)
curl -s http://localhost:8130/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool_name":"project.list","args":{}}'
```

## hermes-gateway (Node.js)

Módulo en `/opt/enki/modules/hermes-gateway/` que subscribe `hermes/tool/+` y delega
a `hermes-bridge._dispatch()`. Se carga pero **no responde usablemente** — el cliente
MQTT del core no expone la API que necesita. Usar motor-hermes directo en vez.

## Nota para stores del frontend (Svelte)

`ui-store-mqtt` (cantera del repo Enki) asume `mqttRequest('dominio','accion',…)` — ruta 2 —.
Para reflejos híbridos **pure-evento** (carta-manager y similares: `module.json` con solo
`subscribes`, sin handlers UI) el store necesita su propio helper RPC-por-evento (ruta 1):
publicar al topic del patrón con asterisco literal + envelope client.ts, esperar la
`<ev>.response` correlada por `request_id`, shape `{request_id, status, data|error}` top-level.
La cantera es read-only para curación autónoma: si hay que ampliarla, PR al repo 3enki.

## Herramienta helper: enki-rpc.js

Vive en `~/3enki/.claude/skills/conexion-mqtt/enki-rpc.js`.
Requiere `mqtt` npm. Conecta por WSS a `enki-ai.online:443`.

```bash
cd ~/3enki && NODE_PATH="$PWD/node_modules" node .claude/skills/conexion-mqtt/enki-rpc.js PROJECT COMMAND
```

Comandos:
| Comando | Descripción |
|---------|-------------|
| `projects` | Lista proyectos |
| `project <nombre\|id>` | Resuelve proyecto → UUID |
| `convs <proyecto>` | Conversaciones del proyecto |
| `reach <proyecto> [título\|latest]` | Carga mensajes de una conversación |
| `rpc <domain> <action> [json]` | RPC genérico cualquiera |

## hermes-bridge (Node.js, módulo interno)

El bridge Node.js tiene **3 rutas de dispatch** que motor-hermes NO replica:
1. **Universal bus tools** (`bus.publish`, `bus.publishAndWait`) → EventBus directo
2. **Ruta directa** → handler en módulo cargado (NO pasa por MQTT)
3. **Bus fallback** → publica `{toolName}` con `request_id`, escucha `{toolName}.response`

Si motor-hermes no encuentra una tool, cae a timeout 15s — probar entonces contra
hermes-bridge (:3000) para ver si la ruta directa la resuelve.

## Pitfalls

- **`core/ui-frontend/events/...` vs `core/*/events/...` literal**: publicar con el coreId
  real NO llega (nadie suscrito); el frontend usa el patrón con asterisco. Publicar a un
  topic cuyos suscriptores se incluyen a uno mismo produce ECO autodirigido que confunde
  la correlación — filtra por request_id o suscribe solo a `*/response`.
- **El suscriptor es el event_type COMPLETO** (`carta.get.request`, con `.request`): el
  mapeo dots→slashes es el ÚNICO cambio (`carta.get.request` → `carta/get/request`).
  Publicar `carta/get` (sin `.request`) no lo escucha nadie.
- `bus.publishAndWait` por :8130 pide `args:{event, payload}` — con
  `args:{event, data}` responde INVALID_INPUT. Su respuesta anida bajo `result:{}`.
- `confluencia.resolver_pedido` se parsea como `resolver_pedido` pero el módulo
  registra `resolver.pedido` (con punto en el action). Debuggear: publicar directo
  por MQTT a `ui/request/confluencia/resolver.pedido` para verificar.
- El catálogo de motor-hermes (`GET /catalog`) devuelve 0 tools porque el gateway
  no responde. Para catálogo real, usar `GET /modules/hermes-bridge/catalog` y `GET /health` (`tools:0` es lo normal).
- Módulos que escuchan eventos MQTT crudos (ej. `confluencia.resolver_pedido.request`,
  TODOS los reflejos híbridos pizzepos: `carta.<op>.request`, ...)
  NO se registran en `UIRequestHandler` — `ui/request/<dominio>/...` les da 404
  HANDLER_NOT_FOUND. No es que estén caídos: su interfaz es el bus (ruta 1).
- Sonda rápida de contrato en vivo sin transporte propio:
  ```bash
  TOKEN=$(cat /opt/enki/data/.hermes-bridge-token)
  curl -s http://localhost:8130/execute -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"tool_name":"bus.publishAndWait","args":{"event":"carta.get.request","payload":{"request_id":"probe1","project_id":"<pid>","carta_id":"<cid>"}},"timeout_ms":8000}'
  # → {"result":{"request_id":"probe1","status":200|404,...top-level}}
  ```
