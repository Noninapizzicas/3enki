---
tipo: componente
sector: electromecanica-ondas
tags: [bobinado, AWG, inductancia, bobinas, estrella, triangulo, PMG]
---
# Bobinado — AWG, inductancia, factor de llenado, estrella-triángulo

## El hilo conductor: elegir el calibre

### Tabla AWG — corriente máxima y resistencia

| AWG | Ø [mm] | Sección [mm²] | I_max continua [A] | R [Ω/m] | Uso típico |
|---|---|---|---|---|---|
| 8 | 3.26 | 8.37 | 40 | 0.00206 | Bus de potencia, cable solar |
| 10 | 2.59 | 5.26 | 25 | 0.00328 | PMG eólico potencia |
| 12 | 2.05 | 3.31 | 16 | 0.00521 | PMG eólico pequeño, calefacción |
| 14 | 1.63 | 2.08 | 11 | 0.00829 | Motor AC pequeño |
| 16 | 1.29 | 1.31 | 8 | 0.0132 | Motor DC, bobinas de relé |
| 18 | 1.02 | 0.823 | 5 | 0.0209 | Motores pequeños, transformadores |
| 20 | 0.81 | 0.519 | 3.3 | 0.0332 | Bobinas de inductores, transformadores |
| 22 | 0.64 | 0.324 | 2.1 | 0.0530 | Servos, sensores de efecto Hall |
| 24 | 0.51 | 0.205 | 1.3 | 0.0843 | Señal, transformadores de audio |
| 26 | 0.40 | 0.128 | 0.83 | 0.135 | Bobinas Tesla, radios, antenas |
| 28 | 0.32 | 0.080 | 0.52 | 0.213 | Bobinas de alta frecuencia |
| 30 | 0.25 | 0.051 | 0.33 | 0.339 | Devanados finos, sensores |

**Métrica equivalente aproximado:** AWG 10 ≈ 2.5 mm² (cable solar estándar); AWG 12 ≈ 1.5 mm² (cable eléctrico doméstico).

**Regla de densidad de corriente:** para bobinado continuo sin refrigeración → J = 3-5 A/mm². Con refrigeración activa → hasta 10 A/mm². Superar J = 5 A/mm² sin refrigeración → el bobinado se destruye por calor.

## Cálculo de inductancia

### Bobina solenoide (núcleo de aire)

```
L = μ₀ · μ_r · N² · A / l

L  = inductancia [H]
μ₀ = 4π × 10⁻⁷ H/m
μ_r= permeabilidad relativa del núcleo (aire = 1, ferrita = 1000-10000)
N  = número de espiras
A  = área de la sección transversal [m²]
l  = longitud del solenoide [m]

Ejemplo — bobina de aire, 100 espiras, Ø 3 cm, l = 5 cm:
  A = π × (0.015)² = 7.07 × 10⁻⁴ m²
  L = 4π×10⁻⁷ × 1 × 100² × 7.07×10⁻⁴ / 0.05
  L ≈ 177 µH
```

### Toroide (núcleo toroidal — el más eficiente)

```
L = μ₀ · μ_r · N² · A / (2π · R_medio)

R_medio = (R_ext + R_int) / 2

Ventaja del toroide: el flujo se cierra dentro → mínima radiación, mínima interferencia externa.
Usado en: filtros de línea, transformadores de audio, inductores de fuente switching.
```

### Bobina Tesla (aproximación Wheeler para bobina plana en espiral)

```
L [µH] = (r² · N²) / (8r + 11w)

r = radio medio de la espiral [pulgadas]   (1 pulgada = 2.54 cm)
N = número de espiras
w = ancho del devanado (exterior - interior) [pulgadas]

Fórmula de Wheeler (1928) — error < 1% para bobinas planas tipo pancake.
Para el secundario de bobina Tesla (solenoide alto y fino):
  L [µH] = (0.394 · r² · N²) / (9r + 10l)
  r = radio [cm], l = longitud [cm]
```

## Factor de llenado de ranura (slot fill factor)

