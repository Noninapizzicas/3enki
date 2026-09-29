---
name: puente-lenguaje-dueno
description: >
  Skill FULL del módulo MICRO-AGENTE `puente-lenguaje-dueno` de la vertical
  contabilidad de Enki. El TRADUCTOR BIDIRECCIONAL dueño↔contabilidad: su
  pregunta en lenguaje llano → consulta contable (a_consulta) y el cálculo →
  la MISMA cifra en su idioma (a_cifra). Traduce, NO inventa cifras: si falta el
  dato → [ABIERTO]. Primero el mapa declarado (reflejo), después el juicio fuzzy.
  Úsala para operar, depurar o extender el micro-agente, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites traducir la pregunta del dueño a tema contable (RPC
    puente-lenguaje-dueno.a_consulta.request) o el cálculo a lenguaje llano (RPC
    puente-lenguaje-dueno.a_cifra.request).
  - Cuando depures por qué la traducción sale `null` con `abierto:true` (sin mapa
    ni juicio resoluble, o cifra ausente) o por qué falta
    `project_id`/`pregunta` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del micro-agente (traduce no inventa cifras, el mapa es
    declarable, reflejo determinista y juicio declarado).
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente
    puente-lenguaje-dueno.
tags: [enki, modulo, micro-agente, contabilidad, puente-lenguaje-dueno]
---

# puente-lenguaje-dueno — MICRO-AGENTE del traductor dueño↔contabilidad

## Qué hace el módulo

`puente-lenguaje-dueno` es un **MICRO-AGENTE HÍBRIDO** (Q2, hoja del plan): el **TRADUCTOR
BIDIRECCIONAL** entre el **dueño** y la **contabilidad**:

- `a_consulta(pregunta:Lenguaje) → Consulta` — su pregunta → **consulta contable** (para que la
  ejecute la puerta pull Q1).
- `a_cifra(d:Derivado) → Lenguaje` — el cálculo → **la MISMA cifra en SU idioma** (caja, deuda,
  resultado, «¿puedo pagar X?»).

Traducir lenguaje es **JUICIO**.

Atributos del diseño: `mapa_lenguaje:ParametroDeclarable`.

> 🔴 **TRADUCE, NO INVENTA CIFRAS.** El mapa `lenguaje ↔ consulta` es **DECLARABLE**, y la
> **CIFRA** la produce su dueño (`mayor-balanza`, `cuenta-resultados`, `saldo-tesoreria`,
> `margen-analitico`, `estado-cuenta-proveedor`) **POR EVENTO**. Este puente **jamás fabrica un
> número**: si falta el dato, devuelve **`[ABIERTO]`**.

**HÍBRIDO** (patrón `etiquetado-analitico`):

- `_aConsultaReflejo` / `_fraseReflejo` — **REFLEJO determinista**: aplican el **MAPA declarado**
  (el término del dueño → tema contable; el tema → su término). Una sola respuesta.
- `_concluir` — **FUZZY**: cuando el mapa no cubre, **1 llamada** `llm.complete.request` que
  **PROPONE** la traducción (a consulta) o la frase (a cifra). Si falla o no cumple el contrato →
  **NO se inventa**: `[ABIERTO]`.

Invariantes:

- **LA CIFRA NO SE INVENTA**: en `a_cifra` el valor llega **declarado** o de su dueño **POR
  EVENTO**; si falta, se declara **`[ABIERTO]`** con lo que falta. **Jamás un número aproximado**
  (el juicio `a_cifra` **RECHAZA** una frase cuyo valor no coincida con la cifra real).
- **El mapa es DECLARABLE**: sin mapa ni juicio resoluble **NO se traduce** → `[ABIERTO]`.
- **DETERMINISTA en el reflejo**; el juicio va **declarado como tal** (`origen:'juicio'`).
- **NO escribe, NO persiste, NO decide**: **traduce** — el sistema **no decide** por el dueño.

