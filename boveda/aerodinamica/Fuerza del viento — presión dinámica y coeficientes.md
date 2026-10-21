---
tipo: componente
sector: aerodinamica
tags: [viento, presion-dinamica, coeficientes, beaufort, cargas]
---
# Fuerza del viento — presión dinámica y coeficientes

## La ecuación fundamental

```
q = ½ · ρ · v²

q  = presión dinámica  [Pa = N/m²]
ρ  = densidad del aire [kg/m³]
v  = velocidad del viento [m/s]

F = q · A · Cf

A  = área de referencia [m²]
Cf = coeficiente de fuerza adimensional (depende de forma y orientación)
```

**Relación cuadrática clave:** duplicar la velocidad del viento cuadruplica la fuerza.
A 10 m/s → 61 Pa. A 20 m/s → 245 Pa. A 40 m/s → 980 Pa (≈ 100 kg/m²).

## Densidad del aire según altitud y temperatura

```
ρ₀ = 1.225 kg/m³  (ISA, nivel del mar, 15°C)

Corrección por temperatura:   ρ = ρ₀ · (273 / (273 + T°C))
Corrección por altitud:       ρ ≈ ρ₀ · e^(-h / 8500)

Altitud 1000 m, 20°C:  ρ ≈ 1.11 kg/m³
Altitud 2000 m, 15°C:  ρ ≈ 1.007 kg/m³
```

## Escala de Beaufort — velocidades y presiones dinámicas

| Bf | Nombre | v (m/s) | v (km/h) | q (Pa) | Efecto visible |
|---|---|---|---|---|---|
| 0 | Calma | 0-0.2 | <1 | 0 | Humo sube vertical |
| 1 | Ventolina | 0.3-1.5 | 1-5 | 0.1 | Dirección por humo |
| 2 | Brisa muy débil | 1.6-3.3 | 6-11 | 3 | Veleta se mueve |
| 3 | Brisa débil | 3.4-5.4 | 12-19 | 18 | Hojas en movimiento |
| 4 | Brisa moderada | 5.5-7.9 | 20-28 | 38 | Ramas pequeñas |
| 5 | Brisa fresca | 8.0-10.7 | 29-38 | 70 | Árboles pequeños se balancean |
| 6 | Brisa fuerte | 10.8-13.8 | 39-49 | 117 | Ramas gruesas se mueven |
| 7 | Viento fuerte | 13.9-17.1 | 50-61 | 179 | Árboles enteros se mueven |
| 8 | Temporal | 17.2-20.7 | 62-74 | 263 | Ramas se rompen |
| 9 | Fuerte temporal | 20.8-24.4 | 75-88 | 365 | Daños leves en edificios |
| 10 | Tempestad | 24.5-28.4 | 89-102 | 494 | Árboles arrancados |
| 11 | Borrasca | 28.5-32.6 | 103-117 | 651 | Daños generalizados |
| 12 | Huracán | >32.7 | >118 | >655 | Devastación |

## Coeficientes de fuerza por forma

### Coeficiente de arrastre CD (a flujo perpendicular)

| Forma | CD | Notas |
|---|---|---|
| Placa plana (frontal) | 1.28 | Referencia máxima |
| Cubo | 1.05 | Presión en cara frontal + succión trasera |
| Esfera (Re > 10⁵) | 0.47 | Capa límite turbulenta retrasa separación |
| Esfera (Re < 10⁵) | 0.5 | Laminar, burbuja de separación |
| Cilindro largo (⊥ flujo) | 1.0–1.2 | Crisis a Re≈5×10⁵ → 0.3 (turbulento) |
| Perfil NACA 0012 (α=0°) | 0.006 | Solo fricción |
| Perfil NACA 0012 (α=15°) | 0.025 | Separación parcial |
| Cuerpo aerodinámico (ej. auto F1) | 0.7–1.0 | Downforce incluida |
| Auto deportivo moderno | 0.25–0.30 | Optimizado |
| Camión sin deflector | 0.9 | Alta inversión en deflectores ≈ 10% combustible |

### Coeficiente de presión Cp (distribución local)

```
Cp = (p - p∞) / q∞

Cp = +1.0  → punto de remanso (stagnation point — velocidad nula)
Cp = 0.0   → presión local = presión de flujo libre
Cp < 0     → succión (extradós de un ala en sustentación)
Cp_min → -3 a -5 en perfil a alto ángulo de ataque antes del stall
```

## Cargas de viento en estructuras

### Eurocódigo EN 1991-1-4 (carga básica de viento)

```
w_e = q_p(z) · c_pe

q_p(z) = presión de pico a altura z (incluye turbulencia)
        = q_b · c_e(z)   (q_b = presión básica del viento por zona geográfica)

c_pe   = coeficiente de presión exterior (por forma y zona de la estructura)
```

| Zona España | v_b (m/s) | q_b (Pa) |
|---|---|---|
| Zona A (interior meseta) | 26 | 0.42 kN/m² |
| Zona B (litoral atlántico/mediterráneo) | 27 | 0.45 kN/m² |
| Zona C (Galicia, Canarias, crestas) | 29 | 0.52 kN/m² |

### Efecto de altura (perfil de viento)

```
v(z) = v_ref · (z / z_ref)^α

α = 0.10  (mar abierto, terreno liso)
α = 0.16  (campo abierto, poca vegetación)
α = 0.28  (terreno urbano, obstáculos)
α = 0.40  (ciudad densa)

A 10 m (z_ref), v = 10 m/s:
  A 30 m → v = 10 × (30/10)^0.16 = 11.7 m/s  (terreno abierto)
  A 30 m → v = 10 × (30/10)^0.10 = 11.2 m/s  (mar)
```

## Presión de viento en velas y perfiles

Para una vela o ala rígida generando sustentación:

```
L = CL · ½ρv² · S
D = CD · ½ρv² · S

Vela de barco (CL≈1.5, S=50 m², v=10 m/s):
  L = 1.5 × 61 × 50 = 4.575 kN  → fuerza lateral disponible para propulsar el casco
```

La velocidad efectiva sobre una vela es la **velocidad aparente del viento** (VAW),
resultante vectorial de la velocidad del viento real y la velocidad del barco.
