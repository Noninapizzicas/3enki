# PASADA · ROL: `cliente` (dos caras: la tienda que paga y el cliente final que no es de Bocaos)

> El rol cliente en Bocaos tiene **dos caras** y solo una paga:
> · **cliente-pagador** = el restaurante (compra la coordinación).
> · **cliente-final** = el de la tienda (compra la comida y el reparto; **no es cliente de
>   Bocaos** y nunca debe saber que existe).
> Se esquematizan juntas porque el sistema debe servirlas sin confundirlas.

## Prisma de los 5 huecos DESDE LA SILLA DEL ROL CLIENTE

### 1 · IDENTIDAD — ¿qué es el negocio para cada cara?
- Para el **cliente-pagador**: su escaparate y su cuenta. Lo que compra es que su tienda
  venda más sin ceder su cliente.
- Para el **cliente-final**: **su tienda**, con su marca. Lo único que nota de Bocaos es
  que el pedido se ve, llega y se prueba.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: el cliente-pagador no sabe si le está yendo bien o mal hasta fin de mes. →
  **EMPUJÓN**: `estado-cuenta-parte` (devengado, cobrado, pendiente, cargos por fallo, con
  su evidencia).
- **FRENO**: el cliente-pagador no ve el efecto de su cocina en el mercado. → **EMPUJÓN**:
  `panel-tienda` (su espera medida, los pedidos que se le fueron sin rider).
- **FRENO**: el cliente-final no tiene cuenta y no puede consultar nada. → **EMPUJÓN**:
  el pedido es su identificador: estado, seguimiento y prueba, sin registro.
- **FRENO**: si Bocaos aparece en la conversación, el restaurante se asusta. → **EMPUJÓN**:
  `guarda-marca-ajena` (invariante) + `reclamacion-por-la-tienda`.

### 3 · CONTRATO — qué espera VER y ACTUAR + LÓGICA que exige
- **VER (pagador)**: su cuenta, sus cargos con evidencia, su espera, sus pedidos perdidos.
- **ACTUAR (pagador)**: pagar su cuota, disputar un cargo, subir su incentivo, pausar su
  plaza, cambiar su hora comprometida.
- **VER (final)**: carta, precio cerrado, estado, quién viene, prueba de entrega.
- **ACTUAR (final)**: pedir, ofertar su reparto, dar instrucciones de acceso, confirmar la
  entrega, reclamar **a su tienda**.
- **LÓGICA**: `estado-cuenta-parte` (proyección de devengos y cargos por parte) + todo lo
  de la plaza (`carta-publica`, `carrito-tienda`, `precio-cerrado`).

### 4 · NO-OBJETIVOS del rol cliente
- El **pagador** NO administra el mercado: no ve otras tiendas, no ve el margen de Bocaos.
- El **final** NO tiene cuenta, ni puntos, ni historial entre tiendas, ni notificaciones de
  Bocaos, ni voz en la adjudicación más allá de su hecho medido.
- Ninguno de los dos **juzga** un fallo: lo aporta como hecho o lo disputa con evidencia.

### 5 · PREGUNTAS ABIERTAS
- ¿El cliente-pagador ve el importe que el cliente-final ofertó por el reparto? (transparencia
  de la oferta frente a privacidad del cliente).
- ¿Puede el cliente-pagador **pausar** su plaza sin perder la carta y el histórico?
- ¿El cliente-final puede reclamar directamente a Bocaos por un fallo de reparto? El
  esquema dice que no (va por la tienda) — **confirmarlo**, porque es lo que protege el modelo.
- ¿Se le muestra al cliente-final el desglose completo (comida, reparto, incentivo)?

## PIEZAS QUE SOLO EMERGEN DESDE ESTE ROL (al árbol)
- **`estado-cuenta-parte`** — REFLEJO. La cuenta de cada parte (devengado, cobrado,
  pendiente, cargos) proyectada para que la vea el que la debe. Sin esto, la tienda y el
  rider viven a ciegas y la confianza se rompe en la primera factura.

## VALIDACIÓN CRUZADA
- `panel-tienda`, `cartera-rider`, `precio-cerrado`, `registro-cliente-tienda` se refuerzan.
- **Hallazgo**: el rol cliente-final **no genera piezas propias: genera renuncias**. Su
  única aportación al árbol son invariantes (`guarda-marca-ajena`, `guarda-propiedad-cliente`)
  y la prohibición de la app. Es la prueba, desde la silla del cliente, de que la renuncia
  del par 6 es estructural y no cosmética.
