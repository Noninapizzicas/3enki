---
name: cupula-gcode
description: >
  Skill FULL del módulo CUSTODIO `cupula-gcode` del proyecto 3D (taller de impresión 3D,
  una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Almacén de la MONEDA
  real del taller lista para imprimir: ArchivoPreparado (ruta/perfil/gramos_est/tiempo_est/
  listo) en STL/3MF (origen) + GCODE (preparado), los 3 formatos conviven. Reserva para la
  cola sin re-slicear lo ya preparado (cache). Úsala para operar, depurar o extender el
  custodio de la cúpula de gcode, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites registrar un archivo preparado, marcar consumido, listar los listos,
    obtener la reserva que alimenta la cola u obtener un archivo por id.
  - Cuando depures por qué no se emite archivo.preparado, por qué la reserva re-slicea lo ya
    listo o por qué no se reconcilia un archivo ya preparado.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes: archivo.preparado)
    y las reglas de negocio de la cúpula de gcode.
  - Cuando vayas a escribir/ampliar el test unitario del custodio de la cúpula.
tags: [enki, modulo, custodio, impresora-3d, cupula, gcode, cache, proyecto-3d]
---

# cupula-gcode — CUSTODIO de la cúpula de gcode (moneda lista para imprimir)

## Qué hace el módulo

`cupula-gcode` es un **CUSTODIO** (dueño del store y de la persistencia): es el **único
escritor** del store `archivos` por proyecto (vía `PosPersistencia`, `/3d/cupula-gcode`,
`cupula-gcode.json`, single-file, scope project, single-writer).

Almacena la **MONEDA real** del taller **lista para imprimir**: un `ArchivoPreparado`
`{ ruta, perfil, gramos_est, tiempo_est, listo }` en STL/3MF (origen) + GCODE (preparado).
Los **3 formatos conviven** — nunca solo `.3mf` (ley de la moneda).

Funciona como **caché**: un modelo ya preparado (gcode listo) **no se vuelve a preparar**;
la cola encadena desde aquí (`_reserva` alimenta la próxima tanda lista **sin re-slicear**).

Es un **CUSTODIO sin juicio**: no decide qué pieza imprimir (eso vive en el dueño/cola);
solo guarda y sirve la preparación. `reservaMin` ABIERTO (decisión no fijada aún).

## Flujo típico

Caso real: **registrar un archivo preparado → alimentar la cola desde la reserva → retirarlo tras imprimir**.

1. `importacion` prepara el GCODE (o el usuario lo tiene listo) y llama `cupula-gcode.registrar.request` con `{ modelo_id, formato: 'GCODE', archivo, listo: true }`. `_registrar` crea el `ArchivoPreparado` (`201`) y —como `listo === true`— emite `archivo.preparado`.
2. Si se registra solo el STL/3MF **origen** (no listo) → `201` pero **no** emite `archivo.preparado`. Si ya existe un archivo equivalente (mismo `modelo_id`+`formato`+`listo`) → **reconcilia** (`reconciliado:true`) y **no re-emite** (`_mergeArchivo` añade rutas/formatos).
3. La cola pide `cupula-gcode.reserva.request` (`n`/`excluir_ids`/`ya_encolados`) → `_reserva` devuelve solo los `listo && !consumido` ordenados por `preparado_en`, **sin re-slicear** lo ya preparado (caché).
4. `ciclo-impresion` obtiene el gcode vía `cupula-gcode.obtener.request` y `_obtener` lo devuelve por `archivo_id` (o `404`).
5. Tras imprimir, se llama `cupula-gcode.marcar_consumido.request` → `_marcarConsumido` pone `consumido:true` y lo retira de la futura reserva (`404` + `failed` `archivo_no_encontrado` si no existe).

