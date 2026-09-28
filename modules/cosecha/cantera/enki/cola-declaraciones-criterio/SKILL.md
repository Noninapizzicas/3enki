---
name: cola-declaraciones-criterio
description: >
  Skill FULL del módulo CUSTODIO `cola-declaraciones-criterio` de la vertical
  contabilidad de Enki (K9, hoja del plan). La PUERTA DECLARATIVA del dominio: UNA
  sola cola donde el JEFE/ASESOR fija o ratifica TODOS los criterios contables (plan
  de cuentas, periodo, plazos, amortización, dimensiones, tipos fiscales,
  consolidación, unidad_de_cierre) y las 23 piezas [ABIERTO], cerrados aquí en vez de
  en 12 sitios distintos. Mientras no se declaren, la pieza NO ACTÚA y lo no declarado
  NO se estima. Un solo escritor (JEFE/ASESOR); leer y pendientes son proyecciones
  puras. Persiste por proyecto vía PosPersistencia. Úsala para operar, depurar o
  extender el custodio, o para entender su contrato de eventos y sus reglas.
when-to-use: >
  - Cuando el jefe/asesor deba declarar un criterio contable
    (RPC contabilidad.criterio.declarar.request) o leerlo
    (RPC contabilidad.criterio.leer.request).
  - Cuando necesites la lista de las 23 piezas [ABIERTO] aún sin declarar
    (RPC contabilidad.criterio.pendientes.request) — qué está bloqueado por falta de
    declaración.
  - Cuando depures por qué se rechaza una declaración (PERMISSION_DENIED si el rol no
    es JEFE/ASESOR, INVALID_INPUT si falta criterio/valor) o por qué un criterio sale
    AUSENTE (no se estima).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la
    invariante "lo no declarado NO se estima" y las 23 piezas del catálogo.
  - Cuando vayas a escribir/ampliar el test unitario del custodio
    cola-declaraciones-criterio.
tags: [enki, modulo, custodio, persistencia, contabilidad, cola-declaraciones-criterio, criterios, abierto]
---

# cola-declaraciones-criterio — CUSTODIO de la puerta declarativa del dominio

## Qué hace el módulo

`cola-declaraciones-criterio` es un **CUSTODIO CON PERSISTENCIA** (K9, hoja del
plan): la **PUERTA DECLARATIVA del dominio contable**. **UNA sola cola** donde el
`JEFE`/`ASESOR` **fija o ratifica TODOS los criterios contables** — plan de cuentas,
periodo, plazos, amortización, dimensiones, tipos fiscales, consolidación,
`unidad_de_cierre`, etc. — **cerrados aquí en vez de en 12 sitios distintos**.

Las **23 piezas `[ABIERTO]`** del *diseño-oop* (`A6.3, A8.3, A10, B7, C7, D10, D11,
E6, E14, F5, G5, H5, H6, I5, I6, I7, J6, J7, K6, K7, K8, L6, M4`) son **parámetros
declarables** que viven en esta cola: **mientras el dueño/asesor no los declare, la
pieza NO ACTÚA** y **lo no declarado NO se estima** — queda `AUSENTE`/`PENDIENTE`.
Es la invariante **Cero estimación** del dominio.

