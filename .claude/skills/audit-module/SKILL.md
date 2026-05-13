---
name: audit-module
description: Auditoría operativa completa de un módulo del sistema (recetas, escandallo, viabilidad, cartadigital, etc.) en 3 tiradas separadas — exhaustiva de tools, exhaustiva de agentes con triangulación, y mixta natural de uso real — más una recapitulación que cruza los hallazgos de las 3. Cada tirada mide una dimensión del subsistema. La recapitulación clasifica findings según dónde aparecen (solo aislada, solo mixta, o ambas) y eso indica si el problema es del componente o de la orquestación.
when-to-use: Validar un módulo end-to-end de forma exhaustiva y sin sesgos. Útil tras cambios de prompt/código/agentes, antes de mergear, para localizar si un problema es del componente (tool/agente) o de la orquestación (LLM principal eligiendo mal), o para comparar baseline antes/después de optimizaciones.
---

# audit-module

3 tiradas separadas + recapitulación. Claude conduce cada tirada con un propósito acotado, evita mezclar dimensiones, y al final cruza los hallazgos para distinguir entre problemas de componente y problemas de orquestación.

## Filosofía

- **Cada tirada mide UNA dimensión.** No mezclar tools, agentes y comportamiento natural en una sola pasada — confunde el diagnóstico.
- **Triangulación dentro de cada tirada** (especialmente agentes): 2-3 ejecuciones distintas para distinguir bug real de variabilidad.
- **La mixta es el banco de pruebas integral.** Refleja el uso real. Lo que falla SOLO en mixta es problema de orquestación; lo que falla en ambas es problema del componente.
- **La recapitulación es donde se generan los findings.** Las 3 tiradas son insumos; el reporte final cruza los datos y clasifica por tipo de problema.

## Las 3 tiradas

### Tirada A — Tools del módulo
**Propósito**: verificar que cada tool del módulo funciona y que el LLM principal lo invoca correctamente desde el chat.

- 1 conversación de chat con `page_id=<modulo>`.
- 5-8 mensajes diseñados para ejercitar **todos los tools del módulo** (lectura → mutación → análisis → reversión).
- Cobertura objetivo: ≥80% de los tools.
- Salida: `audit/<modulo>-<TS>/tirada-A-tools/chat-export.json` + análisis por tool.

### Tirada B — Agentes del scope
**Propósito**: verificar que cada agente con `scope:[<modulo>]` funciona aisladamente y de forma consistente.

- 1 conversación POR AGENTE del scope (no obsoleto).
- 2-3 tasks distintas por agente (triangulación).
- Invocación forzada vía `agent.execute.request` (no chat).
- Salida: `audit/<modulo>-<TS>/tirada-B-agentes/<agente>-t{1,2,3}.json`.
- Comparativa T1/T2/T3 por agente: ¿tools consistentes? ¿latencias estables? ¿comportamiento adaptativo o errático?

### Tirada C — Mixta (uso real)
**Propósito**: verificar la orquestación del LLM principal en una sesión natural. El LLM decide solo qué tool/agente usar para cada tarea.

- 1 conversación de chat **larga** (10-15 mensajes) con `page_id=<modulo>`.
- Mensajes en lenguaje natural de un usuario que **no sabe** qué tools/agentes existen. Solo pide cosas del dominio.
- Encadenamiento realista: explora estado → crea algo → modifica → analiza → consulta especialista → decide.
- Salida: `audit/<modulo>-<TS>/tirada-C-mixta/chat-export.json` + análisis del flujo.

## Fase final — Recapitulación

Cruza las 3 tiradas y clasifica findings:

| Aparece en | Tipo de problema | Acción |
|---|---|---|
| Solo Tirada A | Tool del módulo | Revisar handler del tool |
| Solo Tirada B | Agente | Revisar prompt/scope del agente |
| Solo Tirada C | Orquestación del LLM principal | Revisar base prompt / context del módulo / catálogo |
| A + C | Tool roto, confirmado en uso real | Fix urgente |
| B + C | Agente roto, confirmado en uso real | Fix urgente |
| A + B + C | Problema sistémico | Revisar contrato/arquitectura |

