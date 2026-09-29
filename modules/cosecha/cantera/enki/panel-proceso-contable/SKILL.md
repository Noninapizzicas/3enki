---
name: panel-proceso-contable
description: >
  Skill FULL del módulo REFLEJO `panel-proceso-contable` de la vertical
  contabilidad de Enki. EL LATIDO del proceso de entrada — qué ENTRA, qué se
  PROCESA, qué está EN COLA y qué FALLA; agrega lo ya emitido (historial P2 +
  cola A8.1) y LEE la cobertura. Agrega, no decide. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites el latido del proceso de entrada (RPC
    panel-proceso-contable.latido.request).
  - Cuando depures por qué un tramo del panel sale `null` con su clave en
    `faltan` (historial/cola/cobertura que no responden) o por qué falta
    `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del reflejo (agrega no decide, LEE la cobertura, determinista,
    dato ausente = null, sin parcela).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo
    panel-proceso-contable.
tags: [enki, modulo, reflejo, contabilidad, panel-proceso-contable]
---

# panel-proceso-contable — REFLEJO del latido del proceso de entrada

## Qué hace el módulo

`panel-proceso-contable` es un **REFLEJO STATELESS** (P1, hoja del plan): **EL LATIDO del
proceso de entrada** — qué **ENTRA**, qué se **PROCESA**, qué está **EN COLA** y qué **FALLA**.
Es el "display" de la contabilidad: una **agregación DETERMINISTA** sobre lo que ya emitieron
las piezas del proceso.

Atributos del diseño: `cola:EncoladoExcepcion`, `historial:HistorialProcesoContable`.
Método: `latido():Panel`.

Invariantes:

- **AGREGA, NO DECIDE**: compone el panel con lo que le dan (historial **P2** + cola **A8.1**) o
  con los **contadores** que los eventos del proceso han acumulado **EN MEMORIA**. **Cero
  criterio de negocio** (`decide:false`).
- **LEE, NO RECALCULA la cobertura**: la **tasa de cobertura** se toma de `completitud-cobertura`
  (**A12, LA métrica única**) **POR EVENTO**; **jamás** se recomputa aquí.
- **DETERMINISTA**: mismo estado del proceso → mismo panel.
- **Dato ausente = desconocido**: los tramos sin dato salen **`null`**, no un `0` inventado.
- **Sin estado de dominio**: el panel es una **PROYECCIÓN viva en memoria**, no una parcela. La
  persistencia duradera del proceso es el historial (**P2**).

Consume `contabilidad.excepcion_encolada` y `contabilidad.proceso_anotado` (fire-and-forget) para
el latido **en proceso**. Cierra el círculo con `panel-proceso-contable.latido.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `panel-proceso-contable.latido.request` | `onLatidoRequest` | RPC reflejo (agregación determinista): {project_id, historial?, cola?, cobertura?, vertical?} → {panel:{entrados, procesados, en_cola, cola_dueno, fallados, cobertura, historial_disponible, cola_disponible, cobertura_disponible}, agrega, decide:false, abierto, faltan}. Compone el latido con lo declarado o con el historial (P2) y la cola (A8.1) pedidos POR EVENTO; la cobertura se LEE de completitud-cobertura (A12) — NO se recalcula. PROJECT_ID o tramos ausentes → null (no un 0 inventado). Responde por panel-proceso-contable.latido.response; project_id ausente → panel-proceso-contable.latido.failed. |
| `contabilidad.excepcion_encolada` | `onExcepcionEncolada` | Fire-and-forget (A8.1 → P1): encolado-excepcion publicó que lo dudoso espera en cola → incrementa el tramo EN COLA del latido en proceso (y cola_dueno si el destino es DUENO). Tolerante: sin project_id se ignora. |
| `contabilidad.proceso_anotado` | `onProcesoAnotado` | Fire-and-forget (P2 → P1): historial-proceso-contable anotó un proceso (PROCESADO\|FALLADO) → incrementa el tramo correspondiente del latido en proceso. Lo agrega el panel; NO decide. Tolerante: sin project_id se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `panel-proceso-contable.latido.response` | Respuesta RPC correlada de panel-proceso-contable.latido.request → {request_id, status:200, data:{panel, agrega, decide:false, abierto, faltan}}. Emitida por el helper _atender. |
| `panel-proceso-contable.latido.failed` | Par de fallo determinista (P1): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de panel-proceso-contable.latido.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `panel-proceso-contable.latido.failed` cierra el círculo de
> `panel-proceso-contable.latido.request` cuando `_latido` devuelve status ≠ 200
> (`400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): el panel **no emite ningún evento de dominio** — sus
> dos fire-and-forget (`onExcepcionEncolada`, `onProcesoAnotado`) **solo consumen** y devuelven
> `{status:200, data:{project_id, anotado:...}}` directamente (no pasan por el bus). El cierre de
> círculo publica `panel-proceso-contable.latido.failed` en la rama `else` (status ≠ 200).

> Nota de sub-declaración (cruce con `index.js`): **no están en `module.json` pero sí los emite
> `index.js`** tres RPC salientes (son **DEP por evento**, no eventos emitidos):
> - en `_historial`: `historial-proceso-contable.anotar.request` (`{project_id, rol:'PANEL_LECTURA',
>   solo_lectura:true}`, `timeout_ms:3000`);
> - en `_cola`: `encolado-excepcion.tomar.request` (`{project_id, solo_lectura:true}`,
>   `timeout_ms:3000`);
> - en `_cobertura`: `completitud-cobertura.medir.request` (`{project_id, vertical}`,
>   `timeout_ms:4000`).

> Nota: tampoco figuran `_historial`, `_resumenHistorial`, `_cola`, `_cobertura`, `_contar`, `_num`
> (utilidades internas) ni la lectura `_latidos` (contadores en proceso).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **El HISTORIAL (P2)** (`_historial`): si `input.historial` es objeto → se resume de él
   (`_resumenHistorial`); si no, se pide **POR EVENTO** a
   `historial-proceso-contable.anotar.request` (`rol:'PANEL_LECTURA'`, `solo_lectura:true`,
   `timeout_ms:3000`); si responde con `data.registros` (array), se resume. **El historial no
   sirve lecturas por RPC**: si no viene declarado, se usa el **contador de eventos** y el tramo
   queda `null` cuando no hay contador.
3. **`_resumenHistorial`**: recorre los registros y cuenta `procesados` (resultado `PROCESADO`) y
   `fallados` (resultado `FALLADO`); devuelve `{procesados, fallados, total}`.
4. **La COLA (A8.1)** (`_cola`): si `input.cola` es objeto → `pendientes` (`cola.pendientes` o
   `cola.excepciones.length`) y `pendientes_dueno` (`cola.pendientes_dueno`); si no, se pide
   **POR EVENTO** a `encolado-excepcion.tomar.request` (`solo_lectura:true`, `timeout_ms:3000`).
   `tomar` sin clave responde los pendientes; **solo se usa como CONTADOR** — el panel **no toma
   nada**. Sin dato → `null`.
5. **LA COBERTURA se LEE, no se recalcula** (`_cobertura`): si `input.cobertura` es objeto → se
   toma tal cual; si no, se pide **POR EVENTO** a `completitud-cobertura.medir.request`
   (`{project_id, vertical}`, `timeout_ms:4000`) y se devuelve `data.cobertura` (**A12, la
   métrica única**). **Nunca se recomputa desde esperados/llegados.**
6. **Los tramos del panel**: `entrados` = contador `c.entrados` (o `null`); `procesados` y
   `fallados` = del historial si está disponible, si no del contador; `en_cola`/`cola_dueno` =
   de la cola si está disponible, si no del contador. **Cada tramo sin dato → `null`.**
7. **El panel completo**: `{entrados, procesados, en_cola, cola_dueno, fallados, cobertura,
   historial_disponible:<hist !== null>, cola_disponible:<cola !== null>,
   cobertura_disponible:<cobertura !== null>}`.
8. **`faltan`**: los tramos numéricos que son `null` (`entrados`, `procesados`, `en_cola`,
   `fallados`). **Se declara lo que falta, no se rellena con `0`.**
9. **La respuesta**: `{project_id, panel, agrega:['entrados','procesados','en_cola','fallados',
   'cobertura'], decide:false, abierto:{historial, cola, cobertura}, faltan}`. `abierto` declara
   qué dependencia no respondió (**el hueco de cobertura se declara, no se recalcula**).
10. **Los contadores EN MEMORIA** (`_contar`): `onExcepcionEncolada` suma `en_cola` (y `cola_dueno`
    si `excepcion.destino` es `DUENO`); `onProcesoAnotado` suma `procesados` (`PROCESADO`),
    `fallados` (`FALLADO`) o `anotados` (otro). Ambos son **tolerantes**: sin `project_id` se
    ignoran (devuelven `null`).
11. **Sin estado de dominio**: el panel **no persiste nada**: los contadores viven en
    `this._latidos` (proyección viva en memoria). Sin `PosPersistencia`, sin `onProjectActivated`.
12. **HTTP exacto**: éxito `200` (con tramos `null` o con número); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `panel-proceso-contable.latido.response`. **No emite evento de dominio.**

### 1. `latido` — el latido con el estado declarado

```json
{
  "project_id": "e57a318a-...",
  "historial": { "registros": [ { "resultado": "PROCESADO" }, { "resultado": "PROCESADO" }, { "resultado": "FALLADO" } ] },
  "cola": { "pendientes": 4, "pendientes_dueno": 1 },
  "cobertura": { "declarada": true, "esperados": 3, "llegados": 3, "huecos": [], "tasa": 1, "completa": true },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "panel": {
    "entrados": null,
    "procesados": 2,
    "en_cola": 4,
    "cola_dueno": 1,
    "fallados": 1,
    "cobertura": { "declarada": true, "esperados": 3, "llegados": 3, "huecos": [], "tasa": 1, "completa": true },
    "historial_disponible": true,
    "cola_disponible": true,
    "cobertura_disponible": true
  },
  "agrega": ["entrados", "procesados", "en_cola", "fallados", "cobertura"],
  "decide": false,
  "abierto": { "historial": null, "cola": null, "cobertura": null },
  "faltan": ["entrados"]
}
```

### 2. `latido` — el historial contado por los eventos (en proceso)

Con `historial`, `cola` y `cobertura` ausentes, el panel pide P2, A8.1 y A12 **POR EVENTO**. Si
una dependencia no responde, su tramo queda **`null`** (o usa el contador de eventos) y su
`abierto` declara el hueco. **La cobertura nunca se recalcula aquí.**

### 3. Fallo — falta `project_id`

```json
{ "historial": { "registros": [] } }
```

Respuesta `400` + `panel-proceso-contable.latido.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/panel-proceso-contable.test.js`. Cubre:

- `latido` con `historial` + `cola` + `cobertura` declarados → `200`, panel con `procesados`/
  `fallados` contados del historial, `en_cola`/`cola_dueno` de la cola, cobertura **adjuntada tal
  cual** (`decide:false`).
- Un tramo sin dato → **`null`** (nunca un `0` inventado) y su nombre en `faltan`.
- La **cobertura se LEE**: sin `input.cobertura` se pide a
  `completitud-cobertura.medir.request` (A12) y se adjunta; **nunca se recomputa**.
- `onExcepcionEncolada` incrementa `en_cola` (y `cola_dueno` si destino `DUENO`); tolerante sin
  `project_id`.
- `onProcesoAnotado` incrementa `procesados`/`fallados` (o `anotados` con otro resultado);
  tolerante sin `project_id`.
- `historial_disponible`/`cola_disponible`/`cobertura_disponible` marcan qué respondió; `abierto`
  declara los huecos.
- `project_id` ausente → `400 INVALID_INPUT` + `panel-proceso-contable.latido.failed`.
- **AGREGA, NO DECIDE**: `decide:false` siempre; ninguna llamada persiste ni muta (stateless).
- `toolLatido` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PanelProcesoContable extends ModuloHibridoReflejo`; `name = 'panel-proceso-contable'`,
  `version = 'reflejo-0.1.0'`. Contadores `this._latidos = new Map()` (`project_id →
  contadores`), **proyección viva en memoria, no parcela**. Sin `PosPersistencia`, sin
  `onProjectActivated`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/panel-proceso-contable/`).
- `onLatidoRequest` usa `this._atender(e, 'latido', 'panel-proceso-contable.latido.response',
  async (d) => {...})` con cierre de círculo (par `failed` si status ≠ 200). Los fire-and-forget
  `onExcepcionEncolada` / `onProcesoAnotado` devuelven la respuesta directamente (no pasan por el
  bus). `onUnload` delega en `super`.
- Proyección única `_latido(input)` (**async**: pide P2/A8.1/A12 por evento); helpers `_historial`,
  `_resumenHistorial`, `_cola`, `_cobertura`, `_contar`, `_num`. Tool `toolLatido`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: lee `historial-proceso-contable.anotar.request` (P2), `encolado-excepcion.tomar.request`
  (A8.1) y `completitud-cobertura.medir.request` (A12) por EVENTO. **LA COBERTURA SE LEE, NO SE
  RECALCULA** (métrica única).
