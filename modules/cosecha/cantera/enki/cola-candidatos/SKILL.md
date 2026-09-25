---
name: cola-candidatos
description: >
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `cola-candidatos` (L2) de la vertical nichos
  (Radar de Nichos). Es la COLA PERSISTENTE de candidatos a validar, el BUFFER del cuello de
  botella del embudo de validación C: sondeo-territorio (B1) encola y batch-validacion (C5) los
  TOMA en lotes FIFO (solo C5 saca). Úsala para operar, depurar o extender el buffer/cola, o para
  entender su contrato de eventos, PosPersistencia y reglas de negocio (FIFO, guard de consumidor).
when-to-use: >
  - Cuando necesites encolar candidatos, tomar lotes (batch-validacion C5) o ver la longitud de la cola.
  - Cuando depures por qué una toma fue rechazada (consumidor != BATCH_VALIDACION → 403), un encolado
    por cola llena (409 COLA_LLENA) o por payload inválido (400).
  - Cuando entiendas el patrón CUSTODIO con PosPersistencia (project.activated + snapshot/hidratar
    + storage /prisma/nichos/cola-candidatos.json) y el desacople producción (B1) ↔ consumo (C5).
  - Cuando vayas a escribir/ampliar el test unitario del custodio.
tags: [enki, modulo, custodio, persistencia, nichos, radar, embudo, cola, fifo, buffer, proyecto-3d]
---

# cola-candidatos — CUSTODIO CON PERSISTENCIA (L2) del EMBUDO de validación del Radar

## Qué hace el módulo

`cola-candidatos` es la **COLA PERSISTENTE de CANDIDATOS a validar** — el **BUFFER del cuello de
botella** (el embudo de validación C). Desacopla la **producción** de candidatos (el barrido de
`sondeo-territorio` B1) del **consumo** (la validación en paralelo de `batch-validacion` C5):

- **Sondeo-territorio (B1)** encola candidatos (`_encolar` / `nichos.candidato.encontrado`).
- **Batch-validacion (C5)** los **TOMA en lotes** (`_tomarN` → lote, **SOLO C5 saca**).

**Orden FIFO**: los candidatos se toman en el orden en que se encolaron — justicia del embudo: los
primeros candidatos se validan primero. Cada ítem de la cola es
`{ id, nombre, audiencia, fuente, metadata, encolado_at, estado: 'EN_COLA' }` dentro de una cola
`{ esquema:'nichos-cola-candidatos-v1', candidatos[], tamano_max, updated_at }`.

Es un **CUSTODIO real** (patrón de `/criterio-viabilidad`): **single-writer del buffer** — la cola la
muta UN productor-consumidor a la vez; la **toma de lote guarda que solo C5 extraiga**
(guard de consumidor). Proyecciones `_encolar`, `_tomarN`, `_longitud`.

**Persiste por proyecto con PosPersistencia** (storage `/prisma/nichos/cola-candidatos.json`),
**restaura en `project.activated`** y vuelca en `onUnload`. Emisor/par de fallo.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.candidato.encolar.request` | `onEncolarRequest` | RPC custodio: {project_id, candidato:{nombre?, producto?, audiencia?, fuente?, metadata?}} → {project_id, candidato, numero_en_cola, encolado}. Encola un candidato al buffer FIFO del proyecto. Publica nichos.candidato_encolado y responde por nichos.candidato.encolar.response. Si falta project_id o candidato → nichos.candidato.encolar.failed. |
| `nichos.candidato.tomar.request` | `onTomarRequest` | RPC custodio: {project_id, consumidor:'BATCH_VALIDACION', n?:int} → {project_id, lote, tomados, restantes}. Guard de consumidor: SOLO batch-validacion (C5) toma candidatos; otros → PERMISSION_DENIED. Toma los primeros N candidatos (FIFO). Publica nichos.candidato_tomado y responde por nichos.candidato.tomar.response. |
| `nichos.candidato.encontrado` | `onCandidatoEncontrado` | Fire-and-forget (B1): sondeo-territorio publica {project_id, candidato}. La cola auto-encola el candidato sin RPC, publica nichos.candidato_encolado y, si falla, nichos.candidato.encolar.failed. |
| `project.activated` | `onProjectActivated` | Restaura la cola de candidatos del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.candidato_encolado` | Fire-and-forget (L2): un candidato quedó encolado en el buffer → {project_id, candidato, numero_en_cola, encolado}. Lo consume batch-validacion (C5) que tomará lotes cuando haya volumen. |
| `nichos.candidato_tomado` | Fire-and-forget (L2): batch-validacion tomó un lote de la cola → {project_id, lote, tomados, restantes}. Marca que un lote pasó a validación (C5). |
| `nichos.candidato.encolar.failed` | Par de fallo determinista (L2): encolado rechazado (cola al tope, candidato inválido) o toma rechazada (consumidor != BATCH_VALIDACION) → {status, code, message, data}. Cierra el círculo de los requests de la cola. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico. Aquí, module.json
> declara UN único par para toda la cola: `nichos.candidato.encolar.failed`, usado tanto para fallos
> de encolado como de toma.