Proyecciones `_a_consulta` y `_a_cifra`. Publica `contabilidad.consulta_traducida`. Cierra el
círculo con `puente-lenguaje-dueno.a_consulta.failed` / `puente-lenguaje-dueno.a_cifra.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `puente-lenguaje-dueno.a_consulta.request` | `onAConsultaRequest` | RPC híbrido (traducción a consulta): {project_id, pregunta, mapa_lenguaje?:[{termino,tema,cuenta,periodo}]} → {pregunta, consulta:{tema,cuenta,periodo}, termino_declarado, origen:'mapa'\|'juicio', confianza, decide:false, abierto, faltan, motivo}. Traduce la pregunta del dueño al TEMA contable declarado (reflejo: el mapa) o con juicio fuzzy; sin mapa ni juicio resoluble → [ABIERTO] (no adivina qué pregunta el dueño). Éxito → publica contabilidad.consulta_traducida y responde por puente-lenguaje-dueno.a_consulta.response; pregunta/project_id ausente → puente-lenguaje-dueno.a_consulta.failed. |
| `puente-lenguaje-dueno.a_cifra.request` | `onACifraRequest` | RPC híbrido (traducción a cifra): {project_id, derivado:{valor\|cifra\|importe, unidad, tema, periodo}\|valor, termino?, tema?, mapa_lenguaje?} → {derivado, traduccion:{frase, valor, unidad, termino}, cifra, cifra_disponible, fuente_cifra, origen, inventa_cifra:false, decide:false, abierto, faltan, motivo}. Expresa la MISMA cifra en lenguaje llano (reflejo por término declarado o juicio fuzzy); el valor de la frase ES el valor real — sin cifra (ni declarada ni de su fuente) → [ABIERTO], nunca se inventa. Éxito → publica contabilidad.consulta_traducida y responde por puente-lenguaje-dueno.a_cifra.response; project_id ausente → puente-lenguaje-dueno.a_cifra.failed. |
| `contabilidad.respuesta_consulta` | `onRespuestaConsulta` | Fire-and-forget (Q1 → Q2): consulta-cuentas-bajo-demanda publicó la respuesta a la pregunta del dueño → se traduce a su lenguaje con a_cifra (la cifra ES la de la respuesta; si viene vacía, [ABIERTO]). Tolerante: sin project_id se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `puente-lenguaje-dueno.a_consulta.response` | Respuesta RPC correlada de puente-lenguaje-dueno.a_consulta.request → {request_id, status:200, data:{consulta, origen, mapa_disponible, decide:false, abierto, faltan}}. Emitida por el helper _atender. |
| `puente-lenguaje-dueno.a_consulta.failed` | Par de fallo determinista (Q2): pregunta o project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de puente-lenguaje-dueno.a_consulta.request. |
| `puente-lenguaje-dueno.a_cifra.response` | Respuesta RPC correlada de puente-lenguaje-dueno.a_cifra.request → {request_id, status:200, data:{traduccion, cifra, cifra_disponible, fuente_cifra, inventa_cifra:false, decide:false, abierto, faltan}}. Emitida por el helper _atender. |
| `puente-lenguaje-dueno.a_cifra.failed` | Par de fallo determinista (Q2): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de puente-lenguaje-dueno.a_cifra.request. |
| `contabilidad.consulta_traducida` | Fire-and-forget (Q2): una traducción quedó hecha en cualquiera de las dos direcciones → {project_id, direccion:'a_consulta'\|'a_cifra', traduccion, origen:'mapa'\|'juicio', cifra_disponible, correlation_id}. Lo consumen la puerta pull (Q1) y el sello de cobertura (Q3). NO implica escritura ni decisión: solo la traducción. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `puente-lenguaje-dueno.a_consulta.failed` cierra el círculo de
> `puente-lenguaje-dueno.a_consulta.request` (cuando falta `pregunta` o `project_id`, `400`) y
> `puente-lenguaje-dueno.a_cifra.failed` el de `puente-lenguaje-dueno.a_cifra.request` (cuando
> falta `project_id`, `400`).

> Nota de honestidad (cruce con `index.js`): `onAConsultaRequest` y `onACifraRequest` publican
> `contabilidad.consulta_traducida` **siempre que su proyección devuelve `200`** — lo que **incluye
> las vías `[ABIERTO]`** (sin mapa ni juicio resoluble / sin cifra), en las que el evento viaja con
> `traduccion:null`. El evento declara `direccion` (`'a_consulta'` o `'a_cifra'`) y, en la vía a
> cifra, `cifra_disponible`. La rama `else` publica el par `failed` correspondiente.

> Nota de sub-declaración (cruce con `index.js`): **no están en `module.json` pero sí los emite
> `index.js`**:
> - el RPC saliente en `_concluir`: `llm.complete.request` (`{system: GUION_A_CONSULTA|GUION_A_CIFRA,
>   messages, tools:[], settings:{temperature:0.2}}`, `timeout_ms:30000`) — **DEP por evento**;
> - el RPC saliente en `_cifra` (cuando el valor no viene declarado): `saldo-tesoreria.calcular.request`,
>   `mayor-balanza.saldos.request` o `cuenta-resultados.calcular.request` según el tema
>   (`timeout_ms:4000`) — **DEP por evento** (la cifra de su dueño).

> Nota: el micro-agente expone solo las tools `toolAConsulta` y `toolACifra`; tampoco figuran
> `_aConsultaReflejo`, `_fraseReflejo`, `_consulta`, `_traduccion`, `_cifra`, `_fuenteDe`, `_mapa`,
> `_termino`, `_concluir`, `_parse`, `_consultaDe`, `_fraseDe`, `_temas`, `_num` (internos).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **`a_consulta` — la pregunta es obligatoria**: `input.pregunta` o `input.texto`; ausente →
   `400 INVALID_INPUT` (`field:'pregunta'`).
3. **`a_consulta` — REFLEJO primero** (`_aConsultaReflejo`): recorre el **mapa declarado** y, para
   cada entrada, si el texto contiene el `termino` (en minúsculas, o es igual al término) y hay
   `tema`, devuelve `{tema, cuenta, periodo, termino_declarado}`. **La primera coincidencia gana.**
   → `origen:'mapa'`, `confianza:1`.
4. **`a_consulta` — FUZZY después** (`_concluir(GUION_A_CONSULTA, {pregunta, mapa_lenguaje})`):
   `_consultaDe` valida: `puede === true` y `tema` no vacío; **si el mapa declara temas, la
   propuesta debe pertenecer a ellos** (**no inventa tema**); `confianza` numérica en `[0,1]` o
   `null`. → `origen:'juicio'`.
5. **`a_consulta` — ni mapa ni juicio** → `[ABIERTO]`: `consulta:null`, `origen:null`,
   `faltan:['traduccion']`, `motivo` («el puente no inventa qué pregunta el dueño»).
6. **`a_consulta` — la respuesta** (`_consulta`): `{project_id, pregunta, consulta:{tema, cuenta,
   periodo}, termino_declarado, origen, confianza, mapa_disponible, decide:false, abierto}`.
   **`decide:false`**: la puerta que la ejecuta es Q1; aquí solo se **traduce** la pregunta.
7. **`a_cifra` — la CIFRA** (`_cifra`), **en este orden**:
   - `input.derivado`/`input.d` con `valor` ?? `cifra` ?? `importe` no nulo → **declarada**
     (`fuente: input.origen ?? 'declarado'`).
   - `input.valor` declarado → **declarada**.
   - si no, se pide a la **fuente de su tema** **POR EVENTO** (`_fuenteDe`: `caja`→
     `saldo-tesoreria`, `saldo`→`mayor-balanza`, `resultado`→`cuenta-resultados`;
     `timeout_ms:4000`) y se toma su campo (`saldo_total`/`saldos`/`resultado`).
   - **sin valor → `disponible:false`** (jamás se inventa).
8. **`a_cifra` — sin cifra → `[ABIERTO]`**: `traduccion:null`, `cifra:null`, `cifra_disponible:false`,
   `faltan:['cifra']`, `motivo` («el puente TRADUCE, no inventa cifras»).
9. **`a_cifra` — la FRASE**: si hay `termino` declarado, el **REFLEJO** (`_fraseReflejo`) compone
   `«<termino>: <valor redondeado 2> <unidad>»` (unidad `'EUR'` por defecto) → `origen:'mapa'`. Si
   no, el **FUZZY** (`_concluir(GUION_A_CIFRA, ...)`) la redacta.
10. **`a_cifra` — el juicio NO puede inventar cifra** (`_fraseDe`): la frase no vacía y, si el LLM
    devuelve `valor`, **debe coincidir con el valor real** (`devuelto === real`); si no → `null`.
    El `valor` de la traducción es **siempre el real**; `unidad` de la cifra (o la del juicio).
11. **`a_cifra` — la respuesta** (`_traduccion`): `{project_id, derivado, traduccion:{frase, valor,
    unidad, termino}, cifra, cifra_disponible:true, fuente_cifra, origen, confianza,
    mapa_disponible, inventa_cifra:false, decide:false, abierto}`. **`inventa_cifra:false` y
    `decide:false` son constantes.**
12. **`a_cifra` — la cifra existe pero el juicio no la traduce** → `[ABIERTO]` con
    `cifra_disponible:true`, `faltan:['traduccion']`; **la cifra no se retoca**.
13. **`onRespuestaConsulta` (Q1 → Q2)**: traduce a cifra con `derivado:{cifra: d.respuesta, tema:
    d.pregunta.tema, fuente: d.fuente}`; **tolerante**: sin `project_id` se ignora. Si la cifra
    viene vacía → `[ABIERTO]`.
14. **NO ESCRIBE, NO PERSISTE, NO DECIDE**: ninguna escritura ni store en disco. Sin
    `PosPersistencia`, sin `onProjectActivated`.
15. **HTTP exacto**: éxito `200` (traducción o `[ABIERTO]`); `project_id` ausente (o `pregunta` en
    `a_consulta`) → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `puente-lenguaje-dueno.a_consulta.response` / `puente-lenguaje-dueno.a_cifra.response` y
emite `contabilidad.consulta_traducida`.

### 1. `a_consulta` — el mapa declarado traduce la pregunta llana

```json
{
  "project_id": "e57a318a-...",
  "pregunta": "¿me queda caja para la nómina?",
  "mapa_lenguaje": [ { "termino": "caja", "tema": "caja", "cuenta": null, "periodo": "2026-09" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (por mapa):

```json
{
  "project_id": "e57a318a-...",
  "pregunta": "¿me queda caja para la nómina?",
  "consulta": { "tema": "caja", "cuenta": null, "periodo": "2026-09" },
  "termino_declarado": "caja",
  "origen": "mapa",
  "confianza": 1,
  "mapa_disponible": true,
  "decide": false,
  "abierto": { "consulta": null }
}
```

Emite `contabilidad.consulta_traducida` con `direccion:'a_consulta'`.

### 2. `a_cifra` — la cifra REAL expresada en lenguaje llano

```json
{
  "project_id": "e57a318a-...",
  "derivado": { "valor": 3421.75, "unidad": "EUR", "tema": "caja", "periodo": "2026-09" },
  "termino": "caja",
  "correlation_id": "abc-124"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "derivado": { "valor": 3421.75, "unidad": "EUR", "tema": "caja", "periodo": "2026-09" },
  "traduccion": { "frase": "caja: 3421.75 EUR", "valor": 3421.75, "unidad": "EUR", "termino": "caja" },
  "cifra": { "valor": 3421.75, "unidad": "EUR", "periodo": "2026-09", "tema": "caja" },
  "cifra_disponible": true,
  "fuente_cifra": "declarado",
  "origen": "mapa",
  "inventa_cifra": false,
  "decide": false,
  "abierto": { "traduccion": null }
}
```

**El valor de la frase ES el valor real** (`inventa_cifra:false`). Emite
`contabilidad.consulta_traducida` con `direccion:'a_cifra'` y `cifra_disponible:true`.

### 3. `a_cifra` — sin cifra → `[ABIERTO]` (traduce, no inventa)

Sin valor declarado ni fuente que responda → `traduccion:null`, `cifra_disponible:false`,
`faltan:["cifra"]`, `motivo` («el puente TRADUCE, no inventa cifras»).

### 4. `a_consulta` — ni mapa ni juicio → `[ABIERTO]`

`consulta:null`, `origen:null`, `faltan:["traduccion"]`. **No se adivina qué pregunta el dueño.**

### 5. Fallo — falta `project_id` (o `pregunta` en `a_consulta`)

```json
{ "pregunta": "¿me queda caja?" }
```

Respuesta `400` + `puente-lenguaje-dueno.a_consulta.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/puente-lenguaje-dueno.test.js`. Cubre:

- `a_consulta` con `mapa_lenguaje` que cubre → `200 {origen:'mapa', termino_declarado,
  confianza:1}` y **emite** `contabilidad.consulta_traducida` (`direccion:'a_consulta'`).
- `a_consulta` sin mapa ni juicio resoluble → `[ABIERTO]` con `faltan:['traduccion']` (**no
  adivina**); una propuesta del juicio con un tema **fuera del mapa declarado** se rechaza.
- `a_cifra` con `derivado.valor` + `termino` declarado → frase por **reflejo** (`origen:'mapa'`),
  `valor` **igual al real**, `inventa_cifra:false`; emite el evento con `cifra_disponible:true`.
- `a_cifra` sin cifra (ni declarada ni de su fuente) → `[ABIERTO]` con `cifra_disponible:false`,
  `faltan:['cifra']` (**nunca se inventa**).
- `a_cifra` con juicio que devuelve un `valor` **distinto** del real → se **RECHAZA** (la frase no
  inventa cifras).
- La cifra sin valor declarado se **PIDE a su dueño** (`saldo-tesoreria`/`mayor-balanza`/
  `cuenta-resultados`) **POR EVENTO**.
- `onRespuestaConsulta` (Q1 → Q2) traduce la respuesta publicada; tolerante sin `project_id`.
- `decide:false` **siempre**; `project_id` (o `pregunta`) ausente → `400 INVALID_INPUT` + el par
  `failed` correspondiente.
- **Sin estado**: ninguna llamada persistió ni mutó; `toolAConsulta`/`toolACifra` devuelven la
  misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PuenteLenguajeDueno extends ModuloHibridoReflejo`; `name = 'puente-lenguaje-dueno'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (MICRO-AGENTE stateless). `blueprint_driven:true`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/puente-lenguaje-dueno/`).
- Constantes `GUION_A_CONSULTA` y `GUION_A_CIFRA` — guiones-prompt self-contained (el de cifra lleva
  la **regla de hierro**: **no inventar ni estimar cifras**, usar solo el valor dado). El mapa de
  fuentes por tema (`_fuenteDe`) es local a `_cifra`.
- `onAConsultaRequest` / `onACifraRequest` usan `this._atender(...)` con cierre de círculo (evento
  de dominio en `200` — traducción o `[ABIERTO]` —, par `failed` si no). `onRespuestaConsulta`
  (fire-and-forget) traduce directamente. `onUnload` delega en `super`.
- Proyecciones `_a_consulta` y `_a_cifra` (**async**: consultan el LLM y/o la fuente por evento);
  helpers `_aConsultaReflejo`, `_fraseReflejo`, `_consulta`, `_traduccion`, `_cifra`, `_fuenteDe`,
  `_mapa`, `_termino`, `_concluir`, `_parse`, `_consultaDe`, `_fraseDe`, `_temas`, `_num`. Tools
  `toolAConsulta`, `toolACifra`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `llm.complete.request` y la **fuente de la cifra** (`saldo-tesoreria`,
  `mayor-balanza`, `cuenta-resultados`) por EVENTO. Lo consumen la puerta pull (Q1) y el sello de
  cobertura (Q3) vía `contabilidad.consulta_traducida`.
- **TRADUCE, NO INVENTA**: la cifra de la frase **es** la real (`inventa_cifra:false`,
  `decide:false` constantes); sin dato → `[ABIERTO]`.
