---
name: cola
description: >
  Skill FULL del módulo CUSTODIO `cola` del proyecto 3D (taller de impresión 3D, una
  impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Es EL CORAZÓN: la
  lista de impresión en cola (FIFO + urgencia) que mantiene la impresora única ocupada;
  únicamente propone la siguiente pieza con GCODE listo en la cúpula y marca estados.
  Úsala para operar, depurar o extender el custodio de la cola, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites encolar una pieza, reordenar la cola, marcar urgencia, cancelar,
    obtener la siguiente a imprimir o marcar IMPRIMIENDO/TERMINADA.
  - Cuando depures por qué no se encola una pieza con gcode listo, por qué no hay
    siguiente o por qué se rechaza una reordenación sin aprobación del dueño.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas
    de negocio del corazón de la cola de impresión.
  - Cuando vayas a escribir/ampliar el test unitario del custodio de la cola.
tags: [enki, modulo, custodio, impresora-3d, cola, fifo, urgencia, proyecto-3d, corazon]
---
# cola — CUSTODIO [CORAZÓN] de la lista de impresión 3D

## Qué hace el módulo

`cola` es un **CUSTODIO** (dueño del store y de la persistencia): es el **único
escritor** del store `tareas` por proyecto (vía `PosPersistencia`, directorio
`/3d/cola`, `cola.json`, single-file, scope project, single-writer). Es **EL CORAZÓN**
de la impresora única: la lista de impresión en cola (FIFO + urgencia) que mantiene la
impresora ocupada.

Guarda cada tarea con su `modelo_id`, `archivo_id`, `gcode_listo`, `urgente`, `orden`
(posición FIFO/reordenada), `estado` y marcas de tiempo. Solo **encola piezas cuyo
gcode ya está listo en la cúpula** (`gcode_listo === true`): no encola para re-slicear
(moneda real). **Una sola impresora a la vez** (nunca dos tareas en IMPRIMIENDO).

**CERO juicio**: la cola no decide SI imprimir ni el orden por su cuenta. El orden lo
**propone** `motor-propuesta` y lo aprueba el dueño; `_reordenar` solo aplica una
orden **YA aprobada** (`aprobada_by`). `_siguienteAImprimir` solo ofrece la cabecera
preparada; el ciclo de impresión (ciclo-impresion) es quien consume la siguiente.

Estado de tarea: `ENCOLADA → IMPRIMIENDO → TERMINADA | CANCELADA`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + lifecycle)

