# ESQUEMA MAESTRO — vertical **BOCAOS**

> **Fase 2 · esquematizar-negocio** · vertical `bocaos` · entregable del gate.
> **Sujeto (leído de la F0, no preguntado):** `que_es` = un mercado de bocados con muchas
> tiendas, donde el cliente entra, elige tienda y paga en la que elige; `que_vende` = TPV +
> coordinación de reparto a tres bandas + escaparate propio por tienda; `como_lo_elabora` =
> plataforma propia, el reparto lo ejecutan autónomos que se ofertan a los restaurantes, la
> plataforma **no retiene el dinero ni cobra el ticket**.
>
> **Medida maestra:** la salud del mercado se mide en **aceptaciones**, no en ventas. Un
> pedido que no encuentra rider es una venta que no existe.
>
> **Agnosticismo:** cero tecnologías. Todo lo del entorno es puerto abierto (§8).
> **Vertical, no proyecto:** ni un restaurante, ni un barrio, ni un precio, ni un rider real
> dentro del esquema. Todo lo local es del proyecto.

---

## 0 · EL FLUJO DECLARADO Y EL ESLABÓN LIMITANTE

**Flujo (F0):**
```
cliente pide en la web de su tienda  →  el pedido va a ESA tienda  →  la tienda cocina
   →  el pedido se OFERTA a repartidores  →  un rider cercano ACEPTA (y enlaza 2-3)
   →  recoge  →  entrega  →  cliente paga comida (a la tienda) y reparto (al rider)
   →  tienda y rider pagan a Bocaos su gestión, semanalmente
```

**ESLABÓN LIMITANTE = LA ACEPTACIÓN DEL REPARTIDOR** (el paso oferta → aceptación, con el
enlazado dentro). Es el corazón del esquema, no una sección más:

1. Es **el único paso sin obligación en ninguna de las dos partes**: no hay contrato de
   trabajo, no hay asignación, y el rider puede marcharse sin avisar.
2. Es **el paso que decide si el pedido existe**: sin aceptación no hay reparto, y sin
   reparto la venta del restaurante se cae con él.
3. Es **donde se acumulan todas las pérdidas**: de las tres primeras fricciones, en las tres
   el que pierde es el rider (espera en tienda, portal, cliente que no baja).
4. Su capacidad **es** la capacidad del mercado: repartos aceptados por hora y por zona.

La propia F0 lo dice sin rodeos: *"eso es lo que hay que arreglar primero, antes que el
escaparate o el TPV"* y *"si el rider es el que paga todas las fricciones del sistema, el
sistema se queda sin riders; y sin riders no hay mercado"*.

### El cuello expandido al máximo (freno → empujón → pieza)
| Freno del cuello | Empujón (la pieza que lo abre) |
|---|---|
| El rider decide a ciegas | `visibilidad-oferta` + `espera-declarada` + `historico-restaurante` |
| La espera no está pagada | `ventana-espera` + `hecho-verificado` + `regla-pago-fallo` + `cargo-fallo` |
| Aceptar no le compensa | `precio-reparto` (oferta del cliente + incentivo de la tienda) + `enlazado-viaje` |
| Puede irse y no vuelve | `guarda-sin-exclusividad` + `cartera-rider` + `panel-tienda` (el mercado se corrige, no se le retiene) |
| Dos aceptan a la vez | `aceptacion-atomica` (un pedido, un aceptante, sin prioridad comprada) |
| Nadie acepta | `oferta-sin-rider` (a la sala) + subir la oferta (abierto) |
| El enlace retrasa al cliente | `tope-enlace` + `paradas-del-viaje` con reloj por pedido |
| "Cerca" puede volverse opaco | `elegibilidad-rider` + `zona-rider` + `neutralidad-orden` |

---

## 1 · EL BUCLE QUE SOSTIENE EL MERCADO (la corrección sin juez)

Esto es lo que Bocaos vende de verdad: un mercado que se corrige solo porque **mide y
traslada el coste**. Sin este bucle, el resto son pantallas.

```
   la tienda se retrasa
        ↓
   relojes medidos (hechos-del-reparto)         ← nadie opina, todo tiene hora
        ↓
   espera > N_t  →  el coste lo paga la tienda  (regla-pago-fallo, cargo-fallo)
        ↓
   su espera queda en su histórico              (historico-restaurante)
        ↓
   el rider lo VE antes de aceptar              (espera-declarada, visibilidad-oferta)
        ↓
   acepta menos / exige más incentivo           (incentivo-restaurante, precio-reparto)
        ↓
   la tienda pierde pedidos  →  corrige la cocina  (panel-tienda, tablero-fricciones)
```

