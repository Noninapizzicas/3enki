---
name: maestro-terceros
description: >
  Skill FULL del módulo CUSTODIO `maestro-terceros` de la vertical contabilidad de
  Enki. EL MAESTRO ÚNICO de terceros: decisión del dueño (conflicto resuelto) =
  UN TERCERO, UN REGISTRO — la cuenta 430 (cliente) y la 400 (proveedor) cuelgan
  del MISMO tercero, y quien es cliente Y proveedor sigue siendo UNO con `roles`
  acumulados (es_ambos). Un solo escritor (MAESTRO_TERCEROS) completa y suma roles
  sin borrar; persiste por proyecto con PosPersistencia. Úsala para operar, depurar
  o extender el custodio, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites leer la ficha única de un tercero (RPC
    maestro-terceros.ficha.request) o asentar/completar un tercero (RPC
    maestro-terceros.upsert.request).
  - Cuando depures por qué un tercero se rechaza (403 PERMISSION_DENIED si el rol no
    es MAESTRO_TERCEROS, 400 INVALID_INPUT si falta project_id, tercero o nif).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del maestro único (un tercero un registro, roles que se SUMAN,
    append-only, dato ausente = desconocido).
  - Cuando vayas a escribir/ampliar el test unitario del custodio maestro-terceros.
tags: [enki, modulo, custodio, contabilidad, maestro-terceros]
---

# maestro-terceros — CUSTODIO CON PERSISTENCIA del maestro único de terceros

## Qué hace el módulo

`maestro-terceros` es un **CUSTODIO CON PERSISTENCIA** (N1, hoja del plan): **EL
MAESTRO ÚNICO de terceros**. Decisión del dueño (conflicto 1 resuelto): **UN TERCERO,
UN REGISTRO** — la cuenta **430 (cliente)** y la **400 (proveedor)** cuelgan del
**MISMO** tercero; un tercero que es cliente **Y** proveedor sigue siendo **UNO**, con
`roles` acumulados (`es_ambos:true`). **NO hay dos maestros**: `padron-terceros` (N2)
es la faceta de **IDENTIDAD por número fiscal** de este mismo maestro, no otro maestro.

La parcela tiene **UN SOLO ESCRITOR**: el escritor del maestro
(`MAESTRO_TERCEROS`); cualquier otro rol es rechazado (segundo escritor → `403`).

Invariantes:
- **Un tercero, un registro**: la ficha se **completa** y **SUMA** roles; nunca se
  parte en dos.
- **No se borra**: `historial` es append-only; las `condiciones` solo se completan
  campo a campo.
- **Dato ausente = desconocido**: un campo que no llega queda `null`, no se estima.
- **La clave es MECÁNICA**: el número fiscal normalizado (mayúsculas, sin
  separadores). No valida contra ninguna ley cableada ni cablea códigos de cuenta.
- Persiste por proyecto con **PosPersistencia** (storage
  `/contabilidad/maestro-terceros/maestro-terceros.json`), restaura en
  `project.activated` y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `maestro-terceros.ficha.request` | `onFichaRequest` | RPC custodio (lectura): {project_id, tercero:{nif\|numero_fiscal}} → {clave, encontrado, tercero, roles}. Devuelve la ficha unica del tercero por numero fiscal normalizado; sin match → encontrado:false y tercero:null (no se inventa ficha). Responde por maestro-terceros.ficha.response; nif ausente → maestro-terceros.ficha.failed. |
