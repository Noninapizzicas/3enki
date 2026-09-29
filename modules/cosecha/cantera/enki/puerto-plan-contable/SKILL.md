---
name: puerto-plan-contable
description: >
  Skill FULL del módulo CONVERSOR `puerto-plan-contable` de la vertical contabilidad
  de Enki. Frontera de CODIFICACION del plan contable: import (externo → Set<Cuenta>)
  y export (plan → externo) con `formato` y `mapeo` declarables; sin formato
  declarado no convierte y lo ausente queda null y se lista en `abiertos`. Úsala
  para operar, depurar o extender el conversor, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites importar un plan externo a Set<Cuenta> o exportar el plan a un
    formato externo (RPC puerto-plan-contable.entrar.request / .salir.request).
  - Cuando depures por qué la conversion falla (400 FORMATO_NO_DECLARADO, 422
    FORMATO_NO_DECLARABLE, 400 INVALID_INPUT si falta el externo/plan).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la codificacion declarable (formato como DATO, sin codigo no hay cuenta).
  - Cuando vayas a escribir/ampliar el test unitario del conversor puerto-plan-contable.
tags: [enki, modulo, conversor, contabilidad, puerto-plan-contable]
---

# puerto-plan-contable — CONVERSOR STATELESS de la contabilidad

## Qué hace el módulo

`puerto-plan-contable` es un **CONVERSOR STATELESS** (B6, hoja del plan): la frontera
de **CODIFICACION** del plan contable. Ofrece **import** (externo → `Set<Cuenta>`) y
**export** (plan → externo). El `formato` y el `mapeo` son **DECLARABLES** — entran
como **DATO**; no hay ninguna codificacion (PGC, CSV, XLSX, codigo de asesor) cableada.

Sin `mapeo` declarado solo se acepta el formato canonico declarado (`'canonico'` /
`'enki'`); cualquier otro formato exige mapeo declarado o devuelve
`FORMATO_NO_DECLARABLE`. Campos de `Cuenta`: `codigo, nombre, tipo, naturaleza, padre`;
el campo externo ausente queda `null` y se lista en `abiertos` (nada se estima; sin
codigo no hay cuenta).

