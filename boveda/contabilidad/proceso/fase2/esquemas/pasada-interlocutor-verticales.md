# PASADA · INTERLOCUTOR: `las otras verticales del sistema` (FUENTE DE DATOS)

> Actor del mapa cerrado en F0 — `{ rol: "las otras verticales del sistema",
> canal: "bus de eventos", relacion: "FUENTE DE DATOS: emiten los hechos que contabilidad
> observa" }`.
>
> ⚠️ **Actor ESPECIAL: NO es una persona — es el SISTEMA.** No es un interlocutor que
> negocia: es la **fuente que ya emite los hechos** (venta, compra, consumo, movimiento de
> stock, cierre). Su prisma es distinto al de los otros tres: aquí **contabilidad es la
> OBSERVADORA**, y las verticales son las **productoras**. La relación es asimétrica por
> diseño: contabilidad **lee**, no obliga. Este prisma define el **contrato de eventos** que
> contabilidad necesita de cada vertical — y, sobre todo, **lo que NO puede exigirle**.

---

## Prisma de los 5 huecos DESDE la silla del sistema-productor

### 1 · IDENTIDAD — ¿qué es la contabilidad PARA las otras verticales?
**Un suscriptor que no produce nada.** Para una vertical (una pizzería, un taller, una tienda),
la contabilidad es **una más de las cosas que leen sus eventos**: un consumidor silencioso que
reconstruye lo que ya pasó. La vertical **no trabaja para contabilidad**; contabilidad
**observa** a la vertical. El sujeto ya se declara *"observadora — no produce hechos de
negocio; escucha los eventos que cada negocio ya emite"*. Esa asimetría es la esencia de este
prisma: el productor manda, la observadora se adapta.

### 2 · RESTRICCIONES — ¿qué le limita AL SISTEMA en su relación con la contabilidad?
*(los frenos aquí son frenos de la VERTICAL, y revelan lo que la contabilidad NO debe hacer)*

- **FRENO**: cada vertical emite sus hechos **a su manera** (nombres, campos, granularidad,
  momento) → la contabilidad no puede imponerle un formato único sin acoplarse a todas. →
  **EMPUJÓN**: **`normalizador-hecho`** (REF A2) + **`puerto-evento-vertical`** (REF A1) — la
  homogeneización vive **en la frontera de contabilidad**, nunca en la vertical.
- **FRENO**: la vertical puede declarar sus hechos **incompletos** (falta el tercero, la forma
  de pago, el desglose de impuestos) → contabilidad no puede reconstruir con eso. →
  **EMPUJÓN**: **`contrato-hecho-minimo`** *(pieza nueva: la lista mínima de campos que un hecho
  debe traer para poder asentarse; lo que falte → `cola-revision`, NO se obliga a la vertical a
  cambiarlo)* + **`completitud-cobertura`** *(mide qué hechos de una vertical llegaron y cuáles no)*.
- **FRENO**: la vertical puede emitir el hecho **tarde o fuera de orden** (una venta anulada,
  una devolución, una corrección posterior) → el asiento ya estaba hecho. → **EMPUJÓN**:
  **`hecho-rectificativo`** *(el hecho posterior que corrige al anterior; contabilidad no borra,
  añade — como `asiento-ajuste`, B5, pero del lado del hecho)* + **`clave-natural`** (REF M3)
  para casar el rectificativo con su original.
- **FRENO**: la vertical puede **republicar** un hecho (reintento de entrega, reinicio, doble
  envío) → duplicaría el asiento. → **EMPUJÓN**: **`deduplicacion-hecho`** (REF A7) apoyada en
  la **clave natural** de la vertical (REF M3): reprocesar no duplica.
- **FRENO**: la vertical **no declara** la unidad de cierre ni cómo identifica un hecho → la
  clave natural y el periodo quedan sin anclaje. → **EMPUJÓN**: **`anclaje-cierre-vertical`**
  *(la pieza que declara, por vertical, qué es "un cierre" y cómo se identifica — cuelga de
  `unidad_de_cierre` [ABIERTO], pero su puerto SÍ es construible)*.
- **FRENO**: si una vertical **no publica** ciertos hechos (p.ej. consumo de ingredientes), la
  contabilidad no puede reconstruir el stock. → **EMPUJÓN**: **`declaracion-fuente-faltante`**
  *(la contabilidad detecta el hueco y lo DECLARA — no obliga a la vertical a producir un hecho
  nuevo que no tenía; lo marca ABIERTO y avisa)*.

### 3 · CONTRATO — qué intercambia la contabilidad con las verticales
Aquí el contrato es **unidireccional + una devolución mínima** — es el **contrato de eventos**:

- **LA VERTICAL DA** (y contabilidad consume): los hechos que ya emite en su bus —
  **venta** (con forma de pago, tercero, impuestos), **compra/recepción**, **consumo de
  materia** (→ stock), **movimiento de inventario** (entrada/salida/merma) y **cierre de la
  jornada/período**. El sistema ya construyó el camino de "ventas por eventos".
