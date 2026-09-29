---
name: historial-proceso-contable
description: >
  Skill FULL del módulo CUSTODIO `historial-proceso-contable` de la vertical
  contabilidad de Enki. El registro APPEND-ONLY del PROCESO DE ENTRADA — lo
  PROCESADO y lo FALLADO con su rastro (asunto, origen, motivo, fases, cola,
  cuándo); un solo escritor y nada se borra. Es el historial del proceso, no la
  traza del asiento. Persiste por proyecto con PosPersistencia. Úsala para
  operar, depurar o extender el custodio, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites anotar un registro del proceso de entrada (RPC
    historial-proceso-contable.anotar.request), leyéndolo por `historialDe(pid)`.
  - Cuando depures por qué se rechaza una anotación (403 PERMISSION_DENIED si el
    rol no es HISTORIAL_PROCESO_CONTABLE —segundo escritor— o 400 INVALID_INPUT
    si falta `project_id`/`registro` o el registro no declara su `resultado`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del custodio (append-only, un solo escritor, resultado exigido,
    el abierto se declara).
  - Cuando vayas a escribir/ampliar el test unitario del custodio
    historial-proceso-contable.
tags: [enki, modulo, custodio, contabilidad, historial-proceso-contable]
---

# historial-proceso-contable — CUSTODIO APPEND-ONLY del proceso de entrada

## Qué hace el módulo

`historial-proceso-contable` es un **CUSTODIO CON PERSISTENCIA** (P2, hoja del plan): el
registro **APPEND-ONLY e INMUTABLE** de lo **PROCESADO** y lo **FALLADO**, con su **rastro**
(asunto, origen, motivo, fases, si cayó a cola, cuándo).

> ℹ️ **Es el historial del PROCESO DE ENTRADA — no del asiento**: `!= traza-asiento` (B4), que
> registra el **ASIENTO**. Aquí se apila **qué pasó con el proceso de entrada** (entró, se
> procesó, falló, quedó en cola), no el contenido contable del asiento.

Atributos del diseño: `cola:EncoladoExcepcion`, `historial:HistorialProcesoContable`.
Proyección: `_anotar` (escritura) y `historialDe(pid)` (lectura directa).

Invariantes:

- **APPEND-ONLY**: cada registro se **APILA** con su **secuencia**; **NADA se borra, NADA se
  sobrescribe**. El historial **solo crece**.
- **UN SOLO ESCRITOR de la parcela**: el anotador (`HISTORIAL_PROCESO_CONTABLE`); cualquier otro
  rol es rechazado (**segundo escritor → `403`**).
- **El RESULTADO es obligatorio** (`PROCESADO|FALLADO`): sin resultado **NO se anota** (dato
  ausente = desconocido: no se aprime un resultado que no consta).
- **El ABIERTO se declara, no se oculta**: un registro sin motivo se apila **con su hueco**.
- **Persiste** por proyecto con **PosPersistencia** (storage
  `/contabilidad/historial-proceso-contable/historial-proceso-contable.json`), **restaura** en
  `project.activated` y **vuelca** en `onUnload`.

Publica `contabilidad.proceso_anotado` (lo consume el panel del proceso, P1). Cierra el círculo
con `historial-proceso-contable.anotar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `historial-proceso-contable.anotar.request` | `onAnotarRequest` | RPC custodio: {project_id, rol:'HISTORIAL_PROCESO_CONTABLE', registro:{resultado:'PROCESADO'\|'FALLADO', asunto?, origen?, motivo?, fases?, en_cola?, destino_cola?, detalle?, hecho_id?, documento_id?, en?}} → {project_id, registro, anotado:true, total, append_only:true, abierto}. Guard de escritor (rol != HISTORIAL_PROCESO_CONTABLE → 403); append-only (el registro se apila, jamás se sobrescribe); sin resultado declarado → 400. Exito → publica contabilidad.proceso_anotado y responde por historial-proceso-contable.anotar.response; fallo → historial-proceso-contable.anotar.failed. |
| `project.activated` | `onProjectActivated` | Restaura el historial del proceso (append-only) del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `historial-proceso-contable.anotar.response` | Respuesta RPC correlada de historial-proceso-contable.anotar.request → {request_id, status:200, data:{registro, anotado:true, total, append_only:true, abierto}}. Emitida por el helper _atender. |
| `historial-proceso-contable.anotar.failed` | Par de fallo determinista (P2): rol != HISTORIAL_PROCESO_CONTABLE (403 PERMISSION_DENIED), registro o project_id ausente, o registro sin resultado declarado (400) → {status, error:{code, message, details?}}. Cierra el circulo de historial-proceso-contable.anotar.request. |
| `contabilidad.proceso_anotado` | Fire-and-forget (P2): el proceso de entrada quedo ANOTADO (append-only) → {project_id, registro, resultado:'PROCESADO'\|'FALLADO', anotado:true, correlation_id}. Lo consume el panel del proceso (P1) para componer su latido. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `historial-proceso-contable.anotar.failed` cierra el círculo de
> `historial-proceso-contable.anotar.request` cuando `_anotar` devuelve status ≠ 200
> (`400 INVALID_INPUT` o `403 PERMISSION_DENIED`).

> Nota de honestidad (cruce con `index.js`): `onAnotarRequest` publica
> `contabilidad.proceso_anotado` **solo si `_anotar` devuelve `200`** (registro apilado). La rama
> `else` publica `historial-proceso-contable.anotar.failed`. El evento de dominio **siempre**
> lleva `resultado` (sacado de `res.data.registro.resultado`) y `anotado:true`.

> Nota: el custodio expone `historialDe(pid)` como **lectura directa** para otras hojas del mismo
> proceso (devuelve una **copia** del array, no muta) — no es un evento del bus, no figura en
> `module.json`. Tampoco figuran `_obtenerOCrear`, `_resultado`, `_anotar` (proyecciones/utilidades
> internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **GUARD DE ESCRITOR (un solo escritor)**: `input.rol` debe ser exactamente
   `ROL_ESCRITOR = 'HISTORIAL_PROCESO_CONTABLE'`. Si no → `403 PERMISSION_DENIED` con
   `{rol_esperado:'HISTORIAL_PROCESO_CONTABLE', rol_recibido: input.rol ?? null}` y mensaje «solo
   el anotador (HISTORIAL_PROCESO_CONTABLE) puede escribir el historial del proceso». **Un segundo
   escritor en la parcela jamás escribe.**
3. **El `registro` es obligatorio**: `input.registro || input.r`; ausente/no objeto →
   `400 INVALID_INPUT` (`field:'registro'`).
4. **El RESULTADO es obligatorio** (`_resultado`): `r.resultado` ?? `r.estado`, normalizado a
   MAYÚSCULAS; solo se reconoce de `RESULTADOS = {PROCESADO, FALLADO}`. Sin resultado declarado
   (o un valor fuera del conjunto) → `400 INVALID_INPUT` (`field:'registro.resultado'`). **No se
   aprime un resultado que no consta.**
5. **El registro anotado (APPEND-ONLY)**: se construye
   `{id:<pid>-p<n>, secuencia:<n>, resultado, asunto, origen, motivo, fases:[], en_cola:<bool>,
   destino_cola, detalle, hecho_id, documento_id, anotado_por:'HISTORIAL_PROCESO_CONTABLE',
   en:<ISO>}` y se **apila** (`push`). `n = registros.length + 1`. **Nunca se sobrescribe.**
   - `fases`: si `Array.isArray(r.fases)` → sus strings; si no, `[]`.
   - `en_cola`: solo `true` si `r.en_cola === true` (booleano estricto); si no, `false`.
   - `en`: el declarado (`r.en`) o el ISO actual.
   - Campos ausentes (`asunto`, `origen`, `motivo`, `destino_cola`, `hecho_id`, `documento_id`) →
     `null`; `detalle` solo si es objeto.
6. **El motivo es declarable, el abierto se declara**: `motivo` recortado o `null`. Sin motivo,
   `abierto.motivo = 'el registro no declaró un motivo (se anota el hueco, no se inventa)'`.
7. **La respuesta**: `{project_id, registro, anotado:true, total:<n>, append_only:true,
   abierto:{motivo}}`. `total` es el tamaño del historial tras apilar (solo crece).
8. **Persistencia (PosPersistencia)**: store `this._historiales = Map<project_id,
   {esquema:'contabilidad-historial-proceso-v1', registros:[...]}>`; cada escritura llama
   `marcarDirty(pid)`. `onProjectActivated` → `restaurar(project_id)`. `onUnload` → `flush()` +
   `detener()`.
9. **`_obtenerOCrear(pid)`**: crea la parcela vacía si no existe (y marca dirty); es la lectura
   de arranque del proyecto.
10. **`historialDe(pid)`**: **copia** del array de registros del proyecto (`[...h.registros]`),
    solo lectura; sin proyecto → `[]`. **No muta ni expone el array interno.**
11. **HTTP exacto**: éxito `200`; `project_id` o `registro` ausentes, o registro sin resultado →
    `400`; rol no-anotador → `403`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `historial-proceso-contable.anotar.response` y emite `contabilidad.proceso_anotado`.

### 1. `anotar` — apilar un proceso PROCESADO

```json
{
  "project_id": "e57a318a-...",
  "rol": "HISTORIAL_PROCESO_CONTABLE",
  "registro": {
    "resultado": "PROCESADO",
    "asunto": "factura FV-1001 de proveedor X",
    "origen": "buzón de entrada",
    "motivo": "documento reconocido y asentado",
    "fases": ["recibido", "reconocido", "asentado"],
    "en_cola": false,
    "hecho_id": "H-1001",
    "documento_id": "D-77"
  },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "registro": {
    "id": "e57a318a-...-p1",
    "secuencia": 1,
    "resultado": "PROCESADO",
    "asunto": "factura FV-1001 de proveedor X",
    "origen": "buzón de entrada",
    "motivo": "documento reconocido y asentado",
    "fases": ["recibido", "reconocido", "asentado"],
    "en_cola": false,
    "destino_cola": null,
    "detalle": null,
    "hecho_id": "H-1001",
    "documento_id": "D-77",
    "anotado_por": "HISTORIAL_PROCESO_CONTABLE",
    "en": "2026-09-30T...:00.000Z"
  },
  "anotado": true,
  "total": 1,
  "append_only": true,
  "abierto": { "motivo": null }
}
```

Emite `contabilidad.proceso_anotado` (lo consume el panel del proceso, P1):

```json
{ "project_id": "e57a318a-...", "registro": { "...": "..." }, "resultado": "PROCESADO", "anotado": true, "correlation_id": "abc-123" }
```

### 2. `anotar` — apilar un FALLADO que cayó a cola (el abierto se declara)

Un registro FALLADO sin `motivo` se apila igual: sale con `motivo:null` y
`abierto.motivo` declarando el hueco. Con `en_cola:true` y `destino_cola:"DUENO"` el rastro
declara que esperó en la cola del dueño.

### 3. Fallo — segundo escritor (rol ajeno)

```json
{ "project_id": "e57a318a-...", "rol": "OTRO", "registro": { "resultado": "PROCESADO" } }
```

Respuesta `403` + `historial-proceso-contable.anotar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el anotador (HISTORIAL_PROCESO_CONTABLE) puede escribir el historial del proceso", "details": { "rol_esperado": "HISTORIAL_PROCESO_CONTABLE", "rol_recibido": "OTRO" } } }
```

### 4. Fallo — el registro no declara su resultado

```json
{ "project_id": "e57a318a-...", "rol": "HISTORIAL_PROCESO_CONTABLE", "registro": { "asunto": "sin resultado" } }
```

Respuesta `400` + `historial-proceso-contable.anotar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "registro.resultado requerido", "details": { "field": "registro.resultado" } } }
```

### 5. Fallo — falta el registro

```json
{ "project_id": "e57a318a-...", "rol": "HISTORIAL_PROCESO_CONTABLE" }
```

Respuesta `400` + `historial-proceso-contable.anotar.failed` (`field:'registro'`).

## Tests

El test unitario de la vertical vive en `tests/unit/historial-proceso-contable.test.js`. Cubre:

- `anotar` con `rol:'HISTORIAL_PROCESO_CONTABLE'` y `resultado:'PROCESADO'` → `200`,
  `anotado:true`, `append_only:true`, `secuencia:1`, y **emite** `contabilidad.proceso_anotado`.
- **APPEND-ONLY**: dos anotaciones del mismo proyecto → `total:2` con `secuencia` 1 y 2; el
  registro previo **no se muta** ni se sobrescribe.
- **UN SOLO ESCRITOR**: `rol` distinto → `403 PERMISSION_DENIED` +
  `historial-proceso-contable.anotar.failed` (con `rol_esperado`/`rol_recibido`).
- Registro **sin `resultado`** (o con resultado fuera de `PROCESADO|FALLADO`) → `400
  INVALID_INPUT` (`field:'registro.resultado'`); **no se aprime un resultado que no consta**.
- Registro sin `motivo` → se apila igual y el hueco se declara en `abierto.motivo`.
- `fases` ausente → `[]`; `en_cola` solo `true` si `=== true`; campos ausentes → `null`.
- `project.activated` **restaura** el historial del proyecto desde el storage; `onUnload` hace
  `flush()`.
- `historialDe(pid)` devuelve una **copia** (no muta); sin proyecto → `[]`.
- `project_id` ausente → `400 INVALID_INPUT`; `toolAnotar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `HistorialProcesoContable extends ModuloHibridoReflejo`; `name =
  'historial-proceso-contable'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._historiales = new Map()` (`project_id → {esquema, registros:[append-only]}`).
- Constantes: `ROL_ESCRITOR = 'HISTORIAL_PROCESO_CONTABLE'`, `RESULTADOS = new Set(['PROCESADO',
  'FALLADO'])`, esquema `'contabilidad-historial-proceso-v1'`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:'historial-proceso-contable.json',
  dir:'/contabilidad/historial-proceso-contable', snapshot, hidratar})` desde
  `modules/contabilidad-entrada/historial-proceso-contable/` (DOS niveles →
  `../../_shared/pos-persistencia`). `onProjectActivated` → `restaurar(project_id)`; `onUnload` →
  `flush()` + `detener()`; cada escritura `marcarDirty(pid)`.
- `onAnotarRequest` usa `this._atender(e, 'anotar', 'historial-proceso-contable.anotar.response',
  async (d) => {...})` con cierre de círculo (evento de dominio en `200`, par `failed` si no).
- Proyección `_anotar(input)` (**síncrona**); helpers `_obtenerOCrear`, `_resultado`; lectura
  directa `historialDe(pid)`. Tool `toolAnotar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: **ninguna**. Lo consume el panel del proceso (P1) vía `contabilidad.proceso_anotado` para
  componer el latido. El registro del **asiento** es otra pieza (`traza-asiento`, B4).