La corrección no la hace Bocaos: la hace el mercado **con la información que Bocaos mide**.
Por eso el eslabón limitante no se resuelve "empujando riders" sino **dándoles información
y cobrando la espera a quien la causa**.

---

## 2 · ÁRBOL MAESTRO — piezas del prisma GLOBAL (A–H)

### A · PLAZA-TIENDA (el escaparate propio — tramo 2)
- A1 `marca-tienda` — **CUSTODIO** · quién firma el escaparate (la tienda, nunca Bocaos)
- A2 `carta-publica` — **CONVERSOR** · catálogo interno → vista pública podada (una sola fuente: el TPV)
- A3 `precio-cerrado` — **REFLEJO** · todo compuesto en céntimos antes de pagar
- A4 `carrito-tienda` — **CUSTODIO** · buffer de compra por cliente y tienda
- A5 `registro-cliente-tienda` — **CUSTODIO** · el cliente es de la tienda, aislado por tienda
- A6 `plaza-publica` — **REFLEJO** · índice del mercado como proyección del listado de tiendas
- A7 `neutralidad-orden` — **REFLEJO** · invariante: sin ranking, sin destacados, sin prioridad comprada

### B · PEDIDO (el hecho que viaja)
- B1 `captura-pedido` — **REFLEJO** · validación y alta **de a uno**
- B2 `estado-pedido` — **CUSTODIO** · máquina de estados; ningún salto sin hecho con hora
- B3 `aviso-tienda` — **PUENTE** · llega a la tienda por evento; no pisa su decisión
- B4 `compromiso-recogida` — **CUSTODIO** · la hora a la que la tienda se compromete
- B5 `estado-cocina-visible` — **REFLEJO** · proyección podada del estado
- B6 `aviso-cliente` — **PUENTE** · sale por el canal de la tienda, no por una app
- B7 `rechazo-cancelacion` — **REFLEJO** · transiciones permitidas (quién paga el rechazo: abierto)

### C · OFERTA-REPARTO — **EL ESLABÓN LIMITANTE**
- C1 `elegibilidad-rider` — **REFLEJO** · distancia/zona/capacidad declaradas, sin nota
- C2 `visibilidad-oferta` — **REFLEJO** · la misma oferta para todos los elegibles
- C3 `aceptacion-atomica` — **CUSTODIO** · el primero que acepta se lo queda
- C4 `enlazado-viaje` — **REFLEJO** · compatibilidad geográfica y temporal + tope
- C5 `historico-restaurante` — **CUSTODIO** · la espera medida de esa cocina, append-only
- C6 `espera-declarada` — **REFLEJO** · lo que el rider sabe antes de aceptar
- C7 `liberacion-por-abandono` — **REFLEJO** · aceptó y no llega → el pedido vuelve a la oferta
- C8 `oferta-sin-rider` — **PUENTE** · avisa a la sala cuando nadie acepta

### D · REPARTO-MEDIDO (la prueba)
- D1 `hechos-del-reparto` — **CUSTODIO** · relojes, posición, foto; inmutable
- D2 `prueba-entrega` — **CUSTODIO** · foto + hora + confirmación
- D3 `seguimiento-vivo` — **REFLEJO** · proyección de posición y estado al cliente
- D4 `chat-enmascarado` — **PUENTE** · rider↔cliente sin exponer números
- D5 `instrucciones-acceso` — **CUSTODIO** · portal, piso, indicaciones
- D6 `incidencia-reparto` — **PUENTE** · de la calle a la cola de la sala
- D7 `paradas-del-viaje` — **REFLEJO** · orden de paradas y **reloj por pedido**

### E · TARIFA-TRES-BANDAS (el precio del reparto)
- E1 `oferta-cliente` — **CUSTODIO** · lo que el cliente estipula; se congela con el pedido
- E2 `incentivo-restaurante` — **CUSTODIO** · lo que suma la tienda; no borra su histórico
- E3 `precio-reparto` — **REFLEJO** · oferta + incentivo en céntimos
- E4 `comision-coordinacion` — **REFLEJO** · céntimos de Bocaos (valor: abierto)
- E5 `reparto-del-pago` — **CONVERSOR** · un precio → dos cobros a dos beneficiarios
- E6 `contrato-tramos` — **CUSTODIO** · el contrato económico por parte, con vigencia

