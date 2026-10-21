---
name: consumo
description: >
  Skill FULL del módulo REFLEJO `consumo` del proyecto 3D (taller de impresión 3D,
  una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Calcula el consumo
  y el tiempo estimado de impresión usando dato MEDIDO del historial (promedio/pronóstico),
  nunca estimación sin muestra: si un modelo no tiene registros medidos, el promedio
  devuelve NULO (no conjetura). Úsala para operar, depurar o extender el reflejo de
  consumo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el promedio de gramos/tiempo de un modelo desde su dato medido, o el
    pronóstico de consumo/tiempo de una tanda completa.
  - Cuando depures por qué un promedio devuelve NULO (sin muestras medidas), por qué un
    pronóstico queda pendiente o por qué no se acumulan muestras de impresion.registrada.
  - Cuando quieras entender el contrato de eventos (subscribes: consumo.promedio /
    consumo.pronostico, y consume impresion.registrada) y las reglas CERO estimación.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo de consumo.
tags: [enki, modulo, reflejo, impresora-3d, consumo, pronostico, proyecto-3d]
---

# consumo — REFLEJO de consumo y tiempo estimado del taller 3D

## Qué hace el módulo

`consumo` es un **REFLEJO puro** (pieza 13): **sin store propio persistente y sin
`project.activated`**. Calcula el consumo/tiempo estimado de impresión usando **dato
MEDIDO** del historial (promedio/pronóstico), nunca estimación sin muestra.

Consume el evento **fire-and-forget** `impresion.registrada` (del historial) para acumular
las muestras **en memoria** (`Map` `${project_id}:${modelo_id}` → `{ gramos: [], tiempos: [] }`).

**CERO estimación sin muestras**: si un modelo no tiene registros medidos en el historial,
el promedio devuelve **NULO** (no conjetura). Lo no medido queda [ABIERTO] (se pregunta al
dueño).

## Flujo típico

Caso real: **acumular las impresiones medidas → consultar el promedio de un modelo → pronosticar una tanda**.

1. Cada vez que `historial` registra una impresión emite `impresion.registrada`; `consumo` lo consume (fire-and-forget) y acumula la muestra MEDIDA en memoria (`Map` `${project_id}:${modelo_id}` → `{ gramos: [], tiempos: [] }`). Sin dato medido no acumula nada.
2. El jefe/panel pide `consumo.promedio.request` `{ project_id, modelo_id }` → `_consumoPromedio` devuelve `{ muestras, gramos_promedio, tiempo_promedio_s, estimacion }`. Sin muestras → promedios `null` y `estimacion: 'NULO'` (CERO conjetura).
3. Para decidir si imprimir una tanda, `consumo.pronostico.request` `{ project_id, modelos: [{ modelo_id, veces }] }` suma `promedio * veces` por modelo.
4. Un modelo sin dato medido queda `pendiente: true` y el `total` global es `null` (`completo:false`): CERO estimación — se pregunta al dueño (ABIERTO). Solo si TODOS median se entrega el `total`.
5. `promedio`/`pronostico` validan `project_id` (+`modelo_id`/array no vacío); si no → `400` + `consumo.<accion>.failed`.

Cada flujo cierra su círculo en `consumo.<accion>.response`; el módulo no publica eventos de dominio propios (calculador puro que acumula `impresion.registrada` y responde).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + fire-and-forget)

| Evento | Handler | Descripción |
|---|---|---|
| `consumo.promedio.request` | `onPromedioRequest` | Promedio de consumo/tiempo MEDIDO de un modelo desde el historial. Sin muestras → NULO (CERO estimación). |
| `consumo.pronostico.request` | `onPronosticoRequest` | Pronóstico de una tanda: suma de promedios medidos reales; hueco sin muestra → NULO o pregunta al dueño (ABIERTO). |
| `impresion.registrada` | `onImpresionRegistrada` | Acumula la muestra medida (gramos_real, tiempo_real) por modelo. No persiste (reflejo puro) ni decide. |

### Publishes

| Evento | Descripción |
|---|---|
| `consumo.promedio.response` | Respuesta correlada: `{ promedio }` del modelo (o NULO sin muestras). |
| `consumo.pronostico.response` | Respuesta correlada: pronóstico de la tanda. |
| `consumo.promedio.failed` | Par de fallo: no se pudo calcular el promedio. |
| `consumo.pronostico.failed` | Par de fallo: no se pudo calcular el pronóstico. |

> **Regla de cierre de círculo**: los pares de fallo canónicos son `consumo.promedio.failed`
> y `consumo.pronostico.failed`; responden en `consumo.<accion>.response`. El módulo no
> publica eventos de dominio propios: es un calculador puro que responde y consume
> `impresion.registrada`.

## Reglas de negocio

