---
name: catalogo
description: >
  Skill FULL del módulo CUSTODIO `catalogo` del proyecto 3D (taller de impresión 3D,
  una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Custodia la
  biblioteca de piezas del taller: ficha de cada modelo físico útil de la moneda real
  (STL/3MF/GCODE conviven como archivos distintos, archivo_stl/archivo_3mf/archivo_gcode).
  Úsala para operar, depurar o extender el custodio del catálogo, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites registrar, consultar por id, actualizar o listar las fichas de modelos
    del catálogo de piezas del taller 3D.
  - Cuando depures por qué un modelo se duplica, no se reconcilia o falta un formato
    (archivo_stl / archivo_3mf / archivo_gcode).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas de
    negocio de la biblioteca de piezas.
  - Cuando vayas a escribir/ampliar el test unitario del custodio del catálogo.
tags: [enki, modulo, custodio, impresora-3d, catalogo, biblioteca, proyecto-3d]
---

# catalogo — CUSTODIO de la biblioteca de piezas del taller 3D

## Qué hace el módulo

`catalogo` es un **CUSTODIO** (dueño del store y de la persistencia): es el **único
escritor** del store `modelos` por proyecto (vía `PosPersistencia`, directorio
`/3d/catalogo`, `catalogo.json`, single-file, scope project, single-writer).

Guarda la **ficha** de cada modelo físico útil de la **moneda real** del taller. Los tres
formatos **conviven como archivos distintos** — la ficha tiene `archivo_stl`,
`archivo_3mf` y `archivo_gcode` por separado, nunca solo `.3mf` (ley de la moneda).

Es un **CUSTODIO sin juicio**: las decisiones del dueño (uso, filamento sugerido, aprobar)
no se automatizan; este módulo solo custodia la ficha. El **rol CLIENTE es NULO** (uso
propio, sin venta).

La clave de identidad canónica es `nombre canónico + fuente + origenUrl` (ABIERTO
identidad). **Reconcilia ANTES de crear**: si existe una ficha equivalente, **no duplica**,
devuelve la existente y, si aporta formatos/rutas nuevos, los **añade** a la ficha.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `catalogo.registrar.request` | `onRegistrarRequest` | Registra un modelo nuevo: reconcilia antes de crear (nombre+fuente+origenUrl, no duplica). Emite `modelo.registrado`. |
| `catalogo.por_id.request` | `onPorIdRequest` | Obtiene una ficha de modelo por id. |
| `catalogo.actualizar.request` | `onActualizarRequest` | Edita una ficha existente (merge; no re-crea). Emite `modelo.registrado`. |
| `catalogo.listar.request` | `onListarRequest` | Lista las fichas del proyecto ordenadas por nombre. |
| `project.activated` | `onProjectActivated` | Restaura el store del proyecto activado (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `catalogo.registrar.response` | Respuesta correlada: modelo creado o reconciliado. |
| `catalogo.por_id.response` | Respuesta correlada: ficha del modelo o 404. |
| `catalogo.actualizar.response` | Respuesta correlada: ficha actualizada. |
| `catalogo.listar.response` | Respuesta correlada: lista de modelos. |
| `modelo.registrado` | Ficha nueva o actualizada (reconciliada) del catálogo. |
| `catalogo.registrar.failed` | Par de fallo: no se pudo registrar. |
| `catalogo.actualizar.failed` | Par de fallo: no se pudo actualizar. |

> **Regla de cierre de círculo**: todo flujo cierra su círculo con su par de fallo
> canónico (`*.failed` responde en `*.response`). El `module.json` real declara los pares de
> fallo `catalogo.registrar.failed` y `catalogo.actualizar.failed`.

## Reglas de negocio

1. **Moneda real multi-formato — los 3 formatos conviven**: `archivo_stl`, `archivo_3mf`
   y `archivo_gcode` son campos distintos de la ficha; `formato_dispon` se deriva de los
   `archivo_<formato>` presentes. NUNCA solo `.3mf`.
2. **Reconciliar antes de crear (no duplicar)**: la identidad canónica es `nombre canónico
   + fuente + origenUrl`. Si existe una ficha equivalente (mismo nombre canónico, fuente y
   origenUrl), `_registrar` **no crea**: devuelve la existente con `reconciliado:true,
   duplicado:true`, y si aporta `archivo_*` nuevos los **mergea** en la misma ficha
   (`_mergeFormato`).
3. **Nombre canónico**: `_canonico` = trim + toLowerCase + normaliza espacios múltiples;
   se usa como base de identidad.
4. **Fuentes válidas**: `DISEÑADO | REPOSITORIO | ARCHIVO`; si la fuente no está en la lista
   se usa `ARCHIVO`.
5. **`_actualizar` es merge, no re-crea**: actualiza campos editables (`uso`,
   `filamento_sug`, `archivo_*`, `fuente`, `origenUrl`); recalcula `formato_dispon` cuando
   toca un `archivo_*`. Si la ficha no existe → 404.
6. **CERO juicio**: uso / filamento / aprobación son decisión del dueño; el custodia no los
   automatiza.
7. **Single-writer por proyecto**: `PosPersistencia` con `concurrency: single-writer`,
   persiste en `catalogo.json` bajo `/3d/catalogo`, hidrata y restaura por `project_id`
   en `project.activated`, y hace `flush()` en `onUnload`.

## Uso / cómo invocarlo

El consumidor típico es `importacion` (registra modelos por RPC) y los paneles de rol.
RPCs request/response que responden en `*.response`:

### 1. `registrar` — fichar un modelo (reconcilia antes de crear)

```json
{
  "project_id": "e57a318a-...",
  "nombre": "soporte extrusor",
  "uso": "sujetar el extrusor a la mesa",
  "fuente": "DISEÑADO",
  "archivo_3mf": "/3d/origenes/soporte-extrusor.3mf",
  "archivo_gcode": "/3d/cupula/soporte-extrusor.gcode"
}
```

Respuesta `201` (nueva): `{ "modelo": {...}, "reconciliado": false }`
Respuesta `200` (ya existía, se mergeó): `{ "modelo": {...}, "reconciliado": true, "duplicado": true }`
En ambos casos se emite `modelo.registrado`.

### 2. `por_id` — obtener una ficha

```json
{ "project_id": "e57a318a-...", "modelo_id": "mod_xxx" }
```
Respuesta `200`: `{ "modelo": {...} }` · `404 NOT_FOUND` si no existe.

### 3. `actualizar` — editar campos de una ficha existente (merge)

```json
{ "project_id": "e57a318a-...", "modelo_id": "mod_xxx", "uso": "soporte revisado", "archivo_gcode": "/3d/cupula/soporte-v2.gcode" }
```
Respuesta `200`: `{ "modelo": {...} }` · `404 NOT_FOUND` si no existe. Emite `modelo.registrado`.

### 4. `listar` — todas las fichas del proyecto, ordenadas por nombre

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`: `{ "modelos": [ ... ], "total": N }`.

## Tests

El test vive en `tests/unit/catalogo.test.js`. Cubre:

- `registrar` crea ficha nueva (`201`, `reconciliado:false`) y emite `modelo.registrado`.
- `registrar` con ficha equivalente (mismo nombre canónico + fuente + origenUrl) **no
  duplica**: devuelve `reconciliado:true` y mergea formatos/rutas nuevos.
- `registrar` sin `project_id` / sin `nombre` → `400 INVALID_INPUT`.
- `por_id` ok → `200`; desconocido → `404 NOT_FOUND`.
- `listar` devuelve ordenado por nombre.
- `actualizar` mergea campos (uso, filamento_sug, archivo_*), recalcula `formato_dispon`,
  emite `modelo.registrado`; id desconocido → 404.
- Persistencia por proyecto: `project.activated` restaura el store y `onUnload` hace flush.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/catalogo
node tests/unit/catalogo.test.js
# esperado: catalogo: N/N OK
```

> En el runtime real esto corrió desde `/opt/enki/modules/catalogo`; en este repo, el test
> se ejecuta desde `modules/catalogo`.

## Notas de implementación

- Clase `CatalogoReflejo extends ModuloHibridoReflejo`; `name = 'catalogo'`,
  `version = 'reflejo-0.1.0'`.
- Store en `this.modelos` (`Map` `${project_id}:${id}` → modelo); `PosPersistencia`
  `catalogo.json` en `/3d/catalogo`, snapshot/hidratar por proyecto.
- Handlers RPC de una línea que delegan en `_atender(e, accion, 'catalogo.<accion>.response', fn)`.
- `_registrar` usa `_mergeFormato` (añade `archivo_*` a ficha existente) y `_formatosDe`
  (deriva `formato_dispon` desde los `archivo_<formato>` presentes).
- `_publicarEvento` / `eventBus.publish` añade `timestamp` ISO a los eventos publicados.
