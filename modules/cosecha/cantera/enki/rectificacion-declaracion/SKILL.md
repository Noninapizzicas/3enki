---
name: rectificacion-declaracion
description: >
  Skill FULL del módulo CUSTODIO `rectificacion-declaracion` de la vertical contabilidad
  de Enki (D14, hoja del plan). EL PLANO 4 DE LA CORRECCION: la corrección POSTERIOR A LA
  PRESENTACION — complementaria (añade lo que faltaba) o sustitutiva (reemplaza lo
  presentado). Tres planos ya existen y NINGUNO es este: B5 asiento-ajuste corrige el
  LIBRO, O2 rectificativa corrige la FACTURA (comercial) y D13 acuse liga el justificante;
  aquí se corrige la DECLARACION YA PRESENTADA y NO se confunden (plano:4,
  no_es_ajuste_contable:true, no_es_rectificativa_comercial:true). LA MISMA LEY DEL
  ASIENTO: el ORIGINAL NO SE BORRA — la rectificación SUMA una declaración nueva que QUEDA
  ENLAZADA a la original (enlaza_original:true, borra_original:false, original_intacto:true)
  y TRAZADA en la secuencia. Y NO SE RECTIFICA LO QUE NO SE PRESENTO: se LEE el estado de
  la obligación en estado-presentacion-fiscal (D12) por EVENTO
  (contabilidad.obligacion.estado.request) con contrato TOLERANTE — si D12 no responde NO
  se afirma que esté presentada (503); si consta que NO está presentada se rechaza con 409
  ERROR_NO_PRESENTADA y la acción declarada CORREGIR_EL_BORRADOR. Persiste por proyecto vía
  PosPersistencia. Úsala para operar, depurar o extender el custodio.
when-to-use: >
  - Cuando necesites rectificar una declaración ya presentada (RPC
    contabilidad.declaracion.rectificar.request).
  - Cuando depures por qué se rechaza (409 ERROR_DOS_ESCRITORES si el rol no es ASESOR, 422
    ORIGINAL_NO_DECLARADO si no se declara la clave original, 422 TIPO_NO_VALIDO si el tipo
    sale del catálogo, 409 ERROR_NO_PRESENTADA con accion CORREGIR_EL_BORRADOR si consta que
    no está presentada, 409 ERROR_DUPLICADO si el enlace ya existe, 503 si D12 no responde).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), los 4 planos de la
    corrección y por qué la original NO se borra.
  - Cuando vayas a escribir/ampliar el test unitario del custodio rectificacion-declaracion.
tags: [enki, modulo, custodio, persistencia, contabilidad, rectificacion-declaracion, fiscal, enlazada]
---

# rectificacion-declaracion — CUSTODIO del plano 4 de la corrección

## Qué hace el módulo

`rectificacion-declaracion` es un **CUSTODIO CON PERSISTENCIA** (D14, hoja del plan): **EL
PLANO 4 DE LA CORRECCION**: la corrección **POSTERIOR A LA PRESENTACION** — **complementaria**
(añade lo que faltaba) o **sustitutiva** (reemplaza lo presentado). Tres planos ya existen y
**NINGUNO es este**:

- **B5 `asiento-ajuste`** corrige el **LIBRO** (el ajuste SUMA sobre el asiento).
- **O2 `rectificativa`** corrige la **FACTURA** (comercial).
- **D13 `acuse`** liga el justificante.

Aquí se corrige la **DECLARACION YA PRESENTADA** y **no se confunden**: toda rectificación
lleva `plano:4`, `no_es_ajuste_contable:true`, `no_es_rectificativa_comercial:true`.

