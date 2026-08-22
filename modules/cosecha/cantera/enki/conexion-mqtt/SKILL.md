---
name: conexion-mqtt
description: "Conectar a un Enki vivo por MQTT (WebSocket Secure, 443) desde el repo 3enki. RPC ui/request → ui/response para leer proyectos, conversaciones y operar el sistema."
version: 1.1.0
author: Hermes Agent
when-to-use: |
  Cuando necesites leer o tocar el Enki vivo desde fuera del VPS o desde una sesión
  que no está en el VPS — proyectos, conversaciones, cartas, o cualquier RPC
  ui/request/{domain}/{action}.
tags:
  - enki
  - mqtt
  - rpc
  - claude
# Repo origen: ~/3enki/.claude/skills/conexion-mqtt/
# Helper: enki-rpc.js
---
# conexion-mqtt (cantera)

Hablar con un Enki **vivo** por MQTT. Skill originaria de Claude Code en `~/3enki/.claude/skills/conexion-mqtt/`.

## Transporte

```
wss://enki-ai.online/mqtt  (MQTT sobre WebSocket Secure, puerto 443)
```

El MQTT crudo (1883) está bloqueado en entornos cloud. Solo sale 443.

## Helper

`enki-rpc.js` — ver `~/3enki/.claude/skills/conexion-mqtt/enki-rpc.js`

Requiere `mqtt` npm:
```bash
cd ~/3enki && npm install mqtt --no-save --no-audit --no-fund
export NODE_PATH="$PWD/node_modules"
node .claude/skills/conexion-mqtt/enki-rpc.js projects
```

## Comandos del helper

| Comando | Descripción |
|---------|-------------|
| `projects` | Lista proyectos |
| `project <nombre\|id>` | Resuelve proyecto → UUID |
| `convs <proyecto>` | Conversaciones del proyecto |
| `reach <proyecto> [título\|latest]` | Carga mensajes |
| `rpc <domain> <action> [json]` | RPC genérico |

## Patrón RPC

```
publish  ui/request/{domain}/{action}   { request_id, data:{…} }
listen   ui/response/{request_id}       → { request_id, status, data }
```

## ENV

- `ENKI_BROKER` / `AUDIT_BROKER` — default `wss://enki-ai.online/mqtt`
- `ENKI_RPC_TIMEOUT` — ms por RPC (default 12000)

## Ubicación original

La fuente de verdad es **`~/3enki/.claude/skills/conexion-mqtt/`** — cualquier modificación de `enki-rpc.js` debe hacerse allí. Esta copia en cantera es el mirror para que Hermes la descubra como skill.
