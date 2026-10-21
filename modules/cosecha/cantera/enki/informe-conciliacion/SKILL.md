---
name: informe-conciliacion
description: >-
  Skill FULL del módulo REFLEJO STATELESS `informe-conciliacion` de la vertical contabilidad (Enki).
  Es el INFORME de conciliación bancaria: la PRUEBA de que el saldo banco cuadra con el contable
  AJUSTADO por las partidas conciliatorias. Sin uno de los dos lados NO se afirma; se declara abierto.
  Los lados se declaran o se suben best-effort a `conciliacion-bancaria` (E1) y `partida-conciliatoria`
  (E9). Escucha `contabilidad.asiento_asentado`. Sin store propio. La op `componer` es PREGUNTA →
  sin ui_handler.
when-to-use: >-
  - Cuando necesites el informe de conciliación (saldo banco vs contable ajustado)
    (RPC informe-conciliacion.componer.request).
  - Cuando depures por qué `verificable:false` o `cuadra:null` (falta un lado → `abierto`).
  - Cuando quieras entender su contrato de eventos y su invariante de conciliación.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, libro, conciliacion, informe, prueba]
---

# informe-conciliacion — REFLEJO STATELESS del informe de conciliación

## Qué hace el módulo

`informe-conciliacion` es un **REFLEJO STATELESS** (E10, hoja del plan) de la vertical
**contabilidad**, eje **libro**. Compone el **informe de conciliación bancaria**: **la prueba** de
que el **saldo banco** cuadra con el **saldo contable ajustado** por las **partidas conciliatorias**.

Invariante que declara:

```
SALDO_BANCO = SALDO_CONTABLE + Σ partidas conciliatorias   (saldo contable ajustado)
```

Los **lados** se declaran o se piden best-effort: el banco a `conciliacion-bancaria.cruzar.request`
(E1) y el contable + partidas a `partida-conciliatoria.desfase.request` (E9).

**Honestidad (invariante 13):** **sin uno de los dos lados NO se afirma** el cuadre
(`verificable:false`, `cuadra:null`, `abierto.banco`/`abierto.contable`). **No hay prueba sin datos.**

**No persiste** (STATELESS); observa asientos (tope 1000). La op `componer` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `informe-conciliacion.componer.request` | `onComponerRequest` | RPC reflejo (PREGUNTA): `{project_id, saldo_banco?, saldo_contable?, partidas?, cuenta?, fecha?}` → `{saldo_banco, saldo_contable, partidas, ajuste, saldo_contable_ajustado, diferencia, cuadra, verificable, invariante, abierto}`. Delega en `_atender` → `_componer`. Si `status ≠ 200` publica `.failed`. Responde por `informe-conciliacion.componer.response`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (escritor-diario B2): el libro cambió → se observa el asiento (tope 1000). |

### Publishes

| Evento | Cuándo |
|---|---|
| `informe-conciliacion.componer.response` | Respuesta RPC correlada de la op `componer`. |
| `informe-conciliacion.componer.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |

> **NO publica un hecho de dominio**: reflejo de informe (compone la prueba). No escribe estado.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `componer` | **PREGUNTA** | `{project_id, saldo_banco?, saldo_contable?, partidas?:[{partida_id?, concepto?, importe?\|debe?\|haber?}], cuenta?, fecha?}` | `{project_id, tipo, cuenta, fecha, fuente:{banco,contable}, saldo_banco, saldo_contable, partidas, ajuste, saldo_contable_ajustado, diferencia, cuadra, verificable, invariante, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Lado BANCO** (`_ladoBanco`): declarado (`saldo_banco`) → o RPC `conciliacion-bancaria.cruzar.request`
   (E1, timeout 800 ms; lee `saldo_banco`). `fuente.banco` ∈ `{'declarado','conciliacion-bancaria',null}`.
2. **Lado CONTABLE** (`_ladoContable`): declarado (`saldo_contable`/`partidas`) → o RPC
   `partida-conciliatoria.desfase.request` (E9, timeout 800 ms; lee `saldo_contable` + `partidas`).
   `fuente.contable` ∈ `{'declarado','partida-conciliatoria',null}`.
3. **Ajuste** = suma de los importes de las partidas (`importe` o `debe − haber`), redondeado a 2.
4. **Saldo contable ajustado** = `saldo_contable + ajuste` (o `null` si falta el saldo contable).
5. **Verificable** = hay **ambos** saldos (banco y contable ajustado). Sin uno → `cuadra:null` y
   `abierto` lo declara.
6. **Diferencia** = `saldo_banco − saldo_contable_ajustado`; **cuadra** = `|diferencia| <= EPSILON`
   (`EPSILON = 0.005`).
7. **Invariante declarado**: `SALDO_BANCO = SALDO_CONTABLE + Σ partidas conciliatorias`.
8. **`_num`** devuelve `0` si no es finito.
9. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Componer el informe con ambos lados

```json
{
  "project_id": "e57a318a-...",
  "saldo_banco": 5000,
  "saldo_contable": 4800,
  "partidas": [ { "partida_id": "p1", "concepto": "cheque no cobrado", "importe": 200 } ],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "informe-conciliacion",
  "cuenta": null,
  "fecha": null,
  "fuente": { "banco": "declarado", "contable": "declarado" },
  "saldo_banco": 5000,
  "saldo_contable": 4800,
  "partidas": [ { "partida_id": "p1", "concepto": "cheque no cobrado", "importe": 200 } ],
  "ajuste": 200,
  "saldo_contable_ajustado": 5000,
  "diferencia": 0,
  "cuadra": true,
  "verificable": true,
  "invariante": "SALDO_BANCO = SALDO_CONTABLE + Σ partidas conciliatorias (saldo contable ajustado)",
  "abierto": { "banco": null, "contable": null }
}
```

### Falta el saldo del banco — no se afirma

```json
{ "project_id": "e57a318a-...", "saldo_contable": 4800 }
```
→ `verificable:false`, `cuadra:null`,
`abierto.banco = "falta el saldo del banco: el cuadre no se afirma"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `informe-conciliacion.componer.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_componer`. |
| (no es error) | 200 | Falta un lado → `verificable:false` + `abierto` (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.asiento_asentado` (B2).
- **Llama por RPC (best-effort, 800 ms)**: `conciliacion-bancaria.cruzar.request` (E1),
  `partida-conciliatoria.desfase.request` (E9).

## Verificación

1. Fichero: `modules/contabilidad-libro/informe-conciliacion/`.
2. Eventos reales: subscribes `informe-conciliacion.componer.request`, `contabilidad.asiento_asentado`;
   publishes `informe-conciliacion.componer.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-libro/informe-conciliacion/index.js
   # → informe-conciliacion.componer.failed → conciliacion-bancaria.cruzar.request / partida-conciliatoria.desfase.request
   ```
4. Test unitario (si existe): ambos lados → `cuadra`; ajuste por partidas; falta un lado → `verificable:false`;
   sin `project_id` → 400 + failed.
