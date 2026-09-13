---
name: motor-propuesta
description: >
  Skill FULL del módulo REFLEJO `motor-propuesta` del proyecto 3D (taller de impresión
  3D, una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Ordena la
  cola (FIFO + urgencia + preferencia a preparadas + agrupación por afinidad ABIERTO)
  y PROPONE al dueño la próxima tanda; NO decide solo. Úsala para operar, depurar o
  extender el motor de propuesta, o para entender su contrato de eventos y sus reglas.
when-to-use: >
  - Cuando necesites obtener una propuesta de orden de la cola de impresión para que
    el jefe la apruebe (aprobar vía cola.reordenar).
  - Cuando depures por qué el orden propuesto no respeta urgencia / antigüedad /
    preferencia a piezas preparadas.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas
    de negocio del motor de propuesta (PROPUESTA ≠ DECISIÓN).
  - Cuando vayas a escribir/ampliar el test unitario del motor de propuesta.
tags: [enki, modulo, reflejo, impresora-3d, motor-propuesta, orden, propuesta, proyecto-3d]
---
# motor-propuesta — REFLEJO que PROPONE el orden de la cola 3D

## Qué hace el módulo

`motor-propuesta` es un **REFLEJO puro** (sin store propio, sin persistencia, sin
`project.activated`): ordena la cola de impresión (FIFO + urgencia + preferencia a las
piezas ya preparadas + agrupación por afinidad **ABIERTO**) y **PROPONE al dueño** la
próxima tanda.

La orden propuesta vuelve por la **response correlada** (`motor-propuesta.proponer.response`);
el jefe la aprueba vía `cola.reordenar` (decisión humana). **CERO juicio automático:
PROPUESTA ≠ DECISIÓN.** El motor no muta el store de la cola (reflejo puro) ni dispara
imprimir.

Depende de `cola` y `cupula-gcode` (la moneda lista): la propuesta se construye sobre
las tareas vigentes (ENCOLADA) que el llamante le pasa.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `motor-propuesta.proponer.request` | `onProponerRequest` | PROPONE el orden de la cola (FIFO+urgencia+preparadas). Vuelve por response; el jefe decide vía cola.reordenar. |

### Publishes

| Evento | Descripción |
|---|---|
| `motor-propuesta.proponer.response` | Respuesta correlada: orden propuesto `{ orden }` listo para que el jefe lo apruebe. |
| `motor-propuesta.proponer.failed` | Par de fallo: no se pudo proponer el orden. |

> **Regla de cierre de círculo**: la propuesta siempre responde en `*.response`; ante
> error emite `motor-propuesta.proponer.failed`.

## Reglas de negocio

1. **CERO juicio — la propuesta no es decisión**: el motor solo propone; reordenar la
   cola es decisión del dueño vía `cola.reordenar`. Sin aprobación la cola no se reordena.
2. **Prioridad de la propuesta** (`_proponerOrden`):
   1) **URGENTE** primero;
   2) **FIFO por antigüedad de encolado** (`orden` explícito o `encolada_en`);
   3) **preferencia a las piezas YA preparadas** (gcode listo) — las preparadas van
   delante de las sin preparar dentro de cada grupo;
   4) **[ABIERTO] agrupación por afinidad** (modelo/color para minimizar cambios de
   bobina) — no implementado; decisión del dueño.
3. **Reflejo puro**: sin store propio, sin `project.activated`, sin mutar el store de
   la cola. La orden propuesta sale por la response; quien muta es la cola cuando el
   jefe aprueba.
4. **Depende de `cola` + `cupula-gcode`** (la moneda lista): las tareas de entrada las
   provee el llamante (`input.tareas`/`cola`/`items`); se filtra ENCOLADA (o sin estado).
5. **Par de fallo canónico** `motor-propuesta.proponer.failed` si no se puede proponer.

## Uso / cómo invocarlo

Los consumidores típicos son `panel-jefe` (`panel-jefe.propuestas.request`) y la
superficie de control del dueño. RPC request/response:

### 1. `proponer` — proponer el orden de la cola

```json
{
  "project_id": "e57a318a-...",
  "tareas": [
    { "id": "tarea_a", "urgente": true, "gcode_listo": true, "encolada_en": "..." },
    { "id": "tarea_b", "urgente": false, "gcode_listo": false, "encolada_en": "..." }
  ]
}
```
Respuesta `200`:
```json
{
  "propuesta": true,
  "orden": [ { "id": "tarea_a", "modelo_id": "...", "urgente": true }, ... ],
  "total": 2,
  "nota": "PROPUESTA — el jefe la aprueba vía cola.reordenar; el sistema no decide solo"
}
```
· `400` si falta `project_id` o `tareas` no es array.

> El jefe aprueba la `orden` resultante llamando a `cola.reordenar` con `aprobada_by`.

## Tests

El test vive en `tests/unit/motor-propuesta.test.js`. Cubre (del código real):

- `proponer` ordena URGENTE primero, luego FIFO por antigüedad.
- `proponer` da preferencia a las piezas preparadas (gcode listo) sobre las sin preparar.
- `proponer` sin `project_id` → `400`; `tareas` no array → `400 INVALID_INPUT`.
- La respuesta marca `propuesta: true` y NO muta la cola.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/motor-propuesta
node tests/unit/motor-propuesta.test.js
# esperado: motor-propuesta: N/N OK
```

## Notas de implementación

- Clase `MotorPropuestaReflejo extends ModuloHibridoReflejo`; `name = 'motor-propuesta'`,
  `version = 'reflejo-0.1.0'`; FASE 4 TANDA 3.
- Sin store ni persistencia: es un reflejo puro (no hay `project.activated`).
- `_proponerOrden` construye la propuesta en memoria y la devuelve por la response;
  filtra tareas sin estado o ENCOLADA.
- Dependencias (module.json): `cola`, `cupula-gcode`.
