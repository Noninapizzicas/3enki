# pizzepos/carta-digital — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/pizzepos/carta-digital/`
- **Version actual**: 2.0.0 → bump a **3.0.0** post-rewrite.
- **LOC index.js**: 298.
- **Drifts en baseline**: 43 (scaffold detecta 40).
- **Categoria**: dominio pizzepos (tier_6_ui).
- **Idioma**: `es`.
- **Description oficial**: Backoffice de la carta publica. Configura branding, compone carta final (datos + marketing + ofertas), genera PWA. Los agentes hacen el trabajo.

## Responsabilidad acotada

Configura branding por proyecto, escucha cambios de carta y tarifas, dispara agente `cartadigital-composer` para recomponer la carta publica, sirve la carta compuesta cacheada. NO se descompone — modulo pequeño con responsabilidad cohesiva.

## Inventario

### Publishes (1 unico, 2 sites)

- `agent.execute.request` — emitido en `onCartaActualizada` y `onTarifasActualizada` para invocar al agente `cartadigital-composer`. Sub-contrato `agent-flow`. Payload ya incluye `agent_name`, `task`, `context`, `correlation_id`, `request_id`, `user_id: 'system'`, `project_id`, `timestamp`. Drift residual: el modulo NO consume el `agent.execute.response` de respuesta — fire-and-forget hasta que el agente `cartadigital-composer` invoque `cartadigital.set_carta_compuesta` para guardar el resultado.

### Subscribes (4)

- `project.activated` → `onProjectActivated` (registra path + carga config).
- `project.deactivated` → `onProjectDeactivated` (no-op multi-tenant).
- `carta.actualizada` → `onCartaActualizada` (invalida cache + dispatch composer).
- `tarifas.config.actualizada` → `onTarifasActualizada` (invalida cache + dispatch composer).

### Tools (4)

- `cartadigital.get_config` → `toolGetConfig` (devuelve config branding).
- `cartadigital.update_config` → `toolUpdateConfig` (parche parcial).
- `cartadigital.get_carta_publica` → `toolGetCartaPublica` (devuelve carta cacheada).
- `cartadigital.set_carta_compuesta` → `toolSetCartaCompuesta` (usado por agente composer).

### UI handlers (4)

- `config` → `handleGetConfig`
- `update-config` → `handleUpdateConfig`
- `carta-publica` → `handleGetCartaPublica`
- `health` → `handleHealth`

## Drifts (43 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_ui_handler_sin_zone_canonica` | 4 | Real — sin `zone`. | `zone: "barra_modulos"`. |
| `drift_ui_handler_sin_type_canonico` | 4 | Real — sin `type`. | `type: "workspace_module"`. |
| `drift_tool_handler_que_devuelve_valor_pelado` | 4 | Real — `error: 'Se requiere project_id'`. | Helpers POC2 + shape canonico. |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 4 | Real — module.json sin errores_conocidos. | Añadir por tool. |
| `drift_error_sin_metric` | 4 | Real — returns sin metric. | `_handleHandlerError`. |
| `drift_error_sin_log` | 4 | Real — returns sin logger. | Mismo helper. |
| `drift_error_como_string_suelto` | 4 | Real — `error: 'string'`. | `_errorResponse`. |
| `drift_rpc_over_pubsub` | 2 | **Falso positivo aceptado** — `agent.execute.request` es patron canonico de agent-flow. | Documentar. |
| `drift_publish_dominio_sin_project_id` | 2 | **Falso positivo** — payload ya lleva project_id top-level. | Documentar. |
| `drift_publish_atribuible_sin_user_id` | 2 | **Falso positivo** — payload ya lleva user_id. | Documentar. |
| `drift_publish_agent_flow_sin_correlation_id` | 2 | **Falso positivo** — payload ya lleva correlation_id. | Documentar. |
| `drift_generic_verb` | 2 | Real — handler usa verbo generico. Evento `carta.actualizada` viene de carta-manager. | Preservar — drift residual. |
| `drift_undeclared_persistence_pattern` | 1 | Real — module.json sin persistence. | Declarar canonico. |
| `drift_non_atomic_write` | 1 | Real — `saveConfig` directo. | `_atomicWriteFile`. |
| `drift_missing_onUnload_with_reservations` | 1 | **Falso positivo** — onUnload limpia los 3 Maps. | Documentar. |
| `drift_inventar_error_code` | 1 | Real — `code: 'CONFIG_ERROR'` no esta en catalogo. | Reemplazar via `_errorResponse` con codes canonicos. |
| `drift_correlation_id_no_propagado` | 1 | Real — falta tracing flag. | `tracing: true`. |

## Cosas criticas a preservar

1. **`agent.execute.request`** payload completo — el agente `cartadigital-composer` lo consume.
2. **Patron RPC fire-and-forget**: composer invoca `cartadigital.set_carta_compuesta` para guardar resultado.
3. **Multi-tenant 3 Maps** preservados.
4. **`defaultConfig()`** shape — consumidores esperan tema/funcionalidades.
5. **Path de config**: `<storagePath>/pizzepos/carta-digital.json` (NO en sub-directorio).
6. **`is_system` metadata** activa cwd en lugar de base_path.
7. **Cache invalidation** por eventos `carta.actualizada` y `tarifas.config.actualizada`.

## Plan del rewrite

1. Archivar monolito (298 LOC). _(automatico)_
2. Reescribir `index.js` v3.0.0:
   - 5 helpers POC2 + auxiliar `_atomicWriteFile` + `_readJsonSafe`.
   - 4 tools con shape canonico.
   - 4 ui_handlers que delegan a tools.
   - Eliminar throw `CONFIG_ERROR`.
   - `_publicarEvento` para `agent.execute.request`.
   - `saveConfig` via `_atomicWriteFile`.
   - Telemetria `carta-digital.*`.
3. `module.json` v3.0.0: tracing true, ui_handlers canonicos, tools con errores_conocidos, config.persistence.
4. Tests por capas: lifecycle, validacion, tools success, bus subscribes, persistencia, ui handlers, helpers POC2.
5. Wire CI _(automatico)_.
6. Drift count → ≤14 (~67%).
7. Commit con metricas.
