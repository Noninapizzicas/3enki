---
name: captura-documento
description: >
  Skill FULL del módulo REFLEJO `captura-documento` de la vertical contabilidad
  de Enki. Admite el documento (digitalizado o recibido) y valida sus campos de
  forma MECANICA y CERO JUICIO contra un minimo declarable; no interpreta lo
  ilegible ni asienta. Úsala para operar, depurar o extender el reflejo, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites admitir un documento validando sus campos contra un minimo
    (RPC captura-documento.admitir.request).
  - Cuando depures por qué un documento no se admite (400 INVALID_INPUT si el
    documento falta o es inválido, o `faltantes` no vacío).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de admision (minimo declarable, sin juicio, sin persistencia).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo captura-documento.
tags: [enki, modulo, reflejo, contabilidad, captura-documento]
---

# captura-documento — REFLEJO STATELESS de la contabilidad

## Qué hace el módulo

`captura-documento` es un **REFLEJO STATELESS** (A3, hoja del plan): admite el
documento (digitalizado o recibido) y valida sus campos de forma **MECANICA, CERO
JUICIO**. No interpreta lo ilegible (eso es `extraccion-dato` A4.1), no asienta, no
propone contrapartida: solo dice si el documento es admisible segun el minimo
**DECLARADO** (`campos_minimos`).

El minimo exigible es **declarable**: si el minimo no viene declarado, la admision es
estructural (hay documento con algun campo) y se declara `contrato:'no_declarado'` —
no se inventa un minimo. En admision publica el fire-and-forget
`contabilidad.documento_admitido` (lo consume `control-cuadre-documento` A4.3); en
rechazo, su par `captura-documento.admitir.failed`. Sin PosPersistencia y sin
`project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `captura-documento.admitir.request` | `onAdmitirRequest` | RPC reflejo: {project_id, documento, origen?, campos_minimos?} → {admitido, contrato, campos_presentes, faltantes, documento}. Valida mecanicamente los campos del documento frente al minimo declarado; sin juicio ni interpretacion. Admitido → publica contabilidad.documento_admitido y responde por captura-documento.admitir.response; documento ausente o faltantes → captura-documento.admitir.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `captura-documento.admitir.response` | Respuesta RPC correlada de captura-documento.admitir.request → {request_id, status:200, data:{admitido, contrato, campos_presentes, faltantes, documento}}. Emitida por el helper _atender. |
| `captura-documento.admitir.failed` | Par de fallo determinista (A3): documento ausente/invalido o minimo declarado incompleto → {status, error:{code, message, details?}}. Cierra el circulo de captura-documento.admitir.request. |
| `contabilidad.documento_admitido` | Fire-and-forget (A3): el documento quedo admitido y con campos validados → {project_id, documento, origen, correlation_id}. Lo consume control-cuadre-documento (A4.3). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `captura-documento.admitir.failed` cierra el círculo de
> `captura-documento.admitir.request` cuando `_admitir` devuelve status ≠ 200 o
> `admitido` es `false`.

> Nota: `contabilidad.documento_admitido` se emite dentro de `onAdmitirRequest` solo
> si `res.status === 200 && res.data.admitido === true`. Si el documento viene
> incompleto (`admitido:false`) el resultado sigue siendo `200` por el RPC, pero el
> handler publica `captura-documento.admitir.failed` por la rama else.

## Reglas de negocio

1. **Mecanico, cero juicio (cero estimacion)**: el modulo no interpreta ni completa
   nada. `campos_presentes` es el conjunto de claves de `documento` con valor no
   vacio (`!== undefined && !== null && !== ''`).
2. **El minimo es DECLARABLE**: `campos_minimos` (array) entra como DATO. Con minimo,
   `contrato:'declarado'` y `faltantes` son los minimos ausentes en el documento; sin
   minimo, `contrato:'no_declarado'` y `faltantes:[]`. No se cablea un minimo.
3. **Veredicto de admision**: `admitido = (campos_presentes.length > 0) && (faltantes.length === 0)`.
   No hay documento vacio admitido ni documento con faltantes admitido.
4. **`project_id` con fallback**: `input.project_id || this.project_id || null`.
5. **`origen` opcional y trazable**: `input.origen` se normaliza a String o queda `null`;
   se propaga en `contabilidad.documento_admitido`.
6. **No asienta ni persiste**: no hay store, no hay PosPersistencia. Solo valida y publica.
7. **Validacion determinista de payload**: `documento` ausente, no objeto o array →
   `400 INVALID_INPUT` (`_invalid('documento')`).
8. **HTTP exacto**: éxito `200` (con `admitido` true o false); documento inválido →
   `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `captura-documento.admitir.response` y emite `contabilidad.documento_admitido`.

### 1. `admitir` — validar los campos del documento

```json
{
  "project_id": "e57a318a-...",
  "documento": { "tipo": "FT", "numero": "A-1", "fecha": "2026-09-01", "total": 121 },
  "origen": "scanner-taller",
  "campos_minimos": ["numero", "fecha", "total"],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "admitido": true,
  "origen": "scanner-taller",
  "contrato": "declarado",
  "campos_presentes": ["tipo", "numero", "fecha", "total"],
  "faltantes": [],
  "documento": { "tipo": "FT", "numero": "A-1", "fecha": "2026-09-01", "total": 121 }
}
```
Emite `contabilidad.documento_admitido`:
```json
{ "project_id": "e57a318a-...", "documento": { "...": "..." }, "origen": "scanner-taller", "correlation_id": "abc-123" }
```

### 2. Admision estructural (sin minimo declarado)

```json
{ "project_id": "e57a318a-...", "documento": { "tipo": "FT" } }
```
Respuesta `200`: `admitido:true`, `contrato:"no_declarado"`, `faltantes:[]`.

### 3. Rechazo — documento con faltantes

```json
{ "project_id": "e57a318a-...", "documento": { "tipo": "FT" }, "campos_minimos": ["numero", "total"] }
```
Respuesta `200` con `admitido:false`, `faltantes:["numero","total"]`, y el handler
publica `captura-documento.admitir.failed`.

### 4. Fallo — documento inválido

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `captura-documento.admitir.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "documento requerido", "details": { "field": "documento" } } }
```

## Tests

El test vive en `tests/unit/captura-documento.test.js`. Cubre:

- `admitir` con minimo declarado y documento completo → `200 admitido:true`,
  `contrato:'declarado'` y emite `contabilidad.documento_admitido`.
- `admitir` sin `campos_minimos` → `contrato:'no_declarado'`.
- `admitir` con minimo y faltantes → `admitido:false` y `captura-documento.admitir.failed`.
- `documento` ausente/no objeto/array → `400 INVALID_INPUT` (`field:'documento'`).
- `origen` se normaliza y se propaga.
- `toolAdmitir` devuelve la misma proyeccion que `_admitir`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CapturaDocumento extends ModuloHibridoReflejo`; `name = 'captura-documento'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin
  `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/captura-documento/`).
- `onAdmitirRequest` es de una linea: `this._atender(e, 'admitir',
  'captura-documento.admitir.response', async (d) => {...})`. Dentro del handler hace
  el cierre de circulo: en `200 && admitido` publica `contabilidad.documento_admitido`,
  si no publica `captura-documento.admitir.failed`.
- Proyeccion unica `_admitir(input)` → `{status, data}`. Tool directa `toolAdmitir`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP hacia delante: lo consume `control-cuadre-documento` (A4.3) via
  `contabilidad.documento_admitido`.
