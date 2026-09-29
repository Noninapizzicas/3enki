---
name: partida-no-identificada
description: >
  Skill FULL del módulo MICRO-AGENTE `partida-no-identificada` de la vertical contabilidad de Enki.
  EL ÚNICO que ejerce JUICIO sobre la descripción ambigua del banco: propone el apunte de la
  partida sin contrapartida (comisión/interés/devolución/impuesto/seguro/otro) o la deja
  [ABIERTO] en la cola — sin inventar nunca la cuenta. Primero el corte duro (regla declarada),
  después el juicio contra el plan declarado. Sin estado. Úsala para operar, depurar o extender
  el micro-agente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites juzgar un movimiento bancario ambiguo (RPC
    partida-no-identificada.juzgar.request).
  - Cuando depures por qué la partida queda `estado:'ABIERTO'` con `requiere_cola:true`
    (sin clasificación del juicio, tipo fuera de la taxonomía, o cuenta ausente del plan
    declarado) o por qué se resuelve por `'REGLA'`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    juicio (el juicio aislado, propone y no escribe, nunca inventa, corte duro primero).
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente partida-no-identificada.
tags: [enki, modulo, micro-agente, contabilidad, partida-no-identificada]
---

# partida-no-identificada — MICRO-AGENTE del juicio sobre la partida ambigua

## Qué hace el módulo

`partida-no-identificada` es un **MICRO-AGENTE** (E7, hoja del plan): **EL ÚNICO PUNTO DE
JUICIO SOBRE LA DESCRIPCIÓN AMBIGUA DEL BANCO**. Un movimiento del extracto sin contrapartida
clara («COMISION MANTENIMIENTO», «DEV. RECIBO 4471», «INT. ACREEDOR») llega aquí. **Reconoce y
clasifica** esa partida (comisión / interés / devolución / impuesto / seguro / otro) y
**PROPONE** el apunte (cuenta + tercero + periodo).

**EL JUICIO ESTÁ AISLADO EN ESTA HOJA**: `conciliacion-bancaria` (E1) y `cuadre-cobro-pago`
(E3) son **puros** y **NO interpretan nada**; todo lo que no casa por clave natural
determinista **aterriza aquí**, y **no se duplica** en ningún reflejo.

Invariantes:

- **PROPONE, NO ESCRIBE**: no asienta, no persiste, no marca nada. La escritura la hace el
  custodio dueño de la parcela (`regla-movimiento-bancario` E8 la ratifica; `escritor-diario`
  B2 la asienta).
- **SI NO PUEDE RESOLVER → `[ABIERTO]` Y A LA COLA, NUNCA INVENTA**: sin regla declarada que
  cubra y sin clasificación del juicio devuelve `propuesta:null`, `estado:'ABIERTO'`,
  `requiere_cola:true` con destino — **JAMÁS fabrica una cuenta**.
- **PRIMERO EL CORTE DURO** (la regla declarada E8, consultada **POR EVENTO** — si cubre, la
  propuesta es **determinista** y **no hay juicio**), **DESPUÉS EL JUICIO** sobre la
  descripción; y aun así la cuenta propuesta debe estar en el **PLAN declarado**
  (`catalogo-cuentas` B1, **POR EVENTO**; si no existe → `[ABIERTO]`).
- El **cajón fuzzy** (reconocimiento de la descripción) vive en el **blueprint**; este reflejo
  sirve la proyección determinista de **fallback** y el **corte duro**.
- Toda su memoria es **EXTERNA** (reglas E8 + plan B1), por eso es **STATELESS**: persistir
  aquí **duplicaría** estado ya custodido. Sin `PosPersistencia` ni `project.activated`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `partida-no-identificada.juzgar.request` | `onJuzgarRequest` | RPC micro-agente: {project_id, movimiento:{clave?, fecha?, importe, signo?, concepto\\|descripcion, contraparte?}, clasificacion?:{tipo, cuenta, tercero?, periodo?, origen?}} → {movimiento:{clave, fecha, importe, signo, contraparte, descripcion, ambigua:true}, propuesta:{cuenta, tercero, periodo, base:{via:'regla_declarada'\\|'juicio_sobre_descripcion', regla_id?, tipo_partida?, plan_confirmado?}} \\| null, propuesta_por:'REGLA'\\|'JUICIO'\\|null, estado:'RESUELTO'\\|'ABIERTO', tipo_partida, corte_duro, reglas_disponibles, requiere_cola, destino_cola}. Primero consulta el corte duro (regla-movimiento-bancario E8) por EVENTO; si cubre, propuesta determinista. Si no, juzga la descripcion y verifica la cuenta contra el plan (catalogo-cuentas B1) por EVENTO. Sin resolucion → propuesta:null, estado:'ABIERTO', requiere_cola:true (NUNCA inventa). Exito → publica contabilidad.partida_propuesta y responde por partida-no-identificada.juzgar.response; project_id o movimiento ausente → partida-no-identificada.juzgar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `partida-no-identificada.juzgar.response` | Respuesta RPC correlada de partida-no-identificada.juzgar.request → {request_id, status:200, data:{movimiento, propuesta, propuesta_por, estado, tipo_partida, corte_duro, requiere_cola, destino_cola}}. Emitida por el helper _atender. |
