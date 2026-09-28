# PASADA · INTERLOCUTOR: `clientes`

> Actor externo-relacional del mapa **cerrado en F0** (`resumen.interlocutores[3]`).
> `rol`: **clientes** · `canal`: **facturación** · `relación`: **facturación de venta y cobros**.
> Actor **múltiple** (cada negocio tiene los suyos) y **externo**: ve sólo la cara emitida del sistema
> — **su factura** y **su cobro** — nunca la contabilidad de dentro. Las piezas ya existentes se citan
> como **REF**. **Agnosticismo:** cero tecnologías. **Cero supuestos:** lo no declarado va `[ABIERTO]`.

---

## Prisma de los 5 huecos DESDE la silla del cliente

### 1 · IDENTIDAD — ¿qué es la contabilidad PARA el cliente?
El **papel que le da derecho**: la **factura** (y su recibo de cobro). El cliente no ve contabilidad,
ni asientos, ni IVA devengado: ve un documento con **sus datos fiscales**, su **desglose de impuestos**
y su **importe a pagar**, que le sirve para justificar su gasto y deducir su cuota. Para el cliente la
contabilidad es **invisible**: sólo existe su cara emitida — **facturación de venta y cobros**.

### 2 · RESTRICCIONES — ¿qué le limita AL CLIENTE en esta relación?
- **FRENO**: un documento que no sirve fiscalmente (sin sus datos, sin desglose, mal numerado) es papel
  mojado para él. → **EMPUJÓN**: **`emision-factura-venta`** (la cara emitida: serie/numeración, datos
  fiscales del emisor y del cliente, desglose de impuestos) — distinta de REF `registro-verifactu` (D8,
  el registro interno no alterable) y de REF `factura-electronica` (D9, el formato estructurado).
- **FRENO**: el cliente **no siempre paga en plazo ni por el importe esperado** → el hecho de venta no
  coincide con el cobro. → **EMPUJÓN**: REF `cuadre-cobro-pago` (E3) + REF `conciliacion-bancaria` (E1)
  + **`antiguedad-de-saldos`** (clasificación de lo pendiente por vencimiento: quién y cuánto está
  vencido — lo que alimenta la reclamación y REF `politica-cobro-pago` E6).
- **FRENO**: puede **discutir, devolver o bonificar** una factura ya emitida (abono, descuento posterior,
  rectificativa). → **EMPUJÓN**: **`factura-rectificativa`** (camino comercial de la corrección POSTERIOR
  a la emisión, que no borra nada; distinto del ajuste interno REF B5).
- **FRENO**: cada cliente es un **tercero distinto** con sus datos fiscales y sus condiciones; **hoy el
  árbol no declara dónde vive esa ficha** (REF `contrapartida-asistida` A6.1 "propone cuenta/**tercero**"
  la presupone, pero **no existe**). → **EMPUJÓN**: **`maestro-terceros`** (ficha única de
  cliente/proveedor: identificación fiscal, condiciones de pago/cobro, historial de facturas y cobros).
  **Hueco real del esquema, invisible desde la vista global.**
- **FRENO**: cobrar es fricción; cada minuto que tarda el cobro retrasa el hecho de caja. → **EMPUJÓN**:
  REF `deduplicacion-hecho` (A7, un cobro = un asiento) + REF `lote-admision` (A9).
- **FRENO**: el cliente quiere el documento **ya**; la administración quiere el registro **encadenado y
  no alterable** (dos tiempos distintos, un mismo hecho). → **EMPUJÓN**: REF `factura-electronica` (D9)
  + REF `registro-verifactu` (D8), con la **emisión** (`emision-factura-venta`) por delante.
- **FRENO**: el cliente no ve contabilidad; si el sistema le pidiera "cuadrar", desistiría. → **EMPUJÓN**:
  la cara cliente sólo muestra **lo suyo** (REF `aislamiento-negocio` I4) — ningún dato de dentro se filtra.

### 3 · CONTRATO — qué intercambia con la contabilidad
- **DA**: su **pago** y sus **datos fiscales**; su **factura pagada/impagada** es el hecho que el sistema
  observa.
- **RECIBE**: la **factura correcta** (deducible), su **recibo**, su **estado de cuenta** y, cuando toca,
  la **rectificativa**.
