# GUION DE PREGUNTAS — vertical `bocaos` (tercera pasada)

> **56 preguntas abiertas.** Las 40 de la v2, con las que la §7 reabre o cierra, más **16 nuevas
> del bloque G** (la federación). Las 6 de la F0 se tratan como abiertas y se abren en varias.
>
> **Cómo se usan**: de una en una, en este orden, esperando respuesta. Las **9 que bloquean**
> construcción van marcadas ⚠: sin ellas se puede escribir el código y no se puede configurar.
>
> **Ley de cero supuestos**: ninguna de estas preguntas tiene respuesta propuesta en el esquema.
> Donde el esquema tiene una lectura, va marcada como *lectura*, no como decisión.
>
> **A quién se le preguntan**: A–F al dueño del negocio. **G al dueño de la federación** — que hoy
> es la misma persona, pero son decisiones distintas: A–F configuran **un** mercado; G configura
> **cuántos** mercados y **de quién** son.

---

## A · El criterio: los cuatro umbrales y la ventana

**Q1 · ¿Los cuatro números son de la vertical, de la plaza, de la zona o de la tienda?** `[F0]` ⚠
> La F0 §6 dice "los umbrales son del PROYECTO"; la §7 dice que la plaza tiene "sus reglas y sus
> umbrales". Con tres niveles las dos frases no caben juntas: **proyecto = tienda**. Lectura del
> esquema: los nombres y unidades son de la vertical; **los valores son de la plaza**; la tienda
> solo tiene `incentivo-tienda`. Confirmarlo o corregirlo.
> **Desbloquea**: `config-umbrales` (J01) y el dueño de todo el grupo J.

**Q2 · `cobra > 0` — ¿bruto del pedido o neto del desvío?** ⚠
> Si es bruto, el umbral casi no filtra: un pedido que paga poco y cuyo desvío cuesta casi lo
> mismo lo pasa igual, y el rider pierde dinero en el viaje. Si es neto, es la protección real del
> rider. La §6.5 ("si el rider no gana más, no enlaza") apunta a neto, pero no está escrito.
> **Desbloquea**: `medida-cobra` (A11) y la credibilidad de "el enlazado es la palanca del rider".

**Q3 · ¿Un juego de umbrales por zona dentro de la plaza, o uno por plaza?**
> Un barrio con calles cortas y otro con rondas no se comportan igual con 800 m. Con la §7 la
> pregunta se afina: la plaza es el mínimo, ¿puede haber más de un juego dentro?
> **Desbloquea**: `config-zona` (J03) y si `config-umbrales` es uno o uno-por-zona.

**Q4 · Cuando cambia un umbral, ¿rige para el pedido que ya está en vuelo?**
> El esquema guarda la versión con cada propuesta, así que puede hacerlo de las dos formas. Lo que
> no puede es no saberlo. **Desbloquea**: `version-efectiva` (J04) y el acta.

**Q5 · ¿La ventana de ~20 s es fija? ¿Y si el rider va conduciendo?**
> Veinte segundos con el móvil en el manillar son una trampa. ¿Se alarga? ¿Se avisa por voz? ¿Se
> puede pre-aceptar por zona? **Desbloquea**: `config-ventana` (J02) y `canal-rider` (M04).

**Q6 · ¿Las propuestas van en serie o en paralelo?** ⚠
> **En serie**: un candidato cada 20 s; con tres candidatos la comida espera un minuto más.
> **En paralelo**: varios a la vez, y el primero que acepta se lo queda (y entonces elige el pulgar
> más rápido — `guarda-propuesta-unica`). Es la decisión que más cambia la experiencia sin tocar
> una línea de la regla.

**Q7 · ¿En qué orden determinista se recorren los candidatos?** ⚠
> El más cerca · el que menos esperaría · el que menos retraso añade · el que menos lleva encima.
> **Ese orden es la política del mercado**: tiene que estar escrito y ser público.
> **Desbloquea**: `siguiente-candidato` (A25).

**Q8 · ¿El orden puede depender de datos del rider (aceptación pasada)?**
> Si puede, hay puntuación — y la F0 dice que no hay puntuación oculta. Si no puede, un rider que
> rechaza siempre recibe siempre las mismas propuestas, y eso se arregla con la pausa, no con una
> nota. **Desbloquea**: `guarda-sin-puntuacion` (A22).