La recapitulación produce `audit/<modulo>-<TS>/recapitulacion.md` con:
- Tabla cruzada de findings
- Patrones que **solo emergen** al ver las 3 tiradas juntas
- Decisiones recomendadas con su nivel de confianza

## Flujo

### Fase 1 — Comprender el módulo (sin cambios)

Leo `module.json`, `prompt.json`, `context.json`. Identifico agentes con `scope:[<modulo>]` no obsoletos.

### Fase 2 — Las 3 tiradas (en este orden)

**Orden importa**: A primero (cobertura básica), B después (componentes aislados), C al final (integración). La mixta puede revelar interacciones que no se ven en las aisladas.

```bash
# Tirada A
CONV_A=$(node scripts/audit-helpers/create-conversation.js Paco "audit-<modulo>-tools")
node scripts/audit-helpers/send-message.js ... # 5-8 mensajes
node scripts/audit-helpers/fetch-export.js "$CONV_A" ... audit/<modulo>-<TS>/tirada-A-tools/chat-export.json

# Tirada B (por cada agente del scope, 2-3 tasks)
for AGENT in agente1 agente2 ...; do
  for T in T1 T2 T3; do
    CONV=$(node scripts/audit-helpers/create-conversation.js Paco "audit-<modulo>-<agente>-<T>")
    node scripts/audit-helpers/force-agent.js ... "task de la perspectiva T"
    node scripts/audit-helpers/fetch-export.js "$CONV" ... audit/<modulo>-<TS>/tirada-B-agentes/$AGENT-$T.json
  done
done

# Tirada C
CONV_C=$(node scripts/audit-helpers/create-conversation.js Paco "audit-<modulo>-mixta")
node scripts/audit-helpers/send-message.js ... # 10-15 mensajes naturales
node scripts/audit-helpers/fetch-export.js "$CONV_C" ... audit/<modulo>-<TS>/tirada-C-mixta/chat-export.json
```

### Fase 3 — Recapitulación

Leo los exports de las 3 tiradas y produzco `recapitulacion.md`:

1. **Matriz de findings**: para cada problema detectado, en qué tiradas aparece.
2. **Patrones de orquestación**: ¿el LLM en C usa los mismos tools/agentes que funcionaron en A/B? ¿Delega cuando debe? ¿Se queda con tools cuando tiene un agente especialista a mano?
3. **Sugerencias clasificadas** por tipo de problema (componente vs orquestación).
4. **Decisiones recomendadas** con nivel de confianza (basado en triangulación y consistencia entre tiradas).

## Helpers atómicos

| Archivo | Función |
|---|---|
| `list-conversations.js <project> [limit]` | Lista conv recientes |
| `create-conversation.js <project> [title]` | Crea conv, imprime id |
| `send-message.js <proj> <conv> <page> "msg"` | Envía + espera + META |
| `force-agent.js <proj> <conv> <agent> "task"` | Fuerza agent.execute.request |
| `fetch-export.js <conv> <proj> [out.json]` | Descarga export |

## Output

```
audit/<modulo>-<TS>/
  ficha.md
  tirada-A-tools/
    guion.md
    chat-export.json
    analisis.md
  tirada-B-agentes/
    guion.md
    <agente-1>-t1.json
    <agente-1>-t2.json
    <agente-2>-t1.json
    ...
    analisis.md
  tirada-C-mixta/
    guion.md
    chat-export.json
    analisis.md
  recapitulacion.md
```

## Cuándo usar

- Tras cambios en prompt/context/código/agentes del módulo.
- Antes de mergear PR que toca el subsistema chat/agentes.
- Para baseline antes/después de optimizaciones.
- Cuando un usuario reporta "no funciona bien": localiza si es del LLM (mixta), del tool (A), del agente (B), o de todos.

## Lo que NO es

- **NO es test unitario.**
- **NO es benchmark de performance.**
- **NO es auto-pilot.** Claude conduce con criterio adaptado al módulo.
