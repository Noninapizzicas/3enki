# DISEÑO OOP — vertical **BOCAOS** (Fase 3 · PLASMA)

> **Qué es este documento.** El sistema de Bocaos escrito en objetos: qué cosas existen, qué
> sabe cada una, qué hace y qué no puede hacer. Es el **plano**, no la obra. Aquí no hay
> tecnología, ni proveedores, ni dónde se instala: todo lo de fuera entra por **puerto abierto** (§5).
>
> **Entrada**: el árbol maestro de la FASE 2 (`proceso/fase2/esquemas/esquema.md`, las diez
> pasadas de grupo, la disección de las 115 hojas, los cuatro prisma por interlocutor y los tres
> por rol). El sujeto del diseño son **sus piezas**, no el negocio: el negocio no se replantea.
>
> **Salida**: este único archivo. La FASE 3b traducirá estas clases contra lo que ya exista; la
> FASE 4 las materializará. **Ninguna de las dos cosas se hace aquí.**
>
> **Regla del plasma**: cero juicio automático. El sistema mide, transporta y escribe; donde hay
> que elegir, hay una `SolicitudDecision` y un humano (§7). Los tres únicos agentes del negocio
> están **en el borde** y ninguno escribe: adornan, clasifican o resumen lo que otro ya calculó.

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

## 0 · Cómo se lee

```text
CLASE NombreDeLaCosa          [FORMA · código de la pieza en la F2]
  DATOS   lo que la clase sabe. Nada más.
  HACE    lo que puede hacer. Verbos, con entrada y salida.
  REGLA   lo que NO puede hacer, o el test que la sostiene. Es la parte que se defiende.
```

Convenciones:

- **`NO_CONSTA`** es un valor, no un error. Significa *el dato no está y no se estima*. Es
  distinto de `NO_HAY` (*no existe tal cosa*) y de `0` (*existe y vale cero*). Confundir los
  tres es la forma más rápida de inventar un mercado.
- **`[ABIERTO Qnn]`** remite a una de las 40 preguntas del guion de la F2. **`[ABIERTO Qnn·F3]`**
  es una pregunta que **destapa este diseño** y que la F2 no podía ver todavía.
- **`SUPUESTO Sn`** marca una decisión que el dueño dio **provisionalmente** y que aquí se usa
  para poder dibujar, no porque esté cerrada. Los cinco supuestos, con su nombre y su
  aislamiento, están en §3.
- Los nombres de clase están en castellano y en singular: son **cosas del negocio**, no tipos
  del lenguaje. `Propuesta`, `ContratoPuntual`, `Cargo` y `Deuda` son cuatro cosas distintas y
  el diseño las mantiene distintas a propósito.

---

## 1 · Objetivo del sistema

**El sistema existe para hacer una pregunta miles de veces al día, siempre igual: ¿a quién le
propongo este pedido, ahora, y con qué cuatro números se lo explico?**

Todo lo demás —el escaparate, el precio, los relojes, la prueba, la cuota— está al servicio de
que esa pregunta se pueda hacer **con datos**, **sin inventar** y **sin que nadie pueda
ordenarla desde arriba**.

```text
LO QUE HACE
  · deja que la tienda publique su carta y su marca, y que su cliente pida en su web
  · convierte "está listo" en un hecho con hora
  · mide, para cada rider que ya está en la calle, cuatro números sobre SU trayecto
  · propone a UNO, con esos números, una frase que los explique y una ventana finita
  · registra el sí, el no o el silencio, y con el sí crea un contrato puntual
  · mide el reparto hasta la prueba de entrega
  · cobra la espera cuando se pasa de lo declarado, con evidencia
  · acumula la cuota de coordinación y la cobra cada semana, sin tocar el ticket ni el reparto

CUÁNDO INTERRUMPE AL DUEÑO  (y solo entonces)
  · cuando hay que cambiar el criterio (los cuatro números, la ventana, la zona)
  · cuando el pedido no encuentra a nadie y hay que decidir si se sube la oferta y quién paga
  · cuando una parte disputa un cargo
  · cuando alguien pide revisar una decisión automática
  · cuando hay que abrir o cerrar una zona

CUÁNDO NO INTERRUMPE, PORQUE NO PUEDE
  · nunca para decidir a quién se propone un pedido
  · nunca para asignar un reparto
  · nunca para juzgar un fallo
  · nunca para elegir qué ve el cliente
```

**La unidad del sistema no es el pedido: es la propuesta aceptada.** Un pedido que no encuentra
a nadie es una venta que no existió, y el diseño tiene que poder contarla (§4, `A34`).

---

## 2 · El corazón: la propuesta como función

Todo el negocio se juega en que esto sea **una función y no un estado**. Se escribe una vez y
se lee como una firma:

```text
PROPUESTA = F( hecho: HechoPedidoListo, foto: FotoDelInstante, política: PolíticaVigente )
         →  Propuesta  |  Hueco  |  NINGUNA

F(hecho, foto, política):

   C ← CandidatosElegibles.de(foto)            // sólo estado, zona y capacidad DECLARADOS
   si C está vacío:
        → HuecoDeMedida.nombrar(«nadie declarado disponible ahora»)

   para cada c ∈ C, en el orden que declara la política:      // §3, SUPUESTO S4

        m ← { desvío  : MedidaDesvío.medir( RutaBase.de(c,foto), RutaConParada.de(c,hecho,foto) )
              espera  : MedidaEspera.medir( c, foto, hecho.hora_listo )
              retraso : AgregadoDelRetraso.agregar( RetrasoPorParada.medir(…) )
              cobra   : MedidaCobra.medir( hecho.precio, desvío, espera, coste_declarado(c) ) }

        si algún m = NO_CONSTA:
              → HuecoDeMedida.nombrar(c, m.faltantes);  siguiente
        si no ReglaDeEnlace.pasa(m, política) = no:
              siguiente                                        // cuatro tests, AND
        devolver PropuestaEmitida.emitir( hecho, c, m, Huella(foto), política.version )

   devolver NINGUNA                                           // no decide: escala (§6.3)
```

Cuatro propiedades que se sostienen solas y que el diseño entero protege:

```text
1 · PURA         Dentro de F nadie lee el mundo. Todo lo que F sabe está en la foto.
                 Si F consultara algo vivo, la explicación que se dio dejaría de ser cierta
                 un segundo después — y con ella el derecho a saber por qué (A16, A17).

2 · REPRODUCIBLE mismo hecho + misma foto + misma política → misma propuesta, mismos cuatro
                 números. Se puede volver a ejecutar meses después y comparar (A29).

3 · LOCAL        La entrada es UN hecho. No hay una lista de pedidos, ni un barrido, ni una
                 re-optimización del día. Es lo que hace el mercado no ordenable (A28).

4 · TERMINA EN   El sí lo pone el rider. F no puede terminar en un contrato: F termina en una
    UNA PREGUNTA propuesta con ventana. La única puerta al contrato es A19 (A27).
```

> **La consecuencia incómoda, y es la que hay que escribir**: si el cuarto número (`cobra`)
> necesita un coste que nadie ha declarado, `F` **no devuelve propuesta ninguna** — devuelve
> huecos, miles, en cada candidato. El mercado sería perfectamente determinista y no movería un
> solo pedido. Ver §3, tensión T2. No se rellena ese hueco con una estimación.

---

## 3 · Los cinco supuestos declarados (y las tres tensiones que abren)

El dueño dio por buenas cinco respuestas **provisionales** a las cinco preguntas que bloqueaban
construcción. Se usan para poder dibujar. **No son hechos y el diseño no las necesita ciertas**:
cada una vive en un solo sitio, y ese sitio es de valores, no de forma.

### 3.1 · Los cinco supuestos

```text
S1 · Q1 — umbrales          desvío 800 m · espera 4 min · retraso 6 min · cobra > 0
    VIVE EN   ConfigUmbrales (J01), como VALORES con vigencia.
    AÍSLADO   La vertical fija que hay cuatro umbrales, con esas unidades y en AND.
              Cambiar los números no toca ni una clase: se escribe otra versión y ya.
    SI SE CAE  cambia el número de propuestas, no la cadena. (Y sigue abierto: ¿son del
              proyecto o del primer mercado? La respuesta los pone en el proyecto; la F2
              también. Coinciden.)

S2 · Q2 — qué es cobra      INGRESO MARGINAL NETO: lo que gana con el pedido menos lo que le
                            cuesta el desvío y la espera. Si ≤ 0, no se le propone.
    VIVE EN   MedidaCobra (A11).
    AÍSLALO   —ver tensión T2—. El umbral `cobra > 0` sólo protege si es neto; con bruto, el
              cuarto test es casi siempre verdadero y el rider puede perder dinero pasando
              el umbral. Aquí se implementa NETO porque es lo que el dueño dijo.
    CONSECUENCIA DURA  Neto exige un coste del desvío y de la espera del rider, y ese coste
              no está declarado en ningún sitio. Ver Q41·F3. Sin él: NO_CONSTA y no hay
              propuesta.

S6 · Q6 — cómo se propone    EN SERIE. Máximo 2 candidatos, 10 s cada uno. Si los dos rechazan:
                             sube la oferta, o va a la sala.
    VIVE EN   ConfigVentana (J02) → 10 s  ·  ConfigUmbrales (J01) → tope = 2 candidatos.
    AÍSLADO   A15 abre la ventana con la duración de la política; A25 avanza; A26 escala al
              agotar el tope. Poner paralelo no cambia ni una clase: cambia la ventana por
              pedido y enciende A33 (una propuesta viva por pedido).
    OBSERVACIÓN  2 × 10 s = los ~20 s que la F0 daba como ventana total. Coincide, y eso
              quiere decir que el primer mercado puede fallar entero en 20 s — y que la
              escalada tiene 20 s de margen, no más.

S7 · Q7 — a quién primero     EL QUE MEJOR PUNTÚA, con la fórmula publicada.
    VIVE EN   ConfigUmbrales (J01), campo `orden`  →  SiguienteCandidato (A25).
    AÍSLALO   —ver tensión T1, que es la más delicada del diseño—.
    NOTA      La F2 dejaba este hueco como "el orden es política y tiene que estar escrito y
              ser público". El dueño ha elegido *una* política: una fórmula. El diseño la
              acepta como supuesto y la encierra para que no pueda crecer (§3.2, T1).

S14 · Q14 — los tramos        fijo mensual 39 / 79 / 149 €  (pizzepos)
                              10 céntimos por pedido al rider
                              20 céntimos por pedido a la tienda
    VIVE EN   ContratoTramos (E06), con vigencia y autor.
    AÍSLADO   Devengo (H01), ComisiónDeCoordinación (E04) y RepartoDelPago (E05) leen el
              contrato; no llevan números dentro. Cambiar la tabla no toca el cálculo.
    ABIERTO   Sigue abierto qué tramo corresponde a cada tienda, si el tramo 2 va incluido en
              el 1 (la F2 dice que sí) y qué pasa con el IVA [ABIERTO Q4].
```

### 3.2 · Las tres tensiones — se nombran, no se resuelven

**T1 · «el que mejor puntúa» contra «cuatro comparaciones, cero ponderaciones».**

La disección de la F2 prohíbe un *scorer* con todas las letras: *«cualquier número único que
ordene riders es una nota con otro nombre»*. La respuesta del dueño pide exactamente un número
único que ordene. Las dos cosas pueden convivir **solo** si se cumple todo esto, y el diseño lo
encierra así:

```text
LA PUNTUACIÓN NO FILTRA:   quien pasa es quien pasa los cuatro umbrales en AND (A12).
                           La fórmula sólo decide A QUIÉN SE PREGUNTA PRIMERO, entre los que
                           ya pasaron. El filtro no se pondera nunca.
LA FÓRMULA ES PÚBLICA:     se publica antes del primer pedido, con sus pesos, y viaja dentro de
                           la política (J01). No hay pesos privados.
LA FÓRMULA ES POBRE:       sólo puede mirar los cuatro números medidos para ESE pedido. No puede
                           mirar aceptaciones pasadas, rechazos, antigüedad, ni "fiabilidad"
                           (A22). Si mira eso, deja de ser orden y pasa a ser nota.
LA FÓRMULA ES REPRODUCIBLE con desempate declarado: dos riders con la misma puntuación se
                           ordenan por un criterio escrito (p. ej. identificador), nunca al azar.
```

Si el dueño quiere que la puntuación **sustituya** al AND, entonces sí hay un scorer y el
diseño se rompe por dos sitios a la vez: el cuarto umbral deja de proteger al rider y `A22`
(guarda contra la puntuación) se cae. **No es una decisión de diseño: es Q44·F3.**

**T2 · `cobra` neto sin coste declarado = mercado que no propone.**

Neto quiere decir *pago del pedido − coste del desvío − coste de la espera*. El pago está (E03).
El coste, no: nadie ha declarado cuánto le cuesta a un rider un kilómetro de más ni un minuto
parado. Tres salidas, y las tres son decisiones de negocio:

```text
(a) el rider declara su coste (€/km y €/min) al darse de alta  → el número se mide, no se estima
(b) el proyecto lo declara en la política y lo aplica a todos → un rider con moto cara pierde
(c) se mide de sus propios hechos (lo que cobró / lo que condujo) → es un histórico, y un
    histórico que entra en un umbral es una nota con otro nombre
```

El diseño **no elige**. `MedidaCobra` recibe el coste como parámetro y devuelve `NO_CONSTA` si
no lo hay. Es la decisión que más rápido convierte el enlace en trampa (si se pone un coste
falso a la baja) o en desierto (si se pone alto). **[ABIERTO Q41·F3]**

**T3 · Dos candidatos y nadie en la sala a las 22:00.**

Con S6, un pedido agota sus dos intentos en 20 s. La tercera salida de la escalada es la sala.
Si la sala no está despierta (Q40), la escalada tiene un destinatario que no existe y el pedido
muere igual — solo que con traza. El diseño deja `AvisoSala` con **plazo** y con **a quién
sube si no hay nadie** (una `SolicitudDecision` que vence no se cierra sola: sube de prioridad y
queda sin resolver, visible). **[ABIERTO Q40 · Q43·F3]**

### 3.3 · Lo que **no** se ha supuesto

No se ha supuesto **nada** de las otras 35 preguntas. El diseño tiene huecos con nombre (§11) y
en cada uno la clase devuelve `NO_CONSTA` en vez de un número. Los cinco supuestos son los
únicos números que aparecen en todo el documento, y todos están en una tabla de valores con
vigencia, no dentro de una fórmula.

---
## 4 · Entidades y clases

**Una clase por cada pieza del árbol de la F2. 115 piezas → 115 clases**, más una pieza
reservada que no tiene clase porque todavía no se sabe si existe (`K03`, al final del grupo K).
Cada clase conserva la forma que le dio la disección —**CUSTODIO** (escribe y es el único dueño
de lo que escribe), **REFLEJO** (calcula y no escribe), **PUENTE** (cruza al vecino), **CONVERSOR**
(cambia de forma) y **AGENTE** (transforma lenguaje, en el borde)— porque la forma **es** la
regla: un reflejo que empieza a escribir deja de ser un reflejo.

### A · PROPUESTA-ENLACE — el eslabón limitante (34 clases)

