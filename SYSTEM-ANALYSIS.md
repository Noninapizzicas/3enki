# Analisis del Sistema Event-Core

> Fecha: 2026-02-16
> Autor: Analisis automatizado
> Version analizada: v0.2.0 (package.json) / README dice v0.5.0

---

## 1. RESUMEN EJECUTIVO

**Event-Core** es un framework event-driven fractal construido sobre Node.js 18+ con MQTT (Aedes), SvelteKit 5, y SQLite (sql.js). Implementa una arquitectura distribuida de multiples cores que se comunican via MQTT, con un sistema modular de 40 modulos y 32+ proveedores de servicios.

### Veredicto General: 6/10

El sistema esta **bien arquitectado** pero tiene **deuda tecnica significativa**: codigo muerto, modulos monoliticos, refactorizaciones incompletas, e inconsistencias entre documentacion y estado real.

---

## 2. ARQUITECTURA CORE

### 2.1 Punto de Entrada: `index.js`

Orquestador principal que inicializa 15 sistemas en secuencia:

```
1. Cargar Config (CLI > ENV > config.{env}.json > config.json)
2. Inicializar Observabilidad (Logger, Tracer, Metrics)
3. Inicializar Validacion (JSON Schema con AJV)
4. Conectar MQTT (broker externo o embebido fallback)
5. Inicializar Hooks (interceptores pre/post)
6. Inicializar EventBus (hibrido local + MQTT)
7. Inicializar ActivityLogger
8. Inicializar UI Handler
9. Cargar Providers (servicios externos)
10. Cargar Modulos (auto-discovery + carga dinamica)
11. Cargar Handlers (acciones centralizadas)
12. Inicializar Service Registry (puertos + heartbeat)
13. Iniciar HTTP Gateway (REST API)
14. Registrar en Service Registry (heartbeat cada 10s)
15. Manejar Signals (shutdown graceful SIGINT/SIGTERM)
```

### 2.2 Sistemas Core

| Sistema | Ubicacion | Funcion | Estado |
|---------|-----------|---------|--------|
| **EventBus** | `core/events/bus.js` | Pub/sub hibrido (local + MQTT) | Funcional |
| **Event Envelope** | `core/events/envelope.js` | Formato estandar de eventos con trace | Funcional |
| **MQTT Client** | `core/mqtt/client.js` | Cliente con fallback a broker embebido | Funcional |
| **Embedded Broker** | `core/broker/embedded.js` | Aedes MQTT broker (TCP:1883 + WS:9001) | Funcional |
| **Hook System** | `core/hooks.js` | Interceptores pre/post operacion | Funcional |
| **Handler Loader** | `core/handler-loader.js` | Auto-discovery y carga de handlers | Funcional |
| **Handler Store** | `core/handler-store.js` | Persistencia key-value por handler | Funcional (sincrono) |
| **Service Executor** | `core/service-executor.js` | Request-response sobre MQTT (60s timeout) | Funcional |
| **Module Loader** | `core/modules/loader.js` | Discovery y carga dinamica de modulos | **INCOMPLETO** |
| **Module Registry** | `core/modules/registry.js` | Registro central de capacidades | Funcional |
| **Provider System** | `core/providers/` | Integracion con servicios externos | Funcional |
| **Validation** | `core/validation/` | JSON Schema con AJV | Funcional |
| **Observability** | `core/observability/` | Logger, Tracer, Metrics, ActivityLogger | Funcional |
| **HTTP Gateway** | `core/gateway/http.js` | REST API (Node.js nativo, sin Express) | Funcional |
| **Discovery** | `core/discovery/` | Multi-core auto-discovery via MQTT | **NO ACTIVADO** en index.js |
| **Flow Engine** | `core/flow/` | Motor de flujos paso a paso | **NO ACTIVADO** en index.js |
| **Config** | `core/config/` | Carga jerarquica de configuracion | Funcional |

### 2.3 Patrones Arquitectonicos

1. **Diseno Fractal/Multi-Core**: Multiples cores identicos comunicados via MQTT
2. **Capas**: HTTP Gateway > Modulos > EventBus > MQTT Broker
3. **Event-Driven**: Toda comunicacion asincrona via eventos
4. **IoC (Inversion de Control)**: Modulos/handlers no se conocen entre si
5. **Fallback/Resiliencia**: Broker externo > embebido, modulos aislados

---

## 3. INVENTARIO DE MODULOS (40 total)

### 3.1 Modulos Core (28)

