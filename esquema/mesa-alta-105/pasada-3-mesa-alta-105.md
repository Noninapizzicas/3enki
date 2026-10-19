# Pasada 3 — Prisma sobre el generador convergente + suelo

> Nivel 3. El prisma sobre el generador de uniones (la pieza que sintetiza las 3 uniones).
> Confirma el SUELO: las uniones ya no son productos que partir, son átomos.

## Prisma sobre el generador convergente

- **IDENTIDAD:** un único generador que produce las piezas de unión de la mesa, parametrizado por
  orientación (tablero→pata, travesaño→pata lateral, travesaño→pata central) y por las secciones que abraza.
- **RESTRICCIONES:** conoce las 3 secciones (tablero 30, pata 58×58, travesaño 40×40); reutiliza un
  mismo patrón de abrazo y fijación; la variante central es la lateral rotada 90°.
- **CONTRATO:** dado un par de miembros (qué abraza y a qué se fija), produce la pieza de unión con
  su forma y sus puntos de fijación.
- **NO-OBJETIVOS:** no es un catálogo de piezas sueltas; no inventa un patrón distinto por unión.
- **PREGUNTAS_ABIERTAS:** ¿el generador produce 2 piezas (escuadra tablero + conector travesaño) o 3
  (con el central como pieza aparte)? [ABIERTO — se decide en la disección]

## Suelo alcanzado

Las hojas atómicas (van al diseccionador):

- **ATÓMICO · Unión tablero→pata** — pieza que un test afirma: abraza tablero 30 y pata 58×58, fija ambos.
- **ATÓMICO · Unión travesaño→pata (lateral)** — abraza travesaño 40×40, fija a pata 58×58, orientación a lo largo.
- **ATÓMICO · Unión travesaño→pata (central)** — misma pieza, orientación a lo ancho (rotada 90°).

Hojas abiertas (no se expanden, se cierran en el onboarding del dueño):

- **[ABIERTO] · Tornillería** — qué fijación hay disponible.
- **[ABIERTO] · Nivelación** — si el suelo necesita zapatas.
- **[ABIERTO] · Retranqueo exacto** — 20 mm en ambos ejes o solo uno.
- **[ABIERTO] · Altura del travesaño central** — cuánto por encima de los laterales.

No hay repeticiones (cada unión es una hoja distinta por orientación).

## Convergencia

Una ronda entera sin productos nuevos → SUELO. El prisma se agota aquí: las uniones son átomos,
el generador las sintetiza, y lo demás son puertos abiertos del dueño. Pasa al diseccionador.