**A01 · `HechoPedidoListo`** — CUSTODIO
```text
DATOS  pedido · tienda · destino { punto, instrucciones } · hora_listo · precio_congelado · coordenadas
HACE   anotar( declaración de la tienda ) → Hecho   ·   de( pedido ) → Hecho | NO_CONSTA
REGLA  Se escribe UNA vez. Si la tienda se equivocó, no se corrige: se anota un hecho nuevo que
       desmiente al anterior y el pedido se vuelve a medir con la hora buena. Las dos horas
       quedan, y las dos se ven.
REGLA  El dato viaja CON el hecho (local, destino, hora, precio, punto). Nadie va a buscarlo
       después: si hubiera que buscarlo, la foto se tomaría en otro instante que el declarado.
REGLA  Sin `precio_congelado` no hay hecho. Sin hecho no hay cadena. El pedido espera, y se
       nombra (A34).
```

**A02 · `ComposiciónDeLaVista`** — REFLEJO
```text
DATOS  nada. Es una función del instante.
HACE   componer( hecho, instante ) → Vista
         riders    ← EstadoRider.vigentes()                    (I04)
         posición  ← PosicionRider.última(rider)               (B01)
         paradas   ← ParadasPendientes.de(rider)               (B02)
         promesas  ← PromesaPorParada.de(parada)               (B03)
         capacidad ← CapacidadDeclarada.de(rider)              (B05)
         local     ← PuntualidadDeclarada.de(hecho.tienda)     (L03)
         política  ← VersiónEfectiva.en(instante, zona)        (J04)
REGLA  No escribe nada: es una proyección de lo que otros ya escribieron. Si se guardara, habría
       dos verdades y una sería vieja.
REGLA  Un rider con un dato ausente ENTRA en la vista con su lista de faltantes. No se descarta
       aquí: descartar es decidir, y aquí no se decide (A04/A34).
```

**A03 · `CongelaciónDeLaFoto`** — REFLEJO
```text
DATOS  la vista + hora de la foto + huella de su contenido
HACE   congelar( vista ) → Foto
       es_fresca( foto, ahora ) → sí | no | NO_CONSTA
REGLA  Una decisión lee UNA foto. La foto viaja dentro de la propuesta y se cita al explicarla:
       por eso la explicación sigue siendo cierta un minuto después.
REGLA  La frescura exigible es un número [ABIERTO Q37]. Si la foto envejeció más de lo que la
       política admite, el candidato no se mide: va a A34. No se estima una posición nueva.
```

**A04 · `CandidatosElegibles`** — REFLEJO
```text
DATOS  la foto.
HACE   elegibles() → [ rider ]
REGLA  Sólo tres datos, y los tres DECLARADOS por el rider: estado (disponible), zona, capacidad.
       Ni un cuarto. Ni histórico, ni antigüedad, ni cercanía previa.
REGLA  El que está en pausa no aparece. La pausa la puso él (I04). Esta clase no puede levantar
       una pausa ni preguntarle si sigue ahí.
REGLA  NINGUNA tasa de aceptación o rechazo es entrada de esta clase. Es el test A22, y aquí se
       cumple por construcción, no por cuidado.
```

**A05 · `RutaBase`** — REFLEJO
```text
HACE   metros( rider, posición, paradas ) → metros | NO_CONSTA
REGLA  Suma de tramos de las paradas pendientes EN SU ORDEN, desde la posición actual. El orden
       lo pone B04; los metros, el puerto de ruta (§5). Aquí sólo se ordena y se suma.
REGLA  Si la posición no es fresca → NO_CONSTA. No hay "más o menos por aquí".
```

**A06 · `RutaConParada`** — REFLEJO
```text
HACE   metros_con( rider, parada_nueva ) → { metros , punto_de_inserción }
REGLA  Inserta la parada nueva en el punto que menos añade **de esa ruta y de ninguna otra**.
       Optimizar dentro de un trayecto no es ordenar el mercado; optimizar entre trayectos sí, y
       está prohibido (A28).
REGLA  Test: insertar una parada NUNCA acorta la ruta base. Si la acorta, el puerto de ruta está
       mintiendo y el desvío sale negativo — y un desvío negativo es una propuesta a un rider
       que no gana nada.
```

**A07 · `MedidaDesvío`** — REFLEJO
```text
HACE   medir( ruta_base, ruta_con_parada ) → metros ≥ 0
REGLA  Es una resta, y por eso es la medida más discutible del sistema: mide *de más*, no
       "cerca". Si cualquiera de las dos rutas no consta → NO_CONSTA.
REGLA  La unidad y el modo de cálculo son del puerto (línea recta, calle, con tráfico) y cambian
       el número: [ABIERTO Q37]. Cambiar el puerto cambia cuántos pasan el umbral, y eso es
       política, no detalle.
```

**A08 · `MedidaEspera`** — REFLEJO
```text
HACE   medir( rider, foto, hora_listo ) → minutos ≥ 0
REGLA  Minutos que esperaría si llega antes de que esté listo. Es una resta de dos horas CON
       HORA. No es una predicción de cocina: la cocina declaró, no se adivina.
REGLA  Si llega después de listo → 0 y el reloj de la espera pasa a ser un hecho del reparto (F01).
       Los dos casos son distintos y no se suman.
```

**A09 · `RetrasoPorParada`** — REFLEJO
```text
HACE   medir( parada_a_bordo, nueva_hora_de_llegada ) → minutos
REGLA  Contra la promesa GUARDADA de esa parada (B03), no contra una ruta ideal. Un pedido a
       bordo se mide contra lo que se le dijo a SU cliente, no contra lo que sería eficiente.
REGLA  Cada parada se mide por separado. Este número, solo, no decide nada: lo resume A10.
```

**A10 · `AgregadoDelRetraso`** — REFLEJO
```text
HACE   agregar( [ retraso_por_parada ] ) → minutos  =  el PEOR
REGLA  El peor, no la suma (castigaría tres veces el mismo minuto) ni la media (escondería al
       que se queda sin postre). La promesa que se rompe es la que se rompe.
REGLA  Es una decisión de modelo REVISABLE y está escrita aquí a propósito: si el dueño quiere
       otra cosa, cambia ESTA clase y su test, no la cadena.
```

**A11 · `MedidaCobra`** — REFLEJO
```text
HACE   medir( precio_reparto, desvío, espera, coste_declarado ) → céntimos (neto) | NO_CONSTA
REGLA  SUPUESTO S2: neto = lo que paga el pedido − lo que le cuesta el desvío − lo que le cuesta
       la espera. Si ≤ 0 el candidato no pasa. Es la única protección real del rider.
REGLA  NO forma el precio: lo lee ya compuesto (E03). Si el precio no está cerrado cuando llega
       el hecho, esta medida no consta y no hay propuesta.
REGLA  `coste_declarado` es un parámetro obligatorio. Si viene vacío → NO_CONSTA, y el mercado
       no propone. No hay valor por defecto. [ABIERTO Q41·F3]
```

**A12 · `ReglaDeEnlace`** — REFLEJO
```text
HACE   pasa( medidas, política ) → sí | no + cuál falló
REGLA  Cuatro comparaciones en AND contra la política vigente. Sin pesos. Sin suma. Sin nota.
       Devuelve EL TEST QUE FALLÓ, no un número: un número invita a ordenar por él.
REGLA  Los cuatro tests son cuatro (uno por umbral) y cada uno tiene su prueba. Si alguien
       "pondera" los cuatro, esta clase deja de existir y aparece un scorer — que es lo que
       A22 y A28 prohíben.
```

**A13 · `PropuestaEmitida`** — CUSTODIO
```text
DATOS  pedido · rider · los cuatro números · huella de la foto · versión de política · hora · ventana
HACE   emitir( hecho, rider, medidas, huella, versión, duración ) → Propuesta | YA_HAY_UNA_VIVA
REGLA  Se escribe una vez y NO se edita nunca: es la prueba de qué se ofreció, a quién y con qué
       números. Se cierra con un desenlace (A14), no se corrige.
REGLA  Una propuesta viva por pedido (A33). Si ya hay una, esta no se emite: no hay sorteo.
REGLA  Guarda la huella de la foto y la versión de la política porque sin ellas no se puede
       reproducir ni explicar (A29, A16).
```

**A14 · `BloqueoDePropuesta`** — CUSTODIO
```text
HACE   cerrar( propuesta, desenlace ) → aceptada | rechazada | caducada | YA_NO_ESTÁ
REGLA  Un desenlace por propuesta. El segundo que llega recibe "ya no está" y NO PAGA NADA: es
       el mismo "sin coste" de A21, no una pieza nueva.
REGLA  Esta clase es la que impide que dos riders se queden un mismo pedido. No decide quién
       gana: decide que solo hay un ganador.
```

**A15 · `VentanaDePropuesta`** — CUSTODIO
```text
DATOS  propuesta · hora de apertura · duración
HACE   abrir( propuesta, duración ) → Ventana   ·   vencer( ventana, ahora ) → Caducidad | sigue
REGLA  La duración la declara la política (J02), nunca esta clase. SUPUESTO S6: 10 s por
       candidato. La ventana es finita o no hay propuesta.
REGLA  La escribe el mismo que emitió, con su reloj. Si el reloj no consta, no se emite: una
       ventana sin hora es una ventana eterna, y una ventana eterna es una asignación lenta.
```

**A16 · `RazonesDeLaDecisión`** — REFLEJO
```text
HACE   de( medidas, política ) → [ Razón ]      ← CONJUNTO CERRADO
         desvío = 312 m · espera = 2 min · retraso = 1 min · cobra = 4 c€
         umbral aplicado: 800 m / 4 min / 6 min / > 0 · versión de política: v7
REGLA  Nada que no esté en este conjunto puede aparecer en la explicación. Ni el tiempo, ni la
       zona, ni "había mucha demanda", ni "eres el más cercano" si la cercanía no está medida.
REGLA  Este conjunto es el que hace la explicación DISCUTIBLE: el rider puede mirar el 312 m y
       decir que no son 312. Con un adjetivo, no puede discutir nada.
REGLA  Es un derecho, no un detalle de interfaz: la norma europea lo exige también a quien no
       es asalariado.
```

**A17 · `FraseDerivada`** — REFLEJO
```text
HACE   componer( [ Razón ] ) → frase
         «Te lo propongo porque pasas a 312 m del local, esperarías 2 min y ganarías 4 céntimos.»
REGLA  Plantilla fija sobre los números ya calculados. Misma entrada, misma frase, siempre.
REGLA  Es la explicación MÍNIMA y no depende de ningún agente: si el agente se cae, esto queda y
       el mercado cumple con explicar.
```

**A18 · `RedacciónDeLaPropuesta`** — AGENTE (el borde, dentro del cuello)
```text
HACE   adornar( frase, [ Razón ] ) → frase'
REGLA  Validador puro: toda cláusula tiene que apoyarse en una razón del conjunto A16. Si
       aparece un motivo que no está —aunque sea cierto— la salida se descarta y se usa A17 tal
       cual. El agente no puede añadir un motivo: sólo elegir las palabras.
REGLA  No escribe nada. No elige a quién. No puede cambiar un número: si cambia un número, la
       frase deja de ser reproducible y la propuesta deja de ser defendible.
REGLA  Si se cae, el mercado sigue exactamente igual, con las frases sin adornar.
```

**A19 · `AceptaciónLibre`** — CUSTODIO
```text
DATOS  propuesta · rider · hora
HACE   aceptar( propuesta, rider, hora ) → Aceptación | RECHAZADO
REGLA  El sí sólo lo escribe el rider. Es el ÚNICO camino entre un pedido y un rider (A27).
REGLA  No existe "aceptación por silencio", ni "aceptación por cercanía", ni "aceptación
       automática a los 20 s". El silencio es A23 y no crea contrato.
REGLA  Es atómica: una propuesta no puede tener dos síes. La carrera la resuelve A14.
```

**A20 · `HoraDeAceptación`** — REFLEJO
```text
HACE   de( aceptación ) → hora ; arranca los relojes del reparto
REGLA  Es el hecho con hora que alimenta F01. Sin hora no hay relojes, y sin relojes la espera
       no se puede medir ni cobrar: el reparto existiría y no se podría probar.
```

**A21 · `RechazoSinCoste`** — REFLEJO
```text
HACE   anotar( propuesta, motivo? ) → Hecho
REGLA  Se anota para poder medir el mercado (cuántas propuestas hacen falta para una
       aceptación). NUNCA se agrega en una nota, ni entra en la elegibilidad, ni se le muestra
       al rider como presión [ABIERTO Q9].
REGLA  Si hay motivo [ABIERTO Q11], se guarda con el caso: alimenta el histórico de la TIENDA o
       el suyo, jamás el orden de candidatos.
REGLA  "Sin coste" no es un adjetivo: es que no existe ningún camino de este hecho a A04 ni a A25.
```

**A22 · `GuardaSinPuntuación`** — REFLEJO
```text
HACE   revisar( entradas de A04 y de A25 ) → conforme | FALLA
REGLA  Falla si aparece cualquier tasa de rechazo o aceptación, cualquier "fiabilidad",
       cualquier antigüedad y cualquier prioridad comprada en la elegibilidad o en el orden.
REGLA  Es un TEST, no una promesa de marketing. Una renuncia sin test es publicidad.
```

**A23 · `CaducidadSinRespuesta`** — REFLEJO
```text
HACE   vencer( propuesta, ahora ) → Hecho
REGLA  El silencio es un no, con hora. No se estima la intención ("estaba conduciendo, seguro
       que sí") y no se reintenta al mismo rider con el mismo pedido sin que él lo haya pedido.
REGLA  Caducar no penaliza: es el tercer desenlace válido, no el fracaso de los otros dos.
```

**A24 · `ContratoPuntual`** — CUSTODIO
```text
DATOS  pedido · rider · precio (E03) · hora prometida · ventana de recogida · tienda
HACE   crear( aceptación ) → Contrato
REGLA  Es lo que la aceptación crea y NADA MÁS: un pedido, un rider, un precio, una hora. Ni
       turno, ni jornada, ni disponibilidad futura, ni compromiso con el siguiente pedido.
REGLA  Es la unidad de negocio: el mercado se mide por contratos puntuales aceptados, no por
       riders "activos". Si algún día este contrato tuviera duración, el negocio sería otro.
```

**A25 · `SiguienteCandidato`** — REFLEJO
```text
HACE   siguiente( pedido, foto, política, intentos ) → rider | NINGUNO
REGLA  Avanza por el ORDEN DECLARADO en la política (J01), no por una nota calculada aquí. La
       fórmula vive en la política, publicada; esta clase solo la aplica y recuerda por dónde iba.
REGLA  Al agotar el tope (SUPUESTO S6: 2) devuelve NINGUNO y el caso va a A26. No vuelve a
       empezar la lista: eso sería un bucle y un bucle es una asignación por cansancio.
```

**A26 · `EscaladaDeEnlace`** — PUENTE
```text
HACE   escalar( pedido, [ intentos ] ) → PIDE_A( SubidaDeOferta E07 ) | PIDE_A( AvisoSala I07 )
REGLA  Elige CUÁL de las tres salidas pide —otro rider, subir la oferta, la sala— según lo que ya
       ocurrió (cuántos candidatos, si ya se subió, cuánto tiempo lleva). No ejecuta ninguna:
       las pide, porque ninguna es suya.
REGLA  El pedido no se cierra por silencio del sistema. Si nadie responde, el caso queda vivo y
       visible en la cola (P01), no en un limbo.
```

