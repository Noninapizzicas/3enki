# PASADA · INTERLOCUTOR: `empleados` (nóminas)

> Actor del mapa cerrado en F0 — `{ rol: "empleados", canal: "nomina", relacion: "nominas" }`.
> El empleado es un **acreedor interno**: da su trabajo y espera un neto en su cuenta y una
> vida laboral correcta. Para el empleado, contabilidad es **el sitio donde su nómina existe
> como número y como obligación cumplida** — la parte que confirma que se le pagó y que se
> ingresó su cotización y su retención. Es la cara del coste de personal.

---

## Prisma de los 5 huecos DESDE la silla del empleado

### 1 · IDENTIDAD — ¿qué es la contabilidad PARA el empleado?
El **registro de su trabajo como coste y como obligación cumplida**: el bruto que le
corresponde, la retención que se ingresa por él, la cotización del trabajador, el neto que
recibe y la aportación de la empresa a su Seguridad Social. Al empleado no le interesa el
asiento: le interesa que **su nómina esté bien, que el neto coincida y que su retención y
cotización se hayan ingresado**. La contabilidad es su respaldo, no su interfaz.

### 2 · RESTRICCIONES — ¿qué le limita AL EMPLEADO en la relación?
- **FRENO**: el sistema no es una app de personal → ¿la nómina se calcula o se recibe hecha?
  Si la contabilidad **calcula** mal, el error es del negocio frente al empleado (un error
  que el empleado no puede resolver, solo reclamar). → **EMPUJÓN**: **`recibo-nomina`** (REF
  G1 admite el hecho, venga calculado o recibido) + **`lineas-nomina`** (desglose bruto /
  retención / cotización / neto, para que la nómina sea explicable, no un número pelado) +
  `calculo-nomina` **[ABIERTO]** (solo si el dueño declara que el producto las calcula).
- **FRENO**: la nómina es **datos personales** → no todo el mundo puede ver la de todos. →
  **EMPUJÓN**: **`acceso-nomina`** (aislamiento de la nómina frente a terceros; cada uno ve la
  suya; el resto es del asesor/dueño).
- **FRENO**: el empleado a veces cobra **fuera de nómina** (dietas, anticipos, finiquitos,
  pagas extra, retribución en especie) → si no se registran, su neto no cuadra ni su IRPF. →
  **EMPUJÓN**: **`pagos-a-cuenta-empleado`** (anticipos/adelantos) y **`conceptos-extra-nomina`**
  (dietas, especie, finiquito, paga extra) — el empleado es más que un sueldo fijo.
- **FRENO**: el hecho de nómina llega de un sistema externo o como documento, y la contabilidad
  no lo "crea" — la obligación es de otro. → **EMPUJÓN**: **`puerto-nomina`** (REF G4: origen
  declarable del dato; si no existe, se crea).
- **FRENO**: la obligación con la Seguridad Social y la retención tienen **plazo mensual**; si
  se ingresa tarde, la responsabilidad recae (también) sobre el trabajador. → **EMPUJÓN**:
  **`obligacion-seguridad-social`** (REF G2) + `calendario-fiscal` (REF D6) que avisa del plazo.
- **FRENO**: la **baja** del trabajador (finiquito, liquidación, indemnización) cierra su
  cuenta; si no se refleja, queda un acreedor abierto para siempre. → **EMPUJÓN**:
  **`liquidacion-baja-empleado`** (cierre de la cuenta del trabajador con su finiquito).

### 3 · CONTRATO — qué intercambia con la contabilidad
- **DA**: el hecho de nómina (él es el sujeto del hecho: trabajo prestado a cambio de sueldo);
  el origen del coste de personal.
- **RECIBE**: el **neto** (a través de la orden de pago que ejecuta el banco, no la contabilidad),
  y el **respaldo**: un recibo explicable, el ingreso de su retención y su cotización, y la
  constancia de que su cuenta como acreedor quedó en cero.
- **A cambio el conjunto gana**: el **coste de personal completo** imputado (a analítica por
  centro de coste, a grupo, a la cuenta de resultados).

### 4 · NO-OBJETIVOS — qué NO quiere el empleado
- NO quiere una nómina que no entienda (un neto pelado sin desglose).
- NO quiere que su nómina circule (datos personales → aislamiento).
- NO quiere que su retención o su cotización no se ingresen (su vida laboral y su IRPF dependen
  de ello).
- NO quiere reclamaciones por errores que **él no puede corregir** (por eso el desglose y la
  cola de revisión deben atraparlos antes de pagar).

### 5 · PREGUNTAS ABIERTAS (cero supuestos — nunca se estima)
- ¿El producto **calcula** las nóminas o solo **recibe el hecho** de otro sistema? NO declarado
  (G5 / pregunta 22).
- ¿De dónde **vienen** los datos de nómina (puerto concreto)? NO declarado.
- ¿Qué **convenio / tipos de cotización** aplican? NO declarado → no se estima.
- ¿Hay **dietas, anticipos, pagas extra, retribución en especie**? NO declarado.
- ¿Quién paga el neto — la propia contabilidad emite la orden, o solo el banco paga y ella
  observa? NO declarado (familia de "¿ejecuta o solo observa?", E).
- ¿Quién puede **ver** una nómina (el propio empleado? el asesor? el dueño)? NO declarado.
- ¿Cuántos **tipos de relación laboral** (fijo, temporal, autónomo dependiente) declara el
  negocio? NO declarado.

---

## PIEZAS que emergen SOLO desde la silla del empleado
*(invisibles desde la vista global — el árbol tiene el recibo de nómina, no al trabajador
como acreedor con desglose, privacidad, ni cuenta que hay que cerrar)*

- **`lineas-nomina`** — desglose bruto / retención / cotización trabajador / neto; hace la nómina
  **explicable** (satisface "información rica, no un dato pelado").
- **`acceso-nomina`** — aislamiento de la nómina (dato personal); quién ve qué.
- **`pagos-a-cuenta-empleado`** — anticipos y adelantos: no todos son sueldo fijo.
- **`conceptos-extra-nomina`** — dietas, retribución en especie, finiquitos, pagas extra.
- **`liquidacion-baja-empleado`** — cierre de la cuenta del trabajador (finiquito/indemnización)
  para que no quede un acreedor abierto.

> **REF (ya en el árbol):** `recibo-nomina` (G1), `obligacion-seguridad-social` (G2),
> `asiento-personal` (G3), `puerto-nomina` (G4), `calculo-nomina` **[ABIERTO]** (G5),
> `retenciones` (D4), `calendario-fiscal` (D6), `conversion-documento-a-dato` (A4),
> `cola-revision` (A8).

> Punto **SECO** desde esta silla. **Nota:** estas piezas son **vistas del trabajador** sobre
> G (personal); el padre decidirá si son piezas propias o facetas de las de G.
