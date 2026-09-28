---
name: acceso-nomina
description: >
  Skill FULL del módulo CUSTODIO `acceso-nomina` de la vertical contabilidad de Enki
  (G7, hoja del plan). Aísla la nómina como DATO PERSONAL: cada uno ve la suya.
  Gobierna el store de PERMISOS (quién puede ver la nómina de quién) con un solo
  escritor, el DUENO. Este es el eje de aislamiento DENTRO del negocio
  (persona↔persona), DISTINTO del aislamiento ENTRE negocios (I4, aislamiento-negocio);
  fuera del negocio no se ve la nómina de nadie. Persiste por proyecto vía
  PosPersistencia. Úsala para operar, depurar o extender el custodio, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites autorizar quién puede ver la nómina de quién
    (RPC contabilidad.nomina.autorizar.request) o resolver si un visor puede verla
    (RPC contabilidad.nomina.puede_ver.request).
  - Cuando depures por qué se rechaza una autorización (PERMISSION_DENIED si el rol
    no es DUENO, INVALID_INPUT si falta empleado/visor) o por qué puede_ver sale
    false con motivo SIN_PERMISO / OTRO_NEGOCIO.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la
    regla "cada uno ve la suya" y la diferencia con el aislamiento entre negocios.
  - Cuando vayas a escribir/ampliar el test unitario del custodio acceso-nomina.
tags: [enki, modulo, custodio, persistencia, contabilidad, acceso-nomina, dato-personal, nomina]
---

# acceso-nomina — CUSTODIO del aislamiento de la nómina como dato personal

## Qué hace el módulo

`acceso-nomina` es un **CUSTODIO CON PERSISTENCIA** (G7, hoja del plan): el dueño
del store de **permisos** sobre la nómina. Aísla la nómina como **DATO PERSONAL**:
**cada uno ve la suya**. Gobierna **quién puede ver la nómina de quién** con un
**solo escritor, el `DUENO`** (guard en `_autorizar`).

Este es el **eje de aislamiento DENTRO del negocio (persona↔persona)** — **distinto**
del aislamiento **ENTRE negocios** (I4, `aislamiento-negocio`). Dos personas con
permisos cruzados se gobiernan **aquí**; dos negocios con parcelas cruzadas, en I4.
La dependencia con I4 es **por EVENTO, nunca por `require` cruzado**.

**Fuera del negocio no se ve la nómina de nadie**: `_puedeVer` aplica dos reglas —
*(1)* cada uno ve la suya, sin necesidad de permiso; *(2)* un visor autorizado ve la
del empleado, **solo si es del mismo negocio** (si `negocio_visor` difiere del
negocio del empleado → `motivo:'OTRO_NEGOCIO'`, no es la consolidación de I4).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/acceso-nomina/acceso-nomina.json`), restaura en `project.activated` y
vuelca en `onUnload`. Emite `contabilidad.acceso_nomina_autorizado` en éxito y sus
pares deterministas de fallo. `_puedeVer` es **proyección PURA de lectura** (no muta).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.nomina.autorizar.request` | `onAutorizarRequest` | RPC custodio: {project_id, rol:'DUENO', empleado, visor, negocio?} → {project_id, empleado, visor, permiso, autorizado_por}. Un solo escritor: solo el DUENO autoriza accesos a la nomina (second-writer rechazado con PERMISSION_DENIED). El dato personal: autoriza a QUIEN puede ver la nomina de QUIEN. Publica contabilidad.acceso_nomina_autorizado y responde por contabilidad.nomina.autorizar.response; si el rol o el payload son invalidos → contabilidad.nomina.autorizar.failed. |
| `contabilidad.nomina.puede_ver.request` | `onPuede_verRequest` | RPC custodio: {project_id, visor, empleado, negocio_visor?} → {project_id, empleado, visor, puede_ver, motivo, regla}. Proyeccion PURA de lectura (no muta). Regla 1: cada uno ve la SUYA (dato personal). Regla 2: un visor autorizado ve la del empleado, solo si es del MISMO negocio (eje persona↔persona, ≠ consolidacion I4). Responde por contabilidad.nomina.puede_ver.response; si el payload es invalido → contabilidad.nomina.puede_ver.failed. |
| `project.activated` | `onProjectActivated` | Restaura los permisos de nomina del proyecto activado desde el storage (PosPersistencia): el dato personal y sus permisos son POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.acceso_nomina_autorizado` | Fire-and-forget (G7): un acceso a nomina quedo autorizado en el store de permisos → {project_id, empleado, visor, permiso, autorizado_por}. Senal de que el aislamiento persona↔persona del dato personal quedo gobernado. |
| `contabilidad.nomina.autorizar.failed` | Par de fallo determinista: autorizar rechazado (rol != DUENO) o payload invalido (sin empleado/visor). Cierra el circulo de contabilidad.nomina.autorizar.request. |
| `contabilidad.nomina.puede_ver.failed` | Par de fallo determinista: puede_ver con payload invalido (sin visor/empleado). Cierra el circulo de contabilidad.nomina.puede_ver.request. |
| `contabilidad.acceso_nomina_autorizado.failed` | Par de fallo del evento de dominio contabilidad.acceso_nomina_autorizado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.nomina.autorizar.failed` cierra
> `contabilidad.nomina.autorizar.request` y `contabilidad.nomina.puede_ver.failed`
> cierra `contabilidad.nomina.puede_ver.request`.