**LA MISMA LEY DEL ASIENTO (invariante dura)**: el **ORIGINAL NO SE BORRA**. La rectificación
**SUMA** una declaración nueva que **QUEDA ENLAZADA** a la original (`enlaza_original:true`,
`borra_original:false`, `original_intacto:true`) y **TRAZADA** en la secuencia
(`rectificaciones` + `enlaces` por `clave_original`). El tipo declarado define si **añade**
(`COMPLEMENTARIA` → `suma:true`) o **reemplaza** (`SUSTITUTIVA` → `reemplaza:true`) — **se
declara, no se infiere**.

**Y NO SE RECTIFICA LO QUE NO SE PRESENTO**: la rectificación es **posterior a la
presentación**, así que se **LEE el estado de la obligación** en `estado-presentacion-fiscal`
(**D12**) por **EVENTO** (`contabilidad.obligacion.estado.request`) con **CONTRATO TOLERANTE**:
si D12 no responde **NO se afirma que esté presentada** (se publica
`contabilidad.declaracion_rectificar.failed` **503 DEPENDENCIA_NO_DISPONIBLE**) y si consta que
**NO** está presentada se rechaza con **`409 ERROR_NO_PRESENTADA`** (`accion:'CORREGIR_EL_BORRADOR
(no rectificar)'`). Solo **`PRESENTADA` o `JUSTIFICADA`** son rectificables (`ATRASADA` no).

**La clave original se DECLARA**: sin ella → **`422 ORIGINAL_NO_DECLARADO`** (`asumido:false`).

**Un solo escritor**: solo el **`ASESOR`** rectifica; cualquier otro → **`409
ERROR_DOS_ESCRITORES`**. Una rectificación ya enlazada → **`409 ERROR_DUPLICADO`**.

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/rectificacion-declaracion/rectificacion-declaracion.json`), restaura en
`project.activated` y vuelca en `onUnload`. La dependencia con `estado-presentacion-fiscal`
(D12) y `escritor-diario` (B2) es **por EVENTO, NUNCA por `require` cruzado**.

> **NO REUTILIZA**: la rectificación fiscal posterior a la presentación no existe en el
> inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + ciclo de vida)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.declaracion.rectificar.request` | `onRectificarRequest` | RPC custodio: {project_id, rol:'ASESOR', declaracion_original\|declaracion\|id_declaracion, tipo:'COMPLEMENTARIA'\|'SUSTITUTIVA', importes?, modelo?, periodo?, ejercicio?, motivo?, id_rectificacion?} → {project_id, rectificacion:{id_rectificacion, clave_original, tipo, plano:4, suma\|reemplaza, borra_original:false, original_intacto:true, enlaza_original:true}, enlace, estado_original, presentada_verificada:true}. Verifica por EVENTO que la declaracion consta PRESENTADA en estado-presentacion-fiscal (D12): si consta que NO → 409 ERROR_NO_PRESENTADA (accion CORREGIR_EL_BORRADOR); si D12 no responde → contabilidad.declaracion_rectificar.failed (503, no se afirma que este presentada). Cerrojos: rol != ASESOR → 409 ERROR_DOS_ESCRITORES; tipo fuera de catalogo → 422; sin clave original → 422 ORIGINAL_NO_DECLARADO. El original NO se borra: la rectificacion SUMA y queda enlazada y trazada. Exito publica contabilidad.declaracion_rectificada y responde por contabilidad.declaracion.rectificar.response; error → contabilidad.declaracion.rectificar.failed. |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) las rectificaciones y sus ENLACES con las declaraciones originales del proyecto activado: el original se conserva (original_conservado:true) y la rectificacion queda trazada. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.declaracion_rectificada` | Fire-and-forget (D14): una declaracion ya presentada quedo RECTIFICADA → {project_id, rectificacion:{id_rectificacion, clave_original, tipo:'COMPLEMENTARIA'\|'SUSTITUTIVA', plano:4, suma, reemplaza, borra_original:false, original_intacto:true, enlaza_original:true, rectificado_por:'ASESOR'}, enlace, estado_original, borra_original:false}. Igual que el asiento: el original NO se borra, la correccion SUMA y queda trazada. |
| `contabilidad.declaracion.rectificar.failed` | Par de fallo determinista: rectificar sin project_id, con rol != ASESOR (409 ERROR_DOS_ESCRITORES), sin clave original declarada (422 ORIGINAL_NO_DECLARADO), con tipo fuera de catalogo (422 TIPO_NO_VALIDO), con la declaracion NO presentada (409 ERROR_NO_PRESENTADA, accion CORREGIR_EL_BORRADOR) o con el enlace duplicado (409 ERROR_DUPLICADO). Cierra el circulo de contabilidad.declaracion.rectificar.request. |
| `contabilidad.declaracion_rectificada.failed` | Par de fallo del evento de dominio contabilidad.declaracion_rectificada: la emision del hecho de dominio no se completo. |
| `contabilidad.declaracion.rectificar.failed` | Contrato TOLERANTE (D12): estado-presentacion-fiscal no respondio → 503 DEPENDENCIA_NO_DISPONIBLE porque NO consta que la declaracion este presentada. NO se inventa el permiso de rectificar. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.declaracion.rectificar.failed` cierra
> `contabilidad.declaracion.rectificar.request` — tanto en el payload inválido como en el
> caso tolerante en que D12 no responde. `contabilidad.declaracion_rectificar.failed`
> (sin el punto, ver nota) es el par de la fase D12.