**A27 · `GuardaSinAsignación`** — REFLEJO
```text
HACE   recorrer( todos los caminos pedido → rider ) → conforme | FALLA
REGLA  Ningún camino sin A19. Falla también con "auto-aceptar si no contesta", "asignación por
       cercanía" y —esto es lo que se olvida— con "la sala lo empuja por teléfono a un rider
       concreto": esa llamada es una asignación con voz humana.
```

**A28 · `GuardaSinOptimizador`** — REFLEJO
```text
HACE   revisar( entradas del flujo de enlace ) → conforme | FALLA
REGLA  La entrada es UN hecho, UNA foto y UNA política. Si aparece una lista de pedidos, un
       barrido de riders, una re-optimización del día o un "reparto equilibrado", falla.
REGLA  No es lo mismo que la neutralidad del escaparate (D07): una prohíbe PLANIFICAR el
       reparto, la otra prohíbe VENDER posiciones. Un mercado puede no vender nada y aun así
       tener un planificador, y ese planificador sería su final igual de rápido.
```

**A29 · `ReproducciónDeLaDecisión`** — REFLEJO
```text
HACE   reproducir( propuesta ) → misma propuesta | DISCREPANCIA( dónde )
REGLA  Re-ejecuta F con el hecho, la foto y la política guardados en la propuesta. Si el
       resultado difiere, se NOMBRA la discrepancia; no se "arregla" reemitiendo.
REGLA  Es el test que convierte "explicable" en algo comprobable: sin replay, la explicación es
       una declaración de buenas intenciones.
```

**A30 · `GuardaEnlacePorTrayecto`** — REFLEJO
```text
HACE   revisar( propuesta ) → conforme | FALLA
REGLA  La unidad enlazada es la RUTA (paradas), nunca el cliente. Si una propuesta menciona
       "pedidos del mismo cliente", "misma dirección" o "menú compartido", falla.
REGLA  Consecuencia práctica: el cliente de un pedido no sabe qué otro viaja al lado, y no se le
       pide que acepte nada de nadie. Eso es lo que separa esto del modelo de mediodía.
```

**A31 · `GuardaEnlaceNoRompePromesa`** — REFLEJO
```text
HACE   revisar( propuesta, promesas a bordo ) → conforme | FALLA
REGLA  Ningún retraso agregado supera el umbral de la política aplicada. La promesa ya dada a
       otro cliente es el límite duro del enlace.
REGLA  Si el umbral cambió mientras el pedido estaba en vuelo, protege la versión con la que se
       prometió [ABIERTO Q4]. Un cambio de criterio no puede empeorar una promesa ya hecha.
```

**A32 · `GuardaNoCapturaDelAhorro`** — REFLEJO
```text
HACE   revisar( cuota, pedido ) → conforme | FALLA
REGLA  La cuota de Bocaos se calcula por PEDIDO ACEPTADO (E04/E06). Si un cálculo incluye
       kilómetros ahorrados, pedidos enlazados o "ahorro generado", falla.
REGLA  El porqué, escrito para que no se olvide: si Bocaos cobrara por kilómetro ahorrado, su
       ingreso crecería endureciendo los enlaces, y el umbral de retraso competiría con su
       propia caja. El diseño prohíbe esa coincidencia de incentivos.
```

**A33 · `GuardaPropuestaÚnica`** — REFLEJO
```text
HACE   revisar( pedido ) → conforme | FALLA
REGLA  A lo sumo UNA propuesta viva por pedido. Con propuestas en serie (S6) se cumple por
       construcción; el test existe para el día que alguien ponga paralelo.
REGLA  El porqué: si el mismo pedido se propone a la vez a cuatro riders cercanos, el que acepta
       no es el elegido — es el que estaba mirando el móvil. Eso no es un mercado: es un sorteo
       con apariencia de mercado.
```

**A34 · `HuecoDeMedida`** — REFLEJO
```text
HACE   nombrar( rider, [ dato_faltante ] ) → Hueco
REGLA  Si falta un dato, NO SE ESTIMA: no hay propuesta y el hueco queda escrito con nombre
       («sin posición fresca», «sin precio compuesto», «sin histórico del local»).
REGLA  El candidato se salta y se sigue. El pedido no muere por un hueco: muere si se agotan los
       candidatos, y entonces el hueco es la explicación que la sala puede leer.
REGLA  Es también el mejor diagnóstico del negocio: un mercado con muchos huecos es un mercado
       con los datos sin enchufar, no con mala suerte.
```

### B · RUTA-VIVA — el trayecto que el rider ya lleva encima (6 clases)

**B01 · `PosiciónRider`** — CUSTODIO
```text
DATOS  punto · hora · frescura declarada
HACE   anotar( rider, punto, hora ) → Posición   ·   última( rider ) → Posición | NO_CONSTA
REGLA  Se guarda el ÚLTIMO punto con su hora, no una traza continua. Un hecho, no un chorro.
REGLA  La frescura se declara y se puede consultar: si está vieja, A05 devuelve NO_CONSTA y el
       candidato no se mide. Cuánto se conserva el histórico es [ABIERTO Q38] — y la norma
       prohíbe recoger posición fuera del horario de trabajo.
```

**B02 · `ParadasPendientes`** — REFLEJO
```text
HACE   de( rider ) → [ parada ]      (en su orden)
REGLA  No se guarda una lista: se DERIVA de los contratos puntuales vivos (A24). Si un contrato
       se cierra, su parada desaparece sola. Una lista guardada se queda vieja y miente.
```

**B03 · `PromesaPorParada`** — CUSTODIO
```text
DATOS  pedido · hora prometida al cliente · versión
HACE   prometer( parada, hora ) → Promesa   ·   de( parada ) → Promesa | NO_CONSTA
REGLA  Es un contrato con un cliente que no participó en la decisión del enlace. Solo se puede
       MEJORAR (bajar la hora); empeorarla exige pasar el umbral de retraso (A31).
REGLA  Sin promesa no hay retraso. Y sin retraso, el umbral de 6 minutos es una palabra.
```

**B04 · `OrdenDeParadas`** — REFLEJO
```text
HACE   ordenar( ruta ) → ruta'
REGLA  Optimiza UNA ruta y sólo dentro de ella. Nunca entre rutas, nunca entre riders, nunca
       entre pedidos de tiendas distintas.
REGLA  Función pura con desempate declarado: la misma ruta da el mismo orden siempre. Si el
       desempate fuera aleatorio, la reproducción (A29) fallaría y nadie sabría por qué.
```

**B05 · `CapacidadDeclarada`** — CUSTODIO
```text
DATOS  cuánto cabe (caja, mochila, lo que sea) · declarado por él · hora
HACE   declarar( rider, cuánto )   ·   de( rider ) → Capacidad | NO_CONSTA
REGLA  Se declara, no se estima. Es del rider: el sistema no puede deducirla de su historial.
REGLA  Sin capacidad declarada no hay elegibilidad [ABIERTO Q33]. No se supone "2–3".
```

**B06 · `FinDeTrayecto`** — REFLEJO
```text
HACE   cerrar( ruta ) cuando la última parada tiene hecho de entrega
REGLA  Cerrar no puntúa a nadie: sólo deja de contar para la ruta viva. El rider no gana ni
       pierde nada por cerrar rápido o tarde.
```

### C · PEDIDO — el hecho que viaja hasta estar listo (7 clases)

**C01 · `CapturaPedido`** — REFLEJO
```text
HACE   alta( cliente_de_la_tienda, líneas, oferta_de_reparto ) → Pedido
REGLA  De a uno. No hay alta en bloque, ni pedido "programado", ni pedido recurrente con plantilla.
REGLA  El pedido nace con su precio YA cerrado (D03) y su oferta de reparto congelada (E01). Si
       el precio se compusiera después, el rider podría decidir sobre un número y cobrar otro.
```

**C02 · `EstadoPedido`** — CUSTODIO
```text
DATOS  estado · [hechos con hora]
HACE   transitar( pedido, estado_nuevo, hecho ) → Pedido | TRANSICIÓN_NO_PERMITIDA
REGLA  Tabla cerrada de estados y ninguna transición sin hecho con hora. Un estado sin hecho es
       una opinión sobre lo que pasó.
REGLA  El estado no se corrige: se avanza. Si hubo un error, se avanza a un estado nuevo que lo
       reconoce, y las dos horas quedan.
```

**C03 · `AvisoTienda`** — PUENTE
```text
HACE   avisar( tienda, pedido ) por el canal de la tienda
REGLA  Avisa, no decide: no acepta por ella, no arranca la cocina, no la compromete a una hora.
REGLA  Si el aviso no llega, el pedido existe igual: el aviso es transporte, no verdad.
```

**C04 · `HoraDeListo`** — CUSTODIO
```text
DATOS  pedido · tienda · hora declarada · autor
HACE   declarar( tienda, pedido, hora ) → Hecho
REGLA  Lo escribe LA TIENDA, y es el disparador de todo el mercado. No puede escribirlo la sala
       por ella, ni el sistema por estimación.
REGLA  Es el hecho que se mide después (L03): si marca pronto y entrega tarde, esa diferencia
       vuelve en la siguiente propuesta a ese local. La cocina queda visible y cobrada, no
       sancionada.
REGLA  No se puede adelantar ni corregir. "Marcar listo" es declarar, y declarar tiene
       consecuencia.
```

**C05 · `EstadoCocinaVisible`** — REFLEJO
```text
HACE   ver( pedido ) → estado podado (4 estados)
REGLA  El cliente ve un estado podado, no el interno. No ve "en cola", ni "rechazado por falta de
       rider", ni "esperando propuesta": ve lo que le sirve para decidir si baja.
REGLA  No ve datos de otras tiendas ni de otros pedidos, aunque viajen en el mismo trayecto.
```

**C06 · `AvisoCliente`** — PUENTE
```text
HACE   avisar( cliente, hecho ) por el canal DE LA TIENDA
REGLA  Sin marca de Bocaos, sin enlace a Bocaos, sin remitente reconocible (K02). El cliente no
       es de Bocaos, y el canal tampoco.
REGLA  Es el puerto más delicado del negocio: si este aviso se rompe, la tienda pierde la cara
       de su cliente y culpa a Bocaos.
```

**C07 · `Cancelación`** — REFLEJO
```text
HACE   puede_cancelar( pedido, quién, cuándo ) → sí | no + motivo
REGLA  Tabla de transiciones: quién puede cancelar y hasta cuándo. El QUIÉN PAGA ese rechazo
       [ABIERTO Q36] no se decide aquí.
REGLA  Mientras no haya respuesta, el sistema anota la cancelación con su hora y NO COBRA a
       nadie. Un cargo inventado es peor que un cargo pendiente.
```

---
### D · PLAZA-TIENDA — el escaparate propio (7 clases)

**D01 · `MarcaTienda`** — CUSTODIO
```text
DATOS  nombre · signos · tono · titular de la marca
HACE   declarar( tienda, marca )   ·   de( tienda ) → Marca | NO_CONSTA
REGLA  La firma es la tienda. Bocaos no firma nada que el cliente final vea.
REGLA  Una tienda no puede firmar con la marca de otra. La marca es suya por construcción, no
       por contrato: no hay campo donde poner la de Bocaos.
```

**D02 · `CartaPublica`** — CONVERSOR
```text
HACE   proyectar( catálogo interno de la tienda ) → carta pública podada
REGLA  La fuente es UNA: el catálogo de la tienda. Esta clase PROYECTA y poda; no guarda una
       segunda carta. Dos cartas son dos verdades y la segunda siempre está vieja.
REGLA  Podar quiere decir: qué se publica, en qué orden y con qué disponibilidad. No quiere decir
       "destacar": el orden de la carta es el de la tienda, no el de Bocaos (D07).
```

**D03 · `PrecioCerrado`** — REFLEJO
```text
HACE   cerrar( carrito, oferta_de_reparto, incentivo ) → céntimos + desglose
REGLA  Todo en céntimos y TODO cerrado antes de pagar. El precio final no puede sorprender: es
       la fricción número uno del par cliente↔tienda.
REGLA  El desglose (comida / reparto / incentivo) existe internamente siempre; si el cliente lo
       VE es otra pregunta [ABIERTO Q19 · Q39]. El diseño no lo decide: lo deja calculado.
```

**D04 · `CarritoTienda`** — CUSTODIO
```text
DATOS  cliente_de_la_tienda · tienda · líneas · hora
HACE   añadir/quitar/cerrar( … )
REGLA  Un carrito por cliente y tienda. No cruza tiendas: no existe "carrito del mercado".
REGLA  Al cerrar, el carrito se convierte en pedido (C01) con el precio cerrado y desaparece. Un
       carrito cerrado que sigue vivo es un pedido que se puede cobrar dos veces.
```

**D05 · `RegistroClienteTienda`** — CUSTODIO
```text
DATOS  identidad del cliente · tienda a la que pertenece · instrucciones de acceso
HACE   alta( cliente, tienda )   ·   de( cliente, tienda ) → Ficha | NO_CONSTA
REGLA  El cliente es DE LA TIENDA, aislado por tienda. No hay registro global, ni identidad
       única entre tiendas, ni "cliente del mercado".
REGLA  Esta es la pieza que hace verdad la promesa al restaurante. Si existiera un registro
       único, el miedo del par 4 tendría razón, y con razón.
REGLA  Comprar como invitado [ABIERTO Q39] no rompe el aislamiento: el invitado también es de
       una tienda.
```

**D06 · `PlazaPublica`** — REFLEJO
```text
HACE   índice( censo de tiendas ) → lista de escaparates
REGLA  Es una proyección del censo (I01). No se escribe, no tiene vida propia, no guarda
       posiciones.
REGLA  Sin orden de preferencia: el orden es declarado y neutro (D07). Una plaza que ordena es
       una plaza que elige.
```

**D07 · `NeutralidadOrden`** — REFLEJO
```text
HACE   revisar( orden mostrado al cliente ) → conforme | FALLA
REGLA  Sin ranking, sin destacados, sin prioridad comprada, sin "recomendados". Ningún campo del
       diseño permite pagar por posición.
REGLA  Es distinta de A28: aquí se prohíbe VENDER posiciones; allí, PLANIFICAR el reparto. Las
       dos son la misma renuncia vista desde dos sitios, y por eso tienen dos tests.
```

### E · TARIFA-TRES-BANDAS — el precio que hace calculable `cobra` (7 clases)

**E01 · `OfertaCliente`** — CUSTODIO
```text
DATOS  pedido · céntimos que el cliente estipula por el reparto · hora
HACE   estipular( pedido, céntimos ) → Oferta   ·   de( pedido ) → Oferta | NO_CONSTA
REGLA  Se congela con el pedido y no la toca nadie más: ni la tienda, ni la sala, ni Bocaos. El
       rider ve un número que no va a cambiar mientras decide.
REGLA  Es del cliente. Si Bocaos pudiera formarla, Bocaos estaría subastando reparto, y entonces
       sería transportista.
```

