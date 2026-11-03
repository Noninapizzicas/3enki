# PASADA · INTERLOCUTOR: `repartidor autónomo` (el que puede irse)

> Canal: "ofertas de la plataforma". Relación: "acepta repartos, los enlaza y cobra del
> cliente". Es el actor que sostiene el mercado y el único que puede marcharse sin avisar.

## Prisma de los 5 huecos DESDE SU SILLA

### 1 · IDENTIDAD — ¿qué es Bocaos para el rider?
**Una fuente de repartos donde él decide.** Ni jefe, ni app de jefe, ni contrato: un
tablón con precios y una cartera. Su relación con Bocaos es de **cliente a proveedor**,
no de trabajador a empresa — y todo el diseño tiene que sostener eso, también legalmente.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: no te debe nada; nada se le puede imponer. → **EMPUJÓN**: todo pasa por una
  aceptación explícita y con hora (`aceptacion-atomica`); no hay asignación.
- **FRENO**: no sabe si habrá pedidos suficientes. → **EMPUJÓN**: `visibilidad-oferta`
  (ve el volumen real de la zona) + `guarda-sin-exclusividad` (puede trabajar con otros).
- **FRENO**: no sabe cómo ni cuándo cobra. → **EMPUJÓN**: `cartera-rider` (lo ganado, lo
  que debe a Bocaos, lo que le deben) + cobro directo del cliente + cuota semanal clara.
- **FRENO**: teme que le traten como en Glovo. → **EMPUJÓN**: sin nota, sin turnos, sin
  uniforme, sin prioridad comprada, sin protocolo de obediencia. `guarda-sin-exclusividad`.
- **FRENO**: la espera le cuesta dinero. → **EMPUJÓN**: `espera-declarada` antes de aceptar
  + `regla-pago-fallo` (la espera se le paga).
- **FRENO**: no encuentra el portal. → **EMPUJÓN**: `instrucciones-acceso` + `chat-enmascarado`.
- **FRENO**: tres pedidos calientes a la vez. → **EMPUJÓN**: `tope-enlace` + `paradas-del-viaje`
  con reloj por pedido.

### 3 · CONTRATO
- **Da**: aceptación, recogida, entrega, prueba y su reloj.
- **Recibe**: el importe **íntegro** de cada reparto (del cliente), la información antes de
  aceptar, el histórico del restaurante, la medida de su espera, y su cartera.
- **Paga a Bocaos**: céntimos por reparto coordinado (semanal).

### 4 · NO-OBJETIVOS — qué NO quiere
- No quiere exclusividad, ni turnos, ni zona asignada.
- No quiere que Bocaos retenga su dinero ni se lo pague "cuando toque".
- No quiere una nota que decida qué pedidos ve.
- No quiere que un pedido le obligue a llevar la marca de otra tienda.
- No quiere ser empleado (y Bocaos tampoco quiere ser empleador).

### 5 · PREGUNTAS ABIERTAS
- ¿Por qué canal recibe las ofertas (`canal-rider`)? ¿Y si está en la calle sin mirar el móvil?
- ¿Puede trabajar para otra plataforma a la vez? (el esquema dice sí; **confirmarlo**).
- ¿Necesita alta de autónomo y seguro, y **quién lo verifica**? ¿Bocaos exige acreditación
  para admitirlo? (enlaza con legal).
- ¿Cuántos repartos a la semana le compensan? (dato del dueño; **no se estima**).
- ¿Puede llevar pedidos de **dos tiendas distintas** en el mismo viaje?
- ¿Qué vehículo/capacidad declara, y limita eso los pedidos que puede aceptar?
- ¿Cómo sabe su zona? ¿La elige, la declara o se deduce de dónde está?

## PIEZAS QUE SOLO EMERGEN DESDE AQUÍ (al árbol)
- **`cartera-rider`** — REFLEJO. Lo ganado (del cliente), lo debido (a Bocaos) y lo que se
  le debe (un fallo a su favor). Sin cartera no hay confianza en el cobro.
- **`zona-rider`** — CUSTODIO. La zona o radio que el rider declara para recibir ofertas.
  Sin esto, "cercano" se convierte en una puntuación opaca.
- **`guarda-sin-exclusividad`** — REFLEJO. Invariante: nada bloquea al rider por trabajar
  con otro. Es a la vez diseño de mercado y defensa legal (falso autónomo).
- **`canal-rider`** — PUENTE. Puerto abierto de notificación de ofertas: intercambiable,
  sin atar al rider a una app concreta.
