# MQTT Request/Response Pattern

## Overview

Este documento define el patrón estándar de comunicación Request/Response sobre MQTT para la comunicación UI ↔ Backend en Event Core.

## Motivación

### Problema con Fire-and-Forget

El patrón tradicional MQTT (publish sin esperar respuesta) tiene limitaciones para operaciones de UI:

- **Sin garantía de respuesta**: No sabes si el backend procesó tu mensaje
- **Sin manejo de errores**: No hay forma de saber si algo falló
- **Sin timeout**: El UI puede quedarse esperando indefinidamente
- **Debugging difícil**: No hay correlación request ↔ response

### Solución: Request/Response sobre MQTT

Combina las ventajas de REST con la infraestructura MQTT existente:

| Característica | REST | MQTT Fire-and-Forget | MQTT Request/Response |
|----------------|------|---------------------|----------------------|
| Respuesta garantizada | ✅ | ❌ | ✅ |
| Status codes | ✅ | ❌ | ✅ |
| Timeout | ✅ | ❌ | ✅ |
| Single connection | ❌ | ✅ | ✅ |
| Real-time push | ❌ | ✅ | ✅ |

## Arquitectura

### Topics

```
UI → Backend (Request):
  ui/request/{domain}/{action}
  Ejemplo: ui/request/project/list

Backend → UI (Response):
  ui/response/{request_id}
  Ejemplo: ui/response/req_abc123
```

### Request Envelope

```typescript
interface UIRequest {
  request_id: string;      // UUID único para correlacionar respuesta
  action: string;          // Acción a ejecutar (ej: "list", "create")
  data: unknown;           // Payload de la acción
  timestamp: string;       // ISO 8601
  source: {
    client_id: string;     // ID único del cliente UI
  };
}
```

### Response Envelope

```typescript
interface UIResponse {
  request_id: string;      // Mismo ID del request
  status: number;          // HTTP-like status code (200, 400, 404, 500)
  success: boolean;        // Shorthand para status < 400
  data: unknown;           // Payload de respuesta
  error?: {                // Solo si success = false
    code: string;          // Código de error (ej: "NOT_FOUND")
    message: string;       // Mensaje legible
  };
  timestamp: string;       // ISO 8601
}
```

### Status Codes

Usamos códigos HTTP estándar para familiaridad:

| Code | Meaning | Uso |
|------|---------|-----|
| 200 | OK | Operación exitosa |
| 201 | Created | Recurso creado |
| 400 | Bad Request | Datos inválidos |
| 404 | Not Found | Recurso no existe |
| 409 | Conflict | Conflicto (ej: duplicado) |
| 500 | Internal Error | Error del servidor |

## Flujo de Comunicación

```
┌─────────────┐                              ┌─────────────┐
│   Frontend  │                              │   Backend   │
└─────────────┘                              └─────────────┘
       │                                            │
       │  1. Subscribe to ui/response/{request_id}  │
       │ ─────────────────────────────────────────► │
       │                                            │
       │  2. Publish to ui/request/project/list     │
       │ ─────────────────────────────────────────► │
       │                                            │
       │           3. Process request               │
       │                                            │
       │  4. Publish to ui/response/{request_id}    │
       │ ◄───────────────────────────────────────── │
       │                                            │
       │  5. Unsubscribe from ui/response/{req_id}  │
       │ ─────────────────────────────────────────► │
       │                                            │
```

## Implementación Frontend

### API Principal

```typescript
// Función principal para hacer requests
async function mqttRequest<T>(
  domain: string,
  action: string,
  data?: unknown,
  options?: { timeout?: number }
): Promise<UIResponse<T>>

// Ejemplos de uso
const projects = await mqttRequest('project', 'list');
const created = await mqttRequest('project', 'create', { name: 'Mi Proyecto' });
const updated = await mqttRequest('credential', 'update', { key, api_key });
```

### Manejo de Errores

```typescript
try {
  const result = await mqttRequest('project', 'create', { name: '' });
} catch (error) {
  if (error instanceof MqttTimeoutError) {
    // Backend no respondió en tiempo
  } else if (error instanceof MqttRequestError) {
    // Backend respondió con error
    console.log(error.status);  // 400
    console.log(error.code);    // "VALIDATION_ERROR"
    console.log(error.message); // "Name is required"
  }
}
```

### Timeout

- Default: 10 segundos
- Configurable por request
- Al timeout: Promise rechazada con MqttTimeoutError

## Implementación Backend

### Handler de Requests

