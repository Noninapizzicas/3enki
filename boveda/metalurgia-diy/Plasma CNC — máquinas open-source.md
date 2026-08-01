---
tipo: referencia
sector: metalurgia-diy
tags: [plasma, cnc, corte, metal, open-source]
---
# Plasma CNC — máquinas open-source

Una cortadora CNC de plasma mueve una antorcha de plasma sobre una mesa, cortando chapa de acero o aluminio con precisión milimétrica.

## Proyectos open-source

### GoodEnoughCNC-PlasmaCutter (IRNAS)

- Diseño híbrido plasma + fresadora
- Bajo coste, interfaz de fibra óptica
- Controlador de altura de antorcha (THC) propio
- Filosofía "good enough" — funcional, no perfecto

### CNC-Plasma-Cutter (cubanmakers)

- CNC plasma open-source completa
- Documentación de construcción paso a paso

### CNC-Plasma-Table (goscommons)

- Mesa CNC torch para corte de metal
- Diseño modular

## Componentes de un sistema plasma CNC

| Componente | Función | Coste típico |
|---|---|---|
| **Fuente de plasma** | Genera el arco (Hypertherm, CUT-50) | $200–$2.000 |
| **Mesa CNC** | Estructura con guías lineales | $500–$2.000 (DIY) |
| **THC** | Control de altura de antorcha automático | $100–$400 |
| **Controlador** | LinuxCNC, Grbl, o FluidNC | $50–$200 |
| **Extracción** | Ventilación de humos (obligatoria) | $200–$500 |
| **Mesa de agua** | Reduce humo y deformación | Integrada o aparte |

## Parámetros de corte

| Material | Espesor | Amperaje | Velocidad |
|---|---|---|---|
| Acero al carbono | 3 mm | 30 A | 1.500 mm/min |
| Acero al carbono | 6 mm | 45 A | 800 mm/min |
| Acero al carbono | 12 mm | 60 A | 400 mm/min |
| Acero inoxidable | 3 mm | 40 A | 1.200 mm/min |
| Aluminio | 3 mm | 45 A | 1.800 mm/min |
| Aluminio | 6 mm | 60 A | 1.000 mm/min |

## Seguridad

- **Ventilación**: los humos de plasma son tóxicos (óxidos metálicos). Extracción obligatoria o trabajar al exterior
- **Protección ocular**: cristal tintado DIN 5-8 (más claro que soldadura)
- **Ruido**: 90-110 dB. Protección auditiva obligatoria
- **Incendio**: chispas y metal fundido. Mesa sobre superficie no combustible
- **Electricidad**: la fuente de plasma trabaja a 100-300 V DC. No tocar la antorcha con el arco encendido

→ Optimizar piezas en chapa: [[Nesting para metal]]
→ Controladores CNC: ver sector [[carpinteria-cnc/Controladores — Grbl, LinuxCNC, FluidNC]]
