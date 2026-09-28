---
name: desatasco-entrada
description: >
  Skill FULL del módulo MICRO-AGENTE `desatasco-entrada` de la vertical contabilidad
  de Enki (P3, hoja del plan). LA ACCIÓN QUE COMPLETA LA COLA: resolver / REENColar /
  descartar con MOTIVO — el juicio que vacía la cola (A8.1 solo encola). PRODUCE la
  REGLA CANDIDATA que cierra el bucle `excepción → regla → menos excepciones`, pero esa
  regla NO ACTÚA hasta ser RATIFICADA por el ASESOR (L10): el sistema NO firma ni
  decide solo, y sin `rol` de la silla NO se resuelve (400 ROL_NO_DECLARADO). Es híbrido
  (reflejo determinista + fuzzy en su blueprint) y persiste su aprendizaje. Úsala para
  operar, depurar o extender el micro-agente.
when-to-use: >
  - Cuando necesites resolver/reencolar/descartar una excepción de la cola
    (RPC contabilidad.desatasco.resolver.request).
  - Cuando depures por qué no se resuelve (400 ROL_NO_DECLARADO sin rol de silla, 422
    MOTIVO_REQUERIDO al descartar sin motivo, 422 PRECONDITION_FAILED sin
    vertical/documento para aprender, 503 DEPENDENCIA_NO_DISPONIBLE si la cola o el
    repositorio de reglas no responden).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el bucle
    excepción→regla y por qué la regla candidata no actúa hasta L10.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente desatasco-entrada.
tags: [enki, modulo, micro-agente, contabilidad, desatasco-entrada, cola, fuzzy]
---

# desatasco-entrada — MICRO-AGENTE de la acción que completa la cola

## Qué hace el módulo

`desatasco-entrada` es un **MICRO-AGENTE** (P3, hoja del plan) del patrón híbrido real:
**mitad REFLEJO determinista** (clasificación de la salida por naturaleza/motivo,
derivación del patrón y la contrapartida de la regla candidata, lectura de repositorios
por EVENTO) + **mitad FUZZY** en el cajón de blueprint del módulo (el LLM que juzga el
motivo y propone la salida; el gate `scripts/validate-hibridos.js` exige que la op fuzzy
**NO** vaya en `module.json.subscribes`).

Es **LA ACCIÓN QUE COMPLETA LA COLA**: la cola (A8.1) solo **ENCOLA**; aquí está el
juicio que la **vacía** con tres salidas posibles — `RESOLVER`, `REENColar`,
`DESCARTAR_CON_MOTIVO`. Y **produce la REGLA CANDIDATA** que cierra el bucle
`excepción → regla → menos excepciones`, **pero esa regla NO ACTÚA hasta ser
RATIFICADA por el ASESOR** (L10 `ratificacion-regla-aprendida`): el **sistema NO firma
ni decide solo** (invariante 11). Si la silla la ocupa un humano (A8.3 `[ABIERTO]`),
esta clase **CAPTURA su decisión — no la inventa**.

Como es un micro-agente que **persiste**, lleva **PosPersistencia** + store en memoria:
su memoria de desatascos y de reglas candidatas es el **aprendizaje** del bucle
(evidencia para L10 y medida del "menos excepciones"). Storage
`/contabilidad/desatasco-entrada/desatasco-entrada.json`.

**OJO**: NO escribe en los repositorios de reglas (A6.2/E8 son custodios single-writer
de rol DUENO/ASESOR); solo los **LEE** por EVENTO
(`contabilidad.regla.leer.request` / `contabilidad.regla_movimiento.leer.request`) para
no proponer lo ya cubierto, y la candidata se **PUBLICA** para que la hidrate su
repositorio y la ratifique L10. **Resolver** en la cola tampoco lo hace P3: hace
**forward** al RPC de A8.1 (`contabilidad.excepcion.resolver.request`) con el rol de la
silla; **sin `rol` NO se resuelve** (`400 ROL_NO_DECLARADO`).