- **El sistema gana**: el **hecho de venta** (REF `puerto-evento-vertical` A1) y el **cobro** (REF E3) —
  es **fuente de entrada**, no destinatario de contabilidad.

### 4 · NO-OBJETIVOS — qué NO quiere el cliente
- NO quiere ver contabilidad ni asientos: quiere **su factura** y **su recibo**.
- NO quiere un documento inservible fiscalmente (sin desglose, sin sus datos).
- NO quiere **sorpresas de cobro** (importes que no reconoce, cargos que no esperaba).
- NO quiere fricción para pagar (si el cobro es torpe, abandona).
- NO quiere que datos internos del negocio le lleguen (aislamiento, REF I4).

### 5 · PREGUNTAS ABIERTAS (cero supuestos — no se estima)
1. **¿Quién es el cliente exacto?** Actor múltiple: **no se fija en F0** — lo llena cada negocio. `[ABIERTO]`.
2. **`recepcion_digital_facturas`** (A5/D9) — ¿por qué canal/formato recibe la factura el cliente? NO declarado.
3. **Pagador vs receptor** — ¿el que paga es siempre el mismo tercero que el facturado? NO declarado.
4. **Series y numeración** — ¿serie por negocio, por canal o única? NO declarado.
5. **Ticket vs factura** — ¿se emite ticket, factura o ambos según el caso? NO declarado.
6. **¿El sistema ejecuta el cobro o sólo lo observa?** — pregunta 21 del esquema; NO declarado (toca E).
7. **Plazo y forma de pago** — REF `politica-cobro-pago` (E6) NO declarado; ¿dónde se declara la
   condición por cliente? (nuevo `maestro-terceros`).

---

## FRENOS → EMPUJONES (consolidado del cliente)
| Freno | Empujón |
|---|---|
| Un documento que no sirve fiscalmente es papel mojado | `emision-factura-venta` (≠ REF D8/D9) |
| No paga en plazo ni por el importe esperado | `antiguedad-de-saldos` (REF cuadre-cobro-pago E3 · conciliacion-bancaria E1) |
| Puede devolver/bonificar una factura ya emitida | `factura-rectificativa` (≠ REF asiento-ajuste B5) |
| Cada cliente es un tercero con su ficha (que no existe) | `maestro-terceros` (presupuesto por REF A6.1) |
| Cobrar es fricción y retrasa el hecho de caja | REF `deduplicacion-hecho` A7 + `lote-admision` A9 |
| Quiere el documento ya; el registro va encadenado | REF `factura-electronica` D9 + `registro-verifactu` D8 |
| No debe ver nada de dentro | REF `aislamiento-negocio` I4 |

## PIEZAS que emergen SOLO desde el cliente → al árbol
- **`emision-factura-venta`** — ATÓMICO (cara emitida: serie/numeración · datos fiscales · desglose). **LÓGICA NUEVA** (el árbol tiene el registro interno D8 y el formato D9, pero **no la emisión**).
- **`factura-rectificativa`** — ATÓMICO (corrección comercial posterior a la emisión: abono/devolución/descuento). **LÓGICA NUEVA** (≠ ajuste interno B5).
- **`antiguedad-de-saldos`** — ATÓMICO (lo pendiente clasificado por vencimiento). **LÓGICA NUEVA** (invisible desde la vista global).
- **`maestro-terceros`** — ATÓMICO (ficha única de cliente/proveedor: identificación fiscal, condiciones, historial). **LÓGICA NUEVA** — **hueco real**: A6.1 propone "cuenta/**tercero**" y el tercero **no existe en el árbol**.
- **REF** (no se duplican): `registro-verifactu` D8 · `factura-electronica` D9 · `conciliacion-bancaria` E1 · `cuadre-cobro-pago` E3 · `politica-cobro-pago` E6 · `asiento-ajuste` B5 · `contrapartida-asistida` A6.1 · `deduplicacion-hecho` A7 · `lote-admision` A9 · `puerto-evento-vertical` A1 · `aislamiento-negocio` I4.

> Punto **SECO** salvo los `[ABIERTO]`, que los cierra el dueño (no se estiman).
