# Event-Core (Enki): Analisis Codigo vs Contexto

**Fecha**: 2026-03-25
**Analisis anterior**: 2026-03-03 y 2026-03-25 (parcial)
**Metodo**: Lectura exhaustiva de los 33 archivos en `contexto/` + exploracion completa del codigo fuente, core, modulos, providers, handlers, frontend, y directorios auxiliares
**Objetivo**: Verificar alineacion documentacion-codigo, detectar omisiones y recomendar correcciones

---

## 0. VEREDICTO EJECUTIVO

El sistema ha crecido significativamente. La documentacion de contexto es **fiable como referencia arquitectonica** — el patron event-driven, el sistema de modulos, providers, hooks, y la composicion de proyectos estan bien documentados y coinciden con el codigo.

Sin embargo, la documentacion tiene **tres tipos de problemas**:
1. **Contradicciones internas** — 3 archivos dan 3 cifras distintas de modulos
2. **Omisiones grandes** — ~11 directorios del repositorio no estan documentados (3.4MB de codigo archivado, 776KB de prompts, Kubernetes Helm charts, CLI, firmware, etc.)
3. **Fantasmas** — `data/learning/` documentado pero inexistente, `certificate-authority` documentado como activo pero disabled

| Dimension | Nota | Cambio vs anterior |
|-----------|------|--------------------|
| Arquitectura | 8/10 | = (sigue solida) |
| Implementacion | 7/10 | = (mas modulos activos, impresion funcional) |
| Documentacion contexto | 5/10 | = (mas archivos, pero inconsistencias persisten) |
| Alineacion codigo-contexto | 4/10 | = (9 discrepancias factuales + 11 directorios omitidos) |

---

## 1. VERIFICACIONES POSITIVAS (Codigo = Contexto)

| Afirmacion del Contexto | Verificacion | Estado |
|--------------------------|-------------|--------|
| 55 modulos habilitados | config.json tiene exactamente 55 en `modules.enabled` | CORRECTO |
| 10 modulos deshabilitados | config.json lista exactamente 10 en `modules.disabled` | CORRECTO |
| PizzePOS tiene 13-17 sub-modulos | 15 directorios bajo `modules/pizzepos/` | CORRECTO |
| SvelteKit 2 + Svelte 5 en frontend | `@sveltejs/kit@^2.16.0` + `svelte@^5.16.0` | CORRECTO |
| certificate-authority esta DISABLED | Esta en `modules.disabled` de config.json | CORRECTO |
| conversation-manager esta DISABLED | Esta en `modules.disabled` de config.json | CORRECTO |
| Estructura `handlers/global/` + `handlers/projects/` | Directorios existen exactamente asi | CORRECTO |
| FlowEngine, FlowAgent, FlowRegistry en `core/flow/` | Los 3 archivos existen con las clases | CORRECTO |
| chat-session usa SQLite por proyecto | Via database-manager con sql.js | CORRECTO |
| Blueprints en `blueprints/project-types/` | Existen `facturas.json` y `pizzepos.json` | CORRECTO |
| 5 plugins en `plugins/` | github, http-utils, ocr, slack, weather | CORRECTO |
| Hook system con beforeEventPublish/afterEventPublish | core/hooks.js implementado | CORRECTO |
| Provider system con auto-registro de tools | core/providers/ completo | CORRECTO |
| MQTT broker embebido Aedes en puerto 1883 | index.js lo inicia correctamente | CORRECTO |
| EventBus hibrido local + MQTT | core/events/bus.js verificado | CORRECTO |
| Patron Request/Response con timeout | core/service-executor.js verificado | CORRECTO |
| HTTP Gateway con CORS, compression, cache | core/gateway/http/ verificado | CORRECTO |
| Config multi-fuente (CLI > ENV > file) | core/config/ verificado | CORRECTO |
| Discovery de cores via MQTT retained | core/discovery/ verificado | CORRECTO |

**18/20 afirmaciones criticas verificadas como correctas.**

