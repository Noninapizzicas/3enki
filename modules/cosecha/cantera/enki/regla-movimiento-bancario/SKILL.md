---
name: regla-movimiento-bancario
description: >
  Skill FULL del módulo CUSTODIO `regla-movimiento-bancario` de la vertical
  contabilidad de Enki (E8, hoja del plan). Repositorio de reglas "esta comisión →
  esta cuenta", DECLARADAS o APRENDIDAS. Es el mismo CORTE DURO que A6.2
  (regla-contrapartida) pero del lado del BANCO: una regla DECLARADA actúa de
  inmediato sobre el volumen; una regla APRENDIDA no actúa hasta ser RATIFICADA (L10).
  Comparte con A6.2 la PUERTA ÚNICA de ratificación. Un solo escritor del repositorio
  (DUENO/ASESOR; second-writer rechazado con PERMISSION_DENIED). Persiste por proyecto
  vía PosPersistencia. Consume por EVENTO contabilidad.regla_ratificada (L10 ratificó
  la regla) sin require cruzado. Úsala para operar, depurar o extender el custodio.
when-to-use: >
  - Cuando necesites leer las reglas bancarias (RPC
    contabilidad.regla_movimiento.leer.request), declarar una regla que actúe ya
    (contabilidad.regla_movimiento.declarar.request) o aportar una regla aprendida que
    espera ratificación (contabilidad.regla_movimiento.aprender.request).
  - Cuando depures por qué declarar/aprender se rechaza (403 PERMISSION_DENIED si el
    rol no es DUENO/ASESOR, 400 INVALID_INPUT si falta regla.patron) o por qué una
    ratificación (L10) no halla la regla (404).
  - Cuando quieras entender el contrato de eventos, la distinción DECLARADA/APRENDIDA
    /RATIFICADA y por qué una regla aprendida NO actúa hasta que L10 la ratifique.
  - Cuando vayas a escribir/ampliar el test unitario del custodio regla-movimiento-bancario.
tags: [enki, modulo, custodio, persistencia, contabilidad, regla-movimiento-bancario, banco, ratificacion]
---

# regla-movimiento-bancario — CUSTODIO de las reglas del movimiento bancario

## Qué hace el módulo

`regla-movimiento-bancario` es un **CUSTODIO CON PERSISTENCIA** (E8, hoja del plan): el
dueño del **repositorio de reglas "esta comisión → esta cuenta"**, por proyecto. Las
reglas pueden ser **DECLARADAS** o **APRENDIDAS**. Es el **mismo CORTE DURO que A6.2
(`regla-contrapartida`) pero del lado del BANCO**: una regla **DECLARADA actúa de
inmediato** sobre el volumen; una regla **APRENDIDA no actúa hasta ser RATIFICADA** por
L10. Comparte con A6.2 la **PUERTA ÚNICA de ratificación** (no hay tres puertas
distintas en el dominio).

Hay **un solo escritor del repositorio** (guard en `_declarar` y `_aprender`): el rol
debe ser **DUENO/ASESOR** (constante `ROLES_AUTORIZADOS`); second-writer rechazado con
`PERMISSION_DENIED`. `_aplicar` es una **proyección PURA de lectura** (no muta) que
devuelve **`SIN_COBERTURA`** si ninguna regla activa cubre el movimiento.

