---
name: esquematizador
description: "Convierte cualquier sujeto amorfo (un concepto, un producto, un dominio, un subsistema, una tarea grande) en su anatomía completa y navegable — lo recorre con el prisma de forma recursiva hasta agotarlo, escribe cada ronda como un archivo, ensambla el árbol maestro en esquema.md y remata con el diseccionador asignando la FORMA de cada pieza."
when-to-use: "Úsala siempre que haga falta el mapa COMPLETO de algo grande antes de construirlo: cuando pidan 'modelar', 'descomponer', 'entender la anatomía de', 'sacar el esquema de', 'diseñar desde cero' o 'planear a fondo' un sistema o concepto. La ley innegociable es el AGNOSTICISMO: nada del entorno concreto (transporte, persistencia, protocolo, fuente del dato, framework) entra en el análisis; se nombra como puerto abierto."
fuente: enki
dominio: metodo
lente_dominio: prisma
lente_tarea: esquematizar
tags: [esquema, descomposicion, anatomia, mapeo, prisma, diseccionador, agnosticismo, metodo]
---

# Esquematizador

Entra un sujeto crudo. Salen su esquema completo y sus piezas con forma, en archivos. El aparato es el mismo para cualquier luz — cambias lo que entra, no el método.

Esta skill orquesta dos herramientas existentes: **prisma-modelo-universal** (descompone en 5 huecos) y **diseccionador** (asigna forma a cada pieza atómica). Ambas se definen como lentes dentro de la skill `multi-lens-analysis`. Su valor añadido es el *pegamento*: la recursión hasta seco, la persistencia en archivos, y una ley que impide el error más fácil de cometer.

## El proceso — tres fases

Trabaja en este orden porque cada fase necesita el suelo de la anterior: no se asigna forma a una pieza que el prisma todavía puede partir.

**Fase 1 · Prisma recursivo (bajar hasta seco).** Pasa el sujeto por el prisma de 5 huecos (IDENTIDAD, RESTRICCIONES, CONTRATO, NO-OBJETIVOS, PREGUNTAS_ABIERTAS). De sus 5 huecos salen sub-productos; pasa cada uno por el prisma otra vez. Repite ronda tras ronda. Escribe cada ronda en su propio archivo (`pasada-N-<nombre>.md`) para que el trabajo quede apuntado y sea revisable.

**Fase 2 · Esquema.** Ensambla todas las pasadas en un solo árbol maestro (`esquema.md`) con todo embebido — no un índice de punteros, el mapa entero. Al final, cuenta lo vivo: pasadas, arquetipos, órganos, puertos, reparto de formas.

**Fase 3 · Disección.** Cuando el prisma toca suelo, cada hoja atómica pasa por el diseccionador y sus preguntas, que le fijan la FORMA (reflejo · micro-agente fuzzy · custodio · conversor · puente). Escribe la disección (`pasada-N-diseccion.md`) y vuelve a `esquema.md` a anotar la forma de cada pieza.

## La ley — agnosticismo

**El que esquematiza no cuela su sistema en el análisis.** Todo lo que dependa del entorno se nombra como PUERTO abierto. La pieza declara la *forma* de lo que necesita (`leer(id)`, `observar(criterio)`, `persistir(dato)`, `señal_de_fallo`...); el sitio donde la anatomía aterrice cablea el adaptador concreto.

**La prueba de fuego:** cuenta las tecnologías nombradas en el resultado final. El objetivo es **cero**. Si aparece una, tienes un puerto sin abrir.

## Cuándo parar de bajar

Para en cuanto una hoja deja de ser un *producto* y es una de estas tres:

- **Atómica** — una pieza que un test afirma. Va al diseccionador.
- **Abierta** — privada o contextual del dueño. No se expande.
- **Repetida** — ya salió en otra rama. Se referencia.

## Errores a evitar

- **Colar el sistema ambiente** — el fallo estrella.
- **Seguir prismando piezas atómicas** — no converge.
- **Inventar el dato privado** — deuda invisible.
- **Un esquema de punteros vacíos** — el maestro embebe el detalle.
- **Disecar antes de tocar suelo** — primero el prisma se agota.
- **Separar dimensiones interdependientes como ramas** — si los sub-productos son DIMENSIONES que se modulan mutuamente, modelalas como INPUTS de una sola pieza convergente.
