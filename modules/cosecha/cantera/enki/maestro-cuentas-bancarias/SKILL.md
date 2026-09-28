---
name: maestro-cuentas-bancarias
description: >
  Skill FULL del módulo CUSTODIO `maestro-cuentas-bancarias` de la vertical
  contabilidad de Enki (E11, hoja del plan). Catálogo DECLARABLE de cuentas bancarias
  y su MONEDA. Sin él, "el banco" es un solo número falso: cada movimiento del extracto
  (E2) apunta a UNA cuenta declarada y con su moneda. Multi-moneda es parámetro
  DECLARABLE: si el dueño no la declara → una sola moneda base (la primera declarada);
  si la declara → tipo_cambio_requerido:true y la aritmética entre monedas exige tipo
  de cambio declarado (E14). La moneda de la cuenta NO se asume: sin ella la cuenta no
  entra (422 PRECONDITION_FAILED). Un solo escritor del catálogo: el DUENO declara
  (second-writer rechazado con PERMISSION_DENIED). Persiste por proyecto vía
  PosPersistencia. Úsala para operar, depurar o extender el custodio.
when-to-use: >
  - Cuando necesites declarar una cuenta bancaria con su moneda (RPC
    contabilidad.cuenta_bancaria.declarar.request) o listar el catálogo
    (contabilidad.cuenta_bancaria.listar.request).
  - Cuando depures por qué declarar se rechaza (403 PERMISSION_DENIED si el rol no es
    DUENO, 422 PRECONDITION_FAILED si no se declara la moneda, 400 INVALID_INPUT si
    falta cuenta/id) o por qué listar falla (400 si falta project_id).
  - Cuando quieras entender el contrato de eventos, el multi-moneda declarable y por
    qué la moneda no se asume.
  - Cuando vayas a escribir/ampliar el test unitario del custodio maestro-cuentas-bancarias.
tags: [enki, modulo, custodio, persistencia, contabilidad, maestro-cuentas-bancarias, banco, moneda]
---

# maestro-cuentas-bancarias — CUSTODIO del catálogo de cuentas bancarias

## Qué hace el módulo

`maestro-cuentas-bancarias` es un **CUSTODIO CON PERSISTENCIA** (E11, hoja del plan): el
dueño del **catálogo DECLARABLE de cuentas bancarias y su MONEDA**, por proyecto. Sin
él, **"el banco" sería un solo número falso**: cada movimiento del extracto (E2) debe
apuntar a **UNA cuenta declarada** y con **su moneda**.

El **multi-moneda es un parámetro DECLARABLE**: si el dueño no lo declara → **una sola
moneda base** (la primera declarada); si declara cuentas en otra moneda →
`multi_moneda:true` y `tipo_cambio_requerido:true`, porque la aritmética entre monedas
exige **tipo de cambio declarado** (E14).

La regla dura: **la moneda de la cuenta NO se asume** — si no se declara, la cuenta
**no entra** (`422 PRECONDITION_FAILED`).

