# bot-manager — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/bot-manager/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 327.
- **Drifts en baseline**: 19 (6 tipos).
- **Categoria**: core.
- **Description oficial**: Gestión de bots y almacenamiento. Descarga archivos, guarda en carpetas, publica eventos. NO sabe de agentes.

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (7)

- `bot.file.stored` — emitido en `?` (handler de `telegram.document/photo/video/audio/voice.received`).
- `bot.message.received` — emitido en `?` (handler de `telegram.text.received`).
- `bot.command.received` — emitido en `?` (handler de `telegram.command.received`).
- `bot.registered` — emitido en `?`.
- `bot.registered` — emitido en `?`.
- `bot.unregistered` — emitido en `?`.
- `enabled ? 'bot.enabled' : 'bot.disabled'` — emitido en `?`.

### Subscribes (8)

- `telegram.document.received` → `?`
- `telegram.photo.received` → `?`
- `telegram.video.received` → `?`
- `telegram.audio.received` → `?`
- `telegram.voice.received` → `?`
- `telegram.text.received` → `?`
- `telegram.command.received` → `?`
- `credential.saved` → `?`

## Drifts conocidos en baseline (19)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_respuesta_no_canonica` | 8 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 7 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_como_string_suelto` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_swallow_error_silently` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_signature_no_canonica` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_correlation_id_no_propagado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (327 LOC) en `_legacy/bot-manager-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `bot-manager.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/bot-manager.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
