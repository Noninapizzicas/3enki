# Progreso de migración — 73 módulos al canon de 24 contratos

_Última regeneración: 2026-05-07T16:10:28Z_

Generado por `node arquitectura/migracion/scripts/progreso.js`. Ejecutar tras cada migración para refrescar.

## Estado global

- **Migrados**: 28 / 73 (38%)
- **Drifts cerrados**: 666 / 2971 (22%)
- **Drifts restantes en baseline**: 2305

### Progreso por capa

| Capa | Done | Total | % |
|------|------|-------|---|
| core | 13 | 16 | 81% `████████████████░░░░` |
| infra | 12 | 16 | 75% `███████████████░░░░░` |
| dominio | 3 | 38 | 8% `██░░░░░░░░░░░░░░░░░░` |
| tooling | 0 | 3 | 0% `░░░░░░░░░░░░░░░░░░░░` |

## Módulos migrados (28)

| # | Capa | Slug | LOC | Drifts antes → ahora | Commit |
|---|------|------|-----|----------------------|--------|
| 1 | core | `conversacion__ai-agent-framework` | 611 | 136 → 37 (-73%) | `af2f52a` 2026-05-03 |
| 2 | core | `scheduler` | 907 | 98 → 23 (-77%) | `077b2b4` 2026-05-04 |
| 3 | core | `composition-manager` | 1028 | 49 → 14 (-71%) | `665555a` 2026-05-06 |
| 4 | core | `database-manager` | 793 | 44 → 22 (-50%) | `edd468e` 2026-05-06 |
| 5 | core | `credential-manager` | 843 | 28 → 12 (-57%) | `069f8c8` 2026-05-06 |
| 6 | core | `gateway-manager` | 429 | 13 → 2 (-85%) | `8aa2b74` 2026-05-06 |
| 9 | core | `conversacion__agent-observer` | 217 | 0 → 0 (-0%) | `54b7b7c` 2026-05-03 |
| 10 | core | `channel-manager` | 590 | 30 → 13 (-57%) | `e7b3570` 2026-05-06 |
| 11 | core | `conversacion__chat-io` | 758 | 30 → 10 (-67%) | `d107b0f` 2026-05-07 |
| 12 | core | `conversacion__memory-user-profile` | 192 | 0 → 0 (-0%) | `6120cbd` 2026-05-03 |
| 13 | core | `project-manager` | 1504 | 57 → 24 (-58%) | `5e8e676` 2026-05-06 |
| 15 | core | `conversacion__memory-conversation-summary` | 288 | 0 → 0 (-0%) | `3e988d8` 2026-05-04 |
| 16 | core | `conversacion__memory-rag` | 381 | 0 → 0 (-0%) | `d131ebc` 2026-05-04 |
| 17 | infra | `filesystem` | 1075 | 186 → 66 (-65%) | `bb98306` 2026-05-06 |
| 18 | infra | `certificate-authority` | 409 | 67 → 24 (-64%) | `bc7b712` 2026-04-20 |
| 19 | infra | `firmware-manager` | 1084 | 67 → 31 (-54%) | `7e2eb66` 2026-05-06 |
| 20 | infra | `esp32-dev` | 767 | 41 → 20 (-51%) | `bfa6e6d` 2026-05-06 |
| 22 | infra | `firmware-builder` | 686 | 31 → 12 (-61%) | `d88eae5` 2026-05-07 |
| 23 | infra | `device-health` | 556 | 27 → 12 (-56%) | `0fc5e8d` 2026-05-07 |
| 24 | infra | `device-shadow` | 491 | 26 → 7 (-73%) | `9ba470d` 2026-05-07 |
| 25 | infra | `metricas` | 556 | 22 → 4 (-82%) | `b3a2a8a` 2026-05-07 |
| 26 | infra | `code-executor` | 484 | 19 → 9 (-53%) | `dcbe2c2` 2026-05-07 |
| 27 | infra | `security-p2p` | 292 | 16 → 6 (-63%) | `bc7b712` 2026-04-20 |
| 28 | infra | `system-inspector` | 376 | 14 → 5 (-64%) | `422eb92` 2026-05-07 |
| 30 | infra | `conversation-export` | 627 | 13 → 5 (-62%) | `fd86a7c` 2026-05-07 |
| 59 | dominio | `pizzepos__carta-design` | 545 | 18 → 8 (-56%) | `56a566a` 2026-05-07 |
| 65 | dominio | `conversacion__ai-gateway-poc` | 443 | 0 → 0 (-0%) | `939a7cc` 2026-05-02 |
| 67 | dominio | `pizzepos__cocina-poc` | 452 | 0 → 0 (-0%) | `5437466` 2026-05-02 |

