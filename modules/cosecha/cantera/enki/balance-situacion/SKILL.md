---
name: balance-situacion
description: >
  Skill FULL del módulo REFLEJO `balance-situacion` de la vertical contabilidad de
  Enki. Deriva el BALANCE DE SITUACIÓN (activo / pasivo / patrimonio) del MAYOR —
  clasifica por prefijo con reglas declarables y declara el descuadre (ACTIVO != PASIVO
  + PATRIMONIO es error, no estado). Úsala para operar, depurar o extender el reflejo, o
  para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el balance de situación (RPC
    balance-situacion.calcular.request).
  - Cuando depures por qué el balance no cuadra (`cuadra:false` con `aviso` no nulo) o
    por qué falta `project_id` (400 INVALID_INPUT), o por qué la fuente sale `espejo`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del balance (clasifica, no recalcula; descuadre = error; ley como dato).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo balance-situacion.
tags: [enki, modulo, reflejo, contabilidad, balance-situacion]
---

# balance-situacion — REFLEJO STATELESS del balance

## Qué hace el módulo

`balance-situacion` es un **REFLEJO STATELESS** (C1, hoja del plan): deriva el **BALANCE
DE SITUACIÓN** (activo / pasivo / patrimonio) del **MAYOR**. **NO recalcula los
asientos**: parte de `mayor-balanza` (B3) **POR EVENTO** y solo **CLASIFICA** por
prefijo de cuenta.

**Invariante 1 (la partida doble cuadra)**: **ACTIVO = PASIVO + PATRIMONIO**. Un
descuadre **NO** es un estado del balance: es un **ERROR** — se **declara**
(`cuadra:false`, `aviso`), **no se matiza**.

**La ley entra como DATO**: la clasificación de cuentas por prefijo es **DECLARABLE**
(`reglas`); sin declararlas se usa la composición por defecto sobre grupos estándar
(1 y 2 → ACTIVO, 3 y 5 → PATRIMONIO, 4 → PASIVO). **Nada se cablea de forma rígida**.

