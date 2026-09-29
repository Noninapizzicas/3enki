---
name: coste-indirecto
description: >
  Skill FULL del módulo REFLEJO `coste-indirecto` de la vertical contabilidad de Enki.
  APLICA EL REPARTO DECLARADO de gastos no directos por dimensión analítica — criterios de
  reparto declarables (método, bases, porcentajes) y sin criterio declarado no reparte nada,
  porque partir a medias es decidir por el jefe. Sin estado. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites repartir un coste indirecto entre dimensiones analíticas (RPC
    coste-indirecto.repartir.request).
  - Cuando depures por qué `reparto:null` con `abierto:true` (falta coste, dimensiones o
    criterio declarado) o por qué el reparto se declara inconsistente (porcentajes que no
    suman 1, importes que superan el coste, método desconocido).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del reflejo (determinista, criterio como DATO, nada se reparte a medias por defecto, no
    escribe ni persiste).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo coste-indirecto.
tags: [enki, modulo, reflejo, contabilidad, coste-indirecto]
---

# coste-indirecto — REFLEJO STATELESS del reparto de gastos no directos

## Qué hace el módulo

`coste-indirecto` es un **REFLEJO STATELESS** (J5, hoja del plan): **EL REPARTO DE LOS GASTOS
NO DIRECTOS** — la luz, el alquiler, el sueldo de dirección… no son de un centro, **son de
todos**. Este reflejo **APLICA** el reparto que el negocio ha **DECLARADO** y devuelve cuánto
toca a cada **dimensión analítica**. Determinista: mismo coste + mismo criterio + mismas bases
→ el mismo reparto (**una sola respuesta correcta**).

Atributos del diseño: `reparto:ParametroDeclarable`.
Métodos: `repartir(coste, dimensiones):Map<Dimension,Cuantía>`. Regla: **aplica el reparto
DECLARADO de gastos no directos.**

**LOS CRITERIOS DE REPARTO SON DECLARABLES** (invariante: LEY/PARÁMETRO COMO DATO). El reflejo
**NO cablea** ningún método de reparto ni ningún porcentaje: el método, las bases y los pesos
entran como **DATO** en `criterio` — o se piden a `cola-declaraciones-criterio` (K9) **POR
EVENTO** (best-effort, clave `'reparto'`). **Sin criterio declarado NO se reparte**:
`reparto:null`, `abierto:true` con lo que falta. **Jamás se reparte a partes iguales por
defecto**: partir a medias es una **DECISIÓN**, y esa decisión es del jefe.

**Métodos DECLARADOS admitidos** (el método es dato, no lógica cableada):

- `'proporcional'` | `'base'` → en proporción a la **BASE declarada** de cada dimensión
  (ej. m2, horas).
- `'porcentaje'` → según el **porcentaje declarado** de cada dimensión (debe sumar `1`; si no,
  el reparto se **DECLARA inconsistente** en vez de normalizarse solo).
- `'manual'` | `'importe'` → cada dimensión declara su **importe** directamente (no puede
  superar el coste).

Cualquier método no declarado/desconocido → `[ABIERTO]` (**no se adivina la intención del
jefe**).

**CUBRE LO QUE LA PIEZA EXISTENTE NO CUBRE PARA GRUPO**: el reparto se hace por **DIMENSIÓN
analítica declarada** (centro, línea, producto, sociedad…), **sin tocar el escandallo ni la
ficha de producto**.

Invariantes:

- **DETERMINISTA**: mismo coste + mismo criterio + mismas bases → mismo reparto.
- **Dato ausente = desconocido**: sin coste, sin dimensiones o sin criterio → `[ABIERTO]`,
  nada se estima; un porcentaje que no cierra al 100% se **DECLARA** inconsistente en vez de
  normalizarse solo. **El RESTO se declara** (no se reasigna a dedo).
- **NO escribe, NO persiste, NO muta**: el reparto es un **DERIVADO**; la imputación al
  asiento es de otro. Sin `PosPersistencia` ni `project.activated`.

