---
tipo: componente
sector: aerodinamica
tags: [capa-limite, laminar, turbulento, separacion, HLFC, NLF, transicion]
---
# Capa límite y control de flujo — laminar y turbulento

## Qué es la capa límite

La región del fluido inmediatamente adyacente a una superficie donde la velocidad pasa de 0 (en la
pared, condición no-slip) al valor del flujo libre. Toda la fricción viscosa ocurre aquí.

```
         flujo libre (v = v∞)
    ─────────────────────────────────→
         . . . . . . . . . . . . . . .     δ = espesor de capa límite
       . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . . .
  =============================================  superficie sólida (v = 0)

δ crece a lo largo de la superficie.
En el borde de ataque δ=0; al avanzar por el extradós δ aumenta hasta
la transición laminar→turbulento o hasta la separación.
```

## Régimen laminar vs turbulento

| Característica | Laminar | Turbulento |
|---|---|---|
| Estructura del flujo | Capas paralelas ordenadas | Remolinos, mezcla transversal |
| Perfil de velocidad | Parabólico (suave) | Más lleno (más energético cerca de la pared) |
| Fricción (Cf) | **Bajo** (~3× menor) | Alto |
| Resistencia a la separación | **Baja** — se separa fácilmente a gradiente adverso | Alta — el flujo turbulento retrasa la separación |
| Ruido aerodinámico | Bajo | Alto |
| Cuando ocurre | Re_x < 5×10⁵ (placa plana) | Re_x > 5×10⁵ o con perturbaciones |

**Dilema de diseño:** laminar → menor fricción pero se separa antes. Turbulento → mayor fricción pero
más robusto frente a gradientes adversos de presión.

## Transición laminar→turbulento

```
Mecanismo de inestabilidad de Tollmien-Schlichting (TS waves):
  1. Perturbación pequeña en la capa límite (rugosidad, turbulencia del flujo libre)
  2. Ondas TS amplificadas por el gradiente adverso de presión
  3. Rotura no-lineal → turbulencia

Número de Reynolds de transición (placa plana):
  Re_trans ≈ 5×10⁵  (en condiciones limpias y baja turbulencia del flujo libre Tu < 0.1%)
  Re_trans puede bajar a 10⁵ con rugosidad superficial o Tu > 1%
```

**Punto de transición en un ala:**
- Ala sucia (insectos, lluvia): transición en x/c ≈ 5-10% — todo el ala turbulenta
- Ala limpia + flujo libre limpio: transición en x/c ≈ 20-50% (depende del perfil)
- NLF optimizado: transición hasta x/c = 50-70%

## Separación de la capa límite

Cuando el gradiente de presión es adverso (presión creciente en dirección del flujo), la capa límite
pierde energía y puede separarse de la superficie. En un ala: ocurre en el extradós a ángulos de
ataque altos → **stall**.

```
Stall suave (gradual): perfiles gruesos con extradós curvo — la separación avanza
                       desde el borde de fuga hacia el borde de ataque progresivamente.
Stall abrupto (brusco): perfiles finos o muy cargados — separación repentina desde
                        el borde de ataque → pérdida de sustentación instantánea.
```

### Burbuja de separación laminar (Laminar Separation Bubble — LSB)

```
Frecuente a Re bajo (10⁴ - 5×10⁵):
  1. La capa límite laminar se separa antes de transicionar
  2. Transiciona en la zona separada (shear layer libre)
  3. El flujo turbulento resultante tiene energía para reapegarse
  4. Forma una burbuja de recirculación corta pero estable

La LSB añade arrastre pero permite al perfil operar a ángulos de ataque
altos sin stall completo. Es el modo normal de los perfiles de velero y mini-eólica.
```

## Tecnologías de control de flujo

### Natural Laminar Flow (NLF) — el diseño lo hace todo

```
Diseñar el perfil para que el mínimo de presión se retrase hasta x/c ≈ 50-70%.
→ El gradiente de presión favorable (presión decreciente) estabiliza la CB laminar.
→ Ningún sistema activo: solo geometría bien diseñada.

Requisitos:
  - Superficie extremadamente lisa (Ra < 0.5 µm)
  - Flujo libre de baja turbulencia (Tu < 0.1%)
  - Sin impactos de insectos ni hielo en borde de ataque

Aplicaciones: planeadores de competición (CL/CD = 50-60), Learjet 45, Honda HF-120
Potencial: reducción de fricción 30-50% vs ala turbulenta
```

### Hybrid Laminar Flow Control (HLFC) — succión + diseño

```
NLF aft (mitad trasera) + succión activa en la mitad delantera (0-20% cuerda).
La succión retira la capa límite laminar antes de que transite → se restablece laminar más atrás.

Sistema: microporos o ranuras en el borde de ataque → bomba de baja presión

Demostrado:
  - Boeing B-757 (1990): HLFC en ala → transición retrasada al 65% c → arrastre de fricción -6%
  - Airbus A320 aleta vertical (1998): succión 0-18% c
  - Proyecto HERWINGT (2024-2025): demostradores de borde de ataque flexible + borde de fuga
    compliant para ala NLF → probados en túnel de viento (DLR, Airbus)

Potencial futuro: Airbus estima +10% eficiencia si HLFC se aplica a ala + empenaje completo
```

### Succión de capa límite (LFC puro)

```
Succión continua en toda la superficie → mantiene la CB laminar en todo el extradós.
Muy eficaz pero costoso en sistema de ductos y potencia → práctica solo en conceptos avanzados.
Investigación activa en aeronaves de muy larga distancia (transoceánico/transpolares futuros).
```

### Soplado (blowing) — reapego forzado

```
Inyección de aire de alta energía en la zona de separación → recarga la CB → reapego.

Upper Surface Blowing (USB): chorro de motor sobre el ala → CL_max muy alto
  Ejemplo histórico: Boeing YC-14 (1976), NASA STOL research
  Moderno: aviones STOL de nueva generación (investigación 2023-2025)

Coanda effect blowing: chorro tangente a la superficie → adherencia por Coanda
  Aplicado en timones y alerones de aviones de combate (F/A-18 enhanced)
```

## Riblets — reducción de fricción en flujo turbulento

```
Microestructuras en V o U alineadas con el flujo.
Reducen la fricción turbulenta interrumpiendo los vórtices de pared (streak structures).

Geometría óptima:
  s+ = s · u_τ / ν ≈ 10-20  (s = espaciado entre crestas en unidades de pared)
  Reducción de fricción: 3-8%

En aviación:
  - Airbus incorpora riblets en fuselaje: -1% arrastre total (~0.5% combustible)
  - Investigación activa en recubrimientos con riblets fotograbados (Boeing, DLR, NLR)
  - Problema: se degradan con la limpieza → recubrimientos regenerables en estudio
```

## Vortex Generators (VG) — turbulencia local controlada

```
Aletas pequeñas (h = 0.5-1 × δ) que generan vórtices longitudinales → mezclan
flujo externo energético hacia la pared → retrasan separación.

Reducción del ángulo de stall: típicamente -2 a -5° (el ala "aguanta" más ángulo antes de separar)
Penalización en arrastre: +1-2% de CD  (aceptable si evita la separación)

Usados en: palas de turbinas eólicas (retrasan stall en transiciones de régimen),
           alas de aviones ligeros con perfiles laminares (Cessna 172 modificados),
           intakes de motor (canales de inlet en F-16, Eurofighter)
```
