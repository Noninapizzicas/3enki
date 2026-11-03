# PASADA 1 · Prisma global del SUJETO "Bocaos" — tercera vuelta

> **Fase 2 · esquematizar-negocio · vertical `bocaos`** · tercera pasada. La F0 §7 añade la
> arquitectura de la federación y con eso el prisma ya no se puede pasar a un solo nivel.
>
> **Sujeto:** el mismo de la identidad (`F0-identidad-bocaos.json`), leído, no preguntado.
> Lo que cambia no es el sujeto: es **el número de niveles a los que hay que pasarlo**.
>
> **Lo que esta pasada aporta y las dos anteriores no tenían:** la F0 §7 dice que Bocaos no es
> una empresa central con sedes, sino una **federación de plazas**. Eso obliga a responder, para
> cada pieza del árbol, una pregunta que en la v2 no existía: **¿de quién es?** — y la respuesta
> no es "de Bocaos", porque ahora hay dos Bocaos.
>
> **Medida maestra (no cambia):** propuestas aceptadas por propuesta emitida. La federación no
> añade una medida nueva de mercado; añade una de **réplica**: cuántas plazas operan con la
> misma versión y cuánto tarda abrir una.

---

## Prisma de los 5 huecos (ronda 1, tercera vuelta)

### 1 · IDENTIDAD — ¿qué es exactamente el sujeto, ahora?

En la v2 el prisma concluyó: *Bocaos no vende software de reparto, vende un criterio*. Sigue
siendo cierto y ya no es suficiente. Con la §7 el criterio se **instancia**:

```
lo que Bocaos vende     un criterio replicable  (cuatro umbrales, una ventana, una tabla de fallos)
lo que Bocaos es        el registro de dónde corre ese criterio, con qué números y con qué versión
lo que Bocaos NO es     un mercado más grande. No hay mercado nacional.
```

La frase que ordena todo el esquema:

> **El mercado ocurre en una plaza. La federación solo sabe dónde.**

De ahí salen cuatro consecuencias que esta pasada fija y que la v2 no podía fijar:

**a) Hay tres unidades, no dos.** En la v2 la unidad era "el mercado" y por debajo "la tienda".
Ahora son tres, y cada una tiene su propio almacén, su propio dueño y su propio alcance:

```
FEDERACIÓN   el registro · la marca · el software · el soporte · la liquidación consolidada
   └ PLAZA   un despliegue · su BD · sus tiendas · sus riders · sus reglas y umbrales
        └ TIENDA   un proyecto · su carta · su marca · su cliente · su pedido · su cocina
```

**b) La unidad de negocio no cambia; la unidad de operación sí.** La propuesta aceptada sigue
siendo la unidad de negocio (v2). Pero **la plaza es la unidad de operación**: todo lo que
ocurre —pedido, propuesta, ruta, espera, fallo, cobro— ocurre dentro de un despliegue. Y esto
no es una preferencia de arquitectura: es lo que hace que un fallo tumbe una localidad y no el
país (F0 §7, "por qué así y no un servidor único").

**c) El nacional no es un nivel superior del mismo negocio: es otro negocio.** Su producto no
es el reparto, es la **continuidad**: la misma marca, el mismo software, el mismo criterio de
liquidación, y un registro que permite que un cliente de Málaga y una tienda de Bilbao
encuentren donde les corresponde. Un nacional que además operara pedidos no sería una
federación: sería una empresa central con delegaciones — exactamente lo que la §7 evita.

**d) El criterio de la v2 se afina: los umbrales no son "del proyecto".** La §6.3 decía
literalmente "los umbrales son del PROYECTO"; la §7 dice que la plaza tiene "sus reglas y sus
umbrales". Con tres niveles, "proyecto" ya no puede significar las dos cosas. Lectura de este
prisma —**y es pregunta, no decisión**—:

```
la VERTICAL    fija que hay cuatro umbrales, sus unidades y que la comparación es AND
la PLAZA       declara los cuatro números, la ventana, el orden de candidatos y su cobertura
la TIENDA      no tiene umbrales. Tiene UNA palanca económica: su incentivo por pedido
```

Si la tienda pudiera tener umbrales propios, cada tienda sería un mercado dentro del mercado y
el rider tendría que aprenderse N juegos de reglas. El esquema lo deja fuera **a propósito**, y
lo pregunta (Q1 · Q43).

### 2 · RESTRICCIONES — qué le limita (freno → empujón, ninguna como muro)

Las cinco reglas de la federación (F0 §7) no son un organigrama: son **frenos que protegen un
estado**. Cada uno, con su gemelo positivo construible.

