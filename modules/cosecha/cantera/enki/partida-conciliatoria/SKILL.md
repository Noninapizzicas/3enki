---
name: partida-conciliatoria
description: >
  Skill FULL del módulo REFLEJO `partida-conciliatoria` de la vertical contabilidad de Enki.
  Las PARTIDAS EN TRÁNSITO que explican el desfase extracto↔contabilidad (el cheque emitido y no
  cobrado, el cobro ingresado y no apuntado, el cargo del banco que aún no llegó al diario):
  clasificación DETERMINISTA por origen DECLARABLE, sin inventar ninguna partida y con el juicio
  aislado en partida-no-identificada (E7). Sin estado. Úsala para operar, depurar o extender el
  reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites calcular el desfase extracto↔contabilidad de un periodo (RPC
    partida-conciliatoria.desfase.request).
  - Cuando depures por qué el desfase sale `null` (cruce_disponible:false porque E1 no
    respondió), por qué hay `sin_clasificar` (el negocio no declaró orígenes de tránsito) o por
    qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (clasificación declarable, nada cableado, desfase no estimado, juicio aislado en E7).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo partida-conciliatoria.
tags: [enki, modulo, reflejo, contabilidad, partida-conciliatoria]
---

# partida-conciliatoria — REFLEJO del desfase en tránsito

## Qué hace el módulo

`partida-conciliatoria` es un **REFLEJO STATELESS** (E9, hoja del plan): las **PARTIDAS EN
TRÁNSITO** que **EXPLICAN** el desfase extracto ↔ contabilidad. Toma los **cubos NO CASADOS** del
cruce (`conciliacion-bancaria` E1 — `sin_contrapartida`, el movimiento del banco sin apunte, y
`sin_movimiento`, el apunte sin movimiento) y los **CLASIFICA por su ORIGEN de tránsito**, que es
un **PARÁMETRO DECLARABLE** del negocio.

**Cálculo PURO y DETERMINISTA**: misma entrada + mismas partidas declaradas → mismo desfase.

**EL JUICIO NO VIVE AQUÍ**: este reflejo **NO** decide si una partida es un cheque o una comisión,
ni **inventa** una partida que no esté declarada. Lo que no se puede clasificar con lo declarado
queda **SIN CLASIFICAR** y se declara `[ABIERTO]` — **dato ausente = desconocido, nada se estima**.
El juicio de la partida ambigua sigue siendo **EXCLUSIVO** de `partida-no-identificada` (E7).

Invariantes:

- **La clasificación por origen es DECLARABLE**: el negocio declara sus orígenes de tránsito. No
  hay ninguna lista de «cheques»/«comisiones»/«transferencias» cableada.
- **El cruce se PIDE a `conciliacion-bancaria` (E1) POR EVENTO**: si E1 no responde se declara
  `cruce_disponible:false` y **NO se estima** el desfase (`null`, no `0`).
