# pizzepos/comandero — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/pizzepos/comandero/`
- **Version actual**: 2.0.0 → bump a **3.0.0** post-rewrite.
- **LOC index.js**: 808.
- **Drifts en baseline**: 36 (scaffold detecta 33).
- **Categoria**: dominio pizzepos.
- **Idioma**: `es`.
- **Description oficial**: Toma de pedidos pizzepos — buffer por cuenta, items con variaciones, envio a cocina.

## Responsabilidad acotada

Buffer de pedido por cuenta — el camarero añade items, modifica cantidades/notas, y envia a cocina. Mantiene caches de productos (catalogo + por carta) para resolver precio por canal de venta. Persiste el buffer transitorio en disco (debounced 1s) para sobrevivir restart. NO se descompone — modulo de orquestacion cohesiva.

## Inventario

### Publishes (4) — preservados invariantes

- `comandero.item_agregado` — emitido en `handleAddItem` tras añadir item al buffer.
- `comandero.item_eliminado` — emitido en `handleRemoveItem` y desde `handleUpdateItem` cuando cantidad → 0 (2 sites).
- `comandero.item_actualizado` — emitido en `handleUpdateItem` con `diff_cantidad` + `diff_precio`.
- `comandero.enviar_cocina` — emitido en `handleEnviarCocina` para que pedidos cree pedido formal.

### Subscribes (8)

- `cuenta.creada` → cache `ref_display`.
- `cuenta.actualizada` → actualiza cache `ref_display`.
- `caja.cerrada` → reset buffers.
- `dia.iniciado` → reset buffers.
- `catalogo.actualizado` → cachea productos.
- `producto.creado` → cachea producto.
- `producto.actualizado` → actualiza cache producto.
- `carta.actualizada` → cachea productos por carta para resolver precio por canal.

### UI handlers (7) — antes en `apis` HTTP-shape

- `get` → `handleGetPedido`
- `add-item` → `handleAddItem`
- `remove-item` → `handleRemoveItem`
- `update-item` → `handleUpdateItem`
- `send-kitchen` → `handleEnviarCocina`
- `health` → `handleHealthCheck`
- `buffers` → `handleListBuffers`

## Drifts (36 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_error_sin_metric` | 8 | Real — returns sin metric. | `_handleHandlerError`. |
| `drift_error_sin_log` | 8 | Real — returns sin logger. | Mismo helper. |
| `drift_error_como_string_suelto` | 8 | Real — `error: 'string'`. | `_errorResponse`. |
| `drift_publish_dominio_sin_project_id` | 5 | Real — payloads no llevan `project_id` top-level. | `_publicarEvento` lo añade. |
| `drift_metrica_sin_prefix_modulo` | 3 | **Falso positivo parcial** — `comandero.*` es prefix del DOMINIO conocido por consumidores. | Conservar + añadir `comandero.errors`. |
| `module_http_audit_completeness` | 1 | Real — `apis` HTTP-shape pero codigo usa uiHandler. | Migrar a `ui_handlers`. |
| `drift_silent_io_failure` | 1 | Real — `restaurarBuffers` y `guardarBuffers` con `catch (e)` semi-silencioso. | `_readJsonSafe` + log explicito. |
| `drift_correlation_id_no_propagado` | 1 | Real — falta tracing flag. | `tracing: true`. |
| `drift_auth_undeclared` | 1 | **Falso positivo** — modulo de proyecto sin auth. | Documentar. |

## Cosas criticas a preservar

1. **4 publishes** invariantes con sus payloads (cuentas + cocina los consumen).
2. **8 subscribes** invariantes (alto coupling con dominio pizzepos).
3. **Buffer por cuenta** `pedidos: Map<cuenta_id, { items, notas, total }>`.
4. **Cache de productos** (catalogo + por carta) para resolver precio por canal.
5. **Persistencia transitoria** del buffer en `./data/current/comandero_buffers.json` (debounced 1s).
6. **Items NO enviados se persisten** — los `enviado: true` ya estan en persistencia-comandero.
7. **`_detectarCanalCuenta`** con prefijos legacy + canonical (mesa_, M_, llevar_, L_, etc.).
8. **`_resolverPrecioCanal`** con cascada: carta del canal → cache general → precio request.
9. **Lazy load de tarifas module** via `moduleLoader.getModule('tarifas')`.
10. **Validation schemas** registrados via `core.validationManager` (4 schemas).
11. **Reset de buffers en `caja.cerrada` y `dia.iniciado`**.
12. **`enviado` flag por item** — items enviados no se reenvian.
13. **Marcado `pedido_id` y `enviado_at`** en items al enviar.

## Plan del rewrite

1. Archivar monolito (808 LOC) en `_legacy/`. _(automatico)_
2. Reescribir `index.js` v3.0.0:
   - 5 helpers POC2 + auxiliar `_atomicWriteFile` + `_readJsonSafe`.
   - 7 ui_handlers normalizados con shape canonico (validation gate antes del handler).
   - 8 bus handlers preservados.
   - `_publicarEvento` para los 4 publishes con `project_id` + `correlation_id` + `timestamp`.
   - `_guardarBuffers` (debounced) usa `_atomicWriteFile`.
   - `_restaurarBuffers` usa `_readJsonSafe`.
   - Eliminar `_registerUIHandlers` + `subscribeToEvents` (auto-wired).
   - Telemetria `comandero.*` (dominio) + `comandero.errors`.
3. `module.json` v3.0.0:
   - `tracing.propaga_correlation_id: true`.
   - Migrar `apis` → `ui_handlers` con `type: workspace_module`, `zone: barra_modulos`.
   - `config.persistence` declarada (json-file + atomic).
4. Tests por capas: lifecycle, validacion, bus subscribes (cache + reset), ui handlers add/remove/update/enviar, persistencia (atomic + restore), helpers POC2.
5. Wire CI _(automatico)_.
6. Drift count → ≤12 (~67%).
7. Commit.
