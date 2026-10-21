---
name: enki-mqtt-patterns
description: >-
  Patrones MQTT verificados contra el bus real de Enki. Cómo invocar tools
  desde fuera del proceso Node.js (Rust, Python, Node). Diferencia entre
  EventBus in-process y broker MQTT. Patrones que funcionan y que no.
tags:
  - enki
  - mqtt
  - event-bus
  - dispatch
  - motor-hermes
when-to-use: >-
  Cuando necesites invocar una tool de Enki desde fuera del core Node.js,
  depurar por qué una tool no responde por MQTT, o decidir qué patrón usar
  para un nuevo motor Rust/microservicio.
---

# Patrones MQTT en Enki

Lecciones del experimento **motor-hermes** y la integración hermes-gateway.

## El EventBus NO es MQTT

`core.eventBus` extiende `EventEmitter` de Node.js — es **in-process**.
Los módulos publican y escuchan eventos en memoria, no en el broker MQTT.
El `toolsRegistry` (mapa con las 447+ tools) solo es accesible desde dentro
del proceso Node.js que corre el core.

El core también tiene un **cliente MQTT** (`core.eventBus.mqtt`) para
comunicación inter-core, pero NO es un cliente mqtt raw con el API estándar
(`.on('message')`, `.subscribe()`). Es el cliente de la librería `mqtt`
envuelto. Su propiedad `isConnected` puede ser `undefined` en lugar de
boolean — lo que hace fallar silenciosamente a módulos que chequean
`if (!mqtt || !mqtt.isConnected)`.

## Patrón que FUNCIONA ✅

```
publish   ui/request/{domain}/{action}   { request_id, data: {...} }
subscribe ui/response/{request_id}       → { request_id, status, success, data }
```

**Parseo del tool name**: `"project.list"` → domain=`project`, action=`list`.
Usar `splitn(2, '.')` no `split_once('.')` porque algunos actions tienen
punto interno (ej. `"resolver.pedido"`).

**Por qué funciona**: El `UIRequestHandler` del core subscribe a
`ui/request/#` en el MQTT real y despacha al EventBus interno. Es el mismo
camino que usa el frontend Svelte.

**Verificado con**: `project.list` → 200 OK, 9 proyectos reales.
También: `confluencia.resolver_pedido` → 200 OK con clasificación.

## Patrón que NO funciona ❌

```
publish   {toolName}       { request_id, ...args }
subscribe {toolName}.response
```

Ningún módulo subscribe topics planos como `project.list` en el broker MQTT.
Solo el EventBus in-process escucha tools por nombre.

## Patrón hermes/tool/+ ⚠️

```
publish   hermes/tool/{toolName}   { request_id, args, context }
subscribe hermes/response/{request_id}
```

Requiere el módulo `hermes-gateway` cargado CORRECTAMENTE con el cliente
MQTT funcional. En la práctica falla porque `core.eventBus.mqtt.isConnected`
no es un boolean fiable. El gateway se carga en la lista de módulos pero
no se suscribe al MQTT.

## El dispatch real tiene 3 rutas

El módulo `hermes-bridge/index.js` (Node.js, dentro del core) usa:

1. **Ruta directa** — `toolsRegistry.get(toolName).handler()` en el módulo
   cargado. NO pasa por MQTT. Cubre `fs.read`, `credential.*`, etc.
2. **Bus fallback** — `eventBus.publish(toolName)` (in-process, no broker).
3. **Bus universal** — `eventBus.publish(event)` para `bus.publish`.

No hay forma de acceder a la ruta 1 (directa) desde fuera del proceso
Node.js sin un módulo puente.

## Interruptores

- `ejecutor` — controla comandos shell. Su guard se puede desactivar
  eliminando el bloqueo `_esPeligroso` (ver referencia en módulo).
- `code.orquestar` — NO es un interruptor vivo. Se controla por
  `blueprint_orquestar_enabled` en `config.json modules_config.ai-gateway`
  (default `false`). Es un flag de arranque frío — requiere reinicio de
  Enki para cambiar.

## Cómo invocar desde Python (MQTT directo)

```python
import paho.mqtt.client as mqtt, json, time, uuid

c = mqtt.Client()
c.connect('127.0.0.1', 1883, 60)

rid = str(uuid.uuid4())
resp = {}
def on_msg(client, userdata, msg):
    resp[msg.topic] = msg.payload

c.on_message = on_msg
c.subscribe(f'ui/response/{rid}', qos=1)
c.loop_start()
time.sleep(0.3)

c.publish('ui/request/project/list', json.dumps({
    "request_id": rid,
    "data": {}
}), qos=1)
time.sleep(3)
c.loop_stop()
```

## motor-hermes

Bridge HTTP→MQTT en Rust. Activo en :8130, 700KB RAM.
Service systemd: `motor-hermes.service`.
Release build: `~/3enki/enki-sense/target/release/motor-hermes` (2.9MB).
Timeout por tool: 15s default, 65s code.orquestar, 300s invoke_agent.
Token compartido con hermes-bridge (`data/.hermes-bridge-token`).
