---
tipo: referencia
sector: carpinteria-cnc
tags: [cnc, maquinas, open-source, diy, maslow, mpcnc, printnc]
---
# Máquinas — Maslow, MPCNC, PrintNC

Tres routers CNC open-source que puedes construir tú mismo, cada una con una filosofía distinta.

## Maslow CNC (Maslow_4)

| | |
|---|---|
| **Diseño** | CNC de cables: la fresa cuelga de 4 correas que tiran desde las esquinas |
| **Área de trabajo** | 4×8 ft (1.2×2.4 m) — un tablero completo de contrachapado |
| **Coste** | ~$500 |
| **Precisión** | ±1 mm (suficiente para muebles y corte de tablero) |
| **Ventaja** | Enorme área de trabajo a precio mínimo, plegable |
| **Limitación** | Solo 2.5D (corte y vaciado), no fresado 3D. Lento (300-800 mm/min) |
| **Controlador** | Firmware propio sobre ESP32 |
| **GitHub** | MaslowCNC/Maslow_4 (273 stars) |

Ideal para: cortar piezas de muebles en tablero de 4×8, cajas, estanterías, casetas.

## MPCNC — Mostly Printed CNC (V1 Engineering)

| | |
|---|---|
| **Diseño** | Estructura de tubos de acero con uniones impresas en 3D |
| **Área de trabajo** | Configurable (típico 60×60 cm) |
| **Coste** | ~$465 (sin incluir impresora 3D) |
| **Precisión** | ±0.5 mm |
| **Ventaja** | Multi-herramienta: router, láser, plotter, drag knife |
| **Limitación** | Rigidez limitada por los tubos — no para aluminio agresivo |
| **Controlador** | Grbl o Marlin sobre Arduino/SKR |
| **Web** | v1engineering.com |

Ideal para: primer proyecto CNC, madera blanda, grabado, corte láser.

## PrintNC

| | |
|---|---|
| **Diseño** | Marco de tubo de acero soldado + guías lineales + husillos de bolas |
| **Área de trabajo** | Configurable (típico 80×120 cm) |
| **Coste** | ~$1000-1500 |
| **Precisión** | ±0.1 mm |
| **Ventaja** | Rigidez real — fresa aluminio sin problema |
| **Limitación** | Requiere soldadura (o comprar marco pre-soldado) |
| **Controlador** | LinuxCNC + Mesa, o FluidNC |
| **GitHub** | threedesigns/printNC (CC BY 4.0) |

Ideal para: CNC seria de taller, aluminio, madera dura, producción.

## Comparativa rápida

| | Maslow | MPCNC | PrintNC |
|---|---|---|---|
| Área | ★★★★★ | ★★★ | ★★★★ |
| Precisión | ★★ | ★★★ | ★★★★★ |
| Rigidez | ★ | ★★ | ★★★★★ |
| Coste | ★★★★★ | ★★★★ | ★★★ |
| Aluminio | ✗ | Suave | ✓ |
| Multi-herramienta | ✗ | ✓ | ✗ |

## Otras menciones

- **DIY-CNC-machine** (maxvfischer, 1.9k stars) — guía completa para construir una CNC desde cero
- **OpenBuilds** — sistema de perfiles V-slot y ruedas para construir CNC modulares
- **LowRider CNC** (V1 Engineering) — CNC de tablero grande alternativa a Maslow, estructura impresa

→ Controladores que las mueven: [[Controladores — Grbl, LinuxCNC, FluidNC]]
→ Optimizar las piezas en tablero: [[Nesting — SVGnest y Deepnest]]
