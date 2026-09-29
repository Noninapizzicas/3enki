---
name: encolado-excepcion
description: >
  Skill FULL del módulo CUSTODIO `encolado-excepcion` de la vertical contabilidad de
  Enki. LA VÁLVULA del sistema: lo dudoso NO bloquea — el flujo CONTINÚA y lo dudoso
  espera en la cola, con DOS destinos derivados de su naturaleza (lo contable →
  ASESOR, lo del negocio → DUEÑO). Un solo escritor (ENCOLADO_EXCEPCION), encolado
  idempotente y desatasco que marca sin borrar; persiste por proyecto con
  PosPersistencia. Úsala para operar, depurar o extender el custodio, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites encolar una duda (RPC encolado-excepcion.encolar.request) o
    desatascar una excepción pendiente (RPC encolado-excepcion.tomar.request).
  - Cuando depures por qué una excepción se rechaza (403 PERMISSION_DENIED si el rol no
    es ENCOLADO_EXCEPCION, 400 INVALID_INPUT sin motivo, 404 RESOURCE_NOT_FOUND por
    clave inexistente).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la válvula (dos destinos, encolado idempotente, nada se borra).
  - Cuando vayas a escribir/ampliar el test unitario del custodio encolado-excepcion.
tags: [enki, modulo, custodio, contabilidad, encolado-excepcion]
---

# encolado-excepcion — CUSTODIO CON PERSISTENCIA de la válvula

## Qué hace el módulo

`encolado-excepcion` es un **CUSTODIO CON PERSISTENCIA** (A8.1, hoja del plan): **LA
VÁLVULA** del sistema. Lo dudoso **NO bloquea**: el flujo **CONTINÚA** y lo dudoso
espera en la **cola**. Dos destinos **derivados de la naturaleza** del asunto:
- lo **CONTABLE** (descuadre, cuenta fuera del plan, tercero desconocido,
  contrapartida sin regla) → **ASESOR**.
- lo del **NEGOCIO** (falta un dato del hecho, decisión del dueño, revisar una regla) →
  **DUEÑO**.

**UN SOLO ESCRITOR** de la parcela: el encolador (`ENCOLADO_EXCEPCION`); cualquier otro
rol es rechazado (segundo escritor → `403`).

Invariantes:
- **El encolado NUNCA engorda la cola por duplicado**: mismo asunto (clave declarada o
  derivada de `origen+naturaleza+motivo`, determinista) → devuelve la entrada existente
  con `encolada:false`.
- **Nada se borra**: `tomar` **MARCA** en `TOMADA` y deja el `historial` (append-only);
  no es un cambio de escritor, es una **anotación de desatasco**.
- **Dato ausente = desconocido**: sin `motivo` válido la excepción es inválida y no se
  encola; nada se estima.
- Consume el fire-and-forget `contabilidad.documento_descuadrado`
  (`control-cuadre-documento`, A4.3): el descuadre va **derecho a la cola**.
- Persiste por proyecto con **PosPersistencia** (storage
  `/contabilidad/encolado-excepcion/encolado-excepcion.json`), restaura en
  `project.activated` y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `encolado-excepcion.encolar.request` | `onEncolarRequest` | RPC custodio (escritura, UN escritor): {project_id, rol:'ENCOLADO_EXCEPCION', excepcion:{motivo, asunto?, naturaleza:'CONTABLE'\|'NEGOCIO', destino?, detalle?, origen?}} → {excepcion, encolada}. Guard Rol=ENCOLADO_EXCEPCION (segundo escritor → 403). Deriva el destino de la naturaleza (o respeta un destino declarado valido); mismo asunto ya en cola → encolada:false sin engordar la cola. Exito → publica contabilidad.excepcion_encolada y responde por encolado-excepcion.encolar.response; sin motivo/asunto valido → encolado-excepcion.encolar.failed. |
