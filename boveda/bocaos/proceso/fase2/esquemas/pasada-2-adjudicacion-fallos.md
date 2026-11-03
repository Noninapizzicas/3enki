# PASADA 2 · PUNTO: `adjudicacion-fallos`

> **Heredada de la pasada 2** (`fase2-v2/esquemas/pasada-2-adjudicacion-fallos.md`) y revalidada contra la F0 §7.
> G. Sin cambios: se adjudica con los hechos que están en la plaza, y el nacional no los ve.
> Se reproduce aquí para que `esquemas/` quede completo; los deltas de la tercera pasada
> están en `pasada-2-corte-de-piezas.md` y en `esquema.md` §1.

> Sale del hueco RESTRICCIONES de la pasada 1 ("no juzga los fallos, los mide"). Con el matiz
> este punto gana una función: **alimenta el histórico que el rider mira antes de aceptar**
> (L03) y **protege la promesa** que el umbral de retraso mide (A31).

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El mecanismo por el que un fallo se paga sin que nadie dictamine: una ventana declarada, un
hecho con hora, una tabla y un cargo con evidencia. Donde otro pone un agente que opina,
Bocaos pone un reloj.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: sin números, "la cocina es lenta" es una opinión.
  → **EMPUJÓN**: `ventana-espera` — las N declaradas por el proyecto, con vigencia (**Q28**).
- **FRENO**: sin evidencia, el cargo es un abuso.
  → **EMPUJÓN**: `trazabilidad-fallo` (invariante: sin hecho, no hay cargo).
- **FRENO**: Bocaos no toca el dinero, así que un cargo puede ser decorativo.
  → **EMPUJÓN**: `cargo-fallo` es una **deuda con evidencia**, y `cobro-gestion` (H04) la
  compensa contra la cuota semanal. Que eso sea legal y suficiente es **Q29** — el esquema no
  lo da por hecho.

### 3 · CONTRATO
La tienda da: la hora a la que dijo que estaría. El rider da: la hora a la que llegó. Los dos
reciben: la misma medida, sin interpretación.

### 4 · NO-OBJETIVOS
No juzga la intención · no sanciona · no expulsa (eso es `accion-sancion`, P03) · no reabre un
caso cerrado sin hecho nuevo.

### 5 · PREGUNTAS ABIERTAS
Q28 (las tres N) · Q29 (efectividad del cargo) · Q30 (presunción sin prueba) · Q24 (quién decide
en una disputa) · Q11 (si el fallo lo causa Bocaos, ¿quién paga?)

## Hojas
`ventana-espera` (CUSTODIO) · `hecho-verificado` (REFLEJO) · `regla-pago-fallo` (REFLEJO) ·
`cargo-fallo` (CUSTODIO) · `disputa-fallo` (PUENTE) · `trazabilidad-fallo` (REFLEJO)
