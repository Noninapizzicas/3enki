---
name: esquematizar-negocio
description: >-
  FASE 2 del proceso de un proyecto (la arranca el orquestador proceso-negocio
  tras negocio.identificado): esquematiza el NEGOCIO ya declarado en la
  identidad (qué_es, qué_vende, cómo_lo_elabora, interlocutores de
  project-profile) con el método del esquematizador. MANDATO MECÁNICO: pasa el
  prisma de 5 huecos PUNTO A PUNTO, RONDA A RONDA hasta quedarse seco,
  escribiendo cada pasada en <proyecto>/esquemas/pasada-N-<punto>.md y el árbol
  maestro en <proyecto>/esquemas/esquema.md (el entregable que el gate verifica).
  Después, PRISMA POR INTERLOCUTOR: cada actor del mapa cerrado en FASE 0
  (interlocutores[]) pasa por los 5 huecos DESDE SU PERSPECTIVA — qué necesita,
  qué le restringe, cuál es su contrato con el negocio, qué NO quiere. Después,
  DISECCIÓN PUNTO A PUNTO: cada hoja atómica, una a una, su FORMA (reflejo puro ·
  micro-agente fuzzy · custodio · conversor · puente) en pasada-N-diseccion.md
  — sin dejar ninguna sin forma. El propósito es descubrir las PIEZAS que el
  negocio necesita (cada una su parcela) desde TODAS las perspectivas. EL FOCO:
  identifica TÚ MISMO el cuello de botella del flujo (eslabón limitante) y
  expándelo al máximo. LEY DE CERO SUPUESTOS: todo valor no declarado es
  pregunta abierta, nunca estimación. CICLO: pasada 1 → preguntas al dueño →
  investigación web de los puntos investigables → replanteamiento → pasada 2,
  hasta que el esquema quede sólido. Entrada directa: el sujeto se lee de la
  identidad, NO se pregunta, NO se ofrecen opciones — se EJECUTA. Al terminar:
  proceso-negocio.completar_fase { fase: 'esquematizado' } → empuja la FASE 3 ·
  PLASMA (planificar-construccion: el diseño OOP en esquemas/diseno-oop.md).
fuente: enki
dominio: metodo
lente_dominio: prisma
lente_tarea: esquematizar
tags: [fase2, negocio, esquema, identidad, prisma, diseccionador, proceso, agnosticismo]
---

# Esquematizar el Negocio — FASE 2 del proceso de proyecto

> **Qué es.** La skill que esquematiza el NEGOCIO de un proyecto cuando ya tiene
> identidad. Entra encadenada (la empuja `proceso-negocio` tras
> `negocio.identificado`) — no a mano. El sujeto está DECLARADO: se lee de la
> identidad, no se pregunta desde cero.
>
> Código: fase 2 de proceso · habilita `negocio.esquematizado`

---

## 1 · ENTRADA — lee el sujeto de la identidad (no preguntes)

**REGLA DIRECTIVA (innegociable)**: cuando esta skill entra **encadenada por el
orquestador** (empujón de `proceso-negocio`), el proceso YA decidió: toca
esquematizar. **NO ofrezcas opciones** — nada de "¿la activo como lente o la
aplico ya?", nada de caminos A/B/C, nada de pedir permiso. **EJECUTA.** La única
pregunta legítima al dueño es si la identidad está incompleta (ver abajo).

Antes de esquematizar, lee la identidad del negocio:

```
project-profile.get.request { project_id }
  → perfil.identidad = {
      que_es,           // "un observatorio de tendencias musicales"
      que_vende,        // "newsletter pública + panel visual"
      como_lo_elabora,  // "rastreo de fuentes trinchera + aceleración + umbrales"
      tipo_derivado,    // "servicio" | "elaborado+pieza" | "de_reventa" | ...
      interlocutores,   // [{ rol, canal, relacion }] — mapa cerrado en FASE 0
      preguntas_abiertas
    }
```

**Regla**: el sujeto es `que_es + que_vende + como_lo_elabora` — NUNCA el
contenedor técnico, NUNCA una lista de tipos. Si la identidad está incompleta
(estado `sin_identidad` o campos vacíos) → NO inventes: pide completar la
FASE 0 (identidad-negocio) antes de seguir.

**Regla de interlocutores**: `interlocutores[]` es el mapa CERRADO de todos los
actores que tocan el negocio (lo cerró la FASE 0). Esta lista se consume aquí
para el prisma por interlocutor — NO descubras actores nuevos. Si el mapa está
vacío o falta, pide completar la FASE 0 antes de seguir.