1. **CERO estimación sin dato MEDIDO**: `_consumoPromedio` — si un modelo no tiene muestras
   medidas (`gramos` y `tiempos` vacíos), devuelve `gramos_promedio: null` y
   `tiempo_promedio_s: null` con `estimacion: 'NULO'`. Si al menos hay una muestra,
   `estimacion: 'medida'` y los promedios se redondean.
2. **Dato real solo del historial**: las muestras provienen de `impresion.registrada`
   (`gramos_reales`, `tiempo_real`; acepta también `gramos`/`tiempo` como alias). Si el
   evento no trae ni gramo ni tiempo medidos, no acumula nada.
3. **`_pronosticoTanda`**: por cada modelo de la tanda suma `promedio * veces`. Un modelo sin
   dato medido → `pendiente: true`, `gramos_estimados: null`, `tiempo_estimado_s: null`. El
   **total solo se entrega si TODOS mieden** (`pendientes === 0`); si hay hueco, el `total`
   es `null` y `completo: false` (CERO conjetura; se pregunta al dueño, ABIERTO).
4. **Promedio por modelo**: `_promedioGramos`/`_tiempoPromedio` filtran NaNs; sin muestras →
   `null`.
5. **Validación de entrada**: `promedio` exige `project_id` y `modelo_id`; `pronostico`
   exige `project_id` y un array `modelos`/`items` no vacío — si no → `400 INVALID_INPUT` +
   par de fallo.
6. **Reflejo puro**: sin store persistente, sin `project.activated`, sin PosPersistencia; el
   estado son las muestras en memoria.

## Uso / cómo invocarlo

### 1. `promedio` — promedio de consumo/tiempo de un modelo (dato medido)

```json
{ "project_id": "e57a318a-...", "modelo_id": "mod_xxx" }
```
Respuesta `200`:
```json
{
  "modelo_id": "mod_xxx",
  "muestras": { "gramos": 3, "tiempos": 3 },
  "gramos_promedio": 3.42,
  "tiempo_promedio_s": 7050.5,
  "estimacion": "medida"
}
```
Sin muestras → `gramos_promedio: null`, `tiempo_promedio_s: null`, `estimacion: 'NULO'`.

### 2. `pronostico` — pronóstico de una tanda

```json
{
  "project_id": "e57a318a-...",
  "modelos": [
    { "modelo_id": "mod_xxx", "veces": 2 },
    { "modelo_id": "mod_sin_muestra", "veces": 1 }
  ]
}
```
Respuesta `200`:
```json
{
  "detalle": [
    { "posicion": 0, "modelo_id": "mod_xxx", "veces": 2, "gramos_estimados": 6.84, "tiempo_estimado_s": 14101, "pendiente": false },
    { "posicion": 1, "modelo_id": "mod_sin_muestra", "veces": 1, "gramos_estimados": null, "tiempo_estimado_s": null, "pendiente": true }
  ],
  "muestras_ok": 1,
  "pendientes": 1,
  "total": null,
  "completo": false
}
```
> Como un modelo no media, el total es `null` (CERO estimación; se pregunta al dueño).

## Tests

El test vive en `tests/unit/consumo.test.js`. Cubre:

- `promedio` con muestras medidas → `200` con `gramos_promedio`/`tiempo_promedio_s`
  redondeados y `estimacion:'medida'`.
- `promedio` sin muestras del modelo → `200` con promedios `null` y `estimacion:'NULO'`.
- `promedio` sin `project_id` / sin `modelo_id` → `400`.
- `pronostico` con todos medidos → `total` entregado y `completo:true`; con hueco sin
  muestra → `pendientes>0`, `total:null`, `completo:false`.
- Acumulación: `impresion.registrada` suma muestras por `project_id:modelo_id`; evento sin
  dato medido no acumula.
- Reflejo puro: sin store persistente, no depende de `project.activated`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/consumo
node tests/unit/consumo.test.js
# esperado: consumo: N/N OK
```

> En el runtime real esto corrió desde `/opt/enki/modules/consumo`; en este repo, el test se
> ejecuta desde `modules/consumo`.

## Notas de implementación

- Clase `ConsumoReflejo extends ModuloHibridoReflejo`; `name = 'consumo'`,
  `version = 'reflejo-0.1.0'`.
- `this._muestras` es un `Map` `${project_id}:${modelo_id}` → `{ gramos: [], tiempos: [] }`;
  se alimenta en `onImpresionRegistrada`.
- Handlers RPC de una línea que delegan en `_atender(e, accion, 'consumo.<accion>.response', fn)`.
- `_promedioGramos`/`_tiempoPromedio`/`_round` son helpers internos de matemática (lógica de
  negocio DENTRO del módulo).
- DEP: `historial` (media de dato MEDIDO) y `filamento` (consumo informa al stock).
