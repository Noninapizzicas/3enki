---
name: saldo-tesoreria
description: >
  Skill FULL del módulo REFLEJO `saldo-tesoreria` de la vertical contabilidad de Enki.
  POSICIÓN REAL DE DINERO POR CUENTA: derivación DETERMINISTA del saldo de cada cuenta bancaria
  cruzando el MAYOR (saldos por cuenta contable) con el MAESTRO DE CUENTAS BANCARIAS — sin
  maestro no hay saldo y nada se inventa. Sin estado. Úsala para operar, depurar o extender el
  reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el saldo de tesorería por cuenta de un proyecto (RPC
    saldo-tesoreria.calcular.request).
  - Cuando depures por qué `disponible:false` (falta el maestro E11 o el mayor B3), por qué
    una cuenta queda `saldo:null` con `abierto:['cuenta_contable']`, o por qué `completo:false`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    saldo (sin maestro no hay saldo, dato ausente = desconocido, determinista, sin mutar).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo saldo-tesoreria.
tags: [enki, modulo, reflejo, contabilidad, saldo-tesoreria]
---

# saldo-tesoreria — REFLEJO STATELESS del saldo por cuenta

## Qué hace el módulo

`saldo-tesoreria` es un **REFLEJO STATELESS** (E4, hoja del plan): la **POSICIÓN REAL DE
DINERO POR CUENTA**. Derivación **DETERMINISTA**: el saldo de tesorería de cada cuenta
bancaria sale del **MAYOR** (saldos por cuenta contable, derivados del diario B3) cruzado
con el **MAESTRO DE CUENTAS BANCARIAS** (E11), que dice **qué cuenta contable corresponde a
cada cuenta bancaria y en qué moneda**. Cálculo **PURO**.

Ambas fuentes se piden **POR EVENTO** (**nunca un `require` cruzado**):

- **`maestro-cuentas-bancarias.listar.request`** (E11) → las cuentas declaradas del negocio.
- **`mayor-balanza.saldos.request`** (B3) → los saldos por cuenta contable derivados del diario.

Invariantes:

- **SIN MAESTRO NO HAY SALDO**: si el maestro de cuentas bancarias **no está disponible**, no
  se inventa ninguna cuenta ni saldo: `disponible:false`, `cuentas:[]` (invariante 7: **dato
  ausente = desconocido; nada se estima**).
- Una cuenta del maestro **sin `cuenta_contable` declarada** queda `saldo:null`
  (`abierto:['cuenta_contable']`): **no se adivina** de qué cuenta del mayor sale su dinero.
- Si el **mayor no responde**, el saldo queda `null`, el total se declara **parcial**
  (`completo:false`) y la cuenta lleva `abierto:['saldo']`.
- **Determinista**: mismo mayor + mismo maestro → mismo saldo.
- **NO escribe, NO persiste, NO muta.** Sin `PosPersistencia` ni `project.activated`: **no es
  custodio**.

Lee `contabilidad.asiento_registrado` (B2) **solo como señal** de que el mayor cambió (**no
muta nada**).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `saldo-tesoreria.calcular.request` | `onCalcularRequest` | RPC reflejo (calculo puro, determinista): {project_id, cuenta?, fecha?, ejercicio?} → {project_id, fecha, maestro_disponible, mayor_disponible, fuente_mayor, disponible, saldo_total, total_conocidas, total_cuentas, completo, cuentas:[{id_cuenta, moneda, banco, cuenta_contable, saldo, naturaleza:'deudor'\\|'acreedor'\\|'cero', abierto:[]}]}. Pide el maestro a maestro-cuentas-bancarias (E11) y los saldos a mayor-balanza (B3) por EVENTO; sin maestro → disponible:false y cuentas vacias (no se inventa el saldo). Responde por saldo-tesoreria.calcular.response; project_id ausente → saldo-tesoreria.calcular.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → E4): el diario registro un asiento → señal de que el mayor (B3, del que se deriva el saldo) ha cambiado. No muta nada ni publica evento de dominio; la derivacion determinista se hace en calcular.request. |

### Publishes

