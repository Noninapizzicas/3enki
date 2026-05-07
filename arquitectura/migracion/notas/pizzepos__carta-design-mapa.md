# pizzepos/carta-design — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/pizzepos/carta-design/`
- **Version actual**: 3.0.0 → bump a **4.0.0** post-rewrite.
- **LOC index.js**: 337.
- **Drifts en baseline**: 69 (12 tipos).
- **Categoria**: dominio pizzepos.
- **Idioma**: `es`.
- **Description oficial**: Estudio de diseño profesional de cartas impresas. Sistema multi-rol (10 roles, 4 fases) con entrevista, equipo creativo, guion maestro y produccion HTML. La inteligencia esta en el `prompt.json`, no en el codigo — el modulo provee tools al LLM y persiste resultados.

## Responsabilidad acotada

Provee 6 tools al LLM para diseñar cartas impresas: cargar datos de carta + estadisticas, guardar HTML+CSS generado, listar/guardar/borrar perfiles de estilo, listar galeria de diseños guardados. NO razona — el razonamiento esta en el prompt multi-rol del LLM. NO se descompone porque las 6 tools comparten el mismo dominio (diseño de cartas impresas) y la misma capa de persistencia (`storage/pizzepos/carta-design/`).

## Inventario de eventos (preservados invariantes)

### Publishes (1)

- `carta.html.generada` — emitido en `toolSave` tras escribir HTML + meta. Payload: `{ carta_id, html, title, filename }`. Lo abre `HtmlPreviewPanel` automaticamente. **En rewrite**: añadir `project_id` + `correlation_id` + `timestamp` al payload via `_publicarEvento`.

### Subscribes (3)

- `project.activated` → `onProjectActivated` (registra path del proyecto en `projectPaths`).
- `project.deactivated` → `onProjectDeactivated` (no-op preservado).
- `carta.actualizada` → `onCartaActualizada` (rename del handler — actualmente `onCartaGenerada`, mismatch documentado en outliers del audit). Solo loguea, NO regenera diseño automaticamente — el LLM espera tool explicita.

### Tools (6) — preservadas literal en name + parameters

- `design.load_carta` → `toolLoadCarta` — carga carta + stats agregadas.
- `design.save` → `toolSave` — escribe HTML + meta + emite `carta.html.generada`.
- `design.profiles` → `toolProfiles` — lista builtin + custom.
- `design.save_profile` → `toolSaveProfile` — persiste perfil custom.
- `design.delete_profile` → `toolDeleteProfile` — borra custom (rechaza builtin).
- `design.gallery` → `toolGallery` — lista diseños previos por carta_id.

### UI handlers (6)

Mismos 6 handlers expuestos via `mqttRequest` cross-modulo bajo dominio `design`. En el rewrite cada `tool*` se invoca tambien desde el ui_handler correspondiente — un solo metodo, dos puntos de entrada (LLM tool + UI mqttRequest). El shape canonico de retorno cubre ambos.

## Drifts conocidos en baseline (69 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_swallow_error_silently` | 9 | Real — `try {} catch (_) {}` en lectura de carta, perfiles, gallery. | Reemplazar por `try { ... } catch (err) { this.logger.warn(...); return null/[] }`. |
| `drift_silent_io_failure` | 9 | Real — mismo patron, fs.read* sin log. | Helper auxiliar `_readJsonSafe(path, kind)` que loguea + metric. |
| `drift_error_sin_log` | 9 | Real — returns `{ status: 400, error: '...' }` sin logger en proximidad. | Helper `_handleHandlerError` o `_logError` antes de cada return de error. |
| `drift_error_sin_metric` | 9 | Real — mismos sites sin metric increment. | Mismo helper. |
| `drift_ui_handler_sin_zone_canonica` | 6 | Real — module.json.ui_handlers sin `zone`. | Añadir `zone: "barra_modulos"` (modulo creativo de POS). |
| `drift_ui_handler_sin_type_canonico` | 6 | Real — sin `type`. | Añadir `type: "workspace_module"`. |
| `drift_tool_handler_que_devuelve_valor_pelado` | 6 | Real — handlers a veces devuelven `{ status, error: 'string' }` sin `error: { code, message }`. | Helpers POC2 + shape canonico. |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 6 | Real — module.json.tools[].errores_conocidos no esta declarado. | Añadir `errores_conocidos` por tool con codes del catalogo. |
| `drift_error_como_string_suelto` | 6 | Real — `error: 'Se requiere carta_id'`. | `_errorResponse(400, 'INVALID_INPUT', ...)`. |
| `drift_undeclared_persistence_pattern` | 1 | Real — module.json.config sin `persistence`. | Declarar `persistence: { type: "json-file", atomic: true }`. |
| `drift_publish_dominio_sin_project_id` | 1 | Real — `carta.html.generada` no lleva project_id top-level. | `_publicarEvento` lo añade. |
| `drift_non_atomic_write` | 1 | Real — `fs.writeFile` directa. | Helper auxiliar `_atomicWriteFile` con `.tmp + rename`. |
| `drift_missing_onUnload_with_reservations` | 1 | Real — onUnload no clear de Maps. | onUnload limpia Maps. |
| `drift_instruccion_en_message` | 1 | Real — instruye al usuario en `data.message`. | Mover a `data.user_hint` separado. |
| `drift_correlation_id_no_propagado` | 1 | Real — falta tracing flag. | `tracing.propaga_correlation_id: true`. |