| Evento | Handler | Descripción |
|---|---|---|
| `cola.encolar.request` | `onEncolarRequest` | Encola una pieza (con gcode listo) al final de la lista. Emite `cola.actualizada`. |
| `cola.reordenar.request` | `onReordenarRequest` | Aplica una orden PROPUESTA ya aprobada por el dueño (jamás reordena por su cuenta). Emite `cola.actualizada`. |
| `cola.marcar_urgente.request` | `onMarcarUrgenteRequest` | Marca una tarea como urgente (la sube en prioridad). Emite `cola.actualizada`. |
| `cola.cancelar.request` | `onCancelarRequest` | Cancela una tarea encolada. Emite `cola.actualizada`. |
| `cola.siguiente.request` | `onSiguienteRequest` | Devuelve la siguiente pieza a imprimir: cabecera YA preparada en la cúpula; una sola impresora a la vez. |
| `cola.imprimiendo.request` | `onImprimiendoRequest` | Marca una tarea como IMPRIMIENDO (nunca dos a la vez). Emite `cola.actualizada`. |
| `cola.terminada.request` | `onTerminadaRequest` | Marca una tarea como TERMINADA tras la impresión. Emite `cola.actualizada`. |
| `project.activated` | `onProjectActivated` | Restaura el store del proyecto activado (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `cola.encolar.response` | Respuesta correlada: tarea encolada. |
| `cola.reordenar.response` | Respuesta correlada: orden aprobada aplicada. |
| `cola.marcar_urgente.response` | Respuesta correlada: tarea marcada urgente. |
| `cola.cancelar.response` | Respuesta correlada: tarea cancelada. |
| `cola.siguiente.response` | Respuesta correlada: siguiente pieza a imprimir (o NULO si nada listo). |
| `cola.imprimiendo.response` | Respuesta correlada: tarea marcada IMPRIMIENDO. |
| `cola.terminada.response` | Respuesta correlada: tarea marcada TERMINADA. |
| `cola.actualizada` | Mutación de orden/estado de la cola (repinta paneles). |
| `cola.encolar.failed` | Par de fallo: no se pudo encolar. |
| `cola.cancelar.failed` | Par de fallo: no se pudo cancelar. |

> Nota: el par de fallo `cola.imprimiendo.failed` se emite en runtime (impresora ocupada /
> estado inválido) aunque el `module.json` declara explícitamente solo `cola.encolar.failed`
> y `cola.cancelar.failed`.

> **Regla de cierre de círculo**: todo flujo cierra su círculo con su par de fallo
> canónico. Nadie da por hecho una mutación sin `ok:true`/respuesta correlada.

## Reglas de negocio

1. **MONEDA REAL — solo se encola con GCODE listo**: `_encolar` exige `modelo_id` y
   `archivo_id`; `gcode_listo` por defecto es `true` (viene de la reserva de
   `cupula-gcode`). No encola para re-slicear.
2. **Una sola impresora a la vez**: nunca dos tareas en IMPRIMIENDO. Si `enImpresion`
   está ocupado, `_siguienteAImprimir` devuelve `{ siguiente: null, razon:
   'impresora_ocupada' }` y `_marcarImprimiendo` de otra tarea → `409 ESTADO_ILEGAL`
   (`impresora_ocupada`).
3. **`_reordenar` SOLO aplica una orden aprobada por el dueño (cero juicio)**: exige
   `orden` (array de `{ id, urgente? }`) y `aprobada_by`/`decisión`/`origen`; sin el
   decisor humano → `409 PROPUESTA_NO_APROBADA` + `cola.reordenar.failed`. La cola
   jamás reordena por su cuenta. Las no mencionadas quedan después del bloque aprobado
   conservando su orden relativo.
4. **Prioridad**: `_cmpPrioridad` ordena URGENTE primero, luego posición explícita
   (`orden`; si no, `encolada_en`). El orden FIFO por defecto lo reasigna la orden
   aprobada.
5. **No se cancela una pieza en IMPRIMIENDO**: `_cancelar` sobre una tarea IMPRIMIENDO
   → `409 ESTADO_ILEGAL` (`no_se_cancela_en_impresion`); abortar va por ciclo-impresion.
6. **`_marcarImprimiendo`**: ENCOLADA → IMPRIMIENDO (nunca desde TERMINADA/CANCELADA →
   `409`). Marca `enImpresion` por proyecto.
7. **`_marcarTerminada`**: IMPRIMIENDO → TERMINADA y libera la impresora
   (`enImpresion = null`). La cola no decide encadenar (eso lo hace
   motor-encadenamiento).
8. **Single-writer por proyecto**: `PosPersistencia` con `concurrency: single-writer`,
   persiste `cola.json` bajo `/3d/cola`, restaura en `project.activated` y hace
   `flush()` en `onUnload`.

## Uso / cómo invocarlo

Los consumidores típicos son `ciclo-impresion` (encola/imprimiendo/terminada),
`motor-encadenamiento` (cola.terminada / cola.siguiente) y los paneles de rol
(control/visión). RPCs request/response que responden en `*.response`:

### 1. `encolar` — encolar una pieza con gcode listo

```json
{
  "project_id": "e57a318a-...",
  "modelo_id": "mod_soporte",
  "archivo_id": "arch_soporte_1",
  "gcode_listo": true
}
```
Respuesta `201`: `{ "tarea": {...}, "total": N }` · `400` si falta `project_id` /
`modelo_id` / `archivo_id`. Emite `cola.actualizada`.

### 2. `reordenar` — aplicar una orden YA aprobada por el dueño

```json
{
  "project_id": "e57a318a-...",
  "orden": [ { "id": "tarea_a", "urgente": true }, { "id": "tarea_b" } ],
  "aprobada_by": "jefe"
}
```
Respuesta `200`: `{ "total": N, "orden": [...ids] }` · `409 PROPUESTA_NO_APROBADA` sin decisor.

### 3. `marcar_urgente` / `cancelar` / `imprimiendo` / `terminada` / `siguiente`

Todos toman `{ project_id, id|tarea_id }` (marcar_urgente admite `urgente: bool`) y
responden `200` con la tarea actualizada; `cancelar` de una en IMPRIMIENDO → `409`.
`siguiente` responde `200` con `{ siguiente: {...} | null, razon: 'listo'|'cola_vacia'|
'impresora_ocupada' }`.

## Tests

El test vive en `tests/unit/cola.test.js`. Cubre (del código real):

- `encolar` crea tarea ENCOLADA con orden FIFO (`201`) y emite `cola.actualizada`.
- `encolar` sin `project_id` / `modelo_id` / `archivo_id` → `400 INVALID_INPUT`.
- `reordenar` sin `aprobada_by` → `409 PROPUESTA_NO_APROBADA` + `cola.reordenar.failed`.
- `reordenar` con decisor aplica el orden y deja no mencionadas detrás.
- `marcar_urgente` sube prioridad (URGENTE primero en `siguiente`).
- `cancelar` marca CANCELADA; cancelar una en IMPRIMIENDO → `409`.
- `siguiente` respeta una sola impresora (`impresora_ocupada`) y solo gcode listo.
- `imprimiendo` marca IMPRIMIENDO; segundo `imprimiendo` → `409 ESTADO_ILEGAL`.
- `terminada` marca TERMINADA y libera `enImpresion`.
- Persistencia por proyecto: `project.activated` restaura y `onUnload` hace flush.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/cola
node tests/unit/cola.test.js
# esperado: cola: N/N OK
```

## Notas de implementación

- Clase `ColaReflejo extends ModuloHibridoReflejo`; `name = 'cola'`, `version =
  'reflejo-0.1.0'`; FASE 4 TANDA 3.
- Store `this.tareas` (`Map` `${project_id}:${id}` → tarea), `this.enImpresion`
  (`Map` `${project_id}` → tarea_id|null) y `this._contadorOrden` (`Map` `${project_id}` → posición).
- `PosPersistencia` `cola.json` en `/3d/cola`, snapshot/hidratar por proyecto.
- Handlers RPC de una línea que delegan en `_atender(e, accion, 'cola.<accion>.response', fn)`.
- `_publicarActualizada` emite `cola.actualizada` en cada mutación con
  `correlation_id` + `timestamp`.
- Dependencias (module.json): `_shared/pos-persistencia`, `cupula-gcode`, `motor-propuesta`.
