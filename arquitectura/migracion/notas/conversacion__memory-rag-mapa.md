# conversacion__memory-rag — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/conversacion/memory-rag/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 381.
- **Drifts en baseline**: 0 (0 tipos).
- **Categoria**: TODO_AYUDA_INVENTARIO.
- **Description oficial**: Memoria modular semantica del compañero. Indexa cada mensaje del chat (user + assistant) en un vector store por proyecto, y en cada chat.message.saved hace busqueda semantica top-K en el historico para enriquecer el system prompt via chat.context.enriched (priority 500). Asi, cuando el FIFO recorta el principio, los snippets relevantes del pasado siguen disponibles para el compañero.

Indexacion: publica embedding.generate.request (consumido por ai-gateway) y persiste el vector en SQLite por proyecto. Consulta: en cada chat.message.saved del usuario, hace embedding del mensaje, calcula cosine similarity contra los vectores en memoria, devuelve top-K. Aislamiento por (project_id, user_id) obligatorio.

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (0)

- _(ninguno)_

### Subscribes (0)

- _(ninguno)_

## Drifts conocidos en baseline (0)

| Tipo | Count | Naturaleza |
|---|---|---|
| _(sin drifts)_ | 0 | — |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (381 LOC) en `_legacy/conversacion__memory-rag-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `memory-rag.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/conversacion__memory-rag.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