---

## B · El rechazo y la libertad

**Q9 · ¿"Sin penalización" incluye no mostrarle su propia tasa de rechazo?** `[F0]`
> Saber "rechazas el 40 %" puede ser información o puede ser presión. La F0 dice que el rechazo no
> se penaliza; no dice si se le enseña al rider.

**Q10 · Si rechazar no cuesta nada y no cambia la elegibilidad, ¿basta la pausa declarada?**
> Es el precio de la libertad: el mismo rider recibirá la misma propuesta del mismo local cada vez
> que pase por delante. La pausa (`estado-rider`) y la zona (`zona-rider`) son su control. ¿Son
> suficientes o quieres otra cosa que **no** sea una penalización?

**Q11 · ¿Puede rechazar con motivo ("no conozco ese portal", "no me fío de esa cocina")?**
> Y si puede: ¿ese motivo alimenta el histórico de la tienda (útil para el mercado) o el suyo (que
> sería una nota encubierta)? **Desbloquea**: `rechazo-sin-coste` (A21) y `lectura-de-incidencia`.

**Q12 · "Acepta y no aparece" — ¿qué pierde exactamente?** `[F0]`
> ¿La tarifa? ¿La prioridad (→ puntuación, prohibida)? ¿Solo ese pedido? ¿Se le puede volver a
> proponer el mismo día?

**Q13 · ¿Puede devolver un pedido aceptado si el local se pasa de la espera?**
> El umbral de espera es una promesa que **él no controla**: quien cocina es otro. Sin salida, el
> rider asume el riesgo de la cocina ajena — exactamente el fallo que la F0 dice que hay que
> arreglar.

---

## C · El dinero

**Q14 · Los tramos: ¿cuánto el fijo al mes y cuántos céntimos por pedido?** `[F0]` ⚠
> Sin números no hay `devengo`, ni `simulador-tramos`, ni propuesta comercial. **Y con la §7 hay
> una segunda pregunta dentro de esta**: ¿el tramo 1 lo cobra la plaza o el nacional? (Q42)

**Q15 · ¿El enlace abarata el reparto al cliente, o solo engorda al rider?**
> La §1 promete que el cliente "espera menos o paga menos"; la §6 dice que el enlace es la palanca
> del rider. Si el ahorro es solo del rider, **el cliente paga lo mismo y espera hasta 6 minutos
> más**. Hay que elegir: bajar el precio, apretar el umbral, o decírselo.
> **Desbloquea**: `transparencia-del-enlace` (K03) y el umbral de retraso.

**Q16 · Los kilómetros ahorrados, ¿de quién son?**
> Lectura del esquema: del rider. Si fueran de Bocaos, Bocaos tendría interés en enlazar de más y
> el umbral de retraso competiría con su propia caja (`guarda-no-captura-del-ahorro`).

**Q17 · Si nadie acepta, ¿quién sube la oferta, con qué tope y quién la paga?**
> La §6 dice "o sube la oferta" sin decir quién. ¿El cliente? ¿La tienda? ¿Bocaos (y entonces
> subvenciona la demanda y entra en otra categoría de negocio)? ¿La plaza?

**Q18 · ¿Se devenga la cuota en un pedido fallido o cancelado?**
> Y si no se devenga: ¿quién paga la coordinación que sí se hizo?

**Q19 · ¿El cliente ve el incentivo que pone la tienda?**
> Si lo ve, entiende por qué su reparto es barato; si no, ve un precio y no sabe de qué está hecho.

---

## D · La transparencia al cliente

**Q20 · ¿El cliente sabe que su pedido comparte viaje?** `[F0]`
> Y si lo sabe, ¿qué le cambia? Si no lo sabe y su pedido llega 6 minutos más tarde por el enlace,
> ¿a quién culpa? De esto depende que exista `transparencia-del-enlace` (K03).

**Q21 · Si el pedido llega tarde por un enlace, ¿quién responde?**
> ¿El rider (que aceptó el enlace)? ¿La plaza (que se lo propuso)? ¿Nadie, porque el umbral ya lo
> autorizaba?

