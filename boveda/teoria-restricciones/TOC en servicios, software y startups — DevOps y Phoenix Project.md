---
tipo: componente
sector: teoria-restricciones
tags: [toc, devops, software, startups, phoenix-project, flujo]
---
# TOC en servicios, software y startups — DevOps y Phoenix Project

> En una fábrica el cuello de botella se ve: hay una cola de piezas físicas delante de una máquina.
> En software es invisible — un pipeline de CI/CD lento, una persona que aprueba todos los merges,
> una política de "todo pasa por el arquitecto jefe". La lógica TOC es idéntica; encontrarlo cuesta más.

---

## "The Phoenix Project" — TOC narrado como novela DevOps

```
AUTORES: Gene Kim, Kevin Behr, George Spafford (2013)
PREMISA: réplica deliberada de la estructura de "La Meta" de Goldratt,
  trasladada de una fábrica a un departamento de TI al borde del colapso.
  El protagonista, Bill, hereda un proyecto (Phoenix) con outages
  constantes, y un mentor (Brent, primero como restricción humana, luego
  Erik como guía tipo "Jonah") le enseña a razonar en términos de flujo
  y restricciones en vez de "trabajar más duro".

MAPEO EXPLÍCITO TOC → DEVOPS
  → Restricción física de fábrica → Brent (la única persona que sabe
    resolver ciertos problemas críticos, cuello de botella HUMANO que
    todo el mundo interrumpe constantemente con preguntas urgentes).
  → Explotar la restricción → proteger el tiempo de Brent de
    interrupciones triviales; documentar su conocimiento para no depender
    de él en cada incidente.
  → Subordinar → el resto del equipo ajusta su forma de trabajar para NO
    generar trabajo adicional para el recurso restrictivo.
  → WIP limit → equivalente directo del "rope" de DBR: limitar cuántos
    proyectos/cambios entran en curso a la vez, en vez de "todo es
    prioridad 1" simultáneamente.
  → "Las Tres Vías" del libro (flujo, feedback, aprendizaje continuo) se
    apoyan explícitamente en la lógica de sistemas de Goldratt, no la
    contradicen — es la razón por la que el libro se volvió lectura
    canónica en la comunidad DevOps desde su publicación.
```

---

## Restricciones típicas en equipos de ingeniería de software

```
RESTRICCIÓN DE PERSONA (el "Brent" de cada equipo)
  Un único ingeniero senior/arquitecto por el que pasa toda decisión de
  diseño o toda revisión de código crítica. Se explota: proteger su
  tiempo de reuniones no esenciales, delegar documentación, mentoría
  activa para reducir dependencia estructural (no solo "que trabaje más").

RESTRICCIÓN DE PIPELINE (CI/CD lento)
  Si el pipeline de build/test/deploy tarda 45 minutos y cada desarrollador
  lo ejecuta varias veces al día, ESE pipeline es el tambor del equipo —
  toda mejora de "velocidad de escritura de código" antes de arreglar el
  pipeline es una eficiencia local que no mueve el throughput real
  (features desplegadas a producción por unidad de tiempo).

RESTRICCIÓN DE POLÍTICA (aprobaciones y gates)
  Procesos de aprobación con múltiples firmas secuenciales (seguridad,
  arquitectura, producto, legal) diseñados en una era de menor volumen de
  cambios — se convierten en la restricción real del sistema aunque cada
  aprobador individual trabaje rápido, porque la SUMA de tiempos de espera
  entre gates domina el lead time total. Se ataca con Nube de Evaporación:
  ¿qué supuesto sostiene "necesitamos aprobación secuencial de 4 personas"
  en vez de paralela o basada en riesgo?

RESTRICCIÓN DE MERCADO (para el producto, no para el equipo)
  En una startup, la restricción rara vez es "no podemos programar más
  rápido" — casi siempre es validación de producto/mercado (nadie compra
  lo que se construye) o distribución (nadie sabe que existe). Escalar
  el equipo de ingeniería en esa fase es elevar un recurso que no es la
  restricción — error de secuencia clásico de los 5 pasos aplicado a
  startups.
```

---

## Kanban, WIP limits y TOC — la misma lógica con vocabulario distinto

