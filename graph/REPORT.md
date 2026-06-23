# 2enki — Grafo de eventos · informe

> Generado 2026-06-22T21:24:52.581Z desde `modules/**/module.json`.

**85** módulos · **395** eventos distintos · **101** aristas declaradas · **4** subsistemas.

Abre `graph/index.html` para la vista interactiva.


## Subsistemas

| Subsistema | Módulos | Eventos publicados | Eventos escuchados |
|---|--:|--:|--:|
| conversacion | 8 | 9 | 12 |
| core | 45 | 217 | 132 |
| facturacion | 2 | 3 | 2 |
| pizzepos | 30 | 64 | 50 |

## God nodes (mayor grado de eventos)

Concentran el acoplamiento del sistema: tocarlos propaga.

| Módulo | Subsistema | in | out | grado |
|---|---|--:|--:|--:|
| `persistencia-comandero` | pizzepos | 25 | 10 | **35** |
| `cuentas` | pizzepos | 8 | 17 | **25** |
| `project-manager` | core | 3 | 21 | **24** |
| `pedidos` | pizzepos | 9 | 11 | **20** |
| `cuentas-canales` | pizzepos | 3 | 15 | **18** |
| `database-manager` | core | 8 | 9 | **17** |
| `cocina` | pizzepos | 8 | 9 | **17** |
| `comandero` | pizzepos | 7 | 10 | **17** |
| `telegram-service` | core | 3 | 11 | **14** |
| `cobros` | pizzepos | 6 | 7 | **13** |
| `impresion` | pizzepos | 10 | 0 | **10** |
| `filesystem` | core | 3 | 6 | **9** |

## Conexiones entre subsistemas (cruces)

Las fronteras donde un subsistema habla con otro — los puntos de integración a vigilar.

| Origen | → | Destino | Eventos |
|---|:-:|---|---|
| `telegram-service` (core) | → | `fuentes` (facturacion) | `telegram.document.received`, `telegram.photo.received` |
| `telegram-service` (core) | → | `bienvenida-tienda` (pizzepos) | `telegram.text.received`, `telegram.command.received` |
| `system-coherence-analyzer` (core) | → | `agent-observer` (conversacion) | `agent.execute.response`, `agent.execute.failed` |
| `project-manager` (core) | → | `mercadona-api` (pizzepos) | `project.activated`, `project.deactivated` |
| `project-manager` (core) | → | `productos` (pizzepos) | `project.activated`, `project.get.response` |
| `project-manager` (core) | → | `tarifas` (pizzepos) | `project.activated`, `project.deactivated` |
| `pedidos` (pizzepos) | → | `inventario` (core) | `pedido.completado`, `pedido.cancelado` |
| `memory-conversation-summary` (conversacion) | → | `database-manager` (core) | `db.query.request` |
| `memory-rag` (conversacion) | → | `database-manager` (core) | `db.query.request` |
| `memory-user-profile` (conversacion) | → | `database-manager` (core) | `db.query.request` |
| `database-manager` (core) | → | `memory-conversation-summary` (conversacion) | `db.query.response` |
| `database-manager` (core) | → | `memory-rag` (conversacion) | `db.query.response` |
| `database-manager` (core) | → | `memory-user-profile` (conversacion) | `db.query.response` |
| `fuentes` (facturacion) | → | `facturas` (core) | `factura.entrada` |
| `project-manager` (core) | → | `bienvenida-tienda` (pizzepos) | `project.activated` |
| `project-manager` (core) | → | `ingredientes` (pizzepos) | `project.activated` |
| `project-manager` (core) | → | `variaciones` (pizzepos) | `project.activated` |
| `cocina` (pizzepos) | → | `perifericos` (core) | `periferico.display` |
| `cobros` (pizzepos) | → | `perifericos` (core) | `periferico.abrir-cajon` |
| `cocina` (pizzepos) | → | `whatsapp-bot` (core) | `cocina.pedido_listo` |

## Sumideros puros (escuchan, no emiten por bus)

Finales de cadena: proyectores, displays, persistencia.

- `impresion` (pizzepos) — escucha 10
- `whatsapp-bot` (core) — escucha 9
- `bot-manager` (core) — escucha 8
- `agent-observer` (conversacion) — escucha 5
- `device-health` (core) — escucha 4
- `mise-en-place` (core) — escucha 4
- `pase-cocina` (core) — escucha 4
- `recetario-creativo` (core) — escucha 4
- `bienvenida-tienda` (pizzepos) — escucha 3
- `inventario` (core) — escucha 2
- `perifericos` (core) — escucha 2
- `mercadona-api` (pizzepos) — escucha 2


## Fuentes puras (emiten, sin subscriptor declarado)

Emisores cuyos eventos nadie declara escuchar en su manifest. Muchos se consumen por bus crudo (propiocepción), RPC request/response o `ui_handlers` — no es necesariamente un fallo, pero conviene revisarlos.

- `credential-manager` (core) — publica 6
- `ai-agent-framework` (conversacion) — publica 3
- `device-registry` (core) — publica 3
- `system-coherence-analyzer` (core) — publica 3
- `firmware-builder` (core) — publica 2
- `device-shadow` (core) — publica 1
- `esp32-dev` (core) — publica 1
- `openwa-service` (core) — publica 1
- `pdf-viewer` (core) — publica 1
- `plugin-manager` (core) — publica 1


## Eventos colgantes

Hay **320** eventos sin par declarado en manifests (215 sin subscriptor · 105 sin publisher). Esperable: el bus admite suscripción cruda (`mqtt.on('message')`), RPC `*.request/*.response` y wiring por `ui_handlers` que no aparecen como `events.subscribes`. El grafo dibuja solo las aristas declaradas explícitamente.


---
_Reconstruir: `node graph/build-graph.js`_