| `encolado-excepcion.tomar.request` | `onTomarRequest` | RPC custodio (desatasco, NO borra): {project_id, clave?, destino?} → {excepcion} o {excepcion:null, pendientes, motivo}. Toma por clave, o la primera PENDIENTE (orden de entrada, determinista) filtrada por destino; la marca TOMADA con su historial (append-only). Cola vacia no es error: excepcion:null con pendientes. Responde por encolado-excepcion.tomar.response; clave inexistente → encolado-excepcion.tomar.failed. |
| `contabilidad.documento_descuadrado` | `onDocumentoDescuadrado` | Fire-and-forget (A8.1): control-cuadre-documento (A4.3) publica un descuadre → {project_id, documento, esperado, total, descuadre, correlation_id}. Lo dudoso va DERECHO a la cola con naturaleza CONTABLE (→ ASESOR), sin bloquear el flujo. Invalido → encolado-excepcion.encolar.failed. Cierra el circulo de la entrada. |
| `project.activated` | `onProjectActivated` | Restaura la cola de excepciones del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `encolado-excepcion.encolar.response` | Respuesta RPC correlada de encolado-excepcion.encolar.request → {request_id, status:200, data:{excepcion, encolada, motivo_duplicado?}}. Emitida por el helper _atender. |
| `encolado-excepcion.encolar.failed` | Par de fallo determinista (A8.1): rol != ENCOLADO_EXCEPCION (segundo escritor), excepcion sin motivo, o project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de encolado-excepcion.encolar.request y de contabilidad.documento_descuadrado. |
| `encolado-excepcion.tomar.response` | Respuesta RPC correlada de encolado-excepcion.tomar.request → {request_id, status:200, data:{excepcion, pendientes?, motivo?}}. Emitida por el helper _atender. |
| `encolado-excepcion.tomar.failed` | Par de fallo determinista (A8.1): project_id ausente o clave de excepcion inexistente (404) → {status, error:{code, message, details?}}. Cierra el circulo de encolado-excepcion.tomar.request. |
| `contabilidad.excepcion_encolada` | Fire-and-forget (A8.1): lo dudoso quedo en cola y el flujo sigue → {project_id, excepcion, destino, naturaleza, encolada, correlation_id}. Lo consumen aviso-revision (A8.2) para empujar el aviso, panel-proceso-contable y desatasco-entrada. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `encolado-excepcion.encolar.failed` cierra `encolar.request` (rama
> `status !== 200`) **y** `contabilidad.documento_descuadrado` (misma proyección
> `_encolar`), y `encolado-excepcion.tomar.failed` cierra `tomar.request`.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_encolar` exige
   `input.rol === 'ENCOLADO_EXCEPCION'` (constante `ROL_ESCRITOR`). Cualquier otro rol
   → `403 PERMISSION_DENIED` con `{rol_esperado, rol_recibido}`.
2. **Dos destinos DERIVADOS de la naturaleza**: `NATURALEZA_DESTINO = {CONTABLE:
   'ASESOR', NEGOCIO: 'DUENO'}`. `naturaleza` se normaliza a mayúsculas (desconocida →
   `'CONTABLE'`). El `destino` declarado solo se respeta si es un valor válido
   (`DESTINOS = {ASESOR, DUENO}`); si no, se **deriva** de la naturaleza (default
   seguro → `ASESOR`).
3. **Sin motivo no hay excepción**: `excepcion.motivo` vacío/no-string → `400
   INVALID_INPUT` (`field:'excepcion.motivo'`). La excepción no se encola.
4. **Clave del asunto determinista**: si hay `asunto` → `clave = '<naturaleza>|<asunto>'`;
   si no → `clave = '<naturaleza>|<origen|'sin-origen'>|<motivo>'`. Así el mismo asunto
   se reconoce aunque llegue dos veces.
5. **Encolado idempotente**: si `cola.excepciones.has(clave)` → **no** se duplica:
   devuelve la existente con `encolada:false` y
   `motivo_duplicado:'el asunto ya estaba en la cola'`. La cola no engorda.
6. **Excepción con estado append-only**: la nueva entrada se crea con
   `{clave, id:'x<n+1>', asunto, naturaleza, destino, motivo, detalle, origen, estado:
   'PENDIENTE', historial:[{estado:'PENDIENTE', en}], encolada_en, tomada_en:null}`.
   `detalle` no-objeto → `null`; `origen` ausente → `null`.
7. **`tomar` marca, no borra**: `_marcarTomada` pone `estado:'TOMADA'`, sella `tomada_en`
   y **empuja** `{estado:'TOMADA', en}` al `historial`. La entrada sigue en la cola.
8. **Selección determinista al tomar**: con `clave` → esa (si no existe → `404
   RESOURCE_NOT_FOUND` con `{clave}`); sin `clave` → la **primera PENDIENTE en orden de
   entrada**, filtrada por `destino` si se declara.
9. **Cola vacía NO es error**: `200` con `excepcion:null`, `pendientes:<n>`,
   `motivo:'no hay excepciones pendientes'`.
10. **Fire-and-forget del descuadre**: `onDocumentoDescuadrado` encola con rol de
    escritor, `naturaleza:'CONTABLE'`, `asunto` = `documento.clave_natural` si la trae,
    `detalle:{esperado, total, descuadre}` y `origen:'control-cuadre-documento'`. Sin
    `project_id` devuelve `null` sin publicar.
11. **Validaciones deterministas**: `project_id` ausente → `400 INVALID_INPUT`;
    `excepcion` ausente/no objeto → `400 INVALID_INPUT` (`field:'excepcion'`).
12. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    restaura en `project.activated`; `flush()` + `detener()` en `onUnload`.
13. **HTTP exacto**: éxito `200`; rol inválido → `403`; sin motivo → `400`; clave
    inexistente → `404`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `encolado-excepcion.encolar.response` y
`encolado-excepcion.tomar.response`.

### 1. `encolar` — la válvula (solo ENCOLADO_EXCEPCION)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ENCOLADO_EXCEPCION",
  "excepcion": {
    "motivo": "contrapartida sin regla que cubra el proveedor",
    "asunto": "B12345678",
    "naturaleza": "CONTABLE",
    "detalle": { "hecho": "compra-0001" },
    "origen": "contrapartida-asistida"
  },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "encolada": true,
  "excepcion": { "clave": "CONTABLE|B12345678", "id": "x1", "asunto": "B12345678", "naturaleza": "CONTABLE", "destino": "ASESOR", "motivo": "contrapartida sin regla que cubra el proveedor", "detalle": { "hecho": "compra-0001" }, "origen": "contrapartida-asistida", "estado": "PENDIENTE", "historial": [ { "estado": "PENDIENTE", "en": "2026-09-25T..." } ], "encolada_en": "2026-09-25T...", "tomada_en": null }
}
```