## Próximos en la cola (top 10 de 45 pendientes)

| # | Capa | Slug | LOC | Drifts | Deps | Motivo pendiente |
|---|------|------|-----|--------|------|------------------|
| 7 | core | `plugin-manager` | 486 | 11 | 0 | drifts 6/11 (55%) — esperado <50% |
| 8 | core | `conversacion__ai-gateway` | 777 | 8 | 0 | drifts 8/8 (100%) — esperado <50% |
| 14 | core | `conversacion__prompt-builder` | 435 | 13 | 2 | drifts 7/13 (54%) — esperado <50% |
| 21 | infra | `device-registry` | 764 | 36 | 0 | drifts 20/36 (56%) — esperado <50% |
| 29 | infra | `prompt-manager` | 1236 | 69 | 1 | drifts 38/69 (55%) — esperado <50% |
| 31 | infra | `pdf-viewer` | 634 | 54 | 2 | drifts 39/54 (72%) — esperado <50% |
| 32 | infra | `telegram-service` | 573 | 32 | 2 | drifts 31/32 (97%) — esperado <50% |
| 33 | dominio | `esp32-flasher` | 1138 | 151 | 0 | drifts 118/151 (78%) — esperado <50% |
| 34 | dominio | `escandallo` | 1237 | 96 | 0 | sin tests/unit/ |
| 35 | dominio | `log-manager` | 598 | 82 | 0 | sin tests/unit/ |

<details><summary>Resto de pendientes (35 módulos)</summary>

| # | Capa | Slug | LOC | Drifts | Deps |
|---|------|------|-----|--------|------|
| 36 | dominio | `viabilidad` | 651 | 74 | 0 |
| 37 | dominio | `pizzepos__pedidos` | 918 | 72 | 0 |
| 38 | dominio | `staff-manager` | 394 | 67 | 0 |
| 39 | dominio | `pizzepos__cuentas` | 1224 | 65 | 0 |
| 40 | dominio | `notas` | 485 | 58 | 0 |
| 41 | dominio | `pizzepos__carta-scheduler` | 560 | 55 | 0 |
| 42 | dominio | `pizzepos__productos` | 1220 | 55 | 0 |
| 43 | dominio | `pizzepos__persistencia-comandero` | 1542 | 50 | 0 |
| 44 | dominio | `pizzepos__carta-digital` | 299 | 43 | 0 |
| 45 | dominio | `pizzepos__impresion` | 1258 | 43 | 0 |
| 46 | dominio | `pizzepos__carta-impresion` | 258 | 41 | 0 |
| 47 | dominio | `recetas` | 858 | 41 | 0 |
| 48 | dominio | `calling-generator` | 812 | 40 | 0 |
| 49 | dominio | `pizzepos__tarifas` | 309 | 40 | 0 |
| 50 | dominio | `pizzepos__carta-marketing` | 394 | 38 | 0 |
| 51 | dominio | `facturacion__asesoria` | 520 | 36 | 0 |
| 52 | dominio | `pizzepos__categorias` | 430 | 36 | 0 |
| 53 | dominio | `pizzepos__cocina` | 1233 | 36 | 0 |
| 54 | dominio | `pizzepos__comandero` | 809 | 36 | 0 |
| 55 | dominio | `pizzepos__menu-generator` | 338 | 34 | 0 |
| 56 | dominio | `pizzepos__ingredientes` | 697 | 33 | 0 |
| 57 | dominio | `perifericos` | 856 | 32 | 0 |
| 58 | dominio | `facturas` | 661 | 25 | 0 |
| 60 | dominio | `pizzepos__cobros` | 661 | 18 | 0 |
| 61 | dominio | `dashboard` | 361 | 17 | 0 |
| 62 | dominio | `pizzepos__variaciones` | 443 | 17 | 0 |
| 63 | dominio | `pizzepos__carta-manager` | 829 | 15 | 0 |
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

**Próximo módulo recomendado**: `plugin-manager` (capa core, 486 LOC, 11 drifts en baseline).

Pasos canónicos para el siguiente:

1. Leer auditoría completa: `arquitectura/auditoria/_outputs/modulo-completo/plugin-manager.json`
2. Identificar drifts del módulo: `node -e "const b=require('./drift-baseline.json').signatures; console.log(b.filter(s=>s.includes('plugin-manager')))"`
3. Aplicar los 5 helpers privados canónicos + reescritura siguiendo plantilla `modules/_template/`.
4. Tests por capas en `tests/unit/plugin-manager.test.js`.
5. Wire en `package.json` + `.github/workflows/validate.yml`.
6. Verificar drifts del módulo bajan ≥70%.
7. Commit + push + regenerar este PROGRESO.md.