## 2 · EL MÉTODO — el esquematizador aplicado al negocio

Sigue el método de la skill `esquematizador` (cárgala para el detalle), pero el
sujeto ya está fijado:

**Fase 1 · Prisma recursivo** — pasa el NEGOCIO por los 5 huecos
(IDENTIDAD, RESTRICCIONES, CONTRATO, NO-OBJETIVOS, PREGUNTAS_ABIERTAS).
De sus huecos salen sub-productos (las PIEZAS del negocio: qué hace falta para
que venda, elabore y entregue lo declarado); pasa cada uno por el prisma otra
vez hasta seco. Escribe cada ronda en `pasada-N-<pieza>.md`.

**Fase 1b · Prisma por interlocutor** — toma la lista CERRADA de
`interlocutores[]` (mapa de FASE 0). Para CADA actor, pasa el negocio por los
5 huecos DESDE SU PERSPECTIVA:

- **IDENTIDAD**: ¿qué es el negocio para ESTE actor? Cada uno lo ve distinto
  según su `rol` y su `relacion` declarados — el prisma lo descubre.
- **RESTRICCIONES**: ¿qué le limita a ESTE actor en su relación con el negocio?
  Se deriva de su `canal`, su `rol` y lo que el negocio le exige.
- **CONTRATO**: ¿qué intercambia con el negocio? Lo que da ↔ lo que recibe,
  leído de su `relacion` declarada.
- **NO-OBJETIVOS**: ¿qué NO quiere este actor del negocio? Lo que le haría
  dejar de participar o buscar alternativa.
- **PREGUNTAS ABIERTAS**: lo que no sabemos de la relación de este actor con el
  negocio — lo que no se preguntó en FASE 0.

Los actores cambian de un negocio a otro — NO hay lista fija. La lista viene
de `interlocutores[]` (FASE 0) y cada negocio tiene los suyos. El prisma se
adapta al actor que tenga delante.

Cada interlocutor genera su pasada: `pasada-N-interlocutor-<rol>.md`. Las
piezas que emergen SOLO desde la perspectiva de un actor concreto se añaden al
árbol — son invisibles desde la vista global. Las piezas que varios actores
comparten se refuerzan y se cruzan (validación cruzada).

**Fase 2 · Esquema** — ensambla en `esquema.md` el árbol maestro completo:
las piezas del negocio (del prisma global + del prisma por interlocutor), sus
relaciones, y lo que cada una necesita (puertos abiertos — agnosticismo, cero
tecnologías).

**Fase 3 · Disección** — cada hoja atómica pasa por el diseccionador y sus
preguntas → FORMA. Las CINCO, en el orden del dueño del vocabulario
(skill `diseccionador`):

```
REFLEJO puro       calcular, cero juicio — un test unitario lo AFIRMA
MICRO-AGENTE fuzzy juicio, lenguaje, ambigüedad — el reflejo hidrata y persiste,
                   el agente solo transforma (el corte maestro pasa por aquí)
CUSTODIO           un solo dueño por store — dos escritores es corrupción esperando turno
CONVERSOR          una sola frontera donde cruzan formatos, unidades o dimensiones
PUENTE             conecta con lo vecino por EVENTO, sin pisar lo manual
```

Anota la forma en `esquema.md`. El **micro-agente** es el que decide si una
pieza lleva LLM: sin él sobre la mesa, las hojas de juicio se disecan como
reflejos y acaban en if-chains frágiles.

**El propósito afilado** (lo que diferencia esta skill del esquematizador
genérico): el esquema debe responder **"¿qué piezas necesita este negocio
para hacer lo que declara?"** — cada pieza es una PARCELA (un futuro módulo
con su lógica). No es un ejercicio abstracto: es el plano de construcción.

## 3 · DÓNDE SE PERSISTE — rutas EXACTAS (no negociable)

El esquema del negocio vive en el proyecto, en estas rutas CONCRETAS:

```
<storage del proyecto>/esquemas/esquema.md              ← el árbol maestro (OBLIGATORIO)
<storage del proyecto>/esquemas/pasada-1-<pieza>.md     ← ronda 1 del prisma (OBLIGATORIO)
<storage del proyecto>/esquemas/pasada-2-<pieza>.md     ← ronda 2
<storage del proyecto>/esquemas/pasada-N-<pieza>.md     ← …hasta seca
<storage del proyecto>/esquemas/pasada-N-interlocutor-<rol>.md ← prisma por actor (1 por interlocutor)
<storage del proyecto>/esquemas/pasada-N-diseccion.md   ← las formas de cada hoja atómica
```

