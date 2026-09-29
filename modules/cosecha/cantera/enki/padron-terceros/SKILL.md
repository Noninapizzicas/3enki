---
name: padron-terceros
description: >
  Skill FULL del módulo CUSTODIO `padron-terceros` de la vertical contabilidad de
  Enki. Identidad UNICA por numero fiscal: un tercero escrito de varias formas sigue
  siendo uno; con UN SOLO ESCRITOR (MAESTRO_TERCEROS), unificar SUMA (append-only,
  nunca borra) y persiste por proyecto con PosPersistencia. Úsala para operar,
  depurar o extender el custodio, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites unificar la identidad de un tercero por su numero fiscal
    (RPC padron-terceros.unificar.request).
  - Cuando depures por qué una unificacion se rechaza (403 PERMISSION_DENIED si el rol
    no es MAESTRO_TERCEROS, 400 INVALID_INPUT si falta project_id/nif/tercero).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio (identidad unica, append-only, un solo maestro con roles).
  - Cuando vayas a escribir/ampliar el test unitario del custodio padron-terceros.
tags: [enki, modulo, custodio, contabilidad, padron-terceros]
---

# padron-terceros — CUSTODIO CON PERSISTENCIA de identidades de terceros

## Qué hace el módulo

`padron-terceros` es un **CUSTODIO CON PERSISTENCIA** (N2, hoja del plan): la
**identidad UNICA por numero fiscal**. Un proveedor escrito de tres formas sigue
siendo UNO — es la faceta de identidad del mismo maestro (`maestro-terceros`, N1):
**un solo maestro con roles**. **UN SOLO ESCRITOR**: el escritor del maestro
(`MAESTRO_TERCEROS`); cualquier otro rol es rechazado (segundo escritor → `403`).

**No se borra**: unificar SUMA. Las formas escritas se apilan como `variantes`
(append-only) y la identidad canonica solo se completa, nunca se pierde historia.
La normalizacion del numero fiscal es **MECANICA** (mayusculas/sin separadores), no
valida contra ninguna ley cableada. Persiste por proyecto con **PosPersistencia**
(storage `/contabilidad/padron-terceros/padron-terceros.json`), restaura en
`project.activated` y vuelca en `onUnload`. Publica `contabilidad.identidad_unificada`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `padron-terceros.unificar.request` | `onUnificarRequest` | RPC custodio: {project_id, rol:'MAESTRO_TERCEROS', tercero:{nif, nombre?, roles?}} → {project_id, tercero, creada}. Guard Rol=MAESTRO_TERCEROS (segundo escritor → 403). Unifica por numero fiscal normalizado: si la identidad es nueva la crea; si existe APILA la forma escrita como variante (append-only, no borra) y suma roles. Publica contabilidad.identidad_unificada y responde por padron-terceros.unificar.response; nif ausente → padron-terceros.unificar.failed. |
| `project.activated` | `onProjectActivated` | Restaura el padron de identidades del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `padron-terceros.unificar.response` | Respuesta RPC correlada de padron-terceros.unificar.request → {request_id, status:200, data:{project_id, tercero, creada}}. Emitida por el helper _atender. |
| `padron-terceros.unificar.failed` | Par de fallo determinista (N2): rol != MAESTRO_TERCEROS (segundo escritor), tercero sin numero fiscal o project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de padron-terceros.unificar.request. |
| `contabilidad.identidad_unificada` | Fire-and-forget (N2): una identidad de tercero quedo unificada por numero fiscal → {project_id, tercero, creada, correlation_id}. Lo consume el maestro de terceros (N1). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `padron-terceros.unificar.failed` cierra el círculo de
> `padron-terceros.unificar.request` cuando `_unificar` devuelve status ≠ 200.

