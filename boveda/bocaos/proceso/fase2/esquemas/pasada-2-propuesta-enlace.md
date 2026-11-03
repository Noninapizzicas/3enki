# PASADA 2 · PUNTO: `propuesta-enlace` (**EL ESLABÓN LIMITANTE**)

> **Heredada de la pasada 2** (`fase2-v2/esquemas/pasada-2-propuesta-enlace.md`) y revalidada contra la F0 §7.
> El corazón del esquema (A). Sin cambios: toda la cadena lee datos de la plaza y vive en la plaza.
> Se reproduce aquí para que `esquemas/` quede completo; los deltas de la tercera pasada
> están en `pasada-2-corte-de-piezas.md` y en `esquema.md` §1.

> Sale del hueco RESTRICCIONES de la pasada 1 y del eslabón allí identificado. Este punto
> **es el producto**: la F0 §1 lo dice sin rodeos — *"el enlazado es el producto, no una
> función"*. Y la F0 §6 le pone forma: no es un motor de reparto, es **una cadena de
> decisión que se dispara sola, una vez por pedido, y que termina en una pregunta al rider**.

## Prisma de los 5 huecos

### 1 · IDENTIDAD

La cadena, eslabón a eslabón. Ocho pasos, ninguno de ellos un "motor":

```
①  llega el evento          pedido.listo { local, destino, hora_listo, precio, coords }
                            └─ el dato viaja EN el evento. Nadie va a buscarlo.

②  se toma la foto          vista-del-instante = riders activos + posición + ruta
                            + paradas pendientes + histórico del local + config vigente
                            └─ es una PROYECCIÓN de lo que otros ya escribieron. No se guarda.

③  se filtran              candidatos-elegibles = quien puede recibir propuesta AHORA
                            (estado declarado, zona declarada, capacidad declarada)

④  se miden               para cada candidato:  desvío (m) · espera (min) · retraso (min) · cobra (c€)

⑤  se compara             regla-de-enlace = los cuatro umbrales en AND
                            └─ cuatro tests, uno por umbral. Cero ponderaciones.

⑥  se propone             propuesta-emitida = un rider + un pedido + los cuatro números
                            + la versión de config que los juzgó + su ventana de ~20 s
                            └─ se emite a UNO. Si se emitiera a todos, sería asignación
                              por la puerta de atrás: el que acepta primero no fue elegido,
                              fue el que estaba mirando el móvil.

⑦  se espera              aceptación libre · rechazo sin coste · o silencio (caducidad)
                            └─ los tres desenlaces son hechos con hora, y los tres valen.

⑧  si nadie acepta        escalada: otro candidato · sube la oferta · la sala
```

**Lo que esta cadena NO tiene, y es el centro del matiz:** no tiene un paso donde alguien
mire el conjunto. No hay cola de pedidos que un planificador reparta, no hay re-optimización
del día, no hay emparejamiento global. El resultado del mercado **emerge** de miles de
decisiones locales tomadas en el mismo instante en que el dato llegó. Eso es lo que la hace
explicable (cada decisión tiene su foto), barata (cuatro comparaciones) y **no ordenable
desde arriba** (no hay arriba).

### 2 · RESTRICCIONES (freno → empujón — aquí va el cuello entero)

- **FRENO**: un rider que conduce no puede leer cuatro números en veinte segundos.
  → **EMPUJÓN**: `vista-de-propuesta` con **siempre los mismos cuatro números en el mismo
  orden**, la explicación en una frase derivada, y `estado-rider` con **pausa declarada por
  él** (deja de recibir propuestas sin que nadie se lo imponga). Cuánto dura la ventana y si
  depende de la hora es **Q5**.

- **FRENO**: medir "desvío" exige saber por dónde va, y eso cambia cada segundo.
  → **EMPUJÓN**: `vista-del-instante` se toma **una vez**, al recibir el evento, y la
  propuesta guarda esa foto. La decisión no se recalcula mientras el rider decide: si se
  recalculara, la explicación dejaría de ser cierta.

- **FRENO**: si falta un dato (no hay posición, no hay histórico del local, no hay precio),
  la tentación es estimarlo.
  → **EMPUJÓN**: **no se estima**. Sin las cuatro medidas no hay propuesta: el pedido pasa
  al siguiente candidato y el hueco **se nombra** (`faltantes[]`). Es la ley de cero
  supuestos aplicada en caliente, y es lo que impide que un mercado recién nacido invente
  datos para parecer que funciona.

- **FRENO**: `cobra > 0` es un umbral casi trivial si `cobra` es bruto.
  → **EMPUJÓN**: `medida-cobra` declara explícitamente si es bruto o neto del desvío, y el
  umbral se aplica sobre **ese** número. Cuál de los dos, **Q2** — no se decide aquí.

- **FRENO**: proponer en serie (un candidato cada 20 s) enfría la comida; proponer en
  paralelo deja que acepten dos.
  → **EMPUJÓN**: `aceptacion-libre` es atómica pase lo que pase (un pedido, un aceptante),
  así que el paralelo es *posible* sin corromper nada. Si se usa es **Q6**: es una decisión
  de negocio, no de esquema.

- **FRENO**: el rider no te debe nada y puede rechazar siempre.
  → **EMPUJÓN**: `rechazo-sin-coste` — el rechazo se registra como hecho (para medir el
  mercado) y **no se agrega en nota ni cambia la elegibilidad**. El único freno a la
  propuesta inútil es la pausa que el propio rider declara.

