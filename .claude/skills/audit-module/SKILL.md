---
name: audit-module
description: Auditoría operativa completa de un módulo del sistema (recetas, escandallo, viabilidad, cartadigital, menu-generator, etc.) en 3 tiradas separadas — exhaustiva de tools, exhaustiva de agentes con triangulación, y mixta natural de uso real — más una recapitulación que cruza los hallazgos de las 3. Cada tirada mide una dimensión del subsistema. La recapitulación clasifica findings según dónde aparecen (solo aislada, solo mixta, o ambas) y eso indica si el problema es del componente o de la orquestación. v6 añade contrato estructural — schema de finding, métricas obligatorias y plantilla canónica de Tirada C — para que los audits de módulos distintos sean comparables entre sí y permitan rollup cross-módulo.
when-to-use: Validar un módulo end-to-end de forma exhaustiva y sin sesgos. Útil tras cambios de prompt/código/agentes, antes de mergear, para localizar si un problema es del componente (tool/agente) o de la orquestación (LLM principal eligiendo mal), o para comparar baseline antes/después de optimizaciones. Cuando se aplica a >1 módulo, los outputs son agregables vía rollup.
---

# audit-module

3 tiradas separadas + recapitulación. Claude conduce cada tirada con un propósito acotado, evita mezclar dimensiones, y al final cruza los hallazgos para distinguir entre problemas de componente y problemas de orquestación.

## Filosofía

- **Cada tirada mide UNA dimensión.** No mezclar tools, agentes y comportamiento natural en una sola pasada — confunde el diagnóstico.
- **Triangulación dentro de cada tirada** (especialmente agentes): 2-3 ejecuciones distintas para distinguir bug real de variabilidad.
- **La mixta es el banco de pruebas integral.** Refleja el uso real. Lo que falla SOLO en mixta es problema de orquestación; lo que falla en ambas es problema del componente.
- **La recapitulación es donde se generan los findings.** Las 3 tiradas son insumos; el reporte final cruza los datos y clasifica por tipo de problema.
- **El contrato estructural manda (v6).** Schema de finding y métricas obligatorias garantizan que el audit de recetas y el de menu-generator son comparables al cierre.

## Las 3 tiradas

### Tirada A — Tools del módulo
**Propósito**: verificar que cada tool del módulo funciona y que el LLM principal lo invoca correctamente desde el chat.

- 1 conversación de chat con `page_id=<modulo>`.
- 5-8 mensajes diseñados para ejercitar **todos los tools del módulo** (lectura → mutación → análisis → reversión).
- Cobertura objetivo: ≥80% de los tools.
- Salida: `audit/<modulo>-<provider>-<TS>/tirada-A-tools/chat-export.json` + análisis por tool.

### Tirada B — Agentes del scope
**Propósito**: verificar que cada agente con `scope:[<modulo>]` funciona aisladamente y de forma consistente.

- 1 conversación POR AGENTE del scope (no obsoleto).
- 2-3 tasks distintas por agente (triangulación).
- Invocación forzada vía `agent.execute.request` (no chat).
- Salida: `audit/<modulo>-<provider>-<TS>/tirada-B-agentes/<agente>-t{1,2,3}.json`.
- Comparativa T1/T2/T3 por agente: ¿tools consistentes? ¿latencias estables? ¿comportamiento adaptativo o errático?

### Tirada C — Mixta (uso real) — **plantilla canónica v6**
**Propósito**: verificar la orquestación del LLM principal en una sesión natural. El LLM decide solo qué tool/agente usar para cada tarea.

- 1 conversación de chat con `page_id=<modulo>`.
- **8 mensajes** distribuidos en 4 patrones semánticos (2 cada uno) — fija la comparabilidad cross-módulo:

| Patrón | Cuántos | Qué mide | Ejemplo template |
|---|---|---|---|
| **ABIERTO** (sin dominio) | 2 | ¿Abre 3 ángulos en lugar de ejecutar? | "No sé qué X esta semana, dame ideas" |
| **CERRADO** (lectura/conteo trivial) | 2 | ¿Ejecuta directo con tool, sin proponer? | "Listame mis X" / "Cuántos X tengo" |
| **ABIERTO+dominio** (requiere especialista) | 2 | ¿Delega via invoke_agent? | "Proponme X" / "Investiga X" |
| **CERRADO+experticia** (requiere juicio profesional) | 2 | ¿Delega + ejecuta? | "¿Es viable...?" / "Revisa críticamente..." |