Si `mayor-balanza` no responde en timeout, deriva el mayor de un **espejo en memoria** de
los asientos registrados (`contabilidad.asiento_registrado`) y declara `fuente:'espejo'`.
Determinista: mismo mayor → mismo balance. Sin `PosPersistencia` ni `project.activated`
(reflejo puro). Proyección `_calcular`. Par de fallo `balance-situacion.calcular.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `balance-situacion.calcular.request` | `onCalcularRequest` | RPC reflejo (cálculo puro): {project_id, ejercicio?, reglas?:[{prefijo, grupo}]} → {project_id, fuente:'mayor-balanza'\|'espejo', activo, pasivo, patrimonio, pasivo_patrimonio, descuadre, cuadra, aviso, detalle:{activo, pasivo, patrimonio, otro}}. Pide el mayor a mayor-balanza POR EVENTO (no recalcula los asientos); clasifica por prefijo con `reglas` declarables. Invariante 1: si no cuadra, se declara el descuadre. Responde por balance-situacion.calcular.response; fallo (project_id ausente) → balance-situacion.calcular.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → C1): el diario registró un asiento → se refleja la muestra en el espejo en memoria (idempotente por clave natural/numero), por si mayor-balanza no responde. No muta el libro ni decide. |

### Publishes

| Evento | Descripción |
|---|---|
| `balance-situacion.calcular.response` | Respuesta RPC correlada de balance-situacion.calcular.request → {request_id, status:200, data:{activo, pasivo, patrimonio, pasivo_patrimonio, descuadre, cuadra, aviso, detalle}}. Emitida por el helper _atender. |
| `balance-situacion.calcular.failed` | Par de fallo determinista (C1): project_id ausente → {status, error:{code, message, details?}}. Cierra el círculo de balance-situacion.calcular.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `balance-situacion.calcular.failed` cierra el círculo de
> `balance-situacion.calcular.request` cuando `_calcular` devuelve status ≠ 200
> (`project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onAsientoRegistrado` (fire-and-forget)
> **devuelve `null` siempre** y **no publica ningún evento**: solo refleja la muestra en
> el espejo (idempotente por `clave_natural`/`numero`). Si el payload no trae
> `project_id`/`asiento`/clave, devuelve `null` sin tocar el espejo.

> Nota: no figura en `module.json` pero lo **pide** `index.js` en `_mayor`: la RPC
> saliente `mayor-balanza.saldos.request` con `{project_id, ejercicio}` y
> `timeout_ms:4000`. Es una dependencia (DEP) por evento, no un evento emitido.

## Reglas de negocio

1. **Fallo determinista**: `_calcular` toma `input.project_id || this.project_id`;
   ausente → `400 INVALID_INPUT` (`field:'project_id'`).
2. **El mayor se pide, no se recalcula**: `_mayor(pid, input)` pide
   `mayor-balanza.saldos.request`; si la respuesta es `200` con `data.mayor` (array) →
   `fuente:'mayor-balanza'`; si no responde o no trae el mayor → se deriva del espejo y
   `fuente:'espejo'`. La fuente se **declara**.
3. **Derivación de respaldo desde el espejo**: `_derivarMayor(pid)` acumula debe/haber
   por cuenta desde los asientos reflejados, redondea a 2 decimales y ordena por
   `localeCompare`; produce el mismo formato que el mayor de B3 (con `saldo`,
   `saldo_deudor`, `saldo_acreedor`).
4. **Reglas DECLARABLES**: `_reglas(raw)` acepta un array de `{prefijo, grupo}`; filtra
   los inválidos, normaliza `prefijo` a String y `grupo` a MAYÚSCULAS. Si no llega array
   o queda vacío → `REGLAS_DEFECTO`. **No se cablea la composición legal.**
5. **Clasificación por prefijo MÁS LARGO (determinista)**: `_grupoDe(cuenta, reglas)`
   elige la regla cuyo `prefijo` casa con `codigo.startsWith(prefijo)` y es **más largo**;
   sin regla que case → `'OTRO'`.
6. **Cada línea al grupo que le toca**: se apila `{cuenta, saldo, saldo_deudor,
   saldo_acreedor}` en `buckets[grupo]` (ACTIVO/PASIVO/PATRIMONIO/OTRO).
7. **Agregados del balance**:
   `activo = round(Σ saldo del bucket ACTIVO, 2)`;
   `pasivo = round(-Σ saldo del bucket PASIVO, 2)`;
   `patrimonio = round(-Σ saldo del bucket PATRIMONIO, 2)` (se invierte el signo porque
   pasivo/patrimonio son acreedores);
   `pasivo_patrimonio = round(pasivo + patrimonio, 2)`;
   `descuadre = round(activo - pasivo_patrimonio, 2)`.
8. **El descuadre es un error, no un estado (invariante 1)**: `cuadra = |descuadre| <
   0.01`; `aviso = cuadra ? null : 'ACTIVO != PASIVO + PATRIMONIO: descuadre declarado
   (error, no estado)'`. **El balance no lo esconde ni lo cuadra por el usuario.**
9. **No reescribe asientos (invariante 2)**: el balance solo clasifica el mayor; no muta
   nada. Determinista.
10. **El espejo es idempotente**: la clave es `asiento.clave_natural` o `asiento.numero`;
    la misma clave no se duplica; sin clave no se refleja.
11. **`ejercicio` se propaga** de `input.ejercicio` o queda `null` (etiqueta).
12. **Sin estado persistente**: no hay `PosPersistencia`, no hay `onProjectActivated`; el
    espejo vive en memoria.
13. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `balance-situacion.calcular.response`.

