# pizzepos/carta-impresion — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/pizzepos/carta-impresion/`
- **Version actual**: 2.0.0 → bump a **3.0.0** post-rewrite.
- **LOC index.js**: 257.
- **Drifts en baseline**: 41 (scaffold detecta 38).
- **Categoria**: dominio pizzepos (tier_6_ui).
- **Idioma**: `es`.
- **Description oficial**: Genera versiones imprimibles de cartas en HTML print-ready. Los agentes deciden layout y generan con criterio adaptado a cada carta y marca.

## Responsabilidad acotada

Genera HTML print-ready de cartas (impresas en papel/PDF). El razonamiento creativo lo hacen 2 agentes (`impresion-architect` decide layout, `impresion-builder` genera HTML). El modulo es solo orquestacion: escucha `carta.actualizada` debounced, dispara architect, expone tools al builder para guardar el HTML resultante. Patron muy similar a `carta-digital`. NO se descompone.

## Inventario

### Publishes (2 — preservados invariantes)

- `agent.execute.request` — emitido por `dispatchGeneracion` para invocar al agente `impresion-architect`. Sub-contrato agent-flow.
- `carta.impresion.lista` — emitido en `saveHtml` tras persistir HTML+meta. Consumido por viewer/preview.

### Subscribes (3)

- `project.activated` → `onProjectActivated` (registra path).
- `project.deactivated` → `onProjectDeactivated` (no-op multi-tenant).
- `carta.actualizada` → `onCartaActualizada` (debounce 5s + dispatch architect).

### Tools (3)

- `impresion.get` → `toolGet` (devuelve HTML+meta del proyecto+carta).
- `impresion.generar` → `toolGenerar` (dispatch architect, devuelve 202).
- `impresion.save_html` → `toolSaveHtml` (usado por agente builder al terminar — guarda HTML+meta+publica `carta.impresion.lista`).

### UI handlers (3)

- `get` → `handleGet`
- `generar` → `handleGenerar`
- `health` → `handleHealth`

## Drifts (41 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_error_sin_metric` | 5 | Real — returns sin metric. | `_handleHandlerError`. |
| `drift_error_sin_log` | 5 | Real — returns sin logger. | Mismo helper. |
| `drift_error_como_string_suelto` | 4 | Real — `error: 'string'`. | `_errorResponse`. |
| `drift_ui_handler_sin_zone_canonica` | 3 | Real. | `zone: "barra_modulos"`. |
| `drift_ui_handler_sin_type_canonico` | 3 | Real. | `type: "workspace_module"`. |
| `drift_tool_handler_que_devuelve_valor_pelado` | 3 | Real — handlers devuelven `{ status, error: 'string' }`. | Helpers POC2. |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 3 | Real — module.json sin errores_conocidos. | Añadir por tool. |
| `drift_swallow_error_silently` | 2 | Real — `catch (_) {}` en `loadHtml` para `meta.json` y para HTML. | `_readJsonSafe` + log + metric. |
| `drift_silent_io_failure` | 2 | Real — mismo patron. | Mismo helper. |
| `drift_non_atomic_write` | 2 | Real — `saveHtml` escribe HTML + meta directos. | `_atomicWriteFile`. |
| `drift_undeclared_persistence_pattern` | 1 | Real — module.json sin persistence. | Declarar canonico. |
| `drift_rpc_over_pubsub` | 1 | **Falso positivo** — agent-flow es patron canonico. | Documentar. |
| `drift_publish_dominio_sin_project_id` | 1 | **Falso positivo** — payload ya lleva project_id top-level. | Documentar. |
| `drift_publish_atribuible_sin_user_id` | 1 | **Falso positivo** — payload ya lleva user_id: 'system'. | Documentar. |
| `drift_publish_agent_flow_sin_correlation_id` | 1 | **Falso positivo** — payload ya lleva correlation_id. | Documentar. |
| `drift_missing_onUnload_with_reservations` | 1 | **Falso positivo** — onUnload limpia los 3 Maps + clearTimeout. | Documentar. |
| `drift_log_spam_en_bucle` | 1 | Real — `for (const timer of debounceTimers.values())` + clearTimeout no es spam, es cleanup. **Falso positivo**. | Documentar. |
| `drift_generic_verb` | 1 | Real — `onCartaActualizada` (evento viene de carta-manager, no se renombra). | Drift residual. |
| `drift_correlation_id_no_propagado` | 1 | Real — falta tracing flag. | `tracing: true`. |

## Cosas criticas a preservar

1. **Patron de 2 agentes**: `impresion-architect` decide layout, `impresion-builder` genera HTML. El builder llama a `impresion.save_html` cuando termina.
2. **Debounce 5s** en `onCartaActualizada` — evita regenerar en rafagas de cambios.
3. **Multi-tenant** con 3 Maps (`projectPaths`, `htmlCache`, `debounceTimers`).
4. **Path de output**: `<storagePath>/pizzepos/cartas-impresion/<carta_id>.html` + `.meta.json` paralelo.
5. **`is_system` metadata** activa cwd como base.
6. **`agent.execute.request` payload completo** (correlation_id, request_id, user_id, agent_name, project_id, timestamp, context, task).

## Plan del rewrite

1. Archivar monolito (257 LOC). _(automatico)_
2. Reescribir `index.js` v3.0.0:
   - 5 helpers POC2 + auxiliares `_atomicWriteFile` + `_readJsonSafe`.
   - 3 tools con shape canonico + errores_conocidos.
   - 3 ui_handlers que delegan a tools.
   - `_publicarEvento` para los 2 publishes.
   - `saveHtml` con escritura atomica para HTML + meta.
   - `loadHtml` usa `_readJsonSafe` (no swallow).
   - Telemetria con prefix `carta-impresion.*`.
3. `module.json` v3.0.0: tracing true, ui_handlers canonicos, tools con errores_conocidos, config.persistence canonico.
4. Tests por capas: lifecycle, validacion, tools success (save_html, get, generar), bus subscribes (debounce + dispatch), persistencia, helpers POC2.
5. Wire CI _(automatico)_.
6. Drift count → ≤14 (~67%).
7. Commit.
