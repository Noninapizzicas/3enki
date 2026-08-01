---
name: idea-to-ship
description: Pipeline de ingeniería de producto idea→ship en 5 fases (entrevista → spec → tickets → implementar → review). Patrones destilados de aihero.dev/skills (Matt Pocock). Usar como referencia cuando se planifica un feature, se descompone trabajo en tickets, o se necesita disciplina de proceso. No ejecuta — enseña los patrones.
fuente: aihero
url: https://www.aihero.dev/skills
---

# Idea → Ship — pipeline de ingeniería de producto

Referencia de proceso que cubre las 5 fases desde una idea vaga hasta código entregado. Cada fase tiene un patrón concreto y una disciplina que la sostiene.

## La espina

```
entrevistar → especificar → descomponer → implementar → revisar
(grill)       (to-spec)     (to-tickets)   (tdd)         (review)
```

Cada fase consume el artefacto de la anterior. No se salta — si la entrevista no cristalizó, la spec sale hueca; si la spec no existe, los tickets son horizontales en vez de verticales.

---

## Fase 1 — Entrevistar (grill)

Entrevista estructurada sobre un plan o diseño. El objetivo es resolver el árbol de decisiones ANTES de escribir código.

**Patrón: una pregunta a la vez.**

```
1. Hacer UNA pregunta concreta (no un cuestionario).
2. Ofrecer una respuesta recomendada basada en lo que ya se sabe (código, contexto, conversación).
3. Esperar feedback del humano antes de seguir.
4. Repetir hasta que el árbol de decisiones esté resuelto.
```

**Disciplinas:**
- Cuando la respuesta ya existe en el código, inspeccionarlo en vez de preguntar.
- Generar artefactos perezosamente — nada existe hasta que un término o decisión cristaliza.
- Dos artefactos posibles:
  - **Glosario** (CONTEXT.md): terminología resuelta en el vocabulario del proyecto.
  - **ADR** (Architecture Decision Record): solo para decisiones genuinamente difíciles y difíciles de revertir. Raras, no comunes.

**Cuándo usarlo:** antes de pedir implementación, cuando hay decisiones interdependientes, cuando necesitas que te empujen en vez de que te den la razón.

---

## Fase 2 — Especificar (to-spec)

Sintetizar la conversación en un documento de especificación. NO vuelve a entrevistar — cristaliza el alineamiento que ya se alcanzó.

**Contenido de la spec:**
1. Declaración del problema (en vocabulario del proyecto).
2. Forma de la solución a alto nivel.
3. Historias de usuario numeradas con comportamientos verificables.
4. Decisiones de implementación ya resueltas.
5. Costuras de testing (seams) — preferir las existentes.
6. Lo que queda fuera de alcance (explícito).

**Disciplina:** la spec usa el lenguaje de dominio real del proyecto, no plantillas genéricas. Si el alineamiento no está completo, volver a la fase 1.

---

## Fase 3 — Descomponer en tickets (to-tickets)

Transformar la spec en tickets de implementación. El patrón central es el **tracer bullet**.

**Patrón: corte vertical, no horizontal.**

```
MAL  (horizontal):  "ticket 1: base de datos" → "ticket 2: API" → "ticket 3: UI"
BIEN (vertical):    "ticket 1: un flujo completo end-to-end, fino" → luego ampliar
```

Cada ticket es un corte fino que atraviesa TODAS las capas de integración. Al completarlo, se puede hacer demo o verificar inmediatamente.

**Grafo de bloqueo:** los tickets declaran explícitamente qué bloquea a qué. Esto habilita dos modos:
- Secuencial: ejecutar uno a uno en orden.
- Paralelo: ejecutar todos los tickets cuyas dependencias ya están resueltas (frontera).

**Disciplina:** antes de descomponer, buscar oportunidades de refactoring. Preguntar sobre granularidad, dependencias y organización antes de publicar.

---

## Fase 4 — Implementar (tdd)

Test-Driven Development con loop red-green. Un test a la vez, no todos de golpe.

**Patrón: red → green → repeat.**

```
1. Escribir UN test que falle (RED).
2. Escribir el código MÍNIMO para que pase (GREEN).
3. ¿Todos los tests pasan? → refactorizar si hace falta.
4. Volver a 1 con el siguiente comportamiento.
```

El primer ciclo es el **tracer bullet del test**: probar un camino end-to-end completo antes de expandir hacia los bordes.

**Disciplinas críticas:**

- **Anti-test-tautológico:** el valor esperado NUNCA se recomputa usando la lógica del propio código bajo test. Viene de una fuente de verdad independiente (spec, literal, ejemplo trabajado a mano). Un test que recalcula el expected con la misma fórmula que testea es una tautología — siempre pasa, nunca verifica.

```
MAL:   expect(calcularIVA(100)).toBe(100 * 0.21)     // recomputa la misma fórmula
BIEN:  expect(calcularIVA(100)).toBe(21)               // literal de la spec
```

- **Tests como especificación:** cada test se lee como una frase de la spec. Ejerce código real a través de la API pública, no de internos.
- **Refactorizar solo en verde:** nunca refactorizar mientras hay tests rojos.

---

## Fase 5 — Triage y review

State machine para gestionar issues y PRs con verificación antes de promover.

**Estados de un item:**

```
needs-triage → needs-info → ready-for-agent | ready-for-human | wontfix
```

Cada item lleva exactamente dos etiquetas: categoría (`bug` | `enhancement`) y estado.

**Patrón: verificar antes de promover.**

Antes de mover un item a `ready-for-agent`:
1. Reproducir bugs con los pasos del reporter.
2. Checkout de PRs y correr tests.
3. Comprobar redundancia (¿ya está implementado?).
4. Revisar rechazos previos.

El triage reporta hallazgos y **espera dirección** — no auto-etiqueta.

---

## Resumen de patrones reutilizables

| Patrón | Fase | Esencia |
|---|---|---|
| Una pregunta a la vez | Entrevistar | No cuestionarios; pregunta → respuesta sugerida → feedback → siguiente |
| Artefactos perezosos | Entrevistar | Nada existe hasta que cristaliza (glosario, ADR) |
| Spec sin re-entrevista | Especificar | Sintetizar lo resuelto, no volver a preguntar |
| Tracer bullet | Descomponer | Corte vertical fino end-to-end, no horizontal por capa |
| Grafo de bloqueo | Descomponer | Dependencias explícitas → ejecución secuencial o paralela |
| Red-green | Implementar | Un test, código mínimo, repetir |
| Anti-tautología | Implementar | El expected viene de fuente independiente, nunca de la lógica bajo test |
| Verificar antes de promover | Triage | Reproducir, testear, comprobar redundancia ANTES de etiquetar ready |
