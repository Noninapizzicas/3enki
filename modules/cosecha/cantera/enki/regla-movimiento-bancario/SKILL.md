---
name: regla-movimiento-bancario
description: >
  Skill FULL del módulo CUSTODIO `regla-movimiento-bancario` de la vertical contabilidad de Enki.
  Parcela de las REGLAS DECLARABLES/APRENDIDAS de clasificación de movimientos bancarios
  ('esta comisión → esta cuenta') — el CORTE DURO del extracto, con un solo escritor
  (ratificación del aprendizaje) y sin inventar jamás una cuenta cuando no hay regla.
  Persiste por proyecto con PosPersistencia. Úsala para operar, depurar o extender el
  custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el corte duro movimiento → apunte (RPC
    regla-movimiento-bancario.aplicar.request) o declarar/apilar una regla (RPC
    regla-movimiento-bancario.proponer.request).
  - Cuando depures por qué un movimiento no queda cubierto (`cubierta:false`,
    `requiere_cola:true`, `destino_cola:'ASESOR'`) o por qué se rechaza una regla
    (403 PERMISSION_DENIED si el rol no es RATIFICACION_REGLA_APRENDIDA, 409
    ALREADY_EXISTS si el id ya existe, 422 PRECONDITION_FAILED si la cuenta no está
    en el plan declarado).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del corte (aplicar no muta, proponer append-only, criterios
    declarables, dato ausente = desconocido).
  - Cuando vayas a escribir/ampliar el test unitario del custodio
    regla-movimiento-bancario.
tags: [enki, modulo, custodio, contabilidad, regla-movimiento-bancario]
---

# regla-movimiento-bancario — CUSTODIO CON PERSISTENCIA del corte duro del extracto

## Qué hace el módulo

`regla-movimiento-bancario` es un **CUSTODIO CON PERSISTENCIA** (E8, hoja del plan): la
parcela de las **REGLAS DECLARABLES/APRENDIDAS de clasificación de movimientos
bancarios** — «esta comisión → esta cuenta», «esta devolución → esta cuenta». Es el
**CORTE DURO del extracto**: lo que `aplicar` devuelve como `cubierta:true` **es lo que
se puede asentar**; lo que **NO** cubre **NO se inventa** — va a la cola / al juicio de
`partida-no-identificada` (E7).

**EL SISTEMA NO LAS INVENTA**: las reglas las declara el **DUEÑO/ASESOR** y entran por el
camino de **aprendizaje** (**ratificación única por L10**, rol
`RATIFICACION_REGLA_APRENDIDA`). El módulo **JAMÁS fabrica una regla**.

Es un **CUSTODIO con estado**: **UN SOLO ESCRITOR** — solo el camino de aprendizaje
asienta reglas; cualquier otro rol se **rechaza** (`403`) — el segundo escritor **no
escribe**.

Invariantes:

- **`aplicar` NO muta**: consulta **determinista** regla → apunte; **misma entrada →
  mismo corte**.
- **`proponer` es APPEND-ONLY**: las reglas se **APILAN**; un `id` ya presente → `409`
  (**no se sobrescribe**).
- Los **CRITERIOS** de una condición (`signo`, `concepto_contiene`, `contraparte`,
  `cuenta`, `importe_min`, `importe_max`) son **DECLARABLES**: ninguna constante
  cableada; un criterio que el movimiento **no aporta NO casa** (**dato ausente =
  desconocido, no coincidente**).
