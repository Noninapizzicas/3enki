---
name: historial-proceso-contable
description: >
  Skill FULL del módulo CUSTODIO `historial-proceso-contable` de la vertical contabilidad
  de Enki (P2, hoja del plan). Registro APPEND-ONLY de lo PROCESADO y lo FALLADO con su
  rastro: solo crece, NUNCA se reescribe (invariante de registro inmutable del dominio).
  Es el historial del PROCESO de ENTRADA (hecho admitido / excepción encolada / excepción
  resuelta), distinto de `traza-asiento` (B4, del asiento) y de `historial-nicho` (otro
  dominio). Un solo escritor (ADMISION; second-writer rechazado). Persiste por proyecto
  vía PosPersistencia. Úsala para operar, depurar o extender el custodio.
when-to-use: >
  - Cuando necesites anotar una entrada del proceso (RPC contabilidad.historial.anotar.request)
    o consultar el historial (contabilidad.historial.consultar.request).
  - Cuando depures por qué una anotación se rechaza (PERMISSION_DENIED si el rol no es
    ADMISION, INVALID_INPUT en payload) o por qué una traza no aparece (no llegó el
    evento fire-and-forget de la cadena).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el append-only
    y la absorción de trazas por EVENTO sin require cruzado.
  - Cuando vayas a escribir/ampliar el test unitario del custodio historial-proceso-contable.
tags: [enki, modulo, custodio, persistencia, contabilidad, historial-proceso-contable, append-only, rastro]
---

# historial-proceso-contable — CUSTODIO append-only del proceso de entrada

## Qué hace el módulo

`historial-proceso-contable` es un **CUSTODIO CON PERSISTENCIA** (P2, hoja del plan): el
dueño del store del **historial del PROCESO de ENTRADA** — lo procesado y lo fallado, con
su rastro. Aplica la invariante contable **append-only**: cada entrada se apila con su
`seq` y **NUNCA se reescribe** (registro inmutable del dominio, hermano de B4, D8 y L7).

Es el historial del **proceso** (admitido / encolado / resuelto), deliberadamente distinto
de `traza-asiento` (B4, del asiento) y de `historial-nicho` (otro dominio): aquí se traza
**cómo entró** el dato, no el asiento que produjo. Es la materia prima del panel de
proceso (P1/P4).

