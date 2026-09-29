---
name: valoracion-existencia
description: >
  Skill FULL del módulo REFLEJO `valoracion-existencia` de la vertical contabilidad de Enki.
  LA CAPA DE VALOR sobre el inventario EXISTENTE: no lo duplica, solo le pone VALOR encima. El
  MÉTODO de valoración es PARÁMETRO DECLARABLE (nombre opaco; su `base` decide la mecánica de
  agregación) — PROHIBIDO cablearlo. Consume `inventario` por EVENTO (nunca por require) y nada
  se estima: sin stock, sin método o sin base → `valor:null` y `[ABIERTO]`. Sin estado. Úsala
  para operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites valorar las existencias de un producto con un método declarado (RPC
    valoracion-existencia.valorar.request).
  - Cuando depures por qué el valor sale `null` (falta `metodo`, `metodo.base` o `stock`:
    `faltan` los nombra), por qué `abierto:true`, o por qué falta `project_id`
    (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (determinista, ley como dato, método opaco, stock por evento, dato ausente =
    desconocido, no escribe).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo valoracion-existencia.
tags: [enki, modulo, reflejo, contabilidad, valoracion-existencia]
---

# valoracion-existencia — REFLEJO de la capa de valor sobre el inventario

## Qué hace el módulo

`valoracion-existencia` es un **REFLEJO STATELESS** (H1, hoja del plan): **LA CAPA DE VALOR
sobre el inventario EXISTENTE**. **NO lo duplica**: el stock sigue siendo del módulo REAL
`inventario` (REUTILIZADO, no construido aquí); esta pieza solo le pone **VALOR** encima.

Atributos del diseño: `stock:InventarioExistente` y `metodo:ParametroDeclarable`.

- **EL MÉTODO DE VALORACIÓN ES DECLARABLE — PROHIBIDO CABLEARLO.** El reflejo **NUNCA** decide
  que se valora «por FIFO» o «por precio medio»: eso es **dato del negocio** (o del JEFE vía
  `cola-declaraciones-criterio`). Lo único que el reflejo conoce es la **MECÁNICA GENÉRICA de
  agregación** que el propio método **DECLARA** en su campo `base`:
  - `'capas'` → suma de capas declaradas (`cantidad × coste_unitario` de cada capa).
  - `'unitario'` → suma de existencias declaradas (`cantidad × coste_unitario` de cada item).
  - `'agregado'` → suma de valores ya agregados declarados (`item.valor`).
- El **NOMBRE** del método viaja **OPACO**: se declara en la respuesta, **jamás** se compara
  contra un literal en el código. Una `base` **no reconocida o ausente** → `[ABIERTO]`: no se
  elige una por defecto.
- El **STOCK** se consume de `inventario` **POR EVENTO** (`inventario.stock.request` vía
  `_rpc`, best-effort) o llega **declarado** en la petición. **NUNCA** por `require` cruzado.

Invariantes:

- **DETERMINISTA**: mismo stock + mismo método declarado → mismo valor (una sola respuesta).
- **LEY COMO DATO**: cero constantes de método en el código; el método es entrada.
- **Dato ausente = desconocido**: sin stock, sin método o sin base declarada → `valor:null`,
  `abierto:true` y `faltan` con las piezas. **Nada se estima**; ningún valor se rellena con `0`.
- **NO escribe, NO persiste, NO muta**: el stock es de `inventario`.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_valorar`.
Cierra el círculo de error con `valoracion-existencia.valorar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `valoracion-existencia.valorar.request` | `onValorarRequest` | RPC reflejo (calculo puro, determinista): {project_id, producto_id?, fecha?, metodo?:{nombre, base}, capas?/existencias?/items?} → {project_id, producto_id, fecha, metodo, base, fuente_stock, cantidad, valor, desglose, stock_propiedad:'inventario', abierto, faltan, motivo}. El metodo es ParametroDeclarable y viaja opaco; su campo `base` ('capas'\|'unitario'\|'agregado') decide la mecanica de agregacion, y una base no reconocida no se sustituye por ninguna por defecto. El stock se declara en la peticion o se pide a `inventario` POR EVENTO (inventario.stock.request, best-effort). Sin stock, sin metodo o sin base → valor:null y abierto:true con las piezas que faltan (nada se estima). Responde por valoracion-existencia.valorar.response; project_id ausente → valoracion-existencia.valorar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `valoracion-existencia.valorar.response` | Respuesta RPC correlada de valoracion-existencia.valorar.request → {request_id, status:200, data:{metodo, base, cantidad, valor, desglose, fuente_stock, faltan, abierto}}. Emitida por el helper _atender. |
| `valoracion-existencia.valorar.failed` | Par de fallo determinista (H1): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de valoracion-existencia.valorar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `valoracion-existencia.valorar.failed` cierra el círculo de
> `valoracion-existencia.valorar.request` cuando `_valorar` devuelve status ≠ 200 (el único
> camino: `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onValorarRequest` publica el par `failed` **solo
> si `res.status !== 200`**; el camino de éxito lo cierra `_atender` con
> `valoracion-existencia.valorar.response`. Una valoración `[ABIERTO]` (`valor:null`) sigue
> siendo un `200`.

> Nota de sub-declaración (cruce con `index.js`): **no está en `module.json` pero sí lo emite
> `index.js` en `_stock`** la RPC saliente `inventario.stock.request`
> (`{project_id, project_slug, producto_id}`, `timeout_ms:4000`) — es una **DEP por evento**,
> no un evento emitido.

> Nota: el módulo expone `toolValorar(params)` como **tool directa** — no es un evento del bus,
> no figura en `module.json`. Tampoco figuran `_metodo`, `_stock`, `_agregar` ni `_num`
> (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **`producto_id`**: de `input.producto_id` o `input.item.producto_id` (normalizado a string)
   o `null`. **`fecha`**: string o `null`. Son etiquetas: no estiman nada.
3. **El MÉTODO se resuelve en `_metodo`** (ParametroDeclarable, opaco):
   - de `input.metodo` o `input.criterio.metodo`; ausente/vacío → `{metodo:null, base:null}`.
   - si llega string → `{nombre: <string>}`; si llega objeto → se copia **tal cual**.
   - **el nombre NO se interpreta**: viaja opaco hasta la respuesta.
4. **La `base` se lee del método declarado**: `String(metodo.base).toLowerCase()`; solo si
   pertenece a `BASES = ['capas','unitario','agregado']` se acepta; si no → `base:null`
   (**no se sustituye por ninguna por defecto**).
5. **El STOCK se resuelve en `_stock`**, declarando `fuente_stock`, en este orden:
   - declarado en la petición (`input.capas || input.existencias || input.items ||
     input.stock`): array → tal cual; objeto → `[objeto]`; `fuente_stock:'declarado'`.
   - sin stock declarado y sin `producto_id` → `{existencias:null, fuente_stock:null}`.
   - si no, RPC `inventario.stock.request` **por evento**; si llega `capas`/`existencias`/
     `items`/`stock` (array u objeto) → `fuente_stock:'inventario'`; si no →
     `{existencias:null, fuente_stock:null}`. **Sin stock NO se estima.**
6. **`faltan` nombra las piezas ausentes**: `'metodo'` si `metodo === null`; `'metodo.base'`
   si `base === null`; `'stock'` si `existencias === null`.
7. **La AGREGACIÓN es PURA** (`_agregar`) según la base declarada:
   - `'capas'`/`'unitario'`: por item, `cantidad` y `coste_unitario` (o `coste`); si falta
     alguno la pieza se **salta** (no se inventa su valor); `linea = cantidad × coste_unitario`;
     `cantidad` acumula.
   - `'agregado'`: `linea = item.valor`; `cantidad` acumula si viene.
   - devuelve `{total, cantidad, desglose}`, redondeado (valor 2, cantidad 6); `desglose` lleva
     `{producto_id, cantidad, valor}` por item.
   - **sin base reconocida no hay valor** (es `[ABIERTO]`).
8. **El VALOR solo existe con stock Y con base declarada**: `faltan.length === 0` → `valor`,
   `cantidad` y `desglose` derivados; si no → `valor:null`, `cantidad:null`, `desglose:null`.
9. **`stock_propiedad:'inventario'`** se declara siempre: la capa de valor **no posee** el stock.
10. **`abierto`** = `faltan.length > 0`; **`motivo`** = `'no se valora la existencia: falta
    <piezas> (nada se estima)'` cuando hay piezas ausentes, `null` si no.
11. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
12. **HTTP exacto**: éxito `200` (con valor o `[ABIERTO]`); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `valoracion-existencia.valorar.response`; el error cierra con
`valoracion-existencia.valorar.failed`.

### 1. `valorar` — stock declarado, método declarado opaco

```json
{
  "project_id": "e57a318a-...",
  "producto_id": "PAN-01",
  "fecha": "2026-09-30",
  "metodo": { "nombre": "FIFO", "base": "capas" },
  "capas": [ { "producto_id": "PAN-01", "cantidad": 40, "coste_unitario": 1.2 }, { "producto_id": "PAN-01", "cantidad": 10, "coste_unitario": 1.5 } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...", "producto_id": "PAN-01", "fecha": "2026-09-30",
  "metodo": { "nombre": "FIFO", "base": "capas" }, "base": "capas",
  "fuente_stock": "declarado", "cantidad": 50, "valor": 63,
  "desglose": [ { "producto_id": "PAN-01", "cantidad": 40, "valor": 48 }, { "producto_id": "PAN-01", "cantidad": 10, "valor": 15 } ],
  "stock_propiedad": "inventario", "abierto": false, "faltan": [], "motivo": null
}
```

### 2. `valorar` — el stock se pide a `inventario` por evento

```json
{ "project_id": "e57a318a-...", "producto_id": "PAN-01", "metodo": { "nombre": "precio medio", "base": "unitario" } }
```

Con `inventario` devolviendo sus existencias → `200` con `fuente_stock:'inventario'` y el valor
agregado. **El nombre del método viaja opaco**: se copia tal cual.

### 3. `valorar` — falta una pieza → `[ABIERTO]`

```json
{ "project_id": "e57a318a-...", "producto_id": "PAN-01", "capas": [ { "cantidad": 10, "coste_unitario": 1.5 } ] }
```

`200` con `valor:null`, `cantidad:null`, `faltan:["metodo","metodo.base"]`, `abierto:true` y
`motivo:'no se valora la existencia: falta metodo y metodo.base (nada se estima)'`.
**Nunca `valor:0`.**

### 4. `valorar` — base no reconocida → `[ABIERTO]` (no se elige por defecto)

Con `metodo:{nombre:"X", base:"lifo_raruno"}` → `base:null`, `faltan:["metodo.base"]`,
`abierto:true`. El reflejo **no sustituye** la base por ninguna conocida.

### 5. Fallo — falta `project_id`

Respuesta `400` + `valoracion-existencia.valorar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/valoracion-existencia.test.js`. Cubre:

- `valorar` con capas declaradas y `base:'capas'` → `valor` = suma de `cantidad × coste`, la
  `cantidad` acumulada y `desglose` por item.
- La base `'unitario'` (items declarados) y `'agregado'` (valores ya sumados) → cada mecánica
  produce su total **sin interpretar el nombre del método**.
- Stock pedido a `inventario` por evento → `fuente_stock:'inventario'`.
- Base no reconocida o ausente → `[ABIERTO]` con `faltan:['metodo.base']` (**nunca por defecto**).
- Sin stock → `[ABIERTO]` con `faltan:['stock']` (**nada se estima**; nunca `valor:0`).
- Una pieza incompleta (sin `cantidad` o sin `coste_unitario`) **se salta**, no se inventa.
- `stock_propiedad:'inventario'` siempre declarado.
- `project_id` ausente → `400 INVALID_INPUT` + `.valorar.failed`.
- **NO ESCRIBE**: ninguna llamada persiste ni muta (stateless).
- `toolValorar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ValoracionExistencia extends ModuloHibridoReflejo`; `name = 'valoracion-existencia'`,
  `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/valoracion-existencia/`).
- Constante `BASES = ['capas','unitario','agregado']` — son las **mecánicas de agregación** que
  un método declarado puede pedir en su campo `base`; **no son métodos de valoración**.
- `onValorarRequest` usa `this._atender(e, 'valorar', 'valoracion-existencia.valorar.response',
  async (d) => {...})` con cierre de círculo (par `failed` si `status !== 200`).
- Proyección `_valorar(input)` (**async**: puede pedir `inventario` por evento); helpers
  `_metodo`, `_stock`, `_agregar`, `_num`. Tool `toolValorar`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- DEP: **pide** `inventario.stock.request` por EVENTO. Lo consumen `ajuste-inventario` (H3) y
  `variacion-stock-valorada` (H4) vía `valoracion-existencia.valorar.request`.
- **PARÁMETRO COMO DATO**: el método es **declarable** y su nombre **opaco**; la única mecánica
  que el reflejo conoce es la `base` declarada. **Cero constantes de método**: sin stock, sin
  método o sin base → `valor:null` y `[ABIERTO]`; nada se estima.
