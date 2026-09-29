---
name: aislamiento-negocio
description: >
  Skill FULL del módulo CUSTODIO `aislamiento-negocio` de la vertical contabilidad de Enki.
  EL AISLAMIENTO MULTI-NEGOCIO — INVARIANTE DURA «UN NEGOCIO NO VE OTRO»: un solo dueño y un
  solo escritor por parcela, con control de acceso que deniega lo ajeno (403). Sin negocio
  declarado no se abre parcela (no se crea una parcela huérfana). Persiste por proyecto con
  PosPersistencia. Úsala para operar, depurar o extender el custodio, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites abrir/obtener la parcela de un negocio o reclamar su único escritor (RPCs
    aislamiento-negocio.parcela.request y aislamiento-negocio.escritor.request).
  - Cuando depures por qué se deniega el acceso (403 PERMISSION_DENIED: parcela ajena o segundo
    escritor) o por qué falta el negocio (400 INVALID_INPUT, no se abre parcela huérfana).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    custodio (un negocio no se fuga a otro, un solo escritor, persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio aislamiento-negocio.
tags: [enki, modulo, custodio, contabilidad, aislamiento-negocio]
---

# aislamiento-negocio — CUSTODIO CON PERSISTENCIA del aislamiento multi-negocio

## Qué hace el módulo

`aislamiento-negocio` es un **CUSTODIO CON PERSISTENCIA** (I4, hoja del plan): **INVARIANTE DURA
«UN NEGOCIO NO VE OTRO»**. Esta parcela garantiza que los datos de un negocio **NO se fugan** a
otro. Es el **eje del aislamiento multi-negocio** (espejo de G7: eje negocio ↔ eje persona).
**UN solo dueño por parcela y UN solo escritor.**

Atributos del diseño: `parcelas:Map<Negocio,Parcela>`.

- **`parcela(negocio)`** → abre/devuelve la parcela de un negocio **CON CONTROL DE ACCESO**:
  solo el propio negocio (o su escritor reclamado) obtiene su parcela; quien declare **otro
  negocio** como solicitante → **RECHAZADO (403, aislamiento negocio↔negocio)**. El aislamiento
  **no es una convención: es un guard**.
- **`escritor(negocio)`** → **RECLAMA** (o devuelve) el **ÚNICO escritor** de la parcela. El
  **segundo escritor NO espera ni hace cola** (**403**). **Un solo escritor por parcela.**
- **Sin negocio declarado NO se abre parcela** (`[ABIERTO]`/invalid: una parcela huérfana sería
  una puerta a todo). **Nada se estima** y **jamás se mezclan dos negocios en una misma
  parcela**.

Invariantes:

- **UN NEGOCIO NO SE FUGA A OTRO**: toda lectura de parcela ajena → **403**; toda parcela es de
  un negocio y solo de ese.
- **UN SOLO ESCRITOR por parcela**: reclamado una vez; otra reclamación desde otro actor → **403**.
- **Persiste por proyecto** con `PosPersistencia`
  (`/contabilidad/aislamiento-negocio/aislamiento-negocio.json`), **restaura** en
  `project.activated` y **vuelca** en `onUnload`.

Proyecciones `_parcela` (guard de aislamiento) y `_escritor` (guard de escritor único). Publica
`contabilidad.parcela_reclamada`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `aislamiento-negocio.parcela.request` | `onParcelaRequest` | RPC custodio (control de acceso a la parcela): {project_id, negocio, solicitante_negocio?, escritor?} → {parcela:{negocio, escritor, creada_en, accesos}, aislada:true}. Abre/devuelve la parcela del negocio. GUARD DE AISLAMIENTO: si solicitante_negocio declara OTRO negocio → 403 PERMISSION_DENIED (un negocio no ve otro). Sin negocio → INVALID_INPUT (no se abre parcela huerfana). Exito → publica contabilidad.parcela_reclamada y responde por aislamiento-negocio.parcela.response; fallo → aislamiento-negocio.parcela.failed. |
| `aislamiento-negocio.escritor.request` | `onEscritorRequest` | RPC custodio (UN SOLO ESCRITOR por parcela): {project_id, negocio, escritor} → {negocio, escritor, reclamado, ya_era}. Reclama el escritor unico de la parcela; si ya estaba reclamado por otro actor → 403 PERMISSION_DENIED (el segundo escritor no espera ni hace cola). Idempotente si reclama el mismo actor. Exito con reclamacion → publica contabilidad.parcela_reclamada; responde por aislamiento-negocio.escritor.response; fallo → aislamiento-negocio.escritor.failed. |
| `project.activated` | `onProjectActivated` | Restaura las parcelas del proyecto activado desde el storage (PosPersistencia), para que el aislamiento multi-negocio siga vivo tras un reinicio. |

### Publishes

| Evento | Descripción |
|---|---|
| `aislamiento-negocio.parcela.response` | Respuesta RPC correlada de aislamiento-negocio.parcela.request → {request_id, status:200, data:{parcela, aislada}}. Emitida por el helper _atender. |
| `aislamiento-negocio.parcela.failed` | Par de fallo determinista (I4): negocio ausente (INVALID_INPUT) o parcela ajena (PERMISSION_DENIED → 403, un negocio no ve otro) → {status, error:{code, message, details?}}. Cierra el circulo de aislamiento-negocio.parcela.request. |
| `aislamiento-negocio.escritor.response` | Respuesta RPC correlada de aislamiento-negocio.escritor.request → {request_id, status:200, data:{negocio, escritor, reclamado, ya_era}}. Emitida por el helper _atender. |
| `aislamiento-negocio.escritor.failed` | Par de fallo determinista (I4): segundo escritor (PERMISSION_DENIED → 403) o falta project_id/negocio/escritor → {status, error:{code, message, details?}}. Cierra el circulo de aislamiento-negocio.escritor.request. |
| `contabilidad.parcela_reclamada` | Fire-and-forget (I4): una parcela quedo reclamada por su negocio (abierta o con su unico escritor) → {project_id, negocio, escritor, correlation_id}. Declara el dueno de la parcela para el resto de la vertical. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `aislamiento-negocio.parcela.failed` cierra el círculo de
> `aislamiento-negocio.parcela.request` (negocio ausente `400 INVALID_INPUT` o parcela ajena
> `403 PERMISSION_DENIED`) y `aislamiento-negocio.escritor.failed` cierra el de
> `aislamiento-negocio.escritor.request` (segundo escritor `403`, o falta
> `project_id`/`negocio`/`escritor` `400`).

> Nota de honestidad (cruce con `index.js`): `onParcelaRequest` publica
> `contabilidad.parcela_reclamada` **solo si `_parcela` devuelve `200`**; la rama `else` publica
> `aislamiento-negocio.parcela.failed`. `onEscritorRequest` publica
> `contabilidad.parcela_reclamada` **solo si `200` Y `res.data.reclamado`** (una reclamación
> nueva; la idempotente no reemite); la rama `else` publica
> `aislamiento-negocio.escritor.failed`.

> Nota: el módulo expone `parcelaDe(pid, negocio)` como **lectura directa** para otras hojas del
> mismo proceso (no muta; solo devuelve **la** parcela de ese negocio) — no es un evento del
> bus, no figura en `module.json`. Tampoco figuran `_parcela`, `_escritor`, `_obtener` ni
> `_clave` internos.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **`_parcela` (GUARD de aislamiento)**:
   - `negocio` = `_clave(input.negocio ?? input.negocio_id)`; ausente → `400 INVALID_INPUT`
     (`field:'negocio'`). **Sin negocio NO se abre parcela** (una huérfana sería una puerta a
     todo).
   - **GUARD**: `solicitante` = `_clave(input.solicitante_negocio ?? input.negocio)`; si es
     distinto del `negocio` pedido → **`403 PERMISSION_DENIED`** con `{negocio: solicitante,
     parcela: negocio, aislamiento:'negocio↔negocio'}`. **Un negocio no ve otro.**
   - **GUARD de escritor**: si `input.escritor` viene y la parcela ya tiene un escritor
     reclamado **distinto** → **`403 PERMISSION_DENIED`** con `{negocio, escritor_reclamado,
     escritor_recibido}`.
   - Éxito: **registra el acceso** `{en: ISO, por: solicitante}` (acotado a **500** accesos por
     parcela), `marcarDirty(pid)` y devuelve `{project_id, parcela, aislada:true, motivo:null}`.
3. **`_escritor` (GUARD de UN SOLO ESCRITOR)**:
   - `negocio` obligatorio (`400 INVALID_INPUT` si falta).
   - `actor` = `input.escritor` o `input.rol` (string); vacío → `400 INVALID_INPUT`
     (`field:'escritor'`).
   - **Si la parcela ya tiene escritor y es OTRO actor** → **`403 PERMISSION_DENIED`** con
     `{negocio, escritor_reclamado, escritor_recibido}`. **El segundo escritor NO espera ni hace
     cola.**
   - Si reclama el **mismo** actor → `ya_era:true, reclamado:false` (**idempotente**); si es
     nuevo → fija `escritor` + `escritor_desde`, `marcarDirty(pid)`, `reclamado:true`.
   - Devuelve `{project_id, negocio, escritor, reclamado, ya_era, parcelas_del_proyecto}`.
4. **La PARCELA** (`_obtener`): `{negocio, escritor:null, escritor_desde:null, creada_en:ISO,
   accesos:[]}`. Store `this._parcelas` = `Map<project_id, Map<negocio, Parcela>>`.
5. **`_clave(v)`**: `null`/`''` → `null`; objeto → `v.id ?? v.nombre ?? v.negocio` (recursivo);
   si no → `String(v)`. **La identidad del negocio es DATO declarado.**
6. **Persistencia (CUSTODIO)**: `PosPersistencia` con `file:'aislamiento-negocio.json'`,
   `dir:'/contabilidad/aislamiento-negocio'`, esquema `'contabilidad-aislamiento-negocio-v1'`;
   `snapshot` vuelca `[...parcelas.values()]`; `hidratar` reconstruye el `Map` por `negocio`.
   `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
   **`marcarDirty(pid)`** en cada escritura (parcela nueva, acceso, reclamación).
7. **Lectura directa** `parcelaDe(pid, negocio)`: devuelve **solo** la parcela de ese negocio
   (o `null`). **No muta.**
8. **INVARIANTES duras**: un negocio **no se fuga** a otro (403 en toda lectura ajena); **un solo
   escritor** por parcela (403 al segundo). **Jamás se mezclan dos negocios en una misma
   parcela.**
9. **HTTP exacto**: éxito `200`; negocio/escritor ausente → `400 INVALID_INPUT`; parcela ajena o
   segundo escritor → `403 PERMISSION_DENIED`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `aislamiento-negocio.parcela.response` / `aislamiento-negocio.escritor.response` y
emite `contabilidad.parcela_reclamada`.

### 1. `parcela` — abrir la parcela del propio negocio

```json
{
  "project_id": "e57a318a-...",
  "negocio": "NEGOCIO-A",
  "solicitante_negocio": "NEGOCIO-A",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "parcela": { "negocio": "NEGOCIO-A", "escritor": null, "escritor_desde": null, "creada_en": "2026-09-30T...", "accesos": [ { "en": "2026-09-30T...", "por": "NEGOCIO-A" } ] },
  "aislada": true, "motivo": null
}
```

Emite `contabilidad.parcela_reclamada`:

```json
{ "project_id": "e57a318a-...", "negocio": "NEGOCIO-A", "escritor": null, "correlation_id": "abc-123" }
```

### 2. `parcela` — parcela ajena → 403 (un negocio no ve otro)

```json
{ "project_id": "e57a318a-...", "negocio": "NEGOCIO-B", "solicitante_negocio": "NEGOCIO-A" }
```

Respuesta `403` + `aislamiento-negocio.parcela.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "un negocio no ve otro negocio: la parcela solicitada pertenece a otro", "details": { "negocio": "NEGOCIO-A", "parcela": "NEGOCIO-B", "aislamiento": "negocio↔negocio" } } }
```

### 3. `escritor` — reclamar el único escritor de la parcela

```json
{ "project_id": "e57a318a-...", "negocio": "NEGOCIO-A", "escritor": "escritor-contab" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "negocio": "NEGOCIO-A", "escritor": "escritor-contab", "reclamado": true, "ya_era": false, "parcelas_del_proyecto": 1 }
```

Emite `contabilidad.parcela_reclamada` con `{project_id, negocio, escritor, correlation_id}`.

### 4. `escritor` — segundo escritor → 403 (no espera ni hace cola)

```json
{ "project_id": "e57a318a-...", "negocio": "NEGOCIO-A", "escritor": "otro-escritor" }
```

Respuesta `403` + `aislamiento-negocio.escritor.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "la parcela ya tiene un unico escritor: el segundo escritor no espera ni hace cola", "details": { "negocio": "NEGOCIO-A", "escritor_reclamado": "escritor-contab", "escritor_recibido": "otro-escritor" } } }
```

### 5. Fallo — falta el negocio (no se abre parcela huérfana)

Respuesta `400 INVALID_INPUT` con `{field:'negocio'}` + el par `failed`. Lo mismo para
`project_id` (`{field:'project_id'}`) y para `escritor` (`{field:'escritor'}`).

## Tests

El test unitario de la vertical vive en `tests/unit/aislamiento-negocio.test.js`. Cubre:

- `parcela` del propio negocio → `200 {aislada:true}` con la parcela y el acceso registrado;
  emite `contabilidad.parcela_reclamada`.
- `parcela` de **otro** negocio (`solicitante_negocio` distinto) → **`403 PERMISSION_DENIED`**
  (un negocio no ve otro) + `.parcela.failed`.
- Sin negocio → `400 INVALID_INPUT` (`field:'negocio'`, no se abre parcela huérfana).
- `escritor` reclama el único escritor → `200 {reclamado:true, ya_era:false}`; reclamarlo el
  mismo actor → `ya_era:true, reclamado:false` (**idempotente**).
- **Segundo escritor** distinto → **`403 PERMISSION_DENIED`** (no espera ni hace cola) +
  `.escritor.failed`.
- La parcela con escritor reclamado rechaza una `parcela` pedida por otro `escritor` (403).
- `project.activated` restaura las parcelas; `parcelaDe(pid, negocio)` lee sin mutar y devuelve
  **solo** la parcela de ese negocio.
- Los accesos se acotan a 500 (**no crece sin límite**).
- `toolParcela` / `toolEscritor` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AislamientoNegocio extends ModuloHibridoReflejo`; `name = 'aislamiento-negocio'`,
  `version = 'reflejo-0.1.0'`. Store `this._parcelas = new Map()`
  (`project_id → Map<negocio, Parcela>`). Esquema `'contabilidad-aislamiento-negocio-v1'`.
- Requiere `../../_shared/modulo-hibrido-reflejo` y `../../_shared/pos-persistencia` (DOS
  niveles desde `modules/contabilidad-analitica/aislamiento-negocio/`).
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:'aislamiento-negocio.json',
  dir:'/contabilidad/aislamiento-negocio', snapshot, hidratar})`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`; `marcarDirty(pid)` en cada
  escritura.
- `onParcelaRequest` / `onEscritorRequest` usan `this._atender(...)` con cierre de círculo
  (evento de dominio `contabilidad.parcela_reclamada` en `200`, par `failed` si no).
- Proyecciones `_parcela` y `_escritor` (síncronas, guard de aislamiento / de escritor único);
  helper `_obtener`; `_clave`; lectura directa `parcelaDe(pid, negocio)`. Tools `toolParcela` /
  `toolEscritor`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- **INVARIANTE DURA**: **UN NEGOCIO NO SE FUGA A OTRO** — toda lectura de parcela ajena → 403;
  toda parcela es de un negocio y solo de ese. **UN SOLO ESCRITOR** por parcela (reclamado una
  vez; otro actor → 403). Es el eje del aislamiento multi-negocio (espejo de G7).
