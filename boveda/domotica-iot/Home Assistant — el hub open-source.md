---
tipo: referencia
sector: domotica-iot
tags: [home-assistant, domotica, automatizacion, integraciones, dashboard]
---
# Home Assistant — el hub open-source

Home Assistant (87.8k stars) es la plataforma de domótica open-source dominante. Integra dispositivos de cualquier fabricante en un solo dashboard con automatizaciones locales.

## Arquitectura

```
Dispositivos (sensores, luces, switches)
    ↓ (Zigbee, Z-Wave, WiFi, BLE, MQTT)
Home Assistant Core (Python)
    ├─ Integraciones (2.800+)
    ├─ Automatizaciones (YAML o UI)
    ├─ Dashboard (Lovelace)
    └─ Add-ons (Mosquitto, Node-RED, ESPHome, etc.)
    ↓
Interfaz web / app móvil
```

## Métodos de instalación

| Método | Plataforma | Ideal para |
|---|---|---|
| **Home Assistant OS** | RPi 4/5, NUC, VM | Principiantes (todo incluido) |
| **Container** | Docker en cualquier Linux | Usuarios avanzados |
| **Core** | Python venv | Desarrolladores |
| **Supervised** | Debian 12 | Docker + add-ons en hardware propio |

## Integraciones clave para maker

| Integración | Función | Protocolo |
|---|---|---|
| **MQTT** | Comunicación con dispositivos DIY | MQTT (Mosquitto) |
| **ESPHome** | Firmware declarativo para ESP32/ESP8266 | WiFi/API nativa |
| **Zigbee (ZHA / Z2M)** | Red mesh de bajo consumo (bombillas, sensores) | Zigbee |
| **Z-Wave** | Red mesh fiable (cerraduras, termostatos) | Z-Wave |
| **Bluetooth** | Sensores BLE (Xiaomi, iBeacon) | BLE |
| **Tasmota** | Firmware para enchufes/relés WiFi | MQTT |

## Automatizaciones

### Estructura básica (YAML)

```yaml
automation:
  - alias: "Encender luces al atardecer"
    trigger:
      - platform: sun
        event: sunset
        offset: "-00:30:00"
    condition:
      - condition: state
        entity_id: person.usuario
        state: "home"
    action:
      - service: light.turn_on
        target:
          area_id: salon
        data:
          brightness_pct: 70
          color_temp: 350
```

### Tipos de trigger

| Trigger | Ejemplo |
|---|---|
| **Estado** | Sensor cambia de `off` a `on` |
| **Numérico** | Temperatura supera 25°C |
| **Tiempo** | Cada día a las 07:00 |
| **Sol** | Amanecer, atardecer (con offset) |
| **Zona** | Persona entra/sale de zona GPS |
| **MQTT** | Mensaje recibido en topic |
| **Webhook** | HTTP POST externo |

## Dashboard (Lovelace)

| Tarjeta | Uso |
|---|---|
| **Entities** | Lista de entidades con estado |
| **Gauge** | Indicador circular (temperatura, humedad) |
| **History graph** | Gráfica temporal |
| **Mushroom** | Cards modernas (custom, la más popular) |
| **Button** | Accionar un servicio |
| **Map** | Localización de personas/dispositivos |

## Add-ons esenciales

| Add-on | Función |
|---|---|
| **Mosquitto** | Broker MQTT integrado |
| **ESPHome** | Compilar y flashear firmwares ESP32 desde HA |
| **Node-RED** | Automatizaciones visuales (flujos) |
| **File editor** | Editar YAML desde el navegador |
| **Samba** | Acceso a archivos de configuración por red |
| **Let's Encrypt** | Certificado HTTPS gratuito |
| **InfluxDB + Grafana** | Historial largo + dashboards avanzados |

## Zigbee vs WiFi vs Z-Wave

| Aspecto | Zigbee | WiFi | Z-Wave |
|---|---|---|---|
| **Consumo** | Bajo (batería años) | Alto (red eléctrica) | Bajo |
| **Mesh** | Sí (dispositivos se repiten) | No | Sí |
| **Alcance** | 10–20 m (mesh extiende) | 30–50 m | 30 m |
| **Dispositivos** | Sensores, bombillas, contactos | Enchufes, cámaras, relés | Cerraduras, termostatos |
| **Coordinador** | Dongle USB ($15–$30) | Router WiFi existente | Dongle USB ($30–$50) |
| **Estándar** | Abierto (muchas marcas) | Abierto | Propietario (Silicon Labs) |
| **DIY** | CC2652 / EFR32 módulos | ESP32 / ESP8266 | Difícil (chip propietario) |

→ Firmware para ESP32: [[Firmware IoT — Tasmota, ESPHome y WLED]]
→ MQTT: [[MQTT en domótica — brokers y patrones]]
