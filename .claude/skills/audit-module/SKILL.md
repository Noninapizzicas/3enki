---
name: audit-module
description: Auditoría operativa de un módulo del sistema en UNA conversación natural que cubre tools del módulo, delegación a agentes del scope, y coherencia con el propósito declarado. Reporte narrativo con juicio, sin schemas ni métricas impuestas. Forced-agent solo como triage diagnóstico cuando un agente falla o se porta raro en la conversación natural.
when-to-use: Validar un módulo end-to-end de forma fiel al uso real. Útil tras cambios de prompt/código/agentes, antes de mergear, o cuando el usuario reporta "no funciona bien". Mide cómo se comporta el módulo cuando se le usa, no cuando se le prueba.
---

# audit-module

Una conversación realista por módulo. Claude juzga. Output narrativo.

## Filosofía

- **Realidad antes que teatro.** El módulo se audita en el flujo real (chat → orquestador → tools + agentes), no en pruebas aisladas.
- **Una sola conversación**. Cubre tools, delegación y coherencia con propósito en el mismo hilo. Si en una sesión natural no aparece algo, eso ES un finding.
- **Forced-agent solo como triage.** Si un agente se invocó en la sesión y falló o dio mala salida, lanzas una forced-invocation dirigida solo a ese agente — para distinguir si está roto el agente o le llegó mal contexto desde el orquestador.
- **Reporte narrativo con juicio.** Findings, patrones, sugerencias. Sin schema YAML, sin métricas obligatorias, sin rollups.

## Procedure

### 0. Captura del bus (background)

Antes de tocar la conversación, arranco `capture-bus.js` en background para capturar TODOS los eventos del bus que pasen durante la sesión. Esto es lo que después permite ver causalidad real (no solo lo que el LLM dijo haber hecho).

```bash
mkdir -p audit/<modulo>-<provider>-<TS>
node scripts/audit-helpers/capture-bus.js audit/<modulo>-<provider>-<TS>/bus-capture.jsonl &
CAPTURE_PID=$!
```

El capturador se queda escuchando hasta que lo mate al final (paso 4) o hasta que se cumpla `--idle-timeout` si lo paso.

### 1. Comprender el módulo (sin cambios)

Leo `module.json`, `prompt.json`, `context.json` del módulo. Identifico tools y agentes con scope incluyendo el módulo.

### 2. Una conversación natural

Una sola conversación de chat con `page_id=<modulo>`. **10-15 mensajes** que simulan un usuario real intentando hacer trabajo de verdad en el módulo. Sin plantilla fija. Mezclo:

- Lectura de estado (cuántos, listame, qué tengo)
- Acciones del dominio (proponme, crea, modifica, analiza)
- Preguntas abiertas que invitan a delegar al especialista
- Pivots / cambios de tema / ambigüedad / errores intencionados
- Cierre con visión de conjunto

Claude conductor adapta cada mensaje a la respuesta anterior. Si veo algo raro, ahondo. Si veo todo limpio, sigo adelante.

### 3. Triage de agente (condicional)

Solo si en la conversación natural detecto que **un agente fue invocado y produjo error / mala salida / timeout** — entonces lanzo `force-agent` con esa misma task (o una más simple) en una conversación separada. Pregunta diagnóstica: ¿está roto el agente o le llegó mal contexto?

NO se hace forced-agent si:
- El agente nunca se invocó (eso es finding de orquestación, no del agente)
- El agente funcionó bien (no hace falta verificar lo que ya funciona)
- Hay varios agentes en scope que nunca aparecen (eso es finding de catálogo/triggers)

### 4. Cierre + análisis estructurado

Antes de redactar el reporte cierro la captura y corro el analyzer:

```bash
node scripts/audit-helpers/fetch-export.js $CONV $PROJ_UUID audit/<modulo>-<provider>-<TS>/chat-export.json
kill -INT $CAPTURE_PID  # cierre limpio con flush
sleep 1
node scripts/audit-helpers/analyze-session.js \
  --export   audit/<modulo>-<provider>-<TS>/chat-export.json \
  --capture  audit/<modulo>-<provider>-<TS>/bus-capture.jsonl \
  --conversation $CONV \
  --out      audit/<modulo>-<provider>-<TS>/analysis.json
```

