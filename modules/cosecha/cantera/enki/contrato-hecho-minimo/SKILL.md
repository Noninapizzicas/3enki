---
name: contrato-hecho-minimo
description: >
  Skill FULL del módulo CUSTODIO `contrato-hecho-minimo` de la vertical contabilidad
  de Enki (A11, hoja del plan). El MINIMO EXIGIBLE por fuente visto DESDE LA FUENTE:
  no un formato impuesto por contabilidad, sino los campos que cada vertical
  (VENTA, COBRO, PAGO, COMPRA, CONSUMO, CIERRE_JORNADA, RECTIFICATIVO) debe traer
  para que su hecho sea admisible. Lo declara DUENO/JEFE (un solo escritor por
  vertical; second-writer rechazado con PERMISSION_DENIED) y lo hace EXIGIBLE sin
  imponer formato. Persiste por proyecto vía PosPersistencia y alimenta el cuadre de
  admisión (A6.3) y la cola de revisión (A8.1). Úsala para operar, depurar o extender
  el custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites declarar el mínimo exigible de una vertical
    (RPC contabilidad.contrato.declarar.request) o consultarlo
    (contabilidad.contrato.exigir.request).
  - Cuando necesites saber si un hecho cubre el mínimo declarado sin rellenarlo
    (RPC contabilidad.contrato.cubre.request).
  - Cuando depures por qué una declaración se rechaza (PERMISSION_DENIED si el rol
    no es DUENO/JEFE, INVALID_INPUT en payload inválido), por qué exigir devuelve
    404 (RESOURCE_NOT_FOUND) o por qué cubre marca faltantes.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la regla
    "lo que falta NO se rellena" y la persistencia por proyecto.
  - Cuando vayas a escribir/ampliar el test unitario del custodio contrato-hecho-minimo.
tags: [enki, modulo, custodio, persistencia, contabilidad, contrato-hecho-minimo, admision]
---

# contrato-hecho-minimo — CUSTODIO del mínimo exigible por fuente

## Qué hace el módulo

`contrato-hecho-minimo` es un **CUSTODIO CON PERSISTENCIA** (A11, hoja del plan): el
dueño del store del **mínimo exigible por vertical**, por proyecto. La idea rectora
del dominio contable es que **contabilidad LEE, no impone**: en vez de forzar un
formato único, cada vertical declara **qué campos DEBE traer** su hecho para ser
admisible. Aquí ese conjunto se guarda y se hace **EXIGIBLE** sin imponer formato.

