# interfaz-decisiones.md — importacion (F6½)

> Cadena **evento → contexto → forma → elemento** para cada ui_handler. La FORMA se
> decide en F7; aquí queda sin decidir (null). chat_tool: el blueprint declara las
> ops; la F7 decide formas y cómo se dispara desde la barra inferior del chat.

| op | evento (RPC) | contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|---|
| importar | `importacion.importar.request` | Subir/normalizar/entregar un archivo externo | *(F7)* formulario de acción (Z1) + feedback por señal | form (url/ruta origen) + señal en_progreso→importada(✅)/fallida(❌) | archivo*, formato, uso, filamento_sug, origenUrl | Operación puntual de importación (GCODE→cúpula, STL/3MF→catálogo); feedback por señal, no lista |
| leer_metadatos | `importacion.leer_metadatos.request` | Leer metadatos del archivo antes de importar | *(F7)* tarjeta de metadatos (Z4) | tarjeta con nombre/unidades/material/formatos | archivo*, formato | Previsualización honesta de qué trae el archivo (huecos → desconocido/null) |

## Refresco de zona DATOS

- `datos.op = leer_metadatos` · `refresh_on = []` (lectura puntual; sin repintado por eventos).

## Notas de F6½

- **chat_tool**: operación puntual desde el chat, NO panel persistente. Sin store, sin project.activated.
- **Moneda real**: GCODE preparado va a la cúpula (cupula-gcode) directo; STL/3MF fuente va al catálogo como ficha. No solo .3mf.
- **CERO juicio**: no decide qué pieza imprimir; normaliza y entrega. Regla de honestidad: huecos → 'desconocido'/null, nunca inventados.
- **GATE ANTICOLISION-001**: `eventos_que_escucho: []` porque los `*.request` ya son fuente de verdad en `module.json.subscribes` (XOR).
- **Sin FORMAS**: F7 decide (importar → formulario de acción Z1; leer_metadatos → tarjeta Z4). Importar sigue el patrón de formulario de acción de importacion-modelo.
