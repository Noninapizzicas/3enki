---
name: cola-declaraciones-criterio
description: >
  Skill FULL del módulo CUSTODIO `cola-declaraciones-criterio` de la vertical
  contabilidad de Enki. La única cola donde el JEFE (rol JEFE_CRITERIO) fija y
  ratifica TODOS los criterios del sistema (unidad_de_cierre, periodo,
  amortizacion, reparto, dimensiones, tipos, consolidacion); un solo escritor,
  el sistema pregunta y nada se estima — lo no declarado queda [ABIERTO] con
  valor null. Persiste por proyecto con PosPersistencia. Úsala para operar,
  depurar o extender el custodio, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites fijar o ratificar un criterio del proyecto
    (RPC cola-declaraciones-criterio.fijar.request /
    cola-declaraciones-criterio.ratificar.request).
  - Cuando depures por qué un criterio no se fija (403 PERMISSION_DENIED si el
    rol no es JEFE_CRITERIO, 400 INVALID_INPUT si falta project_id o clave) o por
    qué sigue [ABIERTO].
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio (un solo escritor, la cola pregunta no decide, append-only,
    persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio
    cola-declaraciones-criterio.
tags: [enki, modulo, custodio, contabilidad, cola-declaraciones-criterio]
---

# cola-declaraciones-criterio — CUSTODIO CON PERSISTENCIA de los criterios

## Qué hace el módulo

`cola-declaraciones-criterio` es un **CUSTODIO CON PERSISTENCIA** (K9, hoja del
plan): **UNA SOLA COLA** donde el **JEFE** fija y ratifica **TODOS** los criterios.
Cierra declarativamente `B1/B7 · C7 · E6 · F5 · J6 · D11 · I5` — un único punto de
declaración para todo el sistema: `unidad_de_cierre`, `periodo`, `amortizacion`,
`reparto`, `dimensiones`, `tipos`, `consolidacion`.

**Invariante 13 — el criterio se DECLARA, no se estima**: el sistema **PREGUNTA**;
no decide. Un criterio sin valor declarado **NO** se rellena con un default: queda
`[ABIERTO]`, con `valor:null` y su estado declarado. La cola recoge lo abierto para
que el JEFE lo declare.

**UN SOLO ESCRITOR** de la parcela: el JEFE (rol `JEFE_CRITERIO`) fija y ratifica;
cualquier otro rol es rechazado (segundo escritor → `403`). **No se borra**:
re-fijar un criterio **APPENDEA** a su historial (valor vigente + fecha + autor);
nada se sobrescribe en silencio. Ratificar es un acto del JEFE sobre un criterio
**YA declarado**; sobre un criterio `[ABIERTO]` no se inventa ratificación.

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/cola-declaraciones-criterio/cola-declaraciones-criterio.json`),
restaura en `project.activated` y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `cola-declaraciones-criterio.fijar.request` | `onFijarRequest` | RPC custodio (escritura, UN escritor): {project_id, rol:'JEFE_CRITERIO', clave, valor?} → {criterio, fijado, abierto}. Fija (declara) el valor de un criterio; valor ausente/vacio → el criterio queda [ABIERTO] (valor null), nunca un default estimado. Guard Rol=JEFE_CRITERIO (segundo escritor → 403). Re-fijar APPENDEA al historial (no se sobrescribe). Responde por cola-declaraciones-criterio.fijar.response; fallo → cola-declaraciones-criterio.fijar.failed. |
| `cola-declaraciones-criterio.ratificar.request` | `onRatificarRequest` | RPC custodio (acto del JEFE): {project_id, rol:'JEFE_CRITERIO', clave} → {criterio, ratificado, abierto, ya_estaba?}. Ratifica un criterio YA declarado y devuelve su ParametroDeclarable vigente. Criterio no registrado o [ABIERTO] → ratificado:false, abierto:true (no se inventa ratificacion). Idempotente si ya estaba ratificado. Exito → publica contabilidad.criterio_ratificado y responde por cola-declaraciones-criterio.ratificar.response; fallo → cola-declaraciones-criterio.ratificar.failed. |
| `project.activated` | `onProjectActivated` | Restaura la cola de criterios del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `cola-declaraciones-criterio.fijar.response` | Respuesta RPC correlada de cola-declaraciones-criterio.fijar.request → {request_id, status:200, data:{criterio, fijado, abierto}}. Emitida por el helper _atender. |
| `cola-declaraciones-criterio.fijar.failed` | Par de fallo determinista (K9): rol != JEFE_CRITERIO (segundo escritor), project_id o clave ausente → {status, error:{code, message, details?}}. Cierra el circulo de cola-declaraciones-criterio.fijar.request. |
| `cola-declaraciones-criterio.ratificar.response` | Respuesta RPC correlada de cola-declaraciones-criterio.ratificar.request → {request_id, status:200, data:{criterio, ratificado, abierto, ya_estaba?}}. Emitida por el helper _atender. |
| `cola-declaraciones-criterio.ratificar.failed` | Par de fallo determinista (K9): rol != JEFE_CRITERIO (segundo escritor), project_id o clave ausente → {status, error:{code, message, details?}}. Cierra el circulo de cola-declaraciones-criterio.ratificar.request. |
| `contabilidad.criterio_ratificado` | Fire-and-forget (K9): un criterio quedo ratificado por el JEFE → {project_id, criterio, clave, valor, ratificado, correlation_id}. Lo LEEN las hojas que cierran declarativamente (B1/B7·C7·E6·F5·J6·D11·I5) para hidratar su parametro declarado. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `cola-declaraciones-criterio.fijar.failed` cierra `fijar.request` y
> `cola-declaraciones-criterio.ratificar.failed` cierra `ratificar.request`, cada
> uno cuando su proyección devuelve status ≠ 200.

> Nota de honestidad (cruce con `index.js`): `onRatificarRequest` publica
> `contabilidad.criterio_ratificado` **siempre que `_ratificar` devuelve `200`**,
> lo que incluye el caso `ratificado:false` (criterio no registrado o todavía
> `[ABIERTO]`). Es decir, el evento se emite también cuando **no** hubo
> ratificación efectiva, con `ratificado:false` en el payload. No está en el
> `module.json` matizado; lo emite `index.js` en `onRatificarRequest`.

> Nota: el módulo expone `criteriosDe(pid)` y `abiertosDe(pid)` como **lecturas
> directas** para otras hojas del mismo proceso (no mutan) — no son eventos del
> bus, no figuran en `module.json`.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_fijar` y `_ratificar` exigen
   `input.rol === 'JEFE_CRITERIO'` (constante `ROL_ESCRITOR`). Cualquier otro rol
   → `403 PERMISSION_DENIED` con
   `{rol_esperado:'JEFE_CRITERIO', rol_recibido:<rol>}`. El segundo escritor **no
   espera ni hace cola**.
2. **Nada se estima**: en `_fijar`, `tieneValor` es falso si `valor` es
   `undefined`, `null` o string vacío/espacios. Sin valor, el criterio queda
   `valor:null`, `estado:'ABIERTO'`. Nunca se rellena con un default.
3. **Re-fijar APPENDEA, no sobrescribe**: cada `_fijar` empuja una entrada al
   `historial` (`{estado, valor, por:'JEFE_CRITERIO', en}`); el valor vigente se
   actualiza pero el historial conserva todo. Re-fijar vuelve a poner
   `ratificado_en:null` (una nueva declaración invalida la ratificación previa).
4. **Ratificar no inventa**: `_ratificar` sobre un criterio no registrado devuelve
   `200 {ratificado:false, abierto:true, motivo:'el criterio no esta registrado ni
   declarado en la cola'}`; sobre un criterio `[ABIERTO]` devuelve `200
   {ratificado:false, abierto:true, motivo:'el criterio sigue [ABIERTO]: el JEFE
   aun no lo declaro'}`. No hay ratificación fabricada.
5. **Ratificar es idempotente**: si el criterio ya estaba `RATIFICADO`,
   `ya_estaba:true` y **no** se re-escribe ni se pierde el historial.
6. **Criterios conocidos**: `CRITERIOS_CONOCIDOS` = [`unidad_de_cierre`,
   `periodo`, `amortizacion`, `reparto`, `dimensiones`, `tipos`, `consolidacion`].
   Un criterio conocido lleva `conocido:true` y `cierra:'B1·B7·C7·E6·F5·J6·D11·I5'`;
   uno desconocido (`conocido:false`, `cierra:null`) se admite igual (se declara).
7. **Clave normalizada**: `clave = String(input.clave).trim()`; vacía →
   `400 INVALID_INPUT` (`field:'clave'`).
8. **`project_id` con fallback**: `input.project_id || this.project_id`.
9. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura
   efectiva; restaura en `project.activated`; `flush()` + `detener()` en `onUnload`.
10. **HTTP exacto**: éxito `200`; rol inválido → `403`; `project_id`/`clave`
    ausente → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `cola-declaraciones-criterio.fijar.response` y
`cola-declaraciones-criterio.ratificar.response`.

### 1. `fijar` — declarar un criterio (solo JEFE_CRITERIO)

```json
{
  "project_id": "e57a318a-...",
  "rol": "JEFE_CRITERIO",
  "clave": "unidad_de_cierre",
  "valor": "MES",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "criterio": { "clave": "unidad_de_cierre", "cierra": "B1·B7·C7·E6·F5·J6·D11·I5", "conocido": true, "valor": "MES", "estado": "DECLARADO", "fijado_por": "JEFE_CRITERIO", "fijado_en": "2026-09-25T...", "ratificado_en": null, "historial": [ { "estado": "DECLARADO", "valor": "MES", "por": "JEFE_CRITERIO", "en": "2026-09-25T..." } ] },
  "fijado": true,
  "abierto": false
}
```

### 2. `fijar` sin valor — el criterio queda [ABIERTO]

```json
{ "project_id": "e57a318a-...", "rol": "JEFE_CRITERIO", "clave": "reparto" }
```
Respuesta `200` con `criterio.valor:null`, `criterio.estado:"ABIERTO"`, `abierto:true`.

### 3. `ratificar` — ratificar lo ya declarado

```json
{ "project_id": "e57a318a-...", "rol": "JEFE_CRITERIO", "clave": "unidad_de_cierre" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "criterio": { "clave": "unidad_de_cierre", "valor": "MES", "estado": "RATIFICADO", "ratificado_en": "2026-09-25T...", "...": "..." }, "ratificado": true, "ya_estaba": false, "abierto": false }
```
Emite `contabilidad.criterio_ratificado`:
```json
{ "project_id": "e57a318a-...", "criterio": { "...": "..." }, "clave": "unidad_de_cierre", "valor": "MES", "ratificado": true, "correlation_id": "abc-123" }
```

### 4. Fallo — rol inválido (segundo escritor)

```json
{ "project_id": "e57a318a-...", "rol": "OTRO", "clave": "periodo", "valor": "2026" }
```
Respuesta `403` + `cola-declaraciones-criterio.fijar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el JEFE (JEFE_CRITERIO) fija y ratifica criterios en la cola", "details": { "rol_esperado": "JEFE_CRITERIO", "rol_recibido": "OTRO" } } }
```

### 5. Fallo — falta la clave

```json
{ "project_id": "e57a318a-...", "rol": "JEFE_CRITERIO" }
```
Respuesta `400` + `cola-declaraciones-criterio.fijar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "clave requerido", "details": { "field": "clave" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/cola-declaraciones-criterio.test.js`.
Cubre:

- `fijar` con rol `JEFE_CRITERIO` y valor → `200 {fijado:true, abierto:false}`,
  estado `DECLARADO` y entrada en `historial`.
- `fijar` sin valor → `200 abierto:true`, `valor:null` (no se estima).
- `fijar`/`ratificar` con otro rol → `403 PERMISSION_DENIED` +
  `cola-declaraciones-criterio.<op>.failed`.
- `fijar` sin `project_id` o sin `clave` → `400 INVALID_INPUT`.
- Re-fijar APPENDEA al historial (no sobrescribe) y limpia `ratificado_en`.
- `ratificar` sobre `[ABIERTO]` → `200 {ratificado:false, abierto:true}`.
- `ratificar` sobre declarado → `200 ratificado:true` y emite
  `contabilidad.criterio_ratificado`; segundo `ratificar` → `ya_estaba:true`.
- `project.activated` restaura la cola via PosPersistencia; `abiertosDe(pid)` filtra
  los `[ABIERTO]`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ColaDeclaracionesCriterio extends ModuloHibridoReflejo`; `name =
  'cola-declaraciones-criterio'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._colas` (`Map<project_id, {esquema, criterios: Map<clave, Criterio>}>`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'cola-declaraciones-criterio.json', dir: '/contabilidad/cola-declaraciones-criterio',
  snapshot, hidratar })` desde `modules/contabilidad-analitica/cola-declaraciones-criterio/`
  (DOS niveles → `../../_shared/pos-persistencia`). `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
- `onFijarRequest` delega en `_atender(e, 'fijar',
  'cola-declaraciones-criterio.fijar.response', async (d) => {...})`; dentro hace
  el cierre de círculo (`fijar.failed` si status ≠ 200). `onRatificarRequest` hace
  igual con `ratificar` y publica `contabilidad.criterio_ratificado` en status 200.
- Proyecciones `_fijar` (escritura + guard) y `_ratificar` (acto del JEFE); helper
  `_obtenerOCrear(pid)`, guard `_guardEscritor(rol)`. Lecturas directas
  `criteriosDe(pid)` / `abiertosDe(pid)`. Tools `toolFijar` / `toolRatificar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: pende del dato del DUENO (el JEFE declara vía esta cola); alimenta a
  `anclaje-cierre-vertical` (A14), cierres (C4) y consolidación (K9).
