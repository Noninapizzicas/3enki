---
name: maestro-terceros
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `maestro-terceros` de la vertical contabilidad
  (Enki). La FICHA ÚNICA de cliente/proveedor: UN solo maestro con roles (conflicto 1 resuelto) —
  el mismo tercero es cliente Y proveedor sin duplicarse. La identidad por número fiscal vive en
  `padron-terceros` (N2), cuyo hecho `contabilidad.tercero_unificado` ESCUCHA esta ficha para
  completarse. `upsert` (ORDEN) da de alta/actualiza con guard de escritor (rol MAESTRO_TERCEROS;
  segundo escritor → 403); `ficha` (PREGUNTA) la lee por NIF. No se borra: upsert SUMA. Publica
  contabilidad.tercero_actualizado. Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando necesites dar de alta/actualizar la ficha de un tercero o leerla por NIF
    (RPC maestro-terceros.upsert.request / .ficha.request).
  - Cuando depures por qué se rechaza (403 si el rol no es MAESTRO_TERCEROS), por qué se completa
    la ficha al recibir contabilidad.tercero_unificado, o por qué `ficha:null` (no existe).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.tercero_actualizado.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, entrada, terceros, maestro, cliente-proveedor]
---

# maestro-terceros — CUSTODIO de la ficha única de terceros

## Qué hace el módulo

`maestro-terceros` es un **CUSTODIO CON PERSISTENCIA** (N1, hoja del plan). Es la **FICHA ÚNICA**
de cliente/proveedor. **UN SOLO maestro con roles** (conflicto 1 resuelto): el mismo tercero es
cliente Y proveedor sin duplicarse — su ficha guarda los roles declarados. Es la cara de MAESTRO
del tercero; la faceta de IDENTIDAD (número fiscal) vive en `padron-terceros` (N2), cuyo hecho
`contabilidad.tercero_unificado` esta ficha **ESCUCHA** (`onTerceroUnificado`, no-RPC) para
completarse.

Invariantes:
- **UN escritor por parcela** (guard rol `MAESTRO_TERCEROS`; segundo escritor → 403).
- **No se borra: upsert SUMA** (los roles se funden; las variantes de nombre se apilan; los campos
  solo se completan, nunca se sobrescriben).
- **Dato ausente = desconocido**: un campo que no llega queda `null`, no se estima.

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/maestro-terceros`, archivo
`maestro-terceros.json`), restaura en `project.activated` y vuelca en `onUnload`.

**Dos caras:** `upsert` es **ORDEN** (`workspace_module`, `barra_modulos`); `ficha` es **PREGUNTA**
(bus).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `maestro-terceros.ficha.request` | `onFichaRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, nif\|numero_fiscal}` → `{project_id, nif, ficha, existe}`. Lee la ficha por su NIF normalizado; si no existe, `ficha:null, existe:false` (no se inventa). Responde por `.ficha.response`. |
| `maestro-terceros.upsert.request` | `onUpsertRequest` | RPC custodio (**ORDEN**, panel): `{project_id, rol:'MAESTRO_TERCEROS', tercero{nombre?, nif\|numero_fiscal, roles?, condiciones?}}` → `{project_id, tercero, creada}`. Guard de escritor. Da de alta o actualiza (SUMA). Publica `contabilidad.tercero_actualizado`. Responde por `.upsert.response`. |
| `contabilidad.tercero_unificado` | `onTerceroUnificado` | **Fire-and-forget** (lo emite `padron-terceros` N2): una identidad de tercero quedó unificada por su número fiscal → completa la ficha del maestro sin borrar lo que hubiera y publica `contabilidad.tercero_actualizado` (R2). **No responde (no es RPC).** |
| `project.activated` | `onProjectActivated` | Restaura el maestro del proyecto activado desde el storage. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.tercero_actualizado` | Fire-and-forget (N1): un tercero quedó actualizado en el maestro → `{project_id, nif, tercero, creada}`. Lo consumen `contrapartida-asistida` (A6.2) y `cuenta-proveedor` (N3). **Se publica tanto desde `upsert` como desde `onTerceroUnificado`.** |
| `maestro-terceros.ficha.response` | Respuesta RPC correlada de la op `ficha`. |
| `maestro-terceros.ficha.failed` | Fallo determinista: falta `project_id` o `nif`. |
| `maestro-terceros.upsert.response` | Respuesta RPC correlada de la op `upsert`. |
| `maestro-terceros.upsert.failed` | Fallo determinista: rol ≠ MAESTRO_TERCEROS, falta NIF o tercero inválido. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `ficha` | **PREGUNTA** (bus) | `{project_id, nif\|numero_fiscal}` | `{project_id, nif, ficha, existe}` | 400 `INVALID_INPUT` (`project_id`/`nif`) |
| `upsert` | **ORDEN** (panel) | `{project_id, rol:'MAESTRO_TERCEROS', tercero\|ficha\|t}` | `{project_id, tercero, creada}` | 403 `PERMISSION_DENIED`; 400 `INVALID_INPUT` (`project_id`/`tercero`/`tercero.nif`) |

