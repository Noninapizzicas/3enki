---
name: margen-analitico
description: >
  Skill FULL del módulo REFLEJO `margen-analitico` de la vertical contabilidad de Enki.
  EL MARGEN POR DIMENSIÓN: ingreso − coste imputado, agrupado por la dimensión analítica
  (centro, línea, producto), determinista sobre líneas YA ETIQUETADAS — el eje y el
  catálogo de dimensiones son DECLARABLES y nada se imputa a dedo (línea sin dimensión,
  ambigua o fuera del catálogo → margen abierto). Sin estado. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el margen por dimensión de un proyecto y periodo (RPC
    margen-analitico.calcular.request).
  - Cuando depures por qué `margen_total:null` con `abierto:true` (líneas sin dimensión,
    ambiguas o fuera del catálogo declarado) o por qué una línea aparece en
    `sin_dimension`, `no_declaradas` o `ambiguas`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del margen (determinista, eje y catálogo como DATO, dato ausente = desconocido, no
    escribe ni persiste).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo margen-analitico.
tags: [enki, modulo, reflejo, contabilidad, margen-analitico]
---

# margen-analitico — REFLEJO STATELESS del margen por dimensión

## Qué hace el módulo

`margen-analitico` es un **REFLEJO STATELESS** (J2, hoja del plan): **EL MARGEN POR
DIMENSIÓN** — ingreso − coste imputado, agrupado por la **DIMENSIÓN analítica** (centro,
línea, producto). Cálculo **PURO** y **DETERMINISTA**: las mismas líneas etiquetadas + el
mismo eje → el mismo margen (**una sola respuesta correcta**). **No es un juicio.**

Atributos del diseño: `ingresos`, `costes:Flujo<Cuantía>`.
Métodos: `calcular(dimension, periodo):Cuantía`. Regla: **ingreso − coste imputado por
dimensión**.

**LAS LÍNEAS SON DATO ETIQUETADO**: la magnitud de cada línea (importe y tipo
`INGRESO`/`COSTE`) y su dimensión llegan **DECLARADAS** en la petición — el fruto del
etiquetado que **PROPONE** J1 (`etiquetado-analitico`, que **jamás escribe**) o las líneas
ya declaradas por el negocio. El reflejo **NUNCA cablea una regla de negocio**: aquí solo
se **AGRUPA** y se **RESTA**. **Cero constantes.**

**EL EJE ES DECLARABLE**: la dimensión por la que se corta (`centro` | `linea` |
`producto` | cualquier eje declarado) entra como **DATO** (`eje`). Si una línea trae varios
campos de dimensión y **no hay eje declarado**, el corte sería una adivinanza → la línea se
declara **AMBIGUA** y queda fuera del margen. Del mismo modo, una línea **sin dimensión**
no se asigna a ninguna cubeta: se declara en `sin_dimension` y el margen se marca
`[ABIERTO]`.

**EL CATÁLOGO DE DIMENSIONES ES DECLARABLE**: las dimensiones válidas se **declaran** en la
petición o se piden a `cola-declaraciones-criterio` (K9) **POR EVENTO** (best-effort, clave
`'dimensiones'`). Una línea cuya dimensión no está en el catálogo declarado se declara en
`no_declaradas` (se ve, **no se oculta**) — nunca se descarta en silencio ni se le inventa
un centro.

Invariantes:

- **DETERMINISTA**: mismas líneas + mismo eje → mismo margen (una sola respuesta).
- **Dato ausente = desconocido**: sin líneas → `margen_total:null`, `abierto:true` (un flujo
  vacío **NO es margen 0**). Un importe no numérico o un tipo no declarado → la línea queda
  declarada y **no suma**.
- **LEY/PARÁMETRO COMO DATO**: el eje y el catálogo de dimensiones son entrada; cero
  constantes.
- **NO escribe, NO persiste, NO muta**: el margen es **DERIVADO**; el asiento y la
  imputación son de otros. Sin `PosPersistencia` ni `project.activated`.

