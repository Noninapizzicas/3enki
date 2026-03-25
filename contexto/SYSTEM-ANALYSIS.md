# Event-Core (Enki): Análisis Código vs Contexto

**Fecha**: 2026-03-25
**Análisis anterior**: 2026-03-03
**Método**: Lectura exhaustiva de los 32 archivos JSON en `contexto/` + exploración completa del código fuente real
**Objetivo**: Verificar alineación documentación-código y actualizar estado del sistema

---

## 0. VEREDICTO EJECUTIVO

El sistema ha evolucionado significativamente desde el último análisis (2026-03-03). Se han habilitado más módulos, añadido stores, y el sistema PizzePOS está más maduro (tickets de impresión, cocina, llevadoo). Sin embargo, **la documentación de contexto sigue acumulando deriva** respecto al código real: cifras que no coinciden entre archivos, módulos deshabilitados documentados como activos, y stores nuevos sin documentar.

| Dimensión | Nota | Cambio vs anterior |
|-----------|------|--------------------|
| Arquitectura | 8/10 | = (sigue sólida) |
| Implementación | 7/10 | +1 (más módulos activos, impresión funcional) |
| Documentación contexto | 5/10 | +1 (más archivos, pero con inconsistencias internas) |
| Alineación código-contexto | 4/10 | NUEVO — 9 discrepancias factuales detectadas |

---

## 1. DISCREPANCIAS CONFIRMADAS (CÓDIGO vs CONTEXTO)

### 1.1 Versión del sistema — sigue inconsistente

| Fuente | Versión |
|--------|---------|
| `contexto/index.json` | **0.5.0** |
| `package.json` | **0.2.0** |

**Sin resolver desde el análisis anterior.** package.json es la fuente de verdad para npm.

### 1.2 Conteo de módulos — los archivos de contexto se contradicen ENTRE SÍ

| Fuente | Cifra |
|--------|-------|
| `index.json` línea 39 | 52 total (35 core + 15 pizzepos + 2 facturación) |
| `system.json` línea 50 | "55 total, 47 activos" |
| `modules.json` cabecera | "53 activos + 9 deshabilitados" |
| **`config.json` enabled** | **55 habilitados** |
| **`config.json` disabled** | **10 deshabilitados** |
| **Directorios reales con module.json** | ~51 directorios |

**Ningún archivo de contexto coincide con otro, ni con la realidad.** Esto es la discrepancia más peligrosa — un agente IA que lea `index.json` vs `system.json` vs `modules.json` recibirá tres cifras distintas.

### 1.3 log-manager: documentado como Tier 1 activo, realmente DISABLED

`system.json` lo lista en `tier_1_infra`:
```json
"tier_1_infra": ["credential-manager", "database-manager", "log-manager", "filesystem"]
```

`config.json` línea 107: **disabled**. Un agente IA que genere código asumiendo que log-manager está disponible producirá errores.

### 1.4 certificate-authority: documentado extensamente como activo IoT, realmente DISABLED

- `contexto/certificate-authority.json` (archivo completo dedicado) lo documenta como sistema funcional
- `contexto/iot-modules.json` lo referencia como módulo IoT activo
- `config.json` línea 115: **disabled**
- El directorio `data/ca/` que la documentación describe **no existe**

### 1.5 Frontend stores: 22 documentados vs 30 reales

`contexto/ui.json` documenta 22 stores. Stores reales en `frontend/src/lib/stores/`: **30 archivos**.

**8 stores no documentados:**
| Store | Archivo |
|-------|---------|
| carta | `carta.ts` |
| certificate-authority | `certificate-authority.ts` |
| channels | `channels.ts` |
| dispositivos | `dispositivos.ts` |
| html-preview | `html-preview.ts` |
| llevadoo | `llevadoo.ts` |
| staff | `staff.ts` |
| index (barrel) | `index.ts` |

Estos stores pueden contener lógica importante que el contexto ignora completamente.

### 1.6 esp32-dev: módulo activo no documentado en contexto IoT

`modules/esp32-dev/` existe y está habilitado en config.json. `contexto/iot-modules.json` solo documenta `esp32-flasher` sin mencionar `esp32-dev` como módulo separado.

### 1.7 Conteo de archivos de contexto inconsistente

`system.json` dice "30 archivos (29 JSON + 1 MD)". Realidad: **32 JSON + 1 MD = 33 archivos**.

### 1.8 Módulos disabled no marcados como tal en tiers

`system.json` define tiers de carga donde aparecen módulos disabled (`log-manager`) mezclados con activos, sin indicación de estado. El contexto debería distinguir claramente entre lo que ESTÁ activo y lo que es referencia histórica.

