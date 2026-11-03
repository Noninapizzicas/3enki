# PASADA 3 · DESGLOSE del punto `pedido`

> El pedido se parte en estados y en los hechos que los autorizan. Aquí aparece un hueco
> de negocio que la ronda 2 no vio: **la zona**.

## 3.1 · `estado-pedido` → SE PARTE en su máquina de estados
- `estado-creado` — ATÓMICA. El cliente confirma; el pedido existe con su oferta congelada.
- `estado-aceptado-tienda` — **ABIERTA** en su regla: ¿acepta la tienda o entra directo?
- `estado-en-cocina` — ATÓMICA. La tienda lo declara; el cliente lo ve.
- `estado-listo` — ATÓMICA. Hecho con hora: es el que decide la espera en tienda.
- `estado-en-oferta` — ATÓMICA. Sin rider todavía.
- `estado-aceptado-rider` — ATÓMICA. Con hora y con rider.
- `estado-recogido` — ATÓMICA. Arranca el reloj de la entrega.
- `estado-entregado` — ATÓMICA. Con prueba (`prueba-entrega`).
- `estado-cerrado` / `estado-fallido` — ATÓMICA. Cierra el ciclo y dispara devengo.
- **Invariante**: ningún estado avanza sin hecho con hora. Un pedido no "se supone" listo.

## 3.2 · `captura-pedido` → SE PARTE en 2
- `validacion-de-direccion` — ATÓMICA. Dirección declarada y aceptable.
- `zona-servida` — **ABIERTA**. ¿Qué zonas cubre el mercado? ¿Se define por radio, por
  barrio o por tienda? **No declarado** — y sin zona no se puede decir si un pedido es
  servible antes de cogerlo. Es el hueco que la ronda 2 no vio.

## 3.3 · `compromiso-recogida` → SE PARTE en 2
- `hora-comprometida` — ATÓMICA. La tienda declara cuándo estará listo. Es su promesa y
  queda registrada.
- `cambio-de-hora` — **ABIERTA**. ¿Puede moverla después de aceptar? Si sí, se mide
  igual, pero hay que declararlo (quien mueve la hora, mueve la espera).

## 3.4 · Lo demás ya es hoja
`aviso-tienda` · `aviso-cliente` (puentes), `estado-cocina-visible` (proyección podada),
`rechazo-cancelacion` (transiciones permitidas — con la regla de quién paga abierta).

## SUELO DE ESTA RAMA
**7 atómicos · 4 abiertos · 0 repetidos.** La rama queda seca: lo que falta es decisión
del dueño (zona, aceptación, cambio de hora), no más descomposición.
