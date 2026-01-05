# Event Core - Índice de Documentación

**Versión:** v0.5.0 + AI Agents
**Fecha:** 2026-01-04

---

## 📚 Documentación Completa

### 🎯 Sistema de APIs

| Documento | Descripción | Nivel | Tiempo |
|-----------|-------------|-------|--------|
| **[API_SYSTEM.md](./API_SYSTEM.md)** | Arquitectura completa del sistema de APIs | Todos | 45 min |
| **[API_FLOW_DIAGRAM.md](./API_FLOW_DIAGRAM.md)** | Diagrama visual paso a paso con código | Todos | 30 min |

**Contenido de API_SYSTEM.md:**
- Arquitectura del sistema de APIs
- Componentes principales (HTTP Gateway, Module Loader, Módulos, Hooks)
- Flujo completo de una petición HTTP (9 pasos)
- Cómo los módulos exponen APIs
- HTTP Gateway en detalle
- Hook System e interceptación
- 3 ejemplos prácticos completos
- Testing de APIs
- Mejores prácticas

**Contenido de API_FLOW_DIAGRAM.md:**
- Diagrama ASCII del flujo completo
- 10 pasos explicados con referencias al código
- Ejemplo real con trazas de logs
- Tabla resumen con archivos y líneas
- Diagrama simplificado de alto nivel

---

### 📖 Guías Prácticas Paso a Paso

| Guía | Descripción | Nivel | Tiempo |
|------|-------------|-------|--------|
| **[GUIA_CREAR_MODULO.md](./GUIA_CREAR_MODULO.md)** | Cómo crear un módulo con APIs desde cero | Principiante | 30 min |
| **[GUIA_HOOKS.md](./GUIA_HOOKS.md)** | Autenticación e interceptación con Hooks | Intermedio | 30 min |
| **[GUIA_TESTING.md](./GUIA_TESTING.md)** | Testing completo de APIs y módulos | Intermedio | 45 min |
| **[GUIA_EVENT_BUS.md](./GUIA_EVENT_BUS.md)** | Integración con Event Bus para eventos | Intermedio | 30 min |
| **[UI_DEVELOPER_GUIDE.md](./UI_DEVELOPER_GUIDE.md)** | Agregar interfaces gráficas a módulos | Todos | 20 min |

#### GUIA_CREAR_MODULO.md

**Contenido:**
- 3 ejemplos completos de módulos:
  1. **TODO List** (Básico) - CRUD completo con estado en memoria
  2. **User Management** (Intermedio) - Con autenticación y roles
  3. **Database Module** (Avanzado) - Con integración de BD
- Estructura completa de un módulo
- Best practices
- Checklist de creación

**Aprenderás:**
- Crear `module.json` (manifest)
- Implementar handlers
- Validar inputs
- Manejar errores
- Publicar eventos
- Registrar métricas
- Lifecycle hooks (onLoad, onUnload)

#### GUIA_HOOKS.md

**Contenido:**
- ¿Qué son los Hooks?
- Tipos: `beforeRequest` y `afterResponse`
- 5 ejemplos completos:
  1. **Autenticación con JWT** - Sistema completo de auth
  2. **Rate Limiting** - Limitar peticiones por IP
  3. **Request Logging** - Logging detallado
  4. **CORS Avanzado** - Configuración dinámica
  5. **Request Validation** - Validación de schemas
- Best practices

**Aprenderás:**
- Interceptar peticiones antes del procesamiento
- Implementar autenticación global
- Cancelar peticiones (retornar 401, 403, etc)
- Añadir datos a la request (ej: usuario autenticado)
- Modificar responses
- Añadir headers custom

#### GUIA_TESTING.md

**Contenido:**
- Tipos de tests (unitarios, integración, hooks, eventos)
- Tests unitarios de handlers
- Tests de integración HTTP
- Tests de hooks
- Tests de Event Bus
- Test helper utilities
- Best practices

**Aprenderás:**
- Crear mocks del core
- Testear handlers sin HTTP
- Testear flujo HTTP completo
- Testear autenticación
- Verificar eventos publicados
- Organizar tests
- Coverage > 80%

#### GUIA_EVENT_BUS.md