Adapta el verbo y el sustantivo al dominio del módulo, mantén los 4×2 patrones siempre.

- Salida: `audit/<modulo>-<provider>-<TS>/tirada-C-mixta/chat-export.json`.

## Schema canónico de finding (v6)

Cada finding en la recapitulación se redacta con esta estructura mínima:

```yaml
id: F<n>           # F1, F2, ... numerado por audit
title: <una frase>  # qué pasa
severity: alta | media | baja | info
appears_in: [A] | [B] | [C] | [A,C] | [B,C] | [A,B,C]
type: tool | agente | catalogo | orquestacion | sistema   # derivado de appears_in via tabla
confidence: confirmado | observacion | hipotesis           # ver rubrica abajo
evidence: <2-3 líneas con cita verbatim del export o tools>
action: <accion concreta accionable, no genérica>
```

Severidad — rubric calibrado:

| Nivel | Criterio |
|---|---|
| **alta** | Bloquea uso real del módulo o produce datos incorrectos al usuario |
| **media** | Degrada UX o calidad notablemente, pero hay workaround |
| **baja** | Mejora menor o cosmética |
| **info** | Observación documental, sin acción inmediata |

Confidence — rubric:

| Nivel | Criterio |
|---|---|
| **confirmado** | Reproducido ≥2 veces (triangulación) o hallazgo determinista en código |
| **observacion** | Aparece 1 vez, no triangulado |
| **hipotesis** | Inferencia razonada sin evidencia directa |

Tabla de derivación type ← appears_in (no cambiar):

| appears_in | type | acción canónica |
|---|---|---|
| solo A | tool | revisar handler del tool |
| solo B | agente | revisar prompt/scope del agente |
| solo C | orquestacion | revisar base prompt / context / catálogo de tools+agentes |
| A + C | tool roto en uso real | fix urgente |
| B + C | agente roto en uso real | fix urgente |
| A + B + C | sistema | revisar contrato/arquitectura |

## Métricas obligatorias por audit (v6)

`metrics.json` se produce junto a `recapitulacion.md` con estos campos:

```yaml
modulo: <slug>
provider: <name>
model: <id>
config_extras: { thinking?: enabled|disabled, cache?: bool }
audit_started_at: <ISO>
audit_finished_at: <ISO>

tool_coverage_pct: <int 0-100>
  # Tools del módulo invocados al menos 1 vez en Tirada A / total tools del módulo
delegation_hit_rate: <int 0-100>
  # invoke_agent llamadas correctamente / oportunidades de delegación esperadas en Tirada C
mutation_success_rate: <int 0-100>
  # Mutaciones cerradas ejecutadas con tool real / total mutaciones cerradas pedidas
agent_completion_rate: <int 0-100>
  # Agentes que completaron agent.execute.response / total invocados en Tirada B

latency_avg_ms: <int>
  # Promedio sobre todos los mensajes/agentes
cost_usd_estimate: <float>
  # Sumar coste de los 3 tiradas si el provider lo expone en usage

findings_count:
  alta: <int>
  media: <int>
  baja: <int>
  info: <int>

provider_specifics:
  cache_hit_rate: <int 0-100>     # cuando aplique (Anthropic, Kimi)
  thinking_enabled: <bool>
  agentic_iterations_avg: <float>
```

Esto permite rollup `audit/_rollup-<TS>.md` que compara módulos en una tabla.

## Fase final — Recapitulación

Cruza las 3 tiradas y produce:

1. `recapitulacion.md` con:
   - Tabla cruzada de findings (matriz appears_in)
   - Patrones que solo emergen al ver las 3 tiradas juntas
   - Decisiones recomendadas con confidence
2. `findings.yaml` con la lista estructurada según el schema arriba
3. `metrics.json` con las métricas obligatorias

Sin estos 3 outputs el audit no se considera cerrado.

## Flujo

### Fase 1 — Comprender el módulo (sin cambios)

Leo `module.json`, `prompt.json`, `context.json`. Identifico agentes con `scope:[<modulo>]` no obsoletos. Registro provider+model+config en `metrics.json` desde el inicio.

### Fase 2 — Las 3 tiradas (en este orden)

**Orden importa**: A primero (cobertura básica), B después (componentes aislados), C al final (integración). La mixta puede revelar interacciones que no se ven en las aisladas.

