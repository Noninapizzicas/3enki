# PASADA 2 · PUNTO: `tarifa-tres-bandas` (el precio del reparto y el ingreso de Bocaos)

> Sale del hueco CONTRATO de la pasada 1: el cliente estipula el reparto, la tienda
> puede incentivar, Bocaos cobra céntimos. Tres manos en un precio y dos pagos
> separados.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El precio del reparto **no lo pone Bocaos**: lo pone el cliente ("estipula cuánto está
dispuesto a pagar"), lo puede subir la tienda (incentivo) y Bocaos solo se lleva
céntimos por coordinarlo. Es un precio **descubierto en la oferta**, no una tarifa de
plataforma — y por eso Bocaos no puede ser acusado de fijar el precio del trabajo ajeno.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: si el cliente pone poco, nadie acepta y el pedido no sale. → **EMPUJÓN**:
  la oferta sin rider se **ve** (`oferta-sin-rider`) y el cliente puede corregirla (si
  puede: pregunta abierta). El mercado le enseña el precio real, sin que Bocaos lo fije.
- **FRENO**: la tienda puede usar el incentivo para tapar su lentitud. → **EMPUJÓN**:
  el incentivo es visible al rider **pero no borra** el histórico de espera
  (`historico-restaurante`): se suma al importe, no a la reputación.
- **FRENO**: los céntimos de Bocaos son un coste para el rider, que puede decidir no
  aceptar. → **EMPUJÓN**: `contrato-tramos` con importe declarado + `simulador-tramos`
  para ver el efecto antes de fijarlo; y la cuota del rider se ve en su cartera.
- **FRENO**: sin retención, Bocaos no puede compensar ni descontar de un flujo ajeno. →
  **EMPUJÓN**: `reparto-del-pago` (un precio → dos cobros a dos beneficiarios) y, para
  los cargos por fallo, el mecanismo de efectividad queda **abierto**.
- **FRENO**: un precio que cambia después de pagado rompe la confianza. → **EMPUJÓN**:
  la oferta del cliente y el incentivo **se congelan** con el pedido.

### 3 · CONTRATO (el mapa del dinero — lo que Bocaos toca y lo que no)
```
cliente  →  tienda    el importe de la comida          (Bocaos no lo toca)
cliente  →  rider     el importe del reparto           (Bocaos no lo toca)
tienda   →  Bocaos    tramo 1 fijo + tramo 3 céntimos  (lo único que Bocaos cobra)
rider    →  Bocaos    tramo 3 céntimos                 (lo único que Bocaos cobra)
```

### 4 · NO-OBJETIVOS
- NO fija el precio del reparto ni lo subvenciona.
- NO cobra comisión sobre el ticket ni porcentaje de la comida.
- NO altera el precio que el cliente estipuló (ni " surge" ni descuento dinámico propio).
- NO retiene, adelanta ni compensa con dinero propio.
- NO cobra por aceptar (solo por reparto coordinado, si el dueño lo decide así).

### 5 · PREGUNTAS ABIERTAS
- **Importes**: tramo 1 €/mes, tramo 3 céntimos al rider y céntimos a la tienda (F0 q1).
- ¿Hay mínimo y máximo de oferta del cliente? ¿redondeo en céntimos?
- ¿El cliente ve el desglose completo (comida + reparto + incentivo) antes de pagar?
- ¿El incentivo de la tienda va siempre al que acepta o se reparte entre los del viaje?
- ¿Se devenga comisión si el pedido acaba en fallo o cancelación? ¿quién la paga?
- ¿El IVA y quién factura a quién? (no declarado; enlaza con responsabilidad legal).

## Hojas que salen (→ disección)
`oferta-cliente` · `incentivo-restaurante` · `precio-reparto` · `comision-coordinacion` ·
`reparto-del-pago` · `contrato-tramos`
