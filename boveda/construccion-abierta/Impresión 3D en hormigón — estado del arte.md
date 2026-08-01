---
tipo: referencia
sector: construccion-abierta
tags: [impresion-3d, hormigon, concreto, construccion, aditiva]
---
# Impresión 3D en hormigón — estado del arte

Fabricación aditiva a gran escala: extruir mezclas cementosas capa a capa para construir muros, estructuras y viviendas.

## Proyectos open-source y abiertos

### MudBot / Massive Dimension

- Extrusor de pasta (hormigón, arcilla, adobe) montable en CNC o robot
- Open-source, diseñado para escalar
- Compatible con impresoras delta y cartesianas grandes

### WASP (World's Advanced Saving Project)

- Crane WASP: impresora delta de 12 m de altura
- Imprime con tierra cruda (0% cemento) — TECLA project (Mario Cucinella)
- Modelo tecno-social: vivienda emergente con material local
- No totalmente open-source pero con documentación técnica abierta

### Contour Crafting (USC)

- Pionero académico (Behrokh Khoshnevis, 2004)
- Concepto: brazo robótico + extrusor + paletas laterales para acabado liso
- Patentes expiradas — la base técnica es libre

## Mezclas para impresión 3D

| Propiedad | Requisito | Rango típico |
|---|---|---|
| **Extrudabilidad** | Fluir por la boquilla sin obstruirse | Slump 0–20 mm |
| **Buildability** | Soportar capas superiores sin colapsar | Yield stress 1.5–3.0 kPa |
| **Open time** | Tiempo trabajable antes de fraguar | 60–120 min |
| **Tamaño boquilla** | Diámetro de extrusión | 20–40 mm |
| **Altura de capa** | Resolución vertical | 10–20 mm |

### Formulación base (por peso)

| Componente | % típico |
|---|---|
| Cemento Portland | 25–35% |
| Arena fina (0–2 mm) | 40–55% |
| Ceniza volante / escoria | 10–20% |
| Aditivo superplastificante | 0.5–1.5% |
| Fibras (PP o vidrio, 6–12 mm) | 0.5–1.0% |
| Agua (relación a/c) | 0.35–0.45 |

## Desafíos técnicos

| Desafío | Problema | Mitigación |
|---|---|---|
| **Unión entre capas** | Junta fría si la capa inferior seca demasiado | Controlar tiempo entre capas (<15 min) |
| **Refuerzo** | Sin encofrado → difícil colocar armadura convencional | Cable continuo entre capas, barras post-insertadas, fibras |
| **Retracción** | Mezclas con alto cemento se agrietan | Curado húmedo, fibras, reductores de retracción |
| **Normativa** | Sin código de edificación específico en la mayoría de países | Ensayos caso por caso, certificación como sistema innovador |
| **Precisión** | ±2–5 mm típico en obra | Suficiente para estructura, acabado requiere revestimiento |

## Alternativas: tierra cruda y adobe

La impresión 3D con tierra cruda (clay/earth) evita el cemento:

- **Material**: tierra local + paja + agua (coste ~$0)
- **Ventaja**: huella de carbono mínima, disponibilidad universal
- **Limitación**: solo climas secos/templados, muros gruesos, secado lento (días por capa)
- **Referencia**: WASP TECLA project, Gaia house (2018)

→ Materiales: [[Materiales de construcción — comparativa maker]]
→ Máquinas CNC: ver sector [[carpinteria-cnc/Máquinas — Maslow, MPCNC, PrintNC]]
