# recetas — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/recetas/`
- **Version actual**: 2.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 741.
- **Drifts en baseline**: 89 (15 tipos).
- **Categoria**: core.
- **Description oficial**: Gestión de recetas con almacenamiento JSON por proyecto (data/projects/{slug}/recetas.json). Cada receta tiene history interno (versionado), incompleta flag y campos_pendientes. Cero SQL, cero schema migrations.

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (11)

- `project.get.request` — emitido en `_slugForProject`.
- `fs.read.request` — emitido en `_readFile`.
- `fs.write.request` — emitido en `_writeFile`.
- `receta.creada` — emitido en `crear` (handler de `tool recetas.crear (vía _toolDispatch)`).
- `receta.actualizada` — emitido en `actualizar` (handler de `tool recetas.actualizar (vía _toolDispatch)`).
- `receta.actualizada` — emitido en `revertir` (handler de `tool recetas.revertir (vía _toolDispatch)`).
- `receta.eliminada` — emitido en `eliminar` (handler de `tool recetas.eliminar (vía _toolDispatch)`).
- `ingrediente.precio.actualizado` — emitido en `actualizarPrecio` (handler de `tool recetas.actualizar_precio (vía _toolDispatch)`).
- `${toolName}.response` — emitido en `_toolDispatch` (handler de `fallback unknown tool`).
- `${toolName}.response` — emitido en `_toolDispatch` (handler de `respuesta de tool exitosa`).
- `${toolName}.response` — emitido en `_toolDispatch` (handler de `respuesta de tool con error`).

### Subscribes (18)

- `project.activated` → `onProjectActivated`
- `project.deactivated` → `onProjectDeactivated`
- `project.get.response` → `onProjectGetResponse`
- `fs.read.response` → `onFsReadResponse`
- `fs.write.response` → `onFsWriteResponse`
- `recetas.crear` → `onToolCrear`
- `recetas.listar` → `onToolListar`
- `recetas.obtener` → `onToolObtener`
- `recetas.buscar` → `onToolBuscar`
- `recetas.actualizar` → `onToolActualizar`
- `recetas.historial` → `onToolHistorial`
- `recetas.revertir` → `onToolRevertir`
- `recetas.eliminar` → `onToolEliminar`
- `recetas.estadisticas` → `onToolEstadisticas`
- `recetas.ingredientes` → `onToolIngredientes`
- `recetas.actualizar_precio` → `onToolActualizarPrecio`
- `recetas.analizar` → `onToolAnalizar`
- `recetas.investigar_receta` → `onToolInvestigarReceta`

## Drifts conocidos en baseline (89)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_como_string_suelto` | 17 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_type_canonico` | 13 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_zone_canonica` | 13 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_tool_declaration_no_cumple_schema` | 13 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 8 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_generic_verb` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_rpc_over_pubsub` | 3 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_missing_onUnload_with_reservations` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_mensaje_sin_estructura` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_unbounded_growth_no_eviction` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_log` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_color_hex_custom_en_frontend_src` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_correlation_id_no_propagado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_undeclared_persistence_pattern` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (741 LOC) en `_legacy/recetas-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `recetas.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/recetas.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