El `analysis.json` (formato `audit-session-analysis-v1`) trae las secciones que necesito leer para escribir el reporte sin inventar:

- `turns[]` — cadena causal por turno: trigger event, eventos del bus en la ventana, tool_calls reportados por el LLM, duración, providers usados
- `orphans` — requests sin response correlacionado (handoffs rotos visibles)
- `errors_and_warnings` — eventos `.failed` + entries error/warning del timeline, ordenados por ts
- `latencies` — pares request/response con delta_ms
- `coverage` — módulos emitidos / tools invocadas / agentes ejecutados (lo que cubrió la conversación vs lo que el módulo declara)
- `events_by_module` — desglose por módulo emisor

Detector de alucinación clave: un `tool_calls_reported` del assistant que no aparece en `events_by_module` o que aparece pero su `.request` está en `orphans` significa que el LLM dijo haber hecho algo que el bus no refleja.

### 5. Reporte narrativo

`audit/<modulo>-<provider>-<TS>/reporte.md` con secciones libres:

- **Resumen** — veredicto en 2-3 líneas
- **Lo que funcionó** — tools que se invocaron correctamente, agentes que se delegaron a tiempo, ejecuciones limpias
- **Lo que falló o costó** — errores, regresiones, comportamientos subóptimos
- **Agentes no invocados naturalmente** — los del scope que el LLM no encontró razón de usar
- **Triage** (si aplica) — resultados de forced-agent dirigido a sospechosos
- **Patrones** — observaciones no-obvias al leer los exports
- **Sugerencias accionables** — cambios concretos al prompt / context / código / agentes / catálogo

Sin schema YAML. Sin metrics.json. Sin rollups. Si la información merece tabla, la pongo. Si una frase basta, una frase basta.

## Helpers atómicos

| Archivo | Función |
|---|---|
| `list-conversations.js <project> [limit]` | Lista conv recientes |
| `create-conversation.js <project> [title]` | Crea conv, imprime id |
| `send-message.js <proj_uuid> <conv> <page> "msg" [wait_ms] [--provider X] [--model Y] [--thinking enabled\|disabled]` | Envía + espera + META |
| `force-agent.js <proj_uuid> <conv> <agent> "task" [wait_ms] [--provider X] [--model Y]` | Triage diagnóstico, no rutina |
| `fetch-export.js <conv> <proj_uuid> [out.json]` | Descarga export |
| `capture-bus.js <out.jsonl> [--idle-timeout ms] [--max-duration ms] [--topic-filter regex]` | Captura cruda de TODOS los eventos del bus a JSONL (background) |
| `analyze-session.js --export <e.json> --capture <c.jsonl> [--conversation id] [--out path]` | Correla export + capture, JSON `audit-session-analysis-v1` |

Helpers exigen `project_uuid`, no nombre.

Detalle operativo de la pareja capture+analyze: ver `arquitectura/decisiones/_contratos/manual-audit-bus-capture.contract.json`.

## Output

```
audit/<modulo>-<provider>-<TS>/
  bus-capture.jsonl             # TODOS los eventos del bus durante la sesión
  chat-export.json              # la conversación natural
  analysis.json                 # audit-session-analysis-v1 (estructurado)
  triage/                       # solo si hubo escalación
    <agente-X>.json
    <agente-Y>.json
  reporte.md                    # narrativo con juicio (lee analysis.json)
```

## Cuándo usar

- Tras cambios en prompt/context/código/agentes del módulo
- Antes de mergear
- Cuando un usuario reporta "no funciona bien"
- Para comparar el mismo módulo bajo distintos providers (auditar 2 veces con `--provider` distintos y comparar narrativas)

## Lo que NO es

- **NO es test unitario.**
- **NO es benchmark.**
- **NO es auto-pilot.** Claude conduce y juzga.
- **NO produce métricas mecánicas comparables al céntimo.** La realidad es narrativa, no numérica.
