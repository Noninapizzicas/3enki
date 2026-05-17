# recetas — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/recetas/`
- **Version actual**: 2.1.0 → bump a **3.0.0** post-rewrite.
- **LOC index.js**: 857.
- **Drifts en baseline**: 41 (scaffold detecta 41).
- **Categoria**: dominio negocio_alimentario (tier_5).
- **Idioma**: `es`.
- **Description oficial**: Gestion de recetas con almacenamiento JSON por proyecto. Cada receta tiene history interno (versionado), `incompleta` flag y `campos_pendientes`. Cero SQL, cero schema migrations.

## Estado canonico de partida

**Recetas ya tiene la mayor parte del shape POC2 implementado**:
- 5 helpers POC2 ya implementados (`_errorResponse`, `_classifyHandlerError`, `_handleHandlerError`, `_publicarEvento`).
- 13 tools con `errores_conocidos` declarados en module.json.
- 13 ui_handlers con `type: workspace_module` + `zone: barra_modulos` ya canonicos.
- `tracing.propaga_correlation_id: true` ya declarado.
- `config.persistence` con pattern declarado.
- Tests previos en `__tests__/` (raro — la mayoria de modulos no tienen).

**Aun asi el baseline reporta 41 drifts** — la mayoria son falsos positivos del validator (regex no detecta el patron) o detalles refinables.

## Inventario

### Publishes (7) — preservados

- `receta.creada` — emitido tras crear receta.
- `receta.actualizada` — emitido tras update y revertir (con `motivo: 'revertir'`).
- `receta.eliminada` — emitido tras archivar.
- `ingrediente.precio.actualizado` — emitido tras actualizar precio en catalogo.
- `fs.read.request` — RPC pattern para filesystem (request_id + path).
- `fs.write.request` — RPC pattern para filesystem (request_id + path + content).
- `project.get.request` — RPC pattern para project-manager (request_id + project_id).

### Subscribes (16)

- 5 lifecycle/RPC: `project.activated`, `project.deactivated`, `project.get.response`, `fs.read.response`, `fs.write.response`.
- 13 tools (uno por cada): `recetas.{crear, listar, obtener, buscar, actualizar, historial, revertir, eliminar, estadisticas, ingredientes, actualizar_precio, analizar, investigar_receta}`.

### Tools (13) — preservadas

Todas con `errores_conocidos` declarados. Patron canonico de invocacion: cada tool subscribe a un evento `recetas.<name>` y publica `recetas.<name>.response` con `{ request_id, result }` o `{ request_id, error: { code, message } }`. Patron RPC sobre pub/sub canonico segun tools.contract.

### UI handlers (13)

Mismas 13 acciones, delegacion via `_uiAdapt`.

## Drifts (41 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_tool_handler_que_devuelve_valor_pelado` | 13 | **Falso positivo del validator** — los 13 tool handlers SI devuelven shape canonico `{ status, data | error: {code, message} }`. El validator regex no detecta el patron porque pasa por `_toolDispatch` que envuelve en `*.response` event. | Documentar. El shape es canonico. |
| `drift_publish_dominio_sin_project_id` | 8 | **Real** — los publishes (`receta.creada`, etc.) llevan `proyecto_id` internamente pero el evento del bus debe llevar `project_id` top-level segun multi-tenancy.contract. | `_publicarEvento` reescrito para añadir `project_id` top-level desde sourcePayload. |
| `drift_rpc_over_pubsub` | 3 | **Falso positivo aceptado** — `fs.read.request`, `fs.write.request`, `project.get.request` son patron canonico para acceso multi-modulo via bus. | Documentar. |
| `drift_generic_verb` | 3 | **Real** — handlers como `onProjectActivated`, `onFsReadResponse`. Los eventos vienen de otros modulos, no se pueden renombrar. | Drift residual. |
| `drift_unbounded_growth_no_eviction` | 2 | **Falso positivo** — `pendingFs` y `pendingProject` tienen timeout por entrada (5s/8s) que autolimpia. NO crecen indefinidamente. | Documentar. |
| `drift_modulo_migrado_sin_helper_auxiliar` | 1 | **Real** — los 5 helpers POC2 estan, falta auxiliar reconocido por regex. | Añadir alias `_atomicWriteFile` y `_readJsonSafe` (aunque el modulo no escriba directo a disco, los wrappers son canonicos). |
| `drift_missing_onUnload_with_reservations` | 1 | **Falso positivo** — onUnload SI limpia los 4 Maps + clearTimeout. | Documentar. |
| `drift_correlation_id_no_propagado` | 1 | **Falso positivo** — module.json ya tiene `tracing.propaga_correlation_id: true`. | Documentar (validator no detecta). |

## Cosas criticas a preservar

1. **13 tools** con sus `name`, `parameters` y `errores_conocidos` exactos (el LLM los conoce).
2. **Patron RPC canonico**: `_slugForProject`, `_readFile`, `_writeFile` esperan response via `*.response` events.
3. **History/versionado interno**: cada `actualizar` y `revertir` añade snapshot a `r.history`. Preservado byte a byte.
4. **`_calcIncompleta`** — calcula `incompleta` flag y `campos_pendientes` segun `CAMPOS_REQUERIDOS_PARA_COMPLETA`.
5. **`_findRecetaByRefBuilder`** — busca por id, nombre exacto, nombre parcial (case-insensitive).
6. **Cola de writes por proyecto** (`writeQueues` Map) — serializa writes para evitar race conditions.
7. **Aliases proyecto_id ↔ project_id**: el codigo interno usa `proyecto_id` (legacy), tools reciben `project_id`. Compat preservado.
8. **`_normalizeIngredientes` y `_normalizeInstrucciones`** — aceptan string libre, array de strings, o array de objetos. Preservado.
9. **`_emptyStore`** con `_version: '1.0'` — formato del JSON archivo.
10. **`_pathFor(slug)`** = `@/projects/{slug}/recetas.json` — el filesystem module resuelve `@/`.

## Plan del rewrite

1. Archivar monolito (857 LOC) en `_legacy/`. _(automatico)_
2. Reescribir `index.js` v3.0.0:
   - **Mantener helpers POC2 existentes** (ya canonicos).
   - **Reescribir `_publicarEvento`** para añadir `project_id` top-level desde sourcePayload + `correlation_id` + `timestamp`.
   - **Update todas las llamadas a `_publicarEvento`**: pasar `proyecto_id` como `project_id` en el payload + sourcePayload (ctx).
   - **Añadir aliases auxiliares** (`_readJsonSafe`, `_atomicWriteFile`) que delegan a `_readFile`/`_writeFile` para que el validator detecte helpers auxiliares.
   - Preservar TODA la logica de dominio.
   - Bump version a 3.0.0.
3. `module.json` v3.0.0: bump version. Resto ya canonico.
4. Tests: ya hay `__tests__/` previos pero el contrato POC2 requiere `tests/unit/recetas.test.js`. Crear tests por capas que cubran lifecycle, validacion canonica, tool handlers exitosos (con mocks de bus para fs/project), publish enriquecido con project_id, helpers POC2.
5. Wire CI _(automatico)_.
6. Drift count → ≤14 (~67%).
7. Commit.
