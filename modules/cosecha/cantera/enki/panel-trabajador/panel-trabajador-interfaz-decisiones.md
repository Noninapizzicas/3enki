# interfaz-decisiones.md — panel-trabajador (F6½)

> Cadena **evento → contexto → forma → elemento** para cada ui_handler. La FORMA se
> decide en F7; aquí queda sin decidir (null) según la regla de la F6½ (no escribir
> `ui.formas`).

| op | evento (RPC) | contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|---|
| estado_vivo | `panel-trabajador.estado_vivo.request` | Ver qué imprime ahora (pieza/progreso/fase) | *(F7)* panel de estado en vivo (Z3) | badge de estado + pieza + progreso + filamento | fase, pieza, progreso, filamento, eventos, timestamp | El trabajador vuelve cada minuto a mirar la impresión; repintado por cola.actualizada/impresion.*/material.actualizado |
| proximo_encadenar | `panel-trabajador.proximo_encadenar.request` | Ver la siguiente cabecera lista para encadenar | *(F7)* tarjeta (Z4) | tarjeta de próxima pieza | siguiente, razon | La cola la ofrece; aquí solo se proyecta para que el operador sepa qué toca |
| eventos | `panel-trabajador.eventos.request` | Ver últimos eventos del taller | *(F7)* tabla/cinta (Z4) | lista de registros | n (default 10), registros, total | Cinta cronológica append-only (dato medido) |
| pendientes | `panel-trabajador.pendientes.request` | Ver confirmaciones del dueño pendientes | *(F7)* tarjeta de confirmaciones (Z4) | lista de pendientes | fase, tarea_id, motivo | Decisiones que esperan al dueño en el ciclo actual (FALLIDA/esperando) |
| control | `panel-trabajador.control.request` | Operar HOY (pausar/abortar/reanudar/reintentar/saltar/cambio_bobina/confirmar) | *(F7)* botones de acción/confirmación contextuales (Z2) | botones que DELEGAN | accion*, motivo, tarea_id, bobina_id, material, gramos_restantes, tipo_confirmacion, confirmacion_id | Comandos HOY que delegan en ciclo/manejo-fallo/filamento/adaptador; esperan decisión del dueño |

## Refresco de zona DATOS

- `datos.op = estado_vivo` · `refresh_on = [cola.actualizada, impresion.iniciada, impresion.finalizada, impresion.fallida, material.actualizado]` — el estado en vivo se repinta con los eventos del taller (fire-and-forget, no muta).

## Notas de F6½

- **Nada de decisión futura**: este panel NO aprueba propuestas ni marca urgencia futura (eso es panel-jefe). CERO decisiones: cada control delega por RPC y espera la respuesta del dueño.
- **GATE ANTICOLISION-001**: `eventos_que_escucho: []` porque los `*.request` ya son fuente de verdad en `module.json.subscribes` (XOR). El repintado en vivo va por `ui.datos.refresh_on`, no como subscribes de lectura.
- **Roles**: panel-trabajador = TRABAJADOR (rol HOY). estado_vivo/pendientes = operativo; control = delegación; proximo_encadenar/eventos = lectura.
- **Sin FORMAS**: la F7 las decide (estado_vivo → estado en vivo Z3, control → botones Z2, resto → tarjetas/tablas Z4). Todo derivable por el generador.