## Naming mismatch a cerrar

- Subscribe a `carta.actualizada` con handler `onCartaGenerada` — **rename a `onCartaActualizada`**. Coherente con el evento.

## Cosas criticas a preservar

1. **Nombre del evento `carta.html.generada`** — invariante (consumido por `HtmlPreviewPanel`).
2. **Los 6 tools con sus `name` y `parameters`** — invariantes (el LLM los conoce).
3. **`builtinProfiles` cargados desde `design-profiles/*.json`** — 5 perfiles built-in. Carga preservada en onLoad.
4. **`projectPaths` por proyecto** con `featurePath` y `storagePath`.
5. **Filenames de outputs**: `${carta_id}_${slug}_${timestamp_base36}.html` + `.meta.json` paralelo.
6. **Ruta relativa retornada en `toolSave.data.path`** — `/storage/...` desde `storagePath`. HtmlPreviewPanel la consume.
7. **Default paths cuando no hay proyecto activo** — `process.cwd()/storage/pizzepos/...`.
8. **`builtin: true` flag** + rechazo de `delete_profile` sobre builtin.

## Plan del rewrite

1. Archivar monolito (337 LOC) en `_legacy/`. _(automatico)_
2. Reescribir `index.js` v4.0.0 al canon:
   - 5 helpers POC2: `_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, auxiliar `_atomicWriteFile` (escritura atomica via `.tmp + rename`).
   - Auxiliar segundo: `_readJsonSafe(filePath, kind)` que loguea + metric en errores I/O.
   - 6 tools con shape canonico `{ status, data | error: { code, message, details? } }`.
   - 6 ui_handlers que delegan a los tools.
   - Telemetria con prefix `carta-design.*`.
   - Rename `onCartaGenerada` → `onCartaActualizada`.
   - onUnload limpia Maps.
3. `module.json` v4.0.0:
   - `tracing.propaga_correlation_id: true`.
   - 6 ui_handlers con `type: "workspace_module"`, `zone: "barra_modulos"`.
   - 6 tools con `errores_conocidos` enumerados.
   - `config.persistence`: `{ type: "json-file", atomic: true }`.
   - `observability.metrics.counters` ampliado con `carta-design.errors`.
4. Tests por capas:
   - Group 1 Lifecycle: onLoad carga builtinProfiles, onUnload limpia.
   - Group 2 Validacion canonica: 6 tools sin args obligatorios → 400 INVALID_INPUT.
   - Group 3 Tools success: load_carta, save (publica + escribe atomico), profiles, save_profile, gallery.
   - Group 4 Tools edge: delete_profile sobre builtin → 403, sobre inexistente → 404.
   - Group 5 Bus subscribes: onProjectActivated registra paths, onCartaActualizada loguea.
   - Group 6 Persistence: _atomicWriteFile via .tmp + rename, _readJsonSafe devuelve null en error.
   - Group 7 Helpers POC2.
5. Wire CI _(automatico)_.
6. Verificar drift count → cerrar baseline. Esperado: 69 → ≤21 (~70%).
7. Commit con metricas via `finish-rewrite.js`.
