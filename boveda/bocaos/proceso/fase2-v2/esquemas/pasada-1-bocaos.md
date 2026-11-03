# PASADA 1 · Prisma global del SUJETO "Bocaos"

> **Fase 2 · esquematizar-negocio · vertical `bocaos`** · segunda pasada (la F0 §6 cambió
> el eslabón limitante). Sujeto leído de la identidad, no preguntado.
>
> **Sujeto:** un mercado de bocados de muchas tiendas donde el cliente es de la tienda, el
> repartidor es autónomo y Bocaos vende **coordinación**: el suelo, el escaparate propio y
> una decisión repetida —*a quién le propongo este pedido, ahora, y con qué números se lo
> explico*—.
>
> **Medida maestra:** la salud del mercado se mide en **propuestas aceptadas**, no en
> ventas. Un pedido que no encuentra rider es una venta que no existe. Pero desde la F0 §6
> la medida es más fina: **propuestas aceptadas por propuesta emitida**, y **cuántas
> propuestas hicieron falta para una aceptación**. Un mercado que necesita seis propuestas
> para mover un pedido está muerto aunque venda.

---

## Prisma de los 5 huecos (ronda 1)

### 1 · IDENTIDAD — ¿qué es exactamente el sujeto?

Bocaos no vende software de reparto: vende **un criterio**. El criterio se aplica miles de
veces al día, siempre igual, sobre un dato que llega solo:

```
llega pedido.listo  →  se mide a cada rider que ya está en la calle
                    →  si pasa los cuatro umbrales, se le PROPONE
                    →  el rider tiene ~20 s para aceptar, libremente
```

Tres cosas que este prisma fija y que la F0 §6 obliga a fijar:

**a) La decisión no es global.** No hay un planificador que mire todos los pedidos y todos
los riders y reparta. Cada pedido dispara **su** decisión, contra el estado del instante.
Consecuencia dura: el mercado **no se puede ordenar desde un punto** — ni para bien (no hay
optimizador que salve un mal día) ni para mal (no hay manivela que un competidor o un
empleado puedan girar). Es la misma renuncia de la F0 §3 ("no ordena el mercado") leída en
técnico.

**b) La decisión es una función, no un estado.** Mismo evento + misma vista + misma
configuración → misma propuesta, siempre. Eso la hace **explicable** ("te lo ofrecí porque
pasabas a 300 m y esperabas 2 min"), **reproducible** (se puede volver a ejecutar para
auditarla) y **barata** (cuatro comparaciones, no un solver).

**c) Lo que se enlaza son trayectos, no clientes.** El modelo chino de mediodía —menú fijo,
hora de corte, un edificio— no existe en la cena española. Bocaos no junta personas: junta
**rutas que ya se solapan**. El cliente de un pedido no sabe —ni tiene por qué saber— qué
otro pedido viaja al lado; y no se le pide que acepte el menú de nadie ni que coma a las
13:00.

La unidad de negocio, por tanto, no es la tienda ni el pedido: es **la propuesta aceptada**.

### 2 · RESTRICCIONES — qué le limita (freno → empujón, ninguna como muro)

| Freno declarado | Estado que protege | Empujón (pieza construible) |
|---|---|---|
| **No hay cerebro central** (F0 §6.1) | que el mercado no sea apagable ni ordenable desde un punto; y que la decisión sea barata | decisión por evento + `vista-del-instante` + `reproduccion-de-la-decision` (test de replay) |
| **La propuesta es una propuesta** (F0 §6.4: asignar = Glovo = inspección) | que el rider siga siendo autónomo — es el modelo y es la defensa legal | `ventana-de-propuesta` + `aceptacion-libre` + `rechazo-sin-coste` + `guarda-sin-asignacion` |
| **El rider puede rechazar sin coste** (F0 §6.7) | su libertad real, no decorativa | `rechazo-sin-coste` (hecho, nunca nota) + `estado-rider` con **pausa declarada por él** |
| **Los umbrales no son de la vertical** (F0 §6.3) | que otro barrio no herede reglas ajenas | `config-umbrales` con vigencia + `version-efectiva` + `simulador-de-umbrales` |
| **Los cuatro umbrales son cuatro números** (F0 §6) | que la decisión no derive hacia un juicio | `medida-desvio` · `medida-espera` · `medida-retraso` · `medida-cobra` + `regla-de-enlace` |
| **La IA no decide** (F0 §6) | explicabilidad y determinismo | tres agentes **solo de borde** (A23, F07, L04) con validador puro; cero agentes en la cadena de decisión |
| **El enlazado es la palanca del rider, no un ahorro de Bocaos** (F0 §6.5) | que enlazar no se convierta en cobrar kilómetros | `guarda-no-captura-del-ahorro` + tarifa por pedido aceptado |
| **Bocaos no toca el ticket ni el reparto** | no ser banco, no ser transportista | `guarda-no-retencion` + `reparto-del-pago` (dos cobros directos) |
| **El cliente es de la tienda** | que el restaurante no tenga miedo | `guarda-marca-ajena` + `guarda-propiedad-cliente` + no hay app de cliente |
| **El enlace puede retrasar al que ya iba** | la promesa ya dada a otro cliente | umbral de retraso + `promesa-por-parada` + `guarda-enlace-no-rompe-promesa` |

