---
name: informe-accionable
description: >
  Skill FULL del módulo MICRO-AGENTE `informe-accionable` de la vertical contabilidad
  de Enki. TODO informe que recibe el cliente lleva QUÉ HACER con él: toma el informe
  ya compuesto por `informe-rico` (K3) y PROPONE una RECOMENDACIÓN — la quita de
  adorno y refuerza K3. ⚠️ EL SISTEMA NO DECIDE: PROPONE; EL DUEÑO DECIDE. La
  recomendación es juicio: primero las reglas declaradas (reflejo), después el juicio
  fuzzy anclado al informe. Si no hay base suficiente para recomendar con honestidad,
  LO DECLARA — no inventa. Úsala para operar, depurar o extender el micro-agente, o
  para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites proponer qué hacer con un informe contable (RPC
    informe-accionable.juzgar.request).
  - Cuando depures por qué sale `recomendacion:null` con `faltan:['informe']` (sin
    informe declarado ni compuesto por K3) o `faltan:['base']` (sin base suficiente),
    o por qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del micro-agente (el dueño decide, nunca inventa, la recomendación va
    anclada al informe, no escribe ni persiste) y su relación con `informe-rico` (K3)
    vía informe-rico.componer.request / `contabilidad.recomendacion`.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente informe-accionable.
tags: [enki, modulo, micro-agente, contabilidad, informe-accionable]
---

# informe-accionable — MICRO-AGENTE del qué-hacer con el informe

## Qué hace el módulo

`informe-accionable` es un **MICRO-AGENTE HÍBRIDO** (R2, hoja del plan): **TODO informe que
recibe el cliente lleva QUÉ HACER con él**. Toma el informe **ya compuesto** por `informe-rico`
(**K3**) y **PROPONE** una **RECOMENDACIÓN** — la **quita de adorno** y **refuerza K3**.

Atributos del diseño: `informe:Informe`.
Método: `juzgar(i:Informe):Recomendacion`.

> 🔴 **EL SISTEMA NO DECIDE: PROPONE. EL DUEÑO DECIDE.** La clase **juzga** (la recomendación es
> **juicio**) y devuelve una **PROPUESTA** con su base: **jamás ejecuta, jamás escribe, jamás
> decide** por el dueño (`decide:false`, `decide_dueno:true`, `escribe:false`, `ejecuta:false`).
> **Si NO hay base suficiente para recomendar con honestidad, LO DECLARA — no inventa.**

**HÍBRIDO** (patrón `etiquetado-analitico`):

- `_juzgarReflejo` — **REFLEJO determinista**: aplica las **REGLAS DECLARADAS**
  (informe → recomendación), operando sobre el operador declarado
  `igual`/`contiene`/`en`/`rango`/`existe`. **La primera que coincide GANA.** Una sola respuesta
  correcta → **no es juicio**.
- `_concluir` — **FUZZY**: cuando ninguna regla cubre, **1 llamada** `llm.complete.request` con
  **guion-prompt self-contained** que **PROPONE** qué hacer **ANCLADO al informe real**. Si falla
  o no cumple el contrato → **NO se inventa**.

Invariantes:

- **EL DUEÑO DECIDE**: la salida es una **PROPUESTA** (`decide:false`, `decide_dueno:true`); no se
  ejecuta.
- **NUNCA INVENTA**: sin informe o sin base declarada **NO se fabrica una recomendación** — se
  declara **`[ABIERTO]`** con lo que falta.
- **La recomendación va ANCLADA al informe** (su cifra/contexto): si el informe no trae base, el
  juicio **lo declara** en vez de adivinar.