**E02 · `IncentivoTienda`** — CUSTODIO
```text
DATOS  pedido · céntimos que suma la tienda · autor · hora · tope
HACE   subir( pedido, céntimos, autor ) → Incentivo
REGLA  Lo sube la tienda, con autor y hora. Puede comprar su propia impuntualidad — que es
       exactamente lo que hace que el mercado corrija sin que nadie la sancione.
REGLA  No puede bajar por debajo de lo ya ofrecido a un rider con propuesta viva: sería cambiarle
       el número debajo de los ojos.
REGLA  Si lo pagara Bocaos, Bocaos estaría subvencionando demanda [ABIERTO Q17].
```

**E03 · `PrecioReparto`** — REFLEJO
```text
HACE   precio( oferta, incentivo ) → céntimos
REGLA  Sólo SUMA. No forma, no estima, no subasta, no redondea a favor de nadie.
REGLA  Este número es la entrada de `cobra` (A11). Si no está cerrado cuando llega el hecho, no
       hay propuesta — y por eso esta clase es una dependencia dura del cuello, no un adorno
       comercial.
```

**E04 · `ComisiónDeCoordinación`** — REFLEJO
```text
HACE   comisión( pedido_aceptado, parte, contrato_tramos ) → céntimos
REGLA  Por pedido ACEPTADO. Nunca por kilómetro ahorrado, nunca por viaje, nunca por propuesta
       emitida, nunca por porcentaje del ticket.
REGLA  Se calcula sobre el contrato vigente en la hora del hecho (E06 + J04), no sobre el de hoy:
       si la tarifa cambió ayer, lo de anteayer se cobra como se pactó.
```

**E05 · `RepartoDelPago`** — CONVERSOR
```text
HACE   repartir( precio, comisión ) → [ Cobro ]
         Cobro 1 · cliente → rider    · el precio ÍNTEGRO del reparto
         Cobro 2 · cliente → tienda   · el importe de la comida (no lo gestiona Bocaos)
         Cobro 3 · tienda  → Bocaos   · tramo 1 + tramo 3
         Cobro 4 · rider   → Bocaos   · tramo 3
REGLA  Un precio se convierte en cobros DIRECTOS entre partes. Bocaos no aparece como
       intermediario de ningún importe que no sea su cuota.
REGLA  Es la única frontera del dinero y tiene que ser la única: si hubiera dos sitios donde se
       parte un pago, uno de los dos retendría.
```

**E06 · `ContratoTramos`** — CUSTODIO
```text
DATOS  tramo (1 · 2 · 3) · fijo mensual · céntimos por pedido · a quién · vigencia · autor
HACE   vigente( parte, instante ) → Contrato | NO_CONSTA
REGLA  SUPUESTO S14: 39 / 79 / 149 € fijos (pizzepos) · 10 céntimos/pedido al rider · 20
       céntimos/pedido a la tienda. PROVISIONAL.
REGLA  Con vigencia: un cambio rige desde su hora y no reescribe lo ya devengado. Sin esto, la
       cuenta de una tienda cambiaría sola a fin de mes.
REGLA  Sin contrato vigente aceptado por la parte (I08) no hay devengo ni propuesta para ella.
```

**E07 · `SubidaDeOferta`** — CUSTODIO
```text
DATOS  pedido · importe nuevo · autor · hora · tope
HACE   subir( pedido, importe, autor ) → Hecho | SIN_AUTOR
REGLA  Acto con AUTOR humano (cliente, tienda o dueño). El sistema no puede ser autor: una
       subida automática de la oferta de Bocaos sería una subvención, y una subvención
       automática es una asignación con otro nombre.
REGLA  Quién paga y con qué tope [ABIERTO Q17]. Mientras no se sepa, el acto se registra y la
       deuda queda pendiente y visible, no se cobra a nadie.
```

### F · REPARTO-MEDIDO — la ejecución convertida en prueba (7 clases)

**F01 · `HechosDelReparto`** — CUSTODIO
```text
DATOS  pedido · rider · [ recogida · llegada · entrega · prueba ] · cada uno con hora
HACE   anotar( hecho ) → Hecho | YA_EXISTE
REGLA  Append-only. Un hecho corregido es un hecho NUEVO que desmiente al anterior; los dos
       quedan. Es lo que permite que un enlace pasado se pueda auditar meses después.
REGLA  Sin hora no es un hecho. "El rider llegó" sin hora es un recuerdo.
```

**F02 · `PruebaEntrega`** — CUSTODIO
```text
DATOS  foto (o su falta) · hora · confirmación del cliente (o su falta)
HACE   anotar( prueba )   ·   de( pedido ) → Prueba | NO_CONSTA
REGLA  Sin prueba no se presume nada: la falta es un hecho propio, no un hueco a rellenar.
       ¿A favor de quién juega la falta? [ABIERTO Q30] — y hasta que se responda, no hay cargo
       sin prueba.
REGLA  La prueba se conserva el tiempo que diga la política, ni un día más [ABIERTO Q38].
```

**F03 · `SeguimientoVivo`** — REFLEJO
```text
HACE   ver( pedido ) → posición podada + estado podado
REGLA  Sólo mientras el contrato está vivo. Al cerrar, se deja de proyectar: el cliente no
       necesita ver dónde está su comida una hora después.
REGLA  La posición que ve el cliente es la del RIDER con el que tiene el contrato, no la de
       nadie más — ni siquiera la del que viaja en el mismo trayecto.
```

**F04 · `ChatEnmascarado`** — PUENTE
```text
HACE   entregar( mensaje, de, a ) → mensaje sin números de teléfono
REGLA  El mensaje cruza; el número, no. Ni el rider ve el del cliente ni al revés.
REGLA  Bocaos no lee el contenido para ningún cálculo y no construye ningún agregado sobre
       conversaciones: la norma prohíbe expresamente acceder a la comunicación entre riders, y
       el diseño va más allá por coherencia — aquí no hay nada que ganar leyendo.
```

**F05 · `InstruccionesAcceso`** — CUSTODIO
```text
DATOS  portal · piso · indicaciones libres
HACE   escribir( cliente, texto, pedido )   ·   mostrar( pedido, rider )
REGLA  Las escribe el cliente por el canal de la tienda y se muestran SÓLO al rider del contrato
       vivo. Al entregar, dejan de mostrarse aunque el dato siga escrito.
REGLA  Es dato personal del cliente del cliente: no entra en ningún agregado ni en ningún
       histórico de tienda.
```

**F06 · `IncidenciaReparto`** — PUENTE
```text
HACE   abrir( pedido, relato, autor, hora ) → Caso
REGLA  No decide, no adjudica, no puntúa: pone el caso en la cola (P01) con su autor y su hora.
REGLA  Cualquiera de las dos partes puede abrir una; ninguna puede cerrarla sin dictamen.
```

**F07 · `LecturaDeIncidencia`** — AGENTE (el borde)
```text
HACE   clasificar( relato libre ) → campos cerrados ya existentes
REGLA  Validador puro: sólo campos que la cola ya tiene (no encontraba el portal · el cliente no
       bajaba · el local no estaba listo · dirección incorrecta · otro). Un campo nuevo se
       rechaza, no se inventa.
REGLA  No puntúa, no adjudica, no decide a quién culpar. Clasifica para que un humano lo lea
       antes.
REGLA  Si se cae, la incidencia entra SIN clasificar y sigue su curso. El borde puede fallar sin
       que el centro se entere.
```

---
### G · ADJUDICACIÓN DE FALLOS — no juzga, mide (6 clases)

**G01 · `VentanaEspera`** — CUSTODIO
```text
DATOS  N1 (espera en tienda) · N2 (espera en el portal) · N3 (espera en la llegada) · vigencia
HACE   vigente( instante ) → Ventana | NO_CONSTA
REGLA  Los tres números los declara el proyecto, con vigencia [ABIERTO Q28]. Sin ellos no hay
       cargo: hay medida, y una medida sin umbral no cobra nada.
REGLA  Son tres ventanas porque hay tres esperas distintas y las sufre gente distinta. Sumarlas
       en una sola N es la forma más rápida de que el que no tuvo la culpa pague.
```

**G02 · `HechoVerificado`** — REFLEJO
```text
HACE   verificar( hechos, ventana ) → excedido sí/no + minutos de exceso
REGLA  Sólo con hechos CON HORA. Si falta un hecho, el resultado es NO_CONSTA — nunca
       "seguramente se pasó".
REGLA  No interpreta: no distingue "se pasó porque había cola" de "se pasó porque se olvidó". Eso
       lo mira un humano si hace falta (G05), y no cambia el número.
```

**G03 · `ReglaPagoFallo`** — REFLEJO
```text
HACE   aplicar( exceso, parte ) → fila de la tabla: quién paga cuánto a quién
REGLA  Es una TABLA, con una prueba por fila. No es un agente que opina sobre la culpa: aquí hay
       un reloj y una tabla.
REGLA  Los importes [ABIERTO]. Mientras no existan, la tabla devuelve "quién" pero no "cuánto", y
       el cargo nace sin importe en vez de con un número inventado.
```

**G04 · `CargoFallo`** — CUSTODIO
```text
DATOS  deudor · acreedor · importe · [ evidencia ] · hora
HACE   anotar( fila, evidencia ) → Deuda | SIN_EVIDENCIA
REGLA  Sin evidencia no hay cargo (G06). Nace como DEUDA entre dos partes, no como descuento:
       Bocaos no retiene, así que no puede descontar de un dinero que no tiene.
REGLA  Cómo se hace efectivo es [ABIERTO Q29]: compensación contra la cuota semanal, pago
       directo o fianza. Hasta que se responda, la deuda se acumula y se ve en la cuenta de las
       dos partes (Q01) — que ya es más de lo que hace el mercado actual.
```

**G05 · `DisputaFallo`** — PUENTE
```text
HACE   llevar( deuda, autor, motivo ) → Caso en la cola
REGLA  Pone el caso delante de un humano. No re-juzga, no reabre un caso cerrado sin un hecho
       nuevo, no cambia la tabla.
REGLA  Quién decide en la disputa [ABIERTO Q24]. El diseño garantiza que hay alguien y que su
       decisión queda firmada (O04); no decide quién es.
```

**G06 · `TrazabilidadFallo`** — REFLEJO
```text
HACE   revisar( cargo ) → conforme | FALLA
REGLA  Cada cargo apunta a hechos anteriores a él. Si a un cargo le falta un hecho, o el hecho
       es posterior al cargo, o el hecho fue desmentido, falla.
REGLA  Es la diferencia entre un cargo y un abuso, y es lo único que un rider autónomo puede
       exigir a un mercado que dice no juzgar.
```

### H · LIQUIDACIÓN DE LA COORDINACIÓN — el único dinero de Bocaos (6 clases)

**H01 · `Devengo`** — REFLEJO
```text
HACE   acumular( parte, periodo ) → { seguro , en duda , detalle[] }
REGLA  Cuenta PEDIDOS ACEPTADOS × tarifa del contrato vigente + la parte del fijo que toque.
       Jamás kilómetros, jamás viajes, jamás porcentaje del ticket.
REGLA  Devuelve DOS cifras, no una: lo que se devenga sin discusión y lo que depende de una
       pregunta abierta (un pedido cancelado tras aceptar [ABIERTO Q18] cae aquí). **No elige**;
       elegir es del dueño, y la elección queda en el acta.
REGLA  Un pedido que no tuvo aceptación no devenga nada: la coordinación no se hizo.
```

**H02 · `CicloSemanal`** — CUSTODIO
```text
DATOS  periodo · hora de apertura · hora de cierre · [ devengos ] · estado
HACE   abrir( )  ·  cerrar( periodo ) → Cierre (inmutable)
REGLA  Un periodo cerrado NO se reabre. Una corrección posterior es una nota en el periodo
       siguiente, con su porqué. Reabrir un cierre es la manera de que las cuentas no cuadren
       nunca.
REGLA  Día, hora y qué pasa si el cobro falla: [ABIERTO Q26].
```

**H03 · `FacturaGestión`** — CONVERSOR
```text
HACE   emitir( cierre, parte ) → documento de cobro
REGLA  Sólo lo DEVENGADO en ese cierre. Ni una línea más, ni un concepto nuevo.
REGLA  Con IVA y forma jurídica [ABIERTO Q4] y con quién factura a quién sin resolver: el
       documento se genera con los campos vacíos marcados, no con un tipo inventado.
```

**H04 · `CobroGestión`** — PUENTE
```text
HACE   cobrar( documento, canal_de_la_parte ) → Cobrado | Fallido
REGLA  Cobra LO SUYO y sólo lo suyo, por el canal que cada parte declare. Nunca del importe de
       comida ni del de reparto (H06).
REGLA  Un cobro fallido no cambia lo devengado: cambia la deuda (H05).
```

**H05 · `ImpagoGestión`** — REFLEJO
```text
HACE   aplicar( deuda, días ) → recordatorio | recargo | suspensión
REGLA  La suspensión NO corta pedidos en vuelo ni retira propuestas vivas: corta la entrada de
       pedidos nuevos. Un rider o una tienda que se queda a medias por una cuota es un daño
       colateral que el diseño no acepta.
REGLA  Los valores (días, recargo, aviso previo) [ABIERTO].
```

**H06 · `GuardaNoRetención`** — REFLEJO
```text
HACE   revisar( todos los caminos del dinero ) → conforme | FALLA
REGLA  Ningún camino de Bocaos toca el importe de la comida ni el del reparto. Falla si un cobro
       de Bocaos se calcula como porcentaje del ticket, si un pago al rider pasa por una cuenta
       de Bocaos o si un cargo se aplica descontando de un dinero ajeno.
REGLA  No es una postura moral: es que si Bocaos retuviera, sería banco, y si cobrara el ticket,
       sería Glovo.
```

### I · SALA-MERCADO — la operación humana mínima (8 clases)

**I01 · `AltaTienda`** — CUSTODIO
```text
DATOS  tienda · identidad fiscal · marca · catálogo · estado del alta · [checklist]
HACE   alta( tienda, datos ) → Censo | INCOMPLETA(checklist)
REGLA  Un solo dueño del censo. Una tienda no existe para el mercado hasta que está completa, y
       la lista de lo que falta la calcula P04, no la memoria de nadie.
REGLA  Exclusividad y permanencia [ABIERTO Q35]: el diseño no las impone ni las prohíbe; hoy no
       existen como campo, y añadirlas exigiría una decisión del dueño y un acta.
```

**I02 · `AltaRider`** — CUSTODIO
```text
DATOS  rider · acreditación · seguro · [documento informativo firmado] · estado del alta
HACE   alta( rider, datos ) → Censo | INCOMPLETA(checklist)
REGLA  Qué acredita y quién lo verifica [ABIERTO Q34]. Sin ese dato, el alta queda incompleta y
       el rider no entra en A04 — no por castigo, sino porque el censo no puede inventar.
REGLA  El alta incluye el documento que explica, por escrito, que hay un sistema que decide a
       quién se le propone cada pedido. Es exigible por norma; aquí es además la única forma de
       que la explicación de cada propuesta tenga sentido.
```

**I03 · `EstadoTienda`** — CUSTODIO
```text
DATOS  abierta · cerrada · saturada · hora
HACE   declarar( tienda, estado ) → Estado
REGLA  "Saturada" la declara la tienda. La sala no puede poner una tienda saturada para que el
       mercado "respire mejor": eso sería administrar su negocio.
REGLA  El estado lo escribe un solo dueño y con hora. Dos escritores es una tienda que recibe
       pedidos cuando está cerrada.
```

