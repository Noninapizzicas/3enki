---
tipo: moc
sector: electronica-maker
tags: [electronica, maker, arduino, esp32, raspberry-pi, pcb, kicad, sensores, actuadores, soldadura, i2c, spi, mqtt, ble, iot]
---
# Electrónica Maker

> Encender un LED es el primer "hola mundo" real del mundo físico — de ahí a diseñar tu propia PCB, soldar SMD de 0402 y meter un ESP32-C6 hablando Matter en tu red hay una escalera con peldaños concretos, y todos son alcanzables desde una mesa de cocina.

---

## La escalera del maker de electrónica

```
NIVEL 0 — PRIMEROS PARPADEOS (sin experiencia, sin taller)
  Placa: Arduino Uno R3 o clon · protoboard · LEDs · resistencias · botones
  Software: Arduino IDE (arduino.cc, gratis)
  Proyectos: blink, semáforo, lectura de botón, sensor de luz LDR
  Inversión: 25-45€ (kit completo con protoboard y componentes)

NIVEL 1 — CONECTADO A LA RED (WiFi/BLE, primer proyecto útil)
  Placa: ESP32 DevKit (WiFi+BLE) o ESP8266 (solo WiFi, más barato)
  Software: Arduino IDE + librerías ESP32, o ESPHome (YAML, sin código)
  Proyectos: estación meteo con BME280 en Home Assistant, interruptor WiFi con relé
  Inversión: 40-100€ (placa + sensores + fuente)

NIVEL 2 — DISEÑO PROPIO (soldadura, PCB, protoboard ya se queda corto)
  Herramientas: estación de soldadura (Pinecil/Hakko), multímetro, KiCad
  Proyectos: PCB propia para un sensor, carcasa impresa en 3D, primer pedido a JLCPCB
  Inversión: 150-400€ (soldador + multímetro + primeros pedidos de PCB)

NIVEL 3 — SISTEMA COMPLETO (varios dispositivos, hub central)
  Herramientas: analizador lógico, osciloscopio de gama de entrada, Raspberry Pi como hub
  Proyectos: red de sensores MQTT, domótica completa con Home Assistant, riego automatizado
  Inversión: 400-1.200€ (instrumentación + Raspberry Pi + varios ESP32)

NIVEL 4 — PRODUCCIÓN Y RF (serie corta, radio, cumplimiento normativo)
  Herramientas: pick and place (LumenPnP), horno de reflow, analizador de espectro
  Proyectos: producto con radio propio, PCBA en serie de 20-100 uds, cumplimiento CE/RED
  Inversión: 1.500€+ (equipamiento) · certificación RED si se comercializa (no aplica a uso propio)
```

---

## Mapa del sector (15 notas)

| nota | qué cubre |
|---|---|
| [[Microcontroladores — Arduino, ESP32, RP2040 y RP2350\|Microcontroladores]] | familias Arduino (AVR/SAMD), ESP32 (9 variantes), RP2040/RP2350 · comparativa specs y precios · cuál elegir |
| [[Raspberry Pi y SBCs — de Zero a 5, para qué sirve cada uno\|Raspberry Pi y SBCs]] | Pi Zero 2W, Pi 4, Pi 5, alternativas (Orange Pi, Radxa) · SBC vs microcontrolador · casos de uso |
| [[Sensores — catálogo práctico por tipo\|Sensores]] | temperatura/humedad, gases, movimiento, distancia, luz, corriente · precios y protocolo de cada uno |
| [[Actuadores — motores, servos, relés y control de potencia\|Actuadores]] | motores DC, paso a paso, servos, relés, MOSFETs, drivers (L298N, A4988, ULN2003) |
| [[Soldadura y montaje — herramientas y técnicas THT-SMD\|Soldadura y montaje]] | estaciones de soldadura, estaño, técnicas THT y SMD, reflow casero, errores comunes |
| [[Diseño de PCB — flujo KiCad\|Diseño de PCB]] | flujo esquemático → layout → Gerbers en KiCad, reglas de diseño, alternativas EDA |
| [[Fabricación de PCB — del prototipo a la serie corta\|Fabricación de PCB]] | JLCPCB/PCBWay, fresado CNC, método fotosensible, PCBA, proveedores de componentes |
| [[Protocolos cableados — I2C, SPI, UART\|Protocolos cableados]] | direccionamiento I2C, full-duplex SPI, UART asíncrono · pull-ups, velocidades, cuándo usar cada uno |
| [[Conectividad inalámbrica — WiFi, BLE, LoRa, Zigbee, Matter\|Conectividad inalámbrica]] | WiFi/BLE en ESP32, LoRa/LoRaWAN largo alcance, Zigbee/Thread, Matter como estándar de aplicación |
| [[Alimentación — reguladores, baterías LiPo y USB-C PD\|Alimentación]] | reguladores lineales vs buck, LiPo y su gestión (TP4056), USB-C PD, cálculo de consumo |
| [[Instrumentación DIY — osciloscopio y analizador lógico\|Instrumentación DIY]] | osciloscopios de entrada, analizadores lógicos, sigrok, cuándo se necesita cada uno |
| [[Pick and place open-source — LumenPnP\|Pick and place]] | LumenPnP, ensamblaje SMD automatizado a escala maker |
| [[Test y verificación — sigrok y herramientas\|Test y verificación]] | sigrok, PulseView, debugging de protocolos, JTAG/SWD |
| [[Proyectos maker — domótica, IoT y automatización casera\|Proyectos maker]] | estación meteo, riego automatizado, interruptor WiFi, sensor de presencia, cerradura BLE — paso a paso |
| [[Fuentes, comunidades y proveedores — electrónica maker en España\|Fuentes y proveedores]] | tiendas España, foros, Discord, canales YouTube, normativa de comercialización |

