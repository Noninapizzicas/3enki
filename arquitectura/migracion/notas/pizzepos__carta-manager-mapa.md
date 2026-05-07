# pizzepos__carta-manager — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/pizzepos/carta-manager/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 594.
- **Drifts en baseline**: 103 (8 tipos).
- **Categoria**: core.
- **Description oficial**: Dueño de datos de cartas — CRUD, persistencia, versionado, búsqueda, estadísticas

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (13)

- `carta.listada` — emitido en `onCartaListarSolicitada` (handler de `carta.listar.solicitada`).
- `carta.listar.fallida` — emitido en `onCartaListarSolicitada` (handler de `carta.listar.solicitada`).
- `carta.editada` — emitido en `onCartaEditarSolicitada` (handler de `carta.editar.solicitada`).
- `carta.editar.fallida` — emitido en `onCartaEditarSolicitada` (handler de `carta.editar.solicitada`).
- `carta.borrada` — emitido en `onCartaBorrarSolicitada` (handler de `carta.borrar.solicitada`).
- `carta.borrar.fallida` — emitido en `onCartaBorrarSolicitada` (handler de `carta.borrar.solicitada`).
- `carta.actualizada` — emitido en `toolSave (probable)` (handler de `tool carta.save`).
- `carta.actualizada` — emitido en `toolAddProduct (probable)` (handler de `tool carta.add_product`).
- `carta.actualizada` — emitido en `toolRemoveProduct (probable)` (handler de `tool carta.remove_product`).
- `carta.actualizada` — emitido en `toolUpdateProduct (probable)` (handler de `tool carta.update_product`).
- `carta.actualizada` — emitido en `toolAddCategory (probable)` (handler de `tool carta.add_category`).
- `carta.actualizada` — emitido en `toolUpdatePrices (probable)` (handler de `tool carta.update_prices`).
- `carta.actualizada` — emitido en `toolRestore (probable)` (handler de `tool carta.restore`).

### Subscribes (5)

- `project.activated` → `onProjectActivated`
- `project.deactivated` → `onProjectDeactivated`
- `carta.listar.solicitada` → `onCartaListarSolicitada`
- `carta.editar.solicitada` → `onCartaEditarSolicitada`
- `carta.borrar.solicitada` → `onCartaBorrarSolicitada`

## Drifts conocidos en baseline (103)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_sin_log` | 36 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 36 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_como_string_suelto` | 18 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_swallow_error_silently` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_type_canonico` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_zone_canonica` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_silent_io_failure` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_inventar_error_code` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (594 LOC) en `_legacy/pizzepos__carta-manager-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `carta-manager.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/pizzepos__carta-manager.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
