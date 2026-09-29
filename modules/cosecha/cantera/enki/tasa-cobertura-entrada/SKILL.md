---
name: tasa-cobertura-entrada
description: >
  Skill FULL del módulo REFLEJO `tasa-cobertura-entrada` de la vertical
  contabilidad de Enki. La PROPORCIÓN de hechos que entran SIN intervención vs
  los que caen a cola — la prueba de la promesa «sin una persona digitando». LEE
  la métrica única de cobertura (A12) y NUNCA la recalcula; lo que sí computa es
  su propio ratio de entrada. Úsala para operar, depurar o extender el reflejo, o
  para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites la tasa de entrada (sin intervención / total) con la
    cobertura adjunta (RPC tasa-cobertura-entrada.calcular.request).
  - Cuando depures por qué la tasa sale `null` con `abierto:true` (sin total ni
    las cuentas de intervención) o por qué falta `project_id` (400
    INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del reflejo (LEE la cobertura no la recalcula, dato ausente = null,
    determinista, no escribe).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo
    tasa-cobertura-entrada.
tags: [enki, modulo, reflejo, contabilidad, tasa-cobertura-entrada]
---

# tasa-cobertura-entrada — REFLEJO de la proporción de entrada sin intervención

## Qué hace el módulo

`tasa-cobertura-entrada` es un **REFLEJO STATELESS** (P4, hoja del plan): la **PROPORCIÓN de
hechos que entran SIN intervención** vs los que **CAEN A COLA**. Es la **prueba de la promesa del
dueño**: «sin una persona digitando».

Atributos del diseño: `cobertura:Cobertura`.
Método: `calcular():Ratio`.

> 🔴 **LEE LA MÉTRICA ÚNICA, NO LA RECALCULA.** La cobertura la produce `completitud-cobertura`
> (**A12**) y la declara en `contabilidad.cobertura_medida`. Aquí **NO se vuelve a medir la
> cobertura**: se **TOMA** la tasa ya medida (declarada en la petición, **cacheada** de lo emitido
> o pedida **POR EVENTO** a su dueño) y se **PRESENTA** para la **ENTRADA**. Recalcularla sería
> crear una **SEGUNDA métrica de cobertura** — la invariante lo prohíbe.

Invariantes:

- **LEE, NO RECALCULA**: la tasa de cobertura llega **declarada** o de su dueño (A12) **POR
  EVENTO**; aquí **jamás** se recomputa desde esperados/llegados.
- **Lo que SÍ computa esta hoja es su PROPIO ratio de entrada**: hechos **sin intervención**
  (procesados solos) sobre el **total**. Es la operación de la clase P4, **no** la métrica única.
- **DETERMINISTA**: mismas cuentas → mismo ratio.
- **Dato ausente = desconocido**: sin `total` (ni las dos cuentas de intervención) el ratio es
  **`null`**, no un `0` que afirme una medida que no se hizo.
- **NO escribe, NO persiste.**

Proyección única `_calcular`. Consume `contabilidad.cobertura_medida` (fire-and-forget) para LEER
la métrica única. Cierra el círculo con `tasa-cobertura-entrada.calcular.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `tasa-cobertura-entrada.calcular.request` | `onCalcularRequest` | RPC reflejo (determinista): {project_id, sin_intervencion?, con_intervencion?, total?, cobertura?, vertical?} → {tasa_entrada, ratio, sin_intervencion, con_intervencion, total, cumple_promesa, cobertura_leida, lee_metrica_unica:true, recalcula_cobertura:false, abierto, faltan, motivo}. Calcula el ratio PROPIO de la entrada (hechos sin intervencion / total) y ADJUNTA la metrica unica de cobertura (A12) LEIDA — declarada, cacheada o pedida POR EVENTO; NUNCA la recalcula. Sin total ni cuentas → tasa null (no un 0 inventado). Responde por tasa-cobertura-entrada.calcular.response; project_id ausente → tasa-cobertura-entrada.calcular.failed. |
| `contabilidad.cobertura_medida` | `onCoberturaMedida` | Fire-and-forget (A12 → P4): completitud-cobertura publicó LA metrica unica de cobertura → se LEE y se guarda (cache de lectura) para presentarla sin recalcularla. Tolerante: sin project_id se ignora. ⚠️ No dispara ninguna medición: solo LEE. |

### Publishes

| Evento | Descripción |
|---|---|
| `tasa-cobertura-entrada.calcular.response` | Respuesta RPC correlada de tasa-cobertura-entrada.calcular.request → {request_id, status:200, data:{tasa_entrada, ratio, sin_intervencion, con_intervencion, total, cumple_promesa, cobertura_leida, lee_metrica_unica, recalcula_cobertura, abierto, faltan}}. Emitida por el helper _atender. |
| `tasa-cobertura-entrada.calcular.failed` | Par de fallo determinista (P4): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de tasa-cobertura-entrada.calcular.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `tasa-cobertura-entrada.calcular.failed` cierra el círculo de
> `tasa-cobertura-entrada.calcular.request` cuando `_calcular` devuelve status ≠ 200
> (`400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): el reflejo **no emite ningún evento de dominio** — el
> fire-and-forget `onCoberturaMedida` **solo consume** (LEE la métrica única y la cachea) y
> devuelve `{status:200, data:{project_id, leida:'contabilidad.cobertura_medida'}}` directamente
> (no pasa por el bus). El cierre de círculo publica `tasa-cobertura-entrada.calcular.failed` en
> la rama `else` (status ≠ 200).

