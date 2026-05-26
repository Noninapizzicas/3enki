# escandallo — Mapa exhaustivo (PASO 0 del rewrite)

## Identidad

- **Path**: `modules/escandallo/`
- **Version actual**: 2.0.0 (codigo) / 1.0.0 (manifest — drift) → bump a **3.0.0**.
- **LOC index.js**: 1236.
- **Drifts en baseline**: 96 (scaffold detecta 96).
- **Categoria**: dominio negocio_alimentario (tier_5).
- **Idioma**: `es`.

## Estructura del modulo

```
modules/escandallo/
├── index.js (1236 LOC) — orquestacion + tools + ui_handlers
├── core/
│   ├── escandallo-manager.js (513) — DB SQLite + CRUD escandallos
│   ├── precio-finder.js (337) — busqueda de precios mercado/compra
│   ├── precio-cache-manager.js (176) — cache TTL de precios
│   ├── search-ranker.js (262) — ranking inteligente de resultados
│   ├── search-filters.js (176) — filtros compuestos
│   └── tool-result-formatter.js (192) — formato Markdown para LLM
├── pipeline/
│   └── escandallo-calculation-pipeline.js (228) — calculo step-based
├── db/
│   └── schema-escandallo.sql
├── __tests__/ — 3 tests previos (search-ranker, escandallo-manager, search-filters)
```

## Decision sobre descomposicion

