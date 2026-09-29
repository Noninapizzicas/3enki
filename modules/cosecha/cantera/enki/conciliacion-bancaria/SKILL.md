---
name: conciliacion-bancaria
description: >
  Skill FULL del módulo REFLEJO `conciliacion-bancaria` de la vertical contabilidad de Enki.
  El CRUCE extracto ↔ diario POR CLAVE NATURAL DETERMINISTA: cálculo puro que produce tres
  cubos (casados, sin_contrapartida, sin_movimiento) y NO interpreta lo que no casa — el
  juicio de la partida ambigua queda AISLADO en partida-no-identificada (E7). Sin estado.
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites cruzar el extracto bancario con el diario de un periodo (RPC
    conciliacion-bancaria.cruzar.request).
  - Cuando depures por qué un movimiento queda en `sin_contrapartida` o un apunte en
    `sin_movimiento`, o por qué se declara `reglas_disponibles:false` (E8 no respondió).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del cruce (determinista, cálculo puro, el juicio delegado a E7, sin mutar el libro).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo conciliacion-bancaria.
tags: [enki, modulo, reflejo, contabilidad, conciliacion-bancaria]
---

# conciliacion-bancaria — REFLEJO STATELESS del cruce extracto ↔ diario

## Qué hace el módulo

`conciliacion-bancaria` es un **REFLEJO STATELESS** (E1, hoja del plan): el **cruce
extracto ↔ diario POR CLAVE NATURAL DETERMINISTA**. Toma los **movimientos del banco**
(los normalizados por `puerto-extracto` E2) y los **aparea** con los **asientos del
diario** (`escritor-diario` B2), aplicando las **REGLAS declaradas**
(`regla-movimiento-bancario` E8) como **corte duro**. Es **cálculo PURO**: misma entrada →
mismo resultado.

**EL JUICIO ESTÁ AISLADO EN OTRA HOJA**: lo que **no casa NO se interpreta aquí**. Este
reflejo **no adivina** a qué corresponde una descripción ambigua del banco — eso es
competencia **EXCLUSIVA** de `partida-no-identificada` (E7, MICRO-AGENTE).

Produce **tres cubos**:

- **`casados`** — aparición determinista por **clave natural** o por **regla**.
- **`sin_contrapartida`** — movimiento del banco sin apunte en el diario → **va a E7**.
- **`sin_movimiento`** — apunte del diario sin movimiento bancario en el periodo.

Invariantes:

- **DETERMINISTA**: mismo extracto + mismo diario + mismas reglas → mismo resultado.
- El **corte por regla** LEE el corte duro de E8 **POR EVENTO**; si E8 **no responde** se
  declara `reglas_disponibles:false` y **solo se cruza por clave natural** (**no se
  inventa la regla**).
- **NO escribe, NO persiste, NO muta**: el diario es de B2 y los movimientos son de E2.
- La **clave natural del movimiento** es la que **trae E2** (`movimiento.clave`); **no se
  recalcula distinto**.
