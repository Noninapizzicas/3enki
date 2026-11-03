# ESQUEMA MAESTRO — vertical **BOCAOS**

> **Fase 2 · esquematizar-negocio** · vertical `bocaos` · segunda pasada · entregable del gate.
>
> **Sujeto (leído de la F0, no preguntado):** `que_es` = un mercado de bocados con muchas
> tiendas, donde el cliente entra, elige tienda y paga en la que elige; `que_vende` = TPV +
> coordinación de reparto a tres bandas + escaparate propio por tienda; `como_lo_elabora` =
> plataforma propia, el reparto lo ejecutan autónomos que se ofertan a los restaurantes, la
> plataforma **no retiene el dinero ni cobra el ticket**.
>
> **Lo que cambia en esta pasada** (F0 §6): el eslabón limitante ya no es "la aceptación del
> repartidor" a secas. Es **la propuesta de enlazado → la aceptación del rider**: una cadena de
> decisión **local, disparada por un evento, con cuatro umbrales y una ventana de ~20 s**, que
> termina en una **propuesta**, nunca en una asignación. El esquema entero está reordenado
> alrededor de eso.
>
> **Medida maestra:** propuestas **aceptadas** por propuesta **emitida**, y cuántas propuestas
> hicieron falta para una aceptación. Un mercado que necesita seis propuestas para mover un
> pedido está muerto aunque venda.
>
> **Agnosticismo:** cero tecnologías. Todo lo del entorno es puerto abierto (§7).
> **Vertical, no proyecto:** ni un restaurante, ni un barrio, ni un precio, ni un rider real
> dentro. Los cuatro umbrales son **configuración del proyecto** (§4).

---

## Prefacio · el marco y el mercado (cómo leer este documento)

**Bocaos es un MARCO, no un mercado.**

```
el mercado    OCURRE          los tres agentes, los pedidos, el dinero
el marco      LO PONE BOCAOS  las reglas, el suelo, la medida
```

Glovo **ES** el mercado: tiene la demanda, la captura y la cobra.
Bocaos pone el marco donde el mercado ocurre, y **no lo posee**.

Cuando este documento dice «mercado», se refiere al **sitio** donde los tres
se juntan. Cuando dice «Bocaos», se refiere a las **reglas** de ese sitio.
No son sinónimos y no se pueden intercambiar.

**Y la condición, que no es retórica:** el marco ayuda **si los tres tienen
voluntad**. No obliga.

```
si obligara a repartir       → empleador (falso autónomo)
si capturara al cliente      → Glovo
si ordenara el mercado       → dueño del mercado
```

Esa renuncia es lo que hace que un marco sea un marco, y no una plataforma
de reparto con otro nombre.

---

## 0 · EL FLUJO Y EL ESLABÓN LIMITANTE

```
cliente pide en la web de su tienda → el pedido va a ESA tienda → la tienda cocina
   → la tienda marca LISTO ──► pedido.listo { local, destino, hora_listo, precio, coords }
   → SE MIDE · SE COMPARA · SE PROPONE  (local, un evento, ~20 s)
   → el rider ACEPTA · RECHAZA · o CALL
   → recoge → entrega → cliente paga comida (a la tienda) y reparto (al rider)
   → tienda y rider pagan a Bocaos su gestión, semanalmente
```

**ESLABÓN LIMITANTE = LA PROPUESTA DE ENLAZADO → LA ACEPTACIÓN DEL RIDER.**

Es un eslabón de dos mitades encadenadas y por eso es el cuello de botella:

1. **La primera mitad decide a quién se le pregunta; la segunda decide si el pedido existe.**
   Ninguna puede saltarse la otra, y ninguna tiene obligación: no hay contrato de trabajo, no
   hay asignación, y el rider puede marcharse sin avisar (F0 §4).
2. **Es donde se acumulan todas las pérdidas.** De las tres primeras fricciones de la F0, en las
   tres el que pierde es el rider: espera en tienda, portal, cliente que no baja.
3. **Su capacidad es la capacidad del mercado.** Propuestas que encuentran aceptante, por hora
   y por zona. Ni la cocina ni el escaparate pueden superarla.
4. **Es donde el modelo se juega la legalidad.** Si la primera mitad se convierte en
   asignación, Bocaos deja de ser un mercado y pasa a ser un empleador con algoritmos. La F0 lo
   dice sin rodeos: *asignar = Glovo = inspección de trabajo*.

### 0.1 · La cadena, paso a paso (esto es el producto)

```
① llega el evento          pedido.listo — el dato viaja EN el evento, nadie va a buscarlo
② se toma la foto          riders activos · posición · ruta · paradas · histórico · config
③ se filtran               quién puede recibir propuesta AHORA
④ se miden                 desvío (m) · espera (min) · retraso (min) · cobra (c€)
⑤ se compara               cuatro umbrales en AND — cuatro tests, cero ponderaciones
⑥ se PROPONE               a UNO · con los cuatro números · con ~20 s · con su versión de config
⑦ se espera               acepta · rechaza (sin coste) · calla (caduca)
⑧ si nadie acepta          otro candidato · sube la oferta · la sala
```

