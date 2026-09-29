---
name: variacion-stock-valorada
description: >
  Skill FULL del módulo REFLEJO `variacion-stock-valorada` de la vertical contabilidad de Enki.
  LA VARIACIÓN DE EXISTENCIAS VALORADA de un periodo: entrada por compra y salida por consumo,
  ambas valoradas con la capa de valor (valoracion-existencia H1). Escucha los acontecimientos
  reales del inventario (`inventario.ajustado`, `inventario.reserva.creada`). Determinista; sin
  movimientos o sin valoración nada se estima → `[ABIERTO]`. Sin estado (buffer en memoria).
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites la variación de existencias valorada de un periodo (RPC
    variacion-stock-valorada.variacion.request).
  - Cuando depures por qué `variacion_cantidad` sale `null` (sin movimientos declarados ni
    recibidos por evento: un flujo vacío no es variación 0) o por qué el flujo valorado queda
    `[ABIERTO]` (falta valoración), o por qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (determinista, delta acumulado sin reinterpretar, valoración declarable, dato
    ausente = desconocido, no persiste).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo variacion-stock-valorada.
tags: [enki, modulo, reflejo, contabilidad, variacion-stock-valorada]
---

# variacion-stock-valorada — REFLEJO de la variación de existencias valorada

## Qué hace el módulo

`variacion-stock-valorada` es un **REFLEJO STATELESS** (H4, hoja del plan): **LA VARIACIÓN DE
EXISTENCIAS VALORADA** de un periodo — la **ENTRADA por compra** y la **SALIDA por consumo**,
ambas **VALORADAS** con la capa de valor (`valoracion-existencia` H1). **Determinista**.

Atributos del diseño: `entradas`, `salidas:Flujo<MovimientoStock>` y
`valoracion:ValoracionExistencia`.

- Los **MOVIMIENTOS** pueden llegar **DECLARADOS** (`entradas`/`salidas`/`movimientos` en la
  petición) o derivarse de los **ACONTECIMIENTOS REALES** del inventario que este módulo
  **ESCUCHA**:
  - `inventario.ajustado` (entrada de proveedor / merma / recuento — el **delta** que publica
    `inventario` **ES** el movimiento).
  - `inventario.reserva.creada` (salida comprometida, acumulada como movimiento negativo).
  - **El delta no se reinterpreta: solo se acumula.**
- La **VALORACIÓN** del movimiento es **PARÁMETRO DECLARABLE**: valor unitario declarado, por
  movimiento, o traído de H1 **POR EVENTO** (`valoracion-existencia.valorar.request` vía `_rpc`,
  best-effort, **solo cuando el flujo tiene un único producto** — con varios sería ambiguo y no
  se inventa). Sin valoración, la variación en **CANTIDAD** se declara igual pero el **FLUJO
  VALORADO** (entradas/salidas/variación en valor) queda `[ABIERTO]`.

Invariantes:

- **DETERMINISTA**: mismos movimientos + misma valoración → misma variación (una sola respuesta).
- **Dato ausente = desconocido**: sin movimientos declarados y sin nada recibido por evento →
  `variacion:null` y `abierto:true`. **Un flujo vacío NO se interpreta como variación 0.**
- **NO escribe, NO persiste**: los movimientos son de `inventario`; solo se acumulan en un
  buffer **en memoria** acotado a **5000** por proyecto.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_variacion`.
Cierra el círculo de error con `variacion-stock-valorada.variacion.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `variacion-stock-valorada.variacion.request` | `onVariacionRequest` | RPC reflejo (calculo puro, determinista): {project_id, periodo?, entradas?, salidas?, movimientos?, valor_unitario?, metodo?} → {project_id, periodo, fuente_movimientos, valor_unitario, fuente_valor, entradas_cantidad, salidas_cantidad, variacion_cantidad, entradas_valor, salidas_valor, variacion_valor, desglose, abierto, faltan, motivo}. Los movimientos llegan declarados o del buffer alimentado por los eventos de inventario; la valoracion es ParametroDeclarable (declarada, por movimiento, o traida de valoracion-existencia H1 POR EVENTO). Sin movimientos → variacion:null y abierto:true (un flujo vacio no es variacion 0); sin valoracion → cantidad declarada pero flujo valorado [ABIERTO]. Responde por variacion-stock-valorada.variacion.response; project_id ausente → variacion-stock-valorada.variacion.failed. |
| `inventario.ajustado` | `onInventarioAjustado` | Fire-and-forget: acumula el delta real publicado por `inventario` (entrada de proveedor, merma, recuento) como MovimientoStock del proyecto. El delta ES el movimiento (signo incluido): aqui no se reinterpreta. |
| `inventario.reserva.creada` | `onInventarioReservaCreada` | Fire-and-forget: acumula la reserva creada como SALIDA comprometida (movimiento negativo, −cantidad) del proyecto. Alimenta el flujo de salidas del periodo. |

### Publishes

