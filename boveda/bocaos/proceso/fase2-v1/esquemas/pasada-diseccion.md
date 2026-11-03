# PASADA · DISECCIÓN — FORMA de cada hoja atómica (una a una)

> CINCO formas: **REFLEJO puro** (calcular, cero juicio — un test lo afirma) ·
> **MICRO-AGENTE fuzzy** (juicio/lenguaje/ambigüedad — el reflejo hidrata, el agente
> transforma) · **CUSTODIO** (un solo dueño por store) · **CONVERSOR** (una sola frontera
> de formatos/unidades) · **PUENTE** (conecta con lo vecino por EVENTO).
>
> Cada hoja del prisma global + del prisma por interlocutor + del prisma por ROL, una a
> una, sin saltarse ninguna. **73 hojas.**

---

## A · PLAZA-TIENDA (el escaparate propio, tramo 2)
1. **marca-tienda** → CUSTODIO. La identidad de la tienda (nombre, colores, tono) es un
   store por tienda con **un solo escritor: la tienda**. Bocaos nunca la escribe.
2. **carta-publica** → CONVERSOR. Es **la** frontera donde el catálogo interno (con
   precios de coste, agotados, extras) cruza a vista pública podada. Una sola frontera:
   si cada superficie compone su carta, se desincronizan.
3. **precio-cerrado** → REFLEJO puro. Suma en céntimos y compone el precio antes de pagar.
   Cero juicio; un test con tres casos lo afirma.
4. **carrito-tienda** → CUSTODIO. El buffer de compra del cliente en **esa** tienda: un
   escritor por carrito. Dos escritores = líneas duplicadas.
5. **registro-cliente-tienda** → CUSTODIO. El cliente es de la tienda: store **por tienda**
   y aislado. Un cruce entre tiendas es la violación del par 4.
