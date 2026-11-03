# PASADA · INTERLOCUTOR `restaurante`

> Perspectiva: **la tienda**, la que paga. Su canal es el TPV y su escaparate. Es la venta más
> difícil del negocio (F0, par 4) y, con el matiz, es también **la que emite el disparador**.

## 1 · IDENTIDAD — ¿qué es Bocaos para ella?
**Su infraestructura, no su socio.** El TPV, el escaparate con su marca, los riders que pasan
por delante de su puerta y la medida de su propia cocina.

Y desde la F0 §6 hay una segunda cosa: **el botón que arranca el mercado**. Cuando marca
`pedido.listo`, empieza la cadena. Hasta entonces su pedido no existe para nadie.

## 2 · RESTRICCIONES (freno → empujón)

- **FRENO**: *"me van a quitar al cliente"* (par 4). → **EMPUJÓN**: `guarda-propiedad-cliente`
  (L02) + `registro-cliente-tienda` (D05) + no hay app de cliente. El cliente es suyo por
  construcción, no por promesa.

- **FRENO**: *"marcar listo me compromete"*. Marcar es declarar una hora, y esa hora se mide y
  se publica al rider antes de que acepte.
  → **EMPUJÓN**: `puntualidad-declarada` (L03) y `panel-tienda` (L01). **El mercado no la
  castiga: la hace visible.** Una cocina lenta recibirá propuestas peores o más caras, sin que
  nadie la sancione (empujón gemelo: `incentivo-tienda`, E02 — puede comprar su propia
  impuntualidad).

- **FRENO**: *"¿y si mi comida se queda en el mostrador esperando rider?"*
  → **EMPUJÓN**: aquí el matiz **le favorece** y hay que decirlo: con el enlace por trayecto,
  hay **más riders pasando cerca** por unidad de tiempo, y el umbral de espera (**4 min**)
  exige que el que venga llegue cuando está listo. El enlace no es un coste para la tienda: es
  menos comida fría.

- **FRENO**: *"no quiero mi carta en dos sitios"*. → **EMPUJÓN**: `carta-publica` (D02),
  conversor de una sola fuente.

- **FRENO**: *"no sé si esto me sale más caro que Glovo"*. → **EMPUJÓN**: `simulador-tramos`
  (N02) y `estado-cuenta-parte` (Q01) con la comparación hecha con sus números.

## 3 · CONTRATO
Da: la carta, su marca, su cliente y la hora de listo. Recibe: escaparate, pedidos, riders y
la medida de su cocina. Paga: tramo 1 + tramo 3.

## 4 · NO-OBJETIVOS — lo que NO quiere
- No quiere que Bocaos hable con su cliente. (`guarda-marca-ajena`.)
- No quiere que su cliente aparezca en otra tienda. (`guarda-propiedad-cliente`.)
- No quiere que le ordenen la carta ni el escaparate. (`neutralidad-orden`.)
- No quiere que le obliguen a cocinar a una hora fija para que el reparto cuadre. **Y eso es
  exactamente lo que el enlace por trayecto evita**: no hay hora de corte, hay umbrales sobre
  su comida tal y como está.

## 5 · PREGUNTAS ABIERTAS
Q36 (¿acepta el pedido o entra directo? ¿puede rechazarlo y quién paga?) · Q19 (¿ve el
incentivo? ¿lo paga él?) · Q33 (¿puede subir su incentivo después de emitida la propuesta?) ·
Q28 (¿cuánto puede tardar en marcar listo antes de que salte el aviso?) · Q32 (¿consecuencia
por cocina lenta repetida?) · Q23 (¿exclusividad? ¿permanencia?)

## Piezas que SOLO se ven desde su silla
- `panel-tienda` (REFLEJO) — su espera medida, **la misma información que el rider**.
- `guarda-propiedad-cliente` (REFLEJO) — sus clientes no cruzan.
- `puntualidad-declarada` (REFLEJO) — su `hora-de-listo` frente a lo prometido, publicada antes
  de que el rider acepte.
- `resumen-para-la-tienda` (**FUZZY**) — el informe periódico **en palabras**, sobre hechos ya
  medidos. El agente redacta; no descubre nada.

**Refuerza**: `carta-publica` (D02), `contrato-tramos` (E06), `terminos-parte` (I08),
`hora-de-listo` (C04).