**I04 · `EstadoRider`** — CUSTODIO
```text
DATOS  disponible · ocupado · en pausa · hora
HACE   declarar( rider, estado ) → Estado
REGLA  La PAUSA la declara él, siempre. Ni la sala ni el sistema pueden ponerlo en pausa: eso
       sería disponer de su tiempo, que es exactamente lo que un autónomo no acepta.
REGLA  "Ocupado" no lo pone la sala: lo pone el contrato vivo. La única escritura de una parte
       sobre este estado es la suspensión (P03), que es otra cosa, tiene motivo y deja acta.
```

**I05 · `SaludMercado`** — REFLEJO
```text
HACE   medir( periodo, zona ) → { aceptadas/emitidas · propuestas por aceptación ·
                                    riders activos · esperas · devengado · pedidos sin propuesta }
REGLA  Sólo hechos escritos. Lo que no consta aparece como NO_CONSTA, nunca como cero: un cero
       en "pedidos sin propuesta" hace parecer sano un mercado que no tiene datos.
REGLA  Es la medida maestra del negocio y no una curiosidad: un mercado que necesita seis
       propuestas para mover un pedido está muerto aunque venda.
```

**I06 · `TableroFricciones`** — REFLEJO
```text
HACE   medir( los 8 pares de interlocutores ) → 8 series
REGLA  Mide, no opina. Cada par tiene su número y su hueco: cliente↔tienda (precio cerrado y
       estado visible), tienda↔rider (espera y puntualidad), rider↔cliente (prueba y acceso),
       tienda↔Bocaos (cuenta y tramo), rider↔Bocaos (cartera y propuestas), cliente↔Bocaos
       (marca ajena), tienda↔tienda (neutralidad), rider↔rider (propuesta única).
REGLA  Un par sin datos aparece como hueco. El tablero no rellena.
```

**I07 · `AvisoSala`** — PUENTE
```text
HACE   avisar( caso, traza, plazo ) → Aviso
REGLA  Avisa cuando el reflejo no puede resolver, y avisa CON LA TRAZA: qué se intentó, con qué
       números, por qué no pasó. Sin traza, la sala solo puede improvisar.
REGLA  Si el plazo vence sin respuesta, el caso sube de prioridad y sigue vivo. No se cierra solo
       ni "se resuelve" por defecto.
```

**I08 · `TérminosParte`** — CUSTODIO
```text
DATOS  parte · [cláusulas aceptadas] · versión · hora de aceptación
HACE   aceptar( parte, versión )   ·   vigentes( parte, instante ) → Términos | NO_CONSTA
REGLA  Lo que cada parte aceptó, con versión. Sin términos vigentes no hay propuesta ni devengo
       para esa parte: no se puede cobrar por algo que nadie aceptó.
REGLA  Un cambio de términos no es retroactivo. Si la parte no acepta la versión nueva, sigue con
       la vieja hasta que la acepte o se vaya — y se va sin penalización (M03).
```

### J · CONFIG-PROYECTO — lo que hace que esto sea vertical y no proyecto (5 clases)

**J01 · `ConfigUmbrales`** — CUSTODIO
```text
DATOS  desvío (m) · espera (min) · retraso (min) · cobra (c€) · orden de candidatos ·
       tope de propuestas · zona · vigencia desde · autor
HACE   vigente( zona, instante ) → Política | NO_CONSTA   ·   declarar( valores, autor, desde )
REGLA  Es del PROYECTO, no de la vertical. La vertical fija la FORMA: hay cuatro umbrales, con
       esas unidades, y la comparación es AND. Aquí sólo viven los valores.
REGLA  SUPUESTOS S1 / S6 / S7: 800 m · 4 min · 6 min · > 0 · orden = «el que mejor puntúa, con
       la fórmula publicada» · tope = 2 candidatos. Todos PROVISIONALES.
REGLA  Toda versión tiene vigencia y autor, y ninguna se escribe sin acta (O02). Sin vigencia, un
       cambio de criterio reescribe el pasado.
REGLA  No admite reglas por rider ni por tienda. Eso no sería configurar: sería ordenar el
       mercado a mano.
```

**J02 · `ConfigVentana`** — CUSTODIO
```text
DATOS  duración de una propuesta · vigencia
HACE   vigente( instante ) → Duración | NO_CONSTA
REGLA  La vertical sólo exige que sea FINITA y DECLARADA. El número es del proyecto: SUPUESTO
       S6 → 10 s.
REGLA  Si la ventana depende de si el rider va conduciendo [ABIERTO Q5], se declara aquí como
       política; lo que no puede pasar es que la ventana se alargue sola mientras alguien duda.
```

**J03 · `ConfigZona`** — CUSTODIO
```text
DATOS  [ zona ] · barrios · radio · umbrales por zona (o referencia al juego único)
HACE   de( zona ) → Zona   ·   zonas() → [ zona ]
REGLA  Qué barrios cubre este mercado es del proyecto. La vertical sólo sabe que hay zonas.
REGLA  ¿Un juego de umbrales por zona o uno por mercado? [ABIERTO Q3]. La clase admite las dos
       porque la política se busca por (zona, instante): si mañana son distintas, no cambia una
       línea; si son iguales, todas apuntan a la misma.
```

**J04 · `VersiónEfectiva`** — REFLEJO
```text
HACE   en( instante, zona ) → Política vigente entonces
REGLA  Devuelve la que estaba viva EN AQUEL INSTANTE, no la de hoy. Es la clase que permite
       explicar una propuesta de hace tres semanas con los números que la juzgaron.
REGLA  Sin esta clase, el archivo de propuestas sería una colección de decisiones sin ley.
```

**J05 · `SimuladorDeUmbrales`** — REFLEJO
```text
HACE   simular( política_alternativa, hechos históricos, zona ) → qué habría pasado
REGLA  Recalcula con los números DEL PROYECTO sobre hechos reales ya escritos. No con un ejemplo
       de folleto.
REGLA  Simula, no aplica: su salida no escribe política. Aplicar exige declarar (J01) + acta
       (O02). Si el simulador pudiera aplicar, el dueño dejaría de decidir.
REGLA  Declara sus propios límites: con los datos de hoy, lo que dice de mañana es una
       extrapolación, y se dice.
```

### K · CLIENTE FINAL — piezas que sólo se ven desde su silla (2 clases + 1 reservada)

**K01 · `ReclamaciónPorLaTienda`** — PUENTE
```text
HACE   encauzar( reclamación del cliente final ) → Caso en la tienda
REGLA  Su única vía de queja pasa por la tienda. Bocaos no atiende al cliente final: no tiene
       dónde poner su caso, y eso es el diseño.
REGLA  Si una reclamación llegara a Bocaos por error, se devuelve a la tienda con su hora. No se
       atiende, no se responde, no se guarda como relación.
```

**K02 · `GuardaMarcaAjena`** — REFLEJO
```text
HACE   revisar( cualquier comunicación al cliente final ) → conforme | FALLA
REGLA  Ninguna lleva la marca de Bocaos, ni su nombre, ni un enlace, ni un remitente reconocible,
       ni "powered by". Ni en el mejor de los casos.
REGLA  Es la renuncia que sostiene todo lo demás: el día que el cliente sepa que Bocaos existe
       por una comunicación de Bocaos, el restaurante tendrá razón en tener miedo.
```

**K03 · `TransparenciaDelEnlace`** — **RESERVADA · NO TIENE CLASE**
```text
ESTADO   [ABIERTA] — no se sabe si existe.
REGLA    Existe sólo si el dueño responde que el cliente SABE que su pedido comparte viaje
         [ABIERTO Q20] y qué le cambia [Q15].
REGLA    Si existe, su forma será PUENTE (avisar por el canal de la tienda) o REFLEJO (cambiar el
         precio que se le muestra). Asignarle forma ahora sería inventar la respuesta.
REGLA    Mientras no exista, el diseño tiene una DEUDA declarada, no un hueco tapado: el cliente
         puede estar pagando lo mismo y esperando hasta el umbral de retraso por un enlace que
         no pidió, y nadie se lo dice.
```

### L · RESTAURANTE — piezas que sólo se ven desde su silla (4 clases)

**L01 · `PanelTienda`** — REFLEJO
```text
HACE   ver( tienda, periodo ) → espera medida · puntualidad · propuestas recibidas · pedidos sin rider
REGLA  Es LA MISMA información que ve el rider antes de aceptar. Misma fuente, mismo número, sin
       versión amable.
REGLA  Si hubiera dos versiones —una para el que paga y otra para el que sufre— el mercado
       dejaría de corregir y empezaría a negociar.
```

**L02 · `GuardaPropiedadCliente`** — REFLEJO
```text
HACE   revisar( cualquier consulta o sugerencia que cruce tiendas ) → conforme | FALLA
REGLA  Ningún cliente de una tienda aparece en otra: ni por identidad, ni por dirección, ni en un
       agregado, ni como "quizá te interese".
REGLA  Es lo que hace que el escaparate sea SUYO y no una ficha del montón. Sin este test, la
       promesa al restaurante es literatura.
```

**L03 · `PuntualidadDeclarada`** — REFLEJO
```text
HACE   medir( tienda, franja ) → { distribución de hora-de-listo frente a lo prometido , n }
REGLA  Publica una DISTRIBUCIÓN, no una nota. "Esta cocina se pasa 4 minutos la mitad de las
       veces" es información; "esta cocina tiene un 3 sobre 5" es un juicio.
REGLA  Se publica ANTES de que el rider acepte, y la usa A08 para medir su espera probable. Es el
       bucle que corrige el mercado sin que nadie sancione.
REGLA  Sin datos suficientes → NO_CONSTA, y el rider ve "sin histórico". Un mercado nuevo no
       puede inventar una reputación.
```

**L04 · `ResumenParaLaTienda`** — AGENTE (el borde)
```text
HACE   redactar( hechos ya medidos de la tienda, periodo ) → párrafo
REGLA  Validador: TODO número citado tiene que existir en los hechos. El agente no descubre nada;
       cuenta lo que ya está medido.
REGLA  No aconseja "baja el precio", no compara con otras tiendas, no opina sobre la cocina. Si
       se cae, el panel (L01) sigue estando y no se pierde nada.
```

### M · REPARTIDOR AUTÓNOMO — piezas que sólo se ven desde su silla (5 clases)

**M01 · `CarteraRider`** — REFLEJO
```text
HACE   ver( rider, periodo ) → { ganado · reclamado · pendiente de cobro · deudas · neto }
REGLA  Suma de hechos de reparto y de cargos, con su pedido detrás. Cada céntimo apunta a un
       contrato.
REGLA  Distingue lo GANADO (contrato cerrado con prueba) de lo RECLAMADO (entregado sin prueba,
       [ABIERTO Q30]) y de lo PENDIENTE. No estima propinas ni "ganancias potenciales".
```

**M02 · `ZonaRider`** — CUSTODIO
```text
DATOS  [ zona ] declaradas por él · hora
HACE   declarar( rider, zonas ) → ZonaRider
REGLA  La declara él y la cambia cuando quiere. El sistema no le asigna zona, ni le "sugiere"
       una por densidad: eso sería dirigir su trabajo.
REGLA  Es uno de los dos controles que tiene sobre las propuestas que recibe (el otro es la
       pausa, I04). Sin estos dos, "rechazo sin coste" significaría "propuestas eternas".
```

**M03 · `GuardaSinExclusividad`** — REFLEJO
```text
HACE   revisar( condiciones de elegibilidad ) → conforme | FALLA
REGLA  Ninguna exclusividad, permanencia, turno, cuota mínima, ni "prioridad por trabajar solo con
       nosotros" entra en la elegibilidad de una propuesta.
REGLA  Falla también si el diseño introduce una condición que en la práctica lo consigue —por
       ejemplo, exigir una disponibilidad mínima semanal para recibir propuestas.
```

**M04 · `CanalRider`** — PUENTE
```text
HACE   entregar( propuesta, rider ) → Entregada | No entregada
REGLA  Puerto abierto e intercambiable: el diseño no ata la propuesta a una superficie concreta.
REGLA  Su latencia es CRÍTICA y es la única cosa crítica de todo el sistema: una ventana de 10 s
       que llega 8 s tarde es una ventana de 2 s. Si el canal no puede entregar dentro de la
       ventana, el candidato no debe proponerse [ABIERTO Q5].
```

**M05 · `VistaDePropuesta`** — REFLEJO
```text
HACE   ver( propuesta ) → los cuatro números, SIEMPRE en el mismo orden, + la frase
         desvío · espera · retraso · cobra      (y nunca otro orden)
REGLA  El orden es parte del producto: un rider que conduce no lee cuatro números en diez
       segundos; los reconoce por su sitio. Cambiar el orden es cambiar el producto.
REGLA  Los cuatro van SIEMPRE, incluido el que pasa por un solo céntimo y el que pasa con
       holgura. No hay vista "resumida": resumir es elegir qué no se le dice.
```

### N · BOCAOS — piezas que sólo se ven desde el suelo del mercado (2 clases)

**N01 · `PolíticaDensidad`** — REFLEJO
```text
HACE   medir( zona, franja ) → riders activos por pedido · espera probable · propuestas por aceptación
REGLA  Dice CUÁNDO una zona no puede abrirse (o no debería seguir abierta). No la cierra: le da
       el número al dueño y la decisión va al acta (O02).
REGLA  No resuelve la densidad. Nombrar el problema no es resolverlo, y el diseño no finge
       arreglarlo: sin riders suficientes no hay mercado, y eso no lo arregla un sistema.
```

**N02 · `SimuladorTramos`** — REFLEJO
```text
HACE   simular( tramo alternativo, hechos de la tienda ) → cuánto pagaría, con sus números
REGLA  Recalcula con los hechos de ESA tienda: sus pedidos, sus aceptaciones, sus cargos. No con
       una media del mercado.
REGLA  Simula, no aplica (igual que J05): el contrato se cambia con autor, vigencia y aceptación
       (E06 + I08).
```

### O · ROL JEFE — declara lo que no se mide y responde de la regla (4 clases)

**O01 · `CuadroDelMercado`** — REFLEJO
```text
HACE   cuadro( periodo, zona ) → { aceptación a la primera · propuestas por aceptación ·
         pedidos que nunca tuvieron propuesta · espera media por tienda y su tendencia ·
         retraso causado a pedidos a bordo · devengado vs cobrado · mora · los 8 pares }
REGLA  Lo que no tiene hechos aparece como HUECO, no como cero. El número que más duele
       —"pedidos sin propuesta nunca"— sale de A34, y sin A34 no se puede contar.
REGLA  Muestra tendencia, no solo valor: una espera de 3 minutos que sube es peor que una de 4
       que baja.
```

**O02 · `ActaDeDecisiones`** — CUSTODIO
```text
DATOS  qué se cambió · por qué · quién · desde cuándo · qué se esperaba que pasara
HACE   asentar( cambio, motivo, autor, vigencia ) → Acta
REGLA  Ningún cambio de política (J01, J02, E06, G01) se escribe sin acta: el cambio y el acta se
       escriben juntos o no hay cambio. Es la única forma de que cambiar el criterio cueste algo.
REGLA  El acta no se corrige: si el motivo era falso, se asienta otro acta que lo dice. Un acta
       editable no es un acta.
```

