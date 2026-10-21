---
name: panel-jefe
description: >
  Skill FULL del módulo REFLEJO `panel-jefe` del proyecto 3D (taller de impresión 3D,
  una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Es la cara
  AGREGADA del jefe (rol FUTURO): visión de conjunto cruzando los stores (impresión
  actual + cola + filamento + consumo/eficiencia + historial) y acciones que DELEGAN
  (aprobar propuesta, marcar prioridad, pedir reposición, ver detalle). CERO juicio.
  Úsala para operar, depurar o extender el panel del jefe, o para entender su contrato
  de eventos y sus reglas.
when-to-use: >
  - Cuando el jefe necesite la visión de conjunto del taller y tomar decisiones de
    FUTURO (aprobar una propuesta de orden, marcar prioridad, pedir reposición, ver
    detalle de un modelo).
  - Cuando depures por qué no se cruza un store, por qué una aprobación no reordena o
    por qué la propuesta no llega.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas
    del panel del jefe (rol FUTURO, proyección + delegación, CERO juicio).
  - Cuando vayas a escribir/ampliar el test unitario del panel del jefe.
tags: [enki, modulo, reflejo, impresora-3d, panel-jefe, rol-futuro, agregado, proyecto-3d]
---
# panel-jefe — REFLEJO del rol FUTURO (cara agregada del jefe)

## Qué hace el módulo

`panel-jefe` es un **REFLEJO puro** (sin store propio, sin persistencia) y la cara
**AGREGADA del jefe** (rol FUTURO). Expone la visión de conjunto cruzando los stores
por **proyección** (CERO juicio) y acciones para el FUTURO que **DELEGAN**:

- **`_resumen`**: impresión actual + cola + filamento + consumo/eficiencia + historial
  (cruza por RPC, best-effort; huecos → `desconocido`, nunca inventado).
- **`_propuestas`**: orden propuesta (`motor-propuesta.proponer`) — **PROPUESTA ≠ DECISIÓN**.
- **`_aprobarPropuesta`**: el jefe aprueba → `cola.reordenar` SOLO con decisión humana.
- **`_marcarPrioridad`**: el jefe marca urgencia (`cola.marcar_urgente`).
- **`_pedirReposicion`**: pide reposición de filamento (`adaptador-confirmacion`).
- **`_verDetalle`**: detalle de un modelo (`catalogo.por_id` / `cupula-gcode.obtener`).

Se **repinta** con `cola.actualizada | pieza.imprimida | impresion.registrada |
material.actualizado` (fire-and-forget, no muta; el panel es de solo lectura). **CERO
juicio**: el sistema proyecta y transporta; el jefe decide. Cliente nulo.

## Flujo típico

Caso real: **abrir el resumen del taller → ver la propuesta de orden → aprobar la propuesta (decisión humana)**.

1. El jefe abre el panel y pide `panel-jefe.resumen.request`; `_resumen` cruza por RPC (`Promise.all`): `ciclo-impresion.estado`, `cola.siguiente`, `filamento.evaluar`, `consumo.promedio`, `historial.recientes`. Cada hueco sin respuesta 200 → `desconocido`/`[]` (nunca se inventa).
2. Pide `panel-jefe.propuestas.request` → `_propuestas` delega en `motor-propuesta.proponer` y responde `{ propuesta: true, orden, total, nota }` (PROPUESTA ≠ DECISIÓN; no muta la cola).
3. El jefe aprueba llamando `panel-jefe.aprobar_propuesta.request` con `{ orden, aprobada_by }` → `_aprobarPropuesta` delega en `cola.reordenar` con la marca de decisión humana y responde `{ aprobada: true, por, orden, total }`.
4. `_marcar_prioridad` marca urgencia (delega `cola.marcar_urgente`); `_pedir_reposicion` pide filamento (delega `adaptador-confirmacion.confirmar`); `_ver_detalle` cruza `catalogo.por_id` / `cupula-gcode.obtener`.
5. El panel se mantiene al día **repintándose** con `cola.actualizada | pieza.imprimida | impresion.registrada | material.actualizado` (fire-and-forget, solo lectura; no muta).

Cada flujo cierra su círculo en `panel-jefe.<accion>.response` y ante fallo publica su par `panel-jefe.*.failed` (ver notas del contrato).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + repintado fire-and-forget)

