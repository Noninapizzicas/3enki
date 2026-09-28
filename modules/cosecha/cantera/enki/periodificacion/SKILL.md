---
name: periodificacion
description: >
  Skill FULL del módulo REFLEJO `periodificacion` de la vertical contabilidad de Enki (C3,
  hoja del plan). DEVENGO vs CAJA: imputa cada hecho a su PERIODO con el CRITERIO DECLARADO
  (devengo|caja|fecha_operacion|fecha_valor) y CONSERVA las DOS fechas (fecha_operacion !=
  fecha_valor) — no elige ni adivina. El criterio lo DECLARA el negocio/asesor y se lee de
  la cola de declaraciones de criterio (K9) por EVENTO contabilidad.criterio.leer.request;
  si NO está declarado, el hecho va a cola (422 CRITERIO_NO_DECLARADO) — JAMÁS se inventa
  el periodo ni se asume un criterio. Si el hecho no trae fechas → 422 SIN_FECHAS.
  DETERMINISTA: mismo hecho + mismo criterio → mismo periodo. Sin estado. Úsala para
  operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites imputar un hecho a su periodo (RPC contabilidad.periodo.imputar.request)
    y saber qué fechas conserva.
  - Cuando depures por qué un hecho queda sin periodo (422 CRITERIO_NO_DECLARADO si K9 no
    declara/no responde, 422 SIN_FECHAS, 422 CRITERIO_NO_DECLARABLE, 400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el invariante
    devengo vs caja y la conservación de las DOS fechas.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo periodificacion.
tags: [enki, modulo, reflejo, contabilidad, periodificacion, devengo, periodo]
---

# periodificacion — REFLEJO stateless · DEVENGO vs CAJA

## Qué hace el módulo

`periodificacion` es un **REFLEJO STATELESS** (C3, hoja del plan): **DEVENGO vs CAJA**.
Imputa cada hecho a su **PERIODO** con el **CRITERIO DECLARADO** (nunca cableado) y
**CONSERVA las DOS fechas** (`fecha_operacion` != `fecha_valor`) — **no elige ni adivina**.

El **criterio** lo **DECLARA** el negocio/asesor y se lee de la cola de declaraciones de
criterio (**K9 `cola-declaraciones-criterio`**) por **EVENTO**
`contabilidad.criterio.leer.request`. Si **NO está declarado** → el periodo queda
**PENDIENTE** y el hecho **va a cola**: **`422 CRITERIO_NO_DECLARADO`** — *JAMÁS se inventa
el periodo ni se asume un criterio* (invariante 7: *dato ausente = desconocido*). Si el hecho
**no trae fechas** → **`422 SIN_FECHAS`**.

Es **DETERMINISTA**: *mismo hecho + mismo criterio → mismo periodo*. Es **stateless**: sin
PosPersistencia ni `project.activated` — cada op **entra objeto, sale objeto**. La
dependencia con la cola de criterios (K9) es **por EVENTO, nunca por `require` cruzado`**,
con contrato **TOLERANTE**: si K9 no responde, el periodo queda pendiente, no inventado.
Emite `contabilidad.periodo_imputado` en éxito y su par determinista en fallo.

> **NO REUTILIZA**: la periodificación con dos fechas y criterio declarable es propia de la
> vertical.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.periodo.imputar.request` | `onImputarRequest` | RPC reflejo: {project_id, hecho:{fecha_operacion, fecha_valor, total, ...}, criterio?} → {project_id, periodo:'YYYY-MM', criterio, criterio_origen:'PAYLOAD'\|'K9', fecha_operacion, fecha_valor, fechas_conservadas:true, fecha_imputada}. Imputa DETERMINISTA con el criterio declarado (devengo -> fecha_operacion; caja/fecha_valor -> fecha_valor). Sin criterio declarado (K9) → 422 CRITERIO_NO_DECLARADO (el hecho va a cola; no se elige ni se adivina); sin fechas → 422 SIN_FECHAS. Exito publica contabilidad.periodo_imputado y responde por contabilidad.periodo.imputar.response; error → contabilidad.periodo.imputar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.periodo_imputado` | Fire-and-forget (C3): un hecho quedo imputado a su periodo con las DOS fechas conservadas → {project_id, periodo, criterio, criterio_origen, fecha_operacion, fecha_valor, fechas_conservadas:true}. Lo consume cierre-ejercicio (C4) para el NIVEL 2 (mes natural) y estados-contables (C1/C2) para el corte del periodo. |
| `contabilidad.periodo.imputar.failed` | Par de fallo determinista: imputar sin project_id/hecho (400), hecho sin fechas (422 SIN_FECHAS) o criterio no declarado/no declarable (422 CRITERIO_NO_DECLARADO/CRITERIO_NO_DECLARABLE, el hecho va a cola K9). Cierra el circulo de contabilidad.periodo.imputar.request. |
| `contabilidad.periodo_imputado.failed` | Par de fallo del evento de dominio contabilidad.periodo_imputado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.periodo.imputar.failed` cierra `contabilidad.periodo.imputar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.periodo.imputar.response` (el par response del RPC); **NO está declarada en
> `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.periodo_imputado.failed` es el par de fallo
> del evento de DOMINIO; el reflejo solo publica los pares `*.failed` de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js — el reflejo publica por `_rpc`
> `contabilidad.criterio.leer.request` (dependencia por EVENTO hacia K9
> `cola-declaraciones-criterio`, no declarada como publisher).

## Reglas de negocio

1. **El criterio es DECLARADO, nunca cableado**: `_criterioDe` toma el criterio de
   `input.criterio`/`input.criterio_periodo` (origen `'PAYLOAD'`) o lo lee de K9 por EVENTO
   `contabilidad.criterio.leer.request` (origen `'K9'`, timeout 4000ms). **El sistema no
   asume un criterio.**
2. **Sin criterio declarado el hecho va a cola (nunca se inventa)**: si `_criterioDe`
   devuelve `null` → **`422 PRECONDITION_FAILED`** con `{ message:'el criterio de
   periodificacion no esta declarado (K9): no se elige ni se adivina', details:{
   senal:'CRITERIO_NO_DECLARADO', accion:'el hecho va a cola de declaracion de criterio',
   fechas } }`.
3. **Criterios declarables**: `CRITERIOS = ['DEVENGO','CAJA','FECHA_OPERACION','FECHA_VALOR']`.
   Un criterio declarado que no está en el conjunto → **`422 PRECONDITION_FAILED`** con
   `{ message:'criterio de periodificacion no declarable: <criterio>', details:{
   criterios_declarables:CRITERIOS, senal:'CRITERIO_NO_DECLARABLE' } }`.
4. **Las DOS fechas se conservan (nunca se colapsan)**: `_conservarFechas` devuelve
   `{ fecha_operacion, fecha_valor, colapsadas, conservadas }`. Acepta alias
   (`fechaOperacion`/`fecha`); `fecha_valor` cae a `fecha_operacion`/`fecha` si no viene.
   `conservadas = (fecha_operacion !== null || fecha_valor !== null)`.
5. **Sin fechas → 422 SIN_FECHAS**: si `!fechas.conservadas` → **`422 PRECONDITION_FAILED`**
   con `{ message:'el hecho no trae fechas: no se inventa el periodo', details:{
   senal:'SIN_FECHAS' } }`.
6. **DEVENGO vs CAJA (la imputación determinista)**: `fechaBase = (criterio === 'CAJA' ||
   criterio === 'FECHA_VALOR') ? (fecha_valor || fecha_operacion) : (fecha_operacion ||
   fecha_valor)`. **DEVENGO/FECHA_OPERACION → fecha_operacion; CAJA/FECHA_VALOR → fecha_valor.**
7. **El periodo es `YYYY-MM`**: `periodo = String(fechaBase).slice(0, 7)`. Si no se puede
   derivar → **`422 PRECONDITION_FAILED`** con `{ fechas, criterio }`.
8. **DETERMINISMO**: mismo hecho + mismo criterio → mismo periodo, bit a bit. La respuesta
   lleva `fechas_conservadas:true` y `determinista:true`, y la `nota`: *«se conservan las DOS
   fechas (operacion != valor); el criterio lo declara el negocio»*.
9. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   `hecho` ausente/no objeto → `400 INVALID_INPUT hecho`. Shape: `{ status:400, error:{
   code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
10. **HTTP exacto**: éxito `200`; payload inválido → `400`; sin fechas / sin criterio /
    criterio no declarable → `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.periodo.imputar.response`.

### 1. `imputar` — imputar el hecho a su periodo (criterio en el payload)

```json
{
  "project_id": "e57a318a-...",
  "hecho": { "fecha_operacion": "2026-09-12", "fecha_valor": "2026-10-03", "total": 121, "documento_origen": "FAC-2026-0042" },
  "criterio": "DEVENGO",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "criterio": "DEVENGO",
  "criterio_origen": "PAYLOAD",
  "fecha_operacion": "2026-09-12",
  "fecha_valor": "2026-10-03",
  "fechas_conservadas": true,
  "fecha_imputada": "2026-09-12",
  "determinista": true,
  "nota": "se conservan las DOS fechas (operacion != valor); el criterio lo declara el negocio"
}
```
Emite `contabilidad.periodo_imputado` (res.data + `correlation_id`). El mismo hecho con
`criterio:'CAJA'` → `periodo:'2026-10'`, `fecha_imputada:'2026-10-03'`.

### 2. `imputar` sin criterio declarado (K9 no lo declara / no responde) → 422

```json
{ "project_id": "e57a318a-...", "hecho": { "fecha_operacion": "2026-09-12", "fecha_valor": "2026-10-03" } }
```
Respuesta `422` + `contabilidad.periodo.imputar.failed`:
```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "el criterio de periodificacion no esta declarado (K9): no se elige ni se adivina", "details": { "senal": "CRITERIO_NO_DECLARADO", "accion": "el hecho va a cola de declaracion de criterio", "fechas": { "fecha_operacion": "2026-09-12", "fecha_valor": "2026-10-03", "colapsadas": false, "conservadas": true } } } }
```

### 3. Fallo — hecho sin fechas → 422 SIN_FECHAS

```json
{ "project_id": "e57a318a-...", "hecho": { "total": 121 }, "criterio": "DEVENGO" }
```
Respuesta `422` + `contabilidad.periodo.imputar.failed`:
```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "el hecho no trae fechas: no se inventa el periodo", "details": { "senal": "SIN_FECHAS" } } }
```

### 4. Fallo — criterio no declarable

Criterio declarado fuera de `CRITERIOS` (p.ej. `"MENSUAL"`) → `422 PRECONDITION_FAILED` con
`{ criterios_declarables:[...], senal:'CRITERIO_NO_DECLARABLE' }`.

### 5. Fallo — payload inválido

Sin `project_id`/`hecho` → `400 INVALID_INPUT` + `contabilidad.periodo.imputar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "hecho requerido", "details": { "field": "hecho" } } }
```

### 6. Tools (sin RPC en module.json)

`toolImputarPeriodo` → `_imputarPeriodo`; `toolConservarFechas` → `_conservarFechas`.

## Tests

El test vive en `tests/unit/periodificacion.test.js`. Cubre:

- `imputar` con `criterio:'DEVENGO'` → `periodo` derivado de `fecha_operacion`; emite
  `contabilidad.periodo_imputado`.
- **Devengo vs caja**: el MISMO hecho con `criterio:'CAJA'` → `periodo` derivado de
  `fecha_valor` (distinto cuando operacion != valor).
- **Las DOS fechas se conservan**: la respuesta lleva `fecha_operacion`, `fecha_valor` y
  `fechas_conservadas:true` (no se colapsan).
- **Sin criterio (K9 no responde)** → `422 CRITERIO_NO_DECLARADO` +
  `contabilidad.periodo.imputar.failed` (el hecho va a cola).
- Criterio declarado no declarable → `422 CRITERIO_NO_DECLARABLE` con
  `criterios_declarables`.
- Hecho sin fechas → `422 SIN_FECHAS`.
- **Criterio vía K9**: sin criterio en el payload, con K9 respondiendo → `criterio_origen:'K9'`.
- **Determinismo**: la MISMA entrada devuelve EXACTAMENTE el mismo `periodo`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/periodificacion
node --test tests/unit/periodificacion.test.js
```

## Notas de implementación

- Clase `Periodificacion extends ModuloHibridoReflejo`; `name = 'periodificacion'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: el criterio vive en K9).
- Constante: `CRITERIOS = ['DEVENGO','CAJA','FECHA_OPERACION','FECHA_VALOR']`.
- `onImputarRequest` delega en `_atender(e, 'imputar', 'contabilidad.periodo.imputar.response',
  fn)`; publica `contabilidad.periodo_imputado` en éxito o `contabilidad.periodo.imputar.failed`
  en fallo.
- Proyecciones puras: `_imputarPeriodo` (async), `_conservarFechas`, `_criterioDe` (async,
  EVENTO K9), `_norm` + `_round` (de la base). `_rpc`/`_invalid`/`_errorResponse` vienen de la
  base.
- Tools: `toolImputarPeriodo`, `toolConservarFechas`.
- DEP hacia delante: `contabilidad.periodo_imputado` lo consume `cierre-ejercicio` (C4) para
  el NIVEL 2 (mes natural) y `estados-contables` (C1/C2) para el corte del periodo. DEP hacia
  atrás por evento: K9 `cola-declaraciones-criterio` provee el criterio declarado.