### 0.2 · Los cuatro umbrales — lo que son y lo que NO son

```
desvío  < 800 m     metros de más por pasar por el local
espera  < 4 min     minutos que esperaría si llega antes de que esté listo
retraso < 6 min     minutos que añade a los pedidos que YA lleva
cobra   > 0         lo que gana con este pedido
```

| Son | **NO** son |
|---|---|
| cuatro comparaciones, AND | un score ponderado ni un ranking |
| **configuración del PROYECTO** | constantes de la vertical |
| deterministas y explicables | un modelo entrenado ni una predicción |
| una **propuesta** con ventana | una asignación con plazo |
| la palanca del rider | un ahorro que Bocaos se queda |

**La ambigüedad que el esquema no puede resolver solo**: `cobra > 0` sólo filtra si `cobra` es
**neto** del coste del desvío. Si es bruto, es casi siempre verdadero y el rider puede perder
dinero pasando el umbral. La F0 §6.5 ("si el rider no gana más, no enlaza") apunta a neto — pero
no está escrito. **Es Q2, y es la pregunta que decide si el enlazado es una palanca o una
trampa.**

### 0.3 · Si falta un dato, no se estima

La ley de cero supuestos aplicada **en caliente**: sin posición fresca, sin histórico del local
o sin precio compuesto, **no hay propuesta**. El candidato se salta y el hueco **se nombra**
(`hueco-de-medida`, A34). Es lo que impide que un mercado recién nacido invente datos para
parecer que funciona — y es el mejor diagnóstico posible: un mercado con muchos huecos es un
mercado con los datos sin enchufar, no con mala suerte.

---

## 1 · EL BUCLE QUE SOSTIENE EL MERCADO (la corrección sin juez)

Esto es lo que Bocaos vende de verdad: un mercado que se corrige solo porque **mide y traslada
el coste**. Con el matiz, el bucle se cierra dos veces — una por la espera y otra por la
promesa.

```
   la tienda marca listo tarde
        ↓
   relojes medidos                        (hechos-del-reparto, hora-de-listo)
        ↓
   espera > N_t → el coste lo paga la tienda   (regla-pago-fallo, cargo-fallo)
        ↓
   su puntualidad queda medida            (puntualidad-declarada, L03)
        ↓
   el rider la VE antes de aceptar        (`vista-de-propuesta`, M05)
        ↓
   la medida sube su espera prevista → no pasa el umbral → no hay propuesta
        ↓
   la tienda no recibe propuestas  →  sube su incentivo  →  corrige la cocina
```

**La corrección no la hace Bocaos: la hace el mercado con la información que Bocaos mide.** Por
eso el cuello no se resuelve "empujando riders" sino **midiendo bien y no estorbando**.

Y el segundo cierre, el que trae el matiz:

```
   el rider enlaza → su promesa se cumple o se rompe (promesa-por-parada)
        ↓
   si se rompe, el umbral de retraso no le deja enlazar la próxima vez
        ↓
   enlazar sigue siendo su palanca, pero no gratis
```

---

## 2 · ÁRBOL MAESTRO

### A · PROPUESTA-ENLACE — el eslabón limitante (la cadena de decisión por evento)  ·  34 piezas

