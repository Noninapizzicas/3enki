# pizzepos__variaciones — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/pizzepos/variaciones/`
- **Version actual**: 4.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 497.
- **Drifts en baseline**: 14 (5 tipos).
- **Categoria**: core.
- **Description oficial**: Gestion de variaciones de productos pizzepos (quitar/anadir ingredientes). Reglas por producto: que se puede quitar, que se puede anadir, maximo de extras. Calcula precio final consultando precios al modulo ingredientes (fuente unica via uiHandler.handle('ingredientes', ...)). Auto-valida cada comandero.item_agregado y emite variacion.{validada,rechazada}.

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (2)

- `variacion.validada` — emitido en `?` (handler de `comandero.item_agregado (probable)`).
- `variacion.rechazada` — emitido en `?` (handler de `comandero.item_agregado (probable)`).

### Subscribes (2)

- `producto.creado` → `?`
- `comandero.item_agregado` → `?`

## Drifts conocidos en baseline (14)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_como_string_suelto` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_log` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_metrica_sin_prefix_modulo` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 2 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (497 LOC) en `_legacy/pizzepos__variaciones-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `variaciones.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/pizzepos__variaciones.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
