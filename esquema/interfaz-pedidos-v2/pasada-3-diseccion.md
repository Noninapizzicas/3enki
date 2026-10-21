# Disección — Interfaz de pedidos (dos vías)

Formas asignadas a cada pieza atómica del esquema.

---

## Vía Operativa

| # | Pieza | Forma | Razón | Puerto |
|---|---|---|---|---|
| 1 | Iniciar pedido | **conversor** | Transforma intención en borrador | `ejecutar(comando)` |
| 2 | Confirmar pedido | **conversor** | Transición borrador → creado | `ejecutar(comando)` |
| 3 | Enviar a cocina | **conversor** | Transición creado → enviado | `ejecutar(comando)` |
| 4 | Cancelar | **conversor** | Transición estado → cancelado | `ejecutar(comando)` |
| 5 | Añadir item | **conversor** | Crea línea en la composición | `ejecutar(comando)` |
| 6 | Modificar item | **conversor** | Muta una línea existente | `ejecutar(comando)` |
| 7 | Quitar item | **conversor** | Elimina una línea | `ejecutar(comando)` |
| 8 | Selector de producto | **puente** | Conecta con el catálogo externo | `consultar(dominio, criterio)` |
| 9 | Selector de variaciones | **puente** | Conecta con las variaciones del producto | `consultar(dominio, id)` |
| 10 | Validación de composición | **reflejo** | Invariante: mínimos para avanzar | — |
| 11 | Total en vivo | **reflejo** | Se deriva de la composición | — |
| 12 | Resolución de producto | **puente** | Buscar en la carta | `consultar(dominio, criterio)` |

## Vía de Consulta

| # | Pieza | Forma | Razón | Puerto |
|---|---|---|---|---|
| 13 | Lista de pedidos | **reflejo** | Muestra lo que hay, sin mutar | `consultar(criterio)` |
| 14 | Detalle: Cabecera | **reflejo** | Id, estado, origen, timestamps | `consultar(id)` |
| 15 | Detalle: Lista de items | **reflejo** | Items con producto resuelto | `consultar(id)` |
| 16 | Detalle: Total | **reflejo** | Suma derivada | — |
| 17 | Detalle: Barra de estado | **reflejo** | Ciclo de vida con punto actual | — |
| 18 | Detalle: Acciones contextuales | **micro-agente** | Decide qué ofrecer según estado | — |
| 19 | Seguimiento en vivo | **puente** | Observa señales del ciclo | `observar(señal)` |
| 20 | Filtro por actor | **reflejo** | La superficie cambia por rol | — |
| 21 | Cadena lista→detalle | **reflejo** | Selección en lista abre detalle | — |
| 22 | Indicador de frescura | **reflejo** | Cuánto hace que se actualizó | — |
| 23 | Reconciliación | **conversor** | Señal → refresco de dato | — |
| 24 | Resolución de nombre | **puente** | Id de producto → nombre legible | `consultar(dominio, id)` |

## Pedido como entidad

| # | Pieza | Forma | Razón | Puerto |
|---|---|---|---|---|
| 25 | Ciclo de vida | **reflejo** | Grafo de estados: invariante | — |
| 26 | Metadatos | **reflejo** | Notas, canal, cliente, timestamps | — |
| 27 | Contexto implícito | **reflejo** | El proyecto siempre está | — |
| 28 | Referencia cruzada | **puente** | Items apuntan a productos | `consultar(dominio, id)` |
| 29 | Señal de transición | **puente** | Anuncia cada cambio de estado | `señalar(evento)` |
| 30 | Item | **reflejo** | Estructura: producto+cantidad+var | — |
| 31 | Orden de items | **reflejo** | Se mantiene el orden de inserción | — |

## Restricciones

| # | Pieza | Forma | Razón | Puerto |
|---|---|---|---|---|
| 32 | Guardas de transición | **reflejo** | Estado → operaciones permitidas | — |
| 33 | Vista cliente | **reflejo** | Superficie mínima | — |
| 34 | Vista trabajador | **reflejo** | Superficie completa | — |
| 35 | Vista jefe | **reflejo** | Consulta enriquecida | — |
| 36 | Conflicto de edición | **micro-agente** | Resolución no determinista | — |

## Contrato

| # | Pieza | Forma | Razón | Puerto |
|---|---|---|---|---|
| 37 | Feedback de operación | **reflejo** | Resultado inmediato éxito/fallo | — |
| 38 | Reflejo en vivo | **puente** | Observa y actualiza | `observar(señal)` |
| 39 | Coherencia cross-vía | **reflejo** | Invariante del reflejo | — |

## No-objetivos

| # | Pieza | Forma | Razón | Puerto |
|---|---|---|---|---|
| 40 | Operación vs Producción | **puente** | Frontera con cocina | `señalar(pedido_enviado)` |
| 41 | Consulta vs Analítica | **reflejo** | Frontera como invariante | — |

---

## Resumen de formas

| Forma | Cantidad | % |
|---|---|---|
| **reflejo** | 23 | 56% |
| **puente** | 9 | 22% |
| **conversor** | 7 | 17% |
| **micro-agente** | 2 | 5% |
| **custodio** | 0 | 0% |

## Puertos abiertos (5 tipos)

| Puerto | Piezas que lo usan |
|---|---|
| `ejecutar(comando)` | Iniciar, Confirmar, Enviar, Cancelar, Añadir, Modificar, Quitar |
| `consultar(criterio)` | Lista de pedidos, Selector de producto, Resolución de producto |
| `consultar(id)` | Cabecera, Lista de items, Referencia cruzada, Resolución de nombre, Selector de variaciones |
| `observar(señal)` | Seguimiento en vivo, Reflejo en vivo |
| `señalar(evento)` | Señal de transición, Operación vs Producción |