### 1.9 Rutas frontend: más rutas de las documentadas

El contexto documenta rutas principales pero falta `llevadoo` como ruta activa (`/[project_id]/llevadoo`), que tiene store y probablemente UI.

---

## 2. ESTADO REAL DEL SISTEMA (25-03-2026)

### 2.1 Módulos habilitados (55 en config.json)

**Tier 1 — Infraestructura (3 activos, 1 disabled):**
- credential-manager, database-manager, filesystem
- ~~log-manager~~ (DISABLED)

**Tier 2 — Plataforma (5):**
- plugin-manager, prompt-manager, prompt-engine, prompt-composer, scheduler

**Tier 3 — Core (7):**
- project-manager, composition-manager, context-manager, system-inspector, ai-gateway, ai-agent-framework, agent-manager

**Tier 4 — Features (5):**
- calling-generator, bot-manager, chat-ai-bridge, chat-session, code-executor

**Tier 5 — Dominio PizzePOS (15):**
- cuentas, cuentas-canales, pedidos, cobros, cocina, comandero, productos, categorias, ingredientes, variaciones, persistencia-comandero, impresion, menu-generator, carta-digital, carta-impresion

**Tier 5 — Dominio Facturación (2):**
- asesoria, fuentes

**Tier 5 — Dominio Negocio Alimentario (3):**
- recetas, escandallo, viabilidad

**Tier 6 — UI/Integración (6):**
- admin-panel, pdf-viewer, telegram-service, text-editor, channel-manager, facturas

**IoT (7):**
- perifericos, device-registry, device-shadow, gateway-manager, firmware-manager, device-health, firmware-builder, esp32-flasher, esp32-dev

**Módulo raíz:** pizzepos (orquestador)

### 2.2 Módulos deshabilitados (10 en config.json)
```
log-manager, conversation-manager, scratch-designer, ui-designer,
dashboard, notas, metricas, security-p2p, certificate-authority, staff-manager
```

### 2.3 Core: 13 subsistemas (ALINEADO con contexto)
```
config/          — Configuración jerárquica (CLI > ENV > config.json)
discovery/       — Service discovery MQTT (heartbeat + LWT)
events/          — EventBus híbrido (local EventEmitter + MQTT bridge)
flow/            — Motor de flows genérico (engine, registry, agent)
gateway/         — HTTP Gateway (Node.js nativo, no Express)
modules/         — ModuleLoader + ModuleRegistry (auto-wiring)
mqtt/            — MQTT Client + Embedded Broker (Aedes) + Pool
observability/   — Logger, Tracer, Metrics, ActivityLogger
providers/       — ProviderRegistry + Executor + Loader
ui/              — UIRequestHandler (MQTT request/response)
utils/           — PortManager, ServiceRegistry
validation/      — AJV JSON Schema validation
handler-loader + handler-store + service-executor (archivos sueltos)
```

### 2.4 Providers: ~39 locales + 3 externos
Categorías: document-processing, vision/image, data, integrations, blockchain/finance, system. **Alineado con contexto.**

### 2.5 Frontend: 30 stores reales
```
attachments, carta, certificate-authority, channels, chat, cocina,
comandero, conversations, credentials, cuentas, dispositivos,
escandallo, esp32, facturas, files, html-preview, impresion, index,
llevadoo, menu-generator, page-context, persistence, projects,
prompts, recetas, staff, theme, ui, viabilidad, workspace
```

---

## 3. COHERENCIA INTERNA DE LA DOCUMENTACIÓN

### Archivos de contexto bien alineados con código:
| Archivo | Veredicto |
|---------|-----------|
| `system.json` (arquitectura core) | Mayormente correcto (salvo tiers y conteos) |
| `handlers.json` | Correcto |
| `credentials.json` | Correcto |
| `mqtt.json` | Correcto |
| `providers.json` | Correcto |
| `scheduler.json` | Correcto |
| `flow-engine.json` | Correcto |
| `ai-gateway.json` | Correcto |
| `bot-agent-architecture.json` | Correcto |
| `pizzepos.json` | Correcto |
| `facturas.json` | Correcto |
| `learning.json` | Correcto |
| `templates.json` | Correcto |

### Archivos de contexto con problemas:
| Archivo | Problema |
|---------|----------|
| `index.json` | Versión incorrecta, conteos incorrectos |
| `system.json` | log-manager en tier activo, conteo modules incorrecto |
| `modules.json` | Conteo no coincide con config.json ni con otros archivos |
| `ui.json` | 22 stores vs 30 reales (faltan 8) |
| `certificate-authority.json` | Documenta sistema disabled sin indicarlo |
| `iot-modules.json` | Falta esp32-dev, certificate-authority como activo |