Proyección única `_calcular(input)` (async: puede pedir el catálogo a K9 por evento). Tool
`toolCalcular`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `margen-analitico.calcular.request` | `onCalcularRequest` | RPC reflejo (calculo puro, determinista): {project_id, periodo?, eje?, dimensiones?, lineas?\|ingresos?/costes?} → {project_id, periodo, eje, fuente_dimensiones, ingresos_total, costes_total, margen_total, parcial:{ingresos, costes, margen, ratio_margen}, por_dimension:[{dimension, ingresos, costes, margen, ratio_margen, n_lineas}], n_dimensiones, n_lineas, sin_dimension, no_declaradas, ambiguas, abierto, faltan, motivo}. Agrupa las lineas etiquetadas por la dimension del eje declarado y resta ingreso − coste imputado. Sin lineas → margen:null y abierto:true (un flujo vacio no es margen 0); lineas sin dimension/eje declarado o fuera del catalogo declarado → margen_total:null y abierto:true con lo que falta (no se imputa nada a dedo). El catalogo de dimensiones se lee de la cola K9 por EVENTO si no viene declarado. Responde por margen-analitico.calcular.response; project_id ausente → margen-analitico.calcular.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `margen-analitico.calcular.response` | Respuesta RPC correlada de margen-analitico.calcular.request → {request_id, status:200, data:{margen_total, por_dimension, parcial, faltan, abierto}}. Emitida por el helper _atender. |
| `margen-analitico.calcular.failed` | Par de fallo determinista (J2): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de margen-analitico.calcular.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `margen-analitico.calcular.failed` cierra el círculo de
> `margen-analitico.calcular.request` cuando `_calcular` devuelve status ≠ 200 (solo
> `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onCalcularRequest` publica
> `margen-analitico.calcular.failed` **solo si `res.status !== 200`**; con `200` responde por
> `margen-analitico.calcular.response` (vía `_atender`) y **no emite evento de dominio**
> (el margen es un derivado de lectura).

> Nota: el módulo pide el catálogo de dimensiones a
> `cola-declaraciones-criterio.ratificar.request` (K9) **POR EVENTO** con `timeout_ms:4000`
> cuando no viene declarado. Ese RPC **no figura en `module.json`** (es una dependencia
> saliente, no una subscripción). Tampoco figuran `_dimensiones`, `_normalizarCatalogo`,
> `_eje`, `_lineas`, `_tieneDimension`, `_corteDe`, `_resumenLinea`, `_clave` ni `_num`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). `periodo` se normaliza con `String(...)` o
   `null`.
2. **El CATÁLOGO de dimensiones** (`_dimensiones`): se toma `input.dimensiones` (o
   `input.criterio.dimensiones`) si es array → `fuente_dimensiones:'declarado'`; si no, se
   pide a `cola-declaraciones-criterio.ratificar.request` con `clave:'dimensiones'`; si K9
   devuelve `data.criterio.valor.dimensiones` (array) o `data.criterio.valor` (array) →
   `fuente_dimensiones:'cola-declaraciones-criterio'`. **Sin catálogo declarado NO se
   inventa**: se agrupa por lo que cada línea declare y `fuente_dimensiones:null`.
3. **El EJE** (`_eje`): `input.eje` como `String(...)` o `null`. **El eje es dato**; sin eje
   el corte solo procede si la línea trae **exactamente una** dimensión.
4. **Las LÍNEAS** (`_lineas`): se concatenan `input.lineas` (tipo el que declare cada una),
   `input.ingresos` (tipo forzado `INGRESO`), `input.costes` y `input.costes_imputados`
   (tipo forzado `COSTE`). Cada línea normaliza
   `{dimension, centro, linea, producto, eje, tipo, importe, hecho_id, periodo}`, con
   `importe` tomado de `l.importe ?? l.cuantia ?? l.valor` y `hecho_id` de `l.hecho_id ??
   l.id`. El `tipo` se uppercasa; solo `INGRESO`/`COSTE` son válidos (`null` si no).