> **NO REUTILIZA**: el bucle excepción → regla → menos excepciones es el corazón del
> cuello y no existe en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.desatasco.resolver.request` | `onResolverRequest` | RPC micro-agente: {project_id, cola:'ASESOR'\|'DUENO', excepcion:{id, naturaleza, motivo, hecho}, decision?, motivo_descarte?, rol?, evidencia?} → {project_id, cola, excepcion_id, repositorio, salida:'RESOLVER'\|'REENColar'\|'DESCARTAR_CON_MOTIVO', motivo, ambiguedad, ambiguedad_alta, rol_silla, silla_ocupada, decision_de, decision_aplicada, firma_del_sistema:false, regla_candidata}. La salida, si no la trae la silla, la PROPONE el juicio (fuzzy). RESOLVER produce regla CANDIDATA (estado RATIFICACION_PENDIENTE, actua:false) que NO actua hasta L10. Descartar sin motivo → 422 MOTIVO_REQUERIDO. Exito publica contabilidad.excepcion_desatascada (tras el forward a A8.1 con el rol de la silla) y contabilidad.regla_aprendida si hay candidata; responde por contabilidad.desatasco.resolver.response. Sin project_id/excepcion/cola valida → contabilidad.desatasco.resolver.failed. |
| `contabilidad.excepcion_encolada` | `onExcepcionEncolada` | Fire-and-forget (A8.1 → P3): cola-revision encolo una excepcion → {project_id, cola, excepcion, decision?, rol?}. Se PREPARA el desatasco (diagnostico + propuesta de salida + regla candidata) sin firmarlo: si el payload trae `rol` de la silla, se resuelve en la cola (forward a A8.1) y se publica contabilidad.excepcion_desatascada; si NO, se publica la PROPUESTA con pendiente_de_silla:true y decision_aplicada:false (el sistema no decide solo). La regla candidata, si la hay, se publica en contabilidad.regla_aprendida (no actua hasta L10). |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.excepcion_desatascada` | Fire-and-forget (P3): una excepcion de la cola quedo DESATASCADA → {project_id, cola, excepcion_id, salida, motivo, ambiguedad, repositorio, regla_candidata, en_cola, decision_aplicada, pendiente_de_silla?}. Solo se emite como resuelta cuando cola-revision (A8.1) CONFIRMA la resolucion con el rol de la silla; si la silla no ha decidido, sale como PROPUESTA (pendiente_de_silla:true). |
| `contabilidad.regla_aprendida` | Fire-and-forget (P3 → L10/A6.2/E8): la regla CANDIDATA que cierra el bucle → {project_id, repositorio:'regla-contrapartida'\|'regla-movimiento-bancario', regla:{regla_id, patron, contrapartida, estado:'RATIFICACION_PENDIENTE', actua:false}, actua:false, requiere_ratificacion:true}. NO actua sobre el volumen: la ratifica el ASESOR (ratificacion-regla-aprendida, L10). El repositorio la hidrata por EVENTO. |
| `contabilidad.desatasco.resolver.failed` | Par de fallo determinista: resolver sin project_id/excepcion (400), cola desconocida (400), descartar sin motivo (422 MOTIVO_REQUERIDO) o falta de vertical/documento para aprender la regla (422 PRECONDITION_FAILED). Cierra el circulo de contabilidad.desatasco.resolver.request. |
| `contabilidad.excepcion_desatascada.failed` | Par de fallo del evento de dominio contabilidad.excepcion_desatascada: cola-revision (A8.1) no confirmo la resolucion (503 DEPENDENCIA_NO_DISPONIBLE) o el rol de la silla no se declaro (400 ROL_NO_DECLARADO). NO se declara desatascado lo que la cola no confirma. |
| `contabilidad.regla_aprendida.failed` | Par de fallo del evento de dominio contabilidad.regla_aprendida: el repositorio de reglas (A6.2/E8) no respondio (503 DEPENDENCIA_NO_DISPONIBLE) — la candidata se DECLARA, no se hidrata a ciegas. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.desatasco.resolver.failed` cierra
> `contabilidad.desatasco.resolver.request`;
> `contabilidad.excepcion_desatascada.failed` cierra el evento de dominio
> `contabilidad.excepcion_desatascada` (cuando A8.1 no confirma);
> `contabilidad.regla_aprendida.failed` cierra el evento de dominio
> `contabilidad.regla_aprendida` (cuando el repositorio no está disponible).

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.desatasco.resolver.response` (el par response del RPC); **NO está
> declarada en `publishes`**.

> Nota: no está en module.json pero sí lo declara index.js — el handler
> **`onProjectActivated`** (evento `project.activated`) restaura la memoria de
> aprendizaje del proyecto activado vía PosPersistencia. El módulo **tiene store**
> (micro-agente), pero `project.activated` **no aparece** en `module.json.subscribes`
> (sub-declaración).

> Nota: no está en module.json pero sí lo emite index.js — `_registrarEnCola` publica
> `contabilidad.excepcion.resolver.request` (forward a A8.1) y
> `_reglasActivas` publica `contabilidad.regla.leer.request` /
> `contabilidad.regla_movimiento.leer.request` por `_rpc` (dependencias por EVENTO, no
> declaradas como publishers).