| `maestro-terceros.upsert.request` | `onUpsertRequest` | RPC custodio (escritura, UN escritor): {project_id, rol:'MAESTRO_TERCEROS', tercero:{nif, nombre?, roles?, condiciones?, historial_nota?}} → {tercero, creado}. Guard Rol=MAESTRO_TERCEROS (segundo escritor → 403). Un tercero, un registro: la ficha se completa y los roles se SUMAN (cliente+proveedor = uno con es_ambos); las condiciones se completan campo a campo y el historial es append-only. Exito → publica contabilidad.tercero_actualizado y responde por maestro-terceros.upsert.response; invalido → maestro-terceros.upsert.failed. |
| `project.activated` | `onProjectActivated` | Restaura el maestro de terceros del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `maestro-terceros.ficha.response` | Respuesta RPC correlada de maestro-terceros.ficha.request → {request_id, status:200, data:{clave, encontrado, tercero, roles}}. Emitida por el helper _atender. |
| `maestro-terceros.ficha.failed` | Par de fallo determinista (N1): project_id o numero fiscal del tercero ausente → {status, error:{code, message, details?}}. Cierra el circulo de maestro-terceros.ficha.request. |
| `maestro-terceros.upsert.response` | Respuesta RPC correlada de maestro-terceros.upsert.request → {request_id, status:200, data:{tercero, creado}}. Emitida por el helper _atender. |
| `maestro-terceros.upsert.failed` | Par de fallo determinista (N1): rol != MAESTRO_TERCEROS (segundo escritor), tercero sin numero fiscal o project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de maestro-terceros.upsert.request. |
| `contabilidad.tercero_actualizado` | Fire-and-forget (N1): un tercero quedo actualizado en el maestro unico → {project_id, tercero, creado, roles, correlation_id}. Es la ficha unica con roles de la que cuelgan la cuenta 430 (cliente) y la 400 (proveedor). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `maestro-terceros.upsert.failed` cierra el círculo de
> `maestro-terceros.upsert.request` (lo publica `onUpsertRequest` en la rama
> `status !== 200`) y `maestro-terceros.ficha.failed` es el par declarado de
> `maestro-terceros.ficha.request`.

