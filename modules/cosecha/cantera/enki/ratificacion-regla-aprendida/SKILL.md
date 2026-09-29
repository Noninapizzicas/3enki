---
name: ratificacion-regla-aprendida
description: >
  Skill FULL del módulo PUENTE `ratificacion-regla-aprendida` de la vertical contabilidad de Enki.
  EL GATE HUMANO DE LA REGLA APRENDIDA: el sistema PROPONE la regla y ESPERA; NO ratifica por sí
  mismo. Si vence sin decisión, EXPIRA y se re-pregunta, jamás asume. Es el espejo de
  `flujo-firma` (allí la firma, aquí la ratificación). Sin estado. Úsala para operar, depurar o
  extender el puente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites armar o registrar la ratificación de una regla aprendida (RPC
    ratificacion-regla-aprendida.ratificar.request).
  - Cuando depures por qué no hay ratificación real (el sistema solo ARMA y espera: `armada:true`,
    `ratificada:false`), por qué sale 403 PERMISSION_DENIED (rol ≠ ASESOR: el sistema NO ratifica),
    400 INVALID_INPUT (falta project_id o propuesta) o por qué la solicitud `EXPIRA` y se
    re-pregunta.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y el gate humano ÚNICO
    de A6.2 (regla-contrapartida) y E8 (regla-movimiento-bancario).
  - Cuando vayas a escribir/ampliar el test unitario del puente ratificacion-regla-aprendida.
tags: [enki, modulo, puente, contabilidad, ratificacion-regla-aprendida]
---

# ratificacion-regla-aprendida — PUENTE STATELESS del gate de ratificación

## Qué hace el módulo

`ratificacion-regla-aprendida` es un **PUENTE STATELESS** (L10, hoja del plan): **LA
RATIFICACIÓN ES DEL ASESOR.** El sistema **PROPONE** la regla aprendida y **ESPERA**; **NO
ratifica por sí mismo**. Es el **gate humano ÚNICO** para `regla-contrapartida` (A6.2) y
`regla-movimiento-bancario` (E8) — no tres puertas distintas — y el **espejo de `flujo-firma`**
(L3): allí la **firma**, aquí la **ratificación** de la regla.

Atributos del diseño: `propuestas:Set<ReglaAprendida>`. Métodos: `ratificar(r, decision)`.

**DOS CAMINOS JAMÁS CONFUNDIDOS**:

- **(a) SIN `decision`** → el sistema **ARMA** la solicitud y **ESPERA** (`armada:true`,
  `ratificada:false`, `espera_ratificacion:true`, `actua:false`): **NO ratifica ni asume el
  silencio**.
- **(b) CON `decision` y `asesor`** → **REGISTRA** la decisión del asesor
  (`decision ∈ {ratifica, bloquea}`): la regla **SOLO actúa con `ratifica`** (`actua:true`); con
  `bloquea` **NO actúa**.

Cualquier rol distinto de `ASESOR` (**el SISTEMA incluido**) → **403**: el sistema **NO ratifica**.

**SI VENCE SIN RATIFICACIÓN → EXPIRA Y SE RE-PREGUNTA, JAMÁS ASUME**: una solicitud cuya validez
declarada pasa sin decisión **NO** se da por ratificada ni por bloqueada — se marca `EXPIRADA`
(`vencida:true`) y se **ARMA** una solicitud **NUEVA** (`re_preguntada:true`). La ausencia de
ratificación **NUNCA** se interpreta como un «sí». La **validez es DECLARABLE** (`vence_en` ISO o
`validez_ms`) y el **reloj también** (`ahora`, para reproducibilidad): sin validez declarada la
solicitud **NO vence** — cero plazos cableados.

Invariantes:

- **El sistema PROPONE y espera; NO ratifica** (`ratificacion_del_sistema:false`,
  `ratifica_por:'asesor'`).
- **`decision ∈ {ratifica, bloquea}`** es la FORMA del acto (identidad), no un criterio de negocio
  cableado.
- **La PROPUESTA es DECLARADA** (no se impone formato): sin regla no hay nada que someter al gate.
- **Dato ausente = desconocido**: sin `asesor` con decisión declarada → 403; sin validez declarada
  la solicitud no vence; `destinatario` sin declarar → `null` ([ABIERTO] quién ratifica).
