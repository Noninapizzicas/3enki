---
name: vencimiento-pago
description: >-
  Skill FULL del módulo REFLEJO STATELESS `vencimiento-pago` de la vertical contabilidad
  (Enki). Calcula la FECHA DE VENCIMIENTO por factura desde la POLÍTICA DECLARADA:
  `fecha_vencimiento = fecha_factura + dias`. Alimenta E5 (prevision-caja) y K2 (motor-avisos).
  Determinista. No inventa la política: la toma del input, de la condición del tercero
  (`maestro-terceros.ficha.request`, best-effort) o del criterio observado. Escucha
  `contabilidad.asiento_asentado` y `contabilidad.criterio_fijado`. Honestidad (invariante 13):
  sin fecha de factura o sin política declarada, `fecha_vencimiento:null` y `abierto`. Sin store
  propio. La op `calcular` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites calcular el vencimiento de una factura desde días declarados o la
    condición del tercero (RPC vencimiento-pago.calcular.request).
  - Cuando depures por qué sale `fecha_vencimiento:null` (falta fecha de factura o faltan los
    días de la política) o de dónde salieron los días (`fuente_politica`).
  - Cuando quieras entender su contrato de eventos y su dependencia best-effort a maestro-terceros.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, vencimiento, facturas, tesoreria]
---

# vencimiento-pago — REFLEJO STATELESS de la fecha de vencimiento

## Qué hace el módulo

`vencimiento-pago` es un **REFLEJO STATELESS** (N6, hoja del plan) de la vertical
**contabilidad**, eje **entrada**. Calcula **la fecha de vencimiento de una factura**
desde la **política declarada**: `fecha_vencimiento = fecha_factura + dias`.

No inventa la política de cobro/pago. La resuelve así (en este orden):
1. **declarada** en el input (`dias`/`dias_pago`/`plazo`/`condicion`);
2. de la **condición del tercero** en `maestro-terceros` (RPC best-effort, por NIF);
3. del **criterio observado** por `contabilidad.criterio_fijado`.

Alimenta E5 (`prevision-caja`, por el vencimiento de los compromisos) y K2 (`motor-avisos`).

**Honestidad (invariante 13):**
- **Sin fecha de factura** → `fecha_vencimiento:null` y `abierto.fecha` (no se inventa).
- **Sin política declarada** → `fecha_vencimiento:null` y `abierto.politica` (no se inventan días).

