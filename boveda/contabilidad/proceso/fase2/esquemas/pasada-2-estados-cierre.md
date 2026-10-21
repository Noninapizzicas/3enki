# PASADA 2 · PUNTO: `estados-cierre` (balance · cuenta de resultados · cierre · periodificación)

> El punto que convierte el libro en **documentos presentables** y en el **hito del cierre**.
> Es el momento en que todo debe cuadrar; pero —a diferencia de la entrada— es **periódico y
> determinista**, y sólo puede cuadrar si la entrada está completa → **no es el cuello**.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es este punto?
La **salida contable formal**: **balance de situación**, **cuenta de resultados**, y el
**cierre** (de ejercicio, con ajustes y **periodificación**). Es lo que el asesor **presenta**:
por eso su calidad decide la medida maestra ("que lo acepte y pueda presentarlo").

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: un estado sólo cuadra si la entrada está completa → **depende del cuello**.
  **EMPUJÓN**: **aviso-cuadre** (si falta cobertura, no finge: avisa y marca descuadre, empujón
  hacia `producto-servicio/motor-avisos`).
- **FRENO**: los hechos ocurren a caballo del periodo (gasto de un mes cobrado en otro) → sin
  **periodificación** el resultado miente. **EMPUJÓN**: **periodificacion** (imputa al periodo
  correcto) + **criterio-periodo** declarable.
- **FRENO**: cerrar el ejercicio sin base de apertura deja el año siguiente sin suelo. **EMPUJÓN**:
  **apertura-ejercicio** (asientos de apertura derivados del cierre anterior).
- **FRENO**: el cierre es irreversible y el asesor corrige después. **EMPUJÓN**: cierre como
  CUSTODIO + camino de ajuste post-cierre (REF `asiento-ajuste`).

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** mayor/balanza del núcleo.
- **Produce:** balance, cuenta de resultados, cierre (foto) y apertura → los consumen
  `revision-asesor` (presentación) y `capa-fiscal` (base de IS/IRPF).
- **A cambio el conjunto gana:** el **entregable presentable** y la **frontera de ejercicio**.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO asienta (núcleo). NO presenta el modelo fiscal (fiscal). NO decide el periodo (ABIERTO).
- NO produce un estado si el dato falta: lo publica con **descuadre declarado** y avisa.

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- `momento_de_uso` — ¿el cierre es **diario/mensual/anual**? ¿con qué ritmo se presentan estados?
- `unidad_de_cierre` — ¿qué delimita un periodo contable en este producto?
- `cuando_reconstruye` — ¿los estados se recalculan en vivo o sólo al cierre?
- ¿El balance y la cuenta de resultados siguen un **formato oficial** concreto? (NO declarado)

---

## FRENOS → EMPUJONES consolidados
1. **balance-situacion** — estado presentable (activo/pasivo/patrimonio).
2. **cuenta-resultados** — estado presentable (ingresos/gastos/resultado).
3. **periodificacion** — imputa cada hecho a su periodo (sin mentir el resultado).
4. **cierre-ejercicio** — cierra el periodo con ajustes (CUSTODIO, irreversible salvo ajuste).
5. **apertura-ejercicio** — abre el siguiente periodo desde el cierre anterior.
6. **aviso-cuadre** — no finge el cuadre: si falta cobertura, avisa (empujón al motor de avisos).

## Lo que sale de ESTE punto
- `balance-situacion` — hoja atómica → disección
- `cuenta-resultados` — hoja atómica → disección
- `periodificacion` — hoja atómica → disección
- `cierre-ejercicio` — hoja atómica → disección
- `apertura-ejercicio` — hoja atómica → disección
- `aviso-cuadre` — hoja atómica → disección
- `criterio-periodo` — **[ABIERTO]** (se cierra con `momento_de_uso` / `unidad_de_cierre`)

> Punto **SECO**: no queda ningún sub-producto que partir.
