# Pasada 1 — Prisma de 5 preguntas-jefe (cobros v3.0.0)

> SUJETO correcto: **la cara del ROL JEFE de cobros** — el pago universal de
> Prisma. NO el módulo entero. El jefe GESTIONA los cobros del día: verlos,
> confirmarlos, reembolsarlos. La utilización (el POS cobrando al cliente) es
> otra cara, anotada y fuera.
>
> Fuente: `modules/pizzepos/cobros/index.js` (leído completo, 665 líneas) +
> `module.json` v3.0.0 (9 ui_handlers verificados) + `schemas/cobro.json`.

## Las 5 preguntas-jefe

### 1. IDENTIDAD — ¿Qué DECIDE el jefe aquí?

El jefe NO cobra al cliente (eso pasa en el POS, capa utilización). El jefe
DECIDE las TRANSICIONES del ciclo de vida del cobro ya iniciado:

- **D1 — CONFIRMAR el pago** (`cobro.confirm`): la TRANSICIÓN central. Lleva un
  cobro `pendiente`/`procesando` → `completado`. Emite `cobro.procesado`
  (el evento que cuentas escucha para marcar como cobrado) y, si es efectivo,
  abre el cajón (`periferico.abrir-cajon`, best-effort). Es LA decisión que
  cierra la venta.
- **D2 — REEMBOLSAR** (`cobro.refund`): la transición INVERSA. Lleva un cobro
  `completado` → `reembolsado`. Emite `cobro.reembolsado`. Destructiva/gruesa:
  devuelve dinero al cliente.
- **D3 — INICIAR un cobro** (`cobro.create`): arranca el cobro sobre una cuenta
  con método de pago y monto. Idempotente por cuenta (rechaza si ya hay
  pendiente/procesando/completado). Emite `cobro.iniciado`.

El panel-jefe de cobros es una **ESTACIÓN DE TRANSICIONES del dinero del día**:
ver qué hay pendiente, confirmar lo cobrado, reembolsar lo que haya que
devolver.

### 2. RESTRICCIONES — ¿Qué NO depende de él?

- El **custodio del cobro es el MÓDULO cobros** (in-memory, Map cobros +
  refDisplayCache). El juez del ciclo de vida es el MÓDULO, no la UI: guardas
  reales — `confirm` rechaza si no está `pendiente`/`procesando` (409
  CONFLICT_STATE); `refund` exige `completado` (409); `create` rechaza cuentas
  `llevadoo_*` (pagan externamente, 400 INVALID_INPUT) y cobros duplicados
  (409 ALREADY_EXISTS).
- **El monto lo fija la cuenta/pedido**, no el jefe al confirmar: `confirm`
  solo recibe `id` (+ `referencia_pago` opcional). El jefe no re-precía.
- **`caja.cerrada` / `dia.iniciado` limpian los cobros del día** (onCajaCerrada
  / onDiaIniciado → `cobros.clear()`). El histórico muere al cerrar caja.
- **El cajón es best-effort**: `periferico.abrir-cajon` no falla el cobro si el
  cajón no abre.
- **Moneda: EUROS** (no céntimos). `monto + propina = monto_total`;
  `cambio = monto_recibido - monto_total`; `toFixed(2)` en el desglose mixto.
  El shape del cobro trabaja en euros.

### 3. CONTRATO — ¿Qué necesita VER y qué SEÑAL confirma?

VER (lecturas que alimentan la decisión):
- `cobro.list` (filtros cuenta_id/estado/metodo_pago, orden desc por
  created_at, respuesta `{cobros[], total}`) — la cinta y el ref-select.
- `cobro.get` (cobro completo por id) — el detalle que alimenta el gesto.
- `cobro.payment-methods` (los 7 métodos canónicos con nombre legible).
- `cobro.list-cajones` (cajones conectados, consulta a periféricos).
- `cobro.health` / `cobro.metrics` (pulso del módulo, sistema).

SEÑALES de confirmación (verificadas en index.js):
- `create` → `cobro.iniciado` (publishCobroIniciado, L493)
- `confirm` → `cobro.procesado` (publishCobroProcesado, L505) + `periferico.abrir-cajon` si efectivo
- `refund` → `cobro.reembolsado` (publishCobroReembolsado, L518)

El refresco parea [list→señal]: la vista re-lee, NUNCA recarga.

### 4. NO-OBJETIVOS — ¿Qué caras NO son del jefe?

- **UTILIZACIÓN (POS)**: cobrar al cliente en el momento de la venta — el
  comandero/cuenta llama `cobro.create` al cobrar. El panel-jefe NO inicia
  cobros para el cliente; es la cara de GESTIÓN del día.
- **El sistema** (health/metrics) informa, no decide.
- **El pago externo** (Llevadoo, link_pago/QR externos) — el jefe confirma el
  cobro, no gestiona el gateway.

### 5. PREGUNTAS_ABIERTAS — ¿Qué decisión es SUYA y está pendiente?

Ver [ABIERTO] en esquema.md — se nombran, no se cierran.
