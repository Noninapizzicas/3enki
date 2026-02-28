# Event-Core: Análisis Completo del Sistema

**Fecha:** 2026-02-28
**Versión real (package.json):** 0.2.0
**Versión declarada (README):** 0.5.0 "Network"

---

## 1. IDEA GLOBAL DEL SISTEMA

Event-Core es un **framework meta-core fractal event-driven** construido en Node.js. Su propósito es ser una plataforma modular que puede escalar desde un solo proceso hasta N instancias distribuidas comunicándose vía MQTT.

**La metáfora:** El core es como un sistema operativo ligero. No hace nada por sí mismo — solo provee infraestructura (bus de eventos, broker MQTT, gateway HTTP, cargador de módulos, observabilidad). Toda la funcionalidad de negocio vive en **módulos** que se auto-descubren y se cargan dinámicamente.

**El caso de uso principal actual:** PizzePOS — un sistema de punto de venta para restaurantes/pizzerías, con un ecosistema de IA integrado (multi-proveedor LLM, OCR, visión, audio).

**Filosofía central:**
- "El módulo NO sabe cómo se conecta al sistema. Solo sabe hacer su trabajo."
- El core es la fontanería; los módulos son los grifos.
- Todo se comunica por eventos; las APIs HTTP son solo una fachada.
- El frontend habla con el backend por MQTT (patrón request/response), no por REST directo.

---

## 2. ARQUITECTURA POR CAPAS

```
┌─────────────────────────────────────────────────┐
│                FRONTEND (SvelteKit)              │
│         Svelte 5 + TypeScript + Tailwind         │
│          Se comunica por MQTT WebSocket          │
└────────────────────┬────────────────────────────┘
                     │ MQTT (ws://localhost:9001)
┌────────────────────┼────────────────────────────┐
│                    │     HTTP Gateway (:3000)     │
│                    │   /modules/{name}/{path}     │
│   ┌────────────────┴────────────────────────┐    │
│   │         UI Request Handler              │    │
│   │   ui/request/{domain}/{action}          │    │
│   │   ui/response/{request_id}              │    │
│   └─────────────────────────────────────────┘    │
│                                                   │
│   ┌─────────────────────────────────────────┐    │
│   │            MODULE LOADER                 │    │
│   │   Auto-descubre ./modules/              │    │
│   │   Auto-wires: apis, tools,              │    │
│   │   subscribes (con handler), ui_handlers │    │
│   │   Hot-reload con fs.watch               │    │
│   └────────────────┬────────────────────────┘    │
│                    │                              │
│   ┌────────────────┴────────────────────────┐    │
│   │          EVENT BUS (Híbrido)             │    │
│   │   EventEmitter (local) + MQTT (distrib)  │    │
│   │   Envelopes con trace_id, correlation_id │    │
│   └────────────────┬────────────────────────┘    │
│                    │                              │
│   ┌────────────────┴────────────────────────┐    │
│   │         MQTT BROKER (Aedes)              │    │
│   │   TCP :1883 | WebSocket :9001            │    │
│   │   Embebido (fallback) o externo          │    │
│   └─────────────────────────────────────────┘    │
│                                                   │
│   ┌─────────────────────────────────────────┐    │
│   │         OBSERVABILITY                    │    │
│   │   Logger, Tracer (W3C), Metrics,         │    │
│   │   ActivityLogger                         │    │
│   └─────────────────────────────────────────┘    │
│                     EVENT CORE                    │
└───────────────────────────────────────────────────┘
```

---

## 3. SECUENCIA DE ARRANQUE (index.js)

El `index.js` orquesta la inicialización de todo el sistema en orden:

