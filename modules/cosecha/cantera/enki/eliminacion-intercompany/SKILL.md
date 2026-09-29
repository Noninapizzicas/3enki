---
name: eliminacion-intercompany
description: >
  Skill FULL del módulo REFLEJO `eliminacion-intercompany` de la vertical contabilidad de Enki.
  LAS ELIMINACIONES DE OPERACIONES INTERNAS entre sociedades del grupo: detecta el CRUCE interno
  y devuelve el conjunto de partidas a eliminar, con su anulación y el neto. DETERMINISTA, con
  reglas DECLARABLES (grupo, umbral, cuentas internas); sin perímetro declarado nada se adivina.
  Solo elimina el cruce inter-grupo. Sin estado. Úsala para operar, depurar o extender el
  reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites las eliminaciones intercompany de un grupo de sociedades (RPC
    eliminacion-intercompany.eliminar.request).
  - Cuando depures por qué `eliminaciones` sale vacía y `abierto:true` (sin partidas o sin grupo
    declarado) o por qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (determinista y ordenado, ley como dato, perímetro no se adivina, propone sin
    escribir).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo eliminacion-intercompany.
tags: [enki, modulo, reflejo, contabilidad, eliminacion-intercompany]
---

# eliminacion-intercompany — REFLEJO de las eliminaciones de operaciones internas

## Qué hace el módulo

`eliminacion-intercompany` es un **REFLEJO STATELESS** (I2, hoja del plan): **LAS ELIMINACIONES
DE OPERACIONES INTERNAS** entre sociedades del grupo. Detecta el **CRUCE INTERNO** (una partida
de una sociedad contra **otra sociedad del MISMO grupo**) y devuelve el conjunto de **PARTIDAS A
ELIMINAR** en la consolidación. **DETERMINISTA**: la detección es un **emparejamiento por
reglas**, no un juicio.

Atributos del diseño: `asientos:Flujo<Asiento>`.

- Las **PARTIDAS** llegan **DECLARADAS** o se piden a `marca-sociedad` (I1) **POR EVENTO**
  (`marca-sociedad.marcar.request` vía `_rpc`, best-effort). La marca de sociedad es lo que hace
  posible saber que dos partidas son del mismo grupo y se cruzan.
- **REGLAS DECLARABLES (LEY COMO DATO — cero constantes)**:
  - `criterio.grupo` / `criterio.sociedades` → el perímetro del grupo.
  - `criterio.umbral` → tolerancia declarada.
  - `criterio.cuentas_internas` → cuentas marcadas como internas (si se declaran).
- **Un grupo NO declarado → `[ABIERTO]`: no se adivina el perímetro.**
- La **ELIMINACIÓN es una PROPUESTA** de partidas: el reflejo **NO escribe, NO borra, NO
  persiste**; devuelve por cada cruce la partida, su contraparte y el importe de su anulación,
  con el neto del conjunto.

Invariantes:

- **DETERMINISTA**: mismas entradas → mismas eliminaciones (una sola respuesta), **ordenadas por
  `id_partida`** para reproducibilidad.
- **Dato ausente = desconocido**: sin partidas o sin grupo declarado → `eliminaciones` vacías y
  `abierto:true` con lo que falta. **Nada se estima.**