| Evento | Descripción |
|---|---|
| `variacion-stock-valorada.variacion.response` | Respuesta RPC correlada de variacion-stock-valorada.variacion.request → {request_id, status:200, data:{variacion_cantidad, variacion_valor, faltan, abierto}}. Emitida por el helper _atender. |
| `variacion-stock-valorada.variacion.failed` | Par de fallo determinista (H4): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de variacion-stock-valorada.variacion.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `variacion-stock-valorada.variacion.failed` cierra el círculo de
> `variacion-stock-valorada.variacion.request` cuando `_variacion` devuelve status ≠ 200 (el
> único camino: `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onVariacionRequest` publica el par `failed` **solo
> si `res.status !== 200`**; el camino de éxito lo cierra `_atender` con
> `variacion-stock-valorada.variacion.response`. Una variación `[ABIERTO]` (`variacion_cantidad:null`
> o `variacion_valor:null`) sigue siendo un `200`.

> Nota de sub-declaración (cruce con `index.js`): **no está en `module.json` pero sí lo emite
> `index.js` en `_valoracion`** la RPC saliente `valoracion-existencia.valorar.request`
> (`{project_id, producto_id, fecha, metodo}`, `timeout_ms:4000`) — es una **DEP por evento**,
> no un evento emitido. Solo se pide cuando el flujo tiene **un único producto**.

> Nota: el módulo expone `toolVariacion(params)` como **tool directa** — no es un evento del bus,
> no figura en `module.json`. Tampoco figuran `_acumular`, `_unificarDeclarados`, `_delBuffer`,
> `_valoracion`, `_valorLado` ni `_num` (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **Los handlers fire-and-forget** (`onInventarioAjustado`, `onInventarioReservaCreada`)
   exigen `project_id` o `project_slug`; sin él **retornan sin acumular**.
   - `inventario.ajustado` acumula `{producto_id, delta:_num(d.delta), motivo:'ajuste',
     origen:'inventario.ajustado', en:d.timestamp}`. **El delta ES el movimiento (signo
     incluido)**.
   - `inventario.reserva.creada` acumula `{producto_id, delta:−cantidad, motivo:'reserva',
     origen:'inventario.reserva.creada', en:d.timestamp}`.
   - El buffer `_movimientos` (Map `project_id → [MovimientoStock]`) se **acota a 5000** por
     proyecto (`splice` de lo más viejo). **No es persistencia.**
3. **Los MOVIMIENTOS**: si `input.entradas`/`input.salidas`/`input.movimientos` es array →
   **declarados** (`_unificarDeclarados`); si no → del **buffer** (`_delBuffer`).
   `fuente_movimientos` = `'declarado'`, o `'inventario'` si el buffer tiene algo, o `null`.
4. **`_unificarDeclarados`**: `movimientos` (signo en `delta`), `entradas` (×`+1`, origen
   `'compra'`), `salidas` (×`−1`, origen `'consumo'`); `cantidad` = `m.cantidad ?? m.delta`
   (a valor absoluto); `valor_unitario` = `m.valor_unitario ?? m.coste_unitario`; `en` =
   `m.fecha ?? m.en`.
5. **Sin movimientos** → `200` con todo `null`, `desglose:[]`, `abierto:true`,
   `faltan:['movimientos']` y `motivo:'no hay movimientos declarados ni recibidos por evento: no
   se deriva variacion (un flujo vacio no es variacion 0)'`.
6. **La VALORACIÓN se resuelve en `_valoracion`**, declarando `fuente_valor`:
   - `input.valor_unitario` o `input.coste_unitario` numérico → `'declarado'`.
   - algún movimiento trae `valor_unitario` → `{valor_unitario:null, fuente_valor:'movimiento'}`
     (cada movimiento lleva el suyo).
   - si no, **solo si hay UN ÚNICO producto** en el flujo, RPC `valoracion-existencia.valorar.request`
     **por evento**; con `valor` y `cantidad > 0` → `valor_unitario = valor/cantidad`,
     `fuente_valor:'valoracion-existencia'`. **Con varios productos es ambiguo y no se estima.**
7. **Entradas y salidas**: `entradas` = movimientos con `delta > 0`; `salidas` = movimientos con
   `delta < 0`.
   - `entradas_cantidad` = Σ deltas de entrada (6 dec.); `salidas_cantidad` = Σ deltas de salida
     (que son negativos).
   - **`variacion_cantidad` = `entradas_cantidad + salidas_cantidad`** (entrada por compra −
     salida por consumo).
8. **El flujo VALORADO**: `valorado` = hay valor unitario global O algún movimiento lo trae.
   - `entradas_valor` / `salidas_valor` se calculan con `_valorLado` usando el unitario por
     movimiento o el global; **una línea sin valor se salta** (no se estima).
   - `variacion_valor = entradas_valor + salidas_valor` si ambos existen; si no → `null`.
9. **`abierto`** = `!valorado`; **`faltan:['valoracion']`** y **`motivo`** declara que la
   cantidad se declara pero el flujo valorado queda `[ABIERTO]` cuando no hay valoración.
10. **`desglose`**: un registro por movimiento `{producto_id, delta, origen, en}` — determinista.
11. **NO escribe, NO persiste**: stateless (buffer en memoria). Sin `PosPersistencia`, sin
    `onProjectActivated`.
12. **HTTP exacto**: éxito `200` (con variación o `[ABIERTO]`); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `variacion-stock-valorada.variacion.response`; el error cierra con
`variacion-stock-valorada.variacion.failed`.

### 1. `variacion` — movimientos declarados, valoración declarada

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "entradas": [ { "producto_id": "PAN-01", "cantidad": 200, "valor_unitario": 1.2 } ],
  "salidas": [ { "producto_id": "PAN-01", "cantidad": 180, "valor_unitario": 1.2 } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...", "periodo": "2026-09",
  "fuente_movimientos": "declarado", "valor_unitario": null, "fuente_valor": "movimiento",
  "entradas_cantidad": 200, "salidas_cantidad": -180, "variacion_cantidad": 20,
  "entradas_valor": 240, "salidas_valor": -216, "variacion_valor": 24,
  "desglose": [ { "producto_id": "PAN-01", "delta": 200, "origen": "compra", "en": null }, { "producto_id": "PAN-01", "delta": -180, "origen": "consumo", "en": null } ],
  "abierto": false, "faltan": [], "motivo": null
}
```

### 2. `variacion` — movimientos del buffer alimentado por eventos

Sin `entradas`/`salidas`/`movimientos`: se leen los acumulados por `inventario.ajustado` y
`inventario.reserva.creada` → `200` con `fuente_movimientos:'inventario'` (**el delta se acumula,
no se reinterpreta**).

### 3. `variacion` — flujo vacío → `[ABIERTO]`

Sin movimientos declarados ni recibidos → `200` con `variacion_cantidad:null`,
`abierto:true`, `faltan:["movimientos"]`. **Un flujo vacío no es variación 0.**

### 4. `variacion` — sin valoración → `[ABIERTO]` (solo en valor)

Con movimientos pero sin valor unitario (y flujo de varios productos, o H1 sin responder) →
`entradas_cantidad`/`salidas_cantidad`/`variacion_cantidad` declaradas, pero
`entradas_valor`/`salidas_valor`/`variacion_valor:null`, `abierto:true`,
`faltan:["valoracion"]`. **Nada se estima.**

### 5. Fallo — falta `project_id`

Respuesta `400` + `variacion-stock-valorada.variacion.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/variacion-stock-valorada.test.js`. Cubre:

- `variacion` con entradas/salidas declaradas y valor unitario global → `variacion_cantidad =
  entradas − |salidas|` y `variacion_valor` correspondiente.
- El valor unitario **por movimiento** → `fuente_valor:'movimiento'` (cada línea con el suyo).
- Movimientos recibidos por `inventario.ajustado` / `inventario.reserva.creada` → el buffer
  alimenta el flujo y `fuente_movimientos:'inventario'` (**el delta se acumula, no se
  reinterpreta**).
- Flujo vacío → `variacion:null`, `faltan:['movimientos']`, `abierto:true` (**no es variación 0**).
- Sin valoración (varios productos o H1 sin responder) → cantidad declarada pero flujo valorado
  `[ABIERTO]` con `faltan:['valoracion']`.
- La valoración de H1 se pide **solo con un único producto** (con varios es ambiguo: no se
  estima).
- El buffer se acota a 5000 (**no es persistencia**).
- `project_id` ausente → `400 INVALID_INPUT` + `.variacion.failed`.
- **NO PERSISTE**: ninguna llamada escribe en disco (stateless).
- `toolVariacion` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `VariacionStockValorada extends ModuloHibridoReflejo`; `name = 'variacion-stock-valorada'`,
  `version = 'reflejo-0.1.0'`. Buffer `this._movimientos = new Map()` (`project_id →
  [MovimientoStock]`), **en memoria, acotado a 5000**. Sin `PosPersistencia`, sin
  `onProjectActivated`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/variacion-stock-valorada/`).
- `onVariacionRequest` usa `this._atender(e, 'variacion', 'variacion-stock-valorada.variacion.response',
  async (d) => {...})` con cierre de círculo (par `failed` si `status !== 200`).
- Proyección `_variacion(input)` (**async**: puede pedir H1 por evento); helpers `_acumular`,
  `_unificarDeclarados`, `_delBuffer`, `_valoracion`, `_valorLado`, `_num`. Tool `toolVariacion`.
- Handlers fire-and-forget: `onInventarioAjustado` (`inventario.ajustado`) y
  `onInventarioReservaCreada` (`inventario.reserva.creada`).
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- DEP: **escucha** `inventario.ajustado` y `inventario.reserva.creada`; **pide**
  `valoracion-existencia.valorar.request` (H1) por EVENTO solo con un único producto. Lo consume
  el cierre del periodo (existencias valoradas).
- **PARÁMETRO COMO DATO**: la valoración es **declarable** (global o por movimiento) o traída de
  H1. **Nada se estima**: sin movimientos → `[ABIERTO]` (un flujo vacío no es 0); sin valoración
  → la cantidad se declara pero el valor queda `[ABIERTO]`.
