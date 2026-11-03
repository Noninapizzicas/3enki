# PASADA · INTERLOCUTOR: `restaurante` (la tienda, el que paga)

> Canal: "TPV pizzepos + escaparate propio". Relación: "pone el pedido, su marca y su
> cliente; paga la coordinación". Es la venta que decide si el negocio existe (par 4).

## Prisma de los 5 huecos DESDE SU SILLA

### 1 · IDENTIDAD — ¿qué es Bocaos para la tienda?
**Su escaparate y su logística, sin perder al cliente.** No es un agregador: es el suelo
donde su tienda tiene escaparate propio y recibe riders que no le cuestan nómina. Para la
tienda, Bocaos es también **el que le mide la cocina** — y eso, al principio, asusta.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: miedo a que le quiten al cliente. → **EMPUJÓN**: `guarda-propiedad-cliente`
  (sus datos no cruzan a otra tienda ni a campañas de Bocaos) + no hay app de cliente.
- **FRENO**: miedo a que cueste más que el 30 % de Glovo. → **EMPUJÓN**: `simulador-tramos`
  (con sus números, no con promesas) + tramo 2 incluido en el tramo 1.
- **FRENO**: no quiere cambiar de TPV. → **EMPUJÓN**: la plaza es **aditiva**: el TPV
  sigue mandando la carta y la caja; el escaparate solo proyecta.
- **FRENO**: no quiere su carta en dos sitios. → **EMPUJÓN**: `carta-publica` como
  proyección (una sola fuente) — si se edita dos veces, se desincroniza y pierde.
- **FRENO**: no quiere que le midan la cocina. → **EMPUJÓN**: **simetría de información**:
  `panel-tienda` le enseña exactamente lo mismo que el rider ve de él (su espera medida).
  Si el rider decide con información, la tienda no puede decidir a ciegas.
- **FRENO**: el rider llega y el pedido no está. → **EMPUJÓN**: `compromiso-recogida`: la
  tienda cocina **a la hora comprometida**, no antes; y la espera se cobra a quien la causa.

### 3 · CONTRATO
- **Da**: marca, carta, horario, cocina a la hora comprometida, su cliente, y paga tramo 1
  + tramo 3.
- **Recibe**: escaparate propio, pedidos, riders sin nómina, su histórico de espera, y
  un cargo por fallo **solo cuando el reloj dice que fue suya**.

### 4 · NO-OBJETIVOS — qué NO quiere
- No quiere un ranking donde su vecino salga arriba por pagar.
- No quiere que Bocaos atienda a su cliente ni le mande promociones.
- No quiere exclusividad forzada (¿puede estar en Glovo a la vez? **no declarado**).
- No quiere que le saquen del mercado sin explicación: `acta-decisiones`.
- No quiere sorpresas a fin de mes: `estado-cuenta-parte`.

### 5 · PREGUNTAS ABIERTAS
- ¿Hay **exclusividad** o puede estar en otro agregador? ¿hay permanencia?
- ¿Qué pasa si su cocina es lenta **dos semanas seguidas**? ¿se le saca del mercado, se le
  sube el incentivo obligatorio, se le avisa? **No declarado — y es la consecuencia que
  hace que el mercado corrija.**
- ¿Quién atiende a su cliente cuando reclama: la tienda o Bocaos? (el esquema dice: la
  tienda, con Bocaos detrás).
- ¿Cuánto puede subir el incentivo? ¿tiene techo?
- ¿Ve el importe que el cliente puso de reparto? (transparencia frente a privacidad).

## PIEZAS QUE SOLO EMERGEN DESDE AQUÍ (al árbol)
- **`panel-tienda`** — REFLEJO. Su espera medida, sus pedidos perdidos, lo que debe. La
  misma información que el rider usa para decidir sobre él. Simetría, no vigilancia.
- **`guarda-propiedad-cliente`** — REFLEJO. Invariante: los datos del cliente de una
  tienda no se leen desde otra ni desde campañas. Es el par 4 resuelto en código.
