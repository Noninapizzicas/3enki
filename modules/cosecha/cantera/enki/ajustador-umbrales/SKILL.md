---
name: ajustador-umbrales
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `ajustador-umbrales` (K3, hoja del plan) de
  la vertical nichos (Radar de Nichos). Es el ORQUESTADOR LIGERO del criterio/umbral de
  validación: el JEFE retunea en caliente el umbral del proyecto (rol DUEÑO, guard
  single-writer), el custodio lo guarda en su store y lo propaga a criterio-viabilidad (C2)
  para que el siguiente lote evalúe contra el umbral refinado. Úsala para operar, depurar o
  extender el custodio, o para entender su contrato de eventos, PosPersistencia y reglas de
  negocio (rango de umbral, guard de rol, merge conservador).
when-to-use: >-
  - Cuando necesites retunear en caliente el umbral/criterio de validación del pipeline como
    JEFE (RPC nichos.umbral.retunear.request) o propagarlo a criterio-viabilidad (C2).
  - Cuando depures por qué un retune fue rechazado (rol != DUEÑO → 403 PERMISSION_DENIED, umbral
    fuera de rango 25-400 → 400 INVALID_INPUT, proyecto/cambio ausente → 400).
  - Cuando entiendas el patrón CUSTODIO con PosPersistencia (project.activated + snapshot/hidratar
    + storage /prisma/nichos/ajustador-umbrales.json) y el single-writer del rol DUEÑO.
  - Cuando vayas a escribir/ampliar el test unitario del custodio.
tags: [enki, modulo, custodio, persistencia, nichos, radar, umbral, validacion, retunear, proyecto-3d]
---

# ajustador-umbrales — CUSTODIO CON PERSISTENCIA (K3) del UMBRAL de validación del Radar

## Qué hace el módulo

`ajustador-umbrales` es el **CUSTODIO del CRITERIO/UMBRAL de validación** del pipeline de nichos
— el **K3** (hoja del plan). Es un **ORQUESTADOR LIGERO**: el JEFE retunea en caliente el
umbral/criterio del proyecto y el custodio lo **propaga** hacia `criterio-viabilidad` (C2) para
que el siguiente lote de validación (C3 veredicto) evalúe contra el umbral refinado.

Rol de las piezas:

- **JEFE (rol `DUEÑO`)** declara el nuevo umbral (`_retunear`): es el **único escritor** (guard
  single-writer). Si `rol != DUEÑO` → `403 PERMISSION_DENIED`.
- **Custodio** guarda el cambio en su store (`_aplicar`) y lo declara aplicado.
- **Propagador** publica `nichos.umbral_ajustado` (fire-and-forget) que consume
  `criterio-viabilidad` (C2).

El umbral ajustado tiene forma canónica `umbralVacio()`:
`{ esquema:'nichos-ajustador-umbrales-v1', umbral_ingresos, minimos_demanda:{numero_busquedas,
contactos_semana}, disposicion_a_pagar, tipo, anterior, ajustado_por, aplicado, updated_at }`.

Es un **CUSTODIO real** (patrón de `/criterio-viabilidad`): **single-writer del umbral**, proyección
de escritura `_aplicar` y de lectura `_leer`. **Persiste por proyecto con PosPersistencia**
(storage `/prisma/nichos/ajustador-umbrales.json`), **restaura en `project.activated`** (vuelve a
criterio-viabilidad vía el evento emitido) y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.umbral.retunear.request` | `onRetunearRequest` | RPC custodia: {project_id, nuevo_umbral:{umbral_ingresos?, minimos_demanda?, disposicion_a_pagar?, tipo?}, rol:'DUEÑO'} → {project_id, umbral, delta, anterior, aplicado}. El jefe retunea el umbral del proyecto; lo custodia en el store y lo propaga a criterio-viabilidad. Éxito → publica nichos.umbral_ajustado y responde por nichos.umbral.retunear.response. Fallo (umbral inválido, rol != DUEÑO) → nichos.umbral.retunear.failed. |
| `project.activated` | `onProjectActivated` | Restaura el umbral ajustado del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.umbral_ajustado` | Fire-and-forget (K3): el jefe ajustó el umbral/criterio → {project_id, nuevo_umbral, anterior, aplicado}. Lo propaga a criterio-viabilidad (C2) para el siguiente lote de validación. |
| `nichos.umbral.retunear.failed` | Par de fallo determinista: el umbral está fuera de rango o no puede aplicarse → {status, code, mensaje}. Cierra el círculo de nichos.umbral.retunear.request. |

