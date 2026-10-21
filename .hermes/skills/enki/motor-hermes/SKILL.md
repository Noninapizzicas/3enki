---
name: motor-hermes
description: "Bridge Hermes ↔ Enki en Rust. Sustituye hermes-relay + hermes-bridge + enki_tools (Python). Binario ~3MB, ~700KB RAM, service systemd en :8130. Conecta HTTP (desde Hermes Python) → MQTT directo al bus Enki. NO depende del core Node.js."
version: 0.1.0
author: Hermes Agent
when-to-use: |
  Cuando necesites diagnosticar, extender o depurar el puente entre Hermes y Enki.
  También cuando veas errores UPSTREAM_TIMEOUT, HANDLER_NOT_FOUND o MQTT de motor-hermes.
tags:
  - enki
  - rust
  - mqtt
  - bridge
  - motor
---
# motor-hermes — Bridge Hermes↔Enki (Rust)

## Arquitectura

```
Hermes Python (:8642) → HTTP POST → motor-hermes Rust (:8130) → MQTT → Bus Enki
                                                    ↑                              ↓
                                              (recibe respuesta)         (UIRequestHandler)
```

## Endpoints

| Endpoint | Auth | Descripción |
|----------|------|-------------|
| `POST /execute` | Bearer token | Ejecuta una tool por nombre. Body: `{tool_name, args, context?}` |
| `GET /catalog` | Bearer token | Catálogo de tools OpenAI function-calling (proxy a hermes-bridge) |
| `GET /health` | No | Health check |

## Patrón MQTT real (el que funciona)

```
publish   ui/request/{domain}/{action}   → { request_id, data: { ... } }
subscribe ui/response/{request_id}       → { request_id, status, success, data|error }
```

⚠️ **CRÍTICO**: El `EventBus` del core Node.js es **EventEmitter in-process**, NO MQTT. Publicar `{toolName}` directo al broker NO llega a ningún módulo. El camino que funciona es `ui/request/{domain}/{action}` que el `UIRequestHandler` subscribe por MQTT.

## Parseo de tool names

El tool `confluencia.resolver_pedido` se parsea como:
- domain = `confluencia`
- action = `resolver_pedido`

Pero el `module.json` puede registrar el action como `resolver.pedido` (con punto). En ese caso el topic MQTT es `ui/request/confluencia/resolver.pedido`. El split usa el **primer punto** para separar domain del resto.

## Herramientas que NO pasan por MQTT (ruta directa in-process)

- `fs.read`, `fs.write` — handlers directos del módulo filesystem
- `credential.*` — registro de credenciales
- `code.orquestar` — ejecución de código
- Tools de dominio con handler en módulo

Solo se ejecutan desde dentro del core Node.js. Para exponerlas al bus hace falta un módulo que suscriba un tópico y delegue a `bridge._dispatch()`.

## code.orquestar — cómo se activa

NO es un interruptor (no se controla por `interruptor.cambiado`). Su flag vive en:

```json
// config.json → modules_config.ai-gateway.blueprint_orquestar_enabled
// default: false
{
  "modules_config": {
    "ai-gateway": {
      "blueprint_orquestar_enabled": true
    }
  }
}
```

## Interruptores (SÍ se controlan por MQTT)

Publicar `interruptor.cambiado` con payload `{id, enabled}`. Ejemplo `ejecutor`.

## Ubicación en el repo

```
enki-sense/crates/motor-hermes/
├── Cargo.toml
├── src/
│   ├── main.rs       — entry point, MQTT connect + axum server
│   ├── auth.rs       — TokenStore, auth middleware
│   ├── bridge.rs     — HTTP handlers (execute, catalog, health)
│   ├── config.rs     — Config from env vars
│   └── dispatch.rs   — MQTT dispatch + pending map + route_response
```

## Deploy

- Service: `/etc/systemd/system/motor-hermes.service`
- Binary: `/opt/enki/enki-sense/target/release/motor-hermes` (~2.9MB)
- Working dir: `/opt/enki`
- Token: `data/.hermes-bridge-token` (644, compartido con hermes-bridge)
- RAM: ~700KB (vs 400MB+ del core Node.js)

## Errores comunes

| Error | Causa |
|-------|-------|
| `UPSTREAM_TIMEOUT` | Tool no responde. Motivos: módulo no cargado, topic incorrecto, timeout insuficiente |
| `HANDLER_NOT_FOUND` | `ui/request/{domain}/{action}` no tiene handler registrado en UIRequestHandler |
| `MQTT_ERROR` | Fallo de publish al broker (conexión caída) |
| `token: cannot read token file` | Permisos del fichero token o `WorkingDirectory` incorrecto |
