# Cimiento de agentes v3 — arquitectura (2026-08)

El ai-agent-framework de Enki reescrito con la garantía **success = entregable
verificado**. Validado con el esquematizador (0 tecnologías nombradas; reparto:
7 REFLEJO · 2 CUSTODIO · 1 MICRO-AGENTE · 1 PUENTE).

## Piezas (del esquema) y su implementación

| Pieza | Forma | Implementación |
|---|---|---|
| TRABAJADOR | micro-agente | el LLM vía llm-flow (ai-gateway) |
| JEFE | reflejo | `cimiento.verificar(entregable, ctx)` — reglas deterministas, un test afirma su veredicto |
| CONTRATO | reflejo | manifest v2: `presupuesto` + `entregable`; `preparar(agent)` → null para agentes v1 (compat) |
| TALLER | reflejo | presupuesto por tarea (max_tokens/timeout del manifest) inyectado en llm.complete.request |
| BITÁCORA | custodio | `storage/agentes/bitacoras/<request_id>.json` — pasos, estado (ejecutando/pausada/verificada/fallida), veredicto, punto_reanudacion |
| REANUDADOR | reflejo+custodio | `agent.execute.resume.request` — timeout → `pausarBitacora(session_id, prev_state)` → retomar |
| VITRINA | puente | `veredicto` + `pasos` + `llm` viajan en agent.execute.response/failed |

## Puntos de inserción en el framework (index.js, 50K chars — parcheado, NO reescrito)

- `_loadAgents`: propagar `presupuesto` y `entregable` del JSON al objeto agente
  (el mapeo solo copiaba campos conocidos — sin esto el cimiento nunca los ve).
- `onAgentExecuteRequest`: `cimiento.preparar(agent)` + `crearBitacora`.
- `onLlmCompleteResponse` (EL PUNTO DEL HUMO): antes de publicar success →
  `cimiento.verificar` → si falla → `agent.execute.failed ENTREGABLE_NO_VERIFICADO`
  con el detalle de cada regla. Agente v1 sin contrato → success con
  `verificado:false` explícito (nadie lo confunde, nada se rompe).
- Timeout: `pausarBitacora` con session_id + prev_state (reanudable).
- `_publishAgentExecuteResponse` / `_publishAgentExecuteFailed`: añadir
  `verificado`, `veredicto`, `pasos`, `llm`.

## Cuidado con las rutas

`cimiento.js` vive en `modules/conversacion/ai-agent-framework/` → `MODULES_DIR`
es `path.resolve(__dirname, '../..')` (subir DOS niveles), `DATA_DIR` tres.
Un nivel de menos apunta a `conversacion/` y el JEFE no encuentra nada.

## Separación LLM vs AGENTE (payload del response)

```
agent.execute.response:
  veredicto { verificado, motivo, reglas[] }   ← LA respuesta del AGENTE
  pasos (bitácora) · entregable { tipo, path }
  llm { content, model, provider, tokens, tool_calls }  ← anexo del MODELO
  result.content se mantiene por compatibilidad (agent-observer/chat lo usan)
```

Cadena al frontend: framework → puente `chat-io` (propaga `veredicto` +
`llm.content` en `conversation/{id}/agent_status`) → store `agente-progreso.ts`
(`ejecucion.veredicto` + `llm_content`) → AgenteMarco (bloque ✅/❌ "Entregable
verificado" con reglas ✓/✗ + `<details>` "Lo que dijo el modelo").

## Rehidratación del marco desde la bitácora

- `chat-io`: ui_handler `agentes.bitacora` → `handleBitacora` lee el JSON
  persistido → `{ status, data: { bitacora } }`.
- Store: `rehidratarDesdeBitacora(project_id, request_id)` vía
  `mqttRequest('agentes', 'bitacora', {...})`; estado: verificada→done,
  fallida→failed, pausada/ejecutando→running.
- `AgenteProgreso.svelte`: onMount con requestId y sin ejecución en el store →
  rehidratar (la ventana sobrevive a recargas).

## Manifests v2 de los agentes de proceso

```json
{
  "presupuesto": { "max_tokens": 64000, "timeout_ms": 1800000, "max_iteraciones": 500 },
  "entregable": {
    "tipo": "fs",
    "path": "<slug>/index.js",                        // o cosecha/cantera/enki/<slug>/SKILL.md
    "reglas": ["existe", "api_real", "en_repo"],      // o contenido_min (min_chars)
    "min_chars": 100
  }
}
```
Paths `storage/...` (esquemas, planes) se resuelven contra
`data/projects/<project_id>/storage/`.

## Schema del contrato

`arquitectura/decisiones/_schemas/agent-flow/agent.execute.response.schema.json`
tenía `additionalProperties: false` y el cimiento emitía campos nuevos → deuda:
actualizar SIEMPRE el schema junto al payload.

## Reglas de verificación

- `existe` — el archivo existe en el mundo real
- `api_real` — `require('../_shared/modulo-hibrido-reflejo')` + `_atender` 4 args + `this.name/version`
- `en_repo` — git ls-files contra ~/3enki (lección rsync --delete)
- `contenido_min` — skills vacías (< min_chars) no pasan
- puerto `verificar(juicio)` — entregables fuzzy se declaran no-verificables, nunca se fingen
