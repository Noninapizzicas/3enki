---
tipo: referencia
sector: domotica-iot
tags: [openmqttgateway, gateway, rf, ble, mqtt, 433mhz, zigbee]
---
# OpenMQTTGateway — puente RF a MQTT

OpenMQTTGateway (3.5k+ stars) convierte un ESP32 en una pasarela multi-protocolo: recibe señales RF, BLE, IR y las publica como mensajes MQTT.

## Concepto

```
Sensores RF 433MHz ─┐
Sensores BLE ───────┤
Mandos IR ──────────┼→ ESP32 (OpenMQTTGateway) → MQTT → Home Assistant
Sensores LoRa ──────┤
Lectores RFID ──────┘
```

Un solo dispositivo ESP32 reemplaza múltiples dongles y pasarelas propietarias.

## Protocolos soportados

| Protocolo | Hardware necesario | Ejemplo de dispositivo |
|---|---|---|
| **RF 433 MHz** | Receptor SRX882 o RXB6 ($1) | Sensores de puerta/ventana, estaciones meteorológicas |
| **RF 315 MHz** | Receptor similar | Mandos de garaje (USA) |
| **BLE** | Integrado en ESP32 | Xiaomi Mijia, iBeacon, balanzas, plantas |
| **IR** | Emisor/receptor IR ($0.50) | TVs, AC, equipos AV |
| **LoRa** | SX1276/SX1262 módulo ($5) | Sensores remotos |
| **RFID** | RC522 o PN532 ($3) | Tags NFC/RFID |
| **RS232** | MAX3232 ($1) | Dispositivos serie legacy |

## BLE — el caso más potente

El gateway BLE escanea dispositivos Bluetooth Low Energy y publica su telemetría:

| Dispositivo BLE | Datos publicados |
|---|---|
| **Xiaomi LYWSD03MMC** | Temperatura, humedad, batería |
| **Xiaomi Mi Flora** | Humedad tierra, luz, fertilidad, batería |
| **iBeacon** | UUID, distancia, presencia |
| **Balanza Xiaomi** | Peso |
| **Oral-B** | Estado cepillado (sí, en serio) |

### Ventaja sobre integraciones BLE directas

- **Alcance**: ESP32 como repetidor BLE → coloca gateways donde los sensores están
- **Rendimiento**: HA nativo BLE puede saturarse con 10+ dispositivos. OMG descarga el procesamiento
- **MQTT**: dato ya en MQTT, integración trivial

## Hardware recomendado

| Configuración | Componentes | Coste |
|---|---|---|
| **Solo BLE** | ESP32 DevKit | $5 |
| **BLE + RF 433** | ESP32 + SRX882 + antena | $8 |
| **BLE + IR** | ESP32 + LED IR + receptor TSOP | $6 |
| **Multi-protocolo** | ESP32 + RF + IR + LoRa | $15–$25 |

Hay también una versión con **Theengs Gateway** (del mismo equipo) que corre en RPi/Docker como proceso Python — sin hardware ESP32 adicional, usa el BLE del host.

## Integración con Home Assistant

OpenMQTTGateway soporta **MQTT Auto-Discovery** de HA:

```
homeassistant/sensor/OMG_LYWSD03MMC_A4C1/temperature/config → {
  "name": "Dormitorio Temperatura",
  "state_topic": "home/OMG/BTtoMQTT/A4C138XXXX",
  "value_template": "{{ value_json.tempc }}",
  "unit_of_measurement": "°C",
  "device_class": "temperature"
}
```

Los sensores aparecen automáticamente en HA sin configuración adicional.

## Instalación

```
1. Flash: install.openmqttgateway.com (web installer, como Tasmota/WLED)
2. Conectar a WiFi (portal cautivo)
3. Configurar broker MQTT (IP, user, pass)
4. Los dispositivos BLE/RF empiezan a aparecer en MQTT automáticamente
```

→ MQTT: [[MQTT en domótica — brokers y patrones]]
→ Home Assistant: [[Home Assistant — el hub open-source]]
→ Firmware IoT: [[Firmware IoT — Tasmota, ESPHome y WLED]]