> Nota: no está en module.json pero sí lo emite index.js — `onAutorizarRequest`
> publica `contabilidad.acceso_nomina_autorizado` (éxito) /
> `contabilidad.nomina.autorizar.failed` (fallo), y `onPuede_verRequest` publica
> `contabilidad.nomina.puede_ver.failed` cuando `res.status !== 200`. Dentro del
> handler, además de la response de `_atender`.

> Nota: `contabilidad.nomina.autorizar.response` y
> `contabilidad.nomina.puede_ver.response` las emite `_atender` y **NO están
> declaradas en `publishes`**.

> Nota: **`contabilidad.acceso_nomina_autorizado.failed` está declarada en
> `publishes` pero no se emite en `index.js`** — el custodio solo publica los pares
> de fallo de sus RPC, no el par del evento de dominio.

## Reglas de negocio

1. **Un solo escritor de los permisos (guard de rol)**: `_autorizar` exige
   `rol === 'DUENO'` (constante `ROL_ESCRITOR`). Cualquier otro → **`403
   PERMISSION_DENIED`** con
   `{ status:403, error:{ code:'PERMISSION_DENIED', message:'solo el DUENO autoriza accesos a la nomina', details:{ rol_esperado:'DUENO', rol_recibido:<rol> } } }`.
   Second-writer rechazado.
2. **Regla 1 — cada uno ve la SUYA (dato personal)**: `_puedeVer` devuelve
   `puede_ver:true` con `motivo:'PROPIA'` cuando `visor === empleado`, **sin
   necesidad de permiso alguno**.
3. **Regla 2 — visor autorizado del MISMO negocio**: un `visor` en
   `p.visores` ve la nómina del empleado **solo si** `negocio_visor` coincide (o no
   se aporta, o el permiso no tiene negocio) → `motivo:'AUTORIZADO'`. Si difiere →
   `puede_ver:false`, `motivo:'OTRO_NEGOCIO'` (**no es la consolidación de I4**).
4. **Sin permiso → `motivo:'SIN_PERMISO'`**: cuando no es la propia y no está
   autorizado. La respuesta incluye siempre `regla:'cada uno ve la suya'`.
5. **Cada uno no se auto-visa como "otro"**: autorizar a un visor igual al empleado
   **no** añade un visor extra (cada uno se ve a sí mismo por la Regla 1).
6. **El eje persona↔persona es DENTRO del negocio**: el store es
   `store[pid].permisos[<empleado>] = { empleado, negocio, visores:[...] }` +
   `autorizaciones:[...]` (registro append de quién autorizó a quién y cuándo).
   Dos negocios distintos no se cruzan aquí (eso es I4).
7. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT
   project_id`; falta `empleado` (o `id_empleado`) → `400 INVALID_INPUT empleado`;
   falta `visor` (o `id_visor`) → `400 INVALID_INPUT visor`. Shape:
   `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
8. **La lectura no muta**: `_puedeVer` es proyección PURA; solo `_autorizar`
   persiste (marca `marcarDirty(pid)` y actualiza `actualizado_en`/`updated_at`).
9. **La ley entra como DATO**: quién es empleado, quién visor y el negocio son
   **declarables** por el DUENO, nunca cableados.
10. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol no-DUENO → `403`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.nomina.autorizar.response` y
`contabilidad.nomina.puede_ver.response`.

### 1. `autorizar` — autorizar quién ve la nómina de quién (solo DUENO)

```json
{
  "project_id": "e57a318a-...",
  "rol": "DUENO",
  "empleado": "EMP-001",
  "visor": "RRHH-01",
  "negocio": "PANADERIA",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "empleado": "EMP-001",
  "visor": "RRHH-01",
  "permiso": { "empleado": "EMP-001", "negocio": "PANADERIA", "visores": ["RRHH-01"], "declarado_en": "2026-09-28T...", "actualizado_en": "2026-09-28T..." },
  "autorizado_por": "DUENO"
}
```
Emite `contabilidad.acceso_nomina_autorizado` (res.data + `correlation_id`).

### 2. `puede_ver` — ¿puede el visor ver la nómina del empleado? (pura)

```json
{ "project_id": "e57a318a-...", "visor": "RRHH-01", "empleado": "EMP-001", "negocio_visor": "PANADERIA" }
```
Respuesta `200` (visor autorizado del mismo negocio):
```json
{ "project_id": "e57a318a-...", "empleado": "EMP-001", "visor": "RRHH-01", "puede_ver": true, "motivo": "AUTORIZADO", "regla": "cada uno ve la suya" }
```
El propio empleado (`visor === empleado`) → `puede_ver:true`, `motivo:"PROPIA"`.
Fuera del negocio (`negocio_visor:"OTRO"`) → `puede_ver:false`, `motivo:"OTRO_NEGOCIO"`.
Sin permiso → `puede_ver:false`, `motivo:"SIN_PERMISO"`.

### 3. Fallo — rol no-DUENO

```json
{ "project_id": "e57a318a-...", "rol": "JEFE", "empleado": "EMP-001", "visor": "RRHH-01" }
```
Respuesta `403` + `contabilidad.nomina.autorizar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el DUENO autoriza accesos a la nomina", "details": { "rol_esperado": "DUENO", "rol_recibido": "JEFE" } } }
```

### 4. Fallo — payload inválido

Sin `visor` → `400` + `contabilidad.nomina.autorizar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "visor requerido", "details": { "field": "visor" } } }
```

## Tests

El test vive en `tests/unit/acceso-nomina.test.js`. Cubre:

- `autorizar` con `rol:'DUENO'` → `200`, añade el visor y emite
  `contabilidad.acceso_nomina_autorizado`.
- `autorizar` con otro rol → `403 PERMISSION_DENIED` + par de fallo.
- `autorizar` sin `empleado`/`visor` → `400 INVALID_INPUT`.
- `puede_ver` con `visor === empleado` → `true`/`motivo:'PROPIA'` (sin permiso).
- `puede_ver` con visor autorizado del mismo negocio → `true`/`'AUTORIZADO'`;
  con `negocio_visor` distinto → `false`/`'OTRO_NEGOCIO'`.
- `puede_ver` sin permiso → `false`/`'SIN_PERMISO'`; sin `visor`/`empleado` → `400`.
- `project.activated` restaura los permisos vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/acceso-nomina
node --test tests/unit/acceso-nomina.test.js
```

## Notas de implementación

- Clase `AccesoNomina extends ModuloHibridoReflejo`; `name = 'acceso-nomina'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._store` (Map `project_id` →
  `{ esquema:'contabilidad-acceso-nomina-v1', permisos:{}, autorizaciones:[] }`).
- Constante: `ROL_ESCRITOR = 'DUENO'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'acceso-nomina.json', dir: '/contabilidad/acceso-nomina', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onAutorizarRequest`/`onPuede_verRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.nomina.<op>.response', fn)`; los handlers
  emiten el evento de dominio (`contabilidad.acceso_nomina_autorizado`) o el par
  determinista dentro de la proyección, propagando `correlation_id`.
- Proyecciones puras: `_autorizar` (escritura + guard DUENO) y `_puedeVer` (lectura;
  no muta). Helper `_obtenerOCrear(pid)`; `_invalid`/`_errorResponse` vienen de la
  base.
- Tools: `toolAutorizar` → `_autorizar`, `toolPuedeVer` → `_puedeVer`.
- DEP: es el eje persona↔persona **dentro** del negocio. DEP por evento con
  `aislamiento-negocio` (I4, entre negocios) — sin `require` cruzado. La nómina como
  dato personal no existe en ningún otro módulo del inventario.