| Freno declarado (F0 §7) | Estado que protege | Empujón (pieza construible) |
|---|---|---|
| **El cliente solo ve las tiendas que reparten en su zona** (r.1) | que el escaparate no prometa lo que no puede entregar | `filtro-por-cobertura` + `radio-de-tienda` + `config-zona` |
| **El rider se da de alta en cada plaza; su histórico no viaja** (r.2) | que un rider de otra ciudad no herede una reputación que no construyó aquí, ni la arrastre | `alta-rider` **por plaza** + `cartera-rider` por plaza + `pasaporte-de-rider` **[ABIERTA]** |
| **El buscador es nacional pero cada resultado lleva a SU plaza** (r.3) | que el nacional no se convierta en el escaparate (si lo fuera, sería el dueño de la demanda) | `buscador-nacional` + `resultado-con-su-plaza` + `enrutado-a-plaza` |
| **La liquidación es por plaza; el nacional consolida, no recauda** (r.4) | que el nacional no sea banco ni recaudador — la misma renuncia de la §1, un nivel más arriba | `devengo`/`cobro-gestion` por plaza + `consolidacion-nacional` + `guarda-no-recauda` |
| **El nacional comparte marca, software, soporte y registro. Nada más** (r.5) | que la federación siga siendo federación: **cuanto más comparte, más empresa central es** | `registro-de-plazas` + `version-de-plaza` + `marca-nacional` + `soporte-nacional` + `acceso-delegado-a-plaza` |
| **Un fallo tumba una localidad, no el país** (F0 §7) | la continuidad del negocio | un despliegue por plaza + `compatibilidad-de-version` + cero dependencia de datos del nacional para operar |
| **Abrir plaza es desplegar, no migrar** (F0 §7) | que crecer no exija tocar lo que ya funciona | `alta-de-plaza` + `despliegue-de-plaza` + `estado-de-plaza` |
| **El nacional NO tiene los pedidos** (F0 §7) | que el nacional no pueda ordenar el mercado ni verlo | `guarda-sin-catalogo-nacional` + `guarda-frontera-de-plaza` |

Y los frenos que ya venían de la §6 y **no cambian de naturaleza, solo de dueño**: el cerebro
central no existe (ahora, además, no podría existir: no tiene los datos), la propuesta es una
propuesta, los umbrales no son de la vertical, el ahorro no es de Bocaos.

### 3 · CONTRATO — qué intercambia, con quién, y en qué nivel

La v2 tenía un contrato por actor. Ahora hay un contrato por actor **y por nivel**, y esa
segunda dimensión es la que destapa los huecos de dinero.

```
CON EL CLIENTE FINAL
  la plaza  da: las tiendas que reparten en su dirección, precio cerrado, hora, prueba
            recibe: nada. No hay cuenta. No hay app. No hay marca.
  el nacional NO EXISTE para él. Ni en el buscador: el buscador le devuelve SU plaza.

CON LA TIENDA
  la tienda da: su carta, su marca, su cliente, su pedido, su hora de listo
            recibe: escaparate, riders, la medida de su cocina, y su incentivo como palanca
  la plaza  da: el suelo, la cadena de propuesta, la liquidación de su zona
            recibe: tramo 1 (fijo) + tramo 3 (céntimos por pedido aceptado)
  el nacional da: la marca bajo la que la tienda se presenta, el software, el soporte
            recibe: [NADA DECLARADO — Q41. Aquí hay un hueco, no un contrato]

CON EL REPARTIDOR
  la plaza  da: propuestas con cuatro números y ~20 s, el importe íntegro, su cartera
            recibe: céntimos por pedido aceptado (tramo 3)
  el nacional da: nada directamente. Ni alta, ni cartera, ni historial. Su alta es por plaza.
            (si el alta se repitiera en cada plaza, eso es fricción — Q44)

CON LA PLAZA (el contrato que la §7 no escribe)
  la plaza  da: su mercado, sus tiendas, su operación, su liquidación
            recibe: marca, software, soporte, registro
  el nacional da: lo anterior
            recibe: [NADA DECLARADO — Q41]
```

**El hueco del contrato está en la última línea, y es el hueco más caro del esquema.** En la v2
Bocaos cobraba a la tienda y con eso vivía. Con la §7 ese cobro es **de la plaza**. El nacional
-comparte marca, software y soporte- y **no tiene una sola línea de ingreso declarada**. Puede
ser un canon por plaza, un porcentaje del devengo de cada plaza, o nada (si el nacional y las
plazas son la misma persona jurídica, en cuyo caso la federación es una forma de organizarse,
no un negocio aparte). **No está escrito: es Q41 y bloquea.**

### 4 · NO-OBJETIVOS — el nacional, pieza a pieza

El nacional es la pieza del esquema con más "no" por metro cuadrado, y eso es deliberado.

- **No tiene pedidos.** Ni para consultarlos, ni para contarlos, ni para "mejorar el servicio".
  → `guarda-frontera-de-plaza`.
