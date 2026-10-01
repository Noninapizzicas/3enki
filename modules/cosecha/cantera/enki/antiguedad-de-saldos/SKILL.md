---
name: antiguedad-de-saldos
description: >-
  Skill FULL del módulo REFLEJO STATELESS `antiguedad-de-saldos` de la vertical contabilidad
  (Enki). Clasifica el PENDIENTE por VENCIMIENTO en TRAMOS de antigüedad (por defecto 30/60/90,
  declarables). Las facturas salen del input o se piden best-effort a `vencimiento-pago` (N6).
  Determinista (UTC). Honestidad (invariante 13): sin facturas no se inventa (abierto); una
  factura sin vencimiento NO se mete en un tramo a ojo (se lista en `sin_vencimiento`). Si hay
  vencido, SUBE aviso a `motor-avisos.producir.request`. Sin store propio. La op `clasificar` es
  PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites repartir el pendiente por tramos de antigüedad/vencimiento
    (RPC antiguedad-de-saldos.clasificar.request).
  - Cuando depures por qué hay facturas en `sin_vencimiento`, por qué `clasificable:false`, o por
    qué se disparó un aviso de saldos vencidos.
  - Cuando quieras entender su contrato de eventos y su dependencia best-effort a vencimiento-pago (N6).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, antiguedad, vencimientos, avisos]
---

# antiguedad-de-saldos — REFLEJO STATELESS del pendiente por vencimiento

## Qué hace el módulo

`antiguedad-de-saldos` es un **REFLEJO STATELESS** (N8, hoja del plan) de la vertical
**contabilidad**, eje **entrada**. Clasifica el **pendiente por vencimiento** en **tramos de
antigüedad**: `corriente`, `1_30`, `31_60`, `61_90`, `mas_90` (por defecto; los tramos se pueden
**declarar** en el input). Es determinista (todo en UTC).

Las facturas salen del **input** o se piden best-effort a `vencimiento-pago` (N6) por RPC; si N6
no las devuelve, se usan las facturas **observadas** del libro.

**Honestidad (invariante 13):**
- **Sin facturas** → la antigüedad **no se inventa** (`abierto.facturas`).
- **Factura sin fecha de vencimiento** → **NO se mete en un tramo a ojo**; se lista en
  `sin_vencimiento` y se declara en `abierto.sin_vencimiento`.

Si el total **vencido > 0**, sube (best-effort) el aviso `motor-avisos.producir.request`.

**No persiste**: memoria acotada `this._facturas` (tope 1000). La op `clasificar` es **PREGUNTA** →
**sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `antiguedad-de-saldos.clasificar.request` | `onClasificarRequest` | RPC reflejo (PREGUNTA): `{project_id, facturas?\|saldos?, fecha_corte?, tramos?}` → `{tramos, tramos_con_saldo, pendiente_total, vencido_total, clasificable, sin_vencimiento, abierto}`. Delega en `_atender` → `_clasificar`. Si hay vencido > 0 sube el aviso; si `status ≠ 200` publica `.failed`. Responde por `antiguedad-de-saldos.clasificar.response`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (escritor-diario B2): el libro cambió → se observa el asiento/factura en la ventana (tope 1000). El reflejo no reescribe el libro. |

### Publishes

| Evento | Cuándo |
|---|---|
| `antiguedad-de-saldos.clasificar.response` | Respuesta RPC correlada de la op `clasificar`. |
| `antiguedad-de-saldos.clasificar.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |
| `vencimiento-pago.calcular.request` | Best-effort (por RPC declarada como publish de dominio): se pide a N6 las facturas/vencimientos. |
| `motor-avisos.producir.request` | **Solo si `vencido_total > 0`**: `{tipo:'plazo', titulo:'Saldos vencidos', detalle:'pendiente vencido: <total>', severidad:'aviso', origen:'antiguedad-de-saldos', ref:<fecha_corte>}`. |

> **NO publica un hecho de dominio** (`contabilidad.*`): es un reflejo que clasifica y avisa.
> La subida a motor-avisos solo ocurre con vencido real.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `clasificar` | **PREGUNTA** | `{project_id, facturas?\|saldos?:[{pendiente?\|importe?\|total?, fecha_vencimiento?\|vencimiento?, tercero?\|nif?}], fecha_corte?\|corte?\|fecha?, tramos?:[{nombre, desde, hasta}]}` | `{project_id, tipo, fuente, fecha_corte, convenio_vencimiento, tramos, tramos_con_saldo, pendiente_total, vencido_total, clasificable, total_facturas, abierto, sin_vencimiento}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Tramos declarables**: por defecto `TRAMOS_DEFECTO` (`corriente` ≤0, `1_30`, `31_60`, `61_90`,
   `mas_90` >90). Si el input trae `tramos`, se usan esos (`{nombre, desde, hasta}`).