> **Nota (honestidad sobre el código real)**: aunque el flujo de `tomar` es un RPC propio
> (`nichos.candidato.tomar.request`), **NO existe un par `tomar.failed`**. En `index.js`
> `onTomarRequest` (línea 88-99), cuando la toma falla (p.ej. `403 PERMISSION_DENIED` por consumidor
> inválido) el código publica `nichos.candidato.encolar.failed` — el mismo par genérico de la cola.
> No es un error del código sino una decisión: el par `*.failed` de la cola cierra el círculo de
> TODOS los requests (encolar + tomar). Documentado tal cual está el código.

> **Nota: no está en module.json pero sí lo emite `_atender` (modulo-hibrido-reflejo)**:
> ante una excepción inesperada en la proyección, se responde por el canal de la response con
> `{ status: 500, code: 'UNKNOWN_ERROR', mensaje: err.message }`.

## Reglas de negocio

1. **Single-writer del buffer**: la cola la muta UN productor-consumidor a la vez. `_encolar` añade
   (sondeo B1 o RPC), `_tomarN` extrae — y la extracción está guardada.
2. **Guard de consumidor → `403 PERMISSION_DENIED`**: en `_tomarN`, si `input.consumidor !==
   'BATCH_VALIDACION'` (`CONSUMIDOR_LOTE`) → falla con
   `{ status:403, code:'PERMISSION_DENIED', mensaje:'solo batch-validacion (C5) puede tomar candidatos de la cola', data:{ consumidor_esperado:'BATCH_VALIDACION', consumidor_recibido:<rol> } }`.
   El handler publica `nichos.candidato.encolar.failed` (par genérico de la cola).
3. **Cola FIFO**: `_tomarN` hace `c.candidatos.splice(0, cantidad)` — toma los primeros N en el
   orden de encolado. Justicia del embudo: los primeros candidatos se validan primero.
4. **Cola llena → `409 COLA_LLENA`** + `nichos.candidato.encolar.failed` con
   `{ status:409, code:'COLA_LLENA', mensaje:'cola de candidatos al tope (<tamano_max>)', data:{ project_id } }`
   solo si `tamano_max` está fijado y `length >= tamano_max`.
5. **Payload inválido → `400 INVALID_INPUT`** + failed con el campo (`project_id` o `candidato`)
   en `mensaje`/`data.field`. El candidato se admite directo, o envoltura `{ candidato }`, o plano
   (si tiene `nombre`/`producto`).
6. **Nombre derivado**: `nombre` = `candidato.nombre` trimeado, si no `candidato.producto` trimeado,
   si no `'candidato'`. `audiencia`/`fuente` trimeados o null; `fuente` default `input.origen || 'sondeo'`.
   `id` = `candidato.id` o autogenerado `` `${pid}-${Date.now()}-${index+1}` ``; `estado:'EN_COLA'`.
7. **Tamaño de lote** (`_tomarN`): `n = Number(input.n ?? input.paralelismo ?? 3)`, si `n` es entero
   `> 0` → `n`; si no → `3` (default). La longitud devuelve `numero_en_cola`.
8. **Auto-encolado fire-and-forget** (`onCandidatoEncontrado`): sondeo-territorio (B1) publica
   `nichos.candidato.encontrado` → la cola encola solo (sin RPC) y publica
   `nichos.candidato_encolado` (o `encolar.failed`). Sin `project_id` → se ignora (`return null`).

## Cómo se usa (RPCs)

RPCs que responden en `nichos.candidato.encolar.response` y `nichos.candidato.tomar.response`:

### 1. `encolar` — encolar un candidato al buffer FIFO

