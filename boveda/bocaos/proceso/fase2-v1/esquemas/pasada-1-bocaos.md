# PASADA 1 · Prisma global del SUJETO "Bocaos"

> **Fase 2 · esquematizar-negocio · vertical `bocaos`.** Sujeto leído de la F0
> (`que_es + que_vende + como_lo_elabora`), no preguntado. Vertical, no proyecto:
> aquí no entra ningún restaurante, barrio, precio ni rider concreto.
>
> **Sujeto:** un mercado de bocados de muchas tiendas donde el cliente es de la
> tienda, el repartidor es autónomo y Bocaos vende **coordinación** — el suelo, el
> escaparate y la medida que permite adjudicar los fallos sin juzgar.
>
> **Medida maestra (derivada de la F0):** la salud del mercado se mide en
> **aceptaciones**, no en ventas. Un pedido que no encuentra rider es una venta que
> no existe; un rider que pierde dinero en cada reparto es un mercado que se queda
> sin riders (F0 §4: "el que pierde siempre es el rider… y sin riders no hay mercado").

---

## Prisma de los 5 huecos (ronda 1)

### 1 · IDENTIDAD — ¿qué es exactamente el sujeto?
Bocaos es **el suelo de un mercado de dos lados con una tercera parte que ejecuta**:
la tienda pone la oferta y el cliente, el repartidor autónomo pone la capacidad, y
el cliente final —que no es de Bocaos— pone el pedido. Bocaos no vende comida, no
vende reparto ni cobra el ticket: vende **que las tres partes se encuentren y que el
fallo se pague sin que nadie opine**.

Lo que se vende, en tramos:
```
tramo 1  el TPV completo de la tienda            fijo mensual
tramo 2  el escaparate propio en el mercado      incluido en el tramo 1
tramo 3  la coordinación de cada reparto         céntimos al rider y a la tienda
```
La unidad de negocio no es la tienda ni el pedido: es **el reparto aceptado**. Todo
lo que Bocaos cobra y todo lo que Bocaos promete se cuenta en repartos aceptados.

### 2 · RESTRICCIONES — qué le limita (freno → empujón, ninguna como muro)
| Freno declarado | Estado que protege | Empujón (pieza construible) |
|---|---|---|
| No toca el dinero del ticket ni del reparto | no ser banco, no tener riesgo regulatorio | el cobro es **directo entre las partes**; la única palanca de Bocaos es el acceso a la plaza y su propia cuota (`guarda-no-retencion`, `cobro-gestion`) |
| No tiene riders contratados | no ser empleador ni falso autónomo | cada aceptación es **un contrato puntual medido**; nada se le impone al rider (`guarda-sin-exclusividad`, `aceptacion-atomica`) |
| El cliente es de la tienda | que el restaurante no tenga miedo | la plaza **jamás** firma ni capta: `guarda-marca-ajena`, `guarda-propiedad-cliente`, y no hay app de cliente |
| No hay app de cliente | la renuncia que sostiene el modelo | el canal es el escaparate de la tienda (puerto abierto) |
| El rider es autónomo y se puede ir sin avisar | que su trabajo sea libre | la oferta se diseña para que **aceptar sea su mejor opción**: importe visible, espera declarada, histórico del restaurante, enlazado |
| Ninguna regla de fallo está cuantificada (las N) | que el fallo se pague sin opinar | `ventana-espera` declarable + `hecho-verificado` sobre relojes medidos |
| El mercado no puede ordenar su escaparate | que Bocaos no elija por el cliente | `neutralidad-orden` (invariante con test) |

### 3 · CONTRATO — qué intercambia con cada parte
```
con el CLIENTE FINAL      da: un escaparate con precio cerrado, estado vivo y prueba de entrega
                          recibe: nada suyo. Su confianza es de la tienda, no de Bocaos.
con la TIENDA             da: escaparate + pedidos + riders + la medida de su propia cocina
                          recibe: tramo 1 (fijo) + tramo 3 (céntimos por reparto)
con el REPARTIDOR         da: ofertas con información suficiente para decidir, y el importe íntegro
                          recibe: tramo 3 (céntimos por reparto aceptado)
con el MERCADO (sí mismo) da: la medida y la adjudicación
                          recibe: que el pedido encuentre rider sin que el rider pierda
```

### 4 · NO-OBJETIVOS — qué NO es (cada uno, con la pieza que lo sostiene)
- **No cobra el ticket** ni participa de su margen → `guarda-no-retencion`.
- **No retiene** el dinero de nadie ni lo adelanta: no es banco.
- **No contrata riders** ni les asigna turnos, zonas o pedidos.
- **No tiene app de cliente** ni cuenta de cliente: no capta demanda.
- **No ordena el mercado**: sin ranking, sin destacados, sin prioridad comprada.
- **No juzga fallos**: mide. Donde otro pone un agente que opina, Bocaos pone un reloj.
- **No garantiza la comida** ni la cocina lenta: solo la hace visible.
- **No garantiza que haya pedidos el primer mes**: ese problema no lo arregla software.
- **No es transportista** (y de qué responde, está sin declarar: ver hueco 5).