### F · ADJUDICACIÓN DE FALLOS (no juzga, mide)
- F1 `ventana-espera` — **CUSTODIO** · las N declaradas (tienda, portal, llegada)
- F2 `hecho-verificado` — **REFLEJO** · cruza hechos contra ventana
- F3 `regla-pago-fallo` — **REFLEJO** · la tabla de las tres reglas; aquí hay un test, no un agente
- F4 `cargo-fallo` — **CUSTODIO** · quién debe cuánto a quién, con evidencia
- F5 `disputa-fallo` — **PUENTE** · a la sala; el humano aplica, no re-juzga
- F6 `trazabilidad-fallo` — **REFLEJO** · sin evidencia no hay cargo

### G · LIQUIDACIÓN DE LA COORDINACIÓN (el único dinero de Bocaos)
- G1 `devengo` — **REFLEJO** · acumula céntimos por parte y periodo
- G2 `ciclo-semanal` — **CUSTODIO** · abre, acumula, cierra
- G3 `factura-gestion` — **CONVERSOR** · devengo → documento de cobro
- G4 `cobro-gestion` — **PUENTE** · cobra **lo suyo** por el canal de cada parte
- G5 `impago-gestion` — **REFLEJO** · regla de mora y suspensión (abierta)
- G6 `guarda-no-retencion` — **REFLEJO** · invariante: Bocaos no toca el ticket ni el reparto

### H · SALA-MERCADO (la operación humana mínima)
- H1 `alta-tienda` — **CUSTODIO**
- H2 `alta-rider` — **CUSTODIO**
- H3 `estado-tienda` — **CUSTODIO**
- H4 `estado-rider` — **CUSTODIO**
- H5 `salud-mercado` — **REFLEJO** · pedidos, aceptaciones, riders activos, esperas, devengado
- H6 `tablero-fricciones` — **REFLEJO** · los **8 pares** medidos
- H7 `aviso-sala` — **PUENTE**
- H8 `terminos-parte` — **CUSTODIO** · lo que cada parte acepta y su versión

---

## 3 · ÁRBOL — piezas que SOLO emergen desde cada INTERLOCUTOR

### I · CLIENTE FINAL (el de la tienda — no es cliente de Bocaos)
- I1 `reclamacion-por-la-tienda` — **PUENTE** · su única vía de queja pasa por la tienda
- I2 `guarda-marca-ajena` — **REFLEJO** · ninguna comunicación al cliente lleva marca de Bocaos
- *Refuerza*: A3 `precio-cerrado`, A5 `registro-cliente-tienda`, D3 `seguimiento-vivo`,
  D4 `chat-enmascarado`, E5 `reparto-del-pago`.

### R · RESTAURANTE (la tienda, el que paga)
- R1 `panel-tienda` — **REFLEJO** · ve su espera medida: **la misma información que el rider**
- R2 `guarda-propiedad-cliente` — **REFLEJO** · sus clientes no cruzan a otra tienda ni a campañas
- *Refuerza*: A2 `carta-publica` (una sola fuente: su TPV), E6 `contrato-tramos`,
  H8 `terminos-parte`.

### P · REPARTIDOR AUTÓNOMO (el que puede irse)
- P1 `cartera-rider` — **REFLEJO** · lo ganado, lo debido, lo que se le debe
- P2 `zona-rider` — **CUSTODIO** · la zona/radio que declara para recibir ofertas
- P3 `guarda-sin-exclusividad` — **REFLEJO** · nada le bloquea por trabajar con otro
- P4 `canal-rider` — **PUENTE** · puerto abierto de notificación de ofertas
- *Refuerza*: C2 `visibilidad-oferta`, C6 `espera-declarada`, F4 `cargo-fallo` (a su favor).

### M · BOCAOS (el suelo, visto desde sí mismo)
- M1 `politica-densidad` — **REFLEJO** · riders activos por zona frente a pedidos por zona
- M2 `simulador-tramos` — **REFLEJO** · la consecuencia de un tramo, con los números del dueño
- *Refuerza*: H5 `salud-mercado`, H6 `tablero-fricciones`, G6 `guarda-no-retencion`.

---

## 4 · ÁRBOL — piezas que SOLO emergen desde cada ROL

