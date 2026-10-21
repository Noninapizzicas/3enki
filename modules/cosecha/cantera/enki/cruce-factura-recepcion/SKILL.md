---
name: cruce-factura-recepcion
description: >-
  Skill FULL del módulo REFLEJO STATELESS `cruce-factura-recepcion` de la vertical contabilidad
  (Enki). COTEJA las tres caras (pedido / recepción / factura) antes de asentar. Si cuadra y las
  caras están completas, SUBE el asiento a `escritor-diario` (B2); si NO cuadra, lo lleva a la
  cola de excepciones (A8.1) — no se asienta mal. Sin las tres caras no se inventa el cotejo.
  Escucha `contabilidad.hecho_recibido` (ventana acotada). Sin store propio. La op `cotejar` es
  PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites cotejar pedido/recepción/factura de un hecho
    (RPC cruce-factura-recepcion.cotejar.request).
  - Cuando depures por qué no se asienta (falta una cara → `verificable:false`), por qué fue a la
    cola (`cuadra:false`) o qué diferencias se detectaron (importes y cantidades).
  - Cuando quieras entender su contrato de eventos y su encadenado con B2 y A8.1.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, cotejo, facturas, excepciones]
---

# cruce-factura-recepcion — REFLEJO STATELESS que coteja pedido/recepción/factura

## Qué hace el módulo

`cruce-factura-recepcion` es un **REFLEJO STATELESS** (N5, hoja del plan) de la vertical
**contabilidad**, eje **entrada**. **Coteja las tres caras** de un hecho — **pedido**,
**recepción** y **factura** — antes de asentar:

- **cuadra y caras completas** → SUBE best-effort el asiento a `escritor-diario` (B2), que es
  quien asienta;
- **no cuadra** → se lleva a la **cola de excepciones** (`encolado-excepcion`, A8.1) — **no se
  asienta mal**;
- **falta una cara** → no verificable: **ni se asienta ni se encola** (no se adivina).

**Honestidad (invariante 13):** sin las tres caras → `cuadra:null`, `verificable:false`,
`abierto.caras`. El cotejo **no se inventa**.

**No persiste**: memoria acotada `this._hechos` (tope 1000) por `contabilidad.hecho_recibido`.
La op `cotejar` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `cruce-factura-recepcion.cotejar.request` | `onCotejarRequest` | RPC reflejo (PREGUNTA): `{project_id, hecho?, pedido?, recepcion?, factura?, asiento?}` → cotejo determinista. Delega en `_atender` → `_cotejar`. **Si `cuadra:true` y `caras_completas`** publica `escritor-diario.asentar.request`; **si `cuadra:false`** publica `encolado-excepcion.encolar.request`; si `status ≠ 200` publica `.failed`. Responde por `cruce-factura-recepcion.cotejar.response`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Fire-and-forget (puerto-evento-vertical A1): llegó un hecho → se observa en la ventana (tope 1000). |

### Publishes

