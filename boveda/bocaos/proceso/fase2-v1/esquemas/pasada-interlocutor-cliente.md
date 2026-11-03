# PASADA · INTERLOCUTOR: `cliente` (el cliente de la tienda)

> Actor del mapa cerrado en F0: canal = "web de su tienda (no hay app de cliente)",
> relación = "pide y paga la comida y su reparto". Este actor es el que **más piezas
> produce por ausencia**: casi todo lo que necesita Bocaos NO debe hacerlo.

## Prisma de los 5 huecos DESDE SU SILLA

### 1 · IDENTIDAD — ¿qué es Bocaos para el cliente?
**Nada.** No existe. Lo que existe es **su tienda**, que ahora le deja pedir, ver el
estado y saber quién viene. Si el cliente llega a saber que Bocaos existe, es que Bocaos
está haciendo marketing con la demanda del restaurante — y eso rompe el modelo.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: no quiere otra app ni otro registro. → **EMPUJÓN**: nada que instalar;
  compra en la web de su tienda, como invitado o con la cuenta que ya tiene ahí.
- **FRENO**: no sabe quién viene. → **EMPUJÓN**: `seguimiento-vivo` + nombre del rider +
  `chat-enmascarado` (habla sin dar su número).
- **FRENO**: no sabe cuándo llega ni qué le cobran. → **EMPUJÓN**: `estado-cocina-visible`
  + `precio-cerrado` con el reparto como línea propia antes de pagar.
- **FRENO**: si algo va mal, no sabe a quién reclamar (no tiene cuenta de Bocaos). →
  **EMPUJÓN**: `reclamacion-por-la-tienda`: la queja entra por la tienda y la sala la ve
  como disputa. Bocaos nunca atiende al cliente final directamente.
- **FRENO**: paga dos cosas a dos sujetos y eso se siente raro. → **EMPUJÓN**:
  `reparto-del-pago` con **un solo acto de compra** y dos cobros separados y explicados.

### 3 · CONTRATO — qué da y qué recibe
- **Da**: su pedido, su dirección, su oferta de reparto (él estipula cuánto paga) y, si
  no baja, su espera medida.
- **Recibe**: la comida de su tienda, el estado en vivo, el precio cerrado, la prueba de
  entrega y un rider con nombre — **nunca** una cuenta, un punto, un cupón ni una marca
  de Bocaos.

### 4 · NO-OBJETIVOS — qué NO quiere del negocio
- No quiere publicidad ni notificaciones de Bocaos.
- No quiere que sus datos viajen a otra tienda: `guarda-propiedad-cliente`.
- No quiere gamificación ni "puntos".
- No quiere que su oferta de reparto se use para subastar su comida.
- No quiere que le llamen para valorar: si valora, valora a su tienda.

### 5 · PREGUNTAS ABIERTAS
- ¿Compra como invitado o con cuenta de la tienda?
- ¿Ve el importe del reparto desglosado del incentivo de la tienda? ¿Le importa?
- Si su oferta no encuentra rider: ¿se le avisa, puede subirla, se cancela? (no declarado)
- ¿Qué pasa si no está en casa y el rider ya llegó? (¿vuelve a la tienda? ¿se pierde?)
- ¿Puede reprogramar un pedido?

## PIEZAS QUE SOLO EMERGEN DESDE AQUÍ (al árbol)
- **`reclamacion-por-la-tienda`** — PUENTE. La única vía de queja del cliente final, y
  pasa por la tienda: si no existe, el cliente se queja en Google y no en el sistema.
- **`guarda-marca-ajena`** — REFLEJO. Invariante: ninguna comunicación al cliente final
  lleva marca de Bocaos. Es la renuncia del par 6 convertida en test.

## VALIDACIÓN CRUZADA
- `precio-cerrado`, `registro-cliente-tienda`, `seguimiento-vivo`, `chat-enmascarado`,
  `reparto-del-pago` se refuerzan desde aquí.
- **Conflicto detectado**: el cliente vive "un solo acto de compra", pero el modelo exige
  dos cobros a dos beneficiarios. El esquema lo resuelve en `reparto-del-pago` (una
  confirmación, dos liquidaciones) — y **no** en una pasarela común que obligaría a Bocaos
  a tocar el dinero.
