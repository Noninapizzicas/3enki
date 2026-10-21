---
tipo: componente
sector: electromecanica-ondas
tags: [antenas, RF, dipolo, Yagi, SWR, SDR, RTL-SDR, bandas, radioaficionado]
---
# Antenas y radiofrecuencia — dipolo, Yagi, SWR, bandas, SDR

## La antena como circuito LC distribuido

Una antena es la transición entre los circuitos eléctricos concentrados y las ondas
electromagnéticas distribuidas en el espacio. Cuando su longitud física es resonante
(λ/2, λ/4...), la reactancia se cancela y toda la potencia se irradia.

```
λ = c / f     (longitud de onda en el vacío)
λ_física ≈ 0.95 × λ  (factor de velocidad del conductor metálico sólido)

Frecuencia  Longitud de onda  λ/2 dipolo  λ/4 monopolo
──────────────────────────────────────────────────────
27 MHz CB   11.1 m           5.55 m      2.77 m
88 MHz FM   3.41 m           1.70 m      0.85 m
144 MHz 2m  2.08 m           1.04 m      0.52 m
433 MHz ISM 0.69 m           34.7 cm     17.3 cm
1090 MHz    0.275 m          13.8 cm     6.9 cm   (ADS-B aviones)
2.4 GHz     0.125 m          6.25 cm     3.12 cm  (WiFi, drones)
5.8 GHz     0.052 m          2.6 cm      1.3 cm   (FPV, WiFi 5GHz)
```

## Tipos de antena — del dipolo a la parabólica

### Dipolo λ/2 — la referencia

```
La antena más simple: dos conductores en línea, cada uno de λ/4.
Impedancia en resonancia: Z ≈ 73 Ω (resistencia de radiación pura)
Ganancia: 2.15 dBi (0 dBd)  — la referencia para medir otras antenas
Patrón de radiación: toroide (dónut) — máximo en el plano perpendicular al eje

Construcción DIY:
  Cable de cobre de 1.5-2.5 mm², cortado exactamente a λ/4 por brazo
  Conectar al coaxial: núcleo al brazo superior, malla al inferior
  Balun 1:1 en el punto de alimentación (reduce corrientes en la malla)
```

### Monopolo λ/4 + plano de tierra

```
Solo un brazo (λ/4) + plano de tierra (4 radiales de λ/4 hacia abajo = ground plane)
Impedancia: ≈ 36 Ω → usar transformador 1:1.5 para adaptarla a 50 Ω
Ganancia: 2.15 dBi (igual que el dipolo — el plano de tierra actúa como imagen)

Ideal para: antenas de base fija (VHF, UHF), antenas de coche (el chasis = plano de tierra)
DIY: antena ground plane de cuarto de onda para ADS-B (1090 MHz) con conector SMA + 4 radiales
```

### Yagi-Uda — directividad a bajo coste

```
Reflector (ligeramente más largo que λ/2) + dipolo activo + N directores (ligeramente más cortos)
Todos en el mismo plano, separados ≈ λ/4.

Ganancia típica:
  3 elementos: 7-8 dBd
  5 elementos: 9-10 dBd
  9 elementos: 12-13 dBd
  15 elementos: 14-16 dBd

Patrón: muy directivo (lóbulo frontal estrecho) → necesita apuntar al objetivo

Aplicaciones maker:
  Recepción de satélites meteorológicos (NOAA, Meteor-M2) a 137 MHz
  Seguimiento de CubeSats a 435 MHz (con rotador de antena DIY)
  WiFi de largo rango (2.4 GHz, Yagi impresa en 3D)
  Receptor ADS-B de largo alcance (1090 MHz)
```

### Helicoidal — circularmente polarizada

```
Espiral de conductor sobre eje + plano de tierra circular.
Modo axial: radiación en el eje de la espiral, polarización circular → ideal para satélites
  (los satélites rotan → la polarización circular es invariante a la rotación)
Ganancia: 10-15 dBi con 6-8 vueltas

DIY: tubo de PVC + hilo de cobre en espiral + chapa de aluminio como reflector
Uso: recepción de satélites GPS, ISS, CubeSats, GOES (meteorología)
```

### Loop magnética — ruido bajo, tamaño pequeño

```
Conductor en bucle cerrado con condensador variable en la parte superior.
Diámetro: 0.1-0.3 λ (mucho más pequeño que el dipolo)
Q muy alto (100-500) → ancho de banda estrecho → hay que reajustar para cada frecuencia
Ventaja: mucho menos sensible al ruido eléctrico local (RFI) que el dipolo
  → ideal para recepción en ciudad con mucho ruido

DIY: "YouLoop" (Airspy) — loop de ruido cancelado pasivo para HF, < 30€ en partes
```

### Discone — wideband de referencia

```
Forma: cono superior (disco) + cono inferior (skirt) → aspecto de OVNI
Funciona de 25 MHz a 900 MHz sin reajuste (relación 30:1 de ancho de banda)
Impedancia ≈ 50 Ω en toda la banda
Ganancia: ≈ 0 dBd (omnidireccional)

El mejor punto de partida para SDR de escucha general (FM, aeronáutico, marítimo, PMR...)
DIY: hilo de cobre + varillas de aluminio + conector SO239
```

## SWR — Standing Wave Ratio (Relación de Onda Estacionaria)

