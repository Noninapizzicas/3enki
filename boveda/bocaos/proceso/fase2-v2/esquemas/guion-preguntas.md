# GUION DE PREGUNTAS — vertical `bocaos`

> **40 preguntas abiertas.** Las 6 de la F0 (tres de ellas nuevas: umbrales, rechazo,
> transparencia) se tratan como abiertas y se abren en varias. Las demás las destapa el prisma.
>
> **Cómo se usan**: se hacen **de una en una**, en este orden, esperando respuesta. Las cinco
> primeras (Q1, Q2, Q6, Q7, Q14) **bloquean construcción**: sin ellas la cadena de propuesta
> se puede escribir pero no se puede configurar.
>
> **Ley de cero supuestos**: ninguna de estas preguntas tiene respuesta propuesta en el
> esquema. Donde el esquema tiene una lectura, va marcada como *lectura*, no como decisión.

---

## A · El criterio: los cuatro umbrales y la ventana (el corazón del matiz)

**Q1 · ¿Los cuatro números son de la vertical o del primer mercado?** `[F0]`
> La F0 §6 da 800 m / 4 min / 6 min / >0 y a la vez dice que "los umbrales son del PROYECTO".
> Lectura del esquema: los cuatro **nombres y unidades** son de la vertical, los **valores** son
> del proyecto. Confirmarlo o corregirlo.
> **Desbloquea**: `config-umbrales` (J01) — y decide si el esquema tiene una constante o cero.