- **NO escribe, NO persiste, NO muta**: el cruce es de E1 y el diario de B2.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_desfase`.
Cierra el círculo de error con `partida-conciliatoria.desfase.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `partida-conciliatoria.desfase.request` | `onDesfaseRequest` | RPC reflejo (calculo puro, determinista): {project_id, periodo?, cruce?, movimientos?, clasificacion?:{origenes:[{id, clase?, criterios?}]}} → {project_id, periodo, fuente_cruce, cruce_disponible, clasificacion_disponible, origenes_declarados, total_partidas, partidas:[{lado:'banco'\|'contabilidad', origen, clase, importe, signo, fecha, clave, referencia, motivo, juicio_delegado_a:'partida-no-identificada'}], sin_clasificar, desfase, abierto:{cruce, clasificacion, partidas_sin_clasificar}}. El cruce se toma declarado o se pide a conciliacion-bancaria (E1) POR EVENTO; la clasificacion de transito es ParametroDeclarable del negocio. Responde por partida-conciliatoria.desfase.response; project_id ausente → partida-conciliatoria.desfase.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `partida-conciliatoria.desfase.response` | Respuesta RPC correlada de partida-conciliatoria.desfase.request → {request_id, status:200, data:{partidas, sin_clasificar, desfase, abierto}}. Emitida por el helper _atender. |
| `partida-conciliatoria.desfase.failed` | Par de fallo determinista (E9): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de partida-conciliatoria.desfase.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `partida-conciliatoria.desfase.failed` cierra el círculo de
> `partida-conciliatoria.desfase.request` cuando `_desfase` devuelve status ≠ 200 (es decir,
> `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onDesfaseRequest` publica el par `failed`
> **solo si `res.status !== 200`**; el camino de éxito lo cierra `_atender` con
> `partida-conciliatoria.desfase.response`. En la práctica el único camino ≠ 200 es
> `_invalid('project_id')`.

> Nota de sub-declaración (cruce con `index.js`): **no está en `module.json` pero sí lo emite
> `index.js` en `_cruce`** la RPC saliente
> `conciliacion-bancaria.cruzar.request` (`{project_id, periodo, movimientos}`, `timeout_ms:4000`)
> — es una **DEP por evento**, no un evento emitido.

> Nota: el módulo expone `toolDesfase(params)` como **tool directa** (misma proyección
> `_desfase`) — no es un evento del bus, no figura en `module.json`. Tampoco figura el helper
> de lectura `_claveDe` ni `_num`/`_round` (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Es el **único** error duro del módulo.
2. **El período es una etiqueta**: `periodo = input.periodo != null ? String(input.periodo) :
   null`. No filtra ni estima nada; solo viaja en la respuesta.
3. **El CRUCE se resuelve en `_cruce`** en este orden, declarando siempre **`fuente_cruce`**:
   - `input.cruce` objeto → `{cruce:input.cruce, cruce_disponible:true, fuente_cruce:'declarado'}`.
   - si no, RPC `conciliacion-bancaria.cruzar.request` **por evento**; si responde con
     `sin_contrapartida` o `sin_movimiento` en array → `fuente_cruce:'conciliacion-bancaria'`.
   - si E1 **no responde** o no da cubos → `{cruce:null, cruce_disponible:false, fuente_cruce:null}`.
     **El cruce no se inventa.**
4. **La CLASIFICACIÓN de tránsito es DECLARABLE** (`_clasificacion`): `input.clasificacion.origenes[]`
   → `{origenes_declarados:[{id, clase (default 'transito'), criterios}], origenes}`. Cada origen
   exige `id` no vacío; sin `id` se **omite** de `origenes_declarados` (pero sigue en `origenes`).
   **Sin clasificación declarada** → `clasificacion = null`, `clasificacion_disponible:false`.
5. **La atribución a un origen es por CRITERIOS declarados** (`_origenDe` + `_casa`): un origen
   casa si **todos** sus `criterios` (clave→valor no vacío) encuentran su valor en la fila
   (comparación en minúsculas, igualdad o `indexOf`). Un criterio **vacío** se ignora; una lista
   de criterios **vacía no casa**; una fila que **no aporta** el campo esperado → **no casa**
   (**dato ausente = desconocido, no coincidente**).
6. **Los dos lados del desfase**: `sin_contrapartida[]` produce partidas `lado:'banco'` (materia
   `x.movimiento || x`); `sin_movimiento[]` produce partidas `lado:'contabilidad'` (materia
   `x.asiento || x`). Cada partida lleva `{lado, origen, clase, importe, signo, fecha, clave,
   referencia, motivo, juicio_delegado_a:'partida-no-identificada'}`.
7. **`origen` resuelto vs `sin_clasificar`**: si `_origenDe` devuelve un id → la partida va a
   `partidas`; si devuelve `null` → va a `sin_clasificar`. `clase` es `'transito'` cuando hay
   origen, `null` cuando no (`_claseDe`).
8. **Importe siempre absoluto**: `_num` aplica `Math.abs` y devuelve `null` si no es finito.
   **El signo viaja aparte** (`signo` como string o `null`); nunca se mete en el importe.
9. **Clave de la partida** (`_claveDe`): `clave` declarada si viene; si no, se **deriva** del
   molde `fecha|importe|signo|referencia_o_concepto` (con `-` en los huecos). Sin ningún
   componente → `null`.
10. **El DESFASE es la cuantía cruda de lo NO CASADO del lado banco**: suma de
    `sin_contrapartida[].movimiento.importe` (o `x.importe`), redondeada a 2. **Sin cruce
    disponible → `desfase:null`** (nunca `0`).
11. **`abierto` declara lo que falta** (nada se rellena solo): `cruce` (texto si E1 no respondió),
    `clasificacion` (texto si el negocio no declaró orígenes), `partidas_sin_clasificar` (cuántas).
12. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
13. **HTTP exacto**: éxito `200` (tanto con partidas como con `sin_clasificar`); `project_id`
    ausente → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `partida-conciliatoria.desfase.response`; el error cierra con
`partida-conciliatoria.desfase.failed`.

### 1. `desfase` — clasificación con orígenes declarados

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "cruce": {
    "sin_contrapartida": [ { "clave": "2026-09-03|1200|cargo|CHQ-4471", "movimiento": { "fecha": "2026-09-03", "importe": 1200, "signo": "cargo", "referencia": "CHQ-4471" } } ],
    "sin_movimiento": [ { "clave": "2026-09-04|850|abono", "asiento": { "fecha": "2026-09-04", "importe": 850, "signo": "abono", "concepto": "INGRESO CLIENTE" } } ]
  },
  "clasificacion": { "origenes": [ { "id": "cheque_emitido", "clase": "transito", "criterios": { "referencia": "CHQ" } } ] },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "fuente_cruce": "declarado",
  "cruce_disponible": true,
  "clasificacion_disponible": true,
  "origenes_declarados": [ { "id": "cheque_emitido", "clase": "transito", "criterios": { "referencia": "CHQ" } } ],
  "total_partidas": 1,
  "partidas": [ { "lado": "banco", "origen": "cheque_emitido", "clase": "transito", "importe": 1200, "signo": "cargo", "fecha": "2026-09-03", "clave": "2026-09-03|1200|cargo|CHQ-4471", "referencia": "CHQ-4471", "motivo": null, "juicio_delegado_a": "partida-no-identificada" } ],
  "sin_clasificar": [ { "lado": "contabilidad", "origen": null, "clase": null, "importe": 850, "signo": "abono", "fecha": "2026-09-04", "clave": "2026-09-04|850|abono", "referencia": null, "motivo": null, "juicio_delegado_a": "partida-no-identificada" } ],
  "desfase": 1200,
  "abierto": { "cruce": null, "clasificacion": null, "partidas_sin_clasificar": 1 }
}
```

### 2. Sin cruce (E1 no responde) — el desfase NO se estima

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09" }
```

Con `conciliacion-bancaria` sin responder → `200` con:

```json
{ "fuente_cruce": null, "cruce_disponible": false, "clasificacion_disponible": false, "total_partidas": 0, "partidas": [], "sin_clasificar": [], "desfase": null, "abierto": { "cruce": "E1 (conciliacion-bancaria) no respondio: no se estima el desfase", "clasificacion": "el negocio no ha declarado sus origenes de transito", "partidas_sin_clasificar": 0 } }
```

**`desfase:null`, jamás `0`.**

### 3. Fallo — falta `project_id`

```json
{ "periodo": "2026-09" }
```

Respuesta `400` + `partida-conciliatoria.desfase.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/partida-conciliatoria.test.js`. Cubre:

- `desfase` con cruce declarado + clasificación declarada → `200`, partidas clasificadas y las
  no casadas a `sin_clasificar`; el `desfase` es la suma del lado banco.
- Cruce pedido a `conciliacion-bancaria` por evento → `fuente_cruce:'conciliacion-bancaria'`.
- E1 sin responder → `desfase:null`, `cruce_disponible:false`, `abierto.cruce` declarado
  (**no se estima**).
- Sin clasificación declarada → todas las partidas a `sin_clasificar`, `clasificacion_disponible:false`.
- Un criterio que la fila no aporta **no casa** (dato ausente = desconocido).
- Importe siempre absoluto; el signo viaja aparte.
- `project_id` ausente → `400 INVALID_INPUT` + `.desfase.failed`.
- **NO ESCRIBE**: ninguna llamada persiste ni muta (stateless).
- `toolDesfase` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PartidaConciliatoria extends ModuloHibridoReflejo`; `name = 'partida-conciliatoria'`,
  `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/partida-conciliatoria/`).
- `onDesfaseRequest` usa `this._atender(e, 'desfase', 'partida-conciliatoria.desfase.response',
  async (d) => {...})` con cierre de círculo (par `failed` si `status !== 200`).
- Proyección `_desfase(input)` (**async**: puede pedir el cruce por evento); helpers `_cruce`,
  `_clasificacion`, `_origenDe`, `_casa`, `_claseDe`, `_claveDe`, `_num`. Tool `toolDesfase`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- DEP: **pide** `conciliacion-bancaria.cruzar.request` (E1) por EVENTO. Lo LEEN
  `informe-conciliacion` (E10, vía `partida-conciliatoria.desfase.request`) y la cola del humano.
- **PARÁMETRO COMO DATO**: los orígenes de tránsito y sus criterios son **declarables**; el código
  **no cablea** ninguna lista de cheques, comisiones ni transferencias. El juicio de la partida
  ambigua **NO vive aquí**: se delega a `partida-no-identificada` (E7).
