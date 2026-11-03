# DISEÑO OOP — vertical **BOCAOS** · segunda versión, tres unidades
### Fase 3 · PLASMA · `esquemas/diseno-oop.md`

> **Qué es este documento.** El sistema de Bocaos escrito en objetos: qué cosas existen, qué sabe
> cada una, qué hace y qué no puede hacer. Es el **plano**, no la obra. Aquí no hay tecnología, ni
> proveedores, ni dónde se instala: todo lo de fuera entra por **puerto abierto** (§6).
>
> **Entrada**: el árbol maestro de la FASE 2, tercera pasada — `esquema.md` (144 hojas, 3
> `[ABIERTA]`), las 29 pasadas, el corte de piezas y la disección de formas. El sujeto del diseño
> son **sus piezas**, no el negocio: el negocio no se replantea.
>
> **Salida**: este único archivo. La FASE 3b traducirá estas clases contra lo que ya exista; la
> FASE 4 las materializará. Ninguna de las dos cosas se hace aquí.
>
> **Qué cambia respecto a la primera versión.** La v1 diseñaba **un** mercado y llamaba "Bocaos" a
> todo. La F0 §7 y la tercera pasada de la F2 parten el negocio en **tres unidades** —nacional,
> plaza, tienda— y eso no es una capa de organización: reordena el diseño entero. La v1 tenía 115
> clases y un dueño implícito; esta tiene **144 clases y tres raíces**, y la mayor parte de su
> trabajo es decir **de quién es cada objeto, y qué flecha entre objetos está prohibida**.
>
> **Regla del plasma**: cero juicio automático. El sistema mide, transporta y escribe; donde hay
> que elegir hay una `SolicitudDecision` y un humano (§8). Los tres únicos agentes del negocio
> están en el borde y ninguno escribe: adornan, clasifican o resumen lo que otro ya calculó.

---

## 0 · Cómo se lee

```text
CLASE NombreDeLaCosa          [FORMA · pieza de la F2 · unidad]
  DATOS   lo que la clase sabe. Nada más.
  HACE    lo que puede hacer. Verbos, con entrada y salida.
  REGLA   lo que NO puede hacer, o el test que la sostiene. Es la parte que se defiende.
```

Convenciones:

- **La unidad va pegada a la pieza**: `P` plaza · `N` nacional · `T` tienda. Una clase marcada
  `P` **se instancia una vez por plaza**; una `T`, **una vez por tienda**; una `N`, **una sola vez
  en todo Bocaos, y puede no existir** (§1.5).
- **`NO_CONSTA`** es un valor, no un error: *el dato no está y no se estima*. Es distinto de
  **`NO_HAY`** (*no existe tal cosa*) y de **`0`** (*existe y vale cero*). Confundir los tres es la
  forma más rápida de inventar un mercado.
- **`[ABIERTO Qnn]`** remite a una de las 56 preguntas de la F2. **`[ABIERTO Qnn·F3]`** es una
  pregunta que **destapa este diseño**. Las que la F0 ya cerró van marcadas **`[CERRADA · F0]`**
  con la frase que las cierra, porque un cierre sin cita se convierte en costumbre.
- Los nombres están en castellano y en singular: son **cosas del negocio**, no tipos del lenguaje.
  `Propuesta`, `ContratoPuntual`, `Cargo` y `Deuda` son cuatro cosas distintas y el diseño las
  mantiene distintas a propósito.
- **"Instalación"** es la palabra que este documento usa para lo que la F0 llama *despliegue*: una
  plaza viva, con su almacén y sus objetos. No describe cómo se pone en marcha nada; describe que
  **hay N copias del mismo plano, y que ninguna sabe de las otras**.

---

## 1 · Las tres unidades, como tres objetos raíz

### 1.1 · El mapa

```text
                        ┌──────────────────────────────┐
                        │  NACIONAL        (0 ó 1)     │
                        │  el registro                 │
                        │  padrón · censo · índice     │
                        │  marca B2B · licencias       │
                        │  permisos · traza · suma     │
                        └──────────────────────────────┘
                            ▲  4 hechos publicados
                            │                    │  2 avisos (version.nueva · plaza.suspendida)
        ┌───────────────────┴───────┐            ▼
        │  PLAZA        (1 … N)     │◄───────────┘
        │  el mercado              │
        │  censos · reglas · pedidos│
        │  propuestas · ruta · dinero│
        └──────────────────────────┘
                    │ contiene
                    ▼
        ┌──────────────────────────┐
        │  PROYECTO DE TIENDA (N)  │
        │  el negocio de alguien   │
        │  marca · carta · cliente │
        │  carrito · precio · cocina│
        └──────────────────────────┘
```

La frase que ordena el diseño, y que se puede comprobar en el grafo de §1.3:

> **Todo lo que DECIDE ocurre en la plaza. Todo lo que REGISTRA ocurre en el nacional. Todo lo que
> ACTÚA ocurre en la tienda.**

No es una preferencia de organización. Es la razón por la que el nacional **no puede** ordenar el
mercado: no tiene el hecho ni la foto del instante, así que no tiene con qué decidir. La renuncia
de la F0 §6 ("no hay cerebro central") deja de ser una decisión de producto y pasa a ser una
**imposibilidad de estructura**. Eso es lo que hace sólida la federación — y es lo único que este
documento tiene que proteger cuando alguien pida "un poquito más de detalle".

### 1.2 · Qué posee cada una

**`Nacional`** — nueve atributos, y ninguno es un pedido:

```text
CLASE Nacional                                   [raíz · N · 0 ó 1 instancia]
  DATOS  padrón [ plaza ]           ·  buzón de hechos publicados
         índice buscable            ·  marca B2B y sus licencias
         permisos vivos             ·  traza de accesos
         consolidación por periodo  ·  canon por plaza (encendido por decisión C)
         versión propia
  HACE   anotar( hecho publicado ) → Registrado | RECHAZADO(forma desconocida)
         buscar( localidad, nombre ) → [ ResultadoConSuPlaza ]
         consolidar( periodo ) → Suma
         emitirDocumentoDeCanon( plaza, periodo ) → Documento | NO_CONSTA
  REGLA  No tiene pedidos, ni líneas, ni importes, ni direcciones, ni posiciones, ni cartas, ni
         carritos, ni riders. No es una lista de lo que le falta: es la lista de lo que **no puede
         llegar a tener**, y por eso el buzón sólo acepta cuatro formas de hecho (§1.3).
  REGLA  No tiene ninguna referencia a un objeto `Plaza`. Su buzón es una puerta, no un puntero.
         Si tuviera un puntero, apagarlo sería una condición de funcionamiento — y entonces no
         sería un registro, sería una sede.
```

**`Plaza`** — la máquina donde viven los proyectos:

```text
CLASE Plaza                                      [raíz · P · 1 instancia por instalación]
  DATOS  censo de tiendas [ ProyectoDeTienda ]  ·  censo de riders [ Rider ]
         registro de pedidos                   ·  propuestas y contratos puntuales
         ruta viva                             ·  tarifa (oferta, incentivo, precio)
         hechos de reparto y cargos            ·  devengos y ciclos
         cola de la sala                       ·  config (umbrales por defecto, ventana, zona)
         acta de decisiones                    ·  términos aceptados
         frontera de cobertura                 ·  plaza_id
  HACE   acoger( proyecto de tienda ) → Censo      ·   proponer( hecho ) → Propuesta | Hueco
         aceptar / rechazar / caducar( propuesta ) ·  medir( contrato ) → Hechos
         devengar( periodo ) · cerrar( periodo )   ·  cobrar( documento )
         publicar( hechos hacia el nacional )      ·  avisar( a quien corresponda )
  REGLA  Es la única unidad que **decide**, y decide con un hecho, una foto y una política. No
         tiene marca de cliente, ni carta, ni carrito propios: los tiene cada proyecto, y la plaza
         no puede leerlos salvo por la puerta de §1.3.
  REGLA  **La plaza no es un proyecto.** Si le quitas sus N proyectos, sigue siendo una plaza:
         queda con censos, reglas, cola y dinero, y ningún escaparate. Si le quitas la plaza a un
         proyecto, el proyecto no existe: no hay mercado donde poner su pedido. La contención va
         en un solo sentido.
  REGLA  No tiene ninguna referencia a otra plaza. Ni una. Si dos plazas necesitan hablarse, lo
         hacen por un hecho declarado que pasa por el nacional, y ese hecho pierde todo lo que no
         sea "existe / está viva / cerró este periodo".
```

**`ProyectoDeTienda`** — el negocio de alguien, dentro de una plaza:

```text
CLASE ProyectoDeTienda                            [raíz · T · N instancias por plaza]
  DATOS  marca · catálogo y carta pública · carrito · clientes de la tienda
         radio de reparto · pedidos propios · panel · puntualidad · resumen · reclamaciones
         puerta a su plaza (anotar lo suyo · leer lo suyo)
  HACE   publicarCarta() · abrirCarrito() · cerrarCarrito() → Pedido
         declararListo( pedido, hora ) · subirIncentivo( pedido, céntimos )
         verPanel() · declararRadio( zona ) · reclamar( caso )
  REGLA  No tiene ninguna referencia a otra tienda, ni al nacional, ni al censo de riders. Su
         cliente no cruza: `RegistroClienteTienda` está indexado por (tienda, cliente) y no hay
         operación que devuelva los de al lado.
  REGLA  Su puerta a la plaza tiene dos verbos y ninguno más: **anotar un hecho suyo** y **leer lo
         suyo**. Los dos llevan `tienda_id`, y el filtro **lo pone la plaza**, no el que llama. Un
         proyecto no puede pedir "los pedidos de esta plaza"; puede pedir "mis pedidos", y la plaza
         le contesta con los suyos aunque haya pedido otra cosa.
```

### 1.3 · El grafo: cuatro flechas y cuatro prohibiciones

Esta tabla es la parte del diseño que se puede auditar sin leer una sola fórmula. Si aparece una
flecha que no está aquí, el corte está roto aunque todos los tests de §10 pasen.

| # | Flecha | Para qué | Qué NO puede llevar |
|---|---|---|---|
| 1 | **T → P** | anotar un hecho propio · leer lo propio | nada de otra tienda; nada del censo de riders |
| 2 | **P → T** | avisar (el pedido llegó, el rider viene) | ninguna orden: la plaza no abre ni cierra la cocina de nadie |
| 3 | **P → N** | publicar los **cuatro** hechos de §9.1 | pedido, línea, importe de comida, dirección, posición, carta, carrito, rider |
| 4 | **N → P** | `version.nueva` (un aviso) · `plaza.suspendida` (una orden de registro) | cualquier otra cosa. Y las dos son **ignorables**: si la plaza no las recibe, opera igual |

```text
PROHIBIDO, y cada una tiene su test en §10:
  P ↔ P′   ninguna plaza ve a otra. Ni datos, ni pedidos, ni riders, ni umbrales.
  T ↔ T′   ninguna tienda ve a otra. Ni clientes, ni ventas, ni carta.
  T ↔ N    una tienda no negocia con el nacional: su contrato es con su plaza (Q42).
  N → T    el nacional no avisa a una tienda. No tiene su dirección, ni su canal, ni su nombre
           más allá de una fila del censo.
```

**Por qué esto es más fuerte que una convención.** La auditoría 4 (§10) no se cumple porque nadie
se acuerde de no llamar al nacional: se cumple porque **no hay flecha**. Un objeto que no tiene
puntero a otro no puede necesitarlo. La disciplina de "no consultes al nacional desde la plaza" es
una regla; la ausencia de puntero es una propiedad.

### 1.4 · La plaza no es un proyecto — la prueba, y lo que se cae con ella

