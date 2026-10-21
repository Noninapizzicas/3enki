---
tipo: componente
sector: teoria-restricciones
tags: [toc, ccpm, cadena-critica, gestion-proyectos, buffers]
---
# Cadena Crítica — CCPM y buffers de proyecto

> Cada tarea de un proyecto lleva su propia protección oculta contra el retraso — y aun así el
> proyecto entero llega tarde. Mover esa protección de cada tarea a un buffer compartido es lo
> único que hace falta para que deje de pasar.

---

## El problema que CCPM viene a resolver

```
LA PARADOJA DE LA GESTIÓN DE PROYECTOS CLÁSICA
  → Cada responsable de tarea infla su estimación para protegerse de la
    incertidumbre (margen de seguridad individual) — habitualmente basado
    en el peor caso, no en la media.
  → Ese margen se desperdicia por 3 mecanismos:
    1. SÍNDROME DEL ESTUDIANTE — el trabajo se pospone hasta cerca del
       plazo, aunque haya margen "de sobra" al principio.
    2. LEY DE PARKINSON — el trabajo se expande para llenar el tiempo
       disponible; si sobra margen, se consume igualmente.
    3. MULTITAREA DAÑINA (bad multitasking) — repartir la atención entre
       varias tareas simultáneas en vez de terminar una y pasar a la
       siguiente ALARGA el tiempo total de entrega de TODAS ellas, aunque
       cada persona "esté siempre ocupada".
  → Resultado: proyectos con mucho margen individual acumulado que, pese
    a ello, llegan tarde de forma sistemática — la protección existe pero
    está mal ubicada (en cada tarea) en vez de donde hace falta (al final
    de la cadena crítica).
```

---

## Construcción del plan CCPM

```
1. Estimar cada tarea con duración AGRESIVA pero razonable (aprox. 50% de
   probabilidad de cumplirse — NO el "caso seguro" al 90% que se usa en
   Gantt tradicional). Esto libera de golpe el margen individual oculto.

2. Identificar la CADENA CRÍTICA: la secuencia de tareas dependientes MÁS
   LARGA del proyecto, considerando TANTO dependencias lógicas COMO
   dependencias de RECURSOS compartidos (a diferencia del camino crítico
   clásico, que solo mira dependencias lógicas). Es la aportación
   diferencial de CCPM frente al CPM tradicional.

3. Colocar el margen liberado, agregado y protegido en 3 tipos de buffer:

   BUFFER DE PROYECTO (Project Buffer)
     Al FINAL de la cadena crítica, protege la fecha de entrega global.
     Tamaño típico: 50% de la duración agregada de la cadena crítica
     (regla de partida, ajustable con datos históricos de variabilidad).

   BUFFER DE ALIMENTACIÓN (Feeding Buffer)
     Donde una cadena NO crítica se une a la cadena crítica — protege a
     la cadena crítica de retrasos que vienen de fuera de ella. Sin este
     buffer, un retraso en una rama secundaria contamina directamente el
     camino principal.

   BUFFER DE RECURSO (Resource Buffer)
     No consume tiempo de calendario — es una ALERTA/notificación previa
     para que el recurso crítico (persona o equipo) esté disponible
     exactamente cuando la cadena crítica lo necesita, evitando arranques
     tardíos por "no me avisaron a tiempo".

4. Gestionar el proyecto por CONSUMO DE BUFFER, no por % de tareas
   completadas — ver Fever Chart abajo.
```

---

## El Fever Chart — el instrumento de control diario

```
EJE X: % de la CADENA CRÍTICA completado
EJE Y: % del BUFFER DE PROYECTO consumido

ZONA VERDE — buffer consumido < avance de la cadena crítica → normal.
ZONA AMARILLA — consumo de buffer empieza a superar el avance → vigilar,
  identificar causa, sin acción drástica todavía.
ZONA ROJA — consumo de buffer muy por delante del avance real → acción de
  gestión inmediata: redistribuir recursos, escalar, replanificar la tarea
  en curso.

VENTAJA FRENTE AL GANTT DE "% COMPLETADO"
  → El % de tarea completada autoreportado es notoriamente poco fiable
    ("estamos al 90%" durante semanas). El Fever Chart mide la VARIABLE
    QUE REALMENTE IMPORTA — cuánta protección queda — no el optimismo del
    responsable de la tarea.
  → Desarrollos recientes (2024-2025, Epicflow "Bubble Graph") añaden una
    tercera dimensión visual (tamaño de burbuja = riesgo o coste asociado)
    para portfolios de varios proyectos gestionados con buffers compartidos.
```