### 3 · CONTRATO — qué intercambia, y con quién

```
con el CLIENTE FINAL   da: un escaparate con precio cerrado, la hora de llegada y su prueba
                      recibe: nada suyo. No hay cuenta, no hay app, no hay marca de Bocaos.
                      [y NO sabe si su pedido comparte viaje — abierto, ver Q20]

con la TIENDA          da: el escaparate, el pedido, los riders y la medida de su cocina
                      recibe: tramo 1 (fijo) + tramo 3 (céntimos por pedido)

con el REPARTIDOR      da: propuestas con CUATRO NÚMEROS y VEINTE SEGUNDOS, y el importe íntegro
                      recibe: tramo 3 (céntimos por pedido aceptado)
                      NOTA: el contrato con el rider ya no es "una oferta", es "una propuesta
                      medida y explicada". Eso es más y es distinto.

con el MERCADO         da: el criterio, aplicado igual para todos
                      recibe: que el pedido encuentre rider sin que el rider pierda
```

### 4 · NO-OBJETIVOS — qué NO es (cada uno, con la pieza que lo sostiene)

- **No asigna**: no hay camino de un pedido a un rider sin una aceptación → `guarda-sin-asignacion`.
- **No optimiza en bloque**: no hay planificador global ni re-optimización del día → `guarda-sin-optimizador`.
- **No agrupa clientes**: enlaza rutas. No hay menú fijo, ni hora de corte, ni pedido compartido → `guarda-enlace-por-trayecto`.
- **No captura el ahorro del enlace**: su cuota no depende de los kilómetros ahorrados → `guarda-no-captura-del-ahorro`.
- **No cobra el ticket** ni participa del margen de la comida → `guarda-no-retencion`.
- **No retiene** el dinero de nadie: no es banco.
- **No contrata riders** ni les da turnos, zonas ni pedidos.
- **No tiene app de cliente** ni cuenta de cliente: no capta demanda.
- **No ordena el mercado**: sin ranking, sin destacados, sin prioridad comprada → `neutralidad-orden`.
- **No juzga fallos**: mide. Donde otro pone un agente que opina, Bocaos pone un reloj y una tabla.
- **No garantiza la comida ni la cocina lenta**: solo la hace visible y cobrada.
- **No garantiza pedidos el primer mes**: eso no lo arregla software.

### 5 · PREGUNTAS ABIERTAS (ley de cero supuestos — nada se estima)

De la F0, seis, y las tres nuevas **se tratan como abiertas y se abren en varias**:

```
[F0] precio_coordinacion         → Q14
[F0] mecanismo_adjudicacion      → Q24
[F0] responsabilidad_legal       → Q23
[F0] umbrales_enlazado           → Q1–Q6      (los cuatro números y sus unidades)
[F0] rechazo_rider               → Q9–Q13     (el rechazo y sus consecuencias)
[F0] transparencia_enlace        → Q20–Q22    (qué sabe el cliente y a qué precio)
```

Y las que este prisma destapa: quién sube la oferta (Q17), si `cobra` es bruto o neto (Q2),
en serie o en paralelo (Q6), qué pierde el que acepta y no aparece (Q12), las tres N de la
espera (Q28), cómo se hace efectivo un cargo (Q29). Guion completo en `guion-preguntas.md`.

---

## EL ESLABÓN LIMITANTE (lo identifico yo, del flujo declarado)

**Flujo (F0 §1 + §6):**

```
cliente pide en la web de su tienda → el pedido va a ESA tienda → la tienda cocina
   → la tienda marca LISTO  ──┐
                              │  pedal: pedido.listo {local, destino, hora_listo, precio, coords}
                              ▼
                    ┌─────────────────────────────────────────┐
                    │  LA CADENA DE PROPUESTA (local, 1 evento)│
                    │  mide → compara 4 umbrales → PROPONE     │
                    └─────────────────────────────────────────┘
                              │  ~20 s
                              ▼
   el rider ACEPTA (o rechaza, o calla) → recoge → entrega
   → cliente paga comida (a la tienda) y reparto (al rider)
   → tienda y rider pagan a Bocaos su gestión, semanalmente
```

**ESLABÓN LIMITANTE = LA PROPUESTA DE ENLAZADO → LA ACEPTACIÓN DEL RIDER.**

Es un eslabón de **dos mitades encadenadas**, y por eso es el cuello: la primera mitad (la
propuesta) decide **a quién** se le pregunta; la segunda (la aceptación) decide **si el
pedido existe**. Ninguna de las dos se puede saltar la otra.

1. Es el **único paso sin obligación en ninguna de las dos partes**: no hay contrato de
   trabajo, no hay asignación, y el rider puede no aceptar nunca (F0 §4).
