---
name: cuadre-cobro-pago
description: >
  Skill FULL del módulo REFLEJO `cuadre-cobro-pago` de la vertical contabilidad de Enki.
  COTEJA cobros y pagos contra el banco con la clave natural COMPARTIDA (un movimiento
  bancario = un cobro/pago): determinista, con la dirección del apunte tomada del signo
  declarado, y SIN interpretar lo que no casa — el juicio se delega a
  partida-no-identificada. Sin estado. Úsala para operar, depurar o extender el reflejo,
  o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites cotejar un movimiento (o un conjunto) contra el diario (RPC
    cuadre-cobro-pago.cuadrar.request).
  - Cuando depures por qué un movimiento queda `pendiente` (`requiere_cola:true`,
    `juicio:'partida-no-identificada'`) o por qué `diario_disponible:false`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del cotejo (un movimiento = un cobro/pago, el lado sale del signo, el diario por evento,
    cero interpretación).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo cuadre-cobro-pago.
tags: [enki, modulo, reflejo, contabilidad, cuadre-cobro-pago]
---

# cuadre-cobro-pago — REFLEJO STATELESS del cotejo cobros/pagos ↔ banco

## Qué hace el módulo

`cuadre-cobro-pago` es un **REFLEJO STATELESS** (E3, hoja del plan): **COTEJA cobros y
pagos contra el BANCO**. La clave natural es **COMPARTIDA**: **un movimiento bancario = un
cobro/pago**. Dado un movimiento (o un conjunto), decide **determinísticamente** si ya tiene
su cobro/pago cotejado en el diario y, si no lo tiene, cuál es el apunte que le corresponde
**según la evidencia del propio movimiento** (signo → lado, importe → cuantía).

**Determinista**: mismo movimiento + mismo diario → mismo resultado. **Cero juicio**: aquí
**NO** se interpreta una descripción ambigua (eso es E7). Si el movimiento **no se puede
cotejar** con nada del diario por su clave natural, se declara `cotejado:false` y se manda a
la **cola del juicio** (E7); **jamás se inventa el cobro/pago**.

El movimiento llega por **DOS vías**, ninguna un `require` cruzado:

- **`contabilidad.movimiento_bancario`** (fire-and-forget de E2) → se **ACUMULA** la muestra
  en un **espejo en memoria** (idempotente por su clave natural).
- **`cuadre-cobro-pago.cuadrar.request`** → se **COTEJA** lo que venga declarado o el
  espejo.

Invariantes:

- El **diario** se PIDE a `escritor-diario` (B2) **POR EVENTO**; si **no responde**, se
  declara `diario_disponible:false` y **no se afirma el cotejo** (**nada se estima**).
- La **dirección del apunte** (debe/haber) sale del **SIGNO declarado** del movimiento, **no
  de una constante**: `cargo` → salida, `abono` → entrada. **Sin signo → no se afirma la
  dirección.**
- **NO escribe, NO persiste, NO muta el libro.** Sin `PosPersistencia` ni
  `project.activated`: **no es custodio**. El espejo en memoria es efímero, no custodia.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `cuadre-cobro-pago.cuadrar.request` | `onCuadrarRequest` | RPC reflejo (cotejo determinista): {project_id, movimiento?\\|movimientos?\\|m?, periodo?} → {project_id, periodo, fuente_asientos:'diario'\\|null, diario_disponible, total_movimientos, cotejados:[{clave, movimiento, asiento, lado, importe, cuadrado:true}], pendientes:[{clave, movimiento, lado, importe, motivo, requiere_cola:true, juicio:'partida-no-identificada'}], cuadra, juicio_delegado_a:'partida-no-identificada'}. Sin movimientos declarados coteja el espejo acumulado por contabilidad.movimiento_bancario; el diario se pide a escritor-diario (B2) por EVENTO. Responde por cuadre-cobro-pago.cuadrar.response; project_id ausente → cuadre-cobro-pago.cuadrar.failed. |
| `contabilidad.movimiento_bancario` | `onMovimientoBancario` | Fire-and-forget (E2 → E3): el extracto publico un movimiento normalizado → se acumula su muestra en el espejo en memoria (idempotente por clave natural; un movimiento = un cobro/pago). No muta el libro, no publica evento de dominio. |

### Publishes

