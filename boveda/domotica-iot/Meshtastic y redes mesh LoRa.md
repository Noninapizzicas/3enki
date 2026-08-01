---
tipo: referencia
sector: domotica-iot
tags: [meshtastic, lora, mesh, comunicacion, off-grid, radio]
---
# Meshtastic y redes mesh LoRa

Redes de comunicación de largo alcance, sin infraestructura, sobre radio LoRa — mensajería y telemetría off-grid.

## Meshtastic (8k stars)

Firmware open-source que convierte módulos LoRa en una red mesh descentralizada: mensajería de texto, GPS y telemetría sin internet ni repetidores.

| Aspecto | Detalle |
|---|---|
| **Protocolo** | LoRa (chirp spread spectrum) |
| **Frecuencia** | 868 MHz (EU) / 915 MHz (US) / 433 MHz |
| **Alcance** | 1–10 km (urbano) / 30+ km (línea de vista) |
| **Mesh** | Cada nodo repite mensajes (multi-hop) |
| **Encriptación** | AES-256 (canal cifrado por defecto) |
| **Consumo** | ~30 mA TX, ~10 mA RX, deep sleep µA |
| **Batería** | Días a semanas con 18650 (2.000–3.000 mAh) |
| **App** | Android, iOS, web (BLE o WiFi) |

### Hardware compatible

| Dispositivo | Chip | Pantalla | GPS | Precio |
|---|---|---|---|---|
| **Heltec V3** | ESP32-S3 + SX1262 | OLED 0.96" | No (externo) | $15–$20 |
| **TTGO T-Beam** | ESP32 + SX1276 | OLED 0.96" | Sí (u-blox) | $25–$35 |
| **RAK WisBlock** | nRF52840 + SX1262 | Opcional | Opcional | $20–$40 |
| **LilyGo T-Echo** | nRF52840 + SX1262 | E-ink | Sí | $30–$40 |
| **Station G2** | ESP32-S3 + SX1262 | Opcional | Opcional | $35 |

### Casos de uso

| Uso | Detalle |
|---|---|
| **Comunicación off-grid** | Senderismo, emergencias, eventos sin cobertura |
| **Telemetría remota** | Sensores en campo (temperatura, humedad, nivel de agua) |
| **Rastreo GPS** | Posición de vehículos, mascotas, personas |
| **Red comunitaria** | Mesh urbana como alternativa a internet para mensajería |
| **Nodos solares** | Repetidores autónomos en montaña con panel solar |

### Integración con Home Assistant

Meshtastic puede enviar telemetría a Home Assistant vía MQTT:

```
Nodo Meshtastic (sensor) → LoRa mesh → Nodo gateway (con WiFi)
    → MQTT broker (Mosquitto) → Home Assistant
```

## LoRaWAN (alternativa centralizada)

| Aspecto | Meshtastic (mesh) | LoRaWAN (estrella) |
|---|---|---|
| **Topología** | Mesh (P2P, multi-hop) | Estrella (nodo → gateway → servidor) |
| **Infraestructura** | Cero (cada nodo es router) | Gateway + servidor (TTN, ChirpStack) |
| **Latencia** | Segundos | Minutos (clase A) |
| **Bidireccional** | Sí (cualquier nodo a cualquier nodo) | Limitado (downlink restringido) |
| **Batería** | Buena (mesh consume más que sleep) | Excelente (nodo duerme >99% del tiempo) |
| **Caso de uso** | Comunicación humana, telemetría interactiva | Miles de sensores desatendidos |

### The Things Network (TTN)

Red LoRaWAN comunitaria y gratuita:
- Gateways compartidos en ciudades (cobertura variable)
- ChirpStack como alternativa self-hosted
- Nodos: RAK WisBlock, Heltec, TTGO con firmware LoRaWAN

→ Hub domótico: [[Home Assistant — el hub open-source]]
→ MQTT: [[MQTT en domótica — brokers y patrones]]
→ ESP32: ver cantera [[awesome-esp]]