- La **cuenta** de la regla se verifica contra el **plan declarado** (`catalogo-cuentas`
  B1) **POR EVENTO**: si el plan dice que no existe → `422 CUENTA_FUERA_DEL_PLAN`; si el
  plan **no responde** se acepta con `cuenta_verificada:false` (**nunca se asume
  verificado**).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/regla-movimiento-bancario/regla-movimiento-bancario.json`), restaura en
`project.activated` y vuelca en `onUnload`. Proyecciones `_aplicar` y `_proponer`.
Publica `contabilidad.regla_bancaria_propuesta`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `regla-movimiento-bancario.aplicar.request` | `onAplicarRequest` | RPC custodio (corte duro, NO muta): {project_id, movimiento:{fecha, importe, signo, concepto, contraparte?, cuenta?}} → {cubierta:true, corte:'regla', regla:{id, condicion, origen}, apunte:{cuenta, tercero, periodo}, reglas_evaluadas} o bien {cubierta:false, apunte:null, motivo, requiere_cola:true, destino_cola:'ASESOR'} cuando ninguna regla casa. Determinista: primera regla en orden de entrada cuya condicion casa (todos los criterios AND). Responde por regla-movimiento-bancario.aplicar.response; project_id o movimiento ausente → regla-movimiento-bancario.aplicar.failed. |
| `regla-movimiento-bancario.proponer.request` | `onProponerRequest` | RPC custodio (escritura, UNICO ESCRITOR): {project_id, rol:'RATIFICACION_REGLA_APRENDIDA', regla:{id?, condicion:{signo?, concepto_contiene?, contraparte?, cuenta?, importe_min?, importe_max?}, apunte:{cuenta, tercero?, periodo?}, origen?}} → {regla, cuenta_verificada, anadida:true}. Append-only: un id ya presente → 409. La cuenta se verifica contra catalogo-cuentas (B1) por EVENTO: no existe → 422. Exito → publica contabilidad.regla_bancaria_propuesta y responde por regla-movimiento-bancario.proponer.response; rol distinto de RATIFICACION_REGLA_APRENDIDA → 403; condicion o apunte malformados → 400/422; fallo → regla-movimiento-bancario.proponer.failed. |
| `project.activated` | `onProjectActivated` | Restaura la parcela de reglas bancarias (append-only) del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `regla-movimiento-bancario.aplicar.response` | Respuesta RPC correlada de regla-movimiento-bancario.aplicar.request → {request_id, status:200, data:{cubierta, corte, regla, apunte, reglas_evaluadas, motivo?, requiere_cola?, destino_cola?}}. Emitida por el helper _atender. |
| `regla-movimiento-bancario.aplicar.failed` | Par de fallo determinista (E8): project_id o movimiento ausente → {status, error:{code, message, details?}}. Cierra el circulo de regla-movimiento-bancario.aplicar.request. |
| `regla-movimiento-bancario.proponer.response` | Respuesta RPC correlada de regla-movimiento-bancario.proponer.request → {request_id, status:200, data:{regla, cuenta_verificada, anadida:true}}. Emitida por el helper _atender. |
| `regla-movimiento-bancario.proponer.failed` | Par de fallo determinista (E8): segundo escritor (rol distinto de RATIFICACION_REGLA_APRENDIDA → 403), id ya existente (409), cuenta fuera del plan declarado (422) o condicion/apunte malformados → {status, error:{code, message, details?}}. Cierra el circulo de regla-movimiento-bancario.proponer.request. |
| `contabilidad.regla_bancaria_propuesta` | Fire-and-forget (E8): una regla bancaria quedo declarada (append-only) → {project_id, regla, cuenta_verificada, correlation_id}. La LEEN el corte duro del extracto (conciliacion-bancaria E1) y el juicio aislado (partida-no-identificada E7), que pasan a automatico en cuanto existe la regla. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `regla-movimiento-bancario.aplicar.failed` cierra el círculo de
> `regla-movimiento-bancario.aplicar.request` cuando `_aplicar` devuelve status ≠ 200, y
> `regla-movimiento-bancario.proponer.failed` cierra el de
> `regla-movimiento-bancario.proponer.request` cuando `_proponer` devuelve status ≠ 200.

> Nota: `_aplicar` **nunca** devuelve status ≠ 200 salvo `project_id`/`movimiento`
> ausentes; un movimiento sin regla que lo cubra **sí** es `200` (`cubierta:false`) — la
> falta de cobertura **no es un fallo**, es un hecho declarado que va a la cola.

> Nota: el módulo expone `reglasDe(pid)` como **lectura directa** para otras hojas del
> mismo proceso (no muta) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **Orden de evaluación determinista**: `_aplicar` recorre las reglas **en orden de
   entrada** (`[...parcela.reglas.values()]`) y se queda con la **primera** cuya condición
   casa. Mismo estado → mismo corte.
2. **Todos los criterios son AND y deben resolverse**: `_casa` recorre cada criterio
   declarado de la condición; si el movimiento **no aporta** el criterio (`null` o
   `undefined`) → `{ok:false, motivo:'el movimiento no aporta <criterio>'}`. **Dato
   ausente ≠ dato coincidente.**
3. **Comparaciones por criterio**: `signo` → igualdad (normalizado a minúsculas);
   `concepto_contiene` → `real.includes(esperado)` con el concepto en MAYÚSCULAS;
   `contraparte` → igualdad tras normalizar (MAYÚSCULAS + quitar `[\s.\-_/]`);
   `cuenta` → igualdad (trim); `importe_min` → `real >= esperado`; `importe_max` →
   `real <= esperado`.
4. **Normalización de la condición declarada** (`_condicion`): se ignoran los criterios
   `undefined`/`null`/`''`; los importes se pasan a `Number` (solo si `Number.isFinite`);
   `signo` a minúsculas; el resto a MAYÚSCULAS + trim. Sin ningún criterio válido →
   `null` → `400 INVALID_INPUT` (`field:'regla.condicion'`).
5. **Apunte del corte**: si la regla no declara `tercero` → `null`; si no declara
   `periodo` → se deriva del movimiento (`_periodoDe`: los 7 primeros caracteres
   `YYYY-MM` si la fecha encaja `/^\d{4}-\d{2}/`, si no `null`). **Dato ausente =
   desconocido**, nunca se inventa el periodo.
6. **Sin regla que cubra NO se inventa la cuenta**: respuesta `200` con `cubierta:false`,
   `corte:null`, `regla:null`, `apunte:null`, `requiere_cola:true`,
   `destino_cola:'ASESOR'` y un `motivo`: `'no hay reglas declaradas que cubran el
   movimiento'` si la parcela está vacía, o el último motivo de no-casa.
