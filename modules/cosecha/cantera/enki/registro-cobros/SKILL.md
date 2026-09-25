---
name: registro-cobros
description: >
  Skill FULL del módulo CUSTODIO `registro-cobros` de la vertical nichos (Radar
  de Nichos, proyecto 3D). Registro APPEND-ONLY e inmutable de los cobros
  EFECTIVO vs COMPROMETIDO asentados por proyecto: cada cobro se apila y jamás se
  sobrescribe, con un único escritor (el MOTOR_COBRO E3) protegido por guard de rol.
  Persiste por proyecto vía PosPersistencia y alimenta la salud financiera (F3).
  Úsala para operar, depurar o extender el custodio, o para entender su contrato
  de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites asentar o consultar el historial de cobros de un proyecto
    (RPC nichos.cobro.registrar.request / nichos.cobro.consultar.request).
  - Cuando depures por qué un cobro se rechaza (PERMISSION_DENIED si el rol no es
    MOTOR_COBRO, INVALID_INPUT en payload inválido) o no se emite
    nichos.cobro_registrado.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio (append-only, un solo escritor, EFECTIVO vs COMPROMETIDO).
  - Cuando vayas a escribir/ampliar el test unitario del custodio registro-cobros.
tags: [enki, modulo, custodio, persistencia, nichos, radar, cobros, proyecto-3d]
---

# registro-cobros — CUSTODIO CON PERSISTENCIA del historial de cobros

## Qué hace el módulo

`registro-cobros` es un **CUSTODIO CON PERSISTENCIA** (F1, hoja del plan): el dueño
del store de **HistorialCobros** por proyecto. Cada cobro se asienta distinguiendo
**EFECTIVO** (entró el dinero) vs **COMPROMETIDO** (promesa/suscripción que genera
flujo a caja). El historial es **APPEND-ONLY e inmutable**: cada cobro se apila con
su secuencia y **jamás se sobrescribe** — es la fuente de verdad de la salud
financiera (F3) y del bucle de reglas aprendidas (C7).

Un **solo escritor**: el **MOTOR_COBRO (E3)** asienta vía guard de rol en
`_appendUnico`; los demás procesos son solo lectores. La lectura (`_consultar`) no
muta. Persiste por proyecto con **PosPersistencia** (storage
`/prisma/nichos/registro-cobros.json`), restaura en `project.activated` y vuelca en
`onUnload`. Emite `nichos.cobro_registrado` en éxito y su par de fallo
`nichos.cobro.registrar.failed` en rechazo.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.cobro.registrar.request` | `onRegistrarRequest` | RPC custodio: {project_id, rol:'MOTOR_COBRO', cobro:{importe, tipo:'EFECTIVO'\|'COMPROMETIDO', pagador}} → {project_id, cobro, registrado}. Guard Rol=MOTOR_COBRO (second-writer rechazado). Hace append-only (el cobro se apila, jamás sobrescribe), publica `nichos.cobro_registrado` y responde por `nichos.cobro.registrar.response`. Si rol inválido o payload inválido → `nichos.cobro.registrar.failed`. |
| `nichos.cobro.ejecutado` | `onCobroEjecutado` | Fire-and-forget (F1): motor-cobro (E3) publica {project_id, cobro, duenyo:'MOTOR_COBRO'} tras ejecutar el cobro. Asienta append-only el cobro, publica `nichos.cobro_registrado` y, si el payload es inválido, `nichos.cobro.registrar.failed`. Cierra el círculo del flujo de cobro. |
| `nichos.cobro.consultar.request` | `onConsultarRequest` | RPC custodio: {project_id} → {project_id, historial:[{...cobros}]}. Consulta el HistorialCobros del proyecto (append-only). La lectura no muta. Lo consume la salud financiera (F3) y el portafolio (K1). |
| `project.activated` | `onProjectActivated` | Restaura el historial de cobros del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.cobro_registrado` | Fire-and-forget (F1): un cobro (EFECTIVO o COMPROMETIDO) quedó asentado append-only → {project_id, cobro, registrado:true}. Lo consume la salud financiera (F3) y reglas-aprendidas (C7) para recalibrar el umbral. |
| `nichos.cobro.registrar.failed` | Par de fallo determinista (F1): asiento rechazado (rol != MOTOR_COBRO) o payload inválido → {status, code, message, data}. Cierra el círculo de `nichos.cobro.registrar.request`. Un cobro jamás se sobrescribe. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `nichos.cobro.registrar.failed` cierra el círculo de
> `nichos.cobro.registrar.request` cuando `_appendUnico` devuelve status ≠ 200,
> tanto en la vía RPC (`onRegistrarRequest`) como en el fire-and-forget
> (`onCobroEjecutado`).

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_appendUnico` exige
   `rol === 'MOTOR_COBRO'` (constante `ROL_MOTOR_COBRO`). Si el rol es cualquiera
   otro → `403 PERMISSION_DENIED` con
   `{ status:403, code:'PERMISSION_DENIED', mensaje:'solo el MOTOR_COBRO puede asentar cobros', rol_esperado:'MOTOR_COBRO', rol_recibido:<rol> }`
   + `nichos.cobro.registrar.failed`. Second-writer rechazado.
2. **Append-only, nunca sobrescribir**: cada cobro se apila en `hist.cobros`
   con un `id` de secuencia (`${pid}-c${n+1}`) y fecha (`cobro.fecha || now`).
   El historial existente jamás se muta en asientos previos — solo se añade.
3. **Tipos de cobro cerrados**: `tipo` debe ser `EFECTIVO` o `COMPROMETIDO`
   (Set `TIPOS_COBRO`). Cualquier otro → `400 INVALID_INPUT` `cobro.tipo`.
4. **Importe estrictamente positivo**: `Number(cobro.importe)` debe ser finito y
   `> 0`; si no → `400 INVALID_INPUT` `cobro.importe`. CERO cobros de importe ≤ 0.
5. **Validaciones de payload deterministas**: falta `project_id` → `400 INVALID_INPUT
   project_id`; `cobro` ausente o no objeto → `400 INVALID_INPUT cobro`. Todos
   devuelven `{ status:400, code:'INVALID_INPUT', mensaje:'<campo> requerido', field:<campo> }`.
6. **Asiento con metadatos**: cada cobro se registra con
   `registrado_por: 'MOTOR_COBRO'` siempre, `pagador` normalizado (trim) o `null`
   si viene vacío, y `updated_at` en la cabecera del historial.
7. **La lectura no muta**: `_consultar` obtiene o crea el historial
   (`_obtenerOCrear`, que solo crea si no existe) y devuelve `200
   {project_id, historial}` sin tocar los asientos.
8. **HTTP exacto**: éxito `200`; rol inválido → `403`; campos inválidos → `400`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.cobro.registrar.response` y
`nichos.cobro.consultar.response`:

