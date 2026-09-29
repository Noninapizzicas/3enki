---
name: desatasco-entrada
description: >
  Skill FULL del módulo MICRO-AGENTE `desatasco-entrada` de la vertical
  contabilidad de Enki. LA ACCIÓN que completa A8: resuelve/reencola/descarta una
  EXCEPCIÓN CON MOTIVO — primero las reglas declaradas (reflejo determinista),
  después el juicio fuzzy. Nunca inventa; si no resuelve con honestidad →
  REENCOLA. Puede PROPONER una regla candidata, pero NO ACTÚA hasta que el
  ASESOR la ratifique. Propone, no escribe. Úsala para operar, depurar o extender
  el micro-agente, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites desatascar una excepción encolada (RPC
    desatasco-entrada.juzgar.request).
  - Cuando depures por qué la decisión sale `accion:'reencolar'` con
    `origen:'fallback'` (ni regla ni juicio resoluble), por qué
    `regla_candidata_actua:false`, o por qué falta `project_id`/`excepcion`
    (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del micro-agente (nunca inventa, con motivo, la regla candidata
    no actúa hasta ratificarse, propone sin escribir).
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente
    desatasco-entrada.
tags: [enki, modulo, micro-agente, contabilidad, desatasco-entrada]
---

# desatasco-entrada — MICRO-AGENTE del desatasco de excepciones

## Qué hace el módulo

`desatasco-entrada` es un **MICRO-AGENTE HÍBRIDO** (P3, hoja del plan): **LA ACCIÓN que
completa A8**. `encolado-excepcion` (A8.1) solo **ENCOLA**; aquí se decide **QUÉ HACER** con lo
encolado — **resolver / reencolar / descartar** una **EXCEPCIÓN CON MOTIVO**.

Atributos del diseño: `cola:EncoladoExcepcion`.
Método: `juzgar(e:Excepcion):Decision<resolver|reencolar|descartar>`.

> 🔴 **LA REGLA CANDIDATA NO ACTÚA HASTA QUE EL ASESOR LA RATIFICA.** Cuando el desatasco aprende
> algo de la resolución, **PROPONE** una **REGLA CANDIDATA** (`regla_candidata`) y la publica —
> pero **NO la aplica**. La ratificación es del **ASESOR** (`ratificacion-regla-aprendida`, L10);
> mientras no se ratifique, `regla_candidata_actua:false`.

**HÍBRIDO** (patrón `etiquetado-analitico`):

- `_juzgarReflejo` — **REFLEJO determinista**: aplica las **REGLAS ya declaradas Y RATIFICADAS**
  al caso (una regla candidata no ratificada se **IGNORA** para el corte; la **primera que
  coincide GANA**, operando sobre el operador declarado `igual`/`prefijo`/`contiene`/`en`/`existe`).
  Una sola respuesta correcta → **no es juicio**.
- `_concluir` — **FUZZY**: cuando ninguna regla cubre, **1 llamada** `llm.complete.request` con
  **guion-prompt self-contained** que **PROPONE** la acción con su **motivo**. Si el LLM falla o
  no cumple el contrato, **NO se inventa**.

Invariantes:

- **NUNCA INVENTA**: sin base para resolver → **REENCOLA** (no fabrica una contrapartida ni un
  importe).
- **CON MOTIVO**: toda decisión lleva su **motivo**; sin motivo la propuesta fuzzy se **rechaza**
  y no hay decisión.
- **LA REGLA CANDIDATA NO ACTÚA**: se propone y se declara que **requiere ratificación del
  ASESOR**.
- **PROPONE, NO ESCRIBE**: no toca la cola (A8.1) ni el libro (`escribe:false`).

La memoria de lo aprendido vive **en proceso**; la persistencia duradera es el **EVENTO de
dominio** que publica (`contabilidad.excepcion_desatascada`). Proyección única `_juzgar`. Cierra
el círculo con `desatasco-entrada.juzgar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `desatasco-entrada.juzgar.request` | `onJuzgarRequest` | RPC híbrido (juicio): {project_id, excepcion:{id\|clave, asunto, naturaleza, motivo, detalle}, reglas?:[...]} → {project_id, excepcion_id, decision:{accion:'resolver'\|'reencolar'\|'descartar', motivo, resolucion:{contrapartida, importe}\|null, origen:'regla'\|'juicio'\|'fallback', regla_id, confianza}, regla_candidata, regla_candidata_actua:false, ratifica_por:'ratificacion-regla-aprendida (L10)', aprendido, escribe:false, abierto, faltan}. Aplica las REGLAS declaradas y ratificadas (reflejo determinista); si ninguna cubre, PROPONE con el juicio fuzzy (llm.complete.request, exige motivo); sin cobertura ni juicio resoluble → REENCOLA (nunca inventa). Puede proponer una regla candidata que NO ACTÚA hasta ratificación del asesor. Exito → publica contabilidad.excepcion_desatascada y responde por desatasco-entrada.juzgar.response; excepcion/project_id ausente → desatasco-entrada.juzgar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `desatasco-entrada.juzgar.response` | Respuesta RPC correlada de desatasco-entrada.juzgar.request → {request_id, status:200, data:{excepcion_id, decision, regla_candidata, regla_candidata_actua:false, ratifica_por, aprendido, escribe:false, abierto}}. Emitida por el helper _atender. |
| `desatasco-entrada.juzgar.failed` | Par de fallo determinista (P3): project_id o excepcion ausente → {status, error:{code, message, details?}}. Cierra el circulo de desatasco-entrada.juzgar.request. |
| `contabilidad.excepcion_desatascada` | Fire-and-forget (P3): una excepcion quedo DESATASCADA con motivo (propuesta, no escritura) → {project_id, excepcion_id, accion, motivo, escribe:false, regla_candidata, requiere_ratificacion, correlation_id}. Si regla_candidata != null, NO ACTUA hasta que el asesor la ratifique (ratificacion-regla-aprendida L10). Lo consume la cola (A8.1) para materializar la salida y el asesor para ratificar. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `desatasco-entrada.juzgar.failed` cierra el círculo de `desatasco-entrada.juzgar.request`
> cuando `_juzgar` devuelve status ≠ 200 (`400 INVALID_INPUT` por `project_id` o `excepcion`
> ausentes).

> Nota de honestidad (cruce con `index.js`): `onJuzgarRequest` publica
> `contabilidad.excepcion_desatascada` **siempre que `_juzgar` devuelve `200`** — lo que **incluye
> la vía fallback** (`accion:'reencolar'`, `origen:'fallback'`) y la vía `'juicio'`. El evento
> lleva `requiere_ratificacion: res.data.regla_candidata !== null` (true solo si hay regla
> candidata propuesta). La rama `else` publica `desatasco-entrada.juzgar.failed`.

> Nota de sub-declaración (cruce con `index.js`): **no están en `module.json` pero sí lo emite
> `index.js`** el RPC saliente en `_concluir`: `llm.complete.request` (`{system: GUION_DESATASCO,
> messages, tools:[], settings:{temperature:0.2}}`, `timeout_ms:30000`) — es una **DEP por
> evento**, no un evento emitido.

> Nota: el micro-agente expone `aprendidoDe(pid)` como **lectura directa** de la memoria de lo
> aprendido (mismo proceso, copia, no muta). Tampoco figuran `_juzgarReflejo`, `_coincide`,
> `_campo`, `_concluir`, `_parse`, `_decisionDe`, `_decision`, `_reglas`, `_idExcepcion`,
> `_recordar` (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). La **excepción** es obligatoria (`input.excepcion ||
   input.ex`); ausente/no objeto → `400 INVALID_INPUT` (`field:'excepcion'`).
2. **`excepcion_id`** (`_idExcepcion`): `ex.id` o `ex.clave` o `null`.
3. **Las REGLAS** (`_reglas`): `input.reglas` o `input.criterio.reglas` (array) o `[]`. El
   conjunto de acciones es **fijo** (`ACCIONES = {resolver, reencolar, descartar}`); **no se
   amplía**.
4. **REFLEJO determinista primero** (`_juzgarReflejo`): recorre las reglas en orden.
   - Una regla **candidata no ratificada** (`r.ratificada === false` o `r.actua === false`) se
     **IGNORA** para el corte (**LA REGLA CANDIDATA NO ACTÚA**).
   - `cuando`/`condicion` (objeto) debe **coincidir** con la excepción (`_coincide`); su `accion`
     debe estar en `ACCIONES`.
   - La **PRIMERA que coincide GANA** → decisión con `origen:'regla'`, `regla_id`
     (`r.id ?? r.regla_id`), `confianza:1`. Si la acción es `resolver`, la `resolucion` sale de la
     regla (`contrapartida` string o `null`, `importe` vía `_num`).
   - **No se ejerce juicio** cuando la regla cubre.
5. **`_coincide` evalúa UNA condición declarada** contra la excepción. **Cero semántica cableada:
   el operador es DATO.** Soporta `campo` (ruta por puntos sobre la excepción) y `op`/`operador`
   (`'igual'` por defecto): `igual`, `prefijo`, `contiene`, `en` (array contiene el valor), `existe`
   (no `undefined`/`null`/`''`). **Operador no declarado → `false`** (no se adivina la intención).
6. **FUZZY después** (`_concluir`): **1 llamada** `llm.complete.request` con el guion
   `GUION_DESATASCO` + `{excepcion, reglas_declaradas}` y `settings:{temperature:0.2}`.
   - `_parse` limpia los cercados ```` ```json ```` y extrae el primer `{...}`; falla → `null`.
   - `_decisionDe` valida: `puede === true`, `accion` en `ACCIONES`, y **motivo no vacío** (**sin
     motivo no hay decisión**); `confianza` numérica en `[0,1]` o `null`; si la acción es
     `resolver`, la `resolucion` es `{contrapartida, importe}` (o `null`). Aceptada →
     `origen:'juicio'`, `regla_id:null`, `confianza`.
7. **La REGLA CANDIDATA** (solo si la acción propuesta es `resolver` y el juicio la trae):
   `{texto, origen:'desatasco-entrada', actua:false, requiere_ratificacion:true}`; se **recuerda**
   en `this._aprendido` (`_recordar`) y se devuelve en `regla_candidata`. **NO ACTÚA**:
   `regla_candidata_actua:false` y `ratifica_por:'ratificacion-regla-aprendida (L10, decisión del
   ASESOR)'`. Si la acción es `reencolar`/`descartar`, la regla candidata es `null`.
8. **Ni regla ni juicio resoluble → REENCOLA** (`origen:'fallback'`): `accion:'reencolar'`,
   `motivo:'ninguna regla cubre la excepcion y el juicio no es resoluble con honestidad: espera en
   cola'`, `resolucion:null`, `confianza:null`, `faltan:['cobertura_regla_o_juicio']`. **Nunca se
   inventa una resolución.**
9. **La DECISIÓN** (`_decision`): `{project_id, excepcion_id, excepcion, decision:{accion, motivo,
   resolucion, origen, regla_id, confianza}, regla_candidata, regla_candidata_actua:false,
   ratifica_por, aprendido, escribe:false, abierto:{regla_candidata}, faltan}`.
   - `abierto.regla_candidata` declara (si la hay) que queda **PROPUESTA y NO ACTÚA** hasta que el
     asesor la ratifique (L10).
10. **La MEMORIA de lo aprendido** (`_recordar`): `this._aprendido = Map<project_id,
    [ReglaCandidata]>`, **en proceso**, acotada a **`MAX_APRENDIDO = 2000`** (al superarlo se
    recortan las más antiguas). `aprendidoDe(pid)` la lee (copia, no muta).
11. **PROPONE, NO ESCRIBE** (`escribe:false`): no hay ninguna escritura ni persistencia en disco.
    La cola (A8.1) y el libro los toca su custodio. La persistencia DURADERA es el evento de
    dominio.
12. **HTTP exacto**: éxito `200` (con decisión de regla, de juicio o fallback); `project_id` o
    `excepcion` ausentes → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `desatasco-entrada.juzgar.response` y emite `contabilidad.excepcion_desatascada`.

### 1. `juzgar` — la primera regla declarada (y ratificada) que coincide gana

```json
{
  "project_id": "e57a318a-...",
  "excepcion": { "id": "X-1", "asunto": "factura sin NIF", "naturaleza": "proveedor_desconocido", "concepto": "COMPRA VARIOS" },
  "reglas": [ { "id": "R-1", "cuando": { "campo": "naturaleza", "op": "igual", "valor": "proveedor_desconocido" }, "accion": "resolver", "contrapartida": "410", "importe": 121.5, "motivo": "proveedor recurrente identificado" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (resuelto por regla):

```json
{
  "project_id": "e57a318a-...",
  "excepcion_id": "X-1",
  "excepcion": { "...": "..." },
  "decision": { "accion": "resolver", "motivo": "proveedor recurrente identificado", "resolucion": { "contrapartida": "410", "importe": 121.5 }, "origen": "regla", "regla_id": "R-1", "confianza": 1 },
  "regla_candidata": null,
  "regla_candidata_actua": false,
  "ratifica_por": "ratificacion-regla-aprendida (L10, decisión del ASESOR)",
  "aprendido": null,
  "escribe": false,
  "abierto": { "regla_candidata": null },
  "faltan": []
}
```

### 2. `juzgar` — ninguna regla cubre → el juicio fuzzy PROPONE (con motivo)

Se llama a `llm.complete.request` con el guion + la excepción + las reglas. Si devuelve
`puede:true`, acción válida y **motivo** → `decision:{accion, motivo, resolucion,
origen:'juicio', regla_id:null, confianza}`. Si la acción es `resolver` y el juicio trae un patrón
generalizable, se PROPONE una **regla candidata**:

```json
{
  "regla_candidata": { "texto": "si naturaleza=proveedor_desconocido y concepto contiene COMPRA → contrapartida 410", "origen": "desatasco-entrada", "actua": false, "requiere_ratificacion": true },
  "regla_candidata_actua": false,
  "ratifica_por": "ratificacion-regla-aprendida (L10, decisión del ASESOR)",
  "aprendido": { "texto": "...", "origen": "desatasco-entrada", "actua": false, "requiere_ratificacion": true, "excepcion_id": "X-2", "aprendido_en": "2026-09-30T...:00.000Z" }
}
```

**La regla candidata NO ACTÚA** hasta que el ASESOR la ratifique (L10). Emite
`contabilidad.excepcion_desatascada` con `requiere_ratificacion:true`.

### 3. `juzgar` — ni regla ni juicio resoluble → REENCOLA (nunca inventa)

```json
{ "project_id": "e57a318a-...", "excepcion": { "id": "X-3", "asunto": "cargo raro", "naturaleza": "desconocida" }, "reglas": [] }
```

Respuesta `200` (`origen:'fallback'`): `accion:'reencolar'`, `resolucion:null`, `confianza:null`,
`faltan:['cobertura_regla_o_juicio']`. **No se fabrica contrapartida ni importe.** Emite el
evento de dominio (con `regla_candidata:null`, `requiere_ratificacion:false`).

### 4. Fallo — falta la excepción

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `400` + `desatasco-entrada.juzgar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "excepcion requerido", "details": { "field": "excepcion" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/desatasco-entrada.test.js`. Cubre:

- Una **regla declarada y ratificada** que coincide → `200 {origen:'regla', regla_id,
  confianza:1}`; **no se llama al LLM** (no hay juicio).
- Una regla con `ratificada:false`/`actua:false` (candidata) **se IGNORA** para el corte
  (**LA REGLA CANDIDATA NO ACTÚA**).
- Los operadores declarados (`igual`, `prefijo`, `contiene`, `en`, `existe`) coinciden como
  datos; **un operador no declarado → no coincide**.
- Ninguna regla cubre → juicio fuzzy (`llm.complete.request`); una propuesta con acción válida y
  **motivo** se acepta (`origen:'juicio'`); **sin motivo se rechaza**.
- Acción `resolver` con patrón → se PROPONE `regla_candidata` con `actua:false` y
  `requiere_ratificacion:true`; el evento sale con `requiere_ratificacion:true`.
- Ni regla ni juicio resoluble → **`accion:'reencolar'`**, `origen:'fallback'`,
  `faltan:['cobertura_regla_o_juicio']` (**nunca inventa**).
- `escribe:false` y `regla_candidata_actua:false` **siempre**; ninguna llamada persiste ni muta
  (stateless).
- La memoria de lo aprendido (`aprendidoDe(pid)`) recuerda cada regla candidata; acotada a 2000.
- `project_id` o `excepcion` ausentes → `400 INVALID_INPUT` + `.juzgar.failed`.
- `toolJuzgar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `DesatascoEntrada extends ModuloHibridoReflejo`; `name = 'desatasco-entrada'`,
  `version = 'reflejo-0.1.0'`. Memoria `this._aprendido = new Map()` (`project_id →
  [ReglaCandidata]`), **en proceso, acotada a 2000**. Sin `PosPersistencia`, sin store en disco,
  sin `onProjectActivated`. `blueprint_driven:true`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/desatasco-entrada/`).
- Constantes: `ACCIONES = new Set(['resolver','reencolar','descartar'])`, `MAX_APRENDIDO = 2000`,
  `GUION_DESATASCO` (guion-prompt self-contained: exige **solo JSON** `{"puede","accion","motivo",
  "resolucion":{"contrapartida","importe"},"regla_candidata","confianza"}` y prohíbe inventar
  datos).
- `onJuzgarRequest` usa `this._atender(e, 'juzgar', 'desatasco-entrada.juzgar.response',
  async (d) => {...})` con cierre de círculo (evento de dominio en `200` — regla, juicio o
  fallback —, par `failed` si no).
- Proyección única `_juzgar(input)` (**async**: consulta el LLM por evento); helpers
  `_juzgarReflejo` (reflejo), `_concluir`/`_parse`/`_decisionDe` (fuzzy), `_coincide`, `_campo`,
  `_decision`, `_reglas`, `_idExcepcion`, `_recordar`, `_num`; lectura directa `aprendidoDe(pid)`.
  Tool `toolJuzgar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `llm.complete.request` por EVENTO. Lo consumen la cola (A8.1) para materializar la
  salida y el **ASESOR** para ratificar (`ratificacion-regla-aprendida`, L10) vía
  `contabilidad.excepcion_desatascada`.
- **LA REGLA CANDIDATA NO ACTÚA HASTA RATIFICARSE**: su `actua:false` y
  `ratifica_por:'ratificacion-regla-aprendida (L10)'` son constantes del contrato.
