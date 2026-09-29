---
name: consolidacion
description: >
  Skill FULL del módulo REFLEJO `consolidacion` de la vertical contabilidad de Enki.
  LA CONSOLIDACIÓN DEL GRUPO MULTI-SOCIEDAD COMPLETA (decisión del dueño): compone los estados
  del CONJUNTO a partir de las sociedades DECLARADAS, con criterio DECLARADO, restando las
  eliminaciones intercompany (I2). Solo consolida lo declarado; nada se estima ni se rellena con
  0. Sin estado. Úsala para operar, depurar o extender el reflejo, o para entender su contrato
  de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites los estados consolidados del grupo (RPC
    consolidacion.estados.request).
  - Cuando depures por qué `estados` sale `null` y `abierto:true` (sin sociedades declaradas o
    sin cifras de alguna sociedad) o por qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (determinista, ley como dato, solo lo declarado, el grupo no se descubre solo).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo consolidacion.
tags: [enki, modulo, reflejo, contabilidad, consolidacion]
---

# consolidacion — REFLEJO de la consolidación del grupo multi-sociedad

## Qué hace el módulo

`consolidacion` es un **REFLEJO STATELESS** (I3, hoja del plan): **LA CONSOLIDACIÓN DEL GRUPO
MULTI-SOCIEDAD COMPLETA** (decisión del dueño). Compone los **ESTADOS DEL CONJUNTO** a partir de
las sociedades **DECLARADAS**, aplicando el criterio **DECLARADO** y las **eliminaciones
intercompany** (I2). **Agregación DETERMINISTA, sin estimar nada.**

Atributos del diseño: `sociedades:Set<Sociedad>` y `criterio:ParametroDeclarable`.

- Las **SOCIEDADES** del grupo son **DATO DECLARADO** — **NO se descubren solas**: sin conjunto
  declarado no hay perímetro y los estados quedan `[ABIERTO]` (inventarse una sociedad rompe el
  grupo).
- El **CRITERIO** (qué se agrega, moneda, método de conversión, qué se elimina) es
  **PARÁMETRO DECLARABLE**: el reflejo lo **CONSERVA OPACO** y lo declara en la respuesta.
- **SOLO CONSOLIDA LO DECLARADO**: cada sociedad aporta sus **cifras declaradas**
  (`cifras`/`por_sociedad`) o las pide a `marca-sociedad` (I1) **POR EVENTO**; los estados **se
  suman** y **se restan** las **ELIMINACIONES INTERCOMPANY** pedidas a I2 **POR EVENTO**
  (`eliminacion-intercompany.eliminar.request`).
- **Si una sociedad declarada no trae cifras**, el estado del conjunto queda `[ABIERTO]` con lo
  que falta — **no se rellena con `0` una sociedad sin dato** (falsearía el grupo).

Invariantes:

- **DETERMINISTA**: mismas sociedades + mismas cifras + mismo criterio → mismos estados.
- **LEY COMO DATO**: el criterio de consolidación es entrada; **cero constantes cableadas**.
- **Dato ausente = desconocido**: sin sociedades declaradas o sin cifras → `[ABIERTO]`.
- **NO escribe, NO persiste**: los estados son **DERIVADOS**; el asiento es del diario.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_estados`.
Cierra el círculo de error con `consolidacion.estados.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `consolidacion.estados.request` | `onEstadosRequest` | RPC reflejo (agregacion pura, determinista): {project_id, periodo?, sociedades, criterio?, cifras?/por_sociedad?, partidas?, eliminaciones?} → {project_id, periodo, sociedades, criterio, fuente_eliminaciones, aportes, eliminaciones, n_sociedades, estados, parcial, consolidado, abierto, faltan, motivo}. Compone el EstadoDerivado del CONJUNTO (grupo completo): suma las cifras declaradas de cada sociedad y resta las eliminaciones intercompany pedidas a I2 POR EVENTO; las cifras pueden venir declaradas o de marca-sociedad (I1) POR EVENTO. Sin sociedades declaradas o sin cifras de alguna sociedad → estados:null y abierto:true (solo se consolida lo declarado; el grupo no se descubre solo y nada se rellena con 0). Responde por consolidacion.estados.response; project_id ausente → consolidacion.estados.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `consolidacion.estados.response` | Respuesta RPC correlada de consolidacion.estados.request → {request_id, status:200, data:{sociedades, criterio, estados, parcial, consolidado, faltan, abierto}}. Emitida por el helper _atender. |
| `consolidacion.estados.failed` | Par de fallo determinista (I3): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de consolidacion.estados.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `consolidacion.estados.failed` cierra el círculo de `consolidacion.estados.request`
> cuando `_estados` devuelve status ≠ 200 (el único camino: `400 INVALID_INPUT` por `project_id`
> ausente).

> Nota de honestidad (cruce con `index.js`): `onEstadosRequest` publica el par `failed` **solo si
> `res.status !== 200`**; el camino de éxito lo cierra `_atender` con
> `consolidacion.estados.response`. Una consolidación `[ABIERTO]` (`estados:null`) sigue siendo
> un `200`.

