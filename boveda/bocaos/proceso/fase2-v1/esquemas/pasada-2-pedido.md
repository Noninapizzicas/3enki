# PASADA 2 · PUNTO: `pedido` (el hecho que viaja)

> Sale del hueco CONTRATO de la pasada 1: el pedido va a **esa** tienda y las tres
> partes tienen que ver lo mismo.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El pedido es **el único objeto que las tres partes comparten**: el cliente lo creó, la
tienda lo cocina, el rider lo mueve. Su estado es la verdad común y su historial es la
prueba. No es un ticket (el ticket lo emite la tienda) ni una cuenta (el cliente no
tiene cuenta): es un hecho con hora en cada salto.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: nadie puede avanzar el pedido sin un hecho que lo sostenga. → **EMPUJÓN**:
  `estado-pedido` solo transiciona con hecho medido (aceptación, hora de listo, recogida,
  entrega) — no con una declaración de buena fe.
- **FRENO**: el pedido se pierde entre la llamada y la cocina. → **EMPUJÓN**:
  `aviso-tienda` por evento (una sola entrega, no un teléfono) y `captura-pedido` de a uno.
- **FRENO**: la tienda puede no contestar y el pedido queda colgado. → **EMPUJÓN**:
  estado de rechazo explícito (`rechazo-cancelacion`) — pero **si la tienda puede
  rechazar y quién paga ese rechazo no está declarado** (pregunta abierta).
- **FRENO**: el cliente no tiene cuenta ni app, así que no se le puede exigir nada. →
  **EMPUJÓN**: el pedido lo identifica; `aviso-cliente` va por el canal de la tienda y
  `estado-cocina-visible` le da el estado sin pedirle registro.
- **FRENO**: si el pedido se cancela después de que el rider aceptó, alguien pierde. →
  **EMPUJÓN**: la cancelación entra como hecho en `adjudicacion-fallos`.

### 3 · CONTRATO
- Cliente → pedido + dirección + oferta de reparto. Recibe estado y precio cerrado.
- Tienda → aceptación + `compromiso-recogida` (la hora a la que cocina). Recibe el
  pedido y su propio histórico de cumplimiento.
- Rider → aceptación. Recibe los datos de recogida y entrega, y el importe.
- Bocaos → el estado compartido y el hecho medido de cada salto. No decide la cocina.

### 4 · NO-OBJETIVOS
- NO es un chat libre entre las partes (el chat es solo rider↔cliente y enmascarado).
- NO es el catálogo ni el TPV: la carta vive en la tienda.
- NO decide cuándo está lista la comida: lo declara la tienda y se mide.
- NO modifica precios después de pagados.

### 5 · PREGUNTAS ABIERTAS
- ¿La tienda **acepta explícitamente** o el pedido entra directo a cocina? ¿hay tiempo
  máximo de aceptación?
- ¿Se puede **modificar** un pedido ya aceptado (añadir, quitar)? ¿quién asume el cambio?
- ¿Hay pedido mínimo, horario de carta, límite de zona?
- ¿Puede la tienda **cambiar la hora comprometida** después de aceptar? Si sí, se mide
  igual — pero hay que declararlo.

## Hojas que salen (→ pasada 3 / disección)
`captura-pedido` · `estado-pedido` · `aviso-tienda` · `compromiso-recogida` ·
`estado-cocina-visible` · `aviso-cliente` · `rechazo-cancelacion`
