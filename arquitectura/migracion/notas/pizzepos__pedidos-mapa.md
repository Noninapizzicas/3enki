# pizzepos__pedidos — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/pizzepos/pedidos/`
- **Version actual**: 2.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 918.
- **Drifts en baseline**: 68 (5 tipos).
- **Categoria**: core.
- **Description oficial**: Gestión completa de pedidos - Reemplazo de comandero 100% event-driven

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (7)

- `pedido.creado` — emitido en `?`.
- `pedido.item_agregado` — emitido en `?`.
- `pedido.item_actualizado` — emitido en `?`.
- `pedido.item_eliminado` — emitido en `?`.
- `pedido.enviado_cocina` — emitido en `?`.
- `pedido.completado` — emitido en `?`.
- `pedido.cancelado` — emitido en `?`.

### Subscribes (9)

- `comandero.enviar_cocina` → `?`
- `variacion.validada` → `?`
- `variacion.rechazada` → `?`
- `cuenta.creada` → `?`
- `catalogo.actualizado` → `?`
- `producto.creado` → `?`
- `producto.actualizado` → `?`
- `caja.cerrada` → `?`
- `dia.iniciado` → `?`

## Drifts conocidos en baseline (68)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_metrica_sin_prefix_modulo` | 16 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_como_string_suelto` | 15 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_log` | 15 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 15 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 7 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (918 LOC) en `_legacy/pizzepos__pedidos-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `pedidos.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/pizzepos__pedidos.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
