# esp32-dev — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/esp32-dev/`
- **Version actual**: 1.0.0 → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 735.
- **Drifts en baseline**: 88 (21 tipos).
- **Categoria**: core.
- **Description oficial**: Desarrollo ESP32: templates, scaffolding de proyectos y compilación de firmware

## Responsabilidad acotada

Gestiona el ciclo completo de proyectos de firmware ESP32: scaffolding desde templates + compilación via PlatformIO CLI + persistencia del índice de proyectos. No se descompone: las 3 piezas (templates, build, persistence) son cohesivas del mismo dominio y comparten el mismo estado en memoria (`templates`, `projects`, `activeBuilds`).

## Inventario de eventos (extraido del audit)

### Publishes (5)

- `esp32.project_created` — emitido en `handleCreateProject`.
- `esp32.build_started` — emitido en `handleBuild`.
- `esp32.build_completed` — emitido en `_runBuild (proc close code===0)`.
- `esp32.build_failed` — emitido en `_runBuild (proc close code!=0)`.
- `esp32.build_failed` — emitido en `_runBuild (proc on error)`.

### Subscribes (0)

- _(ninguno)_

## Drifts conocidos en baseline (88)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_sin_metric` | 18 | ver análisis abajo |
| `drift_error_sin_log` | 17 | ver análisis abajo |
| `drift_error_como_string_suelto` | 9 | ver análisis abajo |
| `drift_ui_handler_sin_type_canonico` | 8 | ver análisis abajo |
| `drift_ui_handler_sin_zone_canonica` | 8 | ver análisis abajo |
| `drift_swallow_error_silently` | 5 | ver análisis abajo |
| `drift_publish_dominio_sin_project_id` | 5 | ver análisis abajo |
| `drift_silent_io_failure` | 3 | ver análisis abajo |
| `drift_design_doc_propio_de_modulo` | 2 | ver análisis abajo |
| `drift_non_atomic_write` | 2 | ver análisis abajo |
| `drift_instruccion_en_message` | 1 | ver análisis abajo |
| `drift_missing_onUnload_with_reservations` | 1 | ver análisis abajo |
| `drift_modulo_migrado_module_json_incompleto` | 1 | ver análisis abajo |
| `drift_modulo_migrado_returns_con_error_string` | 1 | ver análisis abajo |
| `drift_modulo_migrado_sin_5_helpers_poc2` | 1 | ver análisis abajo |
| `drift_modulo_migrado_sin_helper_auxiliar` | 1 | ver análisis abajo |
| `drift_modulo_migrado_sin_legacy_archivado` | 1 | ver análisis abajo |
| `drift_modulo_migrado_tests_sin_capas` | 1 | ver análisis abajo |
| `drift_log_spam_en_bucle` | 1 | ver análisis abajo |
| `drift_undeclared_persistence_pattern` | 1 | ver análisis abajo |
| `drift_test_sin_npm_script` | 1 | ver análisis abajo |

**Reales (≈16)**: 9 `drift_error_como_string_suelto` + 4 POC2 (`sin_5_helpers`, `sin_helper_auxiliar`, `module_json_incompleto`, `tests_sin_capas`) + 1 `modulo_migrado_returns_con_error_string` + 1 `sin_legacy_archivado` (cierra con scaffold) + 1 `test_sin_npm_script` (cierra con scaffold). **FP sistémicos (≈72)**: `drift_ui_handler_sin_type/zone_canonica` (16), `drift_error_sin_metric/log` (35), `drift_swallow_error_silently` (5 — catches silenciosos intencionados en _listFiles/stat), `drift_publish_dominio_sin_project_id` (5 — eventos de hardware, no de usuario), `drift_non_atomic_write` (2), `drift_design_doc_propio` (2), `drift_log_spam` (1), `drift_undeclared_persistence` (1), `drift_missing_onUnload` (1).

## Cosas criticas a preservar (validacion post-rewrite)

1. 8 ui_handlers (`list-templates`, `create-project`, `list-projects`, `get-project`, `build`, `build-status`, `list-boards`, `delete-project`) con sus status HTTP exactos (202 para build async, 409 para conflictos, 429 para quota).
2. 4 eventos del bus: `esp32.project_created`, `esp32.build_started`, `esp32.build_completed`, `esp32.build_failed` con sus payloads actuales.
3. Build asíncrono: `handleBuild` devuelve 202 inmediatamente; `_runBuild` corre en background.
4. SIGTERM en `onUnload` para matar builds activos + `activeBuilds.clear()`.
5. `_renderTemplate` con syntax `{{VAR}}` — los templates del filesystem lo usan.
6. Validación slug `project_name` con regex `/^[a-z0-9][a-z0-9-]*$/` (anti path-injection).
7. Rollback parcial en `handleCreateProject` (rm recursive en catch).
8. Persistencia `projects.json` cargada en `onLoad`, guardada tras cada operación de escritura.

## Plan del rewrite

1. Archivar monolito (735 LOC) en `_legacy/esp32-dev-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `esp32-dev.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/esp32-dev.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
