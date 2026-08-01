---
tipo: referencia
sector: construccion-abierta
tags: [materiales, construccion, comparativa, hormigon, madera, tierra, acero]
---
# Materiales de construcción — comparativa maker

Materiales accesibles al auto-constructor y maker: propiedades, coste y aplicaciones.

## Comparativa general

| Material | Densidad (kg/m³) | Resistencia compresión (MPa) | Coste ($/m³) | Huella CO₂ (kg CO₂/m³) | Fabricable DIY |
|---|---|---|---|---|---|
| **Hormigón armado** | 2.400 | 25–50 | $80–$150 | 300–400 | Parcial (mezcla sí, armado requiere know-how) |
| **Acero estructural** | 7.850 | 250–400 (tracción) | $3.000–$8.000 | 1.500–2.000 | No (requiere laminado industrial) |
| **Madera (pino)** | 500 | 30–50 (paralelo fibra) | $200–$600 | 20–50 (negativo si bosque sostenible) |  Sí (aserradero + CNC) |
| **Plywood estructural** | 600 | 25–40 | $400–$800 | 50–100 | Sí (corte CNC directo) |
| **Ladrillo cerámico** | 1.800 | 10–30 | $60–$120 | 200–300 | No (requiere horno industrial) |
| **BTC (bloque tierra)** | 1.900 | 3–10 | $15–$40 | 10–30 | Sí (CEB Press) |
| **Cob / adobe** | 1.600 | 1–3 | $5–$15 | 5–10 | Sí (manos + molde) |
| **Tapial** | 2.000 | 2–5 (hasta 10 estabilizado) | $30–$80 | 10–40 | Sí (encofrado + pisón) |
| **Earthbag** | 1.800 | 3–8 (muro compuesto) | $5–$20 | 5–15 | Sí (sacos + pala) |
| **Ferrocemento** | 2.200 | 15–30 | $40–$80 | 100–150 | Sí (malla + mortero) |

## Ferrocemento — el material maker por excelencia

Capas de malla de acero (gallinero, malla electrosoldada) recubiertas con mortero de cemento rico (1:2 cemento:arena). Inventado por Pier Luigi Nervi (1940s).

| Propiedad | Valor |
|---|---|
| **Espesor típico** | 15–30 mm |
| **Resistencia** | 15–30 MPa (comparable al hormigón pero en lámina delgada) |
| **Forma** | Cualquiera (láminas curvas, cascarones, tanques, barcos) |
| **Coste** | $40–$80/m² |
| **Herramientas** | Alicates, llana, paleta. Cero maquinaria |

### Aplicaciones

- **Tanques de agua** (ferrocemento es el estándar en países en desarrollo — OMS)
- **Techos de cáscara** (thin-shell: 25 mm de espesor cubre luces de 6+ m)
- **Barcos** (sí, flotan — hay una tradición de barcos de ferrocemento desde los 60s)
- **Biodigestores** — tanque enterrado para producción de biogás
- **Mobiliario** — mesas, bancas, elementos de jardín

## Aislamiento térmico

| Material | λ (W/m·K) | Coste ($/m²·R1) | DIY | Notas |
|---|---|---|---|---|
| **Paja (fardos)** | 0.05–0.07 | $2–$5 | Sí | R-30 en muro de 450 mm. Requiere revoco para fuego |
| **Celulosa** | 0.04 | $5–$10 | Parcial (máquina sopladora) | Papel reciclado. Buen aislante acústico |
| **Lana mineral** | 0.035 | $8–$15 | No | Estándar industrial |
| **EPS (poliestireno)** | 0.035 | $5–$10 | No | Derivado del petróleo |
| **Corcho** | 0.04 | $15–$25 | No | Renovable, excelente |
| **Tierra (muro masivo)** | 0.5–1.0 | — | Sí | Inercia térmica, no aislamiento. Eficaz en clima con oscilación día/noche |

## Criterios de elección para el maker

```
1. ¿Tienes acceso a tierra arcillosa local?
   Sí → earthbag, cob, adobe, tapial, BTC
   No → madera (CNC), hormigón, ferrocemento

2. ¿Necesitas rapidez?
   Sí → plywood CNC (WikiHouse), BTC (CEB Press), hormigón
   No → cob, earthbag (labor-intensive pero barato)

3. ¿Presupuesto mínimo?
   Sí → cob ($2/m²), earthbag ($5/m²), adobe ($3/m²)
   No → WikiHouse ($230–450/m² completa), hormigón

4. ¿Zona sísmica?
   Sí → earthbag domo, tapial reforzado, madera (CNC frame)
   No → cualquier técnica con diseño adecuado

5. ¿Necesitas acabado convencional?
   Sí → WikiHouse (plywood + acabados), hormigón
   No → tapial (muro es acabado), earthbag + revoco
```

→ WikiHouse: [[WikiHouse — vivienda CNC open-source]]
→ Earthbag: [[Earthbag y construcción natural]]
→ OSE máquinas: [[Open Source Ecology — máquinas de civilización]]
→ Madera para CNC: [[carpinteria-cnc/Materiales — maderas y tableros]]
