---
name: onboarding-negocio
description: >
  Skill FULL del módulo CUSTODIO `onboarding-negocio` de la vertical contabilidad de Enki.
  El alta de un negocio nuevo y su aislamiento multi-tenant — recoge los datos declarables
  (plan, fuentes, parámetros) sin inferir nada ni heredar de otro negocio, y emite por evento
  la activación de la vertical. Persiste por proyecto con PosPersistencia. Úsala para operar,
  depurar o extender el custodio, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites dar de alta un negocio nuevo (RPC onboarding-negocio.recoger.request) o
    leer su configuración declarada (RPC onboarding-negocio.leer.request).
  - Cuando depures por qué un alta se rechaza (403 PERMISSION_DENIED por rol distinto de
    ALTA_NEGOCIO o por parcela ajena, 400 INVALID_INPUT si falta project_id) o por qué una
    clave sale `valor:null` con `opcion.some:false` (no declarada: `[ABIERTO]`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del custodio (un negocio no se fuga a otro, un solo escritor, nada se hereda, la
    plataforma se consume por evento, persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio onboarding-negocio.
tags: [enki, modulo, custodio, contabilidad, onboarding-negocio]
---

# onboarding-negocio — CUSTODIO CON PERSISTENCIA del alta multi-negocio

## Qué hace el módulo

`onboarding-negocio` es un **CUSTODIO CON PERSISTENCIA** (K1, hoja del plan): **LA PUERTA DE
ENTRADA DE CADA NEGOCIO** (multi-tenant). Aquí se da de alta un negocio nuevo **RECOGIENDO**
sus datos **DECLARABLES** — el plan contable, las fuentes de hechos, los parámetros del negocio
— y se **AISLA** su parcela: **lo de un negocio no se fuga a otro**.

Atributos del diseño: `config:Map<Clave,Valor>`.
Métodos: `recoger(negocio, datos)`, `leer(clave):Opcion<Valor>`. Regla: **recoge los datos
declarables del negocio nuevo (plan, fuentes, parámetros). UN escritor.**

**LOS DATOS SON DECLARABLES Y NADA SE ESTIMA**: el plan, las fuentes y los parámetros entran
como **DATO declarado** por quien da de alta el negocio. Una clave que no llega **NO existe**:
queda `[ABIERTO]` con su valor `null` y se declara en `abierto` — **jamás se rellena con un
valor por defecto, ni se hereda de otro negocio** (heredar sería una fuga y una invención a la
vez).

**LA PLATAFORMA SE CONSUME POR EVENTO, NUNCA POR require**: la existencia del proyecto se
comprueba y se **LIGA** pidiéndosela a `project-manager` **POR EVENTO** (`project.get.request`,
best-effort). Si `project-manager` no responde, el alta sigue siendo **DECLARADA**
(`proyecto_verificado:false`) — **no se finge la verificación ni se inventa el proyecto**.

**ALTA EFECTIVA → EMITE LA ACTIVACIÓN DE LA VERTICAL POR EVENTO**: al quedar el negocio dado de
alta (plan y fuentes declarados) se publica `contabilidad.negocio_onboarded`, que consume
`activacion-vertical` (K4). Este módulo **NO enciende nada por su cuenta**: declara el alta y
emite; **quien enciende es K4**.

**AISLAMIENTO POR NEGOCIO** (invariante dura «un negocio no se fuga a otro»): cada negocio
tiene **SU** parcela; `leer` devuelve solo lo de ese negocio y quien declare **otro** negocio
como solicitante → **403** (aislamiento negocio↔negocio). Sin negocio declarado se toma el
propio `project_id` (en Enki cada cliente/negocio **ES** un proyecto) y se declara el origen —
**nunca una parcela huérfana**.

**UN SOLO ESCRITOR**: solo el alta (rol `ALTA_NEGOCIO`) recoge datos; cualquier otro rol es
rechazado (**segundo escritor → 403**). `leer` es **LECTURA** y no muta.

**`recoger` es UPSERT declarativo por negocio**: la misma clave **ACTUALIZA** (el alta corrige)
y **apila** en historial; una declaración parcial **no borra** lo ya declarado.

Invariantes:

- **El ALTA DECIDE Y DECLARA**: nada se infiere; dato ausente → `[ABIERTO]`.
- **Un negocio no se fuga a otro** (guard de aislamiento en las **dos** ops).
- **LEY/PARÁMETRO COMO DATO**: el plan, las fuentes y los parámetros son entrada; cero
  constantes.
- **Persiste por proyecto** con `PosPersistencia`
  (`/contabilidad/onboarding-negocio/onboarding-negocio.json`), **restaura** en
  `project.activated` y **vuelca** en `onUnload`.

Proyecciones `_recoger` (escritura + guards) y `_leer` (lectura, no muta). Publica
`contabilidad.negocio_onboarded`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `onboarding-negocio.recoger.request` | `onRecogerRequest` | RPC custodio (UN escritor, alta multi-tenant): {project_id, rol:'ALTA_NEGOCIO', negocio?, datos:{plan?, fuentes?, parametros?, licencia?, ...extra}} → {project_id, negocio, config:{negocio, plan, fuentes, parametros, licencia, extra, estado:'ALTA'\|'EN_ALTA', claves_abiertas, historial}, alta, actualizado, alta_efectiva, proyecto_verificado, fuente_plataforma, abierto, faltan, aislado}. Declara los datos del negocio nuevo (nada se estima ni se hereda de otro negocio: ausente → null y [ABIERTO]); liga el proyecto consultando project-manager POR EVENTO (best-effort; si no responde proyecto_verificado:false, no se finge); alta efectiva (plan y fuentes declarados) → publica contabilidad.negocio_onboarded (lo consume activacion-vertical K4). GUARD de aislamiento: solicitante_negocio de otro negocio → 403; rol distinto de ALTA_NEGOCIO → 403. Exito → responde por onboarding-negocio.recoger.response; fallo → onboarding-negocio.recoger.failed. |
| `onboarding-negocio.leer.request` | `onLeerRequest` | RPC custodio (LECTURA, no muta): {project_id, negocio?, solicitante_negocio?, clave?} → {project_id, negocio, clave, valor, opcion:{some, valor}, config, declarado, abierto, faltan, aislado} (o, sin clave, la configuracion COMPLETA de ESE negocio). Devuelve Opcion<Valor>: una clave no declarada → opcion vacia, valor null y abierto:true (nunca un valor por defecto). GUARD de aislamiento: leer la parcela de otro negocio → 403 PERMISSION_DENIED (un negocio no ve otro). Responde por onboarding-negocio.leer.response; fallo → onboarding-negocio.leer.failed. |
| `project.activated` | `onProjectActivated` | Restaura las parcelas de alta del proyecto activado desde el storage (PosPersistencia), para que el aislamiento multi-negocio y los datos declarados del negocio sigan vivos tras un reinicio. |

### Publishes

| Evento | Descripción |
|---|---|
| `onboarding-negocio.recoger.response` | Respuesta RPC correlada de onboarding-negocio.recoger.request → {request_id, status:200, data:{config, alta, alta_efectiva, abierto, faltan, aislado}}. Emitida por el helper _atender. |
| `onboarding-negocio.recoger.failed` | Par de fallo determinista (K1): project_id ausente (INVALID_INPUT), segundo escritor (PERMISSION_DENIED → 403) o parcela ajena (PERMISSION_DENIED → 403) → {status, error:{code, message, details?}}. Cierra el circulo de onboarding-negocio.recoger.request. |
| `onboarding-negocio.leer.response` | Respuesta RPC correlada de onboarding-negocio.leer.request → {request_id, status:200, data:{valor, opcion, declarado, abierto, faltan}}. Emitida por el helper _atender. |
| `onboarding-negocio.leer.failed` | Par de fallo determinista (K1): project_id ausente o lectura de parcela ajena (un negocio no ve otro → 403) → {status, error:{code, message, details?}}. Cierra el circulo de onboarding-negocio.leer.request. |
| `contabilidad.negocio_onboarded` | Fire-and-forget (K1): un negocio quedo dado de alta (plan y fuentes declarados) → {project_id, negocio, config, plan, fuentes, parametros, abierto, faltan, correlation_id}. Es la ACTIVACION DE LA VERTICAL por evento: lo consume activacion-vertical (K4), que es quien enciende; onboarding-negocio solo declara el alta y emite. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `onboarding-negocio.recoger.failed` cierra el círculo de
> `onboarding-negocio.recoger.request` (rol distinto de `ALTA_NEGOCIO` o parcela ajena `403`,
> o `project_id` ausente `400`) y `onboarding-negocio.leer.failed` cierra el de
> `onboarding-negocio.leer.request` (`project_id` ausente `400` o parcela ajena `403`).

> Nota de honestidad (cruce con `index.js`): `onRecogerRequest` publica
> `contabilidad.negocio_onboarded` **solo si `res.status === 200` Y `res.data.alta_efectiva`**
> (con el payload `{project_id, negocio, config, plan:config.plan ?? null, fuentes:
> config.fuentes ?? null, parametros:config.parametros ?? null, abierto, faltan,
> correlation_id}`); la rama `else` publica `onboarding-negocio.recoger.failed`.
> `onLeerRequest` publica `onboarding-negocio.leer.failed` solo si `status !== 200`.
> `onProjectActivated` **no** usa `_atender`: llama directo a
> `this._persist.restaurar(d.project_id)`.

> Nota: el módulo consulta `project.get.request` a `project-manager` **POR EVENTO** (nunca por
> `require`), best-effort con `timeout_ms:4000` — dependencia saliente que **no figura en
> `module.json`**. Tampoco figuran `_guardEscritor`, `_guardAislamiento`, `_negocio`,
> `_verificarProyecto`, `_obtenerOCrear`, `_clave` ni `configDe`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **GUARD de escritor** (`_guardEscritor`): `_recoger` exige `input.rol === 'ALTA_NEGOCIO'`
   (constante `ROL_ESCRITOR`). Cualquier otro rol → `403 PERMISSION_DENIED` con
   `{rol_esperado:'ALTA_NEGOCIO', rol_recibido:<rol ?? null>}` y el mensaje `'solo el alta del
   negocio (ALTA_NEGOCIO) recoge los datos declarables'`. **El segundo escritor no espera ni
   hace cola.**
3. **La CLAVE del negocio** (`_negocio`): `_clave(input.negocio ?? input.negocio_id)`; si es
   `null` se toma `_clave(pid)` (en Enki cada cliente/negocio **es un proyecto**) y se declara
   el origen (`'declarado'` / `'project_id'`). **Nunca una parcela huérfana.**
4. **GUARD de aislamiento** (`_guardAislamiento`): `solicitante_negocio` distinto del `negocio`
   → `403 PERMISSION_DENIED` con `{negocio: solicitante, parcela: negocio, aislamiento:
   'negocio↔negocio'}` y el mensaje `'un negocio no ve otro negocio: la parcela de alta
   pertenece a otro negocio'`. **Se aplica en `_recoger` Y en `_leer`.**
5. **Los DATOS declarados** (`_recoger`): `input.datos` objeto, o `input` si no.
6. **Las CLAVES CONOCIDAS del molde** (`CLAVES_CONOCIDAS = ['plan','fuentes','parametros']`):
   cada una se toma **declarada** si tiene valor (no `undefined`/`null`/`''`/array vacío); si
   no, se **conserva** lo ya declarado (una declaración parcial **no borra**) o queda `null` y
   se apila en `claves_abiertas`. **Solo los NOMBRES del molde — ningún valor cableado,
   ningún default.** **Nada se hereda de otro negocio.**
7. **`licencia`** (K8 `[ABIERTO]`): declarable; ausente → `null` (**no se inventa**).
8. **Claves EXTRA**: todo campo declarado que no sea de control (`project_id`, `rol`,
   `negocio`, `negocio_id`, `solicitante_negocio`, `datos`, `correlation_id`, `request_id`) ni
   del molde ni `licencia` se recoge en `config.extra` **tal cual, sin molde cerrado**.
9. **Estado e historial**: `estado = claves_abiertas.length === 0 ? 'ALTA' : 'EN_ALTA'`;
   `alta_por:'ALTA_NEGOCIO'`; `alta_en` sellado la primera vez; `updated_at:ahora`; **se
   appendea** a `historial` `{estado, claves_abiertas, por:'ALTA_NEGOCIO', en:ahora}` —
   **nada se borra en silencio**.
10. **La PLATAFORMA por EVENTO** (`_verificarProyecto`): `project.get.request` a
    `project-manager` (`{project_id}`, `timeout_ms:4000`); sin respuesta →
    `{verificado:false, nombre:null, fuente:null}`; con respuesta →
    `{verificado:true, nombre: proyecto.name, fuente:'project-manager'}` (**no se finge la
    verificación**).
11. **ALTA EFECTIVA**: cuando `plan` y `fuentes` están declarados (`minimo = ['plan',
    'fuentes']`) → `alta_efectiva:true` y se publica `contabilidad.negocio_onboarded` (lo
    consume K4). Este módulo **no enciende nada**: declara el alta y emite.
12. **La respuesta de `_recoger`**: `{project_id, negocio, config, alta: !yaEstaba,
    actualizado: yaEstaba, alta_efectiva, proyecto_verificado, fuente_plataforma, abierto:
    claves_abiertas.length > 0, faltan: claves_abiertas, aislado:true, motivo}` — con el
    motivo `'el alta queda [ABIERTO]: el negocio no ha declarado <claves> (nada se estima ni se
    hereda de otro negocio)'` si hay claves abiertas.
13. **`_leer` (LECTURA, no muta)**:
    - Negocio no dado de alta → `200` con `valor:null`, `opcion:null`, `declarado:false`,
      `config:null`, `abierto:true`, `faltan:['alta']` y `motivo:'el negocio no esta dado de
      alta: no hay configuracion que leer'`.
    - **Sin `clave`** → la configuración **COMPLETA de ESE negocio**: `valor:config,
      opcion:{some:true, valor:config}, declarado:  estado === 'ALTA', abierto: config.abierto
      no vacío, faltan: config.abierto, aislado:true`.
    - **Con `clave`** → `valor = config[clave] ?? config.extra[clave]`;
      `opcion:{some: declarado, valor: declarado ? valor : null}`; `declarado` si no es
      `undefined`/`null`; `faltan:[clave]` si no. **Ausente = opción vacía, NO un valor por
      defecto.**
14. **La parcela** (`_obtenerOCrear`): `{esquema:'contabilidad-onboarding-negocio-v1',
    negocios: Map<negocio_id, Config>}`. Store `this._parcelas = Map<project_id, Parcela>`.
15. **`_clave(v)`**: `null`/`''` → `null`; objeto → `v.id ?? v.clave ?? v.nombre ?? v.negocio`
    (recursivo); si no → `String(v)`. **La identidad del negocio es DATO declarado.**
16. **Persistencia (CUSTODIO)**: `PosPersistencia` con `file:'onboarding-negocio.json'`,
    `dir:'/contabilidad/onboarding-negocio'`, esquema `'contabilidad-onboarding-negocio-v1'`;
    `snapshot` vuelca `[...negocios.values()]`; `hidratar` reconstruye el `Map` por `negocio`.
    `project.activated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
    **`marcarDirty(pid)`** en cada escritura.
17. **HTTP exacto**: éxito `200`; rol distinto de `ALTA_NEGOCIO` o parcela ajena →
    `403 PERMISSION_DENIED`; `project_id` ausente → `400 INVALID_INPUT`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `onboarding-negocio.recoger.response` y `onboarding-negocio.leer.response`; emite
`contabilidad.negocio_onboarded`.

### 1. `recoger` — el alta declarada del negocio

```json
{
  "project_id": "e57a318a-...",
  "rol": "ALTA_NEGOCIO",
  "negocio": "NEGOCIO-A",
  "solicitante_negocio": "NEGOCIO-A",
  "datos": {
    "plan": { "cuentas": ["100", "400", "572"] },
    "fuentes": [ { "tipo": "banco", "origen": "CSV" } ],
    "parametros": { "moneda": "EUR", "ejercicio": "2026" },
    "licencia": "BASICA"
  },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "negocio": "NEGOCIO-A",
  "config": {
    "negocio": "NEGOCIO-A",
    "proyecto": "e57a318a-...",
    "plan": { "cuentas": ["100", "400", "572"] },
    "fuentes": [ { "tipo": "banco", "origen": "CSV" } ],
    "parametros": { "moneda": "EUR", "ejercicio": "2026" },
    "licencia": "BASICA",
    "extra": {},
    "estado": "ALTA",
    "alta_por": "ALTA_NEGOCIO",
    "alta_en": "2026-09-30T...",
    "updated_at": "2026-09-30T...",
    "claves_abiertas": [],
    "abierto": [],
    "historial": [ { "estado": "ALTA", "claves_abiertas": [], "por": "ALTA_NEGOCIO", "en": "2026-09-30T..." } ],
    "proyecto_verificado": true,
    "proyecto_nombre": "Mi negocio"
  },
  "alta": true,
  "actualizado": false,
  "alta_efectiva": true,
  "proyecto_verificado": true,
  "fuente_plataforma": "project-manager",
  "abierto": false,
  "faltan": [],
  "aislado": true,
  "motivo": null
}
```

Emite `contabilidad.negocio_onboarded` (es la **ACTIVACIÓN DE LA VERTICAL por evento**; lo
consume `activacion-vertical` K4, que es quien enciende):

```json
{ "project_id": "e57a318a-...", "negocio": "NEGOCIO-A", "config": { "...": "..." }, "plan": { "cuentas": ["100", "400", "572"] }, "fuentes": [ { "tipo": "banco", "origen": "CSV" } ], "parametros": { "moneda": "EUR", "ejercicio": "2026" }, "abierto": false, "faltan": [], "correlation_id": "abc-123" }
```

### 2. `recoger` — declaración parcial queda `[ABIERTO]` (nada se hereda)

```json
{ "project_id": "e57a318a-...", "rol": "ALTA_NEGOCIO", "negocio": "NEGOCIO-B", "datos": { "plan": { "cuentas": ["100"] } } }
```

`200` con `config.fuentes:null`, `config.parametros:null`, `estado:'EN_ALTA'`,
`claves_abiertas:["fuentes","parametros"]`, `alta_efectiva:false`, `abierto:true` y el `motivo`
(**no se hereda de otro negocio**). **No se emite `contabilidad.negocio_onboarded`.**

### 3. `leer` — la configuración completa de ESE negocio (no muta)

```json
{ "project_id": "e57a318a-...", "negocio": "NEGOCIO-A", "solicitante_negocio": "NEGOCIO-A" }
```

`200` con `valor:config`, `opcion:{some:true, valor:config}`, `declarado:true`,
`faltan:[...]`, `aislado:true`.

### 4. `leer` — una clave no declarada → opción vacía

```json
{ "project_id": "e57a318a-...", "negocio": "NEGOCIO-A", "solicitante_negocio": "NEGOCIO-A", "clave": "licencia" }
```

Sin declarar → `200` con `valor:null`, `opcion:{some:false, valor:null}`, `declarado:false`,
`abierto:true`, `faltan:["licencia"]` (**nunca un valor por defecto**).

### 5. `leer` — parcela ajena → 403 (un negocio no ve otro)

```json
{ "project_id": "e57a318a-...", "negocio": "NEGOCIO-B", "solicitante_negocio": "NEGOCIO-A" }
```

Respuesta `403` + `onboarding-negocio.leer.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "un negocio no ve otro negocio: la parcela de alta pertenece a otro negocio", "details": { "negocio": "NEGOCIO-A", "parcela": "NEGOCIO-B", "aislamiento": "negocio↔negocio" } } }
```

### 6. Fallo — rol inválido (segundo escritor)

Respuesta `403` + `onboarding-negocio.recoger.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el alta del negocio (ALTA_NEGOCIO) recoge los datos declarables", "details": { "rol_esperado": "ALTA_NEGOCIO", "rol_recibido": "OTRO" } } }
```

### 7. Fallo — falta `project_id`

Respuesta `400 INVALID_INPUT` con `{field:'project_id'}` + el par `failed` correspondiente
(`.recoger.failed` o `.leer.failed`).

## Tests

El test unitario de la vertical vive en `tests/unit/onboarding-negocio.test.js`. Cubre:

- `recoger` con rol `ALTA_NEGOCIO` y plan+fuentes declarados → `200 {alta:true,
  alta_efectiva:true}` y emite `contabilidad.negocio_onboarded`.
- Otro rol → `403 PERMISSION_DENIED` + `onboarding-negocio.recoger.failed`.
- Parcela ajena (`solicitante_negocio` distinto) → `403` en `recoger` **y** en `leer`
  (aislamiento negocio↔negocio).
- Sin `project_id` → `400 INVALID_INPUT`.
- Declaración parcial → `estado:'EN_ALTA'`, `claves_abiertas`, `abierto:true` (**nada se
  hereda de otro negocio**); `alta_efectiva:false` (**no se emite la activación**).
- `leer` sin clave → la configuración **COMPLETA de ESE negocio (solo de ese)**.
- `leer` una clave no declarada → `valor:null`, `opcion.some:false`, `abierto:true`
  (**nunca un valor por defecto**).
- `project-manager` (por evento) no responde → `proyecto_verificado:false`,
  `fuente_plataforma:null` (**no se finge la verificación**).
- Re-`recoger` la misma clave → `actualizado:true`, el historial **crece** y una declaración
  parcial **no borra** lo declarado.
- `project.activated` restaura las parcelas vía PosPersistencia; `configDe(pid, negocio)` lee
  sin mutar.
- `toolRecoger` / `toolLeer` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `OnboardingNegocio extends ModuloHibridoReflejo`; `name = 'onboarding-negocio'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._parcelas`
  (`Map<project_id, {esquema, negocios: Map<negocio, Config>}>`). Esquema
  `'contabilidad-onboarding-negocio-v1'`.
- Constantes: `ROL_ESCRITOR = 'ALTA_NEGOCIO'` y `CLAVES_CONOCIDAS = ['plan','fuentes',
  'parametros']` (solo los **NOMBRES** del molde).
- Requiere `../../_shared/modulo-hibrido-reflejo` y `../../_shared/pos-persistencia` (DOS
  niveles desde `modules/contabilidad-analitica/onboarding-negocio/`).
- **PosPersistencia**: `_persist = new PosPersistencia({modulo,
  file:'onboarding-negocio.json', dir:'/contabilidad/onboarding-negocio', snapshot, hidratar})`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`;
  `marcarDirty(pid)` en cada escritura.
