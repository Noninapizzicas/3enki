---
name: tablero-margen-dimension
description: >
  Skill FULL del módulo REFLEJO `tablero-margen-dimension` de la vertical contabilidad de
  Enki. El cruce MARGEN × DIMENSIÓN por centro/línea/producto/sociedad bajo lente de conjunto
  — LEE el margen ya calculado de J2 por evento (no lo recalcula) y sin eje declarado no
  cruza nada, porque elegirlo sería decidir por el jefe. Sin estado. Úsala para operar,
  depurar o extender el reflejo, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites la tabla de margen cortada por ejes analíticos (RPC
    tablero-margen-dimension.cruzar.request).
  - Cuando depures por qué la tabla queda `abierto:true` con `faltan:['ejes']` (sin ejes
    declarados ni catálogo) o por qué una fila sale `margen:null` (J2 no lo cerró: el tablero
    no lo completa por su cuenta).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del tablero (no recalcula margen, eje y catálogo como DATO, dato ausente = desconocido,
    no escribe ni persiste).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo tablero-margen-dimension.
tags: [enki, modulo, reflejo, contabilidad, tablero-margen-dimension]
---

# tablero-margen-dimension — REFLEJO STATELESS del cruce margen × dimensión

## Qué hace el módulo

`tablero-margen-dimension` es un **REFLEJO STATELESS** (J10, hoja del plan): **EL CRUCE MARGEN
× DIMENSIÓN** — el jefe ve qué línea mueve su margen. Una **TABLA de conjunto** (por centro,
por línea, por producto, por sociedad) construida cruzando la **MISMA cifra de margen** por
cada **eje declarado**.

Atributos del diseño: `margen:MargenAnalitico`, `dimensiones:Set<Dimension>`.
Métodos: `cruzar():Tabla`. Regla: **cruce margen × dimensión bajo lente de conjunto** (por
centro, familia o sociedad).

**================= NO DUPLICA J2: LEE EL MARGEN YA CALCULADO =================**

Este módulo **NO calcula margen**: para cada **EJE declarado** **PIDE** a `margen-analitico`
(J2) **POR EVENTO** (`margen-analitico.calcular.request`) su `por_dimension` **ya calculado**
y lo **COLOCA** en la tabla. **Cero aritmética de margen aquí**: la suma, la resta y el ratio
son de J2. El tablero solo **pivota y presenta**. Los hechos etiquetados (lo que hace posible
el corte) proceden del etiquetado de J1 (`etiquetado-analitico`, que **PROPONE** y **jamás
escribe**) a través de J2.

**EL EJE ES DECLARABLE**: por qué ejes se cruza (`centro` | `linea` | `producto` | `sociedad` |
cualquier eje declarado) es **DATO**. Sin ejes declarados se usan los que declare el **CATÁLOGO
de dimensiones** (cada dimensión declara su `tipo`); si tampoco hay catálogo, **NO se elige un
eje por defecto** — la tabla queda `[ABIERTO]` con `faltan:['ejes']` (**elegir el eje sería
decidir por el jefe**).

Invariantes:

- **NO RECALCULA MARGEN**: cada fila es la cifra de J2, con su **ORIGEN declarado**
  (`fuente:'margen-analitico'`).
- **DETERMINISTA**: mismo margen + mismos ejes → misma tabla.
- **Dato ausente = desconocido**: un eje sin cubetas → fila con `margen:null` y su motivo,
  **NUNCA 0**.
- **LEY/PARÁMETRO COMO DATO**: ejes y catálogo de dimensiones son entrada; cero constantes.
- **NO escribe, NO persiste, NO muta**: la tabla es un **DERIVADO de lectura**. Sin
  `PosPersistencia` ni `project.activated`.

