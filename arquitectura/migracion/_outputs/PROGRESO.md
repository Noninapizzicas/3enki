# Progreso de migración — 73 módulos al canon de 24 contratos

_Última regeneración: 2026-05-06T07:02:55Z_

Generado por `node arquitectura/migracion/scripts/progreso.js`. Ejecutar tras cada migración para refrescar.

## Estado global

- **Migrados**: 12 / 73 (16%)
- **Drifts cerrados**: 264 / 3783 (7%)
- **Drifts restantes en baseline**: 3519

### Progreso por capa

| Capa | Done | Total | % |
|------|------|-------|---|
| core | 8 | 16 | 50% `██████████░░░░░░░░░░` |
| infra | 2 | 16 | 13% `███░░░░░░░░░░░░░░░░░` |
| dominio | 2 | 38 | 5% `█░░░░░░░░░░░░░░░░░░░` |
| tooling | 0 | 3 | 0% `░░░░░░░░░░░░░░░░░░░░` |

## Módulos migrados (12)

| # | Capa | Slug | LOC | Drifts antes → ahora | Commit |
|---|------|------|-----|----------------------|--------|
| 1 | core | `conversacion__ai-agent-framework` | 611 | 136 → 37 (-73%) | `af2f52a` 2026-05-03 |
| 3 | core | `scheduler` | 907 | 96 → 23 (-76%) | `077b2b4` 2026-05-04 |
| 6 | core | `credential-manager` | 843 | 28 → 12 (-57%) | `069f8c8` 2026-05-06 |
| 9 | core | `conversacion__agent-observer` | 217 | 0 → 0 (-0%) | `54b7b7c` 2026-05-03 |
| 12 | core | `conversacion__memory-user-profile` | 192 | 0 → 0 (-0%) | `6120cbd` 2026-05-03 |
| 13 | core | `project-manager` | 1307 | 49 → 20 (-59%) | _n/a_ |
| 15 | core | `conversacion__memory-conversation-summary` | 288 | 0 → 0 (-0%) | `3e988d8` 2026-05-04 |
| 16 | core | `conversacion__memory-rag` | 381 | 0 → 0 (-0%) | `d131ebc` 2026-05-04 |
| 20 | infra | `certificate-authority` | 409 | 61 → 24 (-61%) | `bc7b712` 2026-04-20 |
| 28 | infra | `security-p2p` | 292 | 16 → 6 (-63%) | `bc7b712` 2026-04-20 |
| 65 | dominio | `conversacion__ai-gateway-poc` | 443 | 0 → 0 (-0%) | `939a7cc` 2026-05-02 |
| 67 | dominio | `pizzepos__cocina-poc` | 452 | 0 → 0 (-0%) | `5437466` 2026-05-02 |

## Próximos en la cola (top 10 de 61 pendientes)

| # | Capa | Slug | LOC | Drifts | Deps | Motivo pendiente |
|---|------|------|-----|--------|------|------------------|
| 2 | core | `database-manager` | 1322 | 105 | 0 | sin tests/unit/ |
| 4 | core | `composition-manager` | 710 | 71 | 0 | sin tests/unit/ |
| 5 | core | `gateway-manager` | 312 | 44 | 0 | sin tests/unit/ |
| 7 | core | `plugin-manager` | 516 | 23 | 0 | sin tests/unit/ |
| 8 | core | `conversacion__ai-gateway` | 710 | 19 | 0 | sin tests/unit/ |
| 10 | core | `conversacion__chat-io` | 654 | 52 | 1 | drifts 32/52 (62%) — esperado <50% |
| 11 | core | `channel-manager` | 493 | 29 | 1 | sin tests/unit/ |
| 14 | core | `conversacion__prompt-builder` | 346 | 12 | 2 | drifts 7/12 (58%) — esperado <50% |
| 17 | infra | `filesystem` | 1290 | 195 | 0 | sin tests/unit/ |
| 18 | infra | `firmware-manager` | 1094 | 120 | 0 | drifts 86/120 (72%) — esperado <50% |

<details><summary>Resto de pendientes (51 módulos)</summary>

