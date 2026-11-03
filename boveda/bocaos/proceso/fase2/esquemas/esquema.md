# ESQUEMA MAESTRO — vertical **BOCAOS** · tercera pasada

> **Fase 2 · esquematizar-negocio** · vertical `bocaos` · tercera pasada · entregable del gate.
>
> **Sujeto (leído de la F0, no preguntado):** `que_es` = un marco para tres agentes (cliente,
> restaurante, repartidor autónomo) que ayuda, si tienen voluntad, a que sus flujos aporten a todas
> las partes; `que_vende` = TPV + coordinación de reparto a tres bandas + escaparate propio por
> tienda; `como_lo_elabora` = plataforma propia, reparto por autónomos que se ofertan a los
> restaurantes, **sin retener dinero ni cobrar ticket**.
>
> **Lo que añade esta pasada (F0 §7):** Bocaos no es una empresa central con sedes: es una
> **federación de plazas**. El mercado ocurre en una plaza; el nacional solo sabe dónde. Eso obliga
> a responder, pieza a pieza, **de quién es cada cosa** — y a admitir que hay dos Bocaos.
>
> **Lo que NO cambia:** el eslabón limitante sigue siendo **la propuesta de enlazado → la
> aceptación del rider** (§0.1), con cuatro umbrales, ~20 s, y propuesta que nunca es asignación. La
> §7 no lo toca: lo **encierra** en la plaza.
>
> **Medida maestra:** propuestas **aceptadas** / propuestas **emitidas**. La federación añade una
> segunda medida, de réplica: **cuántas plazas operan con la misma versión y cuánto tarda abrir una.**
>
> **Agnosticismo:** cero tecnologías. Todo lo del entorno es puerto abierto (§7).
> **Vertical, no proyecto:** ni una tienda, ni una ciudad, ni un precio, ni un rider real dentro.

---

## Prefacio · tres unidades, no dos

```
FEDERACIÓN   el registro · la marca · el software · el soporte · la liquidación consolidada
   └ PLAZA   un despliegue · su BD · sus tiendas · sus riders · sus reglas y sus umbrales
        └ TIENDA   un proyecto · su carta · su marca · su cliente · su pedido · su cocina
```

Y la frase que ordena todo el documento:

> **Todo lo que DECIDE ocurre en la plaza. Todo lo que REGISTRA ocurre en el nacional.**

No es una preferencia de organización: es la razón por la que el nacional **no puede** ordenar el
mercado. La renuncia de la F0 §6 ("no hay cerebro central") deja de ser una decisión de producto y
pasa a ser una **imposibilidad topológica**: el nacional no tiene el evento ni la foto del instante,
así que no tiene con qué decidir. Eso es lo que hace sólida la federación.

```
el mercado    OCURRE en una plaza         los tres agentes, los pedidos, el dinero
el marco      LO PONE BOCAOS              las reglas, el suelo, la medida
el registro   LO LLEVA EL NACIONAL        qué plazas hay, con qué versión, con qué tiendas
```

Un nacional con pedidos sería más útil, más rápido y más barato de operar — y sería el final del
modelo. **La §7 elige ser menos útil.**

---

## 0 · EL FLUJO, EL ESLABÓN LIMITANTE Y EL CUELLO DEL CRECIMIENTO

### 0.1 · El flujo, con la frontera puesta

```
cliente pide en la web de SU tienda (una tienda de ESTA plaza)
   → el pedido va a ESA tienda → la tienda cocina
   → la tienda marca LISTO ──► pedido.listo { local, destino, hora_listo, precio, coords }
   → SE MIDE · SE COMPARA · SE PROPONE          (local, un evento, ~20 s, DENTRO de la plaza)
   → el rider ACEPTA · RECHAZA · o CALL
   → recoge → entrega → cliente paga comida (a la tienda) y reparto (al rider)
   → tienda y rider pagan a la plaza su gestión, semanalmente
   → la plaza consolida y el nacional suma            ← el único contacto entre los dos niveles
```

**ESLABÓN LIMITANTE = LA PROPUESTA DE ENLAZADO → LA ACEPTACIÓN DEL RIDER.** Sigue siendo el cuello
del día, por las cuatro razones de la v2 (es el único paso sin obligación en ninguna de las dos
partes · decide si el pedido existe · es donde se acumulan las pérdidas · su capacidad es la
capacidad del mercado) y por una quinta que la §7 añade:

**5. No se puede replicar hacia arriba.** Las 35 piezas de la cadena viven en el despliegue. El
nacional no puede tenerlas, ni una. Si algún día alguien propone "un cerebro central que aprenda de
todas las plazas", está proponiendo cerrar Bocaos.

### 0.2 · La cadena, paso a paso (esto es el producto, y es local)

```
① llega el evento          pedido.listo — el dato viaja EN el evento, nadie va a buscarlo
② se toma la foto          riders activos · posición · ruta · paradas · histórico · config
③ se filtran               quién puede recibir propuesta AHORA, en ESTA plaza
                           → y con hueco: capacidad = min(volumen, tiempo, distancia)
④ se miden                 desvío (m) · espera (min) · retraso (min) · cobra (c€)
⑤ se compara               cuatro umbrales en AND — cuatro tests, cero ponderaciones
⑥ se PROPONE               a UNO · con los cuatro números · con ~20 s · con su versión de config
⑦ se espera               acepta · rechaza (sin coste) · calla (caduca)
⑧ si nadie acepta          otro candidato · sube la oferta · la sala
```

**La capacidad, que ya estaba decidida (F0), se integra aquí y no añade hoja:** la capacidad
efectiva de un rider en un instante es **`min(volumen, tiempo, distancia)`** — lo que declara que
cabe (`capacidad-declarada`), lo que le deja el reloj de sus promesas vivas (`promesa-por-parada`)
y lo que le deja la ruta que ya lleva (`agregado-del-retraso`, `medida-desvio`). Se calcula dentro
de `candidatos-elegibles` (A04): **es una fórmula de tres términos, no una pieza.** Un rider "con
hueco" según su volumen puede no tenerlo según su reloj — y en la cena ese es el caso normal, no la
excepción.

### 0.3 · Los cuatro umbrales — y de quién son (corregido en esta pasada)

```                VALOR DE EJEMPLO (F0 §6)   DUEÑO DEL VALOR
desvío  < 800 m        metros de más          la PLAZA (Q1)
espera  < 4 min        minutos de espera       la PLAZA (Q1)
retraso < 6 min        minutos a los de a bordo la PLAZA (Q1)
cobra   > 0            lo que gana (¿neto?)    la PLAZA (Q1) · neto o bruto: Q2 ⚠
```

| Son | **NO** son |
|---|---|
| cuatro comparaciones, AND | un score ponderado ni un ranking |
| **configuración de la PLAZA** | constantes de la vertical |
| deterministas y explicables | un modelo entrenado ni una predicción |
| una **propuesta** con ventana | una asignación con plazo |
| la palanca del rider | un ahorro que Bocaos se queda |
| **intra-plaza, por construcción** | un enlace entre mercados distintos |