2. Es el **paso que decide si el pedido existe**: sin aceptación no hay reparto, y sin
   reparto la venta de la tienda se cae con él.
3. Es **donde se acumulan todas las pérdidas**: de las tres primeras fricciones, en las tres
   el que pierde es el rider (espera en tienda, portal, cliente que no baja).
4. Su capacidad **es** la capacidad del mercado: propuestas que encuentran aceptante, por
   hora y por zona.
5. Y desde la F0 §6 es también **el punto donde el modelo se juega la legalidad**: si la
   primera mitad se convierte en asignación, Bocaos deja de ser un mercado y pasa a ser un
   empleador con algoritmos. Ese es el riesgo que la F0 nombra sin rodeos.

### Los cuatro umbrales (F0 §6) — lo que son y lo que NO son

```
desvío  < 800 m     metros de más por pasar por el local
espera  < 4 min     minutos que esperaría si llega antes de que esté listo
retraso < 6 min     minutos que añade a los pedidos que YA lleva
cobra   > 0         lo que gana con este pedido
        si los cuatro se cumplen → se le PROPONE
        si no                     → otro rider · o sube la oferta · o va a la sala
```

| Son | **NO** son |
|---|---|
| cuatro comparaciones, AND | un score ponderado ni un ranking |
| **configuración del PROYECTO** (otro barrio, otros números) | constantes de la vertical |
| deterministas y explicables | un modelo entrenado ni una predicción |
| una **propuesta** con ventana | una asignación con plazo |
| la palanca del rider (más pedidos por viaje) | un ahorro que Bocaos se queda |

**Un detalle que el esquema NO puede inventar**: `cobra > 0` sólo tiene sentido como umbral
si `cobra` es **neto** (lo que gana menos lo que le cuesta el desvío). Si es bruto, es una
condición casi siempre verdadera y no filtra nada. La F0 §6.5 dice que "si el rider no gana
más, no enlaza" — lo que apunta a neto. **Pero no está declarado: es Q2.**

### El cuello expandido al máximo (frenos → empujones)

| Freno del cuello | Empujón (la pieza que lo abre) |
|---|---|
| La propuesta se calcula a ciegas de la ruta que el rider ya lleva | `ruta-viva` + `paradas-pendientes` + `promesa-por-parada` |
| Cuatro números sin unidades ni definición se vuelven opinión | `medida-desvio` · `medida-espera` · `medida-retraso` · `medida-cobra`, cada uno con su test |
| Un umbral sin dueño se cambia a escondidas | `config-umbrales` con vigencia + `version-efectiva` + `acta-decisiones` |
| Proponer a todos a la vez es asignar por la puerta de atrás | `propuesta-emitida` (una, con hora, con su rider) |
| Si nadie acepta, el pedido muere en silencio | `escalada-de-enlace` + `subida-de-oferta` + `aviso-sala` |
| El rider no sabe por qué le llegó | `explicacion-de-la-propuesta` (derivada) + `vista-de-propuesta` |
| Veinte segundos conduciendo son una trampa | `ventana-de-propuesta` declarada + `estado-rider` (pausa) + Q5 |
| Enlazar retrasa al que ya iba | `promesa-por-parada` + umbral de retraso + `guarda-enlace-no-rompe-promesa` |
| La misma propuesta, dos veces, con dos resultados | `reproduccion-de-la-decision` (test de replay) |
| La IA "redactando la oferta" se inventa una razón | `redaccion-de-la-propuesta` **con validador puro** contra los cuatro números |

**Los empujones del cuello son el grupo A + el grupo B del árbol: el corazón del esquema.**
Los grupos C–I son el cuerpo que hace posible que ese corazón lata (sin pedido listo no hay
evento; sin precio compuesto no hay `cobra`; sin hechos medidos no hay histórico que mire el
rider). El grupo J es lo que mantiene esto siendo vertical.

---

## SUB-PRODUCTOS de la ronda 1 (cada uno → su pasada-2)

1. `propuesta-enlace` — la cadena de decisión completa (**ESLABÓN LIMITANTE**).
2. `ruta-viva` — el trayecto que el rider ya lleva: sin él, "desvío" y "retraso" no existen.
3. `pedido-listo` — el hecho con dato que **dispara** todo; la tienda es quien lo emite.
4. `plaza-tienda` — el escaparate propio por tienda (tramo 2).
5. `tarifa-tres-bandas` — el precio que hace **calculable** `cobra` antes de proponer.
6. `reparto-medido` — la ejecución con relojes y prueba (y el borde fuzzy de la incidencia).
7. `adjudicacion-fallos` — la espera medida y cobrada, sin juzgar.
8. `liquidacion-coordinacion` — los tres tramos y el cobro semanal, sin retener.
9. `sala-mercado` — la operación humana mínima, incluida la revisión humana de decisiones.
10. `config-proyecto` — los cuatro números, la ventana y la zona, con vigencia. **Lo que
    separa una vertical de un proyecto.**

Ninguno se queda aquí: cada uno vuelve al prisma en su `pasada-2`.
