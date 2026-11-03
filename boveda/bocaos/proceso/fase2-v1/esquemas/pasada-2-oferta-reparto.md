# PASADA 2 · PUNTO: `oferta-reparto` (**EL ESLABÓN LIMITANTE**)

> Sale del hueco RESTRICCIONES de la pasada 1 y del eslabón identificado allí. Este
> punto es el corazón del esquema: **es el producto de Bocaos**. El enlazado no es una
> función, es lo que se vende.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El acto por el que **un pedido encuentra a un repartidor** y ese repartidor se lleva por
delante dos o tres pedidos más en el mismo viaje. Es el único paso del sistema que
ocurre **sin obligación en ninguna de las dos partes**: nadie contrata a nadie, nadie
manda a nadie, y el rider puede no aceptar nunca. Su calidad no se mide en ofertas
emitidas sino en **aceptaciones**.

### 2 · RESTRICCIONES (freno → empujón, es el cuello: aquí va todo)
- **FRENO**: el rider no te debe nada y decide a ciegas. → **EMPUJÓN**: `visibilidad-oferta`
  (importe, distancia, tienda, espera prevista) + `espera-declarada` +
  `historico-restaurante` (cómo se comporta esa cocina, medido, no opinado).
- **FRENO**: si espera sin cobrar, se va — y con él se va el mercado. → **EMPUJÓN**: la
  espera entra en `adjudicacion-fallos` y se cobra a quien la causó; el rider no paga
  la lentitud ajena.
- **FRENO**: dos riders pueden aceptar a la vez. → **EMPUJÓN**: `aceptacion-atomica`
  (un pedido, un aceptante; el segundo recibe "ya cogido" y no pierde nada).
- **FRENO**: el enlazado le sube el ingreso al rider pero retrasa al cliente. →
  **EMPUJÓN**: `enlazado-viaje` con tope declarable (la F0 dice 2–3; el tope exacto y
  quién lo decide están abiertos) y `paradas-del-viaje` con **reloj por pedido**.
- **FRENO**: "cerca" puede convertirse en una puntuación oculta. → **EMPUJÓN**:
  `elegibilidad-rider` por distancia declarada y verificable + `neutralidad-orden`.
- **FRENO**: si nadie acepta, el pedido muere en silencio y el cliente culpa a la tienda.
  → **EMPUJÓN**: `oferta-sin-rider` dispara a la sala; subir la oferta es decisión del
  cliente (no declarado si puede).
- **FRENO**: si el rider acepta y no llega, el pedido está secuestrado. → **EMPUJÓN**:
  `liberacion-por-abandono` lo devuelve a la oferta con su reloj; la consecuencia exacta
  ("pierde el pedido") está sin cuantificar (F0 q4).

### 3 · CONTRATO
- El rider **da**: una aceptación (contrato puntual, con hora) y la entrega.
- El rider **recibe**: el importe **íntegro** de cada pedido que lleva, la información
  antes de aceptar, el histórico del restaurante y la medida de su espera.
- La tienda **da**: el pedido listo a la hora comprometida. **Recibe**: un rider.
- El cliente **da**: su oferta de reparto. **Recibe**: la entrega.
- Bocaos **da**: la oferta y el reloj. **Recibe**: céntimos por reparto aceptado.

### 4 · NO-OBJETIVOS
- NO asigna por turno, por nota, por antigüedad ni por cuota pagada.
- NO subasta a la baja: el precio lo pone el cliente; Bocaos no puja.
- NO obliga a aceptar ni penaliza el rechazo (es autónomo; el rechazo se registra, no
  se castiga — y si se castiga, hay que declararlo).
- NO promete un rider: promete **una oferta visible**. Es la diferencia con Glovo.
- NO decide el enlazado por el rider (la F0 lo pregunta: rider, sistema o los dos).

### 5 · PREGUNTAS ABIERTAS
- **¿Quién decide el enlazado** — rider, sistema o los dos? (F0 q3, sin responder).
- ¿Puede el cliente subir su oferta si nadie acepta? ¿y la tienda añadir más incentivo
  después de emitida la oferta?
- ¿Qué radio es "cerca"? ¿por distancia al pedido o al rider? (valor no declarado).
- ¿El tope de enlace es 2 o 3, y por qué? ¿puede el rider enlazar pedidos de **tiendas
  distintas** en el mismo viaje?
- ¿Qué pasa si nadie acepta en N minutos: se avisa, se sube el precio, se cancela? ¿quién
  lo decide?
- ¿El rider puede reservar un pedido programado (para más tarde)?
- ¿Un rechazo repetido tiene consecuencia? (no declarado).

## Hojas que salen (→ pasada 3)
`elegibilidad-rider` · `visibilidad-oferta` · `aceptacion-atomica` · `enlazado-viaje` ·
`historico-restaurante` · `espera-declarada` · `liberacion-por-abandono` · `oferta-sin-rider`
