---
name: audit-module
description: Auditar el funcionamiento operativo de un módulo del sistema (recetas, escandallo, viabilidad, cartadigital, etc.) tal como lo experimenta un usuario real. NO es un test unitario — es una sesión de chat reactiva contra el VPS donde Claude conduce la conversación, analiza qué tools usa el LLM, detecta alucinaciones/regresiones/oportunidades de mejora, y produce un reporte cualitativo.
when-to-use: Cuando se quiere validar un módulo end-to-end (tras un cambio de prompt, código o agentes), entender por qué el LLM rutea mal a ciertos tools, comparar el comportamiento entre dos instancias paralelas, o sacar findings accionables para mejorar el prompt/contexto/agentes. Útil sobre todo cuando una prueba automatizada no aplica porque el sistema involucra decisiones del LLM.
---

# audit-module

El skill es **un patrón que Claude aplica**, no un script que ejecuta. Claude conduce la conversación contra el VPS, lee el resultado, y produce un reporte cualitativo.

## Filosofía

- **Yo (Claude) soy el cerebro del audit.** El sistema ya guarda los datos (mensajes, tool_calls en metadata, activity buffer); yo conduzco el flujo y aporto el juicio.
- **Conversación reactiva, no script rígido.** Decido cada mensaje según la respuesta anterior. Si el LLM dice "no hay X", reacciono creando X.
- **Cubrir tools y agentes con mensajes ricos**, no "1 mensaje por tool". Un buen audit son 5-10 turnos que estresan rutas distintas (lectura → mutación → análisis → modificación con verificación).
- **A/B opcional pero valioso**: si el usuario puede pasar los mismos mensajes en su chat web en paralelo, comparar revela variabilidad del LLM y comportamiento inteligente vs mecánico.
- **Reporte narrativo, no métricas mecánicas.** "El LLM detectó receta existente y actualizó en vez de duplicar" vale más que "hit_rate=80%".

## Flujo de pensamiento

### Fase 1 — Comprender el módulo

Leo `module.json` (tools, subscribes/publishes), `prompt.json` (role, intent) y `context.json` (capabilities, rules, tools_disponibles). De ahí infiero:
- Qué hace el módulo (en una frase)
- Qué dependencias tiene (otros módulos)
- Qué agentes del catálogo lo pueden ayudar (filtrar `agents/*.json` por scope)
- Qué tools son lecturas, mutaciones, análisis

### Fase 2 — Diseñar el guión

Escribo **5-10 mensajes en lenguaje natural** que un usuario haría. Encadenados lógicamente:
- 1-2 mensajes de **lectura** (listar, estadísticas, ver detalle)
- 1-2 de **investigación/proposición** (busca/investiga + propón si no existe)
- 1 de **creación rica** (con datos completos, no mínimos)
- 1 de **análisis cruzado** (combina catálogo + recetas, escandallo + viabilidad, etc.)
- 1 de **modificación + verificación** (actualizar Y mostrar historial para confirmar)

Lo guardo en `audit/<modulo>-<TS>/guion.md` como markdown legible (no JSON).

### Fase 3 — Conducir la conversación

Uso los helpers atómicos:

```bash
# Crear conversación nueva
CONV=$(node scripts/audit-helpers/create-conversation.js Paco "audit-recetas")

# Por cada mensaje del guión:
node scripts/audit-helpers/send-message.js "$PROJECT" "$CONV" "recetas" "mi mensaje aquí"
# → imprime respuesta + última línea: --META {"tools":[...],"duration_ms":...}
```

**Después de cada respuesta**, leo y decido:
- ¿Llamó al tool esperado? ¿O usó otro?
- ¿La respuesta es coherente con los datos del tool?
- ¿Hay señales de alucinación (afirma sin tool call)?
- ¿El siguiente mensaje del guión sigue siendo válido o lo adapto?

Si el LLM falla (`ai.chat.failed`) o se desvía, no aborto — observo y sigo adaptando.

### Fase 4 — Comparación A/B (opcional)

Si quiero comparar variabilidad o detectar comportamiento inteligente:
1. Genero el guión y lo paso al usuario para que lo ejecute en su chat web en paralelo.
2. Espero a que termine.
3. Exporto ambas conversaciones (B1=mía, B2=suya).
4. Comparo turno a turno: mismas tools, distintas tools, distintas decisiones, ¿por qué?

Las diferencias pueden ser **comportamiento inteligente** (el LLM en B2 detectó algo que en B1 no aplicaba) o **inconsistencia patológica** (mismo input, distinta respuesta sin razón visible). El juicio es mío.

### Fase 5 — Exportar y analizar

```bash
node scripts/audit-helpers/fetch-export.js "$CONV" "$PROJECT" audit/<modulo>-<TS>/export.json
```

Leo el export. Para cada mensaje assistant veo:
- `metadata.tool_calls` — qué tools usó
- `content` — qué respondió
- `tokens` — peso del turno

Y cruzo con lo que esperaba del guión.

### Fase 6 — Reporte narrativo

Escribo `audit/<modulo>-<TS>/reporte.md`:

```markdown
# Audit `<modulo>` — <fecha>

## Resumen
- N mensajes, M tools distintas ejercitadas, K agentes invocados
- Conv id: ...
- Comparativa A/B: sí/no, con qué conversación

## Findings
- **F1 (severidad)**: qué pasó, evidencia, hipótesis de causa.
- **F2 (severidad)**: ...

## Patrones observados
Cosas no-obvias que noté leyendo: e.g. el LLM detectó receta existente
y actualizó en vez de crear; el LLM ignoró un tool específico; el LLM
tardó X en un mensaje vs Y en otro similar.

## Sugerencias accionables
- Cambios concretos al prompt / context / código, no parches puntuales.

## Estado del proyecto tras el audit
Recetas/escandallos/escenarios creados o modificados, por si hay que
limpiar.
```

## Helpers atómicos (`scripts/audit-helpers/`)

| Archivo | Función |
|---|---|
| `list-conversations.js <project> [limit]` | Lista conv de un proyecto |
| `create-conversation.js <project> [title]` | Crea conv, imprime id |
| `send-message.js <proj> <conv> <page> "msg"` | Envía + espera respuesta + meta |
| `fetch-export.js <conv> <project> [out.json]` | Descarga export |

Cada uno es ~30-50 líneas. Yo los uso paso a paso, no hay orquestador.

## Output de un audit típico

```
audit/<modulo>-<TS>/
  guion.md          el guión que diseñé
  b1-export.json    mi conversación (mía)
  b2-export.json    la del usuario (si A/B)
  reporte.md        análisis cualitativo
```

## Cuándo usar este skill

- Validar un módulo tras cambiar su prompt/context.
- Investigar por qué el LLM tarda o falla con ciertos mensajes.
- Comparar dos providers (cuando ambos tengan credencial).
- Antes de mergear un cambio que toque el subsistema chat/agentes.
- Cuando un usuario reporta "esto no funciona bien": el audit reproduce su flujo y localiza si el problema es del LLM (routing/calidad) o del módulo (tools rotos).

## Lo que este skill NO es

- **NO es test unitario** — los módulos ya tienen `tests/unit/<modulo>.test.js`.
- **NO es benchmark de performance** — no mide ops/seg ni stress test.
- **NO es auto-pilot ciego** — el guión y el análisis los hago yo (Claude), con criterio adaptado al módulo.