Proyección única `_repartir` (async: puede pedir el criterio a K9 por evento). Tool
`toolRepartir`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `coste-indirecto.repartir.request` | `onRepartirRequest` | RPC reflejo (calculo puro, determinista): {project_id, coste\|importe, dimensiones:[{id\|clave, base?/porcentaje?/importe?}] u objeto por clave, criterio?:{metodo:'proporcional'\|'base'\|'porcentaje'\|'manual'\|'importe', bases?/porcentajes?/importes?}, periodo?} → {project_id, periodo, coste, fuente_criterio, criterio, metodo, reparto:[{dimension, base?, cuota, importe}], importe_repartido, resto, abierto, faltan, motivo}. Aplica el reparto DECLARADO (no cablea ningun metodo ni porcentaje): el criterio entra declarado o se pide a cola-declaraciones-criterio (K9) POR EVENTO. Sin coste, sin dimensiones o sin criterio declarado → reparto:null y abierto:true (jamas a partes iguales por defecto); porcentajes que no suman 1 o importes que superan el coste → [ABIERTO] declarado, no normalizado. Responde por coste-indirecto.repartir.response; project_id ausente → coste-indirecto.repartir.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `coste-indirecto.repartir.response` | Respuesta RPC correlada de coste-indirecto.repartir.request → {request_id, status:200, data:{metodo, reparto, importe_repartido, resto, abierto, faltan}}. Emitida por el helper _atender. |
| `coste-indirecto.repartir.failed` | Par de fallo determinista (J5): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de coste-indirecto.repartir.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `coste-indirecto.repartir.failed` cierra el círculo de
> `coste-indirecto.repartir.request` cuando `_repartir` devuelve status ≠ 200 (solo
> `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onRepartirRequest` publica
> `coste-indirecto.repartir.failed` **solo si `res.status !== 200`**; con `200` responde por
> `coste-indirecto.repartir.response` (vía `_atender`) y **no emite evento de dominio**. Las
> ramas `[ABIERTO]` por criterio/método faltante o reparto inconsistente devuelven `200` con
> `abierto:true` (sin evento).

> Nota: el módulo pide el criterio a `cola-declaraciones-criterio.ratificar.request` (K9)
> **POR EVENTO** con `timeout_ms:4000` cuando no viene declarado. Ese RPC **no figura en
> `module.json`** (dependencia saliente). Tampoco figuran `_aplicar`, `_criterio`, `_metodo`,
> `_dimensiones`, `_clave`, `_num` ni la constante `TOLERANCIA`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). `periodo` con `String(...)` o `null`.
2. **El COSTE**: `_num(input.coste ?? input.importe)`; no numérico → `null` (**no se estima**).
3. **Las DIMENSIONES** (`_dimensiones`): `input.dimensiones` array, o un objeto cuyas claves
   se convierten en `{id: clave}`. Cada entrada normaliza `{dimension, base, porcentaje,
   importe}` tomando `base` de `obj.base ?? obj.peso ?? obj.horas ?? obj.m2`, `porcentaje` de
   `obj.porcentaje ?? obj.pct ?? obj.cuota`, `importe` de `obj.importe ?? obj.coste`. Deduplica
   por `dimension`. **La dimensión es DATO declarado.**
4. **El CRITERIO** (`_criterio`): `input.criterio` objeto → `{criterio, fuente_criterio:
   'declarado'}`; si no, **POR EVENTO** `cola-declaraciones-criterio.ratificar.request`
   (`{project_id, clave:'reparto'}`); `data.criterio.valor` objeto → `fuente_criterio:
   'cola-declaraciones-criterio'`. Sin criterio → `null` (**no hay método por defecto**).