**La corrección de esta pasada.** La v2 decía "los umbrales son del PROYECTO" porque la F0 §6.3 lo
decía. Con tres niveles, "proyecto" es la tienda, y **una tienda con umbrales propios sería un
mercado dentro del mercado**. Lectura del esquema — y es pregunta (Q1 · Q43): los valores son de la
**plaza**; la tienda solo tiene **`incentivo-tienda`**. La tienda no necesita umbrales porque ya
tiene precio.

### 0.4 · Si falta un dato, no se estima

La ley de cero supuestos **en caliente**: sin posición fresca, sin histórico del local o sin precio
compuesto, **no hay propuesta**; el candidato se salta y el hueco se nombra (`hueco-de-medida`). Y
esto, aplicado a una plaza nueva, produce el **cuello del crecimiento**:

### 0.5 · EL SEGUNDO CUELLO · el arranque en frío de una plaza

```
una plaza nueva llega con cero hechos
   → sin histórico de puntualidad → `puntualidad-declarada` no tiene qué declarar
   → sin esperas medidas          → `medida-espera` no tiene contra qué medir
   → `hueco-de-medida` manda      → NO HAY PROPUESTA
   → no hay reparto → no hay pedidos → no hay hechos → no hay histórico      (bucle cerrado)
```

**La ley de cero supuestos, aplicada con honestidad, hace que una plaza recién abierta no pueda
repartir nada.** No es un bug: es el precio de no inventar datos. Pero es un problema de negocio de
primer orden, porque la §7 dice que crecer es abrir plazas. Las tres salidas son decisiones del
dueño y ninguna está declarada (Q51):

```
1 · política de arranque   umbrales laxos durante N días, y se dice que es un arranque
2 · observación            la plaza abre midiendo, sin repartir
3 · heredar histórico      de otra plaza — choca de frente con la regla 2 ("su histórico no viaja")
```

El esquema **no elige**. Deja el cuello nombrado y las tres salidas sobre la mesa.

---

## 1 · EL CORTE — qué es de la plaza y qué del nacional

### 1.1 · Las cuatro preguntas que deciden el nivel de una pieza (en orden)

```
1 · ¿necesita el evento, la ruta o la posición del instante?        sí → PLAZA
2 · ¿escribe dinero, estado de pedido, o una decisión sobre una
    tienda o un rider?                                              sí → PLAZA
3 · ¿el negocio sobrevive un día sin ella?
      la plaza sigue repartiendo → puede ser NACIONAL
      nada funciona              → es PLAZA
4 · ¿necesita saber QUÉ se pidió, POR CUÁNTO o A QUIÉN?
      sí → NO PUEDE ser del nacional. Nunca. Ni "solo para estadística".
```

### 1.2 · El reparto, en números

| Nivel | Hojas | % | Qué contiene |
|---|---|---|---|
| **NACIONAL** | **25** | 17 % | registro, censo, versiones, buscador, marca, soporte, consolidación, 4 guardas. **Ninguna decide nada.** |
| **PLAZA** | **103** | 72 % | toda la cadena de propuesta, ruta viva, pedido (registro), tarifa, reparto, fallos, liquidación, sala, config, riders, jefe y trabajador |
| **TIENDA** | **16** | 11 % | marca, carta, precio, carrito, cliente, radio, captura, hora de listo, cocina visible, aviso, incentivo, panel, puntualidad, resumen, reclamación |
| **total** | **144** | | + 3 **[ABIERTA]** |

**La proporción es el argumento.** Con el 72 % de las piezas en el despliegue y el 17 % arriba,
centralizarse exige reescribir medio árbol. **Eso es exactamente lo que la §7 quiere: que
centralizarse cueste caro.**

### 1.3 · Las cuatro cosas que el nacional NO tiene

```
pedidos     ni para consultarlos, ni para contarlos, ni "para mejorar el servicio"
catálogo    ni cartas, ni precios. Si los tuviera, sería el marketplace
carrito     sin carrito no hay venta; sin venta no hay captura de la demanda
riders      ni censo, ni histórico, ni disponibilidad. Los riders son de la plaza
```

Y las tres que no tiene aunque lo parezcan: **la sala** (es de la plaza) · **los umbrales** (de la
plaza) · **el dinero** (lo cobra la plaza; el nacional consolida y **no recauda**).

### 1.4 · La regla de la federación: habla por evento, no por consulta

El nacional **no consulta** la BD de una plaza: recibe hechos declarados. Si consultara, tendría los
pedidos por la puerta de atrás y el §7 entero se caería.

```
la plaza publica     plaza.viva            { plaza_id, version, estado, tiendas: N }
                     tienda.dada-de-alta   { plaza_id, tienda_id, nombre, estado }
                     plaza.devengo-cerrado { plaza_id, periodo, total, partes: N }
                     plaza.acceso-visto    { plaza_id, quien, alcance, desde, hasta }

el nacional publica  version.nueva         — un aviso, no una orden
                     plaza.suspendida      — la única orden que puede dar, y es de registro
```

**Lo que no está en esa lista, no cruza.**

### 1.5 · Las cuatro auditorías (el corte, verificado)

```
1 · el nacional no tiene pedidos     ninguna tabla con pedido/línea/importe/dirección/posición
                                     → `guarda-sin-catalogo-nacional`
2 · el nacional no recauda           ningún flujo mueve dinero de una parte (salvo su canon)
                                     → `guarda-no-recauda`
3 · ninguna fila cruza de plaza      toda fila lleva plaza_id y coincide con quien la escribió
                                     → `guarda-frontera-de-plaza`
4 · el nacional se puede apagar      con el nacional caído, la plaza acepta, propone y cobra
                                     → la que distingue una federación de un monolito
```

La cuarta es la dura. **Si una plaza necesita al nacional para proponer, el nacional tiene el poder
sin tener los datos** — la peor combinación posible.

---

## 2 · ÁRBOL MAESTRO

Leyenda: **P** = plaza · **N** = nacional · **T** = tienda. Formas: REFLEJO · CUSTODIO · PUENTE ·
CONVERSOR · FUZZY. Las referencias `A16` / `J01` / `M05` de las pasadas y del guion apuntan a estos
identificadores: la numeración de A–Q es **la misma de la v2** (las piezas nuevas se añaden al final
de su grupo con el número siguiente), y R y S son nuevas. `K03` · `R26` · `M06` son las tres
**[ABIERTA]**.

### A · PROPUESTA-ENLACE — el eslabón limitante · **P** · 35