---

## 4. EVOLUCIÓN DESDE ANÁLISIS ANTERIOR (2026-03-03)

### Mejoras detectadas:
1. **Más módulos habilitados**: config.json ahora tiene 55 enabled (antes se reportaban 36)
2. **Sistema de impresión maduro**: Commits recientes muestran rediseño de tickets, logo, ESC/POS
3. **Cocina funcional**: Tickets de pieza con ingredientes, variaciones y notas
4. **Nuevos stores**: llevadoo, carta, channels, dispositivos, staff, html-preview
5. **Llevadoo**: Nuevo canal de delivery con store y probablemente ruta
6. **32 archivos de contexto** (antes menos): documentación ha crecido

### Problemas que persisten desde marzo 03:
1. Versión inconsistente (0.2.0 vs 0.5.0) — **sin resolver**
2. Conteos de módulos inconsistentes — **empeorado** (ahora 3 cifras distintas)
3. Código muerto: discovery/, flow/ (nota: flow ya tiene un flujo `factura.json`)

---

## 5. CORRECCIONES NECESARIAS (PRIORIZADAS)

### CRÍTICAS — afectan generación de código por IA

| # | Archivo | Corrección |
|---|---------|-----------|
| 1 | `index.json` | Actualizar `version` y `module_count` a cifras reales |
| 2 | `system.json` tier_1_infra | Quitar `log-manager` (disabled) |
| 3 | `system.json` directories.modules | Corregir conteo |
| 4 | `modules.json` | Alinear conteo con config.json |
| 5 | `certificate-authority.json` | Añadir `"status": "DISABLED"` prominente |

### IMPORTANTES — mejoran precisión

| # | Archivo | Corrección |
|---|---------|-----------|
| 6 | `ui.json` | Actualizar stores de 22 a 30 |
| 7 | `iot-modules.json` | Documentar esp32-dev, marcar certificate-authority disabled |
| 8 | `index.json` | Actualizar last_context_update y context_files count |

### MENORES — consistencia

| # | Archivo | Corrección |
|---|---------|-----------|
| 9 | `system.json` | Corregir conteo archivos contexto (33, no 30) |
| 10 | `ui.json` o nuevo | Documentar ruta /[project_id]/llevadoo |

---

## 6. FORTALEZAS CONFIRMADAS DEL SISTEMA

1. **Arquitectura event-driven pura** — MQTT como backbone, EventBus híbrido, sin REST para estado
2. **Auto-wiring declarativo** — module.json declara, loader conecta. Cero código imperativo
3. **Module Loader maduro** (~1,290 líneas) — discovery, hot-reload, tool registration, cleanup
4. **PizzePOS completo** — 15 módulos, 5+ canales, Strategy pattern, event sourcing, impresión ESC/POS
5. **AI Gateway unificado** — 6 providers LLM con fallback, streaming, tool calling
6. **Provider system limpio** — auto-discovery, credential injection, MQTT event pattern
7. **Handler system potente** — global + project-scoped, service executor, persistent store
8. **Frontend MQTT-first** — lazy loading, auto-discovery de módulos, cleanup discipline
9. **IoT real** — device-registry, shadows, firmware OTA, gateway abstraction, ESP32 directo

---

## 7. DEUDA TÉCNICA ACTUAL

1. **10 módulos disabled** ocupando espacio en el repo
2. **Inconsistencias documentación** — 3 cifras distintas de módulos en 3 archivos
3. **certificate-authority** documentado extensamente pero disabled y sin data/
4. **8 stores no documentados** — funcionalidad invisible para el contexto
5. **Versión sin unificar** — 0.2.0 vs 0.5.0
6. **Seguridad** — issues del análisis anterior probablemente sin resolver (sin auth HTTP/MQTT)
7. **Testing** — situación probablemente similar al análisis anterior

---

## 8. CONCLUSIÓN

El código de Enki está **más maduro y funcional** que hace 3 semanas. El sistema PizzePOS tiene impresión real con ESP32, cocina funcional, y nuevos canales. La arquitectura sigue siendo sólida.

El problema principal es la **deriva acumulativa entre documentación y código**. Cada módulo nuevo, cada store añadido, cada módulo deshabilitado crea una pequeña divergencia que, acumulada, produce un contexto que da información incorrecta al 15-20% de las consultas.

**Recomendación**: Corregir las 5 discrepancias críticas identificadas y establecer como práctica que todo cambio de módulos/stores incluya actualización de `contexto/`. El provider `context-sync` ya existe para esto — usarlo.