> Nota: **`contabilidad.excepcion_desatascada.failed`** existe en module.json pero el
> index.js lo emite en `onResolverRequest` (rama en que `_registrarEnCola` no confirma);
> en `onExcepcionEncolada` la rama equivalente publica el mismo
> `contabilidad.excepcion_desatascada` con `pendiente_de_silla:true` (es una PROPUESTA,
> no un fallo).

## Reglas de negocio

1. **El sistema NO firma ni decide solo (invariante 11)**: la resolución siempre lleva
   `firma_del_sistema:false`. `decision_de` es `'SILLA'` si el payload (`decision`) trae
   la decisión, o `'PROPUESTA_DEL_MICRO_AGENTE'` si la propone el juicio fuzzy.
2. **Sin rol de la silla NO se resuelve**: `_registrarEnCola` exige `rol` no vacío;
   si falta → **`400 ROL_NO_DECLARADO`** con
   `{ message:'sin el rol de la silla NO se resuelve: el sistema no firma solo',
   details:{ cola, excepcion_id } }`. El rol válido de cada cola está en
   `SILLAS = { ASESOR:'ASESOR', DUENO:'DUENO' }`; `silla_ocupada = (rol === SILLAS[cola])`.
3. **Tres salidas canónicas** (`SALIDAS = {RESOLVER, REENColar, DESCARTAR_CON_MOTIVO}`):
   `_salidaCanonica` tolera variantes (`REENCOLAR` → `REENColar`, `DESCARTAR`/`DESCARTE`
   → `DESCARTAR_CON_MOTIVO`). Si el payload trae una `decision` **válida**, se usa esa;
   si no, clasifica el juicio.
4. **Clasificación determinista de la salida** (`_clasificarSalida`, sobre el motivo en
   mayúsculas): si contiene `IRRECUPERABLE`/`NO_ES_HECHO`/`BASURA`/`SPAM` →
   `DESCARTAR_CON_MOTIVO`; si contiene `ILEGIBLE`/`SIN_DATOS`/`FALTA` o `ambiguedad ≥ 0.75`
   → `REENColar`; si no → `RESOLVER`.
5. **Descartar exige MOTIVO**: `DESCARTAR_CON_MOTIVO` con motivo de menos de
   `MOTIVO_MIN_CHARS = 4` caracteres → **`422 MOTIVO_REQUERIDO`** con
   `{ cola, excepcion_id }`. *No se descarta a ciegas.*
6. **Solo RESOLVER aprende**: la regla candidata se produce **únicamente** cuando
   `salida === 'RESOLVER'` (reencolar/descartar no aprenden).
7. **No se propone lo ya cubierto**: si una regla que ACTÚA
   (`estado ∈ {DECLARADA, RATIFICADA}`) del repositorio ya cubre la excepción
   (`_hayReglaQueCubre`), se marca `ya_cubierto:true` y **no** se propone regla nueva.
8. **Contrato TOLERANTE del repositorio**: si el repositorio de reglas **no responde**
   (`_reglasActivas` → `null`), se marca `repositorio_no_disponible:true`; la candidata
   se **DECLARA** publicando `contabilidad.regla_aprendida.failed` (503
   `DEPENDENCIA_NO_DISPONIBLE`) y **además** se publica `contabilidad.regla_aprendida`
   con `repositorio_disponible:false`. **No se asume cubierta.**
9. **La regla candidata NO actúa**: `_producirRegla` la crea con
   `estado:'RATIFICACION_PENDIENTE'`, `actua:false`, `aportada_por:'DESATASCO_ENTRADA'`,
   `firma_del_sistema:false`. Sin `vertical` ni `documento_origen` → **`422
   PRECONDITION_FAILED`** (`'sin vertical ni documento no hay patron que aprender: no se
   inventa la regla'`).
10. **Repositorio por ámbito**: `_repositorioDe` devuelve `regla-movimiento-bancario`
    (E8) si la naturaleza/ámbito incluye `BANC`/`EXTRACTO` o la vertical es `BANCO` /
    `MOVIMIENTO_BANCARIO`; si no, `regla-contrapartida` (A6.2).
11. **Ambigüedad determinista** (`_gradoAmbiguedad`): fracción de 6 señales presentes
    (`hecho`, `naturaleza`, `motivo`, `hecho.tercero|documento_origen`, `hecho.lineas`
    no vacío, `id`); `ambiguedad = round(1 - presentes/6, 2)`; `ambiguedad_alta =
    ambiguedad ≥ 0.5`.
