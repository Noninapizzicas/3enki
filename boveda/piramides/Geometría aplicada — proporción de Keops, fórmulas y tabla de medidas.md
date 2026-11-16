---
tipo: componente
sector: piramides
tags: [geometria, seked, keops, formulas, angulos, medidas, calculo]
---
# Geometría aplicada — proporción de Keops, fórmulas y tabla de medidas

> Toda la fabricación de este sector depende de un solo ángulo bien calculado — el resto son multiplicaciones.

---

## La proporción de Keops ✅

```
SEKED — unidad de pendiente egipcia: palmos horizontales de desplazamiento por cada codo
  (7 palmos) de altura vertical. El seked de Keops es 5½ palmos (5 palmos + 2 dedos).

RELACIÓN SEKED ↔ ÁNGULO:  seked = 7 · cot(θ)   donde θ es el ángulo de la cara sobre la
  horizontal (verificado: para θ = 51,84°, cot(θ) ≈ 0,781 → seked ≈ 5,47 ≈ 5½ palmos ✓)

MEDIDAS REALES DE KEOPS (egiptología ✅):
  Base original ............ 230,33 m (lado)
  Altura original ........... 146,59 m (hoy ≈138,5 m por erosión y expolio del revestimiento)
  Ángulo de cara ............ 51,84° sobre la horizontal
  Relación base:altura ...... prácticamente π/2 (una coincidencia muy citada; NO hay evidencia
    de que los egipcios conocieran π como constante — el seked 5½ explica el ángulo sin
    necesitar esa hipótesis 🔮 "los egipcios conocían π/el número de oro de forma deliberada")

PROPORCIÓN RECOMENDADA PARA FABRICACIÓN CASERA: replicar el ángulo de 51,84° de Keops es el
  estándar de facto en el mundo "pirámide de energía" — es el ángulo que casi todos los
  diseños, kits y conectores impresos en 3D asumen por defecto. No hay razón física para que
  cambiar el ángulo altere nada (🔮 según la propia tradición esotérica, EL ángulo de Keops es
  el "correcto"; fuera de esa creencia, cualquier ángulo sirve igual para los usos reales:
  decoración, meditación, soporte de objetos).
```

---

## Fórmulas (pirámide recta de base cuadrada) ✅

```
Variables:
  b = lado de la base
  θ = ángulo de la cara sobre la horizontal (51,8428° para Keops)
  h = altura (vértice sobre el centro de la base)
  m = apotema (altura de la cara triangular, desde el punto medio del lado de la base al vértice)
  a = arista lateral (desde una esquina de la base al vértice)

ALTURA:        h = (b/2) · tan(θ)
APOTEMA:       m = √[(b/2)² + h²]            (equivalente: m = (b/2) / cos(θ))
ARISTA:        a = √[(b/2)² + (b/2)² + h²] = √[(b²/2) + h²]
ÁREA DE BASE:  A_base = b²
ÁREA LATERAL:  A_lateral = 4 · (b · m) / 2 = 2 · b · m
VOLUMEN:       V = (b² · h) / 3

ÁNGULOS DE CORTE para fabricación (constantes, NO dependen del tamaño de la base — solo del
  ángulo θ elegido; valores para θ = 51,8428°, verificados por cálculo vectorial en Python):

  Ángulo de cara sobre la base ........................ 51,84°
    → usar para inclinar la sierra al cortar el canto inferior de una CARA (estructura cerrada)
  Bisel de corte en la base de un panel triangular ..... 38,16°  (= 90° − 51,84°)
    → el ángulo de corte real en la ingletadora si se corta el panel apoyado en plano
  Inclinación de la arista lateral sobre la horizontal . 41,99°
    → ángulo al que "sube" cada arista desde la esquina de la base hasta el vértice
  Ángulo entre dos aristas laterales adyacentes, medido
    en el vértice ........................................ 63,43°
    → útil para diseñar o verificar un conector de vértice de 4 vías
  Ángulo diedro interior entre dos caras triangulares
    adyacentes (por la arista lateral) .................. 112,44°
    → el ángulo "abierto" entre dos caras si se mira desde dentro de la pirámide
  Inglete de unión entre dos paneles de cara (mitad del
    suplementario del diedro) ........................... 33,78°  (= (180° − 112,44°) / 2)
    → ángulo al que biselar el canto de CADA panel para que ambos encajen a tope en la arista
```