| Evento | Handler | Descripción |
|---|---|---|
| `panel-jefe.resumen.request` | `onResumenRequest` | Visión de conjunto agregada: impresión actual + cola + filamento + consumo/eficiencia + historial (cruza stores por RPC). |
| `panel-jefe.propuestas.request` | `onPropuestasRequest` | Propuesta de orden de la cola (motor-propuesta.proponer); PROPUESTA, no decisión. |
| `panel-jefe.aprobar_propuesta.request` | `onAprobarPropuestaRequest` | El jefe aprueba una propuesta → cola.reordenar (decisión humana; el sistema transporta). |
| `panel-jefe.marcar_prioridad.request` | `onMarcarPrioridadRequest` | El jefe marca urgencia/prioridad de una tarea (cola.marcar_urgente). |
| `panel-jefe.pedir_reposicion.request` | `onPedirReposicionRequest` | El jefe pide reposición de filamento (pedir por adaptador-confirmacion). |
| `panel-jefe.ver_detalle.request` | `onVerDetalleRequest` | Detalle de un modelo (catalogo.por_id / cupula-gcode.obtener). |
| `cola.actualizada` | `onColaActualizada` | (repintado fire-and-forget) no muta; log de repintado. |
| `pieza.imprimida` | `onPiezaImprimida` | (repintado fire-and-forget) no muta; log de repintado. |
| `impresion.registrada` | `onImpresionRegistrada` | (repintado fire-and-forget) no muta; log de repintado. |
| `material.actualizado` | `onMaterialActualizado` | (repintado fire-and-forget) no muta; log de repintado. |

> Nota: los repintados (`cola.actualizada`, `pieza.imprimida`, `impresion.registrada`,
> `material.actualizado`) son fire-and-forget que el index.js escucha sin mutar; no están
> en el `module.json` de panel-jefe (son eventos de otros módulos que el panel observa).

> Nota: además de `panel-jefe.aprobar_propuesta.failed`, el `index.js` también emite pares
> `panel-jefe.*.failed` sub-declarados en runtime vía `_failed(op, ...)`: `panel-jefe.propuestas.failed`
> (fallo de `motor-propuesta.proponer`), `panel-jefe.marcar_prioridad.failed` (fallo de
> `cola.marcar_urgente`) y `panel-jefe.pedir_reposicion.failed` (fallo de `adaptador-confirmacion.confirmar`).
> Ninguno consta en el `module.json`, pero sí los publica el `index.js`.

### Publishes

| Evento | Descripción |
|---|---|
| `panel-jefe.resumen.response` | Respuesta correlada: visión de conjunto. |
| `panel-jefe.aprobar_propuesta.failed` | Par de fallo: no se pudo aprobar/reordenar la propuesta. |

> Nota: los demás `.response` por op se devuelven correlados; `module.json` declara
> explícitamente `resumen.response` y `panel-jefe.aprobar_propuesta.failed`. En runtime
> `_failed(op, ...)` también emite `panel-jefe.<op>.failed` genérico ante fallos de
> propuestas/marcar_prioridad/pedir_reposicion/ver_detalle.

> **Regla de cierre de círculo**: toda decisión transportada cierra su círculo con su
> par de fallo (`panel-jefe.*.failed`); el sistema nunca reordena sin la aprobación del
> jefe.

## Reglas de negocio

1. **Cara agregada del rol FUTURO**: visión de conjunto + acciones de futuro; CERO
   juicio (proyecta y transporta, el jefe decide). Cliente nulo.
2. **`_aprobarPropuesta` exige decisión humana**: delega en `cola.reordenar` SOLO con
   `aprobada_by`/`jefe`/`decisión` (default `'panel-jefe'`). Propuesta ≠ decisión; la
   cola no reordena sola.