5. **Sin líneas NO hay margen**: `lineas.length === 0` → `200` con `margen_total:null`,
   `ingresos_total:null`, `costes_total:null`, `por_dimension:[]`, `abierto:true`,
   `faltan:['lineas']` y `motivo:'no hay lineas etiquetadas declaradas: no se deriva margen
   (un flujo vacio no es margen 0)'` (**un flujo vacío NO es margen 0**).
6. **Por cada línea** (agrupación determinista): importe no numérico → a `sin_dimension`
   (`motivo:'importe no numerico'`). `tipo` distinto de `INGRESO`/`COSTE` → a
   `sin_dimension` (`motivo:'tipo (INGRESO|COSTE) no declarado'`) (**no se adivina si suma o
   resta**).
7. **El CORTE** (`_corteDe`): si la línea trae `dimension` → esa; si no, con eje (`l.eje ||
   eje`) → el campo del eje; sin eje → solo si hay **exactamente una** de las tres claves
   conocidas `centro`/`linea`/`producto` (constante `EJES_CONOCIDOS`, **solo los NOMBRES**,
   cero valores). Corte `null` con dimensión presente → **AMBIGUA**; corte `null` sin
   dimensión → `sin_dimension`. **No se adivina la cubeta.**
8. **Dimensión fuera del catálogo**: si hay catálogo (`catalogo.size > 0`) y el corte no está
   → a `no_declaradas` con `{dimension, ...resumenLinea}` (se declara, **no se descarta en
   silencio**).
9. **La resta**: cada cubeta acumula `ingresos` o `costes` (+= importe) y `n_lineas`.
   Por dimensión: `margen = round(ingresos − costes, 2)`;
   `ratio_margen = ingresos !== 0 ? round(margen/ingresos, 4) : null`.
   `por_dimension` se ordena alfabéticamente por `dimension`.
10. **`abierto` y `faltan`**: `abierto = sin_dimension.length > 0 || ambiguas.length > 0 ||
    no_declaradas.length > 0`. `faltan` acumula `'dimension_de_<n>_linea(s)'`,
    `'eje_declarado'` (si hay ambiguas) y `'catalogo_de_dimensiones'` (si hay no declaradas).
11. **`margen_total` solo se cierra si TODAS las líneas entraron en una cubeta**: si
    `abierto` → `margen_total:null`; el **parcial** se declara igual (`parcial:{ingresos,
    costes, margen, ratio_margen}`) — **se ve lo que hay, no se oculta lo que falta**.
12. **Redondeo a 2 decimales** (`_round`) de importes, totales y margen; ratio a 4.
13. **`_clave(v)`**: `null`/`''` → `null`; objeto → `v.id ?? v.clave ?? v.nombre ?? v.centro
    ?? v.linea ?? v.producto` (recursivo); si no → `String(v)`. **La identidad de la
    dimensión es DATO declarado.**
14. **`_num(v)`**: `undefined`/`null`/`''` → `null`; no finito → `null`.
15. **Puro**: sin estado, sin persistencia, sin reloj, sin azar.
16. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `margen-analitico.calcular.response`. **No emite evento de dominio.**

### 1. `calcular` — margen por dimensión declarada

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "eje": "centro",
  "dimensiones": [ { "id": "C1", "tipo": "centro" }, { "id": "C2", "tipo": "centro" } ],
  "lineas": [
    { "hecho_id": "H1", "tipo": "INGRESO", "importe": 1200, "centro": "C1" },
    { "hecho_id": "H2", "tipo": "COSTE",   "importe": 700,  "centro": "C1" },
    { "hecho_id": "H3", "tipo": "INGRESO", "importe": 800,  "centro": "C2" }
  ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "eje": "centro",
  "fuente_dimensiones": "declarado",
  "ingresos_total": 2000,
  "costes_total": 700,
  "margen_total": 1300,
  "parcial": { "ingresos": 2000, "costes": 700, "margen": 1300, "ratio_margen": 0.65 },
  "por_dimension": [
    { "dimension": "C1", "ingresos": 1200, "costes": 700, "margen": 500, "ratio_margen": 0.4167, "n_lineas": 2 },
    { "dimension": "C2", "ingresos": 800,  "costes": 0,   "margen": 800, "ratio_margen": 1, "n_lineas": 1 }
  ],
  "n_dimensiones": 2,
  "n_lineas": 3,
  "sin_dimension": [],
  "no_declaradas": [],
  "ambiguas": [],
  "abierto": false,
  "faltan": [],
  "motivo": null
}
```

### 2. Sin líneas — **un flujo vacío NO es margen 0**

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "eje": "centro" }
```

