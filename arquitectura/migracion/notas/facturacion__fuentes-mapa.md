# facturacion__fuentes — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/facturacion/fuentes/`
- **Version actual**: 1.1.0 → bump a **2.0.0** post-rewrite.
- **LOC index.js**: 263 + 222 (telegram) + 199 (gmail) = 684 totales.
- **Drifts en baseline**: 19 (6 tipos).
- **Categoria**: core.
- **Description oficial**: adaptadores de fuentes de entrada para facturas (Telegram push, Gmail pull, extensible). Strategy pattern.

## Responsabilidad acotada

Adaptador strategy-pattern entre canales externos y el pipeline `facturas`. NO procesa
facturas (eso es facturas/), NO conoce formato fiscal, NO valida contenido del documento.
SOLO traduce input externo (telegram event, gmail attachment, manual upload) en
`factura.entrada` con `{ projectId, filePath, source, origen, correlation_id, timestamp }`.

NO se descompone porque las strategies son auxiliares (telegram = subscribe push, gmail =
pull on-demand) compartiendo `emitFacturaEntrada`. Aplastarlas pondria dos maquinas
distintas en un archivo. Mantenerlas como sub-archivos del modulo es la granularidad
correcta — el modulo entero es UN responsabilidad: "convertir input externo en
factura.entrada".

## Inventario de eventos (extraido del audit)

### Publishes (1)

- `factura.entrada` — emitido en `index.js:_emitFacturaEntrada` (delegado por strategies).
  Handler de `telegram.photo.received / telegram.document.received` y de UI
  `fuentes.check-gmail`. Payload canonico:
  `{ projectId, filePath, source, origen, correlation_id, timestamp }`.

  **Drift conocido**: el nombre `factura.entrada` no sigue `<module-prefix>.<entity>.<verb>`
  canonico (deberia ser `fuentes.factura.detectada`). NO se renombra en esta migracion
  porque `facturas/` (unico consumer) no esta migrado aun. Renombre coordinado se
  marca como `trabajo_pendiente` en module.json para cuando se migre `facturas/`.

### Subscribes (2)

- `telegram.photo.received` → `onTelegramPhoto` → delega a `TelegramStrategy`.
- `telegram.document.received` → `onTelegramDocument` → delega a `TelegramStrategy`.

### UI Handlers (4 → 5 con health)

- `fuentes.status` → `handleStatus` (estado de strategies + projectConfigs).
- `fuentes.get-config` → `handleGetConfig` (config fuentes de un proyecto).
- `fuentes.save-config` → `handleSaveConfig` (persiste config via `local.project-config`).
- `fuentes.check-gmail` → `handleCheckGmail` (trigger pull Gmail bajo demanda).
- `fuentes.health` → `handleHealth` (canonico, nuevo).

## Drifts conocidos en baseline (19)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_error_sin_metric` | 6 | Real — handlers sin counter en error path. |
| `drift_error_sin_log` | 5 | Real — algunos returns con error string sin logger.error. |
| `drift_error_como_string_suelto` | 4 | Real — `return { status: 400, error: 'string' }` en vez de `{ error: { code, message } }`. |
| `drift_log_spam_en_bucle` | 2 | Real — gmail strategy logea por cada attachment. Mantener: es info legitima del pipeline. |
| `drift_signature_no_canonica` | 1 | Real — `module.json.handlers` shape viejo en vez de `ui_handlers`. |
| `drift_publish_dominio_sin_project_id` | 1 | Real — `factura.entrada` payload no tenia `project_id` top-level (tenia `projectId` camelCase). |

Patron: el modulo nunca se canonizo despues de la introduccion de POC2. Todos los drifts
son reales y se cierran con la reescritura. El warning de log_spam queda (es info legitima).

## Cosas criticas a preservar (validacion post-rewrite)

1. **Subscribe a `telegram.{photo,document}.received`**: dispatch a TelegramStrategy.
2. **Publish `factura.entrada` con shape `{ projectId, filePath, source, origen }`**: el
   modulo `facturas/` lo espera asi (literal). Anyadir `correlation_id` y `timestamp`
   sin romper el shape existente.
3. **Strategy pattern**: `strategies/{telegram,gmail}.js` siguen como modulos auxiliares.
   `init(modulo)` los conecta al index. `cleanup()` en onUnload.
4. **`pendingDownloads` Set** en TelegramStrategy: dedup de fileId in-flight.
5. **`projectConfigs` Map**: cache de config por proyecto (lazy load via
   `local.project-config`).
6. **Path traversal seguro**: filenames de telegram/gmail saneados con
   `replace(/[^a-zA-Z0-9._-]/g, '_')`. Preservar.
7. **MIME-type filter**: `TIPOS_PERMITIDOS` en cada strategy. Preservar.
8. **UI handlers actuales con MQTT request**: `fuentes.{status,get-config,save-config,check-gmail}`.
   El frontend Svelte los invoca por estos topics — mantener nombres.
9. **`emitFacturaEntrada` punto unico**: todas las strategies pasan por aqui.
   Refactorizar a `_publicarEvento('factura.entrada', ...)` canonico.

## Plan del rewrite

1. Archivar monolito (263 LOC) en `_legacy/`. _(automatico via scaffold)_
2. Reescribir `index.js` v2.0.0 al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`,
     `_publicarEvento` + auxiliar `_validateRequiredFields`).
   - Throws con `_code` canonico (`INVALID_INPUT`, `RESOURCE_NOT_FOUND`,
     `DEPENDENCY_UNAVAILABLE`, `INTERNAL_ERROR`).
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message } }`.
   - Telemetria con prefix `fuentes.*`.
   - `factura.entrada` payload anade `correlation_id` + `timestamp` + `project_id`
     top-level (sin romper `projectId` legacy hasta migrar `facturas/`).
3. Refactor `strategies/{telegram,gmail}.js`:
   - Errores via `modulo._errorResponse`.
   - Logger estructurado.
   - `emitFacturaEntrada` → `modulo._publicarEvento` canonico.
4. `module.json` v2.0.0:
   - `tracing.propaga_correlation_id: true`.
   - `ui_handlers[]` con `type: workspace_module`, `zone: barra_modulos`.
   - `events.publishes[]` con descriptions explicitos.
   - `events.subscribes[]` con handler refs.
   - `config.persistence` declarado (filesystem-per-project para config + downloads).
   - `observability.metrics.counters` con prefix `fuentes.*`.
   - `trabajo_pendiente`: nota de renombre coordinado de `factura.entrada` con `facturas/`.
5. Tests por capas (`tests/unit/facturacion__fuentes.test.js`):
   - Group 1: Lifecycle.
   - Group 2: Validacion canonica de inputs.
   - Group 3: Strategy dispatch (telegram subscribers).
   - Group 4: Gmail check (pull on-demand).
   - Group 5: UI handlers (status, get-config, save-config, check-gmail, health).
   - Group 6: factura.entrada publish con correlation_id + project_id top-level.
   - Group 7: Helpers POC2.
6. Wire CI. _(automatico via scaffold)_
7. Verificar drift count + regenerar baseline.
8. Commit + push via `finish-rewrite.js`.