- **No tiene catálogo ni precios.** Si los tuviera, sería el marketplace. → `guarda-sin-catalogo-nacional`.
- **No tiene carrito.** El carrito es de la tienda, en la plaza. Sin carrito no hay venta,
  y sin venta el nacional no puede capturar la demanda (F0 §1).
- **No recauda.** Consolida. → `guarda-no-recauda`.
- **No tiene riders.** Ni censo, ni histórico, ni disponibilidad. Los riders son de la plaza.
- **No decide a quién se le propone un pedido.** No puede: no tiene ni el evento ni la ruta.
  La renuncia de la §6 (`guarda-sin-optimizador`) ahora es **física**, no solo moral.
- **No ordena el buscador por conveniencia comercial.** Ordena por cercanía a la localidad que
  el cliente escribió, y cada resultado es una plaza, no una tienda destacada.
- **No juzga, no sanciona, no suspende tiendas.** Eso es de la plaza. El nacional solo puede
  **sacar una plaza del registro** (`estado-de-plaza`), que es otra cosa y es más grave.

Y la lista de la plaza, que hereda casi entera la de la v2: no asigna, no optimiza en bloque,
no agrupa clientes, no captura el ahorro, no cobra el ticket, no retiene, no contrata, no tiene
app de cliente, no ordena el mercado, no juzga fallos.

### 5 · PREGUNTAS ABIERTAS (ley de cero supuestos)

De la F0: las 6 de siempre, con **una que la §7 reabre** (`umbrales_enlazado`: de la vertical,
de la plaza, de la zona o de la tienda) y **dos nuevas que la §7 crea** (el dinero del nacional
y la forma del despliegue). Guion completo en `guion-preguntas.md`; las 16 nuevas son el
bloque G (Q41–Q56).

```
[F0 §6] umbrales_enlazado      → Q1 · Q3 · Q43   (ahora con cuatro candidatos de dueño)
[F0 §7] dinero_de_la_federacion → Q41 · Q42 · Q53 (nuevo: el nacional no tiene ingreso declarado)
[F0 §7] forma_del_despliegue    → Q55             (nuevo: ¿una plaza es un proyecto con N tiendas?)
[F0 §7] rider_entre_plazas      → Q44 · Q45       (credencial y N carteras)
[F0 §7] soporte_sin_pedidos     → Q46             (acceso delegado o soporte ciego)
```

---

## EL ESLABÓN LIMITANTE (lo identifico yo, del flujo declarado)

La §7 **no cambia el cuello del día**. Lo enmarca, y destapa un segundo cuello que la v2 no
podía ver: el del crecimiento.

```
cliente pide en la web de SU tienda (una tienda de ESTA plaza)
   → el pedido va a esa tienda → la tienda cocina → marca LISTO
   → pedido.listo nace DENTRO de la plaza
   → mide · compara 4 umbrales · PROPONE a UN rider de esta plaza (~20 s)
   → acepta · rechaza · calla        ← el cuello del día, intacto
   → recoge → entrega → paga → liquidación de la plaza → consolidación del nacional
```

### Cuello 1 (el del día) · LA PROPUESTA → LA ACEPTACIÓN — y ahora se sabe por qué es intra-plaza

Con la §7 aparece una razón nueva, y es la más fuerte de todas: **el enlazado no puede cruzar
plazas**. La ruta viva del rider vive en el despliegue donde trabaja; el pedido vive en el
despliegue de su tienda; y el nacional no tiene ni una cosa ni la otra. Por tanto:

```
el enlace es SIEMPRE dentro de una plaza  →  guarda-enlace-intra-plaza
```

Eso cierra, por arquitectura y no por política, la pregunta que la v2 dejó abierta (Q31:
¿se pueden enlazar pedidos de tiendas distintas?) — **sí, y siempre que estén en la misma
plaza**. Y abre la que sí queda: un pedido de una tienda de la plaza A a una dirección de la
plaza B (Q52).

### Cuello 2 (el del crecimiento) · EL ARRANQUE EN FRÍO DE UNA PLAZA

Este es el hallazgo de esta pasada, y no es una pieza: es una consecuencia.

```
una plaza nueva llega con cero hechos
   → sin histórico de puntualidad de las tiendas  → `puntualidad-declarada` no tiene qué declarar
   → sin histórico de esperas                      → `medida-espera` no tiene contra qué medir
   → `hueco-de-medida` manda: no hay propuesta
   → no hay reparto → no hay pedidos → no hay hechos → no hay histórico
```

**La ley de cero supuestos, aplicada con honestidad, hace que una plaza recién abierta no pueda
proponer nada.** Eso no es un bug del esquema: es el precio de no inventar datos. Pero es un
problema de negocio de primer orden, porque la §7 dice que crecer es abrir plazas. Las salidas
posibles son todas decisiones del dueño, y ninguna está declarada (Q51):

