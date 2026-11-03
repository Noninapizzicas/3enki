# PASADA · INTERLOCUTOR `cliente`

> **Heredada de la pasada 2** (`fase2-v2/esquemas/pasada-interlocutor-cliente.md`) y revalidada contra la F0 §7.
> Interlocutor `cliente`. Una adición de §7: solo ve las tiendas que reparten en su zona.
> Se reproduce aquí para que `esquemas/` quede completo; los deltas de la tercera pasada
> están en `pasada-2-corte-de-piezas.md` y en `esquema.md` §1.

> Perspectiva: **el cliente de la tienda**. No tiene app de Bocaos, no tiene cuenta, no sabe
> que Bocaos existe. Su canal es la web de su tienda. Los 5 huecos, desde su silla.

## 1 · IDENTIDAD — ¿qué es Bocaos para él?
**Nada.** Y eso es el diseño, no un olvido (F0, par 6). Para él, Bocaos es *"la web de mi
sitio"*: una web que tiene su carta, su precio y su hora. Si el nombre de Bocaost aparece en
algún sitio, el restaurante tendrá razón en tener miedo.

Lo único que Bocaos **es** para él: **la hora que le prometieron**. Y ahí el matiz pesa, porque
su pedido puede compartir viaje con otro y él no lo sabe.

## 2 · RESTRICCIONES (freno → empujón)

- **FRENO**: *"no sé si mi pedido va solo"*. El enlace puede añadirle hasta el umbral de
  retraso (**6 min** en el primer mercado) y él no ha aceptado ese trato con nadie.
  → **EMPUJÓN**: `guarda-enlace-no-rompe-promesa` (A31) — su promesa no empeora más de lo
  declarado — **y** `transparencia-del-enlace` (K03), que **existe solo si el dueño decide que
  exista** (Q20). Sin esa respuesta, el esquema **no puede** resolver este freno: no se
  inventa.

- **FRENO**: *"no sé quién viene"*. → **EMPUJÓN**: `seguimiento-vivo` (F03) + `chat-enmascarado`
  (F04) + `instrucciones-acceso` (F05).

- **FRENO**: *"el precio final me sorprende"*. → **EMPUJÓN**: `precio-cerrado` (D03).

- **FRENO**: si se queja, ¿a quién llama? → **EMPUJÓN**: `reclamacion-por-la-tienda` (K01). Su
  única vía es la tienda, y eso es coherente: es el cliente **de la tienda**.

## 3 · CONTRATO
Da: su pedido y su oferta de reparto. Recibe: un precio cerrado, una hora, la posibilidad de
seguir el pedido, una prueba de entrega y un sitio donde quejarse.

## 4 · NO-OBJETIVOS — lo que NO quiere
- **No quiere otra app.** No la instala. Si Bocaos lanza una, pierde a este cliente y gana un
  enemigo en el restaurante (F0, par 6).
- **No quiere otro registro.** No quiere cuenta de Bocaos.
- **No quiere que le cambien el pedido** para que el reparto cuadre. Ni menú fijo, ni hora de
  corte, ni "su pedido va con el de otro señor, espere 10 minutos más". Eso es exactamente lo
  que la F0 §6 descarta: *"agrupar clientes en la cena empeora el producto"*.

## 5 · PREGUNTAS ABIERTAS (las que solo se ven desde aquí)
- **Q15 — la contradicción que este prisma destapa.** La F0 §1 dice que el cliente *"espera
  menos **o paga menos**"*; la F0 §6 dice que *"el enlazado es la palanca del rider"*. Las dos
  cosas no caben a la vez sin decirlo: si el ahorro es del rider, el cliente **paga lo mismo y
  absorbe hasta 6 minutos de espera extra**. Las salidas son tres — bajarle el precio, apretar
  el umbral, o decírselo — y **ninguna está declarada**.
- **Q20** ¿sabe que comparte viaje? · **Q21** ¿quién responde si llega tarde por el enlace? ·
  **Q22** ¿la promesa es una hora o una ventana? · **Q39** ¿compra como invitado? ¿ve el
  desglose? · **Q30** si falta prueba, ¿a favor de quién?

## Piezas que SOLO se ven desde su silla
- `reclamacion-por-la-tienda` (PUENTE) — su única vía de queja pasa por la tienda.
- `guarda-marca-ajena` (REFLEJO) — ninguna comunicación que él reciba lleva marca de Bocaos.
- `transparencia-del-enlace` — **[ABIERTA]**: no es que falte la pieza, es que **no se sabe si
  debe existir**.

**Refuerza**: `precio-cerrado` (D03), `registro-cliente-tienda` (D05), `seguimiento-vivo` (F03),
`reparto-del-pago` (E05), `aviso-cliente` (C06).
