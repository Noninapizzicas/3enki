# PASADA · INTERLOCUTOR: `bancos` (extractos, conciliación, cobros y pagos)

> Actor del mapa cerrado en F0 — `{ rol: "bancos", canal: "extractos",
> relacion: "conciliacion bancaria, cobros y pagos" }`. El banco NO es una persona ni un
> socio: es una **institución que publica movimientos**. Para el banco, contabilidad es la
> **mesa que confronta su extracto con el libro** — la que explica por qué el saldo del
> banco y el saldo contable no son el mismo número. Es la cara de la tesorería.

---

## Prisma de los 5 huecos DESDE la silla del banco

### 1 · IDENTIDAD — ¿qué es la contabilidad PARA el banco?
Un **conciliador**: la parte del negocio que toma el extracto y lo casa con los cobros y
pagos que cree haber hecho. Para el banco, la contabilidad es **el otro lado del espejo**:
su extracto es la verdad de lo que pasó por la cuenta; la contabilidad debe poder explicar
cada línea y llegar al mismo saldo. No le pide permiso a nadie: publica y el negocio cuadra.

### 2 · RESTRICCIONES — ¿qué le limita AL BANCO en la relación con la contabilidad?
- **FRENO**: el extracto trae movimientos que el negocio **no originó** (comisiones,
  intereses a favor/en contra, devoluciones de recibos, impuestos bancarios) → el cuadre se
  rompe porque el libro no tiene esa contrapartida. → **EMPUJÓN**: **`partida-no-identificada`**
  (reconoce el movimiento sin contrapartida, lo clasifica y genera su asiento) +
  **`regla-movimiento-bancario`** (regla declarable/aprendida: "esta comisión → esta cuenta";
  a partir de la segunda vez, es automático).
- **FRENO**: el saldo del banco y el saldo contable **nunca coinciden por diseño** (partidas en
  tránsito: un cheque emitido y no cobrado, un cobro abonado y no apuntado). → **EMPUJÓN**:
  **`partida-conciliatoria`** + **`informe-conciliacion`** — la conciliación **explica** el
  desfase, no lo esconde.
- **FRENO**: un mismo cobro/pago vive en dos sitios (el banco y el libro) → riesgo de duplicar.
  → **EMPUJÓN**: **`cuadre-cobro-pago`** (REF E3) con clave natural compartida: un movimiento
  bancario = un cobro/pago, nunca dos.
- **FRENO**: hay varias cuentas y varias monedas → un solo saldo no las representa. →
  **EMPUJÓN**: **`maestro-cuentas-bancarias`** (catálogo declarable de cuentas y su moneda) y,
  si la cuenta no está en la moneda base, **`diferencia-cambio`**.
- **FRENO**: el extracto entra por un canal no declarado y en el formato propio de cada banco.
  → **EMPUJÓN**: **`puerto-extracto`** (REF E2) — un adaptador por banco; si falta canal, se crea.
- **FRENO**: el extracto mezcla **fecha de operación y fecha valor**; asentar por la fecha
  equivocada periodifica mal. → **EMPUJÓN**: **`periodificacion`** (REF C3) alimentada por las
  dos fechas del extracto (ambas se conservan, no se elige una).

### 3 · CONTRATO — qué intercambia con la contabilidad
- **DA**: el extracto (los movimientos reales de la cuenta: cobros, pagos, comisiones, intereses).
- **RECIBE**: la constancia de que cada línea del extracto halló su contrapartida en el libro, y
  el reconocimiento de los movimientos que el libro no tenía.
- **A cambio el conjunto gana**: el **dato de caja real** (`saldo-tesoreria`, REF E4) y la base
  fiable de la **previsión de caja** (REF E5). El banco es la única fuente que dice "cuánto
  dinero hay de verdad".

### 4 · NO-OBJETIVOS — qué NO quiere el banco
- NO quiere que la contabilidad **mueva** dinero, abra cuentas ni emita órdenes (la
  contabilidad es **observadora**: mueve dinero el banco, no su libro).
- NO quiere que se le atribuya un movimiento a un negocio que no es el suyo (cada cuenta vive
  en su aislamiento multi-tenant).
- NO quiere que se reescriba ni se "arregle" su extracto (el extracto es un hecho publicado;
  lo que se ajusta es el libro, no el banco).
- NO quiere que un saldo cuadre por conveniencia: si hay desfase, se declara.

### 5 · PREGUNTAS ABIERTAS (cero supuestos — nunca se estima)
- ¿La contabilidad **ejecuta** cobros/pagos o solo los **observa**? NO declarado (el sujeto se
  declara observador → confirmar con el dueño).
- ¿Cuántas **cuentas bancarias** por negocio y en qué **monedas**? NO declarado.
- ¿Por qué **canal/formato** llega cada extracto (descarga, conexión directa, papel)? NO declarado.
- ¿La **conciliación** se corre al día o al cierre? NO declarado (familia de `cuando_reconstruye`).
- ¿Comisiones e intereses se reclasifican automáticamente o pasan por revisión humana? NO declarado.
- ¿Hay **domiciliación de recibos** (cargos por mandato) o solo transferencias? NO declarado.
- ¿Qué **política de cobro/pago** (plazos) alimenta la previsión de caja? NO declarado (ya en E6).

---

## PIEZAS que emergen SOLO desde la silla del banco
*(invisibles desde la vista global — el árbol tiene la conciliación, no los movimientos que
el banco pone y el libro no tiene, ni el desfase que hay que explicar)*

- **`partida-no-identificada`** — el movimiento del extracto sin contrapartida en el libro
  (comisión, interés, devolución): se reconoce y se asienta, no se ignora.
- **`regla-movimiento-bancario`** — regla declarable/aprendida que clasifica el movimiento
  bancario recurrente; convierte "revisar cada línea" en automático.
- **`partida-conciliatoria`** — las partidas en tránsito que explican el desfase entre el saldo
  del banco y el saldo contable (cheque no cobrado, cobro no apuntado).
- **`informe-conciliacion`** — el documento de cuadre (saldo banco ↔ saldo contable ajustado);
  es la prueba de que el cuadre cuadra.
- **`maestro-cuentas-bancarias`** — catálogo declarable de cuentas (y su moneda); sin él, "el
  banco" es un solo número falso.
- **`diferencia-cambio`** — la diferencia por moneda distinta de la base; **[ABIERTO]** hasta que
  el dueño declare multi-moneda.

> **REF (ya en el árbol):** `puerto-extracto` (E2), `conciliacion-bancaria` (E1),
> `cuadre-cobro-pago` (E3), `saldo-tesoreria` (E4), `prevision-caja` (E5), `politica-cobro-pago`
> (E6), `periodificacion` (C3), `cola-revision` (A8), `clave-natural` (M3).

> Punto **SECO** desde esta silla.
