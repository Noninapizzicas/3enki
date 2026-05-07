# facturas — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/facturas/`
- **Version actual**: 2.0.0 → bump a **3.0.0** post-rewrite.
- **LOC index.js**: 572.
- **Drifts en baseline**: 68 (16 tipos).
- **Categoria**: dominio.
- **Idioma**: `es`.
- **Description oficial**: Procesamiento comercial de facturas: pipeline step-based con agentes IA, validacion y observabilidad. Pipeline v2 (`Intake → Convert → Prepare → OCR → Structure (IA) → Validate → Store`) con retry, timeout y metricas por paso.

## Responsabilidad acotada

Recibe facturas de cualquier formato (PDF, imagenes), las procesa por un pipeline de 7 pasos resumibles y persiste el resultado estructurado. Provee 3 tools al LLM y 9 ui_handlers al frontend. NO se descompone porque las 9 superficies + el pipeline comparten el mismo dominio (procesamiento fiscal de una factura). El pipeline ya esta separado en `pipeline/invoice-pipeline.js` + `pipeline/pipeline-metrics.js` (sub-modulos internos coherentes).

## Inventario de eventos

### Publishes — estado actual (drift bidireccional)

- **Declarados Y emitidos** (1):
  - `factura.exportada` — emitido en `handleExportar` tras generar CSV. Payload: `{ projectId, total, archivo }`. **En rewrite**: añadir `correlation_id` + `timestamp` via `_publicarEvento`.

- **Declarados PERO no emitidos** (3):
  - `factura.recibida` — manifest dice que existe; codigo no lo emite.
  - `factura.procesada` — idem.
  - `factura.error` — idem.

  **Decision rewrite**: AÑADIR las emisiones — son lifecycle events de observabilidad que respetan el manifest contract. Emitir en `onFacturaEntrada` (recibida tras validar archivo + emitir tras `procesarArchivo` exito → procesada / error → error). Esto cierra el drift sin romper consumers.

- **Emitido PERO no declarado** (1):
  - `telegram.send_message.request` — emitido fire-and-forget en `_notifyTelegramResult`. **Decision rewrite**: AÑADIR a `module.json.events.publishes` con descripcion. Cierra el drift de manifest mintiendo. Comportamiento del bus es preservado.

### Subscribes (1)

- `factura.entrada` → `onFacturaEntrada` (entrada del pipeline desde fuentes externas: telegram, gmail, manual).

### Tools (3) — preservadas literal

- `facturas.procesar` → `handleToolProcesar` — procesa un archivo PDF/imagen.
- `facturas.listar` → `handleToolListar` — lista facturas con filtros.
- `facturas.estadisticas` → `handleToolEstadisticas` — agregados del proyecto.

### UI handlers (9)

- `facturas/procesar` → `handleProcesar`
- `facturas/subir` → `handleSubir` (acepta archivo base64)
- `facturas/reprocesar` → `handleReprocesar`
- `facturas/listar` → `handleListar`
- `facturas/obtener` → `handleObtener`
- `facturas/actualizar` → `handleActualizar`
- `facturas/estadisticas` → `handleEstadisticas`
- `facturas/exportar` → `handleExportar` (genera CSV fiscal)
- `facturas/pipeline-metrics` → `handlePipelineMetrics`

## Drifts conocidos en baseline (68 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_error_sin_log` | 18 | Real — returns `{ status, error: 'string' }` sin logger en proximidad. | Helper `_handleHandlerError` o `_logError` antes de cada return. |
| `drift_error_sin_metric` | 18 | Real — mismos sites sin `metrics.increment`. | Mismo helper. |
| `drift_error_como_string_suelto` | 13 | Real — `error: 'proyecto e id son requeridos'`. | `_errorResponse(400, 'INVALID_INPUT', ..., { field: ... })`. |
| `drift_tool_handler_que_devuelve_valor_pelado` | 3 | Real — los 3 tools delegan a UI handlers con shape no canonico. | Tools envuelven el resultado canonicamente; AI tool handler `handleToolProcesar` devuelve `{ status, error: { code, message } }` no `{ status, data: { error } }`. |
| `drift_cross_module_persistence_access` | 2 | Real — facturas escribe a `data/projects/<projectId>/storage/...` directamente. | **Drift residual aceptado**: la persistencia real (DB de facturas, listar, obtener, etc.) ya esta delegada al provider `local.facturas-db` via `ServiceExecutor.call()`. El drift que queda son escrituras de archivos de entrada (`handleSubir`) y exports (`handleExportar`) — ambos casos donde el modulo necesita filesystem real del proyecto. Documentar como sample legitimo. |
| `drift_color_hex_custom_en_frontend_src` | 2 | Falso positivo — drift de un README de templates, no del modulo. | Documentar. |
| `drift_undeclared_persistence_pattern` | 1 | Real — module.json sin `config.persistence`. | Declarar `persistence: { type: "json-file + sqlite-via-provider", paths: [...] }`. |
| `drift_tool_errores_conocidos_vacio_handler_devuelve_error` | 1 | Real — los 3 tools en module.json no tienen `errores_conocidos`. | Añadir codes del catalogo por tool. |
| `drift_silent_io_failure` | 1 | Real — `fs.existsSync` + `fs.writeFileSync` sin manejo de errores explicito. | try/catch + `_logError`. |
| `drift_severity_invertida` | 1 | Real — `logger.debug` para `'facturas.telegram.notify.error'` (deberia ser warn/error). | Cambiar a `warn`. |
| `drift_rpc_over_pubsub` | 1 | Real — `services.call('local.facturas-db', ...)` espera respuesta sincrona sobre el bus. **Drift residual aceptado** — patron pre-existente del repo (mismo en otros modulos via ServiceExecutor). | Documentar. |
| `drift_publish_dominio_sin_project_id` | 1 | Real — `factura.exportada` lleva `projectId` (camelCase) pero validador busca `project_id`. | Renombrar a `project_id` snake_case + helper `_publicarEvento`. |
| `drift_missing_onUnload_with_reservations` | 1 | Real — onUnload no limpia `services/pipeline`. | Limpiar referencias en onUnload + flush de metricas pendientes. |
| `drift_markdown_con_shape_estructurable` | 1 | Falso positivo — README de templates. | Documentar. |
| `drift_generic_verb` | 1 | Real — handler `handleProcesar` parece "verbo generico" para el validator. | No tocable sin rename — preservar. Documentar. |
| `drift_correlation_id_no_propagado` | 1 | Real — `tracing.propaga_correlation_id` falta en module.json. | `tracing.propaga_correlation_id: true` + helper `_publicarEvento`. |

