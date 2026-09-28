---
name: cola-revision
description: >
  Skill FULL del módulo CUSTODIO `cola-revision` de la vertical contabilidad de Enki
  (A8.1, hoja del plan). DOS colas de excepciones por NATURALEZA: cola ASESOR
  (excepciones contables) y cola DUENO (excepciones del negocio). El flujo NUNCA se
  bloquea: lo dudoso espera en su cola y la operación continúa. Un solo escritor del
  encolado (ADMISION, una sola puerta; second-writer rechazado) y un escritor POR COLA
  en la resolución (la ASESOR la resuelve ASESOR; la DUENO, DUENO). Persiste por
  proyecto vía PosPersistencia. Úsala para operar, depurar o extender el custodio, o
  para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites encolar una excepción (RPC contabilidad.excepcion.encolar.request),
    resolverla (contabilidad.excepcion.resolver.request) o leer la cabeza de la cola
    (contabilidad.excepcion.siguiente.request).
  - Cuando depures por qué un encolado se rechaza (PERMISSION_DENIED si el rol no es
    ADMISION), por qué resolver da 403 (rol que no es dueño de la cola) o 404
    (excepción no pendiente), o por qué va a qué cola.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y el routing
    por naturaleza (CONTABLE/DOCUMENTO_DESCUADRADO/SIN_COBERTURA → ASESOR;
    NEGOCIO/DECISION_DUENO/FUENTE_FALTANTE → DUENO).
  - Cuando vayas a escribir/ampliar el test unitario del custodio cola-revision.
tags: [enki, modulo, custodio, persistencia, contabilidad, cola-revision, excepciones, admision]
---

# cola-revision — CUSTODIO de las dos colas de excepciones

## Qué hace el módulo

`cola-revision` es un **CUSTODIO CON PERSISTENCIA** (A8.1, hoja del plan): el dueño del
store de las **excepciones por naturaleza**, por proyecto. El principio rector del
dominio es que **el flujo NUNCA se bloquea**: lo dudoso no detiene la contabilidad —
espera en su cola y la operación sigue.

Hay **DOS colas por NATURALEZA** (decisión tomada): la **cola ASESOR** (excepciones
contables: `CONTABLE`, `DOCUMENTO_DESCUADRADO`, `SIN_COBERTURA`) y la **cola DUENO**
(excepciones del negocio: `NEGOCIO`, `DECISION_DUENO`, `FUENTE_FALTANTE`). **Lo no
declarado va al ASESOR** (contable). Es un ejemplo puro de que **la ley entra como DATO**:
el routing es una tabla declarada (`RUTA_NATURALEZA`), no constantes dispersas.

