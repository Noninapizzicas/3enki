# facturacion__asesoria — Mapa exhaustivo (PASO 0 del rewrite)

## Identidad

- **Path**: `modules/facturacion/asesoria/`
- **Version actual**: 1.0.0 → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 519.
- **Drifts en baseline**: 36 (10 tipos).
- **Categoria**: core.
- **Description oficial**: genera paquetes fiscales (CSV + ZIP con originales) para asesoria contable espaniola. Lee de `local.facturas-db`, empaqueta via `local.zip`.

## Responsabilidad acotada

Generar paquetes fiscales on-demand para entregar a asesoria contable. UNA responsabilidad:
empaquetar (CSV formato espaniol + resumen txt + originales en ZIP). NO procesa facturas
(eso es facturas/), NO modifica datos (solo lee), NO cobra/factura (eso es facturacion/).
Monolito coherente — la division interna (lifecycle + UI handlers + AI tools + core
generarPaquete + helpers) es correcta. NO se descompone.

## Inventario de eventos

### Publishes (1 emitido + 1 declarado-no-emitido)

- `asesoria.paquete.generado` — emitido en `index.js:258` tras crear ZIP. Payload:
  `{ projectId, archivo, facturas, periodo, totales, duration_ms }`. **Drift de payload**:
  no propaga `correlation_id`, no tiene `timestamp`, no tiene `project_id` top-level.
  Sin consumers en runtime — evento informativo.
- `asesoria.paquete.error` — declarado en manifest pero NUNCA emitido. **Drift declarativo
  a cerrar**: emitir desde catch de `handleGenerarPaquete` con shape `{ projectId,
  error, correlation_id, timestamp }`.

### Subscribes (0)

Modulo no reactivo: solo emite, no escucha. Correcto — flujo on-demand iniciado por UI o
AI tool.

### UI Handlers (4 → 5 con health)

- `asesoria.generar-paquete` → `handleGenerarPaquete` (frontend Svelte: `facturas.ts:511`).
- `asesoria.historial` → `handleHistorial` (frontend Svelte: `facturas.ts:542`).
- `asesoria.descargar` → `handleDescargar` (frontend Svelte: `facturas.ts:561`).
- `asesoria.preview` → `handlePreview`.
- `asesoria.health` → `handleHealth` (canonico, nuevo).

### AI Tools (2)

- `asesoria.generar-paquete` → `handleToolGenerarPaquete`.
- `asesoria.historial` → `handleToolHistorial` (delega a UI handler).

## Drifts conocidos en baseline (36, 10 tipos)

| Tipo | Naturaleza |
|---|---|
| `drift_handlers_shape_legacy` | Real — `module.json.handlers` viejo, falta `ui_handlers` con `type`/`zone`. |
| `drift_error_como_string_suelto` | Real — 9 returns con `error: 'string'`. |
| `drift_publish_dominio_sin_correlation_id` | Real — `asesoria.paquete.generado` sin correlation_id. |
| `drift_publish_dominio_sin_timestamp` | Real — sin timestamp top-level. |
| `drift_publish_declarado_no_emitido` | Real — `asesoria.paquete.error` declarado, jamas emitido. |
| `drift_tools_sin_errores_conocidos` | Real — tools sin `errores_conocidos[]`. |
| `drift_tool_return_no_canonico` | Real — tool devuelve `{status, data}` sin shape canonico. |
| `drift_error_sin_metric` | Real — error paths sin counter `asesoria.errors`. |
| `drift_error_sin_log` | Real — algunos catch sin `logger.error` estructurado. |
| `drift_signature_no_canonica` | Real — sin `tracing.propaga_correlation_id`. |

Patron: monolito pre-POC2. Todos los drifts reales se cierran con la reescritura.

## Cosas criticas a preservar

1. **Topics MQTT exactos**: `asesoria.generar-paquete`, `asesoria.historial`,
   `asesoria.descargar`, `asesoria.preview`. El frontend Svelte los invoca literal.
2. **Shape de retorno con `archivo`/`contenido`/`mimeType` base64**: `handleGenerarPaquete`
   y `handleDescargar` devuelven base64 inline. El frontend
   `triggerDownload(contenido, nombre, mimeType)` depende.
3. **CSV formato espaniol**: separator `;`, decimal `,`, BOM. Columnas exactas. Fila
   TOTALES al final. Formato fiscal regulado — no tocar.
4. **`local.facturas-db.listar` con filtro periodo YYYY-MM por `factura_fecha`** (no
   `fecha_entrada`): una factura de marzo puede subirse en abril.
5. **`local.zip.createFromFiles` con paths relativos al cwd**: el zip service usa
   `resolvePath` que transforma rutas absolutas. Preservar conversion a relativos.
6. **Path traversal seguro**: `handleDescargar` hace `path.basename(archivo)`.
7. **`incluirOriginales` flag**: cliente puede pedir solo CSV+resumen.
8. **`handleToolHistorial` delega a `handleHistorial`** con remap `projectId` -> `proyecto`.

## Plan del rewrite

1. Archivar monolito en `_legacy/`. _(automatico)_
2. Reescribir `index.js` v2.0.0:
   - 5 helpers POC2 + `_validateRequiredFields`.
   - Throws con `_code` canonico.
   - Handlers UI/Tool devuelven `{ status, data | error: { code, message } }`.
   - `_publicarEvento` para `asesoria.paquete.{generado,error}`.
   - Catch de `handleGenerarPaquete` emite `asesoria.paquete.error` (cierra drift).
   - Tool devuelve shape canonico con error code.
3. `module.json` v2.0.0:
   - `tracing.propaga_correlation_id: true`.
   - `ui_handlers[]` con `type: workspace_module`, `zone: barra_modulos`.
   - `tools[]` con `errores_conocidos`.
   - `config.persistence` declarado (filesystem-per-project).
   - `observability.metrics.counters` con prefix `asesoria.*`.
4. Tests por capas:
   - Group 1: Lifecycle.
   - Group 2: Validacion canonica.
   - Group 3: handleGenerarPaquete (success + error path emite asesoria.paquete.error).
   - Group 4: handleHistorial + handleDescargar (path traversal seguro).
   - Group 5: handlePreview + tools.
   - Group 6: CSV generation (separator, decimal, BOM, escaping, totales).
   - Group 7: Helpers POC2.
5. Wire CI. _(automatico)_
6. Commit + push via `finish-rewrite.js`.