- `hecho-pedido-listo` — **CUSTODIO** · el dato del evento, congelado con hora
- `composicion-de-la-vista` — **REFLEJO** · junta riders, rutas, paradas, histórico y config en una foto
- `congelacion-de-la-foto` — **REFLEJO** · una decisión lee una sola foto
- `candidatos-elegibles` — **REFLEJO** · quién puede recibir propuesta ahora
- `ruta-base` — **REFLEJO** · metros del trayecto que ya lleva, sin la parada nueva
- `ruta-con-parada` — **REFLEJO** · el mismo trayecto con el local insertado
- `medida-desvio` — **REFLEJO** · metros de más: la resta de las dos rutas
- `medida-espera` — **REFLEJO** · minutos que esperaría si llega antes de que esté listo
- `retraso-por-parada` — **REFLEJO** · minutos que este pedido le cuesta a cada pedido a bordo
- `agregado-del-retraso` — **REFLEJO** · el peor de los retrasos, no la suma
- `medida-cobra` — **REFLEJO** · lo que gana con este pedido, leído del precio ya compuesto
- `regla-de-enlace` — **REFLEJO** · los cuatro umbrales en AND; cuatro tests
- `propuesta-emitida` — **CUSTODIO** · a UN rider, con sus cuatro números y su versión de config
- `bloqueo-de-propuesta` — **CUSTODIO** · un desenlace por propuesta, sin carrera
- `ventana-de-propuesta` — **CUSTODIO** · el reloj de ~20 s y su caducidad
- `razones-de-la-decision` — **REFLEJO** · el conjunto cerrado de motivos, derivado de los números
- `frase-derivada` — **REFLEJO** · la plantilla que los convierte en una frase legible
- `redaccion-de-la-propuesta` — **FUZZY** · el agente que pone las palabras, con validador contra A16
- `aceptacion-libre` — **CUSTODIO** · el sí, atómico; crea el contrato puntual
- `hora-de-aceptacion` — **REFLEJO** · el hecho con hora que arranca los relojes
- `rechazo-sin-coste` — **REFLEJO** · el no se registra como hecho y no se castiga
- `guarda-sin-puntuacion` — **REFLEJO** · ninguna tasa de rechazo entra en la elegibilidad
- `caducidad-sin-respuesta` — **REFLEJO** · el silencio es un no, con hora
- `contrato-puntual` — **CUSTODIO** · lo que la aceptación crea: pedido, rider, precio, ventana
- `siguiente-candidato` — **REFLEJO** · el avance por el orden determinista declarado
- `escalada-de-enlace` — **PUENTE** · nadie aceptó: otro rider, subir la oferta, o la sala
- `guarda-sin-asignacion` — **REFLEJO** · no hay camino pedido→rider sin aceptación
- `guarda-sin-optimizador` — **REFLEJO** · la decisión lee un evento y una vista; nada decide en bloque
- `reproduccion-de-la-decision` — **REFLEJO** · mismo evento, misma foto, misma config → misma propuesta
- `guarda-enlace-por-trayecto` — **REFLEJO** · se enlazan rutas, nunca clientes
- `guarda-enlace-no-rompe-promesa` — **REFLEJO** · ninguna promesa ya dada empeora más allá del umbral
- `guarda-no-captura-del-ahorro` — **REFLEJO** · la cuota no depende de km ahorrados
- `guarda-propuesta-unica` — **REFLEJO** · una propuesta viva por pedido: no hay sorteo
- `hueco-de-medida` — **REFLEJO** · si falta un dato no se estima: no hay propuesta y el hueco se nombra

### B · RUTA-VIVA — el trayecto que el rider ya lleva encima  ·  6 piezas

- `posicion-rider` — **CUSTODIO** · el último punto conocido, con hora y frescura declarada
- `paradas-pendientes` — **REFLEJO** · las paradas del trayecto vivo, en su orden
- `promesa-por-parada` — **CUSTODIO** · la hora prometida a cada pedido a bordo
- `orden-de-paradas` — **REFLEJO** · reordena UNA ruta, jamás entre rutas
- `capacidad-declarada` — **CUSTODIO** · cuánto cabe, declarado por él
- `fin-de-trayecto` — **REFLEJO** · cierra el viaje cuando la última parada tiene hecho

### C · PEDIDO — el hecho que viaja hasta estar listo  ·  7 piezas

- `captura-pedido` — **REFLEJO** · alta del pedido, de a uno
- `estado-pedido` — **CUSTODIO** · la máquina de estados; ningún salto sin hecho con hora
- `aviso-tienda` — **PUENTE** · el pedido llega a la tienda por evento
- `hora-de-listo` — **CUSTODIO** · la tienda declara listo; es el disparador y es un hecho
- `estado-cocina-visible` — **REFLEJO** · lo que el cliente ve del estado, podado
- `aviso-cliente` — **PUENTE** · sale por el canal de la tienda
- `cancelacion` — **REFLEJO** · transiciones permitidas; quién paga, abierto

### D · PLAZA-TIENDA — el escaparate propio (tramo 2)  ·  7 piezas

- `marca-tienda` — **CUSTODIO** · quién firma el escaparate: la tienda
- `carta-publica` — **CONVERSOR** · catálogo interno → vista pública podada, una sola fuente
- `precio-cerrado` — **REFLEJO** · todo compuesto en céntimos antes de pagar
- `carrito-tienda` — **CUSTODIO** · el buffer de compra por cliente y tienda
- `registro-cliente-tienda` — **CUSTODIO** · el cliente es de la tienda, aislado por tienda
- `plaza-publica` — **REFLEJO** · el índice del mercado como proyección
- `neutralidad-orden` — **REFLEJO** · sin ranking, sin destacados, sin prioridad comprada

### E · TARIFA-TRES-BANDAS — el precio que hace calculable el `cobra`  ·  7 piezas

- `oferta-cliente` — **CUSTODIO** · lo que el cliente estipula; se congela con el pedido
- `incentivo-tienda` — **CUSTODIO** · lo que suma la tienda, con autor y hora
- `precio-reparto` — **REFLEJO** · oferta + incentivo, en céntimos
- `comision-coordinacion` — **REFLEJO** · los céntimos de Bocaos por pedido aceptado
- `reparto-del-pago` — **CONVERSOR** · un precio → dos cobros a dos beneficiarios
- `contrato-tramos` — **CUSTODIO** · el contrato económico por parte, con vigencia
- `subida-de-oferta` — **CUSTODIO** · subir la oferta cuando nadie acepta, con autor y tope

