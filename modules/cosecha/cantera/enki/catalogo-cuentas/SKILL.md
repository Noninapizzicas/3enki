---
name: catalogo-cuentas
description: >
  Skill FULL del módulo CUSTODIO `catalogo-cuentas` de la vertical contabilidad de
  Enki. Parcela del PLAN CONTABLE declarable/importable del asesor: el conjunto de
  Cuentas contra el que se resuelve la contrapartida y se valida el libro, con UN
  SOLO ESCRITOR (PUERTO_PLAN_CONTABLE) y sin sobrescritura; persiste por proyecto
  con PosPersistencia. Úsala para operar, depurar o extender el custodio, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites anadir o consultar cuentas del plan contable de un proyecto
    (RPC catalogo-cuentas.anadir.request / catalogo-cuentas.buscar.request).
  - Cuando depures por qué un asiento se rechaza (403 PERMISSION_DENIED si el rol no
    es PUERTO_PLAN_CONTABLE, 409 ALREADY_EXISTS si el codigo ya existe, 400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio (un solo escritor, no se sobrescribe, persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio catalogo-cuentas.
tags: [enki, modulo, custodio, contabilidad, catalogo-cuentas]
---

# catalogo-cuentas — CUSTODIO CON PERSISTENCIA del plan contable

## Qué hace el módulo

`catalogo-cuentas` es un **CUSTODIO CON PERSISTENCIA** (B1, hoja del plan): la parcela
del **PLAN CONTABLE declarable/importable del asesor** — el conjunto de **Cuentas**
contra el que se resuelve la contrapartida y se valida el libro. **UN SOLO ESCRITOR**:
el camino de import del plan (`PUERTO_PLAN_CONTABLE`, B6) asienta con su rol; cualquier
otro rol es rechazado (segundo escritor → `403`).

**No se sobrescribe**: anadir un codigo ya presente se rechaza (`409`); el catalogo no
se reescribe en silencio. La ley entra como **DATO**: no se cablea ninguna codificacion
ni jerarquia legal. Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/catalogo-cuentas/catalogo-cuentas.json`), restaura en `project.activated`
y vuelca en `onUnload`. Sin fire-and-forget de dominio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `catalogo-cuentas.anadir.request` | `onAnadirRequest` | RPC custodio: {project_id, rol:'PUERTO_PLAN_CONTABLE', cuenta:{codigo, nombre?, tipo?, naturaleza?, padre?}} → {project_id, cuenta, anadida}. Guard Rol=PUERTO_PLAN_CONTABLE (segundo escritor → 403). Codigo ya presente → 409 (no se sobrescribe). Campos ausentes quedan null. Responde por catalogo-cuentas.anadir.response; fallo → catalogo-cuentas.anadir.failed. |
| `catalogo-cuentas.buscar.request` | `onBuscarRequest` | RPC custodio (lectura, no muta): {project_id, codigo?} → {project_id, total, cuentas} si no hay codigo, o {codigo, encontrada, cuenta} si lo hay (sin match → cuenta null). Responde por catalogo-cuentas.buscar.response; fallo → catalogo-cuentas.buscar.failed. |
| `project.activated` | `onProjectActivated` | Restaura el plan contable del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `catalogo-cuentas.anadir.response` | Respuesta RPC correlada de catalogo-cuentas.anadir.request → {request_id, status:200, data:{project_id, cuenta, anadida}}. Emitida por el helper _atender. |
| `catalogo-cuentas.anadir.failed` | Par de fallo determinista (B1): rol != PUERTO_PLAN_CONTABLE (segundo escritor), cuenta sin codigo o codigo ya existente → {status, error:{code, message, details?}}. Cierra el circulo de catalogo-cuentas.anadir.request. |
| `catalogo-cuentas.buscar.response` | Respuesta RPC correlada de catalogo-cuentas.buscar.request → {request_id, status:200, data:{project_id, total, cuentas} \| {codigo, encontrada, cuenta}}. Emitida por el helper _atender. |
| `catalogo-cuentas.buscar.failed` | Par de fallo determinista (B1): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de catalogo-cuentas.buscar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `catalogo-cuentas.anadir.failed` cierra `anadir.request` y
> `catalogo-cuentas.buscar.failed` cierra `buscar.request`, cada uno cuando su
> proyeccion devuelve status ≠ 200.

> Nota: el módulo expone además `planDe(pid)` como **lectura directa** para otras hojas
> del mismo proceso (no muta) — no es un evento del bus, no figura en module.json.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_anadir` exige `input.rol === 'PUERTO_PLAN_CONTABLE'`
   (constante `ROL_ESCRITOR`). Cualquier otro rol → `403 PERMISSION_DENIED` con
   `{rol_esperado:'PUERTO_PLAN_CONTABLE', rol_recibido:<rol>}`. Second-writer rechazado.
2. **No se sobrescribe**: si `cat.cuentas.has(codigo)` → `409 ALREADY_EXISTS` con
   `{codigo}`. El plan no se reescribe en silencio.
3. **La ley entra como DATO**: no se cablea ninguna codificacion ni jerarquia legal.
4. **Dato ausente = desconocido (cero estimacion)**: `nombre`, `tipo`, `naturaleza` y
   `padre` ausentes quedan `null`; no se completan.
5. **Cuenta con metadatos**: cada asiento guarda `codigo`, `nombre`, `tipo`,
   `naturaleza`, `padre` y sella `anadida_en` (`new Date().toISOString()`); la cabecera
   actualiza `updated_at`.
6. **Clave del store**: `Map<codigo, Cuenta>` por proyecto; el codigo se normaliza con
   `String(codigo).trim()`.
7. **La lectura no muta**: `_buscar` obtiene o crea el catalogo (`_obtenerOCrear`) y
   devuelve el conjunto sin tocar asientos; sin `codigo` → `{total, cuentas:[...]}`; con
   `codigo` sin match → `cuenta:null` (no se inventa).
8. **Validaciones deterministas**: `project_id` ausente → `400 INVALID_INPUT`
   (`field:'project_id'`); `cuenta` ausente/no objeto → `400 INVALID_INPUT`
   (`field:'cuenta'`); `cuenta.codigo` vacio → `400 INVALID_INPUT` (`field:'cuenta.codigo'`).
9. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
   restaura en `project.activated`; `flush()` + `detener()` en `onUnload`.
10. **HTTP exacto**: éxito `200`; rol inválido → `403`; codigo existente → `409`;
    campos inválidos → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `catalogo-cuentas.anadir.response` y `catalogo-cuentas.buscar.response`.

### 1. `anadir` — asentar una cuenta (solo PUERTO_PLAN_CONTABLE)

```json
{
  "project_id": "e57a318a-...",
  "rol": "PUERTO_PLAN_CONTABLE",
  "cuenta": { "codigo": "430", "nombre": "Clientes", "naturaleza": "deudora" },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "cuenta": { "codigo": "430", "nombre": "Clientes", "tipo": null, "naturaleza": "deudora", "padre": null, "anadida_en": "2026-09-25T..." },
  "anadida": true
}
```

### 2. `buscar` — leer el plan (no muta)

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "total": 1, "cuentas": [ { "codigo": "430", "nombre": "Clientes", "...": "..." } ] }
```
Con codigo:
```json
{ "project_id": "e57a318a-...", "codigo": "430", "encontrada": true, "cuenta": { "codigo": "430", "...": "..." } }
```

### 3. Fallo — rol inválido (segundo escritor)

```json
{ "project_id": "e57a318a-...", "rol": "OTRO", "cuenta": { "codigo": "431" } }
```
Respuesta `403` + `catalogo-cuentas.anadir.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el escritor del plan (PUERTO_PLAN_CONTABLE) puede anadir cuentas", "details": { "rol_esperado": "PUERTO_PLAN_CONTABLE", "rol_recibido": "OTRO" } } }
```

### 4. Fallo — codigo ya existente

```json
{ "project_id": "e57a318a-...", "rol": "PUERTO_PLAN_CONTABLE", "cuenta": { "codigo": "430" } }
```
Respuesta `409` + `catalogo-cuentas.anadir.failed`:
```json
{ "status": 409, "error": { "code": "ALREADY_EXISTS", "message": "la cuenta ya existe en el plan; el catalogo no se sobrescribe", "details": { "codigo": "430" } } }
```

## Tests

El test vive en `tests/unit/catalogo-cuentas.test.js`. Cubre:

- `anadir` con rol `PUERTO_PLAN_CONTABLE` → `200 {anadida:true}` con metadatos y
  `anadida_en`.
- `anadir` con otro rol → `403 PERMISSION_DENIED` + `catalogo-cuentas.anadir.failed`.
- `anadir` con codigo repetido → `409 ALREADY_EXISTS` (no sobrescribe).
- `anadir` sin `cuenta.codigo` → `400 INVALID_INPUT`.
- `buscar` sin codigo → `200 {total, cuentas}`; con codigo sin match → `encontrada:false, cuenta:null`.
- `buscar` sin `project_id` → `400 INVALID_INPUT` + `catalogo-cuentas.buscar.failed`.
- `project.activated` restaura el plan via PosPersistencia; `planDe(pid)` lee sin mutar.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CatalogoCuentas extends ModuloHibridoReflejo`; `name = 'catalogo-cuentas'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._catalogos`
  (`Map<project_id, {esquema, cuentas: Map<codigo, Cuenta>}>`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'catalogo-cuentas.json', dir: '/contabilidad/catalogo-cuentas', snapshot, hidratar })`
  sobre `../../_shared/pos-persistencia` (DOS niveles). `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada escritura marca
  `marcarDirty(pid)`.
- `onAnadirRequest` delega en `_atender(e, 'anadir', 'catalogo-cuentas.anadir.response',
  d => this._anadir(d))`; `onBuscarRequest` en `_atender(e, 'buscar',
  'catalogo-cuentas.buscar.response', d => this._buscar(d))`.
- Proyecciones `_anadir` (escritura + guard) y `_buscar` (lectura, no muta); helper
  `_obtenerOCrear(pid)`. Lectura directa `planDe(pid)` para otras hojas.
  Tools `toolAnadir` / `toolBuscar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimenta el camino de import `puerto-plan-contable` (B6); sirve de base a la
  contrapartida y a la validacion del libro.
