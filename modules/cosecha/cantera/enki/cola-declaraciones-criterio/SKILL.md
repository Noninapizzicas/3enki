---
name: cola-declaraciones-criterio
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `cola-declaraciones-criterio` de la
  vertical contabilidad (Enki). UNA sola cola donde el JEFE fija (declara) y ratifica
  TODOS los criterios del sistema (unidad_de_cierre, periodo, amortizacion, reparto,
  dimensiones, tipos, consolidacion). Cierra declarativamente B1/B7·C7·E6·F5·J6·D11·I5.
  Invariante 13: el criterio se DECLARA, no se estima — valor ausente → estado ABIERTO,
  jamás un default. UN solo escritor (rol JEFE_CRITERIO). No se borra: re-fijar appendea
  al historial. Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando necesites fijar (declarar) o ratificar un criterio del sistema
    (RPC cola-declaraciones-criterio.fijar.request / .ratificar.request).
  - Cuando depures por qué un criterio sigue [ABIERTO] en vez de declarado, o por qué
    se rechaza un rol distinto de JEFE_CRITERIO (403 PERMISSION_DENIED).
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y su hecho de
    dominio contabilidad.criterio_fijado.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, analitica, criterios, jefe, abierto]
---

# cola-declaraciones-criterio — CUSTODIO de la cola única de criterios del JEFE

## Qué hace el módulo

`cola-declaraciones-criterio` es un **CUSTODIO CON PERSISTENCIA** (K9, hoja del plan):
el punto ÚNICO de declaración de criterios del sistema. El **JEFE** (rol
`JEFE_CRITERIO`) **fija** (declara el valor) y **ratifica** todos los criterios:
`unidad_de_cierre`, `periodo`, `amortizacion`, `reparto`, `dimensiones`, `tipos`,
`consolidacion`. Es el cierre *declarativo* de B1/B7·C7·E6·F5·J6·D11·I5 (la constante
`CIERRA_DECLARATIVO = 'B1·B7·C7·E6·F5·J6·D11·I5'`).

**Invariante 13 (el criterio se DECLARA, no se estima):** si no llega valor, el criterio
NO se rellena con un default — queda en estado `ABIERTO` con `valor: null`. El sistema
pregunta; no decide. La cola recoge lo abierto (`abiertosDe`) para que el JEFE lo declare.

