---
name: activacion-vertical
description: >
  Skill FULL del módulo REFLEJO `activacion-vertical` de la vertical contabilidad de Enki.
  ENCIENDE LA VERTICAL por la configuración DECLARADA: cuando onboarding-negocio (K1)
  publica que el negocio quedó dado de alta, deriva de esa config qué verticales contables
  se activan y publica contabilidad.vertical_activada por cada una. Mecánico, cero juicio:
  no decide qué verticales debe tener el negocio ni asume ninguna por defecto. Sin estado.
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites encender las verticales declaradas de un proyecto (RPC
    activacion-vertical.activar.request).
  - Cuando depures por qué no se enciende nada (`activada:false`, `faltan:['verticales']` si
    la config no declara verticales; 400 INVALID_INPUT si falta project_id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del reflejo (deriva, no decide; sin verticales no enciende nada; determinista).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo activacion-vertical.
tags: [enki, modulo, reflejo, contabilidad, activacion-vertical]
---

# activacion-vertical — REFLEJO STATELESS del encendido por configuración

## Qué hace el módulo

`activacion-vertical` es un **REFLEJO STATELESS** (K4, hoja del plan): **ENCIENDE LA
VERTICAL por la configuración DECLARADA**. Cuando `onboarding-negocio` (K1) publica que un
negocio quedó dado de alta (`contabilidad.negocio_onboarded`), este reflejo **DERIVA** — de
la configuración que el alta declaró — **QUÉ verticales** de contabilidad se encienden y
**publica `contabilidad.vertical_activada`** (una por vertical encendida) para que el resto
del sistema se ponga en marcha **por evento**.

**MECÁNICO, CERO JUICIO**: no decide si el negocio debe tener tal o cual vertical, no inventa
planes, no habilita nada que la configuración no declare. Si el alta **no declara
verticales**, **NO se enciende nada** y se declara que falta la declaración
(`faltan:['verticales']`) — **jamás se asume una vertical por defecto**.

Invariantes:

- **DETERMINISTA**: misma config declarada → mismas verticales encendidas.
- **LEY/PARÁMETRO COMO DATO**: la **LISTA** de verticales es ENTRADA (la declara el alta o la
  petición); **no** hay ningún catálogo de verticales cableado.
- **Dato ausente = desconocido**: sin verticales declaradas **NO** se enciende nada ni se
  asume una por defecto; se declara ABIERTO.
- **NO escribe, NO persiste**: la vertical se **ENCIENDE publicando**; no guarda estado.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `activacion-vertical.activar.request` | `onActivarRequest` | RPC reflejo (derivacion pura, determinista, cero juicio): {project_id, negocio?, config?, plan?, verticales?} → {project_id, negocio, plan, origen_config:'onboarding-negocio'\|'declarado'\|null, verticales_declaradas, verticales_activadas, total, activada, deriva, faltan, abierto:{verticales, origen_config}}. Enciende EXACTAMENTE las verticales declaradas (acepta strings o {nombre\|vertical\|id, activa\|habilitada\|on}); una vertical explicitamente apagada NO se enciende. Sin verticales declaradas no se enciende nada ni se asume una por defecto. Exito → publica contabilidad.vertical_activada por cada vertical y responde por activacion-vertical.activar.response; project_id ausente → activacion-vertical.activar.failed. |
| `contabilidad.negocio_onboarded` | `onNegocioOnboarded` | Fire-and-forget (K1 → K4): el alta del negocio (onboarding-negocio) declaro su configuracion → se DERIVA la activacion de las verticales declaradas y se publica contabilidad.vertical_activada por cada una. Si el alta no declara verticales, no se enciende nada (faltan:['verticales']) — jamas se asume una vertical por defecto. Tolerante: sin project_id se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `activacion-vertical.activar.response` | Respuesta RPC correlada de activacion-vertical.activar.request → {request_id, status:200, data:{verticales_declaradas, verticales_activadas, total, activada, deriva, faltan, abierto}}. Emitida por el helper _atender. |
| `activacion-vertical.activar.failed` | Par de fallo determinista (K4): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de activacion-vertical.activar.request y de contabilidad.negocio_onboarded. |
| `contabilidad.vertical_activada` | Fire-and-forget (K4): una vertical de contabilidad quedo ENCENDIDA por la configuracion declarada → {project_id, negocio, vertical, plan, origen_config, correlation_id}. Lo consume el resto de la vertical para saber que debe ponerse en marcha. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `activacion-vertical.activar.failed` cierra el círculo de
> `activacion-vertical.activar.request` **y** de `contabilidad.negocio_onboarded`, porque
> `onActivarRequest` y `onNegocioOnboarded` comparten la misma proyección `_activar` y ambas
> publican el par de fallo cuando `_activar` devuelve status ≠ 200.

> Nota: el fire-and-forget `onNegocioOnboarded` **no** usa `_atender`: arma la entrada desde
> el payload del alta (`config`, `plan` y `verticales`, cayendo a `config.plan` /
> `config.verticales`), llama a `_activar` y publica `contabilidad.vertical_activada` (una
> por vertical) o el par `failed`. Sin `project_id` devuelve `null` sin publicar.

## Reglas de negocio

1. **Las verticales son DATO**: `_verticalesDeclaradas` las recoge de (a) `input.verticales` y
   (b) `input.config.verticales` / `input.config.verticales_activas`, aplanando arrays.
2. **Formato declarable**: cada vertical es un **string** o un objeto
   `{nombre|vertical|id, activa|habilitada|on}`. El nombre sale de `nombre` → `vertical` →
   `id`. **Una vertical explícitamente apagada NO se enciende**: `activa:false` (o
   `habilitada:false`, u `on:false`) la excluye — es **dato declarado, no juicio**.
3. **Deduplicado determinista**: se conserva el **orden declarado** y se eliminan repetidos
   (Set de vistas). Mismo nombre repetido → una sola vez.
4. **Sin verticales declaradas → NO se enciende nada**: `verticales_declaradas:[]`,
   `verticales_activadas:[]`, `total:0`, `activada:false`, `deriva:false`,
   `faltan:['verticales']`. **Cero juicio: no se elige una vertical «por defecto».**
5. **Activación EXACTA**: se encienden **exactamente** las verticales declaradas, sin ampliar
   ni reducir; `verticales_activadas === verticales_declaradas`; `total` = su número;
   `activada:true` si hay al menos una; `deriva:true`.
6. **`origen_config` declara de dónde salen**: con `input.config` objeto →
   `'onboarding-negocio'`; sin config pero con `input.verticales` declarado → `'declarado'`;
   en la rama vacía, `null` si no había ni config ni verticales.
7. **`plan` declarable**: `input.plan`, o `config.plan`; sin declarar → `null`.
8. **`negocio` declarable**: `input.negocio` o `null`.
9. **Se emite UNA `contabilidad.vertical_activada` por vertical encendida** (bucle
   `_emitirActivadas` sobre `verticales_activadas`), con `{project_id, negocio, vertical,
   plan, origen_config, correlation_id}`. **Si no se enciende ninguna, no se emite nada.**
10. **`abierto`: qué falta se declara**: `verticales` (la config no declara ninguna — **no se
    enciende nada por defecto**) y `origen_config` (no llega la config del alta K1).
11. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
12. **Puro y sin estado**: no persiste. Es **síncrono** (`_activar` no es async: no pide nada
    por evento).
13. **HTTP exacto**: éxito `200` (con `activada` true **o** false); `project_id` ausente →
    `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `activacion-vertical.activar.response` y emite
`contabilidad.vertical_activada` (una por vertical encendida).

### 1. `activar` — verticales declaradas directamente

```json
{
  "project_id": "e57a318a-...",
  "negocio": "pizzepos",
  "verticales": ["libro", { "nombre": "fiscal", "activa": true }, { "vertical": "analitica", "habilitada": false }],
  "plan": "basico",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "negocio": "pizzepos",
  "plan": "basico",
  "origen_config": "declarado",
  "verticales_declaradas": ["libro", "fiscal"],
  "verticales_activadas": ["libro", "fiscal"],
  "total": 2,
  "activada": true,
  "deriva": true,
  "faltan": [],
  "abierto": { "verticales": null, "origen_config": null }
}
```

Emite **una** `contabilidad.vertical_activada` por vertical: `{project_id, negocio,
vertical:'libro', plan:'basico', origen_config:'declarado', correlation_id:'abc-123'}` y otra
con `vertical:'fiscal'`. La vertical `analitica` (apagada) **no** se enciende.

### 2. `activar` — desde la config del alta (K1)

```json
{ "project_id": "e57a318a-...", "config": { "verticales": ["libro", "fiscal"], "plan": "pro" } }
```

Respuesta `200`: `origen_config:'onboarding-negocio'`, `plan:'pro'`, se encienden `libro` y
`fiscal`.

### 3. `activar` — sin verticales declaradas (no se asume ninguna)

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "negocio": null,
  "plan": null,
  "origen_config": null,
  "verticales_declaradas": [],
  "verticales_activadas": [],
  "total": 0,
  "activada": false,
  "deriva": false,
  "faltan": ["verticales"],
  "abierto": {
    "verticales": "la configuracion del alta no declara ninguna vertical: no se enciende nada por defecto",
    "origen_config": "no llega la config del alta (K1): la activacion es declarada"
  }
}
```

**No se emite ningún evento.**

### 4. Fire-and-forget — reacción a `contabilidad.negocio_onboarded`

`onNegocioOnboarded` toma `e.data || e`; sin `project_id` → `null`. Con `project_id`, arma
`{project_id, negocio, config, plan?, verticales?}` (cayendo a `config.plan`/`config.verticales`)
y llama a `_activar`; en `200` emite `contabilidad.vertical_activada` por cada vertical, si no
el par `failed`.

### 5. Fallo — falta `project_id`

Respuesta `400` + `activacion-vertical.activar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/activacion-vertical.test.js`. Cubre:

- `activar` con `verticales` declaradas (strings + objetos) → `200 activada:true`,
  `verticales_activadas === declaradas`, `deriva:true` y emite `contabilidad.vertical_activada`
  **una por vertical**.
- Una vertical con `activa:false`/`habilitada:false` → **no** se enciende.
- Deduplicado determinista conservando el orden declarado.
- **Sin verticales declaradas** → `activada:false`, `faltan:['verticales']`, **no emite
  evento** (no se asume una vertical por defecto).
- Desde `config` del alta → `origen_config:'onboarding-negocio'` y `plan` derivado de la config.
- `onNegocioOnboarded` (fire-and-forget) deriva la activación; sin `project_id` → `null`.
- `project_id` ausente → `400 INVALID_INPUT` + `activacion-vertical.activar.failed`.
- `toolActivar` devuelve la misma proyección que `_activar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ActivacionVertical extends ModuloHibridoReflejo`; `name = 'activacion-vertical'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/activacion-vertical/`; es de la vertical **analítica**).
- `onActivarRequest` usa `this._atender(e, 'activar', 'activacion-vertical.activar.response',
  (d) => {...})` y hace el cierre de círculo: en `200` llama a `_emitirActivadas`, si no
  publica `activacion-vertical.activar.failed`. `onNegocioOnboarded` **no** usa `_atender`.
- Proyección `_activar(input)` (**síncrona**, determinista) → `{status, data}`; helpers
  `_emitirActivadas`, `_verticalesDeclaradas`, `_plan`. Tool `toolActivar`.
- `_invalid` viene de `modulo-hibrido-reflejo`.
- DEP: lo dispara `contabilidad.negocio_onboarded` (K1, `onboarding-negocio`); lo consume el
  resto de la vertical vía `contabilidad.vertical_activada` para saber que debe ponerse en
  marcha.
- **PARÁMETRO COMO DATO**: la lista de verticales es ENTRADA; **no** hay catálogo cableado.
- **DERIVA, NO DECIDE**: sin verticales declaradas no se enciende nada ni se asume ninguna.