> Nota de sub-declaración (cruce con `index.js`): **no está en `module.json` pero sí lo emite
> `index.js`** el RPC saliente en `_leerCobertura`: `completitud-cobertura.medir.request`
> (`{project_id, vertical}`, `timeout_ms:4000`) — es una **DEP por evento** (LECTURA), no un
> evento emitido.

> Nota: tampoco figuran `_leerCobertura`, `_num`, `_cobertura` (la cache de lectura) ni `_calcular`
> (proyección interna) en el `module.json`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **LAS CUENTAS de intervención** (el ratio PROPIO de P4):
   - `sin_intervencion` = `input.sin_intervencion` ?? `input.automaticos` (vía `_num`).
   - `con_intervencion` = `input.con_intervencion` ?? `input.a_cola` (vía `_num`).
   - `total` = `input.total` (vía `_num`).
   - `totalEfectivo` = `total` si no es `null`; si no, `sin_intervencion + con_intervencion`
     cuando **ambas** constan; si no, `null`.
3. **Sin total → `null` (no un `0` inventado)**: si `totalEfectivo` es `null` → `200` con
   `tasa_entrada:null`, `ratio:null`, `abierto:true`, `faltan:['total|sin_intervencion+con_intervencion']`
   y `motivo:'no hay cuenta de hechos de entrada: el ratio es desconocido (no se afirma un 0)'`.
   Si `totalEfectivo === 0` → `tasa_entrada:null`, `abierto:true`, `faltan:[]`,
   `motivo:'el total es 0: no hay proporcion que calcular'`.
4. **La TASA de entrada** (determinista): `tasa = round(sin_intervencion / totalEfectivo, 4)`.
   `tasa_entrada` y `ratio` son **el mismo valor**. `cumple_promesa = tasa >= 1` (la promesa
   exige que **todo** entre sin una persona digitando).
5. **LA COBERTURA se LEE** (`_leerCobertura`): **en este orden** — (a) `input.cobertura` si es
   objeto; (b) la **caché de lectura** `this._cobertura.get(pid)`; (c) **POR EVENTO** a
   `completitud-cobertura.medir.request` (`{project_id, vertical}`, `timeout_ms:4000`) → su
   `data.cobertura`. **Nunca se recalcula.** La vía (c) es una LECTURA de la métrica única (A12).
6. **La respuesta de la vía con ratio**: `{project_id, tasa_entrada, ratio, sin_intervencion,
   con_intervencion, total, cumple_promesa, cobertura_leida, lee_metrica_unica:true,
   recalcula_cobertura:false, abierto:{sin_intervencion, con_intervencion, cobertura},
   faltan:[sin_intervencion?, con_intervencion?]}`.
   - `abierto.sin_intervencion`/`abierto.con_intervencion` declaran lo que no se declaró.
   - `abierto.cobertura` declara si A12 no respondió (**la métrica única se declara ausente, no se
     recalcula**).
7. **`onCoberturaMedida` (LEE)**: guarda `this._cobertura.set(project_id, d.cobertura || null)`;
   **tolerante**: sin `project_id` se ignora (devuelve `null`). **No dispara ninguna medición:
   solo LEE.**
8. **NO ESCRIBE, NO PERSISTE**: no hay ninguna escritura ni store en disco. La caché
   `this._cobertura` es una **LECTURA** de la métrica única, no una parcela. Sin `PosPersistencia`,
   sin `onProjectActivated`.
