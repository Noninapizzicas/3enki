---
tipo: componente
sector: electromecanica-ondas
tags: [DIY, proyectos, motor, bobina-Tesla, antena, PMG, BLDC, SDR, maker]
---
# Proyectos DIY de referencia — motores, bobinas, antenas

Una selección de proyectos construibles con herramientas de taller básico (torno, taladro de
columna, multímetro, NanoVNA) y presupuesto maker. Cada proyecto apunta a los conceptos del
sector que pone en práctica.

---

## Proyecto 1 — PMG axial de 500 W para aerogenerador de 3 palas

**Concepto:** [[Generadores y dínamos — PMG axial, alternadores, rectificación]] + [[Bobinado — AWG, inductancia, factor de llenado, estrella-triángulo]]

```
COMPONENTES:
  2 discos de acero S235 Ø 400 mm × 10 mm (rotores)
  24 imanes NdFeB N42 50×25×10 mm (12 por rotor, cara a cara alternados N-S)
  Resina epoxi + fibra de vidrio para estátor (molde de madera)
  AWG 14 (2.05 mm Ø) — 80 espiras × 9 bobinas = 720 espiras total
  Rodamientos 6008 (2 unidades) + eje 40 mm
  Conector SMA para el neutro en estrella

PARÁMETROS DE DISEÑO (Piggott):
  16 polos (P=8 pares) → n_sincronismo = 60×f/P → para f=50Hz: n=375 RPM
  Objetivo: V_fase=24V a 250 RPM (viento de arranque ≈ 4 m/s con palas 2m)
  V_oc_fase = 4.44 × f × N × Φ = 4.44 × 33.3 × 80 × 0.3T × 0.002m² = 23.8V ✓

PROCESO:
  1. Mecanizar los discos de acero (centro + agujeros de fijación)
  2. Pegar imanes con epoxi, alternando polaridad — VERIFICAR CON BRÚJULA antes de pegar
  3. Bobinar 9 bobinas en forma de pastel (pancake coil), Ø_ext=90mm, Ø_int=30mm
  4. Conectar en estrella trifásica (3 fases × 3 bobinas en serie)
  5. Encapsular en molde de madera con resina epoxi + fibra de vidrio 3 capas
  6. Montar estátor entre rotores (entrehierro objetivo: 10mm)
  7. Puente de diodos Schottky (MBR2045, 6 unidades) + resistencia de carga 48V/500W

VERIFICACIÓN:
  NanoVNA: medir L de cada bobina antes de encapsular → deben ser iguales (±5%)
  Giro manual lento → comprobar V_oc ≈ K_e × RPM
  SWR del puente: resistencia de carga 100Ω → rizado < 6%

RECURSOS:
  "Wind Turbine Recipe Book" — Hugh Piggott (2013, libre online)
  windempowerment.org — comunidad de talleres Piggott
```

---

## Proyecto 2 — SSTC (Solid State Tesla Coil) de 600 W

**Concepto:** [[Nikola Tesla — motor AC, bobina Tesla, transmisión inalámbrica]] + [[Resonancia electromagnética — circuitos LC, RLC, frecuencia propia]]

```
COMPONENTES:
  2× IGBT IXGN60N60C2D1 (puente medio) o 4× IRGP4063D (puente completo)
  Driver: UCC27322 o IR2110 (bootstrap para el IGBT high-side)
  Condensadores primarios: MMC de 0.068µF/2kV polipropileno (Cornell Dubilier 942C)
  Primario: 10 espiras tubo cobre Ø8mm en espiral plana, D_ext=250mm
  Secundario: 1100 espiras AWG 28 sobre tubo PVC Ø115mm × 500mm
  Toroide terminal: aluminio Ø250×60mm (D_mayor×D_menor)
  Fuente: transformador toroidal 230V/110V 600VA + rectificador + bus DC 155V

DISEÑO DE RESONANCIA:
  f_secundario = 1/(2π√(L2×C2))
  L2 ≈ 30mH (verificar con NanoVNA o fórmula Wheeler)
  C2 ≈ 12pF (capacidad del toroide: C ≈ 11.26 × √(D_mayor/10) en pF, con D en cm = 11.26×√25=56pF, corregir por geometría real)
  f₂ = 1/(2π√(30e-3×12e-12)) = 265 kHz

  f_primario debe coincidir con f₂:
  L1 = 10 espiras × Piggott ≈ 5µH (medir con NanoVNA)
  C1 = 1/(4π²×f₂²×L1) = 1/(4π²×265000²×5e-6) = 72nF → usar 68nF MMC

CIRCUITO DE CONTROL (SSTC, half-bridge):
  Oscilador: 555 astable a 265 kHz (ajustable con trimpot) → señal driver
  O mejor: PLL Phase-Locked Loop → se engancha a la resonancia real del secundario (señal de corriente del primario como referencia)
  INTERRUPTOR: PWM del gate del IGBT → control de anchura de pulso = control de potencia
  Protección: corriente de pico del IGBT no debe superar 60A (shunt + comparador + latch)

SEGURIDAD (OBLIGATORIA):
  Operar en espacio amplio (5m libre alrededor)
  Jaula de Faraday en el puesto de trabajo
  Nunca solo — siempre otra persona con mano en el interruptor
  Las chispas de arco de plasma (7000-30000 K) inflaman materiales fácilmente

CHISPAS ESPERADAS:
  600W → arcos de 20-40 cm
  Frecuencia de modulación (interruptor PWM) a 130 Hz (nota musical si se desea)

RECURSOS:
  loneoceans.com/sstc — diseño completo de referencia (Loneoceans)
  4hv.org — foro de alta tensión DIY (la comunidad más técnica)
  "Beating the Biggest Tesla Coil" — Electroboom (YouTube, educativo)
```

