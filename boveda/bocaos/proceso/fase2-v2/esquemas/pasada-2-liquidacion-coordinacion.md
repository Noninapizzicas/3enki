# PASADA 2 · PUNTO: `liquidacion-coordinacion`

> Sale del hueco CONTRATO de la pasada 1. Es el **único** dinero de Bocaos y por eso es el
> punto donde el modelo se puede morir de éxito: una cuota mal diseñada convierte a Bocaos en
> un socio del enlace en vez de un cobrador por coordinación.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
Los tres tramos y el cobro semanal: el tramo 1 fijo por tienda, el tramo 2 (escaparate)
incluido en el 1, y el tramo 3 (céntimos por pedido aceptado) a la tienda y al rider.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: si la cuota crece con los pedidos enlazados, Bocaos gana más cuanto más enlaza —
  y entonces el umbral de retraso compite con su propio ingreso.
  → **EMPUJÓN**: `guarda-no-captura-del-ahorro` (A32) + `devengo` que cuenta **pedido
  aceptado**, no kilómetro ni viaje.
- **FRENO**: si un pedido falla, ¿se devenga? Nadie lo ha decidido.
  → **EMPUJÓN**: `devengo` con la regla explícita y una prueba por pedido; el valor, **Q18**.
- **FRENO**: cobrar a un rider autónomo cada semana puede parecer un salario al revés.
  → **EMPUJÓN**: `factura-gestion` (conversor devengo→documento) y `cobro-gestion` por el canal
  que él declare. Con IVA y forma jurídica, **Q4**.

### 3 · CONTRATO
Da: la coordinación, medida y explicada. Recibe: una cuota. **No toca el ticket ni el reparto**
(`guarda-no-retencion`).

### 4 · NO-OBJETIVOS
No retiene · no adelanta · no presta · no cobra por éxito de venta · no cobra por kilómetro
ahorrado.

### 5 · PREGUNTAS ABIERTAS
Q14 · Q4 (impuestos y quién factura a quién) · Q18 · Q26 (día y hora del corte, qué pasa si el
cobro falla) · Q5 (¿fianza o prepago?) · ¿se devenga si el pedido se cancela tras aceptar?

## Hojas
`devengo` (REFLEJO) · `ciclo-semanal` (CUSTODIO) · `factura-gestion` (CONVERSOR) ·
`cobro-gestion` (PUENTE) · `impago-gestion` (REFLEJO) · `guarda-no-retencion` (REFLEJO)