2. **Convenio de vencimiento (UTC)**: `dias = fecha_corte - fecha_vencimiento`; `dias > 0` = **VENCIDO**.
   `fecha_corte` por defecto: hoy (`new Date().toISOString().slice(0,10)`).
3. **Pendiente de cada factura**: `pendiente` → `importe` → `total`; se ignoran `null` y `0`.
4. **Sin vencimiento → sin tramo**: la factura va a `sin_vencimiento` (con tercero y pendiente) y
   suma a `pendiente_total`; **no** se clasifica a ojo.
5. **Reparto**: cada factura cae en el tramo cuyo `[desde,hasta]` contiene sus días (si ninguno, el
   último tramo). Se acumula `pendiente`, `n` y la lista de `terceros`.
6. **Totales**: `pendiente_total` (todo) y `vencido_total` (solo `dias > 0`), redondeados a 2.
7. **`clasificable`**: `true` solo si no hay `sin_vencimiento` y hay facturas. Es lo único sobre lo
   que la suma se afirma.
8. **`fuente`**: `'declarado'` si llegan `facturas` en el input; si no, `'observado'`.
9. **Aviso condicional**: `motor-avisos.producir.request` solo con `vencido_total > 0`.
10. **`_num` estricto**: `undefined/null/''` → `null`.

## Cómo se usa (RPC)

### Clasificar con facturas declaradas

```json
{
  "project_id": "e57a318a-...",
  "fecha_corte": "2026-09-30",
  "facturas": [
    { "tercero": "Cliente A", "pendiente": 1000, "fecha_vencimiento": "2026-09-05" },
    { "tercero": "Cliente B", "pendiente": 500, "fecha_vencimiento": "2026-07-10" },
    { "tercero": "Cliente C", "pendiente": 250 }
  ],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "antiguedad-de-saldos",
  "fuente": "declarado",
  "fecha_corte": "2026-09-30",
  "convenio_vencimiento": "dias = fecha_corte - fecha_vencimiento; > 0 = VENCIDO",
  "tramos": [
    { "tramo": "corriente", "total": 0, "pendiente": 0, "n": 0, "terceros": [] },
    { "tramo": "1_30", "total": 1000, "pendiente": 1000, "n": 1, "terceros": ["Cliente A"] },
    { "tramo": "61_90", "total": 500, "pendiente": 500, "n": 1, "terceros": ["Cliente B"] },
    { "tramo": "mas_90", "total": 0, "pendiente": 0, "n": 0, "terceros": [] }
  ],
  "tramos_con_saldo": [ {…1_30…}, {…61_90…} ],
  "pendiente_total": 1750,
  "vencido_total": 1500,
  "clasificable": false,
  "total_facturas": 3,
  "abierto": { "facturas": null, "sin_vencimiento": "1 factura(s) sin fecha_vencimiento declarada: no se meten en un tramo a ojo" },
  "sin_vencimiento": [ { "tercero": "Cliente C", "pendiente": 250 } ]
}
```
Emite `motor-avisos.producir.request` (vencido 1500 > 0).

### Sin facturas — ABIERTO

```json
{ "project_id": "e57a318a-..." }
```
→ `abierto.facturas = "no se recibieron facturas (ni declaradas ni observadas): la antiguedad no se inventa"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `antiguedad-de-saldos.clasificar.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_clasificar`. |
| (no es error) | 200 | Sin facturas o con facturas sin vencimiento → ABIERTO (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.asiento_asentado` (B2).
- **Llama por RPC (best-effort, 800 ms)**: `vencimiento-pago.calcular.request` (N6).
- **Habla con**: `motor-avisos.producir.request` (K2) si hay vencido.

## Verificación

1. Fichero: `modules/contabilidad-entrada/antiguedad-de-saldos/`.
2. Eventos reales: subscribes `antiguedad-de-saldos.clasificar.request`, `contabilidad.asiento_asentado`;
   publishes `antiguedad-de-saldos.clasificar.response`, `.failed`, `vencimiento-pago.calcular.request`,
   `motor-avisos.producir.request`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-entrada/antiguedad-de-saldos/index.js
   # → antiguedad-de-saldos.clasificar.failed / motor-avisos.producir.request → vencimiento-pago.calcular.request
   ```
4. Test unitario (si existe): reparto por tramos correcto; sin vencimiento → `sin_vencimiento`;
   sin facturas → ABIERTO; vencido > 0 → aviso; sin `project_id` → 400 + failed.
