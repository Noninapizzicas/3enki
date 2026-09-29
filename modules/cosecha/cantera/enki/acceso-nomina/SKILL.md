---
name: acceso-nomina
description: >
  Skill FULL del módulo CUSTODIO `acceso-nomina` de la vertical contabilidad de Enki.
  Gobierna QUIÉN VE QUÉ NÓMINA (DATO PERSONAL) con AISLAMIENTO PERSONA↔PERSONA: cada uno ve la suya
  y la de otro se DENIEGA por defecto; un solo escritor y alcances declarables. Persiste por
  proyecto con PosPersistencia. Es la parcela más sensible de contabilidad. Úsala para operar,
  depurar o extender el custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites autorizar/denegar el acceso a una nómina (RPC
    acceso-nomina.autorizar.request) o declarar permisos/alcances (RPC
    acceso-nomina.declarar.request).
  - Cuando depures por qué se deniega el acceso a la nómina de otro (`permitido:false`), por qué
    falla con 403 PERMISSION_DENIED (rol ≠ AUTORIDAD_NOMINA), 400 ALCANCE_NO_DECLARADO (alcance no
    declarable) o 400 INVALID_INPUT (falta `project_id`/`quien`/`persona`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    custodio (aislamiento persona↔persona, un solo escritor, alcances declarables, default más
    estrecho).
  - Cuando vayas a escribir/ampliar el test unitario del custodio acceso-nomina.
tags: [enki, modulo, custodio, contabilidad, acceso-nomina]
---

# acceso-nomina — CUSTODIO CON PERSISTENCIA de la gobernanza de acceso a la nómina

## Qué hace el módulo

`acceso-nomina` es un **CUSTODIO CON PERSISTENCIA** (G7, hoja del plan): **GOBERNANZA DE QUIÉN VE QUÉ
NÓMINA (DATO PERSONAL) — cada uno ve la suya**. El diseño lo dice literal: `autorizar(quien,
nomina):bool` y `declarar(p)`, con `permisos:Map<Empleado,Alcance>`. **UN SOLO ESCRITOR.**

**AISLAMIENTO PERSONA↔PERSONA (INVARIANTE DURA)**: la nómina es **dato personal**. Un negocio **NO se
fuga**, **Y UNA PERSONA TAMPOCO**. Aquí **no** vale «soy del mismo negocio»: dentro del negocio, el
acceso a la nómina de **OTRO** se **DENIEGA por defecto**. Es el espejo de **AislamientoNegocio (I4)**
en el eje **PERSONA** (complementa el eje negocio).

**LA LEY ES DATO**: los **ALCANCES** (`self_only` — el más estrecho —, `admin`, `equipo`) y los
**CONCEDIDOS** (un encargo declarado persona→empleados concretos) son **DECLARABLES**: **cero roles
cableados**. Sin declarar se aplica **SIEMPRE** el más estrecho (`self_only`): **nada se concede «de
buena fe»**.

**UN SOLO ESCRITOR de la parcela**: la **autoridad de personal** (`rol: AUTORIDAD_NOMINA`) declara;
cualquier otro rol es un **SEGUNDO ESCRITOR** → se le rechaza en el acto (**403**).

**`autorizar` es LECTURA determinista** (**NO muta**): propia → **permitido SIEMPRE** (eje persona);
de otro → solo con alcance `admin`, o con alcance `equipo` **+ encargo declarado**; en cualquier otro
caso → `permitido:false`.

Persiste por proyecto con `PosPersistencia`, restaura en `project.activated` y vuelca en `onUnload`.
Proyecciones `_autorizar` (lectura) y `_declarar` (escritura, con GUARD). Publica
`contabilidad.acceso_nomina`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `acceso-nomina.autorizar.request` | `onAutorizarRequest` | RPC custodio de LECTURA (NO muta, determinista): {project_id, quien (la persona que pretende ver), empleado\|nomina.empleado (de quien es la nomina; por defecto, la propia)} → {project_id, quien, empleado, alcance, es_propia, permitido, motivo, ley_origen:'declarada', ley_cableada:false}. AISLAMIENTO PERSONA↔PERSONA: la propia → permitido:true SIEMPRE; la de otro → solo con alcance admin, o con alcance equipo + encargo declarado; en cualquier otro caso permitido:false (la nomina es dato personal y no se ve la de otro sin encargo declarado). A quien no se le declaro alcance se le aplica self_only. Responde por acceso-nomina.autorizar.response; project_id o quien ausente → acceso-nomina.autorizar.failed. |
| `acceso-nomina.declarar.request` | `onDeclararRequest` | RPC custodio de ESCRITURA (UN escritor, guard de rol): {project_id, rol:'AUTORIDAD_NOMINA', persona, alcance?'self_only'\|'equipo'\|'admin' (DECLARABLE; sin declarar → self_only), empleado?, ve_a? (encargos declarados persona→empleados concretos)} → {project_id, persona, alcance, empleado, ve_a, declarado_por, accesos_efectivos (su nomina SIEMPRE + los encargos declarados), ley_origen:'declarada', ley_cableada:false}. Guard: solo AUTORIDAD_NOMINA (403 al segundo escritor); alcance no declarable → 400 ALCANCE_NO_DECLARADO. Exito → publica contabilidad.acceso_nomina y responde por acceso-nomina.declarar.response; fallo → acceso-nomina.declarar.failed. |
| `project.activated` | `onProjectActivated` | Restaura los permisos de nomina del proyecto activado desde el storage (PosPersistencia) — la parcela mas sensible de contabilidad se hidrata antes de servir. |

### Publishes

| Evento | Descripción |
|---|---|
| `acceso-nomina.autorizar.response` | Respuesta RPC correlada de acceso-nomina.autorizar.request → {request_id, status:200, data:{quien, empleado, alcance, es_propia, permitido, motivo}}. Emitida por el helper _atender. |
| `acceso-nomina.autorizar.failed` | Par de fallo determinista (G7): project_id o quien ausente (400) → {status, error:{code, message, details?}}. Cierra el circulo de acceso-nomina.autorizar.request. |
| `acceso-nomina.declarar.response` | Respuesta RPC correlada de acceso-nomina.declarar.request → {request_id, status:200, data:{persona, alcance, empleado, ve_a, accesos_efectivos}}. Emitida por el helper _atender. |
| `acceso-nomina.declarar.failed` | Par de fallo determinista (G7): rol != AUTORIDAD_NOMINA (403 PERMISSION_DENIED), persona ausente (400), alcance no declarable (400 ALCANCE_NO_DECLARADO) → {status, error:{code, message, details?}}. Cierra el circulo de acceso-nomina.declarar.request. |
| `contabilidad.acceso_nomina` | Fire-and-forget (G7): la gobernanza de acceso quedo declarada por la autoridad de personal → {project_id, persona, alcance, empleado, ve_a, declarado_por:'AUTORIDAD_NOMINA', correlation_id}. Lo LEEN los modulos que sirven nomina a una persona y el resto de la cadena de personal. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `acceso-nomina.autorizar.failed` cierra el círculo de `acceso-nomina.autorizar.request` y
> `acceso-nomina.declarar.failed` cierra el de `acceso-nomina.declarar.request` (cuando la proyección
> devuelve status ≠ 200).

> Nota de honestidad (cruce con `index.js`): `onAutorizarRequest` publica
> `acceso-nomina.autorizar.failed` **solo si `_autorizar` devuelve status ≠ 200**.
> `onDeclararRequest` publica `contabilidad.acceso_nomina` **solo si `_declarar` devuelve `200`**; la
> rama `else` publica `acceso-nomina.declarar.failed`. El payload del evento lleva
> `{project_id, persona, alcance, empleado, ve_a, declarado_por:'AUTORIDAD_NOMINA', correlation_id}`.

> Nota: el módulo expone `alcanceDe(pid, persona)` como **lectura directa** (mismo proceso, **NO
> muta**, default `self_only`) para otros custodios — no es un evento del bus y **no figura en
> `module.json`**. Tampoco figuran `_autorizar`, `_declarar`, `_efectivos`, `_normalizarVeA`,
> `_alcanceDe`, `_enConcedido`, `_obtenerOCrear`, las constantes `ROL_AUTORIDAD`/`ALCANCE_DEFAULT`/
> `ALCANCES_VALIDOS`, ni `toolAutorizar`/`toolDeclarar`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente → `400
   INVALID_INPUT` (`field:'project_id'`) tanto en lectura como en escritura.
2. **`quien` es obligatorio para autorizar**: `String(input.quien).trim()`; vacío → `400
   INVALID_INPUT` (`field:'quien'`).
3. **`empleado` con default propio**: `input.empleado` o `input.nomina.empleado`; si ninguno, el
   sujeto es **el propio `quien`** (se consulta la nómina propia).
4. **AISLAMIENTO PERSONA↔PERSONA** (orden exacto de la decisión):
   - `es_propia = (empleado === quien)` → **`permitido:true`** con `motivo:'cada uno ve la suya (eje
     persona)'`. **Siempre**, pase lo que pase.
   - Si no es propia y `alcance === 'admin'` → `permitido:true`.
   - Si no, `alcance === 'equipo'` **y** existe un **encargo declarado** (`_enConcedido(quien,
     empleado)`) → `permitido:true`.
   - **En cualquier otro caso → `permitido:false`** con el motivo del aislamiento. **Nada se concede
     de buena fe.**
5. **El alcance se lee de la parcela** (`_alcanceDe`): sin permiso declarado → **`self_only`** (el
   más estrecho). **Nunca** un acceso «de buena fe».
6. **GUARD de un solo escritor**: `_declarar` exige `input.rol === 'AUTORIDAD_NOMINA'` (constante
   `ROL_AUTORIDAD`). Cualquier otro rol → `403 PERMISSION_DENIED` con `{rol_esperado:
   'AUTORIDAD_NOMINA', rol_recibido:<rol ?? null>}`. **Un segundo escritor es corrupción.**
7. **`persona` obligatoria**: `input.persona` o `input.quien`; vacío → `400 INVALID_INPUT`
   (`field:'persona'`).
8. **EL ALCANCE ES DECLARABLE**: `input.alcance` o `ALCANCE_DEFAULT` (`'self_only'`). Solo
   `{self_only, equipo, admin}` son válidos (`ALCANCES_VALIDOS`); cualquier otro → `400
   ALCANCE_NO_DECLARADO` con `{alcances_declarables:[...]}`. **Cero roles cableados.**
9. **`ve_a` (los concedidos) son DECLARABLES** (`_normalizarVeA`): acepta array, mapa
   (`{empleado: true}`) o escalar. El encargo es **persona→empleados concretos**: cada uno se apila
   en `parcela.concedidos` como `{quien, empleado, declarado_en}` **si no estaba ya**. **Nada de
   «todo el equipo».**
10. **El permiso se guarda** como `{alcance, empleado: input.empleado || persona, ve_a,
    declarado_en}` en `parcela.permisos` (Map por persona) y se marca `dirty`.
11. **`accesos_efectivos`** (`_efectivos`): siempre la **propia** persona; **además**, si el alcance
    es `admin` o `equipo`, los `ve_a`. Lista ordenada (`sort()`).
12. **Persistencia**: `PosPersistencia` con `file:'acceso-nomina.json'`, `dir:'/contabilidad/
    acceso-nomina'`, esquema `'contabilidad-acceso-nomina-v1'`; `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)` (reconstruye `permisos` Map + `concedidos`);
    `onUnload` → `flush()` + `detener()`.
13. **La ley es DATO, y se declara**: `ley_origen:'declarada'` y `ley_cableada:false` en las dos
    respuestas.
14. **HTTP exacto**: éxito `200`; rol inválido → `403`; alcance no declarable → `400
    ALCANCE_NO_DECLARADO`; `project_id`/`quien`/`persona` ausentes → `400 INVALID_INPUT`; excepción
    en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `acceso-nomina.autorizar.response` / `acceso-nomina.declarar.response` y emite
`contabilidad.acceso_nomina`.

### 1. `autorizar` — cada uno ve la suya (eje persona)

```json
{ "project_id": "e57a318a-...", "quien": "E-014", "correlation_id": "abc-123" }
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "quien": "E-014",
  "empleado": "E-014",
  "alcance": "self_only",
  "es_propia": true,
  "permitido": true,
  "motivo": "cada uno ve la suya (eje persona)",
  "ley_origen": "declarada",
  "ley_cableada": false
}
```

### 2. `autorizar` — la nómina de OTRO sin encargo: DENEGADA

```json
{ "project_id": "e57a318a-...", "quien": "E-021", "empleado": "E-014" }
```

Respuesta `200` con `es_propia:false`, `permitido:false` y
`motivo:"la nomina es dato personal: sin encargo declarado no se ve la de otro (aislamiento
persona-a-persona)"`. **Ser del mismo negocio no concede nada.**

### 3. `declarar` — la autoridad de personal declara un encargo

```json
{
  "project_id": "e57a318a-...",
  "rol": "AUTORIDAD_NOMINA",
  "persona": "E-021",
  "alcance": "equipo",
  "ve_a": ["E-014", "E-015"],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "persona": "E-021",
  "alcance": "equipo",
  "empleado": "E-021",
  "ve_a": ["E-014", "E-015"],
  "declarado_por": "AUTORIDAD_NOMINA",
  "accesos_efectivos": ["E-014", "E-015", "E-021"],
  "ley_origen": "declarada",
  "ley_cableada": false
}
```

Emite `contabilidad.acceso_nomina` (lo LEEN los módulos que sirven nómina a una persona):

```json
{ "project_id": "e57a318a-...", "persona": "E-021", "alcance": "equipo", "empleado": "E-021", "ve_a": ["E-014","E-015"], "declarado_por": "AUTORIDAD_NOMINA", "correlation_id": "abc-123" }
```

### 4. `declarar` — sin alcance declarado → el más estrecho

Sin `alcance` → `alcance:'self_only'` (el más estrecho). **Nunca «de buena fe».**

### 5. Fallo — segundo escritor

Respuesta `403` + `acceso-nomina.declarar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo la autoridad de personal (AUTORIDAD_NOMINA) declara el acceso a la nomina; un segundo escritor es corrupcion", "details": { "rol_esperado": "AUTORIDAD_NOMINA", "rol_recibido": "OTRO" } } }
```

### 6. Fallo — alcance no declarable

Respuesta `400 ALCANCE_NO_DECLARADO` con `{alcances_declarables:['self_only','equipo','admin']}` + el
par `failed`.

## Tests

El test unitario de la vertical vive en `tests/unit/acceso-nomina.test.js`. Cubre:

- `autorizar` la **propia** nómina → `permitido:true` **siempre** (`es_propia:true`).
- `autorizar` la de **otro** sin encargo → `permitido:false` (**aislamiento persona↔persona**), con
  o sin alcance declarado, salvo `admin`.
- `declarar` con `rol:'AUTORIDAD_NOMINA'` → `200` y emite `contabilidad.acceso_nomina`.
- **Segundo escritor** (otro rol) → `403 PERMISSION_DENIED` + `.declarar.failed`.
- Sin `alcance` → `self_only` (**default más estrecho**); alcance inválido → `400
  ALCANCE_NO_DECLARADO`.
- Un encargo declarado (`ve_a`) permite la nómina concreta con alcance `equipo`; `accesos_efectivos`
  incluye la propia + los concedidos.
- `project.activated` restaura la parcela; `alcanceDe(pid, persona)` lee sin mutar (default
  `self_only`).
- `project_id`/`quien`/`persona` ausentes → `400 INVALID_INPUT`.
- `toolAutorizar` / `toolDeclarar` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AccesoNomina extends ModuloHibridoReflejo`; `name = 'acceso-nomina'`, `version =
  'reflejo-0.1.0'`. Store en memoria `this._parcelas` (`Map<project_id, {esquema, permisos:
  Map<persona,{alcance,empleado,ve_a,declarado_en}>, concedidos:[]}>`). Esquema
  `'contabilidad-acceso-nomina-v1'`.
- Constantes: `ROL_AUTORIDAD = 'AUTORIDAD_NOMINA'`, `ALCANCE_DEFAULT = 'self_only'`,
  `ALCANCES_VALIDOS = new Set(['self_only','equipo','admin'])` — **alcances declarables, no ley
  cableada**.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:'acceso-nomina.json',
  dir:'/contabilidad/acceso-nomina', snapshot, hidratar })` desde
  `modules/contabilidad-fiscal/acceso-nomina/` (DOS niveles → `../../_shared/pos-persistencia`).
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
- `onAutorizarRequest` usa `this._atender(e, 'autorizar', 'acceso-nomina.autorizar.response', async
  (d) => {...})`; `onDeclararRequest` usa `this._atender(e, 'declarar',
  'acceso-nomina.declarar.response', async (d) => {...})` con evento de dominio en `200`.
- Proyecciones `_autorizar(input)` (**SÍNCRONA**, NO muta) y `_declarar(input)` (**SÍNCRONA**, GUARD);
  helpers `_efectivos`, `_normalizarVeA`, `_alcanceDe`, `_enConcedido`, `_obtenerOCrear`; lectura
  directa `alcanceDe(pid, persona)`. Tools `toolAutorizar` / `toolDeclarar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo LEEN los módulos que sirven nómina a una persona — en particular `pagos-a-cuenta-empleado`
  (G8) y `liquidacion-baja-empleado` (G10) lo consultan **por evento** (`acceso-nomina.autorizar.
  request`) antes de servir la nómina de otro; sin autorización → **403 AISLAMIENTO_PERSONA**.
- **AISLAMIENTO PERSONA↔PERSONA (invariante dura)**: la nómina es **dato personal** — un negocio **NO
  se fuga**, y **una persona tampoco**. Es el eje PERSONA del aislamiento; el default es el más
  estrecho y **nada se concede de buena fe**.