5. **Sin lo mínimo NO se reparte**: si falta `coste`, `dimensiones` o `criterio` → `200` con
   `reparto:null`, `importe_repartido:null`, `resto:null`, `abierto:true`, `faltan` con los
   nombres (`'coste'`, `'dimensiones'`, `'criterio_reparto'`) y
   `motivo:'no se reparte el coste indirecto: falta <faltan> (un reparto sin criterio
   declarado por el jefe no es un reparto)'`.
6. **El MÉTODO** (`_metodo`): `String(criterio.metodo || criterio.criterio || criterio.tipo
   || '').toLowerCase()`. Si no está en `METODOS_ADMITIDOS`
   (`'proporcional'|'base'|'porcentaje'|'manual'|'importe'`) → `200` con `reparto:null`,
   `abierto:true`, `faltan:['metodo_declarado']` y el motivo (**no se adivina la intención del
   jefe**).
7. **Reparto `proporcional`/`base`** (`_aplicar`): bases de `criterio.bases[d.dimension]` o
   `d.base`; `suma = Σ bases`. Sin base agregada `> 0` → `[ABIERTO]` con
   `faltan:['bases_de_reparto']`. Por dimensión: `base`, `cuota = round(base/suma, 6)`,
   `importe = round(coste * (base/suma), 2)`.
8. **Reparto `porcentaje`**: porcentajes de `criterio.porcentajes[d.dimension]` o
   `d.porcentaje`; si alguna dimensión no lo declara → `[ABIERTO]` con
   `faltan:['porcentajes_de_reparto']`. Si `|Σ − 1| > TOLERANCIA` (`1e-6`) → `[ABIERTO]` con
   `faltan:['porcentajes_que_suman_1']` y `detalle:{suma}` (**no se normaliza en silencio**).
   Por dimensión: `cuota`, `importe = round(coste * cuota, 2)`.
9. **Reparto `manual`/`importe`**: importes de `criterio.importes[d.dimension]` o `d.importe`;
   si falta alguno → `[ABIERTO]` con `faltan:['importes_de_reparto']`. Si `Σ − coste >
   TOLERANCIA` → `[ABIERTO]` con `faltan:['importes_que_no_superen_el_coste']` y
   `detalle:{suma, coste}`. Por dimensión: `cuota = round(suma > 0 ? importe/suma : 0, 6)`,
   `importe`.
10. **El RESTO se declara**: `importe_repartido = round(Σ importes, 2)`;
    `resto = round(coste − importe_repartido, 2)` — **no se esconde ni se reasigna a dedo**.
11. **Éxito**: `200` con `reparto` (las líneas), `importe_repartido`, `resto`, `abierto:false`,
    `faltan:[]`, `motivo:null`.
12. **`_clave(v)`**: `null`/`''` → `null`; objeto → `v.id ?? v.clave ?? v.nombre ??
    v.dimension ?? v.centro ?? v.linea ?? v.producto ?? v.sociedad` (recursivo); si no →
    `String(v)`.
13. **`_num(v)`**: `undefined`/`null`/`''` → `null`; no finito → `null`.
14. **`TOLERANCIA = 1e-6`**: **constante aritmética de comparación**, **no una regla de
    negocio** — el criterio de reparto sigue siendo dato.
15. **Puro**: sin estado, sin persistencia, sin reloj, sin azar.
16. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `coste-indirecto.repartir.response`. **No emite evento de dominio.**

