---
name: etiquetado-analitico
description: >
  Skill FULL del módulo MICRO-AGENTE `etiquetado-analitico` de la vertical contabilidad de Enki.
  Asigna CENTRO / LÍNEA / PRODUCTO (la DIMENSIÓN analítica) a cada HECHO. La regla es DECLARABLE
  (criterios del jefe vía cola K9); cuando ninguna regla cubre, Juzga y PROPONE sin escribir —
  lo que no resuelve con honestidad va a COLA, nunca se inventa una dimensión. EL ÚNICO que
  PERSISTE el juicio aprendido (en memoria), y su memoria duradera es el evento de dominio. Sin
  store en disco. Úsala para operar, depurar o extender el micro-agente, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites etiquetar analíticamente un hecho (centro/línea/producto) (RPC
    etiquetado-analitico.juzgar.request).
  - Cuando depures por qué el hecho va a COLA con `propuesta:null`, `en_cola:true` y
    `abierto:true` (sin reglas declaradas, o sin cobertura de regla y sin juicio resoluble) o
    por qué falta `project_id`/`hecho` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    micro-agente (regla declarable, reflejo determinista primero y juicio después, nunca
    inventa, propone sin escribir, memoria de lo aprendido).
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente etiquetado-analitico.
tags: [enki, modulo, micro-agente, contabilidad, etiquetado-analitico]
---

# etiquetado-analitico — MICRO-AGENTE del etiquetado por dimensión

## Qué hace el módulo

`etiquetado-analitico` es un **MICRO-AGENTE HÍBRIDO** (J1, hoja del plan): **ASIGNA
CENTRO / LÍNEA / PRODUCTO** (la **DIMENSIÓN** analítica) a cada **HECHO**.

Atributos del diseño: `reglas:ParametroDeclarable` y `dimensiones:Set<Dimension>`.
Método: `juzgar(h:Hecho):Propuesta<Dimension>` — **PROPONE; NO escribe.**

- La **REGLA es DECLARABLE**: los criterios los declara el **JEFE** en
  `cola-declaraciones-criterio` (K9) y llegan aquí **POR EVENTO**
  (`cola-declaraciones-criterio.ratificar.request` vía `_rpc`, best-effort) o **declarados en la
  petición** — el reflejo **NUNCA cablea** una regla de negocio.
- Cuando la regla **NO cubre** el hecho, clasificar es **JUICIO**: el micro-agente **PROPONE**
  (juicio fuzzy asistido vía `llm.complete.request`) y lo que **no puede resolver con
  honestidad** va a **COLA** como `[ABIERTO]`.
- **HÍBRIDO** (patrón `veredicto-viabilidad`):
  - `_juzgarReflejo` — **REFLEJO determinista**: aplica las **REGLAS declaradas** al hecho (la
    **primera que coincide gana**, operando sobre el **operador declarado**:
    `igual`/`prefijo`/`contiene`/`en`/`rango`/`existe`). Una sola respuesta correcta por regla →
    **no es juicio**.
  - `_concluir` — **FUZZY** (juicio LLM): cuando ninguna regla cubre, **1 llamada**
    `llm.complete.request` con **guion-prompt self-contained** que **PROPONE** una dimensión. La
    propuesta fuzzy **solo se acepta si sus ids pertenecen a la lista DECLARADA** (no inventa
    dimensiones); si el LLM falla o no cumple el contrato, **NO se inventa**: el hecho va a
    **COLA**.
- **EL ÚNICO QUE PERSISTE EL JUICIO — y se justifica**: es la única pieza cuya salida es
  **IRREDUCIBLE a aritmética** (una dimensión propuesta no se computa, se **JUZGA**). Por eso
  conserva en memoria (`this._juicios`) la **MEMORIA DE LO APRENDIDO** — cada juicio emitido,
  con su origen (regla o juicio fuzzy) y su confianza — para **no re-juzgar lo mismo dos veces**
  y para que el criterio declarado pueda crecer a partir de lo observado. Esa memoria es
  **PROCESO, no parcela**: la persistencia **DURADERA** del juicio es el **EVENTO de dominio**
  que publica (`contabilidad.dimension_propuesta`), que consume el resto de la vertical.

