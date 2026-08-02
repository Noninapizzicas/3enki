---
tipo: componente
sector: eolica-hogar
tags: [palas, BEM, geometria, materiales]
---
# Diseño de palas — BEM y geometría

## BEM (Blade Element Momentum)

Método estándar para dimensionar palas. Divide la pala en N secciones radiales y combina:
- **Teoría de momento**: cambio de velocidad axial del aire al pasar por el rotor
- **Teoría de elemento de pala**: fuerzas aerodinámicas locales (sustentación + arrastre) por sección

```
Para cada sección radial r:
  1. Calcular factor de inducción axial (a ≈ 0.33 óptimo)
  2. Calcular factor de inducción angular (a' ≈ 0.175)
  3. Calcular ángulo de flujo relativo: φ = atan((1-a) / ((1+a') × λ_r))
     donde λ_r = TSR × (r/R) (velocidad local)
  4. Calcular cuerda: c(r) = (8π × r × sin(φ)) / (3 × B × Cl × λ_r)
     B = número de palas, Cl = coeficiente de sustentación del perfil
  5. Calcular twist: β(r) = φ - α_diseño
     α_diseño = ángulo de ataque óptimo del perfil (~5-8° para NACA 4412)
```

**Resultado típico**: cuerda y twist decrecientes desde la raíz a la punta.

## Geometría típica (3 palas, HAWT doméstico)

| Radio rotor | Cuerda raíz | Cuerda punta | Twist raíz | Twist punta | TSR diseño |
|---|---|---|---|---|---|
| 1.0 m | 15 cm | 6 cm | 25° | 3° | 6 |
| 1.5 m | 20 cm | 8 cm | 22° | 2° | 7 |
| 2.5 m | 28 cm | 10 cm | 20° | 2° | 7 |

## Número de palas

| Palas | TSR óptimo | Uso |
|---|---|---|
| 2 | 6–12 | Ligeras, rápidas, más ruido/vibración (necesitan hub basculante) |
| 3 | 5–8 | Estándar generación eléctrica (mejor equilibrio) |
| 6+ | 1–2 | Bombeo mecánico (alto par, bajo RPM) |

## Materiales

**Madera** (DIY Piggott): barata, fácil de tallar, absorbe vibración. Maderas recomendadas: pino, abeto (softwood recto, sin nudos). Acabado con pintura epoxi o poliuretano contra UV/humedad. Viable hasta ~2.5 m de radio.

**Fibra de vidrio**: más resistente, moldeable, absorbe impactos. Proceso: layup manual con resina epoxi o poliéster sobre molde. El estándar en mini-eólica comercial (Bornay, Bergey).

**Fibra de carbono**: 25% más ligera que vidrio, mayor rigidez/fatiga, permite palas más largas. Coste alto (3-5× vidrio). Usado en turbinas premium (Primus AIR 40 usa palas de carbono).

**Impresión 3D**: PETG superior a PLA en resistencia mecánica y UV. Viable para micro-turbinas (<100 W) y prototipos. No viable estructuralmente para >1 m de radio.

## Herramientas de diseño

- **QBlade**: análisis BEM interactivo con GUI, calcula distribución de cuerda/twist
- **CCBlade.jl** (Julia): análisis BEM programático, validado contra OpenFAST
- **NovaSolver** (web): calculadora BEM online — inputs: v_viento, radio, TSR → outputs: distribución de cuerda y twist

Ver [[Perfiles aerodinámicos — NACA y SG]] para la selección de perfil.
