---
tipo: referencia
sector: electronica-maker
tags: [pcb, kicad, eda, esquematico, layout, gerber]
---
# Diseño de PCB — flujo KiCad

KiCad es la suite EDA open-source de referencia para diseño de PCBs. Flujo completo desde esquemático hasta archivos de fabricación.

## Flujo de trabajo

```
1. Esquemático (Eeschema)
   → Símbolos + conexiones eléctricas
   → ERC (Electrical Rules Check)

2. Asignación de footprints
   → Cada símbolo → su huella física (footprint)

3. Layout (Pcbnew)
   → Colocar componentes
   → Rutear pistas (manual o interactivo)
   → DRC (Design Rules Check)

4. Generar archivos de fabricación
   → Gerber (capas de cobre, máscara, serigrafía)
   → Drill files (perforaciones)
   → BOM (lista de materiales)
   → Pick-and-place (posiciones para SMD)

5. Fabricar
   → Enviar Gerbers a JLCPCB / PCBWay / OSH Park
   → o fresado CNC local (para prototipo)
```

## KiCad 8 — características clave

| Característica | Detalle |
|---|---|
| **Capas** | Hasta 32 capas de cobre |
| **Ruteo interactivo** | Push-and-shove (empuja pistas existentes) |
| **3D viewer** | Visualización 3D con modelos STEP |
| **Simulación** | SPICE integrado (ngspice) |
| **Plugin API** | Python scripting para automatización |
| **Formatos** | Importa Eagle, Altium, EasyEDA |

## Herramientas complementarias (open-source)

| Herramienta | Función | Stars |
|---|---|---|
| **InteractiveHtmlBom** | BOM interactivo visual en HTML | 3.5k+ |
| **KiBot** | Automatización CI/CD (genera Gerbers, BOM, 3D, PDF) | 500+ |
| **KiCanvas** | Visor de PCB en navegador (compartir diseños) | 500+ |
| **KiKit** | Panelización automática de PCBs | 400+ |
| **Pinion** | Generador de documentación de pinout | — |

## Reglas de diseño típicas

### 2 capas (prototipo maker)

| Parámetro | Valor mínimo | Recomendado |
|---|---|---|
| Ancho de pista (señal) | 0.15 mm | 0.25 mm |
| Ancho de pista (potencia) | 0.3 mm | 0.5–1.0 mm |
| Clearance | 0.15 mm | 0.2 mm |
| Vía (drill/pad) | 0.3/0.6 mm | 0.4/0.8 mm |
| Anular ring | 0.13 mm | 0.15 mm |

### Cálculo de ancho de pista por corriente

| Corriente | Ancho mínimo (1 oz Cu, ext.) |
|---|---|
| 0.5 A | 0.25 mm |
| 1.0 A | 0.5 mm |
| 2.0 A | 1.0 mm |
| 5.0 A | 2.5 mm |
| 10 A | 5.0 mm+ (o polígono) |

Referencia: IPC-2221 (estándar de diseño de PCB).

## Alternativas a KiCad

| Suite | Tipo | Caso de uso |
|---|---|---|
| **LibrePCB** | Open-source | Interfaz más simple, buena para principiantes |
| **Horizon EDA** | Open-source | Pool de componentes, fabricación profesional |
| **EasyEDA** | Gratuito (cloud) | Integrado con JLCPCB, rápido para prototipos |
| **Eagle** | Comercial (Autodesk) | Legacy, comunidad grande |
| **Altium** | Comercial | Industria profesional |

→ Fabricación: [[Fabricación de PCB — del prototipo a la serie corta]]
→ Ensamblaje SMD: [[Pick and place open-source — LumenPnP]]
