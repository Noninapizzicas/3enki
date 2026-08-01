---
tipo: referencia
sector: carpinteria-cnc
tags: [cnc, fresado, fundamentos, ejes]
---
# Principio — fresado CNC en madera

## Qué es una CNC router

Una CNC (Computer Numerical Control) router es una máquina que mueve una fresa motorizada sobre 2–3 ejes (X, Y, Z) siguiendo instrucciones G-code. La fresa gira a alta velocidad (10.000–30.000 RPM) y arranca material por contacto.

A diferencia de una impresora 3D (fabricación aditiva), la CNC es **sustractiva**: parte de un bloque o tablero y quita lo que sobra.

## Operaciones fundamentales

| Operación | Descripción | Uso típico |
|---|---|---|
| **Perfil (contour)** | Corta el perímetro de la pieza, atravesando el material | Recortar piezas de tablero |
| **Vaciado (pocket)** | Fresa un área cerrada a profundidad parcial | Rebajes, alojamientos, inlays |
| **Taladrado (drill)** | Perfora agujeros a posiciones exactas | Tornillería, pasadores |
| **Grabado (engrave)** | Marca superficial con fresa fina en V | Texto, logos, decoración |
| **Ranurado (slot)** | Canal recto o curvo | Guías, ranuras de ensamble |

## Ejes y grados de libertad

- **3 ejes** (X, Y, Z): el 95% de las CNC de taller. Fresa siempre perpendicular al tablero.
- **3+1 ejes**: añade un eje rotativo (A) para piezas cilíndricas (patas de mesa, torneado CNC).
- **5 ejes**: la fresa puede inclinarse (A + B). Piezas complejas en 3D, moldes, escultura.

Para carpintería DIY, 3 ejes cubren prácticamente todo el trabajo.

## G-code y cadena de diseño

```
Diseño (CAD) → Trayectorias (CAM) → G-code → Controlador → Motores
```

1. **CAD** — FreeCAD, Fusion 360, OpenSCAD, Inkscape (2D)
2. **CAM** — genera las trayectorias de la fresa: velocidad de avance, profundidad de pasada, estrategia de vaciado
3. **G-code** — archivo de texto con coordenadas y velocidades
4. **Controlador** — Grbl (Arduino), LinuxCNC (PC), FluidNC (ESP32)
5. **Motores** — steppers NEMA 17/23 o servos

## Parámetros clave

| Parámetro | Qué controla | Rango típico madera |
|---|---|---|
| **Velocidad de husillo** | RPM de la fresa | 12.000–24.000 RPM |
| **Avance (feed rate)** | Velocidad horizontal de la fresa | 500–3000 mm/min |
| **Profundidad de pasada** | Cuánto baja en cada pasada | 1–6 mm (según fresa y madera) |
| **Paso lateral (stepover)** | Solapamiento entre pasadas paralelas | 40–60% del diámetro de fresa |

Regla general: madera blanda (pino) tolera más agresividad; madera dura (roble, haya) pide pasadas más finas y velocidades menores.

→ Máquinas: [[Máquinas — Maslow, MPCNC, PrintNC]]
→ Controladores: [[Controladores — Grbl, LinuxCNC, FluidNC]]
