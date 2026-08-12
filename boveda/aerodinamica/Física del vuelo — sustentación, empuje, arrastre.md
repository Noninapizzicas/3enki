---
tipo: componente
sector: aerodinamica
tags: [fisica, sustentacion, arrastre, empuje, bernoulli, navier-stokes]
---
# Física del vuelo — sustentación, empuje, arrastre

## Las cuatro fuerzas

Todo cuerpo en movimiento relativo a un fluido experimenta cuatro fuerzas en equilibrio:

```
SUSTENTACIÓN (L) ↑          GRAVEDAD (W) ↓
EMPUJE (T)       →          ARRASTRE (D) ←

Condición de vuelo nivelado:  L = W  y  T = D
Ascenso:  L > W  (o  T > D  para ganar velocidad que aumente L)
```

| Fuerza | Símbolo | Dirección | Origen físico |
|---|---|---|---|
| Sustentación | L (Lift) | ⊥ al flujo libre | Diferencia de presión Δp entre extradós e intradós |
| Arrastre | D (Drag) | ∥ al flujo libre, opuesto | Fricción viscosa (skin friction) + presión diferencial (form drag) |
| Empuje | T (Thrust) | ∥ al movimiento | Motor / hélice / vela |
| Peso | W | ↓ (gravedad) | Masa × g |

## Teorema de Bernoulli (flujo incompresible)

```
p + ½ρv² + ρgh = constante a lo largo de una línea de corriente

p      = presión estática   [Pa]
½ρv²   = presión dinámica   [Pa]   q = ½ρv²
ρ      = densidad del fluido [kg/m³]  (aire a 15°C: 1.225 kg/m³)
v      = velocidad local    [m/s]
h      = altura             [m]  (despreciable en aerodinámica subsónica)
```

**Consecuencia en un perfil alar:** el extradós es más curvo → mayor velocidad → menor presión.
El intradós es más plano → menor velocidad → mayor presión. La diferencia de presiones ΔP × S = L.

> Bernoulli es necesario pero no suficiente para explicar sustentación: la circulación (teorema de
> Kutta-Joukowski) completa el cuadro — L = ρ V Γ, donde Γ es la circulación alrededor del perfil.

## Ecuaciones de Navier-Stokes (forma simplificada)

```
ρ (∂u/∂t + u·∇u) = -∇p + μ∇²u + f

ρ  = densidad
u  = campo de velocidades
p  = presión
μ  = viscosidad dinámica
f  = fuerzas externas (gravedad)
```

Para aerodinámica práctica (Re > 10⁵) se trabaja con las ecuaciones de Euler (μ→0) o con las
ecuaciones de Reynolds-Averaged Navier-Stokes (RANS) en CFD.

## Número de Reynolds — el clasificador de régimen

```
Re = (ρ · v · L) / μ = (v · L) / ν

ν (aire, 15°C) = 1.46 × 10⁻⁵ m²/s

Re < 5×10⁵      → flujo laminar dominante (bajo Re)
Re = 5×10⁵–10⁷  → transición laminar-turbulento
Re > 10⁷        → flujo turbulento dominante
```

| Aplicación | Re típico |
|---|---|
| Modelo de túnel de viento (cuerda 5 cm, 10 m/s) | 3.4 × 10⁴ |
| Mini-dron (cuerda 10 cm, 15 m/s) | 10⁵ |
| Avión ultraligero (cuerda 1 m, 30 m/s) | 2 × 10⁶ |
| Avión comercial (cuerda 4 m, 240 m/s a 10 km) | 4 × 10⁷ |
| Pala turbina eólica grande (cuerda 3 m, vrel 60 m/s) | 1.2 × 10⁷ |

**Impacto en el diseño:** un perfil optimizado para Re=10⁶ puede perder hasta 30% de eficiencia si
se usa a Re=10⁵. Los perfiles NACA 4-dígitos son robustos en Re amplio; los supercríticos son
sensibles a la caída de Re.

## Coeficientes adimensionales

```
CL = L / (q · S)     q = ½ρv²     S = área alar de referencia
CD = D / (q · S)
CM = M / (q · S · c)    c = cuerda media

Eficiencia aerodinámica (planeo): E = CL / CD
```

| Perfil / vehículo | CL_max | CD_min | E = CL/CD |
|---|---|---|---|
| NACA 0012 (α=10°) | ~1.2 | 0.012 | ~50 |
| NACA 4412 (α=12°) | ~1.6 | 0.015 | ~90 |
| Planeador moderno | 1.4 | 0.008 | ~60 en vuelo |
| Ala delta subsónica | 0.9 | 0.030 | ~20 |
| Vela rígida (wingsail) | ~2.5 | 0.030 | ~35 |

## Velocidad de pérdida (stall)

```
v_stall = √(2W / ρ S CL_max)

Por debajo de v_stall el ángulo de ataque supera α_crítico (≈12-16° según perfil):
la capa límite se separa → colapso de sustentación.
```

## Polar de arrastre (curva de rendimiento del ala)

```
CD = CD0 + CL² / (π · e · AR)

CD0 = arrastre parásito (fricción + forma a CL=0)
e   = factor de Oswald (eficiencia de planta alar; e=1 planta elíptica, e≈0.8 trapezoidal)
AR  = Alargamiento = b² / S   (b = envergadura)
```

**Regla práctica:** doblar el alargamiento reduce el arrastre inducido a la mitad (con igual CL).
Esto explica los winglets: aumentan el AR efectivo sin aumentar la envergadura física.