**O03 · `ColaRevisiónHumana`** — CUSTODIO
```text
DATOS  [ caso ] · quién lo pide · hora · plazo · dueño del caso
HACE   encolar( caso, quien_pide )   ·   vencer( caso, ahora ) → sube de prioridad | sigue
REGLA  Cualquier parte puede pedir que se revise una decisión automática que le afectó. Es un
       derecho, no un favor [ABIERTO Q25 sobre si se construye desde el día uno].
REGLA  Con dueño y con plazo. Si vence, sube de prioridad y sigue visible; no se cierra sola.
```

**O04 · `DictamenRevisión`** — CUSTODIO
```text
DATOS  caso · firmante · motivo · efecto aplicado · hora
HACE   dictaminar( caso, firmante, efecto ) → Hecho firmado
REGLA  Efectos PERMITIDOS: compensar a una parte, corregir un histórico mal medido, cambiar la
       regla HACIA ADELANTE.
REGLA  Efecto PROHIBIDO: rehacer la propuesta que ya se emitió. Si el dictamen pudiera rehacerla,
       el humano sería un planificador — y no hay planificador (A28).
REGLA  Quién firma [ABIERTO Q26]: la sala o el dueño. El diseño garantiza que hay un nombre.
```

### P · ROL TRABAJADOR — la sala, que opera el día de hoy (4 clases)

**P01 · `ColaSala`** — CUSTODIO
```text
DATOS  [ caso vivo ] · tipo · hora de entrada · pedidos afectados · traza
HACE   encolar( caso )   ·   siguiente( ) → caso   ·   cerrar( caso, por_qué )
REGLA  UNA sola cola. No tres bandejas. Una incidencia, una disputa, un alta incompleta y un
       pedido sin rider son el mismo tipo de cosa: algo que se ha atascado y necesita a alguien.
REGLA  Prioridad por HECHOS: tiempo esperando y pedidos afectados. No por quién llama más.
REGLA  Un caso sale de la cola con un hecho que lo cierra (dictamen, cargo, alta completada), no
       porque alguien lo borre.
```

**P02 · `VistaParte`** — REFLEJO
```text
HACE   ver( tienda | rider ) → todo lo suyo en una pantalla, incluido lo que falló y por qué
REGLA  Incluye las propuestas que no llegaron a nada CON SU TRAZA (A16 + A34): "tres candidatos; a
       dos se les pasó el desvío; al tercero le faltaba el precio". Eso no es una excusa: es un
       diagnóstico.
REGLA  Sólo de esa parte. La vista de una tienda no muestra a sus competidoras.
```

**P03 · `AcciónSanción`** — CUSTODIO
```text
DATOS  parte · motivo · plazo · acta · autor
HACE   suspender( parte, motivo, plazo ) → Sanción
REGLA  Suspender exige motivo, plazo y acta. Suspender sin acta es el principio de un mercado de
       abusos — y este mercado se llama así a propósito, así que la tentación está en el nombre.
REGLA  No toca pedidos en vuelo (H05). Y no puede ser "por tasa de rechazo": eso no es una falta,
       es un derecho (A21).
```

**P04 · `ChecklistAlta`** — REFLEJO
```text
HACE   de( tienda | rider ) → qué falta para el alta, sin memoria
REGLA  Lista derivada de I01 / I02 y de lo que el proyecto exija [ABIERTO Q34]. Sin criterios
       ocultos: si algo no está en la lista, no se puede exigir después.
REGLA  Un rider a medias no entra en A04. No por castigo: porque el censo no puede inventar lo
       que no consta.
```

### Q · ROL CLIENTE — dos caras (1 clase)

**Q01 · `EstadoCuentaParte`** — REFLEJO
```text
HACE   ver( parte, periodo ) → { devengado · facturado · cobrado · pendiente · cargos · saldo }
REGLA  Cada importe apunta a un hecho: un pedido aceptado, un cierre, un cargo con evidencia. Lo
       que no consta se muestra como "sin evidencia", no como cero.
REGLA  Sirve a las dos caras del rol: la tienda (que paga y necesita cuadrar lo que paga con lo
       que recibe) y el rider (que cobra y necesita saber qué le deben). El cliente final NO
       tiene cuenta: no es parte de nada.
REGLA  Es la pieza que convierte "te cobramos la coordinación" en algo verificable. Sin ella, la
       cuota es un recibo y no un contrato.
```

---

### Recuento de clases

| Grupo | Piezas F2 | Clases | Nota |
|---|---|---|---|
| A · propuesta-enlace | 34 | 34 | el cuello: 26 reflejos, 6 custodios, 1 puente, 1 agente |
| B · ruta-viva | 6 | 6 | |
| C · pedido | 7 | 7 | |
| D · plaza-tienda | 7 | 7 | |
| E · tarifa-tres-bandas | 7 | 7 | |
| F · reparto-medido | 7 | 7 | incluye el 2.º agente |
| G · adjudicación-fallos | 6 | 6 | |
| H · liquidación | 6 | 6 | |
| I · sala-mercado | 8 | 8 | |
| J · config-proyecto | 5 | 5 | |
| K · cliente final | 2 + 1 reservada | 2 | K03 sin clase: no se sabe si existe |
| L · restaurante | 4 | 4 | incluye el 3.er agente |
| M · repartidor | 5 | 5 | |
| N · Bocaos | 2 | 2 | |
| O · rol jefe | 4 | 4 | |
| P · rol trabajador | 4 | 4 | |
| Q · rol cliente | 1 | 1 | |
| **total** | **115 (+1)** | **115** | **ninguna pieza sin clase** |

**Los tres agentes**: A18 (adornar la propuesta), F07 (leer una incidencia), L04 (resumir para la
tienda). Los tres reciben **datos ya calculados** y devuelven lenguaje. Ninguno escribe, ninguno
elige, ninguno puntúa. Si los tres se caen a la vez, el mercado sigue proponiendo, aceptando,
entregando y cobrando con las versiones sin adornar.

---
## 5 · Puertos abiertos — todo lo de fuera entra por aquí

El diseño **no sabe** con qué se hace cada cosa de fuera. Sabe **qué exige** de cada cosa de
fuera. Un puerto es una promesa mínima: si el sitio donde se instala el mercado no puede
cumplirla, no se instala, o se cambia la pieza de fuera — no la clase.

```text
PUERTO Reloj
  EXIGE      una sola hora para todo el mercado, con la misma referencia
  NO EXIGE  sincronización perfecta; sí que dos hechos del mismo pedido no puedan ir "al revés"
  POR QUÉ    la mitad de las medidas de este negocio son restas de dos horas (A08, A09, G02). Con
             dos relojes, la espera es un número inventado y la ventana de 10 s no existe.

PUERTO Tienda   (el canal por el que la tienda opera)
  EXIGE      entregar el pedido · recibir "listo" con hora · publicar el catálogo y el estado
  NO EXIGE  una superficie concreta. Que la tienda no cambie de herramienta es una condición
             comercial fuerte, pero es del sitio, no del diseño.

PUERTO Cliente  (el canal de la tienda hacia su cliente)
  EXIGE      entregar avisos de estado y de reparto SIN marca de Bocaos (K02)
  NO EXIGE  una aplicación propia. De hecho lo PROHÍBE: si el canal es una app de Bocaos, el
             cliente deja de ser de la tienda y el modelo cambia.

PUERTO Rider    (por donde le llega la propuesta)
  EXIGE      entregar una propuesta en menos de la ventana, y devolver el sí/no/silencio con hora
  NO EXIGE  una superficie concreta: es intercambiable por diseño
  CRÍTICO    es el único puerto con latencia crítica del sistema. Una ventana de 10 s que llega
             8 s tarde es una ventana de 2 s, y una ventana de 2 s es una asignación disfrazada.

PUERTO Posición (de dónde sale "dónde está el rider")
  EXIGE      un punto con hora y una frescura consultable
  NO EXIGE  frecuencia ni traza continua. El diseño pide UN punto, y la frescura que no tenga se
             nombra (A34). Qué se conserva y cuánto: [ABIERTO Q38], con el límite de que no se
             recoge fuera del horario de trabajo.

PUERTO Ruta     (de dónde salen los metros y los minutos)
  EXIGE      metros y minutos entre dos puntos, y la inserción de una parada en una ruta
  NO EXIGE  un modo de cálculo concreto. Si es línea recta, por calle o con tráfico cambia el
             número y con él cuántos pasan el umbral: [ABIERTO Q37]. El diseño sólo exige que el
             modo esté DECLARADO, porque un desvío medido de dos maneras distintas no es
             comparable consigo mismo.

PUERTO Cobro    (cómo se cobra a cada parte)
  EXIGE      cobrar a una parte, por el canal que ella declare, el importe de SU documento
  NO EXIGE  cobrar por cuenta de otro. El diseño prohíbe que Bocaos cobre o pague importes
             ajenos (H06): el puerto sólo sirve para la cuota propia.

PUERTO Prueba   (foto y confirmación de entrega)
  EXIGE      guardar una prueba con hora, y decir si no la hay
  NO EXIGE  foto obligatoria: si es opcional lo dice el proyecto [ABIERTO Q30], y la falta se
             trata como hecho, no como hueco.

PUERTO Sala     (cómo se avisa a una persona)
  EXIGE      entregar un caso con su traza y admitir un plazo
  NO EXIGE  presencia permanente. Si no hay nadie, el caso queda vivo y visible (I07).

PUERTO Catálogo (de dónde sale la carta de una tienda)
  EXIGE      una única fuente por tienda, consultable
  NO EXIGE  que Bocaos la guarde. D02 proyecta; no almacena una segunda carta.

PUERTO Documento (el documento de cobro)
  EXIGE      emitir un documento con importes, periodo y parte
  NO EXIGE  un formato fiscal concreto: IVA y forma jurídica [ABIERTO Q4].
```

**La prueba del plasma**: ninguno de estos once puertos nombra un producto, un proveedor ni una
técnica. Todos podrían cumplirse con cosas distintas en dos ciudades distintas, y el diseño no
cambiaría una línea. Ningún puerto está cableado dentro de una fórmula: las clases **piden** y
reciben `NO_CONSTA` si el puerto no está.

---

## 6 · Flujos

Los flujos son el orden en que las clases se hablan. **Ninguno de ellos decide**: cada uno mide,
pide o escribe; donde hay que elegir, hay una `SolicitudDecision` (§7).

### 6.1 · El enlace por pedido — los ocho pasos (el producto)

```text
① LLEGA EL HECHO
     HoraDeListo.declarar(tienda, pedido, hora)
        → HechoPedidoListo.anotar( … )                 // el dato viaja DENTRO del hecho

② SE TOMA LA FOTO                                   [una sola vez, y se congela]
     vista   ← ComposiciónDeLaVista.componer(hecho, ahora)
     foto    ← CongelaciónDeLaFoto.congelar(vista)
     política← VersiónEfectiva.en(ahora, zona)

③ SE FILTRAN
     C ← CandidatosElegibles.de(foto)               // estado + zona + capacidad, declarados

④ SE MIDEN                                          [para cada candidato, en el orden de la política]
     desvío  = A07( A05(c,foto) , A06(c,hecho,foto) )
     espera  = A08( c, foto, hecho.hora_listo )                  · contra el histórico del local
     retraso = A10( A09( cada parada a bordo ) )                  · contra SU promesa guardada
     cobra   = A11( hecho.precio , desvío , espera , coste(c) )    · NETO, SUPUESTO S2
     //  si alguno = NO_CONSTA → A34.nombrar(c, faltantes) y se salta el candidato

⑤ SE COMPARA
     A12.pasa(medidas, política) → sí | no + cuál falló      // cuatro tests, AND, cero pesos

⑥ SE PROPONE A UNO
     p ← A13.emitir(hecho, c, medidas, huella(foto), política.version)
     A15.abrir(p, J02.duración)                                // 10 s, SUPUESTO S6
     M04.entregar( A18.adornar( A17.componer( A16.de(medidas, política) ) ), c )
        // el rider ve: desvío · espera · retraso · cobra · una frase. Y nada más.

⑦ SE ESPERA                                        [tres desenlaces, los tres válidos]
     ├ el rider acepta    → A19.aceptar → A14.cerrar(aceptada) → A20 → A24.crear contrato
     ├ el rider rechaza   → A21.anotar  → A14.cerrar(rechazada) → A25.siguiente
     └ no contesta        → A15.vencer  → A23.anotar  → A14.cerrar(caducada) → A25.siguiente

⑧ SI NADIE ACEPTA
     A25 devuelve NINGUNO al agotar el tope (2, SUPUESTO S6)
        → A26.escalar( pedido, intentos )
              ├ PIDE SubidaDeOferta (E07) → espera a que un humano la suba (§7, D1)
              ├ PIDE AvisoSala (I07)      → el caso entra en la cola con su traza (P01)
              └ o vuelve a empezar con otro candidato, si el tope no se agotó
     // el pedido NO se cierra por silencio del sistema: sigue vivo y visible
```

**Lo que este flujo NO tiene, y es lo que lo define**: no tiene un paso donde alguien mire el
conjunto. No hay cola de pedidos que repartir, no hay re-optimización del día, no hay
emparejamiento global. El resultado del mercado **emerge** de muchos pasos ①–⑦ tomados a la vez.

### 6.2 · El pedido, de la carta a "listo"

```text
CartaPublica.proyectar( catálogo de la tienda )          → lo que el cliente puede ver
CarritoTienda.añadir( … )                                → el buffer de ESE cliente en ESA tienda
PrecioCerrado.cerrar( carrito, oferta, incentivo )        → céntimos, con desglose
CapturaPedido.alta( cliente, líneas, oferta )             → Pedido   [nace con precio cerrado]
   ├ RegistroClienteTienda.de(cliente, tienda)            · si es invitado, igual es de la tienda
   └ OfertaCliente.estipular(pedido, céntimos)            · se congela aquí y no se toca
AvisoTienda.avisar( tienda, pedido )  → EstadoPedido.transitar( …recibido )
EstadoCocinaVisible.ver( pedido )  ·  AvisoCliente.avisar( cliente, … )   → el cliente sabe qué pasa
HoraDeListo.declarar( tienda, pedido, hora )              → el disparador de §6.1
```

Fricción atendida: el cliente deja de llamar para preguntar. **Lo que no se resuelve**: que la
comida esté buena. Eso es de la tienda y el diseño no lo finge.

### 6.3 · El reparto medido

```text
ContratoPuntual.crear( aceptación )          → un pedido, un rider, un precio, una hora prometida
PromesaPorParada.prometer( parada, hora )    → la promesa que después se mide
   … el rider recoge …
HechosDelReparto.anotar( recogida, hora )     → arranca el reloj de la espera en tienda (G)
   … el rider llega …
HechosDelReparto.anotar( llegada, hora )      → arranca el reloj del portal (G)
InstruccionesAcceso.mostrar( pedido, rider )  ·  ChatEnmascarado.entregar( … )   [sin números]
PruebaEntrega.anotar( foto, hora, confirmación )
HechosDelReparto.anotar( entrega, hora )
FinDeTrayecto.cerrar( ruta )                 → la parada desaparece de B02
   …
   ├ todo fue bien → Devolución de la prueba al cliente y hechos cerrados
   └ algo falló    → IncidenciaReparto.abrir( relato ) → LecturaDeIncidencia.clasificar( relato )
                       → el caso entra en ColaSala con campos, sin adjudicar
```

