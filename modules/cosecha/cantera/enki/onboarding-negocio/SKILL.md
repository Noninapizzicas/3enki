---
name: onboarding-negocio
description: >
  Skill FULL del módulo CUSTODIO `onboarding-negocio` de la vertical contabilidad de Enki
  (K1·K4, hoja del plan). ALTA DE UN NEGOCIO NUEVO EN LA CONTABILIDAD. Dos clases en una
  parcela: K1 OnboardingNegocio (recoge los datos DECLARABLES del negocio — plan de
  cuentas, fuentes, parámetros — un solo escritor, DUENO) y K4 ActivacionVertical
  (enciende la vertical: MECANICO, cero juicio, y SOLO si los parámetros están
  declarados). AISLAMIENTO POR NEGOCIO (invariante 13): dar de alta un negocio CREA SU
  PARCELA y la parcela queda AISLADA — ningún cálculo de un negocio lee ni escribe la de
  otro salvo consolidación DECLARADA; la dependencia con aislamiento-negocio (I4) es por
  EVENTO (contabilidad.parcela_negocio.registrar.request, contrato TOLERANTE: si I4 no
  responde el negocio queda configurado y se DECLARA que la parcela no se abrió —
  parcela_aviso, accion NO_AFIRMAR_AISLAMIENTO). SIN PARAMETROS NO SE ACTIVA: si los
  parámetros declarables están [ABIERTO], K4 responde 409 NEGOCIO_INCOMPLETO con la lista
  de lo que falta (falta:[...], marca:'ABIERTO', asumido:false, activado:false) — el hueco
  se DECLARA, no se rellena ni se asume. Persiste por proyecto vía PosPersistencia. Úsala
  para operar, depurar o extender el custodio, o para entender su contrato de eventos.
when-to-use: >
  - Cuando necesites dar de alta/configurar un negocio nuevo (RPC
    contabilidad.negocio.configurar.request), consultar su estado (contabilidad.negocio.estado.request)
    o encender su vertical (contabilidad.negocio.activar.request).
  - Cuando depures por qué se rechaza (409 ERROR_DOS_ESCRITORES si el rol no es DUENO,
    409 NEGOCIO_INCOMPLETO si faltan parámetros declarables, 404 si el negocio no está
    configurado, 503 si aislamiento-negocio I4 no confirma la parcela).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el aislamiento por
    negocio (invariante 13) y por qué un negocio incompleto no finge estar en marcha.
  - Cuando vayas a escribir/ampliar el test unitario del custodio onboarding-negocio.
tags: [enki, modulo, custodio, persistencia, contabilidad, onboarding-negocio, aislamiento, declarable]
---

# onboarding-negocio — CUSTODIO del alta de un negocio nuevo

## Qué hace el módulo

`onboarding-negocio` es un **CUSTODIO CON PERSISTENCIA** (K1·K4, hoja del plan): **ALTA DE
UN NEGOCIO NUEVO EN LA CONTABILIDAD**. Dos clases en una parcela:

- **K1 OnboardingNegocio** — recoge los datos **DECLARABLES** del negocio (plan de cuentas,
  fuentes, parámetros). **Un solo escritor: `DUENO`**.
- **K4 ActivacionVertical** — enciende la vertical: **MECANICO, cero juicio**, y **SOLO si
  los parámetros están declarados**.

**AISLAMIENTO POR NEGOCIO (invariante 13)**: dar de alta un negocio es crear su **PARCELA** y
su parcela queda **AISLADA** — ningún cálculo de un negocio lee ni escribe la de otro salvo
**consolidación DECLARADA**. La dependencia con `aislamiento-negocio` (**I4**) es por
**EVENTO** (`contabilidad.parcela_negocio.registrar.request`) con **CONTRATO TOLERANTE**: si
I4 no responde, **el negocio queda configurado** y se **DECLARA** que la parcela no se pudo
abrir — `parcela_aviso` con `code:'DEPENDENCIA_NO_DISPONIBLE'`,
`accion:'NO_AFIRMAR_AISLAMIENTO'` — **nunca se afirma que está aislado cuando no lo está**.

