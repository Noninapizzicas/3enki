# Pasada 3 — Disección: formas UI de cada hoja (cobros)

> Ronda de disección: cada hoja-jefe recibe su FORMA UI canónica (esquematizador-
> jefe). Toda hoja de declaración lleva su señal-refresh pareada. Suelo
> confirmado.

## Formas UI canónicas (mapeo de la disección)

| Hoja (órgano) | Forma canónica | RPC | Señal pareada |
|---|---|---|---|
| H1 cinta del día | `cinta-estado` | `cobro.list` por estado (proyección) | cobro.iniciado / cobro.procesado / cobro.reembolsado |
| H2 selector de cobro | `ref-select` | `cobro.list` (ref_label id, ref_value id) | — |
| H3 detalle del cobro | `cinta-estado`/informe | `cobro.get` | cobro.procesado / cobro.reembolsado |
| H4 confirmar cobro | `confirmador-nombrado` (transición de dinero) | `cobro.confirm` | cobro.procesado |
| H5 reembolsar cobro | `confirmador-nombrado` (destructiva, devuelve dinero) | `cobro.refund` | cobro.reembolsado |
| H6 métodos de pago | informe (chips) | `cobro.payment-methods` | — |
| H7 cajones | informe | `cobro.list-cajones` | — |

## Detalle de las hojas de declaración

### H4 — CONFIRMAR cobro (LA TRANSICIÓN)
- Forma: `confirmador-nombrado` — nombra cuenta (ref_display) + monto_total +
  método de pago. "confirma el cobro de X €".
- RPC: `cobro.confirm { id, referencia_pago? }` → pendiente/procesando →
  completado.
- Señal: `cobro.procesado` (re-lee la cinta). Si efectivo, además
  `periferico.abrir-cajon` (el cajón abre solo; la vista no lo gestiona).
- Guarda real: 409 CONFLICT_STATE si no está pendiente/procesando.

### H5 — REEMBOLSAR cobro (transición inversa)
- Forma: `confirmador-nombrado` — nombra cuenta + monto_total + motivo
  opcional. "reembolsa X €". Default recomendado: NO reembolsar.
- RPC: `cobro.refund { id, motivo? }` → completado → reembolsado.
- Señal: `cobro.reembolsado` (re-lee la cinta).
- Guarda real: 409 CONFLICT_STATE si no está completado.

### H1 — Cinta del día
- `cobro.list` por estado: pendiente (a confirmar), completado (confirmados),
  reembolsado (reembolsados). Cinta: "n cobros hoy · n confirmados ·
  n reembolsados".
- Señales: cobro.iniciado + cobro.procesado + cobro.reembolsado → debounce →
  re-list.

## Composición de la vista del jefe (3 capas)

```
1. SELECCIONAR  — ref-select de cobro (cobro.list) → la tarjeta ES el ref
2. INFORMARSE   — list/{estado} + get (detalle: cuenta, método, monto_total,
                  propina, cambio, referencia) · cinta-estado
3. DECLARAR     — confirm (pendiente → completado) · refund (completado →
                  reembolsado) — las ÚNICAS escrituras del jefe, vía custodio
```

## Cables hacia el blueprint (agente crear-blueprint-jefe)

- `ui.roles` = veredicto del árbitro (9 claves: 3 jefe, 6 neutro).
- `ui.flujo` jefe-PRIMERO: [jefe: create, confirm, refund] → [consulta: list,
  get, payment-methods, list-cajones, health, metrics]. SIN fase utilizacion
  (el POS cobra, pero el panel-jefe es la cara de gestión del día).
- NOTA de contrato de args (crítica para la UI): `confirm`/`refund` reciben
  **`id`** (NO cobro_id); `create` recibe **`cuenta_id`** + `monto` +
  `metodo_pago` (+ propina/monto_recibido/desglose/pedido_ids opcionales).
- ref de selects de cobro: `cobro.list` (ref_label id, ref_value id).
- señales de refresco del panel: cobro.iniciado + cobro.procesado +
  cobro.reembolsado.
- **project_id**: todo RPC lleva project_id inyectado (lección bug escandallo).