### F · REPARTO-MEDIDO — la ejecución convertida en prueba  ·  7 piezas

- `hechos-del-reparto` — **CUSTODIO** · relojes, posición y prueba; inmutable
- `prueba-entrega` — **CUSTODIO** · foto, hora y confirmación
- `seguimiento-vivo` — **REFLEJO** · posición y estado, proyectados al cliente
- `chat-enmascarado` — **PUENTE** · rider ↔ cliente sin exponer números
- `instrucciones-acceso` — **CUSTODIO** · portal, piso e indicaciones
- `incidencia-reparto` — **PUENTE** · de la calle a la cola de la sala
- `lectura-de-incidencia` — **FUZZY** · el agente que clasifica el relato libre en campos cerrados

### G · ADJUDICACIÓN DE FALLOS — no juzga, mide  ·  6 piezas

- `ventana-espera` — **CUSTODIO** · las N declaradas: tienda, portal, llegada
- `hecho-verificado` — **REFLEJO** · cruza hechos contra ventana
- `regla-pago-fallo` — **REFLEJO** · la tabla que hace pagar el fallo; aquí hay un test, no un agente
- `cargo-fallo` — **CUSTODIO** · quién debe cuánto a quién, con evidencia
- `disputa-fallo` — **PUENTE** · a la sala; el humano aplica, no re-juzga
- `trazabilidad-fallo` — **REFLEJO** · sin evidencia no hay cargo

### H · LIQUIDACIÓN DE LA COORDINACIÓN — el único dinero de Bocaos  ·  6 piezas

- `devengo` — **REFLEJO** · acumula céntimos por parte y periodo
- `ciclo-semanal` — **CUSTODIO** · abre, acumula y cierra el periodo
- `factura-gestion` — **CONVERSOR** · devengo → documento de cobro
- `cobro-gestion` — **PUENTE** · cobra lo suyo, por el canal de cada parte
- `impago-gestion` — **REFLEJO** · regla de mora y suspensión
- `guarda-no-retencion` — **REFLEJO** · Bocaos no toca el ticket ni el reparto

### I · SALA-MERCADO — la operación humana mínima  ·  8 piezas

- `alta-tienda` — **CUSTODIO** · el censo de tiendas
- `alta-rider` — **CUSTODIO** · el censo de riders y lo que acreditan
- `estado-tienda` — **CUSTODIO** · abierta, cerrada, saturada
- `estado-rider` — **CUSTODIO** · disponible, ocupado o en pausa — la pausa la declara él
- `salud-mercado` — **REFLEJO** · propuestas por aceptación, riders activos, esperas, devengado
- `tablero-fricciones` — **REFLEJO** · los 8 pares de la F0, medidos
- `aviso-sala` — **PUENTE** · cuando el reflejo no puede resolver
- `terminos-parte` — **CUSTODIO** · lo que cada parte aceptó, con versión

### J · CONFIG-PROYECTO — lo que hace que esto sea vertical y no proyecto  ·  5 piezas

- `config-umbrales` — **CUSTODIO** · los cuatro números y el orden de candidatos, con vigencia
- `config-ventana` — **CUSTODIO** · cuánto dura una propuesta
- `config-zona` — **CUSTODIO** · qué barrios cubre este mercado
- `version-efectiva` — **REFLEJO** · qué regla estaba viva en un instante
- `simulador-de-umbrales` — **REFLEJO** · qué pasaría con otros números, con los del proyecto

### K · CLIENTE FINAL — piezas que solo se ven desde su silla  ·  2 piezas

- `reclamacion-por-la-tienda` — **PUENTE** · su única vía de queja pasa por la tienda
- `guarda-marca-ajena` — **REFLEJO** · ninguna comunicación al cliente lleva la marca de Bocaos

### L · RESTAURANTE — piezas que solo se ven desde su silla  ·  4 piezas

- `panel-tienda` — **REFLEJO** · su espera medida, la misma que ve el rider
- `guarda-propiedad-cliente` — **REFLEJO** · sus clientes no cruzan de tienda
- `puntualidad-declarada` — **REFLEJO** · su hora-de-listo frente a lo prometido, publicada antes de aceptar
- `resumen-para-la-tienda` — **FUZZY** · el informe periódico en palabras, sobre hechos medidos

### M · REPARTIDOR AUTÓNOMO — piezas que solo se ven desde su silla  ·  5 piezas

