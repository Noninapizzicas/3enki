# PASADA 2 · PUNTO: `tarifa-tres-bandas`

> **Heredada de la pasada 2** (`fase2-v2/esquemas/pasada-2-tarifa-tres-bandas.md`) y revalidada contra la F0 §7.
> E. El contratante cambia: la tienda contrata y paga a LA PLAZA, no al nacional. Delta en `pasada-2-liquidacion-federada.md`.
> Se reproduce aquí para que `esquemas/` quede completo; los deltas de la tercera pasada
> están en `pasada-2-corte-de-piezas.md` y en `esquema.md` §1.

> Sale del hueco CONTRATO de la pasada 1. Con el matiz, este punto gana una función nueva y
> crítica: **hacer calculable `cobra` antes de proponer**. Si el precio no está compuesto
> cuando llega `pedido.listo`, el cuarto umbral no se puede evaluar y no hay propuesta.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El precio del reparto, formado por tres manos y pagado en dos direcciones:

```
lo que estipula el cliente   (oferta-cliente)     ─┐
lo que suma la tienda        (incentivo-tienda)   ─┼→ precio-reparto ─┬→ se paga al rider (íntegro)
                                                    │                  └→ céntimos de Bocaos (por pedido aceptado)
```

El precio se congela con el pedido: el rider ve un número que no va a cambiar mientras decide.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: si Bocaos formara el precio, Bocaos estaría subastando reparto — y sería
  transportista.
  → **EMPUJÓN**: `oferta-cliente` y `incentivo-tienda` son de ellos; `precio-reparto` solo suma.
- **FRENO**: si la cuota de Bocaos dependiera de los kilómetros ahorrados, Bocaos tendría
  interés en enlazar de más — exactamente lo que la F0 §6.5 prohíbe.
  → **EMPUJÓN**: `guarda-no-captura-del-ahorro` (A32): la cuota es por pedido aceptado, nunca
  por km. Test de invariante.
- **FRENO**: cuando nadie acepta hay que subir la oferta, y subirla sin dueño es una ruleta.
  → **EMPUJÓN**: `subida-de-oferta` como acto con autor, con tope y con hora. Quién sube y
  quién paga, **Q17**.

### 3 · CONTRATO
El cliente paga su reparto al rider, íntegro. La tienda paga su cuota a Bocaos. El rider paga
su cuota a Bocaos. **Nadie paga a Bocaos por la comida.**

### 4 · NO-OBJETIVOS
No subasta a la baja · no retiene · no adelanta · no cobra el ticket · no cobra por kilómetro.

### 5 · PREGUNTAS ABIERTAS
Q2 (`cobra` bruto o neto — **esta pieza es la que lo decide**) · Q14 (los tramos) · Q15 (¿el
enlace abarata al cliente?) · Q16 (los km ahorrados, ¿de quién son?) · Q17 (quién sube la
oferta) · Q18 (¿se devenga en un pedido fallido?) · Q19 (¿el cliente ve el incentivo de la
tienda?)

## Hojas
`oferta-cliente` (CUSTODIO) · `incentivo-tienda` (CUSTODIO) · `precio-reparto` (REFLEJO) ·
`comision-coordinacion` (REFLEJO) · `reparto-del-pago` (CONVERSOR) · `contrato-tramos` (CUSTODIO) ·
`subida-de-oferta` (CUSTODIO)