**NO descomponer**. Las sub-libs ya estan separadas (core/*, pipeline/*) y comparten la misma persistencia (`EscandalloManager` con SQLite por proyecto). El index.js es solo el orquestador POC2 que expone tools y ui_handlers — refactorizable sin descomposicion.

## Inventario

### Publishes (3) — preservados invariantes

- `escandallo.calculado` — emitido tras `toolEscandalloReceta` exitoso. Payload incluye coste_total, coste_porcion, food_cost, insights.
- `escandallo.alerta` — emitido si food_cost > 35%. Payload `{ tipo: 'food_cost_alto', receta_id, nombre, food_cost, umbral, mensaje }`.
- `escandallo.comparativa` — emitido tras `toolCompararPrecios`. Payload con comparativa precio_mercado vs compra real.

### Subscribes (5) — preservados invariantes

- `project.activated` → `onProjectActivated` (set storagePath + load recetas/ingredientes desde disco).
- `project.deactivated` → `onProjectDeactivated` (no-op).
- `receta.creada` → `onRecetaCreada` (invalida cache del proyecto).
- `receta.actualizada` → `onRecetaActualizada` (invalida cache del proyecto).
- `ingrediente.precio.actualizado` → `onIngredientePrecioActualizado` (invalida TODOS los caches — cambio cross-proyecto).

### Tools (12 totales)

**7 tools declarados en module.json** (LLM-facing):
- `escandallo.receta` — escandallo completo de una receta + insights.
- `escandallo.global` — escandallo global de todas las recetas + rankings.
- `escandallo.comparar_precios` — mercado vs compra real (cruce con facturas).
- `escandallo.simular_precio` — simula precios de venta + food_cost objetivo.
- `escandallo.ingrediente_impacto` — impacto de subida de precio de un ingrediente.
- `escandallo.optimizar` — sugerencias de optimizacion automaticas.
- `escandallo.ficha_tecnica` — ficha tecnica profesional con alergenos.

**5 tools registrados en `moduleLoader.toolsRegistry`** (analyzer agent):
- `escandallo.obtener` — get full escandallo by ID (con cost breakdown).
- `escandallo.obtener_historico` — historical calculations para trend detection.
- `escandallo.obtener_alertas` — price change alerts para anomaly detection.
- `escandallo.buscar` — busqueda por criterios (cost range, alerts, missing prices).
- `escandallo.buscar_y_ordenar` — busqueda con ranking inteligente (relevance/cost/recent).

### UI handlers (4) — antes en `apis` HTTP-shape

- `handleEscandalloReceta` (delega a `toolEscandalloReceta`)
- `handleEscandalloGlobal` (delega a `toolEscandalloGlobal`)
- `handleComparativa` (delega a `toolCompararPrecios`)
- `handleStats` (delega a `toolEscandalloGlobal`)

## Drifts (96 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_error_sin_metric` | 25 | Real — returns sin metric. | `_handleHandlerError`. |
| `drift_error_sin_log` | 20 | Real — returns sin logger. | Mismo helper. |
| `drift_tool_errores_conocidos_vacio` | 7 | Real — module.json.tools[].errores_conocidos vacio. | Añadir codes canonicos por tool. |
| `drift_tool_handler_que_devuelve_valor_pelado` | 5 | Real — handlers devuelven `{ status, error: 'string' }` y throws con `code: 'ESCANDALLO_ERROR'`. | `_errorResponse` con codes canonicos del catalogo. |
| `drift_error_como_string_suelto` | 5 | Real — `error: 'Se requiere "X"'`. | `_errorResponse(400, 'INVALID_INPUT', ..., { field: 'X' })`. |
| `drift_ui_handler_sin_zone_canonica` | 4 | Real — sin `zone`. | `zone: "barra_modulos"`. |
| `drift_ui_handler_sin_type_canonico` | 4 | Real — sin `type`. | `type: "workspace_module"`. |
| `drift_publish_dominio_sin_project_id` | 3 | Real — publishes no llevan `project_id` top-level. | `_publicarEvento` lo añade. |
| `drift_silent_io_failure` | 2 | Real — `loadRecetasData` con `catch (e) { /* no data yet */ }`. | `_readJsonSafe` con log explicito. |
| `drift_inventar_error_code` | 2 | Real — `ESCANDALLO_ERROR` no esta en catalogo errors.json. | Reemplazar por codes canonicos. |
| `drift_undeclared_persistence_pattern` | 1 | Real — module.json sin `config.persistence` declarado. | Declarar `mixed` (SQLite via manager + filesystem read del recetas). |
| `drift_signature_no_canonica` | 1 | Real — algun metodo con signatura no canonica. | Revisar y normalizar. |
| `drift_missing_onUnload_with_reservations` | 1 | **Falso positivo** — onUnload SI cierra managers + clear cache. | Documentar. |
| `drift_correlation_id_no_propagado` | 1 | Real — falta tracing flag top-level. | `tracing: true`. |

## Cosas criticas a preservar

1. **3 publishes** invariantes con sus payloads.
2. **5 subscribes** invariantes (cache invalidation pattern preservado).
3. **EscandalloManager por proyecto** (SQLite via `getManager(projectId)`).
4. **Cache `recetas/ingredientes`** invalidado por `receta.actualizada` y `ingrediente.precio.actualizado`.
5. **Constantes hardcoded**: food_cost umbral alerta = 35%, food_cost bajo = 25%.
6. **`registerAnalyzerTools`** — registro programatico en `moduleLoader.toolsRegistry` de 5 tools (preservado, son tools internos del agent flow).
7. **`calcularEscandallo`** — algoritmo central (desglose con porcentajes + ordenado por coste).
8. **`calcularMargen`** — formula food_cost / margen_euro / multiplicador.
9. **Insights heuristicos** (top ingrediente, food_cost classification, etc.).
10. **`resolveToActiveProject`** — fallback al primer proyecto activo si no se especifica.

## Plan del rewrite

1. Archivar monolito (1236 LOC) en `_legacy/`. _(automatico)_
2. Reescribir `index.js` v3.0.0:
   - 5 helpers POC2 + 2 auxiliares (`_readJsonSafe` para loadRecetasData, `_slugify` para genericos).
   - 4 ui_handlers normalizados con shape canonico (eliminar throw `ESCANDALLO_ERROR`).
   - 7 tools "principales" con shape canonico + errores_conocidos.
   - 5 tools "analyzer" preservados — registro via `moduleLoader.toolsRegistry`.
   - `_publicarEvento` para los 3 publishes con project_id + correlation_id + timestamp.
   - `loadRecetasData` usa `_readJsonSafe` (no swallow).
   - Telemetria `escandallo.*` (dominio) + `escandallo.errors`.
3. `module.json` v3.0.0:
   - `tracing.propaga_correlation_id: true`.
   - Migrar `apis` → `ui_handlers` con type/zone canonicos.
   - 7 tools con `errores_conocidos`.
   - `config.persistence` declarada (mixed: SQLite + filesystem read).
4. Tests por capas (manten los `__tests__/` existentes + añadir test del index principal).
5. Wire CI _(automatico)_.
6. Drift count → ≤30 (~67%).
7. Commit.