---

## Proyecto 3 — Receptor ADS-B con RTL-SDR y Yagi 5 elementos a 1090 MHz

**Concepto:** [[Antenas y radiofrecuencia — dipolo, Yagi, SWR, bandas, SDR]]

```
COMPONENTES:
  RTL-SDR v4 (RTL2832U + R820T2) — 25-40€
  Yagi 5 elementos casera (cálculo abajo)
  Conector SMA hembra a BNC o N-type para coaxial
  Cable RG58 1.5m (para SDR en interior) o LMR-195 (baja pérdida para cable largo)
  Raspberry Pi 4 (para correr dump1090 24/7) — opcional

DISEÑO YAGI 1090 MHz:
  λ = c/f = 3×10⁸/1090×10⁶ = 27.5 cm

  Elemento         Longitud     Posición desde reflector
  ──────────────────────────────────────────────────────
  Reflector        14.5 cm      0 cm
  Dipolo activo    13.5 cm      5.7 cm   (λ/4.8)
  Director 1       12.8 cm      11.1 cm
  Director 2       12.5 cm      18.8 cm
  Director 3       12.3 cm      27.7 cm

  Material: varilla de aluminio Ø3mm (corten a longitud + tolerar ±1mm)
  Boom: perfil cuadrado aluminio 12×12mm × 30cm
  Alimentación: balun 1:1 en el dipolo (puede ser cable coaxial en bucle)
  Impedancia: ≈ 50Ω (el dipolo activo se acorta ligeramente para adaptarla)

MONTAJE:
  Taladrar el boom cada 5.7/7.7/7.7 cm → insertar las varillas en perpendicular
  El dipolo se divide en dos brazos de 6.75cm, cada uno fijado al BNC central
  VERIFICAR con NanoVNA: SWR < 1.5 a 1090 MHz — si SWR > 2, ajustar longitud del dipolo ±1mm

SOFTWARE (Raspberry Pi):
  sudo apt install dump1090-fa
  dump1090-fa --gain 40 --net → interfaz web en :8080
  Conectar con FlightAware (feeder) → ver el tráfico aéreo en tiempo real

ALCANCE ESPERADO:
  Antena omnidireccional 13.5cm: 150-200 km
  Yagi 5 elementos: 300-400 km en la dirección apuntada
  Récord DIY documentado: >500 km desde cima de montaña con Yagi 9 elementos
```

---

## Proyecto 4 — Motor BLDC reutilizado como generador para e-bike

**Concepto:** [[Motor DC y BLDC — escobillas, brushless, ESC, FOC]]

```
MOTOR REUTILIZADO:
  Motor de rueda de e-bike (hub motor) descartado o de segunda mano: 250-500W, 36V
  Rotor: imanes permanentes en el exterior (outrunner)
  Estátor: bobinas en estrella, tipicamente 36N40P (36 ranuras, 40 polos)

COMO GENERADOR DE BATERÍA:
  El motor se acopla a un eje de agua o pedales de bicicleta
  A velocidades bajas (30-60 RPM del pedal × multiplicadora × 10 = 300-600 RPM motor)
  V_oc = KV^(-1) × RPM → con KV=10 RPM/V → a 500 RPM → V_oc=50V

  Rectificador trifásico (6 diodos MBR2045) → 67V DC
  Regulador de carga a 48V (MPPT) → carga batería de litio/plomo

  CÁLCULO DE POTENCIA:
  P = V × I = 48V × I_corte → a 500W: I=10.4A
  La resistencia de fase del motor (Rph) limita la corriente de cortocircuito
  Medir Rph con multímetro entre dos terminales → I_cc = V_oc / (2×Rph)

CONEXIÓN FÍSICA:
  Eje del hub motor → soporte fijo de madera/acero → acoplado a turbina de agua
  O: montar el motor invertido (estátor gira, rotor fijo) — raro pero posible
  Rodamientos del hub motor aguantan bien la carga radial → no añadir más

VERIFICACIÓN:
  Multímetro AC entre dos fases mientras se gira manualmente → ver tensión trifásica
  Osciloscopio (o app de audio del móvil) → verificar la forma de onda sinusoidal
  NanoVNA: no aplica a motores (el NanoVNA es para RF — usar puente de impedancias)
```

---

## Proyecto 5 — Receptor de satélites meteorológicos NOAA (137 MHz)

**Concepto:** [[Antenas y radiofrecuencia — dipolo, Yagi, SWR, bandas, SDR]]