## Reglas de negocio (lo que el código IMPONE)

1. **NIF normalizado** (`_normalizaNif`): mayúsculas + strip de `[\s.\-_/]`; sin validar leyes.
2. **`_ficha`**: sin `project_id`/`nif` → `_invalid`. Sin ficha → `ficha:null, existe:false`.
3. **`_upsert`**: guard de escritor (`rol === 'MAESTRO_TERCEROS'`) → si no, 403. Tercero objeto y
   NIF obligatorios.
4. **Ficha nueva**: `{nif, nombre, variantes, roles, condiciones, origen, creada_en, actualizada_en}`;
   `creada:true`. `origen` por defecto `'maestro-terceros'`.
5. **Upsert SUMA (append-only)**: roles se **funden** (Set), el nombre se **apila** en `variantes`
   si es nuevo, `nombre` solo se rellena si estaba vacío, `condiciones` solo si estaba vacía.
6. **`onTerceroUnificado`**: el padrón manda en la identidad. Crea/completa la ficha por NIF,
   funde `variantes` y `roles` del tercero del evento, rellena `nombre` desde `nombre_canonico` si
   faltaba. `creada:false`. Publica `contabilidad.tercero_actualizado` con `origen:'padron-terceros'`.
   Envuelto en `try/catch` con `logger.error`.

## Cómo se usa (RPC + evento)

### 1. Upsert de la ficha

```json
{ "project_id": "e57a318a-...", "rol": "MAESTRO_TERCEROS", "tercero": { "nombre": "Proveedor S.L.", "nif": "B12345678", "roles": ["proveedor"] }, "correlation_id": "abc-14" }
```
Respuesta `200` + `contabilidad.tercero_actualizado`:
```json
{ "project_id": "e57a318a-...", "tercero": { "nif": "B12345678", "nombre": "Proveedor S.L.", "variantes": ["Proveedor S.L."], "roles": ["proveedor"], "condiciones": null, "origen": "maestro-terceros", "creada_en": "2026-10-01T...", "actualizada_en": "2026-10-01T..." }, "creada": true }
```

### 2. Completar por evento (padrón unifica)

`padron-terceros` publica `contabilidad.tercero_unificado` → `onTerceroUnificado` funde
`variantes`/`roles` y publica `contabilidad.tercero_actualizado` (`origen:'padron-terceros'`).

### 3. Leer la ficha

```json
{ "project_id": "e57a318a-...", "nif": "B-12345678" }
```
Respuesta `200`: `{nif:'B12345678', ficha:{...}, existe:true}`.

### Fallo — rol inválido

Respuesta `403` + `maestro-terceros.upsert.failed` (`PERMISSION_DENIED`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `403 PERMISSION_DENIED` | `rol !== 'MAESTRO_TERCEROS'`. |
| `400 INVALID_INPUT` (`project_id`/`nif`/`tercero`/`tercero.nif`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; el plan dice `padron-terceros` y `expediente-documental` por evento, y el
  código **escucha** `contabilidad.tercero_unificado`). Bases: `_shared` + PosPersistencia.
- **De quién depende por evento:** `padron-terceros` (N2) emite `contabilidad.tercero_unificado`.
- **Quién la consume:** `contrapartida-asistida` (A6.2) y `cuenta-proveedor` (N3) leen
  `contabilidad.tercero_actualizado`.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-entrada/maestro-terceros/module.json` + `index.js`.
2. Smoke: `upsert` con rol MAESTRO_TERCEROS → 200 + `contabilidad.tercero_actualizado`.
3. Segundo upsert → roles fundidos, variantes apiladas, `creada:false`.
4. `onTerceroUnificado` con `contabilidad.tercero_unificado` → completa y publica.
5. `ficha` por NIF normalizado; inexistente → `existe:false`.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `MaestroTerceros extends ModuloHibridoReflejo`; `name = 'maestro-terceros'`,
  `version = 'reflejo-0.1.0'`. Store `this._maestros` (Map `pid → {esquema, fichas: Map<nif, Ficha>}`).
- **PosPersistencia**: `file:'maestro-terceros.json'`, `dir:'/contabilidad/maestro-terceros'`.
- Proyecciones `_ficha`/`_upsert`; handler de dominio `onTerceroUnificado`; helpers `_normalizaNif`,
  `_roles`; tools `toolFicha`/`toolUpsert`.
