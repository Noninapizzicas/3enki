---
name: audit-module
description: Auditoría operativa completa de un módulo del sistema (recetas, escandallo, viabilidad, cartadigital, etc.) cubriendo 4 dimensiones — tools directos del módulo via chat, delegación natural a agentes del scope del módulo, invocación forzada de cada agente individualmente, y coherencia del LLM con el propósito declarado del módulo. Claude conduce la conversación, fuerza los agentes, lee los exports y produce reporte cualitativo con findings, patrones y sugerencias accionables.
when-to-use: Validar un módulo end-to-end tras un cambio de prompt/código/agentes, comparar comportamiento entre dos sesiones, detectar regresiones (alucinación, routing subóptimo, agentes caídos), o medir alineación del LLM con el dominio declarado del módulo. Es la herramienta canónica antes de mergear cambios que tocan el subsistema chat/agentes.
---

# audit-module

El skill es **un patrón que Claude aplica** combinando 4 capas concéntricas de comprobación. Claude conduce, los helpers son atómicos, el reporte es narrativo con juicio.

## Filosofía

- **Yo (Claude) soy el cerebro.** El sistema ya guarda los datos (mensajes, `metadata.tool_calls`, activity buffer, agent.execute.*); yo conduzco el flujo y aporto el análisis cualitativo.
- **Conversación reactiva, no script rígido.** Decido cada mensaje según la respuesta anterior. Si el LLM resuelve sin tools cuando esperaba que delegara, lo registro como finding.
- **4 capas de comprobación** que cubren tools + agentes + propósito.
- **Reporte narrativo, no métricas mecánicas.** Findings con severidad, patrones observados, sugerencias accionables.

## Las 4 capas del audit

### Tier A — Tools directos via chat
**Qué prueba**: que el LLM principal en `page=<modulo>` rutea correctamente a los tools nativos del módulo.

4-5 mensajes en lenguaje natural que un usuario haría, encadenados lógicamente:
- 1 de lectura combinada (estadísticas + listado + estado)
- 1 de investigación/proposición (`investigar*` + propuesta del LLM)
- 1 de creación rica (datos completos, no mínimos)
- 1 de análisis cruzado (combinar lecturas para análisis)
- 1 de modificación con verificación (mutación + leer historial)

### Tier B — Delegación natural a agentes
**Qué prueba**: que el LLM, cuando le pides algo complejo o especializado, **delega al agente apropiado** vía `invoke_agent` en lugar de resolver con tools propios.

2-3 mensajes deliberadamente complejos que invitan a delegar:
- "Investiga 3 variantes auténticas de [receta] con técnica distintiva" → debería ir a `recipe-researcher`
- "Completa los datos faltantes de [receta incompleta]" → `recipe-completer`
- "Dame un análisis profesional de costes y márgenes" → cadena `escandallo-*` / `recipe-chef-advisor`

**Finding clave**: si el LLM resuelve con tools propios en lugar de delegar, es routing subóptimo. Puede ser:
- Descripción del agente poco visible al LLM
- LLM optimizando coste de tokens (no delega para ahorrar roundtrip)
- Agente innecesario (el tool propio basta)

### Tier C — Invocación forzada de cada agente del scope
**Qué prueba**: cada agente del scope del módulo funciona aisladamente.

Para cada agent.json con `scope: [<modulo>]`:
1. Lanzo `agent.execute.request` directo con **2-3 tasks distintas** (principio de triangulación).
2. Capturo `agent.execute.response` o `agent.execute.failed` por cada task.
3. Verifico que las tarjetas (`chat.assistant.saved`) se persisten correctamente.
4. **Comparo el comportamiento entre las 2-3 ejecuciones**: ¿usa las mismas tools? ¿latencias estables? ¿calidad consistente?

Es el equivalente a "smoke test" del subsistema agente para este módulo. La triangulación distingue:
- **Finding confirmado** (el comportamiento se repite en 2+ ejecuciones): vale la pena accionar.
- **Observación** (solo aparece en 1 ejecución de 3): puede ser transitorio, no concluyente.
- **Comportamiento adaptativo** (cambia según task): el agente ajusta su estrategia — no es bug.

### Tier D — Coherencia con propósito declarado
**Qué prueba**: que el LLM razona dentro del dominio del módulo (no se sale al hacer una pregunta ambigua).

1-2 mensajes abiertos que evalúan alineación con el `intent`/`role` del `prompt.json` del módulo:
- "Ayúdame a mejorar mi negocio" en `page=recetas` → debería responder con vocabulario del dominio (costes, food cost, recetas), no marketing genérico.
- "¿Qué me recomiendas hacer ahora?" → debería proponer acciones del dominio (catalogar ingredientes, analizar costes), no acciones genéricas.

## Flujo paso a paso

### 1. Comprender el módulo

```bash
# Yo leo:
cat modules/<modulo>/module.json | python3 -m json.tool
cat modules/<modulo>/prompt.json
cat modules/<modulo>/context.json
```

Extraigo:
- Tools (qué hace cada uno)
- Role + Intent (propósito declarado)
- Reglas del context
- Dependencias con otros módulos (subscribes a prefijos ajenos)

