---
name: traza-asiento
description: >
  Skill FULL del módulo CUSTODIO `traza-asiento` de la vertical contabilidad de Enki (B4,
  hoja del plan). REGISTRO INMUTABLE de QUIÉN y CUÁNDO creó cada asiento: solo crece,
  nunca se reescribe ni se borra (requisito de auditoría y de Verifactu). CUSTODIO
  APPEND-ONLY: una entrada por clave natural con el asiento CONGELADO (la primera entrada
  manda; reanotar la misma clave es idempotente y devuelve el original, reusada:true). GUARD
  de un solo escritor (rol ESCRITOR_DIARIO; otro rol → 409 ERROR_DOS_ESCRITORES); todo
  intento de reescritura/borrado se cierra con 409 ERROR_TRAZA_INMUTABLE (el asiento
  original NUNCA se borra; la corrección SUMA, B5). Anota cada asiento asentado por
  fire-and-forget. Persiste por proyecto vía PosPersistencia. Úsala para operar, depurar o
  extender el custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites anotar una entrada de traza (RPC contabilidad.traza.anotar.request) o
    consultarla (contabilidad.traza.consultar.request; lo consume asiento-ajuste B5 para
    verificar que el original sigue en la traza).
  - Cuando depures por qué se rechaza (409 ERROR_DOS_ESCRITORES si el rol no es
    ESCRITOR_DIARIO, 409 ERROR_TRAZA_INMUTABLE si se intenta reescribir/borrar, 400
    INVALID_INPUT) o por qué una clave reanotada no cambia.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la inmutabilidad
    append-only y la secuencia de anotaciones.
  - Cuando vayas a escribir/ampliar el test unitario del custodio traza-asiento.
tags: [enki, modulo, custodio, persistencia, contabilidad, traza-asiento, append-only, inmutable]
---

# traza-asiento — CUSTODIO APPEND-ONLY · la traza inmutable del asiento

## Qué hace el módulo

`traza-asiento` es un **CUSTODIO APPEND-ONLY CON PERSISTENCIA** (B4, hoja del plan):
**REGISTRO INMUTABLE de QUIÉN y CUÁNDO creó cada asiento**. Solo **crece**; **nunca se
reescribe ni se borra**. Es **requisito de auditoría y de Verifactu**: el asiento original
**NUNCA se borra**, y **la traza es la prueba de que existió y de cuándo**.

Es **append-only**: **una entrada por clave natural con el asiento CONGELADO** — **la
primera entrada manda**. Reanotar la **misma** clave es **idempotente** y devuelve el
original (`reusada:true`), sin reescribirlo. **GUARD de un solo escritor**: el rol
autorizado de la traza es **`ESCRITOR_DIARIO`** (`ROL_ESCRITOR_TRAZA`); cualquier otro rol
→ **`409 ERROR_DOS_ESCRITORES`**. Todo intento de reescritura/borrado se cierra
determinísticamente con **`409 ERROR_TRAZA_INMUTABLE`** (`_rechazarMutacion`): *el asiento
original NUNCA se borra; la corrección SUMA (B5)*.

**Fire-and-forget**: `contabilidad.asiento_asentado` (B2) → **se anota la traza sin que
nadie la pida** (deja constancia en el momento en que el hecho ocurre). Persiste por
proyecto con **PosPersistencia** (storage `/contabilidad/traza-asiento/traza-asiento.json`),
restaura en `project.activated` y vuelca en `onUnload`.

