---
name: agentic-engineering
description: Operar como ingeniero agéntico — eval-first con deltas, descomposición en unidades verificables, y routing de modelo por complejidad
fuente: ECC
dominio: agentes
tags: [eval, descomposicion, routing, coste, disciplina]
---

# Agentic Engineering

Prescribe prácticas medibles, no principios aspiracionales.

## Cuándo usar
Al construir o refinar cualquier flujo agéntico (blueprints que dan forma, loops,
agentes que delegan). El objetivo: que el agente no pueda mentir "lo hice".

## Mecanismo

**Eval-first con deltas (el patrón primario)**
Invierte el flujo típico: la evaluación es la puerta, no el adorno.
1. Define **eval de capacidad** + **eval de regresión**.
2. Corre baseline y captura la **firma de fallo** (qué falla, cómo).
3. Implementa.
4. Re-corre las evals y **compara deltas** (no solo pasa/falla — cuánto mejoró/rompió).

**Descomposición — regla de la unidad de 15 min**
Cada unidad de trabajo cumple TRES criterios: verificable de forma independiente ·
un solo riesgo dominante · condición de "hecho" clara. Incrementos atómicos y testeables.

**Routing de modelo por complejidad**
Asigna el modelo a la dificultad de la tarea, no por defecto:
- barato/rápido → clasificar, transformar boilerplate, ediciones estrechas
- medio → implementar, refactorizar
- caro → arquitectura, análisis de causa raíz, invariantes multi-fichero

Escala de tier SOLO cuando el inferior falla con un hueco de razonamiento claro.

## Anti-patrones
- No gastes ciclos de review en estilo si el linter ya lo fuerza. Revisa **invariantes,
  edge-cases, fronteras de error, supuestos de seguridad/auth**.
- Mide por tarea: modelo, estimación de tokens, reintentos, tiempo, éxito/fallo.

## Nota de procedencia / encaje en Enki
Adaptada de ECC (affaan-m/ECC). Dos ideas portables directas:
1. El **routing por complejidad** — Enki enruta por prioridad de provider, no por peso
   de la tarea. Con mismo-idioma (deepseek v4-flash/v4-pro) se puede rutar por peso del
   cajón: cajón trivial → v4-flash; cajón de arquitectura → v4-pro.
2. El **eval-con-deltas** afila el freno validate→corregir de blueprint-agentico:
   mide el delta, no solo el pasa/falla.