El mínimo lo declara **DUENO/JEFE** — **un solo escritor por vertical** (guard en
`_declarar`); los demás procesos son lectores. `_exigir` devuelve el mínimo declarado
y `_cubre` es una **proyección PURA**: dice si el hecho cumple el mínimo y qué
faltantes tiene, pero **jamás rellena lo que falta** (lo que falta va a `incompleto`
o a `cola-revision`, nunca se inventa).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/contrato-hecho-minimo/*.json`), restaura en `project.activated` y
vuelca en `onUnload`. Emite `contabilidad.contrato_declarado` en éxito y sus pares de
fallo deterministas. **Ningún módulo del inventario declara un mínimo por vertical**:
los contratos de entrada viven en cada vertical y aquí se hacen exigibles.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.contrato.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'DUENO'\|'JEFE', vertical, campos:[Campo]} → {project_id, vertical, campos, declarado_por}. Guard de escritor: solo DUENO/JEFE (second-writer rechazado). Publica contabilidad.contrato_declarado y responde por contabilidad.contrato.declarar.response; si el rol o el payload son invalidos → contabilidad.contrato.declarar.failed. |
| `contabilidad.contrato.exigir.request` | `onExigirRequest` | RPC custodio: {project_id, vertical} → {project_id, vertical, campos}. Lee el minimo exigible declarado para esa vertical (no muta). Si no hay minimo declarado → contabilidad.contrato.exigir.failed. Lo consume puerto-evento-vertical para validar la forma minima de entrada. |
| `contabilidad.contrato.cubre.request` | `onCubreRequest` | RPC custodio: {project_id, vertical, hecho} → {project_id, vertical, cubre, faltantes}. Proyeccion PURA: dice si el hecho cumple el minimo; jamas lo rellena (lo que falta → incompleto o cola-revision). Si el payload es invalido → contabilidad.contrato.cubre.failed. |
| `project.activated` | `onProjectActivated` | Restaura los contratos minimos del proyecto activado desde el storage (PosPersistencia): el minimo es POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.contrato_declarado` | Fire-and-forget (A11): el minimo exigible de una vertical quedo declarado → {project_id, vertical, campos, declarado_por}. Lo consume puerto-evento-vertical (contrato-hecho-minimo → puerto) para validar la forma minima de los hechos entrantes. |
| `contabilidad.contrato.declarar.failed` | Par de fallo determinista: declaracion rechazada (rol != DUENO/JEFE) o payload invalido → {status, code, message, data}. Cierra el circulo de contabilidad.contrato.declarar.request. |
| `contabilidad.contrato.exigir.failed` | Par de fallo determinista: exigir sin minimo declarado para la vertical, o payload invalido. Cierra el circulo de contabilidad.contrato.exigir.request. |
| `contabilidad.contrato.cubre.failed` | Par de fallo determinista: cubre con payload invalido. Cierra el circulo de contabilidad.contrato.cubre.request. |
| `contabilidad.contrato_declarado.failed` | Par de fallo del evento de dominio contabilidad.contrato_declarado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.contrato.declarar.failed` cierra el círculo de
> `contabilidad.contrato.declarar.request` cuando `_declarar` devuelve status ≠ 200;
> `contabilidad.contrato.exigir.failed` cierra `exigir.request` y
> `contabilidad.contrato.cubre.failed` cierra `cubre.request`.

> Nota: no está en module.json pero sí lo emite index.js en `onDeclararRequest`
> (`this.eventBus?.publish('contabilidad.contrato.declarar.failed', res)`) — el par de
> fallo se emite dentro del handler, además de la response de `_atender`.

## Reglas de negocio

1. **Un solo escritor por vertical (guard de rol)**: `_declarar` exige
   `rol ∈ {DUENO, JEFE}` (constante `ROLES_AUTORIZADOS`). Cualquier otro →
   `403 PERMISSION_DENIED` con
   `{ status:403, error:{ code:'PERMISSION_DENIED', message:'solo el DUENO/JEFE declara el minimo por vertical', details:{ roles_esperados:['DUENO','JEFE'], rol_recibido:<rol> } } }`.
   Second-writer rechazado.
2. **Validaciones de payload deterministas**: falta `project_id` → `400 INVALID_INPUT
   project_id`; falta `vertical` → `400 INVALID_INPUT vertical`; `campos` vacío o no
   array → `400 INVALID_INPUT campos`. Todos devuelven
   `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
3. **Campos normalizados**: `campos` se limpia con `String().trim()`, se descartan
   vacíos y se **deduplica** con `Set` antes de guardarse.
4. **El mínimo es por proyecto Y por vertical**: se guarda en
   `store[pid].verticales[<vertical>]`; el mismo vertical en otro proyecto tiene su
   propio mínimo.
5. **Exigir sin mínimo declarado → 404**: `_exigir` de una vertical no declarada
   devuelve `404 RESOURCE_NOT_FOUND` `{ status:404, error:{ code:'RESOURCE_NOT_FOUND', message:'no hay minimo declarado para la vertical <vertical>', details:{ vertical } } }`.
6. **Cubre es proyección PURA y NO rellena**: `_cubre` marca como faltante todo campo
   cuyo valor en `hecho` sea `undefined`, `null` o `''`; devuelve `cubre:true` solo si
   `faltantes.length === 0`. **Lo que falta NO se completa** — su destino es
   `incompleto` o `cola-revision`. Es la invariante contable **Cero estimación**.
7. **La ley entra como DATO**: los campos del mínimo son DECLARABLES por el dueño/jefe,
   nunca constantes cableadas en el código.
8. **HTTP exacto**: éxito `200`; rol inválido → `403`; payload inválido → `400`; sin
   mínimo declarado → `404`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.contrato.declarar.response`,
`contabilidad.contrato.exigir.response` y `contabilidad.contrato.cubre.response`.

### 1. `declarar` — declarar el mínimo de una vertical (solo DUENO/JEFE)

```json
{
  "project_id": "e57a318a-...",
  "rol": "DUENO",
  "vertical": "COMPRA",
  "campos": ["proveedor", "nif", "base", "iva", "total", "fecha"],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "vertical": "COMPRA", "campos": ["proveedor", "nif", "base", "iva", "total", "fecha"], "declarado_por": "DUENO" }
```
Emite `contabilidad.contrato_declarado`:
```json
{ "project_id": "e57a318a-...", "vertical": "COMPRA", "campos": ["proveedor", "nif", "base", "iva", "total", "fecha"], "declarado_por": "DUENO", "correlation_id": "abc-123" }
```

### 2. `exigir` — leer el mínimo declarado (no muta)

```json
{ "project_id": "e57a318a-...", "vertical": "COMPRA" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "vertical": "COMPRA", "campos": ["proveedor", "nif", "base", "iva", "total", "fecha"] }
```
Si la vertical no declaró su mínimo → `404` + `contabilidad.contrato.exigir.failed`:
```json
{ "status": 404, "error": { "code": "RESOURCE_NOT_FOUND", "message": "no hay minimo declarado para la vertical COMPRA", "details": { "vertical": "COMPRA" } } }
```

### 3. `cubre` — ¿el hecho cumple el mínimo? (proyección pura, NO rellena)

```json
{
  "project_id": "e57a318a-...",
  "vertical": "COMPRA",
  "hecho": { "proveedor": "ACME SL", "nif": "B12345678", "base": 100, "total": 121 }
}
```
Respuesta `200` (faltan `iva` y `fecha`; el hecho NO se rellena):
```json
{ "project_id": "e57a318a-...", "vertical": "COMPRA", "cubre": false, "faltantes": ["iva", "fecha"] }
```

### Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "vertical": "COMPRA", "campos": ["total"] }
```
Respuesta `403` + `contabilidad.contrato.declarar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el DUENO/JEFE declara el minimo por vertical", "details": { "roles_esperados": ["DUENO", "JEFE"], "rol_recibido": "OPERADOR" } } }
```

## Tests

El test vive en `tests/unit/contrato-hecho-minimo.test.js`. Cubre:

- `declarar` con rol `DUENO` (o `JEFE`) y `campos` válidos → `200`, normaliza y
  deduplica, y emite `contabilidad.contrato_declarado`.
- `declarar` con rol distinto → `403 PERMISSION_DENIED` + `contabilidad.contrato.declarar.failed`.
- `declarar` sin `project_id`/`vertical`/`campos` → `400 INVALID_INPUT`.
- `exigir` de una vertical declarada → `200 {campos}`; de una no declarada → `404` + `contabilidad.contrato.exigir.failed`.
- `cubre` con hecho incompleto → `200 {cubre:false, faltantes}` sin rellenar; con hecho completo → `cubre:true`, `faltantes:[]`.
- `project.activated` restaura los contratos vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/contrato-hecho-minimo
node --test tests/unit/contrato-hecho-minimo.test.js
```

## Notas de implementación

- Clase `ContratoHechoMinimo extends ModuloHibridoReflejo`; `name =
  'contrato-hecho-minimo'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._store` (Map project_id → `{ esquema:'contabilidad-contrato-hecho-minimo-v1', verticales:{}, updated_at }`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'contrato-hecho-minimo.json', dir: '/contabilidad/contrato-hecho-minimo', snapshot,
  hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()`
  + `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onDeclararRequest`/`onExigirRequest`/`onCubreRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.contrato.<op>.response', fn)`; los handlers
  emiten el evento de dominio (`contabilidad.contrato_declarado`) o el par
  determinista (`contabilidad.contrato.declarar.failed`) dentro de la proyección,
  propagando `correlation_id`.
- Proyecciones puras: `_declarar` (escritura + guard), `_exigir` y `_cubre` (lectura;
  `_cubre` no muta el hecho). Helper `_obtenerOCrear(pid)`. `_invalid`/`_errorResponse`
  vienen de `modulo-hibrido-reflejo` / `base-module`.
- Tools: `toolDeclarar` → `_declarar`, `toolExigir` → `_exigir`, `toolCubre` → `_cubre`.
- DEP hacia delante: lo consumen `puerto-evento-vertical` (validar forma mínima),
  el cuadre de admisión (A6.3) y `cola-revision` (A8.1).