---

## Multitarea dañina — el enemigo silencioso

```
EJEMPLO NUMÉRICO CLÁSICO (3 tareas de 10 días cada una, sin multitarea vs con)
  SIN multitarea: A termina día 10, B día 20, C día 30. Tiempo medio de
    entrega: (10+20+30)/3 = 20 días.
  CON multitarea (alternando entre las 3 constantemente): las 3 terminan
    aproximadamente al mismo tiempo, cerca del día 30 cada una. Tiempo
    medio de entrega: ~30 días — un 50% peor, y NINGUNA tarea entregada
    antes que en el escenario sin multitarea.

REGLA PRÁCTICA: en un proyecto o cartera gestionada con CCPM, cada persona
  o recurso crítico trabaja en UNA tarea de la cadena crítica hasta
  completarla (o hasta un punto de parada lógico), no en fragmentos
  intercalados de varias — esto exige alinear la carga de trabajo de la
  organización, no solo la planificación del proyecto individual.
```

---

## CCPM en cartera de proyectos (multi-proyecto)

```
→ Cuando varios proyectos comparten recursos críticos (ingenieros senior,
  un banco de pruebas, un equipo de diseño), el recurso compartido se
  convierte en la restricción de TODA LA CARTERA — se sincroniza su
  asignación entre proyectos ("drum" de cartera) antes de fijar fechas de
  cada proyecto individual.
→ Investigación reciente (Risha, 2025) formaliza estos entornos de
  ingeniería multiproyecto como sistemas de recursos compartidos con redes
  de actividades en competencia simultánea — puente directo entre CCPM
  clásico de un solo proyecto y gestión de portfolio moderna con
  priorización dinámica de recursos escasos.
```

---

## Software y herramientas

```
DEDICADO A CCPM
  → Exepron — SaaS especializado en CCPM con fever chart nativo, integra
    Jira/MS Project como fuente de datos.
  → ProChain Solutions — pionero histórico de software CCPM, orientado a
    ingeniería y desarrollo de producto.

GENÉRICO CON EXTENSIÓN CCPM
  → Microsoft Project + plantillas de buffer manual — viable para equipos
    pequeños sin presupuesto de software dedicado.
  → Epicflow — gestión de cartera multi-proyecto con Bubble Graph
    (evolución del fever chart), pensado para I+D y desarrollo de producto
    con recursos compartidos entre proyectos.
```

---

## Errores comunes

```
→ Mantener las estimaciones "seguras" originales de cada tarea Y añadir
  buffers agregados encima — duplica la protección y alarga el proyecto
  en vez de acortarlo (el punto central de CCPM es REASIGNAR el margen
  existente, no añadir margen nuevo).
→ Ignorar las dependencias de RECURSO al identificar la cadena crítica —
  quedarse solo con el camino crítico lógico clásico pierde exactamente
  la aportación diferencial de CCPM.
→ Permitir multitarea "porque el recurso parece libre entre tareas" —
  rompe la disciplina de una tarea completada antes de empezar la
  siguiente, que es lo que realmente acorta el lead time del proyecto.
→ Gestionar el proyecto mirando el Gantt de % completado en paralelo al
  Fever Chart — genera señales contradictorias y diluye la disciplina de
  gestión por buffer.
```

## Novedades 2024-2026

```
→ Investigación 2025 (Tandfonline) sobre "modified critical chain
  scheduling" propone ajustes específicos de CCPM para proyectos de
  construcción, integrando restricciones de espacio de trabajo físico
  (no solo de personal) como tercer tipo de dependencia de recurso.
→ Integración creciente de CCPM con Scrum/Kanban y BIM en construcción —
  el buffer de proyecto se gestiona junto a sprints de diseño, y el
  fever chart se alimenta de datos de avance físico de obra capturados
  por BIM 4D.
```

Ver: [[Drum-Buffer-Rope — programación de producción y buffers]] · [[TOC en servicios, software y startups — DevOps y Phoenix Project]] · [[../construccion-abierta/00 - Construcción Abierta (MOC)|Construcción Abierta]].
