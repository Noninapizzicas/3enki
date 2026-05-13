---
name: audit-module
description: Auditoría operativa end-to-end de un módulo del sistema event-core. Genera ficha, guión heurístico, ejecuta como usuario contra el VPS, exporta la conversación y produce reporte con cobertura, routing del LLM (TP/FP/FN), latencias por tool, checks contra rules del prompt, detección de patología y sugerencias accionables clasificadas por severidad. Compara con audits anteriores si existen.
when-to-use: Cuando se quiere validar el funcionamiento operativo de un módulo (recetas, escandallo, viabilidad, cartadigital, etc.) tal como lo experimenta un usuario real. Útil para detectar regresiones tras cambios, medir rendimiento del LLM al rutear hacia los tools del módulo, identificar tools rotos y proponer mejoras concretas al prompt o al código.
---

# audit-module

Auditoría operativa de un módulo. **NO es un test unitario** — es una prueba end-to-end como usuario humano, contra el VPS de producción/staging, y posterior análisis estructurado del resultado.

## Cómo invocar

```bash
# Audit completo de un módulo (default project: Paco)
node scripts/audit-module.js recetas

# Otro proyecto, por nombre o UUID
node scripts/audit-module.js escandallo --project=Pancito

# Generar solo ficha + guion sin ejecutar contra el VPS
node scripts/audit-module.js viabilidad --dry-run

# Cambiar espera entre mensajes (default: 60s — agentes y operaciones largas necesitan tiempo)
node scripts/audit-module.js recetas --wait=90000
```

## Fases (todas automatizadas)

1. **analyze** — lee `module.json` + `prompt.json` + `context.json` del módulo. Extrae role, intent, tools, rules, dependencias (otros módulos cuyo prefijo aparezca en `subscribes`).
2. **script** — genera un guión heurístico de 1 mensaje natural por tool, en orden lógico (setup → lectura → mutación → análisis → reversión).
3. **execute** — crea conversación nueva contra el VPS con `page_id=<modulo>`, envía cada mensaje como un usuario real (`ui/request/conversation/send`), captura los eventos del bus (`<modulo>.*.response`, `chat.assistant.saved`, `ai.chat.failed`) con sus latencias.
4. **export** — descarga la conversación entera via API `conversation-export` (mensajes persistidos en BD + activity buffer).
5. **report** — produce dos artefactos:
   - `reporte.md` — humano leíble, con secciones de métricas, latencias, detalle por paso, errores, sugerencias y comparativa con audit anterior si existe.
   - `reporte.json` — estructurado, para procesamiento posterior.

## Output

```
audit/<modulo>-<timestamp>/
  ficha.json     ficha del módulo
  guion.json     guión de pruebas generado
  trace.json     eventos del bus capturados en vivo + latencias por tool
  export.json    export completo via conversation-export API
  reporte.md     reporte humano-leíble (índice + secciones)
  reporte.json   reporte estructurado
```

## Cómo se interpreta el reporte

**Cobertura tools**: % de tools del módulo que se ejecutaron al menos una vez durante el audit. Si baja, el guión no cubre el catálogo del módulo o el LLM ignoró tools.

**Routing TP/FP/FN**:
- **TP** (true positive): el LLM usó el tool esperado para el mensaje del paso.
- **FN** (false negative): el LLM NO usó el tool esperado.
- **FP** (false positive): el LLM usó tools adicionales no esperados.

Hit rate alto (>80%) indica que el LLM rutea bien con el prompt actual. Bajo indica que `prompt.json` o `context.json.tools_disponibles` necesitan más claridad.

**Latencias**: p50/p95/max por tool. Permite detectar tools lentas que degradan UX.

**Findings de calidad**: heurísticas sobre cada respuesta del LLM detectan:
- `antipattern`: presencia de `[object Object]` en el chat.
- `system_error_message`: la respuesta es el fallback genérico de chat-io.
- `token_degeneration`: degeneración del LLM (alta proporción de tokens cortos al final).
- `format`: la respuesta no respeta rules del prompt (e.g. listas markdown).
- `too_short`: respuesta muy corta (posible fallo silencioso).

**Sugerencias clasificadas** por severidad (high/medium/low) con acción accionable.

**Comparativa con audit anterior** muestra el delta de cobertura y routing — útil para detectar regresiones tras commits.

## Cuándo usar este skill

- Tras tocar el código de un módulo, antes de mergear.
- Cuando un usuario reporta que algo "no funciona bien" — el reporte localiza si es del LLM (routing/calidad) o del módulo (tools fallando).
- Para comparar rendimiento del prompt antes/después de cambios en `prompt.json`.
- Para descubrir tools no documentadas o degradadas.

## Limitaciones conocidas (v1)

- El guión es heurístico — un mensaje por tool basado en el sufijo. No cubre casos edge (datos inválidos, dependencias entre tools). Las heurísticas se pueden mejorar editando `toolToMessage()` en `scripts/audit-module.js`.
- Asume que el módulo ya está cargado en el VPS y que el proyecto tiene datos mínimos. No crea fixtures automáticamente.
- Espera fija entre pasos (default 60s). Si un step tarda más, se pierde su respuesta. Aumentar con `--wait`.
- La detección de patología es heurística (regex). No usa LLM-as-judge.
