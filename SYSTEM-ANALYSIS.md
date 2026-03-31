# Enki (Event-Core): Analisis de Arquitectura del Sistema

**Fecha**: 2026-03-31
**Metodo**: Lectura exhaustiva de 33 archivos en `contexto/` + verificacion contra codigo real (config.json, modules/, core/, services/, frontend/, handlers/, data/)
**Rama**: claude/analyze-system-architecture-6UfJ3

---

## 0. VEREDICTO EJECUTIVO

Enki es un **framework event-driven modular** construido sobre Node.js + MQTT (Aedes) con frontend SvelteKit 2/Svelte 5. Es un sistema real, funcional, con verticales de negocio implementadas (POS pizzeria, facturacion, IoT). La arquitectura es solida y coherente.

**El contexto es util pero no fiable al 100%.** Tiene inconsistencias numericas, modulos documentados como activos que estan disabled, y directorios enteros sin documentar. Sirve como guia arquitectonica pero hay que verificar contra `config.json` y el codigo real.

| Dimension | Nota | Observacion |
|-----------|------|-------------|
| Arquitectura | 8/10 | Event-driven puro, bien separado |
| Implementacion | 7/10 | 57 modulos activos, 35 providers locales, verticales completas |
| Documentacion contexto | 5/10 | Util pero con inconsistencias factuales |
| Alineacion codigo-contexto | 4/10 | Discrepancias en conteos, estados, y directorios omitidos |

---

## 1. ARQUITECTURA REAL (Verificada contra codigo)

### 1.1 Stack tecnologico

| Capa | Tecnologia |
|------|-----------|
| Backend | Node.js (>=18) + MQTT Aedes (embebido) |
| Frontend | SvelteKit 2 + Svelte 5 + TypeScript |
| Comunicacion | MQTT via WebSocket (puerto 9001) + TCP (1883) |
| Base de datos | SQLite (sql.js, per-project) |
| HTTP | Express con CORS, compression, cache |
| Validacion | AJV (JSON Schema) |

### 1.2 Punto de entrada y secuencia de arranque

`index.js` orquesta la inicializacion en este orden:

1. **Observability** — Logger + Tracer + Metrics + ActivityLogger
2. **Validation** — JSON Schema (AJV)
3. **MQTT** — Broker Aedes + Cliente MQTT (embedded fallback)
4. **Hooks** — Lifecycle hooks (beforeEventPublish/afterEventPublish)
5. **EventBus** — Routing hibrido local + MQTT
5.5. **UIRequestHandler** — Request/response MQTT para UI
6. **Providers** — Service providers auto-discovery
6.5. **Modules** — Carga dinamica ordenada por config.modules.enabled
6.7. **Handlers** — Globales + por proyecto
7. **ServiceRegistry** — Puerto auto-asignado
8. **HTTP** — Gateway Express

### 1.3 Estructura de directorios real

```
index.js (punto de entrada)
|
+-- core/ (16+ subsistemas)
|     +-- broker/         Broker MQTT
|     +-- mqtt/           Cliente MQTT + Pool conexiones
|     +-- events/bus.js   EventBus hibrido (local + MQTT)
|     +-- hooks.js        Hooks secuenciales con bloqueo
|     +-- modules/        ModuleLoader (~1,290 lineas) + ModuleRegistry
|     +-- validation/     JSON Schema con AJV
|     +-- observability/  Logger + Tracer + Metrics + ActivityLogger
|     +-- providers/      ProviderRegistry + Executor + Loader
|     +-- gateway/http/   Gateway REST + CORS + Compression + Cache
|     +-- config/         Carga multi-fuente (CLI > ENV > file)
|     +-- flow/           FlowEngine + Registry + FlowAgent
|     +-- discovery/      Discovery de cores via MQTT retained
|     +-- ui/             UIRequestHandler MQTT request/response
|     +-- orchestrator/   Orquestador
|     +-- utils/          PortManager + ServiceRegistry
|     +-- handler-loader  Carga handlers globales + por proyecto
|     +-- handler-store   Almacen persistente key-value por handler
|     +-- service-executor Request/Response via MQTT con timeout
|     +-- constants.js    Auto-generado desde module.json
|
+-- modules/ (57 habilitados, 10 deshabilitados)
+-- services/providers/ (3 externos + 35 locales)
+-- handlers/ (3 activos globales + 37 archivados + 2 proyecto)
+-- frontend/ (SvelteKit 2, 31 stores)
+-- firmware/ (1 driver: print-proxy)
+-- contexto/ (33 archivos: 32 JSON + 1 MD)
+-- _archived/ (3 snapshots historicos)
+-- scripts/ (16 utilidades)
+-- prompts/ (26 prompts IA especializados)
+-- deployment/helm/ (Kubernetes Helm charts)
+-- cli/ (cliente CLI remoto)
+-- docs/ (35+ archivos)
```