1. una **política de arranque** de la plaza (durante N días se propone con umbrales más laxos y
   se dice que es un arranque) — es una pieza nueva si se elige;
2. un **período de medición sin propuesta** (la plaza abre "en observación" y solo mide);
3. **heredar** el histórico de otra plaza de la misma federación — y eso choca de frente con la
   regla 2 ("su histórico no viaja"), así que no es una opción sin cambiar §7.

El esquema **no elige**. Deja el cuello nombrado y las tres salidas sobre la mesa.

### El cuello del día, expandido (frenos → empujones de la §7)

| Freno nuevo que la §7 pone sobre el cuello | Empujón |
|---|---|
| Los umbrales los declara la plaza, no la vertical | `config-umbrales` con vigencia **por plaza** + `version-efectiva` |
| Una plaza sin histórico no propone | `hueco-de-medida` **a escala de plaza** + Q51 (la política de arranque) |
| El rider de dos plazas tiene dos vidas | `alta-rider` por plaza + `cartera-rider` por plaza + Q44/Q45 |
| El nacional no puede ver la propuesta para "ayudar" | `acceso-delegado-a-plaza` (permiso, plazo, traza) + Q46 |
| Un despliegue viejo no puede romper el registro | `compatibilidad-de-version` + `version-de-plaza` |

---

## LO QUE LA §7 ROMPE EN LA v2 (cuatro contradicciones, y qué se hace con ellas)

Un esquema que no dice qué le rompen sus entradas no está sirviendo de nada.

| # | Lo que decía la v2 | Lo que dice la §7 | Consecuencia |
|---|---|---|---|
| 1 | `config-umbrales` es "**del PROYECTO**" (§6.3) | "la plaza [tiene] sus reglas y sus umbrales" | **Cambia el dueño, no la pieza.** Umbrales = plaza; la tienda solo tiene incentivo. Se escribe así y se pregunta (Q1 · Q43). |
| 2 | "el nacional comparte **la liquidación**" (r.5) | "la liquidación es por plaza; el nacional **consolida, no recauda**" (r.4) | La palabra "liquidación" hace dos trabajos. Se parte en dos piezas: `ciclo-semanal`/`cobro-gestion` (plaza) y `consolidacion-nacional` (nacional). Ya no son la misma cosa. |
| 3 | "el nacional comparte **el soporte**" (r.5) | "el nacional **no** tiene los pedidos" (§7) | Soporte sin pedidos es soporte ciego. O hay acceso delegado con permiso y traza (`acceso-delegado-a-plaza`), o el soporte es solo de software. **No puede quedarse como está: es Q46.** |
| 4 | el rider cobra "su reparto" y tiene **una** cartera (`cartera-rider`) | "se da de alta en cada plaza; su histórico no viaja" | Un rider en dos plazas tiene **dos carteras, dos altas y dos históricos**. La pieza no cambia; su instanciación sí. Es fricción real para el actor que puede marcharse (Q44 · Q45). |

Y una quinta, que no es contradicción sino **hueco de forma** (y por eso va a preguntas, no a
tabla): la F0 dice a la vez *"cada tienda = un proyecto"* y *"la plaza = un despliegue con su
BD"*. Si un proyecto es una BD y una plaza tiene su BD con N tiendas dentro, **una de las dos
frases tiene que ceder** (Q55). El esquema no puede resolverlo solo y la FASE 3 lo va a
necesitar el primer día.

---

## SUB-PRODUCTOS de la ronda 1 (cada uno → su pasada)

1. `federacion` — el nacional: registro, marca, software, soporte, consolidación, y sus seis
   "no". **Nuevo en esta pasada.** → `pasada-2-federacion.md` (y `-3-`, `-4-` hasta seca).
2. `plaza-despliegue` — la plaza como unidad: su BD, su censo, sus reglas, su cobertura, su
   frontera, su estado. **Nuevo.** → `pasada-2-plaza-despliegue.md`.
3. `corte-de-piezas` — qué pieza es de quién. **Nuevo, y es el que hace verificable la §7.**
   → `pasada-2-corte-de-piezas.md`.
4. `plaza-tienda` — el escaparate dentro de una plaza (D, actualizado: filtro por cobertura).
5. `config-plaza` — los cuatro números y su dueño (J, corregido).
6. `liquidacion-federada` — el dinero por plaza y la consolidación (H, partido en dos).
7. `sala-y-soporte` — la operación humana por plaza y el soporte del nacional (I, partido).
8. `propuesta-enlace` · `ruta-viva` · `pedido-listo` · `tarifa-tres-bandas` · `reparto-medido` ·
   `adjudicacion-fallos` — **heredados de la v2 sin cambios de fondo** (ver cabeceras de cada
   fichero y `pasada-2-corte-de-piezas.md` §E para el único delta).
