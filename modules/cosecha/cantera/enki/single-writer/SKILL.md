---
name: single-writer
description: >
  Skill FULL del módulo CUSTODIO `single-writer` de la vertical contabilidad de
  Enki. El cerrojo de escritura por parcela — un solo escritor; el segundo recibe
  rechazo en el acto (no espera, no hace cola) y es el guard que los demás
  custodios consultan. Persiste por proyecto con PosPersistencia. Úsala para
  operar, depurar o extender el custodio, o para entender su contrato de eventos y
  sus reglas de negocio.
when-to-use: >
  - Cuando necesites reclamar el turno de una parcela
    (RPC single-writer.reclamar.request) o consultar si un id es su escritor
    (RPC single-writer.es_escritor.request).
  - Cuando depures por qué un turno no se concede (409 si la parcela ya tiene
    dueño, 403 PERMISSION_DENIED si el rol no es RECLAMANTE_ESCRITOR, 400
    INVALID_INPUT si falta project_id/parcela/id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio (nunca dos dueños, idempotencia, guard de escritor,
    persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio single-writer.
tags: [enki, modulo, custodio, contabilidad, single-writer]
---

# single-writer — CUSTODIO CON PERSISTENCIA del cerrojo de escritura

## Qué hace el módulo

`single-writer` es un **CUSTODIO CON PERSISTENCIA** (M2, hoja del plan): **LA LEY**
que gobierna cada custodio de contabilidad — **UN SOLO ESCRITOR POR PARCELA**. El
segundo escritor es **CORRUPCIÓN** — **no espera, no hace cola**: se le **RECHAZA**
en el acto. Es el guard que los demás custodios consultan (`es_escritor`) y al que
piden el turno (`reclamar`) antes de escribir.

**Invariante 4 — un solo escritor por parcela**: el dueño de una parcela se reclama
**UNA vez** y no se cede en silencio. `reclamar` sobre una parcela ya ajena **NO**
despoja al dueño: declara `concedido:false` y quién era el dueño. **Jamás dos dueños
a la vez**. `es_escritor` es lectura determinista (no muta). Reclamar la misma
parcela por el mismo id es idempotente (`concedido:true`, `ya_era:true`).

**UN SOLO ESCRITOR del REGISTRO** de parcelas: quien reclama con el rol del camino
(`RECLAMANTE_ESCRITOR`); cualquier otro rol es rechazado (`403`).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/single-writer/single-writer.json`), restaura en `project.activated` y
vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `single-writer.reclamar.request` | `onReclamarRequest` | RPC custodio (escritura, UN escritor del registro): {project_id, rol:'RECLAMANTE_ESCRITOR', parcela, id} → {concedido:true, dueno, reclamado_en, ya_era} o {concedido:false, dueno, solicitante, motivo} (parcela ocupada → 409; no se despoja al dueno, el segundo escritor es corrupcion). Guard Rol=RECLAMANTE_ESCRITOR (403). Misma parcela+mismo id → idempotente. Exito → publica contabilidad.escritor_reclamado y responde por single-writer.reclamar.response; fallo → single-writer.reclamar.failed. |
| `single-writer.es_escritor.request` | `onEsEscritorRequest` | RPC custodio (lectura, NO muta): {project_id, parcela, id} → {parcela, id, es_escritor, dueno}. El guard que consultan los demas custodios antes de escribir. Responde por single-writer.es_escritor.response; fallo → single-writer.es_escritor.failed. |
| `project.activated` | `onProjectActivated` | Restaura el registro de duenos de parcela del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `single-writer.reclamar.response` | Respuesta RPC correlada de single-writer.reclamar.request → {request_id, status, data:{concedido, dueno, reclamado_en, ya_era} \| {concedido:false, dueno, solicitante, motivo}}. Emitida por el helper _atender. |
| `single-writer.reclamar.failed` | Par de fallo determinista (M2): rol != RECLAMANTE_ESCRITOR (403), project_id/parcela/id ausente (400) → {status, error:{code, message, details?}}. Cierra el circulo de single-writer.reclamar.request. |
| `single-writer.es_escritor.response` | Respuesta RPC correlada de single-writer.es_escritor.request → {request_id, status:200, data:{parcela, id, es_escritor, dueno}}. Emitida por el helper _atender. |
| `single-writer.es_escritor.failed` | Par de fallo determinista (M2): project_id/parcela/id ausente → {status, error:{code, message, details?}}. Cierra el circulo de single-writer.es_escritor.request. |
| `contabilidad.escritor_reclamado` | Fire-and-forget (M2): un escritor reclamo el turno de una parcela → {project_id, parcela, dueno, concedido, correlation_id}. Lo LEEN los custodios que compiten por el turno del diario (escritor-diario B2) y el resto de custodios del libro. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `single-writer.reclamar.failed` cierra `reclamar.request` y
> `single-writer.es_escritor.failed` cierra `es_escritor.request`, cada uno cuando su
> proyección devuelve status ≠ 200.

> Nota de honestidad (cruce con `index.js`): `onReclamarRequest` publica
> `contabilidad.escritor_reclamado` **solo si `status === 200 && concedido`**, y
> publica `single-writer.reclamar.failed` en **toda** la rama else — lo que incluye
> el caso **`409` de parcela ocupada** (`{concedido:false, dueno, solicitante,
> motivo}`). Es decir, un rechazo por segundo escritor **sí** emite el par
> `reclamar.failed`, además de responder `409`.

> Nota: el módulo expone `duenoDe(pid, parcela)` como **lectura directa** para otras
> hojas del mismo proceso (no muta) — no es un evento del bus, no figura en
> `module.json`.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_reclamar` exige
   `input.rol === 'RECLAMANTE_ESCRITOR'` (constante `ROL_ESCRITOR`). Cualquier otro
   rol → `403 PERMISSION_DENIED` con
   `{rol_esperado:'RECLAMANTE_ESCRITOR', rol_recibido:<rol>}`. `_es_escritor` no pasa
   por el guard (es lectura).
2. **Nunca dos dueños**: si la parcela ya tiene dueño con **otro** `id` →
   `409 {concedido:false, dueno:<dueño>, solicitante:<id>, motivo:'la parcela ya
   tiene escritor; un segundo escritor es corrupcion'}`. No se despoja al dueño.
3. **Idempotencia**: misma parcela + **mismo** `id` → `200 {concedido:true,
   ya_era:true, dueno:<id>, reclamado_en:<fecha original>}` (no re-sella la fecha).
4. **Reclamar no espera**: el segundo escritor recibe rechazo en el acto; no hay
   cola ni bloqueo. El cerrojo es la única ley.
5. **`es_escritor` determinista**: devuelve
   `{parcela, id, es_escritor:<id === dueño>, dueno:<dueño|null>}` sin tocar los
   dueños (usa `_obtenerOCrear`, que solo crea la cabecera si el proyecto aún no
   existe).
6. **Clave del store**: `Map<parcela, {id, reclamado_en}>` por proyecto; `parcela` e
   `id` se normalizan con `String(...).trim()`.
7. **`project_id` con fallback**: `input.project_id || this.project_id`.
8. **Validaciones deterministas**: `project_id` ausente → `400 INVALID_INPUT`
   (`field:'project_id'`); `parcela` vacía → `400 INVALID_INPUT` (`field:'parcela'`);
   `id` vacío → `400 INVALID_INPUT` (`field:'id'`).
9. **Sellos de tiempo**: la concesión sella `reclamado_en` con
   `new Date().toISOString()` y actualiza `updated_at` de la cabecera.
10. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    restaura en `project.activated`; `flush()` + `detener()` en `onUnload`.
11. **HTTP exacto**: éxito `200`; rol inválido → `403`; parcela ocupada → `409`;
    campos inválidos → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `single-writer.reclamar.response` y `single-writer.es_escritor.response`.

### 1. `reclamar` — pedir el turno de una parcela (solo RECLAMANTE_ESCRITOR)

```json
{
  "project_id": "e57a318a-...",
  "rol": "RECLAMANTE_ESCRITOR",
  "parcela": "libro/diario",
  "id": "escritor-a",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "parcela": "libro/diario", "concedido": true, "ya_era": false, "dueno": "escritor-a", "reclamado_en": "2026-09-25T..." }
```
Emite `contabilidad.escritor_reclamado`:
```json
{ "project_id": "e57a318a-...", "parcela": "libro/diario", "dueno": "escritor-a", "concedido": true, "ya_era": false, "correlation_id": "abc-123" }
```

### 2. `reclamar` idempotente (misma parcela, mismo id)

```json
{ "project_id": "e57a318a-...", "rol": "RECLAMANTE_ESCRITOR", "parcela": "libro/diario", "id": "escritor-a" }
```
Respuesta `200` con `concedido:true`, `ya_era:true`.

### 3. `es_escritor` — consultar el guard (no muta)

```json
{ "project_id": "e57a318a-...", "parcela": "libro/diario", "id": "escritor-b" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "parcela": "libro/diario", "id": "escritor-b", "es_escritor": false, "dueno": "escritor-a" }
```

### 4. Fallo — parcela ocupada (segundo escritor)

```json
{ "project_id": "e57a318a-...", "rol": "RECLAMANTE_ESCRITOR", "parcela": "libro/diario", "id": "escritor-b" }
```
Respuesta `409` (data) + `single-writer.reclamar.failed`:
```json
{ "project_id": "e57a318a-...", "parcela": "libro/diario", "concedido": false, "ya_era": false, "dueno": "escritor-a", "solicitante": "escritor-b", "motivo": "la parcela ya tiene escritor; un segundo escritor es corrupcion" }
```

### 5. Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "OTRO", "parcela": "libro/diario", "id": "x" }
```
Respuesta `403` + `single-writer.reclamar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el camino de reclamacion (RECLAMANTE_ESCRITOR) puede reclamar el turno de una parcela", "details": { "rol_esperado": "RECLAMANTE_ESCRITOR", "rol_recibido": "OTRO" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/single-writer.test.js`. Cubre:

- `reclamar` con rol `RECLAMANTE_ESCRITOR` sobre parcela libre → `200
  {concedido:true, ya_era:false}` y emite `contabilidad.escritor_reclamado`.
- `reclamar` la misma parcela con el mismo id → `200 ya_era:true`.
- `reclamar` la misma parcela con otro id → `409 {concedido:false, dueno, solicitante}`
  + `single-writer.reclamar.failed`.
- `reclamar` con otro rol → `403 PERMISSION_DENIED` + `single-writer.reclamar.failed`.
- `reclamar` sin `project_id`/`parcela`/`id` → `400 INVALID_INPUT`.
- `es_escritor` devuelve `{es_escritor, dueno}` sin mutar; sin dueño → `dueno:null`.
- `project.activated` restaura el registro via PosPersistencia; `duenoDe(pid, parcela)`
  lee sin mutar.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `SingleWriter extends ModuloHibridoReflejo`; `name = 'single-writer'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._registros`
  (`Map<project_id, {esquema, duenos: Map<parcela, {id, reclamado_en}>}>`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'single-writer.json', dir: '/contabilidad/single-writer', snapshot, hidratar })`
  desde `modules/contabilidad-libro/single-writer/` (DOS niveles →
  `../../_shared/pos-persistencia`). `onProjectActivated` → `restaurar(project_id)`;
  `onUnload` → `flush()` + `detener()`.
- `onReclamarRequest` delega en `_atender(e, 'reclamar',
  'single-writer.reclamar.response', async (d) => {...})`; dentro publica
  `contabilidad.escritor_reclamado` si `200 && concedido`, si no
  `single-writer.reclamar.failed`. `onEsEscritorRequest` en `_atender(e,
  'es_escritor', ...)` y publica `es_escritor.failed` si status ≠ 200.
- Proyecciones `_reclamar` (escritura + guard) y `_es_escritor` (lectura); helper
  `_obtenerOCrear(pid)`. Lectura directa `duenoDe(pid, parcela)`. Tools `toolReclamar`
  / `toolEsEscritor`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP hacia delante: lo consultan los custodios del libro y, en particular,
  `escritor-diario` (B2) pide el turno de la parcela `libro/diario` vía
  `single-writer.reclamar.request`.