```
→ El "rope" de DBR y el "WIP limit" de Kanban resuelven el MISMO
  problema: no liberar más trabajo al sistema del que la restricción
  puede absorber. Kanban lo hace visual y por columna; DBR lo hace
  atado explícitamente al consumo del buffer de la restricción.
→ La "Ley de Little" (Lead Time = WIP / Throughput) es el fundamento
  matemático compartido por ambos enfoques: reducir WIP en curso, sin
  reducir throughput, es la palanca más directa y más barata para
  reducir el lead time de entrega — válida tanto en una fábrica como en
  un tablero Kanban de ingeniería de software.
→ Diferencia práctica: Kanban gestiona el flujo de forma más genérica
  (límites por columna); TOC/DBR además diagnostica explícitamente CUÁL
  recurso es la restricción y ordena EXPLOTARLO antes de tocar nada más
  — Kanban por sí solo no siempre fuerza ese diagnóstico previo.
```

---

## TOC aplicado a startups en fase temprana

```
DIAGNÓSTICO TÍPICO POR ETAPA
  Pre-product-market-fit → la restricción casi siempre es VALIDACIÓN
    (¿el problema es real y lo bastante doloroso?), no ingeniería.
    Elevar equipo técnico en esta fase es gasto operativo sin retorno
    en Throughput real (ventas), solo aumenta capacidad no utilizada.
  Post-PMF, pre-escalado → la restricción suele moverse a DISTRIBUCIÓN
    (adquisición de clientes) o a un proceso operativo concreto
    (onboarding manual, soporte, aprovisionamiento) que no escala al
    mismo ritmo que la demanda.
  Escalado → la restricción vuelve a menudo a CAPACIDAD DE INGENIERÍA
    (deuda técnica, pipeline, arquitectura) — es el único momento del
    ciclo de vida donde "contratar más ingenieros" suele ser realmente
    elevar la restricción correcta.

APLICACIÓN PRÁCTICA
  → Antes de contratar, aplicar el procedimiento de diagnóstico de
    [[Los 5 pasos de focalización — POOGI y tipos de restricción]]:
    ¿qué recurso tiene carga sostenida cercana al límite HOY? Contratar
    en cualquier otro punto es gasto operativo (OE) sin impacto en
    Throughput.
```

---

## Errores comunes

```
→ Añadir más desarrolladores a un equipo con restricción de proceso
  (pipeline lento, aprobaciones secuenciales) — la "Ley de Brooks"
  ("añadir gente a un proyecto tarde lo retrasa más") es, en el fondo, un
  caso particular de elevar el recurso equivocado.
→ Medir productividad individual (líneas de código, commits, story
  points cerrados) en vez de throughput de sistema (features en
  producción, valor entregado) — genera la misma sobreproducción de
  "trabajo en curso que nadie usa" que en una fábrica con eficiencias
  locales mal medidas.
→ Tratar la restricción humana ("Brent") con más presión y horas extra en
  vez de explotarla correctamente (proteger su foco, documentar, formar
  a otros) — quema al recurso más valioso del sistema en vez de
  multiplicarlo.
→ En startups, escalar equipo de ingeniería antes de confirmar que la
  restricción real ya no es de validación de producto ni de distribución.
```

## Novedades 2024-2026

```
→ La adopción de IA generativa en desarrollo de software (copilots,
  agentes de código) está desplazando la restricción interna de muchos
  equipos: si escribir código deja de ser el cuello de botella, la
  restricción se mueve con más frecuencia hacia REVISIÓN, TESTING y
  DESPLIEGUE — discusión activa en comunidades DevOps 2025-2026 sobre
  cómo re-diagnosticar el "Brent" del equipo en este nuevo contexto.
→ Marcos de "flow engineering" y métricas DORA (deployment frequency,
  lead time for changes, MTTR) se citan cada vez más junto a vocabulario
  TOC explícito en literatura de ingeniería de plataforma (platform
  engineering) 2024-2025, como forma de operacionalizar el diagnóstico
  de restricciones en el ciclo de entrega de software.
```

Ver: [[Cadena Crítica — CCPM y buffers de proyecto]] · [[TOC frente a Lean y Six Sigma — integración y diferencias]].