**Rutas exactas y RELATIVAS al proyecto** — el gate lista `esquemas/` con
`fs.list.request { project_id, path: 'esquemas' }`, así que escribe ahí mismo:

```jsonc
fs.write.request { "project_id": "<id>", "path": "esquemas/pasada-1-<pieza>.md", "content": "…" }
```

Nada de rutas absolutas: lo que caiga fuera de `esquemas/` el gate no lo ve. Si
el directorio no existe, la escritura lo crea.

**La ronda 2 es entregable, no opcional.** El gate exige `esquema.md` +
`pasada-1-*` + `pasada-2-*` + un fichero con `diseccion` en el nombre. Un sujeto
que se secara en la ronda 1 no cerraría la fase: pasa al prisma los
sub-productos de la primera ronda y deja su pasada escrita.

**El archivo que la fase 2 debe generar SÍ o SÍ**: `esquemas/esquema.md` con
sus pasadas. Sin él, el gate del orquestador devuelve `FASE_INCOMPLETA` y el
proceso no avanza.

## 3b · EL MANDATO — prisma punto a punto hasta quedarse seco

**Procedimiento mecánico, en este orden, sin saltarte nada:**

1. Toma el negocio (qué_es + qué_vende + cómo_lo_elabora de la identidad).
2. **BUSCA EL FOCO TÚ MISMO**: del flujo declarado en cómo_lo_elabora, identifica el ESLABÓN LIMITANTE (el cuello de botella — el paso cuya capacidad o programación restringe al conjunto). NO esperes a que el dueño lo señale: es tu trabajo encontrarlo y EXPANDIRLO AL MÁXIMO (sus restricciones, sus alternativas de desacople, sus decisiones abiertas). El cuello de botella es el CORAZÓN del esquema, no una sección más. El eslabón limitante cambia de un negocio a otro — se lee del flujo declarado, nunca de una lista fija.
3. Pásalo por el prisma de 5 huecos → escribe `pasada-1-<pieza>.md` con los 5 huecos y los sub-productos que salen.
4. **Cada sub-producto que salió es un PUNTO nuevo**: pásalo por el prisma OTRA VEZ → escribe `pasada-2-<punto>.md`.
5. Repite: cada punto que sale de cada pasada, al prisma, en su propio archivo — **PUNTO A PUNTO, RONDA A RONDA**.
6. **PARA cuando un punto es**: atómica (va a disección) · abierta (no se expande) · repetida (se referencia). Eso es "quedarse seco".
7. **PRISMA POR INTERLOCUTOR** — con el prisma global seco, toma la lista
   `interlocutores[]` de la identidad. Para CADA actor, uno a uno:
   a. Pasa el negocio por los 5 huecos DESDE LA PERSPECTIVA de ese actor
      (¿qué es el negocio para él? ¿qué le restringe? ¿cuál es su contrato?
      ¿qué NO quiere? ¿qué no sabemos de su relación con el negocio?).
   b. Escribe `pasada-N-interlocutor-<rol>.md` (un archivo por actor).
   c. Las piezas nuevas que emergen SOLO desde esa perspectiva se añaden al
      árbol — son piezas invisibles desde la vista global.
   d. Las piezas que varios actores comparten se refuerzan y se cruzan
      (validación cruzada: si el cliente y el trabajador ven la misma pieza
      distinto, eso es un conflicto que el esquema debe resolver).
   e. **Pregunta al dueño** si emerge algo que no estaba en la vista global
      — las preguntas abiertas del interlocutor se suman al guion.
8. Solo cuando NINGÚN punto se parta más (seco) y TODOS los interlocutores
   tengan su pasada → ensambla TODO en `esquemas/esquema.md` (el árbol maestro
   con piezas globales + piezas por interlocutor, todo embebido, no punteros).
9. **DISECCIÓN PUNTO A PUNTO** (mecánica, en el mismo espíritu):
   - Toma la lista de hojas ATÓMICAS que salieron del prisma global + del
     prisma por interlocutor (las que el prisma ya no parte).
   - **Cada hoja, una a una, sin saltarte ninguna**: pásala por el diseccionador y sus preguntas → fija su FORMA (reflejo puro · micro-agente fuzzy · custodio · conversor · puente).
   - Escribe cada FORMA en el esquema (`esquema.md`: cada pieza con su forma) y la lista completa en `pasada-N-diseccion.md`.
   - **NO paras hasta que TODAS las hojas atómicas tengan su FORMA** — si quedan hojas sin forma, la disección no está terminada.
   - **NO agrupas de golpe**: es una por una, punto a punto, como el prisma.