> Nota: `contabilidad.identidad_unificada` se emite en `onUnificarRequest` con el
> `correlation_id` del request cuando la proyeccion devuelve `200` (creada true o false).

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_unificar` exige `input.rol === 'MAESTRO_TERCEROS'`
   (constante `ROL_ESCRITOR`). Cualquier otro rol → `403 PERMISSION_DENIED` con
   `{rol_esperado:'MAESTRO_TERCEROS', rol_recibido:<rol>}`. Second-writer rechazado.
2. **Identidad por numero fiscal normalizado**: `_normalizaNif` pasa a mayusculas y
   quita espacios, puntos, guiones, underscore y barras (`/[\s.\-_/]/g`). Es **MECANICA**:
   no valida contra ninguna ley (seria una constante legal cableada); solo unifica
   escrituras superficialmente distintas del mismo numero.
3. **Unificar SUMA (append-only, no borra)**: si la identidad existe, la forma escrita se
   apila como **variante** solo si es nueva (`!variantes.includes(...)`); la canonica
   (`nombre_canonico`) solo se completa si estaba desconocida (`null`). **Nada se borra.**
4. **Roles acumulativos**: los roles entrantes (array o valor unico) se suman a los
   existentes en un `Set`; roles repetidos no se duplican.
5. **Dato ausente = desconocido (cero estimacion)**: en creacion, `condiciones` nace
   `null` (desconocido); un campo que no llega queda `null`.
6. **Identidad canonica**: al crear, `nombre_canonico = nombre_escrito` y `variantes`
   contiene esa primera forma; se sellan `creada_en` / `actualizada_en`.
7. **Clave del store**: `Map<nif, Tercero>` por proyecto; esquema
   `contabilidad-padron-terceros-v1`.
8. **Validaciones deterministas**: `project_id` ausente → `400 INVALID_INPUT`
   (`field:'project_id'`); `tercero` ausente/no objeto → `400 INVALID_INPUT`
   (`field:'tercero'`); `nif` (o `numero_fiscal`) vacio tras normalizar → `400 INVALID_INPUT`
   (`field:'tercero.nif'`).
9. **Lectura no muta**: `identidadDe(pid, nif)` devuelve la identidad unificada o `null`
   sin tocar el store.
10. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura; restaura
    en `project.activated`; `flush()` + `detener()` en `onUnload`.
11. **HTTP exacto**: éxito `200`; rol inválido → `403`; campos inválidos → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `padron-terceros.unificar.response` y emite `contabilidad.identidad_unificada`.

### 1. `unificar` — primera forma de un tercero (crea identidad)

```json
{
  "project_id": "e57a318a-...",
  "rol": "MAESTRO_TERCEROS",
  "tercero": { "nif": "b-123.456.78", "nombre": "Proveedor X S.L.", "roles": ["proveedor"] },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tercero": { "nif": "B12345678", "nombre_canonico": "Proveedor X S.L.", "variantes": ["Proveedor X S.L."], "roles": ["proveedor"], "condiciones": null, "creada_en": "2026-09-25T...", "actualizada_en": "2026-09-25T..." },
  "creada": true
}
```
Emite `contabilidad.identidad_unificada`:
```json
{ "project_id": "e57a318a-...", "tercero": { "...": "..." }, "creada": true, "correlation_id": "abc-123" }
```

### 2. `unificar` — otra escritura del mismo tercero (suma variante, no borra)

```json
{
  "project_id": "e57a318a-...",
  "rol": "MAESTRO_TERCEROS",
  "tercero": { "nif": "B12345678", "nombre": "PROVEEDOR X", "roles": ["cliente"] }
}
```
Respuesta `200` con `creada:false`, `variantes":["Proveedor X S.L.","PROVEEDOR X"]`,
`roles":["proveedor","cliente"]`, `nombre_canonico` intacto.

### 3. Fallo — rol inválido (segundo escritor)

```json
{ "project_id": "e57a318a-...", "rol": "OTRO", "tercero": { "nif": "B12345678" } }
```
Respuesta `403` + `padron-terceros.unificar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el escritor del maestro (MAESTRO_TERCEROS) puede unificar identidades", "details": { "rol_esperado": "MAESTRO_TERCEROS", "rol_recibido": "OTRO" } } }
```

### 4. Fallo — sin numero fiscal

```json
{ "project_id": "e57a318a-...", "rol": "MAESTRO_TERCEROS", "tercero": {} }
```
Respuesta `400` + `padron-terceros.unificar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "tercero.nif requerido", "details": { "field": "tercero.nif" } } }
```

## Tests

El test vive en `tests/unit/padron-terceros.test.js`. Cubre:

- `unificar` con rol `MAESTRO_TERCEROS` y nif nuevo → `200 creada:true` con
  `nombre_canonico`, `variantes` y `roles`; emite `contabilidad.identidad_unificada`.
- segunda unificacion del mismo nif normalizado (distinta forma escrita) → `creada:false`,
  apila variante (append-only) y suma roles sin borrar.
- nif con separadores/mayusculas/minusculas → misma identidad (normalizacion mecanica).
- rol distinto → `403 PERMISSION_DENIED` + `padron-terceros.unificar.failed`.
- `tercero` sin nif o `project_id` ausente → `400 INVALID_INPUT`.
- `project.activated` restaura el padron via PosPersistencia; `identidadDe(pid, nif)` lee sin mutar.
- `toolUnificar` devuelve la misma proyeccion que `_unificar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PadronTerceros extends ModuloHibridoReflejo`; `name = 'padron-terceros'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._padrones`
  (`Map<project_id, {esquema, identidades: Map<nif, Tercero>}>`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'padron-terceros.json', dir: '/contabilidad/padron-terceros', snapshot, hidratar })`
  sobre `../../_shared/pos-persistencia` (DOS niveles). `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada escritura marca
  `marcarDirty(pid)`.
- `onUnificarRequest` usa `this._atender(e, 'unificar',
  'padron-terceros.unificar.response', async (d) => {...})` y dentro hace el cierre de
  circulo: en `200` publica `contabilidad.identidad_unificada`, si no publica
  `padron-terceros.unificar.failed`.
- Proyeccion `_unificar(input)` → `{status, data}`; helpers `_normalizaNif(raw)`,
  `_roles(raw)`, `_obtenerOCrear(pid)`. Lectura directa `identidadDe(pid, nif)`.
  Tool `toolUnificar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo consume el maestro de terceros (`maestro-terceros`, N1) via
  `contabilidad.identidad_unificada`.