**No persiste**: memoria acotada (`this._politicas` por proyecto y `this._facturas`, tope 1000).
La op `calcular` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `vencimiento-pago.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA): `{project_id, fecha_factura, dias?\|nif?, condicion?}` → `{project_id, fecha_factura, dias_politica, fecha_vencimiento}`. Delega en `_atender` → `_calcular`. Si `status ≠ 200` publica `.failed`. Responde por `vencimiento-pago.calcular.response`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (escritor-diario B2): el libro cambió → se observa el asiento (ventana, tope 1000) del que se puede deducir una factura con fecha y tercero. El reflejo no reescribe el libro. |
| `contabilidad.criterio_fijado` | `onCriterioFijado` | Fire-and-forget (cola-declaraciones-criterio): se fijó un criterio. Se observan los **días** de plazo (`dias_pago`/`dias`/`plazo`/`criterio.dias`/`politica.dias`) y la `condicion` en memoria. |

### Publishes

| Evento | Cuándo |
|---|---|
| `vencimiento-pago.calcular.response` | Respuesta RPC correlada de la op `calcular` (una sola cara: el bus). |
| `vencimiento-pago.calcular.failed` | Par de fallo determinista: falta `project_id` o entrada inválida → `{status, code, message}`. Cierra el círculo de `calcular.request`. |

> **NO publica un hecho de dominio**: es un reflejo de cálculo. No escribe estado.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** | `{project_id, fecha_factura\|fecha, factura?:{...}, dias?, dias_pago?, nif?, condicion?}` | `{project_id, tipo, fecha_factura, dias_politica, condicion, fuente_politica, fecha_vencimiento, determinista, formula, abierto}` o variante ABIERTO | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Fórmula determinista**: `fecha_vencimiento = fecha_factura + dias` (los días de la
   **política declarada**). Se suma en **UTC** (`_sumaDias` usa `Date.UTC`), sin depender del huso.
2. **Fecha normalizada**: `_fecha` acepta una fecha ISO y la valida con `/^\d{4}-\d{2}-\d{2}$/`
   (toma los primeros 10 caracteres). Cualquier otra → `null` → ABIERTO.
3. **Resolución de la política** (`_politicaDe`): input directo → RPC `maestro-terceros.ficha.request`
   por `nif` (timeout 800 ms; lee `ficha.condiciones.dias_pago|dias|plazo`) → criterio observado.
   `fuente_politica` ∈ `{'declarado','maestro-terceros','criterio_fijado'}`.
4. **Sin fecha de factura no hay vencimiento**: `200` con `fecha_vencimiento:null`,
   `senal_presente:false`, `abierto.fecha`.
5. **Sin días de política no hay vencimiento**: `200` con `fecha_vencimiento:null`,
   `senal_presente:false`, `abierto.politica`. Ni 0 ni un plazo por defecto.
6. **Condición opcional**: si la política no declara `condicion`, se anota en `abierto.condicion`
   (no se inventa).
7. **`_num` estricto**: `undefined/null/''` → `null`.

## Cómo se usa (RPC)

### Con días declarados

```json
{
  "project_id": "e57a318a-...",
  "fecha_factura": "2026-10-01",
  "dias": 30,
  "condicion": "30 dias fecha factura",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "vencimiento-pago",
  "fecha_factura": "2026-10-01",
  "dias_politica": 30,
  "condicion": "30 dias fecha factura",
  "fuente_politica": "declarado",
  "fecha_vencimiento": "2026-10-31",
  "determinista": true,
  "formula": "fecha_vencimiento = fecha_factura + dias de la politica DECLARADA",
  "abierto": { "condicion": null }
}
```

### Vía condición del tercero (NIF)

```json
{ "project_id": "e57a318a-...", "fecha_factura": "2026-10-01", "nif": "B12345678" }
```
→ pide `maestro-terceros.ficha.request`; si trae días → `fuente_politica:'maestro-terceros'`.
Si no los trae y no hay criterio observado → `fecha_vencimiento:null` + `abierto.politica`.

### Sin fecha de factura — ABIERTO

```json
{ "project_id": "e57a318a-...", "dias": 30 }
```
→ `fecha_vencimiento:null`, `abierto.fecha = "no llego la fecha de la factura: el vencimiento no se inventa"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `vencimiento-pago.calcular.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. Publica `vencimiento-pago.calcular.failed`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_calcular`. |
| (no es error) | 200 | Sin fecha de factura o sin días de política → ABIERTO (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.asiento_asentado` (B2), `contabilidad.criterio_fijado` (cola-declaraciones-criterio).
- **Llama por RPC (best-effort, 800 ms)**: `maestro-terceros.ficha.request`.
- **Alimenta**: `prevision-caja` (E5) y `motor-avisos` (K2). Le consume por RPC también
  `antiguedad-de-saldos` (N8) que pide `vencimiento-pago.calcular.request`.

## Verificación

1. Fichero: `modules/contabilidad-entrada/vencimiento-pago/`.
2. Eventos reales: subscribes `vencimiento-pago.calcular.request`, `contabilidad.asiento_asentado`,
   `contabilidad.criterio_fijado`; publishes `vencimiento-pago.calcular.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-entrada/vencimiento-pago/index.js
   # → vencimiento-pago.calcular.failed  → maestro-terceros.ficha.request
   ```
4. Test unitario (si existe): con días → fecha sumada en UTC; vía NIF → fuente maestro-terceros;
   sin fecha → ABIERTO; sin días → ABIERTO; sin `project_id` → 400 + failed.