---

## 2. MODULOS — ESTADO REAL (config.json verificado 31-03-2026)

### 2.1 Habilitados: 57 modulos

**Tier 1 Infraestructura (3):**
credential-manager, database-manager, filesystem

**Tier 2 Plataforma (5):**
plugin-manager, prompt-manager, prompt-engine, prompt-composer, scheduler

**Tier 3 Core (7):**
project-manager, composition-manager, context-manager, system-inspector, ai-gateway, ai-agent-framework, agent-manager

**Tier 4 Features (5):**
calling-generator, bot-manager, chat-ai-bridge, chat-session, code-executor

**Tier 5 PizzePOS (16 sub-modulos en modules/pizzepos/):**
pizzepos (orquestador), cuentas, cuentas-canales, pedidos, cobros, cocina, comandero, productos, categorias, ingredientes, variaciones, persistencia-comandero, impresion, menu-generator, carta-digital, carta-design, carta-impresion

**Tier 5 Facturacion (3):**
facturas, asesoria (modules/facturacion/), fuentes (modules/facturacion/)

**Tier 5 Negocio alimentario (3):**
recetas, escandallo, viabilidad

**Tier 6 UI/Integracion (5):**
admin-panel, pdf-viewer, telegram-service, text-editor, channel-manager

**IoT (9):**
perifericos, device-registry, device-shadow, device-health, gateway-manager, firmware-manager, firmware-builder, esp32-flasher

### 2.2 Deshabilitados: 10 modulos

```
log-manager, conversation-manager, scratch-designer, ui-designer,
dashboard, notas, metricas, security-p2p, certificate-authority, staff-manager
```

### 2.3 Nota sobre sub-modulos

PizzePOS tiene **16** sub-modulos (no 15 como dicen varios archivos de contexto). `carta-design` es el modulo #16 que no aparece documentado en la mayoria de archivos de contexto pero SI esta en config.json como habilitado.

---

## 3. PATRONES ARQUITECTONICOS CLAVE

### 3.1 Comunicacion: Todo son eventos

```
Frontend -> mqttRequest('domain', 'action', data) -> MQTT
         -> ui/request/{domain}/{action}
         -> UIRequestHandler -> modulo handler
         -> ui/response/{request_id}
         -> Frontend recibe respuesta
```

Tres patrones de comunicacion:
- **UI Request/Response**: `ui/request/{domain}/{action}` -> `ui/response/{request_id}` (timeout 10s)
- **Eventos fire-and-forget**: `core/{coreId}/events/{module}/{event}`
- **Service Request/Response**: `{provider}.{function}.request` -> `{provider}.{function}.response`

### 3.2 Modulos: Declarativo + Auto-wiring

```json
{
  "events": { "subscribes": [{ "event": "...", "handler": "methodName" }] },
  "ui_handlers": [{ "domain": "...", "action": "...", "handler": "methodName" }],
  "tools": [{ "name": "...", "handler": "methodName", "parameters": {} }]
}
```

El ModuleLoader lee module.json y auto-conecta:
1. Suscripciones a eventos (ANTES de onLoad)
2. onLoad(context)
3. Registro en ModuleRegistry
4. Registro de tools para AI
5. UI handlers (DESPUES de onLoad)

### 3.3 Providers: Tontos por diseno

- **Externos** (3): anthropic, google, elevenlabs — con credencial
- **Locales** (35): pdf, csv, tesseract, sharp, gmail, etc. — sin credencial externa
- Los providers SOLO ejecutan, nunca deciden
- Las credenciales se inyectan via credential-manager (cascada CUSTOM > CLIENT > PROJECT > GLOBAL)

### 3.4 Handlers: Orquestacion con JS directo

- **Globales**: `handlers/global/*.js` — credenciales GLOBAL
- **Proyecto**: `data/projects/{id}/handlers/*.js` — credenciales PROJECT_{id}
- Contexto: `{ services, logger, emit, config, store, projectId }`
- Encadenamiento via `emit('evento', data)` con correlationId automatico
- CRITICO: `const data = event.data || event;` — el EventBus envuelve datos

### 3.5 AI Gateway: 6 providers LLM

