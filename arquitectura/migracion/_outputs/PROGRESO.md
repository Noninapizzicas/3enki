# Progreso de migración — 66 módulos al canon de 26 contratos

_Última regeneración: 2026-05-09T01:04:10Z_

Generado por `node arquitectura/migracion/scripts/progreso.js`. Ejecutar tras cada migración para refrescar.

## Estado global

- **Migrados**: 66 / 66 (100%)
- **Fuera del horizontal canónico**: 3 (`conversacion__ai-gateway-poc`, `notas-poc`, `pizzepos__cocina-poc`) — POCs exploratorios, no se migran.
- **Estado**: 🎉 horizontal cerrado al 100%.
- **Drifts cerrados**: 1002 / 2261 (44%)
- **Drifts restantes en baseline**: 1259

### Progreso por capa

| Capa | Done | Total horizontal | % |
|------|------|-------|---|
| core | 16 | 16 | 100% `████████████████████` |
| infra | 16 | 16 | 100% `████████████████████` |
| dominio | 33 | 33 | 100% `████████████████████` |
| tooling | 1 | 1 | 100% `████████████████████` |

## Módulos migrados (66)

| # | Capa | Slug | LOC | Drifts antes → ahora | Commit |
|---|------|------|-----|----------------------|--------|
| 1 | core | `scheduler` | 907 | 105 → 23 (-78%) | `077b2b4` 2026-05-04 |
| 2 | core | `composition-manager` | 1028 | 49 → 14 (-71%) | `665555a` 2026-05-06 |
| 3 | core | `database-manager` | 793 | 44 → 22 (-50%) | `edd468e` 2026-05-06 |
| 4 | core | `credential-manager` | 843 | 28 → 12 (-57%) | `069f8c8` 2026-05-06 |
| 5 | core | `gateway-manager` | 429 | 13 → 2 (-85%) | `8aa2b74` 2026-05-06 |
| 6 | core | `conversacion__ai-gateway` | 777 | 8 → 8 (-0%) | `92bd096` 2026-05-06 |
| 7 | core | `plugin-manager` | 495 | 8 → 6 (-25%) | `a25b855` 2026-05-06 |
| 8 | core | `conversacion__agent-observer` | 279 | 2 → 0 (-100%) | `2e263af` 2026-05-08 |
| 9 | core | `conversacion__ai-agent-framework` | 627 | 148 → 48 (-68%) | `3c227b8` 2026-05-08 |
| 10 | core | `channel-manager` | 590 | 30 → 13 (-57%) | `e7b3570` 2026-05-06 |
| 11 | core | `conversacion__chat-io` | 758 | 30 → 10 (-67%) | `d107b0f` 2026-05-07 |
| 12 | core | `conversacion__memory-user-profile` | 252 | 2 → 0 (-100%) | `5de7746` 2026-05-08 |
| 13 | core | `project-manager` | 1504 | 57 → 24 (-58%) | `5e8e676` 2026-05-06 |
| 14 | core | `conversacion__prompt-builder` | 435 | 13 → 7 (-46%) | `02d69c9` 2026-05-06 |
| 15 | core | `conversacion__memory-conversation-summary` | 339 | 2 → 0 (-100%) | `b7e84bc` 2026-05-08 |
| 16 | core | `conversacion__memory-rag` | 438 | 2 → 0 (-100%) | `d125ab7` 2026-05-08 |
| 17 | infra | `filesystem` | 1075 | 202 → 66 (-67%) | `bb98306` 2026-05-06 |
| 18 | infra | `firmware-manager` | 1084 | 67 → 31 (-54%) | `7e2eb66` 2026-05-06 |
| 19 | infra | `esp32-dev` | 767 | 41 → 20 (-51%) | `bfa6e6d` 2026-05-06 |
| 20 | infra | `device-registry` | 764 | 36 → 20 (-44%) | `e0a949d` 2026-05-07 |
| 21 | infra | `firmware-builder` | 686 | 31 → 12 (-61%) | `d88eae5` 2026-05-07 |
| 22 | infra | `certificate-authority` | 462 | 28 → 15 (-46%) | `3bef25a` 2026-05-08 |
| 23 | infra | `device-health` | 556 | 27 → 12 (-56%) | `0fc5e8d` 2026-05-07 |
| 24 | infra | `device-shadow` | 491 | 26 → 7 (-73%) | `9ba470d` 2026-05-07 |
| 25 | infra | `metricas` | 556 | 22 → 4 (-82%) | `b3a2a8a` 2026-05-07 |
| 26 | infra | `code-executor` | 484 | 19 → 9 (-53%) | `dcbe2c2` 2026-05-07 |
| 27 | infra | `security-p2p` | 450 | 18 → 10 (-44%) | `eac987b` 2026-05-08 |
| 28 | infra | `system-inspector` | 376 | 14 → 5 (-64%) | `422eb92` 2026-05-07 |
| 29 | infra | `prompt-manager` | 1236 | 69 → 38 (-45%) | `a34deac` 2026-05-07 |
| 30 | infra | `conversation-export` | 627 | 13 → 5 (-62%) | `fd86a7c` 2026-05-07 |
| 31 | infra | `pdf-viewer` | 634 | 54 → 39 (-28%) | `0db9ffa` 2026-05-07 |
| 32 | infra | `telegram-service` | 573 | 32 → 31 (-3%) | `4b227a9` 2026-05-07 |
| 33 | dominio | `esp32-flasher` | 1155 | 68 → 53 (-22%) | `8a170e4` 2026-05-08 |
| 34 | dominio | `pizzepos__carta-scheduler` | 605 | 62 → 51 (-18%) | `7ba10e6` 2026-05-08 |
| 35 | dominio | `log-manager` | 529 | 57 → 52 (-9%) | `66a1989` 2026-05-08 |
| 36 | dominio | `facturacion__asesoria` | 526 | 46 → 28 (-39%) | `f1e5c24` 2026-05-08 |
| 37 | dominio | `recetas` | 897 | 43 → 30 (-30%) | `8b80e86` 2026-05-07 |
| 38 | dominio | `escandallo` | 1098 | 40 → 22 (-45%) | `3539922` 2026-05-07 |
| 39 | dominio | `pizzepos__cocina` | 1206 | 33 → 27 (-18%) | `8de9e15` 2026-05-08 |
| 40 | dominio | `perifericos` | 856 | 32 → 22 (-31%) | `d84612a` 2026-05-07 |
| 41 | dominio | `pizzepos__carta-marketing` | 472 | 32 → 22 (-31%) | `c8f8ca7` 2026-05-08 |
| 42 | dominio | `pizzepos__cuentas` | 1016 | 32 → 11 (-66%) | `1f2733d` 2026-05-07 |
| 43 | dominio | `dashboard` | 400 | 26 → 12 (-54%) | `1e94204` 2026-05-08 |
| 44 | dominio | `pizzepos__tarifas` | 408 | 26 → 18 (-31%) | `484dea0` 2026-05-08 |
| 45 | dominio | `facturas` | 661 | 25 → 13 (-48%) | `e6c436d` 2026-05-07 |
| 46 | dominio | `pizzepos__carta-digital` | 401 | 25 → 16 (-36%) | `59a4b7a` 2026-05-07 |
| 47 | dominio | `pizzepos__pedidos` | 915 | 25 → 20 (-20%) | `7bdefd7` 2026-05-08 |
| 48 | dominio | `pizzepos__carta-impresion` | 382 | 19 → 11 (-42%) | `2e572eb` 2026-05-07 |
| 49 | dominio | `pizzepos__carta-design` | 545 | 18 → 8 (-56%) | `56a566a` 2026-05-07 |
| 50 | dominio | `staff-manager` | 494 | 18 → 2 (-89%) | `10739b7` 2026-05-07 |
| 51 | dominio | `pizzepos__carta-manager` | 829 | 15 → 15 (-0%) | `7356aa3` 2026-05-07 |
| 52 | dominio | `pizzepos__impresion` | 1075 | 13 → 10 (-23%) | `615190b` 2026-05-07 |
| 53 | dominio | `pizzepos__persistencia-comandero` | 1366 | 13 → 9 (-31%) | `57a641e` 2026-05-07 |
| 54 | dominio | `pizzepos__comandero` | 792 | 9 → 6 (-33%) | `1609472` 2026-05-07 |
| 55 | dominio | `pizzepos__categorias` | 451 | 6 → 4 (-33%) | `0fd3b9d` 2026-05-07 |
| 56 | dominio | `pizzepos__ingredientes` | 690 | 6 → 4 (-33%) | `30acbd0` 2026-05-07 |
| 60 | dominio | `pizzepos__cobros` | 700 | 29 → 24 (-17%) | `e85d54f` 2026-05-08 |
| 61 | dominio | `pizzepos__variaciones` | 497 | 17 → 14 (-18%) | `75aaa2b` 2026-05-08 |
| 62 | dominio | `pizzepos__cuentas-canales` | 418 | 15 → 12 (-20%) | `99dd4be` 2026-05-08 |
| 63 | dominio | `text-editor` | 567 | 70 → 67 (-4%) | `7e61744` 2026-05-08 |
| 64 | dominio | `viabilidad` | 789 | 48 → 30 (-38%) | `1e7f2c3` 2026-05-08 |
| 65 | dominio | `bot-manager` | 394 | 35 → 32 (-9%) | `6280986` 2026-05-08 |
| 66 | dominio | `pizzepos__productos` | 1265 | 26 → 23 (-12%) | `76b97ac` 2026-05-08 |
| 67 | dominio | `facturacion__fuentes` | 325 | 21 → 18 (-14%) | `7080a48` 2026-05-08 |
| 68 | dominio | `pizzepos__menu-generator` | 375 | 41 → 35 (-15%) | `41d067d` 2026-05-08 |
| 69 | tooling | `admin-panel` | 520 | 30 → 25 (-17%) | `f164658` 2026-05-08 |

## Próximos en la cola (top 10 de 0 pendientes)

| # | Capa | Slug | LOC | Drifts | Deps | Motivo pendiente |
|---|------|------|-----|--------|------|------------------|

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

🎉 **Todos los módulos migrados.** Cierre completo del horizontal.