| Evento | Descripción |
|---|---|
| `cuadre-cobro-pago.cuadrar.response` | Respuesta RPC correlada de cuadre-cobro-pago.cuadrar.request → {request_id, status:200, data:{cotejados, pendientes, cuadra, diario_disponible, juicio_delegado_a}}. Emitida por el helper _atender. |
| `cuadre-cobro-pago.cuadrar.failed` | Par de fallo determinista (E3): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de cuadre-cobro-pago.cuadrar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `cuadre-cobro-pago.cuadrar.failed` cierra el círculo de
> `cuadre-cobro-pago.cuadrar.request` cuando `_cuadrar` devuelve status ≠ 200
> (`400`, `project_id` ausente). El fire-and-forget `onMovimientoBancario` **no** tiene par
> `failed`: no es una petición.

> Nota de honestidad (cruce con `index.js`): el payload emitido para `cotejados` incluye
> `cuadrado:true` por construcción; los `pendientes` llevan además `requiere_cola` y
> `juicio`. La respuesta NO incluye un campo `fuente_asientos:'diario'` más que cuando el
> diario respondió (si no, `null`).

> Nota: el módulo **no** expone lectura directa de su espejo por nombre — el espejo es
> interno (`this._espejo`, `Map<project_id, Map<clave, Movimiento>>`). No figura en
> `module.json`.

## Reglas de negocio

1. **Qué se coteja**: si `input.movimientos` es array → se usa; si no, si `input.movimiento`
   es objeto → `[input.movimiento]`; si no, si `input.m` → `[input.m]`; si **nada** se
   declara → se coteja **el espejo acumulado** (`[...this._espejoDe(pid).values()]`).
2. **El diario, por EVENTO**: `escritor-diario.asientos.request` (`{project_id, periodo}`,
   `timeout_ms:4000`); se aceptan `r.data.asientos` (array) o `r` (array). Con respuesta →
   `diario_disponible:true`, `fuente_asientos:'diario'`; sin respuesta →
   `asientos:[]`, `diario_disponible:false`. **Nunca un `require` cruzado.**
3. **Índice del diario por clave natural**: `por_clave = Map(asiento.clave_natural →
   asiento)`; los asientos sin `clave_natural` se **descartan** del índice.
4. **Sin clave natural no hay cotejo**: si un movimiento no tiene clave (`_claveDe`
   devuelve `null`) → se empuja a `pendientes` con `{movimiento, motivo:'movimiento sin
   clave natural: no se puede cotejar'}` (**sin `clave`, `lado`, `importe`** — no se
   afirman datos que no se tienen).
5. **Un movimiento = un cobro/pago**: si la clave está en el índice → `cotejados` con
   `{clave, movimiento, asiento, lado, importe, cuadrado:true}`.
6. **Sin asiento → a la cola del juicio** (nunca se inventa el cobro/pago): `pendientes`
   con `{clave, movimiento, lado, importe, motivo, requiere_cola:true,
   juicio:'partida-no-identificada'}`. El `motivo` declara: si `diario_disponible` →
   `'el movimiento no tiene cobro/pago cotejado en el diario: un movimiento = un
   cobro/pago'`; si no → `'el diario (B2) no respondio: no se afirma el cotejo'`.
7. **El lado sale del signo declarado** (`_lado`): `cargo`/`debito`/`salida` → `'salida'`;
   `abono`/`credito`/`entrada` → `'entrada'`; cualquier otro o ausente → `null` (**dato
   ausente = desconocido; no se afirma la dirección**).
8. **Clave natural** (`_claveDe`): `m.clave` si viene; si no, `[fecha, importe, signo,
   (referencia ?? concepto)]` unido por `'|'` (ausentes individuales → `'-'`); todos
   ausentes → `null`.
9. **`cuadra`**: `pendientes.length === 0 && diario_disponible` — **solo se afirma el cuadre
   si el diario respondió**. Sin diario disponible, `cuadra:false`.
10. **`juicio_delegado_a:'partida-no-identificada'`**: se declara la frontera; el juicio
    **no** vive aquí.
11. **Fire-and-forget idempotente** (`onMovimientoBancario`): toma `d.project_id` y
    `d.movimiento`; sin alguno de ellos o sin clave → devuelve `null` **sin escribir**. Con
    ellos, `espejo.set(clave, movimiento)` — **idempotente por clave natural** (un movimiento
    = una clave). No publica evento de dominio.
12. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
13. **Puro**: sin persistencia, sin reloj, sin azar. El espejo es estado **efímero de
    proceso**, no custodia.
14. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `cuadre-cobro-pago.cuadrar.response`.

### 1. `cuadrar` — cotejar lo declarado

