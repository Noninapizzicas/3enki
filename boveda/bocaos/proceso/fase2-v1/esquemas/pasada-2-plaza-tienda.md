# PASADA 2 · PUNTO: `plaza-tienda` (tramo 2 — el escaparate propio)

> Sale del hueco IDENTIDAD de la pasada 1: "cada tienda tiene su escaparate, con su
> nombre y su cliente". Es la única superficie que el cliente final ve, y no es de
> Bocaos.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El escaparate de la tienda **dentro** del mercado: su marca, su carta, su precio
cerrado, su cliente. La plaza le da suelo y estado en vivo; la marca, el nombre y el
cliente son de la tienda. El cliente entra por su tienda —o por el índice del mercado,
que no ordena— y no por una lista que Bocaos prioriza.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: no hay app de cliente, así que no hay canal propio de Bocaos. → **EMPUJÓN**:
  el escaparate es **la** superficie; todo lo que el cliente necesita (carta, precio,
  estado, seguimiento, reclamación) ocurre ahí, con la marca de la tienda.
- **FRENO**: el cliente es de la tienda, no se puede pedir cuenta ni cruzar clientes
  entre tiendas. → **EMPUJÓN**: `registro-cliente-tienda` por tienda + `guarda-propiedad-cliente`.
- **FRENO**: la carta ya vive en el TPV; ponerla otra vez en la plaza la duplica. →
  **EMPUJÓN**: `carta-publica` como **proyección** del catálogo (una sola fuente), que
  poda lo no ofrecido y no se edita dos veces.
- **FRENO**: si el mercado ordena, el mercado elige. → **EMPUJÓN**: `neutralidad-orden`
  (invariante: ningún orden por pago, nota o destacado) + `plaza-publica` como
  proyección derivada del listado de tiendas.
- **FRENO**: el precio final sorprende (extras, tasa, portes). → **EMPUJÓN**:
  `precio-cerrado` compone todo antes de pagar, con el reparto como línea visible.
- **FRENO**: si la plaza no responde, la tienda no vende. → **EMPUJÓN**: el escaparate
  se compone de lo que la tienda ya declaró (marca, carta, precio) y no depende de que
  la coordinación esté viva para mostrarse.

### 3 · CONTRATO
- La tienda **da**: su marca, su carta, su horario, su cliente.
- La tienda **recibe**: un escaparate con estado en vivo, precio cerrado y su cliente
  identificado como suyo. Paga por ello dentro del tramo 1 (el tramo 2 va incluido).
- El cliente final **da**: su pedido y su oferta de reparto. **Recibe**: la comida, el
  estado y la prueba — nunca una cuenta ni una marca de Bocaos.

### 4 · NO-OBJETIVOS
- NO es un marketplace con home de ofertas ni un escaparate de Bocaos.
- NO capta al cliente: no hay registro único, ni fidelización, ni marketing cruzado.
- NO vende posiciones, destacados ni publicidad.
- NO es una app: no se instala nada.
- NO edita la carta: la carta se edita en el TPV y la plaza la proyecta.

### 5 · PREGUNTAS ABIERTAS
- ¿El escaparate vive en el dominio de la tienda o en una ruta de la plaza? (la F0 dice
  "web de su tienda"; el detalle de la superficie no está declarado).
- ¿El cliente compra como invitado o con cuenta **de la tienda**?
- ¿Qué muestra el escaparate cuando la tienda está cerrada: carta visible con pedido
  bloqueado, o desaparece del índice?
- ¿La plaza admite **recogida en tienda**? No declarado — y si sí, sería un desacople
  del eslabón limitante (el pedido dejaría de depender de un rider). **Decide el dueño.**
- ¿Quién responde de la veracidad de la carta (alérgenos, disponibilidad)?

## Hojas que salen (→ disección)
`marca-tienda` · `carta-publica` · `precio-cerrado` · `carrito-tienda` ·
`registro-cliente-tienda` · `plaza-publica` · `neutralidad-orden`