### 1. `calcular` — el balance de situación

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "reglas": [ { "prefijo": "1", "grupo": "ACTIVO" }, { "prefijo": "4", "grupo": "PASIVO" }, { "prefijo": "3", "grupo": "PATRIMONIO" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (cuando cuadra):

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "fuente": "mayor-balanza",
  "activo": 121,
  "pasivo": 121,
  "patrimonio": 0,
  "pasivo_patrimonio": 121,
  "descuadre": 0,
  "cuadra": true,
  "aviso": null,
  "detalle": {
    "activo": [ { "cuenta": "430", "saldo": 121, "saldo_deudor": 121, "saldo_acreedor": 0 } ],
    "pasivo": [ { "cuenta": "400", "saldo": -121, "saldo_deudor": 0, "saldo_acreedor": 121 } ],
    "patrimonio": [],
    "otro": []
  }
}
```

Sin `reglas`, se usan las de defecto (1, 2 → ACTIVO; 3, 5 → PATRIMONIO; 4 → PASIVO).
Si `mayor-balanza` no responde en `4000 ms`, la misma respuesta sale con
`fuente:'espejo'`.

### 2. Balance que no cuadra — el descuadre se declara

Si ACTIVO ≠ PASIVO + PATRIMONIO → `200` con `cuadra:false` y:

```json
{ "activo": 121, "pasivo": 100, "patrimonio": 0, "pasivo_patrimonio": 100, "descuadre": 21, "cuadra": false, "aviso": "ACTIVO != PASIVO + PATRIMONIO: descuadre declarado (error, no estado)" }
```

**No se matiza**: el descuadre es un error.

### 3. Fire-and-forget — reacción a `contabilidad.asiento_registrado`

`onAsientoRegistrado` refleja la muestra en el espejo (idempotente por clave) para poder
derivar el mayor si B3 no responde. **Devuelve `null`** y **no publica** evento.

### 4. Fallo — falta `project_id`

```json
{ "ejercicio": "2026" }
```

Respuesta `400` + `balance-situacion.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/balance-situacion.test.js`. Cubre:

- `calcular` con el mayor servido por `mayor-balanza` → `200 fuente:'mayor-balanza'`,
  activo/pasivo/patrimonio clasificados por prefijo, `cuadra:true`.
- `reglas` declaradas → clasificación propia (p. ej. prefijo `5` a PASIVO); sin `reglas`
  → composición por defecto.
- `calcular` cuando `mayor-balanza` **no** responde → `fuente:'espejo'` derivada de
  `contabilidad.asiento_registrado`.
- Balance que **no** cuadra → `cuadra:false` y `aviso` declarado (no se matiza).
- Prefijo más largo gana (p. ej. `43` casa antes que `4`).
- `calcular` sin `project_id` → `400 INVALID_INPUT` +
  `balance-situacion.calcular.failed`.
- `onAsientoRegistrado` refleja y devuelve `null` sin publicar evento.
- `toolCalcular` devuelve la misma proyección que `_calcular`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `BalanceSituacion extends ModuloHibridoReflejo`; `name = 'balance-situacion'`,
  `version = 'reflejo-0.1.0'`. Espejo en memoria `this._espejo`
  (`Map<project_id, Map<clave, asiento>>`). Sin `PosPersistencia`.
- Constante `REGLAS_DEFECTO = [{prefijo:'1',grupo:'ACTIVO'}, {prefijo:'2',grupo:'ACTIVO'},
  {prefijo:'3',grupo:'PATRIMONIO'}, {prefijo:'4',grupo:'PASIVO'}, {prefijo:'5',
  grupo:'PATRIMONIO'}]`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/balance-situacion/`).
- `onCalcularRequest` usa `this._atender(e, 'calcular',
  'balance-situacion.calcular.response', async (d) => {...})`; dentro publica
  `balance-situacion.calcular.failed` si `status !== 200`. `onAsientoRegistrado` **no**
  usa `_atender` y devuelve `null`.
- Proyección `_calcular(input)` (`async`, pide el mayor por evento); helpers `_mayor`,
  `_derivarMayor`, `_reglas`, `_grupoDe`, `_espejoDe`, `_num`. Tool `toolCalcular`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `mayor-balanza.saldos.request` (B3) por evento; lo alimenta
  `contabilidad.asiento_registrado` (B2). Lo LEE `cierre-ejercicio` (C4) vía
  `balance-situacion.calcular.request` para registrar el cierre.
