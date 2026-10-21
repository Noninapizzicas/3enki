---
tipo: componente
sector: teoria-restricciones
tags: [toc, frt, prt, tt, thinking-processes, plan-de-accion]
---
# Procesos de Pensamiento II — Realidad Futura, Prerrequisitos y Transición

> Diagnosticar el problema es la mitad del trabajo. La otra mitad es demostrar, antes de gastar
> un euro, que la solución propuesta no crea un problema nuevo peor que el que resuelve.

---

## Árbol de Realidad Futura (FRT) — validar la solución antes de ejecutar

```
PROPÓSITO
  Tomar la "inyección" (la idea de cambio que evapora el conflicto de la
  Nube) y construir, con la misma lógica causa-efecto del CRT, el árbol de
  lo que SUCEDERÍA si esa inyección se implementa — verificando que los
  UDE originales se conviertan en DE (Desirable Effects / Efectos
  Deseables) sin generar Efectos Colaterales Negativos (NBR) nuevos.

CONSTRUCCIÓN
  1. Parte de la(s) inyección(es) identificada(s) en la Nube de Evaporación.
  2. Traza, con lógica "SI-ENTONCES", las consecuencias en cascada de esa
     inyección sobre el sistema.
  3. Verifica que cada UDE original del CRT aparece en el FRT convertido
     en su DE opuesto.
  4. Busca activamente "Reservas de Rama Negativa" (Negative Branch
     Reservations, NBR): ¿qué efecto NO deseado, plausible, podría surgir
     de esta inyección? — es la disciplina de "pre-mortem" antes de que
     existiera el término.
  5. Si aparece un NBR creíble, se "poda" añadiendo una inyección
     complementaria que lo neutraliza ANTES de ejecutar, no después.

EJEMPLO (continuando el caso de lotes de producción)
  Inyección: reducir tiempo de cambio de formato con SMED, permitiendo
  lotes de transferencia pequeños.
  NBR posible: "el operario, sin lotes grandes que 'ocupen tiempo', podría
  sentir presión de cambio constante y aumentar errores por fatiga de
  cambio".
  Inyección complementaria: rediseñar la secuencia de cambios y formar al
  equipo en el nuevo procedimiento ANTES del despliegue, no en paralelo.
```

---

## Árbol de Prerrequisitos (PRT) — anticipar los obstáculos

```
PROPÓSITO
  Entre "decidir qué hacer" (FRT) y "hacerlo" (TT) casi siempre hay
  OBSTÁCULOS previsibles que, si no se nombran, descarrilan la
  implementación en la práctica — resistencia de un departamento, falta
  de una competencia concreta, un sistema de información que no soporta
  el nuevo flujo.

CONSTRUCCIÓN
  1. Define el OBJETIVO final (la inyección ya validada por el FRT).
  2. Lista TODOS los obstáculos previsibles para llegar ahí — sin filtrar
     ni suavizar, cuantos más mejor en esta fase.
  3. Para cada obstáculo, define un OBJETIVO INTERMEDIO que lo neutraliza
     — no una solución detallada todavía, solo el hito que hay que
     alcanzar.
  4. Secuencia los objetivos intermedios en el orden lógico necesario
     (algunos dependen de otros) — esto YA es un mapa de proyecto, sin
     necesidad de un Gantt tradicional.

POR QUÉ IMPORTA EN LA PRÁCTICA
  Es la herramienta que convierte "sabemos qué cambiar" en un plan
  realista — la mayoría de fracasos de cambio organizacional no son de
  diagnóstico (la gente suele saber qué está mal) sino de subestimar los
  obstáculos de implementación. El PRT los pone sobre la mesa desde el
  primer día, con nombre y apellido.
```

---

## Árbol de Transición (TT) — el plan de acción detallado

```
PROPÓSITO
  Convertir cada objetivo intermedio del PRT en ACCIONES concretas,
  secuenciadas, con lógica "SI hago [acción] Y [condición actual existe]
  ENTONCES [efecto esperado]" — el nivel más granular y ejecutable de
  los Procesos de Pensamiento.

ESTRUCTURA DE CADA PASO
  1. Necesidad — por qué se hace esta acción (enlaza con el PRT).
  2. Estado actual relevante — qué condición del entorno hace necesaria
     la acción tal como está formulada.
  3. Acción específica — qué se hace, literalmente, con verbo de acción.
  4. Efecto esperado — qué cambia en el sistema tras la acción, verificable.

ES, EN LA PRÁCTICA, UN GUION DE IMPLEMENTACIÓN
  A diferencia de un plan de proyecto genérico, el TT obliga a verbalizar
  el "por qué esta acción, ahora, en este orden" — lo que facilita mucho
  la comunicación del plan a quien no participó en el diagnóstico
  (dirección, equipos afectados) porque la lógica queda explícita, no
  implícita en la cabeza de quien lo diseñó.
```

---

## Cuándo usar cada árbol — resumen de las 5 herramientas

```
CRT   → "¿Qué está mal REALMENTE?" (causa raíz, no síntomas)
NUBE  → "¿Por qué seguimos sin resolverlo?" (conflicto y supuesto oculto)
FRT   → "¿Esta idea de solución funciona, sin crear un problema nuevo?"
PRT   → "¿Qué se interpone entre la idea y la realidad?"
TT    → "¿Qué hago exactamente, en qué orden, y por qué?"

REGLA PRÁCTICA: no todo problema necesita las 5 herramientas completas.
Para conflictos de política acotados, una Nube de Evaporación bien
construida basta. Para transformaciones de mayor calado (cambio de
modelo de negocio, reestructuración de un área completa), el recorrido
CRT→Nube→FRT→PRT→TT completo es lo que sostiene Viable Vision
(ver [[Estrategia y Táctica — Viable Vision y árboles S&T]]).
```

---

## Errores comunes

```
→ Saltar directamente de la Nube a la acción sin pasar por el FRT —
  implementar la inyección sin verificar NBR es la causa más frecuente de
  "efectos secundarios inesperados" que después se atribuyen erróneamente
  a "resistencia al cambio" cuando en realidad eran previsibles.
→ Construir el PRT con soluciones ya cerradas en vez de obstáculos abiertos
  — mata la utilidad de la herramienta, que es precisamente airear
  obstáculos que nadie quiere nombrar en voz alta en una reunión formal.
→ Redactar el TT con acciones vagas ("mejorar la comunicación") en vez de
  verbos y efectos verificables — sin verificabilidad no hay forma de
  saber si el paso se cumplió.
```

## Novedades 2024-2026

```
→ El uso combinado de FRT/PRT/TT con metodologías ágiles (sprints,
  retrospectivas) gana terreno en consultoría de transformación digital:
  el PRT se emplea como "mapa de riesgos de implementación" al inicio de
  un programa de transformación, complementando (no sustituyendo) los
  backlogs ágiles tradicionales.
```

Ver: [[Procesos de Pensamiento I — Árbol de Realidad Actual y Nube de Evaporación]] · [[Estrategia y Táctica — Viable Vision y árboles S&T]].