> **Nota (honestidad sobre el código real)**: el evento `nichos.umbral_ajustado` que index.js
> publica en `onRetunearRequest` (línea 96) lleva un shape real **más rico** de lo que module.json
> describe: `{ project_id, nuevo_umbral: res.data.umbral.umbral_ingresos, anterior: res.data.anterior,
> aplicado: true, correlation_id }` — además propaga la `correlation_id` del request. Documentado
> tal cual está el código.

> **Nota: no está en module.json pero sí lo emite `_atender` (modulo-hibrido-reflejo)**:
> ante una excepción inesperada en la proyección, se responde por el canal de la response con
> `{ status: 500, code: 'UNKNOWN_ERROR', mensaje: err.message }`.

## Reglas de negocio

1. **Guard de rol single-writer → `403 PERMISSION_DENIED`**: en `_procesarRetunear`, si
   `input.rol !== 'DUEÑO'` (`ROL_DUENYO`) falla con
   `{ status:403, code:'PERMISSION_DENIED', mensaje:'solo el DUEÑO puede retunear el umbral de validacion',
   data:{ rol_esperado:'DUEÑO', rol_recibido:<rol> } }`. El handler publica
   `nichos.umbral.retunear.failed`.
2. **Umbral `umbral_ingresos` en rango 25-400 EUR/semana (ABIERTO)**: si `umbral_ingresos` viene no
   vacío, `_aplicar` valida `numPos` (número finito > 0). Si no es positivo o queda **fuera de
   rango 25-400** (`UMBRAL_MIN_EUR`/`UMBRAL_MAX_EUR`) → `400 INVALID_INPUT` con mensaje
   `'umbral_ingresos fuera de rango 25-400 EUR/semana'` y `data:{ umbral_ingresos }`.
3. **Merge conservador**: en `_aplicar`, lo que el jefe declara se valida; lo que **no** declara se
   **conserva del umbral previo** (`previo = this._umbrales.get(pid) || umbralVacio()`). El umbral
   vigente nunca pierde campos por un retune parcial.
4. **`minimos_demanda` válido**: si se declara, debe traer `numero_busquedas` **o**
   `contactos_semana` positivos (`numPos`); si ambos son null → `400 INVALID_INPUT` con campo
   `cambio.minimos_demanda` (`_invalid`). `disposicion_a_pagar` si se declara debe ser `numPos` > 0.
5. **Snapshot del anterior + delta**: `_aplicar` guarda `actual.anterior` (snapshot del previo,
   con `??` sobre el vigente) y devuelve `delta` (`_deltaDe`, solo campos numéricos: diferencia
   `umbral_ingresos` y `disposicion_a_pagar`, redondeada con `_round`) para recalibrado C7/trazas.
6. **Input inválido → `400 INVALID_INPUT`** + failed con `project_id`/`nuevo_umbral`/`cambio` en
   `mensaje`/`data.field`. `_leer` requiere `project_id`; `_retunear` requiere `project_id`,
   `rol === DUEÑO` y `nuevo_umbral` (o `cambio`) objeto.
7. **Regla de cierre de círculo**: en `onRetunearRequest`, éxito → publica
   `nichos.umbral_ajustado` (fire-and-forget); fallo (status != 200) → publica
   `nichos.umbral.retunear.failed`. El response siempre se responde por
   `nichos.umbral.retunear.response`.

## Cómo se usa (RPCs)

RPC que responde en `nichos.umbral.retunear.response`:

### 1. `retunear` — el JEFE retunea el umbral del proyecto