```json
{
  "project_id": "e57a318a-...",
  "movimiento": { "clave": "2026-09-01|121.00|abono|VENTA-1", "fecha": "2026-09-01", "importe": 121.0, "signo": "abono" },
  "periodo": "2026-09",
  "correlation_id": "abc-123"
}
```

Respuesta `200` (cotejado):

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "fuente_asientos": "diario",
  "diario_disponible": true,
  "total_movimientos": 1,
  "cotejados": [
    { "clave": "2026-09-01|121.00|abono|VENTA-1", "movimiento": { "...": "..." }, "asiento": { "...": "..." }, "lado": "entrada", "importe": 121.0, "cuadrado": true }
  ],
  "pendientes": [],
  "cuadra": true,
  "juicio_delegado_a": "partida-no-identificada"
}
```

Respuesta `200` (pendiente — **no se inventa el cobro/pago**):

```json
{
  "project_id": "e57a318a-...",
  "periodo": null,
  "fuente_asientos": "diario",
  "diario_disponible": true,
  "total_movimientos": 1,
  "cotejados": [],
  "pendientes": [
    { "clave": "2026-09-03|12.50|cargo|COMISION", "movimiento": { "...": "..." }, "lado": "salida", "importe": 12.5, "motivo": "el movimiento no tiene cobro/pago cotejado en el diario: un movimiento = un cobro/pago", "requiere_cola": true, "juicio": "partida-no-identificada" }
  ],
  "cuadra": false,
  "juicio_delegado_a": "partida-no-identificada"
}
```

### 2. `cuadrar` sin declarar movimientos — coteja el espejo

Sin `movimiento`/`movimientos`/`m`, se coteja lo acumulado por
`contabilidad.movimiento_bancario` (E2). El espejo es idempotente por clave natural:
republicar el mismo movimiento **no** duplica.

### 3. Fire-and-forget — reacción a `contabilidad.movimiento_bancario`

`onMovimientoBancario` toma `d.project_id`, `d.movimiento` y (si viene) `d.clave`; acumula
`espejo.set(clave, movimiento)` y devuelve `null`. Sin `project_id`, sin `movimiento` o sin
clave → `null` sin acumular.

### 4. Fallo — falta `project_id`

Respuesta `400` + `cuadre-cobro-pago.cuadrar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/cuadre-cobro-pago.test.js`. Cubre:

- `cuadrar` con un movimiento que casa en el diario → `200 {cotejados:[{cuadrado:true}]}`,
  `cuadra:true`.
- Movimiento sin asiento → `pendientes` con `requiere_cola:true` y
  `juicio:'partida-no-identificada'` (**no se inventa el cobro/pago**).
- Movimiento sin clave natural → `pendientes` con el motivo de no poder cotejar.
- Diario (B2) sin responder → `diario_disponible:false`, `cuadra:false` y el motivo de no
  afirmar el cotejo.
- **El lado sale del signo declarado**: `cargo` → `'salida'`, `abono` → `'entrada'`, sin
  signo → `null`.
- `onMovimientoBancario` acumula en el espejo de forma idempotente por clave natural; sin
  `project_id`/`movimiento`/clave → `null` y no acumula.
- `cuadrar` sin movimientos declarados coteja el espejo.
- `project_id` ausente → `400 INVALID_INPUT` + `cuadre-cobro-pago.cuadrar.failed`.
- `toolCuadrar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CuadreCobroPago extends ModuloHibridoReflejo`; `name = 'cuadre-cobro-pago'`,
  `version = 'reflejo-0.1.0'`. **Sin `PosPersistencia`**; solo un espejo en memoria
  `this._espejo` (`Map<project_id, Map<clave, Movimiento>>`) que **no es custodia**.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/cuadre-cobro-pago/`; es de la vertical **libro**).
- `onCuadrarRequest` usa `this._atender(e, 'cuadrar', 'cuadre-cobro-pago.cuadrar.response',
  async (d) => {...})` y publica el par `failed` si `status !== 200`. `onMovimientoBancario`
  **no** usa `_atender`.
- Proyección `_cuadrar(input)` (`async`: pide el diario por evento); helpers `_diario`,
  `_lado`, `_claveDe`, `_espejoDe`, `_num`. Tool `toolCuadrar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: se alimenta de `contabilidad.movimiento_bancario` (E2) y lee
  `escritor-diario.asientos.request` (B2) por EVENTO. **CERO JUICIO**: lo que no coteja va a
  la cola de `partida-no-identificada` (E7) con `requiere_cola:true`.
