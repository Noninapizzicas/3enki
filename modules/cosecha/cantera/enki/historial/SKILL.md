---
name: historial
description: >
  Skill FULL del módulo REFLEJO `historial` del proyecto 3D (taller de impresión 3D,
  una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Registro APPEND-ONLY
  de impresiones: cada asiento es dato MEDIDO (gramos_reales, tiempo_real, nunca estimado)
  y base del consumo agregado. Emite impresion.registrada y, si el resultado es OK,
  pieza.imprimida (dispara el encadenamiento del motor). Úsala para operar, depurar o
  extender el historial, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites registrar una impresión, listar por modelo, ver los recientes o borrar
    un asiento erróneo del historial del taller 3D.
  - Cuando depures por qué un asiento no se registra, por qué falta pieza.imprimida o por
    qué se admitió un dato sin medir.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes: impresion.registrada,
    pieza.imprimida) y las reglas append-only del historial.
  - Cuando vayas a escribir/ampliar el test unitario del historial.
tags: [enki, modulo, reflejo, impresora-3d, historial, append-only, proyecto-3d]
---

# historial — REFLEJO append-only de impresiones del taller 3D

## Qué hace el módulo

`historial` es un **REFLEJO append-only** con store persistente por proyecto (vía
`PosPersistencia`, `/3d/historial`, `historial.json`, single-file, scope project,
single-writer). Es la **memoria del taller** y la **base del consumo agregado**: el
registro solo se **añade**, jamás se reescribe. El **único borrado permitido** es el
**asiento erróneo** (`_borrarAsiento`).

Cada `RegistroImpresion` es **dato MEDIDO** (gramos_reales y tiempo_real por pesaje /
longitud del gcode), **nunca estimado** (regla CERO estimación, honestidad M11).