- **NO escribe, NO persiste**: **refuerza K3, no lo sustituye**.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_juzgar`.
Consume el informe de `informe-rico` (**K3**) por EVENTO y publica `contabilidad.recomendacion`.
Cierra el círculo con `informe-accionable.juzgar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `informe-accionable.juzgar.request` | `onJuzgarRequest` | RPC híbrido (juicio): {project_id, informe?, informe_id?, reglas?, cifra?, periodo?, origen?, unidad?, comparativa?, notas?} → {informe_id, informe, recomendacion:{que_hacer, motivo, base, prioridad, origen:'regla'\|'juicio', regla_id, confianza}, base_suficiente, decide:false, decide_dueno:true, escribe:false, ejecuta:false, abierto, faltan}. Toma el informe declarado o compuesto por informe-rico (K3) POR EVENTO; aplica las REGLAS declaradas (reflejo) o PROPONE con juicio fuzzy anclado al informe. Sin informe o sin base suficiente → recomendacion null y el hueco declarado (NUNCA se inventa). PROPONE; NO decide (la decisión es del dueño). Éxito → publica contabilidad.recomendacion y responde por informe-accionable.juzgar.response; project_id ausente → informe-accionable.juzgar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `informe-accionable.juzgar.response` | Respuesta RPC correlada de informe-accionable.juzgar.request → {request_id, status:200, data:{informe_id, informe, recomendacion, base_suficiente, decide:false, decide_dueno:true, escribe:false, abierto, faltan}}. Emitida por el helper _atender. |
| `informe-accionable.juzgar.failed` | Par de fallo determinista (R2): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de informe-accionable.juzgar.request. |
| `contabilidad.recomendacion` | Fire-and-forget (R2): quedó PROPUESTA una recomendación (qué hacer con el informe) → {project_id, informe_id, recomendacion, origen:'regla'\|'juicio', decide_dueno:true, correlation_id}. Lo consume la entrega al negocio (R1) para adjuntar el «qué hacer» al informe. NO implica decisión: EL DUEÑO DECIDE. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `informe-accionable.juzgar.failed` cierra el círculo de
> `informe-accionable.juzgar.request` cuando `_juzgar` devuelve status ≠ 200 (el único camino:
> `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onJuzgarRequest` publica
> `contabilidad.recomendacion` **siempre que `_juzgar` devuelve `200`** — lo que **incluye** la
> vía **sin informe** y la vía **sin base suficiente**, en las que el evento viaja con
> `recomendacion:null` y `origen:null`. El consumidor debe mirar `recomendacion`. La rama `else`
> publica `informe-accionable.juzgar.failed`.

> Nota de sub-declaración (cruce con `index.js`): **no están en `module.json` pero sí los emite
> `index.js`** dos RPC salientes (son **DEP por evento**, no eventos emitidos):
> `informe-rico.componer.request` (`{project_id, cifra, periodo, origen, unidad, comparativa,
> notas}`, `timeout_ms:5000` — el informe de su dueño K3) y `llm.complete.request`
> (`{system: GUION_INFORME, messages, tools:[], settings:{temperature:0.3}}`,
> `timeout_ms:30000` — el juicio fuzzy).

> Nota: el micro-agente expone `toolJuzgar(params)` como **tool directa** (misma proyección
> `_juzgar`) — no es un evento del bus. Tampoco figuran `_juzgarReflejo`, `_coincide`, `_campo`,
> `_concluir`, `_parse`, `_recomendacionDe`, `_informe`, `_baseSuficiente`, `_reglas`, `_proponer`
> (internos) ni la constante `GUION_INFORME`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **EL INFORME** (`_informe`): si `input.informe` (o `input.i`) es objeto → ese; si no, se pide
   a su dueño **POR EVENTO** con `informe-rico.componer.request`
   (`{project_id, cifra, periodo, origen, unidad, comparativa, notas}`, `timeout_ms:5000`) y se
   toma `data.informe`. **No se recalcula.**
3. **SIN INFORME** → `200` con `informe_id:null`, `informe:null`, `recomendacion:null`,
   `base_suficiente:false`, `decide:false`, `decide_dueno:true`, `escribe:false`, `abierto:true`,
   `faltan:['informe']` y `motivo:'no hay informe sobre el que recomendar (ni declarado ni
   compuesto por informe-rico K3): no se inventa una recomendacion'`. **No se inventa.**
4. **`informe_id`**: `informe.id` o `input.informe_id` (string) o `null`.
5. **REFLEJO determinista PRIMERO** (`_juzgarReflejo`): recorre las reglas declaradas en orden.
   - Cada regla (`{cuando|condicion, que_hacer|recomendacion, motivo?, base?, prioridad?, id?}`)
     exige una **condición** (`cuando`/`condicion`, objeto) que **coincida** con el informe
     (`_coincide`) y un **qué hacer** no vacío.
   - La **PRIMERA que coincide GANA** → recomendación con `origen:'regla'`, `confianza:1`,
     `regla_id` (`r.id ?? r.regla_id`). **Una sola respuesta correcta → no se ejerce juicio.**
6. **`_coincide` evalúa UNA condición declarada** contra el informe. **Cero semántica cableada:
   el operador es DATO.** `campo` (ruta por puntos sobre el informe) y `op`/`operador`
   (`'igual'` por defecto): `igual` (string igual), `contiene` (incluye),
   `en` (array contiene el valor), `rango` (`{min,max}` sobre el valor numérico),
   `existe` (no `undefined`/`null`/`''`). **Operador no declarado → `false`**.
7. **FUZZY DESPUÉS** (`_concluir`): **1 llamada** `llm.complete.request` con el guion
   `GUION_INFORME` + `{informe, reglas_declaradas}` y `settings:{temperature:0.3}`. **El guion
   obliga a**: (1) **PROPONER, no decidir**; (2) **NO inventar cifras** — usar **exclusivamente**
   lo del informe; (3) si no hay base suficiente → `puede:false` y **declarar qué falta**.
   - `_parse` limpia los cercados ```` ```json ```` y extrae el primer `{...}`; falla → `null`.
   - `_recomendacionDe` valida: `puede === true` y `recomendacion` (qué hacer) no vacía;
     `prioridad` normalizada (`alta|media|baja` o `null`); `confianza` numérica en `[0,1]` o
     `null`. Aceptada → `origen:'juicio'`.
8. **NI REGLA NI JUICIO RESOLUBLE** (sin base) → `200` con `recomendacion:null`,
   `base_suficiente:<_baseSuficiente(informe)>`, `faltan:['base']` y `motivo:'el informe no trae
   base suficiente para recomendar con honestidad: se declara el hueco en vez de inventar una
   recomendacion'`. **Nunca se inventa.**
9. **La PROPUESTA** (`_proponer`): `{project_id, informe_id, informe, recomendacion:{que_hacer,
   motivo, base, prioridad, origen, regla_id, confianza}, base_suficiente:true, decide:false,
   decide_dueno:true, escribe:false, ejecuta:false, abierto:{recomendacion:null}}`. **`decide:false`,
   `decide_dueno:true`, `escribe:false` y `ejecuta:false` son constantes.**
10. **`_baseSuficiente`**: `true` si el informe trae `cifra` no nula, **o** `contexto` objeto, **o**
    `valor` no nulo (una narración/valores declarados también valen como base).
11. **Las REGLAS** (`_reglas`): `input.reglas` o `input.criterio.reglas` (array) o `[]`.
12. **NO ESCRIBE, NO PERSISTE, NO DECIDE**: ninguna escritura ni store en disco. Sin
    `PosPersistencia`, sin `onProjectActivated`. **Refuerza K3, no lo sustituye.**
13. **HTTP exacto**: éxito `200` (con recomendación, sin informe o sin base); `project_id`
    ausente → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `informe-accionable.juzgar.response` y emite `contabilidad.recomendacion`.

### 1. `juzgar` — una regla declarada cubre → PROPONE por reflejo

```json
{
  "project_id": "e57a318a-...",
  "informe": { "id": "IN-3", "cifra": -4200, "contexto": { "periodo": "2026-09", "unidad": "EUR" }, "tema": "margen" },
  "reglas": [ { "id": "R-1", "cuando": { "campo": "cifra", "op": "rango", "valor": { "max": 0 } }, "que_hacer": "revisar márgenes del periodo", "motivo": "margen negativo", "base": "cifra", "prioridad": "alta" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (por regla):

```json
{
  "project_id": "e57a318a-...",
  "informe_id": "IN-3",
  "informe": { "id": "IN-3", "cifra": -4200, "contexto": { "periodo": "2026-09", "unidad": "EUR" }, "tema": "margen" },
  "recomendacion": { "que_hacer": "revisar márgenes del periodo", "motivo": "margen negativo", "base": "cifra", "prioridad": "alta", "origen": "regla", "regla_id": "R-1", "confianza": 1 },
  "base_suficiente": true,
  "decide": false,
  "decide_dueno": true,
  "escribe": false,
  "ejecuta": false,
  "abierto": { "recomendacion": null }
}
```

Emite `contabilidad.recomendacion` (lo consume la entrega R1 para adjuntar el «qué hacer»):

```json
{ "project_id": "e57a318a-...", "informe_id": "IN-3", "recomendacion": { "que_hacer": "...", "origen": "regla", "...": "..." }, "origen": "regla", "decide_dueno": true, "correlation_id": "abc-123" }
```

### 2. `juzgar` — ninguna regla cubre → el juicio fuzzy PROPONE (anclado al informe)

Se llama a `llm.complete.request` con el guion + el informe + las reglas. Si devuelve
`puede:true` y un qué-hacer → `recomendacion:{que_hacer, motivo, base, prioridad,
origen:'juicio', regla_id:null, confianza}`. **PROPONE; EL DUEÑO DECIDE.**

### 3. `juzgar` — sin informe → `[ABIERTO]` (no se inventa)

Sin `informe` y con K3 sin responder → `recomendacion:null`, `faltan:['informe']`, `motivo`
declarado. Emite el evento con `recomendacion:null`.

### 4. `juzgar` — informe sin base suficiente → se declara, no se inventa

Informe sin `cifra`/`contexto`/`valor` y sin regla ni juicio → `recomendacion:null`,
`base_suficiente:false`, `faltan:['base']`. **El hueco se declara; no se adivina.**

### 5. Fallo — falta `project_id`

```json
{ "informe": { "id": "IN-3", "cifra": -4200 } }
```

Respuesta `400` + `informe-accionable.juzgar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/informe-accionable.test.js`. Cubre:

- Una **regla declarada** que coincide → `200 recomendacion.origen:'regla'`, `regla_id`,
  `confianza:1`; **no se llama al LLM** (uno sola respuesta correcta → no hay juicio).
- Los operadores declarados (`igual`, `contiene`, `en`, `rango`, `existe`) coinciden como datos;
  **un operador no declarado → no coincide**.
- Ninguna regla cubre → juicio fuzzy (`llm.complete.request`); una propuesta con qué-hacer se
  acepta (`origen:'juicio'`); **una propuesta que no cumple el contrato se rechaza**.
- **Sin informe** (ni declarado ni de K3) → `recomendacion:null`, `faltan:['informe']` (**no se
  inventa**).
- **Sin base suficiente** → `recomendacion:null`, `faltan:['base']` (**se declara, no se
  adivina**).
- El informe, si no viene declarado, se **PIDE a `informe-rico` (K3) POR EVENTO**
  (`informe-rico.componer.request`); **no se recalcula**.
- `decide:false`, `decide_dueno:true`, `escribe:false` y `ejecuta:false` **siempre**; ninguna
  llamada persiste ni muta (stateless).
- `project_id` ausente → `400 INVALID_INPUT` + `.juzgar.failed`.
- `toolJuzgar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `InformeAccionable extends ModuloHibridoReflejo`; `name = 'informe-accionable'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (MICRO-AGENTE stateless). `blueprint_driven:true`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/informe-accionable/`).
- Constante `GUION_INFORME` — guion-prompt self-contained (las **reglas de hierro**: proponer sin
  decidir; no inventar cifras; si falta base → `puede:false` y declarar qué falta).
  `_juzgarReflejo` es el reflejo determinista; `_concluir`/`_parse`/`_recomendacionDe` el fuzzy.
- `onJuzgarRequest` usa `this._atender(e, 'juzgar', 'informe-accionable.juzgar.response',
  async (d) => {...})` con cierre de círculo (evento de dominio en `200` — con recomendación o
  `[ABIERTO]` —, par `failed` si no). `onUnload` delega en `super`.
- Proyección única `_juzgar(input)` (**async**: pide el informe a K3 y/o consulta el LLM por
  evento); helpers `_proponer`, `_juzgarReflejo`, `_coincide`, `_campo`, `_concluir`, `_parse`,
  `_recomendacionDe`, `_informe`, `_baseSuficiente`, `_reglas`. Tool `toolJuzgar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: **pide** `informe-rico.componer.request` (K3, el informe) y `llm.complete.request` (el
  juicio) por EVENTO. Publica `contabilidad.recomendacion`, que lo consume la entrega al negocio
  (R1) para adjuntar el «qué hacer» al informe.
- **EL SISTEMA NO DECIDE: PROPONE. EL DUEÑO DECIDE.** La recomendación es **juicio**; su salida
  es una **PROPUESTA** con base (`decide:false`, `decide_dueno:true`, `escribe:false`,
  `ejecuta:false` constantes); **sin base suficiente se declara el hueco — no se inventa.**