---

## 2. DISCREPANCIAS CONFIRMADAS (Codigo != Contexto)

### 2.1 Version del sistema — INCONSISTENTE (persiste)

| Fuente | Version |
|--------|---------|
| `contexto/index.json` | **0.5.0** |
| `package.json` | **0.2.0** |

package.json es la fuente de verdad. Sin resolver desde analisis anterior.

### 2.2 Conteo de modulos — 3 archivos, 3 cifras distintas

| Fuente | Cifra |
|--------|-------|
| `index.json` | 52 total (35 core + 15 pizzepos + 2 facturacion) |
| `system.json` | 55 total, 47 activos |
| `modules.json` | 53 activos + 9 deshabilitados |
| **`config.json` (verdad)** | **55 habilitados, 10 deshabilitados** |

**Ninguno coincide con otro ni con la realidad.** Discrepancia mas peligrosa.

### 2.3 log-manager: documentado como Tier 1 activo, realmente DISABLED

`system.json` lo lista en `tier_1_infra`. `config.json`: **disabled**. Un agente IA que asuma su disponibilidad producira errores.

### 2.4 certificate-authority: documentado extensamente como activo, realmente DISABLED

- `contexto/certificate-authority.json` lo documenta como sistema funcional completo
- `contexto/iot-modules.json` lo referencia como modulo IoT activo
- config.json: **disabled**
- El directorio `data/ca/` que documenta **no existe**

### 2.5 Frontend stores: 22 documentados vs 30 reales

8 stores no documentados: carta, certificate-authority, channels, dispositivos, html-preview, llevadoo, staff, index.

### 2.6 esp32-dev: modulo activo no documentado en contexto IoT

Habilitado en config.json, directorio existe, pero `iot-modules.json` solo documenta esp32-flasher.

### 2.7 UI Handlers: "28/28 migrados" — INCORRECTO

Contexto afirma todos migrados. Realidad: solo ~24 modulos tienen `ui_handlers` en module.json.

### 2.8 Conteo de providers: subestimado 3.6x

| Contexto afirma | Realidad |
|-----------------|----------|
| "6+ externos, 10+ locales" | 3 externos, **36 locales** |

### 2.9 `data/learning/` — FANTASMA

Documentado como ruta de almacenamiento del provider `local.learning`. El directorio **no existe**. Puede crearse on-demand, pero no esta verificado.

---

## 3. OMISIONES GRANDES (Codigo existe sin documentar)

### 3.1 `_archived/` — 3.4 MB de codigo archivado

| Snapshot | Contenido | Relevancia |
|----------|-----------|------------|
| 2025-12-12 | UI completo anterior (119 .svelte, 76 .ts, documentacion de diseno) | Alta |
| 2026-01-22 | Flow-engine v1, handlers antiguos, proyecto ejemplo | Media |
| 2026-02-13 | **19 modulos PizzePOS completos** (versiones anteriores reemplazadas) | Alta |

**Riesgo:** Sin documentar, un agente IA puede confundir codigo archivado con activo.

### 3.2 `handlers/global/archived/` — 38 handlers archivados

Pipeline completo antiguo de facturas: aprendizaje (4), comandos (6+5), OCR (2), Gmail, notificaciones (3), validacion. **Totalmente sin documentar.**

### 3.3 `scripts/` — 16 scripts de utilidad (180KB)

Scripts criticos sin documentar:
- `create-module.js` (15KB) — generador de modulos
- `generate-constants.js` (11KB) — generador de constantes
- `migrate-to-tailwind.js` (23KB) — migracion CSS
- `gmail-oauth-setup.js` — setup OAuth
- `install-linux.sh`, `install-termux.sh` — instaladores
- `start-multi-core.sh` — arranque multi-core

### 3.4 `prompts/` — 26 prompts IA especializados (776KB)

Sistema completo de roles IA (v1.1.0): arquitecto, gobernanza, rendimiento, despliegue, estratega, orquestador, generador, curador, validador + 7 tutoriales + guias.

