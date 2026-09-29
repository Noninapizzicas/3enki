---
name: frontera-ficha-producto
description: >
  Skill FULL del módulo CONVERSOR `frontera-ficha-producto` de la vertical contabilidad de Enki.
  LA ÚNICA PUERTA ficha-de-producto → DATO CONTABLE: cruza el formato hacia la forma interna del
  coste según una `forma` declarable, sin decidir contenido ni valoración, y crea la frontera del
  negocio si falta. Sin estado. Úsala para operar, depurar o extender el conversor, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites dar entrada a una ficha de producto y obtener su coste con forma interna (RPC
    frontera-ficha-producto.entrar.request).
  - Cuando depures por qué falla con 400 INVALID_INPUT (ficha ausente o no objeto), por qué
    `puerto.creado:true` (el negocio no declaró puerto), por qué `forma_declarada:false` (regla
    identidad por nombre interno), o por qué un campo sale `null` y en `faltantes`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    conversor (cruza formato, no valora, no decide, forma declarable, dato ausente = desconocido).
  - Cuando vayas a escribir/ampliar el test unitario del conversor frontera-ficha-producto.
tags: [enki, modulo, conversor, contabilidad, frontera-ficha-producto]
---

# frontera-ficha-producto — CONVERSOR STATELESS de la frontera de ficha de producto

## Qué hace el módulo

`frontera-ficha-producto` es un **CONVERSOR STATELESS** (H2, hoja del plan): **LA ÚNICA PUERTA
ficha-de-producto → DATO CONTABLE**. El diseño lo dice literal: `entrar(ficha):CosteInterno`, con
`forma:ParametroDeclarable`.

**CRUZA EL FORMATO, NO DECIDE EL CONTENIDO NI LA VALORACIÓN**: por aquí entra la ficha de producto
del negocio (la de su vertical/proveedor) y sale con la **FORMA INTERNA** del coste contable. El
módulo **NO valora** el producto, **NO calcula márgenes**, **NO decide** el coste — **TRANSPORTA** lo
que la ficha declara con la forma que el negocio **DECLARA** (`forma`: por campo interno, su ruta en
la ficha + requeridos + `clave_natural`). Sin `forma` declarada, la regla es **identidad por nombre
interno** y se declara así (`forma_declarada:false`) — **jamás se cablea una forma de ficha**.

**LA FRONTERA ES DECLARABLE**: si el negocio no tiene puerto, **se CREA** para él (`puerto.frontera`,
`creado:true`) y el mismo módulo sirve a todos los negocios **sin conocer ninguno de memoria**.

Invariante: **dato ausente = desconocido**. El campo que no llega ni se declara queda `null` y se
lista en `faltantes` (**`[ABIERTO]`, nada se estima**). Los importes se **COPIAN** si vienen y **no se
derivan** del precio ni de ningún margen.

Campos de la forma interna: `clave_natural`, `producto`, `referencia`, `unidad`, `coste_unitario`,
`cantidad`, `coste_total`, `moneda`, `proveedor`, `fecha`, `vertical` y `atributos` (los campos
extra de la ficha se **conservan** en `atributos`).

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_entrar`. En
éxito publica `contabilidad.coste_interno`; en error, su par `frontera-ficha-producto.entrar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `frontera-ficha-producto.entrar.request` | `onEntrarRequest` | RPC conversor (determinista): {project_id, ficha\|producto\|crudo (la ficha de producto de la vertical; puede venir envuelta {vertical, payload} o plana), forma? (DECLARABLE: {campos:{campo_interno: ruta_en_la_ficha}, requeridos:[...], clave_natural: ruta}), clave_natural?, puerto? (nombre declarado de la frontera; si falta, se CREA la del negocio), vertical?} → {project_id, vertical, origen_ficha, puerto:{frontera, creado, declarable}, coste:{clave_natural, producto, referencia, unidad, coste_unitario, cantidad, coste_total, moneda, proveedor, fecha, vertical, atributos, forma_interna:true, valorado_aqui:false, calculado_aqui:false, faltantes}, forma_declarada, requeridos_faltantes, decide:false, valora:false, cruza_formato:true, faltantes, abierto}. Cruza el formato y COPIA los importes; no valora, no decide y lo ausente queda null y se declara en `faltantes`. Exito → publica contabilidad.coste_interno (lo LEE valoracion-existencia H1) y responde por frontera-ficha-producto.entrar.response; ficha ausente → frontera-ficha-producto.entrar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `frontera-ficha-producto.entrar.response` | Respuesta RPC correlada de frontera-ficha-producto.entrar.request → {request_id, status:200, data:{coste:{clave_natural, coste_unitario, coste_total, moneda, faltantes}, puerto, faltantes, abierto}}. Emitida por el helper _atender. |
| `frontera-ficha-producto.entrar.failed` | Par de fallo determinista (H2): ficha ausente o invalida (400) → {status, error:{code, message, details?}}. Cierra el circulo de frontera-ficha-producto.entrar.request. |
| `contabilidad.coste_interno` | Fire-and-forget (H2): la ficha cruzo la frontera y su coste quedo con la forma interna contable → {project_id, clave_natural, producto, coste_unitario, coste_total, moneda, origen_ficha, faltantes, correlation_id}. Lo LEE valoracion-existencia (H1), que pone la capa de valor sobre el inventario existente. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `frontera-ficha-producto.entrar.failed` cierra el círculo de
> `frontera-ficha-producto.entrar.request` cuando `_entrar` devuelve status ≠ 200 (`400`).

