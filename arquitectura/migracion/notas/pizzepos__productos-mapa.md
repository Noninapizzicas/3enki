# pizzepos__productos — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/pizzepos/productos/`
- **Version actual**: 3.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 1265.
- **Drifts en baseline**: 52 (7 tipos).
- **Categoria**: core.
- **Description oficial**: Catalogo de productos pizzepos multi-tenant. Cada proyecto tiene su propio catalogo, sincronizado desde menus generados por IA o cartas (carta.actualizada). Persiste a disco como cartas JSON en {project.base_path}/storage/pizzepos/cartas/. Emite producto.{creado,actualizado,eliminado} y catalogo.actualizado para que comandero/pedidos refresquen su cache.

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (7)

- `catalogo.actualizado` — emitido en `?` (handler de `carta.actualizada (sync desde carta-manager)`).
- `project.get.request` — emitido en `?`.
- `producto.creado` — emitido en `?`.
- `producto.actualizado` — emitido en `?`.
- `producto.eliminado` — emitido en `?`.
- `catalogo.actualizado` — emitido en `?`.
- `menu.generado` — emitido en `?`.

### Subscribes (3)

- `carta.actualizada` → `?`
- `project.activated` → `?`
- `project.get.response` → `?`

## Drifts conocidos en baseline (52)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_sin_metric` | 15 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_log` | 14 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_como_string_suelto` | 13 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 7 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_generic_verb` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_rpc_over_pubsub` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_log_spam_en_bucle` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (1265 LOC) en `_legacy/pizzepos__productos-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `productos.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/pizzepos__productos.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
