---
name: ajuste-inventario
description: >
  Skill FULL del módulo REFLEJO `ajuste-inventario` de la vertical contabilidad de Enki.
  LA REGULARIZACIÓN DE LA MERMA/ROTURA: deriva la DIFERENCIA entre el stock TEÓRICO y el REAL
  y la expresa VALORADA, con su asiento PROPUESTO y el aviso DECLARADO. Cálculo PURO y
  determinista; el valor unitario es parámetro declarable (o traído de valoracion-existencia
  H1 por evento). Sin teórico/real/valor unitario nada se estima → `[ABIERTO]`. Sin estado.
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos y
  sus reglas de negocio.
when-to-use: >
  - Cuando necesites el ajuste de inventario (merma/sobrante) de un producto (RPC
    ajuste-inventario.diferencia.request).
  - Cuando depures por qué la diferencia sale `null` (falta `teorico` o `real`), por qué el
    ajuste valorado queda `[ABIERTO]` (falta `valor_unitario`), o por qué falta `project_id`
    (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (determinista, asiento propuesto, aviso declarado no entregado, dato ausente =
    desconocido, no escribe).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo ajuste-inventario.
tags: [enki, modulo, reflejo, contabilidad, ajuste-inventario]
---

# ajuste-inventario — REFLEJO de la regularización de la merma

## Qué hace el módulo

`ajuste-inventario` es un **REFLEJO STATELESS** (H3, hoja del plan): **LA REGULARIZACIÓN DE LA
MERMA/ROTURA**. Deriva la **DIFERENCIA** entre el stock **TEÓRICO** y el stock **REAL** y la
expresa **VALORADA**, con su **ASIENTO PROPUESTO** y la marca de **AVISO**. Cálculo **PURO**,
**determinista**.

Atributos del diseño: `teorico:Cuantía` y `real:Cuantía`.

- **Ambas son CANTIDADES DECLARADAS** por el negocio (lo que el sistema cree que hay vs lo que
  el recuento encontró). El reflejo **NUNCA** estima una de las dos: si falta una, la diferencia
  queda `[ABIERTO]` — **jamás se asume `0`** (un teórico 0 inventado convertiría toda la merma
  en una compra fantasma).
- El **VALOR UNITARIO** del ajuste es **PARÁMETRO DECLARABLE**: entra declarado o lo trae la
  capa de valor de `valoracion-existencia` (H1) **POR EVENTO** (`valoracion-existencia.valorar.request`
  vía `_rpc`, best-effort). Sin él, la diferencia en **CANTIDAD** se declara igual pero el ajuste
  en **VALOR** queda `[ABIERTO]`.
- El **ASIENTO** y el **AVISO** son la **SALIDA** del cálculo, no su efecto: el reflejo
  **PROPONE** el asiento (cuenta + importe derivados) y **DECLARA** el aviso; **NO escribe**,
  **NO persiste**, **NO decide la contrapartida** (eso es de `escritor-diario` por EVENTO y la
  entrega del aviso es de otra capa).

Invariantes:

- **DETERMINISTA**: mismo teórico + mismo real → misma diferencia (una sola respuesta).
- **Dato ausente = desconocido**: falta teórico o real → `diferencia:null` y `abierto:true`.
  **Nada se estima**; ningún valor se rellena con `0`.
- **NO escribe, NO persiste, NO muta**: el stock es de `inventario`.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_diferencia`.
Cierra el círculo de error con `ajuste-inventario.diferencia.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `ajuste-inventario.diferencia.request` | `onDiferenciaRequest` | RPC reflejo (calculo puro, determinista): {project_id, producto_id?, teorico, real, valor_unitario?, motivo?/concepto?, metodo?} → {project_id, producto_id, teorico, real, diferencia, valor_unitario, fuente_valor, ajuste_valorado, asiento_propuesto, aviso, hay_desviacion, tipo, abierto, faltan, motivo}. El valor unitario es ParametroDeclarable (declarado o traido de valoracion-existencia H1 POR EVENTO). Falta teorico o real → diferencia:null y abierto:true; sin valor unitario → la cantidad se declara pero el ajuste valorado queda [ABIERTO] (nada se estima). El asiento propuesto se DERIVA con su signo (merma/sobrante) y su imputacion se delega a escritor-diario. Responde por ajuste-inventario.diferencia.response; project_id ausente → ajuste-inventario.diferencia.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `ajuste-inventario.diferencia.response` | Respuesta RPC correlada de ajuste-inventario.diferencia.request → {request_id, status:200, data:{diferencia, ajuste_valorado, asiento_propuesto, aviso, tipo, faltan, abierto}}. Emitida por el helper _atender. |
| `ajuste-inventario.diferencia.failed` | Par de fallo determinista (H3): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de ajuste-inventario.diferencia.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `ajuste-inventario.diferencia.failed` cierra el círculo de
> `ajuste-inventario.diferencia.request` cuando `_diferencia` devuelve status ≠ 200 (el único
> camino: `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onDiferenciaRequest` publica el par `failed`
> **solo si `res.status !== 200`**; el camino de éxito lo cierra `_atender` con
> `ajuste-inventario.diferencia.response`. Una diferencia `[ABIERTO]` (`diferencia:null` o
> `ajuste_valorado:null`) sigue siendo un `200`.

> Nota de sub-declaración (cruce con `index.js`): **no está en `module.json` pero sí lo emite
> `index.js` en `_valorUnitario`** la RPC saliente `valoracion-existencia.valorar.request`
> (`{project_id, producto_id, fecha, metodo}`, `timeout_ms:4000`) — es una **DEP por evento**,
> no un evento emitido.

> Nota: el módulo expone `toolDiferencia(params)` como **tool directa** — no es un evento del
> bus, no figura en `module.json`. Tampoco figuran `_valorUnitario` ni `_num` (utilidades
> internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **`producto_id`**: de `input.producto_id` (normalizado a string) o `null`. Etiqueta: no
   estima nada.
3. **Las dos CANTIDADES DECLARADAS**: `teorico` de `input.teorico` o `input.stock_teorico`;
   `real` de `input.real` o `input.stock_real`; normalizadas con `_num` (no finito → `null`).
4. **El VALOR UNITARIO se resuelve en `_valorUnitario`**, declarando `fuente_valor`:
   - `input.valor_unitario` o `input.coste_unitario` numérico → `fuente_valor:'declarado'`.
   - sin `producto_id` → `{valor_unitario:null, fuente_valor:null}`.
   - si no, RPC `valoracion-existencia.valorar.request` **por evento**; si vuelve `valor` y
     `cantidad > 0` → `valor_unitario = _round(valor / cantidad, 6)` y
     `fuente_valor:'valoracion-existencia'`; si no → `{null, null}`.
     **El unitario se DERIVA dividiendo** (no se estima: sin cantidad > 0 no hay unitario).
5. **`faltan` nombra las piezas ausentes**: `'teorico'` si `teorico === null`; `'real'` si
   `real === null`.
6. **La DIFERENCIA solo existe con las dos cantidades**: `diferencia = _round(real − teorico, 6)`
   si `faltan.length === 0`; si no → `diferencia:null`. **Sin una cantidad NO se asume `0`.**
7. **El AJUSTE VALORADO solo con la diferencia Y el valor unitario**:
   `ajuste_valorado = _round(diferencia × valor_unitario, 2)`. Si hay diferencia pero no valor
   unitario → `valor_abierto:true` (la cantidad se declara, el valor queda `[ABIERTO]`).
8. **El ASIENTO PROPUESTO se DERIVA** (`asiento_propuesto`) solo si `ajuste_valorado !== null`:
   `{concepto, producto_id, cantidad, valor_unitario, importe, signo, imputacion_delegada_a:'escritor-diario'}`.
   - `concepto` = `input.concepto || input.motivo || 'regularizacion de inventario'`.
   - El **SIGNO se DERIVA**: `>0` → `'sobrante'`; `<0` → `'merma'`; `0` → `'nulo'`.
   - El **corte (cuenta/contrapartida/periodo) NO vive aquí**: lo fija `escritor-diario`.
9. **`tipo`**: `null` si `diferencia === null`; si no, `'merma'` (`<0`), `'sobrante'` (`>0`) o
   `'sin_desviacion'` (`=0`).
10. **El AVISO se DECLARA (no se entrega)**: `aviso:'desviacion_inventario'` si la diferencia
    existe y **no es 0**; `null` en otro caso. `hay_desviacion` = `diferencia !== 0` (o `null`).
11. **`abierto`** = `faltan.length > 0 || valor_abierto`; **`faltan`** añade `'valor_unitario'`
    cuando `valor_abierto`; **`motivo`** nombra qué falta y, si solo falta el valor, declara que
    la diferencia se declara pero el ajuste valorado queda `[ABIERTO]`.
12. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
13. **HTTP exacto**: éxito `200` (con diferencia/ajuste o `[ABIERTO]`); `project_id` ausente →
    `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `ajuste-inventario.diferencia.response`; el error cierra con
`ajuste-inventario.diferencia.failed`.

### 1. `diferencia` — merma valorada (valor unitario declarado)

```json
{
  "project_id": "e57a318a-...",
  "producto_id": "PAN-01",
  "teorico": 100,
  "real": 94,
  "valor_unitario": 1.5,
  "concepto": "recuento mensual",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...", "producto_id": "PAN-01",
  "teorico": 100, "real": 94, "diferencia": -6,
  "valor_unitario": 1.5, "fuente_valor": "declarado", "ajuste_valorado": -9,
  "asiento_propuesto": { "concepto": "recuento mensual", "producto_id": "PAN-01", "cantidad": -6, "valor_unitario": 1.5, "importe": -9, "signo": "merma", "imputacion_delegada_a": "escritor-diario" },
  "aviso": "desviacion_inventario", "hay_desviacion": true, "tipo": "merma",
  "abierto": false, "faltan": [], "motivo": null
}
```

### 2. `diferencia` — el valor unitario se trae de H1 por evento

```json
{ "project_id": "e57a318a-...", "producto_id": "PAN-01", "teorico": 100, "real": 94 }
```

Con `valoracion-existencia` devolviendo `valor` y `cantidad` → `200` con
`fuente_valor:'valoracion-existencia'` y `valor_unitario = valor / cantidad`.
**El unitario se DERIVA; si no hay cantidad > 0, no se estima.**

### 3. `diferencia` — sobrante

Con `teorico:100`, `real:103`, `valor_unitario:2` → `diferencia:3`, `ajuste_valorado:6`,
`signo:'sobrante'`, `tipo:'sobrante'`, `aviso:'desviacion_inventario'`.

### 4. `diferencia` — falta el valor unitario → `[ABIERTO]` (solo en valor)

Sin `valor_unitario` y sin respuesta de H1 → `200` con `diferencia:-6`,
`ajuste_valorado:null`, `asiento_propuesto:null`, `abierto:true`,
`faltan:["valor_unitario"]` y `motivo` declarando que la diferencia se declara pero el ajuste
valorado queda `[ABIERTO]`. **Nunca se asume un coste.**

### 5. `diferencia` — falta una cantidad → `[ABIERTO]`

Sin `real` → `200` con `diferencia:null`, `tipo:null`, `faltan:["real"]`, `abierto:true`.
**Jamás se asume `0`** (un teórico 0 inventado convertiría la merma en compra fantasma).

### 6. Fallo — falta `project_id`

Respuesta `400` + `ajuste-inventario.diferencia.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/ajuste-inventario.test.js`. Cubre:

- `diferencia` con teórico/real/valor unitario declarados → `diferencia = real − teorico`,
  `ajuste_valorado`, `signo` y `tipo` derivados, `abierto:false`.
- El valor unitario traído de `valoracion-existencia` por evento → `fuente_valor:'valoracion-existencia'`
  (derivado `valor / cantidad`; sin cantidad > 0 no hay unitario).
- Falta `teorico` o `real` → `diferencia:null`, `faltan` los nombra (**nada se estima; nunca 0**).
- Diferencia sin valor unitario → `diferencia` declarada pero `ajuste_valorado:null`,
  `faltan:['valor_unitario']`, `abierto:true`.
- Sobrante (`real > teorico`) → `signo:'sobrante'`; sin desviación (`real === teorico`) →
  `tipo:'sin_desviacion'`, `aviso:null`.
- El asiento **se PROPONE** con `imputacion_delegada_a:'escritor-diario'` (**no se escribe**).
- `project_id` ausente → `400 INVALID_INPUT` + `.diferencia.failed`.
- **NO ESCRIBE**: ninguna llamada persiste ni muta (stateless).
- `toolDiferencia` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AjusteInventario extends ModuloHibridoReflejo`; `name = 'ajuste-inventario'`,
  `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/ajuste-inventario/`).
- `onDiferenciaRequest` usa `this._atender(e, 'diferencia', 'ajuste-inventario.diferencia.response',
  async (d) => {...})` con cierre de círculo (par `failed` si `status !== 200`).
- Proyección `_diferencia(input)` (**async**: puede pedir H1 por evento); helper
  `_valorUnitario`; `_num`. Tool `toolDiferencia`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- DEP: **pide** `valoracion-existencia.valorar.request` (H1) por EVENTO. Lo consume
  `escritor-diario` (por EVENTO, materializa el asiento propuesto) y la capa de avisos (entrega
  el aviso declarado).
- **PARÁMETRO COMO DATO**: teórico y real son **declarados** (lo que el sistema cree vs lo que
  el recuento encontró); el valor unitario es **declarable** o traído de H1. **Nada se estima**:
  sin una pieza → `[ABIERTO]`; el reflejo **propone** el asiento, no lo escribe.