Un **solo escritor**: el guard `_guardEscritor` exige `rol === 'JEFE_CRITERIO'`
(`ROL_ESCRITOR`). Cualquier otro rol → `403 PERMISSION_DENIED`. No se borra: **re-fijar
appendea** al `historial` del criterio. Persiste por proyecto con **PosPersistencia**
(storage `/contabilidad/cola-declaraciones-criterio`, archivo
`cola-declaraciones-criterio.json`), restaura en `project.activated` y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `cola-declaraciones-criterio.fijar.request` | `onFijarRequest` | RPC custodio (ORDEN, con panel): `{project_id, rol:'JEFE_CRITERIO', clave, valor?}` → `{project_id, criterio, fijado, abierto}`. Guard de escritor. Guarda el valor declarado o deja `[ABIERTO]`. Publica `contabilidad.criterio_fijado` y responde por `.fijar.response`. Rol/payload inválido → `.fijar.failed`. |
| `cola-declaraciones-criterio.ratificar.request` | `onRatificarRequest` | RPC custodio (ORDEN, con panel): `{project_id, rol:'JEFE_CRITERIO', clave}` → `{project_id, criterio, ratificado, ya_estaba, abierto}`. Acto del JEFE sobre un criterio YA declarado; sobre `[ABIERTO]` no se inventa ratificación (`ratificado:false`). Responde por `.ratificar.response`. Error → `.ratificar.failed`. |
| `project.activated` | `onProjectActivated` | Restaura la cola de criterios del proyecto activado desde el storage. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.criterio_fijado` | Fire-and-forget (K9): un criterio quedó declarado y/o ratificado → `{project_id, clave, valor, estado, abierto?}`. Lo consumen anclaje-cierre-vertical, prevision-caja, etiquetado-analitico, coste-indirecto, tablero-margen-dimension, vencimiento-pago. |
| `cola-declaraciones-criterio.fijar.response` | Respuesta RPC correlada de la op `fijar`. |
| `cola-declaraciones-criterio.fijar.failed` | Fallo determinista de `fijar.request` (rol ≠ JEFE_CRITERIO o `clave` ausente). |
| `cola-declaraciones-criterio.ratificar.response` | Respuesta RPC correlada de la op `ratificar`. |
| `cola-declaraciones-criterio.ratificar.failed` | Fallo determinista de `ratificar.request`. |

> En `onFijarRequest`, si el status es 200 publica `contabilidad.criterio_fijado`; si no,
> publica `.fijar.failed`. En `onRatificarRequest`, solo publica el hecho si
> `status===200 && data.ratificado===true`; si `status!==200`, publica `.ratificar.failed`.
> Ojo: una ratificación de un criterio `[ABIERTO]` devuelve 200 con `ratificado:false` →
> **no** publica hecho ni fallo (no se inventa el acto).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `fijar` | **ORDEN** (panel) | `{project_id, rol:'JEFE_CRITERIO', clave, valor?}` | `{project_id, criterio, fijado:true, abierto}` | 403 `PERMISSION_DENIED`; 400 `INVALID_INPUT` (`clave`) |
| `ratificar` | **ORDEN** (panel) | `{project_id, rol:'JEFE_CRITERIO', clave}` | `{project_id, criterio, ratificado, ya_estaba, abierto}` | 403 `PERMISSION_DENIED`; 400 `INVALID_INPUT` (`clave`) |

Ambas llevan `ui_handlers` (`system_panel`, `lateral_derecha`) → son **ORDEN**: su cara
es un panel, no el bus. No obstante, responden por su `*.response` correlada.

## Reglas de negocio (lo que el código IMPONE)

1. **Un solo escritor**: `_guardEscritor(rol)` exige `rol === 'JEFE_CRITERIO'`. Otro rol →
   `403 PERMISSION_DENIED` con `{rol_esperado:'JEFE_CRITERIO', rol_recibido}`.
2. **Nada se estima**: `_fijar` considera "con valor" solo si `valor !== undefined/null` y
   no es string vacío. Sin valor → `estado='ABIERTO'`, `valor=null` (no default).
3. **Con valor → DECLARADO**: `estado='DECLARADO'`, `fijado_por='JEFE_CRITERIO'`,
   `fijado_en=ahora`, `ratificado_en=null` (re-declarar invalida la ratificación previa).
4. **No se borra**: cada `_fijar` y cada `_ratificar` hace `push` a `criterio.historial`
   con `{estado, valor, por, en}`. El valor vigente queda declarado con fecha y autor.
5. **Ratificar sin declarar no inventa nada**: criterio inexistente → 200 con
   `ratificado:false, abierto:true, motivo:'el criterio no esta registrado ni declarado en la cola'`.
   Criterio `[ABIERTO]` → 200 con `ratificado:false, abierto:true, motivo:...`.
6. **Ratificar es idempotente**: si ya estaba `RATIFICADO`, devuelve `ya_estaba:true` sin
   re-escribir ni tocar el historial.
7. **Conocidos**: las claves en `CRITERIOS_CONOCIDOS` reciben `cierra=CIERRA_DECLARATIVO`
   y `conocido:true`; una clave desconocida se acepta igual (`conocido:false`, `cierra:null`).
8. **Validación**: falta `project_id` → `_invalid('project_id')`; falta `clave` →
   `_invalid('clave')` (400 `INVALID_INPUT`).

## Cómo se usa (RPCs)

### 1. Fijar un criterio (declararlo)

```json
{ "project_id": "e57a318a-...", "rol": "JEFE_CRITERIO", "clave": "unidad_de_cierre", "valor": "MES", "correlation_id": "abc-1" }
```
Respuesta `200` + `contabilidad.criterio_fijado`:
```json
{ "project_id": "e57a318a-...", "criterio": { "clave": "unidad_de_cierre", "cierra": "B1·B7·C7·E6·F5·J6·D11·I5", "conocido": true, "valor": "MES", "estado": "DECLARADO", "fijado_por": "JEFE_CRITERIO", "fijado_en": "2026-10-01T...", "ratificado_en": null, "historial": [ { "estado": "DECLARADO", "valor": "MES", "por": "JEFE_CRITERIO", "en": "2026-10-01T..." } ] }, "fijado": true, "abierto": false }
```

### 2. Fijar en blanco → queda [ABIERTO]

```json
{ "project_id": "e57a318a-...", "rol": "JEFE_CRITERIO", "clave": "dimensiones" }
```
Respuesta `200`: `fijado:true`, `abierto:true`, `criterio.valor:null`, `estado:'ABIERTO'`.

### 3. Ratificar

```json
{ "project_id": "e57a318a-...", "rol": "JEFE_CRITERIO", "clave": "unidad_de_cierre" }
```
Respuesta `200` + `contabilidad.criterio_fijado`:
```json
{ "project_id": "e57a318a-...", "criterio": { "...": "...", "estado": "RATIFICADO", "ratificado_en": "2026-10-01T..." }, "ratificado": true, "ya_estaba": false, "abierto": false }
```

### Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "MOTOR_COBRO", "clave": "periodo", "valor": "ANUAL" }
```
Respuesta `403` + `cola-declaraciones-criterio.fijar.failed`:
```json
{ "status": 403, "code": "PERMISSION_DENIED", "mensaje": "solo el JEFE (JEFE_CRITERIO) fija y ratifica criterios en la cola", "rol_esperado": "JEFE_CRITERIO", "rol_recibido": "MOTOR_COBRO" }
```

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `403 PERMISSION_DENIED` | `rol !== 'JEFE_CRITERIO'` en `fijar` o `ratificar`. |
| `400 INVALID_INPUT` (`project_id`) | falta `project_id`. |
| `400 INVALID_INPUT` (`clave`) | `clave` ausente o vacía. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` +
  `_shared/pos-persistencia` + `filesystem` + `project-manager`.
- **De quién depende por evento:** ninguno. Es el punto único de declaración.
- **Quién la consume por evento:** anclaje-cierre-vertical, prevision-caja,
  etiquetado-analitico, coste-indirecto, tablero-margen-dimension, vencimiento-pago
  (todos leen el criterio declarado vía `contabilidad.criterio_fijado`).
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/cola-declaraciones-criterio/module.json` + `index.js`.
2. Smoke del RPC: `fijar` con `rol:'JEFE_CRITERIO'` → 200 + `contabilidad.criterio_fijado`;
   `fijar` sin `valor` → `estado:'ABIERTO'`.
3. Par `*.failed` determinista: rol inválido → 403 + `.fijar.failed`/`.ratificar.failed`.
4. Idempotencia: `ratificar` dos veces → segunda `ya_estaba:true` sin re-escribir historial.
5. Gate `scripts/validate-hibridos.js`.
6. Comprobar eventos reales: `grep -E '"(event)"' module.json`.

## Notas de implementación

- Clase `ColaDeclaracionesCriterio extends ModuloHibridoReflejo`; `name =
  'cola-declaraciones-criterio'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._colas` (Map `project_id → {esquema, criterios: Map<clave, Criterio>}`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'cola-declaraciones-criterio.json', dir: '/contabilidad/cola-declaraciones-criterio', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
- Helpers de lectura directa (mismo proceso, no mutan): `criteriosDe(pid)` (lista completa)
  y `abiertosDe(pid)` (filtra `estado === 'ABIERTO'`).
- Proyecciones: `_fijar` y `_ratificar`; tools `toolFijar`/`toolRatificar`.
  `_invalid`/`_errorResponse` vienen de `modulo-hibrido-reflejo`.