```bash
# Agentes del scope del módulo:
python3 -c "
import os, json
for f in sorted(os.listdir('modules/conversacion/ai-agent-framework/agents')):
    if not f.endswith('.json'): continue
    a = json.load(open('modules/conversacion/ai-agent-framework/agents/'+f))
    if '<modulo>' in (a.get('scope') or []): print(a.get('name'), '-', (a.get('description','') or '')[:80])
"
```

### 2. Diseñar guión multi-tier

Lo guardo en `audit/<modulo>-<TS>/guion.md`:

```markdown
# Guión audit <modulo>

## Tier A — Tools directos (5 mensajes)
1. ...
2. ...

## Tier B — Delegación natural a agentes (2-3 mensajes)
1. ... (esperado: invoke_agent → <nombre_agente>)
2. ...

## Tier C — Agentes forzados (uno por cada del scope)
- <agente-1>: task = "..."
- <agente-2>: task = "..."

## Tier D — Coherencia con propósito (1-2 mensajes)
1. ...
```

### 3. Ejecutar Tier A + B + D en una conversación de chat

```bash
PROJECT=$(echo Paco)  # o UUID
CONV=$(node scripts/audit-helpers/create-conversation.js "$PROJECT" "audit-<modulo>")

# Por cada mensaje del guion A/B/D:
node scripts/audit-helpers/send-message.js "$PROJECT" "$CONV" "<modulo>" "mensaje aquí"
# Leo respuesta, decido siguiente
```

### 4. Ejecutar Tier C — cada agente forzado

```bash
# Para cada agente del scope, una conversación nueva (limpia):
CONV_AGENT=$(node scripts/audit-helpers/create-conversation.js "$PROJECT" "audit-agent-<nombre>")
node scripts/audit-helpers/force-agent.js "$PROJECT" "$CONV_AGENT" "<nombre-agente>" "task de prueba"
```

### 5. Exportar todas las conversaciones

```bash
node scripts/audit-helpers/fetch-export.js "$CONV" "$PROJECT" audit/<modulo>-<TS>/chat-export.json
mkdir audit/<modulo>-<TS>/agents
for agent in ...; do
  node scripts/audit-helpers/fetch-export.js "$CONV_$agent" "$PROJECT" audit/<modulo>-<TS>/agents/$agent.json
done
```

### 6. Reporte cualitativo

Escribo `audit/<modulo>-<TS>/reporte.md` con secciones:

```markdown
# Audit <modulo> — <fecha>

## Resumen ejecutivo
Veredicto en 2 líneas + métricas clave.

## Tier A — Tools directos
- Cobertura tools: M/N
- Hit rate routing: X/M (¿el LLM usó el tool esperado?)
- Findings

## Tier B — Delegación natural a agentes
- Mensajes que invitaban a delegar: M
- Mensajes donde el LLM delegó: K
- Donde NO delegó pero resolvió con tools propios: M-K (analizar por qué)

## Tier C — Salud de agentes del scope
Por cada agente:
- ¿Completa o falla?
- Tools internos usados
- Latencia
- Tarjetas persistidas (open + closed)

## Tier D — Coherencia con propósito
- Vocabulario del dominio sí/no, ejemplos
- Pasos próximos propuestos pertenecen al dominio sí/no
- ¿Confunde con dominios ajenos?

## Patrones observados
Cosas no-obvias detectadas al leer los exports.

## Sugerencias accionables
Cambios concretos al prompt / context / código / agentes.

## Estado del proyecto tras el audit
Limpiezas necesarias, datos persistidos.
```

## Helpers atómicos

| Archivo | Función |
|---|---|
| `list-conversations.js <project> [limit]` | Lista conv recientes |
| `create-conversation.js <project> [title]` | Crea conv, imprime id |
| `send-message.js <proj> <conv> <page> "msg"` | Envía msg + espera respuesta + META |
| `force-agent.js <proj> <conv> <agent> "task"` | Fuerza `agent.execute.request` + espera response |
| `fetch-export.js <conv> <proj> [out.json]` | Descarga export |

Cada helper < 70 líneas. Yo los compongo paso a paso.

## Output típico

```
audit/<modulo>-<TS>/
  guion.md                  guión multi-tier diseñado
  chat-export.json          conv del chat (tier A + B + D)
  agents/
    <agente-1>.json         conv forzada del agente 1 (tier C)
    <agente-2>.json
    ...
  reporte.md                análisis cualitativo
```

## Cuándo usar este skill

- **Tras cambiar prompt/context/código** de un módulo o de sus agentes asociados.
- **Antes de mergear** un cambio que toca el subsistema chat/agentes.
- **Cuando un usuario reporta "no funciona bien"** — localiza si es del LLM (routing/calidad), del módulo (tools rotos), de los agentes (falla individual), o del prompt (sale del dominio).
- **Para medir efecto de un cambio**: dos audits antes/después, comparar findings.

## Lo que NO es

- **NO es test unitario** — los módulos ya tienen `tests/unit/`.
- **NO es benchmark** — no mide ops/seg.
- **NO es auto-pilot** — guión y análisis los hace Claude con criterio.
- **NO sustituye al observador humano** — el reporte se LEE, no se ejecuta.
