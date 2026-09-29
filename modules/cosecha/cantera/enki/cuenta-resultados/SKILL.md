---
name: cuenta-resultados
description: >
  Skill FULL del módulo REFLEJO `cuenta-resultados` de la vertical contabilidad de
  Enki. Deriva la CUENTA DE RESULTADOS (ingresos / gastos / resultado) del MAYOR —
  clasifica por prefijo con reglas declarables y declara el signo (beneficio/pérdida).
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites la cuenta de resultados (RPC cuenta-resultados.calcular.request).
  - Cuando depures por qué falta `project_id` (400 INVALID_INPUT), por qué el resultado
    sale `PERDIDA`/`NULO`, o por qué la fuente sale `espejo`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la cuenta (clasifica, no recalcula; resultado negativo = pérdida
    declarada; ley como dato).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo cuenta-resultados.
tags: [enki, modulo, reflejo, contabilidad, cuenta-resultados]
---

# cuenta-resultados — REFLEJO STATELESS de los resultados

## Qué hace el módulo

`cuenta-resultados` es un **REFLEJO STATELESS** (C2, hoja del plan): deriva la **CUENTA
DE RESULTADOS** (ingresos / gastos / resultado) del **MAYOR**. **NO recalcula los
asientos**: parte de `mayor-balanza` (B3) **POR EVENTO** y solo **CLASIFICA** por
prefijo de cuenta.

**La ley entra como DATO**: el sentido de las cuentas de resultado (qué prefijo es
ingreso y qué prefijo es gasto) es **DECLARABLE** (`reglas`); sin declararlas se usa la
composición por defecto sobre grupos estándar (**7 → INGRESO**, **6 → GASTO**). **Nada
se cablea de forma rígida**.

El resultado **SUMA** `ingresos − gastos`; un resultado **negativo** es una **PÉRDIDA
declarada** (`signo:'PERDIDA'`), **no un error**. Si `mayor-balanza` no responde en
timeout, deriva el mayor de un **espejo en memoria** de los asientos registrados
(`contabilidad.asiento_registrado`) y declara `fuente:'espejo'`. Determinista: mismo
mayor → misma cuenta de resultados. Sin `PosPersistencia` ni `project.activated`
(reflejo puro). Proyección `_calcular`. Par de fallo `cuenta-resultados.calcular.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `cuenta-resultados.calcular.request` | `onCalcularRequest` | RPC reflejo (cálculo puro): {project_id, ejercicio?, reglas?:[{prefijo, grupo:'INGRESO'\|'GASTO'}]} → {project_id, fuente:'mayor-balanza'\|'espejo', total_ingresos, total_gastos, resultado, signo:'BENEFICIO'\|'PERDIDA'\|'NULO', detalle:{ingresos, gastos, otro}}. Pide el mayor a mayor-balanza POR EVENTO (no recalcula los asientos); clasifica por prefijo con `reglas` declarables. Responde por cuenta-resultados.calcular.response; fallo (project_id ausente) → cuenta-resultados.calcular.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → C2): el diario registró un asiento → se refleja la muestra en el espejo en memoria (idempotente por clave natural/numero), por si mayor-balanza no responde. No muta el libro ni decide. |

### Publishes

| Evento | Descripción |
|---|---|
| `cuenta-resultados.calcular.response` | Respuesta RPC correlada de cuenta-resultados.calcular.request → {request_id, status:200, data:{total_ingresos, total_gastos, resultado, signo, detalle}}. Emitida por el helper _atender. |
| `cuenta-resultados.calcular.failed` | Par de fallo determinista (C2): project_id ausente → {status, error:{code, message, details?}}. Cierra el círculo de cuenta-resultados.calcular.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `cuenta-resultados.calcular.failed` cierra el círculo de
> `cuenta-resultados.calcular.request` cuando `_calcular` devuelve status ≠ 200
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
   `localeCompare`; produce el mismo formato que el mayor de B3.
4. **Reglas DECLARABLES**: `_reglas(raw)` acepta un array de `{prefijo, grupo}`; filtra
   los inválidos, normaliza `prefijo` a String y `grupo` a MAYÚSCULAS. Si no llega array
   o queda vacío → `REGLAS_DEFECTO` (`7 → INGRESO`, `6 → GASTO`). **No se cablea el
   sentido legal de las cuentas.**
5. **Clasificación por prefijo MÁS LARGO (determinista)**: `_grupoDe(cuenta, reglas)`
   elige la regla cuyo `prefijo` casa con `codigo.startsWith(prefijo)` y es **más largo**;
   sin regla que case → `'OTRO'`.
6. **Cada línea a su balde**: se apila `{cuenta, saldo, debe, haber}` en `ingresos`,
   `gastos` u `otro` según su grupo.
7. **Agregados de la cuenta**:
   `total_ingresos = round(-Σ saldo de ingresos, 2)` (se invierte el signo: las cuentas
   de ingreso son acreedoras);
   `total_gastos = round(Σ saldo de gastos, 2)` (deudoras);
   `resultado = round(total_ingresos - total_gastos, 2)`.
8. **El signo del resultado**:
   `signo = resultado > 0 ? 'BENEFICIO' : (resultado < 0 ? 'PERDIDA' : 'NULO')`. **Un
   resultado negativo es una pérdida declarada, no un error.**
9. **No reescribe asientos**: la cuenta solo clasifica el mayor; no muta nada.
   Determinista.
10. **El espejo es idempotente**: la clave es `asiento.clave_natural` o `asiento.numero`;
    la misma clave no se duplica; sin clave no se refleja.
11. **`ejercicio` se propaga** de `input.ejercicio` o queda `null` (etiqueta).
12. **Sin estado persistente**: no hay `PosPersistencia`, no hay `onProjectActivated`; el
    espejo vive en memoria.
13. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `cuenta-resultados.calcular.response`.

### 1. `calcular` — la cuenta de resultados

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "reglas": [ { "prefijo": "7", "grupo": "INGRESO" }, { "prefijo": "6", "grupo": "GASTO" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (beneficio):

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "fuente": "mayor-balanza",
  "total_ingresos": 121,
  "total_gastos": 50,
  "resultado": 71,
  "signo": "BENEFICIO",
  "detalle": {
    "ingresos": [ { "cuenta": "700", "saldo": -121, "debe": 0, "haber": 121 } ],
    "gastos": [ { "cuenta": "629", "saldo": 50, "debe": 50, "haber": 0 } ],
    "otro": []
  }
}
```

