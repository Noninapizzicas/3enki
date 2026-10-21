---
name: cuadre-cobro-pago
description: >-
  Skill FULL del módulo REFLEJO STATELESS `cuadre-cobro-pago` de la vertical contabilidad (Enki).
  Cuadre bancario por CLAVE NATURAL COMPARTIDA (un movimiento = un cobro/pago). Sin las dos caras
  NO se afirma el cuadre. Si cuadra y hay asiento, SUBE best-effort a `escritor-diario` (B2); si NO
  cuadra, sube al juicio de `partida-no-identificada` (E7) — no se imputa a ojo. Escucha
  `contabilidad.asiento_asentado` (ventana acotada). Sin store propio. La op `cuadrar` es PREGUNTA
  → sin ui_handler.
when-to-use: >-
  - Cuando necesites cuadrar un movimiento bancario con su cobro/pago
    (RPC cuadre-cobro-pago.cuadrar.request).
  - Cuando depures por qué `cuadra:null` (falta una cara), por qué se subió al juicio (descuadre) o
    por qué no se subió el asiento.
  - Cuando quieras entender su contrato de eventos y su papel en el flujo económico.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, libro, cuadre, cobros, bancos]
---

# cuadre-cobro-pago — REFLEJO STATELESS del cuadre bancario

## Qué hace el módulo

`cuadre-cobro-pago` es un **REFLEJO STATELESS** (E3, hoja del plan) de la vertical **contabilidad**,
eje **libro**. Cuadra un **movimiento bancario** con su **cobro/pago** por **CLAVE NATURAL
COMPARTIDA** (`importe|fecha|referencia`): **un movimiento = un cobro/pago**.

Acciones según el resultado:
- **cuadra y hay asiento** → SUBE best-effort el asiento a `escritor-diario` (B2);
- **no cuadra** → SUBE al juicio de `partida-no-identificada` (E7) — **no se imputa a ojo**.

**Honestidad (invariante 13):** **sin las DOS caras** el cuadre **NO se afirma** (`cuadra:null`,
`abierto.caras`). Si cuadra pero no se declaró el asiento, se declara (`abierto.asiento`) — **no se
inventa el apunte**.

**No persiste** (STATELESS); observa asientos (tope 2000). La op `cuadrar` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `cuadre-cobro-pago.cuadrar.request` | `onCuadrarRequest` | RPC reflejo (PREGUNTA): `{project_id, movimiento?, cobro_pago?\|cobro?\|pago?, asiento?}` → `{cuadra, diferencia, abierto}`. Delega en `_atender` → `_cuadrar`. **Si `cuadra:true` y hay asiento** publica `escritor-diario.asentar.request`; **si `cuadra:false`** publica `partida-no-identificada.juzgar.request`; si `status ≠ 200` publica `.failed`. Responde por `cuadre-cobro-pago.cuadrar.response`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (escritor-diario B2): el libro cambió → se observa el asiento (tope 2000). |

### Publishes