### J · ROL JEFE (el dueño del mercado: declara reglas, decide lo que no se mide)
- J1 `cola-decisiones-sala` — **CUSTODIO** · una sola cola de decisiones con consecuencia
- J2 `umbral-mercado` — **CUSTODIO** · las N, el tope de enlace, el radio y los tramos, **con vigencia**
- J3 `acta-decisiones` — **CUSTODIO** · por qué se admitió, se sancionó o se expulsó
- *Interfaz*: cuadro del mercado (aceptación a la primera, riders activos por zona, espera
  media por tienda, los 8 pares, devengado vs cobrado).
- *Tensión resuelta*: el jefe quiere cambiar reglas rápido; la sala necesita estabilidad →
  `umbral-mercado` guarda **vigencia por fecha**: cada caso se juzga con la regla que estaba
  viva cuando ocurrió.

### T · ROL TRABAJADOR (la sala: opera el día de hoy)
- T1 `cola-sala` — **CUSTODIO** · la cola única de excepciones vivas
- T2 `vista-parte` — **REFLEJO** · todo lo de una tienda o un rider en una pantalla
- T3 `accion-sancion` — **CUSTODIO** · suspensión con motivo, plazo y acta
- T4 `checklist-alta` — **REFLEJO** · qué falta para dar de alta, sin memoria
- *Interfaz*: pedidos vivos, disputas con evidencia, altas pendientes, estado de cada zona.

### K · ROL CLIENTE (dos caras: la tienda que paga y el cliente final que no es de Bocaos)
- K1 `estado-cuenta-parte` — **REFLEJO** · devengado, cobrado, pendiente y cargos, con evidencia
- *Refuerza*: R1 `panel-tienda`, P1 `cartera-rider`, A3 `precio-cerrado`, A4 `carrito-tienda`.
- *Hallazgo*: el **cliente final no genera piezas propias: genera renuncias** (I2, R2 y la
  prohibición de la app). Su prisma demuestra que la renuncia del par 6 es estructural.

---

## 5 · LAS RENUNCIAS COMO INVARIANTES (lo que impide que Bocaos se convierta en Glovo)

| Renuncia declarada en F0 | Pieza que la sostiene | Qué la rompería |
|---|---|---|
| No hay app de cliente | `guarda-marca-ajena` (I2) + A5 por tienda | una app con marca Bocaos que capture demanda |
| No cobra el ticket | `guarda-no-retencion` (G6) | cobrar un % de la comida |
| No retiene el dinero | G6 + E5 `reparto-del-pago` (dos cobros directos) | una pasarela única que liquide Bocaos |
| No tiene riders contratados | P3 `guarda-sin-exclusividad` + C3 aceptación libre | turnos, asignación, protocolo de obediencia |
| No ordena el mercado | A7 `neutralidad-orden` | destacados, ranking pagado, "recomendados" |
| No juzga los fallos | F3 `regla-pago-fallo` (test) + F2 | un agente que "valore" una reclamación |
| El cliente es de la tienda | R2 `guarda-propiedad-cliente` | cruzar clientes entre tiendas o usarlos en marketing |

**Estas cinco primeras piezas son tests, no pantallas.** Si un día se ponen rojas, el modelo
ha cambiado de naturaleza — y conviene enterarse por un test y no por un restaurante
enfadado.

---

## 6 · EL DINERO (mapa completo — qué toca Bocaos y qué no)

```
cliente  →  tienda     importe de la comida          NO lo toca Bocaos
cliente  →  rider      importe del reparto (él lo estipula)   NO lo toca Bocaos
tienda   →  Bocaos     tramo 1 fijo mensual + tramo 3 céntimos/pedido   ← SÍ
rider    →  Bocaos     tramo 3 céntimos/pedido                          ← SÍ
```
- El **tramo 2** (el escaparate) va incluido en el tramo 1: no tiene precio propio.
- El **tramo 3** es el único ingreso variable: céntimos al rider y a la tienda por pedido.
- Consecuencia estructural: Bocaos **no tiene palanca sobre el dinero de nadie**; su única
  palanca es el acceso a la plaza y su propia cuota. De ahí que la efectividad de un cargo
  por fallo sea una pregunta abierta y no un detalle (§11, Q8).

---

## 7 · LAS 8 FRICCIONES, PAR A PAR — qué pieza las atiende y qué NO se resuelve