10. Cierra la fase: `proceso-negocio.completar_fase { fase: 'esquematizado' }`.

**NO pares a mitad**: si un punto todavía se parte, sigues. **NO resumas**: cada
pasada es un archivo real en disco. **NO te saltes el esquema.md**: es el
entregable que el gate verifica. **NO dejes hojas atómicas sin FORMA**: la
disección punto a punto es parte del entregable.

## 3c · LA LEY DE CERO SUPUESTOS (innegociable)

**NO des nada por sentado.** Todo valor que no esté declarado en la identidad
ni respondido por el dueño — capacidades, kilos por hornada, horas de trabajo,
precios, costes, consumos, rendimientos, "esto no se puede" — se marca como
**PREGUNTA ABIERTA** en el hueco correspondiente. **NUNCA** se estima, se
inventa, ni se da por sabido.

- Prohibido afirmar "se puede producir X kg/día" o "el horno Y es el óptimo" sin dato declarado: eso es un supuesto.
- Si el esquema no puede decidir algo sin dato del dueño, lo deja como pregunta abierta EXPLÍCITA.
- Un "no se puede" o un límite de capacidad NUNCA se afirma: se pregunta al dueño.
- Las preguntas abiertas del esquema son el GUION de la conversación siguiente: el chat se las hace al dueño, una a una.

## 3d · EL CICLO COMPLETO DE LA FASE 2 (no es un pase único)

La fase 2 es un CICLO que puede repetirse hasta que el planteamiento esté
sólido. NO termines al primer esquema si quedan preguntas abiertas relevantes:

```
PASADA 1 · esquematiza (el mandato de arriba) → esquema con preguntas_abiertas
   ↓
PREGUNTAS · hazle al dueño las preguntas abiertas del esquema, una a una,
   esperando su respuesta (datos reales: costes, capacidades, kilos, precios)
   ↓
INVESTIGACIÓN · EXIGE investigar los puntos investigables que queden
   (tipo de horno, consumos gas/eléctrico, casos reales de obradores,
   precios de mercado). Usa la web. Mejor investigar ALGO que no investigar
   nada: no dejes un hueco investigable sin intentar cerrarlo.
   ↓
REPLANTEAMIENTO · rehaz el planteamiento con las respuestas + la investigación
   ↓
PASADA 2 · vuelve a pasar el esquematizador (o re-esquematiza) con todo el
   contexto enriquecido → esquema definitivo con los huecos cerrados
```

**Reglas del ciclo:**
- **El chat es quien pregunta e investiga** (el agente del motor es turno sintético, no conversa). Las preguntas_abiertas que el agente deja en el esquema son el guion.
- **Exigir investigar**: los puntos investigables (horno, consumos, casos, precios) se investigan en web SÍ o SÍ. Mejor una investigación parcial que ninguna.
- **Re-pasar el agente**: cuando el replanteamiento esté hecho, vuelve a ejecutar el pipeline `esquematizador-negocio` (pasada 2) para que el esquema formal se regenere con los datos reales.
- El ciclo termina cuando el esquema no deja preguntas abiertas relevantes (o el dueño decide cerrar).
- **Cierra la fase UNA vez, al final del ciclo.** El orquestador marca
  `<project_id>::negocio.esquematizado` de forma idempotente: el primer cierre
  aceptado empuja la fase siguiente y los posteriores ya no vuelven a empujar.
  Cerrar tras la pasada 1 quema el encadenamiento con el esquema a medias.

## 4 · SALIDA — señal de fase completada

Al terminar (esquema escrito), cierra la fase para que el orquestador encadene:

```
proceso-negocio.completar_fase.request {
  project_id,
  fase: 'esquematizado',
  resumen: { piezas: N, formas: N, archivo_esquema: 'esquemas/esquema.md' }
}
```

El orquestador (`proceso-negocio`) marca la fase y empuja la **FASE 3 · PLASMA**
(`planificar-construccion`): diseñar el sistema en pseudocódigo OOP sobre
`esquemas/diseno-oop.md`, sin pensar en ningún framework. Después vienen el
ADAPTADOR X→Enki (3b, escribe `esquemas/plan-construccion.md`) y, desde ahí, el
ciclo por pieza.

**Cómo encadena** — `negocio.esquematizado` NO viaja por el bus: es una marca
interna del orquestador (idempotente por proyecto). El empujón llega al chat por
la cola de pendientes + `conserje.empujon`, que el nervio surfacea una vez. Lo
que devuelve la llamada dice quién sigue:

