---
name: enki-mqtt-dispatch
description: "Cómo conectar procesos externos (Rust, Python, Node.js) al bus MQTT de Enki para invocar tools. Patrones que funcionan vs. patrones que fallan, dispatch via ui/request/{domain}/{action}, y despliegue de motores Rust en el VPS."
version: 1.0.0
author: Hermes Agent
when-to-use: |
  Cuando necesites que un proceso externo (motor Rust, script Python, enki-movil)
  invoque tools de Enki por MQTT. También cuando despliegues un motor Rust
  (enki-sense) en el VPS con systemd.
tags:
  - enki
  - mqtt
  - dispatch
  - motor
  - deployment
---
# Enki MQTT Dispatch — conexión de procesos externos al bus

## Patrón que funciona: ui/request/{domain}/{action}

El `UIRequestHandler` del core Node.js subscribe `ui/request/#` por MQTT y
despacha a los handlers registrados. Cualquier proceso externo puede invocar
tools usando este patrón:

```
publish   ui/request/{domain}/{action}   { request_id, data:{…} }
subscribe ui/response/{request_id}       → respuesta correlada
```

Donde `{domain}` y `{action}` se obtienen del toolName con formato `domain.action`
(ej. `project.list` → domain=`project`, action=`list`).

### Payload de respuesta (UIRequestHandler)

```json
{
  "request_id": "uuid",
  "status": 200,
  "success": true,
  "data": { "...": "..." },
  "timestamp": "ISO"
}
```

En caso de error:
```json
{
  "request_id": "uuid",
  "status": 404,
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "..." },
  "timestamp": "ISO"
}
```

## Patrones que NO funcionan

- **Publicar directo al toolName** (`project.list` como topic) — el EventBus del
  core es EventEmitter in-process, no escucha MQTT.
- **`hermes/tool/+`** via hermes-gateway — el módulo Node.js se salta si
  `core.eventBus?.mqtt?.isConnected` es undefined (lo es en el ciclo de carga).

## motor-hermes (Rust en enki-sense)

Bridge HTTP→MQTT en :8130. Recibe POST /execute de Hermes Python y despacha
al bus MQTT usando el patrón `ui/request/{domain}/{action}`.

### Despliegue en VPS

```bash
# Build release
cd /home/admin/3enki/enki-sense
cargo build -p motor-hermes --release

# Copiar binary
sudo systemctl stop motor-hermes
sudo cp target/release/motor-hermes /opt/enki/enki-sense/target/release/
sudo systemctl start motor-hermes

# Service systemd en /etc/systemd/system/motor-hermes.service
# WorkingDirectory=/opt/enki
# User=admin, Group=admin
# ENVs: ENKI_BRIDGE_TOKEN, MOTOR_HERMES_BROKER, MOTOR_HERMES_PORT, RUST_LOG
```

### Verificación

```bash
curl -s http://localhost:8130/health
curl -s -X POST http://localhost:8130/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool_name":"project.list","args":{}}'
```

### Peligros conocidos

- **Token file permission**: motor-hermes lee `data/.hermes-bridge-token`.
  Si el fichero es `www-data:www-data` con permisos 600, `admin` no puede
  leerlo. Soluciones: (a) `chmod 644` al fichero, (b) inyectar
  `ENKI_BRIDGE_TOKEN` en el service systemd.
- **WorkingDirectory**: si es `/opt/enki`, el token se busca en
  `/opt/enki/data/.hermes-bridge-token`.
- **Release build en /opt/enki falla por permisos**: buildear en el repo
  (`/home/admin/3enki/`) y copiar el binary.

## Catálogo

Motor-hermes proxy el catálogo desde `hermes-bridge` (Node.js :3000) por HTTP
cuando se lo piden. Cache TTL configurable.