Invariantes:

- **NUNCA INVENTA**: sin reglas declaradas → `[ABIERTO]` (no se elige una dimensión por
  defecto); sin cobertura de regla y sin juicio resoluble → el hecho va a **COLA**, con lo que
  falta declarado. **Si no puede resolver → `[ABIERTO]`/cola, jamás una dimensión inventada.**
- **PROPONE; no escribe** (`escribe:false`).
- **STATELESS respecto de `PosPersistencia`**: sin store en disco, sin custodiar parcela ajena,
  sin `onProjectActivated`. Memoria de lo aprendido en proceso; persistencia duradera vía evento
  de dominio.

Proyección única `_juzgar`. Publica `contabilidad.dimension_propuesta`. Cierra el círculo de
error con `etiquetado-analitico.juzgar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `etiquetado-analitico.juzgar.request` | `onJuzgarRequest` | RPC hibrido (juicio): {project_id, hecho:{...}, reglas?, dimensiones?, criterio?} → {project_id, hecho_id, fuente_reglas, propuesta:{centro, linea, producto, origen:'regla'\|'juicio', regla_id, confianza}, escribe:false, en_cola, cola:'cola-declaraciones-criterio', abierto, faltan, motivo}. Aplica las reglas DECLARADAS (reflejo determinista, primera que coincide) y, si ninguna cubre, PROPONE con el juicio fuzzy (llm.complete.request, ids validados contra las dimensiones declaradas). Sin reglas declaradas → [ABIERTO]; sin cobertura ni juicio resoluble → el hecho va a COLA (nunca una dimension inventada). PROPONE; no escribe. Exito con propuesta → publica contabilidad.dimension_propuesta y responde por etiquetado-analitico.juzgar.response; fallo → etiquetado-analitico.juzgar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `etiquetado-analitico.juzgar.response` | Respuesta RPC correlada de etiquetado-analitico.juzgar.request → {request_id, status:200, data:{propuesta, escribe:false, en_cola, faltan, abierto}}. Emitida por el helper _atender. |
| `etiquetado-analitico.juzgar.failed` | Par de fallo determinista (J1): project_id o hecho ausente → {status, error:{code, message, details?}}. Cierra el circulo de etiquetado-analitico.juzgar.request. |
| `contabilidad.dimension_propuesta` | Fire-and-forget (J1): el micro-agente PROPUSO una dimension analitica (centro/linea/producto) para un hecho → {project_id, hecho_id, propuesta, origen:'regla'\|'juicio', correlation_id}. Es la PERSISTENCIA DURADERA del juicio (la memoria en proceso no basta): lo consumen la analitica de margen (J2) y el tablero por dimension (J10). NUNCA implica escritura: solo se declara la propuesta. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `etiquetado-analitico.juzgar.failed` cierra el círculo de
> `etiquetado-analitico.juzgar.request` cuando `_juzgar` devuelve status ≠ 200 (`400 INVALID_INPUT`
> por `project_id` o `hecho` ausente).

> Nota de honestidad (cruce con `index.js`): `onJuzgarRequest` publica
> `contabilidad.dimension_propuesta` **solo si `_juzgar` devuelve `200` Y `res.data.propuesta`**
> (hay propuesta). La vía `[ABIERTO]`/cola (`propuesta:null`) **no** emite el evento de
> propuesta — es un `200` que solo declara que el hecho quedó encolado. La rama `else` publica
> `etiquetado-analitico.juzgar.failed`.

> Nota de sub-declaración (cruce con `index.js`): **no están en `module.json` pero sí las emite
> `index.js`** dos RPC salientes (son **DEP por evento**, no eventos emitidos):
> - en `_criterio`: `cola-declaraciones-criterio.ratificar.request`
>   (`{project_id, clave:'dimensiones'}`, `timeout_ms:4000`);
> - en `_concluir`: `llm.complete.request`
>   (`{system: GUION_ETIQUETADO, messages, tools:[], settings:{temperature:0.2}}`,
>   `timeout_ms:30000`).

> Nota: el módulo expone `juiciosDe(pid)` como **lectura directa** de la memoria de lo aprendido
> (mismo proceso, no muta) — no es un evento del bus, no figura en `module.json`. Tampoco
> figuran `_juzgarReflejo`, `_concluir`, `_coincide`, `_campo`, `_parse`, `_dimDe`, `_ids`,
> `_idEn`, `_criterio`, `_proponer`, `_acolar`, `_recordar` ni `_id` (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). El **hecho** es obligatorio
   (`input.hecho`, objeto); ausente → `400 INVALID_INPUT` (`field:'hecho'`).
2. **`hecho_id`** = `hecho.id_hecho` o `hecho.id` o `null`. Etiqueta: no estima nada.
3. **Las REGLAS se resuelven en `_criterio`** (ParametroDeclarable):
   - `input.reglas` o `input.criterio.reglas` (array) → **declaradas** (`fuente_reglas:'declarado'`);
     `dimensiones` = `input.dimensiones` o `input.criterio.dimensiones` (array o `[]`).
   - si no, RPC `cola-declaraciones-criterio.ratificar.request` **por evento** con
     `{clave:'dimensiones'}`; si vuelve `data.criterio.valor` objeto → `reglas` y `dimensiones`
     de ahí, `fuente_reglas:'cola-declaraciones-criterio'`.
   - si no → `{reglas:[], dimensiones:[], fuente_reglas:null}`.
4. **Sin reglas declaradas** → **`[ABIERTO]` y a COLA** (`_acolar`): **no se elige una dimensión
   por defecto**; `faltan:['reglas']`, `en_cola:true`, `cola:'cola-declaraciones-criterio'`.
5. **REFLEJO determinista primero** (`_juzgarReflejo`): recorre las reglas en orden; para cada
   una, `cuando`/`condicion` (objeto) debe **coincidir** con el hecho; de su `dimension`/
   `propuesta` extrae `centro`/`linea`/`producto` (`dim.X ?? r.X`). Una regla **sin ninguna
   dimensión** se salta. **La PRIMERA que coincide GANA** → propuesta con `origen:'regla'`,
   `regla_id`, `confianza:1`. **Una sola respuesta correcta: no es juicio.**
6. **`_coincide` evalúa UNA condición declarada** contra el hecho. **Cero semántica cableada: el
   operador es DATO.** Soporta `campo` (ruta por puntos `a.b.c` sobre el hecho, solo lectura) y
   `op`/`operador` (`'igual'` por defecto):
   - `igual` → `String(valorHecho) === String(esperado)`.
   - `prefijo` → `startsWith`; `contiene` → `includes`.
   - `en` → `esperado` array contiene el hecho (como string).
   - `rango` → `esperado:{min?, max?}` (defaults `-Infinity`/`Infinity`); `valorHecho` numérico.
   - `existe` → `valorHecho` no `undefined`/`null`/`''`.
   - **operador no declarado → `false`** (no se adivina la intención).
7. **FUZZY después** (`_concluir`): **1 llamada** `llm.complete.request` con el guion
   `GUION_ETIQUETADO` + `{hecho, dimensiones_declaradas, reglas_no_cubren}` y
   `settings:{temperature:0.2}`.
   - **`_parse`** limpia los cercados ```` ```json ```` y extrae el primer `{...}`; falla → `null`.
   - **`_dimDe`** valida: `asistido.puede === true`, `confianza` numérica en `[0,1]`, y cada id
     (`centro`/`linea`/`producto`) **debe pertenecer a la lista DECLARADA**
     (`_idEn` contra `_ids(dimensiones)`); si ninguno pertenece → `null` (**no inventa
     dimensiones**). Aceptada → `origen:'juicio'`, `regla_id:null`, `confianza`, `motivo`.
   - **Los ids sin tipo declarado valen para cualquiera** de los tres conjuntos.
