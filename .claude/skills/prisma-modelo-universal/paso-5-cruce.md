# Cruce de análisis — prisma-modelo-universal

> Los 3 pasos en una tabla.
> Generado: 2026-07-23

---

## Los 3 análisis

| Análisis | Qué mira | Resultado |
|---|---|---|
| Paso 1 — Diseccionador | El flujo (6 verbos) | 5 DURA, 1 BLANDAS |
| Paso 2 — Prisma | La skill como producto | Arquetipo: pieza |
| Paso 3 — Diseccionador | Los 5 huecos | 2 DURA, 3 BLANDAS |

---

## Cruce: flujo vs huecos

### Lo mecánico del flujo (paso 1) vs lo blando de los huecos (paso 3)

| Verbo del flujo | Forma | Hueco que toca | Forma del hueco |
|---|---|---|---|
| RECIBIR | DURA | — (solo transporte) | — |
| DESCOMPONER | **BLANDAS** | IDENTIDAD + CONTRATO + NO-OBJETIVOS | **BLANDAS** |
| CLASIFICAR | DURA | — (derivado de los huecos) | — |
| VALIDAR | DURA | — (contra reglas) | — |
| GUARDAR | DURA | — (persistencia) | — |
| DERIVAR | DURA | — (cómputo) | — |

Los 3 huecos BLANDAS (IDENTIDAD, CONTRATO, NO-OBJETIVOS) los llena **un solo verbo**: DESCOMPONER. Los 2 huecos DURA (RESTRICCIONES, PREGUNTAS_ABIERTAS) pueden llenarse independientemente.

**Implicación:** todo el juicio del sistema se concentra en una sola pieza. Si esa pieza funciona, el resto encaja solo.

---

## Cruce: arquetipo vs carga de juicio

| Arquetipo | Qué implica | Carga de juicio |
|---|---|---|
| pieza | Skill manufacturada una vez, aplicable N veces | Alta al crearla, baja al usarla |
| servicio | Se aplica cada vez, varía por cliente | Alta cada vez |
| comestible | Incluye fabricación, caducidad, trazabilidad | Alta al crear, media al operar |

El arquetipo `pieza` de prisma-modelo-universal significa que el esfuerzo se concentra en **crear la skill correcta una vez**. Después, cada producto nuevo solo pasa por DESCOMPONER (que es el mismo verbo cada vez).

---

## Cruce: lo que el autoanálisis (paso 2) reveló que los otros no

El paso 2 (prisma sobre prisma) encontró dos carencias que el diseccionador no detectó:

| Carencia | Detectada por |
|---|---|
| Productos híbridos (dos arquetipos) | Prisma (pregunta abierta del contrato) |
| Límite difuso de emergencia de identidad | Prisma (pregunta abierta) |

El diseccionador no las detectó porque son **carencias del modelo**, no del flujo. El método dice "¿cómo se construye?", no "¿qué falta en el diseño?".

---

## Tabla consolidada

| Aspecto | DURA | BLANDAS | Depende de |
|---|---|---|---|
| Flujo completo (6 verbos) | 5 | 1 | Input del producto |
| Huecos del molde (5 huecos) | 2 | 3 | Conocimiento del producto |
| Arquetipo de la skill | — | — | pieza (reutilizable) |
| Carencias del modelo | — | — | Híbridos, límite de emergencia |
