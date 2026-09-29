---
name: maestro-cuentas-bancarias
description: >
  Skill FULL del módulo CUSTODIO `maestro-cuentas-bancarias` de la vertical contabilidad de Enki.
  Parcela DECLARABLE de las cuentas bancarias del negocio y su moneda — un negocio → N cuentas,
  con un solo escritor (declaración del dueño/asesor) y CERO cuentas inventadas; sin este
  maestro 'el banco' es un número falso. Persiste por proyecto con PosPersistencia. Úsala para
  operar, depurar o extender el custodio, o para entender su contrato de eventos y sus reglas
  de negocio.
when-to-use: >
  - Cuando necesites declarar/actualizar una cuenta bancaria (RPC
    maestro-cuentas-bancarias.declarar.request) o listar las declaradas (RPC
    maestro-cuentas-bancarias.listar.request).
  - Cuando depures por qué se rechaza una declaración (403 PERMISSION_DENIED si el rol no es
    DECLARACION_CUENTA, 400 INVALID_INPUT si falta project_id o id_cuenta) o por qué la moneda
    sale `null`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    maestro (un solo escritor, UPSERT con historial, nada cableado, moneda declarable).
  - Cuando vayas a escribir/ampliar el test unitario del custodio maestro-cuentas-bancarias.
tags: [enki, modulo, custodio, contabilidad, maestro-cuentas-bancarias]
---

# maestro-cuentas-bancarias — CUSTODIO CON PERSISTENCIA de las cuentas del negocio

## Qué hace el módulo

`maestro-cuentas-bancarias` es un **CUSTODIO CON PERSISTENCIA** (E11, hoja del plan): la
parcela **DECLARABLE** de las **CUENTAS BANCARIAS del negocio y su MONEDA**. **Un negocio →
N cuentas.** Sin este maestro, «el banco» es un **número falso**: no hay contra qué conciliar
(E1), ni de dónde derivar el saldo de tesorería (E4), ni qué cuenta es la que cobra/paga.

**EL SISTEMA NO LAS INVENTA**: las cuentas las **DECLARA el DUEÑO/ASESOR**. Este módulo
**jamás fabrica una cuenta ni asume una moneda**: la moneda de cada cuenta es un
**ParametroDeclarable** — si no viene, queda `null` = **desconocida**, no se estima.

**UN SOLO ESCRITOR**: solo el camino de declaración (rol `DECLARACION_CUENTA`) asienta
cuentas; cualquier otro rol es rechazado (**segundo escritor → 403**).

Invariantes:

- **`listar` NO muta**: lectura **determinista** del maestro en **orden estable** (orden de
  alta).
- **`declarar` es UPSERT declarativo**: una cuenta con el mismo id se **ACTUALIZA** (el
  dueño corrige) y se guarda el **historial de cambios**; **nunca se borra en silencio**.
- **Nada cableado**: ninguna lista de bancos, ningún país, ningún IBAN de ejemplo, ninguna
  moneda por defecto. Todo entra como **dato declarado**.
