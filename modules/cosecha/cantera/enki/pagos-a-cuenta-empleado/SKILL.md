---
name: pagos-a-cuenta-empleado
description: >
  Skill FULL del módulo REFLEJO `pagos-a-cuenta-empleado` de la vertical contabilidad de Enki.
  Deriva el IMPACTO de los anticipos/entregas a cuenta sobre el neto del recibo y el SALDO
  PENDIENTE — anticipos declarables, aislamiento persona-a-persona y sin decidir nada. Sin estado.
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites calcular el saldo pendiente de un empleado tras sus anticipos (RPC
    pagos-a-cuenta-empleado.impacto.request).
  - Cuando depures por qué se deniega con 403 AISLAMIENTO_PERSONA (consulta de una persona distinta
    del titular sin autorización de G7), por qué `saldo_pendiente:null` (falta el neto), por qué un
    anticipo aparece `null` (→ `faltantes`) o por qué falla con 400 INVALID_INPUT (falta
    `project_id`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (no decide, no paga, anticipos declarables, aislamiento persona-a-persona).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo pagos-a-cuenta-empleado.
tags: [enki, modulo, reflejo, contabilidad, pagos-a-cuenta-empleado]
---

# pagos-a-cuenta-empleado — REFLEJO del impacto de los anticipos sobre el neto

## Qué hace el módulo

`pagos-a-cuenta-empleado` es un **REFLEJO STATELESS** (G8, hoja del plan): **ANTICIPOS / ENTREGAS A
CUENTA Y SU IMPACTO EN EL NETO Y EL IRPF**. No todo es sueldo fijo. El diseño lo dice literal:
`impacto(n:ReciboNomina):Cuantía`, con `anticipos:Set<Anticipo>`. **Cálculo PURO, determinista**:
mismo neto declarado + mismos anticipos → mismo saldo pendiente.

**ESTE MÓDULO NO DECIDE**: **no aprueba** el anticipo, **no lo paga** y **no recalcula el IRPF**.
Deriva el **IMPACTO declarado**: cuánto se entregó a cuenta y qué **SALDO PENDIENTE** queda sobre el
neto del recibo. El neto se **COPIA** del recibo (lo calculó el sistema externo).

**LO QUE IMPACTA ES DECLARABLE**: qué concepto sufre el pago a cuenta (`concepto_pago_a_cuenta`, por
defecto el `neto`) y la **NATURALEZA** de cada anticipo (`anticipo` / `entrega` /
`retribucion_flexible`) las declara el negocio — **cero tipos cableados**.

**AISLAMIENTO PERSONA↔PERSONA (INVARIANTE DURA)**: si la consulta la hace una **PERSONA** (`quien`
distinta del titular), se consulta a **`acceso-nomina` (G7) POR EVENTO** y, si **NO autoriza** (o G7
no responde), se **DENIEGA** con **403 AISLAMIENTO_PERSONA** — este reflejo **no es una puerta
lateral** al dato personal.

Invariante: **dato ausente = desconocido**. Un anticipo sin importe queda `null` y se declara; sin el
neto del recibo el saldo pendiente queda **`[ABIERTO]`** y **no se estima**.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_impacto`. Cierra
el círculo de error con `pagos-a-cuenta-empleado.impacto.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `pagos-a-cuenta-empleado.impacto.request` | `onImpactoRequest` | RPC reflejo (calculo puro, determinista): {project_id, recibo\|recibos\|clave_natural\|empleado+periodo (el/los recibos ya calculados; si faltan se piden a recibo-nomina G1 POR EVENTO), anticipos? (DECLARABLES: [{importe, naturaleza?, concepto?, fecha?, id?, aprobado?}]), quien? (si la consulta la hace una persona distinta del titular, se autoriza contra acceso-nomina G7 POR EVENTO), concepto_pago_a_cuenta? (por defecto 'neto')} → {project_id, empleado, neto_total, anticipos, anticipos_total, saldo_pendiente (= neto - anticipos), excede_neto, naturaleza_origen, tipos_cableados:false, decide:false, paga:false, aislamiento:{aplicado, quien, empleado, es_propia, permitido, motivo}, faltantes, abierto}. Sin autorizacion de G7 para la nomina de otro → 403 AISLAMIENTO_PERSONA. El modulo no aprueba, no paga y no estima: lo ausente queda null y se declara. Responde por pagos-a-cuenta-empleado.impacto.response; project_id ausente o calculo invalido → pagos-a-cuenta-empleado.impacto.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `pagos-a-cuenta-empleado.impacto.response` | Respuesta RPC correlada de pagos-a-cuenta-empleado.impacto.request → {request_id, status:200, data:{neto_total, anticipos_total, saldo_pendiente, excede_neto, aislamiento, faltantes, abierto}}. Emitida por el helper _atender. |
| `pagos-a-cuenta-empleado.impacto.failed` | Par de fallo determinista (G8): project_id ausente (400), aislamiento persona-a-persona (403 AISLAMIENTO_PERSONA) o excepcion de la proyeccion (500) → {status, error:{code, message, details?}}. Cierra el circulo de pagos-a-cuenta-empleado.impacto.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `pagos-a-cuenta-empleado.impacto.failed` cierra el círculo de
> `pagos-a-cuenta-empleado.impacto.request` cuando `_impacto` devuelve status ≠ 200 (400/403/500).

> Nota de honestidad (cruce con `index.js`): `onImpactoRequest` publica
> `pagos-a-cuenta-empleado.impacto.failed` **solo si `_impacto` devuelve status ≠ 200** — y eso
> incluye el **403 AISLAMIENTO_PERSONA**. En `200` responde por `_atender` y **no** emite evento de
> dominio (este reflejo no tiene fire-and-forget propio).

> Nota: `_impacto` **pide al bus** `recibo-nomina.dar_forma.request` (G1) y
> `acceso-nomina.autorizar.request` (G7) con `this._rpc` — son **llamadas salientes**, **no** eventos
> que el módulo publique, y por eso **no figuran en `module.json`**. Tampoco figuran `_recibos`,
> `_titular`, `_aislamiento`, `_num` ni `toolImpacto`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente → `400
   INVALID_INPUT` (`field:'project_id'`).
2. **Los RECIBOS** (`_recibos`): si `input.recibos` es array → se usa entero (`origen_recibo:
   'declarado'`); si `input.recibo`/`input.nomina` es objeto → `[recibo]` (`'declarado'`); si no,
   **se pide por evento** a `recibo-nomina.dar_forma.request` (G1) con `clave_natural` o
   `empleado`+`periodo` (`origen_recibo:'recibo-nomina'`). Sin nada → `recibos:[]`,
   `origen_recibo:null`.
3. **El TITULAR** (`_titular`): `recibo.empleado` → el primer recibo con `empleado` → `input.empleado`
   → `null`.
4. **AISLAMIENTO PERSONA↔PERSONA** (`_aislamiento`, solo si hay `quien`/`persona`):
   - Sin sujeto declarado (consulta del sistema/negocio) → `{aplicado:false, motivo:'sin sujeto
     declarado (consulta del sistema)'}`. **No hay aislamiento que aplicar.**
   - `quien === titular` → `{aplicado:true, es_propia:true, permitido:true, motivo:'cada uno ve la
     suya (eje persona)'}`.
   - Si no, **se consulta a G7 por evento** (`acceso-nomina.autorizar.request`, `timeout_ms:4000`).
     Si G7 **no responde** → `permitido:false` («G7 no respondio: sin autorizacion declarada no se
     sirve la nomina de otro»). Si responde, se copia `es_propia`/`alcance`/`permitido`/`motivo`.
   - **`permitido === false` → `403 AISLAMIENTO_PERSONA`** con `{quien, empleado, alcance}` y **no se
     sigue calculando nada**.
5. **El NETO se COPIA** de los recibos (`_num(r.neto)`): cada recibo sin neto numérico →
   `faltantes:'recibo(<clave>).neto'`. `neto_total` = suma redondeada **solo** si **todos** los
   recibos traen neto; si no, `null`. Sin recibos → `faltantes:'recibo'`.
6. **Los ANTICIPOS son DECLARABLES**: `input.anticipos` (array) o `input.anticipo` (uno). Un escalar
   se envuelve como `{importe: a}`. Cada anticipo se normaliza con `{id, importe, naturaleza,
   concepto, fecha, aprobado}` (alias `tipo` → `naturaleza`; `aprobado` pasa a `true`/`false`/`null`).
7. **Un anticipo sin importe → `null` y `faltantes:'anticipos[i].importe'`**; **no se rellena con
   0**.
8. **`anticipos_total`**: `0` si no hay anticipos (**aritmética de conjunto vacío, no un tipo
   rellenado**); si **todos** traen importe → suma redondeada; si **alguno** falta → `null`.
9. **`saldo_pendiente` = `neto_total − anticipos_total`** **solo** si ambas piezas no son `null`; si
   no → `null` (**`[ABIERTO]`, nada se estima**).
10. **`excede_neto`**: `saldo_pendiente < 0` si el saldo no es `null`; si no, `null`. Un saldo
    negativo **SE DECLARA** (se entregó más de lo devengado), **no se recorta**.
11. **`naturaleza_origen`**: `'declarada'` si algún anticipo trajo `naturaleza`; si no, `null`.
    **`tipos_cableados:false`** siempre.
12. **El módulo NO aprueba ni paga**: `decide:false`, `paga:false`, `calculo_puro:true`. Y declara el
    `concepto_pago_a_cuenta` (por defecto `'neto'`).
13. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
14. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; aislamiento → `403
    AISLAMIENTO_PERSONA`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `pagos-a-cuenta-empleado.impacto.response`; el error cierra con
`pagos-a-cuenta-empleado.impacto.failed`.

### 1. `impacto` — neto declarado + anticipos declarados

```json
{
  "project_id": "e57a318a-...",
  "recibo": { "empleado": "E-014", "periodo": "2026-09", "neto": 1757 },
  "anticipos": [
    { "id": "A-1", "importe": 300, "naturaleza": "anticipo", "fecha": "2026-09-10" },
    { "id": "A-2", "importe": 200, "naturaleza": "entrega", "fecha": "2026-09-20" }
  ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "empleado": "E-014",
  "periodo": "2026-09",
  "origen_recibo": "declarado",
  "concepto_pago_a_cuenta": "neto",
  "naturaleza_origen": "declarada",
  "tipos_cableados": false,
  "neto_total": 1757,
  "anticipos": [
    { "id": "A-1", "importe": 300, "naturaleza": "anticipo", "concepto": null, "fecha": "2026-09-10", "aprobado": null },
    { "id": "A-2", "importe": 200, "naturaleza": "entrega", "concepto": null, "fecha": "2026-09-20", "aprobado": null }
  ],
  "anticipos_total": 500,
  "saldo_pendiente": 1257,
  "excede_neto": false,
  "decide": false,
  "paga": false,
  "calculo_puro": true,
  "aislamiento": { "aplicado": false, "motivo": "sin sujeto declarado (consulta del sistema)" },
  "faltantes": [],
  "abierto": false,
  "motivo": null
}
```

### 2. `impacto` — la nómina de OTRO sin autorización: DENEGADO

```json
{ "project_id": "e57a318a-...", "empleado": "E-014", "quien": "E-021", "recibo": { "empleado": "E-014", "neto": 1757 } }
```

G7 (G7) no autoriza (o no responde) → **`403` + `pagos-a-cuenta-empleado.impacto.failed`**:

```json
{ "status": 403, "error": { "code": "AISLAMIENTO_PERSONA", "message": "la nomina es dato personal: sin encargo declarado no se ve la de otro (aislamiento persona-a-persona)", "details": { "quien": "E-021", "empleado": "E-014" } } }
```

### 3. `impacto` — sin el neto del recibo (saldo `[ABIERTO]`)

Sin `neto` en el recibo → `neto_total:null`, `saldo_pendiente:null`, `excede_neto:null`,
`faltantes:["recibo(<clave_natural|?>).neto"]` (literal `recibo(?).neto` si el recibo no trae
`clave_natural`), `abierto:true`. **No se estima.**

### 4. `impacto` — un anticipo sin importe

Un anticipo sin `importe` → su `importe:null`, `faltantes:["anticipos[i].importe"]`,
`anticipos_total:null` y `saldo_pendiente:null`. **Nada se rellena con 0.**

### 5. Fallo — falta `project_id`

Respuesta `400` + `pagos-a-cuenta-empleado.impacto.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/pagos-a-cuenta-empleado.test.js`. Cubre:

- `impacto` con neto + anticipos → `200`, `anticipos_total` = suma, `saldo_pendiente` = neto −
  anticipos, `excede_neto` correcto; `decide:false`, `paga:false`, `tipos_cableados:false`.
- **Aislamiento persona↔persona**: con `quien` distinto del titular y G7 sin autorizar → `403
  AISLAMIENTO_PERSONA` + `.impacto.failed`; el propio titular → permitido sin consultar.
- Sin `quien` (consulta del sistema) → `aislamiento.aplicado:false` y se calcula igual.
- Un saldo negativo → `excede_neto:true` (**se declara, no se recorta**).
- Un anticipo sin importe → `null` y en `faltantes`; `anticipos_total:null` (**no se rellena con 0**).
- Sin neto del recibo → `saldo_pendiente:null` (**`[ABIERTO]`**).
- Sin recibos declarados se pide por evento a `recibo-nomina` (G1).
- `project_id` ausente → `400 INVALID_INPUT` + `.impacto.failed`.
- `toolImpacto` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PagosACuentaEmpleado extends ModuloHibridoReflejo`; `name = 'pagos-a-cuenta-empleado'`,
  `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated` (REFLEJO
  stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/pagos-a-cuenta-empleado/`).
- `onImpactoRequest` usa `this._atender(e, 'impacto', 'pagos-a-cuenta-empleado.impacto.response',
  async (d) => {...})` con cierre de círculo (el `403 AISLAMIENTO_PERSONA` también emite el par
  `failed`).
- Proyección `_impacto(input)` (**asíncrona**); helpers `_recibos` (RPC a G1), `_titular`,
  `_aislamiento` (RPC a G7), `_num`. Tool `toolImpacto`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimenta el recibo de `recibo-nomina` (G1) y la autorización de `acceso-nomina` (G7) por
  evento; lo LEE `liquidacion-baja-empleado` (G10), que pide
  `pagos-a-cuenta-empleado.impacto.request` para descontar el anticipo pendiente.
- **PARÁMETRO COMO DATO**: `concepto_pago_a_cuenta` y la `naturaleza` de cada anticipo son
  **declarables**; el código **no asume** ningún tipo. **NO decide y NO paga**; el neto se **copia**
  del recibo.