| Evento | Descripción |
|---|---|
| `saldo-tesoreria.calcular.response` | Respuesta RPC correlada de saldo-tesoreria.calcular.request → {request_id, status:200, data:{saldo_total, cuentas, completo, maestro_disponible, mayor_disponible}}. Emitida por el helper _atender. |
| `saldo-tesoreria.calcular.failed` | Par de fallo determinista (E4): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de saldo-tesoreria.calcular.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `saldo-tesoreria.calcular.failed` cierra el círculo de
> `saldo-tesoreria.calcular.request` cuando `_calcular` devuelve status ≠ 200 (`400`,
> `project_id` ausente). El fire-and-forget `onAsientoRegistrado` **no** tiene par `failed`:
> no es una petición — devuelve `null` y solo registra un `debug`.

> Nota de honestidad (cruce con `index.js`): la respuesta **sin maestro** es `200` con
> `disponible:false`, `saldo_total:null`, `cuentas:[]` y un campo extra `motivo` **no
> declarado en el module.json** (`'el maestro de cuentas bancarias (E11) no respondio: sin el,
> el banco es un numero falso'`) — emitido por `_calcular` cuando el maestro falta.

> Nota: la respuesta **con maestro** añade también `total_conocidas` (cuentas con saldo
> conocido) — presente en `_calcular`, **no** listado en el `description` del module.json.

## Reglas de negocio

1. **Sin maestro no hay saldo (invariante 7)**: si `maestro-cuentas-bancarias.listar.request`
   **no responde** (o no devuelve `data.cuentas` array) → `200` con `maestro_disponible:false`,
   `mayor_disponible:false`, `disponible:false`, `saldo_total:null`, `cuentas:[]` y `motivo`.
   **Ninguna cuenta se inventa.**
2. **El maestro sí respondió**: `_maestro` acepta `r.data.cuentas` array; si no, se declara
   no disponible. Se lee **antes** del mayor (el mayor solo tiene sentido con cuentas
   declaradas).
3. **El mayor, por EVENTO**: `mayor-balanza.saldos.request`
   (`{project_id, ejercicio, fecha}`, `timeout_ms:4000`); se acepta `r.data.mayor` array
   (cada línea `{cuenta, saldo}`) → `{disponible:true, fuente: r.data.fuente || 'diario'}`.
   Sin respuesta → `{disponible:false, fuente:null, lineas:[]}`.
4. **Índice del mayor**: `saldo_por_cuenta = Map(cuenta contable → saldo)`; las líneas sin
   `cuenta` se descartan.
5. **Derivación determinista por cuenta declarada**: para cada cuenta del maestro, el saldo
   es `saldo_por_cuenta.get(cuenta_contable)` **solo si** su `cuenta_contable` está
   declarada **y** el mayor está disponible y la conoce; si no → `null`.
6. **`abierto`: qué falta se declara**: `'cuenta_contable'` si la cuenta no declara su
   cuenta contable; `'saldo'` si el mayor no responde. **Nada se rellena por suposición.**
7. **Naturaleza del saldo**: `saldo > 0` → `'deudor'`; `saldo < 0` → `'acreedor'`;
   `saldo === 0` → `'cero'`; `saldo === null` → `null` (**sin afirmar**).
8. **Redondeo a 2 decimales** (`_round`) de cada saldo y del total.
9. **`saldo_total` solo suma lo conocido**: si hay al menos una cuenta con saldo conocido →
   suma de esas (redondeada a 2); si **ninguna** es conocida → `null` (**no se finge un
   cero**).
10. **`completo`**: `con_saldo.length === cuentas.length && mayor.disponible` — solo si
    **todas** las cuentas tienen saldo conocido y el mayor respondió. Con `[ABIERTO]`, el
    total se declara **parcial**.
11. **Filtro por cuenta**: si se declara `input.cuenta`, `cuentas` de la respuesta se filtra
    a esa `id_cuenta` — pero `saldo_total`, `total_conocidas`, `total_cuentas` y `completo`
    **se calculan sobre todas** (la visión completa es la del maestro).
12. **`fecha` y `ejercicio` declarables**: `fecha` se normaliza con `String(...)` o `null`;
    `ejercicio` se pasa tal cual al mayor (`input.ejercicio ?? null`).
13. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
14. **Puro**: sin estado, sin persistencia, sin reloj, sin azar.
15. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `saldo-tesoreria.calcular.response`. **No emite evento de dominio.**

### 1. `calcular` — el saldo por cuenta

```json
{
  "project_id": "e57a318a-...",
  "fecha": "2026-09-30",
  "ejercicio": "2026",
  "correlation_id": "abc-123"
}
```

Respuesta `200` (maestro y mayor disponibles):

```json
{
  "project_id": "e57a318a-...",
  "fecha": "2026-09-30",
  "maestro_disponible": true,
  "mayor_disponible": true,
  "fuente_mayor": "diario",
  "disponible": true,
  "saldo_total": 1210.5,
  "total_conocidas": 1,
  "total_cuentas": 1,
  "completo": true,
  "cuentas": [
    { "id_cuenta": "ES12-0000-0000-0000", "moneda": "EUR", "banco": "Banco X", "cuenta_contable": "572", "saldo": 1210.5, "naturaleza": "deudor", "abierto": [] }
  ]
}
```

### 2. Sin maestro (E11 no responde) — **no se inventa el saldo**

```json
{
  "project_id": "e57a318a-...",
  "fecha": null,
  "maestro_disponible": false,
  "mayor_disponible": false,
  "disponible": false,
  "saldo_total": null,
  "cuentas": [],
  "motivo": "el maestro de cuentas bancarias (E11) no respondio: sin el, el banco es un numero falso"
}
```

### 3. Cuenta sin `cuenta_contable` declarada → `[ABIERTO]`

Salida parcial (`abierto:['cuenta_contable']`, `saldo:null`, `completo:false`) —
**no se adivina de qué cuenta del mayor sale su dinero**.

### 4. Fire-and-forget — reacción a `contabilidad.asiento_registrado`

`onAsientoRegistrado` solo registra un `debug` (`saldo-tesoreria.asiento.observado`) y
devuelve `null`; **no muta nada**. La derivación determinista se hace siempre en
`calcular.request`.

### 5. Fallo — falta `project_id`

Respuesta `400` + `saldo-tesoreria.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/saldo-tesoreria.test.js`. Cubre:

- `calcular` con maestro y mayor disponibles → `200` con `saldo_total`, `naturaleza` y
  `completo:true`.
- Maestro (E11) sin responder → `disponible:false`, `cuentas:[]`, `saldo_total:null`
  (**no se inventa el saldo**).
- Mayor (B3) sin responder → los saldos quedan `null`, `abierto:['saldo']`, `completo:false`.
- Cuenta sin `cuenta_contable` → `saldo:null`, `abierto` contiene `'cuenta_contable'`.
- Naturaleza: saldo > 0 → `'deudor'`, < 0 → `'acreedor'`, 0 → `'cero'`.
- **Determinismo**: mismo mayor + mismo maestro → mismo saldo.
- Filtro `cuenta` → `cuentas` filtrada pero los totales sobre todas.
- `onAsientoRegistrado` no muta (devuelve `null`); sin `project_id` → `null`.
- `project_id` ausente → `400 INVALID_INPUT` + `saldo-tesoreria.calcular.failed`.
- `toolCalcular` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `SaldoTesoreria extends ModuloHibridoReflejo`; `name = 'saldo-tesoreria'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/saldo-tesoreria/`; es de la vertical **libro**).
- `onCalcularRequest` usa `this._atender(e, 'calcular', 'saldo-tesoreria.calcular.response',
  async (d) => {...})` y publica el par `failed` si `status !== 200`. `onAsientoRegistrado`
  **no** usa `_atender`.
- Proyección `_calcular(input)` (`async`: pide maestro y mayor por evento); helpers `_maestro`,
  `_mayor`, `_round`. Tool `toolCalcular`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: lee `maestro-cuentas-bancarias.listar.request` (E11) y `mayor-balanza.saldos.request`
  (B3) por EVENTO; observa `contabilidad.asiento_registrado` (B2) como señal.
- **PARÁMETRO COMO DATO**: `fecha` y `ejercicio` son declarables; la correspondencia
  cuenta bancaria ↔ cuenta contable **no se adivina**: sale del maestro declarado.
