---
tipo: referencia
sector: domotica-iot
tags: [mqtt, broker, mosquitto, domotica, iot, patrones]
---
# MQTT en domótica — brokers y patrones

MQTT es el protocolo de transporte dominante en IoT y domótica: ligero, pub/sub, pensado para conexiones inestables y dispositivos con recursos limitados.

## Brokers

| Broker | Tipo | Caso de uso |
|---|---|---|
| **Mosquitto** | Open-source (Eclipse) | El estándar. Add-on de HA, embebible |
| **EMQX** | Open-source (Erlang) | Alta disponibilidad, clustering, millones de conexiones |
| **NanoMQ** | Open-source (C) | Ultra-ligero, embebido, edge |
| **HiveMQ CE** | Open-source (Java) | Enterprise features, extensible |
| **Aedes** | Open-source (Node.js) | Embebible en aplicaciones JS (como Enki) |

### Mosquitto — configuración típica para domótica

```
# /etc/mosquitto/mosquitto.conf
listener 1883
allow_anonymous false
password_file /etc/mosquitto/passwd
persistence true
persistence_location /var/lib/mosquitto/

# WebSocket (para dashboards web)
listener 9001
protocol websockets
```

## Convenciones de topics en domótica

### Homie Convention (estándar de facto)

```
homie/<device-id>/<node-id>/<property>
homie/<device-id>/$state         → ready / lost / sleeping
homie/<device-id>/$name          → "Sensor Cocina"
homie/<device-id>/temperature/°C → 23.5

# Ejemplo completo:
homie/sensor-cocina/temperature/degrees → 23.5  (retain: true)
homie/sensor-cocina/humidity/percent    → 65     (retain: true)
homie/sensor-cocina/$state              → ready  (retain: true)
```

### Home Assistant MQTT Discovery

HA descubre dispositivos automáticamente por topics de configuración:

```
homeassistant/sensor/cocina_temp/config → {
  "name": "Cocina Temperatura",
  "state_topic": "home/cocina/temperature",
  "unit_of_measurement": "°C",
  "device_class": "temperature",
  "unique_id": "cocina_temp_001"
}

home/cocina/temperature → 23.5
```

## Patrones MQTT para IoT

### 1. Telemetría (sensor → broker → dashboard)

```
Topic:   sensors/<location>/<type>
QoS:     0 (telemetría tolerante a pérdida)
Retain:  true (último valor siempre disponible)
Payload: {"value": 23.5, "unit": "°C", "ts": 1719849600}
```

### 2. Comando (dashboard → broker → actuador)

```
Topic:   devices/<device-id>/cmd
QoS:     1 (al menos una vez)
Retain:  false (comandos no se re-ejecutan)
Payload: {"action": "set", "property": "power", "value": "on"}
```

### 3. Estado (actuador → broker → dashboard)

```
Topic:   devices/<device-id>/state
QoS:     1
Retain:  true (estado siempre disponible)
Payload: {"power": "on", "brightness": 80}
```

### 4. Last Will and Testament (detección de desconexión)

```
Al conectar, el dispositivo registra:
  Will topic:   devices/<id>/$state
  Will payload: "lost"
  Will retain:  true

Al conectar exitosamente, publica:
  devices/<id>/$state → "online" (retain: true)

Si el dispositivo se desconecta sin avisar:
  El broker publica el will → "lost" automáticamente
```

## QoS en domótica

| QoS | Garantía | Uso típico |
|---|---|---|
| **0** | Fire-and-forget | Telemetría frecuente (temperatura cada 10s) |
| **1** | Al menos una entrega | Comandos, estados, alertas |
| **2** | Exactamente una entrega | Raro en domótica (overhead alto) |

Recomendación práctica: QoS 1 por defecto. QoS 0 solo para datos redundantes de alta frecuencia.

## Seguridad

| Capa | Implementación |
|---|---|
| **Autenticación** | Usuario/password (Mosquitto passwd) o certificados X.509 |
| **Cifrado** | TLS (puerto 8883) |
| **Autorización** | ACL por usuario/topic (Mosquitto acl_file) |
| **Red** | MQTT solo en red local o VPN (nunca exponer al internet) |

→ Home Assistant: [[Home Assistant — el hub open-source]]
→ Firmware que habla MQTT: [[Firmware IoT — Tasmota, ESPHome y WLED]]
→ Gateway RF→MQTT: [[OpenMQTTGateway — puente RF a MQTT]]
→ MQTT en Enki: ver rebanada `arquitectura/cabecera/core/nucleo.md`
