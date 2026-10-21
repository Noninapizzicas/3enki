---
name: enki-bridge-arquitectura
description: >-
  Arquitectura del puente Hermes↔Enki: motor-hermes (Rust), hermes-gateway (Node.js),
  dispatch MQTT, y los candados de code.orquestar/ejecutor. Cómo se comunican
  realmente los procesos y qué patrones MQTT funcionan.
when-to-use: >-
  Cuando necesites entender el flujo de una tool call desde Hermes a Enki, depurar
  un timeout de motor-hermes, configurar code.orquestar, o saber por qué un módulo
  de Enki no responde por MQTT.
tags:
  - enki
  - hermes
  - mqtt
  - bridge
  - motor-hermes
  - gateway
  - dispatch
---
# Enki Bridge Architecture — Puente Hermes ↔ Enki

## ⚠️ Lección cardinal: el EventBus NO es MQTT

El `EventBus` del core Enki (Node.js) es un **EventEmitter in-process**, NO un cliente
MQTT. Publicar `{toolName}` directo al broker Mosquitto (1883) **no llega a nadie**
porque ningún módulo subscribe topics planos por MQTT.

## Patrón MQTT que SÍ funciona: ui/request/{domain}/{action}

El core subscribe `ui/request/#` via `UIRequestHandler`. Cualquier módulo que registre
`ui_handlers` en su `module.json` recibe peticiones así:

```
publish   ui/request/{domain}/{action}   { request_id, data: {…} }
subscribe ui/response/{request_id}       → { request_id, status, success, data|error }
```

**Ejemplo:** `project.list` → publish `ui/request/project/list`, respuesta en
`ui/response/{request_id}`.

**Tools con handler en módulo (ruta directa):** `fs.read`, `credential.*`,
`code.orquestar` y las tools de dominio NO pasan por MQTT — son handlers in-process
en el `toolsRegistry` del core. Solo `hermes-gateway` (si está operativo) las expone
por MQTT en `hermes/tool/+`.

## motor-hermes (Rust)

Crate en `enki-sense/crates/motor-hermes/`. Bridge HTTP→MQTT en puerto **8130**.

**Build:**
```bash
cd ~/3enki/enki-sense && cargo build -p motor-hermes --release
```

**Service systemd:**
```
/etc/systemd/system/motor-hermes.service
```
Activo, ~700KB RAM, 2.9MB binary.

**Endpoints:**
- `POST /execute` — auth Bearer, body `{tool_name, args, context}`
- `GET /catalog` — auth Bearer, proxy al bridge Node.js o cache
- `GET /health` — sin auth

**Dispatch actual** (verificado funcionando): parsea `tool_name` con `split_once('.')`,
publica `ui/request/{domain}/{action}`, espera respuesta correlada por `request_id`
en `ui/response/#`.

**ENV:**
```
ENKI_BRIDGE_URL=http://localhost:8130
ENKI_BRIDGE_TOKEN=<token>
MOTOR_HERMES_BROKER=127.0.0.1
MOTOR_HERMES_PORT=8130
```

## hermes-gateway (Node.js)

Módulo en `modules/hermes-gateway/`. Expone el `toolsRegistry` del core por MQTT
en topics `hermes/tool/+` y `hermes/catalog`.

**Problema conocido:** `core.eventBus?.mqtt.isConnected` no existe en el cliente MQTT
de Enki. El gateway se salta si `isConnected` es `undefined`. Se parcheó la comprobación.

## Candados de code.orquestar

`code.orquestar` tiene **dos candados independientes**, ambos deben estar activos:

1. **Interruptor** en el panel de interruptores (evento `interruptor.cambiado`):
   ```python
   c.publish('interruptor.cambiado', json.dumps({"id": "code.orquestar", "enabled": True}))
   ```

2. **Flag de configuración** `blueprint_orquestar_enabled` en `config.json`:
   ```json
   "modules_config": {
     "ai-gateway": {
       "blueprint_orquestar_enabled": true
     }
   }
   ```
   Default: `false`. Sin esto, la tool `code.orquestar` no se ofrece al LLM.

## Candado de ejecutor (comandos shell)

El módulo `ejecutor` tiene un guard independiente (`_esPeligroso`) que bloquea
comandos que coinciden con patrones peligrosos aunque el interruptor esté ON.
El bloqueo pide `confirmado:true` por diseño.

## Cómo consultar Enki desde el chat

Usar **`node .claude/skills/conexion-mqtt/enki-rpc.js`** — no motor-hermes HTTP.
Paco prefiere el script MQTT directo para consultas ad-hoc.

```bash
cd ~/3enki && NODE_PATH="$PWD/node_modules" \
  node .claude/skills/conexion-mqtt/enki-rpc.js reach "Proyecto" latest
```

## Modo de depuración

1. Probar la tool directamente por MQTT con Python (bypassea guards):
   ```python
   import paho.mqtt.client as mqtt, json, uuid
   c = mqtt.Client(); c.connect('127.0.0.1', 1883, 60)
   rid = str(uuid.uuid4())
   c.subscribe(f'ui/response/{rid}')
   c.publish('ui/request/{domain}/{action}', json.dumps({"request_id": rid, "data": {…}}))
   ```

2. Verificar que el módulo está cargado en el bus:
   ```bash
   sudo journalctl -u enki --no-pager | grep "modules.loaded" | tail -1
   ```

3. Ver que el módulo escucha el evento correcto (debe coincidir el topic MQTT
   con el `subscribes[].event` del `module.json`).
