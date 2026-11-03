# PASADA 2 · PUNTO: `ruta-viva`

> Sale del hueco RESTRICCIONES de la pasada 1: sin saber por dónde va el rider, "desvío" y
> "retraso" son palabras. Este punto **nació del matiz**: con el enlazado genérico ("2–3
> pedidos") bastaba un contador; con el enlazado **por trayecto** hace falta la ruta viva.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El trayecto que un rider lleva encima **ahora mismo**: dónde está, qué paradas le quedan, en
qué orden, y **qué hora le prometió a cada pedido**. Es la memoria contra la que se mide
cualquier enlace: sin promesa no hay retraso, y sin retraso el umbral de 6 minutos no existe.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: la posición cambia cada segundo y no se puede estar preguntando.
  → **EMPUJÓN**: `posicion-rider` es un hecho con hora, no un flujo continuo; el esquema no
  exige frecuencia, exige **frescura declarada** (y si está vieja, `hueco-de-medida`).
- **FRENO**: el orden de las paradas se puede mejorar, y mejorarlo es tentador a escala.
  → **EMPUJÓN**: `orden-de-paradas` optimiza **una** ruta, no el mercado. La frontera está
  escrita y tiene test.
- **FRENO**: ¿cuántos caben? Nadie lo ha declarado.
  → **EMPUJÓN**: `capacidad-declarada` — el rider dice qué cabe en su caja/mochila; se
  declara, no se estima. **Q33**.

### 3 · CONTRATO
Da: su posición y su disponibilidad. Recibe: que su trayecto **no empeore** por culpa de un
enlace que él no pidió — o que, si empeora, sea dentro de un número declarado y con la
posibilidad de decir que no.

### 4 · NO-OBJETIVOS
- No es un rastreador: no se guarda la traza más de lo que haga falta (Q38).
- No es un planificador: no reordena entre riders, solo dentro de uno.
- No mide al rider: mide el trayecto.

### 5 · PREGUNTAS ABIERTAS
Cuánto cabe (Q33) · qué frescura debe tener una posición (Q37) · cuánto tiempo se guarda la
traza (Q38) · si el rider puede llevar pedidos de dos tiendas a la vez (Q31).

## Hojas
`posicion-rider` (CUSTODIO) · `paradas-pendientes` (REFLEJO) · `promesa-por-parada` (CUSTODIO) ·
`orden-de-paradas` (REFLEJO) · `capacidad-declarada` (CUSTODIO) · `fin-de-trayecto` (REFLEJO)

Seis, todas atómicas: ninguna se parte más.
