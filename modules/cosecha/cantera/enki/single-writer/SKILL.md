---
name: single-writer
description: >
  Skill FULL del módulo CUSTODIO `single-writer` de la vertical contabilidad de Enki
  (M2, hoja del plan). CERROJO 2 · la LEY que gobierna a TODO custodio: un único
  ESCRITOR por parcela. Los custodios registran su parcela y su rol autorizado; a
  partir de ahí, cualquier escritura con OTRO rol se rechaza de forma determinista con
  ERROR_DOS_ESCRITORES (409). Dos escritores sobre la misma parcela = corrupción
  esperando turno (invariante 8 del dominio). Un solo escritor de la LEY: el DUENO
  declara el registro de parcelas (second-writer rechazado con PERMISSION_DENIED);
  re-registrar la MISMA parcela con otro escritor también se rechaza. Persiste por
  proyecto vía PosPersistencia. Úsala para operar, depurar o extender el custodio.
when-to-use: >
  - Cuando necesites registrar una parcela con su rol escritor autorizado
    (RPC contabilidad.parcela.registrar.request) o autorizar/escribir sobre ella
    (RPC contabilidad.parcela.autorizar.request).
  - Cuando depures por qué una escritura se rechaza (409 ERROR_DOS_ESCRITORES si el
    rol no es el autorizado, 403 PERMISSION_DENIED si el rol no es DUENO al
    registrar, 404 si la parcela no está registrada) o por qué el payload es inválido.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el guard de
    escritor único por parcela y la persistencia por proyecto.
  - Cuando vayas a escribir/ampliar el test unitario del custodio single-writer.
tags: [enki, modulo, custodio, persistencia, contabilidad, single-writer, cerrojo, escritor]
---

# single-writer — CUSTODIO del cerrojo "un solo escritor por parcela"

## Qué hace el módulo

`single-writer` es un **CUSTODIO CON PERSISTENCIA** (M2, hoja del plan): **CERROJO 2 ·
la LEY que gobierna a TODO custodio**. Su invariante es **un único ESCRITOR por
parcela** (invariante 8 del dominio). Los demás custodios registran aquí **su parcela**
y **su rol autorizado**; a partir de ese momento, cualquier intento de escritura con
**OTRO** rol se rechaza de forma determinista con **`ERROR_DOS_ESCRITORES`** (409).
**Dos escritores sobre la misma parcela = corrupción esperando turno**; por eso el
cerrojo lo impide antes de tocar la parcela.

Hay **un solo escritor de la LEY**: **el DUENO** declara el registro de parcelas
(guard en `_registrar`; second-writer rechazado con `PERMISSION_DENIED`). Además,
**re-registrar la MISMA parcela con otro escritor también se rechaza** (409). El
registro es **idempotente** cuando coinciden parcela y escritor (`reusado:true`).

`_autorizar` es una **proyección PURA de guard** (no muta) y `_escribir` es el **guard
de escritura que todo custodio invoca antes de tocar su parcela**. Persiste por
proyecto con **PosPersistencia** (storage `/contabilidad/single-writer/*.json`),
restaura en `project.activated` y vuelca en `onUnload`.