- **FRENO**: si el enlace retrasa al pedido que ya iba, el que paga es otro cliente que no
  participó en la decisión.
  → **EMPUJÓN**: el umbral de retraso se mide **contra la promesa guardada**
  (`promesa-por-parada`), no contra una ruta ideal. Enlazar nunca empeora lo ya prometido
  más allá del número declarado. Es un invariante con test (`guarda-enlace-no-rompe-promesa`).

- **FRENO**: "la IA redacta la oferta" (F0 §6) puede colar una razón que no existe.
  → **EMPUJÓN**: `redaccion-de-la-propuesta` es un agente **de borde** con **validador puro**:
  las palabras varían, los cuatro números y las razones no. El validador rechaza cualquier
  frase que mencione un motivo que no esté en la decisión.

- **FRENO**: nadie acepta y el pedido muere en silencio, con el cliente culpando a la tienda.
  → **EMPUJÓN**: `escalada-de-enlace` con tres salidas declaradas en la F0 (§6): otro rider ·
  sube la oferta · la sala. Quién sube y con qué tope, **Q17**.

- **FRENO**: el rider sabe por qué le llegó esto (y desde la Directiva (UE) 2024/2831, arts.
  8 y 10, tiene derecho a saberlo **aunque sea autónomo**).
  → **EMPUJÓN**: `explicacion-de-la-propuesta` **derivada de los números**, no redactada.
  La frase *"te lo ofrecí porque pasabas a 300 m"* se compone de `desvio = 312 m`.

### 3 · CONTRATO

| Parte | Da | Recibe |
|---|---|---|
| **la tienda** | el hecho `pedido.listo` **con hora** (y esa hora es la que se mide después) | que su pedido se proponga en el segundo en que está listo |
| **el rider** | una decisión libre en ~20 s (o el silencio) | cuatro números, una frase que los explique, el importe íntegro y nada más |
| **el cliente** | su oferta de reparto, congelada con el pedido | que su hora prometida no empeore más de lo declarado |
| **Bocaos** | el criterio, aplicado igual a todos, y la traza de por qué | céntimos por pedido aceptado — **nunca** por kilómetro ahorrado |

### 4 · NO-OBJETIVOS

- **NO asigna.** No existe camino del pedido al rider sin `aceptacion-libre`. Ni "auto-aceptar
  si no contesta en 20 s", ni "asignación por cercanía". Eso es Glovo.
- **NO puntúa riders.** Ni nota, ni fiabilidad, ni "prioridad por aceptación pasada". El orden
  de candidatos es determinista y público (**Q7**: cuál).
- **NO decide en bloque.** No hay barrido de todos los pedidos, ni re-optimización, ni
  "reparto equilibrado" entre riders.
- **NO usa un modelo.** Cuatro comparaciones. Un `if` con cuatro condiciones, con test.
- **NO estima lo que falta.** Sin dato, no hay propuesta; hay hueco nombrado.
- **NO promete un reparto más barato al cliente.** Que el enlace abarate el reparto al
  cliente **no está declarado** (Q15): lo que está declarado es que el rider gana más.
- **NO juzga el rechazo.** Ni lo castiga ni lo premia.

### 5 · PREGUNTAS ABIERTAS

```
Q1   ¿los cuatro números (800 m / 4 min / 6 min / >0) son del primer mercado o de la vertical?
Q2   ¿`cobra` es bruto del pedido o neto del desvío?          ← decide si el umbral filtra
Q3   ¿un juego de umbrales por zona, o uno por mercado?
Q4   al cambiar un umbral: ¿rige para el pedido en vuelo o solo para los siguientes?
Q5   ¿la ventana de 20 s es fija? ¿y si el rider va conduciendo?
Q6   ¿propuestas en serie o en paralelo? (serie: 3 candidatos = 1 min con la comida esperando)
Q7   ¿en qué orden determinista se recorren los candidatos? (eso es la política)
Q8   ¿el orden puede depender de datos del rider? (si sí, hay puntuación — y la F0 dice que no)
Q12  ¿"acepta y no aparece" qué pierde exactamente?
Q13  ¿puede devolver un pedido aceptado si el local se pasa de la espera?
Q17  ¿quién sube la oferta cuando nadie acepta, con qué tope y quién la paga?
```

## Hojas que salen de este punto (→ pasada 3)

`hecho-pedido-listo` · `vista-del-instante` · `candidatos-elegibles` · `medida-desvio` ·
`medida-espera` · `medida-retraso` · `medida-cobra` · `regla-de-enlace` ·
`propuesta-emitida` · `ventana-de-propuesta` · `explicacion-de-la-propuesta` ·
`redaccion-de-la-propuesta` · `aceptacion-libre` · `rechazo-sin-coste` ·
`caducidad-sin-respuesta` · `contrato-puntual` · `escalada-de-enlace` ·
`guarda-sin-asignacion` · `guarda-sin-optimizador` · `reproduccion-de-la-decision` ·
`guarda-enlace-por-trayecto` · `guarda-enlace-no-rompe-promesa` ·
`guarda-no-captura-del-ahorro`

**Veintitrés.** La mitad del esquema está aquí, y no por gusto: es el sitio donde el negocio
se juega la existencia.