- **Dato ausente = desconocido**: `moneda`, `banco`, `alias` y `cuenta_contable` sin declarar
  quedan `null`; `activa` es `true` salvo declaración explícita en contrario.

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/maestro-cuentas-bancarias/maestro-cuentas-bancarias.json`), restaura en
`project.activated` y vuelca en `onUnload`. Proyecciones `_declarar` y `_listar`. Publica
`contabilidad.cuenta_bancaria_declarada`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `maestro-cuentas-bancarias.declarar.request` | `onDeclararRequest` | RPC custodio (escritura, UNICO ESCRITOR): {project_id, rol:'DECLARACION_CUENTA', cuenta:{id_cuenta\\|iban, moneda?, banco?, alias?, cuenta_contable?, activa?}} → {cuenta, actualizada, total_cuentas}. UPSERT declarativo: una cuenta con el mismo id se actualiza guardando historial (nunca se borra en silencio). Campos ausentes quedan null (desconocidos, no se estiman). Exito → publica contabilidad.cuenta_bancaria_declarada y responde por maestro-cuentas-bancarias.declarar.response; rol distinto de DECLARACION_CUENTA → 403; cuenta o id_cuenta ausente → 400; fallo → maestro-cuentas-bancarias.declarar.failed. |
| `maestro-cuentas-bancarias.listar.request` | `onListarRequest` | RPC custodio (lectura, NO muta): {project_id} → {total, ids:[id_cuenta], cuentas:[{id_cuenta, moneda, banco, alias, cuenta_contable, activa}]} en orden estable (orden de alta). Lo beben saldo-tesoreria (E4) y prevision-caja (E5) por EVENTO. Responde por maestro-cuentas-bancarias.listar.response; project_id ausente → maestro-cuentas-bancarias.listar.failed. |
| `project.activated` | `onProjectActivated` | Restaura el maestro de cuentas bancarias (cuentas + orden) del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `maestro-cuentas-bancarias.declarar.response` | Respuesta RPC correlada de maestro-cuentas-bancarias.declarar.request → {request_id, status:200, data:{cuenta, actualizada, total_cuentas}}. Emitida por el helper _atender. |
| `maestro-cuentas-bancarias.declarar.failed` | Par de fallo determinista (E11): segundo escritor (rol distinto de DECLARACION_CUENTA → 403), cuenta o id_cuenta ausente (400) → {status, error:{code, message, details?}}. Cierra el circulo de maestro-cuentas-bancarias.declarar.request. |
| `maestro-cuentas-bancarias.listar.response` | Respuesta RPC correlada de maestro-cuentas-bancarias.listar.request → {request_id, status:200, data:{total, ids, cuentas}}. Emitida por el helper _atender. |
| `maestro-cuentas-bancarias.listar.failed` | Par de fallo determinista (E11): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de maestro-cuentas-bancarias.listar.request. |
| `contabilidad.cuenta_bancaria_declarada` | Fire-and-forget (E11): una cuenta bancaria quedo declarada/actualizada en la parcela → {project_id, cuenta, id_cuenta, moneda, actualizada, correlation_id}. Lo LEEN saldo-tesoreria (E4), conciliacion-bancaria (E1) y prevision-caja (E5) para dejar de tratar 'el banco' como un numero falso. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `maestro-cuentas-bancarias.declarar.failed` cierra el círculo de
> `maestro-cuentas-bancarias.declarar.request` y `maestro-cuentas-bancarias.listar.failed`
> cierra el de `maestro-cuentas-bancarias.listar.request`, cada uno cuando su proyección
> devuelve status ≠ 200.

> Nota: el módulo expone `cuentasDe(pid)` como **lectura directa** para otras hojas del
> mismo proceso (no muta) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_declarar` exige
   `input.rol === 'DECLARACION_CUENTA'` (constante `ROL_ESCRITOR`). Cualquier otro rol →
   `403 PERMISSION_DENIED` con `{rol_esperado:'DECLARACION_CUENTA', rol_recibido:<rol>}`.
   El segundo escritor **no escribe**.
2. **Identidad de la cuenta**: `id_cuenta = c.id_cuenta` (trim) si viene; si no, se cae a
   `c.iban` (trim). Sin ninguno de los dos → `400 INVALID_INPUT`
   (`field:'cuenta.id_cuenta'`).
3. **UPSERT declarativo**: si la cuenta ya existe se **reusa el objeto** (conserva
   `creada_en` e `historial`) y `actualizada:true`; si es nueva se crea con `creada_en` y
   `historial:[]`, y `actualizada:false`.
4. **La moneda es ParametroDeclarable**: `moneda` con valor útil → `String(...).trim()
   .toUpperCase()`; ausente, vacía o solo espacios → `null` (**desconocida, no se estima**).
   **No hay moneda por defecto.**
5. **Los demás campos se guardan tal cual o `null`**: `banco`, `alias` y `cuenta_contable`
   con `String(...).trim()` si traen valor útil; si no, `null`. `activa` = `c.activa !== false`
   (default `true`, pero **declarable**).
6. **Historial de cambios (nada se borra en silencio)**: cada declaración **APPENDEA** a
   `cuenta.historial` un registro `{moneda, banco, activa, en, por:ROL_ESCRITOR}` y sella
   `actualizada_en` con `new Date().toISOString()`. La cuenta **nunca se elimina**.
7. **Orden estable por alta**: el id nuevo se empuja a `maestro.orden` solo si no estaba;
   `_listar` recorre `orden` (no el Map) para que el resultado sea **determinista**.
8. **Forma honesta de la lectura**: `_listar` devuelve
   `{id_cuenta, moneda, banco, alias, cuenta_contable, activa}` con los ausentes a `null` y
   `activa` resuelto a booleano. Campos ausentes **no se omiten**: se declaran `null`.
9. **Nada cableado**: el código **no enumera** bancos, países, IBANs ni monedas; todo entra
   como dato declarado. La lista de valores posibles no existe en el código.
10. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`) — en **ambas** proyecciones.
11. **Fire-and-forget al declarar**: `onDeclararRequest` publica
    `contabilidad.cuenta_bancaria_declarada` **solo si `_declarar` devuelve `200`**; si no,
    el par `maestro-cuentas-bancarias.declarar.failed`. El payload lleva
    `{project_id, cuenta, id_cuenta, moneda, actualizada, correlation_id}`.
12. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)` (reconstruye `cuentas` + `orden`);
    `onUnload` → `flush()` + `detener()`.
13. **HTTP exacto**: éxito `200`; rol inválido → `403`; `project_id`/`cuenta`/`id_cuenta`
    ausentes → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `maestro-cuentas-bancarias.declarar.response` y
`maestro-cuentas-bancarias.listar.response`; emite `contabilidad.cuenta_bancaria_declarada`.

### 1. `declarar` — el dueño/asesor declara una cuenta