Sin `reglas`, se usan las de defecto (7 → INGRESO, 6 → GASTO). Si `mayor-balanza` no
responde en `4000 ms`, la misma respuesta sale con `fuente:'espejo'`.

### 2. Resultado negativo — pérdida declarada

Con `total_gastos > total_ingresos`:

```json
{ "total_ingresos": 50, "total_gastos": 121, "resultado": -71, "signo": "PERDIDA" }
```

**No es un error**: es una pérdida **declarada**. Con resultado exactamente `0` →
`signo:'NULO'`.

### 3. Fire-and-forget — reacción a `contabilidad.asiento_registrado`

`onAsientoRegistrado` refleja la muestra en el espejo (idempotente por clave) para poder
derivar el mayor si B3 no responde. **Devuelve `null`** y **no publica** evento.

### 4. Fallo — falta `project_id`

```json
{ "ejercicio": "2026" }
```

Respuesta `400` + `cuenta-resultados.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/cuenta-resultados.test.js`. Cubre:

- `calcular` con el mayor servido por `mayor-balanza` → `200 fuente:'mayor-balanza'`,
  ingresos/gastos clasificados por prefijo, `resultado` = ingresos − gastos,
  `signo:'BENEFICIO'`.
- `reglas` declaradas → clasificación propia; sin `reglas` → composición por defecto
  (7/6).
- `calcular` cuando `mayor-balanza` **no** responde → `fuente:'espejo'` derivada de
  `contabilidad.asiento_registrado`.
- Resultado negativo → `signo:'PERDIDA'` (pérdida declarada, no error); resultado cero →
  `signo:'NULO'`.
- Prefijo más largo gana (p. ej. `62` casa antes que `6`).
- `calcular` sin `project_id` → `400 INVALID_INPUT` +
  `cuenta-resultados.calcular.failed`.
- `onAsientoRegistrado` refleja y devuelve `null` sin publicar evento.
- `toolCalcular` devuelve la misma proyección que `_calcular`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CuentaResultados extends ModuloHibridoReflejo`; `name = 'cuenta-resultados'`,
  `version = 'reflejo-0.1.0'`. Espejo en memoria `this._espejo`
  (`Map<project_id, Map<clave, asiento>>`). Sin `PosPersistencia`.
- Constante `REGLAS_DEFECTO = [{prefijo:'7',grupo:'INGRESO'}, {prefijo:'6',
  grupo:'GASTO'}]`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/cuenta-resultados/`).
- `onCalcularRequest` usa `this._atender(e, 'calcular',
  'cuenta-resultados.calcular.response', async (d) => {...})`; dentro publica
  `cuenta-resultados.calcular.failed` si `status !== 200`. `onAsientoRegistrado` **no**
  usa `_atender` y devuelve `null`.
- Proyección `_calcular(input)` (`async`, pide el mayor por evento); helpers `_mayor`,
  `_derivarMayor`, `_reglas`, `_grupoDe`, `_espejoDe`, `_num`. Tool `toolCalcular`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `mayor-balanza.saldos.request` (B3) por evento; lo alimenta
  `contabilidad.asiento_registrado` (B2). Lo LEE `cierre-ejercicio` (C4) vía
  `cuenta-resultados.calcular.request` para registrar el resultado del cierre.