### 5 · PREGUNTAS ABIERTAS (ley de cero supuestos — nada se estima)
1. **Precio de la coordinación** (F0): ¿cuánto el tramo 1 al mes? ¿cuántos céntimos el tramo 3, al rider y a la tienda?
2. **Mecanismo de adjudicación** (F0): el principio está decidido; **cómo se prueba y quién decide**, no.
3. **Responsabilidad legal** (F0): ¿de qué responde Bocaos en un reparto hecho por un autónomo?
4. Los valores de N: ¿cuántos minutos de espera en tienda, cuántos en el portal, cuántos para llegar tras aceptar?
5. ¿Cómo se hace **efectivo** un cargo por fallo si Bocaos no toca el dinero?
6. ¿Puede el cliente **subir su oferta** de reparto si nadie acepta? ¿y la tienda?
7. ¿Puede la tienda **rechazar** un pedido? ¿quién paga ese rechazo?
8. ¿El enlazado puede unir pedidos de **tiendas distintas**, o solo de la misma tienda?

---

## EL ESLABÓN LIMITANTE (lo identifico yo, del flujo declarado)

**Flujo declarado (F0):** el cliente pide en la web de su tienda → el pedido va a esa
tienda → la tienda cocina → **el pedido se oferta a repartidores** → un rider cercano
acepta (y puede enlazar 2–3) → recoge → entrega → cliente paga a la tienda y al rider
→ tienda y rider pagan a Bocaos.

**ESLABÓN LIMITANTE = LA ACEPTACIÓN DEL REPARTIDOR** (el paso oferta → aceptación,
con el enlazado dentro). No el escaparate, no el TPV: la propia F0 lo dice —*"eso es
lo que hay que arreglar primero, antes que el escaparate o el TPV"*—. Razones, todas
leídas del flujo:

1. Es **el único paso sin obligación en ninguna de las dos partes**: nadie contrata al
   rider, nadie le obliga a aceptar, y puede marcharse sin avisar (F0 §4).
2. Es **el paso que decide si el pedido existe**: sin aceptación no hay reparto, y sin
   reparto la venta del restaurante se cae con él.
3. Es **donde se acumulan todas las pérdidas**: de las tres primeras fricciones, en las
   tres el que pierde es el rider (espera, portal, cliente que no baja).
4. Su capacidad es la **capacidad de todo el mercado**: repartos aceptados por hora y
   por zona. Ni la cocina ni el escaparate pueden superarla.

### El cuello expandido al máximo (frenos → empujones)
| Freno del cuello | Empujón (pieza que lo abre) |
|---|---|
| El rider decide a ciegas | `visibilidad-oferta` + `espera-declarada` + `historico-restaurante`: importe, distancia, espera prevista y cómo es esa cocina |
| La espera no está pagada | `ventana-espera` + `hecho-verificado` + `regla-pago-fallo`: la espera se mide y se cobra a quien la causó |
| Aceptar no le compensa | `precio-reparto` (oferta del cliente + incentivo de la tienda) + `enlazado-viaje` (2–3 pedidos, 3 importes, 1 trayecto) |
| Puede irse sin avisar | nada lo retiene: solo se le da la razón para quedarse (`guarda-sin-exclusividad`, `cartera-rider`) |
| Dos aceptan a la vez | `aceptacion-atomica`: el primero que acepta se lo queda, sin prioridad comprada |
| Nadie acepta | `oferta-sin-rider` dispara a la sala; si el cliente puede subir su oferta, es pregunta abierta |
| El enlazado retrasa al cliente | `tope-enlace` declarable + `paradas-del-viaje` con reloj por pedido |
| La cercanía no puede ser una puntuación oculta | `elegibilidad-rider`: distancia declarada y verificable, sin nota |

**Los empujones del cuello son el grupo C (oferta-reparto) + F (adjudicación) del
árbol: el corazón del esquema.**

---

## SUB-PRODUCTOS de la ronda 1 (cada uno → su pasada-2)

1. `plaza-tienda` — el escaparate propio por tienda (tramo 2).
2. `pedido` — el hecho que viaja: tienda → rider → cliente, con su estado.
3. `oferta-reparto` — la oferta y la aceptación (**ESLABÓN LIMITANTE**).
4. `reparto-medido` — la ejecución convertida en hechos con hora y prueba.
5. `tarifa-tres-bandas` — el precio del reparto formado por tres manos y pagado en dos direcciones.
6. `adjudicacion-fallos` — las reglas que hacen pagar el fallo sin juzgar.
7. `liquidacion-coordinacion` — los tres tramos y el cobro semanal, sin retener.
8. `sala-mercado` — la operación humana mínima del mercado.

Ninguno se queda aquí: cada uno vuelve al prisma en su `pasada-2`.