| Modulo | Version | Lineas | UI | Estado | Problemas |
|--------|---------|--------|----|--------|-----------|
| credential-manager | 2.0.0 | 2472 | Si | Activo | 6 event leaks + 11 UI leaks |
| ai-gateway | 1.0.0 | 1745 | Si | Activo | 3 event leaks, inicio lento (~60s) |
| prompt-manager | 2.0.0 | 1618 | Si | Activo | 2 event + 13 UI leaks |
| project-manager | 2.0.0 | 3731 | Si | Activo | **MONOLITO - necesita split** |
| chat-session | 1.0.0 | 1411 | Si | Activo | OK |
| database-manager | 2.0.0 | 1425 | Si | Activo | 2 event leaks |
| prompt-composer | 1.1.0 | 1306 | Si | Activo | OK |
| ui-designer | 1.0.0 | 1280 | Si | Parcial | Conflicto con blueprints |
| filesystem | 1.0.0 | 1232 | Si | Activo | 15 UI leaks |
| chat-ai-bridge | 1.0.0 | 1201 | Si | Activo | OK |
| scheduler | 1.0.0 | 1146 | Si | Activo | 11 UI leaks, TODO concurrencia |
| pdf-viewer | 1.0.0 | 896 | Si | Activo | 3 UI leaks |
| calling-generator | 2.0.0 | 811 | Si | Activo | 4 event leaks |
| telegram-service | 3.0.0 | 752 | Si | Activo | 14 eventos divergentes |
| metricas | 1.0.0 | 713 | Si | Activo | 5 event leaks |
| code-executor | 1.0.0 | 620 | Si | Activo | OK |
| ai-agent-framework | 1.0.0 | 610 | Si | Activo | OK |
| text-editor | 1.0.0 | 579 | Si | Activo | 4 UI leaks, dep inexistente |
| admin-panel | 1.0.0 | 542 | Si | Activo | TODO: creacion agentes |
| plugin-manager | 2.0.0 | - | Si | Activo | 2 event leaks |
| log-manager | 2.0.0 | - | Parcial | Activo | OK |
| system-inspector | 1.0.0 | - | No | Dev only | OK |
| dashboard | 2.0.0 | - | Si | **Deshabilitado** | Movido a web UI |
| notas | 1.0.0 | - | Si | **Deshabilitado** | Sin uso |
| scratch-designer | 2.0.0 | - | Si | **Deshabilitado** | Incompleto |
| conversation-manager | 2.1.0 | 523 | Si | **DEPRECATED** | Reemplazado por chat-session |
| bot-manager | 1.0.0 | - | No | Activo | OK |
| agent-manager | 1.0.0 | - | No | Activo | OK |

### 3.2 Modulos PizzePOS (12)

| Modulo | Funcion | Problemas |
|--------|---------|-----------|
| menu-generator | Generador de menus con IA/OCR | TODOs: Glovo, WhatsApp, Twilio |
| productos | Catalogo de productos | OK |
| categorias | Categorias de productos | OK |
| ingredientes | Gestion de ingredientes | OK |
| variaciones | Variaciones de producto | OK |
| pedidos | Gestion de pedidos | OK |
| cuentas | Cuentas/mesas | OK |
| cuentas-canales | Multi-canal (delivery, llevar, telefono) | **Integraciones stub** |
| comandero | Interfaz camarero | **Siendo reemplazado** por pedidos |
| persistencia-comandero | Persistencia de sesion | **Legacy** |
| cocina | Display de cocina (KDS) | OK |
| cobros | Procesamiento de pagos (7 metodos) | OK |

### 3.3 Hallazgo Critico: 13 Modulos con Bugs

Segun `plan.md`, el Module Loader **NO auto-wirea** eventos ni UI handlers. Esto causa:

- **metricas**: 5 event leaks
- **plugin-manager**: 2 event leaks
- **calling-generator**: 4 event leaks
- **credential-manager**: 6 event leaks + 11 UI leaks
- **prompt-manager**: 2 event + 13 UI leaks
- **filesystem**: 15 UI leaks
- **scheduler**: 11 UI leaks
- **pdf-viewer**: 3 UI leaks
- **text-editor**: 4 UI leaks
- **telegram-service**: 14 eventos divergentes
- **database-manager**: 2 event leaks
- **ai-gateway**: 3 event leaks
- **admin-panel**: 1 event leak

**Total: ~100 event/UI leaks no gestionados por el loader.**

---

## 4. SERVICIOS Y PROVEEDORES (32+)

### 4.1 Proveedores de IA (LLMs)
- DeepSeek, Claude (Anthropic), OpenAI, Groq, Gemini, Ollama

### 4.2 Proveedores de Vision/OCR
- Google Vision, Claude Vision, OpenAI Vision, Tesseract, OCR.space, Google DocumentAI

