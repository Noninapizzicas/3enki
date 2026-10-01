---
name: maestro-cuentas-bancarias
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `maestro-cuentas-bancarias` de la vertical
  contabilidad (Enki). Parcela DECLARABLE de cuentas bancarias y su MONEDA. UN escritor. Sin este
  maestro, "el banco" es un número falso: la cuenta y su moneda se DECLARAN, no se adivinan. La
  identidad es su identificador (cuenta_id/iban) declarado; la moneda ausente = desconocida (no se
  asume EUR). `declarar` (ORDEN) ESCRIBE → anuncia contabilidad.cuenta_bancaria_declarada;
  `listar` (PREGUNTA) no anuncia. No se pisa en silencio. Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando necesites declarar una cuenta bancaria y su moneda, o listar las declaradas
    (RPC maestro-cuentas-bancarias.declarar.request / .listar.request).
  - Cuando depures por qué `abierto.moneda` aparece (cuenta sin moneda declarada), o por qué se
    rechaza (400 INVALID_INPUT por falta de cuenta_id).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.cuenta_bancaria_declarada.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, libro, banco, tesoreria, moneda]
---

# maestro-cuentas-bancarias — CUSTODIO del maestro de cuentas bancarias

## Qué hace el módulo

`maestro-cuentas-bancarias` es un **CUSTODIO CON PERSISTENCIA** (E11, hoja del plan). Es la
parcela **DECLARABLE** de cuentas bancarias y su **MONEDA**. **UN escritor.** Sin este maestro,
"el banco" es un número falso: la cuenta y su moneda se **DECLARAN**, no se adivinan.

Invariantes:
- La identidad de la cuenta es su **identificador** (`iban`/`cuenta_id`) declarado: sin él **NO**
  se declara.
- La **MONEDA** es declarable; ausente = desconocida (se declara en `abierto`), **no se asume EUR**.
- `declarar` es ESCRITURA → **anuncia el HECHO**; `listar` es PREGUNTA → no anuncia.
- No se pisa en silencio: re-declarar una cuenta **APPENDEA** al historial.

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/maestro-cuentas-bancarias`,
archivo `maestro-cuentas-bancarias.json`), restaura en `project.activated` y vuelca en `onUnload`.

**Dos caras:** `declarar` es **ORDEN** (`system_panel`); `listar` es **PREGUNTA** (bus).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `maestro-cuentas-bancarias.declarar.request` | `onDeclararRequest` | RPC custodio (**ORDEN**, panel): `{project_id, cuenta_id\|iban, alias?, banco?, moneda?}` → `{project_id, cuenta, declarada, total}`. Declara (UN escritor) una cuenta bancaria y su moneda; sin `cuenta_id` → `INVALID_INPUT`. PUBLICA `contabilidad.cuenta_bancaria_declarada`. Responde por `.declarar.response`. |
| `maestro-cuentas-bancarias.listar.request` | `onListarRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, moneda?, banco?}` → `{project_id, cuentas, total, total_maestro}`. Lista las cuentas declaradas; no muta. Responde por `.listar.response`. |
| `project.activated` | `onProjectActivated` | Restaura el maestro del proyecto activado desde el storage. |

> Nota de deriva (R3): el plan declara subir `cola-declaraciones-criterio.fijar.request`, pero el
> `module.json` real **no** lo declara.

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.cuenta_bancaria_declarada` | Fire-and-forget (E11): quedó declarada una cuenta bancaria y su moneda → `{project_id, cuenta_id, cuenta, moneda, declarada:true}`. Lo consume `saldo-tesoreria` (para saber qué cuentas existen y en qué moneda). |
| `maestro-cuentas-bancarias.declarar.response` | Respuesta RPC correlada de la op `declarar`. |
| `maestro-cuentas-bancarias.declarar.failed` | Fallo determinista: falta `project_id` o `cuenta_id`. |
| `maestro-cuentas-bancarias.listar.response` | Respuesta RPC correlada de la op `listar`. |
| `maestro-cuentas-bancarias.listar.failed` | Fallo determinista: falta `project_id`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `declarar` | **ORDEN** (panel) | `{project_id, cuenta_id\|iban, alias?, banco?, moneda?}` | `{project_id, cuenta, declarada:true, total, abierto}` | 400 `INVALID_INPUT` (`project_id`/`cuenta_id`) |
| `listar` | **PREGUNTA** (bus) | `{project_id, moneda?, banco?}` | `{project_id, cuentas, total, total_maestro, abierto}` | 400 `INVALID_INPUT` (`project_id`) |

