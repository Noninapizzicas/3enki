# interfaz-decisiones.md — catalogo (F6½)

> Cadena **evento → contexto → forma → elemento** para cada ui_handler. La FORMA se
> decide en F7; aquí queda sin decidir (null) según la regla de la F6½ (no escribir
> `ui.formas`).

| op | evento (RPC) | contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|---|
| listar | `catalogo.listar.request` | Ver la biblioteca completa de piezas | *(F7)* tabla/lista | lista de fichas | nombre, fuente, filamento_sug, formato_dispon, uso | El dueño curadorea la biblioteca a diario; necesita la vista completa ordenada por nombre |
| registrar | `catalogo.registrar.request` | Dar de alta una ficha nueva | *(F7)* formulario | campos del alta | nombre*, uso, filamento_sug, fuente, origenUrl, archivo_stl/3mf/gcode | Alta de pieza de la moneda real; reconcilia antes de crear (NO duplica) |
| por_id | `catalogo.por_id.request` | Detalle de una ficha concreta | *(F7)* tarjeta/detalle | ficha completa | id, uso, filamento_sug, fuente, origenUrl, formato_dispon, archivos | El dueño consulta la ficha completa de una pieza concreta |
| actualizar | `catalogo.actualizar.request` | Editar/mergear una ficha existente | *(F7)* formulario | campos editables | modelo_id*, uso, filamento_sug, fuente, origenUrl, archivos | Corrección/completado de ficha (p. ej. añadir .gcode tras slicear); no re-crea |

## Refresco de zona DATOS

- `datos.op = listar` · `refresh_on = [modelo.registrado]` — al registrar/actualizar se repinta la biblioteca.

## Notas de F6½

- **GATE ANTICOLISION-001**: `eventos_que_escucho: []` porque los `*.request` ya son
  fuente de verdad en `module.json.subscribes` (XOR).
- **Moneda real STL→GCODE**: los 3 formatos conviven como archivos distintos
  (`archivo_stl`, `archivo_3mf`, `archivo_gcode`); no solo `.3mf`.
- **CERO juicio**: uso/filamento/aprobación quedan a decisión del dueño; el custodio solo custodia.
- **Rol por op**: registrar/actualizar = jefe/custodio (escribe); listar/por_id = neutro/operador (ve).
- **Sin FORMAS**: la F7 las decide (registrar/actualizar → formulario Z1, listar → tabla Z4, por_id → detalle Z4). Todo es derivable por el generador con args simples.
