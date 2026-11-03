# PASADA 4 · El cuello toca suelo

> Tercera vuelta sobre la rama `propuesta-enlace`. Solo tres hojas habían quedado en duda.
> Aquí se revisan, una a una, y se cierra la rama.

## 4.1 · `ruta-base` — NO se parte. Toca suelo.

Tres preguntas y las tres respuestas son aritmética:

- ¿Qué es? La suma de tramos de las paradas pendientes, en su orden, desde la posición actual.
- ¿De dónde sale el orden? De `orden-de-paradas` (B04). **REF**, no se re-prisma.
- ¿Qué la rompe? Que la posición no esté fresca. Eso no la parte: lo resuelve `hueco-de-medida`.

**ATÓMICA.** Un test: dada una lista de paradas y una posición, devuelve unos metros y siempre
los mismos.

## 4.2 · `ruta-con-parada` — NO se parte. Toca suelo.

Es la misma función con una parada más, insertada en el punto que menos añade. Ese "punto que
menos añade" **no es un optimizador global**: es el orden de UNA ruta, de UN rider, con las
paradas que ese rider ya tiene. Optimizar dentro de un trayecto no es ordenar el mercado;
optimizar entre trayectos sí — y eso está prohibido aquí (`guarda-sin-optimizador`).

**ATÓMICA.** Test: insertar una parada nunca acorta la ruta base.

## 4.3 · `bloqueo-de-propuesta` — NO se parte. Toca suelo.

- ¿Quién escribe? Un dueño: el desenlace de una propuesta.
- ¿Qué pasa con el segundo? Se le devuelve a la cola de candidatos **sin coste**. Ese "sin
  coste" es `rechazo-sin-coste` (A21), no una pieza nueva.
- ¿Y si el primero se cae a mitad? Entonces no hay bloqueo que valga: el contrato está escrito
  y lo que hay es una devolución (`cancelacion`, C07) o un abandono (Q12).

**ATÓMICA.** Test: dos desenlaces sobre la misma propuesta → uno gana, el otro recibe "ya no
está", y el estado final es el del primero.

## 4.4 · La rama, seca — y las referencias que la sostienen

Ninguna hoja se parte más. Pero la rama **no está sola**: once de sus piezas leen datos que
escribe otro grupo. Este es el mapa de dependencias (referencia, no duplicación):

```
propuesta-enlace lee de…
  B04 orden-de-paradas      → para ruta-base y ruta-con-parada
  B03 promesa-por-parada    → para retraso-por-parada
  B01 posicion-rider        → para ruta-base
  B05 capacidad-declarada   → para candidatos-elegibles
  E03 precio-reparto        → para medida-cobra
  L03 puntualidad-declarada → para medida-espera (el histórico del local)
  J01 config-umbrales       → para regla-de-enlace y para el orden de candidatos
  J04 version-efectiva      → para que la propuesta explique con la regla que la juzgó
  I04 estado-rider          → para candidatos-elegibles y para la pausa
```

**Lo que esto significa para la construcción**: el cuello **no se puede construir primero**.
`propuesta-enlace` depende de cinco piezas de otros tres grupos. El orden de obra sale del
grafo, no de la importancia: ruta-viva y config primero, tarifa y puntualidad después, y el
corazón cuando sus datos existan. Sin ellos, la cadena arranca y devuelve `hueco-de-medida`
en cada candidato — un mercado perfectamente determinista que no propone nada.