> **NO REUTILIZA**: la traza del asiento es requisito de auditoría y de Verifactu; no existe
> en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.traza.anotar.request` | `onAnotarRequest` | RPC custodio: {project_id, rol:'ESCRITOR_DIARIO', quien, cuando, clave_natural, asiento} → {project_id, entrada:{clave_natural, quien, cuando, que, secuencia, borrable:false, reescribible:false}, reusada, inmutable:true}. APPEND-ONLY: si la clave ya tiene entrada NO se reescribe (reusada:true, devuelve el original congelado). Rol distinto de ESCRITOR_DIARIO → 409 ERROR_DOS_ESCRITORES. Exito publica contabilidad.traza_anotada y responde por contabilidad.traza.anotar.response; error → contabilidad.traza.anotar.failed. |
| `contabilidad.traza.consultar.request` | `onConsultarRequest` | RPC custodio: {project_id, clave_natural?} → {project_id, clave_natural, hallada, entrada} (o {entradas:[...], n, append_only:true} si no se da clave). Proyeccion PURA de lectura (no muta). Responde por contabilidad.traza.consultar.response; error → contabilidad.traza.consultar.failed. Lo consume asiento-ajuste (B5) para verificar que el original sigue en la traza. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 → B4): el diario asento un asiento → se anota la traza (quien = asentado_por, cuando = asentado_en, que = el asiento). La traza NO se pide: se deja constancia en el momento en que el hecho ocurre. Exito publica contabilidad.traza_anotada; fallo → contabilidad.traza_anotada.failed. |
| `project.activated` | `onProjectActivated` | Restaura la traza del proyecto activado desde el storage (PosPersistencia): la traza es POR PROYECTO y APPEND-ONLY. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.traza_anotada` | Fire-and-forget (B4): una entrada quedo anotada en la traza (o se reuso el original) → {project_id, entrada:{clave_natural, quien, cuando, que, secuencia}, clave_natural, reusada, inmutable:true}. La prueba de auditoria de que el asiento existio y de cuando. |
| `contabilidad.traza.anotar.failed` | Par de fallo determinista: anotar con rol distinto de ESCRITOR_DIARIO (409 ERROR_DOS_ESCRITORES) o sin project_id/clave_natural (400). Cierra el circulo de contabilidad.traza.anotar.request. |
| `contabilidad.traza.consultar.failed` | Par de fallo determinista: consultar sin project_id. Cierra el circulo de contabilidad.traza.consultar.request. |
| `contabilidad.traza_anotada.failed` | Par de fallo del evento de dominio contabilidad.traza_anotada: la emision del hecho de dominio no se completo (incluye el rechazo de un intento de mutacion, 409 ERROR_TRAZA_INMUTABLE). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.traza.anotar.failed` cierra `contabilidad.traza.anotar.request`;
> `contabilidad.traza.consultar.failed` cierra `contabilidad.traza.consultar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.traza.anotar.response` y `contabilidad.traza.consultar.response` (los pares
> response de los RPC); **NO están declaradas en `publishes`**. Además,
> `onAsientoAsentado` (fire-and-forget) publica **`contabilidad.traza_anotada`** o
> **`contabilidad.traza_anotada.failed`** según el `status` de `_anotar`.

> Nota de sub-declaración: el código `ERROR_TRAZA_INMUTABLE` se emite únicamente desde
> `_rechazarMutacion`, que **NO está expuesto por ningún RPC** (solo como tool
> `toolRechazarMutacion`). El par `contabilidad.traza_anotada.failed` está declarado en
> `publishes` y su `description` menciona el rechazo de mutación, pero `index.js` lo emite
> solo en el fallo de `onAsientoAsentado` — el rechazo de mutación (`409
> ERROR_TRAZA_INMUTABLE`) se cierra por la vía de la tool, no por evento.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — el único evento de dominio de `publishes` es
> `contabilidad.traza_anotada`; su par `contabilidad.traza_anotada.failed` sí se emite desde
> `onAsientoAsentado` cuando `_anotar` falla.

## Reglas de negocio

1. **APPEND-ONLY e INMUTABLE (el cerrojo del módulo)**: `_anotar` — si la clave **ya tiene
   entrada**, **NO la reescribe**: devuelve `{ entrada:<original congelada>, clave_natural,
   reusada:true, inmutable:true, nota:'la entrada original se conserva: la traza solo crece,
   nunca se reescribe' }`. **La primera entrada manda.**
2. **Un solo escritor de la traza (M2)**: `_verificarEscritorUnico` exige `rol ===
   'ESCRITOR_DIARIO'` (normalizado a mayúsculas). Cualquier otro → **`409
   ERROR_DOS_ESCRITORES`** con `{ message:'la traza tiene UN escritor: solo el ESCRITOR_DIARIO
   anota', details:{ escritor_vigente:'ESCRITOR_DIARIO', rol_intentado:<rol>,
   simbolico:'ERROR_DOS_ESCRITORES' } }`.
3. **Todo intento de borrado/reescritura se RECHAZA**: `_rechazarMutacion` devuelve **`409
   ERROR_TRAZA_INMUTABLE`** con `{ message:'la traza es APPEND-ONLY: no se reescribe ni se
   borra', details:{ simbolico:'ERROR_TRAZA_INMUTABLE', operacion_intentada:<op>, nota:'el
   asiento original NUNCA se borra; la correccion SUMA (B5)' } }`.
4. **La entrada congela el asiento**: cada entrada lleva `{ clave_natural, quien, cuando,
   que:{ asiento_id, tipo, debe, haber, apuntes }, secuencia, borrable:false,
   reescribible:false, anotada_en }` — **borrable y reescribible siempre `false`**.
5. **Secuencia monótona**: `d.secuencia` crece con cada anotación nueva (`secuencia =
   length + 1`); la secuencia es la prueba de orden temporal de la traza.
6. **Anotar es idempotente por clave**: reanotar la misma clave devuelve el original
   (`status 200`), no un error. La traza no duplica entradas.
7. **La traza NO se pide, se deja constancia**: `onAsientoAsentado` (B2 → B4) anota
   automáticamente cada asiento asentado con `quien = asentado_por`, `cuando = asentado_en`,
   `que = el asiento`. Si el evento no trae `project_id`, retorna `null` sin publicar.
8. **Consultar es lectura PURA**: `_consultar` con `clave_natural` devuelve
   `{ clave_natural, hallada, entrada }` (o `hallada:false`); sin clave devuelve
   `{ entradas:[...], n, append_only:true }`. No muta.
9. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`; sin
   `clave_natural` (ni en `asiento.clave_natural`) → `400 INVALID_INPUT clave_natural`.
   Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{
   field:<campo> } } }`.
10. **La traza es POR PROYECTO**: `store[pid].entradas` y `store[pid].secuencia`. Sin
    restaurar (`project.activated`) la secuencia no se puede garantizar.
11. **HTTP exacto**: éxito `200`; payload inválido → `400`; segundo escritor → `409`; intento
    de mutación → `409`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.traza.anotar.response` y
`contabilidad.traza.consultar.response`.

### 1. `anotar` — anotar una entrada (append-only)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ESCRITOR_DIARIO",
  "quien": "ADMISION",
  "cuando": "2026-09-12T10:00:00.000Z",
  "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84",
  "asiento": { "id": "e57a318a-...-A1", "tipo": "NORMAL", "debe": 121, "haber": 121, "apuntes": [ { "cuenta": "430", "debe": 121, "haber": 0 } ] },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "entrada": { "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84", "quien": "ADMISION", "cuando": "2026-09-12T10:00:00.000Z", "que": { "asiento_id": "e57a318a-...-A1", "tipo": "NORMAL", "debe": 121, "haber": 121, "apuntes": [ { "cuenta": "430", "debe": 121, "haber": 0 } ] }, "secuencia": 1, "borrable": false, "reescribible": false, "anotada_en": "..." },
  "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84",
  "reusada": false,
  "inmutable": true,
  "n_entradas": 1
}
```
Emite `contabilidad.traza_anotada` (res.data + `correlation_id`).

### 2. `anotar` la MISMA clave — no reescribe (reusada:true)

Misma `clave_natural`, con un `asiento` distinto → **NO se reescribe**:
```json
{ "project_id": "e57a318a-...", "entrada": { "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84", "quien": "ADMISION", "que": { "asiento_id": "e57a318a-...-A1", "tipo": "NORMAL" }, "secuencia": 1, "borrable": false, "reescribible": false }, "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84", "reusada": true, "inmutable": true, "nota": "la entrada original se conserva: la traza solo crece, nunca se reescribe" }
```

### 3. `consultar` — la entrada de una clave, o toda la secuencia (pura)

```json
{ "project_id": "e57a318a-...", "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84" }
```
Respuesta `200` (hallada):
```json
{ "project_id": "e57a318a-...", "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84", "hallada": true, "entrada": { "clave_natural": "...", "quien": "ADMISION", "cuando": "...", "que": { "asiento_id": "e57a318a-...-A1" }, "secuencia": 1, "borrable": false, "reescribible": false } }
```
Sin `clave_natural` → devuelve `{ project_id, entradas:[...], n, append_only:true }`. Clave
inexistente → `{ hallada:false, entrada:null }` (`200`, no error).

### 4. Fallo — rol no ESCRITOR_DIARIO → 409

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "clave_natural": "k1", "asiento": { "id": "A1" } }
```
Respuesta `409` + `contabilidad.traza.anotar.failed`:
```json
{ "status": 409, "error": { "code": "ERROR_DOS_ESCRITORES", "message": "la traza tiene UN escritor: solo el ESCRITOR_DIARIO anota", "details": { "escritor_vigente": "ESCRITOR_DIARIO", "rol_intentado": "OPERADOR", "simbolico": "ERROR_DOS_ESCRITORES" } } }
```

### 5. Fallo — intento de mutación (tool, sin RPC)

`toolRechazarMutacion({ project_id, operacion:'BORRAR', clave_natural })` → **`409
ERROR_TRAZA_INMUTABLE`**:
```json
{ "status": 409, "error": { "code": "ERROR_TRAZA_INMUTABLE", "message": "la traza es APPEND-ONLY: no se reescribe ni se borra", "details": { "simbolico": "ERROR_TRAZA_INMUTABLE", "operacion_intentada": "BORRAR", "nota": "el asiento original NUNCA se borra; la correccion SUMA (B5)" } } }
```

### 6. Entrada fire-and-forget — asiento asentado (B2 → B4)

Entra `contabilidad.asiento_asentado` con `{ project_id, asiento:{...}, clave_natural,
asentado_por, asentado_en }` → anota automáticamente y publica `contabilidad.traza_anotada`
(o `contabilidad.traza_anotada.failed`).

### 7. Tools (sin RPC en module.json)

`toolAnotar` → `_anotar`; `toolConsultar` → `_consultar`; `toolRechazarMutacion` →
`_rechazarMutacion`.

## Tests

El test vive en `tests/unit/traza-asiento.test.js`. Cubre:

- `anotar` con rol `ESCRITOR_DIARIO` → `200`, `inmutable:true`, `borrable:false`,
  `reescribible:false`, `secuencia:1`; emite `contabilidad.traza_anotada`.
- **Inmutabilidad**: reanotar la misma clave → `200` con `reusada:true` y **la entrada
  original congelada** (no se reescribe).
- **Single-writer**: rol distinto de `ESCRITOR_DIARIO` → `409 ERROR_DOS_ESCRITORES`.
- `toolRechazarMutacion` → `409 ERROR_TRAZA_INMUTABLE` (el original nunca se borra).
- `consultar` con clave → `hallada`; sin clave → la secuencia completa con `append_only:true`;
  sin `project_id` → `400 INVALID_INPUT` + `contabilidad.traza.consultar.failed`.
- Fire-and-forget `contabilidad.asiento_asentado` → anota sin que nadie la pida; sin
  `project_id` → `null`.
- `project.activated` restaura la traza vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/traza-asiento
node --test tests/unit/traza-asiento.test.js
```