### 1. `repartir` — reparto declarado por bases (proporcional)

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "coste": 1000,
  "dimensiones": [ { "id": "C1", "base": 60 }, { "id": "C2", "base": 40 } ],
  "criterio": { "metodo": "proporcional", "bases": { "C1": 60, "C2": 40 } },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "coste": 1000,
  "n_dimensiones": 2,
  "fuente_criterio": "declarado",
  "criterio": { "metodo": "proporcional", "bases": { "C1": 60, "C2": 40 } },
  "metodo": "proporcional",
  "reparto": [
    { "dimension": "C1", "base": 60, "cuota": 0.6, "importe": 600 },
    { "dimension": "C2", "base": 40, "cuota": 0.4, "importe": 400 }
  ],
  "importe_repartido": 1000,
  "resto": 0,
  "abierto": false,
  "faltan": [],
  "motivo": null
}
```

### 2. `repartir` — sin criterio declarado **no se reparte**

```json
{ "project_id": "e57a318a-...", "coste": 1000, "dimensiones": [ { "id": "C1" }, { "id": "C2" } ] }
```

`200` con `reparto:null`, `abierto:true`, `faltan:['criterio_reparto']` y el motivo.
**Jamás se reparte a partes iguales por defecto.**

### 3. `repartir` — porcentajes que no suman 1 → inconsistente declarado

Con `criterio:{metodo:'porcentaje', porcentajes:{C1:0.5, C2:0.3}}` → `200` con
`reparto:null`, `abierto:true`, `faltan:['porcentajes_que_suman_1']`,
`detalle:{suma:0.8}` (**no se normaliza en silencio**).

### 4. `repartir` — importes que superan el coste → inconsistente declarado

Con `criterio:{metodo:'manual', importes:{C1:800, C2:400}}` y `coste:1000` → `200` con
`reparto:null`, `abierto:true`, `faltan:['importes_que_no_superen_el_coste']`,
`detalle:{suma:1200, coste:1000}`.

### 5. `repartir` — método desconocido → `[ABIERTO]`

`criterio:{metodo:'a_ojo'}` → `200` con `metodo:'a_ojo'`, `reparto:null`, `abierto:true`,
`faltan:['metodo_declarado']` (**no se adivina la intención del jefe**).

### 6. Fallo — falta `project_id`

Respuesta `400` + `coste-indirecto.repartir.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/coste-indirecto.test.js`. Cubre:

- `repartir` con criterio `proporcional` declarado → `200` con `reparto` por bases,
  `importe_repartido` y `resto`.
- Sin criterio declarado → `reparto:null`, `abierto:true`,
  `faltan:['criterio_reparto']` (**nada a partes iguales por defecto**).
- `porcentaje` que no suma 1 → `[ABIERTO]` con `faltan:['porcentajes_que_suman_1']` y
  `detalle` (**no se normaliza en silencio**).
- `importe` que supera el coste → `[ABIERTO]` con
  `faltan:['importes_que_no_superen_el_coste']`.
- Método desconocido → `[ABIERTO]` con `faltan:['metodo_declarado']`.
- Criterio pedido a `cola-declaraciones-criterio` por evento (K9) → `fuente_criterio` lo
  declara.
- **Determinismo**: mismo coste + mismo criterio + mismas bases → mismo reparto.
- `project_id` ausente → `400 INVALID_INPUT` + `coste-indirecto.repartir.failed`.
- `toolRepartir` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CosteIndirecto extends ModuloHibridoReflejo`; `name = 'coste-indirecto'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/coste-indirecto/`).
- Constantes: `METODOS_ADMITIDOS = new Set(['proporcional','base','porcentaje','manual',
  'importe'])` (solo los NOMBRES) y `TOLERANCIA = 1e-6` (comparación aritmética, **no regla de
  negocio**).
- `onRepartirRequest` usa `this._atender(e, 'repartir', 'coste-indirecto.repartir.response',
  async (d) => {...})` y publica el par `failed` si `status !== 200`.
- Proyección `_repartir(input)` (async: puede pedir el criterio a K9 por evento); helpers
  `_aplicar`, `_criterio`, `_metodo`, `_dimensiones`, `_clave`, `_num`. Tool `toolRepartir`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- **DEP**: pide el criterio de reparto a `cola-declaraciones-criterio` (K9) por EVENTO. El
  reparto es un **DERIVADO**; la imputación al asiento es de otro módulo.
- **PARÁMETRO COMO DATO**: método, bases, porcentajes e importes son **declarables**; el
  código **no cablea** ningún método ni ningún porcentaje y **no reparte a medias por
  defecto**.
