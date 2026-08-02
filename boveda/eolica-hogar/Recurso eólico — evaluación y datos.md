---
tipo: recurso
sector: eolica-hogar
tags: [viento, recurso, evaluacion, api]
---
# Recurso eólico — evaluación y datos

## Regla de oro

**v_media anual >= 4.5 m/s a la altura del buje** — por debajo, la eólica doméstica NO es viable económicamente. Medir mínimo 12 meses antes de invertir.

## Fuentes de datos gratuitas

### Open-Meteo (la mejor para integrar — sin auth, JSON, gratis)
```
GET api.open-meteo.com/v1/forecast
  ?latitude=40.4168&longitude=-3.7038
  &hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m
  &past_days=92

Variables disponibles:
  wind_speed_10m     velocidad a 10m [km/h]
  wind_speed_80m     velocidad a 80m [km/h]
  wind_speed_120m    velocidad a 120m
  wind_direction_10m dirección [grados]
  wind_gusts_10m     rachas [km/h]
  
Histórico: api.open-meteo.com/v1/archive (desde 1940)
```

### Global Wind Atlas (globalwindatlas.info)
Mapas de viento a 10m, 50m, 100m, 150m, 200m. Resolución ~250m. Descarga GIS. Proyecto Banco Mundial + DTU.

### IDAE — Atlas Eólico de España
Mapas oficiales del recurso eólico español. Velocidades medias por zona a diferentes alturas. Las mejores zonas: **Galicia costera, Estrecho de Gibraltar, Valle del Ebro, Canarias, crestas de montaña**.

### ERA5 (ECMWF)
Reanálisis global, resolución 0.25° (~31 km), horario, desde 1940. Gratis con registro en CDS (Copernicus).

## Distribución de Weibull

La velocidad del viento NO sigue distribución normal — sigue **Weibull** con dos parámetros:
- **k** (forma): 1.5–3.0, típico ~2 (Rayleigh). k=2 es la aproximación más usada.
- **A** (escala): ≈ 1.13 × v_media

```
P(v) = (k/A) × (v/A)^(k-1) × exp(-(v/A)^k)
```

k alto (>2.5) = viento constante (bueno) — menos variabilidad.
k bajo (<1.5) = viento errático (malo) — muchas calmas + rachas.

## Rosa de los vientos

Imprescindible para orientar la turbina (HAWT) y detectar obstáculos. Herramientas:
- **windrose** (Python): `pip install windrose` — genera rosas de frecuencia y energía.
- **brightwind** (Python): análisis completo de recurso eólico, shear, Weibull, MCP.

## Cizalladura vertical (wind shear)

```
v2 = v1 × (h2/h1)^α

α = exponente de cizalladura:
  terreno abierto/mar:    0.10–0.14
  suburbano:              0.20–0.30
  urbano/bosque:          0.30–0.40
```

Ejemplo: v_10m = 4 m/s, α = 0.20 → v_20m = 4 × (20/10)^0.20 = **4.6 m/s** (+15%).
**Subir la torre de 10 a 20m puede aumentar la producción un 50%** (v³).

## Micro-siting (dónde poner la turbina)

- **Regla 10×10**: el buje debe estar al menos 10m por encima del obstáculo más cercano en 150m de radio.
- Evitar zonas de turbulencia: sotavento de edificios, árboles, crestas abruptas.
- Medir con anemómetro a la altura del buje durante 12 meses (mínimo 6).
- Los datos de estaciones meteorológicas cercanas son orientativos, no definitivos — el microclima local varía mucho.
