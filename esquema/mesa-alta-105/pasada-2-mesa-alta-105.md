# Pasada 2 — Prisma sobre los sub-productos (las 3 uniones)

> Nivel 2. Cada sub-producto de la pasada-1 pasa por el prisma de 5 huecos.
> Los sub-productos son las 3 uniones. Son DIMENSIONES interdependientes (todas rigidizan el mismo
> conjunto y comparten el mismo vocabulario de fijación) → se modelan como INPUTS de un solo
> generador convergente, no como ramas separadas (ley de la skill: no separar dimensiones que se
> modulan mutuamente).

## Sub-producto A — Unión tablero → pata (×4)

- **IDENTIDAD:** pieza que une la cara inferior del tablero con la cara lateral de la pata, en cada esquina.
- **RESTRICCIONES:** abraza tablero de 30 mm de grosor y pata de 58 × 58; debe repartir la carga del tablero a la pata; no debe rajar la madera al fijarse.
- **CONTRATO:** fija el tablero a la pata en la esquina; soporta el peso de lo que se apoye en la mesa; se desmonta sin dañar la madera.
- **NO-OBJETIVOS:** no es un soporte de pared; no es una escuadra de estantería genérica; no oculta la pata.
- **PREGUNTAS_ABIERTAS:** ¿cuántos puntos de fijación al tablero y a la pata? ¿el refuerzo es visible o interior? [ABIERTO]

## Sub-producto B — Unión travesaño lateral → pata (×4)

- **IDENTIDAD:** pieza que une el extremo de un travesaño lateral (40 × 40) con la cara interior de una pata (58 × 58).
- **RESTRICCIONES:** abraza travesaño de 40 × 40; se fija a la pata de 58 × 58; el travesaño va a ~250 mm del suelo; debe rigidizar el largo de la mesa (evitar que las patas se abran).
- **CONTRATO:** fija el travesaño lateral a la pata; transmite la rigidez del travesaño al conjunto; desmontable.
- **NO-OBJETIVOS:** no es un soporte de carga vertical (el travesaño no aguanta peso de la mesa, solo rigidez); no es una unión a media madera.
- **PREGUNTAS_ABIERTAS:** ¿el travesaño va embutido en la pata o la pieza lo envuelve por fuera? [ABIERTO]

## Sub-producto C — Unión travesaño central → pata (×2)

- **IDENTIDAD:** pieza que une el extremo del travesaño central (40 × 40) con la cara interior de una pata, en el eje corto (derecha ↔ izquierda).
- **RESTRICCIONES:** misma sección que B (40 × 40 a pata 58 × 58); va por ENCIMA de los laterales; rigidiza el ancho de la mesa (evita que las patas se cierren).
- **CONTRATO:** fija el travesaño central a la pata; transmite rigidez en el eje corto; desmontable.
- **NO-OBJETIVOS:** no es idéntica a B en orientación (rota 90°); no es un refuerzo de tablero.
- **PREGUNTAS_ABIERTAS:** ¿comparte la misma pieza que B rotada, o es una pieza distinta? [ABIERTO]

## Convergencia (ley de dimensiones interdependientes)

Las 3 uniones comparten: mismo vocabulario de fijación a la madera, misma sección de travesaño (40 × 40),
misma pata (58 × 58), mismo tablero (30 mm). No se diseñan aisladas — convergen en UN generador de
uniones que sabe de todas y reutiliza el mismo patrón de abrazo y fijación. La única variante real es
la orientación (tablero→pata vs travesaño→pata) y la rotación del travesaño central.

## Puertos abiertos (agnosticismo)

- Fijación a la madera → puerto `fijar(miembro, puntos)` [tornillería ABIERTA]
- Fabricación de la pieza → puerto `materializar(pieza)` [proceso ABIERTO]
- Medida/precisión → puerto `medir(cota)` [instrumento ABIERTO]
