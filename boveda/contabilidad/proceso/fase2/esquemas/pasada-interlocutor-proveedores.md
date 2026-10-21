# PASADA · INTERLOCUTOR: `proveedores` (facturación de compra y pagos)

> Actor del mapa cerrado en F0 — `{ rol: "proveedores", canal: "facturacion",
> relacion: "facturacion de compra y pagos" }`. NO es el proveedor de fuentes/plataformas
> (ese es de la vertical de nichos): aquí es **quien vende al negocio** — el tercero que
> emite la factura de compra y al que hay que pagar. Para el proveedor, contabilidad es
> **una mesa de pagos con memoria**: la que registra lo que se le debe, cuándo vence y si
> ya cobró. Es la cara de las cuentas por pagar.

---

## Prisma de los 5 huecos DESDE la silla del proveedor

### 1 · IDENTIDAD — ¿qué es la contabilidad PARA el proveedor?
Un **libro de deudas con él**: el registro de sus facturas de compra y del estado de su
pago. Al proveedor no le interesa el mayor ni el balance — le interesa **su cuenta**: qué
facturas están vivas, cuánto suman, cuándo vencen y si están pagadas. Y le interesa que
ese registro sea **uno y sin duplicados** (una factura reenviada no es una deuda nueva).

### 2 · RESTRICCIONES — ¿qué le limita AL PROVEEDOR en la relación?
Cada freno se abre en un empujón construible:

- **FRENO**: la factura del proveedor no siempre coincide con lo que se recibió (precios,
  cantidades, portes). → **EMPUJÓN**: **`cruce-factura-recepcion`** — la factura de compra
  se coteja contra el pedido/recepción antes de asentarse; lo que no cuadra → cola de
  revisión. *Protege un estado real (que no se pague por lo que no llegó), luego su gemelo
  positivo es pieza.*
- **FRENO**: sin una cuenta por tercero no se sabe cuánto se debe a cada proveedor → pagos
  duplicados, impagos y una deuda total que no se puede desglosar. → **EMPUJÓN**:
  **`cuenta-proveedor`** (mayor auxiliar del tercero: cada factura viva y su saldo) +
  **`padron-terceros`** (identidad única del tercero por su número fiscal — un proveedor
  escrito de tres formas sigue siendo uno).
- **FRENO**: los vencimientos de pago se pasan → recargo, corte de suministro. → **EMPUJÓN**:
  **`vencimiento-pago`** (fecha de vencimiento por factura) → alimenta `prevision-caja` (REF
  E5) y **`motor-avisos`** (REF K2: "esta factura vence").
- **FRENO**: el mismo proveedor reenvía la misma factura (o llega por dos canales) → deuda
  inflada. → **EMPUJÓN**: **`deduplicacion-hecho`** (REF A7) apoyado en la identidad del
  tercero y la clave natural de la factura.
- **FRENO**: descuentos, rappels y pronto-pago que el proveedor concede y que, si no se
  registran, hacen que el coste real no sea el que se asentó. → **EMPUJÓN**:
  **`rappel-pronto-pago`** (ajusta el coste de la compra a lo realmente pagado).
- **FRENO**: el proveedor pide confirmar el saldo (conciliación de su cuenta con la empresa).
  → **EMPUJÓN**: **`estado-cuenta-proveedor`** (el extracto que el tercero puede confrontar).
- **FRENO**: cada proveedor emite en su formato; exigirle otro formato lo rompe. →
  **EMPUJÓN**: **`conversion-documento-a-dato`** (REF A4) — la adaptación la hace la frontera
  de contabilidad, nunca el proveedor.

### 3 · CONTRATO — qué intercambia con la contabilidad
- **DA**: la facción de compra (bien/servicio a cambio de una deuda) — la factura es el
  hecho que la contabilidad registra; el proveedor es el origen del hecho de compra.
- **RECIBE**: el pago (y su constancia), un **apunte fiable y sin duplicar** de lo que se le
  debe, y el **cotejo con lo recibido** (no se le paga a ciegas, pero tampoco se le paga de menos).
- **A cambio el conjunto gana**: el **coste de compra verificado** → coste de consumo,
  valoración de existencias y margen salen de aquí.

### 4 · NO-OBJETIVOS — qué NO quiere el proveedor
- NO quiere que le paguen tarde ni parcialmente sin explicación.
- NO quiere que le exijan cambiar su factura, su formato ni su canal (el proveedor emite
  como quiere — contabilidad se adapta).
- NO quiere que su factura se asiente sin cotejarse contra lo entregado (un asiento a ciegas
  genera reclamaciones de las dos partes).
- NO quiere aparecer duplicado como acreedor.

### 5 · PREGUNTAS ABIERTAS (cero supuestos — nunca se estima)
- ¿La factura de compra se **coteja** contra pedido/recepción, o se asienta directo? NO
  declarado.
- ¿Existen **rappels / descuentos / pronto-pago / anticipos a proveedor**? NO declarado.
- ¿Hay **retención de IRPF a proveedores** (profesionales)? NO declarado (toca `retenciones`,
  REF D4).
- ¿Quién **confirma el saldo** con el proveedor — dueño o asesor? NO declarado.
- ¿Por qué **canal/formato** llega la factura de compra (digital, papel, correo)? NO declarado
  (familia de `recepcion_digital_facturas`).
- ¿La compra de existencias pasa por **albarán de recepción** o solo por factura? NO declarado.

---

## PIEZAS que emergen SOLO desde la silla del proveedor
*(invisibles desde la vista global — el árbol tiene la factura como entrada, no al tercero
como acreedor vivo)*

- **`padron-terceros`** — identidad única del tercero (un proveedor = una cuenta, se escriba
  como se escriba). Prerrequisito de toda cuenta auxiliar.
- **`cuenta-proveedor`** — mayor auxiliar del tercero: cada factura de compra viva y su saldo.
- **`estado-cuenta-proveedor`** — el extracto confrontable con el proveedor (conciliación de saldos).
- **`cruce-factura-recepcion`** — cotejo pedido ↔ recepción ↔ factura antes de asentar (no se
  asienta a ciegas).
- **`vencimiento-pago`** — la fecha de vencimiento por factura; sin ella no hay previsión de caja
  ni aviso de pago.
- **`rappel-pronto-pago`** — descuentos/rappels/anticipos que ajustan el coste real de la compra.

> **REF (ya en el árbol):** `conversion-documento-a-dato` (A4), `deduplicacion-hecho` (A7),
> `cola-revision` (A8), `prevision-caja` (E5), `motor-avisos` (K2), `retenciones` (D4),
> `variacion-stock-valorada` (H4, la entrada por compra).

> Punto **SECO** desde esta silla.
