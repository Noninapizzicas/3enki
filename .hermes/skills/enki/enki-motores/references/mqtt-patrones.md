# Referencia rápida de tópicos MQTT para motores externos

## UIRequestHandler (camino que funciona desde fuera del core)

```
publish   ui/request/{domain}/{action}   { request_id, data:{…} }
subscribe ui/response/{request_id}       → { request_id, status, success, data|error }
```

Ejemplo: `ui/request/project/list` → respuesta en `ui/response/{uuid}`.

## EventBus in-process del core (NO es MQTT)

El EventBus es EventEmitter. No recibe publicaciones del broker MQTT a menos
que un módulo Node.js las suscriba. Esto es fuente frecuente de confusión.

## hermes-gateway (puente opcional)

Si necesitas acceder a las rutas directas de hermes-bridge._dispatch() desde
fuera, el gateway las expone por MQTT en `hermes/tool/+`. Pero cuidado:
`core.eventBus?.mqtt` puede ser undefined.

## Ejemplo funcional (Python)

```python
import paho.mqtt.client as mqtt, json, time, uuid

c = mqtt.Client()
c.connect('127.0.0.1', 1883, 60)
c.loop_start()

rid = str(uuid.uuid4())
resp = {}
def on_msg(c_, u, m): resp[m.topic] = m.payload
c.on_message = on_msg
c.subscribe(f'ui/response/{rid}', qos=1)
time.sleep(0.3)

c.publish('ui/request/project/list', json.dumps({"request_id": rid, "data": {}}), qos=1)
time.sleep(3)
c.loop_stop()
# resp tiene la respuesta
```

## Tópicos de interruptores

```
interruptor.cambiado  { id: "ejecutor", enabled: true/false }
interruptor.cambiado  { id: "code.orquestar", enabled: true/false }
```

## Config extra en modules_config

`ai-gateway`: `blueprint_orquestar_enabled: true` para activar code.orquestar.
Requiere entrada en `config.json > modules_config.ai-gateway` y reinicio de Enki.