Proyección única `_cruzar` (async: pide el margen a J2 por cada eje). Tool `toolCruzar`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `tablero-margen-dimension.cruzar.request` | `onCruzarRequest` | RPC reflejo (cruce puro, determinista): {project_id, periodo?, eje?/ejes?:['centro','linea','producto','sociedad'...], dimensiones?} → {project_id, periodo, fuente_dimensiones, fuente_ejes, ejes, tabla:[{eje, fuente:'margen-analitico', margen, ingresos, costes, ratio_margen, dimensiones:[{dimension, ingresos, costes, margen, ratio_margen, n_lineas}], abierto, motivo}], filas, dimensiones_declaradas, sin_margen, abierto, faltan, lente:'conjunto', motivo}. Para cada eje PIDE a margen-analitico (J2) su por_dimension YA CALCULADO por EVENTO — el tablero NO recalcula el margen; sin ejes declarados usa los tipos del catalogo declarado y si no hay catalogo deja la tabla abierta (faltan:['ejes']); un eje sin cubetas → fila con margen:null (nunca 0). Responde por tablero-margen-dimension.cruzar.response; project_id ausente → tablero-margen-dimension.cruzar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `tablero-margen-dimension.cruzar.response` | Respuesta RPC correlada de tablero-margen-dimension.cruzar.request → {request_id, status:200, data:{tabla, ejes, sin_margen, faltan, lente:'conjunto'}}. Emitida por el helper _atender. |
| `tablero-margen-dimension.cruzar.failed` | Par de fallo determinista (J10): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de tablero-margen-dimension.cruzar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `tablero-margen-dimension.cruzar.failed` cierra el círculo de
> `tablero-margen-dimension.cruzar.request` cuando `_cruzar` devuelve status ≠ 200 (solo
> `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onCruzarRequest` publica
> `tablero-margen-dimension.cruzar.failed` **solo si `res.status !== 200`**; con `200` responde
> por `tablero-margen-dimension.cruzar.response` (vía `_atender`) y **no emite evento de
> dominio**.

> Nota: el módulo pide a `margen-analitico.calcular.request` (J2) **POR EVENTO** (una vez por
> eje, `timeout_ms:5000`) y el catálogo de dimensiones a
> `cola-declaraciones-criterio.ratificar.request` (K9) **POR EVENTO** (`timeout_ms:4000`, clave
> `'dimensiones'`) — dependencias salientes que **no figuran en `module.json`**. Tampoco
> figuran `_dimensiones`, `_catalogo`, `_ejes`, `_clave` ni `_num`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). `periodo` con `String(...)` o `null`.
2. **Las DIMENSIONES** (`_dimensiones`): `input.dimensiones` (o `input.criterio.dimensiones`)
   array → `{dimensiones: _catalogo(decl), fuente_dimensiones:'declarado'}`; si no, **POR
   EVENTO** `cola-declaraciones-criterio.ratificar.request` (K9) con `clave:'dimensiones'` →
   `data.criterio.valor` (array u objeto con `.dimensiones`) → `fuente_dimensiones:
   'cola-declaraciones-criterio'`. Sin catálogo → `dimensiones:[]`, `fuente_dimensiones:null`
   (**no se inventa**).
3. **`_catalogo`**: cada dimensión normaliza `{clave, tipo}`; `tipo` de `d.tipo ?? d.eje`;
   deduplica por `clave`. **El catálogo es DATO declarado.**
4. **Los EJES** (`_ejes`), en orden:
   - `input.ejes` (o `[input.eje]`) declarado → lista de strings deduplicada,
     `fuente_ejes:'declarado'`.
   - Sin ejes declarados: los **`tipo`** de cada dimensión del catálogo declarado (sin
     repetir) → `fuente_ejes:'catalogo_dimensiones'`.
   - Sin nada → `ejes:[]`, `fuente_ejes:null`.
5. **Sin ejes NO se cruza**: `ejes.length === 0` → `200` con `ejes:[]`, `tabla:[]`,
   `filas:0`, `abierto:true`, `faltan:['ejes']` y
   `motivo:'no se cruza el tablero: el eje (centro | linea | producto | sociedad) es
   DECLARABLE y no se declaro (elegirlo seria decidir por el jefe)'`.
6. **Por cada EJE se PIDE el margen a J2 POR EVENTO**: `margen-analitico.calcular.request`
   con `{project_id, periodo, eje, dimensiones}`, `timeout_ms:5000`. **El tablero NO
   recalcula el margen.**
7. **Fila sin margen** (`!data || !Array.isArray(data.por_dimension) || length === 0`): la
   fila se **DECLARA** sin cifra — `faltan.push(eje)` y fila con `margen:null`,
   `ingresos:null`, `costes:null`, `ratio_margen:null`, `dimensiones:[]`, `abierto:true` y
   motivo (`'el margen por ese eje no esta cerrado (J2 lo devolvio abierto): el tablero no lo
   completa por su cuenta'` si J2 respondió, o `'margen-analitico (J2) no respondio: el tablero
   no recalcula el margen'` si no). **NUNCA 0.**
8. **Fila con margen**: se copian **TAL CUAL** las cifras de J2 —
   `{eje, fuente:'margen-analitico', margen:data.margen_total, ingresos:data.ingresos_total,
   costes:data.costes_total, ratio_margen:data.parcial?.ratio_margen, dimensiones:
   data.por_dimension.map(c => ({dimension, ingresos, costes, margen, ratio_margen,
   n_lineas})), abierto:data.abierto === true, motivo:data.motivo ?? null}`.
9. **`sin_margen`**: las dimensiones del catálogo declarado que **NO** aparecen en ninguna fila
   — **se ve el hueco, no se oculta**. `faltan` incluye `'margen_de_<n>_dimension(es)'`.
10. **`abierto` y `faltan`**: `abierto = faltan.length > 0 || sin_margen.length > 0`. Si hay
    abierto, `motivo:'el tablero se compone con lo disponible; queda [ABIERTO] <faltan>'`.
11. **La respuesta**: `{project_id, periodo, fuente_dimensiones, fuente_ejes, ejes, tabla,
    filas, dimensiones_declaradas:<claves>, sin_margen, abierto, faltan, lente:'conjunto',
    motivo}`.