| Paso | Componente | Qué hace |
|------|-----------|----------|
| 1 | **Observability** | Logger, Tracer, Metrics |
| 2 | **Validation** | ValidationManager + schemas comunes (Ajv) |
| 3 | **MQTT Client** | Conecta a broker externo; si falla, arranca broker embebido (Aedes) |
| 4 | **Hook System** | HookManager para interceptores (beforeEventPublish, afterEventReceive, etc.) |
| 5 | **Event Bus** | EventEmitter + MQTT bridge. ActivityLogger se ata aquí |
| 5.5 | **UI Request Handler** | Escucha `ui/request/#`, despacha a handlers registrados |
| 6 | **Providers** | Carga service providers desde `services/providers/` |
| 6.5 | **Module Loader** | Descubre y carga módulos desde `./modules/`. Registra provider tools en el toolsRegistry |
| 6.7 | **Handler Loader** | Carga handlers centralizados desde `./handlers/` |
| 7 | **Service Registry** | Auto-asigna puerto HTTP libre, registra el servicio |
| 8 | **HTTP Gateway** | Servidor HTTP nativo (Node.js `http` module, sin Express). Enruta `/modules/{name}/{path}` a módulos |

**Shutdown graceful:** Timer heartbeat → Service Registry → ActivityLogger → HTTP Gateway → UI Handler → Modules → Handlers → Providers → MQTT Client.

---

## 4. COMPONENTES DEL CORE (directorio `core/`)

### 4.1 Event Bus (`core/events/bus.js`)
- Extiende `EventEmitter` de Node.js
- **Híbrido:** eventos locales (in-process) + eventos distribuidos (MQTT a otros cores)
- `emit(eventType, data)` → publica localmente Y por MQTT
- `emitTo(targetCoreId, eventType, data)` → publica a un core específico
- `subscribe(eventType, handler)` → retorna función de unsubscribe
- Soporte de `EventEnvelope` con `event_id`, `source.core_id`, `source.module_id`, `trace_id`
- Hooks: `beforeEventPublish`, `afterEventReceive` pueden bloquear o modificar eventos
- Validación opcional contra `constants.js`

### 4.2 MQTT Client (`core/mqtt/client.js`)
- Wrapper sobre `mqtt.js` con fallback automático a broker embebido (Aedes)
- Connection pooling implementado pero deshabilitado por defecto
- Topics convenidos: `core/{core-id}/events/{event-type}`, `core/*/events/#` (broadcast)
- Pool (`core/mqtt/pool.js`): min/max connections, health check, idle timeout

### 4.3 Module Loader (`core/modules/loader.js`) — 1291 líneas
**Es el componente más importante y más evolucionado del sistema.**

Funcionalidades:
- **Auto-descubrimiento:** escanea `./modules/`, lee `module.json`, requiere `index.js`
- **Auto-wiring de APIs:** `manifest.apis` → registra rutas HTTP automáticamente
- **Auto-wiring de Tools:** `manifest.tools` → registra herramientas para AI
- **Auto-wiring de Eventos:** `manifest.subscribes` con `handler` → suscribe automáticamente y guarda `_eventUnsubs` para cleanup
- **Auto-wiring de UI Handlers:** `manifest.ui_handlers` / `manifest.uiActions` / `manifest.handlers` → registra en UIRequestHandler y guarda `_uiRegistrations` para cleanup
- **Normalización:** acepta formatos legacy (3 variantes de subscribes, 3 de UI handlers)
- **Módulos agrupados:** soporta subdirectorios (ej: `modules/pizzepos/pedidos/`)
- **Hot-reload:** `watch()` con `fs.watch` + debounce 500ms
- **Deshabilitación:** `config.modules.disabled` en config.json
- **Provider Tools:** unifica tools de providers (OCR, Gmail, etc.) con tools de módulos en un solo `toolsRegistry`
- **Cleanup automático:** `unload()` deshace TODAS las suscripciones de eventos y UI handlers

### 4.4 HTTP Gateway (`core/gateway/http.js`)
- Servidor HTTP nativo (Node.js `http` module, sin Express/Fastify)
- Enrutamiento: `/modules/{moduleName}/{path}` → handler del módulo
- Endpoints fijos: `/health`, `/stats`, `/modules`, `/events`, `/tools`, `/ui/*`
- CORS habilitado por defecto
- Middleware: Validación (Ajv), Compresión (gzip/deflate), Cache in-memory
- Request body parsing con límite configurable (default 1MB)
- Timeout configurable (default 30s)

