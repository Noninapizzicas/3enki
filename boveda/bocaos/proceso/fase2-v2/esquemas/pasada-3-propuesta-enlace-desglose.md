# PASADA 3 · DESGLOSE del punto `propuesta-enlace` (el cuello, segunda vuelta)

> La ronda 2 parió 23 hojas. Esta ronda las **revisa una a una** y parte las que todavía se
> parten. Resultado: **7 se parten en 16**, **2 nacen de una tensión** del propio esquema,
> **3 nombres desaparecen** porque eran el nombre del conjunto, no de una pieza.
> Arranque: 23 − 7 + 16 + 2 = **34**.

## 3.0 · La revisión, en una tabla

| # | hoja de la ronda 2 | ¿se parte? | en qué queda |
|---|---|---|---|
| 1 | `hecho-pedido-listo` | no | atómica (custodio del dato del evento) |
| 2 | `vista-del-instante` | **sí** | `composicion-de-la-vista` + `congelacion-de-la-foto` |
| 3 | `candidatos-elegibles` | no | atómica |
| 4 | `medida-desvio` | **sí** | `ruta-base` + `ruta-con-parada` + `medida-desvio` (la resta) |
| 5 | `medida-espera` | no | atómica |
| 6 | `medida-retraso` | **sí** | `retraso-por-parada` + `agregado-del-retraso` |
| 7 | `medida-cobra` | no | atómica (**valor abierto**: Q2) |
| 8 | `regla-de-enlace` | no | atómica: cuatro tests |
| 9 | `propuesta-emitida` | no | atómica (custodio, append-only) |
| 10 | `ventana-de-propuesta` | no | atómica |
| 11 | `explicacion-de-la-propuesta` | **sí** | `razones-de-la-decision` + `frase-derivada` |
| 12 | `redaccion-de-la-propuesta` | no | atómica (**el único fuzzy de la cadena**) |
| 13 | `aceptacion-libre` | **sí** | `aceptacion-libre` + `bloqueo-de-propuesta` + `hora-de-aceptacion` |
| 14 | `rechazo-sin-coste` | **sí** | `rechazo-sin-coste` + `guarda-sin-puntuacion` |
| 15 | `caducidad-sin-respuesta` | no | atómica |
| 16 | `contrato-puntual` | no | atómica (custodio) |
| 17 | `escalada-de-enlace` | **sí** | `escalada-de-enlace` (puente) + `siguiente-candidato` |
| 18–23 | las seis guardas | no | atómicas (son tests) |
| — | **tensión 1** | nueva | `guarda-propuesta-unica` |
| — | **tensión 2** | nueva | `hueco-de-medida` |

## 3.1 · `vista-del-instante` → se parte en 2

- **IDENTIDAD**: lo que la decisión "sabe" en el instante en que llega el evento.
- **RESTRICCIÓN**: si la vista se refresca mientras el rider decide, la propuesta que se le
  explicó ya no corresponde a la foto que se le mostró. Y al revés: si se congela demasiado
  pronto, se propone con una posición vieja.
- **Sub-hojas**:
  - `composicion-de-la-vista` — ATÓMICA. Junta cinco fuentes ya escritas (riders activos,
    posición, ruta, paradas pendientes, histórico del local) **más** la config vigente. No
    escribe nada: proyecta.
  - `congelacion-de-la-foto` — ATÓMICA (invariante). **Una decisión lee una sola foto.** Se
    toma al recibir el evento y viaja con la propuesta. Es lo que hace que la explicación
    siga siendo verdad un minuto después.
- **ABIERTA**: ¿cuánto puede envejecer una foto antes de que la medida deje de valer? No
  declarado. Se resuelve como `hueco-de-medida` (3.7): si envejeció, no se estima.

## 3.2 · `medida-desvio` → se parte en 3