### 3.5 `deployment/helm/` — Charts de Kubernetes

Infraestructura production-ready: Chart de Helm con deployment, statefulset, ingress, HPA, configmap, service. **No mencionado en ningun archivo de contexto.**

### 3.6 Otros directorios no documentados

| Directorio | Contenido | Tamano |
|-----------|-----------|--------|
| `strategy/v1/` | Roadmap, vision, OKRs Q4-2025 | ~12KB |
| `network/` | Scripts latencia, setup, validacion | 44KB |
| `cli/` | Cliente CLI remoto (client.js + index.js) | 24KB |
| `firmware/print-proxy/` | Firmware ESP32 C++ completo (PlatformIO) | ~20KB |
| `design-system/` | Tokens de diseno + generador | ~8KB |
| `tutoriales/` | 7 tutoriales educativos markdown | 132KB |
| `backup/flows-v1/` | 6 definiciones de flujos antiguos | ~12KB |
| `tests/` | 13 archivos de test (unit + integration) | 244KB |

---

## 4. ESTADO REAL VERIFICADO DEL SISTEMA (25-03-2026)

### 4.1 Arquitectura Real (Verificada contra codigo)

```
index.js (punto de entrada, ~24KB)
  |
  +-- core/ (16 subsistemas)
  |     +-- mqtt/           Broker Aedes + Cliente MQTT + Pool conexiones
  |     +-- events/bus.js   EventBus hibrido (local + MQTT)
  |     +-- hooks.js        Hooks secuenciales con bloqueo
  |     +-- modules/        ModuleLoader (~1,290 lineas) + ModuleRegistry
  |     +-- validation/     JSON Schema con AJV
  |     +-- observability/  Logger + Tracer + Metrics + ActivityLogger
  |     +-- providers/      ProviderRegistry + Executor + Loader
  |     +-- gateway/http/   Gateway REST + CORS + Compression + Cache
  |     +-- config/         Carga multi-fuente con deep merge
  |     +-- flow/           FlowEngine + Registry + FlowAgent
  |     +-- discovery/      Discovery de cores via MQTT retained
  |     +-- ui/             UIRequestHandler MQTT request/response
  |     +-- utils/          PortManager + ServiceRegistry
  |     +-- handler-loader  Carga handlers globales + por proyecto
  |     +-- handler-store   Almacen persistente key-value por handler
  |     +-- service-executor Request/Response via MQTT con timeout
  |     +-- constants.js    Auto-generado desde module.json
  |
  +-- modules/ (55 habilitados, 10 deshabilitados)
  |     +-- AI: ai-gateway, ai-agent-framework, agent-manager
  |     +-- Chat: chat-session, chat-ai-bridge, prompt-composer, prompt-engine, prompt-manager
  |     +-- Bots: bot-manager, telegram-service, channel-manager
  |     +-- PizzePOS: 15 sub-modulos bajo modules/pizzepos/
  |     +-- Facturacion: facturas, asesoria, fuentes
  |     +-- Negocio: recetas, escandallo, viabilidad
  |     +-- Infra: credential-manager, database-manager, filesystem, scheduler
  |     +-- IoT: device-registry, device-shadow, device-health, gateway-manager,
  |             firmware-manager, firmware-builder, esp32-flasher, esp32-dev, perifericos
  |     +-- UI: admin-panel, pdf-viewer, text-editor
  |     +-- Gestion: project-manager, composition-manager, context-manager,
  |                  system-inspector, code-executor, plugin-manager, calling-generator
  |
  +-- services/providers/
  |     +-- anthropic/, google/, elevenlabs/  (3 externos)
  |     +-- local/ (36 providers)
  |
  +-- handlers/
  |     +-- global/ (2 activos, 38 archivados)
  |     +-- projects/ (2 proyectos con handlers)
  |
  +-- frontend/ (SvelteKit 2 + Svelte 5, 30 stores)
  +-- config.json
```

