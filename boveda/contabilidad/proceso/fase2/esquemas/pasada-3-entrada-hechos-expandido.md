# PASADA 3 · PUNTO: `entrada-hechos` — expandido (EL CUELLO, segunda ronda)

> La admisión **no se secó** en la ronda 2: es continua, heterogénea y con juicio → vuelve al
> prisma. Aquí se parten sus sub-productos hasta que cada hoja sea **atómica** o **abierta**.

---

## Prisma sobre el sub-producto `conversion-documento-a-dato`

### 1 · IDENTIDAD
El conversor de frontera que **abre un documento y lo vuelve dato** contable: extrae importes,
fechas, tercero, líneas, impuestos. Es el paso que hoy hace una persona al digitar.

### 2 · RESTRICCIONES → EMPUJONES
- **FRENO**: el documento puede venir en cualquier forma (papel digitalizado, PDF, estructurado).
  **EMPUJÓN**: **puerto-documento** (formas declarables; el adaptador lo pone el sitio).
- **FRENO**: lo extraído puede no cuadrar o faltar. **EMPUJÓN**: **control-cuadre-documento**
  (si importe+impuestos no cuadran → `cola-revision`, no se asienta mal).
- **FRENO**: el mismo documento puede llegar dos veces (digitalizado y digital). **EMPUJÓN**:
  REF `deduplicacion-hecho` (clave natural del documento: nº + tercero + fecha + importe).

### 3 · CONTRATO
Recibe documento → produce dato normalizado + señal de confianza (para decidir si va a revisión).

### 4 · NO-OBJETIVOS
NO asienta. NO clasifica la contrapartida (eso es `resolucion-contrapartida`). NO adivina: lo que
no cuadra, lo aparta.

### 5 · PREGUNTAS ABIERTAS
- ¿Qué **precisión** exige el dueño al asesor para aceptar un documento auto-procesado? NO declarado.
- `recepcion_digital_facturas` — ¿por qué canal/formato llegan las "recibidas digitales"? NO declarado.

**Hojas (finales):** `puerto-documento` ATÓMICO · `control-cuadre-documento` ATÓMICO ·
`extraccion-dato` ATÓMICO. **Seco.**

---

## Prisma sobre el sub-producto `resolucion-contrapartida`

### 1 · IDENTIDAD
Dado un hecho normalizado, **propone y resuelve** su contrapartida: qué cuenta, qué tercero
(cliente/proveedor), qué periodo, y si el hecho está completo para asentar.

### 2 · RESTRICCIONES → EMPUJONES
- **FRENO**: proponer la contrapartida exige juicio contra el plan del negocio. **EMPUJÓN**:
  **contrapartida-asistida** (micro-agente que propone con el plan declarado; el corte duro lo fija
  la regla).
- **FRENO**: hechos recurrentes deberían resolverse solos. **EMPUJÓN**: **regla-contrapartida**
  (regla declarable/aprendida: "este proveedor → esta cuenta").
- **FRENO**: un hecho puede estar **incompleto** (falta un dato) → no se puede asentar.
  **EMPUJÓN**: `regla-hecho-incompleto` **[ABIERTO]** (¿asienta provisional, espera, o avisa?).

### 3 · CONTRATO
Recibe hecho normalizado + plan → produce asiento propuesto (cuenta/tercero/periodo) o marca de
incompleto → `cola-revision`.

### 4 · NO-OBJETIVOS
NO escribe el asiento (eso es el núcleo). NO decide el plan (lo declara el negocio).

### 5 · PREGUNTAS ABIERTAS
- `unidad_de_cierre` — el periodo de imputación depende de qué es un cierre → NO declarado.
- ¿La **contrapartida aprendida** se memoriza por tercero o por concepto? NO declarado.

**Hojas (finales):** `contrapartida-asistida` ATÓMICO · `regla-contrapartida` ATÓMICO ·
`regla-hecho-incompleto` **[ABIERTO]**. **Seco.**

---

## Prisma sobre el sub-producto `cola-revision` (excepciones)

### 1 · IDENTIDAD
El **buffer de lo que la automatización no puede sola**: documento ilegible, dato que no cuadra,
hecho incompleto. Es lo que impide que la entrada se atasque → el flujo sigue y lo dudoso espera.

### 2 · RESTRICCIONES → EMPUJONES
- **FRENO**: sin cola, lo dudoso bloquearía el flujo (colapso). **EMPUJÓN**: **encolado-excepcion**
  (el hecho va a cola y el flujo continúa).
- **FRENO**: sin aviso, la cola crecería invisible. **EMPUJÓN**: **aviso-revision** (empujón al
  `motor-avisos`: "esto necesita revisión" — aviso natural con el asesor dentro).
- **FRENO**: ¿quién resuelve la cola (asesor, dueño)? NO declarado. **EMPUJÓN**: REF
  `revision-asesor` + `dueno-cola-revision` **[ABIERTO]**.

### 3 · CONTRATO
Recibe excepciones → produce cola ordenada + aviso + resolución (que vuelve a la entrada).

### 4 · NO-OBJETIVOS
NO asienta. NO oculta: una excepción siempre genera aviso (no pantalla muda).

### 5 · PREGUNTAS ABIERTAS
- `cola_revision` — ¿quién y cómo resuelve lo que no se pudo automatizar? NO declarado.

**Hojas (finales):** `encolado-excepcion` ATÓMICO · `aviso-revision` ATÓMICO ·
`dueno-cola-revision` **[ABIERTO]**. **Seco.**

---

## Prisma sobre el sub-producto `entrada-por-lotes`

### 1 · IDENTIDAD
El **desacople del cuello**: admitir N hechos en paralelo en vez de uno a uno (mismo patrón que el
batch del molde de nichos: "desacople del cuello, N en paralelo").

### 2 · RESTRICCIONES → EMPUJONES
- **FRENO**: la entrada en serie atasca. **EMPUJÓN**: **lote-admision** (admite por lotes/hilos).
- **FRENO**: procesar en paralelo sin single-writer corrompería. **EMPUJÓN**: REF `single-writer`
  (el paralelismo es de admisión, la escritura sigue siendo única).

### 3 · CONTRATO
Recibe la lista de hechos pendientes → produce admisión en paralelo → entrega al núcleo.

### 4 · NO-OBJETIVOS
NO cambia el orden contable (sólo acelera la admisión). NO rompe la idempotencia.

### 5 · PREGUNTAS ABIERTAS
- ¿Cuántos hechos en paralelo en la primera corrida? NO declarado.

**Hojas (finales):** `lote-admision` ATÓMICO. **Seco.**

---

## Resultado de la ronda 3
Todas las hojas de `entrada-hechos` son ahora **ATÓMICAS** o **[ABIERTAS]** →
**el prisma está SECO** (1 ronda global + 13 pasadas-2 + 1 pasada-3 = 15 pasadas).