- `cartera-rider` — **REFLEJO** · lo ganado, lo debido y lo que se le debe
- `zona-rider` — **CUSTODIO** · la zona que él declara
- `guarda-sin-exclusividad` — **REFLEJO** · nada le bloquea por trabajar con otro
- `canal-rider` — **PUENTE** · el puerto por el que le llega la propuesta
- `vista-de-propuesta` — **REFLEJO** · los mismos cuatro números, siempre, en el mismo orden

### N · BOCAOS — piezas que solo se ven desde el suelo del mercado  ·  2 piezas

- `politica-densidad` — **REFLEJO** · riders por zona frente a pedidos por zona
- `simulador-tramos` — **REFLEJO** · el efecto de un tramo, con los números del dueño

### O · ROL JEFE — declara lo que no se mide y responde de la regla  ·  4 piezas

- `cuadro-del-mercado` — **REFLEJO** · los agregados que el jefe necesita para decidir
- `acta-decisiones` — **CUSTODIO** · por qué se cambió una regla, con vigencia
- `cola-revision-humana` — **CUSTODIO** · las decisiones automáticas que alguien pide revisar
- `dictamen-revision` — **CUSTODIO** · el hecho firmado que cierra una revisión

### P · ROL TRABAJADOR — la sala, que opera el día de hoy  ·  4 piezas

- `cola-sala` — **CUSTODIO** · una sola cola de excepciones vivas
- `vista-parte` — **REFLEJO** · todo lo de una tienda o un rider en una pantalla
- `accion-sancion` — **CUSTODIO** · suspensión con motivo, plazo y acta
- `checklist-alta` — **REFLEJO** · qué falta para dar de alta, sin memoria

### Q · ROL CLIENTE — dos caras: la tienda que paga y el cliente final que no es de Bocaos  ·  1 pieza

- `estado-cuenta-parte` — **REFLEJO** · devengado, cobrado, pendiente y cargos, con evidencia

### K03 · la pieza que no se sabe si existe

- `transparencia-del-enlace` — **[ABIERTA]** · ¿el cliente sabe que su pedido comparte
  viaje, y si eso le baja el precio? Existe solo si el dueño dice que sí (Q20, Q15).


---

## 3 · LAS DOCE INVARIANTES (renuncias que se escriben en código, no en un manifiesto)

Cada una es un **test**, no un párrafo. Si un día se pone roja, el modelo ha cambiado de
naturaleza — y conviene enterarse por un test y no por un restaurante enfadado.

| Renuncia (F0) | Pieza | Qué afirma el test |
|---|---|---|
| **No asigna** (F0 §6.4) | `guarda-sin-asignacion` (A27) | no hay camino de pedido a rider sin una aceptación |
| **No decide en bloque** (F0 §6.1) | `guarda-sin-optimizador` (A28) | la entrada de la decisión es UN evento y UNA vista |
| **La decisión es reproducible** (F0 §6.2) | `reproduccion-de-la-decision` (A29) | mismo evento + misma foto + misma config → misma propuesta |
| **No agrupa clientes** (F0 §6) | `guarda-enlace-por-trayecto` (A30) | la unidad del enlace es la ruta, no el cliente ni la hora |
| **El enlace no rompe la promesa** (F0 §6.4) | `guarda-enlace-no-rompe-promesa` (A31) | ninguna promesa ya dada empeora más allá del umbral |
| **El ahorro no es de Bocaos** (F0 §6.5) | `guarda-no-captura-del-ahorro` (A32) | la cuota no depende de km ahorrados ni de pedidos enlazados |
| **Una propuesta, un pedido** (deducida) | `guarda-propuesta-unica` (A33) | no hay dos propuestas vivas del mismo pedido |
| **El rechazo no cuesta** (F0 §6.7) | `guarda-sin-puntuacion` (A22) | ninguna agregación de rechazos entra en la elegibilidad |
| **No ordena el mercado** (F0 §3) | `neutralidad-orden` (D07) | sin ranking, sin destacados, sin prioridad comprada |
| **No cobra el ticket / no retiene** (F0 §1) | `guarda-no-retencion` (H06) | ningún flujo de Bocaos toca el importe de la comida ni del reparto |
| **El cliente es de la tienda** (F0 §6) | `guarda-propiedad-cliente` (L02) + `guarda-marca-ajena` (K02) | ningún cliente cruza de tienda; ninguna comunicación lleva la marca de Bocaos |
| **El rider es autónomo** (F0 §1) | `guarda-sin-exclusividad` (M03) | nada le bloquea por trabajar con otro |

> `neutralidad-orden` y `guarda-sin-optimizador` **no son la misma renuncia**, y en la pasada
> anterior estaban fundidas: una prohíbe **vender** posiciones; la otra prohíbe **planificar**
> el reparto. Un mercado puede no vender nada y aun así tener un planificador — y ese
> planificador sería el final del modelo igual de rápido.

---

## 4 · VERTICAL vs PROYECTO — la frontera exacta

La restricción dura de esta fase: esto es una **vertical**. Todo lo local es configuración.
Esta es la tabla que lo hace verificable:

