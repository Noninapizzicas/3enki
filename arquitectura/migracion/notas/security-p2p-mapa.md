# security-p2p — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/security-p2p/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 292.
- **Drifts en baseline**: 16 (8 tipos).
- **Categoria**: core.
- **Description oficial**: P2P Zero Trust Security with E2E Encryption

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (0)

- _(ninguno)_

### Subscribes (0)

- _(ninguno)_

## Drifts conocidos en baseline (16)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_non_canonical_routing` | 6 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_como_string_suelto` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_log` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 2 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_missing_onUnload_with_reservations` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_unbounded_growth_no_eviction` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_undeclared_persistence_pattern` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_test_sin_npm_script` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (292 LOC) en `_legacy/security-p2p-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `security-p2p.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/security-p2p.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