- **NO escribe, NO persiste, NO muta**: el puente es **STATELESS** — **NO custodia las propuestas**
  (no las acumula); la ratificación se pide **BAJO DEMANDA** por RPC, con la propuesta en la mano.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `ratificacion-regla-aprendida.ratificar.request` | `onRatificarRequest` | RPC puente (gate humano): {project_id, propuesta:{id?, origen?, regla}\|regla?, decision?:'ratifica'\|'bloquea', asesor?, rol?, marca?, comentario?, vence_en?\|validez_ms?, armada_en?, ahora?, solicitud_id?} → SIN decision {armada:true, ratificada:false, espera_ratificacion:true, actua:false, solicitud, vencida, re_preguntada} (el sistema propone y espera); CON decision+asesor {registrada:true, ratificada, bloqueada, decision, actua:decision==='ratifica', ratificacion:{asesor, decision, marca, ratificada_en}, ratificacion_del_sistema:false}. Vencida sin ratificacion → EXPIRA y se RE-PREGUNTA (vencida:true, re_preguntada:true): jamas se asume. rol != ASESOR → 403. Exito con ratificacion real → publica contabilidad.regla_ratificada y responde por ratificacion-regla-aprendida.ratificar.response; propuesta o project_id ausente → ratificacion-regla-aprendida.ratificar.failed. |
| `contabilidad.regla_contrapartida_propuesta` | `onReglaContrapartidaPropuesta` | Fire-and-forget (A6.2 → L10): regla-contrapartida propuso una regla aprendida → se deja constancia en el log de que hay una regla esperando la ratificacion del asesor (espera_ratificacion:true). El puente es STATELESS: NO acumula propuestas; la ratificacion se pide BAJO DEMANDA por RPC. Tolerante: sin project_id se ignora. |
| `contabilidad.regla_bancaria_propuesta` | `onReglaBancariaPropuesta` | Fire-and-forget (E8 → L10): regla-movimiento-bancario propuso una regla aprendida → mismo gate humano unico que A6.2. Solo se loguea; el puente no acumula. Tolerante: sin project_id se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `ratificacion-regla-aprendida.ratificar.response` | Respuesta RPC correlada de ratificacion-regla-aprendida.ratificar.request → {request_id, status:200, data:{armada\|registrada, ratificada, decision, actua, solicitud, ratificacion, ratifica_por:'asesor', ratificacion_del_sistema:false, vencida, re_preguntada, abierto}}. Emitida por el helper _atender. |
| `ratificacion-regla-aprendida.ratificar.failed` | Par de fallo determinista (L10): project_id o propuesta ausente → {status, error:{code, message, details?}}; 403 PERMISSION_DENIED si el rol no es ASESOR (el sistema NO ratifica). Cierra el circulo de ratificacion-regla-aprendida.ratificar.request. |
| `contabilidad.regla_ratificada` | Fire-and-forget (L10): el ASESOR ratifico o bloqueo la regla aprendida → {project_id, regla, propuesta_id, origen, decision:'ratifica'\|'bloquea', actua, asesor, ratificada_por:'asesor', ratificada_en, correlation_id}. Lo LEEN regla-contrapartida (A6.2) y regla-movimiento-bancario (E8): solo ACTUAN si decision==='ratifica'. El evento NO lo emite el sistema por si mismo: sin ratificacion real no hay regla_ratificada. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `ratificacion-regla-aprendida.ratificar.failed` cierra el círculo de
> `ratificacion-regla-aprendida.ratificar.request` cuando `_ratificar` devuelve status ≠ 200
> (`400 INVALID_INPUT` por `project_id`/`propuesta` ausente; `400` por `decision` inválida; `403
> PERMISSION_DENIED` por rol ≠ ASESOR). **403 NO es una ratificación: el sistema no ratifica.**

> Nota: `onReglaContrapartidaPropuesta` y `onReglaBancariaPropuesta` **no** usan `_atender`:
> delegan en `_senal(evento, e)`, que **solo registra un `logger.info`** (con
> `espera_ratificacion:true`) y devuelve `null`. **No guardan nada** (el puente es stateless), no
> publican evento de dominio y no tienen par `failed` (no son peticiones). Sin `project_id` → `null`.

## Reglas de negocio

1. **La PROPUESTA es obligatoria**: `input.propuesta` (objeto) o `input.regla` (objeto); ausente
   → `400 INVALID_INPUT` (`field:'propuesta'`). La propuesta se normaliza a
   `{id, origen, regla, propuesta_en, solicitud_id}` — **formato libre** (cero formato impuesto).
2. **Sin `decision` declarada → el sistema ARMA y ESPERA**: `_armar(...)` → `armada:true`,
   `ratificada:false`, `estado:'PENDIENTE'`, `espera_ratificacion:true`, `actua:false`,
   `ratificacion_del_sistema:false`. **NO es una ratificación.**
3. **Con `decision` pero sin `asesor`** → `403 PERMISSION_DENIED` («la ratificacion es del asesor:
   el sistema NO ratifica ni decide en su nombre»). La ratificación es de una **PERSONA**.