| Evento | Cuándo |
|---|---|
| `cuadre-cobro-pago.cuadrar.response` | Respuesta RPC correlada de la op `cuadrar`. |
| `cuadre-cobro-pago.cuadrar.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |
| `escritor-diario.asentar.request` | **Solo si cuadra y hay asiento**: `{project_id, asiento, origen:'cuadre-cobro-pago'}`. |
| `partida-no-identificada.juzgar.request` | **Solo si NO cuadra**: `{project_id, movimiento, cobro_pago, motivo, origen:'cuadre-cobro-pago'}`. |

> **NO publica un hecho de dominio**: es un cuadre. Sus salidas externas son el asiento (B2) o el
> juicio (E7), por EVENTO.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `cuadrar` | **PREGUNTA** | `{project_id, movimiento?:{importe?\|cuota?, fecha?, referencia?\|ref?\|concepto?}, cobro_pago?\|cobro?\|pago?:{importe?\|total?, …}, asiento?}` | `{project_id, tipo, clave, clave_cobro_pago, movimiento, cobro_pago, importe_movimiento, importe_cobro_pago, diferencia, cuadra, asiento, motivo_descuadre, determinista, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Sin las dos caras no se afirma el cuadre**: falta movimiento y/o cobro/pago → `cuadra:null`,
   `abierto.caras` (declara cuál falta). **No se encola ni se asienta.**
2. **Clave natural** (`_clave`): `${round(importe,2)}|${fecha(10)}|${ref lower}` (misma canónica que
   `conciliacion-bancaria`). **No se adivina.**
3. **Cuadre**: `mismaClave` (las claves coinciden) **o** `|diferencia| <= 0.005`
   (`diferencia = importe_movimiento − importe_cobro_pago`).
4. **Acción por EVENTO**: cuadra y hay `asiento` objeto → B2; no cuadra → E7 (juicio).
5. **Sin asiento declarado al cuadrar**: `abierto.asiento` («lo propone quien lo tenga»); **no se
   inventa el apunte**.
6. **`motivo_descuadre`**: `null` si cuadra; si no, declara que las claves/importes no coinciden.
7. **`_num`** devuelve `0` si no es finito.
8. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Cuadrar con las dos caras y asiento

```json
{
  "project_id": "e57a318a-...",
  "movimiento": { "importe": -1000, "fecha": "2026-09-15", "referencia": "F-001" },
  "cobro_pago": { "importe": -1000, "fecha": "2026-09-15", "referencia": "F-001" },
  "asiento": { "fecha": "2026-09-15", "lineas": [ … ] },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "cuadre-cobro-pago",
  "clave": "-1000|2026-09-15|f-001",
  "clave_cobro_pago": "-1000|2026-09-15|f-001",
  "importe_movimiento": -1000,
  "importe_cobro_pago": -1000,
  "diferencia": 0,
  "cuadra": true,
  "asiento": { "fecha": "2026-09-15", "lineas": [ … ] },
  "motivo_descuadre": null,
  "determinista": true,
  "abierto": { "asiento": null }
}
```
Publica `escritor-diario.asentar.request`.

### Descuadre — va al juicio

```json
{ "project_id": "e57a318a-...", "movimiento": { "importe": -1000, "referencia": "F-001" }, "cobro_pago": { "importe": -950, "referencia": "F-001" } }
```
→ `diferencia:-50`, `cuadra:false`, `motivo_descuadre` presente.
Publica `partida-no-identificada.juzgar.request` (E7).

### Falta una cara — no se afirma

```json
{ "project_id": "e57a318a-...", "movimiento": { "importe": -1000 } }
```
→ `cuadra:null`, `abierto.caras = "falta el cobro/pago: el cuadre no se afirma"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `cuadre-cobro-pago.cuadrar.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_cuadrar`. |
| (no es error) | 200 | Falta una cara → `cuadra:null` (honesto); descuadre → `cuadra:false` (va al juicio). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.asiento_asentado` (B2).
- **Sube a**: `escritor-diario.asentar.request` (B2) si cuadra; `partida-no-identificada.juzgar.request`
  (E7) si no cuadra.

## Verificación

1. Fichero: `modules/contabilidad-libro/cuadre-cobro-pago/`.
2. Eventos reales: subscribes `cuadre-cobro-pago.cuadrar.request`, `contabilidad.asiento_asentado`;
   publishes `cuadre-cobro-pago.cuadrar.response`, `.failed`, `escritor-diario.asentar.request`,
   `partida-no-identificada.juzgar.request`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-libro/cuadre-cobro-pago/index.js
   # → cuadre-cobro-pago.cuadrar.failed / escritor-diario.asentar.request / partida-no-identificada.juzgar.request
   ```
4. Test unitario (si existe): cuadra → asienta (si hay asiento); descuadre → juicio; falta cara → `cuadra:null`;
   sin `project_id` → 400 + failed.
