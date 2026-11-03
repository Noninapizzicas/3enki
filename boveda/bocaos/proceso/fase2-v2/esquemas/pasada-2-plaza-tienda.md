# PASADA 2 · PUNTO: `plaza-tienda`

> Sale del hueco CONTRATO de la pasada 1 (lo que la tienda compra: el tramo 2). No cambia con
> el matiz, pero **sí cambia una cosa**: ahora el escaparate es también el sitio donde la
> tienda emite `pedido.listo`, o sea el borde donde nace el disparador.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El escaparate **de la tienda**, con su marca y su cliente, colgado del suelo del mercado. No
es una ficha en un directorio: es una tienda con dueño. Bocaos pone el suelo y el software; no
pone la marca, no pone el cliente y no pone la comida.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: la tienda teme que le quiten al cliente (par 4 de la F0).
  → **EMPUJÓN**: `marca-tienda` + `registro-cliente-tienda` aislado + `guarda-marca-ajena`: el
  cliente no tiene cuenta de Bocaos porque Bocaos no tiene dónde ponerla.
- **FRENO**: no quiere cambiar su TPV ni tener la carta en dos sitios.
  → **EMPUJÓN**: `carta-publica` como **conversor**: una sola fuente (su TPV), una vista
  pública podada. El escaparate proyecta, no almacena una segunda carta.
- **FRENO**: dos tiendas del mismo barrio compiten y el mercado las pone al lado.
  → **EMPUJÓN**: `neutralidad-orden` — sin destacados, sin ranking pagado. Si Bocaos ordena,
  Bocaos elige, y entonces es Glovo.

### 3 · CONTRATO
Da: su carta, su marca y su cliente. Recibe: un escaparate propio, precio cerrado antes de
pagar y la medida de su propia cocina (L01, L03).

### 4 · NO-OBJETIVOS
No capta demanda (no hay app de cliente) · no cruza clientes entre tiendas · no ordena el
escaparate · no vende posiciones.

### 5 · PREGUNTAS ABIERTAS
¿Puede el cliente comprar como invitado? (Q39) · ¿ve el desglose comida/reparto? (Q39) · ¿la
carta admite stock en vivo o solo disponibilidad? · ¿quién escribe la ficha: la tienda o la
sala?

## Hojas
`marca-tienda` (CUSTODIO) · `carta-publica` (CONVERSOR) · `precio-cerrado` (REFLEJO) ·
`carrito-tienda` (CUSTODIO) · `registro-cliente-tienda` (CUSTODIO) · `plaza-publica` (REFLEJO) ·
`neutralidad-orden` (REFLEJO)