| La VERTICAL fija (forma) | El PROYECTO declara (valor) |
|---|---|
| hay cuatro umbrales | desvío · espera · retraso · cobra (**Q1**, **Q2**) |
| sus unidades (m · min · min · c€) | — |
| la comparación es AND | — |
| la ventana es finita y declarada | su duración (**Q5**) |
| el orden de candidatos es determinista | el orden (**Q7**) |
| el enlace es de uno en uno (o no) | la política (**Q6**) |
| hay zonas | los barrios y su radio (**Q3**) |
| toda regla tiene vigencia | la fecha (**Q4**) |
| hay un tramo fijo y uno por pedido | los números (**Q14**) |
| la espera se mide y se cobra | las tres N (**Q28**) |
| hay revisión humana | si se construye ya (**Q25**) y quién firma (**Q26**) |

**La prueba de fuego**: si borras el proyecto y dejas la vertical, ¿queda algo que construir?
Sí: las 115 piezas y sus formas. Si borras la vertical y dejas el proyecto, ¿queda algo?
Números sin sitio donde ponerlos. **Eso es una vertical.**

---

## 5 · LAS 8 FRICCIONES, PAR A PAR — qué pieza las atiende y qué NO se resuelve

| Par | Pieza(s) | Lo que **no** se resuelve |
|---|---|---|
| cliente ↔ restaurante | `precio-cerrado` · `estado-cocina-visible` · `aviso-cliente` · `medida-espera` | que la comida esté buena |
| restaurante ↔ rider | `puntualidad-declarada` · `medida-espera` · `ventana-espera` · `panel-tienda` | la cocina lenta: solo se hace **visible y cobrada** |
| rider ↔ cliente | `prueba-entrega` · `seguimiento-vivo` · `chat-enmascarado` · `instrucciones-acceso` | que el cliente baje |
| restaurante ↔ Bocaos | `guarda-propiedad-cliente` · `simulador-tramos` · `estado-cuenta-parte` | el miedo a perder su cliente: lo resuelve el primer mes funcionando |
| rider ↔ Bocaos | `cartera-rider` · `guarda-sin-exclusividad` · `vista-de-propuesta` · `razones-de-la-decision` | que haya pedidos suficientes el primer mes |
| cliente ↔ Bocaos | `guarda-marca-ajena` · `reclamacion-por-la-tienda` | que el cliente sepa que Bocaos existe — **y eso es deliberado** |
| restaurante ↔ restaurante | `neutralidad-orden` · `plaza-publica` | que compitan: es un mercado, competir es el punto |
| rider ↔ rider | `candidatos-elegibles` · `neutralidad-orden` · **`guarda-propuesta-unica`** | que gane el rápido: es lo que debe pasar |

**El par 8 cambia con el matiz.** Antes bastaba "el que está cerca gana". Ahora hay una
pregunta nueva y fea: si el mismo pedido se propone **a la vez** a cuatro riders cercanos, el
que acepta no es el elegido — es el que estaba mirando el móvil. Eso no es un mercado: es un
sorteo con apariencia de mercado. De ahí `guarda-propuesta-unica` (A33). Si el dueño elige
paralelo (Q6), se cambia la ventana, no la invariante.

---

## 6 · LA CONTRADICCIÓN QUE DESTAPA EL PRISMA DEL CLIENTE

La F0 se contradice, y es la contradicción más cara del esquema:

```
F0 §1   el enlazado hace que "el cliente espere menos o pague menos"
F0 §6   "el enlazado es la palanca del rider, no un ahorro de Bocaos"
        "si el rider no gana más, no enlaza"
```

Si el ahorro se lo lleva entero el rider, el cliente **paga lo mismo y absorbe hasta 6 minutos
de espera extra** que no pidió. Las tres salidas son incompatibles entre sí y **ninguna está
declarada**:

1. **Bajarle el precio** cuando su pedido va enlazado → `transparencia-del-enlace` (K03) deja de
   ser transparencia y pasa a ser un descuento.
2. **Apretar el umbral de retraso** hasta que el cliente no note nada → el enlace deja de
   compensar al rider en rutas reales.
3. **Decírselo** sin bajarle nada → el cliente sabe que espera más por lo mismo.

Es **Q15 + Q20**. El esquema deja la pieza marcada **[ABIERTA]** en lugar de elegir por el
dueño. Es exactamente el tipo de hueco que la fase 2 existe para encontrar.

---

## 7 · PUERTOS ABIERTOS (agnosticismo — cero tecnologías)

- **Canal al cliente final**: el de la tienda. El esquema solo exige que **no sea una app de
  Bocaos**.
- **Canal al rider** (`canal-rider`): puerto abierto e intercambiable; no queda atado a una
  superficie concreta — y con ~20 s de ventana, ese puerto **es crítico** (Q5).
