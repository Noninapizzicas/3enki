# PASADA 2 · PUNTO: `tesoreria` (bancos · conciliación bancaria · cobros/pagos · previsión de caja)

> El bloque que **cruza el extracto del banco con el libro**. Hoy no existe en el sistema
> verificado. Es la segunda fuente de "documento que interpreta una persona", tras las facturas.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es la tesorería?
La **posición real de dinero**: cuentas bancarias y su saldo, **conciliación** entre el extracto
del banco y los movimientos del libro (cobros/pagos), y la **previsión de caja** (qué entra y
qué sale, y cuándo). Es la cara del sistema que responde a "¿cuánto dinero tengo y tendré?".

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: el extracto llega como documento y hay que casarlo a mano → trabajo humano.
  **EMPUJÓN**: **conciliacion-bancaria** (cruza movimiento de extracto ↔ asiento por reglas +
  juicio asistido; lo que no case → `cola-revision`).
- **FRENO**: el extracto entra por un canal no declarado. **EMPUJÓN**: **puerto-extracto**
  (declarable; si no existe canal, se crea).
- **FRENO**: un cobro en el banco y un cobro en ventas son el **mismo** hecho con dos vistas.
  **EMPUJÓN**: **cuadre-cobro-pago** (clave natural compartida: un movimiento = un cobro).
- **FRENO**: la previsión de caja exige datos no declarados (plazos de cobro/pago).
  **EMPUJÓN**: **prevision-caja** (construible) + `politica-cobro-pago` **[ABIERTO]**.

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** extractos (puerto) + cobros/pagos del libro.
- **Produce:** saldo de tesorería, conciliación cerrada, previsión de caja → los consume
  `estados-cierre` (tesorería del balance) y `producto-servicio` (avisos: "va a faltar caja").
- **A cambio el conjunto gana:** el **dato de caja real y proyectado**.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO ejecuta pagos ni cobros (el sistema es **observador**; mueve dinero el banco/la pasarela,
  no esta capa). NO abre cuentas. NO interpreta el extracto a ciegas: lo que no case, lo aparta.

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- `recepcion_digital_facturas` (familia) — ¿por qué canal llegan los **extractos**? NO declarado.
- ¿El sistema **ejecuta** cobros/pagos o sólo los **observa**? (el sujeto es observador →
  resolver con el dueño)
- ¿Qué **política de cobro/pago** (plazos) alimenta la previsión de caja? NO declarado.
- ¿Cuántas cuentas bancarias por negocio y en qué monedas? NO declarado.

---

## FRENOS → EMPUJONES consolidados
1. **conciliacion-bancaria** — cruza extracto ↔ libro; lo no casado → cola de revisión.
2. **puerto-extracto** — canal de entrada del extracto (declarable; si falta, se crea).
3. **cuadre-cobro-pago** — clave natural: un movimiento bancario = un cobro/pago.
4. **saldo-tesoreria** — posición real de dinero por cuenta.
5. **prevision-caja** — qué entra/sale y cuándo (proyecta desde los compromisos).

## Lo que sale de ESTE punto
- `conciliacion-bancaria` — hoja atómica → disección
- `puerto-extracto` — hoja atómica → disección
- `cuadre-cobro-pago` — hoja atómica → disección
- `saldo-tesoreria` — hoja atómica → disección
- `prevision-caja` — hoja atómica → disección
- `politica-cobro-pago` — **[ABIERTO]** (plazos que declara el negocio)

> Punto **SECO**.
