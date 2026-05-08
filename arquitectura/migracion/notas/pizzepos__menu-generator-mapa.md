# pizzepos__menu-generator — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/pizzepos/menu-generator/`
- **Version actual**: 7.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 375.
- **Drifts en baseline**: 33 (15 tipos).
- **Categoria**: core.
- **Description oficial**: Generador puro de cartas estructuradas en JSON desde cualquier input (foto, PDF, texto, audio, dictado). Pipeline OCR determinista (pdfjs.render → sharp.prepare-ocr → Google Vision OCR) + agente menu-structurer (LLM) para estructuracion. Siempre pregunta el nombre.

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (7)

- `menu.generation.progress` — emitido en `toolGenerate (probable, vía handleGenerate o onCartaGenerarSolicitada)`.
- `menu.generation.failed` — emitido en `toolGenerate`.
- `menu.generation.progress` — emitido en `toolGenerate`.
- `agent.execute.request` — emitido en `toolGenerate`.
- `carta.generar.fallida` — emitido en `onCartaGenerarSolicitada` (handler de `carta.generar.solicitada (legacy en español)`).
- `carta.generar.iniciada` — emitido en `onCartaGenerarSolicitada` (handler de `carta.generar.solicitada`).
- `carta.generar.fallida` — emitido en `onCartaGenerarSolicitada` (handler de `carta.generar.solicitada`).

### Subscribes (1)

- `carta.generar.solicitada` → `onCartaGenerarSolicitada`

## Drifts conocidos en baseline (33)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_respuesta_no_canonica` | 9 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_como_string_suelto` | 4 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 4 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_log` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_type_canonico` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_zone_canonica` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_agent_flow_sin_correlation_id` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_inventar_error_code` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_generic_verb` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_rpc_over_pubsub` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_atribuible_sin_user_id` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_log_spam_en_bucle` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_handler_que_devuelve_valor_pelado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (375 LOC) en `_legacy/pizzepos__menu-generator-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `menu-generator.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/pizzepos__menu-generator.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