- **IDENTIDAD**: metros **de más** por pasar por el local. "De más" exige dos rutas.
- **Sub-hojas**:
  - `ruta-base` — ATÓMICA. La ruta que el rider ya tiene, con sus paradas en su orden.
  - `ruta-con-parada` — ATÓMICA. La misma ruta con el local insertado en el mejor punto.
  - `medida-desvio` — ATÓMICA. La resta, en metros.
- **REF →** el "mejor punto" de inserción es `orden-de-paradas` (B04, grupo RUTA-VIVA). No se
  re-prisma aquí: se referencia. Hallazgo: **el corazón depende del grupo B**; sin ruta viva
  no hay desvío, y sin desvío la cadena entera es un `if` sin datos.
- **ABIERTA (Q37)**: ¿la distancia es en línea recta, por calle, con tráfico? Cambia el número
  y por tanto cuántos pasan el umbral. No se decide aquí.

## 3.3 · `medida-retraso` → se parte en 2

- **IDENTIDAD**: minutos que este pedido le cuesta a los pedidos que ya lleva.
- **RESTRICCIÓN**: hay un retraso **por pedido a bordo**, y luego hay que resumirlos en uno
  solo para compararlo con el umbral. Sumarlos castigaría tres veces el mismo minuto;
  promediarlos escondería al que se queda sin postre.
- **Sub-hojas**:
  - `retraso-por-parada` — ATÓMICA. Para cada pedido a bordo: nueva hora de llegada menos
    **su promesa guardada** (`promesa-por-parada`, B03). No contra una ruta ideal: contra lo
    que se le dijo al cliente.
  - `agregado-del-retraso` — ATÓMICA. **Se toma el peor**, no la suma ni la media. La promesa
    que se rompe es la que se rompe.
- **Decisión de modelo (revisable)**: el agregado es `max`. Se escribe aquí porque tiene
  consecuencia y porque el dueño puede querer otra cosa. Si quiere otra, cambia esta pieza
  y su test — no la cadena.

## 3.4 · `explicacion-de-la-propuesta` → se parte en 2

- **IDENTIDAD**: por qué le llegó esto a este rider. F0: *"explicable y discutible — te lo
  ofrecí porque pasabas a 300 m"*.
- **RESTRICCIÓN**: si la explicación la escribe un modelo, puede inventar un motivo. Y la
  Directiva (UE) 2024/2831 (art. 8, extendido a no asalariados por el art. 10) da **derecho a
  explicación** — o sea que además de ser peligroso, es exigible.
- **Sub-hojas**:
  - `razones-de-la-decision` — ATÓMICA. El **conjunto cerrado** de razones, derivado de los
    cuatro números: `desvio=312 m`, `espera=2 min`, `retraso=1 min`, `cobra=c€`. Nada que no
    esté en ese conjunto puede aparecer en la explicación.
  - `frase-derivada` — ATÓMICA. La plantilla que convierte el conjunto en una frase legible.
    Misma entrada, misma frase.
- **Consecuencia**: `redaccion-de-la-propuesta` (el agente) solo puede **adornar** la frase;
  su validador puro rechaza cualquier motivo que no esté en `razones-de-la-decision`. Si el
  dueño quiere textos idénticos byte a byte, el agente se cae y queda `frase-derivada` sola:
  **el esquema no pierde nada**.

## 3.5 · `aceptacion-libre` → se parte en 3

- **IDENTIDAD**: el sí. El acto que convierte una propuesta en un reparto.
- **RESTRICCIÓN**: una propuesta puede tener un sí, un no o un silencio — **nunca dos síes**.
  Y si se propone a varios a la vez (Q6), la carrera es real.
- **Sub-hojas**:
  - `aceptacion-libre` — ATÓMICA (custodio). El sí, con su autor y su hora.
  - `bloqueo-de-propuesta` — ATÓMICA (custodio). Un desenlace por propuesta: el primero que
    escribe gana y el segundo recibe "ya no está" **sin coste**.
  - `hora-de-aceptacion` — ATÓMICA. El hecho con hora que arranca los relojes del reparto.