## Notas de implementación

- Clase `TrazaAsiento extends ModuloHibridoReflejo`; `name = 'traza-asiento'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._store` (Map project_id →
  `{ esquema:'contabilidad-traza-asiento-v1', entradas:{ <clave>:Entrada }, secuencia:[],
  escritor:'ESCRITOR_DIARIO' }`).
- Constantes: `ROL_ESCRITOR_TRAZA = 'ESCRITOR_DIARIO'`, `CODE_DOS_ESCRITORES =
  'ERROR_DOS_ESCRITORES'`, `CODE_TRAZA_INMUTABLE = 'ERROR_TRAZA_INMUTABLE'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file: 'traza-asiento.json',
  dir: '/contabilidad/traza-asiento', snapshot, hidratar })`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada mutación marca
  `marcarDirty(pid)`.
- `onAnotarRequest`/`onConsultarRequest` delegan en `_atender(e, '<op>',
  'contabilidad.traza.<op>.response', fn)`; `onConsultarRequest` publica solo el par de fallo
  si `status !== 200`. `onAsientoAsentado` es fire-and-forget (sin `_atender`) y publica
  `contabilidad.traza_anotada` / `contabilidad.traza_anotada.failed`.
- Proyecciones puras: `_anotar` (append-only; reanotar no reescribe), `_consultar` (lectura),
  `_rechazarMutacion` (+ helpers `_obtenerOCrear`, `_verificarEscritorUnico`).
  `_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolAnotar`, `toolConsultar`, `toolRechazarMutacion`.
- DEP hacia delante: `contabilidad.traza.consultar.request` lo consume `asiento-ajuste` (B5)
  para verificar que el original sigue en la traza. DEP hacia atrás por evento:
  `escritor-diario` (B2) publica `contabilidad.asiento_asentado`.
