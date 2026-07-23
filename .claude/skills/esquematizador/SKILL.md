---
name: esquematizador
description: >-
  Convierte cualquier sujeto amorfo (un concepto, un producto, un dominio, un
  subsistema, una tarea grande) en su anatomía completa y navegable — lo recorre
  con el prisma de forma recursiva hasta agotarlo, escribe cada ronda como un
  archivo, ensambla el árbol maestro en esquema.md y remata con el diseccionador
  asignando la FORMA de cada pieza.
when-to-use: >-
  Úsala siempre que haga falta el mapa COMPLETO de algo grande antes de
  construirlo: cuando pidan "modelar", "descomponer", "entender la anatomía de",
  "sacar el esquema de", "diseñar desde cero" o "planear a fondo" un sistema o
  concepto. La ley innegociable es el AGNOSTICISMO: nada del entorno concreto
  (transporte, persistencia, protocolo, fuente del dato, framework) entra en el
  análisis; se nombra como puerto abierto. No la uses para un fix puntual ni
  para una sola pieza suelta.
tags: [esquema, descomposicion, anatomia, mapeo, prisma, diseccionador]
---

# Esquematizador

Entra un sujeto crudo. Salen su esquema completo y sus piezas con forma, en archivos.
El aparato es el mismo para cualquier luz — cambias lo que entra, no el método.

Esta skill orquesta dos herramientas existentes: **prisma-modelo-universal** (descompone
en 5 huecos) y **diseccionador** (asigna forma a cada pieza atómica). Ambas se definen
como lentes dentro de la skill `multi-lens-analysis`. Su valor añadido es el *pegamento*:
la recursión hasta seco, la persistencia en archivos, y una ley que impide el error
más fácil de cometer.

## El proceso — tres fases

Trabaja en este orden porque cada fase necesita el suelo de la anterior: no se asigna
forma a una pieza que el prisma todavía puede partir.

**Fase 1 · Prisma recursivo (bajar hasta seco).** Pasa el sujeto por el prisma de 5
huecos (IDENTIDAD, RESTRICCIONES, CONTRATO, NO-OBJETIVOS, PREGUNTAS_ABIERTAS). De sus
5 huecos salen sub-productos; pasa cada uno por el prisma otra vez. Repite ronda tras
ronda. Escribe cada ronda en su propio archivo (`pasada-N-<nombre>.md`) para que el
trabajo quede apuntado y sea revisable.

**Fase 2 · Esquema.** Ensambla todas las pasadas en un solo árbol maestro (`esquema.md`)
con todo embebido — no un índice de punteros, el mapa entero. Al final, cuenta lo vivo:
pasadas, arquetipos, órganos, puertos, reparto de formas.

**Fase 3 · Disección.** Cuando el prisma toca suelo, cada hoja atómica pasa por el
diseccionador y sus preguntas, que le fijan la FORMA (reflejo · micro-agente fuzzy · 
custodio · conversor · puente). Escribe la disección (`pasada-N-diseccion.md`) y vuelve
a `esquema.md` a anotar la forma de cada pieza.

> El fondo del prisma es la puerta del diseccionador: uno baja partiendo productos,
> el otro reparte forma cuando ya no hay productos que partir. Ese punto de encuentro
> es también la señal de que puedes parar de bajar.

## La ley — agnosticismo

Es la parte fácil de romper y la que da todo el valor, así que va primero en tu cabeza
mientras analizas.

**El que esquematiza no cuela su sistema en el análisis.** Tienes cargado el contexto
del sitio donde trabajas, y por inercia se filtra: escribes "lo trae por MQTT", "lo
guarda en fichero", "responde con HTTP 404". En cuanto nombras una tecnología concreta,
has atado un análisis universal a un suelo particular — y la anatomía deja de valer en
otro sitio.

El arreglo es un reflejo mental: **todo lo que dependa del entorno se nombra como PUERTO
abierto.** La pieza declara la *forma* de lo que necesita (`leer(id)`, `observar(criterio)`,
`persistir(dato)`, `señal_de_fallo`…); el sitio donde la anatomía aterrice cablea el
adaptador concreto.