> **NO REUTILIZA**: el guard de escritor por parcela es la invariante transversal del
> dominio; no existe módulo que lo gobierne (el diario, las colas, los maestros y los
> registros lo necesitan, pero ninguno lo declara).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.parcela.registrar.request` | `onRegistrarRequest` | RPC custodio: {project_id, rol:'DUENO', parcela, rol_autorizado} → {project_id, parcela, rol_autorizado, reusado}. Guard de escritor de la LEY: solo el DUENO (second-writer rechazado). Re-registrar la misma parcela con otro escritor → ERROR_DOS_ESCRITORES (409). Publica contabilidad.parcela_registrada y responde por contabilidad.parcela.registrar.response; si el rol o el payload son invalidos → contabilidad.parcela.registrar.failed. |
| `contabilidad.parcela.autorizar.request` | `onAutorizarRequest` | RPC custodio: {project_id, parcela, rol_autorizado, cambio?} → {project_id, parcela, rol, escrito, cambio} \| ERROR_DOS_ESCRITORES. Es el guard que TODO custodio invoca antes de escribir en su parcela: si el rol no es el escritor autorizado → 409 ERROR_DOS_ESCRITORES; si la parcela no esta registrada → 404. Publica contabilidad.parcela_autorizada y responde por contabilidad.parcela.autorizar.response; si el payload es invalido o hay dos escritores → contabilidad.parcela.autorizar.failed. |
| `project.activated` | `onProjectActivated` | Restaura el registro de parcelas del proyecto activado desde el storage (PosPersistencia): la ley de escritores es POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.parcela_registrada` | Fire-and-forget (M2): una parcela quedo registrada con su rol escritor autorizado → {project_id, parcela, rol_autorizado, reusado}. Lo consultan los custodios antes de escribir en su parcela. |
| `contabilidad.parcela_autorizada` | Fire-and-forget (M2): una escritura sobre una parcela quedo autorizada (o autorizada la sola comprobacion del rol) → {project_id, parcela, rol, escrito, cambio}. Es la senal de que el cerrojo dejo pasar al escritor unico. |
| `contabilidad.parcela.registrar.failed` | Par de fallo determinista: registrar rechazado (rol != DUENO), payload invalido o parcela ya con otro escritor (ERROR_DOS_ESCRITORES). Cierra el circulo de contabilidad.parcela.registrar.request. |
| `contabilidad.parcela.autorizar.failed` | Par de fallo determinista: autorizar/escribir con rol distinto al escritor autorizado (ERROR_DOS_ESCRITORES), parcela no registrada (404) o payload invalido. Cierra el circulo de contabilidad.parcela.autorizar.request. |
| `contabilidad.parcela_registrada.failed` | Par de fallo del evento de dominio contabilidad.parcela_registrada: la emision del hecho de dominio no se completo. |
| `contabilidad.parcela_autorizada.failed` | Par de fallo del evento de dominio contabilidad.parcela_autorizada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.parcela.registrar.failed` cierra `contabilidad.parcela.registrar.request`;
> `contabilidad.parcela.autorizar.failed` cierra `contabilidad.parcela.autorizar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.parcela.registrar.response` y `contabilidad.parcela.autorizar.response`
> (los pares response de los RPC); no están declaradas en `publishes`.

## Reglas de negocio

1. **Un solo escritor de la LEY (guard de rol)**: `_registrar` exige `rol === 'DUENO'`
   (constante `ROL_LEY`). Cualquier otro → **`403 PERMISSION_DENIED`** con
   `{ message:'solo el DUENO declara la ley de parcelas', details:{ rol_esperado:'DUENO',
   rol_recibido:<rol> } }`. Second-writer rechazado.
2. **Un solo escritor por parcela (el cerrojo)**: re-registrar la MISMA parcela con un
   `rol_autorizado` **distinto** al vigente → **`409 ERROR_DOS_ESCRITORES`** con
   `{ parcela, rol_vigente, rol_intentado, simbolico:'ERROR_DOS_ESCRITORES' }`
   (constante `CODE_DOS_ESCRITORES`).
3. **Registro idempotente**: la misma parcela con el MISMO `rol_autorizado` → `200
   {reusado:true}`, sin duplicar ni rechazar.
4. **Autorizar = proyección PURA de guard (no muta)**: `_autorizar` exige `project_id`,
   `parcela` y `rol` (de `rol_autorizado` o `rol_escritor`). Si la parcela **no está
   registrada** → **`404 RESOURCE_NOT_FOUND`** con `{ parcela, simbolico:'PARCELA_NO_REGISTRADA' }`;
   si el rol no coincide con el escritor vigente → **`409 ERROR_DOS_ESCRITORES`** con
   `{ parcela, rol_vigente, rol_intentado, simbolico:'ERROR_DOS_ESCRITORES' }`.
5. **Escribir = autorizar + marca**: `_escribir` delega en `_autorizar`; si pasa,
   devuelve `{ project_id, parcela, rol, escrito:true, cambio }` (`cambio` es el
   payload aportado o `null`). **Ningún custodio escribe si no es el rol autorizado de
   su parcela.**
6. **Una sola escritura por parcela por proyecto**: el registro es por proyecto
   (`store[pid].parcelas[<parcela>]`); el mismo nombre de parcela en otro proyecto tiene
   su propio escritor.
7. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   falta `parcela` → `400 INVALID_INPUT parcela`; falta `rol_autorizado` (al registrar)
   o `rol` (al autorizar) → `400 INVALID_INPUT rol_autorizado` / `400 INVALID_INPUT rol`.
   Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido',
   details:{ field:<campo> } } }`.
8. **La ley entra como DATO**: qué parcela y qué rol escritor es **declarable** por el
   DUENO, nunca cableado en el código del cerrojo.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol no-DUENO → `403`;
   parcela no registrada → `404`; dos escritores → `409`; excepción en `_atender` →
   `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.parcela.registrar.response` y