**SIN PARAMETROS NO SE ACTIVA**: si los parámetros declarables están **[ABIERTO]**, K4
responde **`409 NEGOCIO_INCOMPLETO`** con la lista de lo que falta (`falta:[...]`,
`marca:'ABIERTO'`, `activado:false`, `asumido:false`, `senal:'HUECO_DECLARADO'`) — **el hueco
se DECLARA, no se rellena ni se asume**. Un negocio **INCOMPLETO no finge estar en marcha**.

`_estadoDe` es **determinista**: `CONFIGURADO` solo si `plan_de_cuentas` + `fuentes` +
`parametros` están declarados; si no, `FALTA` con la lista.

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/onboarding-negocio/onboarding-negocio.json`), restaura en `project.activated`
y vuelca en `onUnload`. La dependencia con `cola-declaraciones-criterio` (K9) y
`project-manager` es **por EVENTO, NUNCA por `require` cruzado**.

> **NO REUTILIZA**: el onboarding de un negocio contable no existe; `project-manager` gestiona
> el proyecto, no la configuración contable.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + ciclo de vida)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.negocio.configurar.request` | `onConfigurarRequest` | RPC custodio: {project_id, rol:'DUENO', negocio, datos:{plan_de_cuentas?, fuentes?, parametros?, territorio?, sociedad?, actividad?}, consolidacion?} → {project_id, negocio, configuracion, estado:'CONFIGURADO'\|'FALTA', completo, falta, aislado, parcela_abierta}. Recoge los datos DECLARABLES (K1) y AISLA la parcela del negocio pidiendola a aislamiento-negocio (I4) por EVENTO: si I4 no responde el negocio queda configurado y se declara parcela_aviso (503 DEPENDENCIA_NO_DISPONIBLE, NO_AFIRMAR_AISLAMIENTO) — nunca se afirma un aislamiento que no consta. Cerrojo: rol != DUENO → 409 ERROR_DOS_ESCRITORES. Publica contabilidad.negocio_configurado y responde por contabilidad.negocio.configurar.response; error → contabilidad.negocio.configurar.failed. |
| `contabilidad.negocio.estado.request` | `onEstadoRequest` | RPC custodio de lectura: {project_id, negocio} → {project_id, negocio, estado:'CONFIGURADO'\|'FALTA'\|'NO_EXISTE', completo, falta:[...], marca:'ABIERTO'\|null, activo}. Determinista: CONFIGURADO solo si plan_de_cuentas + fuentes + parametros estan declarados; si no, FALTA con la lista — lo no declarado queda [ABIERTO]. Responde por contabilidad.negocio.estado.response; si falta project_id/negocio → contabilidad.negocio.estado.failed. |
| `contabilidad.negocio.activar.request` | `onActivarRequest` | RPC custodio: {project_id, negocio} → {project_id, negocio, activado:true, configuracion, parcela_aislada, mecanico:true, cero_juicio:true}. K4: MECANICO, cero juicio — enciende por la configuracion declarada. SIN parametros declarados NO se activa: 409 NEGOCIO_INCOMPLETO con falta:[...], marca:'ABIERTO', asumido:false. Negocio no configurado → 404. Publica contabilidad.vertical_activada y responde por contabilidad.negocio.activar.response; error → contabilidad.negocio.activar.failed. |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) los negocios configurados del proyecto activado: la configuracion de cada negocio (y su parcela aislada) es POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.negocio_configurado` | Fire-and-forget (K1): los datos declarables de un negocio nuevo quedaron recogidos → {project_id, negocio, configuracion:{plan_de_cuentas, fuentes, parametros, parcela, aislado}, estado:'CONFIGURADO'\|'FALTA', completo, falta, no_se_asume_nada:true}. Si faltan datos, el hueco queda declarado ([ABIERTO]), no rellenado. |
| `contabilidad.vertical_activada` | Fire-and-forget (K4): la vertical del negocio quedo ENCENDIDA por su configuracion declarada → {project_id, negocio, activado:true, configuracion, parcela_aislada, mecanico:true, cero_juicio:true}. Solo se emite si los parametros estaban declarados: sin ellos no hay activacion. |
| `contabilidad.negocio.configurar.failed` | Par de fallo determinista: configurar sin project_id/negocio/datos, con rol != DUENO (409 ERROR_DOS_ESCRITORES), o con aislamiento-negocio (I4) sin confirmar la parcela (503 DEPENDENCIA_NO_DISPONIBLE, fase PARCELA — el negocio queda configurado pero el aislamiento NO se afirma). Cierra el circulo de contabilidad.negocio.configurar.request. |
| `contabilidad.negocio.estado.failed` | Par de fallo determinista: estado sin project_id o sin negocio. Cierra el circulo de contabilidad.negocio.estado.request. |
| `contabilidad.negocio.activar.failed` | Par de fallo determinista: activar sin project_id/negocio, negocio no configurado (404) o NEGOCIO INCOMPLETO (409 NEGOCIO_INCOMPLETO: faltan parametros declarables, marca [ABIERTO] — la vertical NO se activa). Cierra el circulo de contabilidad.negocio.activar.request. |
| `contabilidad.negocio_configurado.failed` | Par de fallo del evento de dominio contabilidad.negocio_configurado: la emision del hecho de dominio no se completo. |
| `contabilidad.vertical_activada.failed` | Par de fallo del evento de dominio contabilidad.vertical_activada: la vertical no se activo (parametros sin declarar) o la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.negocio.configurar.failed` cierra
> `contabilidad.negocio.configurar.request`; `contabilidad.negocio.estado.failed` cierra
> `contabilidad.negocio.estado.request`; `contabilidad.negocio.activar.failed` cierra
> `contabilidad.negocio.activar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.negocio.configurar.response`, `contabilidad.negocio.estado.response` y
> `contabilidad.negocio.activar.response` (los pares response de los RPC); **NO están
> declaradas en `publishes`**. Además `_recogerConParcela` publica
> `contabilidad.negocio.configurar.failed` **también en el camino de éxito** cuando I4 no
> confirma la parcela (fase `PARCELA`) — junto a `contabilidad.negocio_configurado`.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.negocio_configurado.failed` y
> `contabilidad.vertical_activada.failed` son los pares de fallo de los eventos de DOMINIO;
> el custodio solo publica los pares `*.failed` de sus RPC (+ el de la fase PARCELA).

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.parcela_negocio.registrar.request` (dependencia por EVENTO hacia
> `aislamiento-negocio` I4, no declarada como publisher).