| # | Capa | Slug | LOC | Drifts | Deps |
|---|------|------|-----|--------|------|
| 19 | infra | `esp32-dev` | 735 | 82 | 0 |
| 21 | infra | `device-shadow` | 478 | 53 | 0 |
| 22 | infra | `code-executor` | 618 | 52 | 0 |
| 23 | infra | `firmware-builder` | 526 | 50 | 0 |
| 24 | infra | `device-registry` | 702 | 43 | 0 |
| 25 | infra | `metricas` | 714 | 29 | 0 |
| 26 | infra | `device-health` | 477 | 24 | 0 |
| 27 | infra | `system-inspector` | 236 | 20 | 0 |
| 29 | infra | `prompt-manager` | 1703 | 134 | 1 |
| 30 | infra | `conversation-export` | 553 | 24 | 1 |
| 31 | infra | `pdf-viewer` | 1097 | 101 | 2 |
| 32 | infra | `telegram-service` | 753 | 91 | 2 |
| 33 | dominio | `esp32-flasher` | 1138 | 145 | 0 |
| 34 | dominio | `pizzepos__carta-manager` | 594 | 125 | 0 |
| 35 | dominio | `escandallo` | 1237 | 96 | 0 |
| 36 | dominio | `recetas` | 741 | 89 | 0 |
| 37 | dominio | `log-manager` | 598 | 82 | 0 |
| 38 | dominio | `perifericos` | 739 | 79 | 0 |
| 39 | dominio | `viabilidad` | 651 | 74 | 0 |
| 40 | dominio | `pizzepos__carta-design` | 338 | 72 | 0 |
| 41 | dominio | `pizzepos__pedidos` | 918 | 72 | 0 |
| 42 | dominio | `facturas` | 573 | 67 | 0 |
| 43 | dominio | `staff-manager` | 394 | 67 | 0 |
| 44 | dominio | `pizzepos__cuentas` | 1224 | 65 | 0 |
| 45 | dominio | `pizzepos__carta-scheduler` | 560 | 55 | 0 |
| 46 | dominio | `pizzepos__productos` | 1220 | 55 | 0 |
| 47 | dominio | `notas` | 485 | 54 | 0 |
| 48 | dominio | `pizzepos__persistencia-comandero` | 1542 | 50 | 0 |
| 49 | dominio | `pizzepos__carta-digital` | 299 | 43 | 0 |
| 50 | dominio | `pizzepos__impresion` | 1258 | 43 | 0 |
| 51 | dominio | `pizzepos__carta-impresion` | 258 | 41 | 0 |
| 52 | dominio | `calling-generator` | 812 | 40 | 0 |
| 53 | dominio | `pizzepos__tarifas` | 309 | 40 | 0 |
| 54 | dominio | `pizzepos__carta-marketing` | 394 | 38 | 0 |
| 55 | dominio | `pizzepos__categorias` | 430 | 36 | 0 |
| 56 | dominio | `pizzepos__cocina` | 1233 | 36 | 0 |
| 57 | dominio | `pizzepos__comandero` | 809 | 36 | 0 |
| 58 | dominio | `facturacion__asesoria` | 520 | 35 | 0 |
| 59 | dominio | `pizzepos__menu-generator` | 338 | 34 | 0 |
| 60 | dominio | `pizzepos__ingredientes` | 697 | 33 | 0 |
| 61 | dominio | `pizzepos__cobros` | 661 | 18 | 0 |
| 62 | dominio | `dashboard` | 361 | 17 | 0 |
| 63 | dominio | `pizzepos__variaciones` | 443 | 17 | 0 |
| 64 | dominio | `pizzepos__cuentas-canales` | 368 | 4 | 0 |
| 66 | dominio | `notas-poc` | 642 | 0 | 0 |
| 68 | dominio | `facturacion__fuentes` | 264 | 20 | 1 |
| 69 | dominio | `text-editor` | 580 | 54 | 2 |
| 70 | dominio | `bot-manager` | 327 | 19 | 2 |
| 71 | tooling | `ui-designer` | 1281 | 120 | 0 |
| 72 | tooling | `scratch-designer` | 413 | 31 | 0 |
| 73 | tooling | `admin-panel` | 543 | 22 | 0 |

</details>

## Lecciones operativas (patrones reutilizables del POC2)

Patrones que han demostrado funcionar en migraciones completadas. Aplicables a las siguientes:

### Helpers privados canónicos (5 transferibles)

Cada módulo migrado añade estos 5 helpers privados (copy-paste con renombrado):

1. **`_errorResponse(status, code, message, details?)`** — construye `{status, error: {code, message, details?}}`.
2. **`_handleHandlerError(logEvent, err, kind)`** — log + metric.increment + clasifica error → response canónico.
3. **`_classifyHandlerError(err)`** — mapea Error.message a código canónico (RESOURCE_NOT_FOUND, VALIDATION_FAILED, etc.).
4. **`_classifyExecutionError(err)`** — mapea errores de upstream HTTP/timeout a códigos `UPSTREAM_*`.
5. **`_publicarEvento(name, payload, sourcePayload?)`** — publish con `correlation_id` propagado + timestamp obligatorio.

### Reducción de duplicación HTTP↔UI

Si el módulo declara `apis_http[]` Y `ui_handlers[]` que hacen lo mismo (caso scheduler), los handlers HTTP delegan en los UI handlers en lugar de duplicar lógica. Reducción típica: ~20% LOC.

### Tests aislados

Si el módulo persiste a archivo (json-file pattern), los tests usan `jobsPath` único en `/tmp/<modulo>-test-XXXX.json` para no contaminar datos reales del repo.

### Estructura de tests por capas

Suite organizada en grupos:
1. Lifecycle (onLoad/onUnload, no leak).
2. Validación canónica (cada error path con código + status correcto + details).
3. Success paths (handler crea + emite metric + publica con correlation_id + project_id).
4. Tools (shape canónico `{status, data | error}`, NO `success: bool` legacy).
5. Execution / dominio (publishes con correlation_id propagado).
6. HTTP delegation (handlers HTTP propagan shape canónico).
7. Helpers internos (cada helper testeado aisladamente).

## Decisiones pendientes / siguiente sesión

**Próximo módulo recomendado**: `database-manager` (capa core, 1322 LOC, 105 drifts en baseline).

Pasos canónicos para el siguiente:

1. Leer auditoría completa: `arquitectura/auditoria/_outputs/modulo-completo/database-manager.json`
2. Identificar drifts del módulo: `node -e "const b=require('./drift-baseline.json').signatures; console.log(b.filter(s=>s.includes('database-manager')))"`
3. Aplicar los 5 helpers privados canónicos + reescritura siguiendo plantilla `modules/_template/`.
4. Tests por capas en `tests/unit/database-manager.test.js`.
5. Wire en `package.json` + `.github/workflows/validate.yml`.
6. Verificar drifts del módulo bajan ≥70%.
7. Commit + push + regenerar este PROGRESO.md.