### 4.3 Proveedores de Audio
- Whisper (STT), ElevenLabs (TTS), Google TTS

### 4.4 Proveedores de Documentos
- pdf-parse, pdfjs, pdf-to-png, FFmpeg

### 4.5 Proveedores de Datos/Integracion
- CSV, Zip, SVG, SQL.js, Notion

### 4.6 Plugins
- GitHub (5 funciones), Slack (5), Weather (3), HTTP-Utils (3)
- OCR engines: claude-vision, google-vision, openai-vision

---

## 5. FRONTEND

| Aspecto | Detalle |
|---------|---------|
| Framework | SvelteKit 2.16.0 + Svelte 5.16.0 |
| Lenguaje | TypeScript 5.7.2 |
| Build | Vite 6.0.3 |
| Estilo | Tailwind CSS (migracion en curso) |
| Comunicacion | MQTT via mqtt 5.14.1 |
| Archivos | 116 archivos (68 .svelte, 48 .ts) |
| Rutas | 14 paginas SvelteKit |
| Stores | 6 stores Svelte |

**Problemas:**
- Rutas legacy (`/menu-generator/`, `/comandero/`) fuera de scope de proyecto
- Migracion Tailwind incompleta
- Sin telemetria de rendimiento frontend
- Conexion MQTT no pooled

---

## 6. INFRAESTRUCTURA

### 6.1 Docker
- Dockerfile multi-stage (Alpine 18), usuario no-root, health checks
- docker-compose.yml: 2 cores (Core A + Core B)

### 6.2 Kubernetes
- Helm chart completo (StatefulSet, HPA, Ingress, ServiceAccount)
- Falta documentacion de despliegue

### 6.3 Scripts Operativos
| Script | Funcion | Calidad |
|--------|---------|---------|
| start.sh | Arranque con deteccion de puertos | Buena |
| stop.sh | Shutdown graceful con fallback SIGKILL | Buena |
| dev.sh | Menu interactivo para desarrollo | Buena |
| restart.sh | Stop + Start | Basica |
| install.sh | Auto-deteccion Termux/Linux | Basica |

### 6.4 Tests
- **Unit tests**: hooks (21), observability (19), http-gateway (20), cli, security, conversation-manager
- **Integration tests**: full-stack (18/19 pass = 95%), port-management
- **Total estimado**: 60+ unit + 18 integration
- **Carencias**: Sin coverage tool, sin tests por modulo, sin e2e, sin CI/CD

---

## 7. DOCUMENTACION

| Documento | Lineas | Calidad | Problema |
|-----------|--------|---------|----------|
| README.md | 508 | Alta | Dice v0.5.0, real es v0.2.0 |
| plan.md | 422 | Alta | Todo es trabajo PENDIENTE |
| TEMPLATE_API.md | 1172 | Excelente | OK |
| TEMPLATE_EVENTOS.md | 838 | Excelente | OK |
| TEMPLATE_MODULO.md | 601 | Excelente | OK |
| INSTALL.md | - | Media | Falta Docker |
| contexto/ (27 archivos) | 230KB+ | Excelente | Mezcla ES/EN |
| prompts/ (15 prompts) | - | Buena | Sin telemetria |
| strategy/ | - | Media | Roadmap vs realidad desalineados |

### Hallazgo Critico: README vs plan.md

- **README dice**: v0.5.0 "Network - COMPLETADO", "Production Ready"
- **plan.md revela**: 13 modulos con bugs, Module Loader incompleto, 5 pasos pendientes
- **Realidad**: El sistema esta entre v0.2.0 y v0.3.0

---

## 8. CODIGO MUERTO Y DEUDA TECNICA

### 8.1 Codigo Archivado (~300-400 KB)
- `_archived/`: 3 directorios (UI v1, reset, otros-modulos)
- `handlers/global/archived/`: 30+ handlers deprecados (OCR, email, PDF)
- `plop-templates/chat-module/`: Template obsoleto

### 8.2 Modulos Deshabilitados en `/modules/`
- conversation-manager (DEPRECATED)
- scratch-designer (Incompleto)
- ui-designer (Parcial)
- dashboard (Movido)
- notas (Sin uso)

### 8.3 Sistemas No Activados
- `core/discovery/`: Definido pero no activado en startup
- `core/flow/`: Motor de flujos existente pero no usado
- Connection Pooling MQTT: Implementado pero deshabilitado

---

## 9. PROBLEMAS DE SEGURIDAD