### 6.4 · El fallo: medir, no juzgar

```text
VentanaEspera.vigente( instante )                    → N1 · N2 · N3   [ABIERTO Q28]
HechoVerificado.verificar( hechos, ventana )         → excedido sí/no + minutos   | NO_CONSTA
ReglaPagoFallo.aplicar( exceso, parte )              → fila: quién paga a quién   [importes ABIERTOS]
TrazabilidadFallo.revisar( cargo )                   → sin evidencia NO hay cargo
CargoFallo.anotar( fila, evidencia )                 → Deuda (no descuento)
   ├ la parte acepta  → la deuda se compensa en el cierre (H04), si Q29 lo permite
   └ la parte disputa → DisputaFallo.llevar( deuda ) → ColaSala → DictamenRevisión (firmado)
```

**El bucle que esto cierra** — y es lo que Bocaos vende de verdad:

```text
la tienda marca listo tarde → la espera se mide → el coste lo paga ella (regla + cargo)
      → su puntualidad queda publicada (L03) → el rider la VE antes de aceptar
      → su espera probable sube → no pasa el umbral → no recibe propuestas
      → sube su incentivo o arregla la cocina
```

La corrección **no la hace Bocaos**: la hace el mercado con la información que Bocaos mide. Por
eso el cuello no se resuelve "empujando riders", sino midiendo bien y no estorbando.

### 6.5 · La liquidación semanal — el único dinero de Bocaos

```text
CicloSemanal.abrir( periodo )
   por cada contrato cerrado del periodo:
        Devengo.acumular( parte, periodo )      → seguro + en duda   [Q18 en la duda]
        // tienda: fijo del tramo + 20 c/pedido aceptado   (SUPUESTO S14)
        // rider : 10 c/pedido aceptado                    (SUPUESTO S14)
        // NUNCA por km ahorrado, NUNCA por % del ticket (A32, H06)
        // los cargos por fallo (G04) entran como deuda de la parte
CicloSemanal.cerrar( periodo )                   → Cierre inmutable   [corte: ABIERTO Q26]
   ├ FacturaGestión.emitir( cierre, parte )      → documento de cobro   [IVA: ABIERTO Q4]
   └ CobroGestión.cobrar( documento, canal )     → Cobrado | Fallido
         └ ImpagoGestión.aplicar( deuda, días )  → recordatorio → recargo → suspensión
              // la suspensión NO corta pedidos en vuelo ni propuestas vivas
```

**El dinero, en una línea, tal como está diseñado**:

```text
cliente ─── comida ──────────────► tienda          (Bocaos no lo toca)
cliente ─── reparto ÍNTEGRO ─────► rider           (Bocaos no lo toca)
tienda  ─── tramo 1 + 20 c/pedido ► Bocaos         (semanal)
rider   ─── 10 c/pedido aceptado ─► Bocaos         (semanal)
```

### 6.6 · El alta de una parte

```text
AltaTienda / AltaRider.alta( datos ) → Censo | INCOMPLETA
ChecklistAlta.de( parte )            → qué falta, sin memoria
TérminosParte.aceptar( parte, versión )   → sin esto no hay propuesta ni devengo para ella
   [rider]  la acreditación y el documento informativo del sistema que decide: ABIERTO Q34
   [tienda] exclusividad, permanencia o admisión: ABIERTO Q35
```

### 6.7 · El cambio de criterio (el flujo que impide que el dueño juegue con el mercado)

```text
SimuladorDeUmbrales.simular( política_nueva, hechos, zona )   → qué habría pasado, con SUS números
        ↓
SolicitudDecision( «cambiar los umbrales» )                    → el dueño decide (§7, D5)
        ↓
ActaDeDecisiones.asentar( cambio, motivo, autor, desde )        → el acta y el cambio, juntos
        ↓
ConfigUmbrales.declarar( valores, autor, desde )                → nueva versión, con vigencia
        ↓
VersiónEfectiva.en( instante )                                  → cada propuesta futura cita la suya
        ↓
[si el cambio afecta a pedidos en vuelo → ABIERTO Q4]
```

### 6.8 · La revisión humana de una decisión automática

```text
cualquier parte pide revisar → ColaRevisiónHumana.encolar( caso, quien_pide )   [con plazo]
        ↓
VistaParte.ver( parte ) + A29.reproducir( propuesta )   → el humano ve lo mismo que vio el sistema
        ↓
DictamenRevisión.dictaminar( caso, firmante, efecto )
        ↓
efecto permitido: compensar · corregir el histórico · cambiar la regla HACIA ADELANTE
efecto prohibido: rehacer la propuesta emitida (sería un planificador humano — A28)
```

### 6.9 · El bucle del rider (el que evita que el mercado se quede sin riders)

```text
enlaza → su promesa se cumple o se rompe (B03 / F01)
   ├ se cumple → su trayecto sigue y puede volver a enlazar; gana más por el mismo viaje
   └ se rompe  → el umbral de retraso no le deja enlazar la próxima vez igual
                 // enlazar sigue siendo su palanca, pero no gratis
mientras tanto: rechaza libremente (A21), declara pausa (I04), declara zona (M02),
                 y ve por qué le llegó cada propuesta (A16/A17) — que es un derecho, no un gesto
```

---
## 7 · La decisión humana — `SolicitudDecision`

**Una sola forma para todas las decisiones que no son del sistema.** Si hay dos formas, una de
ellas acabará siendo una decisión automática disfrazada.

```text
CLASE SolicitudDecision
  DATOS   asunto · hechos citados (con hora y autor) · opciones, cada una con su consecuencia
          escrita · quién puede responder · plazo · qué pasa si vence · efecto de cada opción
  HACE    abrir( … ) → Solicitud
          responder( quién, opción, motivo ) → Decisión firmada
          vencer( ahora ) → sube de prioridad y SIGUE VIVA
  REGLA   Ninguna opción puede tener por efecto "asignar un pedido a un rider" (A27). Si una
          opción lo hiciera, la solicitud no se abre: el acto es ilegal por la puerta de atrás.
  REGLA   Ninguna opción puede ser "que decida el sistema" ni "aplicar la recomendación". El
          sistema no recomienda: muestra las consecuencias.
  REGLA   Vencer NO resuelve. Una solicitud vencida no se cierra sola ni "se aplica por defecto":
          se queda visible y sube de prioridad. Un plazo que resuelve solo es un automatismo con
          reloj.
  REGLA   Toda decisión queda firmada y con su motivo, y de ahí sale un HECHO (nunca una
          re-optimización).
```

### 7.1 · Dónde aparece (y dónde no)

| # | Se abre una `SolicitudDecision` cuando… | Puede responder | Si vence |
|---|---|---|---|
| D1 | el pedido no encuentra a nadie y hay que **subir la oferta** (Q17) | cliente · tienda · dueño | la deuda queda viva, el caso en la cola |
| D2 | hay que decidir **quién paga** la subida de oferta (Q17) | dueño | sigue abierta; no se sube |
| D3 | una parte **disputa un cargo** por fallo (Q24) | sala o dueño | sube de prioridad |
| D4 | alguien pide **revisar** una decisión automática (Q25/Q26) | sala o dueño | sube de prioridad |
| D5 | se quiere **cambiar el criterio**: umbrales, ventana, zona (Q1–Q7) | dueño | no hay cambio |
| D6 | se quiere **abrir o cerrar una zona** (N01) | dueño | sigue abierta como estaba |
| D7 | se quiere **cambiar un tramo** (Q14) | dueño | no hay cambio |
| D8 | hay que decidir el **corte del ciclo** o qué hacer con un cobro fallido (Q26) | dueño | no hay corte |
| D9 | un pedido se canceló **después de aceptar** y hay que decidir si devenga (Q18) | dueño | queda "en duda" en H01 |
| D10 | el alta de una parte está incompleta y alguien pide **excepción** (Q34/Q35) | dueño | no hay alta |
| D11 | la tienda rechaza un pedido y hay que decidir quién paga (Q36) | tienda + cliente | se anota y **no se cobra** a nadie |

**Lo que NUNCA es una `SolicitudDecision`**, y es la lista que define el negocio:

```text
× a quién se le propone un pedido            ← lo decide A12, con cuatro números y una política
× si un pedido se asigna a un rider          ← no se asigna: se propone (A19)
× si un fallo existió                        ← lo dice G02 con hechos, no una persona
× quién gana una carrera de aceptaciones     ← lo dice A14, y gana el primero, no el preferido
× qué ve el cliente de su pedido             ← lo decide C05, y es lo mismo para todos
× si una tienda sale antes en la plaza       ← no hay plaza que ordene (D07)
```

---

## 8 · Contratos y avisos

### 8.1 · Quién da qué y recibe qué

| Parte | Da | Recibe | Paga |
|---|---|---|---|
| **cliente final** | su pedido y su oferta de reparto (congelada) | precio cerrado, una hora, seguimiento, prueba y una vía de queja (la tienda) | la comida (a la tienda) y el reparto (al rider) |
| **tienda** | su carta, su marca, su cliente y la hora de listo | escaparate propio, pedidos, riders y la medida de su cocina | tramo 1 + tramo 3 (fijo + 20 c/pedido) |
| **rider** | una decisión libre en ~10 s (o el silencio) y la entrega | cuatro números, una frase que los explique, el importe **íntegro** y su histórico de locales | tramo 3 (10 c/pedido aceptado) |
| **Bocaos** | el criterio, aplicado igual a todos, y la traza de por qué | céntimos por pedido aceptado | — (no paga nada a nadie por el ticket ni por el reparto) |

### 8.2 · La forma de cada aviso

Un aviso es un hecho que se anuncia. **Ninguno de estos avisos decide nada**: quien los recibe
decide, o no hace nada.

```text
AvisoPedidoListo      { pedido, tienda, destino{punto, instrucciones}, hora_listo, precio, punto }
                      lo escribe C04 · lo consumen A01 (§6.1) y nada más

AvisoPropuesta        { pedido, rider, desvío, espera, retraso, cobra, frase,
                        huella de la foto, versión de política, vence a las HH:MM:SS }
                      lo escribe A13/A15 · lo consume el rider por M04 · es INMUTABLE

AvisoDesenlace        { propuesta, aceptada | rechazada | caducada, hora, autor }
                      lo escribe A14 · lo consumen A25 (avanzar) y I05 (medir)

AvisoContrato         { pedido, rider, precio, hora prometida, tienda }
                      lo escriben A24 · lo consumen B02/B03 (la ruta viva) y F01 (los hechos)

AvisoEstadoPedido     { pedido, estado, hora }              → C02 → podado por C05 → C06
AvisoIncidencia       { pedido, relato, autor, hora }        → F06 → F07 → P01
AvisoFallo            { deuda, evidencia[], partes }         → G04 → Q01 y H01
AvisoCierre           { periodo, parte, seguro, en duda }    → H02 → H03 → H04
AvisoSala             { caso, tipo, traza, plazo }           → I07 → P01
AvisoHueco            { pedido, rider, [dato_faltante] }     → A34 → P02 y O01
```

**Regla común a todos**: si un aviso no llega, el hecho **ya está escrito**. El aviso es
transporte; la verdad es el hecho. Un aviso perdido no puede hacer desaparecer un pedido, ni
crear un contrato, ni cobrar nada.

---

## 9 · Invariantes y determinismo

Las doce renuncias de la F2, aquí como **tests** y con la clase que los sostiene. Si un día una
se pone roja, el modelo ha cambiado de naturaleza — y es mejor enterarse por un test que por un
restaurante enfadado.

| # | Renuncia | Clase que la afirma | Qué afirma el test |
|---|---|---|---|
| 1 | **No asigna** | `A27` | no hay camino de pedido a rider sin una aceptación libre |
| 2 | **No decide en bloque** | `A28` | la entrada del enlace es un hecho y una foto; no una lista |
| 3 | **La decisión es reproducible** | `A29` | mismo hecho + misma foto + misma política → misma propuesta |
| 4 | **No agrupa clientes** | `A30` | se enlazan rutas, no clientes |
| 5 | **El enlace no rompe la promesa** | `A31` | ninguna promesa ya dada empeora más allá del umbral |
| 6 | **El ahorro no es de Bocaos** | `A32` | la cuota no depende de km ahorrados ni de pedidos enlazados |
| 7 | **Una propuesta, un pedido** | `A33` | no hay dos propuestas vivas del mismo pedido |
| 8 | **El rechazo no cuesta** | `A22` | ninguna tasa de rechazo entra en la elegibilidad ni en el orden |
| 9 | **No ordena el mercado** | `D07` | sin ranking, sin destacados, sin prioridad comprada |
| 10 | **No cobra el ticket ni retiene** | `H06` | ningún camino del dinero toca la comida ni el reparto |
| 11 | **El cliente es de la tienda** | `L02` + `K02` | ningún cliente cruza de tienda; ninguna comunicación lleva la marca de Bocaos |
| 12 | **El rider es autónomo** | `M03` | nada le bloquea por trabajar con otro |

### 9.1 · Las cinco reglas de determinismo

```text
R1 · DATO AUSENTE = NO_CONSTA
     Hay tres valores distintos y el diseño nunca los confunde:
        CONSTA(x)    el dato está, con su hora y su autor
        NO_CONSTA    el dato no está y NO SE ESTIMA  → A34 lo nombra, el candidato se salta
        NO_HAY       la cosa no existe (no hay contrato, no hay cargo, no hay zona)
     Un cero sólo se escribe cuando se ha medido un cero. "Sin histórico" no es 0 de puntualidad.

R2 · UNA DECISIÓN, UNA FOTO
     Nada de lo que pasa dentro de F lee el mundo. Si leyera, la explicación que se dio dejaría
     de ser cierta. La foto viaja con la propuesta y se cita al explicarla.

R3 · TODO NÚMERO QUE SE MUESTRA TIENE UN HECHO DETRÁS
     Cada céntimo, cada minuto y cada metro de una pantalla apuntan a un hecho con hora. Vale
     para el rider (A16), para la tienda (L01), para el jefe (O01) y para los agentes (los tres
     validadores). Un número sin hecho es una opinión con formato.

R4 · NINGÚN AGENTE ESCRIBE NI ELIGE
     A18, F07 y L04 reciben datos ya calculados y devuelven lenguaje. No escriben estado, no
     eligen a quién, no puntúan. Su validador es puro y rechaza lo que no está en la entrada.
     Si se caen, el mercado funciona igual.

R5 · NINGUNA REGLA VIVE SIN VIGENCIA
     Umbrales, ventana, zona, tramos, ventanas de espera y términos: todos con desde-cuándo y
     quién. Toda propuesta cita la versión que la juzgó (J04), y toda cuenta se hace con la
     versión que estaba viva cuando ocurrió el hecho, no con la de hoy.
```

### 9.2 · Los cuatro tests de la cadena, uno por umbral

```text
T-desvío    con desvío = umbral exacto → NO pasa (es "<", no "≤"). Un metro de más, no pasa.
T-espera    llega 30 s antes de listo → espera = 0,5 min, pasa. Llega 5 min antes → no pasa.
T-retraso   un pedido a bordo con promesa rota por 7 min → no pasa, aunque los otros estén bien
            (se toma el PEOR: A10).
T-cobra     cobra = 0 → no pasa (es ">"). cobra = 1 céntimo → pasa, pero el rider tiene que
            poder ver ese céntimo (M05) y decir que no.
```

