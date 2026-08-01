---
tipo: referencia
sector: electronica-maker
tags: [pick-and-place, lumen-pnp, smd, ensamblaje, open-source]
---
# Pick and place open-source — LumenPnP

Máquinas de colocación automática de componentes SMD para series cortas, con diseño open-source.

## LumenPnP (Opulo)

La máquina pick-and-place open-source más madura y activa.

| Aspecto | Detalle |
|---|---|
| **Proyecto** | Opulo LumenPnP v4 |
| **Tipo** | Pick-and-place de escritorio |
| **Velocidad** | ~1.000 componentes/hora |
| **Precisión** | ±0.1 mm |
| **Componentes** | 0402 hasta QFP-208 |
| **Feeders** | 8 mm tape, corte (cut tape), bandeja |
| **Visión** | Cámaras top + bottom para alineación automática |
| **Software** | OpenPnP (open-source) |
| **Coste** | ~$1.500 (kit) |
| **Licencia** | Open-source hardware (CERN OHL) |

### OpenPnP (software de control)

| Característica | Detalle |
|---|---|
| **Función** | Control de la máquina PnP: feeders, visión, colocación |
| **Input** | Archivos pick-and-place (CSV de KiCad/Eagle) |
| **Visión** | Reconocimiento de fiduciales, alineación de componente |
| **Feeders** | Auto-learn de posiciones, múltiples tipos |
| **Plataforma** | Java, multiplataforma |
| **Comunidad** | Activa, documentación extensa |

## Flujo de ensamblaje SMD

```
1. Diseñar PCB (KiCad) → exportar BOM + pick-and-place CSV
2. Fabricar PCB (JLCPCB / fresado local)
3. Aplicar pasta de soldadura
   → Stencil (lámina de acero/Kapton con aberturas) + rasqueta
   → o dispensador de pasta (manual o con syringe)
4. Colocar componentes (LumenPnP + OpenPnP)
5. Soldar por reflujo (reflow)
   → Horno de reflujo o hot plate + perfil de temperatura
6. Inspección + retoque manual si necesario
```

## Pasta de soldadura y reflow

### Stencil

| Aspecto | Detalle |
|---|---|
| **Material** | Acero inox 0.12 mm (estándar) o Kapton (DIY) |
| **Fuente** | JLCPCB/PCBWay incluyen stencil por $3–$8 |
| **Alternativa DIY** | Cortar Kapton con plotter o láser |

### Horno de reflow DIY

| Opción | Coste | Control |
|---|---|---|
| **Hot plate (plancha)** | $30–$50 | Manual — observar la pasta |
| **Horno tostador modificado** | $50–$100 | PID con termopar (ESP32/Arduino) |
| **Horno comercial** | $300–$1.500 | Perfil automático, convección |

### Perfil de reflow (pasta Sn63/Pb37)

```
Zona 1 — Precalentamiento: 25°C → 150°C @ 1–3°C/s (60–90s)
Zona 2 — Soak:             150°C → 183°C (60–120s)
Zona 3 — Reflow:           183°C → 230°C pico (30–60s sobre liquidus)
Zona 4 — Enfriamiento:     230°C → 25°C @ 2–4°C/s
```

## Alternativas a LumenPnP

| Proyecto | Enfoque | Estado |
|---|---|---|
| **Index PnP** | PnP open-source, diseño paralelo | Activo, comunidad menor |
| **Neoden YY1** | Comercial económico | ~$3.000, no open-source |
| **Manual con microscopio** | Pinzas + estereomicroscopio | $0 (hasta 0603 con práctica) |

→ Diseño de la PCB: [[Diseño de PCB — flujo KiCad]]
→ Controladores de horno para reflow: [[metalurgia-diy/Controladores de horno — PID con ESP32 y RPi]]