> Nota de honestidad (cruce con `index.js`): `onEntrarRequest` publica `contabilidad.coste_interno`
> **solo si `_entrar` devuelve `200`**; la rama `else` publica
> `frontera-ficha-producto.entrar.failed`. El payload del evento de dominio lleva
> `{project_id, clave_natural, producto, coste_unitario, coste_total, moneda, origen_ficha,
> faltantes, correlation_id}` (tomados de `coste.*` y de `input.correlation_id`).

> Nota: **no hay** llamadas salientes `_rpc` en este módulo. No figuran `_esImporte`, `_leerRuta`,
> `_clave`, `_num`, la constante `CAMPOS_COSTE` ni `toolEntrar` en `module.json` (utilidades internas
> / tool directa).

## Reglas de negocio

1. **`project_id` SIN fallback obligatorio**: `input.project_id || this.project_id || null` — este
   conversor **no** devuelve `400` por `project_id` ausente; **el error del módulo es la ficha**.
2. **La FICHA** (`ficha`, `producto` objeto o `crudo`): ausente o no objeto → `400 INVALID_INPUT`
   (`field:'ficha'`) y par `failed`.
3. **Ficha envuelta o plana**: si trae `payload` objeto (sobre de la vertical) se usa
   `ficha.payload`; si no, la ficha entera. La `vertical` sale del sobre o de `input.vertical`; el
   `origen_ficha` es `'ficha'` si hay vertical, si no `'plana'`.
4. **LA FORMA ES DECLARABLE**: `input.forma || ficha.forma`. `forma_declarada:true` si es objeto.
   `forma.campos` = mapa `{campo_interno: ruta_en_la_ficha}`; `forma.requeridos` = lista de campos
   internos. **Sin forma, la ruta de cada campo es su propio nombre interno** (identidad) y se
   declara `forma_declarada:false`. **Jamás se cablea una forma de ficha.**
5. **Rutas con punto** (`_leerRuta`): `'a.b'` navega rutas anidadas; un tramo `null`/`undefined` da
   `undefined`.
6. **Los CAMPOS DE LA FORMA INTERNA** (`CAMPOS_COSTE`): `['clave_natural','producto','referencia',
   'unidad','coste_unitario','cantidad','coste_total','moneda','proveedor','fecha','vertical',
   'atributos']` — **solo nombres**, ningún valor.
7. **LOS IMPORTES SE COPIAN** (`_esImporte`: `coste_unitario`, `coste_total`, `cantidad`): se
   normalizan con `_num`; **no se derivan del precio ni de ningún margen**.
8. **Dato ausente = desconocido**: valor `undefined`/`null`/`''` → `coste[campo] = null` y el nombre
   del campo va a `faltantes` (**`[ABIERTO]`**). Un importe no numérico → `null` y también a
   `faltantes`. **Nada se estima.**
9. **La vertical se resuelve**: `coste.vertical = vertical || coste.vertical`; si queda resuelta sale
   de `faltantes`; si no, entra.
10. **La CLAVE NATURAL no se inventa**: precedencia `input.clave_natural` → la de la ficha → la ruta
    declarada en `forma.clave_natural` → **derivada del molde** `_clave` (`referencia|producto|
    vertical`, con las partes disponibles). Resuelta sale de `faltantes`; si no se pudo, entra.
11. **Los campos extra se CONSERVAN**: los del sobre que no están en `CAMPOS_COSTE` se agrupan en
    `coste.atributos` (**no se pierde nada**). Si la ficha ya traía `atributos` objeto, se respeta.
12. **`requeridos_faltantes`**: los campos de `forma.requeridos` que queden `null`/`''`/`undefined` —
    señal de que la conversión **no es utilizable**, pero **no aborta** (status `200`).
13. **LA FRONTERA ES DECLARABLE**: `puerto.frontera` = `input.puerto` o `frontera:<vertical>` o
    `'frontera:ficha-producto'`; `puerto.creado = (input.puerto == null)` (**si el negocio no lo
    declara, se CREA para él**); `puerto.declarable:true`.
14. **El coste queda con forma interna** (`forma_interna:true`) y **declara lo que NO hace**:
    `valorado_aqui:false`, `calculado_aqui:false`, `decide:false`, `valora:false`,
    `cruza_formato:true`.
15. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
16. **HTTP exacto**: éxito `200`; ficha ausente/inválida → `400 INVALID_INPUT`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `frontera-ficha-producto.entrar.response` y emite `contabilidad.coste_interno`.

### 1. `entrar` — ficha envuelta con forma declarada