No custodia el plan: el almacen es `catalogo-cuentas` (B1). Cierra el circulo con
`puerto-plan-contable.entrar.failed` (import) y `puerto-plan-contable.salir.failed`
(export). Sin PosPersistencia y sin `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `puerto-plan-contable.entrar.request` | `onEntrarRequest` | RPC conversor (import): {project_id, formato, externo, mapeo?} → {formato, total, abiertos, cuentas}. Convierte el plan externo a Set<Cuenta> usando el mapeo declarado; las filas sin codigo se apartan y los campos ausentes se declaran en `abiertos`. Sin `formato` → FORMATO_NO_DECLARADO; formato no declarable sin mapeo → FORMATO_NO_DECLARABLE (publica puerto-plan-contable.entrar.failed). Responde por puerto-plan-contable.entrar.response. |
| `puerto-plan-contable.salir.request` | `onSalirRequest` | RPC conversor (export): {project_id, formato, plan, mapeo?} → {formato, total, externo}. Codifica el plan (Set<Cuenta>) al formato externo declarado; los campos ausentes salen null (no se estiman). Sin `formato` → FORMATO_NO_DECLARADO; formato no declarable sin mapeo → FORMATO_NO_DECLARABLE (publica puerto-plan-contable.salir.failed). Responde por puerto-plan-contable.salir.response. |

### Publishes

| Evento | Descripción |
|---|---|
| `puerto-plan-contable.entrar.response` | Respuesta RPC correlada de puerto-plan-contable.entrar.request → {request_id, status:200, data:{formato, total, abiertos, cuentas}}. Emitida por el helper _atender. |
| `puerto-plan-contable.entrar.failed` | Par de fallo determinista (B6): formato no declarado/no declarable o externo ausente → {status, error:{code, message, details?}}. Cierra el circulo de puerto-plan-contable.entrar.request. |
| `puerto-plan-contable.salir.response` | Respuesta RPC correlada de puerto-plan-contable.salir.request → {request_id, status:200, data:{formato, total, externo}}. Emitida por el helper _atender. |
| `puerto-plan-contable.salir.failed` | Par de fallo determinista (B6): formato no declarado/no declarable o plan ausente → {status, error:{code, message, details?}}. Cierra el circulo de puerto-plan-contable.salir.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `puerto-plan-contable.entrar.failed` cierra `entrar.request` y
> `puerto-plan-contable.salir.failed` cierra `salir.request`, cada uno cuando su
> proyeccion devuelve status ≠ 200.

> Nota: a diferencia de los puertos de entrada, este conversor **no publica
> fire-and-forget de dominio**: no emite `contabilidad.*`; solo la response y el par
> de fallo. El plan se custodia en `catalogo-cuentas` (B1).

## Reglas de negocio

1. **La ley/codificacion entran como DATO**: sin `formato` declarado NO se convierte.
   → `400 FORMATO_NO_DECLARADO`. Constante `CAMPOS_CUENTA =
   ['codigo','nombre','tipo','naturaleza','padre']`.
2. **Formato no declarable sin mapeo**: `_mapeoDe` devuelve el `mapeo` declarado si lo
   hay; si no, solo construye la identidad (campo → el propio nombre) cuando
   `formato === 'canonico' || formato === 'enki'`; en cualquier otro caso devuelve `null`
   → `422 FORMATO_NO_DECLARABLE` con `details:{formato}`.
3. **Import — filas y apartados**: acepta `externo` como array o como `{cuentas:[...]}`.
   Cada fila se mapea a `Cuenta`. **Sin `codigo` no hay cuenta**: la fila se aparta en
   `abiertos` con `{fila, faltantes}` y no se inventa una cuenta.
4. **Dato ausente = desconocido (cero estimacion)**: un campo externo ausente queda
   `null`; si es `codigo` o `nombre`, ademas se registra en `faltantes`. Cuentas con
   codigo pero sin nombre se añaden y se listan en `abiertos` con `{codigo, faltantes}`.
5. **Export — codificacion inversa**: cada Cuenta del plan se escribe en la clave externa
   declarada por el `mapeo`; un campo ausente sale `null` (no se estima). Acepta `plan`
   como array o como `{cuentas:[...]}`.
6. **`adaptador_declarado`**: refleja si vino `mapeo` (Boolean del input original).
7. **No custodia el plan**: el almacen es `catalogo-cuentas` (B1). Aqui solo se cruza formato.
8. **HTTP exacto**: éxito `200`; formato no declarado → `400`; formato no declarable →
   `422`; externo/plan invalidos → `400 INVALID_INPUT`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `puerto-plan-contable.entrar.response` y `puerto-plan-contable.salir.response`.

### 1. `entrar` (import) — externo a Set<Cuenta>

```json
{
  "project_id": "e57a318a-...",
  "formato": "plan_asesor_csv",
  "externo": { "cuentas": [ { "cta": "430", "desc": "Clientes", "nat": "deudora" } ] },
  "mapeo": { "codigo": "cta", "nombre": "desc", "naturaleza": "nat" }
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "formato": "plan_asesor_csv",
  "adaptador_declarado": true,
  "total": 1,
  "abiertos": [],
  "cuentas": [ { "codigo": "430", "nombre": "Clientes", "tipo": null, "naturaleza": "deudora", "padre": null } ]
}
```

### 2. `entrar` (import) — formato canonico sin mapeo

```json
{ "formato": "canonico", "externo": [ { "codigo": "430", "nombre": "Clientes" } ] }
```
Respuesta `200` con `adaptador_declarado:false` y la identidad por nombre canonico.

### 3. `entrar` (import) — fila sin codigo se aparta

```json
{ "formato": "canonico", "externo": [ { "nombre": "Sin codigo" } ] }
```
Respuesta `200`: `total:0`, `cuentas:[]`, `abiertos:[{ "fila": { "nombre": "Sin codigo" }, "faltantes": ["codigo","nombre"] }]`.

### 4. `salir` (export) — plan a externo

```json
{ "formato": "canonico", "plan": [ { "codigo": "430", "nombre": "Clientes", "tipo": null, "naturaleza": "deudora", "padre": null } ] }
```
Respuesta `200`:
```json
{ "project_id": null, "formato": "canonico", "adaptador_declarado": false, "total": 1, "externo": [ { "codigo": "430", "nombre": "Clientes", "tipo": null, "naturaleza": "deudora", "padre": null } ] }
```

### 5. Fallo — sin formato

```json
{ "externo": [ { "codigo": "430" } ] }
```
Respuesta `400` + `puerto-plan-contable.entrar.failed`:
```json
{ "status": 400, "error": { "code": "FORMATO_NO_DECLARADO", "message": "hay que declarar el formato externo del plan contable", "details": {} } }
```

### 6. Fallo — formato no declarable sin mapeo

```json
{ "formato": "pgc_csv", "externo": [ { "codigo": "430" } ] }
```
Respuesta `422` + `puerto-plan-contable.entrar.failed`:
```json
{ "status": 422, "error": { "code": "FORMATO_NO_DECLARABLE", "message": "formato no declarable: declara `mapeo` (campo canonico → clave externa)", "details": { "formato": "pgc_csv" } } }
```

## Tests

El test vive en `tests/unit/puerto-plan-contable.test.js`. Cubre:

- `entrar` con formato canonico sin mapeo → `200`, identidad por nombre, `adaptador_declarado:false`.
- `entrar` con mapeo declarado → `200`, campos mapeados, `adaptador_declarado:true`.
- `entrar` sin `formato` → `400 FORMATO_NO_DECLARADO` + `puerto-plan-contable.entrar.failed`.
- `entrar` con formato no declarable sin mapeo → `422 FORMATO_NO_DECLARABLE`.
- fila sin `codigo` → se aparta en `abiertos` (no se inventa cuenta); total no la cuenta.
- `salir` con formato canonico → `200 {formato, total, externo}` con campos ausentes `null`.
- `salir` sin `formato` → `400 FORMATO_NO_DECLARADO` + `puerto-plan-contable.salir.failed`.
- `toolEntrar` / `toolSalir` devuelven las mismas proyecciones.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PuertoPlanContable extends ModuloHibridoReflejo`; `name = 'puerto-plan-contable'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin
  `onProjectActivated` (CONVERSOR stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/puerto-plan-contable/`).
- `onEntrarRequest` usa `this._atender(e, 'entrar',
  'puerto-plan-contable.entrar.response', async (d) => {...})`; `onSalirRequest` usa
  `this._atender(e, 'salir', 'puerto-plan-contable.salir.response', ...)`. En ambos, si
  `res.status !== 200` publican el par de fallo correspondiente.
- Proyecciones `_entrar(input)` (import) y `_salir(input)` (export); helper
  `_mapeoDe(input, formato)`. Tools `toolEntrar` / `toolSalir`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: alimenta el plan de `catalogo-cuentas` (B1), que es el custodio/almacen real
  del plan contable.
