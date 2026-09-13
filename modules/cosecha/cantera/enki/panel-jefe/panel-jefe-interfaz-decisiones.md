# interfaz-decisiones.md — panel-jefe (F6½)

> Cadena **evento → contexto → forma → elemento** para cada ui_handler. La FORMA se
> decide en F7; aquí queda sin decidir (null) según la regla de la F6½ (no escribir
> `ui.formas`).

| op | evento (RPC) | contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|---|
| resumen | `panel-jefe.resumen.request` | Ver la visión conjunta del taller | *(F7)* dashboard de conjunto (Z3+Z4) | panel agregado | n, modelo_filtro; impresion_actual, cola, filamento, consumo, historial | El jefe abre el cuadro de mando; repintado por cola.actualizada/pieza.imprimida/impresion.registrada/material.actualizado |
| propuestas | `panel-jefe.propuestas.request` | Ver la propuesta de orden de la cola | *(F7)* tabla de orden (Z4) | lista de propuesta | tareas, propuesta, nota | PROPUESTA ≠ DECISIÓN; el jefe la ve antes de aprobar |
| aprobar_propuesta | `panel-jefe.aprobar_propuesta.request` | El jefe aprueba una propuesta | *(F7)* botón de decisión (Z2) | confirma el orden | orden* (json, viene de propuestas), jefe | Solo con decisión humana → cola.reordenar; el sistema transporta |
| marcar_prioridad | `panel-jefe.marcar_prioridad.request` | Marcar urgencia/prioridad de una tarea | *(F7)* botón de decisión (Z2) | marca urgente | id*/tarea_id, urgente | El jefe decide qué sube (cola.marcar_urgente) |
| pedir_reposicion | `panel-jefe.pedir_reposicion.request` | Pedir reposición de filamento | *(F7)* botón de decisión (Z2) | pide filamento | confirmacion_id, bobina_id | SolicitudDecision al dueño vía adaptador-confirmacion |
| ver_detalle | `panel-jefe.ver_detalle.request` | Detalle de un modelo | *(F7)* tarjeta/detalle (Z4) | ficha o gcode | modelo_id, archivo_id | Inspección de catalogo.por_id / cupula-gcode.obtener |

## Refresco de zona DATOS

- `datos.op = resumen` · `refresh_on = [cola.actualizada, pieza.imprimida, impresion.registrada, material.actualizado]` — el dashboard se repinta con los eventos del taller (fire-and-forget, no muta).

## Notas de F6½

- **PROPUESTA ≠ DECISIÓN**: `propuestas` es lecturas/propuesta; `aprobar_propuesta` es la decisión que delega en `cola.reordenar`. El sistema no reordena solo.
- **CERO juicio**: el panel solo proyecta y transporta; el jefe decide. Cada action de decisión (aprobar/marcar/pedir) espera la voz del dueño.
- **GATE ANTICOLISION-001**: `eventos_que_escucho: []` porque los `*.request` ya son fuente de verdad en `module.json.subscribes` (XOR). El repintado en vivo va por `ui.datos.refresh_on`.
- **Roles**: todo el panel-jefe = JEFE (rol FUTURO). resumen/ver_detalle = lecturas agregadas; propuestas = propuesta; aprobar/marcar/pedir = decisiones que delegan.
- **Sin FORMAS**: la F7 las decide (resumen → dashboard, propuestas → tabla, resoluciones → botones Z2, ver_detalle → tarjeta Z4). Todo derivable por el generador.
