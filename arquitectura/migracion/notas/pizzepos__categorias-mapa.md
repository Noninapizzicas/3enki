# pizzepos/categorias — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/pizzepos/categorias/`
- **Version actual**: 2.1.0 → bump a **3.0.0** post-rewrite.
- **LOC index.js**: 429.
- **Drifts en baseline**: 36 (scaffold detecta 33).
- **Categoria**: dominio pizzepos.
- **Idioma**: `es`.
- **Description oficial**: Catalogo de categorias de productos — sincronizado desde carta.actualizada (subgrafo cartas) + CRUD propio.

## Responsabilidad acotada

Mantiene un catalogo multi-tenant de categorias. Sincroniza desde `carta.actualizada` (cuando carta-manager actualiza una carta, este modulo refleja sus categorias). Expone 7 ui_handlers para CRUD manual + reordenar.

## Inventario

### Publishes (3) — preservados

- `categoria.creada` — emitido tras crear (sync o manual). Payload con `categoria_id`, `nombre`, `emoji`, `orden`.
- `categoria.actualizada` — emitido tras update. Payload con `categoria_id` + `cambios` (diff).
- `categoria.orden_actualizado` — emitido tras reordenar. Payload con `nuevo_orden` array.

### Subscribes (1)

- `carta.actualizada` → `onCartaActualizada` — sincroniza categorias desde el evento de carta-manager.

### UI handlers (7) — antes en `apis` HTTP-shape

- `list` → `handleListCategorias`.
- `get` → `handleGetCategoria`.
- `create` → `handleCreateCategoria` (manual).
- `update` → `handleUpdateCategoria`.
- `reorder` → `handleReorderCategorias`.
- `health` → `handleHealthCheck`.
- `metrics` → `handleGetMetrics`.

## Drifts (36 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_error_sin_metric` | 10 | Real — returns sin metric. | `_handleHandlerError`. |
| `drift_error_sin_log` | 10 | Real — returns sin logger. | Mismo helper. |
| `drift_error_como_string_suelto` | 10 | Real — `error: 'string'`. | `_errorResponse`. |
| `drift_publish_dominio_sin_project_id` | 3 | Real — publishes no llevan `project_id` top-level. | `_publicarEvento` lo añade. |
| `module_http_audit_completeness` | 1 | Real — `apis` HTTP-shape pero codigo usa uiHandler. | Migrar a `ui_handlers`. |
| `drift_correlation_id_no_propagado` | 1 | Real — falta tracing flag. | `tracing: true`. |
| `drift_auth_undeclared` | 1 | **Falso positivo** — modulo de proyecto sin auth. | Documentar. |

## Cosas criticas a preservar

1. **3 publishes** invariantes con sus payloads esperados.
2. **`onCartaActualizada`** sync logic: detecta nuevas vs existentes via `categoria.id`, emite `categoria.creada` para nuevas y `categoria.actualizada` con diff `cambios` para modificadas.
3. **Multi-tenant** via `categoriasPerProject: Map<project_id, Map<categoria_id, categoria>>`.
4. **`slugify`** helper para generar `categoria_id` desde nombre.
5. **`orden`** field auto-asignado al `categoriasMap.size` para nuevas categorias.
6. **`activa`** flag (default true) — se filtra en list por defecto.
7. **`reorder`** acepta array `[{categoria_id}]` y reasigna orden por indice.

## Plan del rewrite

1. Archivar monolito (429 LOC). _(automatico)_
2. Reescribir `index.js` v3.0.0:
   - 5 helpers POC2 + auxiliar `_slugify` (preservado, prefix con underscore).
   - 6o helper auxiliar `_publishUIState` (preservar API existente).
   - 7 ui_handlers con shape canonico + delegacion limpia.
   - Eliminar `_registerUIHandlers` (auto-wired).
   - `_publicarEvento` para los 3 publishes con `project_id` + `correlation_id` + `timestamp`.
   - Telemetria `categorias.*` + `categorias.errors`.
3. `module.json` v3.0.0:
   - `tracing.propaga_correlation_id: true`.
   - Migrar `apis` → `ui_handlers` canonicos con `type: workspace_module`, `zone: barra_modulos`.
   - `config.persistence` declarado (in-memory).
4. Tests por capas: lifecycle, validacion, sync (onCartaActualizada), ui CRUD, reorder, helpers POC2.
5. Wire CI _(automatico)_.
6. Drift count → ≤12 (~67%).
7. Commit.