- **Sin estado**: sin `PosPersistencia` y sin `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `conciliacion-bancaria.cruzar.request` | `onCruzarRequest` | RPC reflejo (calculo puro, determinista): {project_id, periodo?, movimientos?\\|extracto?, canal?, banco?} → {project_id, periodo, fuente_movimientos, fuente_diario, reglas_disponibles, total_movimientos, total_asientos, casados:[{clave, via:'clave_natural'\\|'regla', movimiento, asiento, apunte, regla}], sin_contrapartida:[{movimiento, clave, motivo, juicio:'partida-no-identificada'}], sin_movimiento:[{clave, asiento, motivo}], descuadre, juicio_delegado_a:'partida-no-identificada'}. Los movimientos se toman declarados o se piden a puerto-extracto (E2) por EVENTO; el diario se pide a escritor-diario (B2) por EVENTO. Exito → publica contabilidad.conciliacion_cruzada y responde por conciliacion-bancaria.cruzar.response; project_id ausente → conciliacion-bancaria.cruzar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `conciliacion-bancaria.cruzar.response` | Respuesta RPC correlada de conciliacion-bancaria.cruzar.request → {request_id, status:200, data:{casados, sin_contrapartida, sin_movimiento, descuadre, juicio_delegado_a}}. Emitida por el helper _atender. |
| `conciliacion-bancaria.cruzar.failed` | Par de fallo determinista (E1): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de conciliacion-bancaria.cruzar.request. |
| `contabilidad.conciliacion_cruzada` | Fire-and-forget (E1): el cruce extracto↔diario quedo hecho (determinista) → {project_id, periodo, total_movimientos, casados, sin_contrapartida, sin_movimiento, descuadre, correlation_id}. Lo LEEN partida-conciliatoria (E9) e informe-conciliacion (E10). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `conciliacion-bancaria.cruzar.failed` cierra el círculo de
> `conciliacion-bancaria.cruzar.request` cuando `_cruzar` devuelve status ≠ 200
> (`400`, `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onCruzarRequest` publica
> `contabilidad.conciliacion_cruzada` **solo si `_cruzar` devuelve `200`**; el payload
> lleva **contadores** (`casados.length`, `sin_contrapartida.length`,
> `sin_movimiento.length`) — no las listas completas. La rama `else` publica
> `conciliacion-bancaria.cruzar.failed`.

> Nota: el cruce por regla **solo** casa si la petición trae `reglas_aplicadas` (lista con
> `{clave, apunte, regla}`); el sondeo de disponibilidad de E8 (`regla-movimiento-bancario.
> aplicar.request` con un movimiento vacío) sirve únicamente para declarar
> `reglas_disponibles`. Esto **no** se declara explícitamente en `_porRegla` como
> capacidad aparte — se documenta aquí por honestidad.

## Reglas de negocio

1. **Origen de los movimientos (dos vías, determinista en el orden)**: si
   `input.movimientos` es array → fuente `'declarados'`; si no, si
   `input.extracto.movimientos` es array → también `'declarados'`; si no, se **pide el
   extracto** a `puerto-extracto.entrar.request` (`{project_id, canal, banco, periodo}`,
   `timeout_ms:4000`) → `fuente_movimientos:'puerto-extracto'`. Si **nada** responde →
   `movimientos:[]` y `fuente_movimientos:null`.
2. **Origen del diario**: se **pide** a `escritor-diario.asientos.request`
   (`{project_id, periodo}`, `timeout_ms:4000`) → `fuente_diario:'diario'`; sin respuesta
   → `asientos:[]` y `fuente_diario:null`. **Nunca un `require` cruzado.**
3. **Corte por regla: disponibilidad honesta**: si la petición trae `movimientos` **y**
   `reglas_aplicadas` → `{disponible:true, aplicadas}`; si no, se hace **una consulta de
   sondeo** a `regla-movimiento-bancario.aplicar.request` con un movimiento vacío
   (`{fecha:null, importe:null}`); si responde → `{disponible:true, cache}`; si **no**
   responde → `{disponible:false}`. `reglas_disponibles` refleja `disponible === true`.
4. **Cruce por clave natural primero**: índice `apuntes_por_clave` =
   `Map(clave_natural → asiento)` del diario. Para cada movimiento se calcula su clave
   (`_claveDe`) y, si el índice la tiene → `casados` con `via:'clave_natural'` y se marca
   la clave como casada.
5. **Cruce por regla después**: si no casó por clave natural y el corte por regla está
   disponible con `aplicadas` declaradas, se busca en `aplicadas` el `{clave}` igual a la
   clave del movimiento; si hay hit → `casados` con `via:'regla'`, `asiento:null` y el
   `apunte`/`regla` del corte. **NUNCA se inventa el corte.**
6. **Lo que no casa por ninguna vía determinista va al JUICIO**: se empuja a
   `sin_contrapartida` con `{movimiento, clave, motivo, juicio:'partida-no-identificada'}`.
   El `motivo` declara la frontera: si `reglas_disponibles` es true → `'sin apunte en el
   diario ni regla declarada que lo cubra: el juicio es de partida-no-identificada (E7)'`;
   si es false → `'sin apunte en el diario; las reglas (E8) no respondieron, no se
   inventa el corte'`.
7. **El otro lado del desfase**: las claves del diario que **no** fueron casadas van a
   `sin_movimiento` con `{clave, asiento, motivo:'apunte del diario sin movimiento
   bancario en el periodo'}`.
8. **Clave natural del movimiento** (`_claveDe`): si `m.clave != null` → `String(m.clave)`
   (**la que normalizó E2, no se recalcula**). Si no, se compone
   `[fecha, importe, signo, (referencia ?? concepto)]` unido por `'|'`; si **todos** los
   componentes son `null`/`undefined` → `null`; los ausentes individuales se rellenan con
   `'-'`.
9. **`descuadre`** = suma de los `importe` (valor absoluto) de `sin_contrapartida`,
   redondeada a 2 decimales. **Es la cuantía cruda del desfase**; el ajuste fino es E9
   (`partida-conciliatoria`). `_num` devuelve `Math.abs(Number(...))` o `null`.
10. **`juicio_delegado_a:'partida-no-identificada'`**: el JUICIO **no vive aquí**; se
    declara la frontera explícitamente en la respuesta.
11. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
12. **Puro**: sin estado, sin persistencia, sin reloj, sin azar. Dos cruces con la misma
    entrada dan el mismo resultado.
13. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `conciliacion-bancaria.cruzar.response` y emite
`contabilidad.conciliacion_cruzada`.

### 1. `cruzar` — el cruce del periodo

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "movimientos": [
    { "clave": "2026-09-01|12.50|cargo|COMISION", "fecha": "2026-09-01", "importe": 12.5, "signo": "cargo", "concepto": "COMISION MANTENIMIENTO" }
  ],
  "reglas_aplicadas": [ { "clave": "2026-09-02|121.00|abono|VENTA-1", "apunte": { "cuenta": "572", "tercero": null, "periodo": "2026-09" }, "regla": { "id": "rb-1" } } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "fuente_movimientos": "declarados",
  "fuente_diario": "diario",
  "reglas_disponibles": true,
  "total_movimientos": 1,
  "total_asientos": 0,
  "casados": [],
  "sin_contrapartida": [
    { "movimiento": { "...": "..." }, "clave": "2026-09-01|12.50|cargo|COMISION", "motivo": "sin apunte en el diario ni regla declarada que lo cubra: el juicio es de partida-no-identificada (E7)", "juicio": "partida-no-identificada" }
  ],
  "sin_movimiento": [],
  "descuadre": 12.5,
  "juicio_delegado_a": "partida-no-identificada"
}
```

Emite `contabilidad.conciliacion_cruzada`:

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "total_movimientos": 1, "casados": 0, "sin_contrapartida": 1, "sin_movimiento": 0, "descuadre": 12.5, "correlation_id": "abc-123" }
```

### 2. Sin movimientos declarados — se pide el extracto a E2

Sin `movimientos` ni `extracto`, el módulo llama a
`puerto-extracto.entrar.request` con `{project_id, canal, banco, periodo}` y declara
`fuente_movimientos:'puerto-extracto'`. Si E2 no responde, `movimientos:[]` y
`fuente_movimientos:null` (nada se estima).

### 3. Las reglas (E8) no respondieron

`reglas_disponibles:false` y los movimientos no casados llevan el motivo
`'sin apunte en el diario; las reglas (E8) no respondieron, no se inventa el corte'`.
**No se asume cobertura.**

### 4. Fallo — falta `project_id`

Respuesta `400` + `conciliacion-bancaria.cruzar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/conciliacion-bancaria.test.js`. Cubre:

- `cruzar` con movimientos declarados y diario que casa por clave natural → `200` con
  `casados` y `via:'clave_natural'`.
- Cruce por regla declarada (`reglas_aplicadas`) → `casados` con `via:'regla'`.
- Movimiento sin apunte ni regla → `sin_contrapartida` con `juicio:'partida-no-identificada'`
  y el `motivo` correcto según `reglas_disponibles`.
- Apunte del diario sin movimiento → `sin_movimiento`.
- E8 sin responder → `reglas_disponibles:false` y solo cruce por clave natural.
- `descuadre` suma de los importes de `sin_contrapartida`.
- **Pureza**: dos llamadas con la misma entrada → mismo resultado.
- Sin movimientos declarados → se pide a `puerto-extracto` (E2) por evento;
  `fuente_movimientos` refleja el origen.
- `project_id` ausente → `400 INVALID_INPUT` + `conciliacion-bancaria.cruzar.failed`.
- `toolCruzar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ConciliacionBancaria extends ModuloHibridoReflejo`; `name =
  'conciliacion-bancaria'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store,
  sin `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/conciliacion-bancaria/`; es de la vertical **libro**).
- `onCruzarRequest` usa `this._atender(e, 'cruzar', 'conciliacion-bancaria.cruzar.response',
  async (d) => {...})` y dentro hace el cierre de círculo (evento de dominio en `200`, par
  `failed` si no).
- Proyección `_cruzar(input)` (`async`: pide extracto, diario y reglas por evento); helpers
  `_movimientos`, `_diario`, `_reglas`, `_porRegla`, `_par`, `_claveDe`, `_num`. Tool
  `toolCruzar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: lee `puerto-extracto.entrar.request` (E2), `escritor-diario.asientos.request` (B2)
  y `regla-movimiento-bancario.aplicar.request` (E8) por EVENTO. Lo LEEN
  `partida-conciliatoria` (E9) e `informe-conciliacion` (E10) vía
  `contabilidad.conciliacion_cruzada`.
- **EL JUICIO AISLADO**: este módulo **nunca** interpreta una descripción ambigua; la
  frontera se declara con `sin_contrapartida[*].juicio` y `juicio_delegado_a`. El juicio es
  de `partida-no-identificada` (E7).
