---
name: expediente-documental
description: >
  Skill FULL del módulo CUSTODIO `expediente-documental` de la vertical contabilidad
  de Enki (L7, hoja del plan). Cada CIFRA con el DOCUMENTO ORIGEN archivado y
  ENLAZADO: LA PRUEBA que sostiene la firma ante una inspección. L2 explica; el
  expediente CONSERVA. Un solo escritor (la ADMISIÓN archiva la prueba; second-writer
  rechazado con PERMISSION_DENIED). El almacén físico del documento lo pone
  `filesystem` por EVENTO (fs.write.request → fs.write.response), NUNCA por require
  cruzado: `filesystem` es el almacén, el expediente es el ENLACE cifra↔prueba.
  APPEND-ONLY (invariante 9, registros inmutables): el enlace se apila; nunca se
  reescribe ni se borra. Persiste por proyecto vía PosPersistencia. Úsala para operar,
  depurar o extender el custodio.
when-to-use: >
  - Cuando necesites archivar la prueba de una cifra (RPC
    contabilidad.expediente.archivar.request) o recuperarla
    (contabilidad.expediente.recuperar.request).
  - Cuando depures por qué archivar se rechaza (403 PERMISSION_DENIED si el rol no es
    ADMISION, 400 INVALID_INPUT si falta id_cifra/id_documento) o por qué recuperar da
    404 (ERROR_CIFRA_SIN_PRUEBA) o `_verificarEnlace` da 409.
  - Cuando quieras entender el contrato de eventos, el append-only del enlace y por qué
    el almacén va por filesystem (evento).
  - Cuando vayas a escribir/ampliar el test unitario del custodio expediente-documental.
tags: [enki, modulo, custodio, persistencia, contabilidad, expediente-documental, prueba, append-only]
---

# expediente-documental — CUSTODIO del enlace cifra ↔ documento origen

## Qué hace el módulo

`expediente-documental` es un **CUSTODIO CON PERSISTENCIA** (L7, hoja del plan): el
dueño del **enlace cifra ↔ documento de origen**, por proyecto. Su misión es que **cada
CIFRA** tenga **el DOCUMENTO ORIGEN archivado y enlazado**: **LA PRUEBA que sostiene la
firma ante una inspección**. La división del dominio es clara: **L2 explica; el
expediente CONSERVA**.

Hay **un solo escritor del enlace** (guard en `_archivar`): el rol debe ser **`ADMISION`**
(constante `ROL_ARCHIVO`); second-writer rechazado con `PERMISSION_DENIED`. El **almacén
físico** del documento lo pone **`filesystem` por EVENTO** (`fs.write.request` →
`fs.write.response`), **nunca por `require` cruzado**: **`filesystem` es el almacén, el
expediente es el ENLACE**.

Es **APPEND-ONLY** (invariante 9, registros inmutables): el enlace se **apila**
(`d.archivos.push(...)`); **nunca se reescribe ni se borra**. Persiste por proyecto con
**PosPersistencia** (storage `/contabilidad/expediente-documental/*.json`), restaura en
`project.activated` y vuelca en `onUnload`.