Cada flujo cierra su círculo en `cupula-gcode.<accion>.response`; ante error de dominio responde el código HTTP exacto (400/404/422) con su par `*.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `cupula-gcode.registrar.request` | `onRegistrarRequest` | Registra un archivo preparado (STL/3MF origen y/o GCODE listo). Emite `archivo.preparado`. |
| `cupula-gcode.marcar_consumido.request` | `onMarcarConsumidoRequest` | Marca un archivo como consumido tras la impresión (lo retira de la reserva). |
| `cupula-gcode.listos.request` | `onListosRequest` | Lista los archivos listos para imprimir (con gcode listo). |
| `cupula-gcode.reserva.request` | `onReservaRequest` | Próxima tanda lista que alimenta la cola; no re-slicea lo ya preparado (cache). |
| `cupula-gcode.obtener.request` | `onObtenerRequest` | Obtiene un archivo preparado por id. |
| `project.activated` | `onProjectActivated` | Restaura el store del proyecto activado (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `cupula-gcode.registrar.response` | Respuesta correlada: archivo registrado (reconciliado si ya existía). |
| `cupula-gcode.marcar_consumido.response` | Respuesta correlada: archivo marcado consumido. |
| `cupula-gcode.listos.response` | Respuesta correlada: lista de archivos listos. |
| `cupula-gcode.reserva.response` | Respuesta correlada: reserva de próximos listos para la cola. |
| `cupula-gcode.obtener.response` | Respuesta correlada: archivo preparado o 404. |
| `archivo.preparado` | GCODE listo en la cúpula (alimenta la cola/reserva). |
| `cupula-gcode.registrar.failed` | Par de fallo: no se pudo registrar el archivo. |
| `cupula-gcode.marcar_consumido.failed` | Par de fallo: no se pudo marcar consumido. |

> **Regla de cierre de círculo**: los pares de fallo canónicos son
> `cupula-gcode.registrar.failed` y `cupula-gcode.marcar_consumido.failed`; responden en
> `cupula-gcode.<accion>.response`. `archivo.preparado` solo se emite si `listo === true`.

## Reglas de negocio

1. **Moneda real multi-formato**: `archivo_stl`, `archivo_3mf` y `archivo_gcode` conviven en
   el ArchivoPreparado; un archivo puede llegar solo con el gcode listo, solo con el
   STL/3MF origen, o con ambos.
2. **`listo` por defecto**: `listo = input.listo === true || formato === 'GCODE'` — todo
   gcode ya es `listo`. Solo se emite `archivo.preparado` cuando `archivo.listo` es true.
3. **Reconciliar en vez de duplicar**: `_registrar` busca un ArchivoPreparado equivalente
   (mismo `modelo_id` + `formato` + mismo estado `listo`); si existe, **reconcilia** — hace
   merge de rutas/formatos/campos (`_mergeArchivo`) y **NO re-emite** `archivo.preparado`
   (`reconciliado:true`). Si no → crea (`201`) y emite `archivo.preparado`.
4. **Caché sin re-slicing**: `_reserva` devuelve solo los archivos `listo === true` y
   `!consumido`, ordenados por `preparado_en`, opcionalmente filtrados por `n` y excluyendo
   `excluir_ids`/`ya_encolados`. No prepara nada nuevo ni re-slicea lo ya listo.
5. **`_marcarConsumido`**: solo sobre un archivo existente (`404` + `failed` con
   `motivo:'archivo_no_encontrado'` si no); pone `consumido:true` y `consumido_en`, y lo
   retira de la futura reserva.
6. **`_listosParaImprimir`**: solo `listo === true` y `!consumido`, ordenados por
   `preparado_en`.
7. **Formato válido**: STL | 3MF | GCODE; otro → `422 FORMATO_NO_SOPORTADO` +
   `cupula-gcode.registrar.failed` con `motivo:'formato_no_soportado'`.
8. **CERO juicio**: no decide qué imprimir (dueño/cola); `gramos_est`/`tiempo_est` son
   los valores nominales de la preparación (la medición real vive en `historial`).
9. **Single-writer por proyecto**: `PosPersistencia` `cupula-gcode.json` en
   `/3d/cupula-gcode`, hidrata/restaura por `project_id`, `flush()` en `onUnload`.

## Uso / cómo invocarlo

RPCs request/response que responden en `*.response`:

### 1. `registrar` — registrar un archivo preparado

```json
{
  "project_id": "e57a318a-...",
  "modelo_id": "mod_xxx",
  "formato": "GCODE",
  "archivo": "/3d/cupula/soporte.gcode",
  "perfil": "std_v2",
  "gramos_est": 3.5,
  "tiempo_est": 7200,
  "listo": true
}
```
Respuesta `201`: `{ "archivo": {...}, "reconciliado": false }` + emite `archivo.preparado`.
Respuesta `200` (ya existía equivalente): `{ "archivo": {...}, "reconciliado": true }` (no re-emite).

### 2. `marcar_consumido` — retirar de la reserva tras imprimir

```json
{ "project_id": "e57a318a-...", "archivo_id": "arc_xxx" }
```
Respuesta `200`: `{ "archivo": {...consumido:true...} }` · `404` si no existe.

### 3. `listos` — archivos listos para imprimir

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`: `{ "archivos": [...], "total": N }`.

