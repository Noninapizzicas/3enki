---
name: aviso-revision
description: >
  Skill FULL del módulo PUENTE `aviso-revision` de la vertical contabilidad de Enki.
  El EMPUJÓN al canal de avisos: convierte lo que ya está en la cola en UN AVISO con
  su MOTIVO y su COLA DE DESTINO, derivada de la naturaleza del asunto (lo contable →
  ASESOR, lo del negocio → DUEÑO). NO resuelve ni decide: solo enruta el aviso.
  Úsala para operar, depurar o extender el puente, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites empujar un aviso de revisión (RPC
    aviso-revision.empujar.request) a partir de una excepción.
  - Cuando depures por qué no hay aviso (400 INVALID_INPUT si falta project_id, la
    excepción o su motivo).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del puente (no resuelve, no decide, deriva el destino).
  - Cuando vayas a escribir/ampliar el test unitario del puente aviso-revision.
tags: [enki, modulo, puente, contabilidad, aviso-revision]
---

# aviso-revision — PUENTE STATELESS del canal de avisos

## Qué hace el módulo

`aviso-revision` es un **PUENTE STATELESS** (A8.2, hoja del plan): el **EMPUJÓN** al
canal de avisos — «esto necesita revisión». Convierte lo que **ya está en la cola**
(`contabilidad.excepcion_encolada`, A8.1) en **UN AVISO** con su **MOTIVO** y su **COLA
DE DESTINO**, **DERIVADA** de la naturaleza del asunto — lo contable al **ASESOR**, lo
del negocio al **DUEÑO**.

Invariantes:
- **NO resuelve, NO decide, NO inventa el destino**: lo **DERIVA** de la naturaleza
  (o **copia** el declarado por la excepción) y declara en la salida si el destino es
  `'derivado'` o `'declarado'`.
- **Sin motivo no hay aviso**: se cierra el círculo con el par `failed`.
- **Es PURO y sin estado**: enruta el empujón y **no recuerda** avisos. Sin
  `PosPersistencia` y sin `project.activated`: no es custodio.
- El **consumidor** del aviso es `motor-avisos`, que lo produce al negocio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `aviso-revision.empujar.request` | `onEmpujarRequest` | RPC puente: {project_id, excepcion:{motivo, clave?, id?, asunto?, naturaleza, destino?, detalle?, origen?}, naturaleza?, destino?} → {aviso:{clave, id_excepcion, asunto, naturaleza, destino, motivo, detalle, origen, requiere_revision}, destino_origen:'derivado'\|'declarado', resuelto_por_este_puente:false}. Deriva la cola de destino de la naturaleza (contable→ASESOR, negocio→DUENO). Exito → publica contabilidad.aviso_revision y responde por aviso-revision.empujar.response; excepcion sin motivo → aviso-revision.empujar.failed. |
| `contabilidad.excepcion_encolada` | `onExcepcionEncolada` | Fire-and-forget (A8.2): encolado-excepcion (A8.1) publica que lo dudoso quedo en cola → {project_id, excepcion, destino, naturaleza, correlation_id}. Misma proyeccion que el RPC: empuja el aviso con su motivo y su cola de destino a partir de la excepcion encolada; invalido → aviso-revision.empujar.failed. Cierra el circulo del flujo de excepcion. |

### Publishes

| Evento | Descripción |
|---|---|
| `aviso-revision.empujar.response` | Respuesta RPC correlada de aviso-revision.empujar.request → {request_id, status:200, data:{aviso, destino_origen, resuelto_por_este_puente}}. Emitida por el helper _atender. |
| `aviso-revision.empujar.failed` | Par de fallo determinista (A8.2): project_id ausente o excepcion sin motivo → {status, error:{code, message, details?}}. Cierra el circulo de aviso-revision.empujar.request y de contabilidad.excepcion_encolada. |
| `contabilidad.aviso_revision` | Fire-and-forget (A8.2): un aviso de revision quedo empujado con su motivo y su cola de destino → {project_id, aviso, destino, naturaleza, correlation_id}. Lo consume motor-avisos (que produce el aviso al negocio). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `aviso-revision.empujar.failed` cierra el círculo de
> `aviso-revision.empujar.request` **y** de `contabilidad.excepcion_encolada`, porque
> `onEmpujarRequest` y `onExcepcionEncolada` usan la misma proyección `_empujar`.

> Nota: en el fire-and-forget `onExcepcionEncolada` el handler **sí** publica
> explícitamente `contabilidad.aviso_revision` o `aviso-revision.empujar.failed` (no
> pasa por `_atender`); sin `project_id` devuelve `null` sin publicar.

## Reglas de negocio

1. **Fuente de la excepción**: `_empujar` toma `input.excepcion || input.ex`; ausente/no
   objeto → `400 INVALID_INPUT` (`field:'excepcion'`).
2. **Sin motivo no hay aviso**: `ex.motivo` vacío → `400 INVALID_INPUT`
   (`field:'excepcion.motivo'`). El motivo es obligatorio: un aviso sin motivo no dice
   nada y no se empuja.
