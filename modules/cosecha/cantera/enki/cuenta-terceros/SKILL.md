---
name: cuenta-terceros
description: >
  Skill FULL del módulo REFLEJO `cuenta-terceros` de la vertical contabilidad de Enki
  (N3+N4+N6+N8, hoja del plan). Mayor AUXILIAR del tercero DERIVADO del libro: facturas
  vivas (N3), saldo (N3), extracto CONFRONTABLE (N4), vencimientos desde la política
  DECLARADA (N6) y antigüedad de saldos por lado POR_COBRAR|POR_PAGAR con tramos
  0-30/31-60/61-90/90+ (N8). ES DE SOLO LECTURA: no muta nada, no tiene store y NUNCA
  es un almacén paralelo al libro (los saldos se DERIVAN, jamás se duplican). Contrato
  TOLERANTE: depende de mayor-balanza (aún no existe); si no está, 503 — NUNCA fabrica
  el dato. Sin estado. Úsala para operar, depurar o extender el reflejo.
when-to-use: >
  - Cuando necesites el saldo (RPC contabilidad.cuenta_terceros.saldo.request), el
    extracto (contabilidad.cuenta_terceros.extracto.request), el vencimiento
    (contabilidad.cuenta_terceros.vencimiento.request) o la antigüedad de saldos
    (contabilidad.cuenta_terceros.aging.request) de un tercero.
  - Cuando depures por qué no hay cifras (503 DEPENDENCIA_NO_DISPONIBLE si mayor-balanza
    no está viva, 422 CRITERIO_NO_DECLARADO si la política de vencimiento no se declaró,
    400 INVALID_INPUT si el payload es inválido).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué el
    saldo se DERIVA del libro y no se duplica, y la tolerancia con las dependencias.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo cuenta-terceros.
tags: [enki, modulo, reflejo, contabilidad, cuenta-terceros, auxiliar, aging]
---

# cuenta-terceros — REFLEJO del mayor auxiliar del tercero

## Qué hace el módulo

`cuenta-terceros` es un **REFLEJO STATELESS** (N3+N4+N6+N8, hoja del plan): el **mayor
AUXILIAR del tercero DERIVADO del libro**. Cubre cuatro vistas:

- **(N3)** facturas vivas + **saldo**.
- **(N4)** **extracto CONFRONTABLE** con el tercero (conciliación de saldos por
  derivación determinista).
- **(N6)** **vencimientos** desde la **política DECLARADA** (E6 en K9) + `esta_vencido`.
- **(N8)** **antigüedad de saldos** por lado — `POR_COBRAR` | `POR_PAGAR` — con tramos
  `0-30 / 31-60 / 61-90 / 90+`.

**ES DE SOLO LECTURA**: no muta nada, no tiene store y **NUNCA** es un **almacén paralelo
al libro** (invariante: **los saldos se DERIVAN, jamás se duplican**,
`almacen_paralelo:false`). El cálculo es **DETERMINISTA** (mismas entradas → mismo
extracto; un test lo afirma).

Es **stateless**: sin PosPersistencia ni `project.activated`. Las dependencias se leen
**por EVENTO**, nunca por `require` cruzado:

- **mayor-balanza (B3)** → `contabilidad.mayor.movimientos.request` (**AÚN NO EXISTE**).
- **maestro-terceros (N1)** → `contabilidad.tercero.ficha.request`.
- **cola-declaraciones-criterio (K9)** → `contabilidad.criterio.leer.request` (política
  N6/E6).

**CONTRATO TOLERANTE**: si mayor-balanza **no está viva** (o no responde) se publica
**`503 DEPENDENCIA_NO_DISPONIBLE`** y **NUNCA** se fabrican saldos, extractos ni
antigüedades — nada de basura por relleno. **Excepción**: si el payload trae su **propia
rebanada del libro** (`movimientos`/`asientos`) o la ficha del tercero (`tercero`), el
cálculo procede **sin tocar** la dependencia. Si la **política de vencimiento** no está
declarada (pieza `[ABIERTO]` E6/M4) se publica **`422 CRITERIO_NO_DECLARADO`**: *lo no
declarado NO se estima*.