4. **GUARD de rol**: en `_registrar`, `rol` (por defecto `ASESOR`) debe ser `ASESOR`
   (mayúsculas, `toUpperCase().trim()`); cualquier otro → `403 PERMISSION_DENIED` con
   `details:{rol_esperado:'ASESOR', rol_recibido, regla}`. **El SISTEMA incluido → 403.**
5. **`decision` válida**: debe estar en `DECISIONES = {ratifica, bloquea}`
   (`String(decision).toLowerCase().trim()`); si no → `400 INVALID_INPUT` con
   `details:{decision, admitidas:['ratifica','bloquea'], field:'decision'}`.
6. **La DECISIÓN REGISTRADA**: `_registrar` produce `ratificacion = {regla, propuesta_id, origen,
   asesor, decision, marca, comentario, solicitud_id, ratificada_en}` y
   `registrada:true`; `ratificada = decision === 'ratifica'`, `bloqueada = decision === 'bloquea'`.
   **`actua: decision === 'ratifica'`** — con `bloquea` la regla **NO actúa** sobre el volumen.
7. **La EXPIRACIÓN**: `_vencido(input, ahora)` compara `ahora` con `vence_en` (o `armada_en +
   validez_ms`). Sin validez declarada → **no vence** (cero plazos cableados). Si vence sin
   decisión → `estado:'EXPIRADA'`, `vencida:true`, `re_preguntada:true` y una solicitud **NUEVA**
   (`re_de: solicitud_id anterior`). **JAMÁS se asume.** Motivo declarado: «la solicitud de
   ratificacion vencio sin decision: se expira y se RE-PREGUNTA, jamas se asume».
8. **La VALIDEZ es DATO**: `vence_en` (ISO) o `validez_ms` (+ `armada_en`); `_validez` calcula
   `vence_en = armada_en + validez_ms` si hace falta. Sin declarar → `vence_en:null` y
   `abierto.vence_en` («no se declaro validez: la solicitud no vence (cero plazos cableados)»).
9. **El RELOJ es DATO**: `ahora` declarable (ISO, para reproducibilidad); si no, el real.
   Determinista con `ahora`.
10. **`destinatario` es `[ABIERTO]`**: la solicitud lo deja `null` — **a quién se pregunta es
    declarable**, no se cablea.
11. **El evento de dominio solo con ratificación REAL**: `contabilidad.regla_ratificada` se publica
    **únicamente** si `res.data.registrada === true`, y viaja con `decision`, `actua`, `asesor` y
    `ratificada_por:'asesor'`. **Sin ratificación real no hay `regla_ratificada`.**
12. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
13. **HTTP exacto**: éxito `200`; `project_id`/`propuesta` ausente o `decision` inválida → `400`;
    rol ≠ ASESOR (o decisión sin asesor) → `403 PERMISSION_DENIED`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `ratificacion-regla-aprendida.ratificar.response`. Solo con ratificación real publica
`contabilidad.regla_ratificada` (lo leen A6.2 y E8).

### 1. `ratificar` — sin `decision` (el sistema ARMA y ESPERA)

```json
{
  "project_id": "e57a318a-...",
  "propuesta": { "id": "prop-1", "origen": "regla-contrapartida", "regla": { "patron": "411→410" } },
  "vence_en": "2026-10-01T00:00:00.000Z",
  "correlation_id": "abc-123"
}
```

Respuesta `200`: `armada:true`, `ratificada:false`, `estado:'PENDIENTE'`,
`espera_ratificacion:true`, `actua:false`, `ratifica_por:'asesor'`,
`ratificacion_del_sistema:false`, `solicitud:{id:'solicitud_..._prop-1_...', estado:'PENDIENTE',
vence_en, destinatario:null}` y `abierto.decision` («la regla espera la ratificacion del asesor:
el sistema NO ratifica ni asume el silencio»). **No se publica `regla_ratificada`.**

### 2. `ratificar` — con `decision` y `asesor` (ratificación REAL)

```json
{ "project_id": "e57a318a-...", "propuesta": { "id": "prop-1", "regla": {} }, "decision": "ratifica", "asesor": "ana", "marca": "visto" }
```

Respuesta `200`: `registrada:true`, `ratificada:true`, `estado:'RATIFICADA'`, `actua:true`,
`ratificacion:{asesor:'ana', decision:'ratifica', marca:'visto', ratificada_en:'...'}`.
Publica `contabilidad.regla_ratificada` con `actua:true`. Con `decision:'bloquea'` →
`estado:'BLOQUEADA'`, `bloqueada:true`, `actua:false` (la regla **no actúa**) y **sí** publica
`regla_ratificada` (la LECTURA en A6.2/E8 decide).

### 3. `ratificar` — rol ≠ ASESOR → 403 (el sistema NO ratifica)

