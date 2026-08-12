---
tipo: componente
sector: aerodinamica
tags: [morphing, adaptativo, shape-memory, patentes, DARPA, HERWINGT, flexsys]
---
# Alas morfing y adaptativas — estado del arte y patentes

## Concepto: el ala que cambia de forma en vuelo

Un ala convencional tiene geometría fija de diseño optimizada para una condición de crucero.
El ala morfing ajusta su forma continuamente para optimizar el rendimiento en cada fase del vuelo
(despegue, ascenso, crucero, descenso, maniobra) sin piezas móviles discretas.

```
ALA CONVENCIONAL:
  Crucero eficiente  → OK
  Despegue/aterrizaje → flaps discretos (discontinuidad → arrastre extra)
  Maniobra           → alerones discretos (discontinuidad → arrastre extra)

ALA MORFING:
  Toda la superficie → forma continua, sin bisagras, sin juntas
  Cada condición     → geometría óptima calculada en tiempo real
  Resultado          → 5-15% reducción de arrastre total en misión completa
```

## Parámetros de morfing

```
Cambios posibles (independientes o combinados):
  1. Camber (curvatura)    → equivale a flap continuo → ↑CL sin discontinuidad
  2. Twist (torsión)       → optimiza distribución de sustentación en envergadura
  3. Chord (cuerda)        → cambia el área alar → adapta a velocidad
  4. Sweep (flecha)        → cambia régimen y distribución de carga
  5. Dihedral (diedro)     → afecta estabilidad lateral
  6. Span (envergadura)    → raro, mecánicamente costoso
  7. Espesor              → afecta CL_max y área estructural
```

## Tecnologías actuadoras

### Aleaciones con memoria de forma (SMA — Shape Memory Alloy)

```
Nitinol (NiTi): se deforma en frío → recupera forma entrenada al calentarse.
  Temperatura de transición: 40-100°C (ajustable por composición)
  Deformación recuperable: hasta 8%
  Tensión de recuperación: 400-600 MPa
  Respuesta: lenta (segundos) → válida para ajuste de crucero, no para maniobra rápida

Aplicación:
  - Borde de fuga adaptativo → ajusta camber según velocidad/carga
  - Variación de twist en palas de helicóptero (NASA/Bell research)
  - Geometría de inlet de motor (ajuste en distintas fases del vuelo)
```

### Piezoeléctricos (PZT)

```
Deformación por campo eléctrico → respuesta muy rápida (kHz)
Deformación pequeña (~0.1%) → requiere amplificación mecánica
Aplicación: control fino de vibraciones, flutter, morfing de alta frecuencia
  Ej: actuadores en borde de ataque para control de stall dinámico (helicópteros)
```

### Estructuras compliant (mecanismos de un solo cuerpo)

```
Sin bisagras → la deformación se distribuye por el material elástico.
Diseñadas con topología optimizada para transmitir el movimiento del actuador
a la superficie exterior.

Empresa Flexsys Inc. (USA):
  - Borde de fuga morfing continuo demostrado en vuelo en un F/A-18 (programa FlexSys)
  - Patentes activas sobre compliant trailing-edge mechanisms
  - Licenciado por Boeing para estudios en B737 y B787
```

### Materiales inteligentes compuestos

```
IPMC (Ionic Polymer-Metal Composite): se curva bajo voltaje bajo (<5V) → investigación MAV
Electrorheological fluids: viscosidad controlada eléctricamente → rigidez variable del ala
Piezo-composite (MFC — Macro Fiber Composite): actuador de placa flexible
  → demostrado en alas de UAV de investigación (DLR, NASA)
```

## Proyectos y programas principales

### NASA — ACTE (Adaptive Compliant Trailing Edge)

```
2014-2015: FlexFoil de Flexsys instalado en Gulfstream III
Resultados:
  - Reducción de ruido aerodinámico en borde de fuga: -40% (vs. flap convencional)
  - Reducción de drag en crucero: estimada 12% en ala completa
  - Sin penalización en CL_max
Estado: demostración exitosa; tecnología en licenciamiento
```

