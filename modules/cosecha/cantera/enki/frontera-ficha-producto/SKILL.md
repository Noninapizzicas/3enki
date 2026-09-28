---
name: frontera-ficha-producto
description: >
  Skill FULL del módulo CONVERSOR `frontera-ficha-producto` de la vertical
  contabilidad de Enki (H2, hoja del plan). LA FRONTERA ÚNICA DE FORMATOS del coste
  (invariante 10): por donde CRUZA el coste de la ficha de producto de OTRA vertical
  (ficha, receta, tarifa, otro) al dato interno contable. El coste EXTERNO se ADAPTA
  a la forma interna (mapa de campos declarado); NO se reinterpreta ni se recalcula.
  La fuente de coste es DECLARABLE por negocio (canal/catálogo de adaptadores); si
  falta → se CREA (`_crearFrontera`, invariante de puerto abierto). NUNCA se inventa
  un coste: si el dato no viene, se marca `AUSENTE` y la fuente `[ABIERTO]` — dato
  ausente = desconocido (invariante 7), jamás 0. Es stateless: sin PosPersistencia ni
  `project.activated` — entra objeto, sale objeto. Úsala para operar, depurar o
  extender el conversor, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites leer el coste de una ficha de producto cruzando la frontera de
    formato (RPC contabilidad.ficha.coste.request).
  - Cuando depures por qué el coste sale AUSENTE (dato ausente ≠ 0), por qué la
    fuente queda [ABIERTO] (fuente no declarada), o por qué se rechaza la petición
    (400 INVALID_INPUT si falta project_id/producto).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué la
    frontera es única y declarable por negocio, y por qué no reinterpreta el coste.
  - Cuando vayas a escribir/ampliar el test unitario del conversor
    frontera-ficha-producto.
tags: [enki, modulo, conversor, contabilidad, frontera-ficha-producto, coste, frontera]
---

# frontera-ficha-producto — CONVERSOR · la frontera única de formatos del coste

## Qué hace el módulo

`frontera-ficha-producto` es un **CONVERSOR STATELESS** (H2, hoja del plan): la
**FRONTERA ÚNICA DE FORMATOS** del coste (invariante 10 del dominio). Por aquí
**CRUZA** el coste de la ficha de producto de **OTRA vertical** (ficha, receta,
tarifa, otro) hacia el **dato interno contable**. El coste **EXTERNO** se **ADAPTA**
a la forma interna mediante un **mapa de campos declarado**; **NO** se reinterpreta
ni se recalcula.

La **fuente de coste es DECLARABLE por negocio** (canal/catálogo de adaptadores); si
falta una fuente → **se CREA** (`_crearFrontera`, invariante de **puerto abierto**).
**NUNCA se inventa un coste**: si el dato no viene, se marca **`AUSENTE`** y la
fuente **`[ABIERTO]`** — *dato ausente = desconocido* (invariante 7), **jamás 0**.

Es **stateless**: **sin PosPersistencia ni `project.activated`** — **entra objeto,
sale objeto**. El catálogo declarable de fuentes vive **solo en memoria del proceso**
(`this._fuentes`, un `Map`), no en disco: es el **registro de adaptadores puestos en
el sitio**, no una parcela de dominio. La dependencia con otras verticales es **por
EVENTO/payload, NUNCA por `require` cruzado**.