3. **`_propuestas` es PROPUESTA, no muta**: delega en `motor-propuesta.proponer` y
   responde con `propuesta: true`; no reordena la cola.
4. **Lectura best-effort, dato ausente → 'desconocido'** (nunca inventado): `_resumen`
   cruza ciclo/cola/filamento/consumo/historial por Promise.all; si un RPC no responde
   200 → hueco `desconocido`/`[]`.
5. **Repintado por fire-and-forget**: escucha `cola.actualizada | pieza.imprimida |
   impresion.registrada | material.actualizado` solo para log; no muta estado.
6. **Reflejo puro**: sin store propio, sin persistencia; solo proyección (lee por RPC)
   y delegación de decisiones.

## Uso / cómo invocarlo

Consumidos por la UI del puesto de jefe. RPCs request/response:

### 1. `resumen` — visión de conjunto agregada

```json
{ "project_id": "e57a318a-...", "n": 10, "modelo_filtro": null }
```
Respuesta `200`: `{ impresion_actual, cola, filamento, consumo, historial, repintado_por, timestamp }`.

### 2. `propuestas` — propuesta de orden de la cola

```json
{ "project_id": "e57a318a-...", "tareas": [...] }
```
Respuesta `200`: `{ propuesta: true, orden: [...], total, nota }` (NO muta la cola).

### 3. `aprobar_propuesta` — el jefe aprueba (decisión humana)

```json
{
  "project_id": "e57a318a-...",
  "orden": [ { "id": "tarea_a", "urgente": true }, { "id": "tarea_b" } ],
  "aprobada_by": "jefe"
}
```
Respuesta `200`: `{ aprobada: true, por: "jefe", orden: [...], total: N }` · `400` sin `orden`.

### 4. `marcar_prioridad` / `pedir_reposicion` / `ver_detalle`

```json
{ "project_id": "e57a318a-...", "id": "tarea_a", "urgente": true }
```
`marcar_prioridad` → `{ marcada: true, tarea }` (cola.marcar_urgente) · `pedir_reposicion`
→ `{ pedida: true, confirmacion_id }` (adaptador-confirmacion) · `ver_detalle` →
`{ modelo, archivo }` (catalogo.por_id / cupula-gcode.obtener).

## Tests

El test vive en `tests/unit/panel-jefe.test.js`. Cubre (del código real):

- `resumen` cruza impresión actual + cola + filamento + consumo + historial (best-effort).
- `propuestas` delega en `motor-propuesta.proponer` y marca `propuesta: true`.
- `aprobar_propuesta` delega en `cola.reordenar` con `aprobada_by`; sin `orden` → `400`.
- `marcar_prioridad` delega en `cola.marcar_urgente`.
- `pedir_reposicion` delega en `adaptador-confirmacion.confirmar`.
- `ver_detalle` cruza `catalogo.por_id` / `cupula-gcode.obtener`.
- Repintado fire-and-forget: escucha los 4 eventos sin mutar.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/panel-jefe
node tests/unit/panel-jefe.test.js
# esperado: panel-jefe: N/N OK
```

## Notas de implementación

- Clase `PanelJefeReflejo extends ModuloHibridoReflejo`; `name = 'panel-jefe'`,
  `version = 'reflejo-0.1.0'`; FASE 4 TANDA 4 (última).
- Sin store ni persistencia; solo proyección de lectura por RPC (`_rpc`) y delegación de
  decisiones de futuro.
- Repintado por fire-and-forget (`onColaActualizada`, `onPiezaImprimida`,
  `onImpresionRegistrada`, `onMaterialActualizado`) que solo loguean, no mutan.
- Handlers RPC de una línea que delegan en `_atender(e, accion, 'panel-jefe.<accion>.response', fn)`.
- Dependencias (module.json): `cola`, `ciclo-impresion`, `filamento`, `historial`,
  `cupula-gcode`, `consumo`, `motor-propuesta`, `adaptador-confirmacion`.
