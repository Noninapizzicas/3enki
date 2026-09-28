---
name: margen-analitico
description: >
  Skill FULL del módulo REFLEJO `margen-analitico` de la vertical contabilidad de Enki
  (J2 + J5 + J10, hoja del plan). EL MARGEN POR DIMENSIÓN y el reparto DECLARADO de los
  gastos no directos. Tres clases en una parcela: J2 `_calcular(dimension)` — ingreso −
  coste imputado por dimensión, agregando lo YA etiquetado (J1); J5
  `_repartirConCriterio(gasto, criterio)` — aplica el REPARTO DECLARADO de los gastos no
  directos (criterio J7); J10 `_cruzar(margen, dimension)` — cruce margen × dimensión bajo
  lente de CONJUNTO (por centro, familia o sociedad). NO ES EL JUICIO: la ETIQUETA es de
  `etiquetado-analitico` (J1); aquí SOLO se AGREGA lo ya etiquetado, jamás se clasifica a
  ciegas. LA LEY ENTRA COMO DATO: sin criterio declarado el reparto NO SE INVENTA (422
  CRITERIO_NO_DECLARADO). El coste se LEE de `valoracion-existencia` (H1) por EVENTO,
  NUNCA se recalcula; si no hay libro ni etiquetas → 503 DEPENDENCIA_NO_DISPONIBLE y
  JAMÁS un margen inventado. Reflejo stateless, determinista. Úsala para operar, depurar
  o extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el margen por dimensión (RPC contabilidad.margen.calcular.request), el
    reparto de un gasto no directo (contabilidad.indirecto.repartir.request) o el tablero
    margen × dimensión (contabilidad.tablero.cruzar.request).
  - Cuando depures por qué no sale el margen (503 DEPENDENCIA_NO_DISPONIBLE si no hay líneas
    del libro ni etiquetas y H1 no responde), por qué no se reparte (422
    CRITERIO_NO_DECLARADO si el criterio J7 no está declarado en K9) o por qué falta
    project_id/dimension/gasto (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la agregación
    determinista de lo ya etiquetado y el invariante «sin criterio declarado el reparto no
    se inventa; sin coste real no se emite margen».
  - Cuando vayas a escribir/ampliar el test unitario del reflejo margen-analitico.
tags: [enki, modulo, reflejo, contabilidad, margen-analitico, margen, determinista]
---

# margen-analitico — REFLEJO de margen por dimensión y reparto declarado de indirectos

## Qué hace el módulo

`margen-analitico` es un **REFLEJO STATELESS** (J2 + J5 + J10, hoja del plan): **EL MARGEN
POR DIMENSIÓN y el reparto DECLARADO de los gastos no directos**. Tres clases en una
parcela:

- **J2** `_calcular(dimension)` → **Margen** = ingreso − coste imputado por dimensión.
- **J5** `_repartirConCriterio(gasto, criterio)` → `Map<IdDimension, Importe>`: aplica el
  **REPARTO DECLARADO** de los gastos no directos (criterio **J7**).
- **J10** `_cruzar(margen, dimension)` → **Tablero**: margen × dimensión bajo lente de
  **CONJUNTO** (por centro, familia o sociedad).

**NO es el juicio**: la **ETIQUETA** (qué hecho va a qué centro/línea/producto) es de
`etiquetado-analitico` (J1) y llega por EVENTO en el payload (`lineas`/`etiquetas`/`hechos`)
o como evento de dominio `contabilidad.etiqueta_aplicada`. Aquí **solo se AGREGA lo ya
etiquetado**; **jamás se clasifica a ciegas**.

**LA LEY ENTRA COMO DATO**: el **CRITERIO** de reparto de indirectos (J7) es
**DECLARABLE** — se lee de `cola-declaraciones-criterio` (K9) por EVENTO
`contabilidad.criterio.leer.request`. **Ningún porcentaje ni clave de reparto está
cableado**: **SIN CRITERIO DECLARADO el reparto NO SE INVENTA** (**`422
CRITERIO_NO_DECLARADO`**, `ley_cableada:false`).

El **coste imputado** = existencias valoradas (**H1**, leídas por EVENTO
`contabilidad.existencia.valorar.request`, **NUNCA recalculadas**) + indirecto repartido
por el criterio declarado; si nada de eso está disponible y el payload no lo trae, se
devuelve **`503 DEPENDENCIA_NO_DISPONIBLE`** y **NUNCA** se emite un margen inventado
(contrato **TOLERANTE**).

Es **stateless**: sin PosPersistencia ni `project.activated` — cada op **entra objeto,
sale objeto**; el margen es una proyección del libro + la analítica, no una parcela. La
dependencia entre módulos es **por EVENTO, nunca por `require` cruzado**. Es
**DETERMINISTA**: *mismas entradas → mismo margen*.

> **NO REUTILIZA**: el coste indirecto multi-sociedad y por periodos NO lo cubre la pieza
> existente (`escandallo`, mono-negocio).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.margen.calcular.request` | `onCalcularRequest` | RPC reflejo (J2): {project_id, dimension\|centro, periodo?, lineas?\|etiquetas?\|hechos?, coste_imputado?\|coste?, indirecto_repartido?, gastos_no_directos?, criterio?} → {project_id, periodo, dimension, margen:{ingreso, coste_imputado, margen, margen_pct, n_lineas}, coste_de:{existencias_valoradas, indirecto_repartido, origen}}. El ingreso AGREGA las lineas ya etiquetadas (J1) de la dimension; el coste imputado = existencias valoradas (H1, por EVENTO o payload, NUNCA recalculadas) + indirecto repartido (J5). Cálculo determinista. Sin lineas del libro ni etiquetas → 503 DEPENDENCIA_NO_DISPONIBLE: NUNCA un margen inventado. Exito publica contabilidad.margen_calculado y responde por contabilidad.margen.calcular.response; error → contabilidad.margen.calcular.failed. |
| `contabilidad.indirecto.repartir.request` | `onRepartirRequest` | RPC reflejo (J5): {project_id, gasto:{importe\|total}, criterio?} → {project_id, importe, criterio:'J7', criterio_fuente, por_dimension:Map<IdDimension,Importe>, n_dimensiones, reparto_declarado:true, ley_cableada:false}. Aplica el REPARTO DECLARADO de los gastos no directos: el criterio (J7) viene en el payload o se LEE de cola-declaraciones-criterio (K9) por EVENTO contabilidad.criterio.leer.request. SIN CRITERIO DECLARADO → 422 CRITERIO_NO_DECLARADO (el reparto NO se inventa, ley_cableada:false). Cálculo determinista (misma base + misma clave → mismo reparto). Exito publica contabilidad.indirecto_repartido y responde por contabilidad.indirecto.repartir.response; error → contabilidad.indirecto.repartir.failed. |
| `contabilidad.tablero.cruzar.request` | `onCruzarRequest` | RPC reflejo (J10): {project_id, dimensiones?\|dims?, periodo?, lineas?\|etiquetas?} → {project_id, periodo, lente:'CONJUNTO', por_dimension:[{dimension, ingreso, coste_imputado, margen, margen_pct}], totales:{ingreso, coste_imputado, margen}, n_dimensiones}. Cruza margen × dimension por centro, familia o sociedad: agregación determinista bajo lente de conjunto (no baja al asiento). Las dimensiones a cruzar son las declaradas (J6) o las presentes en las etiquetas. Sin lineas del libro ni etiquetas → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.tablero_calculado y responde por contabilidad.tablero.cruzar.response; error → contabilidad.tablero.cruzar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.margen_calculado` | Fire-and-forget (J2): el margen por dimension quedo calculado (ingreso − coste imputado) → {project_id, periodo, dimension, margen:{ingreso, coste_imputado, margen, margen_pct, n_lineas}, coste_de:{existencias_valoradas, indirecto_repartido, origen}}. Lo consume el cuadro de mando contable (J8) y el comparador de periodos (J9) — por EVENTO, sin recalcularlo. Determinista; jamas un margen inventado. |
| `contabilidad.indirecto_repartido` | Fire-and-forget (J5): el gasto no directo quedo repartido por las dimensiones aplicando el CRITERIO DECLARADO (J7) → {project_id, importe, criterio:'J7', criterio_fuente, por_dimension, n_dimensiones, reparto_declarado:true, ley_cableada:false}. Lo consumen el margen (J2) y el tablero (J10). Si el criterio no estaba declarado, este evento NO se emite y sale su par de fallo. |
| `contabilidad.tablero_calculado` | Fire-and-forget (J10): el tablero de margen × dimension quedo cruzado bajo lente de CONJUNTO → {project_id, periodo, lente:'CONJUNTO', por_dimension:[...], totales:{ingreso, coste_imputado, margen}, n_dimensiones}. Lo consume el cuadro de mando contable (J8, lente del jefe) y el informe rico (K3). Agregación determinista. |
| `contabilidad.margen.calcular.failed` | Par de fallo determinista: calcular sin project_id/dimension (400) o sin lineas del libro ni etiquetas (503 DEPENDENCIA_NO_DISPONIBLE: no se emite un margen sin ingreso ni coste real). Cierra el circulo de contabilidad.margen.calcular.request. |
| `contabilidad.indirecto.repartir.failed` | Par de fallo determinista: repartir sin project_id/gasto (400), con importe no positivo, o sin criterio de reparto declarado (422 CRITERIO_NO_DECLARADO: el reparto NO se inventa — la ley entra como DATO, J7/K9). Cierra el circulo de contabilidad.indirecto.repartir.request. |
| `contabilidad.tablero.cruzar.failed` | Par de fallo determinista: cruzar sin project_id (400) o sin lineas del libro ni etiquetas (503 DEPENDENCIA_NO_DISPONIBLE: no se emite un tablero de margen). Cierra el circulo de contabilidad.tablero.cruzar.request. |
| `contabilidad.margen_calculado.failed` | Par de fallo del evento de dominio contabilidad.margen_calculado: la emision del hecho de dominio no se completo. |
| `contabilidad.indirecto_repartido.failed` | Par de fallo del evento de dominio contabilidad.indirecto_repartido: la emision del hecho de dominio no se completo (p.ej. el criterio de reparto declarado no fija claves: no se asume un reparto por defecto). |
| `contabilidad.tablero_calculado.failed` | Par de fallo del evento de dominio contabilidad.tablero_calculado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.margen.calcular.failed` cierra `contabilidad.margen.calcular.request`;
> `contabilidad.indirecto.repartir.failed` cierra `contabilidad.indirecto.repartir.request`;
> `contabilidad.tablero.cruzar.failed` cierra `contabilidad.tablero.cruzar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.margen.calcular.response`, `contabilidad.indirecto.repartir.response` y
> `contabilidad.tablero.cruzar.response` (los pares response de los RPC); **NO están
> declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.margen_calculado.failed`,
> `contabilidad.indirecto_repartido.failed` y `contabilidad.tablero_calculado.failed` son
> los pares de fallo de los eventos de DOMINIO; el reflejo solo publica los pares
> `*.failed` de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.criterio.leer.request` (cola-declaraciones-criterio K9),
> `contabilidad.existencia.valorar.request` (valoracion-existencia H1) y
> `contabilidad.mayor.balanza.request` (mayor-balanza B3): dependencias por EVENTO no
> declaradas como publishers.

## Reglas de negocio

1. **La ETIQUETA es de J1, aquí solo se AGREGA**: `_agregarDimension(lineas, dimension)`
   recorre las líneas ya etiquetadas y suma el importe de las que caen en la dimensión.
   La `nota` de la respuesta lo dice: *«el margen AGREGA lo ya etiquetado (J1); aqui no se
   clasifica nada a ciegas»*. **Nunca se clasifica a ciegas.**
2. **DIMENSIÓN — qué se suma**: para cada línea se mira `l.etiqueta || l.dimension ||
   l.centro`; si la etiqueta es objeto se toma `centro || linea || id`. Si el id de
   dimensión es distinto de la dimensión pedida, la línea **se salta**; **las líneas SIN
   etiqueta (id `null`/`undefined`) NO se saltan**: entran en la agregación de cualquier
   dimensión. Es el comportamiento real del código — conviene declararlo al depurar totales.
3. **El INGRESO de una línea**: `l.importe` si existe; si no, `|saldo_acreedor −
   saldo_deudor|` donde `saldo_acreedor` cae a `haber` y `saldo_deudor` cae a `debe`. Se
   redondea a 2 decimales.
4. **El COSTE se LEE, no se recalcula** (`_costeImputadoDe`): por orden, (a) si el payload
   trae `coste_imputado`/`coste` (número u objeto con `total`/`importe`) → `origen:'PAYLOAD'`;
   (b) si no, `_rpc` a `contabilidad.existencia.valorar.request` (H1, timeout 4000ms) y se
   toma `data.total_valor` o `data.valoracion.total` → `origen:'H1_valoracion-existencia'`.
   **Jamás se recalcula la valoración.**
5. **El indirecto**: si el payload trae `indirecto_repartido` (mapa), se toma
   `r[dimension]` o `r.total`; si trae `gastos_no_directos` (array), se suman y se llaman a
   `_repartirConCriterio` → `origen:'J5_reparto_declarado'`. **Si el reparto devuelve
   status ≠ 200 (p. ej. 422 CRITERIO_NO_DECLARADO), el indirecto queda a 0 y no cambia el
   `origen`**: el fallo del reparto no se propaga al margen (comportamiento real).
6. **EL REPARTO NO SE INVENTA (J5)**: `_repartirConCriterio` — pide `project_id` (400) y un
   `gasto` con `importe`/`total` **> 0** (400 `INVALID_INPUT gasto.importe` si ≤ 0). El
   criterio (J7) se toma del payload (`criterio`/`criterio_reparto`) o se **LEE** de K9 por
   `contabilidad.criterio.leer.request` (solo si `data.hallado`). **Sin criterio → `422
   CRITERIO_NO_DECLARADO`** con `{ criterio:'J7', declarable_en:
   'cola-declaraciones-criterio (K9)', accion:'NO_REPARTIR_INVENTANDO' }`.
7. **Claves de reparto DECLARADAS** (`_clavesDeReparto`, dos formas): (A) `{claves:[
   {dimension|centro, clave|peso}]}`; (B) mapa `{ <dimension>: <clave> }`. Se filtran las
   claves `> 0`. **Sin claves → `422 CRITERIO_NO_DECLARADO`** con `valor_declarado` y
   mensaje *«no se asume un reparto por defecto»*. Con claves, el reparto es
   **proporcional**: `importe * (clave / totalClaves)`, redondeado a 2 decimales.
8. **TOLERANTE sin libro ni etiquetas**: `_lineasDe` acepta `lineas`/`hechos`/`movimientos`
   o `etiquetas` del payload; si no, pide `contabilidad.mayor.balanza.request` (B3) y usa
   `data.balanza.lineas`. Si nada responde → `null` → **`503 DEPENDENCIA_NO_DISPONIBLE`**
   con `{ dependencia:'margen-analitico', accion:'NO_CALCULAR_PUBLICAR_FALLO' }` (calcular)
   o `{ dependencia:'margen-analitico' }` (cruzar). **Nunca un margen/tablero inventado.**
9. **El TABLERO (J10)**: `lente:'CONJUNTO'`; dimensiones a cruzar = las **declaradas**
   (`dimensiones`/`dims`, normalizadas con `_idDimension`) o, si no, las **presentes en las
   etiquetas** (`_dimensionesDeLineas`); por cada una se repite ingreso/coste/margen y se
   acumulan `totales`. **No baja al asiento**: es agregación.
10. **DETERMINISMO**: mismo input → mismo output, bit a bit (un test unitario lo afirma).
    Las respuestas 200 llevan `determinista:true` (`margen`/`tablero`).
11. **Fórmulas**: `margen = ingreso − coste`; `margen_pct = margen / ingreso` redondeado a
    4 decimales, o **`null` si `ingreso === 0`** (nunca se divide por cero).
12. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    falta `dimension` (en calcular) → `400 INVALID_INPUT dimension`;
    `gasto.importe <= 0` → `400 INVALID_INPUT gasto.importe`. Shape: `{ status:400,
    error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
13. **HTTP exacto**: éxito `200`; payload inválido / importe no positivo → `400`; criterio no
    declarado o sin claves → `422 CRITERIO_NO_DECLARADO`; sin libro ni etiquetas → `503
    DEPENDENCIA_NO_DISPONIBLE`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.margen.calcular.response`,
`contabilidad.indirecto.repartir.response` y `contabilidad.tablero.cruzar.response`.

### 1. `calcular` — margen de una dimensión (agrega lo etiquetado)

```json
{
  "project_id": "e57a318a-...",
  "dimension": "CENTRO-NORTE",
  "periodo": "2026-09",
  "lineas": [
    { "etiqueta": { "centro": "CENTRO-NORTE" }, "importe": 1500 },
    { "etiqueta": { "centro": "CENTRO-SUR" }, "importe": 900 },
    { "etiqueta": { "centro": "CENTRO-NORTE" }, "importe": 500 }
  ],
  "coste_imputado": 1200,
  "indirecto_repartido": { "CENTRO-NORTE": 120 },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "dimension": "CENTRO-NORTE",
  "margen": { "ingreso": 2000, "coste_imputado": 1320, "margen": 680, "margen_pct": 0.34, "n_lineas": 2 },
  "coste_de": { "existencias_valoradas": 1200, "indirecto_repartido": 120, "origen": "PAYLOAD" },
  "determinista": true,
  "nota": "el margen AGREGA lo ya etiquetado (J1); aqui no se clasifica nada a ciegas"
}
```

Emite `contabilidad.margen_calculado` (res.data + `correlation_id`).

### 2. `repartir` — reparto declarado de un gasto no directo (J5)

```json
{
  "project_id": "e57a318a-...",
  "gasto": { "importe": 600 },
  "criterio": { "valor": { "claves": [ { "dimension": "CENTRO-NORTE", "clave": 3 }, { "dimension": "CENTRO-SUR", "clave": 1 } ] } },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "importe": 600,
  "criterio": "J7",
  "criterio_fuente": "PAYLOAD",
  "por_dimension": { "CENTRO-NORTE": 450, "CENTRO-SUR": 150 },
  "n_dimensiones": 2,
  "reparto_declarado": true,
  "ley_cableada": false,
  "determinista": true
}
```

Emite `contabilidad.indirecto_repartido` (res.data + `correlation_id`).

### 3. `cruzar` — tablero margen × dimensión (J10, lente CONJUNTO)

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "dimensiones": ["CENTRO-NORTE", "CENTRO-SUR"], "coste_imputado": 1000 }
```

Respuesta `200` (recortada):

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "lente": "CONJUNTO",
  "por_dimension": [
    { "dimension": "CENTRO-NORTE", "ingreso": 2000, "coste_imputado": 1000, "margen": 1000, "margen_pct": 0.5 },
    { "dimension": "CENTRO-SUR", "ingreso": 900, "coste_imputado": 1000, "margen": -100, "margen_pct": -0.1111 }
  ],
  "totales": { "ingreso": 2900, "coste_imputado": 2000, "margen": 900 },
  "n_dimensiones": 2,
  "determinista": true,
  "nota": "cruce margen × dimension por centro, familia o sociedad — agregacion determinista"
}
```

Emite `contabilidad.tablero_calculado` (res.data + `correlation_id`).

### 4. Fallo — sin criterio declarado → 422 (el reparto NO se inventa)

```json
{ "project_id": "e57a318a-...", "gasto": { "importe": 600 } }
```

(K9 no tiene el criterio J7 declarado) → Respuesta `422` +
`contabilidad.indirecto.repartir.failed`:

```json
{ "status": 422, "error": { "code": "CRITERIO_NO_DECLARADO", "message": "el criterio de reparto de indirectos (J7) no esta declarado: el reparto NO se inventa", "details": { "criterio": "J7", "declarable_en": "cola-declaraciones-criterio (K9)", "accion": "NO_REPARTIR_INVENTANDO" } } }
```

### 5. Fallo — sin líneas ni etiquetas → 503 TOLERANTE

```json
{ "project_id": "e57a318a-...", "dimension": "CENTRO-NORTE" }
```

(B3 `mayor-balanza` no responde) → Respuesta `503` + `contabilidad.margen.calcular.failed`:

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "no hay linea del libro ni etiquetas: no se emite un margen sin ingreso ni coste real", "details": { "dependencia": "margen-analitico", "accion": "NO_CALCULAR_PUBLICAR_FALLO" } } }
```

### 6. Fallo — payload inválido

Sin `dimension` en `calcular` → `400 INVALID_INPUT dimension` + `contabilidad.margen.calcular.failed`;
con `gasto.importe` ≤ 0 en `repartir` → `400 INVALID_INPUT gasto.importe`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "gasto.importe requerido", "details": { "field": "gasto.importe" } } }
```

### 7. Tools (sin RPC en module.json)

`toolCalcular` → `_calcular`; `toolRepartir` → `_repartirConCriterio`; `toolCruzar` →
`_cruzar`.

## Tests

El test vive en `tests/unit/margen-analitico.test.js`. Cubre:

- `calcular` con líneas etiquetadas en el payload → `200`, `margen.ingreso` = suma de las
  líneas de esa dimensión y `n_lineas` correcto; emite `contabilidad.margen_calculado`.
- **El coste se LEE, no se recalcula**: con `coste_imputado` en payload `origen:'PAYLOAD'`;
  con H1 respondiendo, `origen:'H1_valoracion-existencia'`.
- `margen_pct` **`null`** cuando `ingreso === 0` (nunca se divide por cero).
- **Determinismo**: la MISMA entrada devuelve EXACTAMENTE el MISMO resultado (dos llamadas).
- `repartir` con criterio declarado (formas A `claves` y B mapa) → reparto **proporcional**;
  emite `contabilidad.indirecto_repartido`.
- **Sin criterio declarado** → `422 CRITERIO_NO_DECLARADO` (`NO_REPARTIR_INVENTANDO`), **sin**
  inventar el reparto; criterio sin claves → también `422`.
- `gasto.importe <= 0` → `400 INVALID_INPUT gasto.importe`.
- `cruzar` con dimensiones declaradas → `lente:'CONJUNTO'`, `totales` cuadran y
  `n_dimensiones` correcto; emite `contabilidad.tablero_calculado`.
- **Dependencia tolerante**: sin líneas/etiquetas en el payload y B3 mudo → `503
  DEPENDENCIA_NO_DISPONIBLE` (`NO_CALCULAR_PUBLICAR_FALLO`), **nunca** un margen inventado.
- Sin `project_id`/`dimension` → `400 INVALID_INPUT` + par `*.failed`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/margen-analitico
node --test tests/unit/margen-analitico.test.js
```