La F2 dejó esto como Q55 ("¿una plaza es un proyecto con N tiendas, o una instalación con N
proyectos?") y avisó de que la FASE 3 no podía empezar sin respuesta. **La F0 §7 la contesta, y esta
versión la implementa**: `una PLAZA = una instalación viva · dentro, N PROYECTOS (uno por tienda)`.

```text
QUÉ SE CAE SI LA PLAZA FUERA "UN PROYECTO CON N TIENDAS DENTRO"
  · el escaparate tendría un dueño común — y el cliente del restaurante sería del mercado (par 4)
  · el carrito sería del mercado, y un carrito compartido es una cuenta, y una cuenta es una app
  · la liquidación tendría un solo contratante, y entonces el tramo 1 lo cobraría el de arriba (Q42)
  · borrar una tienda sería editar un proyecto; aquí es **quitar un objeto** del censo, y sus
    clientes se van con él sin tocar a nadie
```

Y al revés, lo que se cae si la plaza fuera "un proyecto":

```text
  · no habría sitio donde poner los cuatro números (son del proyecto, con default de la plaza, §1.7)
  · no habría quién propone: la propuesta necesita la foto de TODOS los riders de la zona
  · no habría cola, ni acta, ni censo: cada tienda sería su propio mercado y el rider tendría N
    mercados de un cliente cada uno
```

**Las dos cosas son verdad a la vez y no se contradicen**: la plaza es la instalación, la tienda es
el proyecto. Lo que la F2 no podía ver es que "proyecto" se decía de dos cosas distintas, y que la
palabra estaba haciendo dos trabajos.

### 1.5 · Cuántos objetos hay (esto es lo que significa "el mismo plano, N instalaciones")

| Unidad | Clases | Instancias | Total con 1 plaza de 1 tienda / 3 plazas × 40 tiendas |
|---|---|---|---|
| **Nacional** | 25 (+1 condicionada) | 0 ó 1 en todo Bocaos | 0 / 1 |
| **Plaza** | 103 | una por plaza | 103 / 309 |
| **Tienda** | 16 | una por tienda, dentro de su plaza | 16 / 1.920 |

```text
una plaza con 40 tiendas  =  103 objetos de plaza  +  40 × 16 = 640 objetos de tienda
tres plazas              =  309 objetos de plaza   +  1.920 objetos de tienda  +  1 nacional
```

**La consecuencia práctica, y es la que hay que decir en voz alta**: un fallo en los 103 objetos de
una plaza **no toca a las otras dos**, y no porque estén aislados por pericia, sino porque no hay
una sola línea que los una. Y el nacional, con 25 objetos para tres plazas, no puede crecer "solo un
poco" sin dejar de ser lo que es: **25 objetos no dan para una sede**.

### 1.6 · El nacional no existe con una sola plaza — decisión C

Esto no es un modo de funcionamiento: es un **estado del mundo**. Con una plaza, el nacional no está
apagado: **no ha nacido**.

```text
CLASE RegistroDePlazas                            [R01 · N · CUSTODIO]
  REGLA  No se puede abrir un padrón con menos de dos plazas. Con una, el padrón es una tabla con
         una fila y un coste que no compra nada; peor: **crea la tentación de meterle cosas dentro**.
  REGLA  La primera plaza no está "sin registrar": está **sin registro**. Se declara a sí misma en
         su acta de constitución y se busca en su propio índice (Q60·F3: quién escribe esa primera
         línea, y con qué acto).
  REGLA  El nacional **nace por aritmética, no por decisión**: cuando la segunda plaza pasa a
         `operando`, el registro se abre y adopta la primera. Nadie "lanza el nacional"; alguien
         abre una plaza y el nacional aparece como consecuencia.
  REGLA  El día que nace, se enciende `CanonDePlaza`: cada plaza le paga un porcentaje de su fee.
         El porcentaje es Q41; la existencia del canon es decisión C. Con una sola plaza, el canon
         **no tiene sujeto pasivo**: no hay a quién cobrarle ni con qué justificarlo.
```

Y la asimetría que esto produce, que conviene tener escrita antes de que sorprenda: **la primera
plaza es la única que nunca paga canon y la única que no tiene registro**. Si esa plaza crece y
nunca se abre una segunda, Bocaos es un negocio de un solo mercado con un registro que no existe.
Eso es exactamente lo que la decisión C elige, y el diseño no lo disimula.

### 1.7 · Los umbrales: dos capas y una precedencia `[CERRADA · F0]`

La F2 leyó que **los cuatro números son de la plaza y la tienda no legisla** (Q1 · Q43), y escribió
una razón buena: si cada tienda tuviera sus umbrales, el rider tendría N juegos de reglas para el
mismo trabajo y el mercado sería N mercados dentro de un mercado. La F0 §7 dice lo contrario, con
otros dos renglones:

> "los umbrales son **del proyecto** (cada tienda ajusta los suyos), con un **default que fija la
> plaza**. Así una tienda nueva arranca con los números del barrio sin configurar nada."

**Esta versión implementa la F0, y lo hace sin romper la razón de la F2.** La forma es una
precedencia, no una negociación:

```text
POLÍTICA DE UN PEDIDO  =  declaración de la TIENDA, si existe y está vigente
                          si no, la de la PLAZA (su default)
```

```text
CLASE ConfigUmbrales                              [J01 · P · CUSTODIO]
  DATOS  ámbito (plaza | tienda) · los cuatro números · el orden · vigencia desde · autor
  HACE   declarar( ámbito, valores, autor, desde ) → Política
         vigente( ámbito, instante ) → Política | NO_CONSTA
  REGLA  La forma la fija la vertical y no se toca: **cuatro** números, en m · min · min · c€, en
         AND. Ni uno más, ni ponderado, ni con un quinto criterio "de contexto".
  REGLA  Una declaración de tienda **sólo puede** fijar esos cuatro números. No puede añadir un
         criterio, ni mirar datos del rider, ni aplicar a pedidos de otra tienda. Si lo intenta, no
         se escribe: el objeto no tiene dónde ponerlo.
  REGLA  Cambiar los números exige autor y vigencia; ninguna declaración rige hacia atrás. Una
         propuesta viva conserva la versión con la que se emitió (J04), aunque su autor la cambie
         un segundo después.
  REGLA  Una tienda **no puede** declarar umbrales para los pedidos de otra, ni la plaza para los
         de una tienda que ya declaró. La plaza sólo mueve su default, y su default sólo rige donde
         no hay declaración.
```

La consecuencia que hay que aceptar, y que en la v1 no existía: **una tienda puede hacer su mercado
más difícil o más fácil para los riders**. Si declara 2.000 m de desvío, recibirá propuestas que
otra no recibiría, y el rider que las acepte hará viajes peores para sus pedidos. El diseño tiene
tres protecciones y ninguna es una prohibición: el rider ve **cuánto** y **de quién** es el umbral
(M05), puede rechazar sin coste (A21/A22), y la promesa de los pedidos que ya lleva no se puede
romper (A31). Lo que el diseño **no** hace es impedírselo: sería la plaza legislando por la tienda,
que es justo lo que la F0 §7 no quiere.

> **Q1 · Q43 quedan cerradas así por la F0 §7, y la lectura de la F2 queda como la que se descarta.**
> Lo que **no** queda cerrado, y este diseño lo destapa, es Q59·F3: cuando el umbral que juzgó una
> propuesta es el de la tienda y no el de la plaza, **¿quién responde de la explicación?** El
> diseño garantiza que la frase diga la capa y el autor (A16); no puede decidir de quién es la
> responsabilidad.

### 1.8 · El enlace entre tiendas es intra-plaza `[CERRADA · F0]`

La F2 cerró Q31 a medias ("sí, y siempre dentro de la misma plaza") y dejó abierta la frontera
(Q52). El diseño implementa la parte cerrada y **no** la abierta:

```text
A06 · RutaConParada  puede insertar una parada de OTRA tienda
     si y sólo si  plaza_id(parada) == plaza_id(pedido) == plaza_id(rider)      → A35
```

Y de ahí sale una consecuencia que no es obvia y que hay que escribir: **la tienda no controla con
quién comparte viaje su pedido; controla su promesa.** El trayecto es del rider, la parada se
inserta en su ruta, y lo único que protege al cliente de la tienda A es que la promesa que se le dio
no empeore más allá del umbral (A31). Si la tienda pudiera vetar el enlace, tendría un derecho de
contrapeso sobre el trabajo de un autónomo — y eso es exactamente la relación que este negocio no
quiere tener.

Lo que sigue abierto es Q52 (un pedido de la plaza A con dirección de la plaza B, y el desempate
cuando dos coberturas se solapan). `S01 FronteraDePlaza` devuelve `NO_CONSTA` cuando el desempate no
está declarado, y entonces **no hay pedido**: no se estima a qué plaza pertenece una dirección.

---

## 2 · El corte, en números y en verbos

| | NACIONAL | PLAZA | TIENDA |
|---|---|---|---|
| **hojas** | 25 (17 %) | 103 (72 %) | 16 (11 %) |
| **qué contiene** | registro · censo · versiones · buscador · marca B2B · licencias · soporte · consolidación · 4 guardas | toda la cadena de propuesta · ruta viva · registro de pedidos · tarifa · reparto · fallos · liquidación · sala · config · riders · jefe y trabajador | escaparate · carta · precio · carrito · cliente · radio · captura · hora de listo · cocina visible · aviso · incentivo · panel · puntualidad · resumen · reclamación |
| **verbo propio** | **registrar** | **decidir, medir, cobrar** | **actuar y firmar** |
| **puede** | anotar, buscar, sumar, avisar, licenciar | proponer, aceptar, medir, adjudicar, devengar, cobrar | publicar, pedir, declarar listo, subir incentivo, reclamar |
| **no puede** | ver un pedido · cobrar (salvo canon) · sancionar · ordenar · entender nada (0 conversores, 0 agentes) | tener marca de cliente · tener carta · hablar con otra plaza | ver a otra tienda · ver al nacional · tener riders · fijar la ventana |

**La proporción es el argumento.** Con el 72 % de las piezas dentro de la plaza y el 17 % arriba,
centralizar exige reescribir medio árbol. Eso es lo que la F0 §7 quiere: **que centralizarse cueste
caro**.

### 2.1 · Lo que el corte le hace al diseño de la v1

No es una lista de cambios cosméticos: cada uno mueve clases.

```text
1 · LA CADENA ENTERA (35 hojas, grupo A) pasa a instanciarse POR PLAZA. En la v1 estaba "en el
    mercado", que era uno. Ahora hay N cadenas, y ninguna comparte una foto.

2 · EL DINERO SE PARTE EN DOS NIVELES. La v1 tenía una cuota y un cobro. Ahora: la plaza devenga,
    cierra, factura y cobra lo suyo (H); el nacional **suma** devengos cerrados (R14) y, si hay dos
    plazas, emite un documento de canon (R26). Dos niveles, dos documentos, ningún dinero ajeno.

3 · `ConfigUmbrales` gana una segunda capa (tienda) y `VersiónEfectiva` gana una precedencia (§1.7).
    La v1 tenía un solo juego de números y una sola pregunta ("¿de quién son?").

4 · `SolicitudDecision` gana ÁMBITO: hay tres dueños y ninguno decide fuera del suyo. Un dueño de
    federación con un botón para cambiar un umbral de Málaga ha convertido el registro en una sede.

5 · LA CARTERA, EL ALTA Y LA HISTORIA DEL RIDER SON POR PLAZA. La v1 tenía una cartera. Ahora un
    rider con dos plazas tiene dos altas, dos carteras y dos historias — y un solo cuerpo (§7.9).

6 · EL ESCAPARATE GANA DOS PIEZAS: `S01 FronteraDePlaza` y `S02 FiltroPorCobertura`. La v1 tenía un
    índice sin geografía. Ahora "no existe la tienda que no llega" es una propiedad del índice.

7 · APARECE UN NACIONAL QUE NO ORDENA. Índice, buscador, enrutado, marca B2B, licencia, soporte,
    consolidación y tres guardas. Cero conversores, cero agentes: **un registro que empieza a
    transformar cosas empieza a decidir**.

8 · EL ARRANQUE CAMBIA DE FORMA. Hay un camino que la v1 no tenía: **una plaza sola, sin nacional**,
    que es el estado por defecto del negocio y el que hay que poder probar primero (§7.6, §7.10).
```

---

## 3 · Objetivo del sistema

**El sistema existe para hacer una pregunta miles de veces al día, siempre igual: ¿a quién le
propongo este pedido, ahora, y con qué cuatro números se lo explico?** — y para hacerla **dentro de
una plaza**, con los riders de esa plaza, las reglas de esa plaza y el dinero de esa plaza.

Todo lo demás —el escaparate, el precio, los relojes, la prueba, la cuota, el registro— está al
servicio de que esa pregunta se pueda hacer **con datos**, **sin inventar** y **sin que nadie pueda
ordenarla desde arriba**.

```text
LO QUE HACE
  · deja que cada tienda publique su carta y su marca, y que su cliente pida en su web
  · convierte "está listo" en un hecho con hora
  · mide, para cada rider de ESTA plaza que ya está en la calle, cuatro números sobre SU trayecto
  · propone a UNO, con esos números, una frase que los explique y una ventana finita
  · registra el sí, el no o el silencio, y con el sí crea un contrato puntual
  · mide el reparto hasta la prueba de entrega
  · cobra la espera cuando se pasa de lo declarado, con evidencia
  · acumula la cuota y la cobra cada semana, por plaza, sin tocar el ticket ni el reparto
  · registra qué plazas existen, con qué versión y con qué tiendas — y **nada más**

CUÁNDO INTERRUMPE A UN HUMANO  (y sólo entonces; y cada uno en su ámbito, §8)
  · al dueño de la plaza: cambiar el default de los cuatro números, la ventana o la zona
  · al dueño de la tienda: declarar sus propios umbrales, subir su incentivo, abrir o cerrar
  · al dueño de la federación: abrir o cerrar una plaza, retirar una marca, conceder un acceso
  · a la sala: un pedido sin nadie, una disputa, un alta incompleta, una revisión pedida
  · a la parte: pagar o no una subida de oferta; aceptar o no un cargo

CUÁNDO NO INTERRUMPE, PORQUE NO PUEDE
  · nunca para decidir a quién se propone un pedido
  · nunca para asignar un reparto
  · nunca para juzgar un fallo
  · nunca para elegir qué ve el cliente
  · nunca para decidir en una plaza desde arriba
```

**La unidad del sistema no es el pedido: es la propuesta aceptada.** Un pedido que no encuentra a
nadie es una venta que no existió, y el diseño tiene que poder contarla (A34). Y la unidad **del
registro** tampoco es el pedido: es la plaza. Un nacional que contara pedidos sería un mercado con
un cuadro de mando.

---

## 4 · El corazón: la propuesta como función

Todo el negocio se juega en que esto sea **una función y no un estado**. Se escribe una vez, con
la capa de umbrales resuelta, y se lee como una firma:

```text
PROPUESTA = F( hecho: HechoPedidoListo, foto: FotoDelInstante, política: PolíticaResuelta )
         →  Propuesta  |  Hueco  |  NINGUNA

F(hecho, foto, política):

   // la política ya viene resuelta: umbrales de la tienda si los declaró, si no los de la plaza
   C ← CandidatosElegibles.de(foto)            // sólo estado, zona y capacidad DECLARADOS

   si C está vacío:
        → HuecoDeMedida.nombrar(«nadie declarado disponible en esta plaza»)

   para cada c ∈ C, en el orden que declara la política:            [ABIERTO Q7]

        m ← { desvío  : MedidaDesvío.medir( RutaBase.de(c,foto), RutaConParada.de(c,hecho,foto) )
              espera  : MedidaEspera.medir( c, foto, hecho.hora_listo )
              retraso : AgregadoDelRetraso.agregar( RetrasoPorParada.medir(…) )
              cobra   : MedidaCobra.medir( hecho.precio, desvío, espera, coste_declarado(c) ) }

        si algún m = NO_CONSTA:
              → HuecoDeMedida.nombrar(c, m.faltantes);  siguiente
        si no ReglaDeEnlace.pasa(m, política) = no:
              siguiente                                        // cuatro tests, AND
        devolver PropuestaEmitida.emitir( hecho, c, m, Huella(foto), política )

   devolver NINGUNA                                           // no decide: escala (§7.1⑧)
```

Cinco propiedades que se sostienen solas y que el diseño entero protege:

```text
1 · PURA         Dentro de F nadie lee el mundo. Todo lo que F sabe está en la foto. Si F consultara
                 algo vivo, la explicación que se dio dejaría de ser cierta un segundo después — y
                 con ella el derecho a saber por qué (A16, A17).

2 · REPRODUCIBLE mismo hecho + misma foto + misma política → misma propuesta, mismos cuatro números.
                 Se puede volver a ejecutar meses después y comparar (A29).

3 · LOCAL        La entrada es UN hecho. No hay una lista de pedidos, ni un barrido, ni una
                 re-optimización del día. Es lo que hace el mercado no ordenable (A28).

4 · DE UNA PLAZA El hecho, la foto, los candidatos y la política son de la misma plaza. Un pedido
                 no puede enlazarse con un rider de otra, ni con los umbrales de otra (A35).

5 · TERMINA EN   El sí lo pone el rider. F no puede terminar en un contrato: termina en una
   UNA PREGUNTA  propuesta con ventana. La única puerta al contrato es A19 (A27).
```

### 4.1 · Los únicos números del documento (y de quién es cada uno)

En la v1 esta sección eran "cinco supuestos del dueño" y se usaban para poder dibujar. Aquí se
degrada a lo que de verdad son: **valores de ejemplo, aislados en tablas de valores**. Ninguna
fórmula los lleva dentro, y el diseño no los necesita ciertos.

| qué | valor de ejemplo | de dónde sale | estado |
|---|---|---|---|
| los cuatro umbrales | 800 m · 4 min · 6 min · > 0 c€ | F0 §6 | **de la plaza o de la tienda, y los números son Q1** |
| la ventana de una propuesta | ~20 s por pedido | F0 §6, cerrado | **[CERRADA · F0]**; cuántos candidatos caben dentro es **Q6** |
| los tramos | 39 / 79 / 149 € al mes · 10 c€/pedido al rider · 20 c€/pedido a la tienda | F2, de pizzepos | **PROVISIONAL · Q14** |
| el canon del nacional | un % del fee de cada plaza | decisión C | **existe con 2 plazas; el coeficiente es Q41** |
| la traza de posición | se conserva lo que diga la política | F0: 90 días | **[CERRADA · F0]** para la posición; el resto es Q38 |
| la cobertura | existe, se declara y filtra | F0 §7 r.1 | la forma (polígono, radio, códigos) es **Q** abierta |

**Lo que este documento no tiene, y es lo que lo hace honesto**: ni un número propio. Todos los de
la tabla están en una clase de valores con autor y vigencia, y todos se pueden cambiar sin tocar una
línea de lógica.

### 4.2 · El hueco más caro: `cobra`

El cuarto test es el único que protege al rider de verdad, y es el único que no se puede escribir
todavía. `cobra` puede significar dos cosas y ninguna está decidida (Q2):

```text
BRUTO   lo que el pedido paga por el reparto                    → se lee de E03, siempre consta
NETO    eso menos lo que le cuesta el desvío y la espera         → exige un coste que nadie declaró
```

Y el coste no está en ningún sitio: cuánto le cuesta a un rider un kilómetro de más y un minuto
parado es un dato suyo, y sólo hay tres formas de tenerlo —que lo declare él, que lo declare la
política para todos, o que se deduzca de su historial— y la tercera es una nota con otro nombre
(A22). **[ABIERTO Q2 · Q57·F3]**

**La consecuencia, escrita para que no se descubra en producción**: con `cobra` neto y sin coste
declarado, `MedidaCobra` devuelve `NO_CONSTA`, el cuarto test no se puede aplicar, y **el mercado no
propone ni un pedido** — con una cadena perfectamente determinista y miles de huecos bien nombrados.
El diseño no rellena ese hueco con una estimación. Si el dueño elige bruto, el mercado funciona y el
cuarto umbral casi no filtra; si elige neto, hay que declarar el coste antes del primer pedido.
**No es una decisión de diseño: es la factura de haber elegido proteger al rider.**

### 4.3 · Lo que este diseño no supone (y la v1 sí)

La v1 se dibujó con cinco respuestas provisionales del dueño, y una de ellas —"se propone primero al
que mejor puntúa"— abría una tensión que había que encerrar con cuatro reglas (T1). Esa tensión no
se ha ido: sigue aquí (A22/A25, §10). Lo que ha cambiado es que **este diseño no necesita la
respuesta**:

```text
Q6  ¿en serie o en paralelo?     El diseño fija la VENTANA total (~20 s, cerrado) y deja el reparto
                                 interno como configuración. En serie: A25 avanza al agotar el
                                 reloj. En paralelo: se emiten varias y A33 (una viva por pedido)
                                 se pone roja a propósito, porque en paralelo el que acepta es el
                                 que estaba mirando el móvil. Las dos formas caben; ninguna se elige.

Q7  ¿en qué orden?               La forma está cerrada: determinista, escrita, pública, sin datos del
                                 rider. Los valores no: puede ser "el más cerca", "el que menos
                                 espera", "el que menos retraso añade". `OrdenDeclarado` los recibe;
                                 si no hay valor, no hay propuesta. Y si el orden se convierte en un
                                 número único que FILTRA, hay scorer y se caen A22 y A28 a la vez.

Q2  ¿cobra bruto o neto?         §4.2. El diseño lleva las dos formas y no elige.
```

---

## 5 · Entidades y clases

**Una clase por cada pieza del árbol de la F2. 144 piezas → 144 clases**, más tres contenedores-raíz
(§1.2) y tres piezas que no tienen clase porque no se sabe si existen (K03, M06 — y R26, que la
decisión C enciende en una sola de sus dos formas). Cada clase conserva la **forma** que le dio la
disección —CUSTODIO (escribe y es el único dueño de lo que escribe), REFLEJO (calcula y no escribe),
PUENTE (cruza al vecino), CONVERSOR (cambia de forma), AGENTE (transforma lenguaje, en el borde)—
porque la forma **es** la regla: un reflejo que empieza a escribir deja de ser un reflejo. (La F2
llama **FUZZY** a la quinta forma y este documento la llama **AGENTE**: es la misma —la única que
transforma lenguaje, y la única que sólo existe en el borde.)

El orden es el de la F2, y cada grupo lleva su unidad pegada. Los tres grupos marcados **N** se
instancian una sola vez en todo Bocaos, y pueden no existir.

### 5.1 · NACIONAL — el registro · 25 clases

> Once custodios (lo que se guarda), once reflejos (lo que se proyecta y lo que se prohíbe), tres
> puentes (poner en marcha, enrutar, sostener). **Cero conversores, cero agentes.** El nacional no
> transforma nada: guarda, suma y avisa. Un registro que empieza a "entender" cosas es un registro
> que empieza a decidir.

**R01 · `RegistroDePlazas`** — CUSTODIO · **N**
```text
DATOS  [ plaza ] { id · localidad · estado · versión · fecha de alta · responsable } · plaza_id
HACE   anotar( plaza ) → Padrón | YA_EXISTE   ·   de( id ) → Plaza | NO_HAY   ·   vivas() → [ plaza ]
REGLA  No se abre con menos de dos plazas (decisión C). Con una, el padrón sería una fila y un
       coste; y sobre todo, sería la invitación a meterle cosas dentro.
REGLA  Una plaza cerrada NO se borra: queda con estado `cerrada` para siempre, porque el pasado hay
       que poder liquidarlo (Q47). Un padrón que olvida no sirve para cobrar lo que ya pasó.
REGLA  Siete campos y ni uno más. Ni carta, ni precios, ni dirección fiscal, ni número de tiendas
       con nombre (eso es el censo, R05, y tiene su propia lista cerrada).
```

**R02 · `AltaDePlaza`** — CUSTODIO · **N**
```text
DATOS  localidad · responsable · versión inicial · fecha · [acta de constitución]
HACE   abrir( localidad, responsable, versión ) → Acta | SIN_RESPONSABLE
REGLA  Abrir una plaza es un ACTO con fecha y con nombre, no un formulario que alguien rellena. La
       primera plaza escribe además su acta de constitución: es la única que se declara a sí misma,
       porque todavía no hay registro que la declare (Q60·F3).
REGLA  Abrir una plaza no migra nada: no toca a las demás, no comparte un solo dato con ellas, y no
       exige que actualicen nada. Abrir es poner en marcha, no mudar.
REGLA  Quién puede abrir es Q50 — y decide si esto es una empresa con instalaciones, una franquicia
       o una cooperativa. El diseño garantiza que hay un responsable con nombre; no decide quién.
```

**R03 · `EstadoDePlaza`** — CUSTODIO · **N**
```text
DATOS  estado ∈ { naciendo · operando · en pausa · cerrada } · [hecho con hora] · motivo
HACE   transitar( plaza, estado, hecho ) → Estado | TRANSICIÓN_NO_PERMITIDA
REGLA  Cuatro estados y una tabla cerrada de transiciones. `cerrada` no vuelve; `en pausa` sí. La
       quinta transición que alguien pida será un estado nuevo, no un `if`.
REGLA  Ningún estado sin hecho con hora. Y **declarar caída una plaza no la apaga**: la plaza sigue
       repartiendo aunque el registro la crea caída. El estado es lo que el registro cree, no lo que
       la plaza hace — y esa diferencia es la que salva la auditoría 4.
```

**R04 · `SilencioDePlaza`** — REFLEJO · **N**
```text
DATOS  último `plaza.viva` recibido por plaza · umbral de silencio (configuración DEL REGISTRO)
HACE   medir( plaza, ahora ) → { sin_hablar: minutos , excedido: sí/no } | NO_CONSTA
REGLA  Es un umbral y un reloj: no es la máquina de estados (R03), la alimenta. Sin esta clase, la
       plaza se declararía caída por impresión.
REGLA  El umbral de silencio es una de las dos configuraciones que el nacional tiene derecho a
       tener (la otra es su propia versión). No puede tocar ninguna de la plaza.
```

**R05 · `CensoDeTiendas`** — CUSTODIO · **N**
```text
DATOS  [ tienda ] { id · nombre · estado · plaza_id } · hora de la última publicación
HACE   anotar( tienda publicada ) → Censo   ·   de( plaza ) → [ tienda ]   ·   marcarBaja( tienda )
REGLA  Es una COPIA, no una consulta: se alimenta de lo que la plaza publica y **nunca** pregunta a
       la plaza. Si preguntara, tendría la puerta de atrás a su mercado.
REGLA  Cuatro campos: id, nombre, estado, plaza. No su carta, no sus precios, no su dirección, no su
       volumen. Es la línea exacta entre un registro y un directorio (Q54).
REGLA  Una tienda de baja se marca, no se borra: su nombre en el índice del mes pasado tiene que
       seguir teniendo explicación.
```

**R06 · `VersionDePlaza`** — CUSTODIO · **N**
```text
DATOS  plaza_id · versión declarada · hora en que la declaró
HACE   anotar( plaza, versión ) → Versión   ·   de( plaza ) → Versión | NO_CONSTA
REGLA  La declara la plaza al publicar `plaza.viva`. El nacional la guarda; **no la impone**.
REGLA  Es lo que permite que la federación sea "el mismo plano, N instalaciones" sin convertirse en
       "una actualización, N rehenes".
```

**R07 · `PuestaEnMarchaDePlaza`** — PUENTE · **N**
```text
DATOS  plaza · versión objetivo · responsable · hora
HACE   ponerEnMarcha( plaza, versión ) → Intento | NO_HAY_PLAZA
REGLA  Es un acto que cruza hacia otro sitio y **no decide por él**: pide que la plaza arranque,
       no la configura, no la siembra de datos, no le toca el mercado.
REGLA  Es la única operación del nacional que "entra" en una plaza, y entra por el arranque, no por
       los datos. Si necesitara entrar por los datos, ya no sería esta clase: sería R19/R21.
```

**R08 · `VerificaciónDePuestaEnMarcha`** — REFLEJO · **N**
```text
DATOS  lo declarado (versión objetivo) · lo que la plaza responde (`plaza.viva` con su versión)
HACE   comprobar( plaza, tras_arrancar ) → correcta | DIFIERE(qué) | NO_CONSTA
REGLA  Compara lo declarado con lo esperado, y nada más: versión que dice tener, estado, número de
       tiendas vivas. Sin esto, poner en marcha es rezar.
REGLA  No puede mirar dentro para averiguar por qué difiere. Si difiere, lo dice y avisa (R18); el
       diagnóstico es del que tiene los datos.
```

**R09 · `CompatibilidadDeVersión`** — REFLEJO · **N**
```text
DATOS  tabla cerrada: [ versión de plaza → qué puede y qué no ]
HACE   permite( plaza, hecho_publicado ) → sí | no + motivo
REGLA  No es "¿funciona?", es **"¿qué puede hacer una plaza atrasada y qué no?"**. Una plaza
       atrasada que sigue operando es el estado deseado: no depender del registro para operar.
REGLA  Una plaza atrasada no puede recibir hechos nuevos del registro con campos que no conoce: se
       los salta y **lo declara**. Saltarse un aviso es correcto; improvisar con él, no.
```

**R10 · `ÍndiceNacional`** — REFLEJO · **N**
```text
DATOS  nada propio: se reescribe del padrón (R01) y del censo (R05)
HACE   reescribir( padrón, censo ) → Índice   ·   consultar( localidad, nombre ) → [ fila ]
REGLA  Proyecta, no guarda: lo que se busca no se almacena dos veces. Si el índice tuviera vida
       propia, habría dos verdades y la segunda estaría vieja.
REGLA  Su fila tiene cuatro campos: plaza, localidad, nombre de tienda, estado. Ni producto, ni
       precio, ni valoración, ni foto. **No hay dónde ponerlos.**
```

**R11 · `BuscadorNacional`** — REFLEJO · **N**
```text
HACE   buscar( localidad, nombre ) → [ ResultadoConSuPlaza ]
REGLA  Busca por **localidad y nombre de tienda**, y por nada más (Q48). Buscar por producto exige
       el catálogo, y el catálogo en el nacional es el marketplace.
REGLA  No puntúa, no recomienda, no ordena por conveniencia. El orden es el declarado (alfabético o
       por distancia a la localidad escrita), con desempate escrito. Un buscador que "ordena por
       relevancia" es un escaparate que elige.
REGLA  Si no encuentra nada, **no sugiere**: una sugerencia es una recomendación, y recomendar es
       tener demanda.
```

**R12 · `ResultadoConSuPlaza`** — REFLEJO · **N**
```text
DATOS  plaza_id · localidad · tienda_id · nombre · estado
HACE   componer( fila del índice ) → Resultado
REGLA  La forma del resultado **incluye su plaza**. No existe un resultado huérfano, porque sin
       plaza no hay a dónde enrutar y el nacional tendría que servir la página.
REGLA  Es una invariante de estructura, no una comprobación: no hay constructor de resultado sin
       plaza. Si alguien la añade, el tipo no compila — y aquí, la clase no lo permite.
```

**R13 · `EnrutadoAPlaza`** — PUENTE · **N**
```text
HACE   enrutar( resultado ) → Salida hacia la plaza de ese resultado
REGLA  El clic sale del nacional y entra en la plaza. El nacional **no sirve la página**: redirige.
       Es la diferencia entre un directorio y un marketplace, y está en una línea.
REGLA  No añade nada a la salida: ni marca, ni parámetro de seguimiento, ni "vienes de Bocaos". Lo
       que el cliente ve al llegar es de la tienda (K02).
```

**R14 · `ConsolidaciónNacional`** — REFLEJO · **N**
```text
DATOS  [ devengo cerrado por plaza y periodo ] — tal como lo publicó cada plaza
HACE   consolidar( periodo ) → { por_plaza[], total , definición_usada }
REGLA  Suma devengos **ya cerrados**. No convierte moneda, no compensa una plaza con otra, no
       prorratea, no cobra. Una plaza con saldo a favor no paga la deuda de otra: no hay netting.
REGLA  Cada cifra lleva dentro la definición con la que se calculó. Sin eso, el cuadro compara peras
       con manzanas y el jefe de la federación decide con basura (Q53 · Q56).
```

**R15 · `CuadroDeLaFederación`** — REFLEJO · **N**
```text
HACE   cuadro( periodo ) → { plazas vivas · versiones · aceptación por plaza · devengo consolidado ·
                             canon emitido vs pagado }
REGLA  Agregados **de plaza**, nunca de pedido. Lo que no tiene hechos aparece como HUECO, no como
       cero. La tentación de esta clase es pedir "un poquito más de detalle", y ese poquito es la
       puerta por la que se entra al §1.3 al revés.
REGLA  Publicarlo hacia las plazas es Q56: si se publica, el nacional es un espejo; si no, es un
       supervisor con información asimétrica. El diseño no elige y la clase no tiene el método.
```

**R16 · `MarcaNacional`** — CUSTODIO · **N**
```text
DATOS  nombre · signos · ámbito declarado (B2B) · titular
HACE   declarar( marca, ámbito )   ·   de( ) → Marca
REGLA  La marca del nacional es **B2B y nunca llega al cliente final**: ni al escaparate, ni al aviso,
       ni al rider cuando recibe una propuesta. K02 la prohíbe en cualquier comunicación al cliente.
REGLA  Ámbito declarado y cerrado. "Marca compartida" no significa "marca en todas partes": significa
       las cinco cosas del acta (R22) y ni una más.
```

**R17 · `LicenciaDeMarca`** — CUSTODIO · **N**
```text
DATOS  plaza · qué puede hacer con la marca (rótulo, dominio, papelería, nombre comercial) ·
       condiciones · desde · hasta · causa de retirada
HACE   conceder( plaza, alcance ) → Licencia   ·   vigente( plaza, instante ) → Licencia | NO_CONSTA
                                    ·   retirar( plaza, causa, hora )
REGLA  El activo (R16) y el permiso de uso son dos cosas con dos dueños: uno posee, otro usa. Sin la
       licencia, la marca no se puede poner en ningún sitio.
REGLA  Retirar la marca es el único castigo real del registro, y llega tarde: cuando se retira, el
       daño ya está hecho. Eso es la fricción 9 y no se resuelve aquí (§12).
```

**R18 · `SoporteNacional`** — PUENTE · **N**
```text
DATOS  [ caso de soporte ] { plaza · tipo (software | método) · hora · plazo }
HACE   abrir( plaza, caso )   ·   responder( caso, quién )   ·   escalar( caso )
REGLA  Nivel 2: software y método. **No opera pedidos.** Todo lo que sea "mira este pedido" pasa por
       R19/R21, con permiso de la plaza, plazo y traza (Q46).
REGLA  Si la plaza está caída no puede conceder permiso: eso exige un permiso de emergencia
       pre-concedido de alcance mínimo, y **no está declarado** (Q46). Sin él, el soporte hace lo
       que puede desde fuera — versión, arranque, configuración — y lo dice.
```

**R19 · `PermisoDePlaza`** — CUSTODIO · **N**
```text
DATOS  plaza_id · a quién · alcance (qué se puede ver) · desde · hasta · quién lo concedió
HACE   anotar( concesión de la plaza ) → Permiso | SIN_CONCESIÓN
REGLA  **La plaza concede; el nacional no se lo da a sí mismo.** No hay método para crearlo desde
       dentro: la clase sólo sabe anotar una concesión que llegó publicada. Si lo hubiera, el
       soporte se daría permiso solo y el §1.3 se caería en la primera avería.
REGLA  Alcance declarado y mínimo: una plaza, un motivo, un plazo. No hay permisos por defecto, ni
       "acceso de administrador", ni un rol permanente.
```

**R20 · `TrazaDeAcceso`** — CUSTODIO · **N**
```text
DATOS  plaza_id visitada · quién · cuándo · con qué permiso · qué se consultó (por nombre de cosa)
HACE   anotar( acceso ) → Traza   ·   de( plaza, periodo ) → [ acceso ]
REGLA  Append-only. Si se puede editar, no es una traza. Una corrección es otra línea que desmiente.
REGLA  La escribe el nacional porque registra **su propio acto**, y por eso lleva `plaza_id`: es la
       plaza visitada, por definición, y no una fila que cruza. El detalle de lo visto sigue en la
       plaza; aquí queda que se miró, quién y con qué permiso.
REGLA  La plaza puede leer **su** traza (es su dato). De ahí la pregunta abierta de la F2 —si debe
       escribirse en la plaza y publicarse hacia arriba— que este diseño no cierra: la deja escrita
       como traslado posible, sin mover la pieza.
```

**R21 · `AccesoDelegadoAPlaza`** — CUSTODIO · **N**
```text
DATOS  permiso vivo · alcance · vence · [qué se llevó a cabo]
HACE   abrir( permiso ) → Acceso   ·   usar( acceso, consulta ) → Consulta | VENCIDO
                                   ·   vencer( ahora ) → Cerrado
REGLA  El permiso **caduca solo**: es un permiso vivo con plazo, no un rol. Un acceso sin vencimiento
       es un rol permanente con otro nombre.
REGLA  Todo uso escribe en R20 antes de devolver nada. Si la traza no se puede escribir, no se
       consulta: el registro no puede mirar sin dejar rastro.
```

**R22 · `ActaDeFederación`** — CUSTODIO · **N**
```text
DATOS  plaza · las cinco cosas compartidas · versión de las reglas comunes · fecha · firma
HACE   asentar( plaza, aceptación ) → Acta   ·   de( plaza ) → Acta | NO_CONSTA
REGLA  Lista **cerrada**: marca, software, soporte, registro y consolidación. Cualquier sexta cosa
       es un cambio de naturaleza, no una función nueva — y exige otra acta, no otra línea.
REGLA  Si las plazas y el nacional son la misma persona jurídica, no hay acta: hay un manual de
       procedimiento (Q42 · Q50). El diseño prefiere el acta porque es lo que se puede auditar.
REGLA  Con datos personales de por medio, el acta es además el acuerdo de corresponsabilidad: quién
       responde de qué y cómo se atienden los derechos de quien aparece en un agregado (Q53).
```

**R23 · `GuardaSinCatálogoNacional`** — REFLEJO · **N**
```text
HACE   revisar( el almacén del nacional ) → conforme | FALLA
REGLA  Falla si existe una sola tabla, índice o campo con carta, precio, carrito, pedido, línea,
       dirección de entrega o posición. Se puede escribir como una consulta al almacén: si aparece
       la palabra, el test está rojo.
REGLA  No es una renuncia de producto: es también la línea que mantiene al nacional fuera del
       ámbito del comerciante que permite contratar (DSA art. 30). Un catálogo nacional no sería
       "más útil": sería otro negocio.
```

**R24 · `GuardaNoRecauda`** — REFLEJO · **N**
```text
HACE   recorrer( todos los caminos de dinero que salen del nacional ) → conforme | FALLA( camino )
REGLA  El único camino permitido es R26: un documento de canon **a una plaza**, sobre el fee que la
       plaza ya devengó. Todo lo demás falla: cobrar a una tienda, a un rider o al cliente; retener;
       adelantar; compensar entre plazas; pagar una subida de oferta.
REGLA  La prueba tiene que ser enumerable: si hay que "revisar el código" para saber si recauda,
       entonces recauda. Aquí hay una lista y un solo elemento.
```

**R25 · `GuardaFronteraDePlaza`** — REFLEJO · **N**
```text
HACE   revisar( cada fila del nacional ) → conforme | FALLA( fila, plaza_declarada, plaza_escritora )
REGLA  Toda fila lleva `plaza_id` y coincide con quién la escribió. En el nacional sólo hay tres
       clases que escriben con plaza_id ajeno —R05, R06 y R20— y las tres escriben **sobre** una
       plaza, no **desde** otra: la copia del censo, la versión declarada y el acceso cometido.
REGLA  Ninguna fila de una plaza puede aparecer en otra. Ni agregada, ni anonimizada, ni "solo para
       comparar". Un agregado por plaza es una fila de esa plaza.
```

**R26 · `CanonDePlaza`** — REFLEJO · **N** · *la pieza que la decisión C enciende*
```text
DATOS  coeficiente (Q41) · periodo · [devengo cerrado publicado por cada plaza]
HACE   calcular( devengo_cerrado, coeficiente ) → Céntimos | NO_CONSTA
       emitirDocumento( plaza, periodo ) → Documento
REGLA  Existe sólo desde la segunda plaza (decisión C) y sólo en su forma de **porcentaje del fee**.
       La forma de canon fijo que la F2 consideraba queda descartada: con una plaza no hay canon, y
       con dos el nacional ya tiene un trabajo medible (soporte, versiones, marca) que se paga por
       volumen.
REGLA  Calcula sobre lo que la plaza **ya publicó**, no sobre lo que la plaza tiene. Si el nacional
       calculara dentro del ciclo de la plaza, la plaza necesitaría al nacional para cerrar su
       semana — y se caería la auditoría 4 por un céntimo.
REGLA  **No recauda de terceros**: emite un documento a la plaza; la plaza lo paga por su canal como
       paga cualquier otra cosa. Si no paga, el único músculo del registro es sacarla del padrón.
REGLA  ¿Sobre lo devengado o sobre lo cobrado? **Q58·F3.** Sobre lo devengado, el nacional cobra
       aunque la plaza no cobre, y entonces tiene interés en que la plaza apriete a sus morosos —
       que es un interés sobre el mercado, aunque no un botón.
REGLA  Mientras el coeficiente no exista, el cuadro de la federación muestra "canon sin declarar" y
       no se emite ningún documento. Un canon inventado sería una cuota que nadie aceptó.
```

### 5.2 · PLAZA — el mercado · 103 clases

> Cincuenta y ocho reflejos, treinta y tres custodios, ocho puentes, dos conversores y **dos agentes**
> —los dos en el borde, ninguno en la cadena—. Aquí está el 72 % del negocio: la cadena entera de la
> propuesta, la ruta viva, el registro de pedidos, la tarifa, el reparto, los fallos, la
> liquidación, la sala, la configuración y los dos roles que operan el día.
>
> **Todas llevan `plaza_id` y lo sella la plaza, no el que llama.** Es la diferencia entre una
> convención y una propiedad: no existe constructor de fila sin sello, y el sello no se puede pasar
> como argumento.

#### A · PROPUESTA-ENLACE — el eslabón limitante (35 clases)

**A01 · `HechoPedidoListo`** — CUSTODIO · **P**
```text
DATOS  pedido · tienda · destino { punto, instrucciones } · hora_listo · precio_congelado ·
       coordenadas · plaza_id
HACE   anotar( declaración de la tienda ) → Hecho   ·   de( pedido ) → Hecho | NO_CONSTA
REGLA  Se escribe UNA vez. Si la tienda se equivocó, no se corrige: se anota un hecho nuevo que
       desmiente al anterior y el pedido se vuelve a medir con la hora buena. Las dos horas quedan,
       y las dos se ven.
REGLA  El dato viaja CON el hecho (local, destino, hora, precio, punto). Nadie va a buscarlo
       después: si hubiera que buscarlo, la foto se tomaría en otro instante que el declarado.
REGLA  Sin `precio_congelado` no hay hecho. Sin hecho no hay cadena. El pedido espera, y se nombra
       (A34) — no se estima el precio.
REGLA  `plaza_id` lo pone la plaza al anotar. La tienda no puede declarar un pedido de otra plaza:
       su puerta (T→P) sólo escribe en la suya.
```

**A02 · `ComposiciónDeLaVista`** — REFLEJO · **P**
```text
DATOS  nada. Es una función del instante.
HACE   componer( hecho, instante ) → Vista
         riders    ← EstadoRider.vigentes( plaza )              (I04)
         posición  ← PosiciónRider.última( rider )              (B01)
         paradas   ← ParadasPendientes.de( rider )              (B02)
         promesas  ← PromesaPorParada.de( parada )              (B03)
         capacidad ← CapacidadDeclarada.de( rider )             (B05)
         local     ← PuntualidadDeclarada.de( hecho.tienda )    (L03)
         política  ← VersiónEfectiva.en( instante, tienda )     (J04)   ← dos capas, §1.7
REGLA  No escribe nada: es una proyección de lo que otros ya escribieron. Si se guardara, habría
       dos verdades y una sería vieja.
REGLA  Un rider con un dato ausente ENTRA en la vista con su lista de faltantes. No se descarta
       aquí: descartar es decidir, y aquí no se decide (A04/A34).
REGLA  Sólo riders de ESTA plaza. La vista no es "los riders del mundo": es el censo de este
       mercado. Un rider que trabaja en la plaza de al lado no aparece, y no por olvido.
```

**A03 · `CongelaciónDeLaFoto`** — REFLEJO · **P**
```text
DATOS  la vista + hora de la foto + huella de su contenido
HACE   congelar( vista ) → Foto   ·   es_fresca( foto, ahora ) → sí | no | NO_CONSTA
REGLA  Una decisión lee UNA foto. La foto viaja dentro de la propuesta y se cita al explicarla: por
       eso la explicación sigue siendo cierta un minuto después.
REGLA  La frescura exigible es un número [ABIERTO Q37]. Si la foto envejeció más de lo que la
       política admite, el candidato no se mide: va a A34. No se estima una posición nueva.
```

**A04 · `CandidatosElegibles`** — REFLEJO · **P**
```text
DATOS  la foto.
HACE   elegibles() → [ rider ]
REGLA  Sólo tres datos, y los tres DECLARADOS por el rider: estado (disponible), zona, capacidad.
       Ni un cuarto. Ni histórico, ni antigüedad, ni cercanía previa.
REGLA  El que está en pausa no aparece. La pausa la puso él (I04). Esta clase no puede levantar una
       pausa ni preguntarle si sigue ahí.
REGLA  NINGUNA tasa de aceptación o rechazo es entrada de esta clase. Es el test A22, y aquí se
       cumple por construcción, no por cuidado.
REGLA  La capacidad efectiva es `min(volumen, tiempo, distancia)` — lo que declara que cabe, lo que
       le deja el reloj de sus promesas y lo que le deja la ruta que ya lleva. Es una fórmula de
       tres términos, no una pieza: un rider "con hueco" según su volumen puede no tenerlo según su
       reloj, y en la cena ese es el caso normal.
```

**A05 · `RutaBase`** — REFLEJO · **P**
```text
HACE   metros( rider, posición, paradas ) → metros | NO_CONSTA
REGLA  Suma de tramos de las paradas pendientes EN SU ORDEN, desde la posición actual. El orden lo
       pone B04; los metros, el puerto de ruta (§6). Aquí sólo se ordena y se suma.
REGLA  Si la posición no es fresca → NO_CONSTA. No hay "más o menos por aquí".
```

**A06 · `RutaConParada`** — REFLEJO · **P**
```text
HACE   metros_con( rider, parada_nueva ) → { metros , punto_de_inserción } | NO_CONSTA
REGLA  Inserta la parada nueva en el punto que menos añade **de esa ruta y de ninguna otra**.
       Optimizar dentro de un trayecto no es ordenar el mercado; optimizar entre trayectos sí, y
       está prohibido (A28).
REGLA  La parada nueva puede ser de OTRA tienda, y sólo si es de la misma plaza: `plaza_id` de la
       parada, del pedido y del rider son el mismo (A35). Es el enlace entre tiendas que la F0 §7
       deja cerrado, y es intra-plaza por construcción: no hay dos rutas que unir.
REGLA  Test: insertar una parada NUNCA acorta la ruta base. Si la acorta, el puerto de ruta está
       mintiendo, el desvío sale negativo, y un desvío negativo es una propuesta a un rider que no
       gana nada.
```

**A07 · `MedidaDesvío`** — REFLEJO · **P**
```text
HACE   medir( ruta_base, ruta_con_parada ) → metros ≥ 0 | NO_CONSTA
REGLA  Es una resta, y por eso es la medida más discutible del sistema: mide *de más*, no "cerca".
       Si cualquiera de las dos rutas no consta → NO_CONSTA.
REGLA  La unidad y el modo de cálculo son del puerto (línea recta, calle, con tráfico) y cambian el
       número: [ABIERTO Q37]. Cambiar el puerto cambia cuántos pasan el umbral, y eso es política,
       no detalle.
```

**A08 · `MedidaEspera`** — REFLEJO · **P**
```text
HACE   medir( rider, foto, hora_listo ) → minutos ≥ 0 | NO_CONSTA
REGLA  Minutos que esperaría si llega antes de que esté listo. Es una resta de dos horas CON HORA.
       No es una predicción de cocina: la cocina declaró, no se adivina.
REGLA  Si llega después de listo → 0, y el reloj de la espera pasa a ser un hecho del reparto (F01).
       Los dos casos son distintos y no se suman.
```

**A09 · `RetrasoPorParada`** — REFLEJO · **P**
```text
HACE   medir( parada_a_bordo, nueva_hora_de_llegada ) → minutos | NO_CONSTA
REGLA  Contra la promesa GUARDADA de esa parada (B03), no contra una ruta ideal. Un pedido a bordo
       se mide contra lo que se le dijo a SU cliente, no contra lo que sería eficiente.
REGLA  Cada parada se mide por separado, y puede ser de otra tienda de la misma plaza: la promesa
       que se mide es la de su cliente, y él no sabe de quién es la otra parada.
REGLA  Este número, solo, no decide nada: lo resume A10.
```

**A10 · `AgregadoDelRetraso`** — REFLEJO · **P**
```text
HACE   agregar( [ retraso_por_parada ] ) → minutos  =  el PEOR
REGLA  El peor, no la suma (castigaría tres veces el mismo minuto) ni la media (escondería al que se
       queda sin postre). La promesa que se rompe es la que se rompe.
REGLA  Es una decisión de modelo REVISABLE y está escrita aquí a propósito: si el dueño quiere otra
       cosa, cambia ESTA clase y su test, no la cadena.
```

**A11 · `MedidaCobra`** — REFLEJO · **P**
```text
HACE   medir( precio_reparto, desvío, espera, coste_declarado ) → { paga · neto | NO_CONSTA }
REGLA  `paga` siempre consta: es E03, el precio ya compuesto. `neto` exige un coste declarado
       (€/km y €/min del rider) que **no existe** y que no puede deducirse de su historial sin
       convertirlo en una nota (A22). Sin coste: `neto = NO_CONSTA` (§4.2).
REGLA  NO forma el precio: lo lee ya compuesto (E03). Si el precio no está cerrado cuando llega el
       hecho, esta medida no consta y no hay propuesta.
REGLA  Qué de los dos aplica el umbral es Q2. La clase devuelve los dos y **no elige**; A12 aplica
       el que declare la política, y si declara neto sin coste, el candidato va a A34 y el mercado
       no propone. Es la factura de proteger al rider, y está escrita para que no sorprenda.
```

**A12 · `ReglaDeEnlace`** — REFLEJO · **P**
```text
HACE   pasa( medidas, política ) → sí | no + cuál falló
REGLA  Cuatro comparaciones en AND contra la política vigente. Sin pesos. Sin suma. Sin nota.
       Devuelve EL TEST QUE FALLÓ, no un número: un número invita a ordenar por él.
REGLA  La política viene resuelta (tienda o plaza, §1.7) y con su capa identificada. Esta clase no
       resuelve precedencias: si recibiera dos políticas, falla en vez de elegir.
REGLA  Los cuatro tests son cuatro (uno por umbral) y cada uno tiene su prueba. Si alguien "pondera"
       los cuatro, esta clase deja de existir y aparece un scorer — que es lo que A22 y A28
       prohíben.
```

**A13 · `PropuestaEmitida`** — CUSTODIO · **P**
```text
DATOS  pedido · rider · los cuatro números · huella de la foto · política (capa, versión, autor) ·
       hora · ventana · plaza_id
HACE   emitir( hecho, rider, medidas, huella, política ) → Propuesta | YA_HAY_UNA_VIVA
REGLA  Se escribe una vez y NO se edita nunca: es la prueba de qué se ofreció, a quién y con qué
       números. Se cierra con un desenlace (A14), no se corrige.
REGLA  Guarda la capa de la política —"los umbrales de esta tienda, versión 3" o "los de la plaza,
       versión 7"— porque sin ella no se puede reproducir ni explicar (A29, A16), y porque el rider
       tiene derecho a saber qué juego de reglas le juzgó.
REGLA  Una propuesta viva por pedido (A33). Si ya hay una, esta no se emite: no hay sorteo.
```

**A14 · `BloqueoDePropuesta`** — CUSTODIO · **P**
```text
HACE   cerrar( propuesta, desenlace ) → aceptada | rechazada | caducada | YA_NO_ESTÁ
REGLA  Un desenlace por propuesta. El segundo que llega recibe "ya no está" y NO PAGA NADA: es el
       mismo "sin coste" de A21, no una pieza nueva.
REGLA  Esta clase es la que impide que dos riders se queden un mismo pedido. No decide quién gana:
       decide que sólo hay un ganador.
```

**A15 · `VentanaDePropuesta`** — CUSTODIO · **P**
```text
DATOS  propuesta · hora de apertura · duración
HACE   abrir( propuesta, duración ) → Ventana   ·   vencer( ventana, ahora ) → Caducidad | sigue
REGLA  La duración la declara la política (J02), nunca esta clase. La F0 cerró **~20 s por pedido**;
       cuántos candidatos caben dentro es Q6 y no se decide aquí.
REGLA  La escribe el mismo que emitió, con su reloj. Si el reloj no consta, no se emite: una ventana
       sin hora es una ventana eterna, y una ventana eterna es una asignación lenta.
REGLA  ¿El reloj corre desde que se emite o desde que llega? **Q61·F3.** Con un canal malo, la
       diferencia son casi los 20 segundos, y decide si la caducidad es un "no" del rider o un fallo
       del transporte — que no es lo mismo ni para él ni para la medida del mercado.
```

**A16 · `RazonesDeLaDecisión`** — REFLEJO · **P**
```text
HACE   de( medidas, política ) → [ Razón ]      ← CONJUNTO CERRADO
         desvío = 312 m · espera = 2 min · retraso = 1 min · cobra = 4 c€
         umbral aplicado: 800 m / 4 min / 6 min / > 0 · política: tienda X v3 (autor: X)
REGLA  Nada que no esté en este conjunto puede aparecer en la explicación. Ni el tiempo, ni la
       zona, ni "había mucha demanda", ni "eres el más cercano" si la cercanía no está medida.
REGLA  Este conjunto es el que hace la explicación DISCUTIBLE: el rider puede mirar el 312 m y decir
       que no son 312. Con un adjetivo, no puede discutir nada. Y con la capa de la política, sabe
       si el número es del barrio o de esa tienda.
REGLA  Es un derecho, no un detalle de interfaz: la norma europea lo exige también a quien no es
       asalariado.
```

**A17 · `FraseDerivada`** — REFLEJO · **P**
```text
HACE   componer( [ Razón ] ) → frase
         «Te lo propongo porque pasas a 312 m del local, esperarías 2 min y ganarías 4 céntimos.»
         «Umbrales: los de la tienda X, versión 3.»
REGLA  Plantilla fija sobre los números ya calculados. Misma entrada, misma frase, siempre.
REGLA  Es la explicación MÍNIMA y no depende de ningún agente: si el agente se cae, esto queda y el
       mercado cumple con explicar.
```

**A18 · `RedacciónDeLaPropuesta`** — AGENTE (el borde, dentro del cuello) · **P**
```text
HACE   adornar( frase, [ Razón ] ) → frase'
REGLA  Validador puro: toda cláusula tiene que apoyarse en una razón del conjunto A16. Si aparece un
       motivo que no está —aunque sea cierto— la salida se descarta y se usa A17 tal cual. El agente
       no puede añadir un motivo: sólo elegir las palabras.
REGLA  No escribe nada. No elige a quién. No puede cambiar un número: si cambia un número, la frase
       deja de ser reproducible y la propuesta deja de ser defendible.
REGLA  Si se cae, el mercado sigue exactamente igual, con las frases sin adornar.
```

**A19 · `AceptaciónLibre`** — CUSTODIO · **P**
```text
DATOS  propuesta · rider · hora
HACE   aceptar( propuesta, rider, hora ) → Aceptación | RECHAZADO
REGLA  El sí sólo lo escribe el rider. Es el ÚNICO camino entre un pedido y un rider (A27).
REGLA  No existe "aceptación por silencio", ni "por cercanía", ni "automática a los 20 s". El
       silencio es A23 y no crea contrato.
REGLA  Es atómica: una propuesta no puede tener dos síes. La carrera la resuelve A14.
```

**A20 · `HoraDeAceptación`** — REFLEJO · **P**
```text
HACE   de( aceptación ) → hora ; arranca los relojes del reparto
REGLA  Es el hecho con hora que alimenta F01. Sin hora no hay relojes, y sin relojes la espera no se
       puede medir ni cobrar: el reparto existiría y no se podría probar.
```

**A21 · `RechazoSinCoste`** — REFLEJO · **P**
```text
HACE   anotar( propuesta, motivo? ) → Hecho
REGLA  Se anota para poder medir el mercado (cuántas propuestas hacen falta para una aceptación).
       NUNCA se agrega en una nota, ni entra en la elegibilidad, ni se le muestra al rider como
       presión [ABIERTO Q9].
REGLA  Si hay motivo [ABIERTO Q11], se guarda con el caso: alimenta el histórico de la TIENDA o el
       suyo, jamás el orden de candidatos.
REGLA  "Sin coste" no es un adjetivo: es que no existe ningún camino de este hecho a A04 ni a A25.
```

**A22 · `GuardaSinPuntuación`** — REFLEJO · **P**
```text
HACE   revisar( entradas de A04 y de A25 ) → conforme | FALLA
REGLA  Falla si aparece cualquier tasa de rechazo o aceptación, cualquier "fiabilidad", cualquier
       antigüedad y cualquier prioridad comprada en la elegibilidad o en el orden.
REGLA  Es un TEST, no una promesa de marketing. Una renuncia sin test es publicidad.
```

**A23 · `CaducidadSinRespuesta`** — REFLEJO · **P**
```text
HACE   vencer( propuesta, ahora ) → Hecho
REGLA  El silencio es un no, con hora. No se estima la intención ("estaba conduciendo, seguro que
       sí") y no se reintenta al mismo rider con el mismo pedido sin que él lo haya pedido.
REGLA  Caducar no penaliza: es el tercer desenlace válido, no el fracaso de los otros dos.
```

**A24 · `ContratoPuntual`** — CUSTODIO · **P**
```text
DATOS  pedido · rider · precio (E03) · hora prometida · ventana de recogida · tienda · plaza_id
HACE   crear( aceptación ) → Contrato
REGLA  Es lo que la aceptación crea y NADA MÁS: un pedido, un rider, un precio, una hora. Ni turno,
       ni jornada, ni disponibilidad futura, ni compromiso con el siguiente pedido.
REGLA  Es la unidad de negocio: el mercado se mide por contratos puntuales aceptados, no por riders
       "activos". Si algún día este contrato tuviera duración, el negocio sería otro.
```

**A25 · `SiguienteCandidato`** — REFLEJO · **P**
```text
HACE   siguiente( pedido, foto, política, intentos ) → rider | NINGUNO
REGLA  Avanza por el ORDEN DECLARADO en la política (J01), no por una nota calculada aquí. El orden
       es público y su desempate está escrito [ABIERTO Q7]. Esta clase lo aplica y recuerda por
       dónde iba.
REGLA  Si el orden se convierte en una fórmula con pesos propios, esta clase sobra y aparece un
       scorer: A22 y A28 se caen a la vez.
REGLA  Al agotar el tope declarado devuelve NINGUNO y el caso va a A26. No vuelve a empezar la
       lista: eso sería un bucle y un bucle es una asignación por cansancio.
```

**A26 · `EscaladaDeEnlace`** — PUENTE · **P**
```text
HACE   escalar( pedido, [ intentos ] ) → PIDE_A( SubidaDeOferta E07 ) | PIDE_A( AvisoSala I07 )
                                    | PIDE_A( siguiente candidato, si queda tope )
REGLA  Elige CUÁL de las salidas pide —otro rider, subir la oferta, la sala— según lo que ya ocurrió
       (cuántos candidatos, si ya se subió, cuánto tiempo lleva). No ejecuta ninguna: las pide,
       porque ninguna es suya.
REGLA  El pedido no se cierra por silencio del sistema. Si nadie responde, el caso queda vivo y
       visible en la cola (P01), no en un limbo.
```

**A27 · `GuardaSinAsignación`** — REFLEJO · **P**
```text
HACE   recorrer( todos los caminos pedido → rider ) → conforme | FALLA
REGLA  Ningún camino sin A19. Falla también con "auto-aceptar si no contesta", "asignación por
       cercanía" y —esto es lo que se olvida— con "la sala lo empuja por teléfono a un rider
       concreto": esa llamada es una asignación con voz humana.
```

**A28 · `GuardaSinOptimizador`** — REFLEJO · **P**
```text
HACE   revisar( entradas del flujo de enlace ) → conforme | FALLA
REGLA  La entrada es UN hecho, UNA foto y UNA política. Si aparece una lista de pedidos, un barrido
       de riders, una re-optimización del día o un "reparto equilibrado", falla.
REGLA  No es lo mismo que la neutralidad del escaparate (D08): una prohíbe PLANIFICAR el reparto, la
       otra prohíbe VENDER posiciones. Un mercado puede no vender nada y aun así tener un
       planificador, y ese planificador sería su final igual de rápido.
```

**A29 · `ReproducciónDeLaDecisión`** — REFLEJO · **P**
```text
HACE   reproducir( propuesta ) → misma propuesta | DISCREPANCIA( dónde )
REGLA  Re-ejecuta F con el hecho, la foto y la política guardados en la propuesta — incluida la capa
       de umbrales que la juzgó. Si el resultado difiere, se NOMBRA la discrepancia; no se "arregla"
       reemitiendo.
REGLA  Es el test que convierte "explicable" en algo comprobable: sin replay, la explicación es una
       declaración de buenas intenciones.
REGLA  Es también lo que hace auditable Q1/Q43: si la tienda cambió sus números, el replay con la
       versión vieja tiene que seguir dando la propuesta vieja.
```

**A30 · `GuardaEnlacePorTrayecto`** — REFLEJO · **P**
```text
HACE   revisar( propuesta ) → conforme | FALLA
REGLA  La unidad enlazada es la RUTA (paradas), nunca el cliente. Si una propuesta menciona
       "pedidos del mismo cliente", "misma dirección" o "menú compartido", falla.
REGLA  Consecuencia práctica: el cliente de un pedido no sabe qué otro viaja al lado, y no se le pide
       que acepte nada de nadie. Eso es lo que separa esto del modelo de mediodía.
```

**A31 · `GuardaEnlaceNoRompePromesa`** — REFLEJO · **P**
```text
HACE   revisar( propuesta, promesas a bordo ) → conforme | FALLA
REGLA  Ningún retraso agregado supera el umbral de la política aplicada. La promesa ya dada a otro
       cliente es el límite duro del enlace — y es el ÚNICO límite que protege al cliente de una
       tienda cuando su pedido comparte viaje con el de otra (§1.8).
REGLA  Si el umbral cambió mientras el pedido estaba en vuelo, protege la versión con la que se
       prometió [ABIERTO Q4]. Un cambio de criterio no puede empeorar una promesa ya hecha.
```

**A32 · `GuardaNoCapturaDelAhorro`** — REFLEJO · **P**
```text
HACE   revisar( cuota, pedido ) → conforme | FALLA
REGLA  La cuota se calcula por PEDIDO ACEPTADO (E04/E06). Si un cálculo incluye kilómetros
       ahorrados, pedidos enlazados o "ahorro generado", falla.
REGLA  El porqué, escrito para que no se olvide: si Bocaos cobrara por kilómetro ahorrado, su
       ingreso crecería endureciendo los enlaces, y el umbral de retraso competiría con su propia
       caja. El diseño prohíbe esa coincidencia de incentivos.
```

**A33 · `GuardaPropuestaÚnica`** — REFLEJO · **P**
```text
HACE   revisar( pedido ) → conforme | FALLA
REGLA  A lo sumo UNA propuesta viva por pedido. Con propuestas en serie se cumple por construcción;
       el test existe para el día que alguien ponga paralelo.
REGLA  El porqué: si el mismo pedido se propone a la vez a cuatro riders cercanos, el que acepta no
       es el elegido — es el que estaba mirando el móvil. Eso no es un mercado: es un sorteo con
       apariencia de mercado.
```

**A34 · `HuecoDeMedida`** — REFLEJO · **P**
```text
HACE   nombrar( rider, [ dato_faltante ] ) → Hueco
REGLA  Si falta un dato, NO SE ESTIMA: no hay propuesta y el hueco queda escrito con nombre («sin
       posición fresca», «sin precio compuesto», «sin histórico del local», «sin coste del rider»).
REGLA  El candidato se salta y se sigue. El pedido no muere por un hueco: muere si se agotan los
       candidatos, y entonces el hueco es la explicación que la sala puede leer.
REGLA  Es también el mejor diagnóstico del negocio: un mercado con muchos huecos es un mercado con
       los datos sin enchufar, no con mala suerte.
```

**A35 · `GuardaEnlaceIntraPlaza`** — REFLEJO · **P**
```text
HACE   revisar( pedido, rider, propuesta ) → conforme | FALLA
REGLA  `plaza_id(pedido) = plaza_id(rider) = plaza_id(propuesta)`, en toda propuesta emitida y en
       toda parada insertada. Es la guarda que hace que el enlace entre tiendas sea posible (§1.8) y
       el enlace entre mercados imposible.
REGLA  Falla también si una ruta contiene paradas de dos plazas, aunque el rider sea el mismo: su
       trayecto vivo es de la plaza donde está trabajando ahora, y la otra no lo ve.
```

#### B · RUTA-VIVA — el trayecto que el rider ya lleva encima (6 clases)

**B01 · `PosiciónRider`** — CUSTODIO · **P**
```text
DATOS  rider · punto · hora · frescura declarada · plaza_id
HACE   anotar( rider, punto, hora ) → Posición   ·   última( rider ) → Posición | NO_CONSTA
REGLA  Se guarda el ÚLTIMO punto con su hora, no una traza continua. Un hecho, no un chorro.
REGLA  La posición es del rider **en la plaza donde está trabajando ahora**; la otra plaza no la ve.
       Es la regla 2 aplicada al dato más sensible que hay aquí, y es la que hace posible §7.9.
REGLA  Cuánto se conserva es [ABIERTO Q38], con el límite de que no se recoge fuera del horario de
       trabajo (90 días para la traza de posición, cerrado en la F0).
```

**B02 · `ParadasPendientes`** — REFLEJO · **P**
```text
HACE   de( rider ) → [ parada ]      (en su orden)
REGLA  No se guarda una lista: se DERIVA de los contratos puntuales vivos (A24). Si un contrato se
       cierra, su parada desaparece sola. Una lista guardada se queda vieja y miente.
REGLA  Puede haber paradas de dos tiendas de la misma plaza (§1.8). La ruta es una; los contratos,
       dos; los clientes, dos, y ninguno sabe del otro.
```

**B03 · `PromesaPorParada`** — CUSTODIO · **P**
```text
DATOS  pedido · hora prometida al cliente · versión · plaza_id
HACE   prometer( parada, hora ) → Promesa   ·   de( parada ) → Promesa | NO_CONSTA
REGLA  Es un contrato con un cliente que no participó en la decisión del enlace. Sólo se puede
       MEJORAR (bajar la hora); empeorarla exige pasar el umbral de retraso (A31).
REGLA  Sin promesa no hay retraso. Y sin retraso, el umbral de minutos es una palabra.
```

**B04 · `OrdenDeParadas`** — REFLEJO · **P**
```text
HACE   ordenar( ruta ) → ruta'
REGLA  Optimiza UNA ruta y sólo dentro de ella. Nunca entre rutas, nunca entre riders, nunca entre
       plazas.
REGLA  Función pura con desempate declarado: la misma ruta da el mismo orden siempre. Si el
       desempate fuera aleatorio, la reproducción (A29) fallaría y nadie sabría por qué.
```

**B05 · `CapacidadDeclarada`** — CUSTODIO · **P**
```text
DATOS  cuánto cabe (caja, mochila, lo que sea) · declarado por él · hora · plaza_id
HACE   declarar( rider, cuánto )   ·   de( rider ) → Capacidad | NO_CONSTA
REGLA  Se declara, no se estima. Es del rider: el sistema no puede deducirla de su historial.
REGLA  Sin capacidad declarada no hay elegibilidad [ABIERTO Q33]. No se supone "2–3".
REGLA  Es POR PLAZA, y ahí hay un agujero que este diseño no puede tapar: el rider tiene un cuerpo y
       dos mercados; si está llevando tres pedidos en la plaza A, la plaza B sigue leyendo "cabe 3".
       La única protección es que él declare la pausa allí donde no está. Ver §7.9 y la deuda 4.
```

**B06 · `FinDeTrayecto`** — REFLEJO · **P**
```text
HACE   cerrar( ruta ) cuando la última parada tiene hecho de entrega
REGLA  Cerrar no puntúa a nadie: sólo deja de contar para la ruta viva. El rider no gana ni pierde
       nada por cerrar rápido o tarde.
```

#### C · PEDIDO — el acto es T, el registro es P (3 clases en la plaza)

> Las otras cuatro del grupo son de la tienda (§5.3): `C01`, `C04`, `C05`, `C06`. El patrón que hay
> que fijar: **la tienda ACTÚA (declara listo, cierra la carta, sube el incentivo); la plaza GUARDA
> el hecho con hora.** Ninguna puede escribir la de la otra.

**C02 · `EstadoPedido`** — CUSTODIO · **P**
```text
DATOS  estado · [hechos con hora] · plaza_id
HACE   transitar( pedido, estado_nuevo, hecho ) → Pedido | TRANSICIÓN_NO_PERMITIDA
REGLA  Tabla cerrada de estados y ninguna transición sin hecho con hora. Un estado sin hecho es una
       opinión sobre lo que pasó.
REGLA  El estado no se corrige: se avanza. Si hubo un error, se avanza a un estado nuevo que lo
       reconoce, y las dos horas quedan.
REGLA  El pedido vive en el registro de SU plaza. No hay "estado del pedido" en el nacional ni en
       otra plaza: no existe la fila.
```

**C03 · `AvisoTienda`** — PUENTE · **P**
```text
HACE   avisar( tienda, pedido ) por el puerto de la tienda (§6)
REGLA  Avisa, no decide: no acepta por ella, no arranca la cocina, no la compromete a una hora.
REGLA  Si el aviso no llega, el pedido existe igual: el aviso es transporte, no verdad.
```

**C07 · `Cancelación`** — REFLEJO · **P**
```text
HACE   puede_cancelar( pedido, quién, cuándo ) → sí | no + motivo
REGLA  Tabla de transiciones: quién puede cancelar y hasta cuándo. El QUIÉN PAGA ese rechazo
       [ABIERTO Q36] no se decide aquí.
REGLA  Mientras no haya respuesta, el sistema anota la cancelación con su hora y NO COBRA a nadie.
       Un cargo inventado es peor que un cargo pendiente.
```

#### D · PLAZA-TIENDA — el índice de la plaza (2 clases)

> Las otras seis son de la tienda (§5.3): marca, carta, precio, carrito, registro de cliente y
> radio. La plaza no tiene ninguna de las seis, y ésa es la prueba de que la plaza no es un
> proyecto.

**D07 · `PlazaPública`** — REFLEJO · **P**
```text
HACE   índice( censo de tiendas ) → [ escaparate ] , ya filtrado por cobertura (S02)
REGLA  Es una proyección del censo (I01). No se escribe, no tiene vida propia, no guarda posiciones.
REGLA  Sin orden de preferencia: el orden es declarado y neutro (D08). Una plaza que ordena es una
       plaza que elige.
REGLA  Sólo aparecen las tiendas que **reparten en la dirección consultada**. No es "las que
       quieren": es las que llegan, y eso se puede comprobar pidiendo a esa dirección.
```

**D08 · `NeutralidadOrden`** — REFLEJO · **P**
```text
HACE   revisar( orden mostrado al cliente ) → conforme | FALLA
REGLA  Sin ranking, sin destacados, sin prioridad comprada, sin "recomendados". Ningún campo del
       diseño permite pagar por posición.
REGLA  **Filtrar no es ordenar**: quitar por cobertura es un hecho verificable (¿llega?); poner por
       conveniencia es una preferencia que el cliente no ve. La guarda cubre las dos.
REGLA  Es distinta de A28: aquí se prohíbe VENDER posiciones; allí, PLANIFICAR el reparto. Las dos
       son la misma renuncia vista desde dos sitios, y por eso tienen dos tests.
```

#### E · TARIFA-TRES-BANDAS — el precio que hace calculable `cobra` (6 clases en la plaza)

> El séptimo, `incentivo-tienda`, es de la tienda: es su única palanca económica y por eso vive con
> ella (§5.3).

**E01 · `OfertaCliente`** — CUSTODIO · **P**
```text
DATOS  pedido · céntimos que el cliente estipula por el reparto · hora · plaza_id
HACE   estipular( pedido, céntimos ) → Oferta   ·   de( pedido ) → Oferta | NO_CONSTA
REGLA  Se congela con el pedido y no la toca nadie más: ni la tienda, ni la sala, ni Bocaos. El rider
       ve un número que no va a cambiar mientras decide.
REGLA  Es del cliente. Si Bocaos pudiera formarla, Bocaos estaría subastando reparto, y entonces
       sería transportista.
```

**E03 · `PrecioReparto`** — REFLEJO · **P**
```text
HACE   precio( oferta, incentivo ) → céntimos
REGLA  Sólo SUMA. No forma, no estima, no subasta, no redondea a favor de nadie.
REGLA  Este número es la entrada de `cobra` (A11). Si no está cerrado cuando llega el hecho, no hay
       propuesta — y por eso esta clase es una dependencia dura del cuello, no un adorno comercial.
```

**E04 · `ComisiónDeCoordinación`** — REFLEJO · **P**
```text
HACE   comisión( pedido_aceptado, parte, contrato_tramos ) → céntimos
REGLA  Por pedido ACEPTADO. Nunca por kilómetro ahorrado, nunca por viaje, nunca por propuesta
       emitida, nunca por porcentaje del ticket.
REGLA  Se calcula sobre el contrato vigente en la hora del hecho (E06 + J04), no sobre el de hoy: si
       la tarifa cambió ayer, lo de anteayer se cobra como se pactó.
```

**E05 · `RepartoDelPago`** — CONVERSOR · **P**
```text
HACE   repartir( precio, comisión ) → [ Cobro ]
         Cobro 1 · cliente → rider    · el precio ÍNTEGRO del reparto
         Cobro 2 · cliente → tienda   · el importe de la comida (no lo gestiona la plaza)
         Cobro 3 · tienda  → plaza    · tramo 1 + tramo 3
         Cobro 4 · rider   → plaza    · tramo 3
         Cobro 5 · plaza   → nacional · canon          ← solo si hay nacional (R26)
REGLA  Un precio se convierte en cobros DIRECTOS entre partes. La plaza no aparece como
       intermediaria de ningún importe que no sea su cuota.
REGLA  Es la única frontera del dinero y tiene que ser la única: si hubiera dos sitios donde se parte
       un pago, uno de los dos retendría.
REGLA  El cobro 5 no lo emite esta clase: lo emite el nacional (R26) y la plaza lo paga como paga
       cualquier documento. Aquí sólo se enumera para que la lista de caminos del dinero esté
       completa y `guarda-no-recauda` tenga algo que recorrer.
```

**E06 · `ContratoTramos`** — CUSTODIO · **P**
```text
DATOS  tramo (1 · 2 · 3) · fijo mensual · céntimos por pedido · a quién · vigencia · autor · plaza_id
HACE   vigente( parte, instante ) → Contrato | NO_CONSTA
REGLA  Valores de ejemplo (revisables, de pizzepos): 39 / 79 / 149 € fijos · 10 c€/pedido al rider ·
       20 c€/pedido a la tienda. PROVISIONAL, Q14.
REGLA  **El contratante de la tienda es la plaza**, no el nacional (Q42). Si facturara el nacional,
       el contrato estaría roto en dos y el canon no tendría con qué justificarse.
REGLA  Con vigencia: un cambio rige desde su hora y no reescribe lo ya devengado. Sin esto, la cuenta
       de una tienda cambiaría sola a fin de mes.
REGLA  Sin contrato vigente aceptado por la parte (I08) no hay devengo ni propuesta para ella.
```

**E07 · `SubidaDeOferta`** — CUSTODIO · **P**
```text
DATOS  pedido · importe nuevo · autor · hora · tope · plaza_id
HACE   subir( pedido, importe, autor ) → Hecho | SIN_AUTOR
REGLA  Acto con AUTOR humano (cliente, tienda o dueño de la plaza). El sistema no puede ser autor:
       una subida automática de la oferta sería una subvención, y una subvención automática es una
       asignación con otro nombre.
REGLA  Quién paga y con qué tope [ABIERTO Q17]. Mientras no se sepa, el acto se registra y la deuda
       queda pendiente y visible, no se cobra a nadie.
```

#### F · REPARTO-MEDIDO — la ejecución convertida en prueba (7 clases)

**F01 · `HechosDelReparto`** — CUSTODIO · **P**
```text
DATOS  pedido · rider · [ recogida · llegada · entrega · prueba ] · cada uno con hora · plaza_id
HACE   anotar( hecho ) → Hecho | YA_EXISTE
REGLA  Append-only. Un hecho corregido es un hecho NUEVO que desmiente al anterior; los dos quedan.
       Es lo que permite que un enlace pasado se pueda auditar meses después.
REGLA  Sin hora no es un hecho. "El rider llegó" sin hora es un recuerdo.
```

**F02 · `PruebaEntrega`** — CUSTODIO · **P**
```text
DATOS  foto (o su falta) · hora · confirmación del cliente (o su falta) · plaza_id
HACE   anotar( prueba )   ·   de( pedido ) → Prueba | NO_CONSTA
REGLA  Sin prueba no se presume nada: la falta es un hecho propio, no un hueco a rellenar. ¿A favor
       de quién juega la falta? [ABIERTO Q30] — y hasta que se responda, no hay cargo sin prueba.
REGLA  La prueba se conserva el tiempo que diga la política, ni un día más [ABIERTO Q38].
```

**F03 · `SeguimientoVivo`** — REFLEJO · **P**
```text
HACE   ver( pedido ) → posición podada + estado podado
REGLA  Sólo mientras el contrato está vivo. Al cerrar, se deja de proyectar: el cliente no necesita
       ver dónde está su comida una hora después.
REGLA  La posición que ve el cliente es la del RIDER con el que tiene el contrato, no la de nadie
       más — ni siquiera la del que viaja en el mismo trayecto.
```

**F04 · `ChatEnmascarado`** — PUENTE · **P**
```text
HACE   entregar( mensaje, de, a ) → mensaje sin números de teléfono
REGLA  El mensaje cruza; el número, no. Ni el rider ve el del cliente ni al revés.
REGLA  La plaza no lee el contenido para ningún cálculo y no construye ningún agregado sobre
       conversaciones: la norma prohíbe expresamente acceder a la comunicación entre riders, y el
       diseño va más allá por coherencia — aquí no hay nada que ganar leyendo.
```

**F05 · `InstruccionesAcceso`** — CUSTODIO · **P**
```text
DATOS  portal · piso · indicaciones libres · plaza_id
HACE   escribir( cliente, texto, pedido )   ·   mostrar( pedido, rider )
REGLA  Las escribe el cliente por el canal de la tienda y se muestran SÓLO al rider del contrato
       vivo. Al entregar, dejan de mostrarse aunque el dato siga escrito.
REGLA  Es dato personal del cliente del cliente: no entra en ningún agregado ni en ningún histórico
       de tienda.
```

**F06 · `IncidenciaReparto`** — PUENTE · **P**
```text
HACE   abrir( pedido, relato, autor, hora ) → Caso
REGLA  No decide, no adjudica, no puntúa: pone el caso en la cola (P01) con su autor y su hora.
REGLA  Cualquiera de las dos partes puede abrir una; ninguna puede cerrarla sin dictamen.
```

**F07 · `LecturaDeIncidencia`** — AGENTE (el borde) · **P**
```text
HACE   clasificar( relato libre ) → campos cerrados ya existentes
REGLA  Validador puro: sólo campos que la cola ya tiene (no encontraba el portal · el cliente no
       bajaba · el local no estaba listo · dirección incorrecta · otro). Un campo nuevo se rechaza,
       no se inventa.
REGLA  No puntúa, no adjudica, no decide a quién culpar. Clasifica para que un humano lo lea antes.
REGLA  Si se cae, la incidencia entra SIN clasificar y sigue su curso. El borde puede fallar sin que
       el centro se entere.
```

#### G · ADJUDICACIÓN DE FALLOS — no juzga, mide (6 clases)

**G01 · `VentanaEspera`** — CUSTODIO · **P**
```text
DATOS  N1 (espera en tienda) · N2 (espera en el portal) · N3 (espera en la llegada) · vigencia
HACE   vigente( instante ) → Ventana | NO_CONSTA
REGLA  Los tres números los declara la plaza (o la tienda, §1.7), con vigencia [ABIERTO Q28]. Sin
       ellos no hay cargo: hay medida, y una medida sin umbral no cobra nada.
REGLA  Son tres ventanas porque hay tres esperas distintas y las sufre gente distinta. Sumarlas en
       una sola N es la forma más rápida de que el que no tuvo la culpa pague.
```

**G02 · `HechoVerificado`** — REFLEJO · **P**
```text
HACE   verificar( hechos, ventana ) → excedido sí/no + minutos | NO_CONSTA
REGLA  Sólo con hechos CON HORA. Si falta un hecho, el resultado es NO_CONSTA — nunca "seguramente
       se pasó".
REGLA  No interpreta: no distingue "se pasó porque había cola" de "se pasó porque se olvidó". Eso lo
       mira un humano si hace falta (G05), y no cambia el número.
```

**G03 · `ReglaPagoFallo`** — REFLEJO · **P**
```text
HACE   aplicar( exceso, parte ) → fila de la tabla: quién paga cuánto a quién
REGLA  Es una TABLA, con una prueba por fila. No es un agente que opina sobre la culpa: aquí hay un
       reloj y una tabla.
REGLA  Los importes [ABIERTO]. Mientras no existan, la tabla devuelve "quién" pero no "cuánto", y el
       cargo nace sin importe en vez de con un número inventado.
```

**G04 · `CargoFallo`** — CUSTODIO · **P**
```text
DATOS  deudor · acreedor · importe · [ evidencia ] · hora · plaza_id
HACE   anotar( fila, evidencia ) → Deuda | SIN_EVIDENCIA
REGLA  Sin evidencia no hay cargo (G06). Nace como DEUDA entre dos partes, no como descuento: la
       plaza no retiene, así que no puede descontar de un dinero que no tiene.
REGLA  Cómo se hace efectivo es [ABIERTO Q29]: compensación contra la cuota semanal, pago directo o
       fianza. Hasta que se responda, la deuda se acumula y se ve en la cuenta de las dos partes
       (Q01) — que ya es más de lo que hace el mercado actual.
```

**G05 · `DisputaFallo`** — PUENTE · **P**
```text
HACE   llevar( deuda, autor, motivo ) → Caso en la cola
REGLA  Pone el caso delante de un humano. No re-juzga, no reabre un caso cerrado sin un hecho nuevo,
       no cambia la tabla.
REGLA  Quién decide en la disputa [ABIERTO Q24]. El diseño garantiza que hay alguien y que su
       decisión queda firmada (O04); no decide quién es.
```

**G06 · `TrazabilidadFallo`** — REFLEJO · **P**
```text
HACE   revisar( cargo ) → conforme | FALLA
REGLA  Cada cargo apunta a hechos anteriores a él. Si a un cargo le falta un hecho, o el hecho es
       posterior al cargo, o el hecho fue desmentido, falla.
REGLA  Es la diferencia entre un cargo y un abuso, y es lo único que un rider autónomo puede exigir a
       un mercado que dice no juzgar.
```

#### H · LIQUIDACIÓN — el único dinero de la plaza (6 clases)

> La consolidación (R14) es del nacional y no recauda. Aquí se cobra **lo de esta plaza**, con su
> calendario y su mora: un impago en Málaga no suspende Bilbao.

**H01 · `Devengo`** — REFLEJO · **P**
```text
HACE   acumular( parte, periodo ) → { seguro , en duda , detalle[] }
REGLA  Cuenta PEDIDOS ACEPTADOS × tarifa del contrato vigente + la parte del fijo que toque. Jamás
       kilómetros, jamás viajes, jamás porcentaje del ticket.
REGLA  Devuelve DOS cifras, no una: lo que se devenga sin discusión y lo que depende de una pregunta
       abierta (un pedido cancelado tras aceptar [ABIERTO Q18] cae aquí). **No elige**; elegir es del
       dueño, y la elección queda en el acta.
REGLA  Un pedido que no tuvo aceptación no devenga nada: la coordinación no se hizo.
```

**H02 · `CicloSemanal`** — CUSTODIO · **P**
```text
DATOS  periodo · hora de apertura · hora de cierre · [ devengos ] · estado · plaza_id
HACE   abrir( )  ·  cerrar( periodo ) → Cierre (inmutable)
REGLA  Un periodo cerrado NO se reabre. Una corrección posterior es una nota en el periodo siguiente,
       con su porqué. Reabrir un cierre es la manera de que las cuentas no cuadren nunca.
REGLA  El ciclo es de la plaza y **no incluye el canon**: si lo incluyera, la plaza necesitaría al
       nacional para cerrar su semana, y apagarlo dejaría de ser posible (auditoría 4).
REGLA  Día, hora y qué pasa si el cobro falla: [ABIERTO Q26].
```

**H03 · `FacturaGestión`** — CONVERSOR · **P**
```text
HACE   emitir( cierre, parte ) → documento de cobro
REGLA  Sólo lo DEVENGADO en ese cierre. Ni una línea más, ni un concepto nuevo.
REGLA  Con IVA y forma jurídica [ABIERTO Q4] y con quién factura a quién sin resolver: el documento
       se genera con los campos vacíos marcados, no con un tipo inventado.
```

**H04 · `CobroGestión`** — PUENTE · **P**
```text
HACE   cobrar( documento, canal_de_la_parte ) → Cobrado | Fallido
REGLA  Cobra LO SUYO y sólo lo suyo, por el canal que cada parte declare. Nunca del importe de comida
       ni del de reparto (H06).
REGLA  Un cobro fallido no cambia lo devengado: cambia la deuda (H05).
```

**H05 · `ImpagoGestión`** — REFLEJO · **P**
```text
HACE   aplicar( deuda, días ) → recordatorio | recargo | suspensión
REGLA  La suspensión NO corta pedidos en vuelo ni retira propuestas vivas: corta la entrada de
       pedidos nuevos. Un rider o una tienda que se queda a medias por una cuota es un daño colateral
       que el diseño no acepta.
REGLA  Los valores (días, recargo, aviso previo) [ABIERTO]. Y la mora es de esta plaza: no se
       contagia ni se compensa con otra.
```

**H06 · `GuardaNoRetención`** — REFLEJO · **P**
```text
HACE   revisar( todos los caminos del dinero de la plaza ) → conforme | FALLA
REGLA  Ningún camino de la plaza toca el importe de la comida ni el del reparto. Falla si un cobro se
       calcula como porcentaje del ticket, si un pago al rider pasa por una cuenta de la plaza o si
       un cargo se aplica descontando de un dinero ajeno.
REGLA  No es una postura moral: es que si la plaza retuviera, sería banco, y si cobrara el ticket,
       sería Glovo.
```

#### I · SALA-MERCADO — la operación humana mínima (8 clases)

> "Agentes, no sala humana" hay que leerlo con precisión: **no hay un equipo de operación por
> defecto**; hay agentes y una escalada, y la escalada es de la plaza porque es la que tiene el caso.
> A las 23:40 de un sábado puede no haber nadie — y entonces el caso **caduca con aviso al cliente**,
> no en silencio (Q40).

**I01 · `AltaTienda`** — CUSTODIO · **P**
```text
DATOS  tienda · identidad fiscal · marca · catálogo · estado del alta · [checklist] · plaza_id
HACE   alta( tienda, datos ) → Censo | INCOMPLETA(checklist)
REGLA  Un solo dueño del censo **operativo**. Una tienda no existe para el mercado hasta que está
       completa, y la lista de lo que falta la calcula P04, no la memoria de nadie.
REGLA  La plaza escribe el alta operativa (su censo, su estado) y **publica** el hecho; el nacional
       escribe su copia (R05). Uno manda, el otro copia. Nunca al revés.
REGLA  Exclusividad y permanencia [ABIERTO Q35]: el diseño no las impone ni las prohíbe; hoy no
       existen como campo, y añadirlas exigiría una decisión del dueño y un acta.
```

**I02 · `AltaRider`** — CUSTODIO · **P**
```text
DATOS  rider · acreditación · seguro · [documento informativo firmado] · estado · plaza_id
HACE   alta( rider, datos ) → Censo | INCOMPLETA(checklist)
REGLA  Qué acredita y quién lo verifica [ABIERTO Q34]. Sin ese dato, el alta queda incompleta y el
       rider no entra en A04 — no por castigo, sino porque el censo no puede inventar.
REGLA  El alta es **por plaza**: dos plazas, dos altas. La credencial que viaja es M06 [ABIERTA].
REGLA  Incluye el documento que explica, por escrito, que hay un sistema que decide a quién se le
       propone cada pedido. Es exigible por norma; aquí es además la única forma de que la
       explicación de cada propuesta tenga sentido.
```

**I03 · `EstadoTienda`** — CUSTODIO · **P**
```text
DATOS  abierta · cerrada · saturada · hora
HACE   declarar( tienda, estado ) → Estado
REGLA  "Saturada" la declara la tienda. La sala no puede poner una tienda saturada para que el
       mercado "respire mejor": eso sería administrar su negocio.
REGLA  El estado lo escribe un solo dueño y con hora. Dos escritores es una tienda que recibe
       pedidos cuando está cerrada.
```

**I04 · `EstadoRider`** — CUSTODIO · **P**
```text
DATOS  disponible · ocupado · en pausa · hora · plaza_id
HACE   declarar( rider, estado ) → Estado
REGLA  La PAUSA la declara él, siempre. Ni la sala ni el sistema pueden ponerlo en pausa: eso sería
       disponer de su tiempo, que es exactamente lo que un autónomo no acepta.
REGLA  "Ocupado" no lo pone la sala: lo pone el contrato vivo. La única escritura de una parte sobre
       este estado es la suspensión (P03), que es otra cosa, tiene motivo y deja acta.
```

**I05 · `SaludMercado`** — REFLEJO · **P**
```text
HACE   medir( periodo, zona ) → { aceptadas/emitidas · propuestas por aceptación · riders activos ·
                                    esperas · devengado · pedidos sin propuesta }
REGLA  Sólo hechos escritos. Lo que no consta aparece como NO_CONSTA, nunca como cero: un cero en
       "pedidos sin propuesta" hace parecer sano un mercado que no tiene datos.
REGLA  Es la medida maestra del negocio y no una curiosidad: un mercado que necesita seis propuestas
       para mover un pedido está muerto aunque venda.
```

**I06 · `TableroFricciones`** — REFLEJO · **P**
```text
HACE   medir( los 8 pares de interlocutores + el 9.º ) → 9 series
REGLA  Mide, no opina. Cada par tiene su número y su hueco: cliente↔tienda (precio cerrado y estado
       visible), tienda↔rider (espera y puntualidad), rider↔cliente (prueba y acceso), tienda↔Bocaos
       (cuenta y tramo), rider↔Bocaos (cartera y propuestas), cliente↔Bocaos (marca ajena),
       tienda↔tienda (neutralidad), rider↔rider (propuesta única), **plaza↔nacional** (marca
       compartida, culpa local).
REGLA  Un par sin datos aparece como hueco. El tablero no rellena.
```

**I07 · `AvisoSala`** — PUENTE · **P**
```text
HACE   avisar( caso, traza, plazo ) → Aviso
REGLA  Avisa cuando el reflejo no puede resolver, y avisa CON LA TRAZA: qué se intentó, con qué
       números, por qué no pasó. Sin traza, la sala sólo puede improvisar.
REGLA  Si el plazo vence sin respuesta, el caso sube de prioridad y sigue vivo. No se cierra solo ni
       "se resuelve" por defecto.
REGLA  Cuando no hay nadie (Q40), el único cierre honesto es el del cliente: se le avisa por el canal
       de la tienda de que su pedido no va a llegar **antes** de que se enfríe, y el aviso queda como
       hecho. Eso no está declarado en ninguna parte, y es la pieza de comportamiento que falta.
```

**I08 · `TérminosParte`** — CUSTODIO · **P**
```text
DATOS  parte · [cláusulas aceptadas] · versión · hora de aceptación · plaza_id
HACE   aceptar( parte, versión )   ·   vigentes( parte, instante ) → Términos | NO_CONSTA
REGLA  Lo que cada parte aceptó, con versión. Sin términos vigentes no hay propuesta ni devengo para
       esa parte: no se puede cobrar por algo que nadie aceptó.
REGLA  Un cambio de términos no es retroactivo. Si la parte no acepta la versión nueva, sigue con la
       vieja hasta que la acepte o se vaya — y se va sin penalización (M03).
```

#### J · CONFIG — los números de la plaza, y el default de la tienda (5 clases)

**J01 · `ConfigUmbrales`** — CUSTODIO · **P**
```text
DATOS  ámbito (plaza | tienda) · los cuatro números · orden de candidatos · tope de propuestas ·
       vigencia desde · autor · plaza_id
HACE   declarar( ámbito, valores, autor, desde ) → Política
       vigente( ámbito, instante ) → Política | NO_CONSTA
REGLA  La vertical fija la FORMA: hay cuatro umbrales, en m · min · min · c€, y la comparación es
       AND. Aquí sólo viven los valores y su dueño (§1.7).
REGLA  Dos capas: la plaza declara su **default**; una tienda puede declarar el suyo, y sólo cambia
       los cuatro números de sus propios pedidos. No puede añadir criterios ni mirar al rider.
REGLA  Toda versión tiene vigencia y autor, y ninguna se escribe sin acta (O02). Sin vigencia, un
       cambio de criterio reescribe el pasado.
REGLA  No admite reglas por rider. Eso no sería configurar: sería ordenar el mercado a mano.
```

**J02 · `ConfigVentana`** — CUSTODIO · **P**
```text
DATOS  duración de una propuesta · tope de candidatos · vigencia · ámbito
HACE   vigente( ámbito, instante ) → { duración , tope } | NO_CONSTA
REGLA  La vertical sólo exige que sea FINITA y DECLARADA, y que el total por pedido ronde los 20 s
       (cerrado en la F0). El reparto interno es Q6: un candidato de 20 s, o dos de 10, o tres en
       paralelo.
REGLA  Si la ventana depende de si el rider va conduciendo [ABIERTO Q5], se declara aquí como
       política; lo que no puede pasar es que la ventana se alargue sola mientras alguien duda.
```

**J03 · `ConfigZona`** — CUSTODIO · **P**
```text
DATOS  [ zona ] · barrios · polígono o radio · vigencia · plaza_id
HACE   de( zona ) → Zona   ·   zonas() → [ zona ]   ·   cubre( dirección ) → sí | no | NO_CONSTA
REGLA  Qué barrios cubre este mercado es de la plaza. La vertical sólo sabe que hay una cobertura y
       que filtra.
REGLA  ¿Un juego de umbrales por zona dentro de la plaza? [ABIERTO Q3]. La clase admite las dos
       porque la política se busca por (zona, instante, ámbito): si mañana son distintas, no cambia
       una línea.
```

**J04 · `VersiónEfectiva`** — REFLEJO · **P**
```text
HACE   en( instante, tienda ) → PolíticaResuelta { capa, versión, autor, números }
REGLA  Resuelve la precedencia de §1.7: la declaración de la tienda si existe y está vigente; si no,
       la de la plaza. Devuelve **cuál de las dos**, porque la explicación tiene que decirlo.
REGLA  Devuelve la que estaba viva EN AQUEL INSTANTE, no la de hoy. Es la clase que permite explicar
       una propuesta de hace tres semanas con los números que la juzgaron — y con la capa que la
       juzgó.
REGLA  Sin esta clase, el archivo de propuestas sería una colección de decisiones sin ley.
```

**J05 · `SimuladorDeUmbrales`** — REFLEJO · **P**
```text
HACE   simular( política_alternativa, hechos históricos, zona, ámbito ) → qué habría pasado
REGLA  Recalcula con números sobre hechos reales ya escritos. No con un ejemplo de folleto.
REGLA  Simula, no aplica: su salida no escribe política. Aplicar exige declarar (J01) + acta (O02).
       Si el simulador pudiera aplicar, el dueño dejaría de decidir.
REGLA  Declara sus propios límites: con los datos de hoy, lo que dice de mañana es una extrapolación,
       y se dice. Y puede simular **una tienda contra el default de la plaza**, que es la única
       forma de que Q1/Q43 se decidan con números en vez de con miedo.
```

#### K · CLIENTE FINAL — lo que sólo se ve desde su silla (1 clase en la plaza)

> La otra, `K01 reclamacion-por-la-tienda`, es de la tienda (§5.3). `K03 transparencia-del-enlace`
> sigue **[ABIERTA]** y no tiene clase (§13).

**K02 · `GuardaMarcaAjena`** — REFLEJO · **P**
```text
HACE   revisar( cualquier comunicación al cliente final ) → conforme | FALLA
REGLA  Ninguna lleva la marca de Bocaos — **ni la de la plaza, ni la del nacional**, ni su nombre, ni
       un enlace, ni un remitente reconocible, ni "powered by".
REGLA  Es la renuncia que sostiene todo lo demás: el día que el cliente sepa que Bocaos existe por
       una comunicación de Bocaos, el restaurante tendrá razón en tener miedo. Y con la federación
       hay una segunda marca que ocultar: si el cliente descubre que su tienda está en una plaza,
       descubre que hay alguien por encima de su restaurante.
```

#### M · REPARTIDOR AUTÓNOMO — lo que sólo se ve desde su silla (5 clases)

**M01 · `CarteraRider`** — REFLEJO · **P**
```text
HACE   ver( rider, periodo ) → { ganado · reclamado · pendiente · deudas · neto }
REGLA  Suma de hechos de reparto y de cargos, con su pedido detrás. Cada céntimo apunta a un
       contrato.
REGLA  **Una cartera por plaza.** Un rider en dos plazas tiene dos carteras, dos ciclos y dos moras.
       ¿Se consolidan en una vista o en un pago? Q45 — y si el nacional adelantara el dinero de una
       plaza que paga tarde, sería banco.
REGLA  Distingue lo GANADO (contrato cerrado con prueba) de lo RECLAMADO (entregado sin prueba,
       [ABIERTO Q30]) y de lo PENDIENTE. No estima propinas ni "ganancias potenciales".
```

**M02 · `ZonaRider`** — CUSTODIO · **P**
```text
DATOS  [ zona ] declaradas por él · hora · plaza_id
HACE   declarar( rider, zonas ) → ZonaRider
REGLA  La declara él y la cambia cuando quiere. El sistema no le asigna zona, ni le "sugiere" una por
       densidad: eso sería dirigir su trabajo.
REGLA  Es uno de los dos controles que tiene sobre las propuestas que recibe (el otro es la pausa,
       I04). Sin estos dos, "rechazo sin coste" significaría "propuestas eternas".
```

**M03 · `GuardaSinExclusividad`** — REFLEJO · **P**
```text
HACE   revisar( condiciones de elegibilidad ) → conforme | FALLA
REGLA  Ninguna exclusividad, permanencia, turno, cuota mínima, ni "prioridad por trabajar solo con
       nosotros" entra en la elegibilidad de una propuesta.
REGLA  Falla también si el diseño introduce una condición que en la práctica lo consigue — por
       ejemplo, exigir una disponibilidad mínima semanal para recibir propuestas, o un alta que sólo
       se tramita si no trabajas en otra plaza.
```

**M04 · `CanalRider`** — PUENTE · **P**
```text
HACE   entregar( propuesta, rider ) → Entregada | No entregada
REGLA  Puerto abierto e intercambiable: el diseño no ata la propuesta a una superficie concreta.
       **Una instancia por plaza**, y el rider las suma en su móvil: dos plazas, dos canales, dos
       propuestas que pueden sonar a la vez.
REGLA  Su latencia es CRÍTICA y es la única cosa crítica de todo el sistema: una ventana de 20 s que
       llega 8 s tarde es una ventana de 12 s. Si el canal no puede entregar dentro de la ventana, el
       candidato no debe proponerse [ABIERTO Q5].
```

**M05 · `VistaDePropuesta`** — REFLEJO · **P**
```text
HACE   ver( propuesta ) → los cuatro números, SIEMPRE en el mismo orden, + la frase + de qué plaza es
                          + qué umbrales le juzgaron (los de la tienda, o los de la plaza)
         desvío · espera · retraso · cobra      (y nunca otro orden)
REGLA  El orden es parte del producto: un rider que conduce no lee cuatro números en veinte segundos;
       los reconoce por su sitio. Cambiar el orden es cambiar el producto.
REGLA  Los cuatro van SIEMPRE, incluido el que pasa por un solo céntimo y el que pasa con holgura. No
       hay vista "resumida": resumir es elegir qué no se le dice.
REGLA  La plaza va delante y los umbrales también: con dos plazas y N tiendas, el rider tiene que
       poder decir "esto es de Málaga, con los números de esta tienda" sin abrir nada más.
```

#### N · BOCAOS (el suelo) — lo que sólo se ve desde el suelo (2 clases)

**N01 · `PolíticaDensidad`** — REFLEJO · **P**
```text
HACE   medir( zona, franja ) → riders activos por pedido · espera probable · propuestas por aceptación
REGLA  Dice CUÁNDO una zona no puede abrirse (o no debería seguir abierta). No la cierra: le da el
       número al dueño y la decisión va al acta (O02).
REGLA  No resuelve la densidad. Nombrar el problema no es resolverlo, y el diseño no finge
       arreglarlo: sin riders suficientes no hay mercado, y eso no lo arregla un sistema.
```

**N02 · `SimuladorTramos`** — REFLEJO · **P**
```text
HACE   simular( tramo alternativo, hechos de la tienda ) → cuánto pagaría, con sus números
REGLA  Recalcula con los hechos de ESA tienda: sus pedidos, sus aceptaciones, sus cargos. No con una
       media del mercado.
REGLA  Simula, no aplica (igual que J05): el contrato se cambia con autor, vigencia y aceptación
       (E06 + I08).
```

#### O · ROL JEFE — dos jefes, no uno con dos pantallas (4 clases en la plaza)

> El cuadro del jefe del nacional es R15 y está contado en el grupo R. Aquí está el de la plaza, que
> es el único que puede mirar dentro de su mercado.

**O01 · `CuadroDelMercado`** — REFLEJO · **P**
```text
HACE   cuadro( periodo, zona ) → { aceptación a la primera · propuestas por aceptación ·
         pedidos que nunca tuvieron propuesta · espera media por tienda y su tendencia ·
         retraso causado a pedidos a bordo · devengado vs cobrado · mora · los 9 pares ·
         umbrales declarados por tienda }
REGLA  Lo que no tiene hechos aparece como HUECO, no como cero. El número que más duele —"pedidos sin
       propuesta nunca"— sale de A34, y sin A34 no se puede contar.
REGLA  Muestra tendencia, no sólo valor: una espera de 3 minutos que sube es peor que una de 4 que
       baja.
REGLA  Muestra qué tienda declaró qué umbrales: es información para el jefe de la plaza, no un botón.
       No puede cambiarlos por ella (§1.7).
```

**O02 · `ActaDeDecisiones`** — CUSTODIO · **P**
```text
DATOS  qué se cambió · por qué · quién · desde cuándo · qué se esperaba que pasara · ámbito
HACE   asentar( cambio, motivo, autor, vigencia, ámbito ) → Acta
REGLA  Ningún cambio de política (J01, J02, G01, E06) se escribe sin acta: el cambio y el acta se
       escriben juntos o no hay cambio. Es la única forma de que cambiar el criterio cueste algo.
REGLA  Admite decisiones de la plaza y de sus tiendas, con el autor de cada una: es la memoria de
       todas las reglas que se movieron dentro de este mercado. Una tienda no puede escribir actas
       de otra.
REGLA  El acta no se corrige: si el motivo era falso, se asienta otro acta que lo dice. Un acta
       editable no es un acta.
```

**O03 · `ColaRevisiónHumana`** — CUSTODIO · **P**
```text
DATOS  [ caso ] · quién lo pide · hora · plazo · dueño del caso
HACE   encolar( caso, quien_pide )   ·   vencer( caso, ahora ) → sube de prioridad | sigue
REGLA  Cualquier parte puede pedir que se revise una decisión automática que le afectó. Es un
       derecho, no un favor [ABIERTO Q25 sobre si se construye desde el día uno].
REGLA  Con dueño y con plazo. Si vence, sube de prioridad y sigue visible; no se cierra sola.
REGLA  La revisión es de **esta** plaza, porque es quien decidió. Un dictamen del nacional sobre una
       propuesta de una plaza sería el planificador humano que A28 prohíbe.
```

**O04 · `DictamenRevisión`** — CUSTODIO · **P**
```text
DATOS  caso · firmante · motivo · efecto aplicado · hora
HACE   dictaminar( caso, firmante, efecto ) → Hecho firmado
REGLA  Efectos PERMITIDOS: compensar a una parte, corregir un histórico mal medido, cambiar la regla
       HACIA ADELANTE.
REGLA  Efecto PROHIBIDO: rehacer la propuesta que ya se emitió. Si el dictamen pudiera rehacerla, el
       humano sería un planificador — y no hay planificador (A28).
REGLA  Quién firma [ABIERTO Q26]: la sala o el dueño de la plaza. El diseño garantiza que hay un
       nombre; no decide cuál.
```

#### P · ROL TRABAJADOR — la sala, que opera el día de hoy (4 clases)

**P01 · `ColaSala`** — CUSTODIO · **P**
```text
DATOS  [ caso vivo ] · tipo · hora de entrada · pedidos afectados · traza · plaza_id
HACE   encolar( caso )   ·   siguiente( ) → caso   ·   cerrar( caso, por_qué )
REGLA  UNA sola cola. No tres bandejas. Una incidencia, una disputa, un alta incompleta y un pedido
       sin rider son el mismo tipo de cosa: algo que se ha atascado y necesita a alguien.
REGLA  Prioridad por HECHOS: tiempo esperando y pedidos afectados. No por quién llama más.
REGLA  Un caso sale de la cola con un hecho que lo cierra (dictamen, cargo, alta completada), no
       porque alguien lo borre.
```

**P02 · `VistaParte`** — REFLEJO · **P**
```text
HACE   ver( tienda | rider ) → todo lo suyo en una pantalla, incluido lo que falló y por qué
REGLA  Incluye las propuestas que no llegaron a nada CON SU TRAZA (A16 + A34): "tres candidatos; a
       dos se les pasó el desvío; al tercero le faltaba el precio". Eso no es una excusa: es un
       diagnóstico.
REGLA  Sólo de esa parte. La vista de una tienda no muestra a sus competidoras, ni su clientela, ni
       su carta.
```

**P03 · `AcciónSanción`** — CUSTODIO · **P**
```text
DATOS  parte · motivo · plazo · acta · autor · plaza_id
HACE   suspender( parte, motivo, plazo ) → Sanción
REGLA  Suspender exige motivo, plazo y acta. Suspender sin acta es el principio de un mercado de
       abusos — y este mercado se llama así a propósito, así que la tentación está en el nombre.
REGLA  No toca pedidos en vuelo (H05). Y no puede ser "por tasa de rechazo": eso no es una falta, es
       un derecho (A21).
```

**P04 · `ChecklistAlta`** — REFLEJO · **P**
```text
HACE   de( tienda | rider ) → qué falta para el alta, sin memoria
REGLA  Lista derivada de I01 / I02 y de lo que la plaza exija [ABIERTO Q34]. Sin criterios ocultos:
       si algo no está en la lista, no se puede exigir después.
REGLA  Un rider a medias no entra en A04. No por castigo: porque el censo no puede inventar lo que
       no consta.
```

#### Q · ROL CLIENTE — la tienda que paga y el cliente final que no es de Bocaos (1 clase)

**Q01 · `EstadoCuentaParte`** — REFLEJO · **P**
```text
HACE   ver( parte, periodo ) → { devengado · facturado · cobrado · pendiente · cargos · saldo }
REGLA  Cada importe apunta a un hecho: un pedido aceptado, un cierre, un cargo con evidencia. Lo que
       no consta se muestra como "sin evidencia", no como cero.
REGLA  Sirve a las dos caras del rol: la tienda (que paga y necesita cuadrar lo que paga con lo que
       recibe) y el rider (que cobra y necesita saber qué le deben). El cliente final NO tiene
       cuenta: no es parte de nada.
REGLA  Es la pieza que convierte "te cobramos la coordinación" en algo verificable. Sin ella, la
       cuota es un recibo y no un contrato. Y con dos plazas, hay dos cuentas: el rider no ve aquí
       la de al lado.
```

#### S · FRONTERA — la cobertura y su filtro (2 clases)

**S01 · `FronteraDePlaza`** — REFLEJO · **P**
```text
HACE   de( dirección ) → plaza_id | NO_CONSTA | AMBIGUA(plazas)
REGLA  Es una función sobre la cobertura declarada (J03). Si dos coberturas se solapan y no hay
       regla de desempate, devuelve AMBIGUA y **no hay pedido**: no se estima a qué plaza pertenece
       una dirección. Es Q52, y no se resuelve aquí.
REGLA  De qué plaza es una dirección decide qué mercado sirve el pedido. Si esta clase adivinara, el
       pedido podría caer en una plaza que no lo cubre y la promesa de entrega se rompería sola.
```

**S02 · `FiltroPorCobertura`** — REFLEJO · **P**
```text
HACE   filtrar( índice, dirección ) → índice'   ·   y a la inversa: qué tiendas llegan aquí
REGLA  Quita las tiendas que **no llegan**: la intersección entre lo que la plaza cubre (J03) y lo
       que cada tienda declara que reparte (D06). No pone a las que pagan: eso es D08.
REGLA  La exclusión es por un hecho que el cliente puede comprobar (pide a esa dirección y no llega).
       Por eso no es un ranking aunque el cliente vea una lista más corta.
```

### 5.3 · TIENDA — el proyecto · 16 clases

> Seis custodios, seis reflejos, dos puentes, un conversor y un agente. Dieciséis objetos **por
> tienda**, y una plaza con cuarenta tiendas tiene seiscientos cuarenta. Todo lo que el cliente ve y
> toca está aquí; nada de aquí sabe que existe otra tienda.
>
> **La tienda no tiene riders, ni umbrales de otros, ni censo, ni cola, ni acta.** Tiene su marca, su
> carta, su cliente, su pedido, su cocina y su precio. Y una puerta a su plaza con dos verbos: anotar
> lo suyo, leer lo suyo.

**C01 · `CapturaPedido`** — REFLEJO · **T**
```text
HACE   alta( cliente_de_la_tienda, líneas, oferta_de_reparto ) → Pedido
REGLA  De a uno. No hay alta en bloque, ni pedido "programado", ni pedido recurrente con plantilla.
REGLA  El pedido nace con su precio YA cerrado (D03) y su oferta de reparto congelada (E01). Si el
       precio se compusiera después, el rider podría decidir sobre un número y cobrar otro.
REGLA  Nace con el `plaza_id` de la plaza donde vive la tienda. No hay constructor sin plaza: una
       tienda no puede parir un pedido "suelto", porque no habría quién lo registrara.
```

**C04 · `HoraDeListo`** — CUSTODIO · **T**
```text
DATOS  pedido · tienda · hora declarada · autor
HACE   declarar( tienda, pedido, hora ) → Hecho   (lo anota la plaza, A01)
REGLA  Lo escribe LA TIENDA, y es el disparador de todo el mercado. No puede escribirlo la sala por
       ella, ni el sistema por estimación.
REGLA  Es el hecho que se mide después (L03): si marca pronto y entrega tarde, esa diferencia vuelve
       en la siguiente propuesta a ese local. La cocina queda visible y cobrada, no sancionada.
REGLA  No se puede adelantar ni corregir. "Marcar listo" es declarar, y declarar tiene consecuencia.
```

**C05 · `EstadoCocinaVisible`** — REFLEJO · **T**
```text
HACE   ver( pedido ) → estado podado (4 estados)
REGLA  El cliente ve un estado podado, no el interno. No ve "en cola", ni "rechazado por falta de
       rider", ni "esperando propuesta": ve lo que le sirve para decidir si baja.
REGLA  No ve datos de otras tiendas ni de otros pedidos, aunque viajen en el mismo trayecto. Ni
       siquiera el nombre del local de la otra parada.
```

**C06 · `AvisoCliente`** — PUENTE · **T**
```text
HACE   avisar( cliente, hecho ) por el canal DE LA TIENDA
REGLA  Sin marca de Bocaos, sin enlace a Bocaos, sin remitente reconocible (K02). El cliente no es de
       Bocaos, y el canal tampoco.
REGLA  Es el puerto más delicado del negocio: si este aviso se rompe, la tienda pierde la cara de su
       cliente y culpa a Bocaos.
```

**D01 · `MarcaTienda`** — CUSTODIO · **T**
```text
DATOS  nombre · signos · tono · titular de la marca
HACE   declarar( tienda, marca )   ·   de( tienda ) → Marca | NO_CONSTA
REGLA  La firma es la tienda. Bocaos no firma nada que el cliente final vea — y la plaza tampoco:
       no hay "Bocaos Málaga" en el escaparate (Q49).
REGLA  Una tienda no puede firmar con la marca de otra. La marca es suya por construcción, no por
       contrato: no hay campo donde poner la de Bocaos.
```

**D02 · `CartaPública`** — CONVERSOR · **T**
```text
HACE   proyectar( catálogo interno de la tienda ) → carta pública podada
REGLA  La fuente es UNA: el catálogo de la tienda. Esta clase PROYECTA y poda; no guarda una segunda
       carta. Dos cartas son dos verdades y la segunda siempre está vieja.
REGLA  Podar quiere decir: qué se publica, en qué orden y con qué disponibilidad. No quiere decir
       "destacar": el orden de la carta es el de la tienda, no el de la plaza (D08).
```

**D03 · `PrecioCerrado`** — REFLEJO · **T**
```text
HACE   cerrar( carrito, oferta_de_reparto, incentivo ) → céntimos + desglose
REGLA  Todo en céntimos y TODO cerrado antes de pagar. El precio final no puede sorprender: es la
       fricción número uno del par cliente↔tienda.
REGLA  El desglose (comida / reparto / incentivo) existe internamente siempre; si el cliente lo VE es
       otra pregunta [ABIERTO Q19 · Q39]. El diseño no lo decide: lo deja calculado.
```

**D04 · `CarritoTienda`** — CUSTODIO · **T**
```text
DATOS  cliente_de_la_tienda · tienda · líneas · hora
HACE   añadir / quitar / cerrar
REGLA  Un carrito por cliente y tienda. No cruza tiendas: **no existe "carrito del mercado"**, ni de
       la plaza, ni de la federación. Un carrito compartido es una cuenta, y una cuenta es una app.
REGLA  Al cerrar, el carrito se convierte en pedido (C01) con el precio cerrado y desaparece. Un
       carrito cerrado que sigue vivo es un pedido que se puede cobrar dos veces.
```

**D05 · `RegistroClienteTienda`** — CUSTODIO · **T**
```text
DATOS  identidad del cliente · tienda a la que pertenece · instrucciones de acceso
HACE   alta( cliente, tienda )   ·   de( cliente, tienda ) → Ficha | NO_CONSTA
REGLA  El cliente es DE LA TIENDA, aislado por tienda. No hay registro global, ni identidad única
       entre tiendas, ni "cliente del mercado". El índice por (tienda, cliente) no tiene operación
       que devuelva los de al lado.
REGLA  Esta es la pieza que hace verdad la promesa al restaurante. Si existiera un registro único, el
       miedo del par 4 tendría razón, y con razón.
REGLA  Comprar como invitado [ABIERTO Q39] no rompe el aislamiento: el invitado también es de una
       tienda. Y si dos tiendas de la misma plaza tienen al mismo señor, son dos fichas que no se
       conocen: eso no es un fallo, es el producto.
```

**D06 · `RadioDeTienda`** — CUSTODIO · **T**
```text
DATOS  lo que esta tienda declara que reparte (zona, radio, códigos) · hora
HACE   declarar( tienda, zona ) → Radio   ·   cubre( dirección ) → sí | no | NO_CONSTA
REGLA  La declara ella: es un valor del dueño, no una estimación del sistema. La plaza no puede
       ampliarla ni recortarla por ella.
REGLA  Es lo que hace que "no existe la tienda que no llega" sea un hecho y no una promesa: S02
       intersecta esto con la cobertura de la plaza.
```

**E02 · `IncentivoTienda`** — CUSTODIO · **T**
```text
DATOS  pedido · céntimos que suma la tienda · autor · hora · tope
HACE   subir( pedido, céntimos, autor ) → Incentivo
REGLA  Lo sube la tienda, con autor y hora. Puede comprar su propia impuntualidad — que es
       exactamente lo que hace que el mercado corrija sin que nadie la sancione.
REGLA  No puede bajar por debajo de lo ya ofrecido a un rider con propuesta viva: sería cambiarle el
       número debajo de los ojos.
REGLA  Si lo pagara la plaza o el nacional, estarían subvencionando demanda [ABIERTO Q17]. Y es su
       única palanca económica: la F0 le quitó los umbrales y le dejó el precio.
```

**K01 · `ReclamaciónPorLaTienda`** — PUENTE · **T**
```text
HACE   encauzar( reclamación del cliente final ) → Caso en la tienda
REGLA  Su única vía de queja pasa por la tienda. Bocaos no atiende al cliente final: no tiene dónde
       poner su caso, y eso es el diseño.
REGLA  Si una reclamación llegara a Bocaos por error, se devuelve a la tienda con su hora. No se
       atiende, no se responde, no se guarda como relación.
```

**L01 · `PanelTienda`** — REFLEJO · **T**
```text
HACE   ver( tienda, periodo ) → espera medida · puntualidad · propuestas recibidas · pedidos sin
                                 repartidor · qué umbrales está aplicando
REGLA  Es LA MISMA información que ve el rider antes de aceptar. Misma fuente, mismo número, sin
       versión amable.
REGLA  Si hubiera dos versiones —una para el que paga y otra para el que sufre— el mercado dejaría de
       corregir y empezaría a negociar.
REGLA  Le dice **qué umbrales está aplicando ella misma**, para que no descubra en el cuadro del jefe
       que su default no es el que creía.
```

**L02 · `GuardaPropiedadCliente`** — REFLEJO · **T**
```text
HACE   revisar( cualquier consulta o sugerencia que cruce tiendas ) → conforme | FALLA
REGLA  Ningún cliente de una tienda aparece en otra: ni por identidad, ni por dirección, ni en un
       agregado, ni como "quizá te interese".
REGLA  Vale también **dentro de la misma plaza**, que es donde el diseño anterior no miraba: dos
       tiendas del mismo barrio, en la misma instalación, no comparten una ficha.
REGLA  Es lo que hace que el escaparate sea SUYO y no una ficha del montón. Sin este test, la promesa
       al restaurante es literatura.
```

**L03 · `PuntualidadDeclarada`** — REFLEJO · **T**
```text
HACE   medir( tienda, franja ) → { distribución de hora-de-listo frente a lo prometido , n }
REGLA  Publica una DISTRIBUCIÓN, no una nota. "Esta cocina se pasa 4 minutos la mitad de las veces" es
       información; "esta cocina tiene un 3 sobre 5" es un juicio.
REGLA  Se publica ANTES de que el rider acepte, y la usa A08 para medir su espera probable. Es el
       bucle que corrige el mercado sin que nadie sancione.
REGLA  Sin datos suficientes → NO_CONSTA, y el rider ve "sin histórico". Un mercado nuevo no puede
       inventar una reputación — y una plaza recién abierta tampoco (§0.5 de la F2, Q51).
```

**L04 · `ResumenParaLaTienda`** — AGENTE (el borde) · **T**
```text
HACE   redactar( hechos ya medidos de la tienda, periodo ) → párrafo
REGLA  Validador: TODO número citado tiene que existir en los hechos. El agente no descubre nada;
       cuenta lo que ya está medido.
REGLA  No aconseja "baja el precio", no compara con otras tiendas, no opina sobre la cocina. Si se
       cae, el panel (L01) sigue estando y no se pierde nada.
REGLA  No menciona a la plaza ni al nacional. La tienda no necesita saber cuántos niveles hay encima
       para llevar su cocina.
```

### 5.4 · Recuento de clases (el que se audita)

| Grupo | Piezas F2 | Clases | Unidad | Formas |
|---|---|---|---|---|
| A · propuesta-enlace | 35 | 35 | P | 27 R · 6 C · 1 P · 1 F |
| B · ruta-viva | 6 | 6 | P | 3 R · 3 C |
| C · pedido | 7 | 7 | **T 4 / P 3** | T: 2 R · 1 C · 1 P; P: 1 R · 1 C · 1 P |
| D · plaza-tienda | 8 | 8 | **T 6 / P 2** | T: 1 CV · 1 R · 4 C; P: 2 R |
| E · tarifa | 7 | 7 | **P 6 / T 1** | P: 3 C · 2 R · 1 CV; T: 1 C |
| F · reparto-medido | 7 | 7 | P | 3 C · 1 R · 2 P · 1 F |
| G · adjudicación | 6 | 6 | P | 2 C · 3 R · 1 P |
| H · liquidación | 6 | 6 | P | 1 C · 3 R · 1 CV · 1 P |
| I · sala-mercado | 8 | 8 | P | 5 C · 2 R · 1 P |
| J · config | 5 | 5 | P | 3 C · 2 R |
| K · cliente final | 2 (+1) | 2 | **P 1 / T 1** | 2 R |
| L · restaurante | 4 | 4 | T | 3 R · 1 F |
| M · repartidor | 5 | 5 | P | 1 C · 3 R · 1 P |
| N · el suelo | 2 | 2 | P | 2 R |
| O · rol jefe | 4 (+1 N) | 4 | P | 3 C · 1 R |
| P · rol trabajador | 4 | 4 | P | 2 C · 2 R |
| Q · rol cliente | 1 | 1 | P | 1 R |
| S · frontera | 2 | 2 | P | 2 R |
| **R · federación** | **25 (+1)** | **25** | **N** | 11 C · 11 R · 3 P |
| **total** | **144 (+3)** | **144** | **N 25 · P 103 · T 16** | **75 R · 50 C · 13 P · 3 CV · 3 F** |

**Los tres contenedores** (`Nacional`, `Plaza`, `ProyectoDeTienda`) no cuentan: no son piezas del
árbol, son los objetos que las contienen. Y hay cuatro formas más que tampoco son piezas y que el
diseño necesita para hablar: `Hecho` (lo que ocurrió, con hora y autor), `Foto` (lo que se vio, con
su huella), `Política` (los números con su capa y su vigencia) y `SolicitudDecisión` (§8).

**Los tres agentes** —A18 (adornar la propuesta), F07 (leer una incidencia), L04 (resumir para la
tienda)— reciben datos ya calculados y devuelven lenguaje. Ninguno escribe, ninguno elige, ninguno
puntúa, **y ninguno está en el nacional**. Si los tres se caen a la vez, el mercado sigue proponiendo,
aceptando, entregando y cobrando con las versiones sin adornar.

**Las tres piezas sin clase**, porque no se sabe si existen:

```text
K03  transparencia-del-enlace     [ABIERTA]  ¿el cliente sabe que su pedido comparte viaje? (Q20)
M06  pasaporte-de-rider           [ABIERTA]  ¿la credencial del rider viaja entre plazas? (Q44)
R26  canon-de-plaza               encendida por la decisión C en su forma de %; el coeficiente es Q41
```

---

## 6 · Puertos abiertos — todo lo de fuera entra por aquí

El diseño **no sabe** con qué se hace cada cosa de fuera. Sabe **qué exige** de cada cosa de fuera. Un
puerto es una promesa mínima: si el sitio donde se instala una plaza no puede cumplirla, no se
instala, o se cambia la pieza de fuera — no la clase.

```text
PUERTO Reloj
  EXIGE      una sola hora para toda la plaza, con la misma referencia
  NO EXIGE   sincronización perfecta entre plazas; sí que dos hechos del mismo pedido no puedan ir
             "al revés"
  POR QUÉ    la mitad de las medidas de este negocio son restas de dos horas (A08, A09, G02). Con dos
             relojes, la espera es un número inventado y la ventana de 20 s no existe.

PUERTO Tienda   (el canal por el que la tienda opera)
  EXIGE      entregar el pedido · recibir "listo" con hora · publicar el catálogo y el estado
  NO EXIGE   una superficie concreta. Que la tienda no cambie de herramienta es una condición
             comercial fuerte, pero es del sitio, no del diseño.

PUERTO Cliente  (el canal de la tienda hacia su cliente)
  EXIGE      entregar avisos de estado y de reparto SIN marca de Bocaos, ni de la plaza, ni del
             nacional (K02)
  NO EXIGE   una aplicación propia. De hecho lo PROHÍBE: si el canal es una app de Bocaos, el cliente
             deja de ser de la tienda y el modelo cambia.

PUERTO Rider    (por donde le llega la propuesta)
  EXIGE      entregar una propuesta en menos de la ventana, y devolver el sí/no/silencio con hora
  NO EXIGE   una superficie concreta: es intercambiable por diseño
  CRÍTICO    es el único puerto con latencia crítica del sistema. Una ventana de 20 s que llega 8 s
             tarde es una ventana de 12 s, y una ventana de 12 s es una asignación disfrazada.
  UNA POR PLAZA  un rider con dos plazas recibe por dos canales, y su móvil los suma.

PUERTO Posición (de dónde sale "dónde está el rider")
  EXIGE      un punto con hora y una frescura consultable
  NO EXIGE   frecuencia ni traza continua. El diseño pide UN punto, y la frescura que no tenga se
             nombra (A34). Cuánto se conserva: [ABIERTO Q38], con el límite de que no se recoge
             fuera del horario de trabajo.

PUERTO Ruta     (de dónde salen los metros y los minutos)
  EXIGE      metros y minutos entre dos puntos, y la inserción de una parada en una ruta
  NO EXIGE   un modo de cálculo concreto. Si es línea recta, por calle o con tráfico cambia el número
             y con él cuántos pasan el umbral: [ABIERTO Q37]. El diseño sólo exige que el modo esté
             DECLARADO, porque un desvío medido de dos maneras distintas no es comparable consigo
             mismo.

PUERTO Cobertura (la geometría de "hasta dónde llega")
  EXIGE      decir si una dirección cae dentro de una zona declarada, y con qué plaza se corresponde
  NO EXIGE   polígono, radio ni lista de códigos postales: es configuración de cada plaza y de cada
             tienda. La vertical sólo exige que exista, que se declare y que filtre.

PUERTO Cobro    (cómo se cobra a cada parte)
  EXIGE      cobrar a una parte, por el canal que ella declare, el importe de SU documento
  NO EXIGE   cobrar por cuenta de otro. El diseño prohíbe que la plaza cobre o pague importes ajenos
             (H06): el puerto sólo sirve para la cuota propia.

PUERTO Prueba   (foto y confirmación de entrega)
  EXIGE      guardar una prueba con hora, y decir si no la hay
  NO EXIGE   foto obligatoria: si es opcional lo dice la plaza [ABIERTO Q30], y la falta se trata
             como hecho, no como hueco.

PUERTO Sala     (cómo se avisa a una persona)
  EXIGE      entregar un caso con su traza y admitir un plazo
  NO EXIGE   presencia permanente. Si no hay nadie, el caso queda vivo y visible (I07).

PUERTO Catálogo (de dónde sale la carta de una tienda)
  EXIGE      una única fuente por tienda, consultable
  NO EXIGE   que la plaza la guarde. D02 proyecta; no almacena una segunda carta.

PUERTO Documento (el documento de cobro)
  EXIGE      emitir un documento con importes, periodo y parte
  NO EXIGE   un formato fiscal concreto: IVA y forma jurídica [ABIERTO Q4].

PUERTO Publicación  (cómo sube un hecho de una plaza al registro)
  EXIGE      entregar los cuatro hechos de §9.1 y **no admitir consultas**: el registro no pregunta
  NO EXIGE   un transporte concreto, ni orden, ni garantía de entrega. Un hecho perdido se recompone
             en la siguiente publicación; la plaza no espera acuse.
  POR QUÉ    si este puerto fuera una consulta, el nacional tendría los pedidos por la puerta de
             atrás y la federación se caería sin que nadie tocara una regla.

PUERTO Puesta en marcha  (cómo se deja una plaza viva)
  EXIGE      arrancar una plaza con una versión y hacerla responder
  NO EXIGE   una forma concreta de instalarla. El diseño sólo exige que **después se pueda
             verificar** (R08): un arranque que no se puede comprobar es una fe.
```

**La prueba del plasma**: ninguno de estos catorce puertos nombra un producto, un proveedor ni una
técnica. Todos podrían cumplirse con cosas distintas en dos ciudades distintas, y el diseño no
cambiaría una línea. Ningún puerto está cableado dentro de una fórmula: las clases **piden** y
reciben `NO_CONSTA` si el puerto no está.

---

## 7 · Flujos

Los flujos son el orden en que las clases se hablan. **Ninguno decide**: cada uno mide, pide o
escribe; donde hay que elegir hay una `SolicitudDecisión` (§8).

### 7.1 · El enlace por pedido — los ocho pasos (el producto)

```text
① LLEGA EL HECHO                                            [en la plaza, de una tienda suya]
     HoraDeListo.declarar( tienda, pedido, hora )
        → HechoPedidoListo.anotar( … )                 // el dato viaja DENTRO del hecho
        → sella plaza_id (el de la plaza, no el que llama)

② SE TOMA LA FOTO                                   [una sola vez, y se congela]
     vista    ← ComposiciónDeLaVista.componer( hecho, ahora )
     foto     ← CongelaciónDeLaFoto.congelar( vista )
     política ← VersiónEfectiva.en( ahora, hecho.tienda )      // tienda si declaró, si no plaza

③ SE FILTRAN
     C ← CandidatosElegibles.de( foto )               // estado + zona + capacidad, declarados
                                                      // y sólo riders de ESTA plaza

④ SE MIDEN                                          [para cada candidato, en el orden de la política]
     desvío  = A07( A05(c,foto) , A06(c,hecho,foto) )     // puede insertar parada de otra tienda
     espera  = A08( c, foto, hecho.hora_listo )           // contra el histórico del local
     retraso = A10( A09( cada parada a bordo ) )          // contra SU promesa guardada
     cobra   = A11( hecho.precio , desvío , espera , coste(c) )
     //  si alguno = NO_CONSTA → A34.nombrar(c, faltantes) y se salta el candidato

⑤ SE COMPARA
     A12.pasa(medidas, política) → sí | no + cuál falló      // cuatro tests, AND, cero pesos

⑥ SE PROPONE A UNO
     p ← A13.emitir( hecho, c, medidas, huella(foto), política )
     A15.abrir( p, J02.duración )
     M04.entregar( A18.adornar( A17.componer( A16.de(medidas, política) ) ), c )
        // el rider ve: de qué plaza · desvío · espera · retraso · cobra · una frase · qué umbrales

⑦ SE ESPERA                                        [tres desenlaces, los tres válidos]
     ├ el rider acepta    → A19.aceptar → A14.cerrar(aceptada) → A20 → A24.crear contrato
     ├ el rider rechaza   → A21.anotar  → A14.cerrar(rechazada) → A25.siguiente
     └ no contesta        → A15.vencer  → A23.anotar  → A14.cerrar(caducada) → A25.siguiente

⑧ SI NADIE ACEPTA
     A25 devuelve NINGUNO al agotar el tope
        → A26.escalar( pedido, intentos )
              ├ PIDE SubidaDeOferta (E07) → espera a que un humano la suba (§8, D1)
              ├ PIDE AvisoSala (I07)      → el caso entra en la cola con su traza (P01)
              └ o vuelve a empezar con otro candidato, si el tope no se agotó
     // el pedido NO se cierra por silencio del sistema: sigue vivo y visible
```

**Lo que este flujo NO tiene, y es lo que lo define**: no tiene un paso donde alguien mire el
conjunto. No hay cola de pedidos que repartir, no hay re-optimización del día, no hay
emparejamiento global. El resultado del mercado **emerge** de muchos pasos ①–⑦ tomados a la vez — y
emerge **por plaza**, porque el paso ② no puede ver más allá de su censo.

### 7.2 · El pedido, de la carta a "listo"

```text
CartaPública.proyectar( catálogo de la tienda )          → lo que el cliente puede ver
CarritoTienda.añadir( … )                                → el buffer de ESE cliente en ESA tienda
PrecioCerrado.cerrar( carrito, oferta, incentivo )        → céntimos, con desglose
CapturaPedido.alta( cliente, líneas, oferta )             → Pedido   [nace con precio cerrado]
   ├ RegistroClienteTienda.de( cliente, tienda )          · si es invitado, igual es de la tienda
   └ OfertaCliente.estipular( pedido, céntimos )          · se congela aquí y no se toca
AvisoTienda.avisar( tienda, pedido )  → EstadoPedido.transitar( …recibido )
EstadoCocinaVisible.ver( pedido )  ·  AvisoCliente.avisar( cliente, … )   → el cliente sabe qué pasa
HoraDeListo.declarar( tienda, pedido, hora )              → el disparador de §7.1
```

Fricción atendida: el cliente deja de llamar para preguntar. **Lo que no se resuelve**: que la comida
esté buena. Eso es de la tienda y el diseño no lo finge.

### 7.3 · El reparto medido

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

### 7.4 · El fallo: medir, no juzgar

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

La corrección **no la hace Bocaos**: la hace el mercado con la información que Bocaos mide. Por eso el
cuello no se resuelve "empujando riders", sino midiendo bien y no estorbando.

### 7.5 · La liquidación: dos niveles, un solo dinero que se mueve

```text
EN LA PLAZA
CicloSemanal.abrir( periodo )
   por cada contrato cerrado del periodo:
        Devengo.acumular( parte, periodo )      → seguro + en duda   [Q18 en la duda]
        // tienda: fijo del tramo + 20 c/pedido aceptado
        // rider : 10 c/pedido aceptado
        // NUNCA por km ahorrado, NUNCA por % del ticket (A32, H06)
        // los cargos por fallo (G04) entran como deuda de la parte
CicloSemanal.cerrar( periodo )                   → Cierre inmutable   [corte: ABIERTO Q26]
   ├ FacturaGestión.emitir( cierre, parte )      → documento de cobro   [IVA: ABIERTO Q4]
   └ CobroGestión.cobrar( documento, canal )     → Cobrado | Fallido
         └ ImpagoGestión.aplicar( deuda, días )  → recordatorio → recargo → suspensión
              // la suspensión NO corta pedidos en vuelo ni propuestas vivas
   └ publica: plaza.devengo-cerrado { plaza_id, periodo, total, partes }

ARRIBA (si existe el nacional)
ConsolidaciónNacional.consolidar( periodo )      → suma los cierres publicados, con su definición
CanonDePlaza.calcular( devengo_cerrado, coef )   → céntimos | NO_CONSTA (Q41)
   └ emitirDocumento( plaza, periodo )           → documento A LA PLAZA
        // la plaza lo paga por su canal. El nacional no entra en el ciclo de la plaza,
        // no lo descuenta, no lo retiene, no lo compensa con otra plaza.
```

**El dinero, en una línea, tal como está diseñado:**

```text
cliente ─── comida ──────────────► tienda          (Bocaos no lo toca)
cliente ─── reparto ÍNTEGRO ─────► rider           (Bocaos no lo toca)
tienda  ─── tramo 1 + 20 c/pedido ► plaza          (semanal, por SU plaza)
rider   ─── 10 c/pedido aceptado ─► plaza          (semanal, por SU plaza)
plaza   ─── % de su fee ─────────► nacional        (sólo con 2 plazas — decisión C)
```

**Lo que este dibujo tiene de incómodo, y hay que decirlo**: con una sola plaza, la caja de Bocaos es
la caja de esa plaza y el nacional no existe; con dos, el nacional vive de un porcentaje de lo que
cada plaza cobra, así que **el registro cobra sin haber movido un pedido**. No es recaudar (el
documento es a la plaza, no al cliente ni a la tienda), pero es un ingreso que depende del volumen de
un mercado que no opera. Eso es la decisión C, y su precio es que el nacional tiene interés en que
las plazas crezcan — que es exactamente lo que se le pide.

### 7.6 · Abrir una plaza — y el día que nace el nacional

```text
AltaDePlaza.abrir( localidad, responsable, versión ) → Acta | SIN_RESPONSABLE

   ├ SI ES LA PRIMERA PLAZA
   │     · escribe su propia acta de constitución (Q60·F3: quién firma esa primera línea)
   │     · NO se crea ningún nacional, ningún padrón y ningún canon
   │     · se busca en su propio índice (D07), no en R10
   │     · nace con sus números: si no los declara, **no propone** (no hereda de nadie)
   │
   └ SI YA HAY UNA PLAZA OPERANDO
         · el NACIONAL nace en el mismo acto: se abre el padrón (R01) y adopta la primera plaza
         · empieza a recibir `plaza.viva` de las dos
         · se enciende CanonDePlaza con el coeficiente de Q41

PuestaEnMarchaDePlaza.ponerEnMarcha( plaza, versión )       → intento
VerificaciónDePuestaEnMarcha.comprobar( plaza )             → ¿responde? ¿con qué versión? ¿con sus
                                                              tiendas vivas?
EstadoDePlaza.transitar( naciendo → operando )              → sólo con la verificación en verde
```

Y el estado inicial de una plaza nueva, que es el cuello del crecimiento y que este diseño **no
resuelve**: sin histórico no hay `PuntualidadDeclarada`, no hay espera medida, `HuecoDeMedida` manda
y **no hay propuestas**. Las tres salidas —umbrales laxos de arranque, periodo de observación, o
heredar histórico de otra plaza— son decisiones del dueño y ninguna está declarada (Q51). La
segunda choca con la ley de cero supuestos; la tercera, con la regla 2 (el histórico no viaja). El
diseño deja el cuello nombrado y las tres sobre la mesa.

### 7.7 · El cambio de criterio — dos capas, dos actas, un solo registro

```text
CAPA DE LA PLAZA (el default del barrio)
SimuladorDeUmbrales.simular( política_nueva, hechos, zona, ámbito=plaza )  → qué habría pasado
        ↓
SolicitudDecisión( «cambiar el default», ámbito = plaza )      → el dueño de la plaza decide
        ↓
ActaDeDecisiones.asentar( cambio, motivo, autor, desde, plaza )
        ↓
ConfigUmbrales.declarar( plaza, valores, autor, desde )        → nueva versión del default
        ↓
VersiónEfectiva.en( instante, tienda )                         → rige donde no hay declaración

CAPA DE LA TIENDA (su propio juego de números)
SimuladorDeUmbrales.simular( política_nueva, hechos, zona, ámbito=tienda )
        ↓
SolicitudDecisión( «cambiar mis umbrales», ámbito = tienda )   → el dueño de la tienda decide
        ↓
ActaDeDecisiones.asentar( …, autor = la tienda, ámbito = tienda )
        ↓
ConfigUmbrales.declarar( tienda, valores, autor, desde )
        ↓
VersiónEfectiva.en( instante, tienda ) → rige para sus pedidos, y su capa se escribe en A13/A16

[si el cambio afecta a pedidos en vuelo → ABIERTO Q4; la propuesta viva conserva su versión]
```

**Lo que este flujo impide**: que el dueño de la plaza cambie los números de una tienda que declaró
los suyos. No hay método. Puede cambiar el default, y puede ver en O01 qué está declarando cada
tienda — información, no control. Si eso le parece poco, la pregunta es Q62·F3: **¿puede la plaza
retirarle a una tienda el derecho a declarar umbrales, y con qué acto?** Hoy no puede, y el diseño lo
dice en vez de dejarlo implícito.

### 7.8 · La revisión humana de una decisión automática

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

**Y con tres unidades hay una frontera nueva**: la revisión es de la plaza donde se decidió. Un
rider puede pedir revisión de su propuesta en Málaga; no puede pedirle al nacional que revise a
Málaga, porque el nacional no tiene la propuesta ni la foto. Si el nacional pudiera dictaminar sobre
una propuesta de una plaza, el registro tendría el planificador que le falta.

### 7.9 · El rider en dos plazas — lo que el diseño puede y lo que no

```text
AltaRider( plaza A )   y   AltaRider( plaza B )     → dos altas, dos censos, dos acreditaciones
M01 CarteraRider(A)    y   M01 CarteraRider(B)      → dos carteras, dos ciclos, dos moras (Q45)
B01 PosiciónRider      → la comparte el rider, pero el dato es de la plaza donde trabaja AHORA
M04 CanalRider         → dos canales; su móvil los suma y puede sonar dos veces
M05 VistaDePropuesta   → dice de qué plaza es y con qué umbrales, o el rider no puede distinguir
B05 CapacidadDeclarada → POR PLAZA. Y aquí está el agujero.
```

**El agujero, escrito sin adornos**: el rider tiene **un cuerpo** y dos mercados. Si está llevando
tres pedidos en la plaza A, la plaza B sigue leyendo "cabe tres", porque su capacidad está declarada
por plaza y la plaza B no puede saber qué hace en la A sin cruzar la frontera que este diseño
prohíbe. La única protección es que **él declare la pausa** en la plaza donde no está (I04) — es
decir, la protección es un acto suyo, no una garantía del sistema.

```text
salidas posibles, ninguna declarada:
  1 · la pausa se declara a mano al cruzar            → depende de su disciplina, y en la cena falla
  2 · una capacidad "compartida" entre plazas          → es un dato que cruza: prohibido por §1.3
  3 · un tope físico único que él declara por día      → no es un dato de ninguna plaza: es suyo
     y entonces el rider tendría un contador propio… que las plazas no pueden leer.
```

Es Q44/Q45 y el diseño no lo cierra. Lo que sí hace es no fingir que no existe: `M01` dice "una por
plaza", `B05` dice "por plaza", y la consecuencia está aquí.

### 7.10 · El día en que el nacional está apagado (la auditoría 4, como flujo)

```text
09:00  el registro no responde. Nadie lo nota dentro de una plaza.
09:14  una tienda declara listo → A01 anota en SU plaza
09:14  A02 compone la foto con los riders de SU plaza
09:14  A12 aplica la política: la de la tienda o la de la plaza — **ninguna viene de arriba**
09:14  A13 emite, A15 abre ventana, M04 entrega por el canal de SU plaza
09:15  el rider acepta → A24 crea contrato
21:00  el pedido se entrega, F01 anota, H01 devenga
23:59  CicloSemanal cierra la semana y CobroGestión cobra
       ├ ¿el canon? No se emite: no hay quien lo emita. La plaza no lo necesita para cerrar.
       └ el cuadro de la federación está vacío, y eso es todo lo que se pierde: el mapa.

lo único que falla sin el nacional:
  · buscar una tienda por localidad (el cliente entra por el nombre de su tienda, no por el buscador)
  · abrir una plaza nueva (no hay padrón donde anotarla)
  · saber si una plaza lleva tres días callada
  · emitir el canon de la semana
```

**Y eso es la prueba**: si al borrar el nacional el negocio se cae, el nacional no era un registro.
Aquí no se cae ni una propuesta, ni un contrato, ni un céntimo — porque **no hay una sola flecha de
una plaza hacia arriba** (§1.3).

---

## 8 · La decisión humana — `SolicitudDecisión` con ámbito

**Una sola forma para todas las decisiones que no son del sistema.** Si hay dos formas, una de ellas
acabará siendo una decisión automática disfrazada. Y con tres unidades hay una segunda regla, tan
importante como la primera: **cada solicitud tiene un ámbito, y sólo responde quien puede dentro de
él**.

```text
CLASE SolicitudDecisión
  DATOS   asunto · ámbito (tienda | plaza | nacional) · hechos citados (con hora y autor)
          opciones, cada una con su consecuencia escrita · quién puede responder · plazo
          qué pasa si vence · efecto de cada opción
  HACE    abrir( … ) → Solicitud
          responder( quién, opción, motivo ) → Decisión firmada
          vencer( ahora ) → sube de prioridad y SIGUE VIVA
  REGLA   Ninguna opción puede tener por efecto "asignar un pedido a un rider" (A27). Si una opción
          lo hiciera, la solicitud no se abre: el acto es ilegal por la puerta de atrás.
  REGLA   Ninguna opción puede ser "que decida el sistema" ni "aplicar la recomendación". El sistema
          no recomienda: muestra las consecuencias.
  REGLA   Vencer NO resuelve. Una solicitud vencida no se cierra sola ni "se aplica por defecto": se
          queda visible y sube de prioridad. Un plazo que resuelve solo es un automatismo con reloj.
  REGLA   **El ámbito no se cruza.** Una solicitud de tienda la responde el dueño de esa tienda; una
          de plaza, el de la plaza; una de federación, el de la federación. El de arriba no puede
          responder una de abajo aunque sea la misma persona el mismo martes: la firma dice el
          ámbito, y el acta guarda cuál era. Sin esto, "el dueño decide" es una frase que con tres
          unidades ya no significa nada.
  REGLA   Toda decisión queda firmada y con su motivo, y de ahí sale un HECHO (nunca una
          re-optimización).
```

### 8.1 · Dónde aparece (y dónde no)

| # | Se abre una `SolicitudDecisión` cuando… | Ámbito | Puede responder | Si vence |
|---|---|---|---|---|
| D1 | el pedido no encuentra a nadie y hay que **subir la oferta** (Q17) | plaza | cliente · tienda · dueño de la plaza | la deuda queda viva, el caso en la cola |
| D2 | hay que decidir **quién paga** la subida de oferta (Q17) | plaza | dueño de la plaza | sigue abierta; no se sube |
| D3 | una parte **disputa un cargo** por fallo (Q24) | plaza | sala o dueño de la plaza | sube de prioridad |
| D4 | alguien pide **revisar** una decisión automática (Q25/Q26) | plaza | sala o dueño de la plaza | sube de prioridad |
| D5 | se quiere **cambiar el default** de umbrales, ventana o zona (Q1–Q7) | plaza | dueño de la plaza | no hay cambio |
| D6 | se quiere **abrir o cerrar una zona** (N01) | plaza | dueño de la plaza | sigue abierta como estaba |
| D7 | se quiere **cambiar un tramo** (Q14) | plaza | dueño de la plaza | no hay cambio |
| D8 | hay que decidir el **corte del ciclo** o qué hacer con un cobro fallido (Q26) | plaza | dueño de la plaza | no hay corte |
| D9 | un pedido se canceló **después de aceptar** y hay que decidir si devenga (Q18) | plaza | dueño de la plaza | queda "en duda" en H01 |
| D10 | el alta de una parte está incompleta y alguien pide **excepción** (Q34/Q35) | plaza | dueño de la plaza | no hay alta |
| D11 | la tienda rechaza un pedido y hay que decidir quién paga (Q36) | plaza | tienda + cliente | se anota y **no se cobra** a nadie |
| **D12** | **una tienda quiere declarar sus propios umbrales** (Q1 · Q43) | **tienda** | dueño de esa tienda | siguen los de la plaza |
| **D13** | **se quiere abrir o cerrar una plaza** (Q50) | **nacional** | dueño de la federación | no se abre ni se cierra |
| **D14** | **se quiere retirar la marca a una plaza** o conceder un acceso delegado (Q46) | **nacional** | dueño de la federación | no se retira ni se concede |
| **D15** | **se quiere cambiar el coeficiente del canon** (Q41) | **nacional** | dueño de la federación | no hay canon nuevo |

**Lo que NUNCA es una `SolicitudDecisión`**, y es la lista que define el negocio:

```text
× a quién se le propone un pedido            ← lo decide A12, con cuatro números y una política
× si un pedido se asigna a un rider          ← no se asigna: se propone (A19)
× si un fallo existió                        ← lo dice G02 con hechos, no una persona
× quién gana una carrera de aceptaciones     ← lo dice A14, y gana el primero, no el preferido
× qué ve el cliente de su pedido             ← lo decide C05, y es lo mismo para todos
× si una tienda sale antes en la plaza       ← no hay plaza que ordene (D08)
× si una plaza ve los datos de otra          ← no hay flecha, no hay botón (§1.3)
× si el nacional mira un pedido "un momento"  ← para eso está R19/R21, y sin permiso no hay mirada
```

---

## 9 · Contratos y avisos

### 9.1 · Los seis hechos que cruzan (y los demás, no)

La federación **habla por hechos declarados, no por consultas**. Si el nacional consultara el almacén
de una plaza, tendría los pedidos por la puerta de atrás. Los cuatro que suben y los dos que bajan
son la lista completa: **lo que no está aquí, no cruza**.

```text
SUBEN (plaza → nacional)                      cada uno con plaza_id, que es el suyo por definición
  plaza.viva            { plaza_id, versión, estado, tiendas: N }        periódico y barato
  tienda.dada-de-alta   { plaza_id, tienda_id, nombre, estado }         cuando pasa
  plaza.devengo-cerrado { plaza_id, periodo, total, partes: N }         al cerrar la semana
  plaza.acceso-visto    { plaza_id, quién, alcance, desde, hasta }      al conceder o usar un acceso

BAJAN (nacional → plaza)
  version.nueva         { versión }                    un aviso, no una orden: se actualiza cuando
                                                       se pueda, y saltárselo es correcto
  plaza.suspendida      { plaza_id, motivo }           la única orden que puede dar, y es de
                                                       registro. No apaga la plaza: la saca del mapa
```

**Lo que no está en esa lista, no cruza**: ni un pedido, ni una posición, ni un precio, ni una carta,
ni un rider, ni un cliente, ni un agregado por debajo de la plaza. La `plaza.devengo-cerrado` lleva
`partes: N` y no los nombres: el nacional sabe cuántas partes pagaron, no quiénes.

### 9.2 · La forma de cada aviso

Un aviso es un hecho que se anuncia. **Ninguno de estos avisos decide nada**: quien los recibe decide,
o no hace nada.

```text
AvisoPedidoListo      { pedido, tienda, destino{punto, instrucciones}, hora_listo, precio, punto,
                        plaza_id }
                      lo escribe C04 · lo consumen A01 (§7.1) y nada más

AvisoPropuesta        { pedido, rider, desvío, espera, retraso, cobra, frase,
                        huella de la foto, política{capa, versión, autor}, plaza_id,
                        vence a las HH:MM:SS }
                      lo escriben A13/A15 · lo consume el rider por M04 · es INMUTABLE

AvisoDesenlace        { propuesta, aceptada | rechazada | caducada, hora, autor, plaza_id }
                      lo escribe A14 · lo consumen A25 (avanzar) y I05 (medir)

AvisoContrato         { pedido, rider, precio, hora prometida, tienda, plaza_id }
                      lo escriben A24 · lo consumen B02/B03 (la ruta viva) y F01 (los hechos)

AvisoEstadoPedido     { pedido, estado, hora, plaza_id }     → C02 → podado por C05 → C06
AvisoIncidencia       { pedido, relato, autor, hora, plaza_id } → F06 → F07 → P01
AvisoFallo            { deuda, evidencia[], partes, plaza_id }  → G04 → Q01 y H01
AvisoCierre           { periodo, parte, seguro, en duda, plaza_id } → H02 → H03 → H04
AvisoSala             { caso, tipo, traza, plazo, plaza_id }    → I07 → P01
AvisoHueco            { pedido, rider, [dato_faltante], plaza_id } → A34 → P02 y O01
```

**Regla común a todos**: si un aviso no llega, el hecho **ya está escrito**. El aviso es transporte;
la verdad es el hecho. Un aviso perdido no puede hacer desaparecer un pedido, ni crear un contrato,
ni cobrar nada.

**Y una segunda, nueva**: **todos llevan `plaza_id`**, incluso los que no salen de su plaza. No es
redundancia: es la marca que hace que una fila suelta se pueda atribuir a un mercado y que ninguna se
pueda colar en otro. El sello lo pone el emisor, y el emisor es siempre de la plaza.

### 9.3 · Quién da qué y recibe qué, con tres unidades

| Parte | Da | Recibe | Paga |
|---|---|---|---|
| **cliente final** | su pedido y su oferta de reparto (congelada) | precio cerrado, una hora, seguimiento, prueba y una vía de queja (la tienda) | la comida (a la tienda) y el reparto (al rider) |
| **tienda** | su carta, su marca, su cliente, su hora de listo, su radio, su incentivo y —si quiere— sus umbrales | escaparate propio, pedidos, los riders de su plaza y la medida de su cocina | tramo 1 + tramo 3 (fijo + 20 c/pedido) **a su plaza** |
| **rider** | una decisión libre en ~20 s (o el silencio) y la entrega | cuatro números, una frase que los explique, el importe **íntegro**, su histórico de locales y su cartera | tramo 3 (10 c/pedido aceptado) **a su plaza**, una por plaza |
| **plaza** | el suelo, las reglas por defecto, los riders, la propuesta, la liquidación y la medida | su cuota; y del nacional, marca y software | el canon al nacional (si existe) |
| **nacional** | la marca B2B, la licencia, el software, el soporte, el registro y la consolidación | el canon; y de las plazas, cuatro hechos declarados | — (no paga nada a nadie) |

---

## 10 · Invariantes, auditorías y determinismo

### 10.1 · Las dieciocho renuncias, como tests

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
| 9 | **No ordena el mercado** | `D08` | sin ranking, sin destacados, sin prioridad comprada; filtrar no es ordenar |
| 10 | **No cobra el ticket ni retiene** | `H06` | ningún camino del dinero toca la comida ni el reparto |
| 11 | **El cliente es de la tienda** | `L02` + `K02` | ningún cliente cruza de tienda; ninguna comunicación lleva marca de Bocaos, ni de plaza, ni de nacional |
| 12 | **El rider es autónomo** | `M03` | nada le bloquea por trabajar con otro |
| 13 | **El enlace no cruza plazas** | `A35` | `plaza(pedido) = plaza(rider) = plaza(propuesta)` en toda propuesta y toda parada |
| 14 | **El nacional no tiene el mercado** | `R23` | no existe tabla con carta, precio, carrito, pedido, dirección ni posición |
| 15 | **El nacional no recauda** | `R24` | el único camino de dinero es el canon, y es un documento a la plaza |
| 16 | **Ninguna fila cruza de plaza** | `R25` | toda fila lleva `plaza_id` y coincide con quien la escribió |
| 17 | **Solo se ve lo que reparte** | `S02` + `D06` | el índice no muestra una tienda que no llega a esa dirección |
| 18 | **La marca del nacional no llega al cliente** | `K02` | ninguna comunicación al cliente final lleva la marca del nacional |

**Tres pares que no son la misma renuncia**: `D08` prohíbe **vender** posiciones · `A28` prohíbe
**planificar** el reparto · `R23` prohíbe **tener** el mercado. Un mercado puede no vender nada, no
planificar nada y aun así tener un catálogo nacional — y ese catálogo sería el final del modelo,
igual de rápido.

### 10.2 · Las cuatro auditorías del corte

No basta con la tabla de §2: cada una de estas se puede escribir como un test. Éstas son las que el
enunciado de la fase pide poder pasar.

```text
1 · EL NACIONAL NO TIENE PEDIDOS
    cómo lo cumple   `Nacional` tiene nueve atributos y ninguno es un pedido; el buzón acepta
                     exactamente cuatro formas de hecho y rechaza la quinta.
    test             R23 enumera el almacén del nacional: si aparece `pedido`, `línea`, `importe`,
                     `dirección` o `posición`, rojo.
    qué lo rompería  "guardar una copia por si acaso"; un cuadro con detalle por debajo de la plaza;
                     un soporte que se lleva los datos "para reproducir el fallo".

2 · EL NACIONAL NO RECAUDA (SALVO EL CANON)
    cómo lo cumple   hay un solo camino de dinero que sale del nacional: R26, un documento **a una
                     plaza**, calculado sobre lo que la plaza ya publicó. No cobra a tiendas, ni a
                     riders, ni al cliente; no retiene, no adelanta, no compensa entre plazas.
    test             R24 recorre la lista y falla en el primer camino que no sea ése.
    qué lo rompería  meter el canon dentro del `Devengo` de la plaza (además rompería la auditoría 4);
                     un "anticipo" a una plaza con problemas de caja; un pago al rider en nombre de
                     la tienda.

3 · NINGUNA FILA CRUZA DE PLAZA
    cómo lo cumple   `plaza_id` lo sella el escritor, no el llamante; no hay constructor de fila sin
                     sello; ninguna clase tiene referencia a dos plazas.
    test             R25 compara el `plaza_id` de cada fila con la plaza del que la escribió.
                     En el nacional sólo tres clases escriben con `plaza_id` ajeno (R05, R06, R20) y
                     las tres escriben **sobre** una plaza, no **desde** otra.
    qué lo rompería  un "informe comparativo" entre plazas; un rider compartido entre dos censos;
                     una traza de acceso que se copiara al padrón de otra plaza.

4 · EL NACIONAL SE PUEDE APAGAR
    cómo lo cumple   **no hay una sola flecha de una plaza hacia arriba**. La plaza no tiene ningún
                     atributo que apunte al nacional; su arranque no lo incluye; los dos hechos que
                     bajan son ignorables; su ciclo semanal no contiene el canon.
    test             arrancar una plaza con el nacional ausente y recorrer §7.10: proponer, aceptar,
                     entregar, devengar, cerrar y cobrar.
    qué lo rompería  el canon dentro del ciclo (lo dicho); pedirle la versión al nacional; un
                     "modo degradado" que consulte el padrón para saber si la plaza existe.
```

**Lo que este diseño puede y no puede prometer sobre las cuatro**, porque es la pregunta honesta:

```text
1 · pasa sobre el papel por ESTRUCTURA. Nueve atributos y una puerta que rechaza la quinta forma: se
    puede leer y contar. No hace falta ejecutar nada para ver que no hay dónde poner un pedido.

3 · pasa sobre el papel por ESTRUCTURA, con una excepción declarada y acotada (las tres clases que
    escriben sobre una plaza). El sello en el escritor es lo que lo hace verificable sin revisar cada
    consulta.

4 · pasa sobre el papel por AUSENCIA DE FLECHA, que es lo más fuerte que se puede decir sin ejecutar.
    Lo que NO puedo demostrar sobre el papel es que no haya una dependencia de arranque escondida en
    un puerto (por ejemplo, que el catálogo de la tienda se pida "a través del registro"). Eso se
    prueba encendiendo una plaza sin nacional, y hasta que no se encienda, es una promesa.

2 · pasa, pero con dos asteriscos que no son de diseño y conviene no barrer:
      (a) el coeficiente no existe (Q41): mientras no exista, la auditoría se cumple porque no hay
          canon; el día que exista, hay que volver a pasarla;
      (b) si el nacional consolida datos que identifican a una tienda o a un rider, deja de ser un
          mero encargado y pasa a ser corresponsable (RGPD art. 26): la auditoría dice "no recauda",
          no dice "no es responsable". Eso lo resuelve R22 (el acta) o no lo resuelve nadie — Q53.
```

### 10.3 · Las cinco reglas de determinismo (una más que en la v1)

```text
R1 · DATO AUSENTE = NO_CONSTA
     Hay tres valores distintos y el diseño nunca los confunde:
        CONSTA(x)    el dato está, con su hora y su autor
        NO_CONSTA    el dato no está y NO SE ESTIMA  → A34 lo nombra, el candidato se salta
        NO_HAY       la cosa no existe (no hay contrato, no hay cargo, no hay zona, no hay plaza)
     Un cero sólo se escribe cuando se ha medido un cero. "Sin histórico" no es 0 de puntualidad.

R2 · UNA DECISIÓN, UNA FOTO
     Nada de lo que pasa dentro de F lee el mundo. Si leyera, la explicación que se dio dejaría de
     ser cierta. La foto viaja con la propuesta y se cita al explicarla.

R3 · TODO NÚMERO QUE SE MUESTRA TIENE UN HECHO DETRÁS
     Cada céntimo, cada minuto y cada metro de una pantalla apuntan a un hecho con hora. Vale para el
     rider (A16), para la tienda (L01), para el jefe de la plaza (O01), para el de la federación
     (R15) y para los agentes (los tres validadores). Un número sin hecho es una opinión con formato.

R4 · NINGÚN AGENTE ESCRIBE NI ELIGE
     A18, F07 y L04 reciben datos ya calculados y devuelven lenguaje. No escriben estado, no eligen a
     quién, no puntúan. Su validador es puro y rechaza lo que no está en la entrada. Si se caen, el
     mercado funciona igual. **Y ninguno está en el nacional: no hay agente donde no hay decisión.**

R5 · NINGUNA REGLA VIVE SIN VIGENCIA
     Umbrales, ventana, zona, tramos, ventanas de espera y términos: todos con desde-cuándo y quién.
     Toda propuesta cita la versión **y la capa** que la juzgó (J04), y toda cuenta se hace con la
     versión que estaba viva cuando ocurrió el hecho, no con la de hoy.

R6 · TODA FILA TIENE SU PLAZA, Y LA PONE EL QUE ESCRIBE
     (Nueva en esta versión.) No es una columna que se rellena al guardar: es un sello del escritor.
     Un objeto de una plaza no puede producir una fila de otra, porque no tiene el sello de otra.
```

---

## 11 · Lo que este diseño prohíbe construir

No es una lista de buenas intenciones: son las clases que **no existen** y que no pueden aparecer sin
romper un test de §10.

```text
DEL NEGOCIO (las de la v1, que siguen en pie)
✗ UN PLANIFICADOR            un barrido de pedidos × riders. Rompe A28.
✗ UN SCORER DE CANDIDATOS    cualquier número único que ordene riders como FILTRO. Una fórmula puede
                             ordenar a los que ya pasaron; si filtra, es una nota con otro nombre y
                             rompe A22.
✗ UN MODELO QUE PREDIGA LA COCINA   la cocina declara; no se predice. Rompería C04 y el sentido de
                             L03 (que mide lo declarado, no lo estimado).
✗ UN AGENTE QUE ADJUDIQUE    la tabla mide (G03); el humano, si acaso, firma (O04).
✗ UN CONTADOR DE RECHAZOS    que alimente la elegibilidad. Rompe A22.
✗ UNA NOTA AL RIDER          ni estrellas, ni fiabilidad, ni "prioridad por aceptación pasada".
✗ UNA APP DE CLIENTE         ni cuenta, ni marca, ni atención al cliente final. Rompe K02.
✗ UN CARRITO O UN REGISTRO COMPARTIDO ENTRE TIENDAS   rompe L02 — y ahora también dentro de una misma
                             plaza, que es el caso que la v1 no miraba.
✗ UN RANKING, UN DESTACADO, UNA POSICIÓN COMPRADA      rompe D08.
✗ UN COBRO EN NOMBRE DE OTRO  ni retención, ni adelanto, ni porcentaje del ticket. Rompe H06.
✗ UNA ASIGNACIÓN "SUAVE"     ni auto-aceptar a los N segundos, ni "el sistema elige si nadie
                             contesta", ni la llamada de la sala a un rider concreto. Rompe A27.
✗ UNA ESTIMACIÓN DE LO QUE FALTA      ni posición inventada, ni precio supuesto, ni histórico
                             "razonable". Rompe A34 y R1.

DEL CORTE EN TRES (las que esta versión añade, y son de la misma familia)
✗ UN CATÁLOGO NACIONAL       carta y precios de todas las tiendas: es el marketplace, y con él la
                             captura de la demanda. Rompe R23.
✗ UN ÍNDICE CON PEDIDOS      "sólo para métricas" es como empieza; con él, el nacional puede ordenar
                             el mercado sin querer. Rompe R23.
✗ UNA SALA NACIONAL          el soporte que empieza mirando un pedido acaba asignando riders.
✗ UNA PUNTUACIÓN FEDERAL DE RIDERS   el histórico no viaja (regla 2); una nota federal es el
                             histórico viajando por la puerta de atrás, y además es control.
✗ UN CUADRO CON DEMASIADO DETALLE   no es una pieza, es una tentación: si el jefe del nacional puede
                             bajar hasta el pedido, tiene poder sin responsabilidad. La frontera no
                             la pone la clase: la pone Q56.
✗ UN "MODO FEDERADO" QUE CONSULTE AL NACIONAL   cualquier flecha P→N que no sea publicar un hecho.
                             Rompe la auditoría 4 en el primer arranque.
✗ UN CANON DENTRO DEL CICLO DE LA PLAZA   si la plaza necesita al nacional para cerrar su semana, el
                             nacional no es un registro: es un socio con la mano en la caja.
✗ UNA CAPACIDAD COMPARTIDA ENTRE PLAZAS   sería el dato que hace imposible sobrecargar a un rider, y
                             sería también el primer dato que cruza. §7.9 lo deja como deuda.
✗ UN UMBRAL DE LA PLAZA QUE MANDE SOBRE LA TIENDA QUE YA DECLARÓ   la plaza fija el default; no
                             legisla por la tienda. Rompe §1.7.
✗ UN CANAL DE SOPORTE PERMANENTE   "acceso de administrador" es la sede con otro nombre. Rompe R19.
```

---

## 12 · Las fricciones, con la novena

| Par | Pieza(s) | Lo que **no** se resuelve |
|---|---|---|
| cliente ↔ restaurante | `D03` · `C05` · `C06` · `A08` | que la comida esté buena |
| restaurante ↔ rider | `L03` · `A08` · `G01` · `L01` | la cocina lenta: sólo se hace **visible y cobrada** |
| rider ↔ cliente | `F02` · `F03` · `F04` · `F05` | que el cliente baje |
| restaurante ↔ Bocaos | `L02` · `N02` · `Q01` | el miedo a perder su cliente: lo resuelve el primer mes funcionando |
| rider ↔ Bocaos | `M01` · `M03` · `M05` · `A16` | que haya pedidos suficientes el primer mes |
| cliente ↔ Bocaos | `K02` · `K01` | que el cliente sepa que Bocaos existe — **y eso es deliberado** |
| restaurante ↔ restaurante | `D08` · `D07` · `S02` | que compitan: es un mercado, competir es el punto |
| rider ↔ rider | `A04` · `D08` · `A33` | que gane el rápido: es lo que debe pasar |
| **plaza ↔ nacional** | `R17` · `R22` · `R20` · `R03` | **que el nacional tenga responsabilidad sin autoridad** |

**La novena, que es la fricción de esta versión:**

```text
fricción   la marca es compartida y la culpa es local. Una plaza que cocina mal o estafa a un cliente
           daña una marca que el nacional posee y no puede corregir. Y al revés: el nacional puede
           sacar del mapa una plaza que funciona, por una decisión de marca, y con ello apagar un
           mercado entero.

Bocaos     licencia de marca con condiciones y retirada (R17) · acta de federación (R22) · traza de
           acceso (R20) · estado de plaza (R03)

NO resuelve  que el nacional tenga responsabilidad sin autoridad. Sus tres únicos instrumentos son:
             no dejar entrar, sacar, retirar la marca. Los tres llegan tarde.
             Si se le da acceso para corregir → tiene los pedidos → deja de ser federación.
             Si no → la marca es rehén de la peor plaza.
```

**No hay tercera vía y el diseño no la inventa.** La mitigación honesta es de contrato, no de
software — y es una decisión que el dueño tiene que tomar sabiendo lo que compra al federar.

---

## 13 · Preguntas abiertas `[ABIERTO]`

**De las 56 de la F2, cuatro las ha cerrado la F0 §7 y este diseño las implementa. Las otras 52
siguen abiertas** —una de ellas, Q41, a medias—, con su clase asignada. Un supuesto con nombre se puede deshacer; uno silencioso, no
— por eso las cerradas también se listan.

```text
CERRADAS POR LA F0 §7 (y por eso este diseño las da por hechas, con la cita)
  Q1   ¿de quién son los cuatro números?          → del PROYECTO, con default de la PLAZA (§1.7)
  Q43  ¿puede una tienda tener umbrales propios?  → sí, y sólo los cuatro números (§1.7)
  Q31  ¿se enlazan pedidos de tiendas distintas?  → sí, y siempre dentro de una plaza (§1.8)
  Q55  ¿la plaza es un proyecto o una instalación? → una instalación con N proyectos dentro (§1.4)
```

| Q | Tema | Dónde vive en el diseño | Estado |
|---|---|---|---|
| Q1 | los cuatro números y su dueño | `J01` (valores) · `J04` (precedencia) | **[CERRADA · F0]** proyecto, default plaza |
| Q2 | `cobra` bruto o neto | `A11` · `A12` | ABIERTA · **cambia si el mercado propone o no** (§4.2) |
| Q3 | ¿un juego de umbrales por zona? | `J03` · `J04` | ABIERTA |
| Q4 | vigencia: ¿rige para el pedido en vuelo? | `J04` · `A31` | ABIERTA |
| Q5 | ¿la ventana es fija? ¿y si va conduciendo? | `J02` · `M04` | ABIERTA |
| Q6 | en serie o en paralelo | `J02` (tope y duración) · `A25` · `A33` | ABIERTA · **bloquea** |
| Q7 | el orden de candidatos | `J01.orden` · `A25` | ABIERTA · **bloquea** |
| Q8 | ¿el orden puede depender de datos del rider? | `A22` | ABIERTA (el diseño lo **prohíbe**) |
| Q9 | ¿se le muestra su propia tasa de rechazo? | `A21` | ABIERTA |
| Q10 | ¿basta la pausa declarada? | `I04` · `M02` | ABIERTA |
| Q11 | ¿puede rechazar **con motivo**? ¿a quién alimenta? | `A21` · `F07` | ABIERTA |
| Q12 | «acepta y no aparece»: ¿qué pierde? | `F01` · `C07` · `P03` | ABIERTA |
| Q13 | ¿puede devolver si el local se pasa de la espera? | `C07` · `B03` | ABIERTA |
| Q14 | los tramos | `E06` | ABIERTA · **bloquea** · hay valores de ejemplo |
| Q15 | ¿el enlace abarata el reparto al cliente? | `K03` (**sin clase**) · `D03` | ABIERTA |
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
| Q31 | ¿pedidos de tiendas distintas en el mismo viaje? | `A06` · `A35` | **[CERRADA · F0]** sí, intra-plaza |
| Q32 | ¿consecuencia por cocina lenta repetida? | `L03` · `I03` | ABIERTA (hoy: visible y más caro) |
| Q33 | ¿cuántos pedidos caben? | `B05` | ABIERTA |
| Q34 | ¿qué acredita el rider y quién lo verifica? | `I02` · `P04` | ABIERTA |
| Q35 | ¿exclusividad, permanencia o admisión de tienda? | `I01` · `I08` | ABIERTA |
| Q36 | ¿la tienda puede rechazar y quién paga? | `C07` | ABIERTA |
| Q37 | «cerca» y «desvío»: ¿recta, calle, tráfico? | `A07` · Puerto Ruta | **ABIERTA · cambia cuántos pasan** |
| Q38 | ¿cuánto se guarda la traza? | `B01` · `F02` | ABIERTA (90 días para la posición, F0) |
| Q39 | ¿invitado? ¿ve el desglose? | `D05` · `D03` | ABIERTA |
| Q40 | ¿quién atiende la sala y a qué hora? | `P01` · `I07` | **ABIERTA · crítica** |
| Q41 | ¿con qué se paga el nacional? | `R26` | **PARCIAL**: la forma (% del fee) la fija la decisión C; **el coeficiente no** |
| Q42 | ¿quién factura a la tienda? | `E06` · `R22` | ABIERTA · **bloquea** |
| Q43 | ¿puede una tienda tener umbrales propios? | `J01` · `J04` | **[CERRADA · F0]** sí, con default de plaza |
| Q44 | ¿la credencial del rider viaja entre plazas? | `M06` (**sin clase**) | ABIERTA · abre una pieza |
| Q45 | ¿las N carteras del rider se consolidan? | `M01` | ABIERTA |
| Q46 | ¿el soporte puede ver pedidos? ¿con qué permiso? | `R18` · `R19` · `R21` | **ABIERTA · crítica** |
| Q47 | ¿puede una plaza salir? ¿qué ve el cliente si cae? | `R03` · `R11` | ABIERTA |
| Q48 | ¿el buscador busca qué? | `R11` | ABIERTA (lectura: localidad y nombre) |
| Q49 | ¿hay marca de plaza? | `D01` · `R17` | ABIERTA |
| Q50 | ¿quién abre una plaza? | `R02` | ABIERTA · **bloquea** |
| Q51 | ¿cómo arranca una plaza sin histórico? | `L03` · `A34` · `§7.6` | **ABIERTA · cuello del crecimiento** |
| Q52 | ¿un pedido puede cruzar la frontera de una plaza? | `S01` | ABIERTA · hoy: `AMBIGUA` y no hay pedido |
| Q53 | ¿para qué consolida el nacional? | `R14` · `R15` · `R22` | ABIERTA |
| Q54 | ¿qué datos mínimos de una tienda viajan? | `R05` | ABIERTA (lectura: id, nombre, estado, plaza) |
| Q55 | ¿la plaza es un proyecto o una instalación? | `Plaza` · `ProyectoDeTienda` | **[CERRADA · F0]** instalación con N proyectos |
| Q56 | ¿el cuadro de la federación se publica hacia abajo? | `R15` | ABIERTA · **es la que decide si el nacional es espejo o supervisor** |

### 13.1 · Las seis que **destapa este diseño** (no existían en la F2)

```text
Q57·F3  ¿De dónde sale el COSTE del desvío y de la espera del rider?
        Si `cobra` es neto (Q2), el cuarto umbral necesita €/km y €/min del rider, y no existen. Tres
        salidas —él los declara, la política los declara para todos, o se deducen de su historial— y
        la tercera es una nota con otro nombre (A22).
        MIENTRAS NO SE RESPONDA: A11 devuelve neto = NO_CONSTA, el cuarto test no se aplica, y el
        mercado no propone nada. Es el hueco más caro del diseño y aparece justo al elegir neto.
        (La v1 lo numeró Q41·F3, que chocaba con el canon de la F2; aquí se renumera.)

Q58·F3  El canon, ¿se calcula sobre lo DEVENGADO de la plaza o sobre lo COBRADO?
        Sobre lo devengado, el nacional cobra aunque la plaza no cobre, y entonces tiene interés en
        que la plaza apriete a sus morosos: un interés sobre el mercado, aunque no tenga un botón.
        Sobre lo cobrado, el nacional comparte el riesgo del impago — que es lo más parecido a ser
        socio, y la F0 no lo dice.

Q59·F3  Cuando el umbral que juzgó una propuesta es el de la TIENDA y no el de la plaza, ¿quién
        responde de la explicación?
        El diseño garantiza que la frase diga la capa y el autor (A16), y que el replay use esa
        versión (A29). No puede decidir de quién es la responsabilidad — y con dos capas, esa
        pregunta no existía.

Q60·F3  Con una sola plaza no hay nacional: ¿quién escribe la primera línea del padrón, y con qué
        acto?
        El diseño hace que la primera plaza se declare a sí misma en su acta de constitución y se
        busque en su propio índice. Eso funciona; lo que no está declarado es quién firma esa acta
        y qué pasa si esa plaza quiere entrar en el registro después (¿se adopta a sí misma?).

Q61·F3  El reloj de la ventana, ¿corre desde que se emite o desde que le llega al rider?
        Con un canal malo, la diferencia son casi los 20 segundos, y decide si la caducidad es un
        "no" del rider o un fallo del transporte — que no es lo mismo ni para él ni para la medida
        del mercado. (La v1 lo numeró Q42·F3.)

Q62·F3  ¿Puede la plaza retirarle a una tienda el derecho a declarar umbrales?
        Hoy no puede: sólo mueve su default (§7.7). Si una tienda declara números que hacen daño al
        mercado —o a los riders—, el único instrumento de la plaza es mirarlo en O01 y hablarlo. La
        pregunta es si eso basta, o si hace falta un acto (con acta) que devuelva la tienda al
        default.
```

### 13.2 · Lo que el diseño deja escrito como **deuda** (no como hueco tapado)

```text
DEUDA 1  K03 no existe. El cliente puede estar pagando lo mismo y esperando hasta el umbral de
         retraso por un enlace que no pidió, y nadie se lo dice.
DEUDA 2  G03 devuelve "quién" pero no "cuánto" (Q28). Hay una tabla sin importes: mide, no cobra.
DEUDA 3  G04 acumula deudas que quizá no se puedan hacer efectivas (Q29). El diseño prefiere una
         deuda visible a un descuento imposible.
DEUDA 4  El rider tiene un cuerpo y dos mercados (§7.9). Su capacidad está declarada por plaza y
         ninguna plaza puede saber qué hace en la otra. La única protección es que él declare la
         pausa. **Es el agujero más honesto de esta versión, y no tiene solución dentro de las
         reglas: la solución sería el dato que cruza.**
DEUDA 5  Sin histórico del local (L03 = NO_CONSTA), una plaza nueva no propone. El diseño NO rellena
         ese hueco con una media del mercado ni con el histórico de otra plaza (Q51).
DEUDA 6  R26 cobra sin haber movido un pedido: el canon es un ingreso sobre un mercado que el
         nacional no opera. Es la decisión C, y su precio está escrito.
DEUDA 7  La traza de acceso se escribe en el nacional y el dato es de la plaza. El diseño garantiza
         que la plaza pueda leerla; trasladarla entera a la plaza sigue siendo un traslado posible
         que no se hace (para no mover una pieza de las 25).
```

---

## 14 · Orden de obra (qué tiene que estar vivo antes que qué)

El diseño no se puede construir empezando por el corazón. **`propuesta-enlace` depende de datos que
escribe medio negocio**: sin ruta viva no hay desvío, sin precio compuesto no hay `cobra`, sin
histórico del local no hay espera probable, sin política no hay umbrales.

Y hay una regla nueva, que es la de esta versión: **el nacional va al final, y no hace falta para
nada de lo anterior.** Una plaza sola es el estado por defecto del negocio, y es el que hay que poder
probar primero.

```text
0 · UNA PLAZA SOLA, SIN NACIONAL                 lo que hace posible todo lo demás
      los tres contenedores (Plaza, ProyectoDeTienda, sin Nacional) + el sello de plaza_id
      sin esto no hay dónde poner nada, y con un nacional delante se aprende al revés

1 · LO QUE DECLARA LA PLAZA                     J01 J02 J03 J04 + O02 (acta)
      sin política no hay nada que aplicar; y sin acta, la política no tiene por qué

2 · EL CENSO Y EL ESTADO                        I01 I02 I03 I04 + I08 (términos) + P04 (checklist)
      sin tiendas y riders declarados, A04 está siempre vacío

3 · LA RUTA VIVA                                B01 B03 B05 B04 B02 B06
      sin posición, promesa y capacidad, no hay ni un número que medir

4 · EL PEDIDO Y SU PRECIO                       T: D01 D02 D03 D04 D05 D06 + C01 C02 C03 C04
                                                + E01 E02 E03
      sin "listo" no hay disparo; sin precio cerrado no hay cobra; sin cobra no hay propuesta

5 · EL HISTÓRICO DEL LOCAL                      L03 L01 + G01 G02 G03 G06
      sin puntualidad declarada, la espera probable es un hueco (y en una plaza nueva lo será igual:
      el diseño lo dice en vez de inventarlo)

6 · EL CORAZÓN                                  A01 … A35   (la cadena entera)
      aquí ya hay algo que medir. Antes de aquí, sólo habría huecos bien nombrados.

7 · EL REPARTO MEDIDO Y LA PRUEBA               F01 … F07 + C05 C06 C07
      sin hechos con hora no se puede medir la espera ni cobrarla

8 · EL DINERO DE LA PLAZA                       H01 … H06 + E04 E05 E06
      es lo último de la plaza porque su materia prima son hechos ya cerrados

9 · LA OPERACIÓN HUMANA                         P01 P02 P03 + O03 O04 + I05 I06 I07
      la cola y la revisión sólo tienen sentido cuando hay casos que atender

10 · EL BORDE AMABLE                            A18 F07 L04 + K01 K02 + M01 M02 M05 + N01 N02
                                                + S01 S02
      los tres agentes y las pantallas de cada parte. Lo último, y lo único apagable sin que el
      mercado deje de funcionar.

11 · EL NACIONAL                                R01 … R25 (+ R26 si hay dos plazas)
      no porque sea difícil, sino porque **nace con la segunda plaza** y hasta entonces no tiene
      sujeto. Construirlo antes es construir el sitio donde luego se mete lo que no debe.
```

**La regla de este orden**: cada peldaño se puede probar solo. Una plaza con 0–9 y sin 11 es una
federación de una, funcionando. Una plaza con 6 y sin 1–5 es un mercado que propone con números
inventados — es decir, el negocio contrario a este.

---

## 15 · Verificación del entregable

```text
✓ 144 piezas de la F2 → 144 clases, una por pieza, con su forma (CUSTODIO / REFLEJO / PUENTE /
  CONVERSOR / AGENTE) y con su unidad (N 25 · P 103 · T 16). K03 y M06 quedan sin clase porque no se
  sabe si existen; R26 queda encendida por la decisión C en su forma de porcentaje.
✓ Los cinco flujos del negocio están diseñados: el enlace (§7.1), el pedido (§7.2), el reparto
  (§7.3), el fallo (§7.4) y la liquidación (§7.5) — más los cuatro que añade el corte: abrir una
  plaza (§7.6), cambiar el criterio en dos capas (§7.7), el rider en dos plazas (§7.9) y el día sin
  nacional (§7.10).
✓ La propuesta es una FUNCIÓN con firma explícita, pura, reproducible y local a su plaza (§4), con
  su test de replay (A29) y su guarda de frontera (A35).
✓ No hay optimizador global, ni planificador, ni scorer que filtre: hay cuatro tests AND (A12) y un
  orden declarado que sólo ordena (A25).
✓ La decisión es EXPLICABLE desde un conjunto cerrado de razones (A16) y una frase derivada (A17);
  el agente sólo puede adornar, con validador puro (A18). Y la explicación dice **qué capa de
  umbrales** la juzgó.
✓ El rider acepta, rechaza o caduca. Nunca se le asigna: tres desenlaces válidos y una guarda con
  test (A19, A21, A23, A27).
✓ El dinero: cliente→tienda (comida), cliente→rider (reparto íntegro), tienda y rider→su plaza
  (semanal), plaza→nacional (canon, sólo con dos plazas). La plaza no retiene (E05, H06); el nacional
  no recauda salvo el canon (R24).
✓ El corte en tres es un grafo, no una convención: cuatro flechas permitidas y cuatro prohibidas
  (§1.3), con `plaza_id` sellado por el escritor (R6 de §10.3).
✓ Las cuatro auditorías están escritas como tests y **se dice cuáles pasan sobre el papel y con qué
  asteriscos** (§10.2).
✓ Cero tecnología, cero proveedor, cero producto de terceros: catorce puertos abiertos y ninguna
  fórmula cableada a uno de ellos (§6).
✓ Las 52 preguntas abiertas siguen abiertas y con clase asignada (§13), más seis que destapa este
  diseño (§13.1) y siete deudas declaradas (§13.2).
✓ Las cuatro que la F0 cerró se citan como cerradas, con la frase que las cierra — y se dice cuál
  lectura de la F2 queda descartada (Q1 · Q43).
```

---

### Nota de ruta

El método fija el entregable en `esquemas/diseno-oop.md`, relativo al proyecto. Este documento se ha
escrito en `proceso/fase3/esquemas/diseno-oop.md`; en `proceso/fase3/diseno-oop.md` queda un acceso
directo al mismo archivo, para que la ruta pedida también resuelva. **Es un solo documento, no dos.**

La v1 vive en `proceso/fase3-v1/`. No se ha copiado: se ha releído para no perder lo que estaba bien
(la propuesta como función, los cuatro tests, el conjunto cerrado de razones, los puertos abiertos, el
orden de obra) y se ha vuelto a escribir con tres unidades. Lo que se ha descartado de ella está
dicho donde toca: los cinco supuestos (§4.1, §4.3), el mercado único (§2.1) y un dueño implícito
(§8).

---

## Q57 · El coste del rider — CERRADO (cierra Q2 y Q41)

> El diseño decía: «con `cobra` neto, el mercado no propone ni un pedido;
> con bruto, el cuarto umbral casi no filtra». Los dos números existen y
> están medidos. Con ellos, el umbral filtra exactamente lo que debe.

```
coste por km      0,140 €/km    moto de reparto (combustible + revisiones +
                                neumáticos + seguro + ITV + depreciación)
coste por minuto  0,257 €/min   lo que el rider DEJA DE GANAR esperando
```

### El umbral, definitivo

```
margen = cobra − (km_desvío × 0,140 + min_espera × 0,257 + min_retraso × 0,257)

margen > 0  →  se le propone
margen ≤ 0  →  no se le propone
```

### Tres casos con los números reales

```
enlace bueno   300 m, 3 min    cobra 3,50 €   cuesta 0,81 €   margen +2,69 €   ✅
enlace justo   700 m, 5 min    cobra 2,50 €   cuesta 1,38 €   margen +1,12 €   ✅
enlace malo    1,2 km, 8 min   cobra 2,00 €   cuesta 2,22 €   margen −0,22 €   ❌
```

**El tercero es el que valida el diseño.** Con el umbral en «cobra > 0» (bruto)
ese pedido se habría propuesto y el rider habría perdido 22 céntimos. Con el
umbral en neto, no se propone. **El cuarto umbral sí filtra.**

### Los dos números son config del proyecto, no constantes

```
0,140 €/km   moto
0,250 €/km   coche
0,020 €/km   bici

el €/min NO se configura: se DERIVA
  €/min = (precio medio del reparto en la zona − km medios × €/km) ÷ minutos medios
```

Porque el minuto depende de lo que se pague en ese barrio: en uno de 4,50 €
vale más que en uno de 2,50 €. Si se fija, el umbral miente en uno de los dos.

### Lo que el rider ve al recibir la propuesta

> **«Te lo ofrezco porque ganas 2,69 € netos»**

No es un detalle de interfaz: es la prueba de que no acepta a ciegas, y es lo
que la Directiva UE 2024/2831 exige (decisión explicable y revisable).
