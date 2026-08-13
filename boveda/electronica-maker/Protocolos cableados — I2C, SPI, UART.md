---
tipo: componente
sector: electronica-maker
tags: [i2c, spi, uart, protocolos, comunicacion-serie, pull-up]
---
# Protocolos cableados — I2C, SPI, UART

> Antes de que dos chips puedan hablarse por WiFi necesitan poder hablarse por cable — I2C, SPI y UART son los tres idiomas que casi todos los sensores y periféricos maker entienden, y elegir el correcto para cada situación evita la mitad de los problemas de cableado del proyecto.

---

## Los tres protocolos, en una tabla

```
                UART              I2C                    SPI
Cables          2 (TX, RX)        2 (SDA, SCL)           4+ (MOSI, MISO, SCK, CS×N)
Velocidad       9.6k-115.2k baud  100k-400k-1M-3.4M Hz    hasta 10-80 MHz
Dispositivos    punto a punto (2) hasta ~112 en el bus    1 maestro, N esclavos (1 CS c/u)
Reloj           sin reloj (async) reloj compartido (SCL)  reloj compartido (SCK)
Full-duplex     Sí                No (half-duplex)        Sí
Pull-ups        a veces           SIEMPRE necesarios      no (push-pull nativo)
Complejidad     mínima            media (direcciones)     media (más pines por dispositivo)
```

---

## UART — el más simple, punto a punto

```
QUÉ ES: transmisión asíncrona, sin señal de reloj compartida — ambos extremos deben
  acordar de antemano la velocidad (baud rate) y el formato (bits de datos, paridad, stop)

VELOCIDADES HABITUALES: 9600, 19200, 38400, 57600, 115200 baud
  → 115200 es el estándar de facto para depuración por USB-serie en Arduino/ESP32

USO TÍPICO:
  → Puerto serie de depuración (Serial.println en Arduino/ESP32)
  → Comunicación GPS (módulos NEO-6M/NEO-8M hablan NMEA por UART)
  → Módems, módulos SIM800/SIM7000, algunos sensores simples
  → RS-232/RS-485 (con conversor de nivel) para distancias largas industriales

LIMITACIÓN: solo conecta 2 dispositivos directamente (TX de uno → RX del otro,
  cruzados). Para más dispositivos hace falta un bus (I2C/SPI) o un multiplexor UART.
```

---

## I2C — el bus compartido, ideal para sensores

```
QUÉ ES: bus de 2 hilos (SDA=datos, SCL=reloj) donde cada dispositivo tiene una
  dirección única (7 bits = 128 direcciones posibles, algunas reservadas)

PULL-UPS OBLIGATORIOS: las líneas son de drenaje abierto (open-drain) — sin
  resistencias pull-up (típico 4.7kΩ, bajar a 2.2kΩ si el bus es largo o rápido)
  el bus no funciona. Muchos módulos ya las traen integradas — si pones dos
  módulos con pull-up propia en el mismo bus, quedan en paralelo (más fuertes de
  la cuenta, generalmente sin problema, pero vigilar en buses largos)

VELOCIDADES: Standard (100kHz), Fast (400kHz — la más usada en maker),
  Fast Plus (1MHz), High Speed (3.4MHz, poco común en maker)

DIRECCIONES DUPLICADAS: si dos sensores iguales comparten dirección fija,
  hace falta un multiplexor I2C (TCA9548A, 8 canales) para separarlos

USO TÍPICO: casi todos los sensores ambientales modernos (BME280, VL53L0X,
  INA219, pantallas OLED SSD1306), porque con solo 2 cables se pueden
  encadenar decenas de periféricos distintos

LONGITUD DE CABLE: I2C no está pensado para largas distancias (recomendado <1m
  sin medidas extra) — para sensores lejanos, mejor UART, RS-485 o wireless
```

---

## SPI — el más rápido, ideal para pantallas y memoria