> Nota: `onFichaRequest` delega en `_atender(...)` **sin** publicar explícitamente
> `maestro-terceros.ficha.failed` (solo `onUpsertRequest` publica su par de fallo);
> el par de `ficha` queda declarado en el manifest pero no se emite desde el handler.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_upsert` exige
   `input.rol === 'MAESTRO_TERCEROS'` (constante `ROL_ESCRITOR`). Cualquier otro rol
   → `403 PERMISSION_DENIED` con
   `{rol_esperado:'MAESTRO_TERCEROS', rol_recibido:<rol>}`. Second-writer rechazado.
2. **Un tercero, un registro**: la clave es el número fiscal normalizado. Si la ficha
   ya existe, se **completa**; nunca se crea una segunda.
3. **Los roles se SUMAN (UNION)**: `roles` se acumula como `Set` de la ficha existente
   ∪ los roles entrantes; `roles` entrantes se normalizan a mayúsculas. Si acaban
   estando `CLIENTE` y `PROVEEDOR` → `es_ambos:true`. Un tercero que es cliente y
   proveedor es UNO.
4. **Nada se borra**: `nombre` solo se rellena si estaba vacío (`if (!existente.nombre
   && t.nombre != null)`); `condiciones` se completan campo a campo con
   `Object.assign`; `historial` es append-only (`historial_nota` empuja
   `{nota, en}`); `actualizada_en` se sella con `new Date().toISOString()`.
5. **Normalización MECÁNICA del número fiscal**: `_normalizaNif` aplica
   `String(raw).toUpperCase().replace(/[\s.\-_/]/g, '')`. **No valida contra ninguna
   ley** (eso sería una constante legal cableada); si queda vacío → `null`.
6. **Clave del tercero**: `_clave(t)` = `nif ?? numero_fiscal ?? clave`, normalizado.
   En `ficha` se acepta `input.tercero || input`.
7. **Dato ausente = desconocido**: `nombre` ausente → `null`;
   `condiciones` no-objeto → `null` (en creación); en la lectura sin match →
   `tercero:null`, `roles:[]` (no se inventa ficha).
8. **Validaciones deterministas**: `project_id` ausente → `400 INVALID_INPUT`
   (`field:'project_id'`); `tercero` ausente/no objeto → `400 INVALID_INPUT`
   (`field:'tercero'`); número fiscal vacío → `400 INVALID_INPUT`
   (`field:'tercero.nif'`).
9. **La lectura no muta**: `_ficha` obtiene o crea el maestro (`_obtenerOCrear`) y
   devuelve la ficha sin tocarla. Lectura directa `fichaDe(pid, nif)` para otras hojas.
10. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    restaura en `project.activated`; `flush()` + `detener()` en `onUnload`.
11. **HTTP exacto**: éxito `200`; rol inválido → `403`; campos inválidos → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `maestro-terceros.ficha.response` y `maestro-terceros.upsert.response`.

### 1. `upsert` — asentar/completar un tercero (solo MAESTRO_TERCEROS)

```json
{
  "project_id": "e57a318a-...",
  "rol": "MAESTRO_TERCEROS",
  "tercero": {
    "nif": "b-12345678",
    "nombre": "ACME SL",
    "roles": ["cliente"],
    "condiciones": { "plazo_pago": 30 },
    "historial_nota": "alta desde pizzepos"
  },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (creación):
```json
{
  "project_id": "e57a318a-...",
  "creado": true,
  "tercero": {
    "clave": "B12345678", "nif": "B12345678", "nombre": "ACME SL",
    "roles": ["CLIENTE"], "es_ambos": false,
    "condiciones": { "plazo_pago": 30 }, "historial": [],
    "creada_en": "2026-09-25T...", "actualizada_en": "2026-09-25T..."
  }
}
```

Segundo upsert con `roles:["proveedor"]` sobre el MISMO nif → `creado:false`, la ficha
sigue siendo UNA y ahora `roles:["CLIENTE","PROVEEDOR"]`, `es_ambos:true`.

Emite `contabilidad.tercero_actualizado`:
```json
{ "project_id": "e57a318a-...", "tercero": { "...": "..." }, "creado": false, "roles": ["CLIENTE", "PROVEEDOR"], "correlation_id": "abc-123" }
```

### 2. `ficha` — leer la ficha única (no muta)

```json
{ "project_id": "e57a318a-...", "tercero": { "nif": "B12345678" } }
```

Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "clave": "B12345678", "encontrado": true, "tercero": { "clave": "B12345678", "...": "..." }, "roles": ["CLIENTE", "PROVEEDOR"] }
```

Sin match → `200` con `encontrado:false`, `tercero:null`, `roles:[]`.

### 3. Fallo — rol inválido (segundo escritor)

```json
{ "project_id": "e57a318a-...", "rol": "OTRO", "tercero": { "nif": "B12345678" } }
```

Respuesta `403` + `maestro-terceros.upsert.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el escritor del maestro (MAESTRO_TERCEROS) puede asentar terceros", "details": { "rol_esperado": "MAESTRO_TERCEROS", "rol_recibido": "OTRO" } } }
```

### 4. Fallo — sin número fiscal

Respuesta `400` + `maestro-terceros.upsert.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "tercero.nif requerido", "details": { "field": "tercero.nif" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/maestro-terceros.test.js`. Cubre:

- `upsert` con rol `MAESTRO_TERCEROS` → `200 creado:true` con metadatos y
  `contabilidad.tercero_actualizado`.
- Segundo `upsert` del mismo nif con otro rol → `creado:false`, **misma** ficha y
  `roles` SUMADOS; cliente+proveedor → `es_ambos:true`.
- `upsert` con otro rol → `403 PERMISSION_DENIED` + `maestro-terceros.upsert.failed`.
- `upsert` sin `tercero.nif` → `400 INVALID_INPUT`; sin `project_id` → `400`.
- `ficha` con nif conocido → `encontrado:true`; con nif desconocido →
  `encontrado:false, tercero:null, roles:[]` (no se inventa).
- `ficha` sin nif → `400 INVALID_INPUT` (`field:'tercero.nif'`).
- `project.activated` restaura el maestro via PosPersistencia; `fichaDe(pid,nif)` lee
  sin mutar.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `MaestroTerceros extends ModuloHibridoReflejo`; `name = 'maestro-terceros'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._maestros`
  (`Map<project_id, {esquema, terceros: Map<clave, Tercero>}>`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'maestro-terceros.json', dir: '/contabilidad/maestro-terceros', snapshot, hidratar })`
  sobre `../../_shared/pos-persistencia` (DOS niveles). `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada escritura marca
  `marcarDirty(pid)`.
- `onFichaRequest` → `_atender(e, 'ficha', 'maestro-terceros.ficha.response', d =>
  this._ficha(d))`. `onUpsertRequest` → `_atender(e, 'upsert',
  'maestro-terceros.upsert.response', async (d) => {...})` y dentro hace el cierre de
  círculo: en `200` publica `contabilidad.tercero_actualizado`, si no
  `maestro-terceros.upsert.failed`.
- Proyecciones `_ficha` (lectura, no muta) y `_upsert` (escritura + guard); helpers
  `_clave`, `_normalizaNif`, `_roles`, `_esAmbos`, `_obtenerOCrear`. Lectura directa
  `fichaDe(pid, nif)`. Tools `toolFicha` / `toolUpsert`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: `padron-terceros` (N2) es la faceta de identidad por número fiscal de este
  mismo maestro; `contrapartida-asistida` (A6.1) consulta la ficha por evento
  (`maestro-terceros.ficha.request`) — nunca por import cruzado.
