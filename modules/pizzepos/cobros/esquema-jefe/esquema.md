# ESQUEMA — cara del JEFE del módulo `cobros` (el PAGO UNIVERSAL de Prisma)

> Árbol maestro consolidado (pasadas 1-3). Alimenta al agente de UI que escribe
> el panel. Ley de agnosticismo: cero tecnología de sistema ambiente. El análisis
> es de la CARA DEL JEFE — la utilización (el POS cobrando al cliente) quedó
> fuera, anotada.
>
> Fuente: `modules/pizzepos/cobros/index.js` (leído completo, 665 líneas) +
> `module.json` v3.0.0 (9 ui_handlers verificados) + `schemas/cobro.json`.

## 1. Quién es el jefe y qué decide

Dueño de la GESTIÓN del dinero del día: el cobro universal (7 métodos de pago:
efectivo, tarjeta, bizum, transferencia, mixto, link_pago, qr). El jefe NO cobra
al cliente (eso pasa en el POS, utilización) — GESTIONA los cobros del día:
verlos, confirmarlos, reembolsarlos. Decide:

- **D1 — CONFIRMAR el pago** (`cobro.confirm`): **LA TRANSICIÓN**. Lleva un
  cobro `pendiente`/`procesando` → `completado`. Emite `cobro.procesado`
  (el evento que cuentas escucha para marcar como cobrado) y, si es efectivo,
  abre el cajón (`periferico.abrir-cajon`, best-effort). Cierra la venta.
- **D2 — REEMBOLSAR** (`cobro.refund`): la transición INVERSA. Lleva un cobro
  `completado` → `reembolsado`. Emite `cobro.reembolsado`. Destructiva/gruesa:
  devuelve dinero al cliente.
- **D3 — INICIAR un cobro** (`cobro.create`): arranca el cobro sobre una cuenta
  con método de pago y monto. Idempotente por cuenta (rechaza si ya hay
  pendiente/procesando/completado). Emite `cobro.iniciado`.

El panel-jefe de cobros es una **ESTACIÓN DE TRANSICIONES del dinero del día**:
ver qué hay pendiente, confirmar lo cobrado, reembolsar lo que haya que
devolver.

Lo que NO decide:
- **el monto**: lo fija la cuenta/pedido; `confirm` solo recibe `id` (+
  `referencia_pago` opcional). El jefe no re-precía.
- **el gateway externo** (Llevadoo, link_pago/QR externos) — el jefe confirma
  el cobro, no gestiona el pago externo.
- **cobrar al cliente** (POS/comandero) — utilización, fuera del panel.

## 2. Invariantes (verificadas en código, restricciones honestas)

- INV1 — **el custodio del cobro es el MÓDULO cobros** (in-memory, Map cobros +
  refDisplayCache). El juez del ciclo de vida es el MÓDULO, no la UI: guardas
  reales — `confirm` rechaza si no está `pendiente`/`procesando` (409
  CONFLICT_STATE); `refund` exige `completado` (409); `create` rechaza cuentas
  `llevadoo_*` (400 INVALID_INPUT) y cobros duplicados (409 ALREADY_EXISTS).
- INV2 — **`caja.cerrada` / `dia.iniciado` limpian los cobros del día**
  (onCajaCerrada / onDiaIniciado → `cobros.clear()`). El histórico muere al
  cerrar caja.
- INV3 — **el cajón es best-effort**: `periferico.abrir-cajon` no falla el
  cobro si el cajón no abre.
- INV4 — **moneda EUROS** (no céntimos): `monto + propina = monto_total`;
  `cambio = monto_recibido - monto_total`; `toFixed(2)` en el desglose mixto.
- INV5 — **multi-tenant**: todo RPC lleva `project_id` (proyecto activo); las
  señales se filtran por proyecto — las de otro negocio no tocan la vista.

## 3. Señales pareadas (verificadas en index.js, hoja a hoja)