## Reglas de negocio (lo que el código IMPONE)

1. **`_declarar`**: sin `project_id` → `_invalid('project_id')`; sin `cuenta_id` (ni `iban`) →
   `_invalid('cuenta_id')`.
2. **Cuenta**: `{cuenta_id, alias, banco, moneda, declarado_en, historial}`. Solo se actualiza el
   campo que viene declarado. `moneda` se guarda en MAYÚSCULAS.
3. **`abierto.moneda`** declarado si la cuenta no tiene moneda (`'se anota el hueco, no se asume EUR'`).
4. **No se pisa en silencio**: cada declaración hace `push` a `historial` con `{alias, banco,
   moneda, en}`; `declarado_en` se refresca.
5. **`_listar`** (no muta): filtra por `moneda` (mayúsculas) y `banco`. Devuelve `cuentas, total,
   total_maestro`.
6. **`abierto.maestro`** declarado si no hay cuentas (`'no hay cuentas bancarias declaradas todavía'`).
   Lectura directa `cuentaDe(pid, cuenta_id)`.

## Cómo se usa (RPCs)

### 1. Declarar una cuenta

```json
{ "project_id": "e57a318a-...", "cuenta_id": "ES91...", "alias": "Cuenta operativa", "banco": "BBVA", "moneda": "eur", "correlation_id": "abc-12" }
```
Respuesta `200` + `contabilidad.cuenta_bancaria_declarada`:
```json
{ "project_id": "e57a318a-...", "cuenta": { "cuenta_id": "ES91...", "alias": "Cuenta operativa", "banco": "BBVA", "moneda": "EUR", "declarado_en": "2026-10-01T...", "historial": [ { "alias": "Cuenta operativa", "banco": "BBVA", "moneda": "EUR", "en": "2026-10-01T..." } ] }, "declarada": true, "total": 1, "abierto": { "moneda": null } }
```

### 2. Listar por moneda

```json
{ "project_id": "e57a318a-...", "moneda": "EUR" }
```
Respuesta `200`: `{cuentas:[...], total:1, total_maestro:1}`.

### Fallo — sin cuenta_id

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `maestro-cuentas-bancarias.declarar.failed` (`INVALID_INPUT`, field `cuenta_id`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`/`cuenta_id`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; el plan dice `cola-declaraciones-criterio`, no cableado en el código).
- **Quién la consume:** `saldo-tesoreria` (E10) lee `contabilidad.cuenta_bancaria_declarada`.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-libro/maestro-cuentas-bancarias/module.json` + `index.js`.
2. Smoke: `declarar` → 200 + `contabilidad.cuenta_bancaria_declarada`, moneda en mayúsculas.
3. Sin moneda → `abierto.moneda` declarado (no se asume EUR).
4. `listar` filtra por moneda/banco.
5. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `MaestroCuentasBancarias extends ModuloHibridoReflejo`; `name =
  'maestro-cuentas-bancarias'`, `version = 'reflejo-0.1.0'`. Store `this._maestros` (Map `pid →
  {esquema, cuentas: Map<cuenta_id, Cuenta>}`).
- **PosPersistencia**: `file:'maestro-cuentas-bancarias.json'`,
  `dir:'/contabilidad/maestro-cuentas-bancarias'`.
- Proyecciones `_declarar`/`_listar`; lectura `cuentaDe(pid, cuenta_id)`; tools
  `toolDeclarar`/`toolListar`.