### 4.5 UI Request Handler (`core/ui/UIRequestHandler.js`)
- Implementa semántica REST sobre MQTT
- Topics: `ui/request/{domain}/{action}` → `ui/response/{request_id}`
- Status codes (200, 201, 400, 404, 409, 500)
- Error classes: UIRequestError, ValidationError, NotFoundError, ConflictError
- Los módulos se registran: `uiHandler.register('pedido', 'list', handler)`

### 4.6 Observability (`core/observability/`)
- **Logger:** Structured logging con nivel, coreId, contexto. Niveles: debug/info/warn/error
- **Tracer:** W3C Trace Context compatible. Genera trace_id y span_id
- **Metrics:** Counters, gauges, histograms. In-memory (no Prometheus/Grafana aún)
- **ActivityLogger:** Monitoreo centralizado de actividad del sistema via EventBus

### 4.7 Otros componentes del core
- **Hooks (`core/hooks.js`):** Sistema de interceptores. Puntos: beforeEventPublish, afterEventReceive, beforeRequest, afterResponse
- **Validation (`core/validation/`):** ValidationManager basado en Ajv. Schemas JSON Schema
- **Config (`core/config/`):** Prioridad: CLI args > ENV vars > config.{env}.json > config.json
- **Providers (`core/providers/`):** Sistema de providers con loader, registry, executor
- **Discovery (`core/discovery/`):** Implementado pero NO activado en el startup
- **Flow Engine (`core/flow/`):** Implementado pero NO activado en el startup
- **Handler Loader (`core/handler-loader.js`):** Carga handlers centralizados desde `./handlers/`
- **Service Executor (`core/service-executor.js`):** Ejecuta acciones de handlers
- **Service Registry (`core/utils/`):** Registro de servicios con auto-cleanup y heartbeat

---

## 5. MÓDULOS — El corazón funcional

### 5.1 Inventario completo (35 módulos + 14 PizzePOS)

**Módulos de infraestructura/plataforma:**

| Módulo | Líneas | Descripción | Estado |
|--------|--------|-------------|--------|
| `ai-gateway` | 1872 | Gateway multi-LLM (DeepSeek, Claude, OpenAI, Groq, Gemini, Ollama). Streaming SSE, function calling, cost tracking | Funcional |
| `credential-manager` | 2635 | Gestión de credenciales multi-nivel (GLOBAL/PROJECT/CLIENT/CUSTOM). Almacenamiento en .env. OAuth2 para Google/Gmail | Funcional, bien declarado |
| `chat-session` | 1411 | Gestión de sesiones de chat con historial y contexto | Funcional |
| `chat-ai-bridge` | 1236 | Puente entre chat y AI gateway | Funcional |
| `prompt-manager` | 1618 | CRUD de prompts con categorías, tags, favoritos | Funcional |
| `prompt-composer` | 1306 | Composición dinámica de prompts con variables y templates | Funcional |
| `database-manager` | 1425 | Gestión de bases de datos SQLite (sql.js). CRUD genérico | Funcional |
| `filesystem` | 1232 | Operaciones de sistema de archivos. 15 UI handlers | Funcional |
| `scheduler` | 1146 | Programador de tareas (cron-like). 11 UI handlers | Funcional |
| `project-manager` | 1070 | Gestión de proyectos multi-tenant | Funcional |
| `plugin-manager` | 515 | Gestión dinámica de plugins | Funcional |
| `metricas` | 713 | Métricas centralizadas. Escucha `*.creado`, `*.actualizado`, etc. | Funcional |
| `log-manager` | 506 | Gestión centralizada de logs | Funcional |
| `admin-panel` | 542 | Panel de administración del sistema | Funcional |
| `telegram-service` | 752 | Integración con Telegram Bot API | Funcional |
| `system-inspector` | 235 | Inspección del estado del sistema | Funcional |