> **NO REUTILIZA**: la frontera de coste (ficha/receta/otro) es declarable por
> negocio; `pizzepos/escandallo` es mono-negocio y se pone **POR ENCIMA**, no se
> toca.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.ficha.coste.request` | `onCosteRequest` | RPC conversor: {project_id, negocio?, producto:{...}\|ficha, fuente?, mapa?} → {project_id, negocio, producto, coste, moneda, unidad, fuente, ausente, simbolico:'AUSENTE'\|null, no_inventa:true}. UNICA puerta de formato: adapta el coste externo a la forma interna (mapa de campos declarado). Si no hay fuente declarada → [ABIERTO]; si el coste no viene → AUSENTE (dato ausente = desconocido, jamas 0). Exito publica contabilidad.coste_leido y responde por contabilidad.ficha.coste.response; payload invalido → contabilidad.ficha.coste.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.coste_leido` | Fire-and-forget (H2): el coste de la ficha cruzo la frontera y quedo adaptado al dato interno (o se declaro AUSENTE si no viene) → {project_id, negocio, producto, coste, moneda, unidad, fuente, ausente, no_inventa}. Lo consume valoracion-existencia (H1/H4) como coste de entrada; jamas un coste inventado. |
| `contabilidad.ficha.coste.failed` | Par de fallo determinista: peticion sin project_id, sin producto, o fuente no declarable (400). Cierra el circulo de contabilidad.ficha.coste.request. |
| `contabilidad.coste_leido.failed` | Par de fallo del evento de dominio contabilidad.coste_leido: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.ficha.coste.failed` cierra `contabilidad.ficha.coste.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.ficha.coste.response` (el par response del RPC); **NO está declarada
> en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical:
> el par de fallo real es `<op>.failed`) — `contabilidad.coste_leido.failed` es el par
> del evento de **DOMINIO**; el conversor solo publica el par `*.failed` de su RPC
> (`contabilidad.ficha.coste.failed`).

## Reglas de negocio

1. **Frontera ÚNICA de formato**: `_leerCoste` es la **sola** puerta por la que el
   coste de la ficha cruza al dato contable. **Adapta, no juzga**: no reinterpreta ni
   recalcula el coste de la fuente.
2. **Adaptación por mapa declarado**: `_adaptar` copia el **origen**
   (`producto.payload` / `producto.datos` / el propio `producto`) y, si la fuente
   trae un `mapa` `{destino: campoFuente}`, aplica cada mapeo (`salida[destino] =
   origen[campoFuente]`). El mapa **añade/sobreescribe** destinos; no inventa campos.
3. **Fuente DECLARABLE por negocio, puerto ABIERTO**: la fuente se toma de
   `input.fuente` o del catálogo en memoria `this._fuentes.get(negocio)`. Si **no hay
   fuente declarada** → la respuesta sigue siendo `200` pero con `fuente:null`,
   `ausente:true`, `simbolico:'AUSENTE'` y `abierto:'[ABIERTO]'` (el sistema **no
   asume** una fuente de coste). `_crearFrontera` la crea si el negocio la declara.
4. **NUNCA se inventa un coste (dato ausente = desconocido)**: si el importe de la
   fuente no es finito (`_importeDe` sobre `coste`/`coste_unitario`/`precio_coste`/
   `importe`), se devuelve `ausente:true`, `coste:null`, `simbolico:'AUSENTE'` y
   `no_inventa:true` — **jamás 0**.
5. **Lectura honesta del importe**: el coste adaptado se **redondea a 4 decimales**
   (`_round(importe, 4)`); `moneda`/`unidad` salen del adaptado o del payload; la
   respuesta lleva `no_inventa:true` y `adaptado:true` cuando hubo importe.
6. **`_crearFrontera` (puerto abierto)**: exige `project_id` (`400 INVALID_INPUT
   project_id`) y `canal` (`400 INVALID_INPUT canal`); guarda `{negocio, canal,
   adaptador, mapa, creado_en}` en `this._fuentes` y responde `creada:true`,
   `puerto_abierto:true`.
7. **Validaciones deterministas de entrada**: falta `project_id` → `400 INVALID_INPUT
   project_id`; `producto` ausente/no objeto → `400 INVALID_INPUT producto`. Shape:
   `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido',
   details:{ field:<campo> } } }`.
8. **HTTP exacto**: éxito `200`; payload inválido → `400`; excepción en `_atender` →
   `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

El único RPC responde en `contabilidad.ficha.coste.response`.

### 1. `coste` — con fuente y mapa declarados (adapta el coste)

