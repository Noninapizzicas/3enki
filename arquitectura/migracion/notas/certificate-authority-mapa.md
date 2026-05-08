# certificate-authority — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.
Scaffold automatico via `scripts/scaffold-rewrite.js` — completa las secciones `<TODO>`.

## Identidad

- **Path**: `modules/certificate-authority/`
- **Version actual**: 1.0.0 → bump a **<TODO>** post-rewrite.
- **LOC index.js**: 409.
- **Drifts en baseline**: 67 (18 tipos).
- **Categoria**: core.
- **Description oficial**: Internal Certificate Authority with mTLS authentication for client portal and device management

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (0)

- _(ninguno)_

### Subscribes (0)

- _(ninguno)_

## Drifts conocidos en baseline (67)

| Tipo | Count | Naturaleza |
|---|---|---|
| `drift_ui_handler_sin_type_canonico` | 12 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_ui_handler_sin_zone_canonica` | 12 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_non_canonical_routing` | 9 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_log` | 8 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_sin_metric` | 8 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_error_como_string_suelto` | 6 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_color_hex_custom_en_frontend_src` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_auth_undeclared` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_missing_onUnload_with_reservations` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_signature_no_canonica` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_module_json_incompleto` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_returns_con_error_string` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_sin_5_helpers_poc2` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_sin_helper_auxiliar` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_sin_legacy_archivado` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_modulo_migrado_tests_sin_capas` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_undeclared_persistence_pattern` | 1 | <TODO clasificar: real / falso positivo / stale audit> |
| `drift_test_sin_npm_script` | 1 | <TODO clasificar: real / falso positivo / stale audit> |

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (409 LOC) en `_legacy/certificate-authority-monolito-pre-rewrite.js.bak`. _(automatico via scaffold)_
2. Reescribir `index.js` v<NEW> al canon:
   - 5 helpers POC2 (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, + auxiliar `<TODO>`).
   - Throws con `_code` canonico.
   - Handlers UI/HTTP devuelven `{ status, data | error: { code, message, details? } }`.
   - Telemetria completa con prefix `certificate-authority.*`.
3. `module.json` v<NEW>:
   - `tracing.propaga_correlation_id: true`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (`tests/unit/certificate-authority.test.js` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: `package.json` + `workflow.yml`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via `finish-rewrite.js`.
