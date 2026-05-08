# pizzepos/ingredientes — Mapa exhaustivo (PASO 0 del rewrite)

## Identidad

- **Path**: `modules/pizzepos/ingredientes/`
- **Version actual**: 4.0.0 → bump a **5.0.0** post-rewrite.
- **LOC index.js**: 696.
- **Drifts en baseline**: 33 (scaffold detecta 30).
- **Categoria**: dominio pizzepos.
- **Idioma**: `es`.
- **Description oficial**: Catalogo de ingredientes organizado por GRUPO (categoria de producto). Fuente UNICA de precios de ingredientes (`precio_extra`).

## Responsabilidad acotada

Catalogo singleton de ingredientes por proyecto (no multi-tenant in-memory — solo el ultimo proyecto activado). Persiste a `{storagePath}/ingredientes.json`. Sincroniza desde `carta.actualizada` y `producto.creado`. Provee 9 ui_handlers para queries y CRUD de precios.

## Inventario

### Publishes (2) — preservados

- `ingrediente.creado` — emitido tras crear ingrediente nuevo desde carta o producto.
- `ingrediente.actualizado` — emitido tras update (manual o sync).

### Subscribes (4)

- `project.activated` → `onProjectActivated` (set storagePath + load from disk).
- `carta.actualizada` → `onCartaActualizada` (sync ingredientes_catalogo + ingredientes_base).
- `producto.creado` → `onProductoCreado` (registra ingredientes del producto en grupo).
- `ingrediente.actualizado` → `onIngredienteActualizadoExterno` (sync desde menu-generator). **AUTOREFERENCIAL** — el modulo escucha su propio evento. Loop-safe via comparacion de valores antes de aplicar.

### UI handlers (9) — antes en `apis` HTTP-shape

- `list`, `get`, `get_precio`, `search`, `alergenos`, `update`, `update_precios`, `health`, `metrics`.

## Drifts (33 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_metrica_sin_prefix_modulo` | 7 | **Falso positivo parcial** — `ingrediente.*` es prefix DOMINIO. | Conservar + añadir `ingredientes.errors`. |
| `drift_error_sin_metric` | 7 | Real — returns sin metric. | `_handleHandlerError`. |
| `drift_error_sin_log` | 7 | Real — returns sin logger. | Mismo helper. |
| `drift_error_como_string_suelto` | 6 | Real — `error: 'string'`. | `_errorResponse`. |
| `drift_publish_dominio_sin_project_id` | 2 | Real — payloads no llevan project_id top-level. | `_publicarEvento` lo añade. |
| `module_http_audit_completeness` | 1 | Real — apis HTTP-shape. | Migrar a `ui_handlers`. |
| `drift_log_spam_en_bucle` | 1 | Real — `onProductoCreado` y `onCartaActualizada` loguean por ingrediente en bucle. | Reducir a 1 log inicial + 1 log resumen con counts. |
| `drift_correlation_id_no_propagado` | 1 | Real — falta tracing flag. | `tracing: true`. |
| `drift_auth_undeclared` | 1 | **Falso positivo**. | Documentar. |

## Cosas criticas a preservar

1. **Sync desde `carta.actualizada`**: procesa `ingredientes_catalogo` + extrae de `productos.ingredientes_base` con grupo = `producto.categoria`.
2. **Merge de grupos** (Set sin duplicar) cuando un ingrediente aparece en multiples productos/cartas.
3. **`onIngredienteActualizadoExterno`** loop-safe — solo aplica si `existente[campo] !== nuevoValor`.
4. **Persistencia singleton** — `{storagePath}/ingredientes.json`. NO es multi-tenant in-memory; el ultimo proyecto activado define el path.
5. **`clasificarIngrediente`** — regex extenso por tipo (queso/carne/marisco/salsa/verdura/masa).
6. **`update_precios` con 5 modos** (id, tipo, grupo, tipo+grupo, porcentaje%) — preservado.
7. **`countByType` + `countByGroup`** — agregaciones para health/metrics.
8. **`disponible !== false`** filtro default en list (incluye undefined como disponible).

## Plan del rewrite

1. Archivar monolito (696 LOC). _(automatico)_
2. Reescribir `index.js` v5.0.0:
   - 5 helpers POC2 + auxiliar `_atomicWriteFile` + `_readJsonSafe`.
   - 9 ui_handlers normalizados con shape canonico.
   - 4 bus handlers preservados con loop-safety.
   - `_publicarEvento` para los 2 publishes con project_id + correlation_id + timestamp.
   - `saveToDisk` usa `_atomicWriteFile`.
   - `loadFromDisk` usa `_readJsonSafe`.
   - Eliminar `_registerUIHandlers` (auto-wired).
   - Reducir log spam en bucles (1 resumen al final, no log por ingrediente).
   - Telemetria `ingredientes.*` (errors) + preservar `ingrediente.*` (dominio).
3. `module.json` v5.0.0:
   - `tracing.propaga_correlation_id: true`.
   - Migrar `apis` → `ui_handlers` con `type: workspace_module`, `zone: barra_modulos`.
   - `config.persistence` declarada.
4. Tests por capas.
5. Wire CI _(automatico)_.
6. Drift count → ≤11 (~67%).
7. Commit.