Un **solo escritor**: `JEFE`/`ASESOR` declara (guard en `_declarar`); `_leer` y
`_pendientes` son **proyecciones PURAS** (no mutan). Persiste por proyecto con
**PosPersistencia** (storage
`/contabilidad/cola-declaraciones-criterio/cola-declaraciones-criterio.json`),
restaura en `project.activated` y vuelca en `onUnload`. Emite
`contabilidad.criterio_declarado` (y `contabilidad.criterio_pendiente` por cada pieza
aún abierta) más sus pares deterministas. La consumen `clave-natural` (B7/M4),
`inmovilizado` (F5), analítica (J6/J7), fiscal (D10/D11) y el resto, **por EVENTO**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.criterio.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'JEFE'\|'ASESOR', criterio, valor, descripcion?} → {project_id, criterio, parametro, valor, declarado_por}. Un solo escritor: solo JEFE/ASESOR declara (second-writer rechazado con PERMISSION_DENIED). Marca si el criterio pertenece al catalogo de las 23 piezas [ABIERTO]. Publica contabilidad.criterio_declarado y responde por contabilidad.criterio.declarar.response; si el rol o el payload son invalidos → contabilidad.criterio.declarar.failed. |
| `contabilidad.criterio.leer.request` | `onLeerRequest` | RPC custodio: {project_id, criterio} → {project_id, criterio, hallado, estado:'DECLARADO'\|'AUSENTE', parametro}. Proyeccion PURA de lectura (no muta). AUSENTE = [ABIERTO]: lo no declarado NO se estima. Responde por contabilidad.criterio.leer.response; si el payload es invalido → contabilidad.criterio.leer.failed. Lo consumen clave-natural, inmovilizado, analitica, fiscal. |
| `contabilidad.criterio.pendientes.request` | `onPendientesRequest` | RPC custodio: {project_id} → {project_id, pendientes, declarados, total_catalogo, n_pendientes}. Proyeccion PURA: la lista de las 23 piezas [ABIERTO] que aun no se han declarado. Publica contabilidad.criterio_pendiente por CADA pieza aun abierta y responde por contabilidad.criterio.pendientes.response; si el payload es invalido → contabilidad.criterio.pendientes.failed. |
| `project.activated` | `onProjectActivated` | Restaura las declaraciones de criterio del proyecto activado desde el storage (PosPersistencia): los criterios son POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.criterio_declarado` | Fire-and-forget (K9): un criterio contable quedo declarado por el jefe/asesor → {project_id, criterio, parametro, valor, declarado_por}. Cierra en UN sitio lo que antes se decidia en 12; los consumidores (clave-natural, inmovilizado, analitica, fiscal) lo leen por EVENTO. |
| `contabilidad.criterio_pendiente` | Fire-and-forget (K9): por cada pieza [ABIERTO] que sigue sin declarar → {project_id, criterio, pieza_abierta:true}. Senal de que la pieza NO ACTUA hasta que el dueno/asesor la declare (cero valores estimados). |
| `contabilidad.criterio.declarar.failed` | Par de fallo determinista: declarar rechazado (rol != JEFE/ASESOR) o payload invalido (sin criterio/valor). Cierra el circulo de contabilidad.criterio.declarar.request. |
| `contabilidad.criterio.leer.failed` | Par de fallo determinista: leer con payload invalido (sin criterio). Cierra el circulo de contabilidad.criterio.leer.request. |
| `contabilidad.criterio.pendientes.failed` | Par de fallo determinista: pendientes con payload invalido. Cierra el circulo de contabilidad.criterio.pendientes.request. |
| `contabilidad.criterio_declarado.failed` | Par de fallo del evento de dominio contabilidad.criterio_declarado: la emision del hecho de dominio no se completo. |
| `contabilidad.criterio_pendiente.failed` | Par de fallo del evento de dominio contabilidad.criterio_pendiente: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.criterio.declarar.failed` cierra `declarar.request`,
> `contabilidad.criterio.leer.failed` cierra `leer.request` y
> `contabilidad.criterio.pendientes.failed` cierra `pendientes.request`.

> Nota: no está en module.json pero sí lo emite index.js —
> `contabilidad.criterio_pendiente` se emite **dentro de `onPendientesRequest`**,
> una vez **por cada pieza aún pendiente** (no es una sola emisión), con
> `{ project_id, criterio, pieza_abierta:true, correlation_id }`. El resto de pares
> de dominio/fallo se emiten dentro de sus handlers.

> Nota: `contabilidad.criterio.declarar.response`,
> `contabilidad.criterio.leer.response` y
> `contabilidad.criterio.pendientes.response` las emite `_atender` y **NO están
> declaradas en `publishes`**.

> Nota: **`contabilidad.criterio_declarado.failed` y
> `contabilidad.criterio_pendiente.failed` están declaradas en `publishes` pero no se
> emiten en `index.js`** — el custodio solo publica los pares de fallo de sus RPC,
> no los pares de sus eventos de dominio.

## Reglas de negocio