DeepSeek (prioridad 1) -> Anthropic -> OpenAI -> Groq -> Gemini -> Ollama (local)

Tool calling unificado: cada provider traduce al formato nativo. DeepSeek requiere transformacion de nombres (dots -> underscores).

### 3.6 Project-scoped: Todo por proyecto

- Rutas: `/[project_id]/pagina` (ej: /peppone/menu-generator)
- Base de datos: SQLite por proyecto
- Handlers: por proyecto con credenciales propias
- Chat: page-context inyecta estado de la UI actual al LLM

---

## 4. VERTICALES DE NEGOCIO

### 4.1 PizzePOS (16 modulos)

Sistema POS completo para pizzeria:
- **Cuentas**: Maquina de estados (pendiente -> con_pedido -> en_preparacion -> listo -> para_cobrar -> cobrado)
- **Canales**: 5 strategies (mesa, telefono, llevar, glovo, whatsapp)
- **Comandero**: Buffer de items, envio a cocina, persistencia
- **Cocina**: Pantalla digital RT con MQTT, timer, estados por item
- **Cobros**: Multiples metodos de pago
- **Productos/Categorias/Ingredientes/Variaciones**: Catalogo completo con grupos
- **Menu-generator**: Pipeline AI (10 tools) para generar cartas
- **Carta-digital**: Export estatico (HTML auto-contenido, PWA, GitHub Pages)
- **Carta-design**: Diseno de cartas
- **Carta-impresion**: Templates HTML (A4, A5, custom) para imprimir
- **Impresion**: ESC/POS via ESP32 MQTT (arquitectura BASE+LOGIC)

### 4.2 Facturacion (3 modulos)

- **facturas**: Motor de extraccion OCR + IA -> datos estructurados
- **asesoria**: Paquetes CSV+ZIP para asesoria contable
- **fuentes**: Adaptadores de entrada (Telegram, Gmail) — Strategy pattern

### 4.3 Negocio alimentario (3 modulos)

- **recetas**: Gestion de recetas con ingredientes y precios
- **escandallo**: Analisis de costes y margenes por receta
- **viabilidad**: Estudio de viabilidad (escenarios, break-even, proyecciones)

### 4.4 IoT (9 modulos)

- **device-registry**: Fuente unica de verdad de dispositivos
- **device-shadow**: Sincronizacion desired/reported/delta (patron AWS IoT)
- **device-health**: Monitorizacion liveness y alertas
- **firmware-builder**: Compilacion de drivers ESP32 via PlatformIO (reemplaza esp32-dev)
- **firmware-manager**: Catalogo firmware, versionado, OTA via device-shadow
- **esp32-flasher**: Flash USB + monitor serial
- **gateway-manager**: Traduccion MQTT <-> protocolos nativos
- **perifericos**: Gestion de perifericos legacy

### 4.5 Bots y Agentes

Cadena: telegram-service -> bot-manager -> agent-manager -> ai-agent-framework

- **telegram-service**: Bot multi-instancia, eventos por tipo de mensaje
- **bot-manager**: Descarga archivos, almacena, respuestas automaticas (NO sabe de agentes)
- **agent-manager**: Decide que agente usar, construye contexto, orquesta pipelines
- **ai-agent-framework**: Ejecuta agentes con AI + tools cuando se lo piden

---

## 5. DISCREPANCIAS DETECTADAS (Codigo != Contexto)

### 5.1 CRITICAS — Afectan generacion de codigo