Hay **un solo escritor del catálogo**: **el DUENO** declara (guard en `_declarar`;
second-writer rechazado con `PERMISSION_DENIED`). `_cuentas` es una **proyección PURA
de lectura** (no muta). Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/maestro-cuentas-bancarias/*.json`), restaura en `project.activated` y
vuelca en `onUnload`.

> **NO REUTILIZA**: no existe maestro de cuentas bancarias; ningún módulo del
> inventario toca banca.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.cuenta_bancaria.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'DUENO', cuenta:{id_cuenta_bancaria\|iban, alias, banco}, moneda} → {project_id, cuenta, moneda_base, multi_moneda, tipo_cambio_requerido}. Guard de escritor: solo el DUENO (second-writer rechazado). La moneda se DECLARA (no se asume EUR); si falta → 422 PRECONDITION_FAILED. Si la moneda difiere de la base → multi_moneda:true (E14). Publica contabilidad.cuenta_bancaria_declarada y responde por contabilidad.cuenta_bancaria.declarar.response; si el rol o el payload son invalidos → contabilidad.cuenta_bancaria.declarar.failed. |
| `contabilidad.cuenta_bancaria.listar.request` | `onListarRequest` | RPC custodio: {project_id, moneda?} → {project_id, cuentas:[CuentaBancaria], n, moneda_base, multi_moneda}. Proyeccion PURA de lectura (no muta). Si falta project_id → contabilidad.cuenta_bancaria.listar.failed. Lo consume puerto-extracto (E2) para dar cuenta a los movimientos y saldo-tesoreria (E4/conciliacion E1). |
| `project.activated` | `onProjectActivated` | Restaura el catalogo de cuentas bancarias del proyecto activado desde el storage (PosPersistencia): el catalogo es POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.cuenta_bancaria_declarada` | Fire-and-forget (E11): una cuenta bancaria quedo declarada con su moneda → {project_id, cuenta, moneda_base, multi_moneda}. Lo consumen puerto-extracto (E2), conciliacion-bancaria (E1) y saldo-tesoreria (E4) para resolver 'que banco'. |
| `contabilidad.cuenta_bancaria.declarar.failed` | Par de fallo determinista: declarar rechazado (rol != DUENO), payload invalido o moneda no declarada (422). Cierra el circulo de contabilidad.cuenta_bancaria.declarar.request. |
| `contabilidad.cuenta_bancaria.listar.failed` | Par de fallo determinista: listar con payload invalido (sin project_id). Cierra el circulo de contabilidad.cuenta_bancaria.listar.request. |
| `contabilidad.cuenta_bancaria_declarada.failed` | Par de fallo del evento de dominio contabilidad.cuenta_bancaria_declarada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.cuenta_bancaria.declarar.failed` cierra
> `contabilidad.cuenta_bancaria.declarar.request`; `contabilidad.cuenta_bancaria.listar.failed`
> cierra `contabilidad.cuenta_bancaria.listar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.cuenta_bancaria.declarar.response` y
> `contabilidad.cuenta_bancaria.listar.response` (los pares response de los RPC); no
> están declaradas en `publishes`.

## Reglas de negocio

1. **Un solo escritor del catálogo (guard de rol)**: `_declarar` exige `rol === 'DUENO'`
   (constante `ROL_ESCRITOR`). Cualquier otro → **`403 PERMISSION_DENIED`** con
   `{ message:'solo el DUENO declara cuentas bancarias', details:{ rol_esperado:'DUENO',
   rol_recibido:<rol> } }`. Second-writer rechazado.
2. **La moneda se DECLARA, no se asume**: la moneda viene de `input.moneda` o
   `cuenta.moneda` (en mayúsculas). Si no hay → **`422 PRECONDITION_FAILED`** con
   `{ cuenta:<idCuenta>, nota:'multi-moneda es parametro declarable' }`. **Sin moneda la
   cuenta no entra** (no se asume EUR).
3. **Multi-moneda declarable**: la **primera** moneda declarada se fija como
   `moneda_base`; si una cuenta posterior declara **otra** moneda → `multi_moneda:true`
   y `tipo_cambio_requerido:true` (la aritmética entre monedas exigirá tipo de cambio
   declarado, E14).
4. **Identificador de cuenta flexible**: `idCuenta = cuenta.id_cuenta_bancaria ||
   cuenta.id || cuenta.iban`; si falta → `400 INVALID_INPUT cuenta.id_cuenta_bancaria`.
   La cuenta asentada guarda `iban`, `alias`, `banco`, `moneda`, `activa`
   (`cuenta.activa !== false`), `declarado_por`, `declarado_en`.
5. **Listar es proyección PURA (no muta)**: `_cuentas` devuelve
   `{ project_id, cuentas, n, moneda_base, multi_moneda }`; si se aporta `moneda`, filtra
   por ella (en mayúsculas).
6. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   `cuenta` ausente/no objeto → `400 INVALID_INPUT cuenta`; sin id de cuenta →
   `400 INVALID_INPUT cuenta.id_cuenta_bancaria`. Shape: `{ status:400, error:{
   code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
7. **El catálogo es por proyecto**: las cuentas viven en `store[pid].cuentas[<id>]`, con
   `moneda_base` y `multi_moneda` propios del proyecto.
8. **La ley entra como DATO**: las cuentas, sus alias y sobre todo **su moneda** son
   declarables; **el sistema no asume** ni la moneda ni el tipo de cambio.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol no DUENO → `403`; moneda
   no declarada → `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.cuenta_bancaria.declarar.response` y
`contabilidad.cuenta_bancaria.listar.response`.

### 1. `declarar` — declarar una cuenta con su moneda (solo DUENO)

```json
{
  "project_id": "e57a318a-...",
  "rol": "DUENO",
  "cuenta": { "id_cuenta_bancaria": "ES91...", "alias": "Cuenta principal", "banco": "BBVA" },
  "moneda": "EUR",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "cuenta": { "id_cuenta_bancaria": "ES91...", "iban": null, "alias": "Cuenta principal", "banco": "BBVA", "moneda": "EUR", "activa": true, "declarado_por": "DUENO", "declarado_en": "2026-09-28T..." },
  "moneda_base": "EUR",
  "multi_moneda": false,
  "tipo_cambio_requerido": false
}
```
Emite `contabilidad.cuenta_bancaria_declarada` (res.data + `correlation_id`).

### 2. `declarar` — cuenta en otra moneda (activa multi-moneda)

Declarar una cuenta con `"moneda": "USD"` tras una base `EUR` → `multi_moneda:true` y
`tipo_cambio_requerido:true`.

### 3. `listar` — listar el catálogo (proyección pura)

```json
{ "project_id": "e57a318a-...", "moneda": "EUR" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "cuentas": [ { "id_cuenta_bancaria": "ES91...", "moneda": "EUR", "...": "..." } ], "n": 1, "moneda_base": "EUR", "multi_moneda": false }
```

### Fallo — moneda no declarada (422)

```json
{ "project_id": "e57a318a-...", "rol": "DUENO", "cuenta": { "iban": "ES91..." } }
```
Respuesta `422` + `contabilidad.cuenta_bancaria.declarar.failed`:
```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "la moneda de la cuenta no esta declarada", "details": { "cuenta": "ES91...", "nota": "multi-moneda es parametro declarable" } } }
```

### Fallo — rol inválido

`rol` distinto de `DUENO` → `403 PERMISSION_DENIED` con
`{ message:'solo el DUENO declara cuentas bancarias', details:{ rol_esperado:'DUENO',
rol_recibido:<rol> } }`.

### Tools (sin RPC en module.json)

`toolDeclarar` → `_declarar`; `toolCuentas` → `_cuentas`.

## Tests

El test vive en `tests/unit/maestro-cuentas-bancarias.test.js`. Cubre:

- `declarar` con rol `DUENO` y moneda → `200`, emite
  `contabilidad.cuenta_bancaria_declarada`, fija `moneda_base`.
- **Multi-moneda declarable**: segunda cuenta con otra moneda → `multi_moneda:true`,
  `tipo_cambio_requerido:true`.
- **La moneda no se asume**: declarar sin `moneda` → `422 PRECONDITION_FAILED`.
- `declarar` con rol distinto → `403 PERMISSION_DENIED`.
- Payloads inválidos (sin `project_id`/`cuenta`/id) → `400 INVALID_INPUT`.
- `listar` → `200 {cuentas, n, moneda_base, multi_moneda}`; filtra por `moneda`.
- `project.activated` restaura el catálogo vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/maestro-cuentas-bancarias
node --test tests/unit/maestro-cuentas-bancarias.test.js
```

## Notas de implementación

- Clase `MaestroCuentasBancarias extends ModuloHibridoReflejo`; `name =
  'maestro-cuentas-bancarias'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._store` (Map project_id → `{ esquema:'contabilidad-maestro-cuentas-bancarias-v1',
  cuentas:{}, moneda_base:null, multi_moneda:false }`).
- Constante `ROL_ESCRITOR = 'DUENO'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'maestro-cuentas-bancarias.json', dir: '/contabilidad/maestro-cuentas-bancarias',
  snapshot, hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` →
  `flush()` + `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onDeclararRequest` delega en `_atender(e, 'declarar',
  'contabilidad.cuenta_bancaria.declarar.response', fn)`; `onListarRequest` en
  `_atender(e, 'listar', 'contabilidad.cuenta_bancaria.listar.response', fn)`.
- Proyecciones puras: `_declarar` (escritura + guard + multi-moneda), `_cuentas`
  (lectura). Helper `_obtenerOCrear(pid)`. `_invalid`/`_errorResponse` de la base.
- Tools: `toolDeclarar`, `toolCuentas`.
- DEP hacia delante: lo consumen `puerto-extracto` (E2), `conciliacion-bancaria` (E1) y
  `saldo-tesoreria` (E4) para resolver "qué banco".