```
OBJETIVO: recibir imágenes de satélites NOAA-15, NOAA-18, NOAA-19 en tiempo real

ANTENA RECOMENDADA — V-dipole para 137 MHz:
  Dos brazos de 52cm en V (ángulo 120°) fijados a un conector BNC
  λ/4 = c/(4f) = 3×10⁸/(4×137×10⁶) = 54.7 cm × 0.95 (vel. de propagación) = 52 cm
  La forma en V capta la polarización circular de los satélites NOAA
  Coste: < 5€ (dos varillas de acero inoxidable + conector BNC)

ALTERNATIVA: antena QFH (Quadrifilar Helix) — polarización circular perfecta
  Más compleja de construir pero ganancia superior (+3 dBi sobre el V-dipole)
  Calculadora: jcoppens.com/ant/qfh/calc.en.php

HARDWARE:
  RTL-SDR v4 + cable RG58 < 3m (pérdida a 137 MHz: ~3 dB/10m)
  LNA (amplificador de bajo ruido) si el cable supera 5m: Nooelec Lana (15€)

SOFTWARE (PC Linux/Windows o Raspberry Pi):
  SDR++  → reemplaza a SDR# en Linux (sdrpp.org, gratuito)
  SatDump (satdump.org) → decodificador todo-en-uno para NOAA y Meteor-M2
    Entrada directa desde RTL-SDR → salida imagen en tiempo real
  Gpredict (predictión orbital): calcular cuándo pasa el satélite (pases de 10-12 min)

FLUJO DE RECEPCIÓN:
  1. Abrir Gpredict → ver el próximo pase NOAA por tu ubicación (elevación >30° para buena señal)
  2. Orientar la antena al cenit (la señal llega desde arriba — omnidireccional en azimut)
  3. Abrir SatDump → plugin NOAA APT (Automatic Picture Transmission) a 137.500/137.912 MHz
  4. Grabar el pase completo (≈10 min) → SatDump genera la imagen automáticamente

IMAGEN RESULTANTE:
  APT: 2080 píxeles de ancho, dos canales (visible + infrarrojo)
  Resolución: 4 km/píxel — suficiente para ver frentes meteorológicos, nubes, costa
  Meteor-M2 (137.100 MHz): imagen LRPT de 1.2 km/píxel — más detalle

RECURSOS:
  rtl-sdr.com/rtl-sdr-tutorial-receiving-noaa-weather-satellite-images — guía completa
  Comunidad: r/amateurradio y r/SDR (Reddit)
```

---

## Proyecto 6 — Estación decodificadora de sensores ISM 433 MHz

**Concepto:** [[Antenas y radiofrecuencia — dipolo, Yagi, SWR, bandas, SDR]]

```
OBJETIVO: decodificar sensores domésticos (temperatura, humedad, contadores de agua)
y mandos de garaje en la banda ISM 433 MHz

ANTENA:
  Dipolo λ/2 a 433 MHz: cada brazo = 34.7 cm de cable rígido
  O: antena comercial SMA 433 MHz para RTL-SDR (3-5€)

SOFTWARE:
  rtl_433 (github.com/merbanan/rtl_433)
  Protocolo: decodifica 250+ modelos automáticamente
  Instalación: sudo apt install rtl-433

CORRER:
  rtl_433 -f 433.92M -s 250k -R 0 → auto-detect
  rtl_433 -f 433.92M -F json | mosquitto_pub -t "sensores/433" -l

INTEGRACIÓN CON HOME ASSISTANT:
  rtl_433 -F "mqtt://localhost:1883,retain=0,devices=rtl_433[/model][/id]"
  → todos los sensores aparecen automáticamente en Home Assistant via MQTT discovery

SENSORES COMUNES DETECTADOS:
  Oregon Scientific THGR810 (temperatura+humedad exterior)
  Hideki TS04 (temperatura)
  Bresser 5-in-1 (estación meteorológica completa)
  Mandos de garaje 433 MHz (solo recepción — NO reproducir sin licencia)
  Contadores de agua con módulo inalámbrico (Itron, Diehl)

COSTE TOTAL: RTL-SDR (30€) + Raspberry Pi Zero (15€) + antena (3€) = 48€
  Equivale a una central domótica completa de sensores RF a precio de fabricante
```

---

## Herramientas de taller recomendadas por proyecto

| Herramienta | Proyectos | Coste orientativo |
|---|---|---|
| Multímetro digital (Fluke 115 o similar) | Todos | 60-150€ |
| NanoVNA v2 (50 kHz - 3 GHz) | Antenas, bobinas, resonancia | 35-50€ |
| Osciloscopio digital (Rigol DS1054Z) | Tesla, BLDC, filtros | 300-400€ |
| Soldador temperatura regulable (Hakko FX-888D) | PCBs, conexiones | 100-150€ |
| Taladro de columna + brocas HSS | PMG, Yagi boom | 80-200€ |
| Calibrador digital (0.01mm) | Imanes, entrehierro PMG | 15-30€ |
| Gaussímetro (Metrolab GM1401) | Verificar B en imanes | 80-200€ |
| LCR meter (ES51919A) | Medir L y C de bobinas | 20-60€ |
