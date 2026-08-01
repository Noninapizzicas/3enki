---
tipo: referencia
sector: metalurgia-diy
tags: [soldadura, mig, tig, electrodo, union, metal]
---
# Soldadura — procesos y elección

Unir metal por fusión: los tres procesos accesibles al maker y cuándo usar cada uno.

## Comparativa

| | MIG/MAG (GMAW) | TIG (GTAW) | Electrodo (SMAW) |
|---|---|---|---|
| **Principio** | Hilo continuo + gas protector | Electrodo de tungsteno + gas argón + aporte manual | Electrodo revestido consumible |
| **Gas** | CO₂, Argón, mezcla | Argón puro | No (el revestimiento genera gas) |
| **Velocidad** | ★★★★★ | ★★ | ★★★ |
| **Calidad** | ★★★ | ★★★★★ | ★★ |
| **Aprendizaje** | ★★★★ (fácil) | ★★ (difícil) | ★★★ |
| **Exterior/viento** | ✗ (el viento sopla el gas) | ✗ | ✓ |
| **Espesores finos** | Desde 0.6 mm | Desde 0.3 mm | Desde 2 mm |
| **Aluminio** | Sí (hilo Al + Argón puro) | Sí (AC, el mejor) | No práctico |
| **Acero inox** | Sí | Sí (el mejor) | Sí (electrodos inox) |
| **Coste equipo** | $300–$2.000 | $500–$3.000 | $100–$500 |

## Cuándo usar cada uno

- **MIG**: producción, cordones largos, acero estructural, chasis, muebles metálicos. El "caballo de batalla" del taller
- **TIG**: trabajo fino, visible, crítico. Acero inoxidable, aluminio, bicicletas, tubería, arte
- **Electrodo**: campo, reparaciones, estructuras pesadas, donde no hay electricidad limpia (generador)

## Parámetros fundamentales

### MIG

| Parámetro | Rango típico (acero) |
|---|---|
| Voltaje | 17–25 V |
| Velocidad de hilo | 3–12 m/min |
| Gas | CO₂ puro (barato) o 75% Ar + 25% CO₂ (mejor acabado) |
| Stick-out | 10–15 mm |

### TIG

| Parámetro | Rango típico |
|---|---|
| Amperaje | 10–200 A |
| Gas argón | 5–15 L/min |
| Electrodo tungsteno | 1.6 mm (fino) – 3.2 mm (grueso) |
| AC (aluminio) / DC (acero) | Según material |

## Preparación de la unión

| Espesor | Preparación |
|---|---|
| < 3 mm | Sin preparación (tope o solape) |
| 3–6 mm | Bisel en V a 30° |
| 6–12 mm | Bisel en V a 30-37.5° |
| > 12 mm | Doble V o bisel en X |

Siempre: limpiar óxido, grasa y pintura antes de soldar. Amoladora con disco flap o cepillo de alambre.

## Seguridad

- **Careta autodarkening**: DIN 9–13 según amperaje. Protege de radiación UV/IR
- **Guantes de cuero**: de caña larga, secos
- **Ventilación**: los humos de soldadura son carcinógenos (especialmente inox y galvanizado). Extracción localizada o respirador P100
- **Ropa**: algodón o cuero. Nunca sintético (se funde)
- **Incendio**: chispas a 3+ metros. Zona despejada, extintor cerca

→ Corte de piezas: [[Plasma CNC — máquinas open-source]]
→ Diseño en chapa: [[Chapa — diseño y desarrollo plano]]