**Módulos de IA/Agentes:**

| Módulo | Líneas | Descripción | Estado |
|--------|--------|-------------|--------|
| `ai-agent-framework` | 610 | Framework para agentes IA con pipeline executor, strategy patterns | Funcional |
| `agent-manager` | 340 | Gestión de agentes IA | Funcional |
| `bot-manager` | 330 | Gestión de bots | Funcional |
| `context-manager` | 521 | Gestión de contexto para IA | Funcional |
| `composition-manager` | 716 | Composición de pantallas declarativas (puzzle system) | Funcional |

**Módulos de utilidad:**

| Módulo | Líneas | Descripción | Estado |
|--------|--------|-------------|--------|
| `text-editor` | 579 | Editor de texto con UI handlers | Funcional |
| `pdf-viewer` | 1096 | Visor/procesador de PDFs | Funcional |
| `code-executor` | 620 | Sandbox para ejecución de código (Node.js) | Funcional, riesgo seguridad |
| `calling-generator` | 811 | Generador de llamadas/calling con AI | Funcional |
| `security-p2p` | 291 | Encriptación P2P entre cores | Parcial |
| `staff-manager` | 393 | Gestión de personal | Funcional |

**Módulos deshabilitados/deprecated:**

| Módulo | Líneas | Estado |
|--------|--------|--------|
| `conversation-manager` | 523 | Reemplazado por chat-session |
| `scratch-designer` | 412 | Experimental |
| `ui-designer` | 1280 | Experimental |
| `dashboard` | 360 | Deprecated |
| `notas` | 484 | Deprecated |

### 5.2 Módulos PizzePOS (`modules/pizzepos/`)

El vertical de restaurante, con 14 submódulos:

| Módulo | Descripción |
|--------|-------------|
| `productos` | Catálogo de productos (pizzas, bebidas, etc.) |
| `categorias` | Categorías de productos |
| `ingredientes` | Gestión de ingredientes |
| `variaciones` | Variaciones de productos (tamaño, extras) |
| `pedidos` | Gestión de pedidos event-driven |
| `comandero` | Interfaz del camarero para tomar pedidos |
| `persistencia-comandero` | Persistencia del estado del comandero |
| `cuentas` | Cuentas/mesas abiertas |
| `cuentas-canales` | Canales de venta (mesa, llevar, teléfono) |
| `cobros` | Procesamiento de pagos (efectivo, tarjeta, Bizum, etc.) |
| `cocina` | Pantalla de cocina (KDS) |
| `carta-impresion` | Generación e impresión de cartas |
| `impresion` | Sistema de impresión (tickets, comandas) |
| `menu-generator` | Generador de menús con AI |

**Flujo de eventos PizzePOS:**
```
Comandero → pedido.creado → Pedidos → pedido.enviado_cocina → Cocina
                                   → pedido.item_agregado → Cuentas (actualiza total)
Cobros ← cobro.procesado ← cuenta.estado_cambiado ← Cuentas
```

---

## 6. PLUGINS (`plugins/`)

Extensiones externas cargadas dinámicamente:

| Plugin | Descripción |
|--------|-------------|
| `github` | Integración con GitHub API |
| `slack` | Integración con Slack |
| `weather` | API del tiempo |
| `http-utils` | Utilidades HTTP |
| `ocr` | OCR con múltiples backends (Google Vision, Tesseract, etc.) |

---

## 7. PROVIDERS (`services/providers/`)

Sistema de service providers que se cargan desde `services/manifest-loader.js`:

**Categorías de providers (documentados en contexto):**
- **LLM:** DeepSeek, Claude/Anthropic, OpenAI, Groq, Gemini, Ollama
- **Visión/OCR:** Google Vision, Tesseract, modelo local
- **Audio:** Whisper (transcripción), ElevenLabs (TTS)
- **Documentos:** pdf-parse, FFmpeg
- **Datos:** CSV, Zip, SQLite (sql.js), Notion
- **Integración:** GitHub, Slack, Weather, Gmail