12. **No se declara desatascado lo que la cola no confirma**: si
    `contabilidad.excepcion.resolver.request` (A8.1) no responde o da error, se publica
    `contabilidad.excepcion_desatascada.failed` (503 `DEPENDENCIA_NO_DISPONIBLE`); en
    `onExcepcionEncolada`, si la silla no ha decidido, se publica
    `contabilidad.excepcion_desatascada` con `pendiente_de_silla:true` y
    `decision_aplicada:false`.
13. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT
    project_id`; `excepcion` ausente/no objeto → `400 INVALID_INPUT excepcion`; cola
    fuera de `ASESOR|DUENO` → `400 INVALID_INPUT cola`. Shape: `{ status:400,
    error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> }
    } }`.
14. **HTTP exacto**: éxito `200`; payload inválido → `400`; descartar sin motivo → `422`;
    sin vertical/documento → `422`; dependencia no disponible → `503`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.desatasco.resolver.response`. La entrada también
puede llegar por el evento `contabilidad.excepcion_encolada` (fire-and-forget).

### 1. `resolver` — con el rol de la silla (RESOLVER + regla candidata)

```json
{
  "project_id": "e57a318a-...",
  "cola": "ASESOR",
  "rol": "ASESOR",
  "excepcion": { "id": "e57a318a-...-A8.1-007", "naturaleza": "CONTABLE", "motivo": "SIN_COBERTURA", "hecho": { "vertical": "COMPRA", "tercero": "B12345678", "documento_origen": "FAC-2026-0042", "lineas": [{ "base": 100 }] } },
  "decision": "RESOLVER",
  "evidencia": { "excepcion_id": "e57a318a-...-A8.1-007" },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (tras confirmar A8.1):
```json
{
  "project_id": "e57a318a-...",
  "cola": "ASESOR",
  "excepcion_id": "e57a318a-...-A8.1-007",
  "naturaleza": "CONTABLE",
  "vertical": "COMPRA",
  "repositorio": "regla-contrapartida",
  "salida": "RESOLVER",
  "motivo": "SIN_COBERTURA",
  "ambiguedad": 0, "ambiguedad_alta": false,
  "silla": "ASESOR", "rol_silla": "ASESOR", "silla_ocupada": true,
  "decision_de": "SILLA", "decision_aplicada": true,
  "firma_del_sistema": false,
  "regla_candidata": { "regla_id": "e57a318a-...-P3-e57a318a-...-A8.1-007", "repositorio": "regla-contrapartida", "ambito": "COMPRA", "patron": { "vertical": "COMPRA", "documento_origen": "FAC-2026-0042" }, "contrapartida": { "cuenta": null, "tercero": "B12345678", "periodo": null }, "estado": "RATIFICACION_PENDIENTE", "actua": false, "aportada_por": "DESATASCO_ENTRADA", "evidencia": { "excepcion_id": "e57a318a-...-A8.1-007", "salida": "RESOLVER", "motivo": "SIN_COBERTURA" }, "firma_del_sistema": false },
  "en_cola": { "...": "..." }
}
```
Se emiten `contabilidad.excepcion_desatascada` (res.data + `en_cola` + `correlation_id`) y
`contabilidad.regla_aprendida` (con `regla`, `actua:false`,
`requiere_ratificacion:true`).

### 2. `resolver` — sin `rol` → 400 ROL_NO_DECLARADO (el sistema no firma solo)

```json
{ "project_id": "e57a318a-...", "cola": "ASESOR", "excepcion": { "id": "...", "motivo": "SIN_COBERTURA" } }
```
La proyección devuelve `200` pero el **forward a A8.1** se corta en `_registrarEnCola` →
`400 ROL_NO_DECLARADO`, y se publica `contabilidad.excepcion_desatascada.failed` con
`{ status:400, error:{ code:'ROL_NO_DECLARADO', message:'sin el rol de la silla NO se
resuelve: el sistema no firma solo', details:{ cola:'ASESOR', excepcion_id:'...' } } }`.

### 3. `resolver` — descartar sin motivo → 422 MOTIVO_REQUERIDO

```json
{ "project_id": "e57a318a-...", "cola": "ASESOR", "rol": "ASESOR", "excepcion": { "id": "...", "motivo": "BASURA" }, "decision": "DESCARTAR" }
```
Respuesta `422` + `contabilidad.desatasco.resolver.failed`:
```json
{ "status": 422, "error": { "code": "MOTIVO_REQUERIDO", "message": "descartar una excepcion exige MOTIVO: no se descarta a ciegas", "details": { "cola": "ASESOR", "excepcion_id": "..." } } }
```

### 4. `resolver` — sin vertical/documento → 422 PRECONDITION_FAILED

La regla candidata no se puede aprender sin patrón → `422 PRECONDITION_FAILED`
(`'sin vertical ni documento no hay patron que aprender: no se inventa la regla'`) y
`contabilidad.desatasco.resolver.failed`.

### 5. Entrada `contabilidad.excepcion_encolada` — propuesta sin silla

Si el payload no trae `rol`/`decision`, se publica `contabilidad.excepcion_desatascada`
con `decision_aplicada:false`, `en_cola:null`, `pendiente_de_silla:true` — la
**PROPUESTA**, no una resolución.

### 6. Tools (sin RPC en module.json)

`toolResolver` → `_resolver`; `toolProducirRegla` → `_producirRegla`;
`toolGradoAmbiguedad` → `_gradoAmbiguedad`.

## Tests

El test vive en `tests/unit/desatasco-entrada.test.js`. Cubre:

- `resolver` con `rol` de la silla y `decision:'RESOLVER'` → `200`, forward a A8.1,
  emite `contabilidad.excepcion_desatascada` y `contabilidad.regla_aprendida`
  (`actua:false`, `estado:'RATIFICACION_PENDIENTE'`, `firma_del_sistema:false`).
- **Sin `rol`** → `400 ROL_NO_DECLARADO` + `contabilidad.excepcion_desatascada.failed`
  (no se declara desatascado).
- **Descartar sin motivo** → `422 MOTIVO_REQUERIDO` + `contabilidad.desatasco.resolver.failed`.
- **Sin vertical/documento** al aprender → `422 PRECONDITION_FAILED`.
- `_salidaCanonica` tolera variantes (`REENCOLAR`, `DESCARTAR`); clasificación fuzzy por
  motivo (`BASURA` → descartar, `ILEGIBLE`/`FALTA` → reencolar, resto → resolver).
- **No propone lo ya cubierto**: si una regla que actúa cubre → `ya_cubierto:true`, sin
  candidata.
- **Contrato tolerante**: repositorio de reglas no disponible → `repositorio_no_disponible:true`
  + `contabilidad.regla_aprendida.failed` (503) y la candidata se publica igualmente.
- `contabilidad.excepcion_encolada` sin silla → publica la PROPUESTA
  (`pendiente_de_silla:true`, `decision_aplicada:false`).
- Payloads inválidos (sin `project_id`/`excepcion`, cola desconocida) → `400 INVALID_INPUT`.
- `project.activated` restaura la memoria vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/desatasco-entrada
node --test tests/unit/desatasco-entrada.test.js
```

## Notas de implementación

- Clase `DesatascoEntrada extends ModuloHibridoReflejo`; `name = 'desatasco-entrada'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._store` (Map project_id →
  `{ esquema:'contabilidad-desatasco-entrada-v1', desatascos:[], reglas:[], updated_at }`).
- Constantes: `SALIDAS` (Set), `SILLAS = {ASESOR:'ASESOR', DUENO:'DUENO'}`,
  `REPOSITORIO_CONTRAPARTIDA='regla-contrapartida'`,
  `REPOSITORIO_BANCARIO='regla-movimiento-bancario'`, `MOTIVO_MIN_CHARS=4`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'desatasco-entrada.json', dir: '/contabilidad/desatasco-entrada', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
  Cada mutación marca `marcarDirty(pid)`.
- `onResolverRequest` delega en `_atender(e, 'resolver',
  'contabilidad.desatasco.resolver.response', fn)`; tras la proyección hace el forward
  con `_registrarEnCola` y publica `contabilidad.excepcion_desatascada` (o
  `*.failed`), luego `_publicarReglaCandidata`. `onExcepcionEncolada` es
  fire-and-forget (no usa `_atender`).
- Proyecciones puras: `_resolver`, `_producirRegla`, `_clasificarSalida`,
  `_gradoAmbiguedad`, `_hayReglaQueCubre`, `_repositorioDe` + helpers
  `_obtenerOCrear(pid)`, `_registrarEnCola`, `_publicarReglaCandidata`. `_rpc`/`_invalid`/
  `_errorResponse` vienen de la base.
- Tools: `toolResolver`, `toolProducirRegla`, `toolGradoAmbiguedad`.
- DEP hacia delante: `contabilidad.regla_aprendida` lo consume L10
  `ratificacion-regla-aprendida` (y los repositorios A6.2/E8, que la hidratan).
  DEP hacia atrás por evento: A8.1 `cola-revision` (entrada `contabilidad.excepcion_encolada`
  y forward de resolución), A6.2/E8 (lectura de reglas por EVENTO).