```json
{
  "project_id": "e57a318a-...",
  "ficha": { "vertical": "3d", "payload": { "sku": "PLA-NEG-1", "nombre": "Filamento PLA negro 1kg", "precio_compra": 18.5, "uds": 1, "moneda": "EUR" } },
  "forma": { "campos": { "referencia": "sku", "producto": "nombre", "coste_unitario": "precio_compra", "cantidad": "uds" }, "requeridos": ["referencia", "coste_unitario"] },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (extracto):

```json
{
  "project_id": "e57a318a-...",
  "vertical": "3d",
  "origen_ficha": "ficha",
  "puerto": { "frontera": "frontera:3d", "creado": true, "declarable": true },
  "coste": {
    "clave_natural": "PLA-NEG-1|Filamento PLA negro 1kg|3d",
    "producto": "Filamento PLA negro 1kg",
    "referencia": "PLA-NEG-1",
    "unidad": null,
    "coste_unitario": 18.5,
    "cantidad": 1,
    "coste_total": null,
    "moneda": "EUR",
    "proveedor": null,
    "fecha": null,
    "vertical": "3d",
    "atributos": null,
    "forma_interna": true,
    "valorado_aqui": false,
    "calculado_aqui": false,
    "faltantes": ["unidad", "coste_total", "proveedor", "fecha"]
  },
  "forma_declarada": true,
  "requeridos_faltantes": [],
  "decide": false,
  "valora": false,
  "cruza_formato": true,
  "faltantes": ["unidad", "coste_total", "proveedor", "fecha"],
  "abierto": true
}
```

Emite `contabilidad.coste_interno` (lo LEE `valoracion-existencia` H1):

```json
{ "project_id": "e57a318a-...", "clave_natural": "PLA-NEG-1|Filamento PLA negro 1kg|3d", "producto": "Filamento PLA negro 1kg", "coste_unitario": 18.5, "coste_total": null, "moneda": "EUR", "origen_ficha": "ficha", "faltantes": ["unidad","coste_total","proveedor","fecha"], "correlation_id": "abc-123" }
```

### 2. `entrar` — sin `forma` declarada (identidad por nombre interno)

Sin `forma` → `forma_declarada:false` y cada campo interno se lee con **su propio nombre** en la
ficha. **Nunca se cablea una forma.**

### 3. `entrar` — un requerido que falta (la conversión no es utilizable)

Un campo de `forma.requeridos` ausente → aparece en `requeridos_faltantes`. **Se declara, no se
completa** (status `200`).

### 4. `entrar` — ficha plana y sin puerto declarado

Sin `vertical` → `origen_ficha:'plana'` y `puerto.frontera:'frontera:ficha-producto'` con
`creado:true` (la frontera **se crea** para el negocio).

### 5. Fallo — ficha ausente

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `400` + `frontera-ficha-producto.entrar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "ficha requerida", "details": { "field": "ficha" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/frontera-ficha-producto.test.js`. Cubre:

- `entrar` con forma declarada → `200`, mapeo por ruta (`referencia→sku`, `coste_unitario→
  precio_compra`), `forma_declarada:true`, los campos ausentes en `faltantes` y emite
  `contabilidad.coste_interno`.
- Sin `forma` → `forma_declarada:false` y lectura por nombre interno (**nada cableado**).
- **Los importes se COPIAN**; no se derivan del precio ni de ningún margen (`valorado_aqui:false`,
  `calculado_aqui:false`).
- `requeridos` ausentes → `requeridos_faltantes` (sin abortar, status `200`).
- La `clave_natural` declarada prevalece; si no, la derivada del molde; si no se pudo, `null` en
  `faltantes`.
- Los campos extra se conservan en `atributos`.
- El puerto: declarado → `creado:false`; ausente → `creado:true` (**se crea la frontera del negocio**).
- `ficha` ausente/no objeto → `400 INVALID_INPUT` (`field:'ficha'`) + `.entrar.failed`.
- `toolEntrar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `FronteraFichaProducto extends ModuloHibridoReflejo`; `name = 'frontera-ficha-producto'`,
  `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated` (CONVERSOR
  stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/frontera-ficha-producto/`).
- Constante `CAMPOS_COSTE = ['clave_natural','producto','referencia','unidad','coste_unitario',
  'cantidad','coste_total','moneda','proveedor','fecha','vertical','atributos']` — **solo nombres**.
- `onEntrarRequest` usa `this._atender(e, 'entrar', 'frontera-ficha-producto.entrar.response',
  async (d) => {...})` con cierre de círculo (evento de dominio en `200`, par `failed` si no).
- Proyección `_entrar(input)` (**SÍNCRONA**); helpers `_esImporte`, `_leerRuta`, `_clave`, `_num`.
  Tool `toolEntrar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo LEE `valoracion-existencia` (H1) vía `contabilidad.coste_interno` — la capa de valor sobre
  el inventario existente.
- **PARÁMETRO COMO DATO**: la `forma` (rutas por campo, requeridos, clave natural) y el nombre del
  `puerto` son **declarables**; el código **no cablea** ninguna forma de ficha. **Cruza el formato,
  no decide el contenido ni la valoración**, y **crea la frontera** del negocio si falta.
