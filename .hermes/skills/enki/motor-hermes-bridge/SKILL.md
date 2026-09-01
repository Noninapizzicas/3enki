---
name: motor-hermes-bridge
description: "Bridge Hermes↔Enki en Rust (motor-hermes) + gateway Node.js (hermes-gateway). Patrón MQTT real, dispatch de tools, bloqueos de code.orquestar, build frontend SvelteKit."
version: 1.0.0
when-to-use: |
  Cuando necesites conectar Hermes con Enki por MQTT, debuggear el dispatch
  de tools, activar code.orquestar, o hacer build del frontend SvelteKit.
tags: [enki, mqtt, motor-hermes, hermes-gateway, sveltekit]
---
# motor-hermes bridge — Conexión Hermes ↔ Enki

## Patrón MQTT real (verificado contra el bus)

**NO** publicar directo a `{toolName}`. El EventBus del core Node.js es un
EventEmitter **in-process** que NO escucha MQTT.

**SÍ** publicar como UI request:
```
publish   ui/request/{domain}/{action}   { request_id, data: {…} }
subscribe ui/response/{request_id}       → { status, success, data|error }
```

## motor-hermes (Rust, enki-sense)

- Crate en `enki-sense/crates/motor-hermes/`
- 3 endpoints: `POST /execute` (auth Bearer), `GET /catalog` (auth), `GET /health`
- Dispatch: parsea `tool_name.rfind('.')` → domain + action → `ui/request/{domain}/{action}`
- Suscribe `ui/response/#` para capturar respuestas correladas por `request_id`
- Token: `data/.hermes-bridge-token` o env `ENKI_BRIDGE_TOKEN`
- Timeouts según tool: 15s default, 65s `code.orquestar`, 300s `invoke_agent`
- **Service systemd**: `/etc/systemd/system/motor-hermes.service`
- **Release binary**: ~2.9MB, ~700KB RAM en runtime

## hermes-gateway (módulo Node.js en el core)

- Expone todo el `toolsRegistry` de Enki por MQTT
- Subscribe `hermes/tool/+`, delega dispatch a `hermes-bridge._dispatch()`
- Responde por `hermes/response/{request_id}`
- **Quirk**: `core.eventBus?.mqtt.isConnected` puede ser undefined.
  Usar: `typeof mqtt.isConnected === 'boolean' && !mqtt.isConnected`

## Visibilidad de módulos en el chat

Un módulo que subscribe eventos MQTT directos (ej. `confluencia.resolver_pedido.request`)
NO aparece en `detalle_capacidad` ni `buscar_capacidad`. Para que el chat lo vea
como tool invocable, debe registrar `ui_handlers` en su `module.json`.

Si ves `HANDLER_NOT_FOUND` en `ui/request/{domain}/{action}`, el módulo
no está en UIRequestHandler — pero puede estar funcionando en el bus igualmente.

## code.orquestar — dos llaves de bloqueo

Para que `code.orquestar` funcione en el chat se necesitan AMBAS:

1. **Interruptor en caliente** (por MQTT):
   ```
   publish interruptor.cambiado { id: "code.orquestar", enabled: true }
   ```
2. **Config en frío** en `config.json` → `modules_config`:
   ```json
   "ai-gateway": {
     "blueprint_orquestar_enabled": true
   }
   ```
   Default: `false`. Se lee al arrancar. Sin esto la tool se ofrece al LLM
   pero falla con `CAPABILITY_DISABLED`.

## Frontend build (SvelteKit)

```bash
# Limpiar caché (propietario www-data — necesita sudo)
sudo rm -rf /opt/enki/frontend/.svelte-kit /opt/enki/frontend/node_modules/.vite

# O reasignar permisos
sudo chown -R admin:www-data /opt/enki/frontend/.svelte-kit/ /opt/enki/frontend/node_modules/.vite/

# Build (tarda ~4 min)
cd /opt/enki/frontend && npm run build

# Reiniciar servicio
sudo systemctl restart enki-frontend
```

## Caminos de publicación de carta digital

| Ruta | Origen | Estado |
|------|--------|--------|
| `/shop/<slug>` | Plantilla tienda genérica | `storage/tienda/bundle/` |
| `/a/<slug>` | Carta marketing + personalización | `storage/www/` (verificador visual puede bloquear) |

El preview en workbar usa `/shop/<slug>`. La carta real (con marketing) va a
`/a/<slug>` y puede ser bloqueada por el verificador visual
(`verificacion-visual.failed` → overflow_móvil / diseño faltante).