8. **Ni regla ni juicio resoluble** → **A COLA** (`_acolar`): `propuesta:null`,
   `faltan:['cobertura_regla_o_juicio']`, `en_cola:true`. **Nunca se inventa una dimensión.**
9. **La PROPUESTA** (`_proponer`): `{centro, linea, producto, origen:'regla'|'juicio', regla_id,
   confianza, motivo?}`; respuesta con `escribe:false`, `en_cola:false`, `abierto:false`,
   `faltan:[]`. **Se recuerda en `this._juicios`** (memoria de lo aprendido: `{hecho_id,
   propuesta, origen, confianza, en}`, acotada a **5000** por proyecto).
10. **La COLA** (`_acolar`): `propuesta:null`, `escribe:false`, `en_cola:true`,
    `cola:'cola-declaraciones-criterio'`, `abierto:true`, `faltan`, `motivo`. **El jefe lo
    declarará en la cola de criterios (K9).**
11. **PROPONE, NO ESCRIBE**: no hay ninguna escritura ni persistencia en disco. La **persistencia
    DURADERA** del juicio es el **evento de dominio** `contabilidad.dimension_propuesta`.
12. **HTTP exacto**: éxito `200` (con propuesta o `[ABIERTO]`/cola); `project_id` o `hecho`
    ausentes → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `etiquetado-analitico.juzgar.response` y emite `contabilidad.dimension_propuesta`.