**Contenido:**
- ¿Qué es el Event Bus?
- Publicar eventos
- Suscribirse a eventos
- 3 ejemplos completos:
  1. **TODO con Notificaciones** - Notificar cuando se completa tarea
  2. **User Activity Tracker** - Registrar toda la actividad
  3. **Workflow Automation** - Automatizar workflows
- Eventos entre cores (MQTT)
- Best practices

**Aprenderás:**
- Publicar eventos cuando algo importante sucede
- Suscribirse a eventos de otros módulos
- Comunicación desacoplada entre módulos
- Workflows automáticos basados en eventos
- Distribución de eventos vía MQTT

#### UI_DEVELOPER_GUIDE.md

**Contenido:**
- Sistema UI JSON-Driven (zero dependencies)
- 5 tipos de vistas: Table, Form, Detail, Dashboard, Custom
- Design System con CSS variables
- Ejemplo completo del módulo TODO con UI
- JSON schemas para cada tipo de vista
- Componentes disponibles
- Field types (13+ tipos de campos)

**Aprenderás:**
- Agregar interfaces gráficas a módulos sin HTML/CSS/JS
- Definir vistas en `module.json`
- Crear tablas con filtros y paginación
- Crear formularios con validación
- Dashboards con widgets
- Usar el Design System
- Ver la UI en `http://localhost:3000/ui`

---

### 🏗️ Arquitectura

| Documento | Descripción |
|-----------|-------------|
| **[CORE_DEFINITION.md](./CORE_DEFINITION.md)** | Definición completa del core (2,655 líneas) |
| **[ARCHITECTURE_FINAL.md](./ARCHITECTURE_FINAL.md)** | Arquitectura refactorizada correcta |
| **[SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md)** | Security como módulo (1,641 líneas) |
| **[SECURITY_AS_MODULE.md](./SECURITY_AS_MODULE.md)** | Guía de refactorización |
| **[ARCHITECTURAL_CHANGES.md](./ARCHITECTURAL_CHANGES.md)** | Control de cambios |

---

### 🤖 AI Integration

| Documento | Descripción |
|-----------|-------------|
| **[AI_TOOLS_REFERENCE.md](./AI_TOOLS_REFERENCE.md)** | Referencia completa de 29 AI tools disponibles |
| **[AI_AGENTS_ARCHITECTURE.md](./AI_AGENTS_ARCHITECTURE.md)** | Arquitectura del sistema de agentes auto-generativos |
| **[PLAN-AI-AGENTS.md](./PLAN-AI-AGENTS.md)** | Plan de implementación de agentes |
| **[PLAN-CHAT-INTEGRATION.md](./PLAN-CHAT-INTEGRATION.md)** | Plan de integración del sistema de chat AI |

**Contenido de AI_TOOLS_REFERENCE.md:**
- 29 herramientas organizadas en 9 categorías
- Credential Manager: `credential.list`
- Prompt Manager: `prompt.list`, `prompt.get`, `prompt.render`
- Database Manager: `db.query`, `db.tables`, `db.schema`, `db.execute`
- Filesystem: `fs.cleanup`, `fs.stats`
- PDF Viewer: `pdf.list`, `pdf.metadata`, `pdf.extract`
- Code Executor: `shell.exec`, `shell.script`, `shell.background`, `shell.kill`, `shell.list`
- **AI Agent Framework:** `agent.list`, `agent.get`, `agent.trigger`, `agent.stats`, `create_prompt`, `create_agent`, `list_agents`
- **OCR Service:** `ocr.extract`
- **Telegram Service:** `telegram.send_message`, `telegram.get_file`, `telegram.list_bots`
- Tool translation para múltiples proveedores (Anthropic, OpenAI, DeepSeek, Ollama)
- Seguridad: tools que requieren confirmación
- Arquitectura del Agente Arquitecto

**Contenido de AI_AGENTS_ARCHITECTURE.md:**
- Sistema de agentes auto-generativos
- Agente Arquitecto (meta-agente que crea agentes)
- Integración con telegram-service, ocr-service, ai-gateway
- Flujos de creación de agentes
- Configuración de providers (DeepSeek por defecto)
- Roadmap de implementación