```
FF = Σ(A_conductores) / A_ranura

FF típico:
  Bobinado manual (hilo redondo): 0.35-0.45
  Bobinado semi-automático:       0.45-0.55
  Bobinado con hilo cuadrado:     0.65-0.75  (más cobre, mejor rendimiento)
  Bobinado concentrado (PMG):     0.50-0.65

Impacto: FF más alto → más corriente por ranura → más par o más tensión generada.
El límite es mecánico (forzar más hilo deforma el esmalte y provoca cortocircuito).
```

## Resistencia del bobinado y pérdidas en el cobre

```
R_bobina = ρ_Cu · L_total / A_conductor

ρ_Cu = 1.72 × 10⁻⁸ Ω·m  (a 20°C)
       aumenta ~0.4% por °C → a 80°C, ρ ≈ 2.13 × 10⁻⁸ Ω·m (+24%)

L_total = N × longitud_media_por_espira

Pérdidas en el cobre: P_Cu = I² · R_bobina  [W]
Temperatura en estado estacionario: ΔT ≈ P_Cu / (A_superficie × h_convección)
  h ≈ 10 W/(m²·K) convección natural, 50-100 W/(m²·K) con ventilación forzada
```

## Conexionado trifásico: estrella vs triángulo

Para motores y generadores trifásicos (PMG de 3 fases, motor AC):

```
ESTRELLA (Y — Wye):
  Las tres bobinas se conectan con un extremo común (neutro).
  V_línea = √3 × V_fase   (≈ 1.73 × V_fase)
  I_línea = I_fase
  Ventaja: tensión de salida más alta → menos corriente → menos pérdidas en cable largo
  Uso típico: generadores PMG para torre eólica alejada, motores de arranque suave

TRIÁNGULO (Δ — Delta):
  Las tres bobinas se conectan en bucle cerrado.
  V_línea = V_fase
  I_línea = √3 × I_fase
  Ventaja: más corriente disponible → más par a baja velocidad
  Uso típico: motores de potencia, conexión de cargas resistivas directas

Ejemplo PMG Hugh Piggott 2 kW a 48V:
  En estrella: cada fase genera ~28 V (48/√3) → 48 V de línea tras rectificación
  En triángulo: cada fase genera ~48 V → más corriente → mejor para baterías
```

## Proceso de bobinado de un PMG de flujo axial (Piggott / DIY)

```
PASO 1: Calcular espiras por bobina
  V_fase = 4.44 × f × N × Φ_max    (fórmula del transformador)
  f = n_RPM × P/120  (P = número de pares de polos)
  Φ_max = B_max × A_polo   (B_max ≈ 0.6-0.8 T para NdFeB N42 con gap de aire 10 mm)

PASO 2: Elegir sección del conductor
  I_max = P_nominal / (V_fase × √3 × FP)
  A_conductor ≥ I_max / J_max   (J_max = 4 A/mm² sin refrigeración)

PASO 3: Fabricar la bobina (devanadora simple de madera + taladro)
  Devanar el número calculado de espiras con tensión constante
  Atar con bridas y barnizar con resina epoxy

PASO 4: Encolar en el molde del estátor (resina de poliéster o epoxy + fibra de vidrio)
  Disposición: 9 bobinas para 12 polos (3 fases × 3 bobinas/fase)
  Orientación: cada bobina a 40° de la anterior (360°/9)

PASO 5: Test antes de encapsular
  Medir resistencia de cada fase (deben ser iguales ±5%)
  Girar manualmente → verificar tensión en vacío en las tres fases
```

## Barniz y aislamiento

```
Clases de temperatura del aislamiento (IEC 60085):
  Clase A: 105°C — algodón/seda/papel impregnado (vintage)
  Clase E: 120°C — resinas sintéticas (motores económicos)
  Clase B: 130°C — mica, fibra de vidrio + barniz (estándar industrial)
  Clase F: 155°C — barnices sintéticos (motores industriales modernos)
  Clase H: 180°C — silicona, mica (motores de alta exigencia, aeroespacial)

Para PMG DIY: usar hilo esmaltado clase F o H.
Encapsular en epoxy (resistente a humedad, vibración y aceite).
```