- **A01** `hecho-pedido-listo` — **CUSTODIO** · el dato del evento, congelado con hora
- **A02** `composicion-de-la-vista` — **REFLEJO** · junta riders, rutas, paradas, histórico y config en una foto
- **A03** `congelacion-de-la-foto` — **REFLEJO** · una decisión lee una sola foto
- **A04** `candidatos-elegibles` — **REFLEJO** · quién puede recibir propuesta ahora, en esta plaza
- **A05** `ruta-base` — **REFLEJO** · metros del trayecto que ya lleva, sin la parada nueva
- **A06** `ruta-con-parada` — **REFLEJO** · el mismo trayecto con el local insertado
- **A07** `medida-desvio` — **REFLEJO** · metros de más: la resta de las dos rutas
- **A08** `medida-espera` — **REFLEJO** · minutos que esperaría si llega antes de que esté listo
- **A09** `retraso-por-parada` — **REFLEJO** · minutos que este pedido cuesta a cada pedido a bordo
- **A10** `agregado-del-retraso` — **REFLEJO** · el peor de los retrasos, no la suma
- **A11** `medida-cobra` — **REFLEJO** · lo que gana con este pedido, leído del precio ya compuesto
- **A12** `regla-de-enlace` — **REFLEJO** · los cuatro umbrales en AND; cuatro tests
- **A13** `propuesta-emitida` — **CUSTODIO** · a UN rider, con sus cuatro números y su versión de config
- **A14** `bloqueo-de-propuesta` — **CUSTODIO** · un desenlace por propuesta, sin carrera
- **A15** `ventana-de-propuesta` — **CUSTODIO** · el reloj de ~20 s y su caducidad
- **A16** `razones-de-la-decision` — **REFLEJO** · el conjunto cerrado de motivos, derivado de los números
- **A17** `frase-derivada` — **REFLEJO** · la plantilla que los convierte en una frase legible
- **A18** `redaccion-de-la-propuesta` — **FUZZY** · el agente que pone las palabras, con validador contra A16
- **A19** `aceptacion-libre` — **CUSTODIO** · el sí, atómico; crea el contrato puntual
- **A20** `hora-de-aceptacion` — **REFLEJO** · el hecho con hora que arranca los relojes
- **A21** `rechazo-sin-coste` — **REFLEJO** · el no se registra como hecho y no se castiga
- **A22** `guarda-sin-puntuacion` — **REFLEJO** · ninguna tasa de rechazo entra en la elegibilidad
- **A23** `caducidad-sin-respuesta` — **REFLEJO** · el silencio es un no, con hora
- **A24** `contrato-puntual` — **CUSTODIO** · pedido, rider, precio y ventana
- **A25** `siguiente-candidato` — **REFLEJO** · el avance por el orden determinista declarado
- **A26** `escalada-de-enlace` — **PUENTE** · nadie aceptó: otro rider, subir la oferta, o la sala
- **A27** `guarda-sin-asignacion` — **REFLEJO** · no hay camino pedido→rider sin aceptación
- **A28** `guarda-sin-optimizador` — **REFLEJO** · la decisión lee un evento y una vista; nada decide en bloque
- **A29** `reproduccion-de-la-decision` — **REFLEJO** · mismo evento, misma foto, misma config → misma propuesta
- **A30** `guarda-enlace-por-trayecto` — **REFLEJO** · se enlazan rutas, nunca clientes
- **A31** `guarda-enlace-no-rompe-promesa` — **REFLEJO** · ninguna promesa ya dada empeora más allá del umbral
- **A32** `guarda-no-captura-del-ahorro` — **REFLEJO** · la cuota no depende de km ahorrados
- **A33** `guarda-propuesta-unica` — **REFLEJO** · una propuesta viva por pedido: no hay sorteo
- **A34** `hueco-de-medida` — **REFLEJO** · si falta un dato no se estima: no hay propuesta y el hueco se nombra
- **A35** `guarda-enlace-intra-plaza` — **REFLEJO** · **NUEVA** · un pedido solo se enlaza con riders de su plaza

### B · RUTA-VIVA — el trayecto que el rider ya lleva · **P** · 6

- **B01** `posicion-rider` — **CUSTODIO** · el último punto conocido, con hora y frescura declarada
- **B02** `paradas-pendientes` — **REFLEJO** · las paradas del trayecto vivo, en su orden
- **B03** `promesa-por-parada` — **CUSTODIO** · la hora prometida a cada pedido a bordo
- **B04** `orden-de-paradas` — **REFLEJO** · reordena UNA ruta, jamás entre rutas
- **B05** `capacidad-declarada` — **CUSTODIO** · cuánto cabe, declarado por él
- **B06** `fin-de-trayecto` — **REFLEJO** · cierra el viaje cuando la última parada tiene hecho

### C · PEDIDO — el acto es T, el registro es P · 7

- **C01** `captura-pedido` — **REFLEJO** · **T** · alta del pedido, de a uno
- **C02** `estado-pedido` — **CUSTODIO** · **P** · la máquina de estados; ningún salto sin hecho con hora
- **C03** `aviso-tienda` — **PUENTE** · **P** · el pedido llega a la tienda por evento
- **C04** `hora-de-listo` — **CUSTODIO** · **T** · la tienda declara listo; es el disparador y es un hecho
- **C05** `estado-cocina-visible` — **REFLEJO** · **T** · lo que el cliente ve del estado, podado
- **C06** `aviso-cliente` — **PUENTE** · **T** · sale por el canal de la tienda
- **C07** `cancelacion` — **REFLEJO** · **P** · transiciones permitidas; quién paga, abierto

### D · PLAZA-TIENDA — el escaparate dentro de una plaza · 8

- **D01** `marca-tienda` — **CUSTODIO** · **T** · quién firma el escaparate: la tienda
- **D02** `carta-publica` — **CONVERSOR** · **T** · catálogo interno → vista pública podada, una sola fuente
- **D03** `precio-cerrado` — **REFLEJO** · **T** · todo compuesto en céntimos antes de pagar
- **D04** `carrito-tienda` — **CUSTODIO** · **T** · el buffer de compra por cliente y tienda
- **D05** `registro-cliente-tienda` — **CUSTODIO** · **T** · el cliente es de la tienda, aislado por tienda
- **D06** `radio-de-tienda` — **CUSTODIO** · **T** · **NUEVA** · lo que esta tienda declara que reparte
- **D07** `plaza-publica` — **REFLEJO** · **P** · el índice del mercado, ya filtrado por cobertura
- **D08** `neutralidad-orden` — **REFLEJO** · **P** · sin ranking, sin destacados, sin prioridad comprada

### E · TARIFA-TRES-BANDAS — el precio que hace calculable el `cobra` · **P** (incentivo: T) · 7

- **E01** `oferta-cliente` — **CUSTODIO** · **P** · lo que el cliente estipula; se congela con el pedido
- **E02** `incentivo-tienda` — **CUSTODIO** · **T** · lo que suma la tienda, con autor y hora
- **E03** `precio-reparto` — **REFLEJO** · **P** · oferta + incentivo, en céntimos
- **E04** `comision-coordinacion` — **REFLEJO** · **P** · los céntimos de la plaza por pedido aceptado
- **E05** `reparto-del-pago` — **CONVERSOR** · **P** · un precio → dos cobros a dos beneficiarios
- **E06** `contrato-tramos` — **CUSTODIO** · **P** · el contrato económico con la plaza, con vigencia
- **E07** `subida-de-oferta` — **CUSTODIO** · **P** · subir la oferta cuando nadie acepta, con autor y tope

### F · REPARTO-MEDIDO — la ejecución convertida en prueba · **P** · 7