| Par | Pieza(s) que lo atienden | Lo que **no** se resuelve (dicho en la F0) |
|---|---|---|
| cliente ↔ restaurante | A3, B5, B6, C6 | que la comida esté buena |
| restaurante ↔ rider | C5, C6, F1–F4, R1 | la cocina lenta: solo se hace **visible y cobrada** |
| rider ↔ cliente | D2, D3, D4, D5 | que el cliente baje |
| restaurante ↔ Bocaos | R2, M2, K1, H8 | el miedo a perder su cliente: lo resuelve el primer mes funcionando |
| rider ↔ Bocaos | P1, P3, C2, F4 | que haya pedidos suficientes el primer mes |
| cliente ↔ Bocaos | I2, I1, A5 | que el cliente sepa que Bocaos existe — **y eso es deliberado** |
| restaurante ↔ restaurante | A7, A6 | que compitan: es un mercado, competir es el punto |
| rider ↔ rider | C1, C2, A7 | que gane el rápido: es lo que debe pasar |

---

## 8 · PUERTOS ABIERTOS (agnosticismo — cero tecnologías)

- **Canal al cliente final** (B6, D3, I1): el de la tienda. Qué superficie sea, se declara al
  aterrizar. El esquema solo exige que **no sea una app de Bocaos**.
- **Canal al rider** (P4 `canal-rider`): puerto abierto e intercambiable; el rider no queda
  atado a una superficie concreta.
- **Canal de cobro** (G4): el declarado por cada parte (tienda y rider), reemplazable.
- **Canal de la sala** (H7, J1): el que el dueño declare; no se nombra aquí.
- **Fuente de posición y de foto** (D1, D2): se declara al aterrizar; el esquema solo pide
  que el hecho quede con hora y no se pueda reescribir.
- **Catálogo** (A2): la fuente es el TPV de la tienda (tramo 1, producto declarado en F0:
  *pizzepos*). El escaparate **proyecta**, no almacena una segunda carta.
- **Nota de vocabulario**: "pizzepos", "plaza", "tramo 1/2/3" son nombres del negocio, no
  del stack. Nada más se nombra.

---

## 9 · INVESTIGACIÓN (pasada 2 del ciclo — lo investigable, investigado)

Consultado en web el 2026-11-01 (Wikipedia ES, artículos **Glovo** y **Deliveroo**):

1. **El régimen de "falso autónomo" es el riesgo real, no una hipótesis.** La Inspección de
   Trabajo en España ha calificado como falso autónomo el modelo de repartidores cuando *"la
   empresa organiza y manda a los repartidores con protocolos claros"* y no pueden negociar
   su remuneración.
2. **Precedente de salida del mercado**: Deliveroo cesó operaciones en España el 29-11-2021,
   tras el cambio legal sobre presunción de laboralidad de los repartidores.
3. **Precedente judicial**: en 2024 se citó como investigado al fundador de Glovo por
   presunto delito contra los derechos de los trabajadores por mantener falsos autónomos.

**Lo que esto cambia en el esquema (y no es cosmético):** las renuncias de Bocaos —
`guarda-sin-exclusividad`, `neutralidad-orden`, `aceptacion-atomica` libre, sin turnos y sin
protocolo de obediencia — **son a la vez diseño de mercado y defensa legal**. Una pieza que
"asigne" pedidos por criterio de la empresa debilita el modelo entero. Por eso el esquema
prohíbe la asignación en C1–C3 y lo deja escrito como invariante.

**Lo que la investigación NO resuelve** (sigue siendo pregunta al dueño): la **relación
contractual del rider**. La F0 dice simultáneamente que el rider *"se oferta a los
restaurantes"* y que *"el cliente paga al rider su reparto"* — con quién contrata realmente
el rider decide si la presunción de laboralidad le alcanza o no. **No se puede suponer.**

---

## 10 · DISECCIÓN — recuento de FORMAS (detalle en `pasada-diseccion.md`)

**73 hojas atómicas, todas con forma:**

| Forma | Nº | Qué significa aquí |
|---|---|---|
| REFLEJO puro | 33 | todo lo que se puede afirmar con un test: relojes, céntimos, invariantes |
| CUSTODIO | 27 | todo lo que necesita **un solo dueño**: el pedido, la aceptación, los hechos, el acta |
| PUENTE | 10 | todo lo que cruza hacia el vecino por evento: avisos, disputas, incidencia, canal |
| CONVERSOR | 3 | las tres fronteras: carta→escaparate, un precio→dos cobros, devengo→factura |
| **MICRO-AGENTE fuzzy** | **0** | **el negocio prohíbe el juicio** |

