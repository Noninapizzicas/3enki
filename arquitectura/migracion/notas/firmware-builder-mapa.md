# firmware-builder — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/firmware-builder/`
- **Version actual**: 1.1.0 → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 526.
- **Drifts en baseline**: 50 (14 tipos).
- **Categoria**: infra (POC2 #20 del horizontal).
- **Description oficial**: Compilación de firmware ESP32 con arquitectura BASE + LÓGICA. Detecta drivers en firmware/drivers/, compila via PlatformIO

## Responsabilidad acotada

Compila drivers ESP32 detectados por convención (subdirectorio con `platformio.ini` en `firmware/drivers/`) ejecutando PlatformIO via `child_process.spawn`. Build asíncrono fire-and-forget: `handleBuild` devuelve `202 Accepted` y el cliente sondea con `handleBuildStatus`. NO se descompone — una sola responsabilidad ("compilar driver") con cuatro vistas (listar, compilar, ver estado, listar boards).

## Inventario de eventos (extraido del audit)

### Publishes (4 sites, 3 eventos canónicos)

- `firmware.build_started` — emitido en `_runBuild` (antes de `spawn`).
- `firmware.build_completed` — emitido en `_runBuild` (proc close code===0).
- `firmware.build_failed` — emitido en `_runBuild` (proc close code!==0).
- `firmware.build_failed` — emitido en `_runBuild` (proc on error: spawn ENOENT, etc.).

### Subscribes (0)

- _(ninguno — el upstream del módulo es la UI/tool que llama `handleBuild`)._

## Drifts conocidos en baseline (50)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_sin_log` | 6 | **REAL** — los 6 returns de error en handlers no tienen `logger.warn` próximo. Cierra con `_errorResponse` + log explícito. |
| `drift_error_sin_metric` | 6 | **REAL** — los 6 returns de error no llaman `metrics.increment('firmware-builder.errors', ...)`. Cierra igual. |
| `drift_swallow_error_silently` | 6 | **REAL parcial** — `try/catch (_)` en `_scanDrivers` (binario faltante, README ausente, driver.json ausente, src/ ausente, ini con regex fallida) son IO-best-effort legítimo, pero el validator quiere `logger.debug` mínimo. Cierra log a debug. |
| `drift_silent_io_failure` | 6 | **REAL parcial** — duplica el set anterior (mismas líneas) bajo "persistence". Misma resolución. |
| `drift_ui_handler_sin_type_canonico` | 4 | **FALSO POSITIVO LEGÍTIMO** — `type` ∈ {workspace_module, chat_tool, inline_render, system_panel} es decisión de UI design, no backend. firmware-manager/esp32-dev/device-shadow (todos migrados POC2) lo dejan también. Documentar en commit como residual. |
| `drift_ui_handler_sin_zone_canonica` | 4 | **FALSO POSITIVO LEGÍTIMO** — idéntico al anterior. Sin UI design definido, no se elige zone arbitraria. |
| `drift_publish_dominio_sin_project_id` | 4 | **FALSO POSITIVO LEGÍTIMO** — los eventos `firmware.build_*` son sistema-level, no per-proyecto (un build de driver no pertenece a un proyecto). Documentar en commit. |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 4 | **REAL** — declarar `errores_conocidos[]` por cada tool en module.json. |
| `drift_tool_handler_que_devuelve_valor_pelado` | 4 | **REAL** — los retornos de error son strings (`{status, error: 'string'}`), el validator detecta mal forma. Cierra al pasar a `_errorResponse`. |
| `drift_error_como_string_suelto` | 2 | **REAL** — duplica con el anterior. Misma resolución. |
| `drift_instruccion_en_message` | 1 | **REAL** — `"Usa builder.build-status para ver progreso."` en `handleBuild`. Cambiar a descripción no imperativa. |
| `drift_missing_onUnload_with_reservations` | 1 | **REAL** — `onUnload` no limpia `this.drivers`. Cierra con `this.drivers.clear()`. |
| `drift_log_spam_en_bucle` | 1 | **REAL** — `logger.warn('firmware.build.killed_on_unload', ...)` dentro del `for` de `onUnload`. Cierra moviendo a debug o agregando un info post-loop con count. |
| `drift_undeclared_persistence_pattern` | 1 | **FALSO POSITIVO PARCIAL** — el módulo NO persiste estado propio (lo lee del filesystem en cada scan). Cierra declarando `config.persistence: { pattern: 'filesystem-read-only', path: './firmware/drivers' }` para reflejar que solo lee. |

**Patrón principal**: ~32 drifts reales (errores sin log/metric/canonical, catches silenciosos, persistencia no declarada, instrucción en mensaje, onUnload incompleto) → cerrables con los 5 helpers POC2 + manifest completo. ~18 falsos positivos legítimos (type/zone canónicos, project_id en eventos sistema-level) — documentados en commit, igual que firmware-manager y esp32-dev.

## Cosas criticas a preservar (validacion post-rewrite)

1. **Eventos canónicos del bus**: `firmware.build_started`, `firmware.build_completed`, `firmware.build_failed` — shape preservado (campos visibles + nuevos: `correlation_id`, `timestamp`).
2. **Build asíncrono**: `handleBuild` debe seguir devolviendo `202 Accepted` inmediatamente, build en background, status sondeado por separado.
3. **Dedupe close/error**: el flag `resolved` evita doble resolución cuando spawn falla y dispara ambos handlers.
4. **Sliding-window de log**: `MAX_LOG_LINES=500` mantiene memoria acotada en builds largos.
5. **Distinción timeout vs error**: `code === null` ⇒ Node mató el proceso (timeout) ⇒ `reason: 'timeout'`; otro ⇒ `reason: 'compilation_error'`.
6. **Detección de drivers por convención**: subdirectorio con `platformio.ini` ⇒ driver compilable. Metadata opcional via `driver.json` y `README.md`.
7. **`PLATFORMIO_FORCE_COLOR=false`**: pasado en env del spawn para evitar códigos ANSI que rompan el parsing del log.
8. **Preservación de `last_build`/`last_build_status`**: re-escanear no debe perder el estado de builds anteriores. `prevState` lo restaura.
9. **`buildEnv = envName || board`**: el binario sale en `.pio/build/<env>/firmware.bin`; si el platformio.ini define `[env:foo]`, ese es el path.
10. **Acoplamiento con `firmware-manager`**: `firmware.build_completed` lleva `binary_path`, `binary_size`, `utility`, `description`, `capabilities` — firmware-manager auto-registra desde estos campos. El shape NO cambia.

## Plan del rewrite

1. Archivar monolito (526 LOC) en `_legacy/firmware-builder-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v2.0.0 al canon:
   - 5 helpers POC2: `_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `_parseBoardFromIni` (extrae `board` y `envName` del platformio.ini — ya existe inline, se extrae a método testeable).
   - Throws con `_code` canonico cuando aplique (no es necesario aquí — los handlers validan inline).
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `firmware-builder.*` (counter `firmware-builder.errors` con label `kind`+`code`).
   - Mantener prefix legacy `firmware.*` en métricas de dominio (`firmware.build_started.total`, etc.) — esos son contratos cross-módulo (firmware-manager los lee).
3. `module.json` v2.0.0:
   - `tracing.propaga_correlation_id: true`.
   - `errores_conocidos[]` por cada tool (4 tools).
   - `config.persistence: { pattern: 'filesystem-read-only', path: './firmware/drivers' }`.
   - Description actualizada mencionando POC2.
4. Tests por capas (`tests/unit/firmware-builder.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo — añadir asserts del estado inicial)_
   - Group 2: Validación canónica de `handleBuild` (5 paths: sin driver, driver inexistente, ya compilando, max concurrent, board inválido). Validación de `handleBuildStatus` (driver inexistente → 404).
   - Group 3: Success paths — `handleListBoards`, `handleListDrivers` con tmpdir vacío, `handleBuildStatus` sin filtro.
   - Group 4: Tools shape — cada tool devuelve `{status, data|error}` canónico.
   - Group 5: Driver scanner — escribir `platformio.ini` en tmpdir → `_scanDrivers` lo detecta; sin `platformio.ini` → ignorado.
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count baja ≥70% (50 → ≤15 esperado: cierra ~32 reales, quedan ~14 residuales legítimos).
7. Commit con metricas via `finish-rewrite.js`. Mensaje template:

   ```
   firmware-builder: reescritura canonica al ancho de los 24 contratos (POC2)

   Resultado:
   - LOC: 526 -> ~600 (++ helpers POC2)
   - Drifts en baseline: 50 -> ~15 (-70%)
   - Tests: 0 -> 18+ verdes
   - Version: 1.1.0 -> 2.0.0

   Drifts residuales legitimos (no se "arreglan"):
   - drift_ui_handler_sin_type_canonico (4) — type/zone canonicos son decision UI no backend
   - drift_ui_handler_sin_zone_canonica (4) — idem
   - drift_publish_dominio_sin_project_id (4) — firmware.build_* son sistema-level no per-proyecto
   ```