- **F01** `hechos-del-reparto` — **CUSTODIO** · relojes, posición y prueba; inmutable
- **F02** `prueba-entrega` — **CUSTODIO** · foto, hora y confirmación
- **F03** `seguimiento-vivo` — **REFLEJO** · posición y estado, proyectados al cliente
- **F04** `chat-enmascarado` — **PUENTE** · rider ↔ cliente sin exponer números
- **F05** `instrucciones-acceso` — **CUSTODIO** · portal, piso e indicaciones
- **F06** `incidencia-reparto` — **PUENTE** · de la calle a la cola de la sala
- **F07** `lectura-de-incidencia` — **FUZZY** · el agente que clasifica el relato libre en campos cerrados

### G · ADJUDICACIÓN DE FALLOS — no juzga, mide · **P** · 6

- **G01** `ventana-espera` — **CUSTODIO** · las N declaradas: tienda, portal, llegada
- **G02** `hecho-verificado` — **REFLEJO** · cruza hechos contra ventana
- **G03** `regla-pago-fallo` — **REFLEJO** · la tabla que hace pagar el fallo; aquí hay un test, no un agente
- **G04** `cargo-fallo` — **CUSTODIO** · quién debe cuánto a quién, con evidencia
- **G05** `disputa-fallo` — **PUENTE** · a la sala; el humano aplica, no re-juzga
- **G06** `trazabilidad-fallo` — **REFLEJO** · sin evidencia no hay cargo

### H · LIQUIDACIÓN — el único dinero de Bocaos · **P** (consolidación: N) · 6

- **H01** `devengo` — **REFLEJO** · **P** · acumula céntimos por parte y periodo
- **H02** `ciclo-semanal` — **CUSTODIO** · **P** · abre, acumula y cierra el periodo de la plaza
- **H03** `factura-gestion` — **CONVERSOR** · **P** · devengo → documento de cobro
- **H04** `cobro-gestion` — **PUENTE** · **P** · cobra lo suyo, por el canal de cada parte
- **H05** `impago-gestion` — **REFLEJO** · **P** · regla de mora y suspensión
- **H06** `guarda-no-retencion` — **REFLEJO** · **P** · la plaza no toca el ticket ni el reparto

### I · SALA-MERCADO — la operación humana mínima · **P** · 8

- **I01** `alta-tienda` — **CUSTODIO** · el censo de tiendas de la plaza
- **I02** `alta-rider` — **CUSTODIO** · el censo de riders **de esta plaza** y lo que acreditan
- **I03** `estado-tienda` — **CUSTODIO** · abierta, cerrada, saturada
- **I04** `estado-rider` — **CUSTODIO** · disponible, ocupado o en pausa — la pausa la declara él
- **I05** `salud-mercado` — **REFLEJO** · propuestas por aceptación, riders activos, esperas, devengado
- **I06** `tablero-fricciones` — **REFLEJO** · los 8 pares de la F0, medidos
- **I07** `aviso-sala` — **PUENTE** · cuando el reflejo no puede resolver
- **I08** `terminos-parte` — **CUSTODIO** · lo que cada parte aceptó, con versión

### J · CONFIG — los números de la plaza · **P** · 5

- **J01** `config-umbrales` — **CUSTODIO** · los cuatro números y el orden de candidatos, con vigencia
- **J02** `config-ventana` — **CUSTODIO** · cuánto dura una propuesta
- **J03** `config-zona` — **CUSTODIO** · la cobertura declarada de esta plaza
- **J04** `version-efectiva` — **REFLEJO** · qué regla estaba viva en un instante
- **J05** `simulador-de-umbrales` — **REFLEJO** · qué pasaría con otros números, con los del proyecto

### K · CLIENTE FINAL — lo que solo se ve desde su silla · 2

- **K01** `reclamacion-por-la-tienda` — **PUENTE** · **T** · su única vía de queja pasa por la tienda
- **K02** `guarda-marca-ajena` — **REFLEJO** · **P** · ninguna comunicación al cliente lleva la marca de Bocaos (ni la de la plaza, ni la del nacional)

### L · RESTAURANTE — lo que solo se ve desde su silla · **T** · 4

- **L01** `panel-tienda` — **REFLEJO** · su espera medida, la misma que ve el rider
- **L02** `guarda-propiedad-cliente` — **REFLEJO** · sus clientes no cruzan de tienda
- **L03** `puntualidad-declarada` — **REFLEJO** · su hora-de-listo frente a lo prometido, publicada antes de aceptar
- **L04** `resumen-para-la-tienda` — **FUZZY** · el informe periódico en palabras, sobre hechos medidos

### M · REPARTIDOR AUTÓNOMO — lo que solo se ve desde su silla · **P** · 5

- **M01** `cartera-rider` — **REFLEJO** · lo ganado, lo debido y lo que se le debe — **una por plaza**
- **M02** `zona-rider` — **CUSTODIO** · la zona que él declara
- **M03** `guarda-sin-exclusividad` — **REFLEJO** · nada le bloquea por trabajar con otro
- **M04** `canal-rider` — **PUENTE** · el puerto por el que le llega la propuesta — **una instancia por plaza**
- **M05** `vista-de-propuesta` — **REFLEJO** · los mismos cuatro números, siempre, en el mismo orden, **con su plaza**

### N · BOCAOS (el suelo) — lo que solo se ve desde el suelo · **P** · 2

- **N01** `politica-densidad` — **REFLEJO** · riders por zona frente a pedidos por zona
- **N02** `simulador-tramos` — **REFLEJO** · el efecto de un tramo, con los números de la plaza

### O · ROL JEFE — dos jefes, no uno con dos pantallas · **P** · 4 (el del nacional, contado en R)

> El cuadro del jefe del nacional es `cuadro-de-la-federacion` (REFLEJO · **N**) y está contado en
> el grupo R: es pieza del registro, no de la plaza. Aquí solo se dice que existe, para que el rol
> jefe no parezca ciego en el nivel de arriba.

- **O01** `cuadro-del-mercado` — **REFLEJO** · **P** · los agregados para decidir un mercado
- **O02** `acta-decisiones` — **CUSTODIO** · **P** · por qué se cambió una regla, con vigencia
- **O03** `cola-revision-humana` — **CUSTODIO** · **P** · las decisiones automáticas que alguien pide revisar
- **O04** `dictamen-revision` — **CUSTODIO** · **P** · el hecho firmado que cierra una revisión

### P · ROL TRABAJADOR — la sala, que opera el día de hoy · **P** · 4

- **P01** `cola-sala` — **CUSTODIO** · una sola cola de excepciones vivas
- **P02** `vista-parte` — **REFLEJO** · todo lo de una tienda o un rider en una pantalla
- **P03** `accion-sancion` — **CUSTODIO** · suspensión con motivo, plazo y acta
- **P04** `checklist-alta` — **REFLEJO** · qué falta para dar de alta, sin memoria

### Q · ROL CLIENTE — la tienda que paga y el cliente final que no es de Bocaos · **P** · 1

- **Q01** `estado-cuenta-parte` — **REFLEJO** · devengado, cobrado, pendiente y cargos, con evidencia

### S · FRONTERA — la cobertura y su filtro · **P** · 2

- **S01** `frontera-de-plaza` — **REFLEJO** · **NUEVA** · de qué plaza es una dirección de entrega
- **S02** `filtro-por-cobertura` — **REFLEJO** · **NUEVA** · el índice muestra solo las tiendas que reparten ahí