## Cosas criticas a preservar

1. **`factura.exportada`** evento — invariante (consumido por UI).
2. **`telegram.send_message.request`** envio fire-and-forget — telegram-service lo consume.
3. **`onFacturaEntrada`** subscribe a `factura.entrada` — entrada del pipeline.
4. **Pipeline v2 en `pipeline/invoice-pipeline.js`** — `process(filePath, projectId, options)` invariante.
5. **`pipeline-metrics.js`** — `record(result)` y `getDashboard()` invariantes.
6. **CSV fiscal con BOM `﻿` y separador `;`** — formato esperado por contabilidades españolas.
7. **Las 15 columnas del CSV en orden** (Fecha, Num_Factura, NIF_Emisor, ...) — invariantes.
8. **`escapeCsv` y `calcularSemanaISO`** — auxiliares preservados.
9. **`ServiceExecutor.call('local.facturas-db', ...)`** — ya es el patron canonico del repo para acceso a la DB de facturas via provider.
10. **3 tools con `name + parameters`** — invariantes (LLM los conoce).
11. **9 ui_handlers con `domain/action`** — invariantes (frontend los consume).
12. **Persistencia de archivos subidos** en `data/projects/<projectId>/storage/pendientes/<ts>_<safeName>` — preservar formato.
13. **Notificacion Telegram** del resultado al chat de origen — preservar logica de detecion y mensajes HTML.

## Naming/manifest mismatches a cerrar

- **`module.json.handlers`** → renombrar a `module.json.ui_handlers` (canonico). Añadir campos `type` + `zone`.
- **`method`** → renombrar a `handler` dentro de cada ui_handler (coherente con resto del repo).
- **`request_id` con `Date.now()`** → reemplazar por `crypto.randomUUID()`.
- **`projectId`** en payload de `factura.exportada` → `project_id` snake_case (evento del bus, no parametro JS).

## Plan del rewrite

1. Archivar monolito (572 LOC) en `_legacy/`. _(automatico)_
2. Reescribir `index.js` v3.0.0 al canon:
   - 5 helpers POC2: `_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, auxiliar `_escapeCsv`.
   - Auxiliar segundo: `_calcularSemanaISO` (preservado del monolito como helper privado).
   - 9 ui_handlers + 3 tool handlers con shape canonico `{ status, data | error: { code, message, details? } }`.
   - Telemetria con prefix `facturas.*`.
   - Emisiones lifecycle: `factura.recibida` (tras validar entrada), `factura.procesada` (tras pipeline.process exitoso), `factura.error` (tras pipeline.process fallido). Todos con `correlation_id + project_id + timestamp`.
   - `_notifyTelegramResult` usa `crypto.randomUUID()` para request_id.
   - onUnload limpia `services`, `pipeline`, `pipelineMetrics`.
3. `module.json` v3.0.0:
   - `tracing.propaga_correlation_id: true`.
   - Migrar `handlers` → `ui_handlers` con `type: "workspace_module"`, `zone: "barra_modulos"`.
   - Renombrar `method` → `handler` en cada entry.
   - Añadir `telegram.send_message.request` a `events.publishes` (fire-and-forget).
   - 3 tools con `errores_conocidos` enumerados.
   - `config.persistence`: `{ type: "mixed", description: "DB via provider local.facturas-db; archivos de entrada/export en data/projects/<id>/storage/" }`.
   - `observability.metrics.counters` ampliado con `facturas.errors`.
4. Tests por capas:
   - Group 1 Lifecycle: onLoad instancia services + pipeline, onUnload limpia.
   - Group 2 Validacion canonica: 9 ui_handlers + 3 tools sin args obligatorios → 400.
   - Group 3 Bus subscribes success: onFacturaEntrada con archivo valido emite recibida + procesada (mock pipeline).
   - Group 4 Bus subscribes error: onFacturaEntrada con archivo inexistente loguea + emite factura.error.
   - Group 5 UI handlers: handleProcesar/Subir/Reprocesar con mocks ServiceExecutor + filesystem.
   - Group 6 CSV export: generarCSV escribe con BOM y formato fiscal correcto.
   - Group 7 Helpers POC2.
5. Wire CI _(automatico)_.
6. Verificar drift count → cerrar baseline. Esperado: 68 → ≤21 (~70%).
7. Commit con metricas via `finish-rewrite.js`.
