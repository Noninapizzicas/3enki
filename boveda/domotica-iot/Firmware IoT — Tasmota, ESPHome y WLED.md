---
tipo: referencia
sector: domotica-iot
tags: [tasmota, esphome, wled, firmware, esp32, esp8266, iot]
---
# Firmware IoT — Tasmota, ESPHome y WLED

Los tres firmwares open-source dominantes para ESP32/ESP8266 en domótica.

## Comparativa

| | Tasmota (24.6k stars) | ESPHome (9k+ stars) | WLED (15k+ stars) |
|---|---|---|---|
| **Enfoque** | Firmware genérico, config por web | Firmware declarativo (YAML→binario) | Control de LEDs direccionables |
| **Configuración** | Web UI + comandos de consola | YAML compilado | Web UI + app |
| **Integración HA** | MQTT (auto-discovery) | API nativa (mejor) o MQTT | MQTT o API nativa |
| **Dispositivos** | Enchufes, relés, sensores, motores | Cualquier ESP32/8266 | Tiras LED WS2812, SK6812 |
| **Flash inicial** | Web (tasmota.github.io/install) | Desde HA add-on o CLI | Web (install.wled.me) |
| **OTA** | Sí (web o HTTP) | Sí (desde HA o CLI) | Sí (web) |
| **Ideal para** | Dispositivos comerciales reflasheados | Proyectos DIY con sensores | Iluminación LED |

## Tasmota

### Dispositivos comerciales compatibles (reflashear)

| Dispositivo | Tipo | Precio |
|---|---|---|
| Sonoff Basic/Mini | Relé WiFi | $4–$8 |
| Sonoff TH16 | Relé + sensor temp/hum | $8–$12 |
| Sonoff POW R3 | Relé con medidor de potencia | $12–$18 |
| Tuya/SmartLife genéricos | Enchufes, bombillas | $5–$15 |
| Shelly 1/Plus | Relé (Tasmota o firmware propio) | $10–$15 |

### Comandos útiles

| Comando | Función |
|---|---|
| `Status 0` | Estado completo del dispositivo |
| `Power ON/OFF/TOGGLE` | Control del relé |
| `SetOption19 1` | Activar MQTT auto-discovery para HA |
| `Backlog` | Ejecutar múltiples comandos en secuencia |
| `Template {"NAME":"..."}` | Definir pinout personalizado |

## ESPHome

### Ejemplo YAML (sensor de temperatura + relé)

```yaml
esphome:
  name: sensor-cocina

esp32:
  board: esp32dev

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

api:

sensor:
  - platform: dht
    pin: GPIO4
    model: DHT22
    temperature:
      name: "Cocina Temperatura"
    humidity:
      name: "Cocina Humedad"
    update_interval: 60s

switch:
  - platform: gpio
    pin: GPIO5
    name: "Cocina Ventilador"
```

### Ventajas de ESPHome sobre Tasmota

- **Tipado**: YAML con validación — errores en compilación, no en runtime
- **API nativa**: comunicación binaria directa con HA (más eficiente que MQTT)
- **Componentes**: 200+ plataformas de sensores documentadas
- **OTA desde HA**: actualizar firmware sin tocar el dispositivo
- **Lambda**: código C++ inline para lógica personalizada

## WLED

### Características

| Aspecto | Detalle |
|---|---|
| **LEDs soportados** | WS2812B, SK6812, APA102, WS2801, y 20+ más |
| **Efectos** | 100+ efectos integrados |
| **Segmentos** | Dividir tira en zonas independientes |
| **Presets** | Guardar y llamar configuraciones |
| **Sincronización** | Múltiples controladores WLED sincronizados |
| **Audio reactivo** | Con micrófono (WLED fork AudioReactive) |
| **Control** | Web UI, app (iOS/Android), MQTT, API JSON, Alexa, HA |

### Hardware típico

| Componente | Detalle | Coste |
|---|---|---|
| ESP32 (DevKit) | Controlador | $3–$5 |
| WS2812B (5m, 60 LED/m) | Tira LED | $10–$20 |
| Fuente 5V | 60 LED/m × 60 mA/LED = 18 A para 5m | $8–$15 |
| Level shifter (3.3→5V) | SN74AHCT125 o similar | $1 |
| Capacitor 1000 µF | Protección de la tira | $0.50 |

### Cableado

```
ESP32 GPIO16 → Level Shifter → Data IN (tira LED)
Fuente 5V    → VCC tira + ESP32 (via regulador o USB)
GND común    → ESP32 + tira + fuente
```

→ Hub central: [[Home Assistant — el hub open-source]]
→ MQTT: [[MQTT en domótica — brokers y patrones]]