## Reglas de negocio

1. **Un solo escritor (K1)**: `_verificarEscritorUnico` exige `rol === 'DUENO'` (normalizado
   a mayúsculas). Cualquier otro → **`409 ERROR_DOS_ESCRITORES`**
   (`escritor_vigente:'DUENO'`). Mensaje: *«el negocio tiene UN escritor: solo el DUENO
   configura su onboarding»*.
2. **Qué es estar CONFIGURADO (determinista)**: `_estadoDe` — falta si
   `plan_de_cuentas === null|undefined|''`, si `fuentes` no es array no vacío, o si
   `parametros === null|undefined`. `estado:'CONFIGURADO'` solo si `falta.length === 0`;
   si no, `estado:'FALTA'` con la lista. **El hueco se declara, no se estima.**
3. **Datos declarables (K1)**: `_recoger` compone la config conservando lo existente para lo
   no redeclarado (`plan_de_cuentas`, `fuentes`, `parametros`, `territorio`, `sociedad`,
   `actividad`). `reusado:true` si ya existía. La config lleva `configurado_por:'DUENO'`,
   `configurado_en`, `no_se_asume_nada:true`, y se refleja `estado`/`falta`/`completo`.
4. **La parcela se PIDE por EVENTO (contrato TOLERANTE)**: `_abrirParcela` hace `_rpc`
   (`contabilidad.parcela_negocio.registrar.request`, rol `'SISTEMA'`, `dueno:'DUENO'`,
   `consolidacion` si viene, `timeout_ms:4000`). Si no responde o `status !== 200` →
   `{ok:false}`: la config guarda `parcela:null`, `aislado:false`, `parcela_abierta:false`,
   y la respuesta añade `parcela_aviso` con `code:'DEPENDENCIA_NO_DISPONIBLE'`,
   `dependencia:'aislamiento-negocio'`, `accion:'NO_AFIRMAR_AISLAMIENTO'`, y publica
   `contabilidad.negocio.configurar.failed` (`detalle:{negocio, fase:'PARCELA'}`).
   **El negocio queda configurado: lo que no se afirma es el aislamiento.**