```json
{
  "project_id": "e57a318a-...",
  "negocio": "TIENDA-A",
  "producto": { "codigo": "P-001", "datos": { "precio_compra": 12.5 }, "moneda": "EUR" },
  "fuente": { "canal": "FICHA", "mapa": { "coste_unitario": "precio_compra" } }
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "negocio": "TIENDA-A",
  "producto": "P-001",
  "coste": 12.5,
  "moneda": "EUR",
  "unidad": null,
  "fuente": "FICHA",
  "ausente": false,
  "simbolico": null,
  "no_inventa": true,
  "adaptado": true
}
```

Emite `contabilidad.coste_leido` (res.data + `correlation_id`).

### 2. `coste` — fuente NO declarada → [ABIERTO] y AUSENTE

Sin `fuente` (ni en el payload ni en el catálogo) → `200` con `fuente:null`,
`ausente:true`, `simbolico:'AUSENTE'`, `abierto:'[ABIERTO]'` y la nota *«fuente de
coste NO declarada: se marca [ABIERTO] y AUSENTE, NUNCA se inventa un coste»*.

### 3. `coste` — el coste no viene en la fuente → AUSENTE (jamás 0)

Fuente declarada pero sin importe → `200` con `coste:null`, `ausente:true`,
`simbolico:'AUSENTE'` y la nota *«el coste no viene en la fuente: dato ausente =
desconocido (invariante 7), jamas 0»*.

### 4. Fallo — payload inválido

```json
{ "producto": { "codigo": "P-001" } }
```

Respuesta `400` + `contabilidad.ficha.coste.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

### 5. Tools (sin RPC en module.json)

`toolLeerCoste` → `_leerCoste`; `toolCrearFrontera` → `_crearFrontera`.

## Tests

El test viviría en `tests/unit/frontera-ficha-producto.test.js`. Cubre:

- `coste` con fuente y mapa declarados → `200`, `coste` adaptado
  (`precio_compra`→`coste_unitario`), `no_inventa:true`; emite
  `contabilidad.coste_leido`.
- **Fuente no declarada** → `200`, `ausente:true`, `simbolico:'AUSENTE'`,
  `abierto:'[ABIERTO]'` (**no se asume la fuente**).
- **El coste no viene** → `ausente:true`, `coste:null` (**jamás 0**).
- `crearFrontera` con `canal` → `200`, `creada:true`, `puerto_abierto:true`; sin
  `canal` → `400 INVALID_INPUT canal`.
- `coste` sin `project_id`/`producto` → `400 INVALID_INPUT` +
  `contabilidad.ficha.coste.failed`.
- El conversor es **stateless**: sin `project.activated` ni persistencia (el catálogo
  vive solo en memoria del proceso).

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/frontera-ficha-producto
node --test tests/unit/frontera-ficha-producto.test.js
```

## Notas de implementación

- Clase `FronteraFichaProducto extends ModuloHibridoReflejo`; `name =
  'frontera-ficha-producto'`, `version = 'reflejo-0.1.0'` (manifest `0.1.0`). **Sin
  store** (conversor stateless: no hay PosPersistencia ni `project.activated`). El
  único estado es el catálogo en memoria `this._fuentes` (Map negocio → fuente).
- Constantes: `AUSENTE = 'AUSENTE'` y `ABIERTO = '[ABIERTO]'`.
- `onCosteRequest` delega en `_atender(e, 'coste', 'contabilidad.ficha.coste.response',
  fn)`: en éxito `200` publica `contabilidad.coste_leido` (`{...res.data,
  correlation_id}`); en fallo publica `contabilidad.ficha.coste.failed` con `res`.
- Proyecciones puras: `_leerCoste`, `_crearFrontera`, `_adaptar`, `_importeDe`.
  `_invalid` (→ 400 INVALID_INPUT `{field}`) y `_errorResponse` vienen de
  `modulo-hibrido-reflejo`/`base-module`; `_round` de la base.
- Tools: `toolLeerCoste`, `toolCrearFrontera`.
- DEP hacia delante: `contabilidad.coste_leido` lo consume `valoracion-existencia`
  (H1/H4) como coste de entrada. Dependencia con otras verticales **por EVENTO/payload**,
  NUNCA por `require` cruzado. `pizzepos/escandallo` (mono-negocio) se pone POR ENCIMA,
  no se toca.
