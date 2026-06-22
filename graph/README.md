# `graph/` — Grafo de eventos de 2enki

Visualización propia del sistema event-driven de 2enki. **No usa Graphify** (su grafo
de AST/funciones no captura lo que importa aquí): el grafo de verdad de 2enki es el
**grafo de eventos** — módulos como nodos, eventos MQTT como aristas dirigidas
(`publica → escucha`).

## Qué hay

| Archivo | Qué es |
|---|---|
| `index.html` | Viewer interactivo (fuerza dirigida en canvas vanilla, sin dependencias). **Ábrelo directo en el navegador** — no necesita servidor. |
| `build-graph.js` | Extractor. Lee `modules/**/module.json` (`events.publishes` / `events.subscribes`) y construye el grafo. |
| `graph.json` | El grafo: `nodes`, `edges`, `events`, `dangling`, `_meta`. Fuente consultable. |
| `graph-data.js` | El mismo grafo como `window.GRAPH = {…}` (lo embebe el viewer para abrir sobre `file://` sin fetch/CORS). |
| `REPORT.md` | Informe en markdown: god nodes, cruces entre subsistemas, sumideros/fuentes, eventos colgantes. |

## Uso

```bash
# Reconstruir desde los manifests (tras tocar cualquier module.json)
node graph/build-graph.js

# Ver
open graph/index.html      # o arrástralo al navegador
```

## El viewer

- **Nodo** = módulo · color = subsistema · tamaño = grado de eventos (in+out).
- **Arista** = al menos un evento que el origen publica y el destino escucha. La punta de flecha marca el sentido.
- Borde punteado = módulo `blueprint_driven`.
- **Click** en un nodo → panel con descripción, eventos que publica/escucha y tools LLM.
- **Buscar** filtra módulos por nombre o por evento.
- **Leyenda** → click en un subsistema para mostrar/ocultar.
- Arrastra nodos, rueda para zoom, "Reencuadrar" para ajustar.

## Cómo se construye el grafo

```
modules/<sub>/<mod>/module.json
  events.publishes[].event   ─┐
                              ├─►  evento E: { publishers, subscribers }
  events.subscribes[].event  ─┘
                                   │
                    arista dirigida  src(publica E) → dst(escucha E)
```

El subsistema sale del primer segmento de la ruta bajo `modules/`
(`pizzepos`, `conversacion`, `facturacion`; el resto cae en `core`).

## Alcance y honestidad del dato

El grafo dibuja solo el wiring **declarado** en `events.subscribes`. 2enki también
acopla por vías que no aparecen ahí — y por eso hay muchos "eventos colgantes":

- suscripción cruda al bus (`mqtt.on('message')`, p. ej. la **propiocepción**),
- RPC `*.request` → `*.response` (request/response sobre pub/sub),
- wiring por `ui_handlers` (frontend ↔ backend).

Esas aristas no se dibujan porque no son declaraciones `events.subscribes`. El grafo
es fiel a lo declarado, no a lo que ocurre en runtime — útil precisamente para ver
qué acoplamiento está explícito y cuál vive solo en el código.
