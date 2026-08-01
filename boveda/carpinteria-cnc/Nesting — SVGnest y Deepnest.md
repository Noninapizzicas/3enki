---
tipo: referencia
sector: carpinteria-cnc
tags: [nesting, optimizacion, corte, svgnest, deepnest, tablero]
---
# Nesting — SVGnest y Deepnest

Nesting = encajar el máximo de piezas en el mínimo de tableros. Reduce desperdicio de material (madera, chapa, tela, cuero).

## El problema

Dado un conjunto de piezas 2D (polígonos irregulares) y un tablero de dimensiones fijas, encontrar la disposición que minimice el material usado. Es NP-hard — no hay solución óptima garantizada, solo heurísticas.

## SVGnest (2.4k stars)

| | |
|---|---|
| **Tipo** | Aplicación en navegador |
| **Entrada** | SVG con las piezas |
| **Algoritmo** | Genético + NFP (No-Fit Polygon) |
| **Salida** | SVG con la disposición optimizada |
| **Ventaja** | Funciona en el navegador, sin instalar nada |
| **Limitación** | Lento con muchas piezas (>50), sin fusión de líneas comunes |

Uso: cargar SVG → definir tamaño de tablero → configurar separación entre piezas (kerf) → Run. El algoritmo mejora iterativamente.

## Deepnest (1.1k stars)

| | |
|---|---|
| **Tipo** | Aplicación de escritorio (Electron) |
| **Entrada** | SVG, DXF |
| **Algoritmo** | Genético + NFP + fusión de líneas comunes |
| **Salida** | SVG/DXF con disposición optimizada |
| **Ventaja** | Más rápido que SVGnest, fusiona bordes compartidos (ahorra cortes) |
| **Fork activo** | deepnest-next/deepnest (165 stars) |

La fusión de líneas comunes (common-line merging) es clave en plasma y láser: si dos piezas comparten borde, se corta una sola vez.

## Parámetros clave

| Parámetro | Qué controla |
|---|---|
| **Spacing** | Separación entre piezas (compensar kerf de la fresa/láser) |
| **Rotations** | Cuántas rotaciones probar (4 = 0°/90°/180°/270°; más = mejor pero más lento) |
| **Sheet size** | Dimensiones del tablero o chapa |
| **Tolerance** | Precisión del cálculo de polígonos |
| **Quantity** | Cuántas copias de cada pieza |

## Aplicaciones

- **Carpintería CNC**: maximizar piezas de muebles en tableros de contrachapado/MDF
- **Corte láser**: piezas en acrílico, madera, cartón
- **Plasma CNC**: piezas en chapa de acero/aluminio
- **Textil/Cuero**: patrones de ropa o tapicería
- **Vinilo**: pegatinas y rótulos

## Alternativas

| Nombre | Tipo | Nota |
|---|---|---|
| **Kiri:Moto** | Web | Nesting + slicer + CAM en un solo tool |
| **Nesting en Fusion 360** | Plugin | Integrado en el CAM |
| **CutList Optimizer** | Web | Específico para tableros rectangulares (corte recto) |

→ Diseño de las piezas: [[FreeCAD para carpintería]]
→ Ensambles que producen las piezas: [[Ensambles CNC — finger joints y más]]
