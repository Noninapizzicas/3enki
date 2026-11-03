# PASADA 2 · PUNTO: `reparto-medido` (la ejecución hecha hecho probatorio)

> Sale del hueco CONTRATO de la pasada 1: la F0 nombra relojes, GPS, foto de entrega y
> hora de aceptación. Eso no es telemetría: **es la prueba con la que se adjudica**.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El viaje físico convertido en **una secuencia de hechos con hora**: aceptación, llegada
a la tienda, pedido listo, recogida, llegada al portal, bajada del cliente, foto de
entrega. No es vigilancia: es el acta. Sin acta no hay adjudicación posible y la regla
del fallo se vuelve una opinión — justo lo que Bocaos renuncia a hacer.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: el rider puede no tener posición, cobertura o batería. → **EMPUJÓN**: la
  prueba **no depende de un solo dato** (`prueba-entrega` = foto + hora + confirmación);
  si falta uno, el hueco se **nombra**, no se rellena.
- **FRENO**: el cliente no baja y no hay testigo. → **EMPUJÓN**: la hora de llegada y la
  espera quedan registradas; el fallo se cobra al cliente sin discutir.
- **FRENO**: el rider no encuentra el portal. → **EMPUJÓN**: `instrucciones-acceso`
  declaradas por el cliente de la tienda, reutilizables en su siguiente pedido.
- **FRENO**: una incidencia no se resuelve en la calle. → **EMPUJÓN**: `incidencia-reparto`
  a la cola de la sala, con el acta delante.
- **FRENO**: con tres pedidos en un viaje, un solo reloj miente. → **EMPUJÓN**:
  `paradas-del-viaje` con reloj y prueba **por pedido**, no por trayecto.
- **FRENO**: medir al cliente y al rider es dato personal. → **EMPUJÓN**: se guarda el
  hecho que adjudica (hora, foto, confirmación) y no más; el detalle de conservación
  está sin declarar (pregunta abierta).

### 3 · CONTRATO
- El rider **da**: la prueba de cada salto. **Recibe**: la liquidación de su reparto y la
  defensa frente a un cargo injusto (el acta es suya también).
- El cliente **da**: instrucciones de acceso y confirmación. **Recibe**: seguimiento y
  prueba de entrega.
- La tienda **recibe**: la prueba de que el pedido salió a la hora comprometida (o de
  que no estaba listo) — la misma que se usará para cobrarle o no la espera.

### 4 · NO-OBJETIVOS
- NO graba al cliente ni el interior de su casa: foto de la entrega, no del portal.
- NO puntúa al rider ni al restaurante con una nota: produce hechos, no estrellas.
- NO decide si la entrega fue "buena": decide si hubo hecho y a qué hora.
- NO sustituye a la sala: una incidencia no se resuelve sola.

### 5 · PREGUNTAS ABIERTAS
- ¿Qué es prueba suficiente si el cliente no está: foto en la puerta, firma, entrega a
  un vecino, devolución a la tienda?
- ¿Cuánto tiempo se conserva la traza de posición y quién puede verla?
- ¿El cliente ve la posición en todo momento o solo desde la recogida?
- ¿Qué pasa si falta la prueba (sin foto, sin posición)? ¿Se presume algo o queda el
  fallo sin adjudicar? **No declarado.**

## Hojas que salen (→ disección)
`hechos-del-reparto` · `prueba-entrega` · `seguimiento-vivo` · `chat-enmascarado` ·
`instrucciones-acceso` · `incidencia-reparto` · `paradas-del-viaje`