### 4. `reserva` — próxima tanda lista para la cola (cache, sin re-slicing)

```json
{ "project_id": "e57a318a-...", "n": 5, "excluir_ids": ["arc_yyy"] }
```
Respuesta `200`: `{ "reserva": [...], "total": N }`.

### 5. `obtener` — archivo por id

```json
{ "project_id": "e57a318a-...", "archivo_id": "arc_xxx" }
```
Respuesta `200`: `{ "archivo": {...} }` · `404 NOT_FOUND` si no existe.

## Tests

El test vive en `tests/unit/cupula-gcode.test.js`. Cubre:

- `registrar` GCODE listo → `201`, emite `archivo.preparado`.
- `registrar` STL/3MF origen (no listo) → `201`, **no** emite `archivo.preparado`.
- `registrar` con archivo equivalente (mismo modelo+formato+listo) → `reconciliado:true`,
  merge de rutas/formatos y **no** re-emite `archivo.preparado`.
- `registrar` formato no soportado → `422` + `failed` (`formato_no_soportado`).
- `marcar_consumido` ok → `200` con `consumido:true`; desconocido → `404` + `failed`.
- `listos` y `reserva` solo devuelven `listo && !consumido`, ordenados por `preparado_en`
  (y reserva filtra por `n`/`excluir_ids`).
- `obtener` ok → `200`; desconocido → `404`.
- Persistencia por proyecto (`project.activated` restaura; `onUnload` flush).

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/cupula-gcode
node tests/unit/cupula-gcode.test.js
# esperado: cupula-gcode: N/N OK
```

> En el runtime real esto corrió desde `/opt/enki/modules/cupula-gcode`; en este repo, el
> test se ejecuta desde `modules/cupula-gcode`.

## Notas de implementación

- Clase `CupulaGcodeReflejo extends ModuloHibridoReflejo`; `name = 'cupula-gcode'`,
  `version = 'reflejo-0.1.0'`.
- Store en `this.archivos` (`Map` `${project_id}:${id}` → ArchivoPreparado);
  `PosPersistencia` `cupula-gcode.json` en `/3d/cupula-gcode`.
- Handlers RPC de una línea que delegan en `_atender(e, accion, 'cupula-gcode.<accion>.response', fn)`.
- `_findPorModeloFormato(pid, modeloId, formato, listo)` localiza el archivo equivalente
  para reconciliar; `_mergeArchivo` añade rutas/formatos/campos nuevos.
- `_failed(op, ...)` publica `cupula-gcode.<op>.failed`; `_publicarEvento`/`eventBus.publish`
  añade `timestamp` ISO.
- Los `gramos_est`/`tiempo_est` son valores de preparación (nominales); la medición real del
  consumo/tiempo vive en `historial`.