### R · FEDERACIÓN — el registro · **N** · 25

- **R01** `registro-de-plazas` — **CUSTODIO** · el padrón: qué plazas existen, con qué estado y versión
- **R02** `alta-de-plaza` — **CUSTODIO** · abrir una plaza es un acto con fecha y responsable
- **R03** `estado-de-plaza` — **CUSTODIO** · naciendo · operando · en pausa · cerrada
- **R04** `silencio-de-plaza` — **REFLEJO** · cuánto puede callar una plaza antes de darla por caída
- **R05** `censo-de-tiendas` — **CUSTODIO** · qué tiendas hay en cada plaza — **nombre, id, estado. Nada más**
- **R06** `version-de-plaza` — **CUSTODIO** · qué versión corre cada plaza
- **R07** `despliegue-de-plaza` — **PUENTE** · el acto de desplegar; abrir plaza sin migrar
- **R08** `verificacion-de-despliegue` — **REFLEJO** · el despliegue no está hecho hasta que la plaza responde
- **R09** `compatibilidad-de-version` — **REFLEJO** · qué puede una plaza atrasada y qué no
- **R10** `indice-nacional` — **REFLEJO** · la proyección buscable del padrón
- **R11** `buscador-nacional` — **REFLEJO** · busca por localidad y nombre; **no** por producto ni por precio
- **R12** `resultado-con-su-plaza` — **REFLEJO** · ningún resultado huérfano: cada uno lleva su plaza
- **R13** `enrutado-a-plaza` — **PUENTE** · el clic sale del nacional y entra en la plaza
- **R14** `consolidacion-nacional` — **REFLEJO** · suma los devengos de las plazas; no recauda
- **R15** `cuadro-de-la-federacion` — **REFLEJO** · el cuadro del jefe del nacional (ver grupo O)
- **R16** `marca-nacional` — **CUSTODIO** · la marca B2B — nunca al cliente final
- **R17** `licencia-de-marca` — **CUSTODIO** · qué puede hacer una plaza con la marca, y cuándo se retira
- **R18** `soporte-nacional` — **PUENTE** · nivel 2: software y método; no opera pedidos
- **R19** `permiso-de-plaza` — **CUSTODIO** · la plaza concede el acceso, con alcance y plazo
- **R20** `traza-de-acceso` — **CUSTODIO** · qué se vio, cuándo y quién; append-only
- **R21** `acceso-delegado-a-plaza` — **CUSTODIO** · el permiso vivo, que caduca solo
- **R22** `acta-de-federacion` — **CUSTODIO** · qué aceptó cada plaza: las cinco cosas, cerradas
- **R23** `guarda-sin-catalogo-nacional` — **REFLEJO** · el nacional no guarda carta, precio, carrito ni pedido
- **R24** `guarda-no-recauda` — **REFLEJO** · ningún flujo del nacional toca el dinero de una parte
- **R25** `guarda-frontera-de-plaza` — **REFLEJO** · ningún dato de pedido cruza de una plaza a otra

### Las tres [ABIERTA] — no cuentan en las 144

- **K03** `transparencia-del-enlace` — **[ABIERTA]** · ¿el cliente sabe que su pedido comparte viaje, y si eso le baja el precio? (Q20)
- **R26** `canon-de-plaza` — **[ABIERTA]** · **NUEVA** · ¿cómo se paga el nacional? (Q41)
- **M06** `pasaporte-de-rider` — **[ABIERTA]** · **NUEVA** · ¿la credencial del rider viaja entre plazas? (Q44)

> La numeración es la de reserva: si el dueño enciende una, entra en su grupo con ese número y el
> árbol pasa a 145, 146 o 147 hojas. Mientras no se enciendan, **no son piezas: son preguntas.**

---

## 3 · LAS 18 INVARIANTES (renuncias que se escriben en código, no en un manifiesto)

Cada una es un **test**, no un párrafo. Si un día se pone roja, el modelo ha cambiado de naturaleza
— y conviene enterarse por un test y no por un restaurante enfadado.

| Renuncia (F0) | Pieza | Qué afirma el test |
|---|---|---|
| **No asigna** (§6.4) | `guarda-sin-asignacion` | no hay camino de pedido a rider sin una aceptación |
| **No decide en bloque** (§6.1) | `guarda-sin-optimizador` | la entrada de la decisión es UN evento y UNA vista |
| **La decisión es reproducible** (§6.2) | `reproduccion-de-la-decision` | mismo evento + misma foto + misma config → misma propuesta |
| **No agrupa clientes** (§6) | `guarda-enlace-por-trayecto` | la unidad del enlace es la ruta, no el cliente ni la hora |
| **El enlace no rompe la promesa** (§6.4) | `guarda-enlace-no-rompe-promesa` | ninguna promesa ya dada empeora más allá del umbral |
| **El ahorro no es de Bocaos** (§6.5) | `guarda-no-captura-del-ahorro` | la cuota no depende de km ahorrados ni de pedidos enlazados |
| **Una propuesta, un pedido** | `guarda-propuesta-unica` | no hay dos propuestas vivas del mismo pedido |
| **El rechazo no cuesta** (§6.7) | `guarda-sin-puntuacion` | ninguna agregación de rechazos entra en la elegibilidad |
| **No ordena el mercado** (§3) | `neutralidad-orden` | sin ranking, sin destacados, sin prioridad comprada |
| **No cobra el ticket / no retiene** (§1) | `guarda-no-retencion` | ningún flujo de la plaza toca el importe de la comida ni del reparto |
| **El cliente es de la tienda** (§1/§6) | `guarda-propiedad-cliente` + `guarda-marca-ajena` | ningún cliente cruza de tienda; ninguna comunicación lleva marca de Bocaos (ni de la plaza ni del nacional) |
| **El rider es autónomo** (§1) | `guarda-sin-exclusividad` | nada le bloquea por trabajar con otro |
| **El enlace no cruza plazas** (§7) | `guarda-enlace-intra-plaza` | `plaza(pedido) = plaza(rider) = plaza(propuesta)` en toda propuesta emitida |
| **El nacional no tiene el mercado** (§7) | `guarda-sin-catalogo-nacional` | no existe tabla con carta, precio, carrito, pedido ni posición en el nacional |
| **El nacional no recauda** (§7 r.4) | `guarda-no-recauda` | ningún flujo del nacional mueve dinero de una parte a otra |
| **Ninguna fila cruza de plaza** (§7 r.1–r.2) | `guarda-frontera-de-plaza` | toda fila de pedido, propuesta o cargo lleva `plaza_id` de quien la escribió |
| **Solo se ve lo que reparte** (§7 r.1) | `filtro-por-cobertura` | el índice no muestra una tienda que no reparte en la dirección consultada |
| **La marca del nacional no llega al cliente** (§7 r.5) | `guarda-marca-ajena` | ninguna comunicación al cliente final lleva la marca del nacional |

**Dos pares que no son la misma renuncia** (y que en la v2 ya se separaron, y ahora son tres):
`neutralidad-orden` prohíbe **vender** posiciones · `guarda-sin-optimizador` prohíbe **planificar**
el reparto · `guarda-sin-catalogo-nacional` prohíbe **tener** el mercado. Un mercado puede no vender
nada, no planificar nada y aun así tener un catálogo nacional — y ese catálogo sería el final del
modelo, igual de rápido.

