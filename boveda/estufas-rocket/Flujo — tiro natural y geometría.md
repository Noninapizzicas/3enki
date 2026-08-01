---
tipo: pilar
sector: estufas-rocket
tags: [flujo, tiro, geometria, aerodinamica]
---
# Flujo — tiro natural y geometría

El tiro de una rocket es **pasivo** — lo crea la diferencia de temperatura entre los gases calientes del riser y el aire exterior (efecto chimenea / stack effect). No necesita ventilador.

## Efecto chimenea (ASHRAE)

```
ΔP = C × h × (1/T_ext - 1/T_int)
```

- `h` = altura de la columna caliente (riser)
- `T_ext` / `T_int` = temperaturas absolutas exterior/interior
- A mayor diferencia de temperatura y mayor altura, más succión.

## Geometrías: J-tube y L-tube

**J-tube** (la canónica): el tubo de alimentación entra por arriba en ángulo — la leña se alimenta por gravedad. El giro en J fuerza el flujo hacia abajo y luego hacia arriba por el riser.

**L-tube**: alimentación horizontal (sin giro descendente). Más fácil de construir, menos eficiente en el arranque porque el aire frío puede entrar directamente.

## Proporciones críticas (sección transversal, CSA)

La regla de oro: **feed : burn tunnel : heat riser = 1 : 1 : 1** en CSA (misma sección transversal en todo el recorrido). Variación de Wisner: **1 : 2 : 4** para sistemas con masa larga.

| Sistema | Diámetro riser | CSA | Calienta |
|---|---|---|---|
| Pequeño | 10 cm (4") | ~80 cm² | Habitación individual |
| Medio | 15 cm (6") | ~180 cm² | Vivienda pequeña |
| Grande | 20 cm (8") | ~320 cm² | Vivienda o taller |

## El riser: el motor del tiro

- **Altura**: 7–10× el diámetro del riser (un 8" necesita riser de 140–200 cm).
- **Aislamiento**: la clave de Winiarski. Un riser sin aislar pierde calor a las paredes y el tiro colapsa. Con perlita o vermiculita alrededor, los gases mantienen >600 °C y el tiro se autorefuerza → [[Retroalimentación — ciclo de combustión]].
- **Gap barril–riser**: 5–8 cm (2–3") entre la parte superior del riser y la tapa del barril. Demasiado grande = pérdida de velocidad; demasiado pequeño = restricción.

## Efecto Venturi en la base del riser

La transición del burn tunnel al riser vertical actúa como **constricción Venturi**: los gases se aceleran al subir por la columna caliente aislada, creando una zona de baja presión en la base que succiona más aire por el feed tube.

→ Qué pasa con esos gases calientes: [[Readsorción — masa térmica]]
→ Dimensiones concretas: [[Materiales y dimensiones]]