---
## 10 · Lo que este diseño prohíbe construir

No es una lista de buenas intenciones: son las clases que **no existen** y que no pueden
aparecer sin romper un test de §9.

```text
✗ UN PLANIFICADOR            un barrido de pedidos × riders. Sería un custodio del reparto, y el
                             reparto no tiene dueño central. Rompe A28.
✗ UN SCORER DE CANDIDATOS    cualquier número único que ordene riders como FILTRO. La fórmula de
                             S7 sólo puede ordenar a los que ya pasaron (T1). Si filtra, es una
                             nota con otro nombre y rompe A22.
✗ UN MODELO QUE PREDIGA LA COCINA   la cocina declara; no se predice. Rompería C04 y el sentido
                             de L03 (que mide lo declarado, no lo estimado).
✗ UN AGENTE QUE ADJUDIQUE   la tabla mide (G03); el humano, si acaso, firma (O04).
✗ UN CONTADOR DE RECHAZOS   que alimente la elegibilidad. Es la forma más silenciosa de convertir
                             un autónomo en empleado. Rompe A22.
✗ UNA NOTA AL RIDER         ni estrellas, ni fiabilidad, ni "prioridad por aceptación pasada".
✗ UNA APP DE CLIENTE        ni cuenta, ni marca, ni atención al cliente final. Rompe K02 y, con
                             ella, la razón por la que un restaurante acepta estar aquí.
✗ UN CARRITO O UN REGISTRO COMPARTIDO ENTRE TIENDAS   rompe L02 y con ello el par 4.
✗ UN RANKING, UN DESTACADO, UNA POSICIÓN COMPRADA      rompe D07.
✗ UN COBRO EN NOMBRE DE OTRO  ni retención, ni adelanto, ni porcentaje del ticket. Rompe H06.
✗ UNA ASIGNACIÓN "SUAVE"     ni auto-aceptar a los N segundos, ni "el sistema elige si nadie
                             contesta", ni la llamada de la sala a un rider concreto. Rompe A27.
✗ UNA ESTIMACIÓN DE LO QUE FALTA      ni posición inventada, ni precio supuesto, ni histórico
                             "razonable". Rompe A34 y R1.
```

---

## 11 · Preguntas abiertas `[ABIERTO]`

**35 de las 40 siguen abiertas, tal como las dejó la F2.** Cinco están cubiertas por un supuesto
provisional del dueño (§3) y **eso no las cierra**: las cinco siguen en esta tabla, marcadas como
supuesto, porque un supuesto con nombre se puede deshacer y uno silencioso no.

| Q | Tema | Dónde vive en el diseño | Estado |
|---|---|---|---|
| Q1 | los cuatro números y de quién son | `J01` (valores) · `A12` (forma) | **SUPUESTO S1** · 800 / 4 / 6 / > 0 |
| Q2 | `cobra` bruto o neto | `A11` | **SUPUESTO S2** · neto → abre Q41·F3 |
| Q3 | ¿un juego de umbrales por zona? | `J03` · `J04` | ABIERTA |
| Q4 | vigencia: ¿rige para el pedido en vuelo? | `J04` · `A31` | ABIERTA |
| Q5 | ¿la ventana es fija? ¿y si va conduciendo? | `J02` · `M04` | ABIERTA |
| Q6 | en serie o en paralelo | `J01` (tope) · `J02` (duración) · `A33` | **SUPUESTO S6** · serie, 2, 10 s |
| Q7 | el orden de candidatos | `J01.orden` · `A25` | **SUPUESTO S7** · «el que mejor puntúa» → abre Q44·F3 |
| Q8 | ¿el orden puede depender de datos del rider? | `A22` | ABIERTA (el diseño lo **prohíbe**) |
| Q9 | ¿se le muestra su propia tasa de rechazo? | `A21` | ABIERTA |
| Q10 | ¿basta la pausa declarada? | `I04` · `M02` | ABIERTA |
| Q11 | ¿puede rechazar **con motivo**? ¿a quién alimenta? | `A21` · `F07` | ABIERTA |
| Q12 | «acepta y no aparece»: ¿qué pierde? | `F01` · `C07` · `P03` | ABIERTA |
| Q13 | ¿puede devolver si el local se pasa de la espera? | `C07` · `B03` | ABIERTA |
| Q14 | los tramos | `E06` | **SUPUESTO S14** · 39/79/149 · 10 c · 20 c |
| Q15 | ¿el enlace abarata el reparto al cliente? | `K03` · `D03` | ABIERTA |
| Q16 | los km ahorrados, ¿de quién son? | `A32` | ABIERTA (lectura: del rider) |
| Q17 | ¿quién sube la oferta, con qué tope, quién paga? | `E07` · `A26` · D1/D2 | **ABIERTA · crítica** |
| Q18 | ¿se devenga en un pedido fallido? | `H01` (dos cifras) | ABIERTA |
| Q19 | ¿el cliente ve el incentivo de la tienda? | `D03` | ABIERTA |
| Q20 | ¿el cliente sabe que comparte viaje? | `K03` (**sin clase**) | **ABIERTA · bloquea una pieza** |
| Q21 | si llega tarde por un enlace, ¿quién responde? | `G03` · `A31` | ABIERTA |
| Q22 | ¿la promesa es una hora o una ventana? | `B03` | **ABIERTA · cambia el sentido del umbral** |
| Q23 | ¿de qué responde Bocaos? ¿con quién contrata el rider? | `I02` · `E06` | ABIERTA |
| Q24 | en una disputa, ¿cómo se prueba y quién decide? | `G05` · `O04` | ABIERTA |
| Q25 | ¿la revisión humana desde el día uno? | `O03` | ABIERTA |
| Q26 | ¿quién firma el dictamen? ¿y el corte del ciclo? | `O04` · `H02` | ABIERTA |
| Q27 | ¿la tienda acepta el pedido o entra directo? | `C03` · `C02` | ABIERTA |
| Q28 | las tres N de la espera | `G01` | **ABIERTA · sin N no hay cargo** |
| Q29 | ¿cómo se hace efectivo un cargo? | `G04` · `H04` | ABIERTA |
| Q30 | sin prueba, ¿a favor de quién? | `F02` · `G06` | ABIERTA |
| Q31 | ¿pedidos de tiendas distintas en el mismo viaje? | `A06` · `A30` | ABIERTA |
| Q32 | ¿consecuencia por cocina lenta repetida? | `L03` · `I03` | ABIERTA (hoy: visible y más caro) |
| Q33 | ¿cuántos pedidos caben? | `B05` | ABIERTA |
| Q34 | ¿qué acredita el rider y quién lo verifica? | `I02` · `P04` | ABIERTA |
| Q35 | ¿exclusividad, permanencia o admisión de tienda? | `I01` · `I08` | ABIERTA |
| Q36 | ¿la tienda puede rechazar y quién paga? | `C07` | ABIERTA |
| Q37 | «cerca» y «desvío»: ¿recta, calle, tráfico? | `A07` · Puerto Ruta | **ABIERTA · cambia cuántos pasan** |
| Q38 | ¿cuánto se guarda la traza? | `B01` · `F05` | ABIERTA |
| Q39 | ¿invitado? ¿ve el desglose? | `D05` · `D03` | ABIERTA |
| Q40 | ¿quién atiende la sala y a qué hora? | `P01` · `I07` | **ABIERTA · crítica con S6** |

### 11.1 · Las cuatro que **destapa este diseño** (no existían en la F2)

```text
Q41·F3  ¿De dónde sale el COSTE del desvío y de la espera del rider?
        Con S2 (cobra neto) el cuarto umbral necesita €/km y €/min del rider, y no existen.
        Tres salidas (él los declara · el proyecto los declara · se deducen de su historial) y
        las tres tienen consecuencias distintas sobre quién puede enlazar.
        MIENTRAS NO SE RESPONDA: A11 devuelve NO_CONSTA, el mercado no propone nada, y todo el
        sistema es un mercado determinista que no mueve un pedido. Es el hueco más caro del
        diseño y aparece justo al aceptar Q2 = neto.

Q42·F3  ¿Con qué reloj se cuenta la ventana de la propuesta?
        Los 10 s de S6 se miden desde que se emite o desde que le llega. Con un canal malo, la
        diferencia son 8 de los 10 segundos. Y si el rider no la vio, ¿caducó?
        Afecta a A15 y a M04, y decide si la caducidad es un "no" del rider o un fallo del
        transporte — que no es lo mismo ni para él ni para la medida del mercado.

Q43·F3  Si se agotan los dos candidatos a las 22:40 de un sábado, ¿quién recibe la escalada?
        Con S6 el pedido falla entero en 20 s y la tercera salida es la sala. Si no hay nadie
        (Q40), la escalada tiene un destinatario que no existe.
        Se cruza con Q17 (¿sube la oferta alguien a esa hora?) y con Q36 (¿puede la tienda
        rechazar?). El diseño deja el caso VIVO y VISIBLE, pero vivo y visible no es atendido.

Q44·F3  «El que mejor puntúa» (S7): ¿ordena a los que ya pasan, o sustituye al filtro?
        Si sustituye al AND, hay un scorer y se caen A22 y A28 a la vez, y el cuarto umbral deja
        de proteger al rider (T1). Si sólo ordena, la fórmula tiene que ser pública, pobre (sólo
        los cuatro números de ESE pedido) y con desempate declarado.
        Es la pregunta que decide si el diseño sigue siendo un mercado o es un ranking con
        cuatro números de adorno.
```

### 11.2 · Lo que el diseño deja escrito como **deuda** (no como hueco tapado)

```text
DEUDA 1  K03 no existe. El cliente puede estar pagando lo mismo y esperando hasta el umbral de
         retraso por un enlace que no pidió, y nadie se lo dice. Está escrito, no resuelto.
DEUDA 2  G03 devuelve "quién" pero no "cuánto" (Q28). Hay una tabla sin importes: mide, no cobra.
DEUDA 3  G04 acumula deudas que quizá no se puedan hacer efectivas (Q29). El diseño prefiere una
         deuda visible a un descuento imposible.
DEUDA 4  E07 no tiene autor por defecto: si nadie sube la oferta, el pedido muere con traza.
DEUDA 5  Sin histórico del local (L03 = NO_CONSTA), un mercado nuevo propone con menos
         información. El diseño NO rellena ese hueco con una media del mercado.
```

---

## 12 · Orden de obra (qué tiene que estar vivo antes que qué)

El diseño no se puede construir empezando por el corazón. **`propuesta-enlace` depende de datos
que escribe medio negocio**: sin ruta viva no hay desvío, sin precio compuesto no hay `cobra`, sin
histórico del local no hay espera probable, sin política no hay umbrales. Construir A antes que
B, J, E y L produce un mercado perfectamente determinista que devuelve `hueco-de-medida` en cada
candidato.

```text
1 · LO QUE DECLARA EL PROYECTO            J01 J02 J03 J04 + O02 (acta)
      sin política no hay nada que aplicar; y sin acta, la política no tiene por qué

2 · EL CENSO Y EL ESTADO                  I01 I02 I03 I04 + I08 (términos) + P04 (checklist)
      sin tiendas y riders declarados, A04 está siempre vacío

3 · LA RUTA VIVA                          B01 B03 B05 B04 B02 B06
      sin posición, promesa y capacidad, no hay ni un número que medir

4 · EL PEDIDO Y SU PRECIO                 D01 D02 D03 D04 D05 + C01 C02 C03 C04 + E01 E02 E03
      sin "listo" no hay disparo; sin precio cerrado no hay cobra; sin cobra no hay propuesta

5 · EL HISTÓRICO DEL LOCAL                L03 L01 + G01 G02 G03 G06
      sin puntualidad declarada, la espera probable es un hueco (y en un mercado nuevo lo será
      igual: el diseño lo dice en vez de inventarlo)

6 · EL CORAZÓN                            A01 … A34   (la cadena entera)
      aquí ya hay algo que medir. Antes de aquí, sólo habría huecos bien nombrados.

7 · EL REPARTO MEDIDO Y LA PRUEBA         F01 … F07 + C05 C06 C07
      sin hechos con hora no se puede medir la espera ni cobrarla

8 · EL DINERO                             H01 H02 H03 H04 H05 H06 + E04 E05 E06
      es lo último porque su materia prima son hechos ya cerrados

9 · LA OPERACIÓN HUMANA                   P01 P02 P03 + O03 O04 + I05 I06 I07
      la cola y la revisión sólo tienen sentido cuando hay casos que atender

10 · EL BORDE AMABLE                      A18 F07 L04 + K01 K02 + M01 M02 M05 + N01 N02
      los tres agentes y las pantallas de cada parte. Lo último, y lo único apagable sin que el
      mercado deje de funcionar.
```

**La regla de este orden**: cada peldaño se puede probar solo. Un mercado con 1–5 y sin 6 es un
mercado que no propone nada y lo dice. Un mercado con 6 y sin 1–5 es un mercado que propone con
números inventados — es decir, el negocio contrario a este.

---

## 13 · Verificación del entregable

```text
✓ 115 piezas de la F2 → 115 clases, una por pieza, con su forma (CUSTODIO / REFLEJO / PUENTE /
  CONVERSOR / AGENTE). K03 queda RESERVADA y sin clase porque no se sabe si existe (§4, K).
✓ Los 8 pasos de la cadena del eslabón limitante están diseñados como flujo (§6.1), con sus tres
  desenlaces (§6.1⑦) y su escalada (§6.1⑧).
✓ La propuesta es una FUNCIÓN con firma explícita, pura, reproducible y local (§2), y tiene su
  test de replay (A29).
✓ No hay optimizador global, ni planificador, ni scorer que filtre: hay cuatro tests AND (A12) y
  un orden que sólo ordena (§3.2, T1).
✓ La decisión es EXPLICABLE desde un conjunto cerrado de razones (A16) y una frase derivada (A17);
  el agente sólo puede adornar, con validador puro (A18).
✓ El rider acepta, rechaza o caduca. Nunca se le asigna: tres desenlaces válidos y una guarda
  con test (A19, A21, A23, A27).
✓ El dinero: cliente→tienda (comida), cliente→rider (reparto íntegro), ambos→Bocaos (semanal).
  Bocaos no retiene (E05, H06, §6.5).
✓ Los cinco supuestos del dueño están declarados, aislados en tablas de valores y con su
  consecuencia escrita (§3.1). Las tres tensiones que abren están nombradas, no resueltas (§3.2).
✓ 35 de las 40 preguntas siguen abiertas y con clase asignada (§11); cuatro nuevas las destapa
  este diseño (§11.1).
✓ Cero tecnología, cero proveedor, cero herramienta de terceros: once puertos abiertos y ninguna
  fórmula cableada a uno de ellos (§5).
```

---

### Nota de ruta

La F2 almacena su entregable en `proceso/fase2/esquemas/`. Este diseño se ha escrito, por
coherencia con esa estructura y con la ruta que fija el método (`esquemas/diseno-oop.md`), en
`proceso/fase3/esquemas/diseno-oop.md`. En `proceso/fase3/diseno-oop.md` queda un acceso directo
al mismo archivo, para que la ruta pedida también resuelva. **Es un solo documento, no dos.**