| Problema | Severidad | Detalle |
|----------|-----------|---------|
| Sin autenticacion HTTP | ALTA | Todos los endpoints abiertos |
| Sin rate limiting | MEDIA | HTTP Gateway sin limites |
| Sin MQTT ACLs | MEDIA | Cualquiera puede pub/sub |
| Sin SSL/TLS docs | MEDIA | No hay guia de produccion |
| code-executor bypass potencial | BAJA | Regex de bloqueo puede ser evadido |

---

## 10. PUNTUACION POR AREA

| Area | Puntuacion | Nota |
|------|-----------|------|
| Arquitectura Core | 8/10 | Bien disenada, patrones correctos |
| Module Loader | 4/10 | APIs ok, Events/UI NO auto-wired |
| Modulos | 6/10 | Funcionales pero 13 con leaks |
| Frontend | 7/10 | SvelteKit 5, migracion Tailwind pendiente |
| Infraestructura | 7/10 | Docker/K8s ready |
| Tests | 5/10 | Basicos, sin coverage, sin CI/CD |
| Documentacion | 6.5/10 | Detallada pero inconsistente con realidad |
| Seguridad | 3/10 | Sin auth, sin rate limit, sin ACLs |
| PizzePOS | 6/10 | Funcional pero acoplado a pizzeria |
| Codigo Muerto | 3/10 | Limpieza significativa necesaria |
| Flows | 4/10 | Framework existe, infrautilizado |
| Proveedores | 7/10 | 32+ proveedores, falta admin UI |

### **Puntuacion Global: 6/10**

---

## 11. PRIORIDADES DE ACCION

### CRITICAS (Hacer Primero)

1. **Completar Module Loader** (plan.md pasos 1-5)
   - Auto-wiring de eventos y UI handlers
   - Esto resuelve los ~100 leaks en 13 modulos

2. **Anadir autenticacion HTTP**
   - Al menos API keys o JWT para el Gateway
   - Sin esto, cualquier endpoint es accesible

3. **Limpiar codigo muerto**
   - Mover 30+ handlers archivados fuera de `handlers/global/`
   - Mover modulos deshabilitados a `_archived/`

### ALTAS (Hacer Pronto)

4. **Dividir project-manager** (3731 lineas)
   - project-crud.js (~800 lineas)
   - project-composition.js (~1200 lineas)
   - project-context.js (~800 lineas)
   - project-ui.js (~930 lineas)

5. **Optimizar ai-gateway inicio**
   - Lazy load de proveedores o cache de credenciales
   - Reducir startup de ~60s a <10s

6. **Corregir README.md**
   - Actualizar version real (v0.2.0)
   - Documentar estado real vs aspiracional

### MEDIAS (Planificar)

7. Completar migracion Tailwind
8. Anadir tests por modulo (especialmente credential-manager, ai-gateway)
9. Implementar CI/CD (GitHub Actions)
10. Activar Discovery System en startup
11. Completar integraciones PizzePOS (Glovo, WhatsApp, Twilio)
12. Unificar idioma en documentacion (ES o EN, no ambos)

---

## 12. FORTALEZAS DEL SISTEMA

- Arquitectura event-driven genuinamente desacoplada
- 32+ proveedores de servicios integrados
- Documentacion interna exhaustiva (contexto/ con 27 archivos)
- Templates de codigo excelentes (TEMPLATE_*.md)
- Scripts operativos robustos (start/stop/dev)
- Fallback automatico (broker externo > embebido)
- Aislamiento de errores (un modulo falla, el resto sigue)
- Sistema de hooks para interceptar operaciones
- Persistencia por handler (handler-store)
- Soporte multi-core distribuido (aunque no activado)

---

## 13. CONCLUSION HONESTA

Event-Core es un **proyecto ambicioso con arquitectura solida** pero en estado de **desarrollo activo con deuda tecnica acumulada**. La vision fractal/distribuida es correcta y la base de codigo es extensible. Sin embargo:

1. **No esta en v0.5.0** como dice el README. Esta entre v0.2.0 y v0.3.0 funcionalmente.
2. **El Module Loader incompleto** es el problema raiz que causa ~100 leaks en 13 modulos.
3. **La seguridad es insuficiente** para cualquier despliegue fuera de localhost.
4. **El codigo muerto y modulos deshabilitados** anade confusion y carga cognitiva.
5. **PizzePOS funciona** pero esta tightly-coupled y las integraciones externas son stubs.

**El sistema necesita consolidacion antes de expansion.** Los proximos 3-6 meses deberian enfocarse en: completar el loader, limpiar codigo muerto, anadir autenticacion, y estabilizar los 13 modulos con leaks. Solo despues deberia considerarse anadir nuevas funcionalidades.