```bash
# Tirada A
CONV_A=$(node scripts/audit-helpers/create-conversation.js <project_uuid> "audit-<modulo>-tools")
node scripts/audit-helpers/send-message.js <project_uuid> $CONV_A <modulo> "msg" \
  --provider <name> --model <id> [--thinking enabled|disabled]
# 5-8 mensajes
node scripts/audit-helpers/fetch-export.js "$CONV_A" <project_uuid> \
  audit/<modulo>-<provider>-<TS>/tirada-A-tools/chat-export.json

# Tirada B (por cada agente del scope, 2-3 tasks)
for AGENT in agente1 agente2 ...; do
  for T in T1 T2 T3; do
    CONV=$(node scripts/audit-helpers/create-conversation.js <project_uuid> "audit-<modulo>-<agente>-<T>")
    node scripts/audit-helpers/force-agent.js <project_uuid> $CONV <agente> "task" \
      --provider <name> --model <id>
    node scripts/audit-helpers/fetch-export.js "$CONV" <project_uuid> \
      audit/<modulo>-<provider>-<TS>/tirada-B-agentes/$AGENT-$T.json
  done
done

# Tirada C (8 mensajes según plantilla canonica de 4×2 patrones)
CONV_C=$(node scripts/audit-helpers/create-conversation.js <project_uuid> "audit-<modulo>-mixta")
node scripts/audit-helpers/send-message.js <project_uuid> $CONV_C <modulo> "msg" \
  --provider <name> --model <id>
# 8 mensajes
node scripts/audit-helpers/fetch-export.js "$CONV_C" <project_uuid> \
  audit/<modulo>-<provider>-<TS>/tirada-C-mixta/chat-export.json
```

### Fase 3 — Recapitulación + métricas + findings estructurados

1. Leo los 3 exports.
2. Identifico findings, los redacto según el schema (id, title, severity, appears_in, type, confidence, evidence, action).
3. Calculo las métricas observables (cobertura, hit rate, latencia, coste, etc.).
4. Produzco los 3 outputs: `recapitulacion.md` (humano), `findings.yaml` (machine), `metrics.json` (rollup).

### Fase 4 — Rollup cross-módulo (cuando aplica)

Cuando el audit se aplica a 2+ módulos, el último audit produce `audit/_rollup-<TS>.md`:
- Tabla con módulos × métricas observables
- Findings comunes a varios módulos (= problema sistémico)
- Findings exclusivos por módulo (= problema local)

## Helpers atómicos

| Archivo | Función |
|---|---|
| `list-conversations.js <project> [limit]` | Lista conv recientes |
| `create-conversation.js <project> [title]` | Crea conv, imprime id |
| `send-message.js <proj_uuid> <conv> <page> "msg" [wait_ms] [--provider X] [--model Y] [--thinking enabled\|disabled]` | Envía + espera + META |
| `force-agent.js <proj_uuid> <conv> <agent> "task" [wait_ms] [--provider X] [--model Y]` | Fuerza agent.execute.request |
| `fetch-export.js <conv> <proj_uuid> [out.json]` | Descarga export |

NOTA: helpers exigen `project_uuid`, no nombre. Resolver previamente con `list-conversations` si solo conoces el nombre.

## Output

```
audit/<modulo>-<provider>-<TS>/
  ficha.md                           # Fase 1: módulo, agentes, provider+config
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
  recapitulacion.md                  # narrativa para humano
  findings.yaml                      # estructurado para machine/rollup
  metrics.json                       # observables canónicas
```

Cuando se han auditado 2+ módulos:
```
audit/_rollup-<TS>.md                # comparativa cross-módulo
```

## Cuándo usar

- Tras cambios en prompt/context/código/agentes del módulo.
- Antes de mergear PR que toca el subsistema chat/agentes.
- Para baseline antes/después de optimizaciones (provider, prompt, catálogo).
- Cuando un usuario reporta "no funciona bien": localiza si es del LLM (mixta), del tool (A), del agente (B), o de todos.
- Para comparar **providers** sobre el mismo módulo (auditar el mismo módulo con distintos `--provider` y leer las métricas).

## Lo que NO es

- **NO es test unitario.**
- **NO es benchmark de performance.**
- **NO es auto-pilot.** Claude conduce con criterio adaptado al módulo, pero respetando el contrato estructural (schema + métricas + plantilla Tirada C).