- **NO-OBJETIVO explícito**: no existe "aceptación automática por silencio". El silencio es
  `caducidad-sin-respuesta` (A23), y no crea contrato.

## 3.6 · `rechazo-sin-coste` → se parte en 2

- **IDENTIDAD**: el no. La F0 §6.7 lo hace libre: *"debe poder: es libre"*.
- **RESTRICCIÓN**: "sin coste" es fácil de escribir y fácil de romper sin querer: basta con
  que alguien use la tasa de rechazo para ordenar candidatos. Entonces el no pasa a costar,
  y el rider vuelve a ser un empleado al que se le mide la obediencia.
- **Sub-hojas**:
  - `rechazo-sin-coste` — ATÓMICA. El no se registra como hecho (para medir el mercado).
  - `guarda-sin-puntuacion` — ATÓMICA (invariante con test). **Ninguna agregación de rechazos
    es entrada de `candidatos-elegibles`.** El test mira las entradas de A04 y falla si
    aparece una tasa.
- **EMPUJÓN del freno**: si el no no cuesta y no cambia la elegibilidad, el mismo rider
  recibirá la misma propuesta del mismo local. La salida no es penalizar: es que **él apague**
  (`estado-rider` en pausa, I04) y que declare su zona (`zona-rider`, M02). El control es
  suyo, no del sistema.

## 3.7 · `escalada-de-enlace` → se parte en 2

- **IDENTIDAD**: el pedido que no encuentra sí. La F0 §6 da tres salidas: *otro rider · sube
  la oferta · va a la sala*.
- **Sub-hojas**:
  - `escalada-de-enlace` — ATÓMICA (puente). Decide **cuál** de las tres, según lo que ya
    pasó (cuántos candidatos, si ya se subió, cuánto tiempo lleva). No ejecuta las tres: las
    pide.
  - `siguiente-candidato` — ATÓMICA. El avance por el orden declarado. **El orden es
    política** y vive en `config-umbrales` (J01), no aquí.
- **REF →** `subida-de-oferta` (E07, dinero) y `aviso-sala` (I07, operación). No se duplican.
- **ABIERTAS**: quién sube la oferta y con qué tope (Q17); cuántos candidatos antes de
  rendirse (Q7).

## 3.8 · Las dos hojas que nacen de una TENSIÓN (no de un hueco)

**`guarda-propuesta-unica`.** El esquema se dio cuenta de algo al escribir la cadena: si el
mismo pedido se propone **a la vez** a cuatro riders cercanos, el que acepta no es el elegido:
es el que estaba mirando el móvil. Eso no es "el que está cerca gana" (F0 §3, par 8): es una
asignación por sorteo con apariencia de mercado. De ahí una invariante con test: **una
propuesta viva por pedido**. Si el dueño quiere paralelo (Q6), se cambia la ventana, no la
invariante.

**`hueco-de-medida`.** La ley de cero supuestos aplicada en caliente: si falta la posición, o
el histórico del local, o el precio, **no se estima**. No hay propuesta, el candidato se salta
y el hueco se nombra (`faltantes[]`). Es lo que impide que un mercado recién nacido invente
datos para parecer que funciona — y es también el diagnóstico: un mercado con muchos huecos
es un mercado con los datos sin enchufar.

## SUELO DE ESTA RAMA

34 hojas: **26 de cálculo puro**, **6 escriben estado** (el evento, la propuesta, su bloqueo,
la ventana, el sí y el contrato), **una cruza al vecino**, **una es fuzzy**; y de las de cálculo,
**siete son invariantes-test** más un test de replay. **Ninguna se vuelve a partir aquí**; las tres que aún dudan
(`ruta-base`, `ruta-con-parada`, `bloqueo-de-propuesta`) pasan a `pasada-4-enlace-seco.md`.