- **Canal de cobro** (`cobro-gestion`): el que declare cada parte.
- **Canal de la sala** (`aviso-sala`, `cola-sala`): el que el dueño declare.
- **Fuente de posición, de ruta y de foto** (`posicion-rider`, `prueba-entrega`): se declara al
  aterrizar. El esquema solo pide que el hecho quede con hora, que no se pueda reescribir y que
  se declare su **frescura**.
- **Catálogo**: la fuente es el TPV de la tienda (producto declarado en F0: *pizzepos*). El
  escaparate **proyecta**, no guarda una segunda carta.
- **Cálculo de ruta** (`ruta-base`, `ruta-con-parada`): puerto abierto. El esquema pide metros y
  minutos; cómo se obtengan es del sitio (Q37).
- **Vocabulario**: "pizzepos", "plaza", "tramo 1/2/3" son nombres del negocio, no del stack.

---

## 8 · INVESTIGACIÓN (lo investigable, investigado)

Consultado hoy en la web. Lo que se encontró **cambia el esquema**, y por eso está aquí y no en
un anexo.

**Directiva (UE) 2024/2831, sobre el trabajo en plataformas** (verificado en su texto
consolidado por artículos):

- **Art. 3–5**: la calificación del vínculo se determina por los **hechos**, "incluido el uso de
  sistemas automatizados de seguimiento o de toma de decisiones", y hay **presunción de
  laboralidad** cuando la plataforma controla el desempeño, con la carga de la prueba del lado
  de la plataforma.
  → En el esquema: **la cadena de propuesta no puede "controlar el desempeño"**. Cuatro
  umbrales sobre el trayecto son una propuesta comercial; una asignación con plazo y
  obediencia es control. De ahí `guarda-sin-asignacion` y `guarda-sin-optimizador`.
- **Art. 6**: hay que **informar** de los sistemas automatizados de seguimiento y de decisión, y
  **no se pueden procesar datos no estrictamente necesarios** ni recoger datos **fuera del
  horario de trabajo**.
  → En el esquema: `posicion-rider` con frescura declarada y traza acotada (**Q38**), y el alta
  del rider informada (**Q34**).
- **Art. 7–8**: **supervisión humana** de los sistemas y **revisión humana** de las decisiones
  significativas, con **derecho a explicación**.
  → En el esquema: `razones-de-la-decision` (A16) + `frase-derivada` (A17) + `cola-revision-humana`
  (O03) + `dictamen-revision` (O04). **La explicación no es UX: es un derecho.**
- **Art. 10**: los arts. 6, 7 y 8 se aplican **también a quien no tiene contrato de trabajo**.
  → Es la pieza que cierra el argumento: aunque el rider sea autónomo de verdad, **tiene derecho
  a que se le explique por qué se le propuso eso**. El esquema lo construye.
- **Art. 15**: los riders pueden comunicarse entre sí y la plataforma **no puede acceder ni
  monitorizar** esas comunicaciones.
  → Consecuencia directa: ningún agregado de Bocaos puede construirse sobre conversaciones
  entre riders. Lo anotamos como límite, no como pieza.

**Lo que la investigación NO resuelve** (sigue siendo pregunta al dueño): la **relación
contractual del rider** (Q23). La F0 dice a la vez que "se oferta a los restaurantes" y que "el
cliente paga al rider su reparto". Con quién contrata decide si la presunción le alcanza. **No
se puede suponer.**

---

## 9 · DISECCIÓN — recuento de FORMAS

**115 hojas atómicas, todas con forma** (detalle en `pasada-diseccion.md`):

| Forma | Nº | Qué significa aquí |
|---|---|---|
| REFLEJO puro | 61 | cuatro medidas, relojes, céntimos, invariantes |
| CUSTODIO | 38 | el evento, la propuesta, el contrato, los hechos |
| PUENTE | 10 | avisos, disputa, incidencia, escalada |
| CONVERSOR | 3 | carta→escaparate, precio→dos cobros, devengo→factura |
| MICRO-AGENTE fuzzy | 3 | el borde: redactar, leer una incidencia, resumir |
| **total** | **115** | + 1 [ABIERTA] |

**El hallazgo, y es distinto del de la pasada anterior.** Antes el esquema decía "cero agentes:
el negocio prohíbe el juicio". Con la F0 §6 eso ya no es cierto: la F0 **deja entrar a la IA en
el borde** (entender un mensaje, redactar, resumir). El esquema obedece, y el resultado es más
preciso que "cero": **tres agentes, los tres fuera de la cadena de decisión**, cada uno con un
validador puro que le impide inventar. El reflejo hidrata y persiste; el agente solo transforma.
Si los tres se caen, el mercado sigue proponiendo y aceptando con las versiones sin adornar.

Y la parte que no cambia: **ni un agente toca la decisión de a quién se propone**. Eso son
cuatro comparaciones y cuatro tests.

---