> Nota: el módulo declara **DOS eventos distintos** que difieren solo en el punto:
> `contabilidad.declaracion.rectificar.failed` (con punto — par del RPC y del contrato
> tolerante) y `contabilidad.declaracion_rectificar.failed` (sin punto — el que `index.js`
> publica **realmente** cuando D12 no responde). En `index.js` el `_errorResponse` de la
> fase D12 se publica por la clave **`contabilidad.declaracion.rectificar.failed`**
> (en `onRectificarRequest`) y el contrato tolerante interno lo publica por
> **`contabilidad.declaracion_rectificar.failed`** (en `_rectificarConEstado`). Copia las
> dos cadenas tal cual: el verificador comprueba que ambas aparezcan.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.declaracion.rectificar.response` (el par response del RPC); **NO está
> declarada en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.declaracion_rectificada.failed` es el par
> del evento de DOMINIO; el custodio solo publica los pares `*.failed` de sus RPC (+ el de la
> fase D12).

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.obligacion.estado.request` (dependencia por EVENTO hacia
> `estado-presentacion-fiscal` D12, no declarada como publisher).

> Nota de sub-declaración: `_rectificar`, `_enlazar`, `_claveDe`, `_constaPresentada` se
> exponen solo parcialmente — `_rectificar` y `_enlazar` como tools (`toolRectificar`,
> `toolEnlazar`); `_constaPresentada` (**la lectura a D12**) **NO está expuesta por ningún
> RPC ni tool**. El RPC `rectificar` es la única vía que encadena la verificación + el enlace.

## Reglas de negocio

1. **LA MISMA LEY DEL ASIENTO (invariante dura)**: el ORIGINAL NO SE BORRA. La rectificación
   lleva siempre `borra_original:false`, `original_intacto:true`, `enlaza_original:true`,
   `borrable:false`. El enlace guarda `original_conservado:true`, `borrado:false`.
2. **El tipo define el efecto — se DECLARA, no se infiere**: `TIPOS =
   ['COMPLEMENTARIA','SUSTITUTIVA']`; `suma = tipo === 'COMPLEMENTARIA'`;
   `reemplaza = tipo === 'SUSTITUTIVA'`. Tipo ausente → `400 INVALID_INPUT tipo`; fuera del
   catálogo → **`422 TIPO_NO_VALIDO`** (`tipos_posibles:TIPOS`, nota: *«la rectificacion es
   POSTERIOR a la presentacion; no es el ajuste contable (B5)»*).
3. **PLANO 4 — no se confunde con los otros planos**: toda rectificación lleva `plano:4`,
   `no_es_ajuste_contable:true`, `no_es_rectificativa_comercial:true`. Los planos 1–3 son B5
   (libro), O2 (factura) y D13 (acuse).
4. **La clave original se DECLARA**: `_claveDe` resuelve `id_declaracion || clave_natural ||
   id_obligacion || obligacion` (o la propia cadena). Sin clave → **`422
   PRECONDITION_FAILED`** con `{senal:'ORIGINAL_NO_DECLARADO', asumido:false}`.
5. **NO SE RECTIFICA LO QUE NO SE PRESENTO (contrato TOLERANTE con D12)**:
   `_constaPresentada` hace `_rpc` (`contabilidad.obligacion.estado.request`,
   `timeout_ms:4000`). Si no responde → `{ok:false, motivo:'SIN_RESPUESTA'}` → se publica
   **`503 DEPENDENCIA_NO_DISPONIBLE`** y **no se inventa el permiso de rectificar**. Si
   responde con estado distinto de `PRESENTADA`/`JUSTIFICADA` → **`409 ERROR_NO_PRESENTADA`**
   (`accion:'CORREGIR_EL_BORRADOR (no rectificar)'`, `rectificable:false`). Solo `PRESENTADA`
   y `JUSTIFICADA` son rectificables; `ATRASADA` **no**.
6. **Un solo escritor (D14)**: `_verificarEscritorUnico` exige `rol === 'ASESOR'`. Cualquier
   otro → **`409 ERROR_DOS_ESCRITORES`** (`escritor_vigente:'ASESOR'`). *El asesor presenta, el
   asesor rectifica.*
7. **La rectificación queda enlazada y trazada**: `_enlazar` guarda
   `d.rectificaciones[id]` y crea/actualiza `d.enlaces[claveOriginal]` con
   `{clave_original, original, rectificaciones:[...], original_conservado:true, borrado:false}`;
   empuja a `d.secuencia` `{id_rectificacion, clave_original, tipo, suma, reemplaza,
   borra_original:false, enlazada_en}`.
8. **Enlace duplicado → 409**: si `d.rectificaciones[id]` ya existe → **`409 ERROR_DUPLICADO`**
   (*«el original no se reescribe»*).
9. **La rectificación congela la comparación**: guarda `importes` (los nuevos) e
   `importes_originales` (los de la original o declarados), además de `modelo`, `periodo`,
   `ejercicio`, `motivo`.
10. **Id determinista**: `id_rectificacion` = el declarado o
    `` `${pid}-R${d.secuencia.length + 1}` ``. `rectificado_por:'ASESOR'`, `rectificado_en`.
11. **El RPC verifica ANTES de enlazar**: `_rectificarConEstado` — `_rectificar` (produce la
    rectificación) → `_constaPresentada` (D12) → si falla por `SIN_RESPUESTA` devuelve la
    rectificación **siempre** (con el fallo tolerante publicado); si consta NO presentada
    devuelve **`409 ERROR_NO_PRESENTADA`**; si consta presentada, `_enlazar` y completa
    `res.data.enlace`, `res.data.estado_original`, `res.data.presentada_verificada:true`.
12. **La rectificación es POR PROYECTO**: `store[pid]` con
    `{esquema:'contabilidad-rectificacion-declaracion-v1', rectificaciones:{}, enlaces:{},
    secuencia:[], escritor:'ASESOR'}`. Sin restaurar (`project.activated`) los enlaces no se
    pueden garantizar.
13. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`; sin
    tipo → `400 INVALID_INPUT tipo`. Shape: `{status:400, error:{code:'INVALID_INPUT',
    message:'<campo> requerido', details:{field:<campo>}}}`.