**El hallazgo de la disección:** cero agentes. La pregunta maestra ("¿pensar o calcular?") se
responde siempre igual porque el principio central es *"BOCAOS NO JUZGA, MIDE"*. Donde otro
negocio pone un LLM a interpretar una reclamación, Bocaos pone un reloj y una tabla con test.
El juicio humano no desaparece: **se concentra** en la sala (`cola-sala`, `disputa-fallo`,
`accion-sancion`) y en el jefe (`umbral-mercado`, `acta-decisiones`). Si un día el dueño
quiere un informe semanal en lenguaje natural para cada tienda, ese es el único sitio donde
un micro-agente entraría — redactando sobre hechos ya medidos, nunca adjudicando. **No está
declarado: no se construye.**

---

## 11 · PREGUNTAS ABIERTAS (el guion de la conversación siguiente — cero supuestos)

Marcadas: **[F0]** = ya venían declaradas abiertas · **[NUEVA]** = las ha destapado el prisma.

**Dinero y legal**
1. **[F0]** Precio de la coordinación: **tramo 1** €/mes por tienda y **tramo 3** céntimos por
   pedido al rider y a la tienda. Sin esto no hay `devengo` ni `simulador-tramos`.
2. **[F0]** Mecanismo de adjudicación: **cómo se prueba y quién decide** cuando alguien discute.
3. **[F0]** **Responsabilidad legal** de Bocaos en un reparto hecho por un autónomo, y **con
   quién contrata el rider** (¿Bocaos, el restaurante o el cliente final?).
4. **[NUEVA]** ¿Se factura con impuestos? ¿Quién factura a quién? ¿Alta de la actividad?
5. **[NUEVA]** ¿Hay **fianza, prepago o permanencia**? ¿Qué pasa si una tienda no paga y sigue
   vendiendo? ¿Se le suspende la plaza o el reparto ya hecho?
6. **[NUEVA]** ¿Se devenga comisión de Bocaos en un pedido fallido o cancelado? ¿Quién la paga?

**Los relojes y la efectividad del fallo (el corazón)**
7. **[NUEVA]** Las tres N: espera en tienda (N_t), espera en el portal (N_c) y plazo de llegada
   tras aceptar (N_a). El principio está decidido; el número no existe.
8. **[NUEVA]** **Cómo se hace efectivo un cargo** si Bocaos no toca el dinero: ¿pago directo
   entre partes, compensación contra la cuota semanal, fianza? Sin respuesta, la adjudicación
   es decorativa.
9. **[NUEVA]** Si **falta la prueba** (sin foto, sin posición, sin hora de bajada): ¿a favor de
   quién se presume?
10. **[F0]** Qué significa exactamente *"el rider acepta y no llega → pierde el pedido"*:
    ¿pierde la tarifa, la prioridad, o solo ese pedido?
11. **[NUEVA]** Si el fallo lo causa **Bocaos** (plaza caída, oferta no emitida), ¿quién paga?

**La oferta y el enlazado (el producto)**
12. **[F0]** ¿Quién decide el **enlazado**: el rider, el sistema o los dos?
13. **[NUEVA]** ¿Puede el **cliente subir su oferta** si nadie acepta? ¿Y la tienda añadir
    incentivo después de emitida la oferta?
14. **[NUEVA]** Tope exacto del enlazado (la F0 dice 2–3) y **si puede unir pedidos de tiendas
    distintas** en el mismo viaje.
15. **[NUEVA]** ¿Qué radio es "cerca" y se mide desde dónde?

**El pedido y la zona**
16. **[NUEVA]** ¿Qué **zonas** cubre el mercado? Sin zona no se puede decir si un pedido es
    servible antes de cogerlo.
17. **[NUEVA]** ¿La tienda **acepta** explícitamente o el pedido entra directo a cocina? ¿Hay
    tiempo máximo de aceptación?
18. **[NUEVA]** ¿Puede la tienda **rechazar** y quién paga ese rechazo?
19. **[NUEVA]** ¿Puede **mover la hora comprometida** después de aceptar?
20. **[NUEVA]** ¿La plaza admite **recogida en tienda**? Si sí, sería un desacople del eslabón
    limitante (el pedido no depende de un rider).