---

### 🔧 Port Management System

| Documento | Descripción |
|-----------|-------------|
| **[PORT_MANAGEMENT_SUMMARY.md](../PORT_MANAGEMENT_SUMMARY.md)** | Resumen completo del sistema de puertos |
| **[PUERTOS.md](../PUERTOS.md)** | Diseño técnico original (1,096 líneas) |

**Contenido:**
- Problema resuelto (EADDRINUSE)
- Arquitectura (Port Manager, Service Registry, Orchestrator)
- 49 tests (100% pasando)
- Ejemplos de uso
- Métricas y beneficios

---

## 🚀 Quick Start

### Para Principiantes (Nueva en Event Core)

**Orden de lectura recomendado:**

1. **[API_SYSTEM.md](./API_SYSTEM.md)** - Entender la arquitectura general (30 min)
2. **[API_FLOW_DIAGRAM.md](./API_FLOW_DIAGRAM.md)** - Ver el flujo con diagrama (15 min)
3. **[GUIA_CREAR_MODULO.md](./GUIA_CREAR_MODULO.md)** - Crear tu primer módulo (30 min)
4. **[GUIA_TESTING.md](./GUIA_TESTING.md)** - Testear tu módulo (30 min)
5. **[GUIA_EVENT_BUS.md](./GUIA_EVENT_BUS.md)** - Integrar con eventos (20 min)

**Total: ~2 horas**

### Para Usuarios Intermedios

**Ya sabes lo básico, ahora aprende:**

1. **[GUIA_HOOKS.md](./GUIA_HOOKS.md)** - Autenticación global con hooks (30 min)
2. **[GUIA_EVENT_BUS.md](./GUIA_EVENT_BUS.md)** - Workflows automáticos (20 min)
3. **[PORT_MANAGEMENT_SUMMARY.md](../PORT_MANAGEMENT_SUMMARY.md)** - Multi-core (15 min)

**Total: ~1 hora**

### Para Usuarios Avanzados

**Profundiza en la arquitectura:**

1. **[CORE_DEFINITION.md](./CORE_DEFINITION.md)** - Definición completa
2. **[ARCHITECTURE_FINAL.md](./ARCHITECTURE_FINAL.md)** - Arquitectura interna
3. **[SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md)** - Sistema de seguridad
4. **[PUERTOS.md](../PUERTOS.md)** - Diseño técnico de puertos

---

## 📊 Resumen de Conceptos

### Flujo de una Petición HTTP

```
Cliente → HTTP Gateway → beforeRequest Hook → Routing →
Handler del Módulo → afterResponse Hook → Respuesta
```

### Componentes Clave

1. **HTTP Gateway** (`core/gateway/http.js`)
   - Servidor HTTP central
   - Maneja CORS
   - Ejecuta hooks
   - Enruta a módulos

2. **Module Loader** (`core/modules/loader.js`)
   - Descubre módulos en `./modules/`
   - Lee manifests (`module.json`)
   - Auto-registra APIs
   - Hot-reload

3. **Módulos** (`modules/*/index.js`)
   - Implementan lógica de negocio
   - Exponen APIs vía manifest
   - Publican eventos
   - Reciben core context

4. **Hook System** (`core/hooks.js`)
   - Intercepta peticiones
   - `beforeRequest` - Antes de procesar
   - `afterResponse` - Después de procesar
   - Útil para auth, validación, logging

5. **Event Bus** (`core/events/bus.js`)
   - Pub/Sub entre módulos
   - Local (EventEmitter) + Distribuido (MQTT)
   - Desacoplamiento total
   - Workflows automáticos

### Patrón de URL para Módulos

```
/modules/{nombre_modulo}/{path}

Ejemplos:
GET  /modules/echo/ping
POST /modules/echo/echo
GET  /modules/todo-list/todos
POST /modules/todo-list/todos
GET  /modules/todo-list/todos/1
PUT  /modules/todo-list/todos/1
```

### Ejemplo de Módulo Completo