---

## 4 · VERTICAL / PLAZA / TIENDA / FEDERACIÓN — la frontera exacta

| | lo fija la VERTICAL (forma) | lo declara la PLAZA (valor) | lo declara la TIENDA | lo declara el NACIONAL |
|---|---|---|---|---|
| umbrales | que hay 4, sus unidades, AND | los cuatro números ⚠Q1 | — | — |
| ventana | que es finita y declarada | su duración | — | — |
| candidatos | que el orden es determinista | el orden | — | — |
| cobertura | que hay una y filtra | sus barrios | su radio | — |
| vigencia | que toda regla la tiene | la fecha | la de su incentivo | la de su versión |
| tramos | que hay fijo y por pedido | los números | — | — (Q41) ⚠ |
| espera | que se mide y se cobra | las tres N | — | — |
| liquidación | que es por plaza | ciclo y mora | — | que **consolida y no recauda** |
| plazas | que puede haber N | — | — | cuáles existen y en qué estado |
| marca | que hay marca de tienda | su marca de plaza (Q49) | la suya | la B2B |

**La prueba de fuego, en tres cortes:**

```
borra la TIENDA    → quedan reglas sin mercado. Nada que vender.
borra la PLAZA     → quedan 144 piezas y ningún sitio donde poner un número.
borra el NACIONAL  → las plazas siguen repartiendo, proponiendo y cobrando. Solo se pierde el mapa.
```

El tercero es el que valida la federación: **si al borrar el nacional el negocio se cae, el nacional
no era un registro.**

---

## 5 · LAS FRICCIONES — 8 de la F0 + 1 que añade la §7

### 5.1 · Las ocho de la F0

| Par | Pieza(s) | Lo que **no** se resuelve |
|---|---|---|
| cliente ↔ restaurante | `precio-cerrado` · `estado-cocina-visible` · `aviso-cliente` · `medida-espera` | que la comida esté buena |
| restaurante ↔ rider | `puntualidad-declarada` · `medida-espera` · `ventana-espera` · `panel-tienda` | la cocina lenta: solo se hace **visible y cobrada** |
| rider ↔ cliente | `prueba-entrega` · `seguimiento-vivo` · `chat-enmascarado` · `instrucciones-acceso` | que el cliente baje |
| restaurante ↔ Bocaos | `guarda-propiedad-cliente` · `simulador-tramos` · `estado-cuenta-parte` | el miedo a perder su cliente: lo resuelve el primer mes funcionando |
| rider ↔ Bocaos | `cartera-rider` · `guarda-sin-exclusividad` · `vista-de-propuesta` · `razones-de-la-decision` | que haya pedidos suficientes el primer mes |
| cliente ↔ Bocaos | `guarda-marca-ajena` · `reclamacion-por-la-tienda` | que el cliente sepa que Bocaos existe — **y eso es deliberado** |
| restaurante ↔ restaurante | `neutralidad-orden` · `plaza-publica` · `filtro-por-cobertura` | que compitan: es un mercado, competir es el punto |
| rider ↔ rider | `candidatos-elegibles` · `neutralidad-orden` · `guarda-propuesta-unica` | que gane el rápido: es lo que debe pasar |

### 5.2 · La novena, que la §7 añade

```
par 9 · PLAZA ↔ NACIONAL        (la fricción de la federación)

fricción   la marca es compartida y la culpa es local.
           una plaza que cocina mal o estafa a un cliente daña una marca que el nacional posee
           y no puede corregir. Y al revés: el nacional puede expulsar una plaza que funciona,
           por una decisión de marca, y con ello apagar un mercado entero.

Bocaos     licencia-de-marca con condiciones y retirada · acta-de-federacion · traza-de-acceso
           (para poder mirar cuando hay una denuncia, con permiso) · estado-de-plaza

NO resuelve   que el nacional tenga responsabilidad sin autoridad. Los tres únicos instrumentos
              son: no dejar entrar, sacar, retirar la marca. Todo llega tarde.
              Si se le da acceso para corregir → tiene los pedidos → deja de ser federación.
              Si no → la marca es rehén de la peor plaza.
```

**No hay tercera vía y el esquema no la inventa.** La mitigación honesta es de contrato, no de
software — y eso es una decisión que el dueño tiene que tomar sabiendo lo que compra al federar.

---

## 6 · LO QUE LA §7 ROMPE (y qué se hace con ello)

Un esquema que no dice qué le rompen sus entradas no sirve de nada. Cinco cosas:

| # | Lo que decía la v2 | Lo que dice la §7 | Consecuencia |
|---|---|---|---|
| 1 | `config-umbrales` es "**del PROYECTO**" (§6.3) | "la plaza [tiene] sus reglas y sus umbrales" | **cambia el dueño, no la pieza**: umbrales = plaza; la tienda solo tiene incentivo (Q1 · Q43) |
| 2 | "el nacional comparte **la liquidación**" (r.5) | "la liquidación es por plaza; el nacional **consolida, no recauda**" (r.4) | la palabra hacía dos trabajos: se parte en `ciclo-semanal`/`cobro-gestion` (P) y `consolidacion-nacional` (N) |
| 3 | "el nacional comparte **el soporte**" (r.5) | "el nacional **no** tiene los pedidos" (§7) | soporte sin pedidos es soporte ciego: o `acceso-delegado-a-plaza` con permiso y traza, o solo software (**Q46**) |
| 4 | el rider tiene **una** cartera (`cartera-rider`) | "se da de alta en cada plaza; su histórico no viaja" | un rider en dos plazas tiene **dos carteras, dos altas, dos historias**: es el actor que puede marcharse (Q44 · Q45) |
| 5 | "cada tienda = un proyecto" + "la plaza = un despliegue con su BD" | las dos a la vez | **si un proyecto es una BD, no caben las dos** (Q55): la tabla del corte funciona con las dos respuestas, la FASE 3 no |

Y una sexta, que no es contradicción sino hallazgo: **el arranque en frío** (§0.5). La §7 dice que
crecer es abrir plazas; la ley de cero supuestos dice que una plaza sin histórico no propone. Las
dos cosas son verdad y juntas describen el problema real del negocio.

---

## 7 · PUERTOS ABIERTOS (agnosticismo — cero tecnologías)

- **Canal al cliente final**: el de la tienda. El esquema solo exige que **no sea una app de
  Bocaos** — y ahora también que **no sea una app de la federación**.
- **Canal al rider** (`canal-rider`): puerto abierto e intercambiable, **una instancia por plaza**;
  con ~20 s de ventana, ese puerto es crítico (Q5).
- **Canal de cobro** (`cobro-gestion`): el que declare cada parte.
- **Canal de la sala** (`aviso-sala`, `cola-sala`): el que el dueño declare.
- **Fuente de posición, ruta y foto** (`posicion-rider`, `prueba-entrega`): se declara al aterrizar.
  El esquema pide hecho con hora, no reescribible, con **frescura declarada**.