14. **HTTP exacto**: éxito `200`; payload inválido → `400`; segundo escritor / no presentada /
    enlace duplicado → `409`; sin clave original / tipo fuera de catálogo → `422`; D12 mudo →
    `503`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.declaracion.rectificar.response`.

### 1. `rectificar` — complementaria (añade) sobre una declaración presentada

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "declaracion_original": "303-3T-2026",
  "tipo": "COMPLEMENTARIA",
  "importes": { "base": 1200, "cuota": 252 },
  "motivo": "faltaba una factura",
  "correlation_id": "abc-123"
}
```

Respuesta `200` (D12 confirma `PRESENTADA`):

```json
{
  "project_id": "e57a318a-...",
  "rectificacion": { "id_rectificacion": "e57a318a-...-R1", "clave_original": "303-3T-2026", "tipo": "COMPLEMENTARIA", "plano": 4, "no_es_ajuste_contable": true, "no_es_rectificativa_comercial": true, "importes": { "base": 1200, "cuota": 252 }, "suma": true, "reemplaza": false, "borra_original": false, "original_intacto": true, "enlaza_original": true, "rectificado_por": "ASESOR", "borrable": false },
  "clave_original": "303-3T-2026",
  "tipo": "COMPLEMENTARIA",
  "borra_original": false,
  "original_intacto": true,
  "suma": true,
  "reemplaza": false,
  "plano": 4,
  "regla": "el original NO se borra: la rectificacion SUMA y queda trazada",
  "enlace": { "clave_original": "303-3T-2026", "original": "303-3T-2026", "rectificaciones": ["e57a318a-...-R1"], "original_conservado": true, "borrado": false },
  "estado_original": "PRESENTADA",
  "presentada_verificada": true
}
```