6. **plaza-publica** → REFLEJO puro. El índice del mercado es **proyección derivada** del
   listado de tiendas: no hay registro previo que declarar (anti-patrón "declara antes de
   actuar"). Se deriva, no se guarda.
7. **neutralidad-orden** → REFLEJO puro. Invariante con test: ningún orden por pago, nota,
   destacado o comisión. Si alguien lo rompe, el test se pone rojo.

## B · PEDIDO
8. **captura-pedido** → REFLEJO puro. Valida y registra **de a uno**: un pedido, un alta,
   un evento. La tanda no existe aquí (la lección del POS: todo de golpe = timeout).
9. **estado-pedido** → CUSTODIO. Máquina de estados con **un solo dueño del pedido**.
   Cada transición deja su hecho; nadie más escribe el estado.
10. **aviso-tienda** → PUENTE. El pedido llega a la tienda por evento; **no pisa** la
    decisión de la tienda (aceptar/rechazar). Sin store propio.
11. **compromiso-recogida** → CUSTODIO. La hora comprometida la escribe **la tienda** y
    solo ella (aunque cambiarla después esté abierto). Un escritor.
12. **estado-cocina-visible** → REFLEJO puro. Proyección podada del estado: qué ve el
    cliente de lo que pasa en cocina. Cero juicio, sin store.
13. **aviso-cliente** → PUENTE. Sale por el canal de la tienda (puerto abierto). Conecta por
    evento; no guarda relación con el cliente.
14. **rechazo-cancelacion** → REFLEJO puro. Qué transiciones se permiten en cada estado y a
    quién. Regla dura, test afirmable.

## C · OFERTA-REPARTO (EL ESLABÓN LIMITANTE)
15. **elegibilidad-rider** → REFLEJO puro. Qué riders entran en la oferta: distancia
    declarada, zona, capacidad libre, estado. Cálculo determinista, sin nota.
16. **visibilidad-oferta** → REFLEJO puro. La misma vista de la oferta para todos los
    elegibles: importe, distancia, tienda, espera prevista. Igual para todos = sin prioridad.
17. **aceptacion-atomica** → CUSTODIO. El acto de aceptar es **un solo escritor** sobre el
    pedido: el primero que acepta se lo queda. Aquí dos escritores no son corrupción
    "esperando turno": son un rider trabajando gratis.
18. **enlazado-viaje** → REFLEJO puro. Compatibilidad geográfica y temporal y tope declarado.
    Cálculo sobre datos; el tope es dato abierto, la regla es determinista.
19. **historico-restaurante** → CUSTODIO. Los hechos medidos del restaurante (espera p75,
    pedidos que no salieron) en append-only. Es lo que el rider lee antes de aceptar: su
    dueño es el hecho, no una opinión.
20. **espera-declarada** → REFLEJO puro. Espera prevista = hora comprometida − llegada
    estimada. Determinista; el valor negativo también se declara (retraso visible).
21. **liberacion-por-abandono** → REFLEJO puro. Timeout y reemisión: mismo hecho, mismo
    resultado. Regla de reloj.
22. **oferta-sin-rider** → PUENTE. Dispara a la sala y al canal por evento cuando la oferta
    caduca. No decide nada: avisa.

## D · REPARTO-MEDIDO (la prueba)
23. **hechos-del-reparto** → CUSTODIO. Append-only de relojes, posición y foto. **Un solo
    escritor** y nunca se reescribe: el acta no se corrige, se amplía.
24. **prueba-entrega** → CUSTODIO. Foto + hora + confirmación. Es el hecho que adjudica:
    un solo escritor, inmutable.
25. **seguimiento-vivo** → REFLEJO puro. Proyección de posición y estado hacia el cliente.
    Sin store, sin juicio.
26. **chat-enmascarado** → PUENTE. Canal rider↔cliente sin exponer números: conecta por
    evento y no guarda la relación. Puente puro.
27. **instrucciones-acceso** → CUSTODIO. Portal, piso, indicaciones: las declara el cliente
    de la tienda; un escritor; reutilizables.
28. **incidencia-reparto** → PUENTE. Del rider a la cola de la sala. No resuelve: entrega.
29. **paradas-del-viaje** → REFLEJO puro. Orden de paradas y **reloj por pedido** en un
    viaje enlazado. Cálculo; cero juicio sobre si el orden es "justo".

## E · TARIFA-TRES-BANDAS
30. **oferta-cliente** → CUSTODIO. Lo que el cliente estipula pagar: se congela con el
    pedido; un escritor; nadie lo cambia después (ni la tienda, ni Bocaos).
31. **incentivo-restaurante** → CUSTODIO. Lo que suma la tienda: se congela igual. Un
    escritor. No borra el histórico de espera.
32. **precio-reparto** → REFLEJO puro. Suma oferta + incentivo en céntimos enteros. Nada de
    aritmética de dinero en otro sitio.
33. **comision-coordinacion** → REFLEJO puro. Los céntimos de Bocaos al rider y a la tienda.
    Cálculo determinista **con el valor declarado**; hoy el valor está abierto (no se estima).
34. **reparto-del-pago** → CONVERSOR. La frontera donde **un** precio de reparto se convierte
    en **dos** cobros a **dos** beneficiarios, sin que Bocaos toque el dinero. Una sola
    frontera; si cada pantalla lo parte a su manera, el dinero se descuadra.
35. **contrato-tramos** → CUSTODIO. El contrato económico por parte (tramo 1, 2, 3): un
    escritor, con vigencia. Es la fuente de `devengo`.

## F · ADJUDICACIÓN DE FALLOS (no juzga, mide)
36. **ventana-espera** → CUSTODIO. Las N declaradas por el jefe (tienda, portal, llegada):
    un store, un escritor, con vigencia por fecha.
37. **hecho-verificado** → REFLEJO puro. Cruza hechos contra ventana. Determinista; el mismo
    insumo da siempre el mismo veredicto.
38. **regla-pago-fallo** → REFLEJO puro. La tabla de las tres reglas. **Aquí no hay agente:
    aquí hay un test.** Es el punto exacto del negocio donde se renuncia a juzgar.
39. **cargo-fallo** → CUSTODIO. El asiento del cargo (quién, cuánto, por qué hecho, con qué
    evidencia). Un escritor; inmutable una vez asentado.
40. **disputa-fallo** → PUENTE. La disconformidad va a la sala con el acta; el humano aplica
    o corrige (`accion-sancion`/`cargo-fallo`), no re-juzga desde cero.
41. **trazabilidad-fallo** → REFLEJO puro. Adjunta la evidencia al cargo y la hace legible.
    Sin evidencia no hay cargo: regla afirmable.

## G · LIQUIDACIÓN DE LA COORDINACIÓN
42. **devengo** → REFLEJO puro. Acumula céntimos por parte y periodo. Cálculo puro sobre
    `contrato-tramos` + hechos.
43. **ciclo-semanal** → CUSTODIO. El periodo: abre, acumula, cierra. Un escritor; sin él, dos
    cierres solapan y se cobra dos veces.
44. **factura-gestion** → CONVERSOR. La única frontera donde el devengo interno se convierte
    en documento de cobro con formato legal.
45. **cobro-gestion** → PUENTE. El cobro por el canal declarado de cada parte. Bocaos cobra
    **lo suyo** y nada más.
46. **impago-gestion** → REFLEJO puro. Regla de mora y suspensión: determinista cuando el
    dueño la declare (hoy abierta). No decide: aplica la regla vigente.
47. **guarda-no-retencion** → REFLEJO puro. Invariante: ningún flujo de Bocaos toca el
    importe del ticket ni del reparto. Es la renuncia "no retiene el dinero" hecha test.

## H · SALA-MERCADO
48. **alta-tienda** → CUSTODIO. El alta y sus condiciones: un escritor (la sala), con acta.
49. **alta-rider** → CUSTODIO. Identidad, zona, capacidad, forma de cobro y acreditaciones
    que el dueño exija. Un escritor.
50. **estado-tienda** → CUSTODIO. Abierta/cerrada/pausada/saturada: un escritor (la tienda o
    la sala, nunca las dos a la vez sin regla).
51. **estado-rider** → CUSTODIO. Disponible/ocupado/desconectado/suspendido: un escritor.
52. **salud-mercado** → REFLEJO puro. Agrega pedidos, aceptaciones, riders activos, esperas y
    devengado. Cálculo; cero interpretación.
53. **tablero-fricciones** → REFLEJO puro. Los **8 pares** contados: esperas, abandonos,
    rechazos, reclamaciones. Mide; no opina sobre quién tiene razón.
54. **aviso-sala** → PUENTE. Lo que cruza un umbral llega a la cola. Evento, no decisión.
55. **terminos-parte** → CUSTODIO. Los términos que acepta cada parte y su versión vigente.
    Un escritor. Es la pieza que sostiene la defensa legal (que hoy está sin declarar).

## I · DEL INTERLOCUTOR CLIENTE (cliente final)
56. **reclamacion-por-la-tienda** → PUENTE. La única vía de queja del cliente final pasa por
    la tienda; la sala la ve como disputa. Sin esta pieza, el cliente sale del sistema.
57. **guarda-marca-ajena** → REFLEJO puro. Invariante: ninguna comunicación al cliente final
    lleva marca de Bocaos. La renuncia del par 6, hecha test.

## R · DEL INTERLOCUTOR RESTAURANTE
58. **panel-tienda** → REFLEJO puro. Proyección de **su** espera, sus pedidos perdidos y sus
    cargos: la misma información que el rider usa para decidir sobre él.
59. **guarda-propiedad-cliente** → REFLEJO puro. Invariante: los datos del cliente de una
    tienda no se leen desde otra ni desde campañas. El par 4, hecho test.

## P · DEL INTERLOCUTOR REPARTIDOR
60. **cartera-rider** → REFLEJO puro. Lo ganado (del cliente), lo debido (a Bocaos) y lo que se
    le debe (un fallo a su favor). Cálculo sobre hechos, sin estimaciones.
61. **zona-rider** → CUSTODIO. La zona/radio que el rider declara. Un escritor (él). Sin zona,
    "cercano" se vuelve opaco.
62. **guarda-sin-exclusividad** → REFLEJO puro. Invariante: nada bloquea al rider por trabajar
    con otro. Diseño de mercado **y** defensa legal (falso autónomo).
63. **canal-rider** → PUENTE. Puerto abierto de notificación de ofertas; intercambiable.

## M · DEL INTERLOCUTOR BOCAOS (el suelo, desde sí mismo)
64. **politica-densidad** → REFLEJO puro. Riders activos por zona frente a pedidos por zona;
    avisa antes de canibalizar o de ahogar. Cálculo; la decisión es humana.
65. **simulador-tramos** → REFLEJO puro. Ingreso de Bocaos y coste por reparto para rider y
    tienda, **con los valores que el dueño ponga**. No decide el precio: enseña la consecuencia.

## J · DEL ROL JEFE
66. **cola-decisiones-sala** → CUSTODIO. Una sola cola de decisiones con consecuencia sobre
    personas. Un escritor; si hay dos colas, hay decisiones perdidas.
67. **umbral-mercado** → CUSTODIO. El store de las N, tope de enlace, radio y tramos, **con
    vigencia por fecha**. Un escritor (el jefe). Es la palanca de gobierno del mercado.
68. **acta-decisiones** → CUSTODIO. Append-only de qué se decidió, con qué hechos y por qué.

## T · DEL ROL TRABAJADOR
69. **cola-sala** → CUSTODIO. La cola única de excepciones vivas, con prioridad por
    consecuencia. Un escritor.
70. **vista-parte** → REFLEJO puro. Todo lo de una tienda o un rider en una vista: proyección,
    sin store propio.
71. **accion-sancion** → CUSTODIO. Suspensión con motivo, plazo y acta. Un escritor; sin
    motivo no hay sanción.
72. **checklist-alta** → REFLEJO puro. Regla de completitud de un alta: qué falta, quién lo
    aporta. Determinista.

## K · DEL ROL CLIENTE (la tienda que paga)
73. **estado-cuenta-parte** → REFLEJO puro. Devengado, cobrado, pendiente y cargos, por parte
    y con evidencia. Proyección calculada; sin esto, la factura llega sin explicación.

---

## EL CORTE MAESTRO, AQUÍ, DA UN RESULTADO RARO — Y ES EL HALLAZGO

**Cero micro-agentes fuzzy en las 73 hojas.** No es un olvido: es el negocio. La pregunta 1
del diseccionador ("¿pensar o calcular?") se responde **siempre** igual porque el principio
central de Bocaos es *"BOCAOS NO JUZGA, MIDE"*. Donde otro negocio pone un agente que
interpreta una reclamación, Bocaos pone un reloj, una foto y una tabla.

Consecuencias, dichas sin adornos:
- **Todo lo que se puede afirmar con un test, se afirma con un test**: 33 reflejos puros.
- **Todo lo que necesita un dueño único, lo tiene**: 27 custodios.
- **Lo que cruza hacia el vecino, cruza por evento**: 10 puentes.
- **Tres fronteras de formato/unidad/dimensión**: 3 conversores (carta → escaparate, un
  precio → dos cobros, devengo → factura).
- **El juicio humano no desaparece: se concentra.** No está en un agente: está en la sala
  (`cola-decisiones-sala`, `disputa-fallo`, `accion-sancion`) y en el jefe (`umbral-mercado`,
  `acta-decisiones`). Es la única forma de que "no juzga" sea verdad y no marketing.

**Dónde SÍ entraría un micro-agente si el dueño lo pide (no declarado, no se construye):**
un informe semanal en lenguaje natural para cada tienda y cada rider ("tu cocina ha mejorado,
tu espera media ha bajado"). Sería fuzzy de redacción sobre hechos ya medidos — nunca
de adjudicación. Queda como pregunta, no como pieza.

---

## RECUENTO
| Forma | Nº | Hojas |
|---|---|---|
| REFLEJO puro | 33 | 3,6,7,8,12,14,15,16,18,20,21,25,29,32,33,37,38,41,42,46,47,52,53,57,58,59,60,62,64,65,70,72,73 |
| CUSTODIO | 27 | 1,4,5,9,11,17,19,23,24,27,30,31,35,36,39,43,48,49,50,51,55,61,66,67,68,69,71 ※ |
| PUENTE | 10 | 10,13,22,26,28,40,45,54,56,63 |
| CONVERSOR | 3 | 2,34,44 |
| MICRO-AGENTE fuzzy | **0** | — (el negocio prohíbe el juicio) |

※ El recuento suma 73 hojas; la tabla agrupa por forma dominante cuando una hoja tiene una
segunda forma de apoyo (p.ej. `prueba-entrega` es custodio con reflejo de validación).
**Ninguna hoja atómica quedó sin forma.**