5. **AISLAMIENTO POR NEGOCIO (invariante 13)**: `aislado = parcela.ok` cuando la config se
   completa con I4; en `_activar`, `parcela_aislada = !!config.parcela`. La parcela del
   negocio es propia; ningún cálculo de un negocio toca la de otro salvo consolidación
   declarada.
6. **SIN PARAMETROS NO SE ACTIVA (K4)**: `_activar` — si el negocio no existe → **`404
   RESOURCE_NOT_FOUND`** (`accion:'CONFIGURAR_PRIMERO'`). Si `!estado.completo` → **`409
   NEGOCIO_INCOMPLETO`** con `{negocio, falta, marca:'ABIERTO', activado:false,
   asumido:false, senal:'HUECO_DECLARADO'}`. **El hueco se declara; la vertical no se enciende.**
7. **K4 es mecánico**: la activación es `mecanico:true`, `cero_juicio:true` — enciende por la
   configuración declarada, sin juicio propio. Si ya estaba activo → `reusado:true`.
8. **Estado de lectura**: `_estado` — negocio inexistente → `200` con `estado:'NO_EXISTE'`,
   `completo:false`, `falta:[...PARAMETROS_REQUERIDOS]`, `marca:'ABIERTO'`, `asumido:false`
   (*una obligación no declarada se dice, no se asume*). Existente → `estado`, `completo`,
   `falta`, `marca` (`'ABIERTO'` si falta algo, `null` si no), `configuracion`, `activo:true|false`,
   `no_se_rellena_el_hueco:true`.
9. **Secuencia append-only**: cada `_recoger` empuja
   `{negocio, estado, configurado_en, secuencia: d.secuencia.length + 1}`. La secuencia es la
   prueba de orden.
10. **La configuración es POR PROYECTO**: `store[pid]` con
    `{esquema:'contabilidad-onboarding-negocio-v1', negocios:{}, secuencia:[],
    escritor:'DUENO'}`. Sin restaurar (`project.activated`) el estado del negocio no se puede
    garantizar.
11. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    sin `negocio` → `400 INVALID_INPUT negocio`; `datos` no objeto → `400 INVALID_INPUT
    datos`. Shape: `{status:400, error:{code:'INVALID_INPUT', message:'<campo> requerido',
    details:{field:<campo>}}}`.