### DARPA CRANE — X-65 (Control de Flujo Activo, no morfing de forma)

```
Programa Control of Revolutionary Aircraft with Novel Effectors
Avión: X-65 (Aurora Flight Sciences / Boeing), ala en diamante
Estado 2024: ensamblaje de fuselaje + alas completado; primer vuelo previsto 2027
Principio: 14 actuadores AFC (chorros de aire) → ningún aerosuperficie móvil externa
Diferencia con morfing: no cambia la forma del ala; controla el flujo sobre ella
```

### Proyecto HERWINGT (UE Clean Sky 2 / Clean Aviation)

```
2022-2025: High Efficiency Research Wing with Ground and flight Testing
Participantes: Airbus, DLR, ONERA, TU Delft, NLR y otros
Entregables (2024-2025):
  - Demostradores de borde de ataque FLEXIBLE para NLF (natural laminar flow)
  - Borde de fuga COMPLIANT con actuación morfing
  - Validados en túnel de viento de alta velocidad (Ma 0.75-0.85)
  - Integración con HLFC (Hybrid Laminar Flow Control)
Potencial: +10% eficiencia en crucero vs. ala convencional de referencia
```

### Investigación 2024-2025 (publicaciones clave)

| Paper | Año | Hallazgo principal |
|---|---|---|
| *"Numerical investigation of NACA 13112 morphing airfoil"* | 2024 | +6.3% L/D medio en misión mixta |
| *"Active maneuver load alleviation via spanwise camber morphing"* | 2024 | -40% carga de maniobra a mismo CL |
| *"Flutter analysis of biomimetic morphing wing"* | 2025 | Morfing aumenta velocidad de flutter en 12% |
| *"Neural network controller for smart morphing wings"* | 2025 | Control en tiempo real con latencia <2 ms |
| *"Adaptive morphing avian-informed drones"* (arxiv 2403.08598) | 2024 | UAV vencejo-inspirado: -15-30% consumo |
| MDPI Encyclopedia of Aircraft Wings & Morphing | julio 2025 | Revisión completa del estado del arte |

## Patentes relevantes (USPTO)

| Nº patente | Titular | Descripción | Fecha |
|---|---|---|---|
| US20190256189A1 | — | *Geometric morphing wing with adaptive corrugated structure* | 2019 (publicada) |
| US12466540 | — | *Skin actuated morphing wing* — morfing por tensión de la piel exterior | dic 2023 (filing) |
| US11142296 | — | *Apparatus for laminar flow control* — HLFC con succión en borde de ataque | 2021 |
| US12434818 | — | *Tandem split divergent winglet* — winglet doble con geometría divergente | 2025 |
| RU2637149C1 | — | *Spiroid winglet* — ala espiroidal de punta cerrada | — |
| WO2011103870A3 | — | *Flettner rotor sail* | 2011 (base) |

## Limitaciones y retos abiertos (2025)

```
1. FATIGA: los materiales compliant acumulan ciclos de deformación → vida útil limitada
2. PESO: actuadores SMA/PZT + estructura compliant > peso de superficie convencional
   (en muchos diseños la ganancia aerodinámica no supera la penalización de peso)
3. CERTIFICACIÓN: EASA/FAA no tienen ruta de certificación establecida para alas morfing primarias
4. HIELO: superficies morfing son más difíciles de calentar uniformemente (anti-icing)
5. MANTENIMIENTO: la inspección de superficies compliant es más compleja que superficies rígidas

Horizonte realista de implementación:
  - Borde de fuga morfing en aviones comerciales: 2030-2035 (post-HERWINGT)
  - Ala morfing primaria (sin alerones): 2035-2045 (post-X-65 y sucesores)
  - Twist morfing en turbinas eólicas offshore: 2027-2030 (más cercano)
```
