---
name: conexion-mqtt
description: "Conectar a un Enki vivo por MQTT (WebSocket Secure, 443) desde el repo 3enki. RPC ui/request → ui/response para leer proyectos, conversaciones y operar el sistema. Helper enki-rpc.js incluido."
version: 1.1.0
author: Hermes Agent
when-to-use: Cuando necesites leer o tocar el Enki vivo desde fuera del VPS o desde una sesión que no está en el VPS — proyectos, conversaciones, cartas, o cualquier RPC ui/request/{domain}/{action}.
---

# conexion-mqtt (3enki)

Hablar con un Enki **vivo** por MQTT. Adaptado de la skill original de 2enki para el repo 3enki.

## Transporte

```
wss://enki-ai.online/mqtt  (MQTT sobre WebSocket Secure, puerto 443)
```

El MQTT crudo (1883) está bloqueado en entornos cloud. Solo sale 443.

## Helper incluido

`enki-rpc.js` en esta carpeta. Requiere la dependencia `mqtt`:

```bash
cd ~/3enki
npm install mqtt --no-save --no-audit --no-fund

# Usar
export NODE_PATH="$PWD/node_modules"
node .claude/skills/conexion-mqtt/enki-rpc.js projects
node .claude/skills/conexion-mqtt/enki-rpc.js project nonina
node .claude/skills/conexion-mqtt/enki-rpc.js convs nonina
node .claude/skills/conexion-mqtt/enki-rpc.js reach nonina latest
```

## Comandos

| Comando | Descripción |
|---------|-------------|
| `projects` | Lista proyectos |
| `project <nombre\|id>` | Resuelve proyecto → UUID |
| `convs <proyecto>` | Conversaciones del proyecto |
| `reach <proyecto> [título\|latest]` | Proyecto → conversación → carga mensajes |
| `rpc <domain> <action> [json]` | RPC genérico |

## Patrón RPC

```
publish  ui/request/{domain}/{action}   { request_id, data:{…} }
listen   ui/response/{request_id}       → { request_id, status, data }
```

Para llegar a una conversación se encadenan 3 RPCs sobre la MISMA conexión:

```
project/list                         → resolver UUID por nombre
conversation/list  {project_id}      → elegir conversación
conversation/load  {project_id, id}  → mensajes completos
```

## Proyecto "1" (por defecto)

```bash
node .claude/skills/conexion-mqtt/enki-rpc.js project 1
node .claude/skills/conexion-mqtt/enki-rpc.js reach 1 latest
```

## ENV

- `ENKI_BROKER` / `AUDIT_BROKER` — default `wss://enki-ai.online/mqtt`
- `ENKI_RPC_TIMEOUT` — ms por RPC (default 12000)