Un **solo escritor**: la **ADMISION** anota (guard de rol en `_anotar`, second-writer
rechazado); la lectura (`_consultar`) no muta. **Absorbe las trazas de la cadena por
EVENTO** (sin `require` cruzado): `contabilidad.hecho_admitido` (de `puerto-evento-vertical`),
`contabilidad.excepcion_encolada` y `contabilidad.excepcion_resuelta` (de `cola-revision`),
cada una como entrada tipada (`HECHO_ADMITIDO` / `EXCEPCION_ENCOLADA` / `EXCEPCION_RESUELTA`).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/historial-proceso-contable/*.json`), restaura en `project.activated` y
vuelca en `onUnload`. Emite `contabilidad.historial_anotado` en éxito y sus pares de fallo.

> **NO REUTILIZA**: es el historial del PROCESO de entrada, distinto de `traza-asiento`
> (B4) y de `historial-nicho` (otro dominio).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.historial.anotar.request` | `onAnotarRequest` | RPC custodio: {project_id, rol:'ADMISION', entrada:{tipo, vertical?, cola?, detalle}} → {project_id, entrada, total}. Guard de escritor: solo ADMISION (second-writer rechazado). APPEND-ONLY: la entrada se apila con su seq; NUNCA se sobrescribe. Publica contabilidad.historial_anotado y responde por contabilidad.historial.anotar.response; si el rol o el payload son invalidos → contabilidad.historial.anotar.failed. |
| `contabilidad.historial.consultar.request` | `onConsultarRequest` | RPC custodio: {project_id, desde?, hasta?} → {project_id, desde, hasta, total, entradas}. Proyeccion PURA de lectura (no muta). Si el payload es invalido → contabilidad.historial.consultar.failed. Lo consume panel-proceso-contable (P1/P4). |
| `contabilidad.hecho_admitido` | `onHechoAdmitido` | Fire-and-forget (A1 → P2): puerto-evento-vertical admite un hecho → se anota una entrada HECHO_ADMITIDO (escritor ADMISION). Dependencia por EVENTO, sin require cruzado. |
| `contabilidad.excepcion_encolada` | `onExcepcionEncolada` | Fire-and-forget (A8.1 → P2): cola-revision encola una excepcion → se anota una entrada EXCEPCION_ENCOLADA (escritor ADMISION). Dependencia por EVENTO, sin require cruzado. |
| `contabilidad.excepcion_resuelta` | `onExcepcionResuelta` | Fire-and-forget (A8.1 → P2): cola-revision resuelve una excepcion → se anota una entrada EXCEPCION_RESUELTA (escritor ADMISION). Dependencia por EVENTO, sin require cruzado. |
| `project.activated` | `onProjectActivated` | Restaura el historial del proyecto activado desde el storage (PosPersistencia): el historial es POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.historial_anotado` | Fire-and-forget (P2): una entrada quedo anotada append-only en el historial del proceso → {project_id, entrada, total}. Lo consume panel-proceso-contable (P1/P4) para el rastro visible del proceso. |
| `contabilidad.historial.anotar.failed` | Par de fallo determinista: anotar rechazado (rol != ADMISION) o payload invalido. Cierra el circulo de contabilidad.historial.anotar.request. |
| `contabilidad.historial.consultar.failed` | Par de fallo determinista: consultar con payload invalido. Cierra el circulo de contabilidad.historial.consultar.request. |
| `contabilidad.historial_anotado.failed` | Par de fallo del evento de dominio contabilidad.historial_anotado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.historial.anotar.failed` cierra `anotar.request` (rol ≠ ADMISION o payload
> inválido); `contabilidad.historial.consultar.failed` cierra `consultar.request`.

> Nota: no está en module.json pero sí lo emite index.js en `onAnotarRequest` — el par
> `contabilidad.historial.anotar.failed` se publica dentro del handler cuando
> `res.status !== 200`, además de la response de `_atender`. Y los tres handlers de traza
> (`onHechoAdmitido`, `onExcepcionEncolada`, `onExcepcionResuelta`) llaman directamente a
> `_anotar` con rol ADMISION; **la traza que generan publica `contabilidad.historial_anotado`**,
> mientras que si `_anotar` fallara devuelven el shape de error **sin publicar** un par
> `*.failed` propio (el flujo fire-and-forget no responde).

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_anotar` exige `rol === 'ADMISION'`
   (constante `ROL_ADMISION`). Cualquier otro → `403 PERMISSION_DENIED`
   `{ message:'solo ADMISION anota en el historial', details:{ rol_esperado:'ADMISION', rol_recibido:<rol> } }`.
   Second-writer rechazado.
2. **APPEND-ONLY (el registro inmutable solo crece)**: cada entrada se apila en
   `d.entradas` con `seq = d.entradas.length + 1`; **NUNCA se reescribe** una entrada
   previa. Invariante contable de registro inmutable. `updated_at` es la única cabecera
   que cambia.
3. **Validaciones deterministas**: falta `project_id` → `400 project_id`; `entrada`
   ausente/no objeto → `400 entrada`. Shape
   `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
4. **Entradas tipadas**: `tipo` (`HECHO_ADMITIDO`/`EXCEPCION_ENCOLADA`/`EXCEPCION_RESUELTA`
   o el que declare la admisión), `vertical`, `cola`, `detalle` — los ausentes quedan
   `null`; se sella `anotado_en` (ISO) y `anotado_por: 'ADMISION'`.
5. **Absorción de trazas por EVENTO (sin `require` cruzado)**: los tres handlers de
   traza (`onHechoAdmitido`, `onExcepcionEncolada`, `onExcepcionResuelta`) llaman a
   `_anotar` con rol ADMISION y `detalle = d`. Si el evento no trae `project_id`,
   devuelven `null` sin anotar.
6. **La lectura (`_consultar`) no muta**: es proyección PURA; filtra por rango de `seq`
   `(desde, hasta]`; `desde` por defecto `0`, `hasta` por defecto `entradas.length`.
7. **Historial por proyecto**: cada proyecto tiene su propio registro; `historialProceso(pid)`
   es un alias plano que devuelve el array de entradas (para el panel P1/P4).
8. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol inválido → `403`; excepción
   en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.historial.anotar.response` y
`contabilidad.historial.consultar.response`.

### 1. `anotar` — anotar una entrada del proceso (solo ADMISION)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ADMISION",
  "entrada": { "tipo": "HECHO_ADMITIDO", "vertical": "COMPRA", "detalle": { "faltantes": ["iva"] } },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "entrada": { "seq": 1, "tipo": "HECHO_ADMITIDO", "vertical": "COMPRA", "cola": null, "detalle": { "faltantes": ["iva"] }, "anotado_en": "2026-09-28T...", "anotado_por": "ADMISION" },
  "total": 1
}
```
Emite `contabilidad.historial_anotado` (res.data + correlation_id).

### 2. `consultar` — leer el historial (proyección pura, no muta)

```json
{ "project_id": "e57a318a-...", "desde": 0, "hasta": 50 }
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "desde": 0,
  "hasta": 50,
  "total": 12,
  "entradas": [ { "seq": 1, "tipo": "HECHO_ADMITIDO", "...": "..." } ]
}
```

### 3. Fire-and-forget — trazas de la cadena (no son RPC)

`contabilidad.hecho_admitido` (de `puerto-evento-vertical`) → anota `HECHO_ADMITIDO`:
```json
{ "project_id": "e57a318a-...", "vertical": "COMPRA", "admitido": true, "faltantes": ["iva"], "incompleto": true }
```
`contabilidad.excepcion_encolada` (de `cola-revision`) → anota `EXCEPCION_ENCOLADA`:
```json
{ "project_id": "e57a318a-...", "cola": "ASESOR", "excepcion": { "id": "e57a318a-...-ASESOR-x1" } }
```
`contabilidad.excepcion_resuelta` (de `cola-revision`) → anota `EXCEPCION_RESUELTA`:
```json
{ "project_id": "e57a318a-...", "cola": "ASESOR", "excepcion": { "id": "e57a318a-...-ASESOR-x1" }, "resuelta_por": "ASESOR" }
```

### Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "entrada": { "tipo": "HECHO_ADMITIDO" } }
```
Respuesta `403` + `contabilidad.historial.anotar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo ADMISION anota en el historial", "details": { "rol_esperado": "ADMISION", "rol_recibido": "OPERADOR" } } }
```

## Tests

El test vive en `tests/unit/historial-proceso-contable.test.js`. Cubre:

- `anotar` con rol `ADMISION` → `200`, apila con `seq` incremental (append-only) y emite
  `contabilidad.historial_anotado`.
- `anotar` con rol distinto → `403 PERMISSION_DENIED` + `contabilidad.historial.anotar.failed`;
  sin `entrada` → `400 INVALID_INPUT`.
- `consultar` con rango `desde/hasta` → `200 {total, entradas}` sin mutar.
- `onHechoAdmitido`/`onExcepcionEncolada`/`onExcepcionResuelta` (fire-and-forget) anotan la
  entrada tipada; sin `project_id` → `null` (no anota).
- `project.activated` restaura el historial vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/historial-proceso-contable
node --test tests/unit/historial-proceso-contable.test.js
```

## Notas de implementación

- Clase `HistorialProcesoContable extends ModuloHibridoReflejo`; `name =
  'historial-proceso-contable'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._store` (Map project_id → `{ esquema:'contabilidad-historial-proceso-contable-v1', entradas:[], updated_at }`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'historial-proceso-contable.json', dir: '/contabilidad/historial-proceso-contable',
  snapshot, hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` →
  `flush()` + `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onAnotarRequest`/`onConsultarRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.historial.<op>.response', fn)`; el handler emite el
  evento de dominio o el par determinista dentro de la proyección. Los tres handlers de
  traza son fire-and-forget y llaman directo a `_anotar` con `rol: ROL_ADMISION`.
- Proyecciones puras: `_anotar` (escritura + guard, append-only) y `_consultar`
  (lectura). Helper `_obtenerOCrear(pid)` y alias `historialProceso(pid)`.
  `_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolAnotar` → `_anotar`, `toolConsultar` → `_consultar`.
- DEP hacia delante: lo consume `panel-proceso-contable` (P1/P4). Absorbe trazas de
  `puerto-evento-vertical` (A1) y `cola-revision` (A8.1) por EVENTO.