12. **`_clave(v)`**: `null`/`''` → `null`; objeto → `v.id ?? v.clave ?? v.nombre ?? v.centro
    ?? v.linea ?? v.producto ?? v.sociedad` (recursivo); si no → `String(v)`.
13. **`_num(v)`**: `undefined`/`null`/`''` → `null`; no finito → `null`.
14. **Puro**: sin estado, sin persistencia, sin reloj, sin azar. **Solo pivota y presenta.**
15. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `tablero-margen-dimension.cruzar.response`. **No emite evento de dominio.**

### 1. `cruzar` — tabla de margen por ejes declarados

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "ejes": ["centro", "producto"],
  "dimensiones": [ { "id": "C1", "tipo": "centro" }, { "id": "P1", "tipo": "producto" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "fuente_dimensiones": "declarado",
  "fuente_ejes": "declarado",
  "ejes": ["centro", "producto"],
  "tabla": [
    {
      "eje": "centro",
      "fuente": "margen-analitico",
      "margen": 1300, "ingresos": 2000, "costes": 700, "ratio_margen": 0.65,
      "dimensiones": [ { "dimension": "C1", "ingresos": 1200, "costes": 700, "margen": 500, "ratio_margen": 0.4167, "n_lineas": 2 } ],
      "abierto": false, "motivo": null
    }
  ],
  "filas": 1,
  "dimensiones_declaradas": ["C1", "P1"],
  "sin_margen": ["P1"],
  "abierto": true,
  "faltan": ["margen_de_1_dimension(es)"],
  "lente": "conjunto",
  "motivo": "el tablero se compone con lo disponible; queda [ABIERTO] margen_de_1_dimension(es)"
}
```

### 2. `cruzar` — sin ejes declarados ni catálogo → `[ABIERTO]`

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09" }
```

`200` con `ejes:[]`, `tabla:[]`, `abierto:true`, `faltan:['ejes']` y el motivo.
**Elegir el eje sería decidir por el jefe.**

### 3. `cruzar` — ejes desde el catálogo declarado

Sin `ejes` pero con `dimensiones:[{id:'C1', tipo:'centro'}]` → `ejes:['centro']`,
`fuente_ejes:'catalogo_dimensiones'`.

### 4. `cruzar` — un eje sin cubetas → `margen:null` (**nunca 0**)

Si J2 devuelve `abierto:true` (margen no cerrado) para ese eje → la fila sale con
`margen:null`, `abierto:true` y el motivo; `faltan` incluye el nombre del eje. **El tablero no
recalcula el margen.**

### 5. Fallo — falta `project_id`

Respuesta `400` + `tablero-margen-dimension.cruzar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/tablero-margen-dimension.test.js`. Cubre:

- `cruzar` con ejes declarados → `200` con la tabla, cada fila con `fuente:'margen-analitico'`
  y `lente:'conjunto'`.
- Sin ejes declarados ni catálogo → `ejes:[]`, `tabla:[]`, `faltan:['ejes']` (**no se elige
  eje por defecto**).
- Ejes tomados del `tipo` del catálogo declarado → `fuente_ejes:'catalogo_dimensiones'`.
- Un eje sin cubetas (J2 `abierto:true` o sin respuesta) → fila con `margen:null` y motivo
  (**nunca 0**); **el tablero no recalcula el margen**.
- Dimensión del catálogo ausente de todos los ejes → `sin_margen` declarado.
- Catálogo pedido a `cola-declaraciones-criterio` por evento (K9) → `fuente_dimensiones` lo
  declara.
- **Determinismo**: mismo margen + mismos ejes → misma tabla.
- `project_id` ausente → `400 INVALID_INPUT` + `tablero-margen-dimension.cruzar.failed`.
- `toolCruzar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `TableroMargenDimension extends ModuloHibridoReflejo`; `name =
  'tablero-margen-dimension'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store,
  sin `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/tablero-margen-dimension/`).
- `onCruzarRequest` usa `this._atender(e, 'cruzar',
  'tablero-margen-dimension.cruzar.response', async (d) => {...})` y publica el par `failed`
  si `status !== 200`.
- Proyección `_cruzar(input)` (async: pide el margen a J2 una vez por eje); helpers
  `_dimensiones`, `_catalogo`, `_ejes`, `_clave`, `_num`. Tool `toolCruzar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- **DEP**: LEE el margen de `margen-analitico` (J2) **POR EVENTO** (no lo recalcula) y el
  catálogo de dimensiones de `cola-declaraciones-criterio` (K9). Los hechos etiquetados vienen
  de `etiquetado-analitico` (J1, que PROPONE y jamás escribe) a través de J2.
- **PARÁMETRO COMO DATO**: los ejes y el catálogo de dimensiones son **declarables**; el código
  **no elige** ningún eje por defecto. **NO RECALCULA MARGEN**: cada fila es la cifra de J2.