## Notas de implementación

- Clase `MargenAnalitico extends ModuloHibridoReflejo`; `name = 'margen-analitico'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: nada que persistir).
- Constantes: `CRITERIO_REPARTO = 'J7'`, `CODE_CRITERIO_NO_DECLARADO = 'CRITERIO_NO_DECLARADO'`,
  `CODE_DEPENDENCIA_NO_DISPONIBLE = 'DEPENDENCIA_NO_DISPONIBLE'`.
- Los tres handlers delegan en `_atender(e, '<op>', 'contabilidad.<op>.response', fn)`;
  publican el evento de dominio si `status === 200` y el par `*.failed` si no.
- Proyecciones: `_calcular` (async), `_repartirConCriterio` (async), `_cruzar` (async);
  helpers `_dimensionDe`, `_idDimension`, `_dimensionesDeclaradas`, `_lineasDe` (async,
  EVENTO B3), `_agregarDimension`, `_dimensionesDeLineas`, `_costeImputadoDe` (async),
  `_sumaGastos`, `_criterioDeReparto` (async, EVENTO K9), `_clavesDeReparto`.
  `_rpc`/`_invalid`/`_errorResponse`/`_round` vienen de la base.
- Tools: `toolCalcular`, `toolRepartir`, `toolCruzar`.
- DEP hacia delante: `contabilidad.margen_calculado` lo consumen `cuadro-mando-contable`
  (J8) y el comparador de periodos (J9); `contabilidad.tablero_calculado` lo consumen
  `cuadro-mando-contable` (J8) e `informe-rico` (K3). DEP hacia atrás por EVENTO: K9
  `cola-declaraciones-criterio` (criterio J7), H1 `valoracion-existencia` (coste valorado) y
  B3 `mayor-balanza` (líneas del libro).