| # | Discrepancia | Contexto dice | Realidad (config.json) |
|---|-------------|---------------|----------------------|
| 1 | **Conteo de modulos** | index.json: 55 enabled / modules.json: 53 activos | **57 habilitados, 10 deshabilitados** |
| 2 | **log-manager** | system.json lo lista en tier_1_infra activo | **DISABLED** en config.json |
| 3 | **certificate-authority** | Documentado extensamente como activo | **DISABLED**, data/ca/ NO existe |
| 4 | **PizzePOS sub-modulos** | Varios archivos dicen 15 | **16** (falta carta-design) |
| 5 | **Providers locales** | catalogo dice "6+ externos, 10+ locales" | **3 externos, 35 locales** |
| 6 | **Frontend stores** | ui.json documenta ~22 | **31 stores reales** |
| 7 | **data/learning/** | Documentado como ruta de almacenamiento | **NO EXISTE** en disco |
| 8 | **esp32-dev** | Existe en modules/ | NO esta en config.json (ni enabled ni disabled) |

### 5.2 IMPORTANTES — Omisiones grandes

| Directorio | Contenido | Documentado en contexto |
|-----------|-----------|------------------------|
| `_archived/` | 3 snapshots historicos (~3.4 MB) | NO |
| `scripts/` | 16 utilidades criticas | NO |
| `prompts/` | 26 prompts IA especializados | Mencionado pero no detallado |
| `deployment/helm/` | Kubernetes Helm charts | NO |
| `cli/` | Cliente CLI remoto | NO |
| `strategy/` | Roadmap, vision, OKRs | NO |
| `network/` | Scripts multi-maquina | NO |
| `design-system/` | Tokens de diseno | NO |
| `tutoriales/` | 7 tutoriales educativos | NO |
| `core/orchestrator/` | Orquestador | NO documentado en system.json |

### 5.3 Stores no documentados en ui.json (9 extras)

```
carta-design, channels, dispositivos, html-preview, llevadoo,
staff, index, esp32, persistence
```

---

## 6. FORTALEZAS CONFIRMADAS

1. **Arquitectura event-driven pura** — MQTT como backbone, sin REST para estado interno
2. **Auto-wiring declarativo** — module.json declara, ModuleLoader conecta (sin codigo imperativo)
3. **ModuleLoader maduro** (~1,290 lineas) — discovery recursiva, hot-reload, tool registration
4. **PizzePOS completo** — 16 modulos, 5 canales, maquina de estados, ESC/POS, cocina RT
5. **AI Gateway unificado** — 6 providers LLM con fallback, streaming, tool calling completo
6. **Provider system limpio** — auto-discovery, credential injection, 35 providers locales
7. **Handler system potente** — global + project-scoped, emit encadenado, store persistente
8. **Frontend MQTT-first** — 31 stores, lazy loading, auto-discovery de modulos UI
9. **IoT real** — device registry/shadow/health, firmware OTA, ESP32 directo
10. **Page context** — El LLM sabe en que pagina esta el usuario y que datos hay

---

## 7. DEUDA TECNICA Y RIESGOS

1. **Inconsistencias en 3+ archivos de contexto** — conteos de modulos no coinciden entre si ni con config.json
2. **10 modulos disabled** — ocupan espacio en repo sin utilidad actual
3. **37 handlers archivados** — sin documentar ni limpiar
4. **certificate-authority documentado extensamente** pero disabled y sin datos
5. **9 stores no documentados** — funcionalidad invisible para el contexto
6. **11 directorios sin documentar** — riesgo de que un agente IA confunda codigo archivado con activo
7. **5 TODOs en modulos** — integraciones WhatsApp, Twilio, admin-panel incompletas
8. **esp32-dev** — existe en modules/ pero NO esta en config.json (ni enabled ni disabled)
9. **_shared/** — directorio bajo modules/ sin documentar

---

## 8. METRICAS REALES DEL REPOSITORIO (31-03-2026)

| Metrica | Valor Verificado |
|---------|-----------------|
| Modulos habilitados | 57 |
| Modulos deshabilitados | 10 |
| Sub-modulos PizzePOS | 16 |
| Sub-modulos Facturacion | 2 |
| Providers externos | 3 |
| Providers locales | 35 |
| Handlers globales activos | 3 (1 es _ejemplo) |
| Handlers archivados | 37 |
| Handlers de proyecto | 2 |
| Frontend stores | 31 |
| Core subsistemas | 16+ |
| Scripts de utilidad | 16 |
| Archivos de contexto | 33 |
| Prompts IA | 26 |
| Plugins | 5 |
| Firmware drivers | 1 (print-proxy) |
| Proyectos en data/ | 7 |

---

## 9. RECOMENDACIONES

**Prioridad 1 — Critica (afecta generacion de codigo):**
- Alinear index.json, system.json, y modules.json con config.json (57 enabled, 10 disabled)
- Marcar certificate-authority y log-manager como DISABLED en todas sus referencias
- Actualizar conteo de PizzePOS a 16 (incluir carta-design)

**Prioridad 2 — Importante (mejora precision):**
- Actualizar ui.json con los 31 stores reales
- Actualizar conteo de providers a 3 externos + 35 locales
- Documentar _archived/ y scripts/

**Prioridad 3 — Menor (consistencia):**
- Documentar los 11 directorios omitidos
- Resolver estado de esp32-dev (modulo huerfano)
- Limpiar o documentar los 37 handlers archivados

**Nota**: El provider `local.context-sync` ya existe en el sistema para automatizar la sincronizacion contexto-codigo. Usarlo eliminaria la mayoria de estas discrepancias.