> **NO REUTILIZA**: las vistas por rol del tercero (auxiliar, extracto, vencimientos)
> cuelgan del libro de ESTA vertical.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.cuenta_terceros.saldo.request` | `onSaldoRequest` | RPC reflejo (N3): {project_id, id_tercero\|tercero, movimientos?\|asientos?, desde?, hasta?} → {project_id, id_tercero, saldo, n_movimientos, n_facturas_vivas, facturas_vivas, fuente_libro:'PAYLOAD'\|'MAYOR_BALANZA', derivado_del_libro:true, almacen_paralelo:false, solo_lectura:true, no_muta:true}. El saldo se DERIVA del libro (nunca almacen paralelo). Si el payload no trae la rebanada se pide a mayor-balanza (B3) por EVENTO; si no responde → 503 DEPENDENCIA_NO_DISPONIBLE (TOLERANTE, no se fabrica). Exito publica contabilidad.cuenta_terceros_calculada y responde por contabilidad.cuenta_terceros.saldo.response; error → contabilidad.cuenta_terceros.saldo.failed. |
| `contabilidad.cuenta_terceros.extracto.request` | `onExtractoRequest` | RPC reflejo (N4): {project_id, id_tercero, desde?, hasta?, movimientos?} → {project_id, id_tercero, desde, hasta, lineas:[{fecha,documento,concepto,debe,haber,saldo,saldo_acumulado}], saldo_inicial, saldo_final, n_lineas, confrontable:true, quien_confirma:'DECLARABLE'}. Extracto confrontable con el tercero (conciliacion de saldos por derivacion determinista). Quien confirma el saldo es declarable, no lo decide el sistema. Si mayor-balanza (B3) no responde → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.cuenta_terceros_calculada; error → contabilidad.cuenta_terceros.extracto.failed. |
| `contabilidad.cuenta_terceros.vencimiento.request` | `onVencimientoRequest` | RPC reflejo (N6): {project_id, factura:{vencimiento?\|fecha, ...}, politica?\|condiciones?, criterio?, hoy?} → {project_id, factura, vencimiento, dias_plazo, politica_fuente, politica_estado, esta_vencido, hoy}. La fecha sale del vencimiento del hecho o de la POLITICA DECLARADA (E6 en K9, leida por EVENTO contabilidad.criterio.leer.request). Si la politica no esta declarada → 422 CRITERIO_NO_DECLARADO (lo no declarado NO se estima); si K9 no responde → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.cuenta_terceros_calculada; error → contabilidad.cuenta_terceros.vencimiento.failed. |
| `contabilidad.cuenta_terceros.aging.request` | `onAgingRequest` | RPC reflejo (N8): {project_id, lado:'POR_COBRAR'\|'POR_PAGAR', hoy?, movimientos?} → {project_id, lado, hoy, aging:{tramos:[{tramo:'0-30'\|'31-60'\|'61-90'\|'90+', n, importe}], sin_vencimiento, total_n, total_importe}, n_facturas, derivado_del_libro:true}. Antiguedad de saldos por lado, espejo de N6 del lado del cobro. La clasificacion es PURA y determinista; el dato del libro se lee por EVENTO. Si mayor-balanza no responde → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.cuenta_terceros_calculada; error → contabilidad.cuenta_terceros.aging.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.cuenta_terceros_calculada` | Fire-and-forget (N3/N4/N6/N8): una vista del auxiliar del tercero quedo CALCULADA → {op:'saldo'\|'extracto'\|'vencimiento'\|'aging', project_id, ...}. Es un CALCULO derivado del libro (cero almacen paralelo, solo lectura): lo consumen la cara del dueño, la reclamacion y la politica de cobro (E6). |
| `contabilidad.cuenta_terceros.saldo.failed` | Par de fallo determinista: saldo sin project_id/id_tercero (400) o mayor-balanza (B3) no disponible (503 DEPENDENCIA_NO_DISPONIBLE — contrato TOLERANTE: no se fabrica el saldo). Cierra el circulo de contabilidad.cuenta_terceros.saldo.request. |
| `contabilidad.cuenta_terceros.extracto.failed` | Par de fallo determinista: extracto con payload invalido o mayor-balanza (B3) no disponible (503). Cierra el circulo de contabilidad.cuenta_terceros.extracto.request. |
| `contabilidad.cuenta_terceros.vencimiento.failed` | Par de fallo determinista: vencimiento con factura invalida, politica no declarada (422 CRITERIO_NO_DECLARADO) o cola-declaraciones-criterio (K9) sin responder (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.cuenta_terceros.vencimiento.request. |
| `contabilidad.cuenta_terceros.aging.failed` | Par de fallo determinista: aging con lado invalido (400) o mayor-balanza (B3) no disponible (503). Cierra el circulo de contabilidad.cuenta_terceros.aging.request. |
| `contabilidad.cuenta_terceros_calculada.failed` | Par de fallo del evento de dominio contabilidad.cuenta_terceros_calculada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `...saldo.failed`, `...extracto.failed`, `...vencimiento.failed` y
> `...aging.failed` cierran, respectivamente, `saldo.request`, `extracto.request`,
> `vencimiento.request` y `aging.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.cuenta_terceros.saldo.response`,
> `contabilidad.cuenta_terceros.extracto.response`,
> `contabilidad.cuenta_terceros.vencimiento.response` y
> `contabilidad.cuenta_terceros.aging.response` (los pares response de los RPC); **NO
> están declaradas en `publishes`**.

> Nota: **`contabilidad.cuenta_terceros_calculada.failed` está declarada en `publishes`
> pero no se emite en `index.js`** — `_publicarO` publica el evento de dominio
> `contabilidad.cuenta_terceros_calculada` en éxito, o el par `<op>.failed` en fallo; el
> par del evento de dominio no se emite.

> Nota: no está en module.json pero sí lo emite index.js en `_rebanadaLibro` /
> `_fichaTercero` / `_politicaPago` — el módulo publica por `_rpc`
> `contabilidad.mayor.movimientos.request`, `contabilidad.tercero.ficha.request` y
> `contabilidad.criterio.leer.request` (dependencias por EVENTO, no declaradas como
> publishers).

## Reglas de negocio

1. **Solo lectura, saldos DERIVADOS (nunca almacén paralelo)**: todas las respuestas
   llevan `derivado_del_libro:true`, `almacen_paralelo:false`, `solo_lectura:true`,
   `no_muta:true`. El reflejo **no tiene store**.
2. **Contrato TOLERANTE con mayor-balanza (B3)**: `_rebanadaLibro` usa la rebanada del
   payload si viene (`input.movimientos` | `input.asientos` → `fuente:'PAYLOAD'`); si no,
   pide a B3 por EVENTO (`fuente:'MAYOR_BALANZA'`). Si B3 **no responde** →
   `_depNoDisponible('mayor-balanza', op, input)` → **`503 DEPENDENCIA_NO_DISPONIBLE`**
   con `{ dependencia, op, project_id, accion:'NO_FABRICAR_PUBLICAR_FALLO' }`. **Nada de
   basura por relleno.**
3. **Saldo derivado (N3)**: `_importe(m) = round(debe - haber, 2)`; el saldo es la suma
   de los movimientos del tercero. Los movimientos se filtran por `id_tercero`/`tercero`.
   Devuelve además `n_facturas_vivas` y `facturas_vivas` (N3, pendientes ≠ 0).
4. **Extracto confrontable (N4)**: líneas con `{fecha, documento, concepto, debe, haber,
   saldo, saldo_acumulado}`; `saldo_acumulado` acumula `debe - haber`. Devuelve
   `confrontable:true` y `quien_confirma:'DECLARABLE'` — **quien confirma el saldo es
   declarable, no lo decide el sistema**.
5. **Vencimiento desde la política DECLARADA (N6)**: `_calcularVencimiento` toma
   `factura.vencimiento` (→ `base:'HECHO'`); si no, la política declarada
   (`plazo_dias`/`dias`/`plazo` → `vencimiento = fecha + días`, `base:'POLITICA_DECLARADA'`).
   Sin política declarada (`estado === 'AUSENTE'` o sin política) → **`422
   CRITERIO_NO_DECLARADO`** con `{ criterio:'E6', pieza_abierta:true, op:'vencimiento' }`.
   Política sin plazo en días → también `422 CRITERIO_NO_DECLARADO`; factura sin fecha o
   fecha inválida → `422 PRECONDITION_FAILED`.
6. **La política se lee por EVENTO (K9)**: `_politicaPago` usa el payload
   (`politica`/`condiciones` → `fuente:'PAYLOAD'`) o pide `contabilidad.criterio.leer.request`
   con `criterio:'E6'`. Si K9 no responde → `503 DEPENDENCIA_NO_DISPONIBLE`; si
   `hallado !== true` → `estado:'AUSENTE'` (no se estima).
7. **`esta_vencido` determinista (N6)**: `_estaVencido` devuelve `venc < hoy`; sin fecha
   de vencimiento **no afirma nada** (`null`).
8. **Antigüedad por lado con tramos (N8)**: `_aging` exige `lado ∈ {POR_COBRAR, POR_PAGAR,
   DEBE, HABER}`; `DEBE`→`POR_COBRAR`, `HABER`→`POR_PAGAR`. Clasifica las facturas vivas
   del lado en tramos `TRAMOS = [0-30, 31-60, 61-90, 90+]` por días desde/hasta el
   vencimiento: los **no vencidos** (`dias < 0`) caen en `0-30`; las **sin vencimiento**
   van a `sin_vencimiento`. Devuelve por tramo `{tramo, desde, hasta, n, importe}` y
   `total_n`/`total_importe`.
9. **Facturas vivas (N3)**: `_facturasVivas` filtra movimientos con
   `es_factura:true`/`factura`/`tipo === 'FACTURA'`/`asiento`, mapea
   `{id_asiento, factura, fecha, importe, pendiente, vencimiento, lado}` (lado =
   `POR_COBRAR` si `importe >= 0`, si no `POR_PAGAR`) y se queda con los `pendiente`.
10. **Aging no disponible sin lado válido**: `lado` fuera del conjunto →
    `_invalid('lado')` → `400 INVALID_INPUT lado`.
11. **Validaciones deterministas**: en `saldo`/`extracto` falta `project_id` → `400
    INVALID_INPUT project_id`; sin `id_tercero` ni `tercero` → `400 INVALID_INPUT
    id_tercero`. En `vencimiento` falta `project_id` → `400 INVALID_INPUT project_id`;
    `factura` ausente/no objeto → `400 INVALID_INPUT factura`. En `aging` falta
    `project_id` → `400`; `lado` inválido → `400`. Shape: `{ status:400, error:{
    code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
12. **La ley entra como DATO**: plazos, tramos y política son datos declarados (K9/E6); el
    reflejo no cabla la política de cobro.
13. **HTTP exacto**: éxito `200`; payload inválido → `400`; política no declarada → `422`;
    factura sin fecha/ inválida → `422`; dependencia no viva → `503`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responden en `contabilidad.cuenta_terceros.<op>.response`. La `op` publicada es
`saldo`|`extracto`|`vencimiento`|`aging`.

### 1. `saldo` — saldo derivado (rebanada en el payload, sin tocar B3)

```json
{
  "project_id": "e57a318a-...",
  "id_tercero": "cli-1",
  "movimientos": [{ "tercero": "cli-1", "es_factura": true, "asiento": "A-1", "debe": 121, "haber": 0, "vencimiento": "2026-10-12" }],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "op": "saldo", "project_id": "e57a318a-...", "id_tercero": "cli-1", "saldo": 121, "n_movimientos": 1, "n_facturas_vivas": 1, "facturas_vivas": [{ "id_asiento": "A-1", "factura": null, "fecha": null, "importe": 121, "pendiente": true, "vencimiento": "2026-10-12", "lado": "POR_COBRAR" }], "fuente_libro": "PAYLOAD", "derivado_del_libro": true, "almacen_paralelo": false, "solo_lectura": true, "no_muta": true }
```
Emite `contabilidad.cuenta_terceros_calculada` (con `op` + res.data + `correlation_id`).

### 2. `saldo` — sin rebanada y B3 no viva → 503 (TOLERANTE, no se fabrica)

```json
{ "project_id": "e57a318a-...", "id_tercero": "cli-1" }
```
→ `503` + `contabilidad.cuenta_terceros.saldo.failed`:
```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "mayor-balanza no esta disponible: no se fabrican cifras", "details": { "dependencia": "mayor-balanza", "op": "saldo", "project_id": "e57a318a-...", "accion": "NO_FABRICAR_PUBLICAR_FALLO" } } }
```

### 3. `extracto` — documento confrontable (N4)

```json
{ "project_id": "e57a318a-...", "id_tercero": "cli-1", "movimientos": [{ "fecha": "2026-09-12", "factura": "F-1", "concepto": "Servicio", "debe": 121 }], "saldo_inicial": 0 }
```
Respuesta `200`:
```json
{ "op": "extracto", "project_id": "e57a318a-...", "id_tercero": "cli-1", "desde": null, "hasta": null, "lineas": [{ "fecha": "2026-09-12", "documento": "F-1", "concepto": "Servicio", "debe": 121, "haber": 0, "saldo": 121, "saldo_acumulado": 121 }], "saldo_inicial": 0, "saldo_final": 121, "n_lineas": 1, "confrontable": true, "quien_confirma": "DECLARABLE", "derivado_del_libro": true, "solo_lectura": true, "no_muta": true }
```

### 4. `vencimiento` — fecha desde la política declarada (N6)

```json
{ "project_id": "e57a318a-...", "factura": { "factura": "F-1", "fecha": "2026-09-12" }, "politica": { "plazo_dias": 30 }, "hoy": "2026-10-20" }
```
Respuesta `200`:
```json
{ "op": "vencimiento", "project_id": "e57a318a-...", "factura": "F-1", "vencimiento": "2026-10-12", "dias_plazo": 30, "politica_fuente": "PAYLOAD", "politica_estado": "DECLARADO", "esta_vencido": true, "hoy": "2026-10-20", "solo_lectura": true, "no_muta": true }
```

### 5. `vencimiento` — política no declarada → 422 CRITERIO_NO_DECLARADO

Sin política (y K9 con `hallado:false`) → `422` + `contabilidad.cuenta_terceros.vencimiento.failed`:
```json
{ "status": 422, "error": { "code": "CRITERIO_NO_DECLARADO", "message": "la politica de vencimiento (E6) no esta declarada: no se estima la fecha", "details": { "criterio": "E6", "pieza_abierta": true, "op": "vencimiento" } } }
```

### 6. `aging` — antigüedad por lado (N8)

```json
{ "project_id": "e57a318a-...", "lado": "POR_COBRAR", "hoy": "2026-10-20", "movimientos": [{ "tercero": "cli-1", "es_factura": true, "asiento": "A-1", "debe": 121, "vencimiento": "2026-10-12" }] }
```
Respuesta `200`:
```json
{ "op": "aging", "project_id": "e57a318a-...", "lado": "POR_COBRAR", "hoy": "2026-10-20", "aging": { "tramos": [{ "tramo": "0-30", "desde": 0, "hasta": 30, "n": 1, "importe": 121 }, { "tramo": "31-60", "desde": 31, "hasta": 60, "n": 0, "importe": 0 }, { "tramo": "61-90", "desde": 61, "hasta": 90, "n": 0, "importe": 0 }, { "tramo": "90+", "desde": 91, "hasta": null, "n": 0, "importe": 0 }], "sin_vencimiento": { "n": 0, "importe": 0 }, "total_n": 1, "total_importe": 121 }, "n_facturas": 1, "fuente_libro": "PAYLOAD", "derivado_del_libro": true, "solo_lectura": true, "no_muta": true }
```
`DEBE` → `POR_COBRAR`; `HABER` → `POR_PAGAR`.

### 7. Fallo — payload inválido

Sin `id_tercero` en `saldo` → `400 INVALID_INPUT` con `{ field:'id_tercero' }` +
`contabilidad.cuenta_terceros.saldo.failed`. `lado` inválido en `aging` → `400
INVALID_INPUT lado`.

### 8. Tools (sin RPC en module.json)

`toolSaldo`, `toolExtracto`, `toolVencimiento`, `toolAging` → sus proyecciones.

## Tests

El test vive en `tests/unit/cuenta-terceros.test.js`. Cubre:

- `saldo` con rebanada en el payload → `200` con `fuente_libro:'PAYLOAD'`,
  `almacen_paralelo:false`, `derivado_del_libro:true`, emite
  `contabilidad.cuenta_terceros_calculada`.
- **Contrato TOLERANTE**: sin rebanada y mayor-balanza no viva → `503
  DEPENDENCIA_NO_DISPONIBLE` + el par `<op>.failed` (no se fabrican cifras).
- `extracto` → líneas con `saldo_acumulado` correcto, `confrontable:true`,
  `quien_confirma:'DECLARABLE'`.
- `vencimiento` con `politica.plazo_dias` → fecha `fecha + días`, `base` del cálculo,
  `esta_vencido` correcto; con `factura.vencimiento` → `base:'HECHO'`.
- **Política no declarada** → `422 CRITERIO_NO_DECLARADO` (no se estima); K9 no responde
  → `503`.
- `aging` por lado → tramos correctos (`0-30`, `31-60`, `61-90`, `90+`), `sin_vencimiento`,
  `total_n`/`total_importe`; `DEBE`→`POR_COBRAR`, `HABER`→`POR_PAGAR`.
- **Determinismo**: mismas entradas → mismo extracto/aging.
- Payloads inválidos (sin `project_id`/`id_tercero`, `lado` inválido) → `400 INVALID_INPUT`.
- El reflejo es **stateless** y de **solo lectura** (`no_muta:true`): sin `project.activated`
  ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/cuenta-terceros
node --test tests/unit/cuenta-terceros.test.js
```