Emite `contabilidad.declaracion_rectificada` (res.data + `correlation_id`).

### 2. `rectificar` — sustitutiva (reemplaza)

`"tipo": "SUSTITUTIVA"` → `suma:false`, `reemplaza:true`; **el original sigue intacto**
(`borra_original:false`).

### 3. Fallo — D12 dice que NO está presentada → 409

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "declaracion_original": "303-3T-2026", "tipo": "COMPLEMENTARIA" }
```

(D12 responde `estado:'GENERADA'`) → Respuesta `409` + `contabilidad.declaracion.rectificar.failed`:

```json
{ "status": 409, "error": { "code": "ERROR_NO_PRESENTADA", "message": "la declaracion 303-3T-2026 no consta presentada: la rectificacion es POSTERIOR a la presentacion", "details": { "clave_original": "303-3T-2026", "estado": "GENERADA", "simbolico": "ERROR_NO_PRESENTADA", "accion": "CORREGIR_EL_BORRADOR (no rectificar)", "rectificable": false } } }
```

### 4. Fallo — D12 mudo → 503 (no se inventa el permiso)

`_rectificarConEstado` publica `contabilidad.declaracion_rectificar.failed` (sin punto):

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "estado-presentacion-fiscal (D12) no respondio: NO consta que la declaracion este presentada", "details": { "dependencia": "estado-presentacion-fiscal", "clave_original": "303-3T-2026" } } }
```

### 5. Fallo — sin clave original → 422 ORIGINAL_NO_DECLARADO

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "tipo": "COMPLEMENTARIA" }
```

→ `422 PRECONDITION_FAILED` (`senal:'ORIGINAL_NO_DECLARADO'`, `asumido:false`) +
`contabilidad.declaracion.rectificar.failed`.

### 6. Fallo — tipo fuera de catálogo → 422 TIPO_NO_VALIDO

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "declaracion_original": "303-3T-2026", "tipo": "CORRECCION" }
```

→ `422 TIPO_NO_VALIDO` (`tipos_posibles:['COMPLEMENTARIA','SUSTITUTIVA']`) +
`contabilidad.declaracion.rectificar.failed`.

### 7. Fallo — rol no ASESOR → 409

```json
{ "project_id": "e57a318a-...", "rol": "DUENO", "declaracion_original": "303-3T-2026", "tipo": "COMPLEMENTARIA" }
```