`contabilidad.parcela.autorizar.response`.

### 1. `registrar` — declarar la parcela y su rol escritor (solo DUENO)

```json
{ "project_id": "e57a318a-...", "rol": "DUENO", "parcela": "diario", "rol_autorizado": "ADMISION", "correlation_id": "abc-123" }
```
Respuesta `200` (primera vez):
```json
{ "project_id": "e57a318a-...", "parcela": "diario", "rol_autorizado": "ADMISION", "reusado": false }
```
Emite `contabilidad.parcela_registrada` (res.data + `correlation_id`).

### 2. `autorizar` — autorizar/escribir sobre la parcela (el guard de todo custodio)

```json
{ "project_id": "e57a318a-...", "parcela": "diario", "rol_autorizado": "ADMISION", "cambio": { "asiento": "..." }, "correlation_id": "abc-124" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "parcela": "diario", "rol": "ADMISION", "escrito": true, "cambio": { "asiento": "..." } }
```
Emite `contabilidad.parcela_autorizada` (res.data + `correlation_id`).

### Fallo — dos escritores (el cerrojo corta)

```json
{ "project_id": "e57a318a-...", "parcela": "diario", "rol_autorizado": "OPERADOR" }
```
Respuesta `409` + `contabilidad.parcela.autorizar.failed`:
```json
{ "status": 409, "error": { "code": "ERROR_DOS_ESCRITORES", "message": "la parcela diario es de ADMISION", "details": { "parcela": "diario", "rol_vigente": "ADMISION", "rol_intentado": "OPERADOR", "simbolico": "ERROR_DOS_ESCRITORES" } } }
```

### Fallo — parcela no registrada

`_autorizar` sobre una parcela sin registro → `404 RESOURCE_NOT_FOUND` con
`{ parcela, simbolico:'PARCELA_NO_REGISTRADA' }` y `contabilidad.parcela.autorizar.failed`.

### Tools (sin RPC en module.json)

`toolRegistrar` → `_registrar`; `toolAutorizar` → `_autorizar`; `toolEscribir` →
`_escribir`.

## Tests

El test vive en `tests/unit/single-writer.test.js`. Cubre:

- `registrar` con rol `DUENO` → `200 {reusado:false}`, emite
  `contabilidad.parcela_registrada`; re-registrar la misma parcela/escritor → `reusado:true`.
- **Dos escritores**: re-registrar la misma parcela con otro `rol_autorizado` → `409
  ERROR_DOS_ESCRITORES` + `contabilidad.parcela.registrar.failed`.
- `registrar` con rol distinto de DUENO → `403 PERMISSION_DENIED`.
- `autorizar`/`escribir` con el rol vigente → `200 {escrito:true}`, emite
  `contabilidad.parcela_autorizada`; con otro rol → `409`; parcela no registrada → `404`.
- Payloads inválidos (sin `project_id`/`parcela`/`rol_autorizado`/`rol`) → `400 INVALID_INPUT`.
- `project.activated` restaura el registro vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/single-writer
node --test tests/unit/single-writer.test.js
```

## Notas de implementación

- Clase `SingleWriter extends ModuloHibridoReflejo`; `name = 'single-writer'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._store` (Map project_id →
  `{ esquema:'contabilidad-single-writer-v1', parcelas:{ <parcela>:{ parcela,
  rol_autorizado, registrado_por, registrado_en } } }`).
- Constantes `ROL_LEY = 'DUENO'` y `CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'single-writer.json', dir: '/contabilidad/single-writer', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onRegistrarRequest` delega en `_atender(e, 'registrar',
  'contabilidad.parcela.registrar.response', fn)`; `onAutorizarRequest` en
  `_atender(e, 'autorizar', 'contabilidad.parcela.autorizar.response', fn)`. Los
  handlers emiten el evento de dominio o el par determinista según el `status`.
- Proyecciones puras: `_registrar` (escritura + guard), `_autorizar` (guard puro, no
  muta), `_escribir` (autoriza + marca `escrito:true`). Helper `_obtenerOCrear(pid)`.
  `_invalid`/`_errorResponse` vienen de `modulo-hibrido-reflejo` / `base-module`.
- Tools: `toolRegistrar`, `toolAutorizar`, `toolEscribir`.
- DEP hacia delante: es el guard transversal que invocan los custodios (diario, colas,
  maestros, registros) antes de escribir su parcela.