### 1. `juzgar` — la primera regla declarada que coincide gana

```json
{
  "project_id": "e57a318a-...",
  "hecho": { "id_hecho": "H-1001", "cuenta": "628", "concepto": "REPARACION HORNO", "importe": 450 },
  "reglas": [ { "id": "R-1", "cuando": { "campo": "cuenta", "op": "prefijo", "valor": "62" }, "dimension": { "centro": "MANTENIMIENTO" } } ],
  "dimensiones": [ { "tipo": "centro", "id": "MANTENIMIENTO" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (resuelto por regla):

```json
{
  "project_id": "e57a318a-...", "hecho_id": "H-1001", "hecho": { "...": "..." },
  "fuente_reglas": "declarado",
  "propuesta": { "centro": "MANTENIMIENTO", "linea": null, "producto": null, "origen": "regla", "regla_id": "R-1", "confianza": 1 },
  "escribe": false, "en_cola": false, "abierto": false, "faltan": [], "motivo": null
}
```

Emite `contabilidad.dimension_propuesta` (lo consumen la analítica de margen J2 y el tablero por
dimensión J10):

```json
{ "project_id": "e57a318a-...", "hecho_id": "H-1001", "propuesta": { "centro": "MANTENIMIENTO", "linea": null, "producto": null, "origen": "regla", "regla_id": "R-1", "confianza": 1 }, "origen": "regla", "correlation_id": "abc-123" }
```

### 2. `juzgar` — ninguna regla cubre → el juicio fuzzy PROPONE

Con reglas declaradas que no coinciden, se llama a `llm.complete.request` con el guion + el
hecho + las dimensiones declaradas. Si devuelve `puede:true` con ids **de la lista declarada** →
`propuesta:{..., origen:'juicio', regla_id:null, confianza, motivo}` y se emite el evento. **Un
id que no esté en la lista declarada se rechaza** (no se inventan dimensiones).

### 3. `juzgar` — sin reglas declaradas → `[ABIERTO]` y a COLA (nunca una dimensión inventada)

```json
{ "project_id": "e57a318a-...", "hecho": { "id_hecho": "H-1002", "concepto": "VARIOS" } }
```

`200` con `propuesta:null`, `en_cola:true`, `cola:'cola-declaraciones-criterio'`,
`abierto:true`, `faltan:["reglas"]`, `fuente_reglas:null` y `motivo` declarando que el jefe debe
declarar el criterio. **No se elige una dimensión por defecto.**

### 4. `juzgar` — ni regla ni juicio resoluble → COLA

Reglas que no cubren y juicio que no cumple el contrato → `propuesta:null`, `en_cola:true`,
`faltan:["cobertura_regla_o_juicio"]`, `abierto:true`. **Nunca se inventa.**

### 5. Fallo — falta el hecho

Respuesta `400` + `etiquetado-analitico.juzgar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "hecho requerido", "details": { "field": "hecho" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/etiquetado-analitico.test.js`. Cubre:

- `juzgar` con una regla declarada que coincide → `200 {origen:'regla', regla_id, confianza:1}`
  y emite `contabilidad.dimension_propuesta`.
- Los operadores declarados (`igual`, `prefijo`, `contiene`, `en`, `rango`, `existe`) coinciden
  como datos; **un operador no declarado → no coincide** (no se adivina la intención).
- Sin reglas declaradas → `[ABIERTO]`/cola con `faltan:['reglas']` (**no se elige dimensión por
  defecto**) y **no** emite el evento de propuesta.
- Ninguna regla cubre → juicio fuzzy (`llm.complete.request`); una propuesta con ids de la lista
  declarada se acepta (`origen:'juicio'`); un id fuera de la lista **se rechaza**.
- Ni regla ni juicio resoluble → COLA con `faltan:['cobertura_regla_o_juicio']` (**nunca
  inventa**).
- Las reglas se piden a `cola-declaraciones-criterio` (K9) por evento cuando no se declaran →
  `fuente_reglas:'cola-declaraciones-criterio'`.
- La memoria de lo aprendido (`juiciosDe(pid)`) recuerda cada propuesta con su origen y
  confianza; acotada a 5000.
- `project_id` o `hecho` ausentes → `400 INVALID_INPUT` + `.juzgar.failed`.
- **PROPONE, NO ESCRIBE**: ninguna llamada persiste ni muta (stateless).
- `toolJuzgar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `EtiquetadoAnalitico extends ModuloHibridoReflejo`; `name = 'etiquetado-analitico'`,
  `version = 'reflejo-0.1.0'`. Memoria `this._juicios = new Map()` (`project_id → [Juicio]`),
  **en proceso, acotada a 5000**. Sin `PosPersistencia`, sin store en disco, sin
  `onProjectActivated`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/etiquetado-analitico/`). `blueprint_driven:true`.
- Constante `GUION_ETIQUETADO` — **guion-prompt self-contained** del micro-agente (exige responder
  **solo JSON**: `{"puede", "centro", "linea", "producto", "confianza", "motivo"}`, sin inventar
  ids).
- `onJuzgarRequest` usa `this._atender(e, 'juzgar', 'etiquetado-analitico.juzgar.response',
  async (d) => {...})` con cierre de círculo (evento de dominio en `200` **si hay propuesta**,
  par `failed` si no).
- Proyección `_juzgar(input)` (**async**: consulta K9 y el LLM por evento); helpers
  `_juzgarReflejo` (reflejo), `_concluir`/`_parse`/`_dimDe`/`_ids`/`_idEn` (fuzzy), `_coincide`,
  `_campo`, `_criterio`, `_proponer`, `_acolar`, `_recordar`; lectura directa `juiciosDe(pid)`.
  Tool `toolJuzgar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: **pide** `cola-declaraciones-criterio.ratificar.request` (K9) y `llm.complete.request`
  por EVENTO. Lo consumen la analítica de margen (J2) y el tablero por dimensión (J10) vía
  `contabilidad.dimension_propuesta`.
- **EL ÚNICO QUE PERSISTE EL JUICIO — JUSTIFICADO**: su salida es **irreducible a aritmética**
  (una dimensión se **JUZGA**, no se computa); por eso conserva la **memoria de lo aprendido** en
  proceso. Esa memoria es **PROCESO, no parcela**: la persistencia **duradera** es el **evento de
  dominio**. **NUNCA INVENTA**: sin reglas → `[ABIERTO]`; sin cobertura ni juicio resoluble →
  **COLA**; los criterios los **declara el jefe** (K9).