El modelo de escritores es de **una sola puerta + un dueño por cola**: el **encolado**
entra solo por **ADMISION** (guard de rol en `_encolar`, second-writer rechazado) y la
**resolución** la firma el **rol dueño de esa cola** (guard por cola en `_resolver`). La
lectura (`_siguiente`) es **proyección PURA**: mira la cabeza sin mutar.

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/cola-revision/*.json`),
restaura en `project.activated` y vuelca en `onUnload`. Emite `contabilidad.excepcion_encolada`
y `contabilidad.excepcion_resuelta` en éxito, y sus pares de fallo deterministas.

> **NO REUTILIZA**: no existe cola de revisión contable en el inventario. `manejo-fallo`
> (nichos) es fallo de CANAL, otro dominio (patrón tomado, no reutilizado).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.excepcion.encolar.request` | `onEncolarRequest` | RPC custodio: {project_id, rol:'ADMISION', excepcion:{naturaleza, motivo, hecho}} → {project_id, cola, excepcion}. Guard de escritor: solo ADMISION encola. Enruta por NATURALEZA a la cola ASESOR o DUENO. Publica contabilidad.excepcion_encolada y responde por contabilidad.excepcion.encolar.response; si el rol o el payload son invalidos → contabilidad.excepcion.encolar.failed. |
| `contabilidad.excepcion.resolver.request` | `onResolverRequest` | RPC custodio: {project_id, cola:'ASESOR'\|'DUENO', rol, excepcion_id, resolucion} → {project_id, cola, excepcion, resuelta_por}. Guard de escritor POR COLA (la cola ASESOR la resuelve ASESOR; la DUENO, DUENO; otro rol → 403). Publica contabilidad.excepcion_resuelta y responde por contabilidad.excepcion.resolver.response; si el rol/cola/id son invalidos → contabilidad.excepcion.resolver.failed. Lo consume desatasco-entrada (P3). |
| `contabilidad.excepcion.siguiente.request` | `onSiguienteRequest` | RPC custodio: {project_id, cola} → {project_id, cola, vacia, excepcion}. Proyeccion PURA: lee la cabeza de la cola sin mutar; VACIA si no hay pendientes. Si el payload es invalido → contabilidad.excepcion.siguiente.failed. Lo consume aviso-revision (A8.2). |
| `project.activated` | `onProjectActivated` | Restaura las DOS colas del proyecto activado desde el storage (PosPersistencia): las excepciones son POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.excepcion_encolada` | Fire-and-forget (A8.1): una excepcion quedo encolada en su cola por naturaleza → {project_id, cola, excepcion}. Lo consume aviso-revision (A8.2) para empujar el aviso e historial-proceso-contable (P2) para anotar el rastro. |
| `contabilidad.excepcion_resuelta` | Fire-and-forget (A8.1): una excepcion se resolvio en su cola → {project_id, cola, excepcion, resuelta_por}. Cierra el bucle de aprendizaje: desatasco-entrada (P3) produce la regla candidata; historial-proceso-contable (P2) anota el rastro. |
| `contabilidad.excepcion.encolar.failed` | Par de fallo determinista: encolar rechazado (rol != ADMISION) o payload invalido. Cierra el circulo de contabilidad.excepcion.encolar.request. |
| `contabilidad.excepcion.resolver.failed` | Par de fallo determinista: resolver con rol que no es dueno de la cola (403), cola desconocida o excepcion no pendiente (404). Cierra el circulo de contabilidad.excepcion.resolver.request. |
| `contabilidad.excepcion.siguiente.failed` | Par de fallo determinista: siguiente con cola desconocida o payload invalido. Cierra el circulo de contabilidad.excepcion.siguiente.request. |
| `contabilidad.excepcion_encolada.failed` | Par de fallo del evento de dominio contabilidad.excepcion_encolada: la emision del hecho de dominio no se completo. |
| `contabilidad.excepcion_resuelta.failed` | Par de fallo del evento de dominio contabilidad.excepcion_resuelta: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.excepcion.encolar.failed` cierra `encolar.request`;
> `contabilidad.excepcion.resolver.failed` cierra `resolver.request` (403/404);
> `contabilidad.excepcion.siguiente.failed` cierra `siguiente.request`.

> Nota: no está en module.json pero sí lo emite index.js en `onEncolarRequest`,
> `onResolverRequest` y `onSiguienteRequest` — el par de fallo se publica dentro del
> handler cuando `res.status !== 200`, además de la response de `_atender`.

## Reglas de negocio

1. **Un solo escritor del encolado (guard de rol)**: `_encolar` exige
   `rol === 'ADMISION'` (constante `ROL_ADMISION`). Cualquier otro →
   `403 PERMISSION_DENIED` `{ message:'solo ADMISION encola excepciones', details:{ rol_esperado:'ADMISION', rol_recibido:<rol> } }`.
   Second-writer rechazado.
2. **Routing por NATURALEZA → cola**: `_colaDe` mapea
   `CONTABLE|DOCUMENTO_DESCUADRADO|SIN_COBERTURA → ASESOR`,
   `NEGOCIO|DECISION_DUENO|FUENTE_FALTANTE → DUENO`; **lo no declarado → ASESOR**.
   Si la propia `naturaleza` es `ASESOR` o `DUENO`, se usa como cola directa.
3. **El flujo NUNCA se bloquea**: encolar una excepción **no** rechaza el hecho; lo
   aparca en su cola y la operación sigue. Es la razón de ser del módulo.
4. **Guard de escritor POR COLA en resolver**: `_resolver` exige `rol === cola`. La
   cola `ASESOR` solo la resuelve el rol `ASESOR`; la `DUENO`, el rol `DUENO`. Otro rol
   → `403 PERMISSION_DENIED` `{ message:'la cola <cola> solo la resuelve <cola>', details:{ cola, rol_esperado:<cola>, rol_recibido:<rol> } }`.
5. **Resolver una excepción no pendiente → 404**: si no hay entrada con ese
   `excepcion_id` en estado `PENDIENTE` en esa cola →
   `404 RESOURCE_NOT_FOUND` `{ message:'excepcion <id> no pendiente en la cola <cola>', details:{ cola, excepcion_id:<id> } }`.
   Resolver marca la entrada `RESUELTA` (guarda `resolucion`, `resuelta_por`,
   `resuelta_en`) y la copia a `resueltas`.
6. **Validaciones de payload deterministas**: falta `project_id` → `400 project_id`;
   `excepcion` ausente/no objeto → `400 excepcion`; `cola` desconocida → `400 cola`;
   falta `excepcion_id` → `400 excepcion_id`; `resolucion` ausente/no objeto → `400 resolucion`.
7. **`siguiente` es proyección PURA**: lee la primera entrada `PENDIENTE` sin mutar;
   si no hay pendientes → `200 {vacia:true, excepcion:null}`.
8. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol no dueño de la cola →
   `403`; excepción no pendiente → `404`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.excepcion.encolar.response`,
`contabilidad.excepcion.resolver.response` y `contabilidad.excepcion.siguiente.response`.

### 1. `encolar` — encolar una excepción (solo ADMISION)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ADMISION",
  "excepcion": {
    "naturaleza": "SIN_COBERTURA",
    "motivo": "compra sin regla de contrapartida",
    "hecho": { "id": "C-77", "proveedor": "DESCONOCIDO" }
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (routing por naturaleza → ASESOR):
```json
{
  "project_id": "e57a318a-...",
  "cola": "ASESOR",
  "excepcion": {
    "id": "e57a318a-...-ASESOR-x1",
    "naturaleza": "SIN_COBERTURA",
    "motivo": "compra sin regla de contrapartida",
    "hecho": { "id": "C-77", "proveedor": "DESCONOCIDO" },
    "estado": "PENDIENTE",
    "encolada_en": "2026-09-28T..."
  }
}
```
Emite `contabilidad.excepcion_encolada` (res.data + correlation_id).

### 2. `siguiente` — leer la cabeza de la cola (no muta)

```json
{ "project_id": "e57a318a-...", "cola": "ASESOR" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "cola": "ASESOR", "vacia": false, "excepcion": { "id": "e57a318a-...-ASESOR-x1", "estado": "PENDIENTE", "...": "..." } }
```

### 3. `resolver` — resolver una excepción (solo el rol dueño de la cola)

```json
{
  "project_id": "e57a318a-...",
  "cola": "ASESOR",
  "rol": "ASESOR",
  "excepcion_id": "e57a318a-...-ASESOR-x1",
  "resolucion": { "contrapartida": { "cuenta_debe": "600", "cuenta_haber": "400" } },
  "correlation_id": "abc-124"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "cola": "ASESOR",
  "excepcion_id": "e57a318a-...-ASESOR-x1",
  "excepcion": { "id": "e57a318a-...-ASESOR-x1", "estado": "RESUELTA", "resolucion": { "...": "..." }, "resuelta_por": "ASESOR", "resuelta_en": "2026-09-28T..." },
  "resuelta_por": "ASESOR"
}
```
Emite `contabilidad.excepcion_resuelta` (res.data + correlation_id).

### Fallo — rol que no es dueño de la cola

```json
{ "project_id": "e57a318a-...", "cola": "DUENO", "rol": "ASESOR", "excepcion_id": "x1", "resolucion": {} }
```
Respuesta `403` + `contabilidad.excepcion.resolver.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "la cola DUENO solo la resuelve DUENO", "details": { "cola": "DUENO", "rol_esperado": "DUENO", "rol_recibido": "ASESOR" } } }
```

## Tests

El test vive en `tests/unit/cola-revision.test.js`. Cubre:

- `encolar` con rol `ADMISION` y naturaleza `SIN_COBERTURA` → `200`, va a la cola
  ASESOR y emite `contabilidad.excepcion_encolada`; `NEGOCIO` → va a la DUENO.
- `encolar` con rol distinto → `403 PERMISSION_DENIED` + `contabilidad.excepcion.encolar.failed`.
- `siguiente` → `200` con cabeza `PENDIENTE` o `{vacia:true}`; sin filtra mutación.
- `resolver` por el rol dueño → `200`, marca `RESUELTA` y emite `contabilidad.excepcion_resuelta`.
- `resolver` por rol ajeno → `403`; excepción no pendiente → `404`.
- `project.activated` restaura las dos colas vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/cola-revision
node --test tests/unit/cola-revision.test.js
```

## Notas de implementación

- Clase `ColaRevision extends ModuloHibridoReflejo`; `name = 'cola-revision'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._store` (Map project_id →
  `{ esquema:'contabilidad-cola-revision-v1', colas:{ ASESOR:[], DUENO:[] }, resueltas:[] }`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'cola-revision.json', dir: '/contabilidad/cola-revision', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
  Cada mutación marca `marcarDirty(pid)`.
- `onEncolarRequest`/`onResolverRequest`/`onSiguienteRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.excepcion.<op>.response', fn)`; emiten el evento de
  dominio o el par determinista dentro de la proyección, propagando `correlation_id`.
- Proyecciones puras: `_encolar` (escritura + guard + routing), `_siguiente` (lectura de
  cabeza, no muta), `_resolver` (escritura + guard por cola). Helper `_obtenerOCrear(pid)`
  y `_colaDe(excepcion)`. `_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolEncolar` → `_encolar`, `toolResolver` → `_resolver`, `toolSiguiente` → `_siguiente`.
- DEP hacia delante: lo consumen `desatasco-entrada` (P3) y `aviso-revision` (A8.2);
  el rastro lo anota `historial-proceso-contable` (P2).