```jsonc
// respuesta 200
{ "fase_completada": "negocio.esquematizado",
  "siguiente": "planificar-construccion",   // ← la FASE 3
  "entregable": { "ok": true, "verificados": ["el árbol maestro", "…"] },
  "fin": false }
```

**Si algo bloquea** (identidad incompleta, no se puede leer el perfil) → informa
con honestidad y NO inventes el esquema. La fase queda pendiente, no forzada.

---

## 5 · Errores a evitar

- **Ofrecer opciones A/B/C al entrar encadenada** — el proceso ya decidió: EJECUTA. (Visto en vivo: el LLM preguntó "¿la activo como lente o la aplico ya?" en vez de esquematizar.)
- **Pedir permiso de configuración** ("¿activo la skill?") — el orquestador ya la activó; no es tu decisión.
- **Preguntar el sujeto desde cero** — ya está declarado en la identidad; leerlo.
- **Esquematizar el contenedor** (el proyecto técnico) — el sujeto es el NEGOCIO.
- **Colar tecnologías** — agnosticismo: puertos abiertos, cero entorno (la ley del esquematizador).
- **Inventar piezas** — si el dueño no lo declaró, es pregunta abierta, no pieza.
- **Esperar a que el dueño señale el foco** — el cuello de botella se busca TÚ MISMO en el flujo declarado; es tu trabajo, no su encargo.
- **Dar por sentado capacidades/valores** — la ley de cero supuestos: lo no declarado es pregunta abierta, nunca estimación.
- **Afirmar "no se puede"** — un límite de capacidad se consulta al dueño, no se decide solo.
- **Saltarse la investigación** — los puntos investigables (horno, consumos, casos, precios) se investigan en web; mejor algo que nada.
- **Terminar en el primer esquema** — si quedan preguntas abiertas relevantes, el ciclo sigue (preguntas → investigación → replanteamiento → pasada 2).
- **Saltarse el prisma por interlocutor** — el prisma global ve el negocio "desde arriba"; el prisma por interlocutor lo ve desde la silla de cada actor. Las piezas que solo emergen desde una perspectiva concreta se pierden sin esta pasada — y son distintas en cada negocio porque los actores son distintos.
- **Inventar interlocutores nuevos** — el mapa se cerró en FASE 0; esta fase lo CONSUME, no lo amplía. Si aparece un actor que falta, se devuelve a FASE 0 para reabrir el mapa.
- **Disecar antes de tocar suelo** — primero el prisma global + prisma por interlocutor se agotan, luego la FORMA.
- **Cerrar la fase tras la pasada 1** — el cierre es idempotente y solo empuja una vez: se cierra cuando el ciclo termina.
- **Escribir fuera de `esquemas/`** (rutas absolutas) — el gate lista ese directorio del proyecto; lo de fuera no existe para él.
- **Olvidar la señal de fase** — sin `proceso-negocio.completar_fase`, el proceso se detiene aquí.

## 6 · Verificación

- Leíste la identidad (project-profile.get) y el sujeto es el negocio declarado.
- CERO preguntas de sujeto al dueño (ya está respondido) — y CERO opciones A/B/C ofrecidas.
- **Identificaste TÚ el cuello de botella** del flujo (eslabón limitante) y lo expandiste al máximo — no esperaste a que el dueño lo dijera.
- **CERO supuestos**: todo valor no declarado aparece como pregunta abierta explícita, ninguno estimado.
- **Cada punto del prisma tiene su pasada en disco** (`esquemas/pasada-N-<punto>.md`) — ronda a ronda hasta seca.
- **Cada interlocutor tiene su pasada** (`esquemas/pasada-N-interlocutor-<rol>.md`) — uno por actor del mapa cerrado en FASE 0, con los 5 huecos desde SU perspectiva.
- **Las piezas que solo emergen desde un interlocutor** están en el árbol maestro (no se quedaron solo en la pasada del actor).
- **`esquemas/esquema.md` existe** con el árbol maestro (piezas globales + piezas por interlocutor — el gate lo comprueba).
- CERO tecnologías en el esquema (agnosticismo).
- `esquema.md` responde "qué piezas necesita este negocio" con su FORMA, visto desde TODAS las perspectivas.
- **El ciclo está vivo**: si quedan preguntas abiertas relevantes → las haces al dueño, investigas los puntos investigables y re-pasas el agente (pasada 2).
- Señal de fase enviada: `proceso-negocio.completar_fase { fase: 'esquematizado' }` → 200 (no 409), y la respuesta trae `siguiente: 'planificar-construccion'`.