## Notas de implementación

- Clase `CuentaTerceros extends ModuloHibridoReflejo`; `name = 'cuenta-terceros'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless de solo lectura: nada que
  persistir).
- Constantes: `LADOS` (Set `POR_COBRAR`,`POR_PAGAR`,`DEBE`,`HABER`),
  `CRITERIO_POLITICA='E6'`, `TRAMOS` (array de 4 tramos con `desde`/`hasta`).
- `onSaldoRequest`/`onExtractoRequest`/`onVencimientoRequest`/`onAgingRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.cuenta_terceros.<op>.response', fn)` y llaman a
  `_publicarO(res, d, 'contabilidad.cuenta_terceros.<op>.failed')`, que publica
  `contabilidad.cuenta_terceros_calculada` en éxito o el par `<op>.failed` en fallo.
- Lecturas de dependencia por EVENTO (`_rpc`, `timeout_ms:4000`): `_rebanadaLibro`
  (`contabilidad.mayor.movimientos.request`, B3 — AÚN NO EXISTE), `_fichaTercero`
  (`contabilidad.tercero.ficha.request`, N1), `_politicaPago`
  (`contabilidad.criterio.leer.request`, K9/E6).
- Proyecciones puras: `_saldo`, `_extracto`, `_vencimiento`/`_calcularVencimiento`/
  `_estaVencido`, `_aging`/`_clasificarPorVencimiento`, `_facturasVivas`, `_importe` +
  helper `_depNoDisponible`. `_rpc`/`_invalid`/`_errorResponse`/`_round` vienen de la base.
- Tools: `toolSaldo`, `toolExtracto`, `toolVencimiento`, `toolAging`.
- DEP hacia delante: `contabilidad.cuenta_terceros_calculada` lo consumen la cara del
  dueño, la reclamación y la política de cobro (E6). DEP hacia atrás por evento: B3
  `mayor-balanza` (AÚN NO EXISTE, contrato tolerante), N1 `maestro-terceros`, K9
  `cola-declaraciones-criterio` (política de vencimiento).