| `partida-no-identificada.juzgar.failed` | Par de fallo determinista (E7): project_id o movimiento ausente → {status, error:{code, message, details?}}. Cierra el circulo de partida-no-identificada.juzgar.request. |
| `contabilidad.partida_propuesta` | Fire-and-forget (E7): el juicio de la partida no identificada quedo resuelto → {project_id, movimiento, propuesta, propuesta_por, estado, tipo_partida, corte_duro, requiere_cola, destino_cola, correlation_id}. Lo consume la regla (E8) para ratificar el aprendizaje ('esta comision → esta cuenta') cuando requiere_cola es false, y la cola de excepciones cuando es true. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `partida-no-identificada.juzgar.failed` cierra el círculo de
> `partida-no-identificada.juzgar.request` cuando `_juzgar` devuelve status ≠ 200 (`400`,
> `project_id` o `movimiento` ausente).

> Nota de honestidad (cruce con `index.js`): `onJuzgarRequest` publica
> `contabilidad.partida_propuesta` **tanto en `RESUELTO` como en `ABIERTO`** — siempre que
> `_juzgar` devuelva `200`. Es decir, **también emite el `[ABIERTO]` razonado** (`propuesta:
> null`, `requiere_cola:true`), que es precisamente lo que la cola de excepciones necesita.
> La rama `else` publica `partida-no-identificada.juzgar.failed`.

> Nota: la respuesta puede llevar campos **no listados en el `description`** del module.json,
> emitidos por `_juzgar`: `plan_disponible` (en la vía del juicio) y `motivo` (en la vía
> `[ABIERTO]`, con el porqué de no resolver). También `propuesta.base.clasificacion_origen`
> (por defecto `'blueprint'`).

## Reglas de negocio

1. **El corte duro va PRIMERO** (E8, POR EVENTO):
   `regla-movimiento-bancario.aplicar.request` (`{project_id, movimiento}`, `timeout_ms:4000`).
   Si `corte.cubierta === true` **y** `corte.apunte` → la propuesta es **determinista**:
   `propuesta_por:'REGLA'`, `estado:'RESUELTO'`, `tipo_partida:null`,
   `corte_duro: corte.regla`, `reglas_disponibles:true`, `requiere_cola:false`,
   `destino_cola:null`. **No se ejerce juicio.**
2. **Cuenta del corte**: `corte.apunte.cuenta`; `tercero` y `periodo` se toman del corte si
   los trae; si no, `periodo` se deriva del movimiento (`_periodoDe`: `YYYY-MM`). **Dato
   ausente = desconocido.**
3. **El juicio lo aporta el blueprint** (`input.clasificacion`): el reflejo **no adivina
   solo**. `tipo_partida` se normaliza a minúsculas. **Sin clasificación, o con un tipo fuera
   de la taxonomía** (`TIPOS_PARTIDA = ['comision','interes','devolucion','impuesto','seguro',
   'otro']`) → **`[ABIERTO]`**, nunca se inventa. El `motivo` declara cuál de los tres casos
   fue (E8 sin responder / E8 no cubre y sin clasificación / clasificación fuera de la
   taxonomía).
4. **Sin cuenta del juicio → `[ABIERTO]`**: si la clasificación reconoció el tipo pero
   `cuenta` viene vacía → `[ABIERTO]` con `motivo:'el juicio reconocio el tipo pero no
   propuso cuenta: [ABIERTO], no se inventa'`.
5. **La cuenta propuesta debe estar en el PLAN declarado** (B1, POR EVENTO):
   `catalogo-cuentas.buscar.request` (`{project_id, codigo:cuenta}`, `timeout_ms:4000`). Si el
   plan dice `encontrada === false` → **`[ABIERTO]`** con
   `motivo:'el juicio propuso la cuenta <cuenta>, que no existe en el plan declarado'` y
   `plan_disponible:true`. **La cuenta no se acepta si el plan la desmiente.**