## 10 · PREGUNTAS ABIERTAS — 40

Las 6 de la F0 (tres de ellas nuevas) se tratan como abiertas y se abren en varias. Guion
completo en `guion-preguntas.md`.

```
A · el criterio          Q1–Q8    los cuatro números, la ventana, el orden de candidatos
B · el rechazo           Q9–Q13   la libertad del rider y sus consecuencias
C · el dinero            Q14–Q19  tramos, `cobra` neto, subida de oferta, quién paga
D · la transparencia     Q20–Q22  qué sabe el cliente y a qué precio
E · legal y revisión     Q23–Q26, Q34
F · la operación         Q27–Q33, Q35–Q40

bloquean construcción:  Q1 · Q2 · Q6 · Q7 · Q14
```

---

## 11 · ESTADO DE LA FASE

- **Prisma global:** 23 hojas en la ronda 1 → 10 puntos (pasada-2) → 34 en el desglose del cuello
  (pasada-3) → seco (pasada-4). Nada quedó sin pasada en disco.
- **Prisma por interlocutor:** 4 pasadas (cliente · restaurante · repartidor · Bocaos).
- **Prisma por rol:** 3 pasadas (jefe · trabajador · cliente), con doble alcance.
- **Disección:** 115 hojas, **todas con forma** + 1 **[ABIERTA]**.
- **Cero tecnologías** fuera de los puertos abiertos (§7).
- **Cero restaurantes, barrios, precios ni riders concretos**: vertical, no proyecto.
- **Siguiente:** las 40 preguntas al dueño (§10) → con las respuestas, **pasada 2 del ciclo**
  sobre `config-umbrales`, `medida-cobra` y `transparencia-del-enlace`, y **solo entonces**
  `completar_fase { fase:'esquematizado' }`, que empuja la **FASE 3 · PLASMA**
  (`planificar-construccion` → `esquemas/diseno-oop.md`).

### Índice de ficheros de esta fase

```
esquemas/
├─ pasada-1-bocaos.md                          el prisma global sobre el sujeto
├─ pasada-2-propuesta-enlace.md                A ← EL ESLABÓN LIMITANTE
├─ pasada-3-propuesta-enlace-desglose.md       A, segunda vuelta (23 → 34)
├─ pasada-4-enlace-seco.md                     A, tercera vuelta (seca)
├─ pasada-2-ruta-viva.md                       B
├─ pasada-2-pedido-listo.md                    C ← el disparador
├─ pasada-2-plaza-tienda.md                    D
├─ pasada-2-tarifa-tres-bandas.md              E ← hace calculable `cobra`
├─ pasada-2-reparto-medido.md                  F ← el borde fuzzy
├─ pasada-2-adjudicacion-fallos.md             G
├─ pasada-2-liquidacion-coordinacion.md        H
├─ pasada-2-sala-mercado.md                    I
├─ pasada-2-config-proyecto.md                 J ← vertical vs proyecto
├─ pasada-interlocutor-cliente.md              K
├─ pasada-interlocutor-restaurante.md          L
├─ pasada-interlocutor-repartidor-autonomo.md  M
├─ pasada-interlocutor-bocaos.md               N
├─ pasada-rol-jefe.md                          O
├─ pasada-rol-trabajador.md                    P
├─ pasada-rol-cliente.md                       Q
├─ pasada-diseccion.md                         la FORMA de las 115 hojas
├─ guion-preguntas.md                          las 40 preguntas para el dueño
└─ esquema.md                                 ESTE árbol maestro
```

---

## Anexo · Qué cambia respecto a la pasada anterior (`fase2-v1/`)

| | anterior | esta pasada |
|---|---|---|
| Eslabón limitante | la aceptación del rider, con "enlazado 2–3" dentro | **la propuesta de enlazado → la aceptación**, una cadena de 8 pasos |
| Naturaleza del enlazado | una función del sistema que agrupa pedidos | una **decisión local por evento**, con cuatro umbrales medibles |
| Quién decide el enlace | abierto ("el rider, el sistema o los dos") | **el reflejo**, con cuatro números y una ventana; el rider solo acepta o rechaza |
| Umbrales | no existían; "tope de enlace 2–3, abierto" | cuatro umbrales con unidades, **del proyecto**, con vigencia |
| IA | cero agentes ("el negocio prohíbe el juicio") | **tres agentes en el borde**, cero en la decisión |
| Asignación | prohibida como principio | prohibida **como invariante con test** (`guarda-sin-asignacion`) |
| Optimizador global | no se nombraba | **prohibido explícitamente** (`guarda-sin-optimizador`), distinto de la neutralidad del orden |
| Cliente y enlace | no había relación | **contradicción detectada** (§6): paga lo mismo y espera más |
| Piezas | 73 | **115** (+42), casi todas en la cadena de propuesta, la ruta viva, la config del proyecto, la revisión humana y el borde fuzzy |