3. **Destino DERIVADO de la naturaleza**: `NATURALEZA_DESTINO = {CONTABLE:'ASESOR',
   NEGOCIO:'DUENO'}`; `naturaleza` se normaliza a mayúsculas (desconocida →
   `'CONTABLE'`). La naturaleza se toma del input si lo trae, si no de la excepción.
4. **Destino declarado se COPIA (no se inventa)**: `_destinoEsDeclarado(raw)` es `true`
   **solo** si `raw` es `'ASESOR'` o `'DUENO'`. Si la excepción (o el input) trae un
   destino válido → se usa tal cual y `destino_origen:'declarado'`; si no →
   `destino_origen:'derivado'` (de la naturaleza; default seguro `ASESOR`).
5. **El aviso ES la excepción + motivo + destino**: `{clave, id_excepcion, asunto,
   naturaleza, destino, motivo, detalle, origen, requiere_revision:true, empujado_en}`.
   Nada más se inventa: `clave`/`id_excepcion`/`asunto`/`origen` caen a `null` si la
   excepción no los trae; `detalle` no-objeto → `null`.
6. **NO resuelve ni decide**: la salida declara `resuelto_por_este_puente:false`
   siempre — el puente enruta, no cierra la excepción.
7. **Puro y sin estado**: no persiste, no recuerda avisos. `empujado_en` se sella con
   `new Date().toISOString()`.
8. **Validación determinista**: `project_id` ausente → `400 INVALID_INPUT`
   (`field:'project_id'`), con fallback `input.project_id || this.project_id`.
9. **HTTP exacto**: éxito `200`; `project_id`/excepción/motivo inválidos → `400`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `aviso-revision.empujar.response` y emite `contabilidad.aviso_revision`.

### 1. `empujar` — convertir la excepción en aviso

```json
{
  "project_id": "e57a318a-...",
  "excepcion": {
    "clave": "CONTABLE|B12345678", "id": "x1", "asunto": "B12345678",
    "naturaleza": "CONTABLE",
    "motivo": "contrapartida sin regla que cubra el proveedor",
    "detalle": { "hecho": "compra-0001" }, "origen": "contrapartida-asistida"
  },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "aviso": {
    "clave": "CONTABLE|B12345678", "id_excepcion": "x1", "asunto": "B12345678",
    "naturaleza": "CONTABLE", "destino": "ASESOR",
    "motivo": "contrapartida sin regla que cubra el proveedor",
    "detalle": { "hecho": "compra-0001" }, "origen": "contrapartida-asistida",
    "requiere_revision": true, "empujado_en": "2026-09-25T..."
  },
  "destino_origen": "derivado",
  "resuelto_por_este_puente": false
}
```

Emite `contabilidad.aviso_revision`:
```json
{ "project_id": "e57a318a-...", "aviso": { "...": "..." }, "destino": "ASESOR", "naturaleza": "CONTABLE", "correlation_id": "abc-123" }
```

Con `naturaleza:'NEGOCIO'` → `destino:'DUENO'` (`destino_origen:'derivado'`). Si la
excepción ya trae `destino:'ASESOR'`, se copia y `destino_origen:'declarado'`.

### 2. Fire-and-forget — reacción a `contabilidad.excepcion_encolada`

`onExcepcionEncolada` toma `d.excepcion || d` y `ex.naturaleza`/`ex.destino` (o los del
evento), llama a `_empujar` y publica `contabilidad.aviso_revision` o el par `failed`.
Sin `project_id` devuelve `null`.

### 3. Fallo — excepción sin motivo

Respuesta `400` + `aviso-revision.empujar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "excepcion.motivo requerido", "details": { "field": "excepcion.motivo" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/aviso-revision.test.js`. Cubre:

- `empujar` con excepción completa → `200`, aviso con `requiere_revision:true`,
  `destino_origen:'derivado'`, `resuelto_por_este_puente:false` y emite
  `contabilidad.aviso_revision`.
- `naturaleza:'NEGOCIO'` → `destino:'DUENO'`; destino declarado válido → se copia con
  `destino_origen:'declarado'`.
- `excepcion.motivo` ausente → `400 INVALID_INPUT` + `aviso-revision.empujar.failed`.
- `project_id` ausente → `400 INVALID_INPUT`.
- `onExcepcionEncolada` (fire-and-forget) empuja desde la excepción encolada; sin
  `project_id` → `null`; payload inválido → par `failed`.
- `toolEmpujar` devuelve la misma proyección que `_empujar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AvisoRevision extends ModuloHibridoReflejo`; `name = 'aviso-revision'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin
  `onProjectActivated` (PUENTE stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/aviso-revision/`).
- `onEmpujarRequest` usa `this._atender(e, 'empujar',
  'aviso-revision.empujar.response', async (d) => {...})` y dentro cierra el círculo
  (evento de dominio en `200`, par `failed` si no). `onExcepcionEncolada` **no** usa
  `_atender`: llama directamente a `_empujar` y publica el evento de dominio o el par
  de fallo.
- Proyección única `_empujar(input)` → `{status, data}`; helpers `_naturaleza`,
  `_destino`, `_destinoEsDeclarado`. Tool directa `toolEmpujar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimenta `encolado-excepcion` (A8.1) vía `contabilidad.excepcion_encolada`;
  lo consume `motor-avisos`, que produce el aviso al negocio.