1. **Un solo escritor de los criterios (guard de rol)**: `_declarar` exige
   `rol ∈ {JEFE, ASESOR}` (constante `ROLES_AUTORIZADOS`). Cualquier otro → **`403
   PERMISSION_DENIED`** con
   `{ status:403, error:{ code:'PERMISSION_DENIED', message:'solo JEFE/ASESOR declara criterios contables', details:{ roles_esperados:['JEFE','ASESOR'], rol_recibido:<rol> } } }`.
   Second-writer rechazado.
2. **Lo no declarado NO se estima (Cero estimación)**: `_leer` de un criterio no
   declarado devuelve **`200` con `estado:'AUSENTE'`, `hallado:false`,
   `parametro:null`** — **nunca** un valor inventado ni por defecto. `AUSENTE` = la
   pieza `[ABIERTO]` sigue sin actuar.
3. **El catálogo de las 23 piezas `[ABIERTO]`**: `CATALOGO_ABIERTO` es la lista
   fija. `_declarar` marca `param.en_catalogo` (`true` si el criterio está en el
   catálogo). `_pendientes` **solo** devuelve los del catálogo aún no declarados;
   declarar un criterio **fuera** del catálogo se admite (`en_catalogo:false`) pero no
   altera el conteo `total_catalogo` (= 23).
4. **Una señal por pieza abierta**: `_pendientes` publica
   `contabilidad.criterio_pendiente` **una vez por cada pieza aún abierta** — si hay
   23 pendientes, 23 eventos. Es la señal de "esta pieza NO actúa".
5. **Leer y pendientes son PURAS**: `_leer` y `_pendientes` no mutan el store; solo
   `_declarar` persiste (marca `marcarDirty(pid)`).
6. **Los criterios son por proyecto**: se guardan en
   `store[pid].declaraciones[<criterio>] = ParametroDeclarable`; el mismo criterio en
   otro `project_id` tiene su propio valor declarado.
7. **Sobrescribir un criterio = re-declarar**: un `criterio` ya declarado se
   **reemplaza** con la nueva declaración (`declarado_por`/`declarado_en` se
   actualizan). El store guarda la última declaración conocida.
8. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT
   project_id`; falta `criterio` → `400 INVALID_INPUT criterio`; `valor` ausente,
   `null` o `undefined` → `400 INVALID_INPUT valor` (ojo: `0`, `false` y `''` **sí**
   son valores declarables). Shape: `{ status:400, error:{ code:'INVALID_INPUT',
   message:'<campo> requerido', details:{ field:<campo> } } }`.
9. **LA LEY ENTRA COMO DATO**: el plan de cuentas, los plazos, los tipos fiscales y
   cada parámetro son **declarables** por el jefe/asesor, **nunca** constantes
   cableadas en el código. Esta cola **no decide**: recoge y expone lo declarado.
10. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol no autorizado →
    `403`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.criterio.declarar.response`,
`contabilidad.criterio.leer.response` y `contabilidad.criterio.pendientes.response`.

