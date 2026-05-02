# Auditoría manifest-completo — resumen ejecutivo

**Fecha**: 2026-04-29
**Cobertura**: 66/66 módulos del repo
**Validador**: 66/66 PASS (schema JSON 2020-12 estricto + 8 checks cruzados por output)
**Tiempo wall-clock**: ~3 horas, 33 lotes (mayoría de 2 módulos en paralelo)
**Cero modificaciones al schema o validador desde el lote 1** — el contrato v2.0.0 aguantó las 66 extracciones.

---

## Estado de los módulos

| Estado | Cuenta | Módulos |
|---|---|---|
| **vivo** | 55 | mayoría — listados en config.modules.enabled |
| **dormido_por_diseno** | 8 | certificate-authority, dashboard, metricas, notas, scratch-designer, security-p2p, staff-manager, ui-designer |
| **candidato_a_retirada** | 3 | chat-io, prompt-builder, esp32-dev |
| fantasma | 0 | ningún módulo declarado en config sin existir en disco |

### Hallazgo clave — los 3 "candidatos a retirada"

- **`conversacion/chat-io` y `conversacion/prompt-builder`**: NO aparecen en `config.modules.enabled` ni `disabled`. **Pero el loader los carga por discovery recursivo**. El config solo lista por nombre a `ai-gateway` y `ai-agent-framework` (los otros 2 sub-módulos de conversacion). **Inconsistencia interna real del config**.
- **`esp32-dev`**: ya documentado como deprecado por firmware-builder, sin entrada en config. Confirmado candidato a retirada.

---

## Tier de carga inferido

26 módulos (40%) **no aparecen en ningún tier** declarado en `system.json.module_load_order.tiers` — el config dicta el orden, pero la documentación no lo refleja. Los pizzepos sub-módulos en particular tienen tier=null (sus nombres aparecen en `tier_5_domain_pizzepos` pero como strings sin path, p.ej. "cuentas" — el contrato busca por `name`, así que coincide).

| Tier | Cuenta |
|---|---|
| **null (no declarado en system.json)** | 26 |
| tier_5_domain_pizzepos | 12 |
| tier_6_ui | 7 |
| tier_3_core | 5 |
| tier_2_platform | 4 |
| tier_5_domain_negocio_alimentario | 3 |
| tier_4_features | 3 |
| tier_1_infra | 3 |
| tier_5_domain_facturacion | 2 |
| tier_1_infra_disabled | 1 |

---

## Volumen del sistema

- **290 eventos publicados** declarados (suma de `eventos.publica[]`)
- **281 eventos suscritos** declarados
- **147 tools** declaradas para el LLM
- **230 UI handlers** registrados
- **293 APIs HTTP** declaradas
- **16 intents** keyword→tool (pre-LLM intent matching)

### Top emisores de eventos
1. `filesystem` — 18 publica (nodo central de I/O)
2. `telegram-service` — 16
3. `pizzepos/cuentas-canales` — 11
4. `perifericos` — 10
5. `composition-manager` — 10

### Top exponedores de APIs HTTP
1. `scratch-designer` — 20 (disabled — UI nunca shipped)
2. `ui-designer` — 18 (disabled — idem)
3. `staff-manager` — 15 (disabled)
4. `prompt-manager` — 15
5. `project-manager` — 13

---

## Quirks estructurales del repo (capturados)

| Quirk | Cuenta | Observación |
|---|---|---|
| **eventos top-level** (`publishes`/`subscribes` sin envolver bajo `events:{}`) | 14 | Inconsistencia real del repo — el contrato lo lee defensivamente |
| **`handlers` en lugar de `ui_handlers`** | 5 | Otra forma de declarar UI handlers (con `method` en vez de `handler`). Normalizado por el contrato. |
| **`dev_only=true`** | 1 | Solo `system-inspector` lo declara. |
| **`main` no estándar** | 0 | Todos usan `index.js` o no lo declaran. |

---

## Outliers — claves no canónicas detectadas

Solo 6 outliers únicos en los 66 manifest. Cada uno aparece exactamente 1 vez:

| Outlier | Módulo | Naturaleza |
|---|---|---|
| `uiActions` | scheduler | Acciones UI declaradas — único en el repo |
| `strategies` | facturacion/fuentes | Strategies inline (Telegram, Gmail, manual) |
| `routeCode` | certificate-authority | Probablemente código de ruta para CA |
| `pipeline` | menu-generator | Pipeline OCR declarativo |
| `metodos_pago` | pizzepos/cobros | Métodos de pago aceptados |
| `icon` | scheduler | Icon UI |

**Conclusión**: el repo está muy estandarizado. La lista canónica de 27 keys cubre el 99% de casos. Los outliers son singularidades intencionales, no ruido.

---

## Drift contexto vs realidad — confirmado

Tres archivos de contexto desactualizados (ya señalados al principio de la sesión, ahora confirmados estructuralmente):

1. `contexto/index.json` dice 51 enabled / 10 disabled. **Realidad**: 55 vivos + 8 dormidos + 3 candidatos = 66 con module.json (62 enabled en config).
2. `contexto/system.json.module_load_order.tiers.tier_1_infra_disabled` lista `log-manager`, pero `log-manager` está **enabled** en config.json hoy. La auditoría lo refleja como vivo, tier=tier_1_infra_disabled — pequeña incoherencia heredada.
3. `contexto/SYSTEM-ANALYSIS.md` (de hace un mes) cifra 55/10 — desfasado en al menos 7 módulos no contados.

---

## Próximos pasos recomendados

1. **Análisis transversal en JSON** — script que cruce los 66 outputs y genere:
   - Eventos huérfanos (publicados sin suscriptor en otro módulo)
   - Eventos huérfanos al revés (suscritos sin emisor)
   - Tools duplicadas o cuasi-duplicadas
   - Mapa de dependencias implícitas (X publica → Y suscribe)
2. **Decidir sobre `chat-io` y `prompt-builder`**: ¿añadirlos al config.enabled (corrección honesta) o aceptar que el loader los recoja silenciosamente?
3. **Decidir sobre los 3 "candidatos a retirada"**: confirmar borrado de esp32-dev al menos.
4. **Iterar el contrato (v2.1?)**: si el análisis transversal revela campos relevantes que dejamos fuera (`observability.logging.correlation_id`, `histograms` en metrics, `confirmation` en tools, etc.), añadirlos. La misma extracción se puede correr de nuevo, idempotentemente.
5. **Empezar segunda parcela** — propuesta: `huerfanos-cross-system` (un único output que resuma huérfanos a nivel sistema) o **bajar al código** con una parcela de `contratos-publica` por módulo.
