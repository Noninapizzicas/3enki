---
tipo: componente
sector: electronica-maker
tags: [microcontroladores, arduino, esp32, rp2040, rp2350, stm32, avr, risc-v]
---
# Microcontroladores — Arduino, ESP32, RP2040 y RP2350

> El microcontrolador es el cerebro barato: un chip entero con CPU, memoria y pines de entrada/salida por menos de lo que cuesta una cena, y la diferencia entre elegir bien o mal se nota en cada proyecto que construyas encima.

---

## Las tres familias que dominan el mundo maker

```
ARDUINO — el estándar educativo, el más simple de todos
  Núcleo histórico: AVR de 8 bits (ATmega328P en el Uno) — lento pero indestructible
  Núcleo moderno: ARM Cortex-M4 (Uno R4) o SAMD21 (Zero) — 32 bits
  Fortaleza: ecosistema de librerías más grande que existe, IDE oficial trivial de instalar
  Debilidad: sin WiFi/BLE nativo en los modelos clásicos (Uno, Nano, Mega)

ESP32 (Espressif) — el rey del IoT, WiFi+BLE integrados
  Núcleo: Xtensa LX6/LX7 (dual-core) en la mayoría, RISC-V en C2/C3/C6/H2/P4
  Fortaleza: WiFi + Bluetooth de serie, precio brutal, soportado por Arduino IDE y ESP-IDF
  Debilidad: 9 variantes distintas — fácil comprar la que no encaja con tu proyecto

RP2040 / RP2350 (Raspberry Pi) — el más potente por euro, sin radio propia
  RP2040: dual Cortex-M0+ a 133MHz, 264KB SRAM, sin WiFi/BLE (hay que añadirlo aparte)
  RP2350: dual Cortex-M33 O dual RISC-V Hazard3 (se elige al arrancar), 520KB SRAM, TrustZone
  Fortaleza: PIO (Programmable I/O) — periféricos programables para protocolos a medida
  Debilidad: ecosistema de librerías menor que Arduino/ESP32, aunque crece rápido
```

---

## Comparativa de specs y precio (2026)

```
MODELO              CPU                    RAM      FLASH   WIFI/BLE   PRECIO (€, 2026)
Arduino Uno R3       ATmega328P 16MHz 8bit  2KB      32KB    No         23-27€ (oficial) · 6-9€ (clon)
Arduino Uno R4 WiFi   RA4M1 48MHz Cortex-M4 32KB     256KB   Sí (ESP32-S3 coprocesador) 27-30€
Arduino Nano          ATmega328P 16MHz 8bit  2KB      32KB    No         5-15€ (clon)
ESP8266 (NodeMCU)     Xtensa L106 80MHz      80KB     4MB     WiFi solo  3-6€
ESP32 DevKit (WROOM)  Xtensa LX6 dual 240MHz 520KB    4MB     WiFi+BLE   4-9€
ESP32-S3 DevKit       Xtensa LX7 dual 240MHz 512KB    8MB+PSRAM WiFi+BLE 6-12€
ESP32-C3              RISC-V single 160MHz   400KB    4MB     WiFi+BLE   3-6€
ESP32-C6              RISC-V single 160MHz   512KB    4MB     WiFi6+BLE+Zigbee+Thread 5-9€
ESP32-P4              RISC-V dual 400MHz     768KB    sin radio propia   8-14€
Raspberry Pi Pico     RP2040 dual M0+ 133MHz 264KB    2MB     No         4-6€
Raspberry Pi Pico W   RP2040 + módulo WiFi   264KB    2MB     WiFi solo  6-8€
Raspberry Pi Pico 2   RP2350 dual M33/RISC-V 520KB    4MB     No         5-7€
Raspberry Pi Pico 2W  RP2350 + módulo WiFi   520KB    4MB     WiFi+BLE   7-9€
```

Precios orientativos en tiendas España (BricoGeek, Electan, Solectroshop) y AliExpress para clones. Los precios oficiales de Arduino.cc son superiores a los clones — para aprender, el clon vale; para un proyecto que dependa de soporte, la placa oficial.

---

## Cuál elegir según el proyecto

