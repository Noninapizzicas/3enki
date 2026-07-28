---
tipo: compartido
tags: [iot, automatizacion, esp32]
comun_a: [cultivo-melena-leon, cultivo-psilocybe-cubensis]
---
# Ayudas tecnológicas  ·  🔗 nota compartida

Automatización de [[Principios de hábitat]]. Mismo hardware para ambas especies; cambia el perfil de setpoints.

## Sensores
SHT30/BME280 (temp+HR, I²C) · SCD30/MH-Z19B (CO₂, I²C) · BH1750/lux.

## Actuadores (por relé)
Humidificador ultrasónico · ventilador extractor/intake (velocidad variable) · calefactor · LED (fotoperiodo).

## Controlador
**ESP32**. Referencias: ShroomBox (+Blynk), Mycodo (Kyle Gabriel), Home Assistant.

Lógica: respuesta proporcional al setpoint de la fase · logs · **sensor de CO₂ a la altura de las setas**.