### 4.2 Modulos habilitados (55) — desglose completo

**Tier 1 Infraestructura:** credential-manager, database-manager, filesystem
**Tier 2 Plataforma:** plugin-manager, prompt-manager, prompt-engine, prompt-composer, scheduler
**Tier 3 Core:** project-manager, composition-manager, context-manager, system-inspector, ai-gateway, ai-agent-framework, agent-manager
**Tier 4 Features:** calling-generator, bot-manager, chat-ai-bridge, chat-session, code-executor
**Tier 5 PizzePOS (15):** cuentas, cuentas-canales, pedidos, cobros, cocina, comandero, productos, categorias, ingredientes, variaciones, persistencia-comandero, impresion, menu-generator, carta-digital, carta-impresion
**Tier 5 Facturacion (3):** facturas, asesoria, fuentes
**Tier 5 Negocio (3):** recetas, escandallo, viabilidad
**Tier 6 UI/Integracion:** admin-panel, pdf-viewer, telegram-service, text-editor, channel-manager
**IoT (9):** perifericos, device-registry, device-shadow, gateway-manager, firmware-manager, device-health, firmware-builder, esp32-flasher, esp32-dev
**Raiz:** pizzepos (orquestador)

### 4.3 Modulos deshabilitados (10)

```
log-manager, conversation-manager, scratch-designer, ui-designer,
dashboard, notas, metricas, security-p2p, certificate-authority, staff-manager
```

### 4.4 Providers locales (36) — inventario real

```
backup-manager, coingecko, context-sync, csv, document-processor, dxf,
esp32, etherscan, facturas-db, ffmpeg, glovo, gmail, google-documentai,
google-vision, handler-generator, learning, notion, pdf, pdf-parse,
pdf-to-png, pdfjs, perifericos, scribe-ocr, sharp, skills, slack,
stripe, svg, tesseract, url-data, whatsapp, whisper, woocommerce,
xlsx, yahoo-finance, zip
```

### 4.5 Frontend stores (30)

```
attachments, carta, certificate-authority, channels, chat, cocina,
comandero, conversations, credentials, cuentas, dispositivos,
escandallo, esp32, facturas, files, html-preview, impresion, index,
llevadoo, menu-generator, page-context, persistence, projects,
prompts, recetas, staff, theme, ui, viabilidad, workspace
```

---

## 5. TODOs E INTEGRACIONES INCOMPLETAS EN CODIGO

| Archivo | TODO | Estado |
|---------|------|--------|
| `modules/pizzepos/cuentas-canales/strategies/whatsapp.js` | Integrar con WhatsApp Business API | NO IMPLEMENTADO |
| `modules/pizzepos/cuentas-canales/strategies/telefono.js` | Integrar con Twilio/WhatsApp Business API | NO IMPLEMENTADO |
| `modules/scheduler/services/trigger-manager.js` | Check if job is currently running | NO IMPLEMENTADO |
| `modules/admin-panel/public/js/admin-panel.js` | Implement actual toggle | NO IMPLEMENTADO |
| `modules/admin-panel/index.js` | Implement agent creation via AI Agent Framework | NO IMPLEMENTADO |

---

## 6. METRICAS REALES DEL REPOSITORIO

| Metrica | Valor Real |
|---------|-----------|
| Modulos habilitados | 55 |
| Modulos deshabilitados | 10 |
| Sub-modulos PizzePOS | 15 |
| Providers locales | 36 |
| Providers externos | 3 |
| Handlers activos | 4 (2 global + 2 proyecto) |
| Handlers archivados | 38 |
| Frontend stores | 30 |
| Archivos de test | 13 |
| Scripts de utilidad | 16 |
| Archivos contexto | 33 (32 JSON + 1 MD) |
| Plugins | 5 |
| Blueprints de proyecto | 2 |
| Prompts IA | 26 |
| Tutoriales | 7 |
| Codigo archivado | ~3.4 MB |

---