> **NO REUTILIZA**: el enlace cifra↔documento de origen es propio de la vertical;
> `filesystem` es el almacén, **no** el expediente.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.expediente.archivar.request` | `onArchivarRequest` | RPC custodio: {project_id, rol:'ADMISION', id_cifra, id_documento, referencia?} → {project_id, id_cifra, id_documento, prueba_enlazada, almacenado, total}. Guard de escritor: solo ADMISION (second-writer rechazado). Enlaza la PRUEBA (append-only) y materializa el documento en el almacen via EVENTO fs.write.request (filesystem, sin require cruzado). Publica contabilidad.cifra_archivada y responde por contabilidad.expediente.archivar.response; si el rol o el payload son invalidos → contabilidad.expediente.archivar.failed. |
| `contabilidad.expediente.recuperar.request` | `onRecuperarRequest` | RPC custodio: {project_id, id_cifra} → {project_id, id_cifra, id_documento, enlace}. Proyeccion PURA de lectura (no muta). 404 si la cifra no tiene prueba archivada → contabilidad.expediente.recuperar.failed. Lo consume el asesor ante una inspeccion o una revision (L3/L8). |
| `project.activated` | `onProjectActivated` | Restaura el expediente del proyecto activado desde el storage (PosPersistencia): el expediente es POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.cifra_archivada` | Fire-and-forget (L7): una cifra quedo con su documento origen archivado y enlazado → {project_id, id_cifra, id_documento, prueba_enlazada, almacenado, total}. Es la prueba que sostiene la firma (L3) ante una inspeccion; lo anota el rastro de historial-proceso-contable (P2). |
| `contabilidad.expediente.archivar.failed` | Par de fallo determinista: archivar rechazado (rol != ADMISION) o payload invalido (sin id_cifra / sin id_documento). Cierra el circulo de contabilidad.expediente.archivar.request. |
| `contabilidad.expediente.recuperar.failed` | Par de fallo determinista: recuperar una cifra sin prueba archivada (404, ERROR_CIFRA_SIN_PRUEBA) o payload invalido. Cierra el circulo de contabilidad.expediente.recuperar.request. |
| `contabilidad.cifra_archivada.failed` | Par de fallo del evento de dominio contabilidad.cifra_archivada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.expediente.archivar.failed` cierra `contabilidad.expediente.archivar.request`;
> `contabilidad.expediente.recuperar.failed` cierra `contabilidad.expediente.recuperar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.expediente.archivar.response` y `contabilidad.expediente.recuperar.response`
> (los pares response de los RPC); no están declaradas en `publishes`. Además
> `onArchivarRequest` realiza un **RPC saliente** `fs.write.request` vía `this._rpc(...)`
> (con `atomic:true`) hacia `filesystem` para materializar el documento en el almacén:
> es una dependencia por EVENTO con `filesystem`, no declarada en este `module.json`.

## Reglas de negocio

1. **Un solo escritor de la prueba (guard de rol)**: `_archivar` exige
   `rol === 'ADMISION'` (constante `ROL_ARCHIVO`). Cualquier otro → **`403
   PERMISSION_DENIED`** con `{ message:'solo ADMISION archiva la prueba de la cifra',
   details:{ rol_esperado:'ADMISION', rol_recibido:<rol> } }`. Second-writer rechazado.
2. **APPEND-ONLY (registros inmutables)**: el enlace se guarda en `d.expediente[idCifra]`
   y **además** se **apila** en `d.archivos` (`push`). **El enlace nunca se reescribe ni
   se borra** (invariante 9); `total` = tamaño del registro apilado.
3. **El almacén va por EVENTO (no require)**: si el payload trae `id_cifra` (no `cifra`),
   `_archivar` marca `archivar_almacen:true` y `onArchivarRequest` hace
   `fs.write.request` con `path:'/contabilidad/expediente/<id_cifra>.json'`,
   `content: JSON.stringify({id_cifra, documento_origen, referencia})`, `encoding:'utf-8'`,
   `atomic:true`. `almacenado = !!(escrito && escrito.status === 200)`. **`filesystem`
   es el almacén; el expediente es el enlace.**
4. **Recuperar es proyección PURA (no muta)**: `_recuperar` devuelve el `enlace` de la
   cifra; si no existe → **`404 RESOURCE_NOT_FOUND`** con
   `{ id_cifra, simbolico:'ERROR_CIFRA_SIN_PRUEBA' }` (constante `CODE_SIN_PRUEBA`).
5. **Verificar el enlace**: `_verificarEnlace` comprueba que las cifras exigidas (o
   todas las del expediente) tienen documento. Si hay alguna sin prueba → **`409
   ERROR_CIFRA_SIN_PRUEBA`** con `{ sin_prueba:[...], simbolico:'ERROR_CIFRA_SIN_PRUEBA' }`;
   si todas tienen → `200 { verificado:true, cifras:<n> }`.
6. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   sin `id_cifra` (ni `cifra`) o no string → `400 INVALID_INPUT id_cifra`; sin
   `id_documento` → `400 INVALID_INPUT id_documento`. Shape: `{ status:400, error:{
   code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
7. **El enlace guarda metadatos**: `id_cifra`, `id_documento`, `referencia`,
   `tipo_documento`, `archivado_por` (`ADMISION`), `archivado_en` (ISO).
8. **El sistema NO firma ni decide**: el expediente **conserva la prueba** que sostiene
   la firma de otro; él mismo no firma nada.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol no ADMISION → `403`;
   cifra sin prueba → `404`; cifras sin documento al verificar → `409`; excepción en
   `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.expediente.archivar.response` y
`contabilidad.expediente.recuperar.response`.

### 1. `archivar` — archivar la prueba de una cifra (solo ADMISION)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ADMISION",
  "id_cifra": "asiento-2026-000123",
  "id_documento": "factura-ACME-2026-045",
  "referencia": "compra material oficina",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (con el almacén confirmado):
```json
{
  "project_id": "e57a318a-...",
  "id_cifra": "asiento-2026-000123",
  "id_documento": "factura-ACME-2026-045",
  "referencia": "compra material oficina",
  "archivar_almacen": true,
  "prueba_enlazada": true,
  "total": 1,
  "almacenado": true
}
```
Emite `contabilidad.cifra_archivada` (res.data + `correlation_id`).

### 2. `recuperar` — recuperar el documento de una cifra (proyección pura)

```json
{ "project_id": "e57a318a-...", "id_cifra": "asiento-2026-000123" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "id_cifra": "asiento-2026-000123", "id_documento": "factura-ACME-2026-045", "enlace": { "id_cifra": "asiento-2026-000123", "id_documento": "factura-ACME-2026-045", "referencia": "compra material oficina", "tipo_documento": null, "archivado_por": "ADMISION", "archivado_en": "2026-09-28T..." } }
```
Si no existe → `404` + `contabilidad.expediente.recuperar.failed`:
```json
{ "status": 404, "error": { "code": "RESOURCE_NOT_FOUND", "message": "la cifra asiento-2026-000124 no tiene documento archivado", "details": { "id_cifra": "asiento-2026-000124", "simbolico": "ERROR_CIFRA_SIN_PRUEBA" } } }
```

### 3. Fallo — rol inválido

`rol` distinto de `ADMISION` → `403 PERMISSION_DENIED` con
`{ message:'solo ADMISION archiva la prueba de la cifra', details:{ rol_esperado:'ADMISION',
rol_recibido:<rol> } }` + `contabilidad.expediente.archivar.failed`.

### 4. Tools (sin RPC en module.json)

`toolArchivar` → `_archivar`; `toolRecuperar` → `_recuperar`; `toolVerificarEnlace` →
`_verificarEnlace` (`409 ERROR_CIFRA_SIN_PRUEBA` si hay cifras sin documento).

## Tests

El test vive en `tests/unit/expediente-documental.test.js`. Cubre:

- `archivar` con rol `ADMISION` → `200 {prueba_enlazada:true}`, emite
  `contabilidad.cifra_archivada`; el enlace se apila (`total` crece) — **append-only**.
- `archivar` con rol distinto → `403 PERMISSION_DENIED` + par de fallo.
- `archivar` sin `id_cifra`/`id_documento` → `400 INVALID_INPUT`.
- `recuperar` con la cifra archivada → `200 {enlace}`; sin archivar → `404` +
  `{simbolico:'ERROR_CIFRA_SIN_PRUEBA'}`.
- `_verificarEnlace` con cifras sin documento → `409 ERROR_CIFRA_SIN_PRUEBA`; con todas
  archivadas → `200 {verificado:true}`.
- El almacén se materializa vía `fs.write.request` (mock del bus): `almacenado:true`
  cuando el bus responde `200`.
- `project.activated` restaura el expediente vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/expediente-documental
node --test tests/unit/expediente-documental.test.js
```

## Notas de implementación

- Clase `ExpedienteDocumental extends ModuloHibridoReflejo`; `name =
  'expediente-documental'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._store` (Map project_id → `{ esquema:'contabilidad-expediente-documental-v1',
  expediente:{}, archivos:[] }`).
- Constantes `ROL_ARCHIVO = 'ADMISION'` y `CODE_SIN_PRUEBA = 'ERROR_CIFRA_SIN_PRUEBA'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'expediente-documental.json', dir: '/contabilidad/expediente-documental', snapshot,
  hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onArchivarRequest` delega en `_atender(e, 'archivar',
  'contabilidad.expediente.archivar.response', fn)`; dentro, si `archivar_almacen`, hace
  `fs.write.request` vía `_rpc` y setea `almacenado` antes de publicar el dominio.
  `onRecuperarRequest` delega en `_atender(e, 'recuperar', ...)`.
- Proyecciones puras: `_archivar` (escritura + guard + append), `_recuperar` (lectura),
  `_verificarEnlace` (lectura). Helper `_obtenerOCrear(pid)`. `_invalid`/`_errorResponse`
  y `_rpc` de la base.
- Tools: `toolArchivar`, `toolRecuperar`, `toolVerificarEnlace`.
- DEP hacia delante: la prueba sostiene la firma (L3) y la anota el rastro de
  `historial-proceso-contable` (P2); la consume el asesor ante inspección/revisión
  (L3/L8). DEP hacia atrás por evento: `filesystem` (`fs.write.request`).