7. **GUARD de escritor (un solo escritor)**: `_proponer` exige
   `input.rol === 'RATIFICACION_REGLA_APRENDIDA'` (constante `ROL_ESCRITOR`). Cualquier
   otro rol → `403 PERMISSION_DENIED` con `{rol_esperado, rol_recibido}`.
8. **Verificación de la cuenta contra el plan declarado, POR EVENTO**: `_proponer` llama
   a `catalogo-cuentas.buscar.request` (`{project_id, codigo:cuenta}`, `timeout_ms:4000`).
   Si el plan responde (`plan_data`) se marca `cuenta_verificada:true` y, si
   `encontrada === false`, se rechaza con `422 PRECONDITION_FAILED`. Si el plan **no
   responde** → se acepta con `cuenta_verificada:false` (**nunca se asume verificado**).
9. **APPEND-ONLY (no se sobrescribe)**: un `id` ya presente en la parcela →
   `409 ALREADY_EXISTS` con `{id}`. La parcela **solo crece**.
10. **Id por defecto**: si la regla no trae `id`, se genera
    ``rb${pid}-${tamaño+1}``. El `id` declarado se normaliza con `String(...)`.
11. **La regla apilada queda completa**: `{id, condicion, apunte:{cuenta, tercero, periodo},
    origen (default 'APRENDIDA'), cuenta_verificada, creada_en}`; `creada_en` se sella con
    `new Date().toISOString()`.
12. **`project_id` con fallback**: `input.project_id || this.project_id`.
13. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
14. **HTTP exacto**: éxito `200` (con `cubierta` true o false); `project_id`/`movimiento`/
    `regla`/`condicion`/`apunte.cuenta` inválidos → `400 INVALID_INPUT`; rol ajeno → `403`
    PERMISSION_DENIED; `id` repetido → `409 ALREADY_EXISTS`; cuenta fuera del plan → `422`
    PRECONDITION_FAILED; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `regla-movimiento-bancario.aplicar.response` y
`regla-movimiento-bancario.proponer.response`; emite `contabilidad.regla_bancaria_propuesta`.

### 1. `aplicar` — el corte duro (no muta)