```javascript
class UIRequestHandler {
  constructor(mqttClient, logger) {
    this.mqtt = mqttClient;
    this.logger = logger;
    this.handlers = new Map();
  }

  // Registrar handler para un dominio/acción
  register(domain, action, handler) {
    const key = `${domain}.${action}`;
    this.handlers.set(key, handler);
  }

  // Procesar request entrante
  async handleRequest(topic, message) {
    const request = JSON.parse(message);
    const { request_id, action, data } = request;

    // Extraer dominio del topic
    const domain = topic.split('/')[2];
    const key = `${domain}.${action}`;

    const handler = this.handlers.get(key);
    if (!handler) {
      return this.sendError(request_id, 404, 'HANDLER_NOT_FOUND');
    }

    try {
      const result = await handler(data, request);
      this.sendSuccess(request_id, 200, result);
    } catch (error) {
      this.sendError(request_id, error.status || 500, error.code, error.message);
    }
  }

  sendSuccess(request_id, status, data) {
    this.mqtt.publish(`ui/response/${request_id}`, {
      request_id,
      status,
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  }

  sendError(request_id, status, code, message) {
    this.mqtt.publish(`ui/response/${request_id}`, {
      request_id,
      status,
      success: false,
      error: { code, message },
      timestamp: new Date().toISOString()
    });
  }
}
```

### Registrar Handlers en Módulos

```javascript
// En project-manager/index.js
async onLoad(core) {
  // Registrar handlers de UI
  core.uiHandler.register('project', 'list', this.handleListProjects.bind(this));
  core.uiHandler.register('project', 'create', this.handleCreateProject.bind(this));
  core.uiHandler.register('project', 'update', this.handleUpdateProject.bind(this));
  core.uiHandler.register('project', 'delete', this.handleDeleteProject.bind(this));
}

async handleListProjects(data, request) {
  const projects = this.listProjects();
  return {
    projects,
    activeProjectId: this.activeProjectId,
    count: projects.length
  };
}

async handleCreateProject(data, request) {
  const { name, description, color, icon } = data;

  if (!name) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Name is required' };
  }

  const project = await this.createProject(name, description, { color, icon });
  return { project, created: true };
}
```

## Compatibilidad con EventBus

El patrón Request/Response coexiste con el EventBus existente:

- **Request/Response**: Para operaciones UI que necesitan respuesta (CRUD, queries)
- **EventBus**: Para eventos internos del sistema y notificaciones push

```
┌─────────────────────────────────────────────────────────────┐
│                        Event Core                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│   │  EventBus   │     │ UIRequest   │     │    MQTT     │  │
│   │  (interno)  │     │  Handler    │     │   Client    │  │
│   └─────────────┘     └─────────────┘     └─────────────┘  │
│         │                   │                   │          │
│         │ emit()            │                   │          │
│         ▼                   │                   │          │
│   ┌─────────────┐           │                   │          │
│   │  Modules    │◄──────────┘                   │          │
│   │             │                               │          │
│   │ - Projects  │ <── ui/request/project/*      │          │
│   │ - Creds     │ <── ui/request/credential/*   │          │
│   │ - etc       │                               │          │
│   └─────────────┘                               │          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Ventajas de este Patrón

1. **Claridad**: Distinción clara entre request/response y eventos
2. **Debugging**: request_id permite trazar toda la comunicación
3. **Errores**: Manejo explícito con códigos y mensajes
4. **Timeout**: Frontend nunca se queda esperando indefinidamente
5. **Consistencia**: Mismo patrón para todas las operaciones UI
6. **Escalabilidad**: Backend puede balancear carga sin cambios en frontend
7. **Testing**: Fácil de mockear y testear

## Migración

### Antes (Fire-and-Forget)

```typescript
// Frontend
publish('core/*/events/project/state/request', {});
subscribe('core/*/events/project/state', handleState);

// Problemas:
// - No sé si el request llegó
// - No sé si hubo error
// - No hay timeout
```

### Después (Request/Response)

```typescript
// Frontend
const { data, status } = await mqttRequest('project', 'list');
if (status === 200) {
  projectsStore.set(data);
}

// Ventajas:
// - Sé que llegó (o timeout)
// - Status code me dice el resultado
// - Promise con async/await natural
```

## Archivos Relacionados

- `frontend/src/lib/ui-core/mqtt-request.ts` - Cliente Request/Response
- `core/ui/UIRequestHandler.js` - Handler de requests en backend
- `docs/architecture/mqtt-request-response.md` - Esta documentación