```json
{
  "project_id": "e57a318a-...",
  "rol": "DECLARACION_CUENTA",
  "cuenta": { "id_cuenta": "ES12-0000-0000-0000", "moneda": "eur", "banco": "Banco X", "alias": "Cuenta operativa", "cuenta_contable": "572" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "cuenta": {
    "id_cuenta": "ES12-0000-0000-0000",
    "creada_en": "2026-09-25T...:00.000Z",
    "historial": [ { "moneda": "EUR", "banco": "Banco X", "activa": true, "en": "2026-09-25T...:00.000Z", "por": "DECLARACION_CUENTA" } ],
    "moneda": "EUR",
    "banco": "Banco X",
    "alias": "Cuenta operativa",
    "cuenta_contable": "572",
    "activa": true,
    "actualizada_en": "2026-09-25T...:00.000Z"
  },
  "actualizada": false,
  "total_cuentas": 1
}
```

Emite `contabilidad.cuenta_bancaria_declarada`:

```json
{ "project_id": "e57a318a-...", "cuenta": { "...": "..." }, "id_cuenta": "ES12-0000-0000-0000", "moneda": "EUR", "actualizada": false, "correlation_id": "abc-123" }
```

Re-declarar la misma cuenta → `actualizada:true`, el **historial crece** (nada se
sobrescribe en silencio) y `creada_en` **se conserva**.

### 2. `listar` — leer el maestro (no muta)

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "total": 1, "ids": ["ES12-0000-0000-0000"], "cuentas": [ { "id_cuenta": "ES12-0000-0000-0000", "moneda": "EUR", "banco": "Banco X", "alias": "Cuenta operativa", "cuenta_contable": "572", "activa": true } ] }
```

Sin cuentas declaradas → `total:0`, `ids:[]`, `cuentas:[]` — **no se inventa ninguna cuenta**.

### 3. Fallo — segundo escritor

Respuesta `403` + `maestro-cuentas-bancarias.declarar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el dueno/asesor (DECLARACION_CUENTA) declara cuentas bancarias", "details": { "rol_esperado": "DECLARACION_CUENTA", "rol_recibido": "OTRO" } } }
```

### 4. Fallo — sin identidad de cuenta

Respuesta `400 INVALID_INPUT` con `{field:'cuenta.id_cuenta'}` + el par `failed`.

## Tests

El test unitario de la vertical vive en `tests/unit/maestro-cuentas-bancarias.test.js`.
Cubre:

- `declarar` con rol `DECLARACION_CUENTA` → `200 {actualizada:false}` y emite
  `contabilidad.cuenta_bancaria_declarada`.
- `declarar` con otro rol → `403 PERMISSION_DENIED` + `.declarar.failed`.
- `declarar` sin `id_cuenta` ni `iban` → `400 INVALID_INPUT` (`field:'cuenta.id_cuenta'`).
- **UPSERT**: re-declarar la misma cuenta → `actualizada:true`, el historial crece y
  `creada_en` se conserva (nada se borra).
- **Moneda declarable**: `moneda` ausente → queda `null` (desconocida, no se estima);
  declarada en minúsculas → se normaliza a MAYÚSCULAS.
- `listar` en orden estable por alta; sin cuentas → `total:0`, `cuentas:[]`.
- `listar` sin `project_id` → `400 INVALID_INPUT` + `.listar.failed`.
- `project.activated` restaura el maestro; `cuentasDe(pid)` lee sin mutar.
- `toolDeclarar` / `toolListar` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `MaestroCuentasBancarias extends ModuloHibridoReflejo`; `name =
  'maestro-cuentas-bancarias'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._maestros` (`Map<project_id, {esquema, cuentas: Map<id_cuenta, Cuenta>, orden:[]}>`).
  Constante `ROL_ESCRITOR = 'DECLARACION_CUENTA'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'maestro-cuentas-bancarias.json', dir: '/contabilidad/maestro-cuentas-bancarias',
  snapshot, hidratar })` desde `modules/contabilidad-libro/maestro-cuentas-bancarias/`
  (DOS niveles → `../../_shared/pos-persistencia`). `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`; `marcarDirty(pid)` en cada
  escritura.
- `onDeclararRequest` → `_atender(e, 'declarar', '...declarar.response', ...)` con cierre de
  círculo (evento de dominio en `200`, par `failed` si no); `onListarRequest` →
  `_atender(e, 'listar', '...listar.response', ...)` con par `failed` si `status !== 200`.
- Proyecciones `_declarar` (escritura + guard, **síncrona**) y `_listar` (lectura, no muta);
  helper `_obtenerOCrear`; lectura directa `cuentasDe(pid)`. Tools `toolDeclarar` /
  `toolListar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo LEEN `saldo-tesoreria` (E4) por `maestro-cuentas-bancarias.listar.request` y
  `conciliacion-bancaria` (E1)/`prevision-caja` (E5) vía
  `contabilidad.cuenta_bancaria_declarada`.
- **PARÁMETRO COMO DATO**: cuentas, moneda, banco, alias y cuenta contable son **declarables**;
  el código **no asume ninguna moneda** ni enumera bancos.
