---
name: liquidacion-baja-empleado
description: >
  Skill FULL del módulo REFLEJO `liquidacion-baja-empleado` de la vertical contabilidad de Enki.
  Cierra la CUENTA DEL TRABAJADOR (finiquito / indemnización) calculando desde lo DECLARADO y
  descontando los anticipos, sin decidir el derecho ni quedar ningún acreedor abierto. Sin estado.
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites liquidar la cuenta de un trabajador que causa baja (RPC
    liquidacion-baja-empleado.liquidar.request).
  - Cuando depures por qué se deniega con 403 AISLAMIENTO_PERSONA (consulta de una persona distinta
    del titular sin autorización de G7), por qué `neto_liquidacion:null` (falta el bruto o los
    anticipos), por qué aparece `faltantes:["conceptos"]` sin conceptos declarados, o por qué falla
    con 400 INVALID_INPUT (falta `project_id`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (no decide el derecho, conceptos declarados, anticipos descontados, aislamiento
    persona-a-persona).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo liquidacion-baja-empleado.
tags: [enki, modulo, reflejo, contabilidad, liquidacion-baja-empleado]
---

# liquidacion-baja-empleado — REFLEJO del cierre de la cuenta del trabajador

## Qué hace el módulo

`liquidacion-baja-empleado` es un **REFLEJO STATELESS** (G10, hoja del plan): **CIERRE DE LA CUENTA
DEL TRABAJADOR (finiquito / indemnización) PARA QUE NO QUEDE UN ACREEDOR ABIERTO**. El diseño lo dice
literal: `liquidar(...):Asiento`, con `empleado:Empleado`. **Cálculo PURO, determinista**: mismos
conceptos declarados → misma liquidación.

**ESTE MÓDULO NO DECIDE**: **no decide** la indemnización, **no decide** los días de vacaciones,
**no decide** si procede un finiquito. **TODOS** los conceptos llegan **DECLARADOS** (importe +
signo) y el reflejo los agrega. La indemnización/el finiquito son **DATO**: el derecho lo declara
**quien sabe** (la ley, el convenio, el acuerdo) — aquí **no se cablea ninguna fórmula legal**.

**LA CUENTA SE CIERRA CONTRA LO ENTREGADO A CUENTA**: el saldo de anticipos pendientes se trae de
**`pagos-a-cuenta-empleado` (G8) POR EVENTO** (o declarado) y se **RESTA** del bruto de liquidación,
de modo que la cuenta del trabajador queda **a cero sin acreedor abierto**.

**AISLAMIENTO PERSONA↔PERSONA (INVARIANTE DURA)**: si la consulta la hace una **PERSONA** distinta
del titular, se consulta a **`acceso-nomina` (G7) POR EVENTO** y, si **NO autoriza** (o G7 no
responde), se **DENIEGA** con **403 AISLAMIENTO_PERSONA**.

Invariante: **dato ausente = desconocido**. Un concepto sin importe queda `null` y se declara en
`faltantes`; **jamás** se rellena con `0` **ni** se estima una indemnización.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_liquidar`. Cierra
el círculo de error con `liquidacion-baja-empleado.liquidar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `liquidacion-baja-empleado.liquidar.request` | `onLiquidarRequest` | RPC reflejo (calculo puro, determinista): {project_id, empleado, conceptos\|concepto (DECLARADOS: [{concepto, importe, signo?, clase?}]), indemnizacion?\|vacaciones?\|pagas_extra?\|finiquito? (importe declarado, tambien admitidos como campo con nombre), anticipos?\|anticipos_pendientes? (declarado o se pide a pagos-a-cuenta-empleado G8 POR EVENTO), quien? (si pregunta una persona distinta del titular, se autoriza contra acceso-nomina G7 POR EVENTO), fecha_baja?} → {project_id, empleado, conceptos, bruto_liquidacion, anticipos:{pendiente, origen:'declarado'\|'pagos-a-cuenta-empleado'}, neto_liquidacion (= bruto - anticipos pendientes), asiento:{clase:'liquidacion_baja', partidas, total_debe, total_haber, acreedor_cerrado, cuentas_cableadas:false}, decide:false, aplica_declarado:true, faltantes, abierto}. El modulo NO decide el derecho ni cablea ninguna formula legal; lo ausente queda null y se declara. Sin autorizacion de G7 para la nomina de otro → 403 AISLAMIENTO_PERSONA. Responde por liquidacion-baja-empleado.liquidar.response; project_id ausente o calculo invalido → liquidacion-baja-empleado.liquidar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `liquidacion-baja-empleado.liquidar.response` | Respuesta RPC correlada de liquidacion-baja-empleado.liquidar.request → {request_id, status:200, data:{bruto_liquidacion, anticipos, neto_liquidacion, asiento:{acreedor_cerrado, total_debe, total_haber}, faltantes, abierto}}. Emitida por el helper _atender. |
| `liquidacion-baja-empleado.liquidar.failed` | Par de fallo determinista (G10): project_id ausente (400), aislamiento persona-a-persona (403 AISLAMIENTO_PERSONA) o excepcion de la proyeccion (500) → {status, error:{code, message, details?}}. Cierra el circulo de liquidacion-baja-empleado.liquidar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `liquidacion-baja-empleado.liquidar.failed` cierra el círculo de
> `liquidacion-baja-empleado.liquidar.request` cuando `_liquidar` devuelve status ≠ 200
> (400/403/500).

> Nota de honestidad (cruce con `index.js`): `onLiquidarRequest` publica
> `liquidacion-baja-empleado.liquidar.failed` **solo si `_liquidar` devuelve status ≠ 200** — y eso
> incluye el **403 AISLAMIENTO_PERSONA**. En `200` responde por `_atender` y **no** emite evento de
> dominio (este reflejo no tiene fire-and-forget propio).

> Nota: `_liquidar` **pide al bus** `acceso-nomina.autorizar.request` (G7) y
> `pagos-a-cuenta-empleado.impacto.request` (G8) con `this._rpc` — son **llamadas salientes**, **no**
> eventos que el módulo publique, y por eso **no figuran en `module.json`**. Tampoco figuran
> `_conceptosRaw`, `_anticipos`, `_aislamiento`, `_signo`, `_num` ni `toolLiquidar`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente → `400
   INVALID_INPUT` (`field:'project_id'`).
2. **El TITULAR**: `input.empleado` con `String(...)`; si no viene → `null` (la liquidación se puede
   pedir sin titular declarado).
3. **AISLAMIENTO PERSONA↔PERSONA** (`_aislamiento`, solo si hay `quien`/`persona`):
   - Sin sujeto declarado → `{aplicado:false, motivo:'sin sujeto declarado (consulta del sistema)'}`.
   - `quien === empleado` → `{aplicado:true, es_propia:true, permitido:true, motivo:'cada uno ve la
     suya (eje persona)'}`.
   - Si no, **se consulta a G7 por evento** (`acceso-nomina.autorizar.request`, `timeout_ms:4000`).
     Si G7 **no responde** → `permitido:false` («G7 no respondio: sin autorizacion declarada no se
     sirve la nomina de otro»).
   - **`permitido === false` → `403 AISLAMIENTO_PERSONA`** con `{quien, empleado, alcance}` y **no se
     sigue calculando nada**.
4. **Los CONCEPTOS son DECLARADOS** (`_conceptosRaw`): `input.conceptos` (array) o `input.concepto`
   (uno); si no, `[]`. Cada uno se normaliza `{concepto, importe, signo, clase}`. **El módulo no
   decide ninguno.**
5. **Los conceptos con nombre se admiten como campo** — `indemnizacion`, `vacaciones`,
   `pagas_extra`, `finiquito` (objeto con `importe`/`signo`, o escalar): se **añaden** a la lista
   como `{concepto: campo, importe, signo, clase:'declarado'}`. **El importe es DATO declarado;
   ninguna fórmula legal.**
6. **Dato ausente = desconocido**: un concepto sin importe → `null` y `faltantes:
   'conceptos[i].importe'`; **no se rellena con 0**. Sin ningún concepto (`conceptos.length === 0`)
   → `faltantes:'conceptos'`.
7. **`bruto_liquidacion`** = `Σ(importe × signo)` redondeado **solo** si hay conceptos y **todos**
   tienen importe; si no → `null`. El **signo declarado** decide si un concepto **suma** o **resta**
   (no se supone legal).
8. **Los ANTICIPOS pendientes** (`_anticipos`), por precedencia:
   - `input.anticipos_pendientes` (numérico) → `{pendiente, origen:'declarado'}`.
   - `input.anticipos` objeto con `importe` → `{pendiente, origen:'declarado'}`.
   - `input.anticipos` **array** → suma redondeada de sus importes → `origen:'declarado'`.
   - Si no, **se pide por evento** a `pagos-a-cuenta-empleado.impacto.request` (G8) con `{empleado,
     recibo, quien}`, `timeout_ms:4000` → se usa `anticipos_total` (lo **ENTREGADO** a cuenta) como
     pendiente y se guarda `saldo` → `origen:'pagos-a-cuenta-empleado'`.
   - Sin respuesta útil → `{pendiente:null, origen:null, pedido:true}` y, si se pidió, `faltantes:
     'anticipos_pendientes'`.
9. **`neto_liquidacion` = `bruto_liquidacion − anticipos.pendiente`** **solo** si ambas piezas no son
   `null`; si no → `null` (**`[ABIERTO]`, nada se estima**).
10. **EL ASIENTO DE CIERRE**: una partida por concepto con importe
    `{concepto, cuenta:null, rol:'liquidacion', importe, signo}` y, si `anticipos.pendiente` no es
    `null` ni `0`, una partida extra `{concepto:'anticipos_pendientes', cuenta:null,
    rol:'anticipo_a_descontar', importe: −pendiente, signo: −1}`.
    - `total_debe` = suma de los `importe > 0`; `total_haber` = suma de los `|importe| < 0 |`.
    - **`cuentas_cableadas:false`**: aquí **no** se cablea ningún número del PGC.
11. **`acreedor_cerrado`** = `(faltantes.length === 0) && (neto_liquidacion !== null)`: la cuenta del
    trabajador queda **cerrada, sin acreedor abierto**. Si falta algo, **no** se declara cerrado.
12. **El módulo NO decide el derecho**: `decide:false`, `aplica_declarado:true`, `calculo_puro:true`.
13. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
14. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; aislamiento → `403
    AISLAMIENTO_PERSONA`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `liquidacion-baja-empleado.liquidar.response`; el error cierra con
`liquidacion-baja-empleado.liquidar.failed`.

### 1. `liquidar` — conceptos declarados + anticipos declarados

```json
{
  "project_id": "e57a318a-...",
  "empleado": "E-014",
  "fecha_baja": "2026-09-30",
  "conceptos": [
    { "concepto": "finiquito", "importe": 1757 },
    { "concepto": "vacaciones no disfrutadas", "importe": 420 }
  ],
  "indemnizacion": 2000,
  "anticipos_pendientes": 500,
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "empleado": "E-014",
  "fecha_baja": "2026-09-30",
  "conceptos": [
    { "concepto": "finiquito", "importe": 1757, "signo": 1, "clase": null },
    { "concepto": "vacaciones no disfrutadas", "importe": 420, "signo": 1, "clase": null },
    { "concepto": "indemnizacion", "importe": 2000, "signo": 1, "clase": "declarado" }
  ],
  "bruto_liquidacion": 4177,
  "anticipos": { "pendiente": 500, "origen": "declarado" },
  "neto_liquidacion": 3677,
  "asiento": {
    "clase": "liquidacion_baja",
    "empleado": "E-014",
    "partidas": [
      { "concepto": "finiquito", "cuenta": null, "rol": "liquidacion", "importe": 1757, "signo": 1 },
      { "concepto": "vacaciones no disfrutadas", "cuenta": null, "rol": "liquidacion", "importe": 420, "signo": 1 },
      { "concepto": "indemnizacion", "cuenta": null, "rol": "liquidacion", "importe": 2000, "signo": 1 },
      { "concepto": "anticipos_pendientes", "cuenta": null, "rol": "anticipo_a_descontar", "importe": -500, "signo": -1 }
    ],
    "total_debe": 4177,
    "total_haber": 500,
    "acreedor_cerrado": true,
    "cuentas_cableadas": false
  },
  "decide": false,
  "aplica_declarado": true,
  "calculo_puro": true,
  "faltantes": [],
  "abierto": false,
  "motivo": null
}
```

### 2. `liquidar` — sin conceptos declarados (el derecho no se inventa)

Sin `conceptos` ni campos con nombre → `conceptos:[]`, `bruto_liquidacion:null`,
`faltantes:["conceptos"]`, `abierto:true`, `acreedor_cerrado:false`. **El módulo no decide la
indemnización.**

### 3. `liquidar` — anticipos por evento (G8)

Sin anticipos declarados se consulta a `pagos-a-cuenta-empleado` (G8) por evento →
`anticipos:{pendiente, origen:'pagos-a-cuenta-empleado', saldo}`; el pendiente es lo **entregado** a
cuenta y se resta del bruto.

### 4. `liquidar` — la cuenta de OTRO sin autorización: DENEGADO

Con `quien` distinto de `empleado` y G7 sin autorizar (o sin responder) → **`403` +
`liquidacion-baja-empleado.liquidar.failed`**:

```json
{ "status": 403, "error": { "code": "AISLAMIENTO_PERSONA", "message": "la nomina es dato personal: sin encargo declarado no se ve la de otro (aislamiento persona-a-persona)", "details": { "quien": "E-021", "empleado": "E-014" } } }
```

### 5. Fallo — falta `project_id`

Respuesta `400` + `liquidacion-baja-empleado.liquidar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/liquidacion-baja-empleado.test.js`. Cubre:

- `liquidar` con conceptos declarados → `200`, `bruto_liquidacion` = Σ importe × signo,
  `neto_liquidacion` = bruto − anticipos, `acreedor_cerrado:true` con `decide:false`,
  `aplica_declarado:true`.
- **El módulo no decide el derecho**: sin conceptos → `bruto_liquidacion:null`,
  `faltantes:['conceptos']`, `acreedor_cerrado:false` (**ninguna fórmula legal cableada**).
- Los campos con nombre (`indemnizacion`, `vacaciones`, `pagas_extra`, `finiquito`) se admiten como
  conceptos declarados.
- El signo declarado suma o resta el concepto.
- **Aislamiento persona↔persona**: con `quien` distinto del titular y G7 sin autorizar → `403
  AISLAMIENTO_PERSONA` + `.liquidar.failed`.
- Los anticipos: declarados (escalar/objeto/array) o pedidos a G8 por evento (`origen`); sin
  respuesta → `faltantes:'anticipos_pendientes'`.
- Un concepto sin importe queda `null` y en `faltantes` (**no se rellena con 0**).
- `project_id` ausente → `400 INVALID_INPUT` + `.liquidar.failed`.
- `toolLiquidar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `LiquidacionBajaEmpleado extends ModuloHibridoReflejo`; `name =
  'liquidacion-baja-empleado'`, `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin
  `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/liquidacion-baja-empleado/`).
- `onLiquidarRequest` usa `this._atender(e, 'liquidar', 'liquidacion-baja-empleado.liquidar.
  response', async (d) => {...})` con cierre de círculo (el `403 AISLAMIENTO_PERSONA` también emite
  el par `failed`).
- Proyección `_liquidar(input)` (**asíncrona**); helpers `_conceptosRaw`, `_anticipos` (RPC a G8),
  `_aislamiento` (RPC a G7), `_signo`, `_num`. Tool `toolLiquidar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimentan `acceso-nomina` (G7, autorización) y `pagos-a-cuenta-empleado` (G8, anticipos)
  por evento; cierra la cadena de personal (G10).
- **PARÁMETRO COMO DATO**: los conceptos y sus importes/signos son **declarados**; el código **no
  cablea** ninguna fórmula legal ni número del PGC. **NO decide el derecho** y la cuenta queda
  cerrada **sin acreedor abierto**.