`200` con `margen_total:null`, `ingresos_total:null`, `costes_total:null`,
`por_dimension:[]`, `abierto:true`, `faltan:["lineas"]` y el `motivo` declarado.

### 3. Línea sin dimensión o ambigua — margen `[ABIERTO]`

Una línea de `tipo:'INGRESO'` sin dimensión → `sin_dimension` y `faltan` incluye
`'dimension_de_1_linea(s)'`; una línea con `centro` **y** `linea` sin `eje` declarado →
`ambiguas` y `faltan` incluye `'eje_declarado'`. En ambos casos `margen_total:null` y
`abierto:true` con el `motivo` (`'el margen no se cierra: hay lineas sin dimension/eje
declarado o fuera del catalogo (no se imputa nada a dedo)'`).

### 4. Dimensión fuera del catálogo — `no_declaradas`

Si el catálogo declarado es `[{id:'C1'}]` y una línea trae `centro:'C9'` → a
`no_declaradas` y `faltan` incluye `'catalogo_de_dimensiones'`. **Se ve, no se oculta.**

### 5. Fallo — falta `project_id`

Respuesta `400` + `margen-analitico.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/margen-analitico.test.js`. Cubre:

- `calcular` con líneas etiquetadas + eje declarado → `200` con `margen_total`,
  `por_dimension` y `ratio_margen`; `abierto:false`.
- Sin líneas → `margen_total:null`, `abierto:true`, `faltan:['lineas']` (**no es margen 0**).
- Línea sin dimensión → `sin_dimension` y margen abierto; línea con varias dimensiones sin
  eje → `ambiguas` (`faltan` con `'eje_declarado'`).
- Dimensión fuera del catálogo declarado → `no_declaradas` (**no se descarta en silencio**).
- Catálogo pedido a `cola-declaraciones-criterio` por evento (K9) → `fuente_dimensiones` lo
  declara; sin catálogo se agrupa por lo declarado.
- Importe no numérico o tipo no declarado → la línea se declara y **no suma**.
- **Determinismo**: mismas líneas + mismo eje → mismo margen.
- `project_id` ausente → `400 INVALID_INPUT` + `margen-analitico.calcular.failed`.
- `toolCalcular` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `MargenAnalitico extends ModuloHibridoReflejo`; `name = 'margen-analitico'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/margen-analitico/`).
- Constante `EJES_CONOCIDOS = ['centro', 'linea', 'producto']` — **solo los NOMBRES del
  molde, cero valores**.
- `onCalcularRequest` usa `this._atender(e, 'calcular', 'margen-analitico.calcular.response',
  async (d) => {...})` y publica el par `failed` si `status !== 200`.
- Proyección `_calcular(input)` (async: puede pedir el catálogo a K9 por evento); helpers
  `_dimensiones`, `_normalizarCatalogo`, `_eje`, `_lineas`, `_tieneDimension`, `_corteDe`,
  `_resumenLinea`, `_clave`, `_num`. Tool `toolCalcular`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- **DEP**: el tablero por dimensión (`tablero-margen-dimension` J10), la desviación
  (`desviacion` J4) y el cuadro de mando (`cuadro-mando-contable` J8) **BEBEN esta cifra por
  EVENTO** (`margen-analitico.calcular.request`) — **nunca la recalculan**.
- **PARÁMETRO COMO DATO**: el eje (`eje`), el catálogo de dimensiones y las propias líneas
  etiquetadas son **declarables**; el código **no asume** ninguna dimensión, ningún eje por
  defecto ni ninguna regla de negocio. Solo **agrupa** y **resta**.
