# Disección — Interfaz de operación de pedidos

Formas asignadas a cada pieza atómica. Sin tecnología — todo lo que depende
del entorno se nombra como PUERTO abierto.

---

| # | Pieza | Forma | Razón | Puerto abierto |
|---|---|---|---|---|
| 1 | Estado | **reflejo** | Dato inmutable: un punto nombrado. Un test lo afirma. | — |
| 2 | Transición | **reflejo** | Arco determinista entre dos estados. | — |
| 3 | Estado terminal | **reflejo** | Invariante: de aquí no se sale. | — |
| 4 | Estado compuesto | **reflejo** | Sub-estados internos de un estado (vacío/con items). | — |
| 5 | Operación de creación | **conversor** | Transforma inputs del operador en una entidad nueva. | `ejecutar(comando)` [transporte ABIERTO] |
| 6 | Operación de composición | **conversor** | Transforma el pedido añadiendo/quitando partes. | `ejecutar(comando)` [transporte ABIERTO] |
| 7 | Operación de transición | **conversor** | Transforma el estado del pedido. | `ejecutar(comando)` [transporte ABIERTO] |
| 8 | Operación de consulta | **conversor** | Transforma una pregunta en datos. | `consultar(criterio)` [transporte ABIERTO] |
| 9 | Lista de pedidos | **reflejo** | Proyección determinista: criterio → filas. | `consultar(criterio)` [transporte ABIERTO] |
| 10 | Detalle de pedido | **reflejo** | Proyección determinista: id → datos completos. | `consultar(id)` [transporte ABIERTO] |
| 11 | Eventos en vivo | **puente** | Conecta el mundo exterior con la interfaz. | `observar(señal)` [canal ABIERTO] |
| 12 | Indicadores de estado | **reflejo** | Mapa determinista: estado → representación visual. | — |
| 13 | Proyecto implícito | **reflejo** | Dato del contexto: es un hecho, no se negocia. | `contexto()` [fuente ABIERTA] |
| 14 | Inyección de contexto | **reflejo** | Regla mecánica: toda operación hereda el proyecto. | — |
| 15 | Grafo de estados | **reflejo** | Estructura declarativa: mapa finito de nodos y arcos. | — |
| 16 | Cadena de ids | **reflejo** | Hecho del flujo: output de A = input de B. | — |
| 17 | Selector de entidad | **puente** | Conecta la interfaz con la fuente de entidades externas. | `consultar(dominio, criterio)` [transporte ABIERTO] |
| 18 | Resolución de referencia | **conversor** | Transforma un id opaco en nombre legible. | `consultar(dominio, id)` [transporte ABIERTO] |
| 19 | Guardas de transición | **reflejo** | Predicado evaluable: estado + datos → habilitado. | — |
| 20 | Resultado exitoso | **reflejo** | Dato: la operación devolvió éxito + datos. | — |
| 21 | Resultado fallido | **reflejo** | Dato: la operación devolvió error + motivo. | — |
| 22 | Suscripción a eventos | **puente** | Conecta la interfaz con el canal de señales del mundo. | `observar(señal)` [canal ABIERTO] |
| 23 | Reconciliación | **conversor** | Transforma una señal recibida en actualización de la vista. | — |
| 24 | Indicador de frescura | **reflejo** | Dato: última señal recibida → la vista está fresca o no. | — |
| 25 | Agrupación por fase | **reflejo** | Mapa determinista: operación → fase del ciclo de vida. | — |
| 26 | Acción primaria | **micro-agente** | Requiere evaluar el contexto para decidir qué acción destacar. | — |
| 27 | Flujo encadenado | **micro-agente** | Requiere evaluar el resultado de la operación anterior para ofrecer la siguiente. | — |
| 28 | Operador vs Cliente | **reflejo** | Frontera declarativa: quién ve qué. | — |
| 29 | Control vs Análisis | **reflejo** | Corte de alcance: tiempo real, no histórico. | — |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 19 | Estado, Transición, Estado terminal, Estado compuesto, Lista, Detalle, Indicadores de estado, Proyecto implícito, Inyección de contexto, Grafo de estados, Cadena de ids, Guardas, Resultado exitoso, Resultado fallido, Indicador de frescura, Agrupación por fase, Operador vs Cliente, Control vs Análisis |
| **conversor** | 6 | Op. creación, Op. composición, Op. transición, Op. consulta, Resolución de referencia, Reconciliación |
| **puente** | 3 | Eventos en vivo, Selector de entidad, Suscripción a eventos |
| **micro-agente** | 2 | Acción primaria, Flujo encadenado |
| **custodio** | 0 | — |

## Puertos abiertos (resumen)

| Puerto | Piezas que lo usan |
|---|---|
| `ejecutar(comando)` | Op. creación, Op. composición, Op. transición |
| `consultar(criterio)` | Op. consulta, Lista de pedidos, Selector de entidad |
| `consultar(id)` | Detalle de pedido, Resolución de referencia |
| `observar(señal)` | Eventos en vivo, Suscripción a eventos |
| `contexto()` | Proyecto implícito |