```json
{
  "project_id": "e57a318a-...",
  "movimiento": { "fecha": "2026-09-01", "importe": 12.5, "signo": "cargo", "concepto": "COMISION MANTENIMIENTO CUENTA", "contraparte": "BANCO X" },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (cubierta):

```json
{
  "project_id": "e57a318a-...",
  "cubierta": true,
  "corte": "regla",
  "regla": { "id": "rb-e57a318a-1", "condicion": { "concepto_contiene": "COMISION" }, "origen": "APRENDIDA" },
  "apunte": { "cuenta": "629", "tercero": null, "periodo": "2026-09" },
  "reglas_evaluadas": 3
}
```

Respuesta `200` (sin cobertura — **no se inventa la cuenta**):

```json
{
  "project_id": "e57a318a-...",
  "cubierta": false,
  "corte": null,
  "regla": null,
  "apunte": null,
  "motivo": "concepto_contiene no casa",
  "requiere_cola": true,
  "destino_cola": "ASESOR",
  "reglas_evaluadas": 3
}
```

### 2. `proponer` — apilar una regla declarada (append-only)

```json
{
  "project_id": "e57a318a-...",
  "rol": "RATIFICACION_REGLA_APRENDIDA",
  "regla": {
    "condicion": { "signo": "cargo", "concepto_contiene": "COMISION" },
    "apunte": { "cuenta": "629" },
    "origen": "APRENDIDA"
  },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "regla": { "id": "rb-e57a318a-1", "condicion": { "signo": "cargo", "concepto_contiene": "COMISION" }, "apunte": { "cuenta": "629", "tercero": null, "periodo": null }, "origen": "APRENDIDA", "cuenta_verificada": true, "creada_en": "2026-09-25T...:00.000Z" },
  "cuenta_verificada": true,
  "anadida": true
}
```

Emite `contabilidad.regla_bancaria_propuesta`:

```json
{ "project_id": "e57a318a-...", "regla": { "...": "..." }, "cuenta_verificada": true, "correlation_id": "abc-123" }
```

### 3. Fallo — segundo escritor

Respuesta `403` + `regla-movimiento-bancario.proponer.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el camino de aprendizaje (RATIFICACION_REGLA_APRENDIDA) puede asentar reglas bancarias", "details": { "rol_esperado": "RATIFICACION_REGLA_APRENDIDA", "rol_recibido": "OTRO" } } }
```

### 4. Fallo — cuenta fuera del plan declarado

Respuesta `422` + `regla-movimiento-bancario.proponer.failed`:

```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "la cuenta no existe en el plan declarado; la regla no se asienta", "details": { "cuenta": "9999", "project_id": "e57a318a-..." } } }
```

### 5. Fallo — la regla ya existe (append-only)

Respuesta `409` + `regla-movimiento-bancario.proponer.failed`:

```json
{ "status": 409, "error": { "code": "ALREADY_EXISTS", "message": "la regla ya existe; no se sobrescribe", "details": { "id": "rb-e57a318a-1" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/regla-movimiento-bancario.test.js`.
Cubre:

- `aplicar` con una regla que casa → `200 {cubierta:true, corte:'regla'}` con `apunte`
  completo y `reglas_evaluadas`.
- `aplicar` sin reglas declaradas → `200 {cubierta:false, requiere_cola:true,
  destino_cola:'ASESOR'}` (**no se inventa la cuenta**).
- Determinismo: misma entrada + mismas reglas → mismo corte.
- Un criterio que el movimiento no aporta → no casa (dato ausente = desconocido).
- `proponer` con rol correcto → `200 {anadida:true}` y emite
  `contabilidad.regla_bancaria_propuesta`.
- `proponer` con otro rol → `403 PERMISSION_DENIED` + `.proponer.failed`.
- `proponer` con un `id` ya presente → `409 ALREADY_EXISTS` (append-only).
- `proponer` con cuenta fuera del plan → `422 PRECONDITION_FAILED`; con el plan sin
  responder → `cuenta_verificada:false` y se acepta.
- `project_id`/`movimiento` ausentes → `400 INVALID_INPUT` + `.aplicar.failed`.
- `project.activated` restaura las reglas; `reglasDe(pid)` lee sin mutar.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ReglaMovimientoBancario extends ModuloHibridoReflejo`; `name =
  'regla-movimiento-bancario'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._parcelas` (`Map<project_id, {esquema, reglas: Map<id, Regla>}>`). Constantes
  `ROL_ESCRITOR = 'RATIFICACION_REGLA_APRENDIDA'` y
  `CRITERIOS = ['signo','concepto_contiene','contraparte','cuenta','importe_min','importe_max']`
  (la LISTA es fija, el molde; los VALORES son dato declarado).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'regla-movimiento-bancario.json', dir: '/contabilidad/regla-movimiento-bancario',
  snapshot, hidratar })` desde `modules/contabilidad-libro/regla-movimiento-bancario/`
  (DOS niveles → `../../_shared/pos-persistencia`). `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`; `marcarDirty(pid)` en
  cada escritura.
- `onAplicarRequest` y `onProponerRequest` usan `this._atender(e, <op>,
  '<slug>.<op>.response', ...)`; dentro se cierra el círculo (`_aplicar` publica
  `.aplicar.failed` si `status !== 200`; `onProponerRequest` publica el evento de dominio
  en `200` y `.proponer.failed` si no). `_proponer` es `async` (RPC al plan).
- Proyecciones `_aplicar` (no muta) y `_proponer` (escritura + guard); helpers `_condicion`,
  `_casa`, `_num`, `_periodoDe`, `_obtenerOCrear`; lectura directa `reglasDe(pid)`. Tools
  `toolAplicar` / `toolProponer`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: verifica la cuenta contra `catalogo-cuentas` (B1) **por evento**. Lo LEEN
  `conciliacion-bancaria` (E1) y `partida-no-identificada` (E7) por EVENTO
  (`regla-movimiento-bancario.aplicar.request`) y por `contabilidad.regla_bancaria_propuesta`.
- **PARÁMETRO COMO DATO**: los criterios de la condición son **declarables** (el dueño/asesor
  los declara); el código **no cablea ninguna regla** ni asume ninguna cuenta.
