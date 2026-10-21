---
name: enki-mqtt-architecture
description: "Arquitectura MQTT de Enki — la dualidad EventBus interno (EventEmitter in-process) vs broker MQTT externo (:1883). Patrones correctos para conectar desde fuera (motor-hermes, enki-rpc.js, scripts Python). NO publicar toolName directo al broker."
when-to-use: >
  Al diseñar o depurar comunicación externa con Enki: motores Rust, scripts Python,
  herramientas Claude Code, o cualquier código que necesite ejecutar tools de Enki
  desde fuera del core Node.js. También al implementar un bridge alternativo a
  hermes-bridge.
tags:
  - enki
  - mqtt
  - arquitectura
  - eventbus
  - bridge
---
# Arquitectura MQTT de Enki: EventBus interno vs broker externo

## ⚠️ Lección fundamental (pagada)

**El EventBus del core Node.js NO es el broker MQTT.** Son dos sistemas de eventos
independientes. Publicar al broker MQTT NO llega al EventBus interno ni viceversa.

## EventBus interno (in-process)

- `core/events/bus.js`: `class EventBus extends EventEmitter` — es un EventEmitter
  de Node.js, **no usa MQTT**.
- `hermes-bridge._busFallback()` publica al EventBus interno, NO al broker MQTT.
- Las tools con ruta directa (`moduleLoader.toolsRegistry.get(name)`) se ejecutan
  in-process dentro del core Node.js. Nunca pasan por MQTT.
- El `toolsRegistry` (catálogo de tools registradas por módulos) solo existe in-process.

## MQTT broker (local :1883) — para clientes externos

Usado por: frontend Svelte, motores Rust (motor-ojco, motor-hermes, motor-coherencia),
scripts Python, Claude Code (enki-rpc.js).

### Gateway MQTT → EventBus

`core/ui/UIRequestHandler.js` subscribe `ui/request/#` por MQTT, recibe peticiones,
las despacha al EventBus interno, y responde por `ui/response/{request_id}`.

### Patrón correcto para conectar desde fuera

```
publish   ui/request/{domain}/{action}   { request_id, data }
subscribe ui/response/{request_id}       → { request_id, status, success, data|error }
```

**Domain + action** se obtienen de toolName: `"project.list"` → domain=`"project"`, action=`"list"`.
Si toolName no tiene punto, es un caso borde (no recomendado).

### Patrones que NO funcionan ❌

- `publish {toolName}` — nadie escucha toolNames sueltos en el broker.
- `publish core/default/events/{toolName}` — no hay suscriptor.
- `publish toolName, subscribe toolName.response` — el EventBus interno lo haría,
  pero desde fuera del core no funciona.

## motor-hermes — bridge alternativo en Rust

Implementa el patrón correcto `ui/request/{domain}/{action}`. Verificado contra bus real.

- Crate: `enki-sense/crates/motor-hermes/` (commit `9c4843c4`)
- Mismo workspace que motor-ojo, motor-coherencia, etc.
- Puerto 8130. API idéntica a hermes-bridge:
  - `POST /execute` (auth Bearer) — ejecuta tool
  - `GET /catalog` (auth Bearer) — catálogo (vacío hoy, pendiente)
  - `GET /health` (sin auth) — health check
- Token: `data/.hermes-bridge-token` (ENV: `ENKI_BRIDGE_TOKEN`)
- Timeouts: 15s default, 65s `code.orquestar`, 300s `invoke_agent`
- Serializaciones: 6 → 4 (salta Node.js intermedio)

### Catálogo pendiente
El `toolsRegistry` vive in-process en el core Node.js. No se puede obtener por MQTT
sin crear un endpoint nuevo. Hoy motor-hermes devuelve catálogo vacío.

## Herramientas MQTT existentes

| Herramienta | Ruta | Uso |
|---|---|---|
| enki-rpc.js | `~/3enki/.claude/skills/conexion-mqtt/enki-rpc.js` | Node.js, WSS (443) desde fuera del VPS |
| send-message.js | `~/3enki/scripts/audit-helpers/send-message.js` | Enviar mensaje a conversación |
| motor-hermes | `enki-sense/target/debug/motor-hermes` | Rust, TCP (1883) local |

## Referencia rápida

```python
# Python: hablar con Enki por MQTT directo
import paho.mqtt.client as mqtt
import uuid, json

client = mqtt.Client()
client.connect("127.0.0.1", 1883)
client.loop_start()

request_id = str(uuid.uuid4())
response_topic = f"ui/response/{request_id}"

# Suscribirse ANTES de publicar (race condition)
client.subscribe(response_topic)
client.publish("ui/request/project/list", json.dumps({
    "request_id": request_id,
    "data": {}
}))

# Esperar respuesta (en callback real esperar correlación)
# client.on_message = lambda c, u, m: ...
```