12. **HTTP exacto**: éxito `200`; payload inválido → `400`; segundo escritor → `409`;
    negocio incompleto al activar → `409 NEGOCIO_INCOMPLETO`; negocio no configurado al
    activar → `404`; I4 mudo → `503` en el par `configurar.failed` (fase PARCELA, el negocio
    queda configurado); excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.negocio.configurar.response`,
`contabilidad.negocio.estado.response` y `contabilidad.negocio.activar.response`.

### 1. `configurar` — el DUENO declara los datos del negocio

```json
{
  "project_id": "e57a318a-...",
  "rol": "DUENO",
  "negocio": "PANADERIA-CENTRO",
  "datos": {
    "plan_de_cuentas": "PGC-PYME",
    "fuentes": ["POS", "BANCO"],
    "parametros": { "serie_factura": "2026" },
    "territorio": "ES",
    "sociedad": "B12345678",
    "actividad": "ALIMENTACION"
  },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "negocio": "PANADERIA-CENTRO",
  "configuracion": { "negocio": "PANADERIA-CENTRO", "plan_de_cuentas": "PGC-PYME", "fuentes": ["POS", "BANCO"], "parametros": { "serie_factura": "2026" }, "activo": false, "configurado_por": "DUENO", "parcela": "PARCELA-PANADERIA-CENTRO", "aislado": true, "reusado": false, "estado": "CONFIGURADO", "falta": [], "completo": true, "parcela_abierta": true },
  "estado": "CONFIGURADO",
  "completo": true,
  "falta": [],
  "reusado": false,
  "no_se_asume_nada": true,
  "parcela": "PARCELA-PANADERIA-CENTRO",
  "aislado": true,
  "parcela_abierta": true
}
```

Emite `contabilidad.negocio_configurado` (res.data + `correlation_id`).

### 2. `configurar` — I4 no confirma la parcela (contrato TOLERANTE)

Si `aislamiento-negocio` (I4) no responde, la respuesta `200` añade `parcela_aviso` y se
publica además `contabilidad.negocio.configurar.failed`:

```json
{
  "project_id": "e57a318a-...",
  "negocio": "PANADERIA-CENTRO",
  "estado": "CONFIGURADO",
  "completo": true,
  "falta": [],
  "parcela": null,
  "aislado": false,
  "parcela_abierta": false,
  "parcela_aviso": { "status": 503, "code": "DEPENDENCIA_NO_DISPONIBLE", "dependencia": "aislamiento-negocio", "message": "aislamiento-negocio (I4) no confirmo la parcela: el negocio queda configurado, el aislamiento NO se afirma", "accion": "NO_AFIRMAR_AISLAMIENTO" }
}
```

### 3. `activar` — K4 enciende la vertical declarada

```json
{ "project_id": "e57a318a-...", "negocio": "PANADERIA-CENTRO" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "negocio": "PANADERIA-CENTRO", "activado": true, "reusado": false, "configuracion": { "...": "..." }, "parcela": "PARCELA-PANADERIA-CENTRO", "parcela_aislada": true, "mecanico": true, "cero_juicio": true }
```

Emite `contabilidad.vertical_activada` (res.data + `correlation_id`).

### 4. Fallo — NEGOCIO INCOMPLETO al activar → 409

```json
{ "project_id": "e57a318a-...", "negocio": "PANADERIA-CENTRO" }
```

(negocio configurado sin `parametros`) → Respuesta `409` + `contabilidad.negocio.activar.failed`:

```json
{ "status": 409, "error": { "code": "NEGOCIO_INCOMPLETO", "message": "la vertical NO se activa: faltan datos declarables (parametros)", "details": { "negocio": "PANADERIA-CENTRO", "falta": ["parametros"], "marca": "ABIERTO", "activado": false, "asumido": false, "senal": "HUECO_DECLARADO" } } }
```

### 5. Fallo — rol no DUENO → 409

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "negocio": "PANADERIA-CENTRO", "datos": {} }
```

→ `409 ERROR_DOS_ESCRITORES` + `contabilidad.negocio.configurar.failed`.

### 6. `estado` — el estado del negocio (determinista)

```json
{ "project_id": "e57a318a-...", "negocio": "PANADERIA-CENTRO" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "negocio": "PANADERIA-CENTRO", "estado": "CONFIGURADO", "completo": true, "falta": [], "marca": null, "configuracion": { "...": "..." }, "activo": true, "no_se_rellena_el_hueco": true }
```