**Q2 · `cobra > 0` — ¿bruto del pedido o neto del desvío?** `[NUEVA]` ⚠ **bloquea**
> Si es bruto, el umbral casi no filtra: un pedido que paga poco y cuyo desvío cuesta casi lo
> mismo lo pasa igual, y el rider pierde dinero en el viaje. Si es neto, es la protección real del rider. La F0 §6.5 ("si el rider no gana
> más, no enlaza") apunta a neto, pero **no está escrito**.
> **Desbloquea**: `medida-cobra` (A11) y la credibilidad entera de "el enlazado es la palanca
> del rider".

**Q3 · ¿Un juego de umbrales por zona, o uno por mercado?** `[NUEVA]`
> Un barrio con calles cortas y otro con rondas no se comportan igual con 800 m.
> **Desbloquea**: `config-zona` (J03) y si `config-umbrales` es uno o uno-por-zona.

**Q4 · Cuando cambia un umbral, ¿rige para el pedido que ya está en vuelo?** `[NUEVA]`
> El esquema guarda la versión con cada propuesta, así que **puede** hacerlo de las dos formas.
> Lo que no puede es no saberlo.
> **Desbloquea**: `version-efectiva` (J04) y el acta (`acta-decisiones`).

**Q5 · ¿La ventana de ~20 s es fija? ¿Y si el rider va conduciendo?** `[NUEVA]`
> Veinte segundos con el móvil en el manillar son una trampa. ¿Se alarga? ¿Se avisa por voz?
> ¿Se puede pre-aceptar por zona ("los de esta calle sí")?
> **Desbloquea**: `config-ventana` (J02) y `canal-rider` (M04).

**Q6 · ¿Las propuestas van en serie o en paralelo?** `[NUEVA]` ⚠ **bloquea**
> **En serie**: un candidato cada 20 s; con tres candidatos la comida espera un minuto más.
> **En paralelo**: varios riders a la vez; el primero que acepta se lo queda (y entonces el
> criterio ya no elige, elige el pulgar más rápido — `guarda-propuesta-unica`, A33).
> Es la decisión que más cambia la experiencia sin tocar una línea de la regla.

**Q7 · ¿En qué orden determinista se recorren los candidatos?** `[NUEVA]` ⚠ **bloquea**
> El más cerca · el que menos esperaría · el que menos retraso añade · el que menos lleva
> encima. **Ese orden es la política del mercado.** Tiene que estar escrito y ser público.
> **Desbloquea**: `siguiente-candidato` (A25) y el orden dentro de `config-umbrales`.

**Q8 · ¿El orden puede depender de datos del rider (aceptación pasada)?** `[NUEVA]`
> Si puede, hay puntuación — y la F0 dice que no hay puntuación oculta. Si no puede, un rider
> que rechaza siempre recibe siempre las mismas propuestas, y eso se arregla con la pausa, no
> con una nota.
> **Desbloquea**: `guarda-sin-puntuacion` (A22).

---

## B · El rechazo y la libertad

**Q9 · ¿"Sin penalización" incluye no mostrarle su propia tasa de rechazo?** `[F0]`
> Saber "rechazas el 40 %" puede ser información o puede ser presión. La F0 dice que el
> rechazo no se penaliza; no dice si se le enseña al rider.

**Q10 · Si rechazar no cuesta nada y no cambia la elegibilidad, ¿basta la pausa declarada?** `[NUEVA]`
> Es el precio de la libertad: el mismo rider recibirá la misma propuesta del mismo local cada
> vez que pase por delante. La pausa (`estado-rider`) y la zona (`zona-rider`) son el control
> que él tiene. ¿Son suficientes o quieres otra cosa que **no** sea una penalización?

**Q11 · ¿Puede rechazar con motivo ("no conozco ese portal", "no me fío de esa cocina")?** `[NUEVA]`
> Y si puede: ¿ese motivo alimenta el histórico de la tienda (útil para el mercado) o el suyo
> (que sería una nota encubierta)?
> **Desbloquea**: `rechazo-sin-coste` (A21) y `lectura-de-incidencia` (F07).

**Q12 · "Acepta y no aparece" — ¿qué pierde exactamente?** `[F0]`
> ¿Pierde la tarifa? ¿Pierde la prioridad (→ puntuación, prohibida)? ¿Pierde solo ese pedido?
> ¿Se le puede volver a proponer el mismo día?

**Q13 · ¿Puede devolver un pedido aceptado si el local se pasa de la espera?** `[NUEVA]`
> El umbral de espera es una promesa que **él no controla**: quien cocina es otro. Sin salida,
> el rider asume el riesgo de la cocina ajena — que es exactamente el fallo que la F0 dice que
> hay que arreglar.

---

## C · El dinero

**Q14 · Los tramos: ¿cuánto el fijo al mes y cuántos céntimos por pedido?** `[F0]` ⚠ **bloquea**
> Sin números no hay `devengo`, ni `simulador-tramos`, ni propuesta comercial.

**Q15 · ¿El enlace abarata el reparto al cliente, o solo engorda al rider?** `[NUEVA]`
> La F0 §1 promete que el cliente "espera menos o paga menos"; la §6 dice que el enlace es la
> palanca del rider. Si el ahorro es solo del rider, **el cliente paga lo mismo y espera hasta
> 6 minutos más**. Hay que elegir: bajar el precio, apretar el umbral, o decírselo.
> **Desbloquea**: `transparencia-del-enlace` (K03) y el umbral de retraso.

**Q16 · Los kilómetros ahorrados, ¿de quién son?** `[NUEVA]`
> Lectura del esquema: del rider. Si fueran de Bocaos, Bocaos tendría interés en enlazar de
> más y el umbral de retraso competiría con su propia caja (`guarda-no-captura-del-ahorro`).

**Q17 · Si nadie acepta, ¿quién sube la oferta, con qué tope y quién la paga?** `[NUEVA]`
> La F0 §6 dice "o sube la oferta" sin decir quién. ¿El cliente? ¿La tienda? ¿Bocaos (y
> entonces Bocaos subvenciona la demanda y entra en otra categoría de negocio)?

**Q18 · ¿Se devenga la cuota de Bocaos en un pedido fallido o cancelado?** `[NUEVA]`
> Y si no se devenga: ¿quién paga la coordinación que sí se hizo?

**Q19 · ¿El cliente ve el incentivo que pone la tienda?** `[NUEVA]`
> Si lo ve, entiende por qué su reparto es barato; si no, ve un precio y no sabe de qué está
> hecho.

---

## D · La transparencia al cliente

**Q20 · ¿El cliente sabe que su pedido comparte viaje?** `[F0]`
> Y si lo sabe, ¿qué le cambia? Si no lo sabe y su pedido llega 6 minutos más tarde por el
> enlace, ¿a quién culpa? De esta respuesta depende que exista `transparencia-del-enlace`
> (K03) — hoy marcada **[ABIERTA]** en el árbol.

**Q21 · Si el pedido llega tarde por un enlace, ¿quién responde?** `[NUEVA]`
> ¿El rider (que aceptó el enlace)? ¿Bocaos (que se lo propuso)? ¿Nadie, porque el umbral ya lo
> autorizaba?

**Q22 · ¿La promesa al cliente es una hora exacta o una ventana?** `[NUEVA]`
> Es literalmente lo que mide el umbral de retraso. Si es una ventana, el esquema es más
> barato; si es una hora, cada enlace puede romper una promesa.

---

## E · Legal y revisión humana

**Q23 · ¿De qué responde Bocaos en un reparto hecho por un autónomo?** `[F0]`
> Y con quién contrata el rider: ¿con Bocaos, con la tienda o con el cliente final? La F0 dice
> a la vez que "se oferta a los restaurantes" y que "el cliente paga al rider su reparto". Esa
> ambigüedad decide si la presunción de laboralidad le alcanza.

**Q24 · En una disputa, ¿cómo se prueba y quién decide?** `[F0]`
> El principio está decidido ("no juzga, mide"); el mecanismo no.

**Q25 · ¿La revisión humana de decisiones automáticas se construye desde el día uno?** `[NUEVA]`
> La Directiva (UE) 2024/2831 obliga a informar de los sistemas automatizados (art. 6), a
> revisión humana de las decisiones significativas y a explicación (art. 8), y su art. 10
> extiende esos derechos a quien **no** es asalariado — o sea, a este rider. Construirlo cuesta
> una cola y un firmante; no construirlo es una decisión que hay que tomar sabiendo qué dice la
> norma.

**Q26 · ¿Quién firma el dictamen de una revisión y qué efecto tiene?** `[NUEVA]`
> ¿La sala o el dueño? ¿Y qué puede pasar: compensar, corregir el histórico, cambiar la regla
> para adelante? Lo que **no** puede es rehacer la propuesta: eso sería un planificador humano.

**Q34 · ¿Qué acredita el rider al darse de alta, quién lo verifica, y se le informa por escrito
del sistema que decide a quién se propone?** `[NUEVA]`
> Alta de autónomo, seguro, y el documento del art. 6 de la directiva. Sin esto, la relación
> empieza sin papeles.

---

## F · La operación del mercado

**Q27 · ¿La tienda acepta el pedido o entra directo a cocina?** `[NUEVA]`
> ¿Hay tiempo máximo de aceptación? ¿Y si no contesta?

**Q28 · Las tres N de la espera: tienda, portal y llegada.** `[NUEVA]`
> El principio está decidido; los números no existen. Sin ellos no hay `ventana-espera` ni cargo
> por fallo.

**Q29 · Si Bocaos no toca el dinero, ¿cómo se hace **efectivo** un cargo por fallo?** `[NUEVA]`
> ¿Pago directo entre partes? ¿Compensación contra la cuota semanal? ¿Fianza? Sin respuesta, la
> adjudicación es decorativa.

**Q30 · Si falta la prueba (sin foto, sin posición, sin hora de bajada), ¿a favor de quién se
presume?** `[NUEVA]`

**Q31 · ¿Se pueden enlazar pedidos de **tiendas distintas** en el mismo viaje?** `[NUEVA]`
> La F0 dice "2 pedidos → 2 direcciones cercanas → 1 viaje" sin decir de quién son. Cambia el
> alcance del producto y la cara del `desvío`.

**Q32 · ¿Qué consecuencia tiene una cocina lenta repetida?** `[NUEVA]`
> Es la pieza que hace que el mercado corrija. Hoy no existe: la tienda recibe propuestas
> peores, y eso puede no ser suficiente.

**Q33 · ¿Cuántos pedidos caben en un rider?** `[NUEVA]`
> La F0 dice 2–3; el matiz dice que el tope lo ponen los umbrales. ¿Hay además un tope físico
> declarado por él?

**Q35 · ¿Hay exclusividad, permanencia o admisión para una tienda?** `[NUEVA]`
> ¿Qué pasa si una tienda quiere estar en Bocaos y en Glovo a la vez?

**Q36 · ¿Puede la tienda rechazar un pedido y quién paga ese rechazo?** `[NUEVA]`

**Q37 · "Cerca" y "desvío": ¿en línea recta, por calle, con tráfico?** `[NUEVA]`
> Cambia el número, y con él cuántos candidatos pasan el umbral. También: ¿desde dónde se mide,
> desde la posición actual o desde la última parada?

**Q38 · ¿Cuánto tiempo se guarda la traza de posición?** `[NUEVA]`
> La directiva prohíbe recoger datos fuera del horario de trabajo (art. 6).

**Q39 · ¿El cliente compra como invitado? ¿Ve el desglose (comida / reparto / incentivo)?** `[NUEVA]`

**Q40 · ¿Quién atiende la sala, en qué horario y con cuántas manos?** `[NUEVA]`
> Y si no hay nadie a las 22:00 de un sábado, ¿quién recibe la escalada?

---

## Resumen

```
[F0]    Q1 · Q9 · Q12 · Q14 · Q20 · Q23 · Q24            (7 — las 6 de la identidad + Q12 de F0 §5)
[NUEVA] el resto                                        (33)
bloquean construcción   Q1 · Q2 · Q6 · Q7 · Q14         (5)
```

**Una pregunta de la F0 §5 ya está cerrada por la F0 §6**: *"¿el enlazado lo elige el rider, el
sistema o los dos?"* → **el sistema propone, el rider acepta**. Eso ya no es hueco: es el matiz.
Lo que sigue abierto de ahí es **en qué orden** se recorre a los candidatos (Q7) y **en serie o
en paralelo** (Q6).
