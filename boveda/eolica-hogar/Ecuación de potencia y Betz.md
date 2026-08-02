---
tipo: principio
sector: eolica-hogar
tags: [fisica, potencia, betz]
---
# Ecuación de potencia y Betz

## La ecuación fundamental

```
P = ½ × ρ × A × v³ × Cp × η_gen × η_elec

ρ     = densidad del aire (1.225 kg/m³ a nivel del mar, 15 °C)
A     = área barrida (π × r²)  [m²]
v     = velocidad del viento   [m/s]
Cp    = coeficiente de potencia (fracción de energía extraída)
η_gen = rendimiento del generador (0.80–0.95)
η_elec = rendimiento eléctrico (rectificador + controlador, ~0.90)
```

**v³ domina** — duplicar la velocidad del viento = **8× la potencia**. Por eso la ubicación y altura de torre importan más que la eficiencia del rotor.

## Límite de Betz (1919)

**Cp_max = 16/27 ≈ 0.593** — ningún rotor puede extraer más del 59.3% de la energía cinética del viento. Es un límite termodinámico (el aire tiene que salir con alguna velocidad, no puede frenarse a cero).

| Tipo de rotor | Cp típico | TSR típico |
|---|---|---|
| HAWT 3 palas moderno | 0.35–0.45 | 6–8 |
| HAWT 2 palas | 0.30–0.40 | 8–12 |
| Darrieus H-rotor | 0.25–0.35 | 4–6 |
| Savonius | 0.10–0.18 | 0.8–1.2 |
| Multi-pala (bombeo) | 0.25–0.30 | 1–2 |

## TSR (Tip Speed Ratio)

```
TSR = (ω × R) / v

ω = velocidad angular [rad/s]
R = radio del rotor [m]
v = velocidad del viento [m/s]
```

TSR alto (6–8) = rotor rápido, pocas palas, buen para generación eléctrica.
TSR bajo (1–2) = rotor lento, muchas palas, bueno para bombeo.

## Producción anual estimada (AEP)

```
AEP [kWh/año] ≈ P_rated × 8760 × CF

CF (factor de capacidad):
  Sitio excelente (v_media > 6 m/s):  20–30%
  Sitio bueno (5–6 m/s):              15–20%
  Sitio marginal (4–5 m/s):           8–15%
  Sitio pobre (<4 m/s):               NO VIABLE
```

Ejemplo: turbina 3 kW en sitio con v_media 5.5 m/s (CF ~18%) → **3 × 8760 × 0.18 ≈ 4.730 kWh/año**.

## Comparación con solar FV

A **igual coste** (~3.000–5.000 EUR para 3 kW), el solar FV produce más kWh/año en la mayoría de ubicaciones de España (irradiación alta, viento inconsistente). La eólica complementa en: noches, invierno, zonas costeras/montañosas con viento constante. El **híbrido eólico+solar** es la combinación óptima — se compensan estacionalmente.