---

## Últimas noticias y avances del sector

> El hardware maker en 2025-2026 se mueve en dos frentes: los propios chips (RP2350 corrigiendo su erratum de fábrica, la familia ESP32 llegando a 9 variantes) y el terreno normativo/de mercado (nueva ley de equipos radioeléctricos en España, escasez global de semiconductores empujada por la demanda de IA).

```
NOVEDAD 1 (2025-2026): RP2350 (Raspberry Pi Pico 2) llega al "A4 stepping" en placas fabricadas
  desde mediados de 2025, que corrige de forma permanente el Erratum E9 (fuga de corriente en
  GPIO configurados como entrada por una pull-up interna demasiado débil). El chip ofrece
  selección de núcleos Arm Cortex-M33 o RISC-V Hazard3 al arrancar, 520KB SRAM, 4MB flash y
  TrustZone + aceleración SHA-256 por hardware.

NOVEDAD 2 (2025): Espressif consolida su familia ESP32 en 9 variantes (ESP32, S2, S3, C2, C3,
  C5, C6, H2, P4). El ESP32-C6 añade WiFi 6 + Zigbee + Thread + soporte Matter — es la opción
  recomendada para domótica nueva. El ESP32-P4 (sin radio propia, hay que emparejarlo con un
  C6) da 400MHz RISC-V dual-core con codificación H.264 por hardware, pensado para visión y
  multimedia embebida.

NOVEDAD 3 (2026): Real Decreto 192/2026 (BOE, 11 de marzo de 2026) modifica el reglamento
  español de equipos radioeléctricos (RD 188/2016), trasponiendo la Directiva UE 2024/2749.
  Afecta a cualquier proyecto maker que pase de "uso personal" a comercializar un dispositivo
  con radio (WiFi/BLE/LoRa) en España o la UE — no afecta al hobby ni a prototipos de uso propio.

NOVEDAD 4 (2025-2026): Matter sobre Thread se asienta como la recomendación por defecto para
  domótica nueva compatible con Apple Home, Google Home, Amazon Alexa y SmartThings a la vez;
  BLE queda reservado para el aprovisionamiento inicial (commissioning) del dispositivo.

NOVEDAD 5 (2026): las ventas mundiales de semiconductores crecen un 18,8% interanual, tirando
  de fabricantes hacia chips de IA de centro de datos y reduciendo capacidad para memoria de
  consumo — se traduce en presión de precio sobre módulos con RAM/flash integrada (ESP32-S3
  con PSRAM, por ejemplo) que conviene vigilar al comprar en cantidad.
```

---

## Conexiones con otros sectores

```
→ [[../domotica-iot/00 - Domótica e IoT (MOC)|Domótica e IoT]] — el software que corre sobre este hardware:
  Home Assistant, ESPHome, MQTT, Meshtastic. Electrónica Maker construye el dispositivo,
  Domótica e IoT lo integra en el hogar.
→ [[../hidroponia/00 - Hidroponía (MOC)|Hidroponía]] — sensores EC/pH y dosificadores peristálticos
  controlados por ESP32, mismo stack de electrónica.
→ [[../carpinteria-diy/00 - Carpintería DIY (MOC)|Carpintería DIY]] — carcasas y muebles para
  alojar los proyectos electrónicos.
→ cantera [[awesome-electronics]], [[awesome-esp]], [[awesome-raspberry-pi]] — catálogos de
  componentes y recursos ampliados.
```
