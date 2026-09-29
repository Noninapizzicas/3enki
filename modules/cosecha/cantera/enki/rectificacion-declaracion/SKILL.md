---
name: rectificacion-declaracion
description: >
  Skill FULL del módulo CUSTODIO `rectificacion-declaracion` de la vertical contabilidad de
  Enki. EL CAMINO DE CORRECCIÓN POSTERIOR A LA PRESENTACIÓN de una declaración
  (complementaria/sustitutiva): la declaración ORIGINAL NO se borra, la rectificación SUMA
  (append-only) y queda TRAZADA con su motivo y su autor. El sistema GENERA y REGISTRA; el
  ASESOR presenta y firma. Un solo escritor (RECTIFICADOR_DECLARACION); el tipo es declarable
  y los importes entran declarados. Úsala para operar, depurar o extender el custodio, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites rectificar una declaración presentada (RPC
    rectificacion-declaracion.rectificar.request).
  - Cuando depures por qué una rectificación se rechaza (403 PERMISSION_DENIED si el rol no es
    RECTIFICADOR_DECLARACION, 400 INVALID_INPUT si falta original_clave o tipo, 422
    TIPO_NO_DECLARABLE).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del custodio (la original no se borra, la rectificación suma, queda trazada, un solo
    escritor, append-only, persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio rectificacion-declaracion.
tags: [enki, modulo, custodio, contabilidad, rectificacion-declaracion]
---

# rectificacion-declaracion — CUSTODIO CON PERSISTENCIA de la corrección posterior

## Qué hace el módulo

`rectificacion-declaracion` es un **CUSTODIO CON PERSISTENCIA** (D14, hoja del plan):
**EL CAMINO DE CORRECCIÓN POSTERIOR A LA PRESENTACIÓN** de una declaración (complementaria /
sustitutiva). Es uno de los **CUATRO planos de corrección** (`B5 asiento-ajuste` · `A13
hecho-rectificativo` · `O2 factura-rectificativa` · `D14` esta) — **TRES actos, no uno**;
**≠ `asiento-ajuste` (B5)**.

**LA INVARIANTE (invariante 3)**: la declaración **ORIGINAL NO se borra**; la rectificación
**SUMA** (append-only, `borra_original:false`, `suma:true`) y queda **TRAZADA** (liga a la
original con su **motivo** y su **autor**). Este custodio **no expone ninguna operación de
supresión**: solo apila rectificaciones y conserva la cadena original→rectificación.

El sistema **GENERA y REGISTRA**; el **ASESOR presenta y firma** la rectificación. Aquí **NO
se presenta**: cada rectificación declara `presentada_por_sistema:false` y
`firmada_por_sistema:false`.

**LA LEY ENTRA COMO DATO** (invariante 5): el **TIPO** de rectificación es **DECLARABLE**
(`tipos_declarables`); sin declarar manda el vocabulario del dominio del diseño OOP
(`complementaria` / `sustitutiva`). **NO se cablea ningún plazo, ejercicio, escala ni importe
legal**: los importes entran **DECLARADOS** (`importes`) tal cual; si no vienen, la
rectificación se registra **SIN importes** (no se inventan cifras). Sin motivo no se inventa
la causa: se declara `motivo:null`.

Depende de `estado-presentacion-fiscal` (D12) **POR EVENTO**: consulta su estado vigente para
**TRAZARLO** junto a la rectificación (lectura best-effort; **nunca un `require`**).

**UN SOLO ESCRITOR**: el rectificador (rol `RECTIFICADOR_DECLARACION`). Cualquier otro rol es
rechazado (`403`).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/rectificacion-declaracion/rectificacion-declaracion.json`), restaura en
`project.activated` y vuelca en `onUnload`. Proyección `_rectificar`. Publica
`contabilidad.declaracion_rectificada`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `rectificacion-declaracion.rectificar.request` | `onRectificarRequest` | RPC custodio (escritura, UN escritor): {project_id, rol, original_clave\|declaracion, tipo, tipos_declarables?, motivo?, importes?, obligacion?, ejercicio?, periodo?} → {rectificada:true, rectificacion:{id, original_clave, tipo, motivo, importes, estado_vigente_al_rectificar, borra_original:false, suma:true, append_only:true, traza, presentada_por_sistema:false}, rectificaciones_de_la_original}. GUARD de rol: solo RECTIFICADOR_DECLARACION (403 si otro). Tipo no declarado → 422 TIPO_NO_DECLARABLE. Sin original_clave o tipo → 400. La declaracion original NO se borra; la rectificacion SUMA (append-only) y queda trazada. El estado vigente de la obligacion se consulta a estado-presentacion-fiscal (D12) POR EVENTO. Exito → publica contabilidad.declaracion_rectificada y responde por rectificacion-declaracion.rectificar.response; fallo → rectificacion-declaracion.rectificar.failed. |
| `project.activated` | `onProjectActivated` | Ciclo de vida: restaura las rectificaciones persistidas del proyecto activado via PosPersistencia.restaurar(project_id). El custodio persiste, por eso se suscribe obligatoriamente a la activacion. |

### Publishes

| Evento | Descripción |
|---|---|
| `rectificacion-declaracion.rectificar.response` | Respuesta RPC correlada de rectificacion-declaracion.rectificar.request → {request_id, status:200, data:{rectificada, rectificacion, total_rectificaciones, rectificaciones_de_la_original, borra_original:false, suma:true}}. Emitida por el helper _atender. |
| `rectificacion-declaracion.rectificar.failed` | Par de fallo determinista (D14): rol no autorizado (403), original_clave/tipo ausente (400) o tipo no declarable (422) → {status, error:{code, message, details?}}. Cierra el circulo de rectificacion-declaracion.rectificar.request. |
| `contabilidad.declaracion_rectificada` | Fire-and-forget (D14): una declaracion presentada quedo rectificada (append-only, trazada) → {project_id, rectificacion, id, original_clave, tipo, borra_original:false, suma:true, correlation_id}. Deja constancia de que el original no se borro y la rectificacion sumo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `rectificacion-declaracion.rectificar.failed` cierra el círculo de
> `rectificacion-declaracion.rectificar.request` cuando `_rectificar` devuelve status ≠ 200
> (`400`/`403`/`422`).

> Nota de honestidad (cruce con `index.js`): `onRectificarRequest` publica
> `contabilidad.declaracion_rectificada` **solo si `status === 200 && data.rectificada`**;
> la rama `else if (res.status !== 200)` publica
> `rectificacion-declaracion.rectificar.failed`. La proyección `_rectificar` es **`async`**
> (espera el estado vigente de D12) aunque el cierre de círculo sea el mismo patrón.

> Nota: el módulo expone `rectificacionesDe(pid, original_clave)` como **lectura directa**
> para otras hojas del mismo proceso (no muta) — no es un evento del bus, no figura en
> `module.json`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente → `400
   INVALID_INPUT` (`field:'project_id'`).
2. **GUARD de escritor**: `input.rol !== 'RECTIFICADOR_DECLARACION'` → `403 PERMISSION_DENIED`
   con `{rol_esperado, rol_recibido}`.
3. **La declaración original es obligatoria**: `input.original_clave` (o su alias
   `input.declaracion`), normalizado con `String(...).trim()`; vacío → `400 INVALID_INPUT`
   (`field:'original_clave'`). **Sin original no hay rectificación.**
4. **El tipo es DECLARABLE**: `_tiposDe(input)` toma `tipos_declarables` (array, en minúsculas)
   si viene; si no, manda `['complementaria','sustitutiva']`. `input.tipo` ausente → `400
   INVALID_INPUT` (`field:'tipo'`); tipo no declarado → `422 TIPO_NO_DECLARABLE` con
   `{tipo, tipos_declarables}`.
5. **Los importes entran DECLARADOS tal cual**: `input.importes` (objeto) o `null`; **sin
   ellos no se inventan cifras**.
6. **El motivo no se inventa**: `input.motivo` o `null` (`motivo:null`). El original no se
   borra y la rectificación **SUMA**.
7. **El estado vigente se TRAZA, no se finge**: `_estadoVigente(pid, obligacion)` llama a
   `_rpc('estado-presentacion-fiscal.estado.request', {project_id, obligacion},
   {timeout_ms:4000})` y devuelve `d.estado` **solo si `d.registrada`**; sin respuesta o sin
   registro → `null` (best-effort, **nunca un `require`**). `obligacion` es
   `input.obligacion || original_clave`.
8. **LA RECTIFICACIÓN es un hecho completo**: `{id, original_clave, tipo, motivo, importes,
   obligacion, ejercicio, periodo, estado_vigente_al_rectificar, borra_original:false,
   suma:true, append_only:true, traza:{original_clave, por, en}, presentada_por_sistema:false,
   firmada_por_sistema:false, rectificada_por, rectificada_en}`.
9. **El id es determinista por proyecto**: `` `${pid}-r${n+1}` `` (n = rectificaciones
   existentes). **APPEND-ONLY**: la rectificación se **apila** y se indexa en
   `por_original`; **nunca sustituye ni reescribe nada**.
10. **El original permanece**: la respuesta declara `borra_original:false` y `suma:true`; el
    módulo **no expone operación de supresión**.
11. **Un original acumula varias rectificaciones**: `rectificaciones_de_la_original` cuenta
    las de esa clave; `total_rectificaciones` cuenta todas.
12. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)`; `project.activated` →
    `restaurar(project_id)` (reconstruye `rectificaciones` + índice `por_original`);
    `onUnload` → `flush()` + `detener()`.
13. **HTTP exacto**: éxito `200`; `project_id`/`original_clave`/`tipo` inválidos → `400`; rol
    ajeno → `403`; tipo no declarado → `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `rectificacion-declaracion.rectificar.response` y emite
`contabilidad.declaracion_rectificada`.

### 1. `rectificar` — complementaria con importes declarados

```json
{
  "project_id": "e57a318a-...",
  "rol": "RECTIFICADOR_DECLARACION",
  "original_clave": "303-2026-2T",
  "tipo": "complementaria",
  "motivo": "se omitio una cuota",
  "importes": { "base": 200, "cuota": 42 },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "rectificada": true,
  "rectificacion": {
    "id": "e57a318a-...-r1",
    "original_clave": "303-2026-2T",
    "tipo": "complementaria",
    "motivo": "se omitio una cuota",
    "importes": { "base": 200, "cuota": 42 },
    "obligacion": null,
    "ejercicio": null,
    "periodo": null,
    "estado_vigente_al_rectificar": "presentada",
    "borra_original": false,
    "suma": true,
    "append_only": true,
    "traza": { "original_clave": "303-2026-2T", "por": "RECTIFICADOR_DECLARACION", "en": "2026-09-25T..." },
    "presentada_por_sistema": false,
    "firmada_por_sistema": false,
    "rectificada_por": "RECTIFICADOR_DECLARACION",
    "rectificada_en": "2026-09-25T..."
  },
  "total_rectificaciones": 1,
  "rectificaciones_de_la_original": 1,
  "borra_original": false,
  "suma": true
}
```

Emite `contabilidad.declaracion_rectificada`:

```json
{ "project_id": "e57a318a-...", "rectificacion": { "...": "..." }, "id": "e57a318a-...-r1", "original_clave": "303-2026-2T", "tipo": "complementaria", "borra_original": false, "suma": true, "correlation_id": "abc-123" }
```

### 2. `rectificar` — segunda rectificación de la misma original (SUMA)

Misma `original_clave`, otro motivo → Respuesta `200` con `total_rectificaciones:2` y
`rectificaciones_de_la_original:2`; el `id` es `…-r2` y la primera rectificación **no se toca**.

### 3. Fallo — tipo no declarado

```json
{ "project_id": "e57a318a-...", "rol": "RECTIFICADOR_DECLARACION", "original_clave": "303-2026-2T", "tipo": "anulacion_total" }
```

Respuesta `422` + `rectificacion-declaracion.rectificar.failed`:

```json
{ "status": 422, "error": { "code": "TIPO_NO_DECLARABLE", "message": "tipo de rectificacion no declarado", "details": { "tipo": "anulacion_total", "tipos_declarables": ["complementaria", "sustitutiva"] } } }
```

### 4. Fallo — rol no autorizado

```json
{ "project_id": "e57a318a-...", "rol": "OTRO_ROL", "original_clave": "303-2026-2T", "tipo": "complementaria" }
```

Respuesta `403` + `rectificacion-declaracion.rectificar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el rectificador (RECTIFICADOR_DECLARACION) rectifica una declaracion presentada", "details": { "rol_esperado": "RECTIFICADOR_DECLARACION", "rol_recibido": "OTRO_ROL" } } }
```

## Tests

El test unitario vive en `tests/unit/rectificacion-declaracion.test.js`. Cubre:

- `rectificar` con rol correcto + original + tipo → `200 {rectificada:true}` con
  `borra_original:false`, `suma:true`, `append_only:true` y `traza`; emite
  `contabilidad.declaracion_rectificada`.
- Tipo declarable propio (`tipos_declarables`) manda sobre el vocabulario del dominio.
- Tipo no declarado → `422 TIPO_NO_DECLARABLE` + `rectificacion-declaracion.rectificar.failed`.
- Rol distinto de `RECTIFICADOR_DECLARACION` → `403 PERMISSION_DENIED`.
- Sin `original_clave`/`tipo` → `400 INVALID_INPUT`; `project_id` ausente → `400`.
- **Append-only**: dos rectificaciones de la misma original → `total_rectificaciones:2`,
  `rectificaciones_de_la_original:2`; la primera no se muta.
- Sin `importes` → la rectificación se registra con `importes:null` (no se inventan cifras);
  sin `motivo` → `motivo:null`.
- `estado_vigente_al_rectificar` consultado a `estado-presentacion-fiscal` POR EVENTO; sin
  respuesta/registro → `null`.
- `project.activated` restaura rectificaciones + índice; `rectificacionesDe(pid, clave)` lee sin mutar.
- `toolRectificar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `RectificacionDeclaracion extends ModuloHibridoReflejo`; `name =
  'rectificacion-declaracion'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._rectificaciones` (`Map<project_id, {esquema, rectificaciones:[append-only],
  por_original: Map<clave, [ids]}>`).
- Constantes: `ROL_ESCRITOR = 'RECTIFICADOR_DECLARACION'`, `TIPOS_POR_DEFECTO =
  ['complementaria','sustitutiva']`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:
  'rectificacion-declaracion.json', dir: '/contabilidad/rectificacion-declaracion',
  snapshot, hidratar})` desde `modules/contabilidad-fiscal/rectificacion-declaracion/`
  (DOS niveles → `../../_shared/pos-persistencia`). `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`; cada escritura
  `marcarDirty(pid)`.
- `onRectificarRequest` usa `this._atender(e, 'rectificar',
  'rectificacion-declaracion.rectificar.response', async (d) => {...})`; dentro hace el
  cierre de círculo. Proyección `async _rectificar(input)`; helpers `async _estadoVigente`,
  `_tiposDe`, `_obtenerOCrear`; lectura directa `rectificacionesDe(pid, original_clave)`.
  Tool `toolRectificar`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: consulta `estado-presentacion-fiscal.estado.request` (D12) POR EVENTO para trazar el
  estado vigente. Es uno de los **cuatro planos de corrección**; aquí el original no se borra
  y la rectificación suma.
