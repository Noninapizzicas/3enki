---
tipo: componente
sector: electromecanica-ondas
tags: [maxwell, faraday, lenz, lorentz, fisica, electromagnetismo]
---
# Física del electromagnetismo — Maxwell, Faraday, Lenz, Lorentz

## Las cuatro ecuaciones de Maxwell — en palabras primero

```
1. Ley de Gauss (E):   las cargas eléctricas crean campos eléctricos
2. Ley de Gauss (B):   no existen monopolos magnéticos (las líneas B se cierran)
3. Ley de Faraday:     un campo magnético VARIABLE crea un campo eléctrico (→ generador)
4. Ley de Ampère-Maxwell: una corriente O un campo eléctrico VARIABLE crea campo magnético (→ motor)
```

### Forma diferencial (lo que aparece en los libros)

```
∇·E  = ρ/ε₀                    (Gauss E — densidad de carga genera campo E)
∇·B  = 0                        (Gauss B — no hay carga magnética)
∇×E  = -∂B/∂t                  (Faraday — variación de B induce E)
∇×B  = μ₀J + μ₀ε₀ ∂E/∂t       (Ampère-Maxwell — corriente + variación de E generan B)

ε₀ = 8.854 × 10⁻¹² F/m   (permitividad del vacío)
μ₀ = 4π × 10⁻⁷ H/m        (permeabilidad del vacío)
c  = 1/√(μ₀ε₀) = 3×10⁸ m/s  (velocidad de la luz — sale de Maxwell, no se postula)
```

**El gran resultado de Maxwell (1865):** las ecuaciones 3 y 4 acopladas predicen una onda
que se propaga a velocidad c. Esa onda es la luz. Y también las ondas de radio, los rayos X,
el microondas — todo el espectro electromagnético.

## Ley de Faraday — el corazón del generador

```
FEM = -dΦ_B/dt

FEM = fuerza electromotriz inducida [V]
Φ_B = flujo magnético = ∫ B · dA  [Wb = V·s]

Para N espiras:
  FEM = -N · dΦ/dt

En un generador rotativo (bobina que gira en campo B uniforme):
  Φ(t) = B · A · cos(ωt)
  FEM(t) = N · B · A · ω · sin(ωt) = V_max · sin(ωt)

  V_max = N · B · A · ω

  N  = número de espiras
  B  = densidad de flujo [T]
  A  = área de la espira [m²]
  ω  = velocidad angular [rad/s] = 2π · n/60  (n en RPM)
```

**Regla práctica:** para aumentar la tensión generada → más espiras (N), campo más fuerte (B),
área mayor (A) o girar más rápido (ω). Estas son exactamente las palancas del diseño de un PMG.

## Ley de Lenz — la dirección de la inducción

```
La corriente inducida siempre se opone al cambio que la produce.

→ Si B aumenta hacia arriba, la corriente inducida crea B hacia abajo (se opone)
→ Si muevo un conductor en un campo magnético, la fuerza sobre él es contraria al movimiento

Consecuencia para motores/generadores:
  - En un GENERADOR: hace falta fuerza mecánica para vencer la oposición (es el par resistente)
  - En un MOTOR: si le corto la corriente, la inercia genera FEM opuesta a la fuente (freno)
  - En un TRANSFORMADOR: la carga en el secundario se "refleja" al primario
```

## Fuerza de Lorentz — el corazón del motor

```
F = q(E + v×B)

Sobre un conductor de longitud L con corriente I en campo B:
  F = I · L × B     [N]
  |F| = I · L · B · sin(θ)

  θ = ángulo entre la dirección de la corriente y el campo B
  Máximo cuando θ = 90° (corriente perpendicular a B)

Regla de la mano derecha (conductor):
  Dedos → dirección de B
  Pulgar → dirección de I
  Palma empuja → dirección de F
```

**En un motor DC:** la corriente en los conductores de la armadura × campo del imán = par (torque).
El par es máximo cuando la armadura es perpendicular a B → por eso el conmutador/escobillas
mantienen la corriente siempre en la posición óptima.

## Densidad de flujo magnético B y campo H

```
B = μ₀ · μ_r · H

B  = densidad de flujo [T = Wb/m² = kg/(A·s²)]
H  = campo magnético   [A/m]
μ₀ = permeabilidad del vacío  = 4π × 10⁻⁷ H/m
μ_r= permeabilidad relativa del material
     aire/vacío: μ_r = 1
     hierro dulce: μ_r = 1000-5000
     neodimio: μ_r ≈ 1.05 (casi como el aire — el flujo ya está "hecho" por los dominios)
     ferrita: μ_r = 10-15000 (según tipo)
```

## Velocidad de propagación y longitud de onda

```
c = f · λ   (en el vacío)
v = c / √(ε_r · μ_r)   (en un medio dieléctrico)

λ = c / f   (longitud de onda en metros, f en Hz)

Frecuencia   Longitud de onda   Banda / uso
──────────────────────────────────────────────
50 Hz        6000 km            Red eléctrica AC
100 kHz      3 km               Onda larga, bobina Tesla
1 MHz        300 m              AM radio
100 MHz      3 m                FM radio
433 MHz      69 cm              ISM (IoT, mandos)
1.09 GHz     27.5 cm            ADS-B (aviación)
2.4 GHz      12.5 cm            WiFi, Bluetooth
5.8 GHz      5.2 cm             WiFi 5G, drones
```

Esta relación λ = c/f es la que determina las dimensiones físicas de una antena: una antena de
λ/4 de dipolo a 100 MHz mide exactamente 75 cm. Todo el diseño de antenas sale de aquí.

## Permeabilidad relativa — tabla de materiales útiles

| Material | μ_r | Uso en electromecánica |
|---|---|---|
| Vacío / aire | 1.0 | Referencia |
| Aluminio | 1.000022 | No magnético — carcasas |
| Neodimio (NdFeB) | ~1.05 | Imán permanente de alta energía |
| Ferrita dura | 1.05-1.1 | Imanes permanentes económicos |
| Ferrita blanda (Mn-Zn) | 1000-10000 | Núcleos de transformadores HF |
| Hierro dulce puro | 5000 | Núcleos de baja frecuencia |
| Acero silicio (M-19) | 3000-7000 | Chapas de motores y transformadores |
| Permalloy (Fe-Ni 80%) | 50000-100000 | Cabezas de grabación, sensores precisos |
| Mu-metal | 20000-50000 | Apantallamiento magnético |
