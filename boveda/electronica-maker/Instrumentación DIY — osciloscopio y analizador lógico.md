---
tipo: referencia
sector: electronica-maker
tags: [osciloscopio, analizador-logico, instrumentacion, sigrok, test]
---
# Instrumentación DIY — osciloscopio y analizador lógico

Instrumentos de medida open-source y de bajo coste para el taller electrónico.

## Osciloscopios open-source / accesibles

### Scopefun (open-source completo)

| Aspecto | Detalle |
|---|---|
| **Canales** | 2 analógicos + 16 digitales |
| **Ancho de banda** | 25 MHz |
| **Muestreo** | 100 MS/s |
| **Interfaz** | USB, software open-source (Qt) |
| **Hardware** | FPGA (Xilinx Spartan-6), diseño abierto |
| **Coste** | ~$200 |

### Alternativas comerciales accesibles

| Modelo | BW | Canales | Coste | Notas |
|---|---|---|---|---|
| **Rigol DS1054Z** | 50 MHz (hackeable a 100) | 4 | $350 | El estándar maker |
| **Hantek 6022BE** | 20 MHz | 2 | $60 | USB, software mediocre |
| **DSLogic** | — | 16 digitales | $60–$150 | Analizador lógico, compatible sigrok |
| **Saleae Logic** | — | 8–16 | $400–$1.000 | El mejor software, comercial |

### Osciloscopio con Raspberry Pi Pico

| Proyecto | Detalle |
|---|---|
| **Scoppy** | Pico como osciloscopio USB, app Android como pantalla |
| **pico-scope** | ADC del Pico (500 kS/s, 12 bit) como osciloscopio |
| **Limitación** | Ancho de banda real ~100 kHz (ADC del RP2040) |
| **Uso** | Audio, señales lentas, didáctico |

## Analizadores lógicos

### Saleae clones + sigrok

Un analizador lógico de $10–$15 (Cypress FX2 / clone Saleae) + sigrok = instrumentación seria:

| Aspecto | Detalle |
|---|---|
| **Hardware** | Clone FX2 (8 canales, 24 MHz) — $10 en AliExpress |
| **Software** | PulseView (GUI de sigrok) |
| **Decodificadores** | 100+ protocolos: UART, SPI, I²C, 1-Wire, JTAG, CAN, MQTT... |
| **Muestreo** | 24 MHz (8 canales) o 48 MHz (4 canales) |

### sigrok-pico (Raspberry Pi Pico como analizador)

| Aspecto | Detalle |
|---|---|
| **Hardware** | Raspberry Pi Pico ($4) |
| **Canales** | Hasta 21 digitales |
| **Muestreo** | Hasta 120 MS/s (PIO del RP2040) |
| **Software** | PulseView (integrado en sigrok) |
| **Coste** | $4 (el Pico) |
| **Ventaja** | Supera clones FX2 en velocidad por fracción del precio |

## Multímetros y fuentes

### Fuente de alimentación de laboratorio DIY

| Proyecto | Detalle |
|---|---|
| **EEZ BB3** | Fuente modular open-source (hasta 50V/5A por módulo) |
| **Plataforma** | STM32 + SCPI + pantalla táctil |
| **Comunidad** | EEZ (Envox Experimental Zone) |
| **Coste** | ~$300–$500 (DIY) |

### Multímetro

No hay multímetros open-source competitivos. Recomendaciones maker:

| Modelo | Coste | Para qué |
|---|---|---|
| **UNI-T UT61E+** | $50 | True RMS, el estándar maker |
| **Brymen BM235** | $80 | Más preciso, mejor build |
| **Fluke 87V** | $400 | Profesional, indestructible |

## Generadores de señal

| Proyecto | Detalle |
|---|---|
| **AD9833/AD9850 + Arduino** | DDS hasta 40 MHz, $5 en módulo |
| **JDS6600** | Generador comercial dual, 15–60 MHz, $50–$100 |
| **FeelElec FY6900** | Similar, buena relación calidad/precio |

→ Software sigrok: [[Test y verificación — sigrok y herramientas]]
→ Plataformas (ESP32, Pico): ver cantera [[awesome-esp]]
