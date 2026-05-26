# Principio metodológico — Dolor observable guía el diseño arquitectónico

**Fecha de adopción**: 2026-05-15
**Origen**: conversación de cierre de sesión 2026-05-14/15, tras los audits cross-módulo y la propuesta del catálogo
**Estado**: principio operativo aceptado

## En una frase

**No elegimos un patrón ganador a priori. Construimos un mapa de dolores observables → patrón canónico que los resuelve → orden de adopción según impacto/esfuerzo.**

## Por qué — la trampa contraria

Diseñar de antemano un sistema completo de comunicaciones / persistencia / observabilidad / errores es trampa. Aparece como rigor pero se materializa como:

- Big-design-up-front que envejece mal en la primera necesidad real
- Implementación a medias de la mitad de lo diseñado porque "ya veremos esa parte"
- Reinvención de patrones canónicos sin conocer las soluciones existentes
- Estructura impuesta donde el dolor real no la pedía
- Pérdida de información que solo emerge usando el sistema

El audit-module skill itera del v1 al v7 esta misma sesión ilustra el patrón: cada versión añadió o quitó estructura según el uso real, no según teoría. La v6 con schemas, métricas y rollups obligatorios se sintió poderosa al diseñarla; al ejecutarla apareció sobre-ingeniería que el v7 (1 conversación natural, triage condicional) eliminó.

Si la capa de comunicaciones del sistema se diseña de antemano, queda design abstracto. Si se deja que el dolor la guíe, emerge orgánicamente y cada pieza viene justificada por una necesidad real medida.

## Cómo se aplica — protocolo

1. **Observar dolores reales**, no especulativos. Cada dolor debe ser:
   - Medible (frecuencia, coste, latencia, tokens, etc) o
   - Reproducible (caso concreto donde el comportamiento es incorrecto) o
   - Recurrente (aparece en múltiples lugares de forma consistente)
2. **Mapear cada dolor al patrón canónico** que la comunidad de ingeniería de software ya ha resuelto. Conocer este catálogo previo es responsabilidad del diseño:
   - DDD (aggregates, bounded contexts, domain events, repositories)
   - Sagas / Process Managers
   - CQRS / Event Sourcing
   - Outbox pattern
   - Protocol classes / typed channels
   - Façade / Command / Observer (GoF)
   - Hexagonal Architecture (ports & adapters)
   - Anti-Corruption Layer
3. **Estimar impacto/esfuerzo** del patrón canónico aplicado a este sistema concreto.
4. **Ordenar por ratio impacto/esfuerzo**. Los que más alivien con menos cambio entran antes.
5. **Adoptar de uno en uno** cuando el dolor justifique la inversión. NO adoptar profilácticamente.

## Lo que el principio evita

- Big-design-up-front
- Reinvenciones (DDD, Saga, CQRS, etc, ya existen — usar)
- Estructura especulativa (campos "por si acaso", abstracciones "por si crece")
- Refactor masivos para resolver un dolor pequeño
- Imponer disciplina antes de que sea necesaria

## Lo que el principio requiere

- **Disciplina para observar dolores reales** (no extrapolar)
- **Conocimiento de patrones canónicos** disponibles (literatura clásica: GoF, Evans, Vernon, Fowler, Newman)
- **Coraje para dejar el dolor en lista de espera** cuando no es lo bastante agudo todavía
- **Honestidad para revisar el mapa** — un dolor que era #5 en prioridad puede subir a #1 cuando aparece en producción

## Ejemplo aplicado — mapa al cierre de sesión 2026-05-15

Dolores observados durante audits cross-módulo + uso real (Bocapizzas):

| Dolor observado | Patrón canónico | Impacto | Esfuerzo | Estado |
|---|---|---|---|---|
| 5 implementaciones de request/response duplicadas | Protocol class compartida | medio | 1 día | pendiente |
| LLM hace 43 tool calls bruteforce porque tools son atómicas | Saga / Process Manager + adelgazamiento catálogo | alto | 1 día (fase 1) + 1-2 día/módulo (fase 2) | propuesta escrita |
| escandallo lee JSON vs recetas vive en SQLite — desacoplo de stores | DDD Aggregates + Bounded Contexts | alto | 1 día por aggregate | pendiente |
| errores se enmascaran / pierden shape canónico end-to-end | Capa 1 fix (commit `7246a35`) + base.prompt v2.2 regla | alto | hecho parcial | parcial cerrado |
| state mutations cross-módulo sin garantía de "publiqué Y persistí" | Outbox pattern | medio (no se han observado fallos reales aún) | 1 día | pendiente |
| catálogo de tools sobrecargado de operaciones atómicas | Visibility modifiers OOP — campo `internal: true` | alto | 30 min | fase 1 lista para ejecutar |
| tabla agent_executions huérfana sin writer | Cierre de drift via subscribes canónicos | medio | hecho (commit `0fcf676` + `af86ce0`) | ✅ cerrado |
| metadata de mensajes descartaba payload canónico | Cierre de drift contra chat-flow contract | alto | hecho (commit `0fcf676`) | ✅ cerrado |

Este mapa se actualiza cuando nuevos audits o uso real revelen nuevos dolores. La adopción de cada patrón se decide caso por caso, no se compromete una secuencia.

## Lo que NO es este principio

- **NO es laissez-faire**. La disciplina está en observar dolores rigurosamente y adoptar patrones canónicos completos, no medias soluciones.
- **NO es premature optimization en reverso**. No se trata de no optimizar nunca, sino de optimizar lo que duele de verdad cuando duele.
- **NO es excusa para no leer literatura**. Saber los patrones canónicos disponibles es prerequisito. Sin ese conocimiento previo, el mapa dolor→patrón se hace mal o se reinventa.

## Relación con otros contratos canónicos

- `arquitectura/decisiones/_contratos/extensibilidad-modular.contract.json` — establece QUÉ extensiones son legítimas. Este principio establece CUÁNDO y POR QUÉ se adoptan extensiones específicas.
- `arquitectura/decisiones/_contratos/module-rewrite.contract.json` — establece CÓMO reescribir módulos al canon POC2. Este principio establece CUÁNDO una pieza arquitectónica nueva justifica reescribir.
- `arquitectura/decisiones/_contratos/companero-viaje.contract.json` — establece la visión del producto. Este principio establece la manera de evolucionar la arquitectura hacia esa visión sin big-redesigns.

## Aforismo de referencia

> *"La arquitectura no se diseña — se descubre al usar el sistema."*

Y el corolario que evita la otra trampa:

> *"Pero solo si conoces los patrones canónicos que la comunidad ya ha descubierto antes que tú."*