- **Catálogo**: la fuente es el TPV de la tienda (*pizzepos*, declarado en F0). El escaparate
  **proyecta**, no guarda una segunda carta.
- **Cálculo de ruta** (`ruta-base`, `ruta-con-parada`): puerto abierto. El esquema pide metros y
  minutos; cómo se obtengan es del sitio (Q37).
- **Geometría de la cobertura** (`config-zona`, `radio-de-tienda`, `frontera-de-plaza`): polígono,
  radio o códigos postales — puerto abierto. El esquema solo exige que **exista y sea declarada**.
- **Transporte entre plaza y registro** (`plaza.viva`, `tienda.dada-de-alta`,
  `plaza.devengo-cerrado`): puerto abierto. El esquema exige **evento, no consulta**.
- **Vocabulario**: "pizzepos", "plaza", "tramo 1/2/3", "federación" son nombres del negocio, no del
  stack.

---

## 8 · INVESTIGACIÓN (lo investigable, investigado)

**Lo de la v2 sigue vigente** —Directiva (UE) 2024/2831, arts. 3–5 (calificación por los hechos y
presunción de laboralidad), 6 (informar de los sistemas automatizados; no procesar datos no
necesarios ni fuera del horario), 7–8 (supervisión y revisión humana, derecho a explicación), 10
(esos derechos alcanzan a quien no tiene contrato), 15 (los riders pueden comunicarse entre sí y la
plataforma no puede monitorizarlo)—. Nada de eso cambia con la §7: **la plaza es la que decide y,
por tanto, la que debe poder explicar.** El nacional, que no decide, no tiene deber de explicar una
propuesta — y eso es coherente.

**Lo nuevo que la §7 obliga a mirar, consultado hoy:**

**a) RGPD, art. 26 — corresponsables del tratamiento.** El texto consolidado dice: *"cuando dos o
más responsables del tratamiento determinen conjuntamente los fines y los medios del tratamiento,
serán corresponsables"*, y les exige **determinar de forma transparente sus respectivas
responsabilidades** mediante un acuerdo entre ellos (art. 26.1). Consecuencia directa para este
esquema:

- Si el nacional **consolida** datos personales de varias plazas (aunque sean importes agregados por
  parte, que pueden identificar a una tienda o a un rider), no es un mero encargado: hay fines
  propios. → `acta-de-federacion` **deja de ser un documento de marca y pasa a ser también el
  acuerdo del art. 26**: quién es responsable de qué, y cómo se atienden los derechos del
  interesado.
- Si el nacional es **solo** un registro de plazas y censos de tiendas (personas jurídicas, no
  personas físicas), puede no haber corresponsabilidad. **La frontera la decide Q41/Q53** (qué
  hace el nacional con la liquidación) y **Q54** (qué datos de tienda viajan).

**b) Reglamento de Servicios Digitales (DSA), art. 30 — trazabilidad de los comerciantes.** Se aplica
a las plataformas en línea que permiten a los consumidores **celebrar contratos a distancia con
comerciantes**: obliga a recabar y verificar datos del comerciante antes de dejarlo ofrecer sus
productos. El art. 19 excluye de las obligaciones de diligencia (Sección 3) a las micro y pequeñas
empresas; **no he podido confirmar en el texto consolidado si esa exclusión alcanza a la Sección en
la que se sitúa el art. 30** (EUR-Lex no devolvió el HTML en la consulta de hoy). Por prudencia:

- **Si el nacional acaba siendo algo más que un registro** (por ejemplo, un buscador que permite
  contratar, o un índice con fichas de tienda), cae en el ámbito del art. 30 y necesita los datos
  del art. 30.1 (nombre, dirección, teléfono, correo, registro mercantil, etc.).
- **Si se queda en registro + enrutado**, cada plaza es la que permite contratar, y la obligación es
  de la plaza.
- **`guarda-sin-catalogo-nacional` no es solo una renuncia de producto: es también la línea que
  mantiene al nacional fuera del ámbito del art. 30.** Eso es un argumento nuevo a favor de la §7 y
  conviene tenerlo escrito.

**Lo que la investigación NO resuelve** (sigue siendo pregunta al dueño): la **relación contractual
del rider** (Q23) y **con cuál de los dos Bocaos** contrata (Q42). La F0 dice a la vez que "se
oferta a los restaurantes" y que "el cliente paga al rider su reparto". Con quién contrata decide si
la presunción de laboralidad le alcanza — y la §7 añade una capa: un rider con dos altas en dos
plazas tiene dos relaciones, y la presunción se mira **por relación**.

---

## 9 · DISECCIÓN — recuento de FORMAS

**144 hojas atómicas, todas con forma** (detalle en `pasada-diseccion.md`). Más 3 **[ABIERTA]**.

| Forma | Nº | Qué significa aquí |
|---|---|---|
| REFLEJO puro | 75 | cuatro medidas, relojes, céntimos, filtros, invariantes |
| CUSTODIO | 50 | el evento, la propuesta, el contrato, el registro, los hechos |
| PUENTE | 13 | avisos, escalada, despliegue, enrutado, soporte, disputa |
| CONVERSOR | 3 | carta→escaparate, precio→dos cobros, devengo→factura |
| MICRO-AGENTE fuzzy | 3 | el borde: redactar, leer una incidencia, resumir |
| **total** | **144** | + 3 [ABIERTA] |

**El hallazgo de esta pasada, y es el contrario del de la anterior.** La v2 descubrió que la §6
dejaba entrar a la IA en el borde (tres agentes, ninguno decide). La §7 no añade ni un agente:
**el nacional es 25 hojas y ninguna es fuzzy, ninguna es conversor.** Guarda, proyecta y suma. Un
registro que empieza a "entender" cosas es un registro que empieza a decidir.

Y lo que no cambia: **ni un agente toca la decisión de a quién se propone.** Eso son cuatro
comparaciones y cuatro tests, en una plaza.

---

## 10 · PREGUNTAS ABIERTAS — 56

Guion completo en `guion-preguntas.md`. Las 40 de la v2 (con las que la §7 reabre o cierra) más 16
nuevas de la federación.

```
A · el criterio          Q1–Q8      los cuatro números, la ventana, el orden — y su dueño
B · el rechazo           Q9–Q13     la libertad del rider y sus consecuencias
C · el dinero            Q14–Q19    tramos, `cobra` neto, subida de oferta, quién paga
D · la transparencia     Q20–Q22    qué sabe el cliente y a qué precio
E · legal y revisión     Q23–Q26, Q34
F · la operación         Q27–Q33, Q35–Q40
G · LA FEDERACIÓN        Q41–Q56    el dinero del nacional, el rider entre plazas, el soporte,
                                    la frontera, la forma del despliegue

bloquean construcción:  Q1 · Q2 · Q6 · Q7 · Q14 · Q41 · Q42 · Q50 · Q55   (9)
```

Las nueve que bloquean, en una línea cada una:

