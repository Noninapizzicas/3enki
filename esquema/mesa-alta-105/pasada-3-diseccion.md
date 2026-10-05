# Pasada 3 — Disección (FORMA de cada órgano)

> El prisma tocó suelo. Cada hoja atómica recibe su FORMA.
> Adaptación del vocabulario de la skill (reflejo · custodio · conversor · puente) a piezas FÍSICAS:
> la FORMA de una pieza de unión es su geometría y su cometido estructural. El agnosticismo se
> mantiene: fijación, materialización y medida son PUERTOS, no se nombra tecnología.

## Hoja ATÓMICA 1 — Unión tablero → pata (×4)

- **FORMA: ESCUADRA** — pieza en "L" que abraza la cara inferior del tablero (30 mm) por un ala y la
  cara lateral de la pata (58×58) por la otra ala, con un refuerzo triangular que reparte la carga
  vertical del tablero a la pata.
- **Cometido estructural:** soporta el peso de lo que se apoye en la mesa; transmite la carga del
  tablero a la pata; rigidiza la esquina.
- **Puertos abiertos:**
  - `fijar(tablero, puntos)` → fijación al tablero [tornillería ABIERTA]
  - `fijar(pata, puntos)` → fijación a la pata [tornillería ABIERTA]
  - `materializar(escuadra)` → fabricación [proceso ABIERTO]
  - `medir(cota)` → precisión [instrumento ABIERTO]

## Hoja ATÓMICA 2 — Unión travesaño lateral → pata (×4)

- **FORMA: CONECTOR** — pieza con un canal que abraza el extremo del travesaño (40×40) y una orejeta
  que se fija a la cara interior de la pata (58×58). Orientación a lo largo de la mesa.
- **Cometido estructural:** transmite la rigidez del travesaño lateral al conjunto; evita que las
  patas se abran en el eje largo.
- **Puertos abiertos:**
  - `fijar(travesaño, puntos)` → fijación al travesaño [tornillería ABIERTA]
  - `fijar(pata, puntos)` → fijación a la pata [tornillería ABIERTA]
  - `materializar(conector)` → fabricación [proceso ABIERTO]
  - `medir(cota)` → precisión [instrumento ABIERTO]

## Hoja ATÓMICA 3 — Unión travesaño central → pata (×2)

- **FORMA: CONECTOR (misma pieza, rotada 90°)** — el mismo conector de la hoja 2, orientado a lo
  ancho de la mesa (derecha ↔ izquierda). No es una pieza distinta: es la misma, rotada.
- **Cometido estructural:** transmite la rigidez del travesaño central; evita que las patas se
  cierren en el eje corto.
- **Puertos abiertos:** idénticos a la hoja 2 (misma pieza).

## Reparto de formas

- **2 piezas distintas** (no 3): la ESCUADRA (tablero→pata) y el CONECTOR (travesaño→pata).
- El CONECTOR sirve para el travesaño lateral y el central — solo cambia la orientación (rotación 90°).
- **Recuento de piezas a materializar:**
  - 4 × ESCUADRA (una por esquina)
  - 4 × CONECTOR orientación lateral (2 travesaños largos × 2 extremos)
  - 2 × CONECTOR orientación central (1 travesaño corto × 2 extremos)
  - **Total: 10 piezas de unión** (2 diseños distintos).

## Puertos abiertos del dueño (no se expanden)

- Tornillería disponible → `fijar` [ABIERTO]
- Nivelación del suelo → zapatas o no [ABIERTO]
- Retranqueo exacto de patas (20 mm en ambos ejes o solo uno) [ABIERTO]
- Altura del travesaño central (cuánto por encima de los laterales) [ABIERTO]