Consume por **EVENTO** `contabilidad.regla_ratificada` (L10 ratificó la regla) **sin
`require` cruzado**. Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/regla-movimiento-bancario/*.json`), restaura en `project.activated` y
vuelca en `onUnload`.

> **NO REUTILIZA**: no existe regla de clasificación bancaria en el inventario;
> `regla-contrapartida` (A6.2) es la regla del **HECHO**, no la del **movimiento
> bancario**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response y consumos por evento)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.regla_movimiento.leer.request` | `onLeerRequest` | RPC custodio: {project_id, estado?} → {project_id, reglas:[ReglaDeclarada]}. Proyeccion PURA de lectura (no muta); filtra por estado si se indica. Si falta project_id → contabilidad.regla_movimiento.leer.failed. Lo consume partida-no-identificada (E7) y el desatasco de la conciliacion. |
| `contabilidad.regla_movimiento.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'DUENO'\|'ASESOR', regla:{patron, contrapartida}} → {project_id, regla, actua:true}. Guard de escritor: solo DUENO/ASESOR (second-writer rechazado). Una regla DECLARADA actua de inmediato sobre el volumen. Publica contabilidad.regla_movimiento_declarada y responde por contabilidad.regla_movimiento.declarar.response; si el rol o el payload son invalidos → contabilidad.regla_movimiento.declarar.failed. |
| `contabilidad.regla_movimiento.aprender.request` | `onAprenderRequest` | RPC custodio: {project_id, rol:'DUENO'\|'ASESOR', regla:{patron, contrapartida}, evidencia} → {project_id, regla, actua:false}. El aprendizaje entra HIDRATADO (por E7/desatasco) y queda en RATIFICACION_PENDIENTE: NO actua hasta que L10 la ratifique. Publica contabilidad.regla_movimiento_aprendida y responde por contabilidad.regla_movimiento.aprender.response; si el rol o el payload son invalidos → contabilidad.regla_movimiento.aprender.failed. |
| `contabilidad.regla_ratificada` | `onReglaRatificada` | Fire-and-forget (L10 → E8): el puente de ratificacion aprobo una regla aprendida → {project_id, regla_id, decision:'APRUEBA'}. La regla pasa a RATIFICADA y ya actua sobre el volumen. Si no se halla o la ratificacion es invalida → contabilidad.regla_movimiento_aprendida.failed. |
| `project.activated` | `onProjectActivated` | Restaura el repositorio de reglas bancarias del proyecto activado desde el storage (PosPersistencia): las reglas son POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.regla_movimiento_declarada` | Fire-and-forget (E8): una regla bancaria quedo declarada y ya actua → {project_id, regla, actua:true}. Lo consume conciliacion-bancaria (E1) para el cruce por reglas y el desatasco de partidas sin identificar. |
| `contabilidad.regla_movimiento_aprendida` | Fire-and-forget (E8): una regla bancaria quedo APRENDIDA y espera ratificacion (NO actua todavia) → {project_id, regla, actua:false}. Lo consume ratificacion-regla-aprendida (L10) para armar la solicitud de decision al asesor. |
| `contabilidad.regla_movimiento.leer.failed` | Par de fallo determinista: leer con payload invalido (sin project_id). Cierra el circulo de contabilidad.regla_movimiento.leer.request. |
| `contabilidad.regla_movimiento.declarar.failed` | Par de fallo determinista: declarar rechazado (rol != DUENO/ASESOR) o payload invalido (sin patron). Cierra el circulo de contabilidad.regla_movimiento.declarar.request. |
| `contabilidad.regla_movimiento.aprender.failed` | Par de fallo determinista: aprender rechazado (rol != DUENO/ASESOR) o payload invalido (sin patron). Cierra el circulo de contabilidad.regla_movimiento.aprender.request. |
| `contabilidad.regla_movimiento_declarada.failed` | Par de fallo del evento de dominio contabilidad.regla_movimiento_declarada: la emision del hecho de dominio no se completo. |
| `contabilidad.regla_movimiento_aprendida.failed` | Par de fallo del evento de dominio contabilidad.regla_movimiento_aprendida: la emision del hecho de dominio no se completo, o la ratificacion (L10) no hallo la regla. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.regla_movimiento.leer.failed` cierra `leer.request`;
> `contabilidad.regla_movimiento.declarar.failed` cierra `declarar.request`;
> `contabilidad.regla_movimiento.aprender.failed` cierra `aprender.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.regla_movimiento.leer.response`, `contabilidad.regla_movimiento.declarar.response`
> y `contabilidad.regla_movimiento.aprender.response` (los pares response de los RPC);
> no están declaradas en `publishes`. Además `onReglaRatificada` (consumo
> fire-and-forget de L10) publica `contabilidad.regla_movimiento_aprendida.failed`
> cuando `_ratificar` no devuelve `200` (regla no hallada).

## Reglas de negocio

1. **Un solo escritor del repositorio (guard de rol)**: `_declarar` y `_aprender`
   exigen `rol ∈ {DUENO, ASESOR}` (constante `ROLES_AUTORIZADOS`). Cualquier otro →
   **`403 PERMISSION_DENIED`** con `{ message:'solo DUENO/ASESOR declara reglas
   bancarias' (o '...aporta aprendizaje bancario'), details:{ roles_esperados:['DUENO','ASESOR'],
   rol_recibido:<rol> } }`. Second-writer rechazado.
2. **DECLARADA actúa ya**: `_declarar` asienta la regla con `estado:'DECLARADA'`
   (`ESTADO_DECLARADA`) y devuelve **`actua:true`**. Publica
   `contabilidad.regla_movimiento_declarada`.
3. **APRENDIDA no actúa hasta ser ratificada**: `_aprender` asienta la regla con
   `estado:'RATIFICACION_PENDIENTE'` (`ESTADO_PENDIENTE`), guarda `evidencia`, y
   devuelve **`actua:false`**. Publica `contabilidad.regla_movimiento_aprendida`. La
   regla aprendida entra **hidratada** (de E7/desatasco) y **espera a L10**.
4. **La ratificación llega por EVENTO**: `onReglaRatificada` (L10 → E8) llama a
   `_ratificar`, que pasa la regla a **`RATIFICADA`** (`ESTADO_RATIFICADA`), marca
   `ratificada_en`/`ratificada_por` y devuelve **`actua:true`**. Si la regla no se
   halla → `404 RESOURCE_NOT_FOUND` y se publica
   `contabilidad.regla_movimiento_aprendida.failed`. **Sin `project_id` o `regla_id`
   el handler retorna `null`** (no hace nada).
5. **Solo DECLARADA/RATIFICADA actúan sobre el volumen**: `_aplicar` filtra las reglas
   activas (`DECLARADA` | `RATIFICADA`) y devuelve la `contrapartida` de la primera que
   case; las `RATIFICACION_PENDIENTE` **no** cuentan.
6. **Aplicar es proyección PURA (no muta)**: `_aplicar` casa por patrón con `mov[k] ===
   patron[k]` para **todas** las claves del `patron` (coincidencia exacta total). Si
   ninguna casa → `200 { cubierto:false, contrapartida:null, resultado:'SIN_COBERTURA' }`.
7. **Id y ámbito**: la regla asentada lleva `id` (o `<pid>-mb<n>` al declarar,
   `<pid>-mba<n>` al aprender), `ambito:'MOVIMIENTO_BANCARIO'` y `contrapartida:{...}`.
8. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   `regla` ausente/no objeto → `400 INVALID_INPUT regla`; sin `regla.patron` (o no
   objeto) → `400 INVALID_INPUT regla.patron`. Shape: `{ status:400, error:{
   code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
9. **La ley entra como DATO**: las reglas y sus patrones son **declarables/aprendibles**,
   nunca constantes cableadas. **El sistema NO firma ni decide**: solo aprende y espera
   la ratificación del asesor (L10).
10. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol no autorizado → `403`;
    regla no hallada al ratificar → `404`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.regla_movimiento.leer.response`,
`contabilidad.regla_movimiento.declarar.response` y
`contabilidad.regla_movimiento.aprender.response`.

### 1. `declarar` — regla que actúa ya (DUENO/ASESOR)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "regla": { "patron": { "descripcion": "COMISION" }, "contrapartida": { "cuenta": "626" } },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "regla": { "id": "e57a318a-...-mb1", "ambito": "MOVIMIENTO_BANCARIO", "patron": { "descripcion": "COMISION" }, "contrapartida": { "cuenta": "626" }, "estado": "DECLARADA", "declarado_por": "ASESOR", "declarado_en": "2026-09-28T..." },
  "actua": true
}
```
Emite `contabilidad.regla_movimiento_declarada` (res.data + `correlation_id`).

### 2. `aprender` — regla que espera ratificación (no actúa)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "regla": { "patron": { "descripcion": "TRANSF RECIBIDA" }, "contrapartida": { "cuenta": "430" } },
  "evidencia": "3 movimientos conciliados iguales"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "regla": { "id": "e57a318a-...-mba1", "ambito": "MOVIMIENTO_BANCARIO", "patron": { "descripcion": "TRANSF RECIBIDA" }, "contrapartida": { "cuenta": "430" }, "estado": "RATIFICACION_PENDIENTE", "evidencia": "3 movimientos conciliados iguales", "aportada_por": "ASESOR", "aportada_en": "2026-09-28T..." },
  "actua": false
}
```
Emite `contabilidad.regla_movimiento_aprendida` (res.data + `correlation_id`), que
consume `ratificacion-regla-aprendida` (L10).

### 3. `leer` — leer/filtrar el repositorio (proyección pura)

```json
{ "project_id": "e57a318a-...", "estado": "DECLARADA" }
```
Respuesta `200`: `{ "project_id": "e57a318a-...", "reglas": [ { "...": "..." } ] }`.

### 4. Consumo por evento — ratificación de L10

`onReglaRatificada` recibe `{ project_id, regla_id, decision:'APRUEBA' }` y deja la
regla `RATIFICADA` (`actua:true`, `ratificada_por`). Si no la halla → publica
`contabilidad.regla_movimiento_aprendida.failed`.

### 5. Tools (sin RPC en module.json)

`toolLeer` → `_leer`; `toolDeclarar` → `_declarar`; `toolAprender` → `_aprender`;
`toolAplicar` → `_aplicar`.

### Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "regla": { "patron": { "x": "y" } } }
```
Respuesta `403` + `contabilidad.regla_movimiento.declarar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo DUENO/ASESOR declara reglas bancarias", "details": { "roles_esperados": ["DUENO", "ASESOR"], "rol_recibido": "OPERADOR" } } }
```

## Tests

El test vive en `tests/unit/regla-movimiento-bancario.test.js`. Cubre:

- `declarar` con rol `ASESOR` → `200 {actua:true}`, estado `DECLARADA`, emite
  `contabilidad.regla_movimiento_declarada`.
- `aprender` con rol `ASESOR` → `200 {actua:false}`, estado `RATIFICACION_PENDIENTE`,
  emite `contabilidad.regla_movimiento_aprendida`.
- **Una regla APRENDIDA no actúa**: `_aplicar` no la usa hasta que L10 ratifique.
- `onReglaRatificada` (L10) con la regla hallada → estado `RATIFICADA`, `actua:true`;
  con regla inexistente → `404` + `contabilidad.regla_movimiento_aprendida.failed`.
- `declarar`/`aprender` con rol distinto → `403 PERMISSION_DENIED`.
- Payloads inválidos (sin `project_id`/`regla`/`regla.patron`) → `400 INVALID_INPUT`.
- `leer` filtra por `estado`; `_aplicar` sin cobertura → `{cubierto:false,
  resultado:'SIN_COBERTURA'}`; con cobertura → devuelve la `contrapartida`.
- `project.activated` restaura el repositorio vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/regla-movimiento-bancario
node --test tests/unit/regla-movimiento-bancario.test.js
```

## Notas de implementación

- Clase `ReglaMovimientoBancario extends ModuloHibridoReflejo`; `name =
  'regla-movimiento-bancario'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._store` (Map project_id → `{ esquema:'contabilidad-regla-movimiento-bancario-v1',
  reglas:[] }`).
- Constantes: `ROLES_AUTORIZADOS` (Set `DUENO`,`ASESOR`), `ESTADO_DECLARADA`,
  `ESTADO_PENDIENTE` (`RATIFICACION_PENDIENTE`), `ESTADO_RATIFICADA`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'regla-movimiento-bancario.json', dir: '/contabilidad/regla-movimiento-bancario',
  snapshot, hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload`
  → `flush()` + `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onLeerRequest`/`onDeclararRequest`/`onAprenderRequest` delegan en `_atender(e,
  '<op>', 'contabilidad.regla_movimiento.<op>.response', fn)`. `onReglaRatificada` es un
  handler fire-and-forget propio (no usa `_atender`).
- Proyecciones puras: `_leer`, `_declarar`, `_aprender`, `_ratificar`, `_aplicar`.
  Helper `_obtenerOCrear(pid)`. `_invalid`/`_errorResponse` de la base.
- Tools: `toolLeer`, `toolDeclarar`, `toolAprender`, `toolAplicar`.
- DEP hacia delante: lo consume `conciliacion-bancaria` (E1) para el cruce por reglas y
  el desatasco, y `partida-no-identificada` (E7). DEP hacia atrás por evento:
  `ratificacion-regla-aprendida` (L10).