```javascript
// modules/mi-modulo/module.json
{
  "name": "mi-modulo",
  "version": "1.0.0",
  "apis": [
    {
      "method": "GET",
      "path": "/items",
      "handler": "handleList"
    }
  ],
  "events": {
    "publishes": ["item.created"],
    "subscribes": ["user.login"]
  }
}

// modules/mi-modulo/index.js
class MiModulo {
  constructor(core) {
    this.core = core;
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;
    this.hooks = core.hooks;
  }

  async onLoad() {
    // Suscribirse a eventos
    this.eventBus.subscribe('user.login', this.onUserLogin.bind(this));

    // Registrar hooks
    this.hooks.register('beforeRequest', this.checkAuth.bind(this));
  }

  async handleList(request) {
    // Validar
    // Procesar
    // Retornar
    return {
      statusCode: 200,
      body: { items: [...] }
    };
  }

  async onUserLogin(event) {
    // Reaccionar a evento
  }

  async checkAuth({ request }) {
    // Interceptar request
    return { cancelled: false, data: { request } };
  }

  async onUnload() {
    // Cleanup
  }
}

module.exports = MiModulo;
```

---

## 🎯 Por Caso de Uso

### Quiero crear un módulo simple
→ **[GUIA_CREAR_MODULO.md](./GUIA_CREAR_MODULO.md)** - Ejemplo 1 (TODO List)

### Quiero añadir autenticación
→ **[GUIA_HOOKS.md](./GUIA_HOOKS.md)** - Ejemplo 1 (JWT Auth)

### Quiero testear mi módulo
→ **[GUIA_TESTING.md](./GUIA_TESTING.md)** - Tests unitarios e integración

### Quiero que módulos se comuniquen
→ **[GUIA_EVENT_BUS.md](./GUIA_EVENT_BUS.md)** - Ejemplo 1 (Notificaciones)

### Quiero correr múltiples cores
→ **[PORT_MANAGEMENT_SUMMARY.md](../PORT_MANAGEMENT_SUMMARY.md)** - Multi-core setup

### Quiero entender la arquitectura
→ **[API_SYSTEM.md](./API_SYSTEM.md)** - Arquitectura completa

### Quiero ver el flujo de código
→ **[API_FLOW_DIAGRAM.md](./API_FLOW_DIAGRAM.md)** - Diagrama con líneas de código

### Quiero integrar AI con tools
→ **[AI_TOOLS_REFERENCE.md](./AI_TOOLS_REFERENCE.md)** - 18 tools para AI chat

---

## 💡 Ejemplos Rápidos

### Crear un Handler

```javascript
async handleCreate(request) {
  // 1. Validar
  if (!request.body.name) {
    return {
      statusCode: 400,
      body: { error: 'Name is required' }
    };
  }

  // 2. Procesar
  const item = this.create(request.body);

  // 3. Log
  this.logger.info('item.created', { itemId: item.id });

  // 4. Evento
  await this.eventBus.publish('item.created', {
    itemId: item.id,
    name: item.name
  });

  // 5. Métrica
  this.metrics.increment('items.created');

  // 6. Retornar
  return {
    statusCode: 201,
    body: { item }
  };
}
```

### Registrar un Hook

```javascript
async onLoad() {
  this.hooks.register('beforeRequest', async ({ request }) => {
    // Autenticación
    if (!request.headers.authorization) {
      return {
        cancelled: true,
        statusCode: 401,
        response: { error: 'Unauthorized' }
      };
    }

    return { cancelled: false, data: { request } };
  });
}
```

### Suscribirse a Eventos

```javascript
async onLoad() {
  this.eventBus.subscribe('user.created', async (event) => {
    const { userId, email } = event.payload;

    // Enviar email de bienvenida
    await this.sendWelcomeEmail(email);

    this.logger.info('welcome.email.sent', { userId });
  });
}
```

---

## 📝 Archivos Importantes

### Código del Core

| Archivo | Descripción | Líneas |
|---------|-------------|--------|
| `core/gateway/http.js` | HTTP Gateway | 460 |
| `core/modules/loader.js` | Module Loader | 320 |
| `core/hooks.js` | Hook System | 200 |
| `core/events/bus.js` | Event Bus | 250 |
| `core/utils/port-manager.js` | Port Manager | 180 |
| `core/utils/service-registry.js` | Service Registry | 300 |
| `core/orchestrator/service-manager.js` | Service Orchestrator | 400 |

