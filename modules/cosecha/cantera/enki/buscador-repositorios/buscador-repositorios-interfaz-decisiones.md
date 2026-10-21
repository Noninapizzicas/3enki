# interfaz-decisiones.md — buscador-repositorios (F6½)

> Cadena **evento → contexto → forma → elemento** para cada ui_handler. La FORMA se
> decide en F7; aquí queda sin decidir (null). chat_tool: operación puntual desde el
> chat; los resultados se devuelven como tarjetas.

| op | evento (RPC) | contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|---|
| buscar | `buscador-repositorios.buscar.request` | Buscar modelos en repositorios externos | *(F7)* input de búsqueda (Z2) + resultados como tarjetas (Z4) | campo de búsqueda + lista de tarjetas | query*, limit; fuente, titulo, url, autor, formatos | Búsqueda bajo demanda del dueño; elige y aprueba, luego importa en importacion |

## Refresco de zona DATOS

- `datos.op = buscar` · `refresh_on = []` (lectura puntual; sin repintado por eventos).

## Notas de F6½

- **chat_tool**: búsqueda puntual desde el chat, NO panel persistente. PUENTE stateless (sin store).
- **CERO invento**: devuelve lo que el puerto obtiene (crawl4rs/SearXNG); si falla o no hay datos, lo dice. Resultados solo con url; formatos con pistas evidentes, si no `[]`.
- **Importación posterior vive en importacion**, no aquí (el dueño busca → elige → importa).
- **GATE ANTICOLISION-001**: `eventos_que_escucho: []` porque el `*.request` ya es fuente de verdad en `module.json.subscribes` (XOR).
- **Sin FORMAS**: F7 decide (buscar → input de búsqueda Z2 + tarjetas de resultados Z4). Todo derivable por el generador.