---

## Tabla de medidas — verificada por cálculo (Python, ángulo 51,8428°)

```
BASE (cm) │ ALTURA (cm) │ APOTEMA (cm) │ ARISTA (cm) │ uso típico
──────────┼─────────────┼──────────────┼─────────────┼──────────────────────────────
    10    │    6,36     │    8,09      │    9,51     │ llavero / prueba de impresora
    15    │    9,55     │   12,14      │   14,27     │ sobremesa mini
    20    │   12,73     │   16,19      │   19,03     │ sobremesa estándar
    30    │   19,09     │   24,28      │   28,54     │ sobremesa grande / objetos pequeños
    45    │   28,64     │   36,42      │   42,81     │ fruta, cuchillas, vaso de agua
    60    │   38,18     │   48,56      │   57,08     │ maceta pequeña, jarra de agua
    90    │   57,27     │   72,84      │   85,62     │ planta en maceta mediana
   120    │   76,36     │   97,12      │  114,16     │ límite de "sobremesa grande"
   180    │  114,55     │  145,67      │  171,23     │ banco bajo/niño sentado debajo
   240    │  152,73     │  194,23      │  228,31     │ persona sentada dentro (meditación)
──────────┴─────────────┴──────────────┴─────────────┴──────────────────────────────
(ángulos de corte — constantes para TODAS las filas): cara 51,84° · bisel base de panel
  38,16° · inclinación de arista 41,99° · ángulo en vértice 63,43° · diedro 112,44° ·
  inglete de unión de paneles 33,78°
```

```python
# Script de verificación (reproducible) — el mismo usado para generar la tabla de arriba
import math
ANGULO = math.radians(51.8428)          # ángulo de cara de Keops

def piramide(base_cm):
    medio = base_cm / 2
    altura = medio * math.tan(ANGULO)
    apotema = math.sqrt(medio**2 + altura**2)
    arista = math.sqrt(2 * medio**2 + altura**2)
    return altura, apotema, arista

for base in [10, 15, 20, 30, 45, 60, 90, 120, 180, 240]:
    h, m, a = piramide(base)
    print(f"{base:>4} cm -> altura {h:.2f}  apotema {m:.2f}  arista {a:.2f}")
```

---

## Errores comunes de cálculo

```
1. CONFUNDIR APOTEMA CON ARISTA — el apotema es la altura de la CARA (triángulo), la arista
   es el borde desde la esquina de la base al vértice. Para cortar tubo de cobre de las
   ARISTAS (lo habitual en estructura abierta) se necesita la ARISTA, no el apotema.
2. OLVIDAR QUE LOS ÁNGULOS NO ESCALAN — duplicar la base duplica altura/apotema/arista, pero
   TODOS los ángulos (51,84° · 38,16° · 41,99° · 63,43° · 112,44°) se mantienen exactamente
   iguales. Un error típico es "recalcular" el ángulo para una base distinta — no hace falta.
3. MEDIR LA ARISTA EN LUGAR DE LA PROYECCIÓN HORIZONTAL al cortar la base — la base cuadrada
   se construye con 4 tramos de longitud = lado de la base (b), NO con la arista.
4. NO DESCONTAR EL GROSOR DEL CONECTOR — en estructura con conectores impresos en 3D, la
   longitud de corte real del tubo es: longitud_teórica − 2 × profundidad_de_inserción_conector
   (ver [[Impresión 3D — conectores, piezas modulares y maquetas]] para tolerancias).
```

---

## Novedades 2024-2026

```
→ El seked como unidad de medida sigue siendo el consenso egiptológico estándar para explicar
  CÓMO los constructores fijaron el ángulo (documentado en papiros matemáticos como el de
  Rhind), sin necesidad de recurrir a π o la proporción áurea como intención deliberada.
→ Los diseños paramétricos en OpenSCAD/Fusion 360 para conectores de pirámide (ver nota de
  Impresión 3D) ya permiten introducir base y ángulo como parámetros libres y generan la
  pieza automáticamente — la fabricación casera de cualquier proporción (no solo 51,84°) es
  hoy trivial con una impresora 3D doméstica.
```
