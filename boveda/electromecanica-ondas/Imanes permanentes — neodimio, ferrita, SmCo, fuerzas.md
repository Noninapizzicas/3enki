---
tipo: componente
sector: electromecanica-ondas
tags: [imanes, neodimio, NdFeB, ferrita, SmCo, campos-magneticos, BH]
---
# Imanes permanentes — neodimio, ferrita, SmCo, fuerzas

## Tipos de imán permanente — comparativa global

| Material | Energía (BH)_max [kJ/m³] | B_r [T] | T_max [°C] | Coste | Uso típico |
|---|---|---|---|---|---|
| **Ferrita (bario/estroncio)** | 10-40 | 0.2-0.4 | 250 | Muy bajo | Motores de juguete, altavoces, imanes de nevera |
| **AlNiCo** | 10-80 | 0.6-1.3 | 550 | Medio | Sensores, instrumentos, micrófonos vintage |
| **SmCo (samario-cobalto)** | 80-240 | 0.8-1.1 | 350 | Alto | Motores aeroespaciales, alta temperatura |
| **NdFeB (neodimio)** | 200-450 | 1.0-1.5 | 80-150* | Medio | Motor BLDC, PMG, altavoces HiFi, MRI |

*Temperatura de Curie del NdFeB ≈ 310°C, pero la coercitividad cae bruscamente antes — límite práctico 80°C (N35) a 150°C (SH/UH grades).

## Nomenclatura de grados NdFeB

```
N35 M H SH UH EH
│   └─ sufijo de temperatura:
│       (sin sufijo) → T_max 80°C
│       M            → T_max 100°C
│       H            → T_max 120°C
│       SH           → T_max 150°C
│       UH           → T_max 180°C
│       EH           → T_max 200°C
└── número = (BH)_max en MGOe × 10 / ~7.96 ≈ energía en kJ/m³ ÷ 7.96
    N35 → 35 MGOe = 278 kJ/m³
    N52 → 52 MGOe = 414 kJ/m³  (el más fuerte disponible comercialmente, 2025)
```

**Regla para PMG eólico:** usar N42H o N45H — equilibrio entre energía magnética y resistencia
al calor generado en el bobinado.

## Curva B-H y punto de trabajo

```
      B (T)
  B_r │─────────────────╮  ← remanencia (campo sin circuito exterior)
      │                  ╲
      │     curva de       ╲
      │     desmagnetización ╲
  0   │──────────────────────╲──→ H (kA/m)
      │                       H_c ← coercitividad (campo para llevar B a 0)
      │
      ╰── Punto de trabajo = intersección con la recta de permeancia del circuito magnético

BH_max = área máxima del rectángulo inscrito en la curva → energía magnética disponible por volumen
```

**Para un motor o generador:** el punto de trabajo debe estar en la parte lineal de la curva
de desmagnetización (lejos del codo). Si el campo desmagnetizante (armadura en cortocircuito,
golpes mecánicos, temperatura) supera el codo → el imán pierde parte de su magnetización permanentemente.

## Geometrías comunes y sus campos

```
DISCO AXIAL (cilindro plano, magnetización axial — el del PMG eólico):
  Campo en el centro (distancia x del polo):
  B(x) = (B_r / 2) · [L / √(R² + L²) - (L+2x) / √(R² + (L+2x)²)]  (simplificado)
  Para x=0 (superficie): B_superficie ≈ B_r · (1 - e^(-2L/D))

  Parámetros: L = grosor, D = diámetro, B_r = remanencia del grado
  Práctica: para N42, disco 50×10 mm → B_superficie ≈ 0.6-0.7 T

BLOQUE RECTANGULAR (magnetización perpendicular al plano — común en motores BLDC):
  Más fácil de montar en rotores de aristas planas

ANILLO (magnetización radial — rotores de motor convencional):
  Fabricación más compleja, flujo más uniforme en la periferia
```

## Fuerza de atracción entre imán y chapa de acero (fórmula práctica)

```
F = (B² · A) / (2 · μ₀)

F  = fuerza [N]
B  = densidad de flujo en el entrehierro [T]
A  = área del polo [m²]
μ₀ = 4π × 10⁻⁷ H/m

Ejemplo — disco N42, 50 mm diámetro, B_gap ≈ 0.5 T:
  A = π × (0.025)² = 1.96 × 10⁻³ m²
  F = (0.5² × 1.96×10⁻³) / (2 × 4π×10⁻⁷) = 195 N ≈ 20 kg

Con B_gap = 1.0 T (entrehierro mínimo):
  F = (1.0² × 1.96×10⁻³) / (8π×10⁻⁷) = 781 N ≈ 80 kg

Cuidado: en PMG con dos rotores y estátor en medio, la fuerza axial entre los dos rotores
puede superar 500 kg en diseños de >1 kW → el eje y los rodamientos deben calcularse para eso.
```

## Fuerza entre dos imanes (en línea, misma polaridad — repulsión)

```
F ≈ 3μ₀ · m₁ · m₂ / (2π · r⁴)     (dipolo-dipolo, r >> dimensión del imán)

m = momento magnético = B_r · V / μ₀

Más práctico: usar calculadoras online (K&J Magnetics, Supermagnete)
o FEMM (simulación 2D de elementos finitos)
```

## Desmagnetización — cómo perder un imán

```
Causas:
  1. Temperatura > T_max del grado → caída irreversible de H_c (el más peligroso)
  2. Campo magnético opuesto intenso (corriente de cortocircuito en generador)
  3. Golpe mecánico fuerte (reorganiza dominios → pérdida parcial)
  4. Corrosión (NdFeB sin recubrimiento → se oxida y desintegra)

Recubrimientos estándar NdFeB:
  Ni-Cu-Ni  → el más común, color plateado, protección media
  Zn        → protección buena, barato, mate gris
  Epoxy     → máxima protección, negro, para ambientes húmedos/marinos
  Au / Ag   → protección máxima, uso específico (aeroespacial)
```

## Proveedores y precios orientativos (2025)

| Proveedor | País | Tipo | Precio orientativo |
|---|---|---|---|
| Supermagnete (supermagnete.es) | DE/ES | NdFeB N35-N52, ferrita, SmCo | 0.5-50 €/ud según tamaño |
| K&J Magnetics (kjmagnetics.com) | USA | NdFeB, variedad enorme | $0.5-100 / ud |
| AliExpress / directos China | CN | NdFeB N35-N52, todos grados | ×2-5 más barato, calidad variable |
| First4Magnets (first4magnets.com) | UK | NdFeB, ferrita | precio medio, buena calidad |
| Magnetasur (magnetasur.com) | ES | NdFeB, ferrita, SmCo | proveedor local España |

**Para PMG eólico DIY:** Supermagnete o AliExpress (verificar grado con gaussímetro al recibir).
Tamaño típico Piggott 2-4 kW: 46 imanes de 46×30×10 mm N42H.

## Medición del campo — herramientas

```
Gaussímetro / teslímetro:
  → Sonda Hall → medición directa de B en T o Gauss
  → Modelos: GM-2, DX-102 (AliExpress < 30€), Lakeshore 475 (profesional)

FEMM (software libre):
  → Simulación 2D de circuitos magnéticos: bobinas, imanes, entrehierros
  → Cálculo de fuerzas, flujo, distribución de B
  → femm.info — gratuito, Windows / Wine

Brújula de precisión:
  → Solo para verificar polaridad y orientación de imanes (no cuantitativo)
```