| Declaración | Señal de confirmación | Origen | Granularidad |
|---|---|---|---|
| `create` | `cobro.iniciado` {cobro_id, cuenta_id, monto, metodo_pago, propina, monto_total} | publishCobroIniciado (L493) | 1 evento |
| `confirm` | `cobro.procesado` {cobro_id, cuenta_id, ref_display, monto_total, metodo_pago, referencia_pago, completado_at} | publishCobroProcesado (L505) | 1 evento |
| `confirm` (efectivo) | `periferico.abrir-cajon` {destino, pin, project_id} | abrirCajonDinero (L537), best-effort | 1 evento |
| `refund` | `cobro.reembolsado` {cobro_id, cuenta_id, monto_reembolsado, motivo, reembolsado_at} | publishCobroReembolsado (L518) | 1 evento |
| `list/get/payment-methods/list-cajones/health/metrics` | — (lecturas) | — | — |

## 4. Composición de la vista del jefe (3 capas)

```
1. SELECCIONAR  — ref de cobros del día: cobro.list por estado (pendiente,
                  completado, reembolsado) · la cinta ES el selector natural
2. INFORMARSE   — list/{estado} (cobros por fase) + get (detalle en tarjeta:
                  cuenta, método, monto_total, propina, cambio, referencia) ·
                  cinta-estado "n cobros hoy · n confirmados · n reembolsados"
3. DECLARAR     — las ÚNICAS escrituras del jefe: TRANSICIONES nombradas según
                  el estado actual del cobro (confirm pendiente → completado;
                  refund completado → reembolsado), vía cobro.confirm/refund ·
                  la señal pareada re-lee, nunca recarga
```

Frecuencia → jerarquía: el gesto rey es CONFIRMAR el cobro pendiente (en vista,
1 toque). `refund` es gruesa y destructiva → `confirmador-nombrado`.

## 5. Formas UI asignadas (hoja a hoja)

| Hoja | Forma | RPC | Señal |
|---|---|---|---|
| H1 cinta del día | cinta-estado | (proyección de list) | cobro.iniciado / cobro.procesado / cobro.reembolsado |
| H2 selector de cobro | ref-select | `cobro.list` | — |
| H3 detalle del cobro | cinta-estado/informe | `cobro.get` | cobro.procesado / cobro.reembolsado |
| H4 confirmar cobro | confirmador-nombrado | `cobro.confirm` | cobro.procesado |
| H5 reembolsar cobro | confirmador-nombrado | `cobro.refund` | cobro.reembolsado |
| H6 métodos de pago | informe (chips) | `cobro.payment-methods` | — |
| H7 cajones | informe | `cobro.list-cajones` | — |

## 6. Huecos [ABIERTO] (decisiones del dueño — nombrados, no suplidos)

- [ABIERTO] **estado `procesando`**: el módulo lo acepta en `confirm` pero
  `create` solo genera `pendiente`. ¿Quién pone un cobro en `procesando`?
  (¿el gateway externo de link_pago/QR?) — decisión de dueño sobre el grafo.
- [ABIERTO] **histórico real**: los cobros viven solo hasta `caja.cerrada`/
  `dia.iniciado` (in-memory, restart_resilient:false). "n cobros hoy" muere al
  cerrar caja. Persistencia real (disco) es decisión de dueño.
- [ABIERTO] **`fallido`**: el estado existe en el schema pero ningún handler lo
  produce hoy. ¿Cuándo se marca un cobro fallido? — decisión de dueño.
- [ABIERTO] **reembolso parcial**: `refund` reembolsa el monto_total completo.
  Reembolso parcial (por método, por línea) es decisión de dueño.

## 7. Fuera del árbol del jefe

- **Cobrar al cliente** (POS/comandero/cuenta llama `cobro.create` al cobrar) —
  utilización, fuera del panel-jefe.
- **Gateway externo** (Llevadoo, link_pago/QR) — el jefe confirma el cobro, no
  gestiona el pago externo.
- **Cajón físico** — lo abre el módulo (best-effort) al confirmar efectivo; la
  vista no lo gestiona, solo lo informa (list-cajones).