Al registrar emite `impresion.registrada` **siempre** (con dato medido) y, si el
`resultado === OK`, `pieza.imprimida` (dispara el encadenamiento del motor).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `historial.registrar.request` | `onRegistrarRequest` | Registra una impresión (append-only). Emite `impresion.registrada` y, si resultado es OK, `pieza.imprimida`. |
| `historial.por_modelo.request` | `onPorModeloRequest` | Registros de un modelo (más recientes primero). |
| `historial.recientes.request` | `onRecientesRequest` | N registros más recientes del proyecto. |
| `historial.borrar.request` | `onBorrarRequest` | Borra un asiento erróneo (único borrado permitido). |
| `project.activated` | `onProjectActivated` | Restaura el store del proyecto activado (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `historial.registrar.response` | Respuesta correlada: asiento registrado. |
| `historial.por_modelo.response` | Respuesta correlada: registros del modelo. |
| `historial.recientes.response` | Respuesta correlada: recientes. |
| `historial.borrar.response` | Respuesta correlada: asiento borrado/corregido. |
| `impresion.registrada` | Registro append-only con dato MEDIDO del historial. |
| `pieza.imprimida` | Éxito (resultado OK): dispara el encadenamiento del motor. |
| `historial.registrar.failed` | Par de fallo: no se pudo registrar. |

> **Regla de cierre de círculo**: `historial.registrar.failed` es el par de fallo canónico
> del flujo de registro; responde en `historial.registrar.response`.

## Reglas de negocio

1. **Append-only**: solo se añade; jamás se reescribe ni se borra un asiento con resultado.
2. **CERO estimación (honestidad M11)**: todo registro exige dato MEDIDO. Si faltan
   `gramos_reales` o `tiempo_real` → `400 INVALID_INPUT` (`'gramos_reales (dato medido)
   requerido'` / `'tiempo_real (dato medido) requerido'`).
3. **Resultado válido**: solo `OK | FALLIDA | CANCELADA`; otro valor → `400 INVALID_INPUT`.
4. **`pieza.imprimida` solo con resultado OK**: `_registrar` emite siempre
   `impresion.registrada`, pero `pieza.imprimida` (encadenamiento) **solo** cuando
   `resultado === 'OK'`.
5. **Borrado = asiento erróneo únicamente** (`_borrarAsiento`): si el asiento ya
   `resultado === OK` (ya se emitió `pieza.imprimida` que alimentó el encadenamiento),
   **no se elimina**: se **corrige** a `CANCELADA` y se marca `corregido_en` +
   `asiento_erroneo:true`. Solo los asientos no-OK (FALLIDA/CANCELADA) se eliminan de verdad.
6. **Ordenamiento**: `_porModelo` de **más reciente a más antiguo**; `_recientes` toma los N
   más recientes del proyecto (default `n=10`).
7. **Persistencia single-writer por proyecto**: `PosPersistencia` `historial.json` en
   `/3d/historial`, hidrata/restaura por `project_id` en `project.activated`, `flush()` en
   `onUnload`.

## Uso / cómo invocarlo

RPCs request/response que responden en `*.response`:

### 1. `registrar` — registrar una impresión (append-only, dato medido)

```json
{
  "project_id": "e57a318a-...",
  "modelo_id": "mod_xxx",
  "resultado": "OK",
  "gramos_reales": 3.42,
  "tiempo_real": 7200,
  "formato_origen": "GCODE",
  "filamento": "PETG"
}
```
Respuesta `201`: `{ "registro": {...} }`. Siempre emite `impresion.registrada`; si
`resultado === OK`, además `pieza.imprimida`.

### 2. `por_modelo` — registros de un modelo, más recientes primero

```json
{ "project_id": "e57a318a-...", "modelo_id": "mod_xxx" }
```
Respuesta `200`: `{ "registros": [...], "total": N }`.

### 3. `recientes` — N registros más recientes del proyecto

```json
{ "project_id": "e57a318a-...", "n": 10 }
```
Respuesta `200`: `{ "registros": [...] }`.

### 4. `borrar` — borrar/corregir un asiento erróneo

```json
{ "project_id": "e57a318a-...", "registro_id": "reg_xxx" }
```
Respuesta `200`:
- si el asiento era OK → `{ "registro": {...CANCELADA...}, "corregido": true }`
- si era FALLIDA/CANCELADA → `{ "eliminado": true, "registro_id": "reg_xxx" }`
· `404 NOT_FOUND` si no existe.

## Tests

El test vive en `tests/unit/historial.test.js`. Cubre:

- `registrar` ok (`201`) emite `impresion.registrada` (con dato medido); con resultado OK
  emite además `pieza.imprimida`.
- `registrar` con resultado `FALLIDA`/`CANCELADA` emite `impresion.registrada` **sin**
  `pieza.imprimida`.
- `registrar` sin `gramos_reales` o sin `tiempo_real` → `400` (`CERO estimación`).
- `registrar` con resultado no válido → `400`.
- `por_modelo` ordena más reciente primero; `recientes` con `n`.
- `borrar_asiento`: asiento OK → se **corrige** a CANCELADA (no se elimina); asiento
  FALLIDA/CANCELADA → se elimina; desconocido → 404.
- Append-only y persistencia por proyecto (`project.activated` restaura; `onUnload` flush).

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/historial
node tests/unit/historial.test.js
# esperado: historial: N/N OK
```

> En el runtime real esto corrió desde `/opt/enki/modules/historial`; en este repo, el test
> se ejecuta desde `modules/historial`.

## Notas de implementación

- Clase `HistorialReflejo extends ModuloHibridoReflejo`; `name = 'historial'`,
  `version = 'reflejo-0.1.0'`.
- Store en `this.registros` (`Map` `${project_id}:${id}` → RegistroImpresion);
  `PosPersistencia` `historial.json` en `/3d/historial`.
- Handlers RPC de una línea que delegan en `_atender(e, accion, 'historial.<accion>.response', fn)`.
- Consumidores: `consumo` (acumula `impresion.registrada` para promedios) y
  `motor-encadenamiento` (escucha `pieza.imprimida`). `filamento` se alimenta también del
  dato medido del historial para descontar.
- `eventBus.publish` añade `timestamp` ISO a los eventos publicados.