| Evento | Cuándo |
|---|---|
| `cruce-factura-recepcion.cotejar.response` | Respuesta RPC correlada de la op `cotejar`. |
| `cruce-factura-recepcion.cotejar.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |
| `escritor-diario.asentar.request` | **Solo si cuadra y las caras están completas**: `{project_id, asiento, origen:'cruce-factura-recepcion', correlation_id}`. |
| `encolado-excepcion.encolar.request` | **Solo si NO cuadra** (`cuadra:false`): `{rol:'CRUCE_FACTURA_RECEPCION', clave, motivo:'pedido/recepcion/factura NO cotejan: no se asienta', origen, payload:{pendiente, diferencia}, correlation_id}`. |

> **NO publica un hecho de dominio** (`contabilidad.*`): es un cotejo. Sus salidas son la
> respuesta RPC, el asiento por EVENTO (B2) o la excepción por EVENTO (A8.1).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `cotejar` | **PREGUNTA** | `{project_id, hecho?:{…, pedido, recepcion, factura, asiento?, documento?, hecho_id?, clave?}, pedido?, recepcion?\|\|recepción?\|\|albaran?, factura?, clave?, asiento?}` | `{project_id, tipo, hecho_id, clave, importe_pedido, importe_recepcion, importe_factura, diferencia, pendiente, cuadra, verificable, caras_completas, diferencias, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Caras declarables**: se buscan claves alternativas — pedido (`pedido`/`orden`/`orden_compra`/
   `solicitado`), recepción (`recepcion`/`recepción`/`recibido`/`albaran`/`albarán`/`entrega`),
   factura (`factura`/`facturado`/`invoice`). Se buscan primero en `input`, luego en `hecho`.
2. **Sin las tres caras**: `faltan` lista las que faltan; `cuadra:null`, `verificable:false`,
   `caras_completas:false`, `abierto.caras`. **No se encola** (no es un descuadre, es un hueco).
3. **Importe de una cara** (`_importe`): `importe` → `total` → `importe_total` → `base`; `null` si no hay.
4. **Comprobación de importes**: `d_pr = pedido - recepcion`, `d_rf = recepcion - factura`; se listan
   en `diferencias` si `|d| > EPSILON` (`EPSILON = 0.005`). `cuadra = (diferencias.length === 0)`.
5. **Cotejo de cantidades** (dato declarable): si las tres caras traen cantidad (`cantidad`/`unidades`/
   `cantidad_total`), se compara `pedido` vs `recepción` y `recepción` vs `factura` (tolerancia
   `1e-9`); las diferencias se añaden a `diferencias`.
6. **`pendiente`**: `null` si cuadra; si no, `round(factura - recepcion, 2)`.
7. **`diferencia`** (global): `round(pedido - factura, 2)`.
8. **Acción por EVENTO**: cuadra y completa → asiento a B2; no cuadra → cola a A8.1; falta cara →
   nada (no se adivina).
9. **Determinista**: `formula: 'importe_pedido == importe_recepcion == importe_factura (tolerancia de centimos)'`.
10. **`_num` estricto**: `undefined/null/''` → `null`.

## Cómo se usa (RPC)

### Las tres caras cuadran

```json
{
  "project_id": "e57a318a-...",
  "hecho": {
    "hecho_id": "h-77",
    "pedido": { "importe": 1000 },
    "recepcion": { "importe": 1000 },
    "factura": { "importe": 1000 },
    "asiento": { "fecha": "2026-09-30", "lineas": [ … ] }
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "cruce-factura-recepcion",
  "hecho_id": "h-77",
  "importe_pedido": 1000,
  "importe_recepcion": 1000,
  "importe_factura": 1000,
  "diferencia": 0,
  "pendiente": null,
  "cuadra": true,
  "verificable": true,
  "caras_completas": true,
  "determinista": true,
  "formula": "importe_pedido == importe_recepcion == importe_factura (tolerancia de centimos)",
  "diferencias": null,
  "abierto": { "importes": null }
}
```
Publica `escritor-diario.asentar.request`.

### No cuadra — va a la cola

```json
{ "project_id": "e57a318a-...", "pedido": { "importe": 1000 }, "recepcion": { "importe": 950 }, "factura": { "importe": 1000 } }
```
→ `cuadra:false`, `diferencias:[{par:'pedido_vs_recepcion', diferencia:50}]`, `pendiente:50`.
Publica `encolado-excepcion.encolar.request` (no se asienta).

### Falta una cara — no verificable

```json
{ "project_id": "e57a318a-...", "pedido": { "importe": 1000 }, "factura": { "importe": 1000 } }
```
→ `cuadra:null`, `verificable:false`, `faltan:['recepcion']`,
`abierto.caras = "faltan caras declaradas (recepcion): el cotejo no es verificable (no se inventa)"`.
**No se asienta ni se encola.**

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_cotejar`. |
| (no es error) | 200 | Falta una cara → `verificable:false` (honesto); descuadre → `cuadra:false` (va a cola). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.hecho_recibido` (A1).
- **Sube a**: `escritor-diario.asentar.request` (B2) si cuadra; `encolado-excepcion.encolar.request`
  (A8.1) si no cuadra.

## Verificación

1. Fichero: `modules/contabilidad-entrada/cruce-factura-recepcion/`.
2. Eventos reales: subscribes `cruce-factura-recepcion.cotejar.request`, `contabilidad.hecho_recibido`;
   publishes `cruce-factura-recepcion.cotejar.response`, `.failed`, `escritor-diario.asentar.request`,
   `encolado-excepcion.encolar.request`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-entrada/cruce-factura-recepcion/index.js
   # → cruce-factura-recepcion.cotejar.failed / escritor-diario.asentar.request / encolado-excepcion.encolar.request
   ```
4. Test unitario (si existe): tres caras cuadran → asienta; descuadre → cola; falta cara → ni asienta
   ni encola; cantidades; sin `project_id` → 400 + failed.
