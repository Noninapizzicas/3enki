---
name: enki-motores
description: >-
  Motores Rust en enki-sense: cómo los binarios Rust (motor-ojo, motor-hermes,
  motor-coherencia, etc.) se integran con Enki vía MQTT. Patrones de dispatch,
  suscripción a eventos, request/response correlado, y gotchas del EventBus
  in-process del core.
version: 0.1.0
author: Hermes Agent
when-to-use: >
  Cuando trabajes con cualquiera de los motores Rust de enki-sense (motor-hermes,
  motor-coherencia, motor-ojo, motor-oido, motor-voz, motor-traduce, etc.)
  o necesites entender cómo un proceso externo habla con Enki por MQTT.
tags:
  - enki
  - rust
  - mqtt
  - motores
  - enki-sense
---
# Motores Rust de enki-sense

Los motores son binarios Rust independientes que viven en el workspace
`enki-sense/crates/` y se comunican con Enki exclusivamente por MQTT.

## Inventario de motores

| Motor | Descripción | Tópicos MQTT |
|-------|-------------|--------------|
| motor-ojo | Renderizado/visión | — |
| motor-oido | Audio/transcripción | — |
| motor-voz | Síntesis de voz | — |
| motor-traduce | Traducción | — |
| motor-sonido | Procesamiento de sonido | — |
| motor-trazo | Interpretación de trazo/dibujo | — |
| motor-coherencia | Juez de coherencia de escrituras | `fs.write.request`, `fs.write.response`, `fs.read.request`, `fs.read.response` |
| motor-hermes | Bridge HTTP→MQTT para tools de Enki | `ui/request/{domain}/{action}`, `ui/response/{request_id}` |

## Patrón de dispatch (lo que importa)

### 1. El EventBus del core NO es MQTT

El `EventBus` en el core Node.js es un **EventEmitter in-process**. NO es un
cliente MQTT. Los eventos publicados al broker MQTT (puerto 1883) NO llegan
al `EventBus` interno del core a menos que un módulo Node.js los suscriba
explícitamente.

### 2. Dos caminos para invocar tools

**Camino A — UIRequestHandler** (funciona desde fuera del core):
```
publish   ui/request/{domain}/{action}   { request_id, data:{…} }
subscribe ui/response/{request_id}       → { request_id, status, success, data }
```
El core tiene un `UIRequestHandler` que escucha `ui/request/#` por MQTT y
despacha a los handlers registrados en `moduleLoader.toolsRegistry`. Es el
mismo patrón que usa el frontend Svelte. **Este es el camino que funciona
para procesos externos** (motor-hermes, enki-movil, scripts Python).

**Camino B — hermes-bridge._dispatch()** (solo dentro del core):
El módulo `hermes-bridge` tiene 3 rutas de dispatch:
1. **Bus universal** — `bus.publish` / `bus.publishAndWait` (usa el EventBus in-process)
2. **Ruta directa** — handler en el módulo cargado (fs.read, credential.*, etc.)
3. **Bus fallback** — publica `{toolName}` y espera `{toolName}.response`

Los caminos 2 y 3 solo existen dentro del proceso Node.js. Para acceder a
ellos desde fuera, se necesita **hermes-gateway**.

### 3. hermes-gateway (puente)

Módulo Node.js (~127 líneas) que se carga en el core. Escucha `hermes/tool/+`
por MQTT y delega en `hermes-bridge._dispatch()`. Expone todo el toolsRegistry
al broker MQTT.

**Cuidado**: `core.eventBus?.mqtt` puede ser `undefined` — el eventBus no expone
el cliente MQTT como propiedad directa. El gateway usa este acceso; si falla,
se salta sin cargar.

El gateway **no es necesario** si usas el Camino A (UIRequestHandler) desde
tu motor Rust.

## motor-hermes (el caso concreto)

### Arquitectura
```
HTTP POST /execute (puerto 8130)
  → motor-hermes (Rust, ~3MB binary, ~700KB RAM)
    → MQTT publish ui/request/{domain}/{action}
    → MQTT subscribe ui/response/{request_id}
    → HTTP response
```

### Componentes del crate

| Archivo | Propósito |
|---------|-----------|
| `main.rs` | Punto de entrada: config, MQTT connect, axum router, graceful shutdown |
| `config.rs` | Config desde env vars con defaults (puerto, broker, timeouts) |
| `bridge.rs` | Handlers axum: execute, catalog, health |
| `dispatch.rs` | Dispatcher MQTT: execute(), request_catalog(), route_response() |
| `auth.rs` | TokenStore + middleware de autenticación Bearer |

### Parseo de tool names

`confluencia.resolver_pedido` → `splitn(2, '.').collect()` → domain=`confluencia`,
action=`resolver_pedido` → topic=`ui/request/confluencia/resolver_pedido`.

**OJO**: los `ui_handlers` en `module.json` pueden registrar acciones con punto
(ej. `"resolver.pedido"` en vez de `"resolver_pedido"`). El registro en
UIRequestHandler usa `${domain}.${action}` como key. Si el action tiene punto,
el split en Rust da otro resultado. Mantener consistencia: usar guión bajo.

### Timeouts

| Tool | Timeout |
|------|---------|
| Default | 15s |
| `code.orquestar` | 65s |
| `invoke_agent` | 300s |

### Catálogo de tools

motor-hermes obtiene el catálogo por HTTP proxy al hermes-bridge Node.js
(`http://localhost:3000/modules/hermes-bridge/catalog`), no por MQTT. El
catálogo se cachea con TTL configurable (default 60s).

## Interruptores (control en caliente)

Se controlan publicando al MQTT:
```
interruptor.cambiado  { id: "ejecutor", enabled: true/false }
interruptor.cambiado  { id: "code.orquestar", enabled: true/false }
```

**code.orquestar** tiene ADEMÁS un flag de configuración
`blueprint_orquestar_enabled` en `ai-gateway/module.json` (default `false`).
Se activa en `config.json` > `modules_config.ai-gateway.blueprint_orquestar_enabled: true`.
Requiere reinicio de Enki.

**ejecutor** tiene un guard de seguridad (HARDLINE → PELIGROSO → allowlist).
Los comandos peligrosos (curl|sh, rm -r, sudo) piden `confirmado:true` del
canal humano. Se puede bypassear editando el módulo para omitir el chequeo
de peligrosidad.

## Config.json en deploy

El `config.json` de `/opt/enki/` solo tiene `modules_config` para
`hermes-relay` y `portal`. Cualquier configuración adicional de módulos
(ai-gateway, etc.) hay que añadirla manualmente. El repo y deploy deben
estar sincronizados.

## Service systemd

Los motores tienen su propio unit systemd:
```
/etc/systemd/system/motor-hermes.service
```

Usan `WorkingDirectory=/opt/enki`, `User=admin`, `Group=admin`.
El token de auth (`data/.hermes-bridge-token`) debe ser legible por el
usuario del servicio.