- **LA VERTICAL RECIBE** (y contabilidad devuelve): **solo cálculos** (`contabilidad.*`) —
  saldos, coste calculado, valoración de existencias. **Nunca hechos de negocio** (cerrojo
  `frontera-planos`, REF M1). La vertical puede *leer* lo que contabilidad calculó, pero
  contabilidad **no le escribe el hecho**.
- **A cambio el conjunto gana**: que cada negocio **sepa sus cuentas** sin digitación — el
  propósito declarado en F0. La vertical sigue operando igual; ahora, además, cuadra sola.

### 4 · NO-OBJETIVOS — qué NO quiere el sistema-productor
- **NO quiere que contabilidad le obligue a producir hechos nuevos** para ella. La vertical ya
  emite lo suyo; si falta un hecho, contabilidad **lo declara abierto y se adapta** — no le
  impone trabajo nuevo.
- **NO quiere acoplarse a contabilidad**: si contabilidad no está activada, la vertical debe
  funcionar exactamente igual. Contabilidad es **activable por config** y **opcional para el
  productor**.
- **NO quiere que un cálculo contable **realimente** su operación** (bucle): la vertical no debe
  confundir un cálculo de contabilidad con un hecho de negocio (por eso `frontera-planos`).
- **NO quiere que se le imponga un formato/canal único**: el productor emite como ya sabe; la
  adaptación es del suscriptor.
- **NO quiere que un hecho suyo quede **asiento duplicado** por reintentos suyos.

### 5 · PREGUNTAS ABIERTAS (cero supuestos — nunca se estima)
- `unidad_de_cierre` — ¿qué es "un cierre" (jornada/día/mes) y cómo lo identifica cada vertical?
  NO declarado → **es el anclaje de la clave natural** (M4/B7).
- **¿Qué hechos emite HOY cada vertical y con qué campos?** Verificado a medias (las ventas por
  eventos, sí; el resto, no) → **contrato-hecho-minimo [ABIERTO]**.
- **¿Cada vertical declara el consumo de materia (receta/escandallo) o solo la venta?** NO
  declarado (familia de `fuente_coste_consumo`).
- **¿Qué vertical publica el movimiento de stock** (¿inventario lo custodia, la vertical lo emite,
  o ambos)? NO declarado.
- **¿Se emite un hecho de cierre** explícito por vertical, o el cierre lo infiere contabilidad?
  NO declarado.
- **¿Existen hechos sin vertical productora** (amortización, nómina, hecho del tiempo) que
  contabilidad deba **autoproducir**? NO declarado → toca C4/F2.
- **¿Qué pasa si una vertical está inactiva o no publica**: se marca hueco de cobertura o se
  asume vacío? NO declarado.
- **`cuando_reconstruye`** — ¿contabilidad reconstruye al vuelo o en el cierre? NO declarado.
- **`solape_marketing_budget`** — ¿qué otra pieza ya "custodia" un cálculo contable (marketing-budget)? NO declarado.

---

## PIEZAS que emergen SOLO desde la silla del SISTEMA-productor
*(invisibles desde la vista global — el árbol tiene la puerta de entrada, no el contrato que
la fuente debe cumplir ni la protección de que la fuente no cambie por culpa de contabilidad)*

- **`contrato-hecho-minimo`** — la **lista mínima de campos** que un hecho de una vertical debe
  traer para poder asentarse (tercero, fecha, importe, impuestos, forma de pago, clave natural).
  Es el contrato de eventos VISTO DESDE la fuente: no un formato impuesto, un **mínimo exigible**.
- **`completitud-cobertura`** — mide qué hechos publicó una vertical y cuáles **no llegaron**;
  convierte "falta un documento" en una señal medible (la cobertura de la reconstrucción).
- **`hecho-rectificativo`** — el hecho posterior que corrige o anula uno anterior; contabilidad
  no borra, añade (espejo de `asiento-ajuste`, B5, pero del lado del hecho).
- **`anclaje-cierre-vertical`** — declara **por vertical** qué es "un cierre" y cómo se
  identifica; es el punto que ancla la **clave natural** (cuelga de `unidad_de_cierre` [ABIERTO]).
- **`declaracion-fuente-faltante`** — la contabilidad **detecta** que una vertical no publica un
  hecho que ella necesita y **lo declara** (ABIERTO + aviso); **NO obliga** a la vertical a
  producirlo. Es la materialización del no-objetivo #1 del productor.

> **REF (ya en el árbol):** `puerto-evento-vertical` (A1), `normalizador-hecho` (A2),
> `deduplicacion-hecho` (A7), `cola-revision` (A8), `clave-natural` (M3), `frontera-planos` (M1),
> `asiento-ajuste` (B5), `periodificacion` (C3), `definicion-cierre` **[ABIERTO]** (M4),
> `puerto-ficha-producto` (H2).

> Punto **SECO** desde esta silla. **Nota para el padre:** este prisma es el único donde
> contabilidad es **subordinada** (lee, no manda); las 3 piezas nuevas del contrato de eventos
> pertenecen al grupo **A (entrada-hechos)** y refuerzan su condición de eslabón limitante.