**Q22 · ¿La promesa al cliente es una hora exacta o una ventana?**
> Es literalmente lo que mide el umbral de retraso. Si es una ventana, el esquema es más barato; si
> es una hora, cada enlace puede romper una promesa.

---

## E · Legal y revisión humana

**Q23 · ¿De qué responde Bocaos en un reparto hecho por un autónomo?** `[F0]`
> Y con quién contrata el rider: ¿con Bocaos, con la tienda o con el cliente final? La F0 dice a la
> vez que "se oferta a los restaurantes" y que "el cliente paga al rider su reparto".
> **Con la §7 hay una tercera pregunta**: ¿con cuál de los dos Bocaos? — Q42.

**Q24 · En una disputa, ¿cómo se prueba y quién decide?** `[F0]`
> El principio está decidido ("no juzga, mide"); el mecanismo no.

**Q25 · ¿La revisión humana de decisiones automáticas se construye desde el día uno?**
> La Directiva (UE) 2024/2831 obliga a informar de los sistemas automatizados (art. 6), a revisión
> humana de las decisiones significativas y a explicación (art. 8), y su art. 10 extiende esos
> derechos a quien **no** es asalariado — o sea, a este rider.

**Q26 · ¿Quién firma el dictamen de una revisión y qué efecto tiene?**
> ¿La sala de la plaza o el dueño? ¿Puede compensar, corregir el histórico, cambiar la regla para
> adelante? Lo que **no** puede es rehacer la propuesta: eso sería un planificador humano.

**Q34 · ¿Qué acredita el rider al darse de alta, quién lo verifica, y se le informa por escrito
del sistema que decide a quién se propone?**
> Alta de autónomo, seguro, y el documento del art. 6. **Con la §7 se multiplica**: si se da de
> alta en tres plazas, ¿lo repite tres veces? (Q44)

---

## F · La operación del mercado

**Q27 · ¿La tienda acepta el pedido o entra directo a cocina?**
> ¿Hay tiempo máximo de aceptación? ¿Y si no contesta?

**Q28 · Las tres N de la espera: tienda, portal y llegada.**
> El principio está decidido; los números no existen. Sin ellos no hay `ventana-espera` ni cargo.

**Q29 · Si Bocaos no toca el dinero, ¿cómo se hace efectivo un cargo por fallo?**
> ¿Pago directo entre partes? ¿Compensación contra la cuota semanal? ¿Fianza? Sin respuesta, la
> adjudicación es decorativa. **Con la §7 el esquema propone una salida y no la decide**: compensar
> contra la cuota, que es lo único que no mueve dinero de un tercero.

**Q30 · Si falta la prueba (sin foto, sin posición, sin hora de bajada), ¿a favor de quién se
presume?**

**Q31 · ¿Se pueden enlazar pedidos de tiendas distintas en el mismo viaje?** — **contestada por
la §7, y no del todo**
> La arquitectura la cierra: **sí, y siempre dentro de la misma plaza** (la ruta viva y el pedido
> viven en el mismo despliegue; el nacional no tiene ninguno de los dos). Lo que sigue abierto es
> el caso de frontera: **Q52**.

**Q32 · ¿Qué consecuencia tiene una cocina lenta repetida?**
> Es la pieza que hace que el mercado corrija. Hoy la consecuencia es "recibe propuestas peores", y
> eso puede no ser suficiente.

**Q33 · ¿Cuántos pedidos caben en un rider?**
> La F0 dice 2–3; el matiz dice que el tope lo ponen los umbrales. ¿Hay además un tope físico
> declarado por él (`capacidad-declarada`)?

**Q35 · ¿Hay exclusividad, permanencia o admisión para una tienda?**
> ¿Qué pasa si una tienda quiere estar en Bocaos y en Glovo a la vez? (La F0 dice que no hay
> exclusividad; esta pregunta es la que la convierte en contrato.)

**Q36 · ¿Puede la tienda rechazar un pedido y quién paga ese rechazo?**

**Q37 · "Cerca" y "desvío": ¿en línea recta, por calle, con tráfico?**
> Cambia el número, y con él cuántos candidatos pasan el umbral. También: ¿desde dónde se mide?