```
Q1  ¿los umbrales son de la plaza?              sin esto, el grupo J no tiene dueño
Q2  ¿`cobra` es neto del desvío?                sin esto, el umbral no filtra y el rider pierde
Q6  ¿propuestas en serie o en paralelo?          decide el producto sin tocar la regla
Q7  ¿en qué orden se recorre a los candidatos?   el orden ES la política del mercado
Q14 ¿cuánto el fijo y cuántos céntimos?          sin números no hay devengo ni propuesta comercial
Q41 ¿con qué se paga el nacional?                sin esto no hay federación, hay un despliegue grande
Q42 ¿quién factura a la tienda?                  sin esto el contrato está roto en dos
Q50 ¿quién abre una plaza?                       decide si esto es franquicia, cooperativa o empresa
Q55 ¿una plaza es un proyecto con N tiendas?     la FASE 3 no puede empezar sin esta respuesta
```

---

## 11 · ESTADO DE LA FASE

- **Prisma global:** ronda 1 reescrita con tres niveles (`pasada-1-bocaos.md`); el punto nuevo
  `federacion` recorrió 2 → 3 → 4 hasta seca (`pasada-2`, `-3-`, `-4-`); 6 puntos más en
  `pasada-2-*` (plaza, corte, tienda, config, liquidación, sala) y las 8 pasadas heredadas de la v2
  revalidadas contra §7.
- **Prisma por interlocutor:** 4 de la v2 + **2 nuevas**: `bocaos` desde la plaza y `bocaos` desde
  el nacional (el mismo actor, dos sillas que la §7 declara — no se amplía el mapa de la FASE 0).
- **Prisma por rol:** `jefe` rehecho con dos niveles (`pasada-rol-jefe-federacion.md`) + los tres de
  la v2.
- **Disección:** 144 hojas, **todas con forma** + 3 **[ABIERTA]**. **El §7 no cambió ninguna forma.**
- **Corte:** 25 nacional · 103 plaza · 16 tienda, con 4 auditorías ejecutables.
- **Cero tecnologías** fuera de los puertos abiertos (§7).
- **Cero tiendas, ciudades, precios ni riders concretos**: vertical, no proyecto.
- **Siguiente:** las 56 preguntas al dueño —**empezando por Q41, Q42, Q50 y Q55**— y con las
  respuestas la pasada 2 del ciclo sobre `canon-de-plaza`, `medida-cobra` y `transparencia-del-enlace`.
  **Solo entonces** `completar_fase { fase:'esquematizado' }`, que empuja la **FASE 3 · PLASMA**
  (`planificar-construccion` → `esquemas/diseno-oop.md`).

### Índice de ficheros de esta fase

```
esquemas/
├─ pasada-1-bocaos.md                          el prisma global, con los tres niveles
├─ pasada-2-federacion.md                      R ← EL REGISTRO (nuevo)
├─ pasada-3-federacion-desglose.md             R, segunda vuelta (19 → 25)
├─ pasada-4-federacion-seca.md                 R, tercera vuelta (seca)
├─ pasada-2-plaza-despliegue.md                la plaza como unidad (nuevo)
├─ pasada-2-corte-de-piezas.md                 ← LA TABLA QUE HACE VERIFICABLE LA §7
├─ pasada-2-plaza-tienda.md                    D, actualizado (cobertura)
├─ pasada-2-config-plaza.md                    J, corregido (los umbrales son de la plaza)
├─ pasada-2-liquidacion-federada.md            H, partido en dos (plaza / consolidación)
├─ pasada-2-sala-y-soporte.md                  I, partido en dos (sala / soporte)
├─ pasada-2-propuesta-enlace.md                A ← EL ESLABÓN LIMITANTE (heredada)
├─ pasada-3-propuesta-enlace-desglose.md       A, segunda vuelta (heredada)
├─ pasada-4-enlace-seco.md                     A, tercera vuelta (heredada)
├─ pasada-2-ruta-viva.md                       B (heredada)
├─ pasada-2-pedido-listo.md                    C (heredada)
├─ pasada-2-tarifa-tres-bandas.md              E (heredada; contratante = la plaza)
├─ pasada-2-reparto-medido.md                  F (heredada)
├─ pasada-2-adjudicacion-fallos.md             G (heredada)
├─ pasada-interlocutor-cliente.md              K (heredada)
├─ pasada-interlocutor-restaurante.md          L (heredada)
├─ pasada-interlocutor-repartidor-autonomo.md  M (heredada)
├─ pasada-interlocutor-bocaos-plaza.md         N desde la plaza (nueva)
├─ pasada-interlocutor-bocaos-nacional.md      N desde el nacional (nueva)
├─ pasada-rol-jefe-federacion.md               O · dos jefes (nueva)
├─ pasada-rol-trabajador.md                    P (heredada)
├─ pasada-rol-cliente.md                       Q (heredada)
├─ pasada-diseccion.md                         la FORMA de las 144 hojas
├─ guion-preguntas.md                          las 56 preguntas
└─ esquema.md                                  ESTE árbol maestro
```

> **Alias que quedan en las pasadas heredadas de la v2** (el árbol maestro es la autoridad):
> `vista-del-instante` → `composicion-de-la-vista`+`congelacion-de-la-foto` · `medida-retraso` →
> `retraso-por-parada`+`agregado-del-retraso` · `explicacion-de-la-propuesta` →
> `razones-de-la-decision`+`frase-derivada` · `vista-de-propuesta` (misma pieza, ampliada con la plaza).

---

## Anexo · Qué cambia respecto a la v2

| | v2 | esta pasada |
|---|---|---|
| Unidades del negocio | 1 (el mercado) | **3** (federación · plaza · tienda) |
| El nacional | no existía | **25 hojas**: registro, censo, versiones, buscador, marca, soporte, consolidación, 4 guardas |
| Dueño de los umbrales | "del PROYECTO" (§6.3) | **de la PLAZA**; la tienda solo tiene incentivo (Q1 · Q43) |
| Dueño de la liquidación | Bocaos (una) | **la plaza cobra; el nacional consolida y no recauda** |
| Dueño de la sala | Bocaos | **la plaza**; el nacional tiene un mostrador de software |
| Cobertura | `config-zona` ("qué barrios cubre") | **dos declaraciones** (plaza × tienda) + **un filtro** que es el que ve el cliente |
| El cliente | veía el mercado | **solo ve las tiendas que reparten en su dirección**; las demás no existen |
| Enlace entre tiendas | abierto (Q31) | **sí, y siempre dentro de una plaza** — cerrado por arquitectura |
| Rider | una cartera, un historial | **N altas, N carteras, N historias**; la credencial, abierta (Q44) |
| Soporte | de Bocaos | **del nacional, sin pedidos** → o acceso delegado con permiso y traza, o soporte ciego |
| Formas | 115 hojas: 61 R · 38 C · 10 P · 3 CV · 3 F | **144: 75 R · 50 C · 13 P · 3 CV · 3 F** — y **ninguna forma cambia** |
| Agentes | 3, en el borde | **3, y ninguno en el nacional** (un registro que "entiende" empieza a decidir) |
| Preguntas | 40 | **56** (+16 de la federación) |
| Fricciones | 8 pares | **9** (el par plaza ↔ nacional: marca compartida, culpa local) |
| Invariantes | 12 | **18** (+6 de la federación) |
| Hueco nuevo más caro | el `cobra` neto | **el nacional no tiene ingreso declarado** (Q41) |