```
Cuando la impedancia de la antena ≠ impedancia del cable coaxial (50 Ω típico),
parte de la potencia se refleja hacia el transmisor → ondas estacionarias.

Γ = (Z_L - Z_0) / (Z_L + Z_0)     (coeficiente de reflexión)
SWR = (1 + |Γ|) / (1 - |Γ|)

SWR ideal: 1:1 (sin reflexión)
SWR < 1.5:1 → excelente
SWR < 2.0:1 → aceptable para la mayoría de transmisores
SWR > 3.0:1 → el transmisor puede dañarse (los modernos reducen potencia automáticamente)

Pérdida por retorno (Return Loss):
  RL = -20 × log|Γ|  [dB]
  SWR 2:1 → RL = 9.5 dB → 11% de la potencia reflejada
  SWR 1.5:1 → RL = 14 dB → 4% reflejada

Medición: analizador de antenas (NanoVNA — el estándar maker, < 40€, 50 kHz-3 GHz)
```

## NanoVNA — el instrumento maker imprescindible

```
Vector Network Analyzer de < 40€:
  Frecuencia: 50 kHz - 3 GHz (v2) / 50 kHz - 1.5 GHz (v1)
  Mide: SWR, impedancia Z (R+jX), parámetros S, Smith Chart
  Uso: verificar la resonancia y SWR de cualquier antena antes de usar

Flujo de uso:
  1. Calibrar con kit OSL (Open-Short-Load) incluido en el punto de conexión
  2. Conectar la antena
  3. Barrer la frecuencia de interés → ver el mínimo de SWR → esa es la f de resonancia
  4. Ajustar la longitud del dipolo (cortar o doblar) hasta SWR < 1.5
```

## SDR — Software Defined Radio

```
Un SDR convierte la señal de RF a datos digitales que el ordenador procesa por software.
Todo el filtrado, demodulación y decodificación es software → una sola antena + SDR
puede recibir prácticamente cualquier señal en su rango.

RTL-SDR (el más popular maker):
  Chip: RTL2832U (demodulador DVB-T reciclado) + sintonizador R820T2
  Rango: 24 MHz - 1766 MHz (con gaps)
  Resolución: 8 bits (limitante para señales débiles)
  Coste: 25-40€ (RTL-SDR v4, el mejor del mercado en 2024)
  Ancho de banda: hasta 3.2 MHz simultáneo

Receptores de mayor calidad:
  Airspy R2: 24-1800 MHz, 12 bits, 10 MSPS → 150€
  SDRplay RSPdx: 1 kHz - 2 GHz, 14 bits → 200€
  ADALM-PLUTO (transmite también): 325-3800 MHz → 200€
  HackRF One: 1 MHz - 6 GHz, TX+RX, 8 bits → 350€
```

### Software para SDR

| Software | OS | Especialidad |
|---|---|---|
| **SDR#** (SDRSharp) | Windows | El más usado, interfaz amigable, plugins |
| **GQRX** | Linux/Mac | Basado en GNU Radio, limpio |
| **GNU Radio** | Linux/Win/Mac | Bloques visuales → construir receptores propios |
| **CubicSDR** | Win/Linux/Mac | Multiplataforma, sencillo |
| **OpenWebRX** | Linux (servidor) | SDR por navegador web, compartir online |
| **dump1090** | Linux | Solo ADS-B (aviones) — muy optimizado |
| **Direwolf** | Linux/Win | Packet radio APRS, satélites |
| **rtl_433** | Linux | Decodifica sensores 433 MHz (meteo, IoT) |

### Proyectos SDR populares (2024-2025)

```
ADS-B (1090 MHz): rastrear aviones en tiempo real
  Software: dump1090 + FlightAware
  Antena: dipolo 13.5 cm o Yagi 5 elementos para >300 km de alcance
  Proyecto: "Chasing CubeSats on $25 budget" — RTL-SDR + antena casera, recibe CubeSats

NOAA/Meteor-M2 (137 MHz): imágenes de satélites meteorológicos
  Software: WXtoImg, SatDump
  Antena: V-dipole o helicoidal circular para Meteor-M2

Señales ISM 433/868 MHz: sensores de temperatura, mandos, contadores inteligentes
  Software: rtl_433 → decodifica 200+ protocolos automáticamente

HF (shortwave) con RTL-SDR v4 o upconverter:
  Recepción de onda corta, radioaficionados, NDB (balizas de navegación aérea)
  NanoVNA para ajustar la antena loop magnética

SDR Toolkit (2025): RTL-SDR + GPS + LNA + ESP32 ISM transceiver en caja única
  Proyecto publicado en Hackster.io y rtl-sdr.com — receptor/transmisor multi-banda DIY
```

## Bandas de frecuencia — resumen operativo

| Banda | Frecuencia | λ | Propagación | Uso maker |
|---|---|---|---|---|
| LF | 30-300 kHz | 1-10 km | Ionosfera global | NDB, DCF77 (hora) |
| MF | 300k-3 MHz | 100m-1km | Onda de suelo + ionosfera noche | AM radio, radiofaros |
| HF | 3-30 MHz | 10-100 m | Ionosfera → global | Radio aficionado, CB, WSPR |
| VHF | 30-300 MHz | 1-10 m | Línea de vista + troposfera | FM, VOR, tráfico aéreo, 2m ham |
| UHF | 300M-3 GHz | 10cm-1m | Línea de vista | 70cm ham, ADS-B, WiFi, LTE |
| SHF | 3-30 GHz | 1-10 cm | Línea de vista estricta | WiFi 5GHz, satélite, radar |

## Licencias de radioaficionado en España

```
Indispensable para TRANSMITIR (recibir es libre):
  Licencia HAREC (clase A): acceso a todas las bandas, máxima potencia
  Licencia clase B (EA): VHF/UHF + algunas HF, potencia limitada
  Examen: URSE / URE — preguntas sobre reglamentación, electrónica, antenas

Sin licencia (libre):
  PMR446 (0.5 W, antena fija): walkie-talkies de paseo
  LoRa/Sigfox en ISM: IoT de largo alcance (sin voz)
  WiFi, Bluetooth, Zigbee: uso doméstico

Índice callsign español: EA1-EA9 según región
```