- `onRecogerRequest` → `_atender(e, 'recoger', 'onboarding-negocio.recoger.response', ...)` con
  cierre de círculo (evento de dominio en `200` con `alta_efectiva`, par `failed` si no);
  `onLeerRequest` → `_atender(e, 'leer', 'onboarding-negocio.leer.response', ...)`.
- Proyecciones `_recoger` (async: consulta `project-manager` por evento + guards de escritor y
  aislamiento) y `_leer` (lectura, guard de aislamiento, no muta); helpers `_guardEscritor`,
  `_guardAislamiento`, `_negocio`, `_verificarProyecto`, `_obtenerOCrear`; lectura directa
  `configDe(pid, negocio)`. Tools `toolRecoger` / `toolLeer`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- **DEP**: consume `project-manager` **POR EVENTO** (`project.get.request`), **nunca por
  `require`**; emite `contabilidad.negocio_onboarded`, que consume `activacion-vertical` (K4)
  — **este módulo no enciende nada por su cuenta**.
- **PARÁMETRO COMO DATO**: plan, fuentes, parámetros y licencia son **declarables por negocio**;
  el código **no infiere ningún valor** y **no hereda de otro negocio**. **UN NEGOCIO NO SE
  FUGA A OTRO**: guard de aislamiento en las dos ops.