Cómo distinguir en caliente qué se queda y qué sale:

**Ejemplo 1 — se queda (universal):**
Pieza: "valida los datos del formulario antes de enviarlos."
Análisis: FORMA = reflejo puro; un test lo afirma. → correcto, no nombra ninguna tecnología.

**Ejemplo 2 — sale a puerto (del entorno):**
Pieza: "envía el formulario al backend."
Mal: "PUENTE por publishAndWait sobre MQTT." ← sesgo colado.
Bien: "PUENTE sobre el puerto `ejecutar(comando)` [transporte ABIERTO]." ← el adaptador
(RPC, POST, mutación, escritura local…) lo pone el sitio.

**La prueba de fuego:** cuenta las tecnologías nombradas en el resultado final. El objetivo
es **cero**. Si aparece una, tienes un puerto sin abrir.

## Cuándo parar de bajar

El prisma sobre prisma no converge solo — cada campo se podría re-prismar hasta el infinito.
Para en cuanto una hoja deja de ser un *producto* y es una de estas tres:

- **Atómica** — una pieza que un test afirma (ya no tiene 5 huecos que partir). Va al diseccionador.
- **Abierta** — privada o contextual del dueño (una tarifa, una métrica, una decisión de negocio). No se expande: se cierra en el onboarding del sujeto.
- **Repetida** — ya salió en otra rama. Se referencia, no se re-prisma (referencia, no embebido).

Converge siempre porque cada ronda solo puede parir átomos, hojas abiertas o repeticiones,
y ese conjunto es finito. Cuando una ronda entera no trae productos nuevos, has llegado al suelo.

## Qué escribe

Crea el directorio del sujeto y deja dentro:

```
<dir>/
├─ pasada-1-<sujeto>.md      nivel 1 — prisma sobre el sujeto crudo
├─ pasada-2-<...>.md         nivel 2 — prisma sobre cada sub-producto
├─ …                         una pasada = un archivo, hasta el suelo
├─ pasada-N-diseccion.md     la disección — FORMA de cada órgano
└─ esquema.md                el árbol maestro: todo embebido + recuento
```

En el árbol, marca cada hoja para que el estado se lea de un vistazo:
`[ABIERTO]` privado del dueño · `ATÓMICO` pieza (va al diseccionador) · `SPAWN` se ramifica
· `REF` deduplicado.

## Errores a evitar

- **Colar el sistema ambiente** — el fallo estrella. Si una tecnología aparece en el
  análisis, conviértela en puerto.
- **Seguir prismando piezas atómicas** — no converge y genera ruido; para en
  {atómico, abierto, repetido}.
- **Inventar el dato privado** — deuda invisible; el hueco nombrado es el onboarding,
  no un defecto.
- **Un esquema de punteros vacíos** — el maestro embebe el detalle; los archivos de
  pasada son el registro de cada ronda, no el mapa.
- **Disecar antes de tocar suelo** — primero el prisma se agota, luego se asigna forma.
- **Separar dimensiones interdependientes como ramas** — el error más sutil. Si los sub-productos no son componentes independientes sino DIMENSIONES que se modulan mutuamente (como navegación y estilo en una UI, o precio y demanda en un producto), NO las trates como ramas separadas del árbol. El árbol se ve bien pero al ensamblar las piezas no encajan porque cada una fue diseñada sin saber de la otra. Modelalas como INPUTS de una sola pieza convergente que las sintetiza juntas. Las capas no se comunican — convergen en un solo generador que sabe de todas.

## Casos testigo

- `caso-skill-ui-web` en `references/` — skill generadora de UI web, primer esquema con capas separadas.
- `caso-generador-convergente` en `references/` — el mismo sujeto **corregido**: inputs moduladores (proyecto + marca + UX + audiencia) convergiendo en un solo generador. Léelo en segundo lugar para ver la diferencia entre el modelo de capas y el modelo convergente.