Los providers se registran como tools en el `toolsRegistry` del Module Loader, unificando tools de módulos y tools de providers en un solo sistema accesible por el AI Gateway.

---

## 8. HANDLERS (`handlers/`)

Sistema de handlers centralizados con dos niveles:
- `handlers/global/` — Handlers que aplican a todo el sistema
- `handlers/projects/{id}/` — Handlers específicos por proyecto

Incluye un directorio `handlers/global/archived/` con 30+ handlers deprecated.

---

## 9. FRONTEND (`frontend/`)

**Stack:** SvelteKit 2.16, Svelte 5, TypeScript, Vite, Tailwind CSS

**Estructura:**
- 14 rutas SvelteKit
- 68 archivos `.svelte`, 48 archivos `.ts`
- 6 Svelte stores
- Comunicación con backend via MQTT WebSocket (no REST directo)

**Componentes clave:**
- ChatInput, ConversationPanel, PromptSelector — UI de chat con IA
- Sidebar, Header, MobileWorkspaceLayout — navegación
- Modal, Toast, Alert, FloatingPanel — feedback
- StatCard, EventStream, Grid, Table — visualización de datos
- Button, Card, Form, Select, Input — primitivos UI

**Issues documentados:**
- Migración a Tailwind incompleta
- Sin telemetría frontend
- Conexión MQTT no pooled
- Rutas legacy sin limpiar

---

## 10. BLUEPRINTS Y TEMPLATES

### Blueprints (`blueprints/`)
Arquitecturas de referencia pre-diseñadas para componer features:
- Templates de módulos
- Templates de eventos
- Templates de APIs
- Templates de pantallas

### Plop Templates (`plop-templates/`)
Generadores de código con Plop.js para scaffolding de:
- Nuevos módulos
- Nuevas APIs
- Nuevos eventos
- Nuevas pantallas

### plopfile.js (59,265 líneas)
Archivo de generación masivo que incluye generadores para todos los patrones del sistema.

---

## 11. INFRAESTRUCTURA

### Docker
- `Dockerfile`: Multi-stage build (Alpine), optimizado
- `docker-compose.yml`: Configuración para 2 cores (`core-a`, `core-b`)
- `docker/`: Configuraciones adicionales

### Deployment
- `deployment/`: Helm chart para Kubernetes
- Scripts operacionales:
  - `start.sh` (10,906 líneas) — Arranque completo con detección de plataforma
  - `stop.sh` (5,427 líneas) — Shutdown graceful
  - `dev.sh` (8,011 líneas) — Modo desarrollo con hot-reload
  - `restart.sh` (2,183 líneas) — Restart con preservación de estado
  - `install.sh` (1,908 líneas) — Instalador auto-detectante (Termux/Linux)

### Puertos
| Puerto | Servicio |
|--------|----------|
| 3000 | HTTP Gateway |
| 1883 | MQTT Broker (TCP) |
| 9001 | MQTT over WebSocket |

---

## 12. ESTADO REAL vs DOCUMENTADO

### Lo que FUNCIONA (implementado en código):
1. **Core completo:** MQTT broker embebido, EventBus híbrido, HTTP Gateway, Module Loader con auto-wiring de APIs/tools/events/UI handlers, Hooks, Observability
2. **Module Loader avanzado:** `wireEventSubscriptions()` y `wireUIHandlers()` YA están implementados con cleanup automático
3. **35+ módulos** cargables con auto-descubrimiento
4. **14 módulos PizzePOS** con flujo completo de eventos
5. **AI Gateway** multi-proveedor (6 LLMs) con function calling y streaming
6. **Tool system unificado** (module tools + provider tools)
7. **Frontend SvelteKit** funcional con MQTT

