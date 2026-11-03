# PASADA 2 · PUNTO: `liquidacion-coordinacion` (el único dinero que Bocaos toca)

> Sale del hueco CONTRATO de la pasada 1: tres tramos, dos pagadores (tienda y rider),
> corte semanal, cero retención.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
La liquidación de **la coordinación**: lo que la tienda y el rider deben a Bocaos por
usar el suelo. No liquida la comida ni el reparto (eso lo pagan y lo cobran ellos). Su
virtud es también su límite: Bocaos cobra su cuota y **no tiene ninguna palanca sobre el
dinero de los demás**.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: sin retención no hay descuento automático de un fallo. → **EMPUJÓN**:
  `cargo-fallo` se compensa, si el dueño lo decide, **contra la propia cuota** — es el
  único dinero sobre el que Bocaos tiene poder.
- **FRENO**: el rider cobra por su cuenta y su cuota es un gasto que puede no querer
  pagar. → **EMPUJÓN**: `cartera-rider` (ve lo que gana y lo que debe) + suspensión de la
  plaza por impago, **nunca** del reparto ya hecho.
- **FRENO**: cobrar fijo + céntimos exige devengar por pedido sin fallos. → **EMPUJÓN**:
  `devengo` determinista y `factura-gestion` con una sola frontera de formato.
- **FRENO**: el corte semanal deja siete días de exposición a impago. → **EMPUJÓN**:
  ¿fianza o prepago? **no declarado** (pregunta abierta).
- **FRENO**: una tienda que no paga sigue vendiendo. → **EMPUJÓN**: `impago-gestion`
  con regla de suspensión declarada (hoy sin definir).

### 3 · CONTRATO
```
tienda  paga  tramo 1 (fijo mensual) + tramo 3 (céntimos por reparto)
        recibe  escaparate + pedidos + riders + medida
rider   paga  tramo 3 (céntimos por reparto aceptado)
        recibe  ofertas + importe íntegro del cliente + medida
Bocaos  paga  nada
        recibe  su cuota semanal, sin tocar el resto
```

### 4 · NO-OBJETIVOS
- NO es banco: no adelanta, no financia, no guarda dinero de nadie.
- NO liquida al rider por el cliente (el cliente le paga directo).
- NO cobra el ticket ni un porcentaje de la comida.
- NO compensa unilateralmente sin regla declarada.

### 5 · PREGUNTAS ABIERTAS
- Día y hora del **corte semanal**; ¿semana natural o rodante?
- **Forma de cobro** al rider y a la tienda (canal declarable), y qué pasa si falla.
- ¿Hay **fianza, prepago o permanencia**? ¿qué pasa si una tienda deja de pagar y sigue
  vendiendo?
- ¿Se factura con impuestos y quién factura a quién? (enlaza con legal).
- ¿La cuota del rider se cobra por reparto aceptado o por reparto ofertado?

## Hojas que salen (→ disección)
`devengo` · `ciclo-semanal` · `factura-gestion` · `cobro-gestion` · `impago-gestion` ·
`guarda-no-retencion`
