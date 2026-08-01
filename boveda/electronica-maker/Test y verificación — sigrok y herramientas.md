---
tipo: referencia
sector: electronica-maker
tags: [sigrok, test, verificacion, debug, protocolos, analizador]
---
# Test y verificación — sigrok y herramientas

Software open-source para capturar, decodificar y analizar señales eléctricas.

## sigrok — el ecosistema

sigrok es la suite open-source para instrumentación: soporta 100+ dispositivos de hardware y 100+ decodificadores de protocolo.

### Componentes

| Componente | Función |
|---|---|
| **libsigrok** | Biblioteca C — habla con el hardware (drivers) |
| **libsigrokdecode** | Decodificadores de protocolo (Python) |
| **PulseView** | GUI — visualización + decodificación de señales |
| **sigrok-cli** | CLI — automatización, scripting, captura batch |

### Hardware compatible (selección)

| Dispositivo | Tipo | Canales | Muestreo |
|---|---|---|---|
| Clone FX2 (Saleae) | Analizador lógico | 8–16 | 24 MHz |
| DSLogic | Analizador lógico | 16 | 400 MHz |
| Rigol DS1054Z | Osciloscopio | 4 | 1 GS/s |
| Hantek 6022BE | Osciloscopio USB | 2 | 48 MS/s |
| RPi Pico (sigrok-pico) | Analizador lógico | 21 | 120 MS/s |
| Multímetros (UNI-T, Brymen) | DMM | — | — |

### Decodificadores de protocolo (top 20)

| Protocolo | Uso típico |
|---|---|
| **UART** | Comunicación serie (ESP32, Arduino, GPS) |
| **SPI** | Flash, sensores, displays, SD card |
| **I²C** | Sensores, EEPROM, RTC, pantallas OLED |
| **1-Wire** | DS18B20 (temperatura), iButton |
| **JTAG** | Debug de MCU, FPGA |
| **SWD** | Debug ARM (STM32, nRF52) |
| **CAN** | Automoción, industrial |
| **MQTT** | (nivel aplicación — se decodifica en Wireshark) |
| **WS2812** | LEDs direccionables (NeoPixel) |
| **DHT11/22** | Sensores de temperatura/humedad |
| **IR NEC** | Mandos a distancia infrarrojos |
| **PWM** | Servos, ESCs, control de motores |

## Flujo de debug típico

```
1. Conectar analizador lógico a las señales de interés
   → SPI: SCK, MOSI, MISO, CS
   → I²C: SDA, SCL
   → UART: TX, RX

2. Abrir PulseView → seleccionar dispositivo → configurar muestreo

3. Capturar → aplicar decodificador de protocolo

4. Leer los datos decodificados:
   → I²C: dirección + R/W + datos + ACK/NACK
   → SPI: bytes MOSI/MISO por transacción
   → UART: caracteres ASCII o hex
```

## Herramientas complementarias

| Herramienta | Función | Tipo |
|---|---|---|
| **Wireshark** | Captura y análisis de red (incluye MQTT, CoAP) | Open-source |
| **Bus Pirate** | Interfaz universal (SPI, I²C, UART, 1-Wire, JTAG) | Open-source HW |
| **OpenOCD** | Debug JTAG/SWD para ARM y RISC-V | Open-source |
| **J-Link EDU** | Debugger JTAG/SWD (uso educativo) | Comercial, $60 |
| **Black Magic Probe** | Debugger JTAG/SWD open-source | Open-source HW |
| **MQTT Explorer** | GUI para inspeccionar topics MQTT | Open-source |

## Bus Pirate — la navaja suiza

| Aspecto | Detalle |
|---|---|
| **Función** | Habla SPI, I²C, UART, 1-Wire, JTAG desde terminal |
| **Versión actual** | Bus Pirate 5 (RP2040, USB-C) |
| **Uso** | Explorar chip desconocido, leer EEPROM, debug rápido |
| **Voltajes** | 1.2–5 V (configurable) |
| **Coste** | ~$30–$40 |
| **Licencia** | Open-source hardware |

→ Instrumentos de medida: [[Instrumentación DIY — osciloscopio y analizador lógico]]
→ Diseño de PCB: [[Diseño de PCB — flujo KiCad]]
