---
tipo: referencia
sector: carpinteria-cnc
tags: [controlador, grbl, linuxcnc, fluidnc, g-code, firmware]
---
# Controladores — Grbl, LinuxCNC, FluidNC

El controlador interpreta G-code y genera señales de paso/dirección para los motores stepper. Es el cerebro de la CNC.

## Comparativa

| | Grbl | LinuxCNC | FluidNC |
|---|---|---|---|
| **Hardware** | Arduino Uno/Mega | PC con puerto paralelo o Mesa | ESP32 |
| **Ejes** | 3 (6 con Grbl-Mega) | Hasta 9 | Hasta 6 |
| **Interfaz** | Serie USB | GUI nativa (Axis, GMOCCAPY) | Web WiFi integrada |
| **Lenguaje** | C (optimizado AVR) | C/Python | C++ |
| **Stars GitHub** | 5k+ (grbl/grbl) | 2.4k | — |
| **Licencia** | GPLv3 | GPLv2 | GPLv3 |
| **Ideal para** | CNC pequeña, láser | CNC industrial/grande, torno | CNC WiFi, maker |

## Grbl

El estándar de facto para CNC hobby. Corre en un Arduino Uno ($3) y maneja 3 ejes con precisión suficiente para madera y PCB.

- **Entrada**: G-code por serie USB (115200 baud)
- **Salida**: step/dir para drivers (A4988, DRV8825, TMC2209)
- **Boards populares**: CNC Shield v3 ($5) sobre Arduino Uno
- **Hosts**: Universal Gcode Sender (UGS), CNCjs, bCNC, OpenBuilds CONTROL
- **Limitaciones**: 3 ejes, sin spindle closed-loop, sin macros complejas

## LinuxCNC

Control CNC de grado industrial, open-source desde 1989 (originalmente NIST). Soporta fresadoras, tornos, plasma, robots.

- Requiere PC dedicado con kernel PREEMPT-RT
- Interfaz paralela para timing preciso (o tarjetas Mesa FPGA)
- Soporta compensación de herramienta, ciclos fijos, macros O-code
- GUI: Axis (2D), GMOCCAPY (pantalla táctil), QtDragon

## FluidNC

Sucesor de Grbl_ESP32. Aprovecha el WiFi del ESP32 para eliminar el cable USB.

- Configuración por YAML (no recompila firmware)
- Web UI integrada: carga G-code, jog, estado
- Soporta múltiples cinemáticas (cartesiana, CoreXY, delta)
- Ideal para CNC en taller sin PC dedicado

## Elección

- **Primer proyecto / presupuesto mínimo**: Grbl + Arduino Uno + CNC Shield
- **CNC seria / torno / plasma**: LinuxCNC + Mesa 7i76e
- **CNC WiFi / maker**: FluidNC + ESP32

→ Máquinas que usan estos controladores: [[Máquinas — Maslow, MPCNC, PrintNC]]