### 7. Tools (sin RPC en module.json)

`toolRecoger` → `_recoger`; `toolEstado` → `_estado`; `toolActivar` → `_activar`.

## Tests

El test viviría en `tests/unit/onboarding-negocio.test.js`. Cubre:

- `configurar` con `rol:'DUENO'` y datos completos → `200`, `estado:'CONFIGURADO'`,
  `completo:true`, `no_se_asume_nada:true`; emite `contabilidad.negocio_configurado`.
- **Single-writer**: rol distinto de DUENO → `409 ERROR_DOS_ESCRITORES`.
- **Incompleto**: sin `parametros` → `estado:'FALTA'`, `falta:['parametros']`,
  `marca:'ABIERTO'`.
- `activar` sobre negocio COMPLETO → `200`, `activado:true`, `mecanico:true`,
  `cero_juicio:true`, `parcela_aislada:true`; emite `contabilidad.vertical_activada`.
- **SIN PARAMETROS NO SE ACTIVA**: `activar` sobre incompleto → `409 NEGOCIO_INCOMPLETO` con
  `falta`, `marca:'ABIERTO'`, `activado:false`, `asumido:false`.
- `activar` negocio no configurado → `404` (`accion:'CONFIGURAR_PRIMERO'`).
- **Contrato TOLERANTE**: I4 no responde → `200` con `parcela_aviso` (`NO_AFIRMAR_AISLAMIENTO`,
  `aislado:false`) + `contabilidad.negocio.configurar.failed` (fase PARCELA); **nunca** se
  afirma `aislado:true`.
- `estado` de negocio inexistente → `200` `NO_EXISTE`, `asumido:false`.
- Sin `project_id`/`negocio`/`datos` → `400 INVALID_INPUT` + par `*.failed`.
- `project.activated` restaura los negocios vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/onboarding-negocio
node --test tests/unit/onboarding-negocio.test.js
```

## Notas de implementación

- Clase `OnboardingNegocio extends ModuloHibridoReflejo`; `name = 'onboarding-negocio'`,
  `version = 'reflejo-0.1.0'` (aunque es **custodio**: conserva el versionado reflejo, es el
  patrón real de la vertical). Store en memoria `this._store` (Map project_id →
  `{esquema:'contabilidad-onboarding-negocio-v1', negocios:{}, secuencia:[],
  escritor:'DUENO'}`).
- Constantes: `ROL_ESCRITOR = 'DUENO'`, `CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES'`,
  `PARAMETROS_REQUERIDOS = ['plan_de_cuentas','fuentes','parametros']`,
  `MARCA_ABIERTO = 'ABIERTO'`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo,
  file:'onboarding-negocio.json', dir:'/contabilidad/onboarding-negocio', snapshot,
  hidratar})`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onConfigurarRequest`/`onActivarRequest` delegan en `_atender(e, '<op>',
  'contabilidad.negocio.<op>.response', fn)` y publican el evento de dominio si `status ===
  200` o el par `*.failed` si no. `onEstadoRequest` solo publica el par de fallo.
  `_recogerConParcela` es un handler async que encadena `_recoger` + `_abrirParcela`.
- Proyecciones puras: `_recoger`, `_estado`, `_estadoDe`, `_activar`, `_abrirParcela`
  (async), `_verificarEscritorUnico` (+ `_obtenerOCrear`). `_atender`, `_rpc`, `_invalid` y
  `_errorResponse` vienen de la base.
- Tools: `toolRecoger`, `toolEstado`, `toolActivar`.
- DEP hacia delante: `contabilidad.negocio_configurado` y `contabilidad.vertical_activada`
  trazan el alta y el encendido de la vertical. DEP hacia atrás por evento:
  `aislamiento-negocio` (I4) provee la parcela (`contabilidad.parcela_negocio.registrar.request`);
  `cola-declaraciones-criterio` (K9) y `project-manager` por EVENTO.
