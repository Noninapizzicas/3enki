# pizzepos__cuentas-canales — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/pizzepos/cuentas-canales/`
- **Version actual**: 5.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 418.
- **Drifts en baseline**: 3 (3 tipos).
- **Categoria**: core.
- **Description oficial**: Sistema unificado de canales de venta pizzepos con patron Strategy: mesa, telefono, llevar, glovo, whatsapp, llevadoo. Cada strategy registra ui_handlers especificos del canal y se subscribe a sus eventos. El modulo base orquesta cobro.procesado → detectarCanal → strategy.onCobroProcesado, gestiona reseteo diario de contadores y emite cuenta.{creada,cerrada} canonicos.

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (1)

- `cuenta.cerrada` — emitido en `onCobroProcesado` (handler de `cobro.procesado`).

### Subscribes (3)

- `cobro.procesado` → `onCobroProcesado`
- `pedido.creado` → `MesaStrategy.onPedidoCreado`
- `cocina.pedido_listo` → `TelefonoStrategy/LlevarStrategy/GlovoStrategy/WhatsAppStrategy.onCocinaPedidoListo`

## Drifts conocidos en baseline (3)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_signature_no_canonica` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_publish_dominio_sin_project_id` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_setinterval_subsegundo` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (418 LOC) en `_legacy/pizzepos__cuentas-canales-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `cuentas-canales.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/pizzepos__cuentas-canales.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