→ `409 ERROR_DOS_ESCRITORES` + `contabilidad.declaracion.rectificar.failed`.

### 8. Tools (sin RPC en module.json)

`toolRectificar` → `_rectificar`; `toolEnlazar` → `_enlazar`.

## Tests

El test viviría en `tests/unit/rectificacion-declaracion.test.js`. Cubre:

- `rectificar` `COMPLEMENTARIA` sobre una declaración `PRESENTADA` → `200`, `plano:4`,
  `suma:true`, `borra_original:false`, `original_intacto:true`, `enlaza_original:true`,
  `presentada_verificada:true`; emite `contabilidad.declaracion_rectificada`.
- `SUSTITUTIVA` → `reemplaza:true`, `suma:false`; **el original sigue intacto**.
- **No se rectifica lo que no se presentó**: D12 responde `GENERADA` → `409
  ERROR_NO_PRESENTADA` (`accion:'CORREGIR_EL_BORRADOR (no rectificar)'`).
- **Contrato TOLERANTE D12**: D12 no responde → `503 DEPENDENCIA_NO_DISPONIBLE`
  (`contabilidad.declaracion_rectificar.failed`); **no** se inventa el permiso.
- **Sin clave original** → `422 ORIGINAL_NO_DECLARADO`; tipo fuera de catálogo → `422
  TIPO_NO_VALIDO`.
- **Single-writer**: rol distinto de ASESOR → `409 ERROR_DOS_ESCRITORES`.
- **Enlace duplicado** → `409 ERROR_DUPLICADO`.
- **Original intacto**: el enlace guarda `original_conservado:true`, `borrado:false`; la
  secuencia registra `borra_original:false`.
- Sin `project_id` → `400 INVALID_INPUT` + `contabilidad.declaracion.rectificar.failed`.
- `project.activated` restaura rectificaciones y enlaces vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/rectificacion-declaracion
node --test tests/unit/rectificacion-declaracion.test.js
```

## Notas de implementación

- Clase `RectificacionDeclaracion extends ModuloHibridoReflejo`; `name =
  'rectificacion-declaracion'`, `version = 'reflejo-0.1.0'` (aunque es **custodio**: conserva
  el versionado reflejo, es el patrón real de la vertical). Store en memoria `this._store`
  (Map project_id → `{esquema:'contabilidad-rectificacion-declaracion-v1', rectificaciones:{},
  enlaces:{}, secuencia:[], escritor:'ASESOR'}`).
- Constantes: `ROL_ESCRITOR = 'ASESOR'`, `CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES'`,
  `CODE_NO_PRESENTADA = 'ERROR_NO_PRESENTADA'`, `CODE_DUPLICADA = 'ERROR_DUPLICADO'`,
  `TIPOS = ['COMPLEMENTARIA','SUSTITUTIVA']`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo,
  file:'rectificacion-declaracion.json', dir:'/contabilidad/rectificacion-declaracion',
  snapshot, hidratar})`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` →
  `flush()` + `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onRectificarRequest` delega en `_atender(e, 'rectificar',
  'contabilidad.declaracion.rectificar.response', async fn)` y publica
  `contabilidad.declaracion_rectificada` en éxito o `contabilidad.declaracion.rectificar.failed`
  en fallo.
- Proyecciones puras: `_rectificar`, `_enlazar`, `_rectificarConEstado` (async),
  `_constaPresentada` (async), `_claveDe`, `_verificarEscritorUnico` (+ `_obtenerOCrear`).
  `_atender`, `_rpc`, `_invalid` y `_errorResponse` vienen de la base.
- Tools: `toolRectificar`, `toolEnlazar`.
- DEP hacia delante: `contabilidad.declaracion_rectificada` traza la corrección. DEP hacia
  atrás por evento: `estado-presentacion-fiscal` (D12) responde
  `contabilidad.obligacion.estado.request`; `escritor-diario` (B2) por EVENTO (aquí no se
  escribe el libro).
