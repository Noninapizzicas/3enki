---
name: regla-contrapartida
description: >
  Skill FULL del módulo CUSTODIO `regla-contrapartida` de la vertical contabilidad
  de Enki. La parcela de reglas declarables/aprendidas de contrapartida ('este
  proveedor → esta cuenta'): es el CORTE DURO — lo que `aplicar` devuelve como
  cubierta:true es lo que se puede asentar, y lo que no cubre NO se inventa. Un solo
  escritor (el aprendizaje entra por ratificación) y la escritura es append-only;
  persiste por proyecto con PosPersistencia. Úsala para operar, depurar o extender el
  custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites aplicar el corte duro de contrapartida a un hecho (RPC
    regla-contrapartida.aplicar.request) o asentar una regla aprendida (RPC
    regla-contrapartida.proponer.request).
  - Cuando depures por qué una regla no se asienta (403 PERMISSION_DENIED si el rol no
    es RATIFICACION_REGLA_APRENDIDA, 409 ALREADY_EXISTS si el id ya existe, 422
    cuándo la cuenta está fuera del plan, 400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes (corte duro determinista, append-only, plan verificado por evento,
    dato ausente ≠ dato coincidente).
  - Cuando vayas a escribir/ampliar el test unitario del custodio regla-contrapartida.
tags: [enki, modulo, custodio, contabilidad, regla-contrapartida]
---

# regla-contrapartida — CUSTODIO CON PERSISTENCIA del corte duro

## Qué hace el módulo

`regla-contrapartida` es un **CUSTODIO CON PERSISTENCIA** (A6.2, hoja del plan): la
parcela de las **REGLAS DECLARABLES/APRENDIDAS de contrapartida** («este proveedor →
esta cuenta»). Es el **CORTE DURO**: lo que `aplicar` devuelve como `cubierta:true` es
lo que se puede asentar; lo que **no cubre NO se inventa** (queda sin propuesta y va a
la cola de excepción, A8.1).

**UN SOLO ESCRITOR**: el camino de aprendizaje (ratificación desde fuera, L10 —
`RATIFICACION_REGLA_APRENDIDA`); cualquier otro rol es rechazado (segundo escritor →
`403`).

Invariantes:
- **`aplicar` NO muta**: es una consulta determinista regla→apunte. La **primera regla
  en orden de entrada** cuya condición casa es la que corta.
- **Criterios AND**: `tercero_nif`, `vertical`, `tipo`, `concepto_contiene`. Un
  **dato ausente ≠ dato coincidente**: un criterio que el hecho no aporta NO casa.
- **`proponer` es APPEND-ONLY**: las reglas se apilan; un `id` ya presente → `409`, no
  se sobrescribe.
- **La cuenta se verifica contra el plan declarado** (`catalogo-cuentas`, B1) **por
  evento**: fuera del plan → `422 CUENTA_FUERA_DEL_PLAN`; plan no disponible (timeout)
  → se acepta y se declara `cuenta_verificada:false` (**nunca se asume verificado**).
- Persiste por proyecto con **PosPersistencia** (storage
  `/contabilidad/regla-contrapartida/regla-contrapartida.json`), restaura en
  `project.activated` y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `regla-contrapartida.aplicar.request` | `onAplicarRequest` | RPC custodio (corte duro, NO muta): {project_id, hecho} → {cubierta, corte:'regla', regla, apunte:{cuenta, tercero, periodo}, reglas_evaluadas}. Aplica la primera regla (orden de entrada, determinista) cuya condicion casa el hecho (criterios AND). Sin regla que cubra → {cubierta:false, apunte:null, motivo, requiere_cola:true, destino_cola:'ASESOR'}: NO se inventa la cuenta. Responde por regla-contrapartida.aplicar.response; project_id o hecho ausente → regla-contrapartida.aplicar.failed. |
| `regla-contrapartida.proponer.request` | `onProponerRequest` | RPC custodio (escritura, UN escritor): {project_id, rol:'RATIFICACION_REGLA_APRENDIDA', regla:{id?, condicion, apunte:{cuenta, tercero?, periodo?}, origen?}} → {regla, cuenta_verificada, anadida}. Guard Rol=RATIFICACION_REGLA_APRENDIDA (segundo escritor → 403). Append-only: id ya presente → 409. La cuenta se verifica contra el plan declarado por evento: fuera del plan → 422; plan no disponible → se acepta con cuenta_verificada:false. Exito → publica contabilidad.regla_contrapartida_propuesta y responde por regla-contrapartida.proponer.response; invalido → regla-contrapartida.proponer.failed. |
| `project.activated` | `onProjectActivated` | Restaura la parcela de reglas de contrapartida del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `regla-contrapartida.aplicar.response` | Respuesta RPC correlada de regla-contrapartida.aplicar.request → {request_id, status:200, data:{cubierta, corte, regla, apunte, motivo, requiere_cola, destino_cola, reglas_evaluadas}}. Emitida por el helper _atender. |
| `regla-contrapartida.aplicar.failed` | Par de fallo determinista (A6.2): project_id o hecho ausente → {status, error:{code, message, details?}}. Cierra el circulo de regla-contrapartida.aplicar.request. |
| `regla-contrapartida.proponer.response` | Respuesta RPC correlada de regla-contrapartida.proponer.request → {request_id, status:200, data:{regla, cuenta_verificada, anadida}}. Emitida por el helper _atender. |
| `regla-contrapartida.proponer.failed` | Par de fallo determinista (A6.2): rol != RATIFICACION_REGLA_APRENDIDA (segundo escritor), regla sin condicion o sin cuenta de apunte, id ya presente (409) o cuenta fuera del plan (422) → {status, error:{code, message, details?}}. Cierra el circulo de regla-contrapartida.proponer.request. |
| `contabilidad.regla_contrapartida_propuesta` | Fire-and-forget (A6.2): una regla de contrapartida quedo propuesta → {project_id, regla, cuenta_verificada, correlation_id}. Lo consume la ratificacion de reglas aprendidas (L10), que la hidrata de vuelta. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `regla-contrapartida.aplicar.failed` cierra `aplicar.request` (lo publica
> `onAplicarRequest` cuando `_aplicar` devuelve status ≠ 200, es decir por
> `project_id`/`hecho` ausente — no por «sin regla», que es `200`) y
> `regla-contrapartida.proponer.failed` cierra `proponer.request` en su rama
> `status !== 200`.

## Reglas de negocio

1. **Corte duro determinista, primera regla gana**: `_aplicar` recorre las reglas en
   orden de entrada (`[...parcela.reglas.values()]`) y devuelve la **primera** cuya
   `condicion` casa. Determinista: mismo hecho + mismas reglas → mismo corte.
2. **Criterios AND declarables**: constante `CRITERIOS = ['tercero_nif','vertical',
   'tipo','concepto_contiene']`. La condición se normaliza a mayúsculas/trim (el
   `concepto_contiene` se compara por `includes`). Todos los criterios de la condición
   deben casar.
3. **Dato ausente ≠ dato coincidente**: si el hecho no aporta un criterio
   (`real === null/undefined`) → `{ok:false, motivo:'el hecho no aporta <criterio>'}`.
   La regla no casa, y el motivo del último intento se conserva para el mensaje.
4. **Sin regla que cubra NO se inventa**: `cubierta:false`, `apunte:null`, `corte:null`,
   `motivo` («no hay reglas declaradas que cubran el hecho» o el último motivo),
   `requiere_cola:true`, `destino_cola:'ASESOR'`.
5. **El apunte se completa sin inventar**: `apunte.cuenta` es la de la regla;
   `tercero` = el de la regla o `null`; `periodo` = el de la regla o, si no lo declara,
   `_periodoDe(hecho)` (primeros 7 caracteres de una fecha `YYYY-MM`), o `null`.
6. **Un solo escritor (guard de rol)**: `_proponer` exige
   `input.rol === 'RATIFICACION_REGLA_APRENDIDA'` (constante `ROL_ESCRITOR`). Cualquier
   otro rol → `403 PERMISSION_DENIED` con `{rol_esperado, rol_recibido}`.
7. **Append-only**: si `parcela.reglas.has(id)` → `409 ALREADY_EXISTS` con `{id}`
   («la regla ya existe; no se sobrescribe»). El `id` se declara o se autogenera
   `r<project_id>-<n+1>`.
8. **Verificación de la cuenta contra el plan POR EVENTO**: `_proponer` consulta
   `catalogo-cuentas.buscar.request` (`timeout_ms:4000`). Si el plan responde y
   `encontrada:false` → `422 PRECONDITION_FAILED` (`{cuenta, project_id}`). Si el plan
   no responde → se acepta con `cuenta_verificada:false` (nunca se asume verificado).
9. **Condición mínima**: `_condicion` exige al menos un criterio válido; la condición
   sin criterios → `400 INVALID_INPUT` (`field:'regla.condicion'`). El apunte sin
   cuenta → `400 INVALID_INPUT` (`field:'regla.apunte.cuenta'`).
10. **Regla con metadatos**: `{id, condicion, apunte:{cuenta, tercero, periodo},
    origen (por defecto 'APRENDIDA'), cuenta_verificada, creada_en}`.
11. **La lectura no muta**: `_aplicar` obtiene o crea la parcela y consulta sin
    tocar las reglas. Lectura directa `reglasDe(pid)` para otras hojas.
12. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    restaura en `project.activated`; `flush()` + `detener()` en `onUnload`.
13. **HTTP exacto**: éxito `200`; rol inválido → `403`; id existente → `409`; cuenta
    fuera del plan → `422`; campos inválidos → `400`; excepción en `_atender` → `500
    UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `regla-contrapartida.aplicar.response` y
`regla-contrapartida.proponer.response`.

### 1. `aplicar` — el corte duro (no muta)

```json
{
  "project_id": "e57a318a-...",
  "hecho": { "vertical": "pizzepos", "tipo": "compra", "tercero": { "nif": "B12345678" }, "fecha": "2026-09-01", "concepto": "harina" },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (regla que cubre):
```json
{
  "project_id": "e57a318a-...",
  "cubierta": true, "corte": "regla",
  "regla": { "id": "r1", "condicion": { "TERCERO_NIF": "B12345678" }, "origen": "APRENDIDA" },
  "apunte": { "cuenta": "600", "tercero": null, "periodo": "2026-09" },
  "reglas_evaluadas": 1
}
```

Sin regla que cubra → `200` con `cubierta:false`, `apunte:null`, `requiere_cola:true`,
`destino_cola:'ASESOR'`.

### 2. `proponer` — asentar una regla aprendida (solo RATIFICACION_REGLA_APRENDIDA)

```json
{
  "project_id": "e57a318a-...",
  "rol": "RATIFICACION_REGLA_APRENDIDA",
  "regla": { "condicion": { "tercero_nif": "B12345678" }, "apunte": { "cuenta": "600" }, "origen": "APRENDIDA" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "regla": { "id": "re57a318a-...-1", "condicion": { "TERCERO_NIF": "B12345678" }, "apunte": { "cuenta": "600", "tercero": null, "periodo": null }, "origen": "APRENDIDA", "cuenta_verificada": true, "creada_en": "2026-09-25T..." },
  "cuenta_verificada": true, "anadida": true
}
```

Emite `contabilidad.regla_contrapartida_propuesta`:
```json
{ "project_id": "e57a318a-...", "regla": { "...": "..." }, "cuenta_verificada": true, "correlation_id": "abc-123" }
```

### 3. Fallo — rol inválido (segundo escritor)

Respuesta `403` + `regla-contrapartida.proponer.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el camino de aprendizaje (RATIFICACION_REGLA_APRENDIDA) puede asentar reglas", "details": { "rol_esperado": "RATIFICACION_REGLA_APRENDIDA", "rol_recibido": "OTRO" } } }
```

### 4. Fallo — cuenta fuera del plan

Respuesta `422` + `regla-contrapartida.proponer.failed`:
```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "la cuenta no existe en el plan declarado; la regla no se asienta", "details": { "cuenta": "999", "project_id": "e57a318a-..." } } }
```

### 5. Fallo — id ya presente (append-only)

Respuesta `409` + `regla-contrapartida.proponer.failed`:
```json
{ "status": 409, "error": { "code": "ALREADY_EXISTS", "message": "la regla ya existe; no se sobrescribe", "details": { "id": "r1" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/regla-contrapartida.test.js`.
Cubre:

- `aplicar` con una regla que casa → `200 cubierta:true`, `corte:'regla'`, apunte con
  `periodo` derivado de la fecha.
- `aplicar` con dos reglas que casan → gana la **primera** en orden de entrada
  (determinista).
- `aplicar` con un criterio que el hecho NO aporta → no casa (`cubierta:false`).
- `aplicar` sin reglas o sin match → `200 cubierta:false`, `requiere_cola:true`,
  `destino_cola:'ASESOR'`.
- `proponer` con rol `RATIFICACION_REGLA_APRENDIDA` y cuenta en el plan →
  `200 {anadida:true}` con `cuenta_verificada:true` y
  `contabilidad.regla_contrapartida_propuesta`.
- `proponer` con otro rol → `403`; `id` repetido → `409`; cuenta fuera del plan →
  `422`; plan no disponible → se acepta con `cuenta_verificada:false`.
- `proponer` sin `regla.condicion` / sin `regla.apunte.cuenta` → `400 INVALID_INPUT`.
- `project.activated` restaura la parcela via PosPersistencia; `reglasDe(pid)` lee sin
  mutar.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ReglaContrapartida extends ModuloHibridoReflejo`; `name =
  'regla-contrapartida'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._parcelas` (`Map<project_id, {esquema, reglas: Map<id, Regla>}>`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'regla-contrapartida.json', dir: '/contabilidad/regla-contrapartida', snapshot,
  hidratar })` sobre `../../_shared/pos-persistencia` (DOS niveles).
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
  Cada escritura marca `marcarDirty(pid)`.
- `onAplicarRequest` → `_atender(e, 'aplicar',
  'regla-contrapartida.aplicar.response', async (d) => {...})` y publica el par
  `failed` si `status !== 200`. `onProponerRequest` → `_atender(e, 'proponer',
  'regla-contrapartida.proponer.response', async (d) => {...})` y dentro cierra el
  círculo (evento de dominio en `200`, par `failed` si no).
- Proyecciones `_aplicar` (async, corte duro) y `_proponer` (async, escritura + guard);
  helpers `_condicion`, `_casa`, `_nifDe`, `_periodoDe`, `_obtenerOCrear`; lectura
  directa `reglasDe(pid)`. Tools `toolAplicar` / `toolProponer`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo consultan `contrapartida-asistida` (A6.1) por evento
  (`regla-contrapartida.aplicar.request`) y `ratificacion-regla-aprendida` (L10), que
  hidrata de vuelta las reglas aprendidas; verifica contra `catalogo-cuentas` (B1).