```json
{
  "project_id": "e57a318a-...",
  "rol": "DUEÑO",
  "nuevo_umbral": {
    "umbral_ingresos": 180,
    "minimos_demanda": { "numero_busquedas": 40, "contactos_semana": 12 },
    "disposicion_a_pagar": 50,
    "tipo": "estandar"
  }
}
```
Respuesta `200` + publica `nichos.umbral_ajustado`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "umbral": {
      "esquema": "nichos-ajustador-umbrales-v1",
      "umbral_ingresos": 180,
      "minimos_demanda": { "numero_busquedas": 40, "contactos_semana": 12 },
      "disposicion_a_pagar": 50,
      "tipo": null,
      "anterior": { "umbral_ingresos": 150, "minimos_demanda": { "numero_busquedas": 30, "contactos_semana": 10 }, "disposicion_a_pagar": 40 },
      "ajustado_por": "DUEÑO",
      "aplicado": true,
      "updated_at": "2026-09-25T11:00:00.000Z"
    },
    "delta": { "umbral_ingresos": 30, "disposicion_a_pagar": 10 },
    "anterior": { "umbral_ingresos": 150, "minimos_demanda": { "numero_busquedas": 30, "contactos_semana": 10 }, "disposicion_a_pagar": 40 },
    "aplicado": true
  }
}
```
El evento `nichos.umbral_ajustado` lleva `{ project_id, nuevo_umbral: 180, anterior: {...}, aplicado: true, correlation_id }`.

### Fallo — rol != DUEÑO

```json
{ "project_id": "e57a318a-...", "rol": "EDITOR", "nuevo_umbral": { "umbral_ingresos": 180 } }
```
Respuesta `403` + `nichos.umbral.retunear.failed`:
```json
{ "status": 403, "code": "PERMISSION_DENIED", "mensaje": "solo el DUEÑO puede retunear el umbral de validacion", "data": { "rol_esperado": "DUEÑO", "rol_recibido": "EDITOR" } }
```

### Fallo — umbral fuera de rango

```json
{ "project_id": "e57a318a-...", "rol": "DUEÑO", "nuevo_umbral": { "umbral_ingresos": 900 } }
```
Respuesta `400` + `nichos.umbral.retunear.failed`:
```json
{ "status": 400, "code": "INVALID_INPUT", "mensaje": "umbral_ingresos fuera de rango 25-400 EUR/semana", "data": { "umbral_ingresos": 900 } }
```

> **Tool de lectura (no RPC)**: `toolLeer({ project_id })` devuelve `{ project_id, umbral:
> this._umbrales.get(pid) || umbralVacio() }` — la ficha vigente o el molde vacío.

## Tests

El test vive en `tests/unit/ajustador-umbrales.test.js`. Cubre (del código real):

- `retunear` con rol DUEÑO y umbral válido → `200`, guarda el umbral en el store, `aplicado:true`,
  delta calculado y publica `nichos.umbral_ajustado`.
- `retunear` con `rol != DUEÑO` → `403 PERMISSION_DENIED` + `nichos.umbral.retunear.failed`.
- `retunear` con `umbral_ingresos` fuera de rango (p.ej. 900) → `400 INVALID_INPUT`.
- `retunear` sin `project_id`, sin `nuevo_umbral`, o con `minimos_demanda` sin valores → `400 INVALID_INPUT`.
- Merge conservador: retune parcial conserva los campos no declarados del umbral previo.
- `_leer`/`toolLeer` devuelve el umbral vigente o el molde vacío.
- PosPersistencia: `project.activated` restaura el umbral desde el storage; `onUnload` vuelca.

Para ejecutarlo:
```bash
cd /home/admin/3enki/modules/nichos/ajustador-umbrales
node tests/unit/ajustador-umbrales.test.js
```

## Notas de implementación

- Clase `AjustadorUmbrales extends ModuloHibridoReflejo`; `name = 'ajustador-umbrales'`,
  `version = 'reflejo-0.1.0'`. Store en memoria: `this._umbrales = new Map()` (project_id → umbral).
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo:this, file:'ajustador-umbrales.json',
  dir:'/prisma/nichos', snapshot, hidratar })`. `onProjectActivated` → `this._persist.restaurar(d.project_id)`;
  `onUnload` → `flush()` + `detener()`. `_aplicar` llama `this._persist.marcarDirty(pid)`.
- **Escritura de dominio**: `onRetunearRequest` delega en `_atender(e,'retunear','nichos.umbral.retunear.response',fn)`;
  éxito → publica `nichos.umbral_ajustado`; fallo → `nichos.umbral.retunear.failed`.
- Proyecciones: `_retunear`/`_procesarRetunear` (valida rol + cambio, orquesta), `_aplicar`
  (escritura, único escritor DUEÑO), `_leer` (lectura), `_deltaDe` (delta numérico).
- `ROL_DUENYO = 'DUEÑO'`, rango `UMBRAL_MIN_EUR = 25` / `UMBRAL_MAX_EUR = 400` (ABIERTO).
- Tools: `toolLeer(params)`, `toolRetunear(params)`.
- DEP: publica `nichos.umbral_ajustado` que consume `criterio-viabilidad` (C2); el siguiente lote
  de validación (C3 veredicto) evalúa contra el umbral refinado. Es el K3 que precede al
  `pipeline-por-nicho` (L1) y a `cuadro-salud-financiera` (F3).