```
QUÉ ES: bus full-duplex con 4 líneas mínimo: MOSI (master out), MISO (master in),
  SCK (reloj), y una línea CS (Chip Select) POR CADA dispositivo esclavo

VELOCIDAD: sin resistencias pull-up (push-pull nativo), permite velocidades mucho
  mayores que I2C — 10-40MHz habituales, hasta 80MHz en casos concretos

CS INDIVIDUAL: a diferencia de I2C (direcciones sobre el mismo cable), SPI necesita
  un pin de selección por dispositivo — con 3 periféricos SPI se usan 3 pines CS
  más los 3 compartidos (MOSI/MISO/SCK) = 6 pines en total

USO TÍPICO: pantallas TFT/e-paper de refresco rápido, tarjetas microSD, memoria
  flash externa, módulos de radio (NRF24L01, LoRa SX1276/SX1278), Ethernet W5500

VENTAJA SOBRE I2C: mucha más velocidad y sin overhead de direccionamiento —
  la elección natural cuando hay que mover datos grandes rápido (pantalla, SD)
```

---

## Cómo elegir en la práctica

```
"Necesito depurar mi programa viendo mensajes por consola"
  → UART (el puerto serie por USB que ya usas sin pensarlo)

"Tengo 5 sensores ambientales distintos y pocos pines libres"
  → I2C — 2 cables para todos, siempre que no compartan dirección fija

"Necesito refrescar una pantalla TFT a buena velocidad, o leer una SD rápido"
  → SPI — la velocidad marca la diferencia visible

"El sensor está a 5 metros del microcontrolador"
  → UART con conversor RS-485, o mejor aún, wireless (ver nota de conectividad)

"Quiero encadenar 20 sensores de temperatura por un solo cable"
  → 1-Wire (protocolo aparte, tipo DS18B20) o I2C con multiplexor si son I2C
```

---

## Errores comunes

```
1. Olvidar las resistencias pull-up en I2C con módulos "desnudos" (sin PCB con
   pull-up integrada) → el bus no responde, o responde de forma intermitente

2. Cruzar TX/RX al revés en UART (TX-TX, RX-RX en vez de TX-RX cruzado)
   → no se recibe nada, error muy común en principiantes con módulos GPS/BT

3. Usar la misma dirección I2C en dos módulos iguales sin multiplexor
   → solo uno responde, o ambos "pelean" por el bus con resultados erráticos

4. No compartir GND entre los dispositivos (I2C, SPI y UART necesitan referencia
   de tierra común) → señales sin sentido, "ruido" que en realidad es falta de GND

5. Cablear SPI muy largo (>30cm) a alta velocidad sin cuidado
   → errores de datos por reflejos de señal; bajar la velocidad del reloj SPI
   o acortar cable resuelve la mayoría de casos

6. Confundir GPIO "compatibles con I2C hardware" con cualquier GPIO libre
   → el I2C por software (bit-banging) funciona en casi cualquier pin, pero el
   I2C hardware (más rápido y fiable) solo está disponible en pines concretos
   según el microcontrolador — revisar el pinout específico
```

---

## Novedades 2025-2026

```
→ I3C (sucesor propuesto de I2C, MIPI Alliance) gana tracción lenta en sensores
  industriales de nueva generación (mayor velocidad, sin pull-ups obligatorias),
  aunque en el ecosistema maker de 2026 I2C sigue siendo el estándar dominante
  por la enorme base instalada de sensores y librerías existentes.
→ El RP2350 (con su PIO mejorado) permite implementar variantes de estos protocolos
  a medida por software cuando el periférico hardware estándar no encaja con el
  caso de uso — una ventaja diferencial frente a ESP32/Arduino en proyectos de
  protocolo no estándar.
```

→ Sensores que usan estos protocolos: [[Sensores — catálogo práctico por tipo]]
→ Cuando el cable no es viable: [[Conectividad inalámbrica — WiFi, BLE, LoRa, Zigbee, Matter]]
