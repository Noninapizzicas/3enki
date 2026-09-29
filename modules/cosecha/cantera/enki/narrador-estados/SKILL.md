---
name: narrador-estados
description: >
  Skill FULL del módulo MICRO-AGENTE `narrador-estados` de la vertical contabilidad
  de Enki. Traduce el BALANCE y el RESULTADO al LENGUAJE del negocio cliente: «esto es
  lo que te ha pasado y lo que viene». Narrar en lenguaje natural es JUICIO. ⚠️ NARRA
  LO QUE HAY: no estima ni adorna lo que falta. Los estados llegan declarados o los
  calculan sus dueños (balance-situacion C1, cuenta-resultados C2) POR EVENTO; si un
  estado falta, la narración LO DECLARA como hueco — jamás lo rellena con una cifra
  inventada (`estima:false`). Primero las plantillas declaradas (reflejo), después el
  juicio fuzzy que narra SOLO con las cifras reales. Úsala para operar, depurar o
  extender el micro-agente, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites narrar balance y resultado en lenguaje del negocio (RPC
    narrador-estados.narrar.request).
  - Cuando depures por qué sale `narracion:null` con `faltan:['balance','resultado']`
    (sin ningún estado que narrar) o por qué `faltan:['balance']`/`['resultado']` (un
    estado ausente que se declara, no se rellena), o por qué falta `project_id`
    (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del micro-agente (narra lo que hay, nunca estima ni adorna, la narración
    no decide, no escribe ni persiste) y su relación con `balance-situacion` (C1) y
    `cuenta-resultados` (C2) vía sus `.calcular.request` / `contabilidad.narracion`.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente narrador-estados.
tags: [enki, modulo, micro-agente, contabilidad, narrador-estados]
---

# narrador-estados — MICRO-AGENTE del narrador de estados contables

## Qué hace el módulo

`narrador-estados` es un **MICRO-AGENTE HÍBRIDO** (R3, hoja del plan): **traduce el BALANCE y el
RESULTADO al LENGUAJE del negocio cliente** — *«esto es lo que te ha pasado y lo que viene»*.
**Narrar en lenguaje natural es JUICIO.**

Atributos del diseño: `balance:EstadoDerivado`, `resultado:EstadoDerivado`.
Método: `narrar(estados):Lenguaje`.

> 🔴 **NARRA LO QUE HAY — no estima ni adorna lo que falta.** Los estados llegan **declarados** o
> los **calculan sus dueños** (`balance-situacion` C1, `cuenta-resultados` C2) **POR EVENTO**. Si
> un estado falta, la narración **LO DECLARA como hueco** — **jamás lo rellena con una cifra
> inventada** (`estima:false`).

**HÍBRIDO** (patrón `etiquetado-analitico`):

- `_narrarReflejo` — **REFLEJO determinista**: compone la frase con las **PLANTILLAS DECLARADAS**
  (`estado → frase`) sobre los **estados reales**. Una plantilla cuyo estado **no existe NO se
  aplica**. Una sola respuesta → **no es juicio**.
- `_concluir` — **FUZZY**: cuando no hay plantilla que cubra, **1 llamada** `llm.complete.request`
  con **guion-prompt self-contained** que narra **SOLO con las cifras reales**. Si falla o no
  cumple el contrato → la narración se declara **`[ABIERTO]`** (no se adorna).

Invariantes:

- **NARRA LO QUE HAY**: cada cifra de la narración sale de un **estado REAL**; lo que falta **se
  declara**.
- **NUNCA ESTIMA NI ADORNA**: no se inventan valores ni se «colorean» los ausentes
  (`estima:false`).
- **La narración NO decide**: **describe**. El sistema **no decide** por el dueño (`decide:false`).
- **NO escribe, NO persiste.**

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_narrar`.
Consume los estados de sus dueños (`balance-situacion` C1 y `cuenta-resultados` C2) por EVENTO y
publica `contabilidad.narracion`. Cierra el círculo con `narrador-estados.narrar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `narrador-estados.narrar.request` | `onNarrarRequest` | RPC híbrido (narración): {project_id, balance?, resultado?, periodo?, ejercicio?, plantillas?} → {narracion, estados_narrados, balance, resultado, faltan, origen:'plantilla'\|'juicio', confianza, estima:false, decide:false, abierto}. Toma los estados declarados o calculados por sus dueños (balance-situacion C1, cuenta-resultados C2) POR EVENTO; compone la narración con las PLANTILLAS DECLARADAS (reflejo) o con juicio fuzzy que narra SOLO con las cifras reales. Los estados ausentes se declaran (faltan) y NO se rellenan; sin ningún estado → narracion null (no se adorna el vacío). Éxito → publica contabilidad.narracion y responde por narrador-estados.narrar.response; project_id ausente → narrador-estados.narrar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `narrador-estados.narrar.response` | Respuesta RPC correlada de narrador-estados.narrar.request → {request_id, status:200, data:{narracion, estados_narrados, balance, resultado, faltan, origen, confianza, estima:false, decide:false, abierto}}. Emitida por el helper _atender. |
| `narrador-estados.narrar.failed` | Par de fallo determinista (R3): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de narrador-estados.narrar.request. |
| `contabilidad.narracion` | Fire-and-forget (R3): los estados contables quedaron NARRADOS en lenguaje del negocio cliente → {project_id, narracion, origen:'plantilla'\|'juicio', estados_narrados, faltan, correlation_id}. Lo consume la entrega al negocio (R1) para el informe del cliente. Narra lo que hay; no estima ni decide. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `narrador-estados.narrar.failed` cierra el círculo de
> `narrador-estados.narrar.request` cuando `_narrar` devuelve status ≠ 200 (el único camino:
> `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onNarrarRequest` publica
> `contabilidad.narracion` **siempre que `_narrar` devuelve `200`** — lo que **incluye** la vía
> **sin ningún estado** (`narracion:null`, `faltan:['balance','resultado']`) y la vía **sin
> plantilla ni juicio válido** (`narracion:null`), en las que el evento viaja con `narracion:null`
> y `origen:null`. El consumidor debe mirar `narracion`. La rama `else` publica
> `narrador-estados.narrar.failed`.

> Nota de sub-declaración (cruce con `index.js`): **no están en `module.json` pero sí los emite
> `index.js`** tres RPC salientes (son **DEP por evento**, no eventos emitidos):
> `balance-situacion.calcular.request` (`{project_id, periodo, ejercicio}`, `timeout_ms:5000` — el
> balance, C1), `cuenta-resultados.calcular.request` (`{project_id, periodo, ejercicio}`,
> `timeout_ms:5000` — el resultado, C2) y `llm.complete.request` (`{system: GUION_NARRAR, messages,
> tools:[], settings:{temperature:0.4}}`, `timeout_ms:30000` — el juicio que narra).

> Nota: el micro-agente expone `toolNarrar(params)` como **tool directa** (misma proyección
> `_narrar`) — no es un evento del bus. Tampoco figuran `_narrarReflejo`, `_rellenar`, `_concluir`,
> `_parse`, `_narracionDe`, `_balance`, `_resultado`, `_narrados`, `_plantillas`, `_salida`
> (internos) ni la constante `GUION_NARRAR`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **El BALANCE** (`_balance`): si `input.balance` es objeto → ese; si no, se pide a su dueño **POR
   EVENTO** con `balance-situacion.calcular.request` (`{project_id, periodo, ejercicio}`, con
   `ejercicio = input.ejercicio ?? input.periodo`, `timeout_ms:5000`) y se toma
   `data.balance || data.balance_situacion` (o `data` si trae `activo`). **No se recalcula.**
3. **El RESULTADO** (`_resultado`): si `input.resultado` es objeto → ese; si no, se pide a su dueño
   **POR EVENTO** con `cuenta-resultados.calcular.request` (`{project_id, periodo, ejercicio}`,
   `timeout_ms:5000`) y se toma `data` si trae `resultado`. **No se recalcula.**
4. **Los HUECOS se declaran**: `faltan` = `['balance']` y/o `['resultado']` (solo los ausentes).
5. **SIN NINGÚN ESTADO** (ni balance ni resultado) → `200` con `narracion:null`,
   `estados_narrados:[]`, `balance:null`, `resultado:null`, `faltan:['balance','resultado']`,
   `abierto:true`, `decide:false` y `motivo:'no hay estados que narrar (ni balance C1 ni resultado
   C2): el narrador narra lo que hay, no lo que falta'`. **No se adorna el vacío.**
6. **REFLEJO determinista PRIMERO** (`_narrarReflejo`): recorre las **plantillas declaradas**
   (`{estado, frase}`); cada plantilla se aplica **solo si su estado EXISTE** (`estados[estado]`);
   **una plantilla cuyo estado no existe NO se aplica** (no se narra lo ausente con una frase).
   La frase se rellena con los campos del estado vía marcadores `{{campo}}` (`_rellenar`): una
   clave ausente **deja el marcador tal cual** (no se inventa el valor — se **ve** que falta). El
   resultado une las partes con un espacio; **sin ninguna parte → `null`**.
7. **FUZZY DESPUÉS** (`_concluir`): **1 llamada** `llm.complete.request` con el guion
   `GUION_NARRAR` + `{estados, plantillas_declaradas}` y `settings:{temperature:0.4}`. **El guion
   obliga a**: (1) **NARRAR SOLO LO QUE HAY** — usar **exclusivamente** las cifras dadas; (2) **NO
   estimar ni adornar** lo ausente (si un estado viene `null`, decirlo — «no consta» —, **no
   rellenarlo**); (3) **NO decidir por el dueño** — **describe**, no recomienda acciones.
   - `_parse` limpia los cercados ```` ```json ```` y extrae el primer `{...}`; falla → `null`.
   - `_narracionDe` valida: `puede === true` y `narracion` no vacía; `confianza` numérica en
     `[0,1]` o `null`. Aceptada → `origen:'juicio'`.
8. **NI PLANTILLA NI JUICIO VÁLIDO** → `200` con `narracion:null`,
   `estados_narrados:<_narrados(estados)>`, `balance`, `resultado`, `faltan`, `abierto:true`,
   `decide:false` y `motivo:'no se pudo narrar con honestidad (sin plantilla ni juicio valido): se
   declara el hueco en vez de adornar'`. **No se adorna.**
9. **La SALIDA con narración** (`_salida`): `{project_id, narracion, estados_narrados, balance,
   resultado, faltan, origen, confianza, estima:false, decide:false, abierto:{balance, resultado}}`.
   - `confianza` = la del juicio, o `1` si `origen === 'plantilla'`, o `null`.
   - `abierto.balance`/`abierto.resultado` declaran el hueco del estado ausente («el balance (C1) no
     consta: se narra sin él, no se estima»).
   - **`estima:false` y `decide:false` son constantes.**
10. **`_narrados`**: lista `['balance','resultado']` con los estados **presentes** (los que se
    narraron).
11. **Las PLANTILLAS** (`_plantillas`): `input.plantillas` o `input.narracion_plantillas` o
    `input.criterio.plantillas` (array) o `[]`.
12. **NO ESCRIBE, NO PERSISTE, NO DECIDE**: ninguna escritura ni store en disco. Sin
    `PosPersistencia`, sin `onProjectActivated`.
13. **HTTP exacto**: éxito `200` (con narración o `[ABIERTO]`); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `narrador-estados.narrar.response` y emite `contabilidad.narracion`.

### 1. `narrar` — plantilla declarada sobre los estados reales

```json
{
  "project_id": "e57a318a-...",
  "balance": { "activo": 42000, "pasivo": 18000, "patrimonio": 24000 },
  "resultado": { "ingresos": 31000, "gastos": 28000, "resultado": 3000 },
  "plantillas": [ { "estado": "resultado", "frase": "En el periodo has tenido un resultado de {{resultado}} EUR." } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "narracion": "En el periodo has tenido un resultado de 3000 EUR.",
  "estados_narrados": ["balance", "resultado"],
  "balance": { "activo": 42000, "pasivo": 18000, "patrimonio": 24000 },
  "resultado": { "ingresos": 31000, "gastos": 28000, "resultado": 3000 },
  "faltan": [],
  "origen": "plantilla",
  "confianza": 1,
  "estima": false,
  "decide": false,
  "abierto": { "balance": null, "resultado": null }
}
```

Emite `contabilidad.narracion` (lo consume la entrega al negocio R1):

```json
{ "project_id": "e57a318a-...", "narracion": "En el periodo has tenido un resultado de 3000 EUR.", "origen": "plantilla", "estados_narrados": ["balance", "resultado"], "faltan": [], "correlation_id": "abc-123" }
```

### 2. `narrar` — sin plantilla → el juicio fuzzy narra (solo con las cifras reales)

Ninguna plantilla cubre → `llm.complete.request` con el guion + los estados. Si devuelve
`puede:true` y una narración → `narracion:<párrafo>`, `origen:'juicio'`, `confianza`. **Narra SOLO
lo que hay.**

### 3. `narrar` — un estado ausente → se declara, no se rellena

Sin `resultado` (y C2 sin responder) → `faltan:['resultado']`, `abierto.resultado` declarando el
hueco; la narración se compone **sin él** (con las plantillas del balance o el juicio). **NUNCA
ESTIMA NI ADORNA.**

### 4. `narrar` — sin ningún estado → `[ABIERTO]` (no se adorna el vacío)

Sin balance ni resultado (C1 y C2 sin responder) → `narracion:null`,
`faltan:['balance','resultado']`, `motivo` declarado. Emite el evento con `narracion:null`.

### 5. `narrar` — ni plantilla ni juicio válido → `[ABIERTO]`

Con estados pero sin plantilla aplicable y con el juicio fallando o incumpliendo el contrato →
`narracion:null`, `faltan` con lo ausente, `motivo:'no se pudo narrar con honestidad...'`. **Se
declara el hueco en vez de adornar.**

### 6. Fallo — falta `project_id`

```json
{ "periodo": "2026-09" }
```

Respuesta `400` + `narrador-estados.narrar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/narrador-estados.test.js`. Cubre:

- Una **plantilla declarada** cuyo estado existe → narración por **reflejo**
  (`origen:'plantilla'`, `confianza:1`) y **emite** `contabilidad.narracion`.
- Una plantilla cuyo estado **no existe** → **NO se aplica** (no se narra lo ausente).
- Un marcador `{{campo}}` de una clave ausente **deja el marcador tal cual** (se ve que falta).
- Ninguna plantilla cubre → juicio fuzzy (`llm.complete.request`); una narración válida se acepta
  (`origen:'juicio'`); una propuesta que no cumple el contrato se rechaza.
- **Sin plantilla ni juicio válido** → `narracion:null`, `motivo` declarado (**no se adorna**).
- **Sin ningún estado** (ni balance C1 ni resultado C2) → `narracion:null`,
  `faltan:['balance','resultado']` (**no se adorna el vacío**).
- Un estado ausente → `faltan` con ese estado y el `abierto` correspondiente (**se declara, no se
  rellena**).
- El balance y el resultado, si no vienen declarados, se **PIDEN a sus dueños** (`balance-situacion`
  C1, `cuenta-resultados` C2) **POR EVENTO**; **no se recalculan**.
- `estima:false` y `decide:false` **siempre**; ninguna llamada persiste ni muta (stateless).
- `project_id` ausente → `400 INVALID_INPUT` + `.narrar.failed`.
- `toolNarrar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `NarradorEstados extends ModuloHibridoReflejo`; `name = 'narrador-estados'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (MICRO-AGENTE stateless). `blueprint_driven:true`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/narrador-estados/`).
- Constante `GUION_NARRAR` — guion-prompt self-contained (las **reglas de hierro**: narrar solo lo
  que hay; no estimar ni adornar lo ausente; no decidir por el dueño). `_narrarReflejo` es el
  reflejo determinista; `_concluir`/`_parse`/`_narracionDe` el fuzzy.
- `onNarrarRequest` usa `this._atender(e, 'narrar', 'narrador-estados.narrar.response',
  async (d) => {...})` con cierre de círculo (evento de dominio en `200` — con narración o
  `[ABIERTO]` —, par `failed` si no). `onUnload` delega en `super`.
- Proyección única `_narrar(input)` (**async**: pide los estados a C1/C2 y/o consulta el LLM por
  evento); helpers `_salida`, `_narrarReflejo`, `_rellenar`, `_concluir`, `_parse`, `_narracionDe`,
  `_balance`, `_resultado`, `_narrados`, `_plantillas`. Tool `toolNarrar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: **pide** `balance-situacion.calcular.request` (C1) y `cuenta-resultados.calcular.request`
  (C2) por EVENTO (los estados de sus dueños) y `llm.complete.request` (el juicio que narra).
  Publica `contabilidad.narracion`, que lo consume la entrega al negocio (R1) para el informe del
  cliente.
- **NARRA LO QUE HAY**: cada cifra sale de un **estado REAL**; lo ausente se **declara**
  (`faltan`, `abierto`); **NUNCA ESTIMA NI ADORNA** (`estima:false`); **la narración no decide**
  (`decide:false`).