- **NO escribe, NO persiste**: las partidas son del diario.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_eliminar`.
Cierra el círculo de error con `eliminacion-intercompany.eliminar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `eliminacion-intercompany.eliminar.request` | `onEliminarRequest` | RPC reflejo (deteccion pura, determinista): {project_id, partidas?/asientos?, criterio?:{grupo\|sociedades, umbral, cuentas_internas}} → {project_id, fuente_partidas, criterio, eliminaciones:[{id_partida, sociedad, sociedad_contraparte, cuenta, importe, anulacion, motivo}], n_eliminaciones, neto, abierto, faltan, motivo}. Detecta el cruce interno (sociedad ≠ sociedad_contraparte, ambas en el grupo declarado) y devuelve el Set<Partida> a eliminar con su anulacion. Las partidas llegan declaradas o se piden a marca-sociedad (I1) POR EVENTO. Sin partidas o sin grupo declarado → eliminaciones vacias y abierto:true (nada se estima; el perimetro no se adivina). Responde por eliminacion-intercompany.eliminar.response; project_id ausente → eliminacion-intercompany.eliminar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `eliminacion-intercompany.eliminar.response` | Respuesta RPC correlada de eliminacion-intercompany.eliminar.request → {request_id, status:200, data:{eliminaciones, n_eliminaciones, neto, faltan, abierto}}. Emitida por el helper _atender. |
| `eliminacion-intercompany.eliminar.failed` | Par de fallo determinista (I2): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de eliminacion-intercompany.eliminar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `eliminacion-intercompany.eliminar.failed` cierra el círculo de
> `eliminacion-intercompany.eliminar.request` cuando `_eliminar` devuelve status ≠ 200 (el único
> camino: `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onEliminarRequest` publica el par `failed` **solo
> si `res.status !== 200`**; el camino de éxito lo cierra `_atender` con
> `eliminacion-intercompany.eliminar.response`. Un resultado `[ABIERTO]` (sin partidas o sin
> grupo) sigue siendo un `200`.

> Nota de sub-declaración (cruce con `index.js`): **no está en `module.json` pero sí lo emite
> `index.js` en `_partidas`** la RPC saliente `marca-sociedad.marcar.request`
> (`{project_id, listar:true, periodo}`, `timeout_ms:4000`) — es una **DEP por evento**, no un
> evento emitido.

> Nota: el módulo expone `toolEliminar(params)` como **tool directa** — no es un evento del bus,
> no figura en `module.json`. Tampoco figuran `_partidas`, `_criterio`, `_clave` ni `_num`
> (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **Las PARTIDAS se resuelven en `_partidas`**, declarando `fuente_partidas`:
   - `input.partidas` o `input.asientos` array → **declaradas**. Si un asiento trae
     `a.partidas` array, **se aplanan** (`p.sociedad ?? a.sociedad`) sin reinterpretar; si no,
     el asiento se toma como partida. `fuente_partidas:'declarado'`.
   - si no, RPC `marca-sociedad.marcar.request` **por evento** con `{listar:true}`; si vuelve
     `data.marcas` array → `fuente_partidas:'marca-sociedad'`; si no → `{partidas:null, null}`.
3. **Sin partidas** (`partidas === null`) → `200` con `eliminaciones:[]`, `neto:null`,
   `abierto:true`, `faltan:['partidas']` y `motivo` declarando que no hay partidas ni marcas que
   consultar.
4. **El CRITERIO de grupo se resuelve en `_criterio`** (ParametroDeclarable, cero constantes):
   - `c.grupo || c.sociedades || input.grupo || input.sociedades` → array (o `[valor]`); cada
     elemento normalizado con `_clave` (`objeto.id ?? objeto.nombre ?? objeto.sociedad`); los
     `null` se filtran. `conjunto = new Set(sociedades)`.
   - `umbral` = `c.umbral ?? input.umbral` (`_num`).
   - `internas` = `Set(String(...))` de `c.cuentas_internas || input.cuentas_internas || []`.
5. **Sin grupo declarado** (`sociedades.length === 0`) → `200` con `eliminaciones:[]`,
   `neto:null`, `abierto:true`, `faltan:['criterio.grupo']` y `motivo:'no se adivina el
   perimetro: falta el grupo declarado (criterio.grupo / sociedades)'`. **El perímetro NO se
   adivina.**
6. **La DETECCIÓN del cruce interno** (determinista, por partida):
   - `soc` = `_clave(p.sociedad)`; `contraparte` = `_clave(p.sociedad_contraparte ?? p.contraparte)`.
   - **Se salta** si `soc` o `contraparte` es `null`, o si `soc === contraparte` (misma sociedad
     no es cruce), o si alguno **no está en el grupo declarado** (`criterio.conjunto`).
   - **Se salta sin importe**: `importe = _num(p.importe)`; `null` → no hay cruce valorado (**no
     se estima**).
7. **La ELIMINACIÓN propuesta** por cruce: `{id_partida, sociedad, sociedad_contraparte, cuenta,
   cuenta_interna, importe, anulacion, motivo:'cruce interno entre sociedades del grupo
   declarado'}`.
   - `id_partida` = `p.id_partida ?? p.id`; `cuenta` = `p.cuenta ?? null`.
   - `cuenta_interna` = `criterio.internas.size > 0 ? criterio.internas.has(String(p.cuenta)) :
     null` (**`null` si no se declararon cuentas internas: no se asume**).
   - `importe` redondeado a 2; **`anulacion` = `−importe`** (declara el signo de su anulación).
8. **El NETO** = suma de los importes de los cruces detectados, redondeado a 2.
9. **Orden determinista**: `eliminaciones.sort` por `String(id_partida).localeCompare(...)`.
10. **El criterio se DECLARA en la respuesta**: `{sociedades, umbral, cuentas_internas}`
    (el `Set` de internas → array).
11. **NO escribe, NO borra, NO persiste**: las partidas son del diario. Stateless.
12. **HTTP exacto**: éxito `200` (con eliminaciones o `[ABIERTO]`); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `eliminacion-intercompany.eliminar.response`; el error cierra con
`eliminacion-intercompany.eliminar.failed`.

### 1. `eliminar` — cruce interno detectado y propuesto

```json
{
  "project_id": "e57a318a-...",
  "partidas": [
    { "id_partida": "P-01", "sociedad": "HOLDING-NORTE", "sociedad_contraparte": "FILIAL-SUR", "cuenta": "430", "importe": 1210 },
    { "id_partida": "P-02", "sociedad": "FILIAL-SUR", "sociedad_contraparte": "HOLDING-NORTE", "cuenta": "400", "importe": -1210 },
    { "id_partida": "P-03", "sociedad": "HOLDING-NORTE", "sociedad_contraparte": "CLIENTE-EXTERNO", "cuenta": "430", "importe": 500 }
  ],
  "criterio": { "grupo": ["HOLDING-NORTE", "FILIAL-SUR"], "cuentas_internas": ["430", "400"] },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...", "fuente_partidas": "declarado",
  "criterio": { "sociedades": ["HOLDING-NORTE", "FILIAL-SUR"], "umbral": null, "cuentas_internas": ["430", "400"] },
  "eliminaciones": [
    { "id_partida": "P-01", "sociedad": "HOLDING-NORTE", "sociedad_contraparte": "FILIAL-SUR", "cuenta": "430", "cuenta_interna": true, "importe": 1210, "anulacion": -1210, "motivo": "cruce interno entre sociedades del grupo declarado" },
    { "id_partida": "P-02", "sociedad": "FILIAL-SUR", "sociedad_contraparte": "HOLDING-NORTE", "cuenta": "400", "cuenta_interna": true, "importe": -1210, "anulacion": 1210, "motivo": "cruce interno entre sociedades del grupo declarado" }
  ],
  "n_eliminaciones": 2, "neto": 0, "abierto": false, "faltan": [], "motivo": null
}
```

**P-03 no entra**: su contraparte está fuera del grupo declarado. **Solo se elimina el cruce
inter-grupo.**

### 2. `eliminar` — las partidas se piden a `marca-sociedad` (I1) por evento

Sin `partidas`/`asientos`: se pide a I1 (`{listar:true}`) → `fuente_partidas:'marca-sociedad'`.

### 3. `eliminar` — sin grupo declarado → `[ABIERTO]` (no se adivina el perímetro)

```json
{ "project_id": "e57a318a-...", "partidas": [ { "id_partida": "P-01", "sociedad": "A", "sociedad_contraparte": "B", "importe": 100 } ] }
```

`200` con `eliminaciones:[]`, `neto:null`, `abierto:true`, `faltan:["criterio.grupo"]` y
`motivo:'no se adivina el perimetro: falta el grupo declarado (criterio.grupo / sociedades)'`.

### 4. `eliminar` — sin partidas → `[ABIERTO]`

`faltan:["partidas"]`, `eliminaciones:[]`, `abierto:true`. **Nada se estima.**

### 5. Fallo — falta `project_id`

Respuesta `400` + `eliminacion-intercompany.eliminar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/eliminacion-intercompany.test.js`. Cubre:

- `eliminar` con partidas declaradas y grupo declarado → detecta los cruces internos y devuelve
  `importe`/`anulacion` (signo opuesto) y el `neto`.
- Una partida cuya contraparte está **fuera del grupo** → **no** entra (solo el cruce
  inter-grupo).
- Partida con `sociedad === sociedad_contraparte` → **no** es cruce.
- Sin importe → **no** es cruce valorado (**no se estima**).
- Sin grupo declarado → `[ABIERTO]` con `faltan:['criterio.grupo']` (**el perímetro no se
  adivina**); sin partidas → `[ABIERTO]` con `faltan:['partidas']`.
- Las partidas pedidas a `marca-sociedad` (I1) por evento → `fuente_partidas:'marca-sociedad'`.
- Orden **determinista** por `id_partida`.
- `cuenta_interna:null` si no se declararon cuentas internas (no se asume).
- `project_id` ausente → `400 INVALID_INPUT` + `.eliminar.failed`.
- **NO ESCRIBE, NO BORRA**: ninguna llamada persiste ni muta (stateless).
- `toolEliminar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `EliminacionIntercompany extends ModuloHibridoReflejo`; `name =
  'eliminacion-intercompany'`, `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`,
  sin `onProjectActivated`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/eliminacion-intercompany/`).
- `onEliminarRequest` usa `this._atender(e, 'eliminar', 'eliminacion-intercompany.eliminar.response',
  async (d) => {...})` con cierre de círculo (par `failed` si `status !== 200`).
- Proyección `_eliminar(input)` (**async**: puede pedir I1 por evento); helpers `_partidas`,
  `_criterio`, `_clave`, `_num`. Tool `toolEliminar`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- DEP: **pide** `marca-sociedad.marcar.request` (I1) por EVENTO. Lo consume `consolidacion`
  (I3) vía `eliminacion-intercompany.eliminar.request` (por EVENTO) para restar las operaciones
  internas del conjunto.
- **LEY COMO DATO**: el grupo, el umbral y las cuentas internas son **declarables**; cero
  constantes de negocio cableadas. **Sin grupo declarado → `[ABIERTO]`**: el perímetro no se
  adivina; y la eliminación solo **propone** (no escribe, no borra).