### 1. `registrar` — asentar un cobro (solo MOTOR_COBRO)

```json
{
  "project_id": "e57a318a-...",
  "rol": "MOTOR_COBRO",
  "cobro": { "importe": 1500.0, "tipo": "EFECTIVO", "pagador": "Cliente A" },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "cobro": { "id": "e57a318a-...-c1", "importe": 1500.0, "tipo": "EFECTIVO", "pagador": "Cliente A", "fecha": "2026-09-25T...", "registrado_por": "MOTOR_COBRO" }, "registrado": true }
```
Emite `nichos.cobro_registrado`:
```json
{ "project_id": "e57a318a-...", "cobro": { "id": "e57a318a-...-c1", "importe": 1500.0, "tipo": "EFECTIVO", "pagador": "Cliente A", "fecha": "2026-09-25T...", "registrado_por": "MOTOR_COBRO" }, "registrado": true, "correlation_id": "abc-123" }
```

### 2. `consultar` — leer el historial (no muta)

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "historial": { "esquema": "nichos-registro-cobros-v1", "cobros": [ { "id": "e57a318a-...-c1", "importe": 1500.0, "tipo": "EFECTIVO", ... } ], "updated_at": "2026-09-25T..." } }
```

### Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "MOTOR_PROPUESTA", "cobro": { "importe": 100, "tipo": "EFECTIVO" } }
```
Respuesta `403` + `nichos.cobro.registrar.failed`:
```json
{ "status": 403, "code": "PERMISSION_DENIED", "mensaje": "solo el MOTOR_COBRO puede asentar cobros", "rol_esperado": "MOTOR_COBRO", "rol_recibido": "MOTOR_PROPUESTA" }
```

## Tests

El test vive en `tests/unit/registro-cobros.test.js`. Cubre:

- `registrar` con rol `MOTOR_COBRO` y cobro válido → `200`, append-only (el cobro se
  apila con id de secuencia) y emite `nichos.cobro_registrado`.
- `registrar` con rol distinto → `403 PERMISSION_DENIED` + `nichos.cobro.registrar.failed`.
- `registrar` con `tipo` inválido o `importe ≤ 0` → `400 INVALID_INPUT`.
- `consultar` → `200 {project_id, historial}` sin mutar.
- `onCobroEjecutado` (fire-and-forget) asienta y emite `nichos.cobro_registrado`;
  payload sin `project_id` → `null` (igualmente con `cobro.ejecutado` inválido → failed).
- `project.activated` restaura el historial vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/registro-cobros
node tests/unit/registro-cobros.test.js
```

## Notas de implementación

- Clase `RegistroCobros extends ModuloHibridoReflejo`; `name = 'registro-cobros'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._historiales` (Map
  project_id → `{esquema, cobros, updated_at}`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'registro-cobros.json', dir: '/prisma/nichos', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Los asientos marcan `marcarDirty(pid)`.
- `onRegistrarRequest` delega en `_atender(e, 'registrar',
  'nichos.cobro.registrar.response', ...)` y hace el fire-and-forget de dominio
  (`nicheos.cobro_registrado` en 200 o `nichos.cobro.registrar.failed` si no) dentro
  del handler, propagando `correlation_id`.
- `onCobroEjecutado` es fire-and-forget del flujo E3→F1: usa
  `rol = d.duenyo || 'MOTOR_COBRO'` y el mismo `_appendUnico`.
- Proyecciones: `_appendUnico` (escritura + guard) y `_consultar` (lectura);
  helper `historialCobros(pid)` como alias plano para F3/K1. `_invalid`/`_errorResponse`
  vienen de `modulo-hibrido-reflejo`.
- Tools: `toolRegistrar` → `_appendUnico`, `toolConsultar` → `_consultar`.
- DEP hacia delante: lo consumen la salud financiera (F3) y reglas-aprendidas (C7).