```json
{
  "project_id": "e57a318a-...",
  "candidato": {
    "nombre": "salsa picante artesanal",
    "audiencia": "restaurantes de barrio",
    "fuente": "puerto"
  }
}
```
Respuesta `200` + publica `nichos.candidato_encolado`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "candidato": {
      "id": "e57a318a-...-1758800000000-1",
      "nombre": "salsa picante artesanal",
      "audiencia": "restaurantes de barrio",
      "fuente": "puerto",
      "metadata": null,
      "encolado_at": "2026-09-25T11:00:00.000Z",
      "estado": "EN_COLA"
    },
    "numero_en_cola": 3,
    "encolado": true
  }
}
```

### 2. `tomar` — batch-validacion (C5) toma un lote FIFO

```json
{ "project_id": "e57a318a-...", "consumidor": "BATCH_VALIDACION", "n": 5 }
```
Respuesta `200` + publica `nichos.candidato_tomado`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "lote": [ { "id": "...", "nombre": "salsa picante artesanal", "audiencia": "restaurantes de barrio", "fuente": "puerto", "encolado_at": "...", "estado": "EN_COLA" } ],
    "tomados": 1,
    "restantes": 2
  }
}
```

### Fire-and-forget — sondeo-territorio (B1) auto-encola

`sondeo-territorio` publica `nichos.candidato.encontrado`; la cola encola sin RPC y publica
`nichos.candidato_encolado` con el mismo shape que el RPC `encolar`.

### Fallo — toma rechazada (consumidor != BATCH_VALIDACION)

```json
{ "project_id": "e57a318a-...", "consumidor": "EDITOR" }
```
Respuesta `403` + `nichos.candidato.encolar.failed` (par genérico de la cola, ver Nota):
```json
{ "status": 403, "code": "PERMISSION_DENIED", "mensaje": "solo batch-validacion (C5) puede tomar candidatos de la cola", "data": { "consumidor_esperado": "BATCH_VALIDACION", "consumidor_recibido": "EDITOR" } }
```

### Fallo — cola llena

```json
{ "project_id": "e57a318a-...", "candidato": { "nombre": "otro" } }
```
Respuesta `409` + `nichos.candidato.encolar.failed`:
```json
{ "status": 409, "code": "COLA_LLENA", "mensaje": "cola de candidatos al tope (100)", "data": { "project_id": "e57a318a-..." } }
```

## Tests

El test vive en `tests/unit/cola-candidatos.test.js`. Cubre:

- `encolar` con candidato válido → `200`, push con `estado:'EN_COLA'`, `numero_en_cola` y publica
  `nichos.candidato_encolado`.
- `encolar` sin `project_id` o sin `candidato` → `400 INVALID_INPUT` + failed; cola llena (`tamano_max`)
  → `409 COLA_LLENA` + failed.
- `tomar` con consumidor BATCH_VALIDACION → `200`, `lote` FIFO, `tomados`/`restantes`; publica
  `nichos.candidato_tomado`.
- `tomar` con consumidor != BATCH_VALIDACION → `403 PERMISSION_DENIED` (+ publica `encolar.failed`).
- `_longitud` devuelve `numero_en_cola` correcto.
- Auto-encolado vía `nichos.candidato.encontrado` (sin RPC) publica `nichos.candidato_encolado`.
- PosPersistencia: `project.activated` restaura la cola desde el storage; `onUnload` vuelca.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/cola-candidatos
node tests/unit/cola-candidatos.test.js
```

## Notas de implementación

- Clase `ColaCandidatos extends ModuloHibridoReflejo`; `name = 'cola-candidatos'`,
  `version = 'reflejo-0.1.0'`. Store en memoria: `this._colas = new Map()` (project_id → cola).
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo:this, file:'cola-candidatos.json',
  dir:'/prisma/nichos', snapshot, hidratar })`. `onProjectActivated` → `this._persist.restaurar(d.project_id)`;
  `onUnload` → `flush()` + `detener()`. `_obtenerOCrear`/`_encolar`/`_tomarN` marcan `marcarDirty(pid)`.
- **Escritura de dominio**: `onEncolarRequest`/`onCandidatoEncontrado` publican `nichos.candidato_encolado`
  (o `nichos.candidato.encolar.failed`); `onTomarRequest` publica `nichos.candidato_tomado` (o, al fallar,
  `nichos.candidato.encolar.failed`).
- `_tomarN` usa `splice(0, cantidad)` para preservar el orden FIFO; tope de lote `n ?? paralelismo ?? 3`.
- `_longitud`/`toolLongitud` exponen `numero_en_cola`.
- DEP: `sondeo-territorio` (B1) encola; `batch-validacion` (C5) tomó lotes FIFO para validar en paralelo.