> Nota de sub-declaración (cruce con `index.js`): **no están en `module.json` pero sí las emite
> `index.js`** dos RPC salientes (son **DEP por evento**, no eventos emitidos):
> - en `_cifrasDe`: `marca-sociedad.marcar.request` (`{project_id, sociedad, listar:true, periodo}`,
>   `timeout_ms:4000`);
> - en `_eliminaciones`: `eliminacion-intercompany.eliminar.request`
>   (`{project_id, criterio:{grupo: sociedades}, periodo}`, `timeout_ms:4000`).

> Nota: el módulo expone `toolEstados(params)` como **tool directa** — no es un evento del bus,
> no figura en `module.json`. Tampoco figuran `_sociedades`, `_criterio`, `_cifrasDe`,
> `_eliminaciones`, `_normalizarCifras`, `_desdePartidas`, `_sumar` ni `_num` (utilidades
> internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **`periodo`**: string o `null`. Etiqueta: no estima nada.
3. **Las SOCIEDADES se resuelven en `_sociedades`**: `input.sociedades` (array o valor único) o
   `input.sociedad`; cada una normalizada a `id`/`nombre` string; **deduplicadas**; vacío/null
   filtrado. **Son DATO declarado: el grupo no se descubre solo.**
4. **Sin sociedades** (`sociedades.length === 0`) → `200` con `sociedades:[]`, `estados:null`,
   `consolidado:false`, `abierto:true`, `faltan:['sociedades']` y `motivo:'no se consolidan
   estados: falta el conjunto de sociedades declarado (el grupo no se descubre solo)'`.
5. **El CRITERIO** (`_criterio`): `input.criterio` (objeto copiado **tal cual**, **opaco**) o, si
   no, `{periodo}`; si no hay ninguno → `null`. **El reflejo no interpreta método ni moneda.**
6. **Las CIFRAS por sociedad** (`_cifrasDe`), declarando el aporte, en este orden:
   - `input.cifras`/`input.por_sociedad[sociedad]` (objeto) → normalizado `{total_activo,
     total_pasivo, patrimonio, ingresos, gastos}`.
   - `input.partidas` filtradas por `p.sociedad === sociedad` → `_desdePartidas` (acumula por
     `tipo`: `activo`, `pasivo`, `patrimonio`, `ingreso`, `gasto`).
   - si no, RPC `marca-sociedad.marcar.request` **por evento**; si vuelve `data.cifras` → tal
     cual; si vuelve `data.partidas` → `_desdePartidas`; si no → `null` (**dato ausente**).
7. **Las ELIMINACIONES** (`_eliminaciones`), declarando `fuente_eliminaciones`:
   - `input.eliminaciones` array → **declaradas**; `neto_eliminado` = `input.neto_eliminado` o
     suma de `importe`. `fuente_eliminaciones:'declarado'`.
   - si no, RPC `eliminacion-intercompany.eliminar.request` (I2) **por evento** con
     `{criterio:{grupo:sociedades}}`; si vuelve `data.eliminaciones` → usa `data.neto` →
     `fuente_eliminaciones:'eliminacion-intercompany'`.
   - **sin respuesta de I2**: `eliminaciones:[]`, `neto_eliminado:0`, `fuente_eliminaciones:null`
     — **cero eliminaciones es un DATO declarado, no una estimación**.
8. **La AGREGACIÓN** (`_sumar`), por clave (`total_activo`, `total_pasivo`, `patrimonio`,
   `ingresos`, `gastos`): suma lo aportado; **solo hay total si TODAS las sociedades declaradas
   aportaron esa clave** (`contados === aportes.length && aportes.length > 0`); si no → `null`.
   `sinDatos:true` si alguna sociedad aportó `cifras:null`.
9. **El ESTADO del CONJUNTO** (`estado`):
   - `total_activo`, `total_pasivo`, `patrimonio`, `ingresos`, `gastos` (2 dec. o `null`).
   - `resultado` = `ingresos − gastos` **solo si ambos existen**; si no → `null`.
   - `eliminado_intercompany` = `neto_eliminado` (2 dec.) o `null`.
   - `ingresos_netos` = `ingresos − neto_eliminado` si ambos existen (las operaciones internas
     se **eliminan** del conjunto).
10. **`abierto`** = `faltan.length > 0 || suma.sinDatos`. **`estados`** = el estado del conjunto
    si **NO** abierto, si no `null`. **`parcial`** = el estado tal cual (para que se vea que hay
    aunque falte alguna cifra). **`consolidado`** = `!abierto`.
11. **`faltan`** apila `cifras:<sociedad>` por cada sociedad **declarada sin cifras**;
    **`motivo`** declara que solo se consolida lo declarado y nombra lo que falta.
12. **`aportes`** = `[{sociedad, cifras}]` por sociedad (cifras `null` si no hay dato).
    **`n_sociedades`** = número de sociedades declaradas.
13. **NO escribe, NO persiste**: los estados son DERIVADOS; el asiento es del diario. Stateless.
14. **HTTP exacto**: éxito `200` (con estados o `[ABIERTO]`); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `consolidacion.estados.response`; el error cierra con `consolidacion.estados.failed`.

### 1. `estados` — consolidación completa del grupo declarado

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "sociedades": ["HOLDING-NORTE", "FILIAL-SUR"],
  "criterio": { "moneda": "EUR", "metodo_conversion": "cierre" },
  "por_sociedad": {
    "HOLDING-NORTE": { "total_activo": 500000, "total_pasivo": 200000, "patrimonio": 300000, "ingresos": 180000, "gastos": 120000 },
    "FILIAL-SUR": { "total_activo": 250000, "total_pasivo": 90000, "patrimonio": 160000, "ingresos": 95000, "gastos": 70000 }
  },
  "eliminaciones": [ { "importe": 1210 }, { "importe": -1210 } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...", "periodo": "2026-09",
  "sociedades": ["HOLDING-NORTE", "FILIAL-SUR"], "criterio": { "moneda": "EUR", "metodo_conversion": "cierre" },
  "fuente_eliminaciones": "declarado",
  "aportes": [ { "sociedad": "HOLDING-NORTE", "cifras": { "...": "..." } }, { "sociedad": "FILIAL-SUR", "cifras": { "...": "..." } } ],
  "eliminaciones": [ { "importe": 1210 }, { "importe": -1210 } ],
  "n_sociedades": 2,
  "estados": { "total_activo": 750000, "total_pasivo": 290000, "patrimonio": 460000, "ingresos": 275000, "gastos": 190000, "resultado": 85000, "eliminado_intercompany": 0, "ingresos_netos": 275000 },
  "parcial": { "...": "..." }, "consolidado": true, "abierto": false, "faltan": [], "motivo": null
}
```

Las eliminaciones se piden a **I2 por evento** si no llegan declaradas.

### 2. `estados` — las cifras se piden a `marca-sociedad` (I1) por evento

Sin `cifras`/`por_sociedad` ni `partidas`: cada sociedad se pide a I1. **Solo se consolida lo
declarado.**

### 3. `estados` — una sociedad declarada sin cifras → `[ABIERTO]`

Con dos sociedades y solo una con cifras → `estados:null`, `consolidado:false`, `abierto:true`,
`faltan:["cifras:FILIAL-SUR"]` y `motivo` declarando que solo se consolida lo declarado.
**No se rellena con `0` la sociedad sin dato** (falsearía el grupo); `parcial` deja ver el
estado con lo que sí hay.

### 4. `estados` — sin sociedades declaradas → `[ABIERTO]` (el grupo no se descubre solo)

`estados:null`, `faltan:["sociedades"]`, `abierto:true`.

### 5. Fallo — falta `project_id`

Respuesta `400` + `consolidacion.estados.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/consolidacion.test.js`. Cubre:

- `estados` con sociedades y cifras declaradas → suma determinista y `resultado = ingresos −
  gastos`; `consolidado:true`, `abierto:false`.
- El criterio se conserva **opaco** (no se interpreta moneda/método) y se declara en la
  respuesta.
- Las eliminaciones declaradas se restan (`ingresos_netos = ingresos − neto_eliminado`); sin
  respuesta de I2 → `neto_eliminado:0` (**dato declarado, no estimación**).
- Las cifras pedidas a `marca-sociedad` (I1) por evento y las eliminaciones a I2 por evento.
- Una sociedad declarada sin cifras → `estados:null`, `faltan:['cifras:<sociedad>']`,
  `abierto:true`, **sin rellenar con 0**; `parcial` deja ver lo que hay.
- Sin sociedades declaradas → `[ABIERTO]` con `faltan:['sociedades']` (**el grupo no se descubre
  solo**).
- Solo hay total de una clave si **todas** las sociedades declaradas la aportaron.
- `project_id` ausente → `400 INVALID_INPUT` + `.estados.failed`.
- **NO ESCRIBE**: ninguna llamada persiste ni muta (stateless).
- `toolEstados` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `Consolidacion extends ModuloHibridoReflejo`; `name = 'consolidacion'`,
  `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/consolidacion/`).
- `onEstadosRequest` usa `this._atender(e, 'estados', 'consolidacion.estados.response',
  async (d) => {...})` con cierre de círculo (par `failed` si `status !== 200`).
- Proyección `_estados(input)` (**async**: puede pedir I1 e I2 por evento); helpers
  `_sociedades`, `_criterio`, `_cifrasDe`, `_eliminaciones`, `_normalizarCifras`,
  `_desdePartidas`, `_sumar`, `_num`. Tool `toolEstados`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- DEP: **pide** `marca-sociedad.marcar.request` (I1) y `eliminacion-intercompany.eliminar.request`
  (I2) por EVENTO. Es la hoja del grupo multi-sociedad (I1 marca → I2 elimina → I3 consolida).
- **LEY COMO DATO**: el criterio es entrada y **opaco**; las sociedades son **dato declarado**
  (el grupo no se descubre solo). **SOLO SE CONSOLIDA LO DECLARADO**: sin cifras de una sociedad
  → `[ABIERTO]` (no se rellena con `0`).