```
"Quiero encender un LED y entender qué es un microcontrolador"
  → Arduino Uno R3 (o clon). Documentación en español abundante, cero fricción.

"Quiero un sensor que hable con mi router WiFi"
  → ESP32 DevKit genérico (WROOM-32). El precio-prestación de referencia.

"Necesito Bluetooth Low Energy para un wearable o beacon"
  → ESP32-C3 o ESP32-S3 (BLE 5.0), o nRF52840 (Nordic) si el consumo es crítico.

"Quiero domótica compatible con Zigbee/Thread/Matter"
  → ESP32-C6 — es el único de la familia con Zigbee y Thread nativos.

"Necesito procesar vídeo o imagen en el propio microcontrolador"
  → ESP32-P4 (H.264 hardware) emparejado con un ESP32-C6 para la radio.

"Quiero generar señales o protocolos que no existen en ningún periférico estándar"
  → RP2040 o RP2350 — el PIO (Programmable I/O) permite programar máquinas de estado
    dedicadas para casi cualquier protocolo (WS2812, DMX, VGA casero, lo que sea).

"Necesito máximo rendimiento por euro para audio/DSP ligero"
  → RP2350 — Cortex-M33 a más frecuencia y con más RAM que el RP2040, TrustZone si
    el proyecto necesita aislar zonas seguras.
```

---

## Software y toolchains

```
Arduino IDE — el punto de entrada, gratis, multiplataforma
  → Gestor de placas: soporta AVR, ESP32, RP2040 vía "Boards Manager" (URLs adicionales)
  → Limitación: proyectos grandes se vuelven difíciles de mantener en un solo .ino

PlatformIO — la alternativa profesional, extensión de VSCode
  → Un archivo platformio.ini define placa + framework + librerías por proyecto
  → Compatible con 400+ placas (AVR, ESP32, RP2040, STM32...)
  → Ventaja real: control de versiones de librerías, builds reproducibles, CI/CD

ESP-IDF — el SDK oficial de Espressif para ESP32 (C/C++, FreeRTOS)
  → Necesario para funciones avanzadas (deep sleep fino, mesh, BLE avanzado)
  → Curva de aprendizaje mayor que Arduino, imprescindible en proyectos serios de IoT

MicroPython / CircuitPython — Python embebido
  → MicroPython: soporta ESP32, RP2040, STM32 — ideal para prototipar rápido
  → CircuitPython (Adafruit): más simple, pensado para principiantes, buena documentación

pico-sdk (C/C++) — el SDK oficial de Raspberry Pi para RP2040/RP2350
  → Acceso directo al PIO, control fino de DMA e interrupciones
```

---

## Errores comunes

```
1. Alimentar el ESP32 por USB de un hub barato o cable fino
   → brownouts aleatorios, reinicios al activar WiFi (pico de 500mA+ instantáneo)
   → solución: fuente/cable de calidad, capacitor de 100-470µF cerca del regulador

2. Usar los "strapping pins" del ESP32 como GPIO de propósito general
   → GPIO0, GPIO2, GPIO12, GPIO15 determinan el modo de arranque — un sensor mal
     conectado ahí puede impedir que el chip arranque o entre en modo flash sin querer

3. Confundir 3.3V (ESP32, RP2040) con 5V (Arduino Uno clásico)
   → conectar un sensor de 5V directo a un GPIO de 3.3V puede dañar el pin permanentemente
   → usar conversores de nivel lógico o sensores que soporten 3.3V nativamente

4. No poner resistencias pull-up en líneas I2C cuando el módulo no las trae integradas
   → el bus se queda "flotando", lecturas erráticas o cuelgues intermitentes

5. Comprar un ESP32-C3/C6 esperando el mismo pinout que un ESP32-WROOM clásico
   → cada variante tiene su propio mapeo de GPIO — revisar el datasheet/pinout ANTES de comprar
```

---

## Novedades 2025-2026

```
→ RP2350 alcanza el "A4 stepping" en placas producidas desde mediados de 2025: corrige de
  forma permanente el Erratum E9 (fuga de corriente en GPIO configurados como entrada, causada
  por una resistencia pull-up interna demasiado débil). Comprobar la revisión del chip al pedir
  placas nuevas si el proyecto es sensible a consumo en reposo.
→ ESP32-C6 se consolida como la variante recomendada para domótica: WiFi 6 + BLE 5 + Zigbee +
  Thread (con soporte Matter) en un solo chip, sustituyendo la necesidad de un coprocesador
  Zigbee separado en proyectos nuevos.
→ ESP32-P4 amplía el catálogo con un chip sin radio propia orientado a visión/multimedia
  (400MHz RISC-V dual-core, H.264 por hardware, hasta 50 GPIO) — se empareja con un ESP32-C6
  cuando el proyecto necesita conectividad.
→ Arduino Uno R4 WiFi consolida el salto de la familia Arduino a 32 bits con conectividad
  integrada (vía coprocesador ESP32-S3), cerrando la brecha histórica frente al ESP32 puro.
```

→ Comparar con SBC completos: [[Raspberry Pi y SBCs — de Zero a 5, para qué sirve cada uno]]
→ Sensores compatibles: [[Sensores — catálogo práctico por tipo]]
→ Software de domótica sobre estos chips: [[../domotica-iot/Firmware IoT — Tasmota, ESPHome y WLED]]