### Lo que NO está implementado o está roto:
1. **Seguridad (3/10):** Sin autenticación HTTP, sin ACLs MQTT, sin rate limiting, sin SSL/TLS documentado
2. **Discovery y Flow Engine:** Implementados en core pero NO conectados al startup
3. **Connection pooling MQTT:** Implementado pero deshabilitado
4. **CI/CD:** No existe
5. **Cobertura de tests:** Sin herramienta de coverage, sin tests por módulo
6. **Migración de módulos:** Los módulos que usan `subscribes` SIN campo `handler` no se auto-wiran (el loader los ignora). Módulos que se suscriben imperativamente en `onLoad()` siguen funcionando pero con riesgo de leaks si no limpian en `onUnload()`

### Descuadre principal entre documentación y código:
- El `plan.md` describe que `wireEventSubscriptions` y `wireUIHandlers` NO existen → **YA están implementados en `loader.js`**
- El `SYSTEM-ANALYSIS.md` anterior decía que el loader NO auto-wires subscribes → **INCORRECTO, ya lo hace** (pero solo para subscribes que declaran `handler`)
- La versión en `index.js` dice "v0.1.0", en `package.json` dice "v0.2.0", el README dice "v0.5.0"

---

## 13. MAPA DE DEPENDENCIAS ENTRE COMPONENTES

```
index.js (orquestador)
  ├── core/config        → loadConfig()
  ├── core/observability  → Logger, Tracer, Metrics, ActivityLogger
  ├── core/validation     → ValidationManager, commonSchemas
  ├── core/mqtt           → MQTTClient (→ core/broker/embedded)
  ├── core/hooks          → HookManager
  ├── core/events         → EventBus (usa mqtt, hooks, tracer, metrics)
  ├── core/ui             → UIRequestHandler (usa mqttClient)
  ├── core/providers      → ProviderSystem (loader, registry, executor)
  ├── core/modules        → ModuleLoader + ModuleRegistry
  │     ├── Descubre ./modules/*/module.json
  │     ├── Auto-wire: apis → HTTPGateway
  │     ├── Auto-wire: tools → toolsRegistry
  │     ├── Auto-wire: subscribes[handler] → EventBus
  │     └── Auto-wire: ui_handlers → UIRequestHandler
  ├── core/handler-loader → HandlerLoader (→ handlers/global/, handlers/projects/)
  ├── core/service-executor → ServiceExecutor
  ├── core/utils          → ServiceRegistry
  └── core/gateway/http   → HTTPGateway (usa registry, eventBus, validation, compression, cache)
```

---

## 14. RESUMEN EJECUTIVO

**Event-Core es un sistema ambicioso y bien diseñado** que implementa correctamente su visión de meta-core event-driven. Los patrones arquitectónicos son sólidos:

1. **IoC real:** Los módulos declaran contratos en JSON; el loader los conecta
2. **Event-driven puro:** Todo fluye por eventos (MQTT + EventEmitter)
3. **Fractal:** Múltiples cores pueden comunicarse via MQTT
4. **Modular:** 35+ módulos con auto-descubrimiento y hot-reload

**El estado real del sistema está entre v0.2.0 y v0.3.0.** Los puntos críticos para producción son:

| Prioridad | Issue | Impacto |
|-----------|-------|---------|
| P0 | Sin autenticación HTTP/MQTT | Cualquiera puede acceder |
| P1 | Módulos con suscripciones imperativas | Leaks de memoria en hot-reload |
| P1 | Discovery/Flow no conectados | Capacidades implementadas pero inaccesibles |
| P2 | Sin CI/CD | No hay pipeline de validación |
| P2 | Código muerto (_archived, handlers deprecated) | Confusión, deuda técnica |
| P3 | Frontend sin telemetría | Sin visibilidad del lado cliente |
| P3 | Versiones inconsistentes | Confusión sobre estado real |

**Lo más importante:** El Module Loader YA implementa `wireEventSubscriptions()` y `wireUIHandlers()`. El trabajo pendiente es **migrar los `module.json` de los módulos** que aún no declaran `handler` en sus `subscribes`, y luego eliminar el código imperativo redundante de sus `onLoad()`.