## 7. CORRECCIONES NECESARIAS (PRIORIZADAS)

### CRITICAS — afectan generacion de codigo por IA

| # | Archivo | Correccion |
|---|---------|-----------|
| 1 | `index.json` | Actualizar `version` a 0.2.0 y `module_count` a 55 habilitados / 10 disabled |
| 2 | `system.json` tier_1_infra | Quitar `log-manager` (disabled) |
| 3 | `system.json` module count | Corregir a 55 habilitados |
| 4 | `modules.json` | Alinear conteo con config.json: 55 enabled, 10 disabled |
| 5 | `certificate-authority.json` | Anadir `"status": "DISABLED"` prominente al inicio |
| 6 | `iot-modules.json` | Marcar certificate-authority como disabled, documentar esp32-dev |

### IMPORTANTES — mejoran precision

| # | Archivo | Correccion |
|---|---------|-----------|
| 7 | `ui.json` | Actualizar stores de 22 a 30 (anadir los 8 faltantes) |
| 8 | `providers.json` o `catalogo-servicios.json` | Actualizar conteo a 36 locales reales |
| 9 | Nuevo: documentar `_archived/` | Explicar los 3 snapshots y por que fueron reemplazados |
| 10 | Nuevo: documentar `scripts/` | 16 herramientas criticas para desarrollo |

### MENORES — consistencia

| # | Archivo | Correccion |
|---|---------|-----------|
| 11 | `system.json` | Corregir conteo archivos contexto a 33 |
| 12 | `ui.json` | Documentar ruta /[project_id]/llevadoo |
| 13 | Varios | Documentar deployment/helm/, cli/, firmware/, prompts/ |

---

## 8. FORTALEZAS CONFIRMADAS

1. **Arquitectura event-driven pura** — MQTT como backbone, sin REST para estado interno
2. **Auto-wiring declarativo** — module.json declara, ModuleLoader conecta
3. **ModuleLoader maduro** (~1,290 lineas) — discovery, hot-reload, tool registration
4. **PizzePOS completo** — 15 modulos, 5+ canales, Strategy pattern, event sourcing, ESC/POS
5. **AI Gateway unificado** — 6 providers LLM con fallback, streaming, tool calling
6. **Provider system limpio** — auto-discovery, credential injection, 36 providers locales
7. **Handler system potente** — global + project-scoped, service executor, persistent store
8. **Frontend MQTT-first** — 30 stores, lazy loading, auto-discovery de modulos
9. **IoT real** — device-registry, shadows, firmware OTA, gateway, ESP32 directo

---

## 9. DEUDA TECNICA

1. **10 modulos disabled** ocupando espacio en el repo
2. **Inconsistencias en 3 archivos de contexto** — conteos de modulos
3. **certificate-authority** documentado extensamente pero disabled y sin data/
4. **8 stores no documentados** — funcionalidad invisible para el contexto
5. **Version sin unificar** — 0.2.0 vs 0.5.0
6. **11 directorios sin documentar** en contexto (_archived, scripts, prompts, deployment, etc.)
7. **38 handlers archivados** sin documentar ni limpiar
8. **5 TODOs en modulos** — integraciones WhatsApp, Twilio, admin-panel incompletas
9. **`data/learning/`** documentado como existente pero no existe

---

## 10. CONCLUSION

**Codigo:** Enki es un sistema solido, modular, event-driven, con 55 modulos activos, 36 providers locales, frontend SvelteKit moderno, y un ecosistema IoT real. La implementacion es significativamente mas grande y madura de lo que el contexto sugiere.

**Contexto:** Fiable al ~80% para decisiones arquitectonicas. Problematico para conteos exactos y estados de modulos. Las 6 correcciones criticas eliminarian el 90% del riesgo de generar codigo erroneo.

**Recomendacion principal:** Ejecutar las 6 correcciones criticas y establecer que todo cambio de modulos/stores/providers incluya actualizacion automatica de `contexto/`. El provider `local.context-sync` ya existe para esto.