**Q38 · ¿Cuánto tiempo se guarda la traza de posición?**
> La directiva prohíbe recoger datos fuera del horario de trabajo (art. 6). (La F0 ya decidió 90
> días para la traza de posición; confirmar que eso cubre también la traza de acceso, Q46.)

**Q39 · ¿El cliente compra como invitado? ¿Ve el desglose (comida / reparto / incentivo)?**

**Q40 · ¿Quién atiende la sala, en qué horario y con cuántas manos?**
> La F0 dice "agentes, no sala humana". Entonces la pregunta cambia: **cuando no hay nadie, ¿qué
> pasa con un pedido que no encuentra rider?** ¿Caduca con aviso al cliente, o espera?

---

## G · LA FEDERACIÓN (bloque nuevo — al dueño de la federación)

**Q41 · ¿Con qué se paga el nacional?** ⚠ **el hueco más caro del esquema**
> Las tres bandas las cobra la plaza. El nacional comparte marca, software, soporte y registro y
> **no tiene una sola línea de ingreso declarada**. Tres modelos y ninguno elegido: **canon fijo
> por plaza** (franquicia) · **porcentaje del devengo de cada plaza** (sociedad/cooperativa) ·
> **nada** (misma persona jurídica: el nacional es una función interna, no una empresa).
> **Desbloquea**: `canon-de-plaza` **[ABIERTA]** y la naturaleza entera del negocio.

**Q42 · ¿Quién factura a la tienda, y con qué marca?** ⚠
> La tienda paga "a Bocaos". Ahora hay dos Bocaos. ¿Factura la plaza (el nacional es invisible) o
> factura el nacional y liquida a la plaza? Si facturan los dos, el contrato está roto en dos. Si
> factura solo la plaza, ¿con qué justifica el nacional su canon?
> **Desbloquea**: `contrato-tramos`, `factura-gestion`, `comision-coordinacion`.

**Q43 · ¿Puede una tienda tener umbrales propios?**
> Lectura del esquema: **no** — el rider tendría N juegos de reglas para el mismo trabajo, y el
> mercado dejaría de ser un mercado. La tienda ya tiene una palanca económica: su incentivo. Si la
> respuesta es sí, hay que añadir un nivel de config y decírselo al rider, porque el umbral que le
> llega ya no será el de la plaza.

**Q44 · El rider se da de alta en cada plaza: ¿la credencial viaja o se repite?**
> La F0 es clara con el **histórico** (no viaja). No dice nada de los papeles: alta de autónomo,
> seguro, identidad. Si no viajan, el rider que trabaja en dos ciudades contiguas repite el trámite
> entero. Si viajan, hay un pasaporte nacional — que no es histórico, pero se le parece.
> **Desbloquea**: `pasaporte-de-rider` **[ABIERTA]**.

**Q45 · Las N carteras del rider, ¿se consolidan?**
> Con dos plazas tiene dos carteras, dos ciclos de cobro y dos moras. Es el actor que puede
> marcharse: si su dinero está partido en dos, se marcha. ¿Consolidación de vista (un total) o de
> cobro (un pago)? ¿Y quién adelanta el dinero si una plaza paga tarde? (Si el nacional adelanta,
> se convierte en banco — F0 §1.)

**Q46 · ¿El soporte del nacional puede ver pedidos de una plaza?** ⚠
> Soporte sin pedidos es soporte ciego. Tres grados: **(a)** solo software (logs, versión, config);
> **(b)** acceso delegado con permiso de la plaza, plazo y traza; **(c)** acceso permanente "para
> dar servicio" — que es la sede con otro nombre.
> Y el caso que hay que resolver aparte: **si la plaza está caída, no puede conceder permiso.**
> ¿Hay un permiso de emergencia pre-concedido, con alcance mínimo?

**Q47 · ¿Puede una plaza salir de la federación? ¿Con qué se queda?**
> Sus datos, sus tiendas, su marca local, su software. Y la otra cara: **cuando una plaza cae, ¿qué
> ve su cliente en el buscador nacional?** Desaparecer convierte el fallo de la plaza en un fallo
> del restaurante; marcarla revela que hay una federación detrás. No hay opción buena, hay que
> elegir.