### 1. `declarar` — fijar/ratificar un criterio (solo JEFE/ASESOR)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "criterio": "M4",
  "valor": { "unidad_cierre": "MENSUAL", "regla": "mes natural" },
  "descripcion": "unidad de cierre de la vertical COMPRA",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "criterio": "M4",
  "parametro": { "criterio": "M4", "valor": { "unidad_cierre": "MENSUAL", "regla": "mes natural" }, "descripcion": "unidad de cierre de la vertical COMPRA", "en_catalogo": true, "declarado_por": "ASESOR", "declarado_en": "2026-09-28T..." },
  "valor": { "unidad_cierre": "MENSUAL", "regla": "mes natural" },
  "declarado_por": "ASESOR"
}
```
Emite `contabilidad.criterio_declarado` (res.data + `correlation_id`).

### 2. `leer` — leer un criterio declarado (pura; AUSENTE si no se declaró)

```json
{ "project_id": "e57a318a-...", "criterio": "M4" }
```
Respuesta `200` declarado:
```json
{ "project_id": "e57a318a-...", "criterio": "M4", "hallado": true, "estado": "DECLARADO", "parametro": { "criterio": "M4", "valor": { "unidad_cierre": "MENSUAL" }, "en_catalogo": true, "declarado_por": "ASESOR", "declarado_en": "2026-09-28T..." } }
```
Si NO está declarado → `200` `estado:'AUSENTE'` (lo no declarado NO se estima):
```json
{ "project_id": "e57a318a-...", "criterio": "C7", "hallado": false, "estado": "AUSENTE", "parametro": null }
```

### 3. `pendientes` — las 23 piezas [ABIERTO] aún sin declarar (pura)

```json
{ "project_id": "e57a318a-...", "correlation_id": "abc-124" }
```
Respuesta `200` (emite un `contabilidad.criterio_pendiente` por cada id de `pendientes`):
```json
{
  "project_id": "e57a318a-...",
  "pendientes": ["A6.3", "A8.3", "A10", "B7", "C7", "D10", "D11", "E6", "E14", "F5", "G5", "H5", "H6", "I5", "I6", "I7", "J6", "J7", "K6", "K7", "K8", "L6"],
  "declarados": ["M4"],
  "total_catalogo": 23,
  "n_pendientes": 22,
  "nota": "lo no declarado NO se estima: la pieza queda [ABIERTO] y no actua"
}
```

### 4. Fallo — rol no autorizado

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "criterio": "M4", "valor": "MENSUAL" }
```
Respuesta `403` + `contabilidad.criterio.declarar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo JEFE/ASESOR declara criterios contables", "details": { "roles_esperados": ["JEFE", "ASESOR"], "rol_recibido": "OPERADOR" } } }
```

### 5. Fallo — payload inválido

Sin `criterio` → `400`; con `valor` nulo → `400 INVALID_INPUT valor`.

## Tests

El test vive en `tests/unit/cola-declaraciones-criterio.test.js`. Cubre:

- `declarar` con `rol:'JEFE'`/`'ASESOR'` → `200`, marca `en_catalogo` y emite
  `contabilidad.criterio_declarado`.
- `declarar` con otro rol → `403 PERMISSION_DENIED` + par de fallo.
- `declarar` sin `criterio`/`valor` → `400 INVALID_INPUT`; `valor:0`/`false`/`''`
  **sí** se aceptan.
- `leer` declarado → `200 estado:'DECLARADO'`; no declarado → `estado:'AUSENTE'`
  (`hallado:false`, `parametro:null`).
- `pendientes` → `total_catalogo:23`, `pendientes` contiene las piezas no declaradas
  y emite **un `contabilidad.criterio_pendiente` por cada una**.
- `project.activated` restaura las declaraciones vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/cola-declaraciones-criterio
node --test tests/unit/cola-declaraciones-criterio.test.js
```

## Notas de implementación

- Clase `ColaDeclaracionesCriterio extends ModuloHibridoReflejo`; `name =
  'cola-declaraciones-criterio'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._store` (Map `project_id` → `{ esquema:'contabilidad-cola-declaraciones-criterio-v1', declaraciones:{}, updated_at }`).
- Constantes: `ROLES_AUTORIZADOS` (Set `JEFE`, `ASESOR`), `CATALOGO_ABIERTO` (array
  de las **23** piezas `[ABIERTO]`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'cola-declaraciones-criterio.json', dir: '/contabilidad/cola-declaraciones-criterio',
  snapshot, hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload`
  → `flush()` + `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onDeclararRequest`/`onLeerRequest`/`onPendientesRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.criterio.<op>.response', fn)`; `onPendientesRequest`
  emite el bucle de `contabilidad.criterio_pendiente` (uno por pieza) dentro del
  handler, además de la response de `_atender`.
- Proyecciones puras: `_declarar` (escritura + guard JEFE/ASESOR), `_leer` y
  `_pendientes` (lecturas; no mutan). Helper `_obtenerOCrear(pid)`; `_invalid`/
  `_errorResponse` vienen de la base.
- Tools: `toolDeclarar` → `_declarar`, `toolLeer` → `_leer`, `toolPendientes` →
  `_pendientes`.
- DEP hacia delante: la consumen `clave-natural` (B7/M4 — la unidad de cierre),
  `inmovilizado` (F5), analítica (J6/J7), fiscal (D10/D11) y el resto, **por
  evento**. Es la **PUERTA DECLARATIVA** del dominio: ninguna otra pieza del
  inventario recoge criterios contables.