6. **Vía del juicio (propuesta aceptada)**: `propuesta.base = {regla_id:null,
   via:'juicio_sobre_descripcion', tipo_partida, plan_confirmado: (plan ? plan.encontrada ===
   true : null), clasificacion_origen: (clasificacion.origen ?? 'blueprint')}`.
   `plan_confirmado:null` cuando el plan **no respondió** (**nunca se asume verificado**).
7. **`[ABIERTO]` = propuesta:null + cola** (`_abierto`): `propuesta:null`,
   `propuesta_por:null`, `estado:'ABIERTO'`, `tipo_partida:null`, `corte_duro` (la regla si
   la hubo), `reglas_disponibles`, `plan_disponible`, `motivo`, `requiere_cola:true`,
   `destino_cola:'ASESOR'`. El destino es **ParametroDeclarable**; sin declarar se propone el
   **default honesto** `'ASESOR'`.
8. **Resumen del movimiento** (`_resumen`): `{clave, fecha, importe (absoluto o null), signo
   (minúsculas o null), contraparte, descripcion, ambigua:true}`. La **ambigüedad se declara
   explícitamente** — es el objeto del juicio.
9. **Descripción del movimiento**: `_juzgar` lee `movimiento.concepto` si viene; si no,
   `movimiento.descripcion`; si no, `null`.
10. **PROPONE, NO ESCRIBE**: no hay ninguna escritura ni persistencia en todo el módulo. La
    ratificación del aprendizaje la hace E8; el asiento lo hace B2.
11. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`). El movimiento es obligatorio
    (`input.movimiento || input.m || input.mov`); ausente/no objeto → `400 INVALID_INPUT`
    (`field:'movimiento'`).
12. **Stateless**: sin store, sin `PosPersistencia`, sin `onProjectActivated`. La memoria es
    externa (reglas E8 + plan B1); persistir aquí duplicaría estado.
13. **HTTP exacto**: éxito `200` (tanto `RESUELTO` como `ABIERTO`); `project_id` o
    `movimiento` ausentes → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `partida-no-identificada.juzgar.response` y emite
`contabilidad.partida_propuesta`.

### 1. `juzgar` — el corte duro cubre (propuesta determinista)

```json
{
  "project_id": "e57a318a-...",
  "movimiento": { "clave": "2026-09-03|12.50|cargo|COMISION", "fecha": "2026-09-03", "importe": 12.5, "signo": "cargo", "concepto": "COMISION MANTENIMIENTO CUENTA", "contraparte": "BANCO X" },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (resuelto por regla):

```json
{
  "project_id": "e57a318a-...",
  "movimiento": { "clave": "2026-09-03|12.50|cargo|COMISION", "fecha": "2026-09-03", "importe": 12.5, "signo": "cargo", "contraparte": "BANCO X", "descripcion": "COMISION MANTENIMIENTO CUENTA", "ambigua": true },
  "propuesta": { "cuenta": "629", "tercero": null, "periodo": "2026-09", "base": { "regla_id": "rb-1", "via": "regla_declarada" } },
  "propuesta_por": "REGLA",
  "estado": "RESUELTO",
  "tipo_partida": null,
  "corte_duro": { "id": "rb-1", "condicion": { "concepto_contiene": "COMISION" }, "origen": "APRENDIDA" },
  "reglas_disponibles": true,
  "requiere_cola": false,
  "destino_cola": null
}
```

### 2. `juzgar` — la clasificación del juicio (blueprint)

```json
{
  "project_id": "e57a318a-...",
  "movimiento": { "fecha": "2026-09-04", "importe": 30.0, "signo": "cargo", "concepto": "INT. ACREEDOR" },
  "clasificacion": { "tipo": "interes", "cuenta": "669", "tercero": null, "periodo": "2026-09", "origen": "blueprint" }
}
```

Respuesta `200` (resuelto por juicio):

```json
{
  "project_id": "e57a318a-...",
  "movimiento": { "...": "..." },
  "propuesta": { "cuenta": "669", "tercero": null, "periodo": "2026-09", "base": { "regla_id": null, "via": "juicio_sobre_descripcion", "tipo_partida": "interes", "plan_confirmado": true, "clasificacion_origen": "blueprint" } },
  "propuesta_por": "JUICIO",
  "estado": "RESUELTO",
  "tipo_partida": "interes",
  "corte_duro": null,
  "reglas_disponibles": true,
  "plan_disponible": true,
  "requiere_cola": false,
  "destino_cola": null
}
```

### 3. `juzgar` — no se puede resolver → `[ABIERTO]` y a la cola (**nunca inventa**)

Sin regla que cubra y sin clasificación del juicio:

```json
{
  "project_id": "e57a318a-...",
  "movimiento": { "fecha": "2026-09-05", "importe": 450.0, "signo": "abono", "concepto": "DEV. RECIBO 4471" },
  "propuesta": null,
  "propuesta_por": null,
  "estado": "ABIERTO",
  "tipo_partida": null,
  "corte_duro": null,
  "reglas_disponibles": true,
  "plan_disponible": false,
  "motivo": "el corte duro (E8) declaro que ninguna regla cubre el movimiento y no hay clasificacion del juicio",
  "requiere_cola": true,
  "destino_cola": "ASESOR"
}
```

Emite `contabilidad.partida_propuesta`:

```json
{ "project_id": "e57a318a-...", "movimiento": { "...": "..." }, "propuesta": null, "propuesta_por": null, "estado": "ABIERTO", "tipo_partida": null, "corte_duro": null, "requiere_cola": true, "destino_cola": "ASESOR", "correlation_id": "abc-123" }
```

> El evento se emite **también** con `estado:'ABIERTO'`: es el `[ABIERTO]` razonado que
> consume la cola de excepciones. Con `requiere_cola:false`, E8 lo consume para ratificar el
> aprendizaje.

### 4. Fallo — falta el movimiento

Respuesta `400` + `partida-no-identificada.juzgar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "movimiento requerido", "details": { "field": "movimiento" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/partida-no-identificada.test.js`. Cubre:

- Corte duro que cubre (E8 responde `cubierta:true`) → `200 {propuesta_por:'REGLA',
  estado:'RESUELTO', requiere_cola:false}` y emite `contabilidad.partida_propuesta`.
- Sin clasificación del juicio → `[ABIERTO]` con `propuesta:null`, `requiere_cola:true`,
  `destino_cola:'ASESOR'` (**nunca inventa la cuenta**).
- Tipo fuera de la taxonomía → `[ABIERTO]` con el motivo correspondiente.
- El juicio reconoce el tipo pero no propone cuenta → `[ABIERTO]`.
- Cuenta propuesta que no existe en el plan (B1) → `[ABIERTO]` con
  `motivo:'el juicio propuso la cuenta ... que no existe en el plan declarado'`.
- El plan (B1) sin responder → `plan_confirmado:null` (**no se asume verificado**) y la
  propuesta se sirve igualmente.
- `movimiento.ambigua` es `true` en el resumen (la ambigüedad se declara).
- `project_id` o `movimiento` ausentes → `400 INVALID_INPUT` + `.juzgar.failed`.
- **PROPONE, NO ESCRIBE**: ninguna llamada persiste ni muta (stateless).
- `toolJuzgar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PartidaNoIdentificada extends ModuloHibridoReflejo`; `name =
  'partida-no-identificada'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store,
  sin `onProjectActivated` (MICRO-AGENTE stateless). Constante
  `TIPOS_PARTIDA = ['comision','interes','devolucion','impuesto','seguro','otro']` — la
  **taxonomía canónica** a la que el juicio puede llegar (el **reconocimiento** es del
  blueprint).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/partida-no-identificada/`; es de la vertical **libro**).
- `onJuzgarRequest` usa `this._atender(e, 'juzgar', 'partida-no-identificada.juzgar.response',
  async (d) => {...})` y dentro hace el cierre de círculo (evento de dominio en `200` — tanto
  `RESUELTO` como `ABIERTO` —, par `failed` si no).
- Proyección `_juzgar(input)` (`async`: consulta E8 y B1 por evento); helper `_abierto`
  (la vía `[ABIERTO]`), `_resumen`, `_periodoDe`, `_num`. Tool `toolJuzgar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: lee `regla-movimiento-bancario.aplicar.request` (E8) y
  `catalogo-cuentas.buscar.request` (B1) por EVENTO. Lo consume `regla-movimiento-bancario`
  (E8) para ratificar el aprendizaje vía `contabilidad.partida_propuesta`, y la cola de
  excepciones cuando `requiere_cola:true`.
- **EL JUICIO AISLADO**: E1 y E3 son puros y no interpretan; **todo** lo ambiguo aterriza
  aquí. **Nunca se inventa una cuenta**: sin resolución → `[ABIERTO]` + cola; la propuesta,
  además, debe pasar el filtro del **plan declarado**.