**Q48 · El buscador nacional, ¿busca qué?**
> Plazas, tiendas o productos. Si busca productos necesita el catálogo — y el catálogo en el
> nacional es el marketplace (`guarda-sin-catalogo-nacional`). Lectura del esquema: busca
> **localidad y nombre de tienda**, nada más.

**Q49 · ¿Hay marca de plaza ("Bocaos Málaga") o solo la nacional?**
> Cambia `licencia-de-marca`, el rótulo de la tienda, el dominio, y qué marca ve un rider al darse
> de alta. Y una advertencia: cuanta más marca de plaza, más fácil es que un día esa plaza se
> independice con sus clientes.

**Q50 · ¿Quién abre una plaza: el dueño, un socio local, un franquiciado?** ⚠
> Decide si la federación es **una empresa con despliegues**, **una franquicia** o **una
> cooperativa**. Y decide quién responde de la inversión del arranque (Q51), que es lo que hace que
> una plaza nueva sea posible o imposible.

**Q51 · ¿Cómo arranca una plaza sin histórico?**
> Sin histórico no hay `puntualidad-declarada`, no hay espera medida, y `hueco-de-medida` manda: **no
> hay propuestas**. Es la ley de cero supuestos aplicada con honestidad, y hace que una plaza nueva
> no pueda repartir. Tres salidas, ninguna declarada: **política de arranque** (umbrales laxos
> durante N días, dicho) · **período de observación** (la plaza abre midiendo, sin repartir) ·
> **heredar histórico de otra plaza** (que choca con la regla 2).

**Q52 · ¿Un pedido puede cruzar la frontera de una plaza?**
> Una tienda de la plaza A, una dirección de la plaza B. ¿Existe? ¿Lo sirve A (y su rider sale de
> su plaza)? ¿Lo ve el cliente? Y si dos coberturas se solapan, **¿quién sirve?** — `frontera-de-plaza`
> necesita una regla de desempate.

**Q53 · ¿Para qué consolida el nacional si no recauda?**
> Informe para el dueño · base del canon (si Q41 lo enciende) · obligación fiscal · o nada. La
> respuesta decide si `consolidacion-nacional` es una pieza o un capricho.

**Q54 · ¿Qué datos mínimos de una tienda viajan al censo nacional?**
> Lectura del esquema: id, nombre, estado y plaza. **No** su carta, no sus precios, no su dirección
> fiscal. Confirmarlo: es la frontera entre un registro y un directorio.

**Q55 · ¿Una plaza es un proyecto con N tiendas dentro, o un despliegue con N proyectos?** ⚠
> La F0 dice las dos cosas: "cada tienda = un proyecto" y "la plaza = un despliegue con su BD". Si
> un proyecto es una BD, no caben las dos. La tabla del corte funciona con las dos respuestas; la
> FASE 3 no. **Es la pregunta que hay que llevar a PLASMA el primer día.**

**Q56 · ¿El cuadro de la federación se publica hacia las plazas?**
> Si se publica, el nacional es un espejo: todas las plazas ven a todas. Si no, el nacional sabe
> quién va mal antes que el que va mal — y la asimetría de información es poder, aunque no tenga
> un solo botón. Publicarlo también tiene coste: las plazas compiten con información.

---

## Resumen

```
[F0]      Q1 · Q9 · Q12 · Q14 · Q20 · Q23 · Q24 · Q31(cerrada por §7)      8
[heredadas] el resto de A–F                                              32
[NUEVAS §7] Q41–Q56                                                      16
                                                                        ──
                                                                         56

bloquean construcción   Q1 · Q2 · Q6 · Q7 · Q14 · Q41 · Q42 · Q50 · Q55    9
```

**Dos preguntas de la F0 han quedado contestadas por la F0 misma**, y conviene decirlo para no
preguntar lo ya decidido:

```
"¿el enlazado lo elige el rider, el sistema o los dos?"   → el sistema PROPONE, el rider ACEPTA (§6)
"¿se enlazan pedidos de tiendas distintas?"                → sí, y siempre dentro de una plaza (§7)
```

**Y una que la §7 no contesta aunque lo parezca:** "¿de quién son los umbrales?" — la §6.3 dice del
proyecto, la §7 dice de la plaza, y con tres niveles "proyecto" ya no significa las dos cosas. Es
Q1, y hasta que se responda, el grupo J entero está en el aire.