Emite `contabilidad.excepcion_encolada`:
```json
{ "project_id": "e57a318a-...", "excepcion": { "...": "..." }, "destino": "ASESOR", "naturaleza": "CONTABLE", "encolada": true, "correlation_id": "abc-123" }
```

Segundo encolado del MISMO asunto → `200 encolada:false` con
`motivo_duplicado:'el asunto ya estaba en la cola'`.

### 2. `tomar` — desatascar (marca, no borra)

```json
{ "project_id": "e57a318a-...", "destino": "ASESOR" }
```

Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "excepcion": { "clave": "CONTABLE|B12345678", "estado": "TOMADA", "tomada_en": "2026-09-25T...", "historial": [ { "estado": "PENDIENTE", "en": "..." }, { "estado": "TOMADA", "en": "2026-09-25T..." } ] } }
```

Sin pendientes → `200 {excepcion:null, pendientes:0, motivo:'no hay excepciones pendientes'}`.

### 3. Fallo — rol inválido (segundo escritor)

Respuesta `403` + `encolado-excepcion.encolar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el encolador (ENCOLADO_EXCEPCION) puede asentar excepciones", "details": { "rol_esperado": "ENCOLADO_EXCEPCION", "rol_recibido": "OTRO" } } }
```

### 4. Fallo — clave inexistente al tomar

Respuesta `404` + `encolado-excepcion.tomar.failed`:
```json
{ "status": 404, "error": { "code": "RESOURCE_NOT_FOUND", "message": "excepcion no encontrada", "details": { "clave": "CONTABLE|NO-EXISTE" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/encolado-excepcion.test.js`.
Cubre:

- `encolar` con rol `ENCOLADO_EXCEPCION` → `200 encolada:true`, destino derivado de la
  naturaleza y emite `contabilidad.excepcion_encolada`.
- `encolar` mismo asunto dos veces → `200 encolada:false` sin engordar la cola.
- `naturaleza:'NEGOCIO'` → `destino:'DUENO'`; `destino` declarado válido se respeta.
- `encolar` con otro rol → `403`; sin `motivo` → `400 INVALID_INPUT`.
- `tomar` sin clave → primera PENDIENTE; con `destino` → filtra; con clave inexistente
  → `404`; cola vacía → `200 {excepcion:null, pendientes:0}`.
- `tomar` deja `estado:'TOMADA'` con historial (nada se borra).
- `onDocumentoDescuadrado` encola el descuadre (naturaleza CONTABLE → ASESOR); sin
  `project_id` → `null`; `project.activated` restaura la cola vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `EncoladoExcepcion extends ModuloHibridoReflejo`; `name =
  'encolado-excepcion'`, `version = 'reflejo-0.1.0'`. Store en memoria `this._colas`
  (`Map<project_id, {esquema, excepciones: Map<clave, Excepcion>}>`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'encolado-excepcion.json', dir: '/contabilidad/encolado-excepcion', snapshot,
  hidratar })` sobre `../../_shared/pos-persistencia` (DOS niveles).
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
  Cada escritura marca `marcarDirty(pid)`.
- `onEncolarRequest` → `_atender(e, 'encolar',
  'encolado-excepcion.encolar.response', async (d) => {...})` y dentro cierra el círculo
  (evento de dominio en `200`, par `failed` si no). `onTomarRequest` → `_atender(e,
  'tomar', 'encolado-excepcion.tomar.response', async (d) => {...})` y publica el par
  `failed` si `status !== 200`. `onDocumentoDescuadrado` **no** usa `_atender`.
- Proyecciones `_encolar` (escritura + guard + idempotencia) y `_tomar` (desatasco que
  marca); helpers `_marcarTomada`, `_pendientes`, `_naturaleza`, `_destino`,
  `_obtenerOCrear`; lectura directa `colaDe(pid, destino)`. Tools `toolEncolar` /
  `toolTomar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimenta `control-cuadre-documento` (A4.3) vía
  `contabilidad.documento_descuadrado` y `contrapartida-asistida` (A6.1) cuando
  `requiere_cola`; lo consumen `aviso-revision` (A8.2), `panel-proceso-contable` y
  `desatasco-entrada`.