```json
{ "project_id": "e57a318a-...", "propuesta": { "regla": {} }, "decision": "ratifica", "asesor": "ana", "rol": "SISTEMA" }
```

Respuesta `403` + `ratificacion-regla-aprendida.ratificar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "la ratificacion es del asesor: el sistema NO ratifica ni decide", "details": { "rol_esperado": "ASESOR", "rol_recibido": "SISTEMA", "regla": {} } } }
```

### 4. `ratificar` — vencida sin decisión → EXPIRA y se RE-PREGUNTA

Con `vence_en` en el pasado respecto a `ahora` → `estado:'EXPIRADA'`, `vencida:true`,
`re_preguntada:true`, `solicitud` **nueva** (`re_de` la anterior) y `abierto.decision`
(«la ratificacion del asesor sigue pendiente: el sistema no la suple»). **JAMÁS se asume.**

### 5. Fire-and-forget — señales A6.2/E8

`onReglaContrapartidaPropuesta` (`contabilidad.regla_contrapartida_propuesta`) y
`onReglaBancariaPropuesta` (`contabilidad.regla_bancaria_propuesta`) llaman a `_senal(evento, e)`,
que **solo loguea** (con `espera_ratificacion:true`) y devuelve `null`. Sin `project_id` → `null`.

### 6. Fallo — falta `project_id` o `propuesta`

Respuesta `400` + `ratificacion-regla-aprendida.ratificar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/ratificacion-regla-aprendida.test.js`. Cubre:

- **Sin `decision` → el sistema ARMA y ESPERA**: `armada:true`, `ratificada:false`,
  `espera_ratificacion:true`, `actua:false`; **no se publica `regla_ratificada`**.
- **Con `decision:'ratifica'` + `asesor`** → `registrada:true`, `ratificada:true`, `actua:true`;
  publica `contabilidad.regla_ratificada`.
- **Con `decision:'bloquea'`** → `estado:'BLOQUEADA'`, `actua:false` (la regla NO actúa).
- **rol `SISTEMA`** (o cualquier ≠ ASESOR) → `403 PERMISSION_DENIED` (**el sistema NO ratifica**).
- **`decision` sin `asesor`** → `403` (la ratificación es de una PERSONA).
- **`decision` inválida** → `400 INVALID_INPUT` con `admitidas:['ratifica','bloquea']`.
- **Vencida sin decisión** → `EXPIRADA`, `vencida:true`, `re_preguntada:true` con solicitud nueva
  (**jamás se asume**); sin validez declarada → **no vence**.
- **Determinismo**: misma entrada con `ahora` declarado → mismo resultado.
- `onReglaContrapartidaPropuesta` / `onReglaBancariaPropuesta` devuelven `null` y no mutan; sin
  `project_id` → `null`.
- `project_id`/`propuesta` ausente → `400 INVALID_INPUT` +
  `ratificacion-regla-aprendida.ratificar.failed`.
- `toolRatificar` devuelve la misma proyección que `_ratificar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `RatificacionReglaAprendida extends ModuloHibridoReflejo`; `name =
  'ratificacion-regla-aprendida'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store,
  sin `onProjectActivated` (**PUENTE stateless**).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/ratificacion-regla-aprendida/`; es de la vertical **libro**).
- Constantes de FORMA (no de negocio): `ROL_ASESOR = 'ASESOR'` y
  `DECISIONES = new Set(['ratifica','bloquea'])`.
- `onRatificarRequest` usa `this._atender(e, 'ratificar',
  'ratificacion-regla-aprendida.ratificar.response', async (d) => {...})`: con `status === 200`
  publica `contabilidad.regla_ratificada` **solo si `registrada === true`**; en caso contrario
  publica `ratificacion-regla-aprendida.ratificar.failed`.
- Proyección `_ratificar(input)` (sync): ramifica a `_armar` (propone y espera) o `_registrar`
  (registra la decisión del asesor). Helpers `_propuesta`, `_solicitud`, `_vencido`, `_validez`,
  `_ahora`. Tool `toolRatificar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`; `_ahora` usa el reloj real
  salvo que se declare `ahora` (reproducible).
- **DEP**: escucha `contabilidad.regla_contrapartida_propuesta` (A6.2) y
  `contabilidad.regla_bancaria_propuesta` (E8) **solo como señales tolerantes**; es el **gate
  humano ÚNICO** de ambas. Espejo de `flujo-firma` (L3).
- **🔴 LA RATIFICACIÓN ES DEL ASESOR**: el sistema **PROPONE y ESPERA**; con vencimiento sin
  decisión **EXPIRA y se re-pregunta**; **NUNCA** interpreta el silencio como un «sí».
  `ratificacion_del_sistema:false` siempre.