**El mercado y las partes**
21. **[NUEVA]** ¿**Una zona o varias** al arrancar? ¿Cuál es el **mercado mínimo** de una zona
    (tiendas y riders) para que un pedido encuentre rider?
22. **[NUEVA]** ¿Qué consecuencia tiene una **cocina lenta repetida** (dos semanas)? ¿Sale del
    mercado? Es la pieza que hace que el mercado corrija — hoy no existe la consecuencia.
23. **[NUEVA]** ¿**Exclusividad** con la tienda? ¿Alta de admisión? ¿Permanencia?
24. **[NUEVA]** ¿Qué **acredita el rider** (alta de autónomo, seguro) y **quién lo verifica**
    antes de admitirlo?
25. **[NUEVA]** ¿Quién atiende la **sala**, en qué horario y con cuántas manos?
26. **[NUEVA]** Día y hora del **corte semanal**, forma de cobro a cada parte y qué pasa si el
    cobro falla.
27. **[NUEVA]** ¿El cliente compra como **invitado** o con cuenta de la tienda? ¿Ve el desglose
    (comida / reparto / incentivo)?
28. **[NUEVA]** ¿El **pagador ve el importe** que ofertó el cliente final por el reparto?
29. **[NUEVA]** ¿Cuánto tiempo se guarda la **traza de posición** y qué ve el cliente?
30. **[NUEVA]** ¿Un **rechazo repetido** del rider tiene alguna consecuencia? (si la tiene, deja
    de ser autónomo de verdad — cuidado).

**Total: 30 preguntas abiertas** — 5 que la F0 dejó escritas (3 de ellas ya marcadas en la
identidad: precio, mecanismo, legal) + 25 que destapa el prisma. Guion completo, con qué
desbloquea cada una, en `guion-preguntas.md`.

---

## 12 · ESTADO DE LA FASE

- **Prisma global:** 1 ronda + 8 puntos (pasada-2) + 3 desgloses (pasada-3) → seco.
- **Prisma por interlocutor:** 4 pasadas (cliente · restaurante · repartidor · Bocaos).
- **Prisma por rol:** 3 pasadas (jefe · trabajador · cliente).
- **Disección:** 73 hojas, **todas con forma** (33 reflejo · 27 custodio · 10 puente · 3 conversor · 0 fuzzy).
- **Cero tecnologías** nombradas fuera de los puertos abiertos (§8).
- **Cero restaurantes, barrios, precios ni riders concretos**: vertical, no proyecto.
- **Siguiente:** las 30 preguntas al dueño (§11) → con las respuestas, **pasada 2 del ciclo**
  sobre las piezas abiertas (`ventana-espera`, `cargo-fallo`, `contrato-tramos`,
  `tope-enlace`, `zona-servida`) y **solo entonces** `completar_fase { fase:'esquematizado' }`,
  que empuja la **FASE 3 · PLASMA** (`planificar-construccion` → `esquemas/diseno-oop.md`).

### Índice de ficheros de esta fase
```
esquemas/
├─ pasada-1-bocaos.md                        el prisma global sobre el sujeto
├─ pasada-2-plaza-tienda.md                  A
├─ pasada-2-pedido.md                        B
├─ pasada-2-oferta-reparto.md                C ← eslabón limitante
├─ pasada-2-reparto-medido.md                D
├─ pasada-2-tarifa-tres-bandas.md            E
├─ pasada-2-adjudicacion-fallos.md           F
├─ pasada-2-liquidacion-coordinacion.md      G
├─ pasada-2-sala-mercado.md                  H
├─ pasada-3-oferta-reparto-desglose.md       C, segunda vuelta
├─ pasada-3-adjudicacion-fallos-desglose.md  F, segunda vuelta
├─ pasada-3-pedido-desglose.md               B, segunda vuelta
├─ pasada-interlocutor-cliente.md            I
├─ pasada-interlocutor-restaurante.md        R
├─ pasada-interlocutor-repartidor-autonomo.md P
├─ pasada-interlocutor-bocaos.md             M
├─ pasada-rol-jefe.md                        J
├─ pasada-rol-trabajador.md                  T
├─ pasada-rol-cliente.md                     K
├─ pasada-diseccion.md                       la FORMA de las 73 hojas
├─ guion-preguntas.md                        las 30 preguntas para el dueño
└─ esquema.md                                ESTE árbol maestro
```