9. **HTTP exacto**: éxito `200` (con ratio o con `null`); `project_id` ausente → `400`; excepción
   en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `tasa-cobertura-entrada.calcular.response`. **No emite evento de dominio.**

### 1. `calcular` — ratio de entrada + cobertura adjunta (leída)

```json
{
  "project_id": "e57a318a-...",
  "sin_intervencion": 95,
  "con_intervencion": 5,
  "cobertura": { "declarada": true, "esperados": 3, "llegados": 3, "huecos": [], "tasa": 1, "completa": true },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "tasa_entrada": 0.95,
  "ratio": 0.95,
  "sin_intervencion": 95,
  "con_intervencion": 5,
  "total": 100,
  "cumple_promesa": false,
  "cobertura_leida": { "declarada": true, "esperados": 3, "llegados": 3, "huecos": [], "tasa": 1, "completa": true },
  "lee_metrica_unica": true,
  "recalcula_cobertura": false,
  "abierto": { "sin_intervencion": null, "con_intervencion": null, "cobertura": null },
  "faltan": []
}
```

La **cobertura adjunta es la LEÍDA** de la métrica única (A12); el reflejo **no la recalcula**
(`recalcula_cobertura:false`).

### 2. `calcular` — sin cuentas → `null` (no un `0` inventado)

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `200`: `tasa_entrada:null`, `ratio:null`, `abierto:true`,
`faltan:["total|sin_intervencion+con_intervencion"]`, `motivo` declarando que no se afirma un `0`.

### 3. `calcular` — la cobertura se LEE de A12 por evento

Sin `input.cobertura` y sin caché, se pide a `completitud-cobertura.medir.request` y se adjunta su
`cobertura` tal cual en `cobertura_leida`. **La métrica única se LEE, jamás se recalcula.**

### 4. Fallo — falta `project_id`

```json
{ "sin_intervencion": 95, "con_intervencion": 5 }
```

Respuesta `400` + `tasa-cobertura-entrada.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/tasa-cobertura-entrada.test.js`. Cubre:

- `calcular` con `sin_intervencion` + `con_intervencion` (sin `total`) → `total` derivado, `tasa =
  round(sin/total, 4)`, `cumple_promesa` correcto.
- `calcular` con `total` declarado → usa el `total` declarado, no la suma.
- Sin `total` ni las dos cuentas → `tasa_entrada:null` con `abierto:true` y
  `faltan:['total|sin_intervencion+con_intervencion']` (**no se afirma un `0`**); `total === 0` →
  `null` con `motivo:'el total es 0...'`.
- La **cobertura se LEE**: con `input.cobertura` se adjunta tal cual; sin ella,
  `onCoberturaMedida` la cachea (LECTURA) y se usa la caché; sin caché, se pide a
  `completitud-cobertura.medir.request` (A12). **Nunca se recalcula** (`recalcula_cobertura:false`,
  `lee_metrica_unica:true`).
- `onCoberturaMedida` es **tolerante** sin `project_id`; **no dispara medición**.
- `abierto.sin_intervencion`/`abierto.con_intervencion`/`abierto.cobertura` declaran los huecos;
  `faltan` lista las cuentas que no se declararon.
- `project_id` ausente → `400 INVALID_INPUT` + `tasa-cobertura-entrada.calcular.failed`.
- `toolCalcular` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `TasaCoberturaEntrada extends ModuloHibridoReflejo`; `name = 'tasa-cobertura-entrada'`,
  `version = 'reflejo-0.1.0'`. Caché de lectura `this._cobertura = new Map()` (`project_id →
  cobertura`), **no es parcela**. Sin `PosPersistencia`, sin store en disco, sin
  `onProjectActivated`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/tasa-cobertura-entrada/`).
- `onCalcularRequest` usa `this._atender(e, 'calcular', 'tasa-cobertura-entrada.calcular.response',
  async (d) => {...})` con cierre de círculo (par `failed` si status ≠ 200). El fire-and-forget
  `onCoberturaMedida` devuelve la respuesta directamente (no pasa por el bus). `onUnload` delega
  en `super`.
- Proyección única `_calcular(input)` (**async**: puede pedir A12 por evento); helper
  `_leerCobertura`, `_num`. Tool `toolCalcular`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: **LEE** `completitud-cobertura.medir.request` (A12) por EVENTO y consume
  `contabilidad.cobertura_medida` (fire-and-forget) para cachear la métrica única. **LA COBERTURA
  SE LEE, NO SE RECALCULA.**