### Ejemplos de Módulos

| Módulo | Descripción | Líneas |
|--------|-------------|--------|
| `modules/echo/index.js` | Módulo de ejemplo simple | 150 |
| `modules/file-watcher/index.js` | File watcher con estado | 200 |
| `modules/security-p2p/index.js` | Security (base) | 300 |

### Tests

| Test | Descripción | Tests |
|------|-------------|-------|
| `tests/unit/hooks.test.js` | Tests del Hook System | 21 |
| `tests/unit/observability.test.js` | Tests de Observability | 19 |
| `tests/unit/http-gateway.test.js` | Tests del HTTP Gateway | 20 |
| `tests/integration/full-stack.test.js` | Tests de integración | 18 |
| `tests/integration/port-management.test.js` | Tests de Port Management | 49 |

---

## ❓ FAQ

### ¿Cómo creo un nuevo módulo?

Lee **[GUIA_CREAR_MODULO.md](./GUIA_CREAR_MODULO.md)** - Tiene 3 ejemplos completos paso a paso.

### ¿Cómo añado autenticación?

Lee **[GUIA_HOOKS.md](./GUIA_HOOKS.md)** - Ejemplo 1 muestra autenticación JWT completa.

### ¿Cómo testeo mi módulo?

Lee **[GUIA_TESTING.md](./GUIA_TESTING.md)** - Cubre tests unitarios e integración.

### ¿Cómo comunico módulos entre sí?

Lee **[GUIA_EVENT_BUS.md](./GUIA_EVENT_BUS.md)** - Pub/Sub con eventos.

### ¿Puedo correr múltiples cores?

Sí! Lee **[PORT_MANAGEMENT_SUMMARY.md](../PORT_MANAGEMENT_SUMMARY.md)**.

### ¿Dónde está el código del HTTP Gateway?

`core/gateway/http.js` - También lee **[API_FLOW_DIAGRAM.md](./API_FLOW_DIAGRAM.md)** para ver el flujo.

### ¿Cómo se registran las rutas automáticamente?

El Module Loader lee `module.json` de cada módulo y registra las APIs. Ver **[API_SYSTEM.md](./API_SYSTEM.md)**.

### ¿Qué herramientas puede usar el AI?

Lee **[AI_TOOLS_REFERENCE.md](./AI_TOOLS_REFERENCE.md)** - 29 tools organizadas en 9 categorías: Credenciales, Prompts, Base de Datos, Filesystem, PDF, Ejecución de código, Agentes, OCR y Telegram.

### ¿Cómo creo agentes que se comuniquen entre módulos?

Lee **[AI_AGENTS_ARCHITECTURE.md](./AI_AGENTS_ARCHITECTURE.md)** - Arquitectura del sistema de agentes auto-generativos que permite a la IA crear agentes funcionales.

### ¿Cómo integro Telegram con OCR?

Lee **[PLAN-AI-AGENTS.md](./PLAN-AI-AGENTS.md)** - Plan de implementación que incluye el patrón Telegram → OCR → Respuesta.

---

## 🎓 Recursos Adicionales

- **Project README**: `../README.md`
- **Status**: `../STATUS.md`
- **Roadmap**: `../strategy/v1/roadmap.json`
- **OKRs**: `../strategy/v1/okrs_2025-Q4.json`

---

## 📫 Soporte

Para preguntas o issues:
- GitHub: https://github.com/anthropics/claude-code/issues
- Docs: https://docs.claude.com/en/docs/claude-code/

---

**Última actualización:** 2026-01-04
**Versión:** v0.5.0 + AI Agents
**Estado:** Documentación completa ✅

## 🆕 Novedades v0.5.0

- **AI Agent Framework**: Sistema de agentes event-driven
- **Agente Arquitecto**: Meta-agente que crea otros agentes
- **telegram-service**: Integración multi-bot con Telegram
- **ocr-service**: OCR con múltiples engines (Tesseract, OpenAI Vision, Claude Vision)
- **29 AI Tools**: Nuevas herramientas para agentes, OCR y Telegram
