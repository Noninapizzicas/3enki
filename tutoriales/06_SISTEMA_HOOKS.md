# 🪝 Prompt Maestro — Sistema de Hooks (Event Core)

**Rol activo:**
**Especialista en Interceptores y Middleware (Monoespecialista)**
Encargado de implementar hooks (interceptores) para agregar funcionalidad transversal en módulos Event Core: autenticación, autorización, rate limiting, transformaciones, etc.

---

## 🎯 Objetivo General
Implementar **hooks (interceptores)** en módulos Event Core para ejecutar lógica antes/después de requests HTTP, eventos MQTT, y operaciones del módulo, permitiendo funcionalidad cross-cutting sin modificar handlers.

Debe incluir:
- Hooks de módulo (onLoad, onUnload, onEvent)
- Hooks de request (beforeRequest, afterRequest)
- Hooks de validación (beforeValidation, afterValidation)
- Hooks de eventos (beforePublish, afterPublish)
- Chain of Responsibility pattern
- Middleware composable

---

## 🧱 1. Arquitectura del Sistema de Hooks

```
Request → beforeRequest → Validation → Handler → afterRequest → Response
             ↓                            ↓            ↓
        [Auth Hook]                [Business]   [Transform Hook]
        [Rate Limit]               [Logic]      [Compression]
        [Logging]                               [Caching]
```

**Tipos de Hooks:**
1. **Module Lifecycle** - onLoad, onUnload
2. **Request Lifecycle** - beforeRequest, afterRequest, onError
3. **Validation Lifecycle** - beforeValidation, afterValidation
4. **Event Lifecycle** - beforePublish, afterPublish, onEvent
5. **Custom Hooks** - Definidos por el módulo

---

## ⚙️ 2. Fases de implementación

### **Fase 1 — Hooks de ciclo de vida del módulo**

**Objetivo:** Ejecutar lógica al cargar/descargar el módulo.

1. **onLoad** - Se ejecuta al cargar el módulo:
```javascript
class TodoListModule {
  /**
   * Hook: Se ejecuta al cargar el módulo
   */
  async onLoad(moduleAPI) {
    this.logger = moduleAPI.logger;
    this.eventBus = moduleAPI.eventBus;
    this.metrics = moduleAPI.metrics;
    this.config = moduleAPI.config;

    // Inicializar recursos
    this.todos = new Map();
    this.nextId = 1;

    // Suscribirse a eventos
    await this.eventBus.subscribe('system.shutdown', this.handleShutdown.bind(this));

    // Cargar datos persistidos (si aplica)
    await this.loadPersistedData();

    this.logger.info('module.loaded', {
      module: 'todo-list',
      version: '1.0.0'
    });
  }

  /**
   * Hook: Se ejecuta al descargar el módulo
   */
  async onUnload() {
    // Guardar estado
    await this.savePersistedData();

    // Cerrar conexiones
    await this.closeConnections();

    // Limpiar recursos
    this.todos.clear();

    this.logger.info('module.unloaded', {
      module: 'todo-list'
    });
  }
}
```

**Complejidad:** 2 Story Points
**Tiempo estimado:** 30 minutos

---

### **Fase 2 — Hooks de request (beforeRequest)**

**Objetivo:** Interceptar requests antes de llegar al handler.

1. **beforeRequest** - Autenticación, autorización, validación:
```javascript
class UserManagementModule {
  /**
   * Hook: Se ejecuta ANTES de cada request
   * Usado para autenticación y autorización
   */
  async beforeRequest(req, context) {
    const endpoint = context.endpoint;

    // Endpoints públicos (no requieren autenticación)
    const publicEndpoints = ['/register', '/login', '/health'];
    if (publicEndpoints.includes(endpoint.path)) {
      return; // Continuar sin autenticación
    }

    // Verificar token de autorización
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      throw new Error('Authorization header missing');
    }

    const token = authHeader.replace('Bearer ', '');

    // Validar token
    const user = await this.validateToken(token);
    if (!user) {
      throw new Error('Invalid or expired token');
    }

    // Agregar usuario al contexto
    context.user = user;

    // Verificar permisos
    if (endpoint.requiresAdmin && user.role !== 'admin') {
      throw new Error('Insufficient permissions');
    }

    this.logger.info('request.authenticated', {
      userId: user.id,
      correlationId: context.correlationId
    });
  }

  async validateToken(token) {
    const user = this.sessions.get(token);
    if (!user) return null;

    // Verificar expiración
    if (user.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return user;
  }
}
```

2. **Ejemplo con rate limiting**:
```javascript
async beforeRequest(req, context) {
  const userId = context.user?.id || req.ip;

  // Verificar rate limit
  const isAllowed = await this.rateLimiter.checkLimit(userId, {
    max: 100,        // 100 requests
    window: 60000    // por minuto
  });

  if (!isAllowed) {
    this.logger.warn('rate.limit.exceeded', {
      userId: userId,
      correlationId: context.correlationId
    });

    throw new Error('Rate limit exceeded');
  }
}
```

**Complejidad:** 5 Story Points
**Tiempo estimado:** 2-3 horas

---

### **Fase 3 — Hooks de request (afterRequest)**

**Objetivo:** Interceptar respuestas antes de enviarlas al cliente.

1. **afterRequest** - Transformar, enriquecer, loggear respuesta:
```javascript
class TodoListModule {
  /**
   * Hook: Se ejecuta DESPUÉS de cada request
   * Usado para transformar respuestas, agregar metadata, etc.
   */
  async afterRequest(req, context, response) {
    // Agregar metadata a la respuesta
    if (response.data && typeof response.data === 'object') {
      response.data._metadata = {
        timestamp: new Date().toISOString(),
        correlationId: context.correlationId,
        version: '1.0.0'
      };
    }

    // Loggear respuesta exitosa
    if (response.status >= 200 && response.status < 300) {
      this.logger.info('request.success', {
        method: req.method,
        path: context.endpoint.path,
        status: response.status,
        duration: Date.now() - context.startTime,
        correlationId: context.correlationId
      });

      this.metrics.timing('request.duration', Date.now() - context.startTime, {
        method: req.method,
        endpoint: context.endpoint.path
      });
    }

    // Sanitizar datos sensibles
    if (response.data?.password) {
      delete response.data.password;
    }
    if (response.data?.token) {
      response.data.token = response.data.token.substring(0, 10) + '...';
    }

    return response;
  }
}
```

2. **Ejemplo con transformación de datos**:
```javascript
async afterRequest(req, context, response) {
  // Transformar fechas a formato local
  if (response.data) {
    this.transformDates(response.data, context.user?.timezone || 'UTC');
  }

  // Agregar links HATEOAS
  if (response.data?.id) {
    response.data._links = {
      self: `/modules/${this.name}/todos/${response.data.id}`,
      update: `/modules/${this.name}/todos/${response.data.id}`,
      delete: `/modules/${this.name}/todos/${response.data.id}`
    };
  }

  return response;
}
```

**Complejidad:** 3 Story Points
**Tiempo estimado:** 1-2 horas

---

### **Fase 4 — Hooks de errores (onError)**

**Objetivo:** Manejar errores de forma centralizada.

```javascript
class TodoListModule {
  /**
   * Hook: Se ejecuta cuando hay un error
   * Usado para logging, transformación de errores, etc.
   */
  async onError(error, req, context) {
    // Loggear error
    this.logger.error('request.error', {
      error: error.message,
      stack: error.stack,
      method: req.method,
      path: context.endpoint?.path,
      correlationId: context.correlationId,
      userId: context.user?.id
    });

    // Incrementar métrica de errores
    this.metrics.increment('request.errors', 1, {
      errorType: error.name,
      endpoint: context.endpoint?.path
    });

    // Transformar error para cliente
    let status = 500;
    let message = 'Internal server error';

    if (error.message.includes('not found')) {
      status = 404;
      message = error.message;
    } else if (error.message.includes('Authorization')) {
      status = 401;
      message = 'Unauthorized';
    } else if (error.message.includes('permissions')) {
      status = 403;
      message = 'Forbidden';
    } else if (error.message.includes('validation')) {
      status = 400;
      message = error.message;
    }

    // Publicar evento de error (para alertas)
    if (status === 500) {
      await this.eventBus.publish('system.error', {
        module: this.name,
        error: error.message,
        correlationId: context.correlationId
      });
    }

    return {
      status: status,
      data: {
        error: message,
        correlationId: context.correlationId
      }
    };
  }
}
```

**Complejidad:** 3 Story Points
**Tiempo estimado:** 1-2 horas

---

### **Fase 5 — Hooks de eventos (beforePublish, afterPublish)**

**Objetivo:** Interceptar eventos antes/después de publicarlos.

```javascript
class TodoListModule {
  /**
   * Hook: Se ejecuta ANTES de publicar un evento
   */
  async beforePublish(eventType, payload, options) {
    // Validar payload del evento
    if (!payload || typeof payload !== 'object') {
      throw new Error('Event payload must be an object');
    }

    // Enriquecer payload
    payload.source = this.name;
    payload.version = '1.0.0';
    payload.timestamp = payload.timestamp || new Date().toISOString();

    // Loggear
    this.logger.debug('event.publishing', {
      eventType: eventType,
      correlationId: options?.correlationId
    });

    return { eventType, payload, options };
  }

  /**
   * Hook: Se ejecuta DESPUÉS de publicar un evento
   */
  async afterPublish(eventType, payload, options) {
    // Métrica
    this.metrics.increment('events.published', 1, {
      eventType: eventType
    });

    // Log
    this.logger.info('event.published', {
      eventType: eventType,
      correlationId: options?.correlationId
    });
  }

  /**
   * Hook: Se ejecuta al recibir un evento
   */
  async onEvent(event) {
    // Loggear evento recibido
    this.logger.info('event.received', {
      eventType: event.eventType,
      correlationId: event.correlationId
    });

    // Métrica
    this.metrics.increment('events.received', 1, {
      eventType: event.eventType
    });

    // Validar evento
    if (!event.payload) {
      this.logger.warn('event.invalid.no_payload', {
        eventType: event.eventType
      });
      return;
    }
  }
}
```

**Complejidad:** 5 Story Points
**Tiempo estimado:** 2-3 horas

---

### **Fase 6 — Hooks personalizados (custom)**

**Objetivo:** Crear hooks específicos del dominio del módulo.

```javascript
class TodoListModule {
  /**
   * Hook custom: Se ejecuta antes de marcar un TODO como completado
   */
  async beforeComplete(todoId, context) {
    const todo = this.todos.get(todoId);

    if (!todo) {
      throw new Error('TODO not found');
    }

    if (todo.completed) {
      throw new Error('TODO already completed');
    }

    // Verificar dependencias
    if (todo.dependencies && todo.dependencies.length > 0) {
      const incompleteDeps = todo.dependencies.filter(depId => {
        const dep = this.todos.get(depId);
        return dep && !dep.completed;
      });

      if (incompleteDeps.length > 0) {
        throw new Error(`Cannot complete TODO: ${incompleteDeps.length} dependencies not completed`);
      }
    }

    // Log
    this.logger.info('todo.before_complete', {
      todoId: todoId,
      userId: context.user?.id
    });
  }

  /**
   * Hook custom: Se ejecuta después de completar un TODO
   */
  async afterComplete(todo, context) {
    // Publicar evento
    await this.eventBus.publish('todo.completed', {
      todoId: todo.id,
      completedBy: context.user?.id,
      completedAt: todo.completedAt
    }, {
      correlationId: context.correlationId
    });

    // Verificar si se desbloquearon otros TODOs
    const unblocked = this.checkUnblockedTodos(todo.id);
    if (unblocked.length > 0) {
      await this.eventBus.publish('todos.unblocked', {
        unblockedIds: unblocked,
        trigger: todo.id
      });
    }

    // Log
    this.logger.info('todo.after_complete', {
      todoId: todo.id,
      unblockedCount: unblocked.length
    });
  }

  async handleCompleteTodo(req, context) {
    const todoId = parseInt(context.params.id);

    // Hook: beforeComplete
    await this.beforeComplete(todoId, context);

    // Completar TODO
    const todo = this.todos.get(todoId);
    todo.completed = true;
    todo.completedAt = new Date().toISOString();
    this.todos.set(todoId, todo);

    // Hook: afterComplete
    await this.afterComplete(todo, context);

    return { status: 200, data: todo };
  }
}
```

**Complejidad:** 8 Story Points
**Tiempo estimado:** 4-5 horas

---

## 🧠 3. Buenas prácticas (Best Practices)

✅ **Hooks simples** - Una responsabilidad por hook
✅ **No modificar req** directamente, usar context
✅ **Async/await** - Todos los hooks deben ser async
✅ **Error handling** - Try/catch en hooks críticos
✅ **Performance** - Hooks deben ser rápidos (< 10ms ideal)
✅ **Logging** - Loggear entrada/salida de hooks
✅ **Orden de ejecución** - Documentar orden de hooks
✅ **Composabilidad** - Hooks reutilizables entre módulos
✅ **No side effects** - Evitar modificaciones globales
✅ **Testear hooks** - Unit tests para cada hook

---

## 📋 4. Checklist de entrega

**Lifecycle Hooks:**
- [ ] onLoad implementado
- [ ] onUnload implementado
- [ ] Recursos inicializados correctamente
- [ ] Cleanup en onUnload

**Request Hooks:**
- [ ] beforeRequest implementado
- [ ] afterRequest implementado
- [ ] onError implementado
- [ ] Autenticación/autorización funcionando
- [ ] Transformaciones aplicadas

**Event Hooks:**
- [ ] beforePublish implementado
- [ ] afterPublish implementado
- [ ] onEvent implementado
- [ ] Validación de eventos

**Custom Hooks:**
- [ ] Hooks de dominio documentados
- [ ] Orden de ejecución claro
- [ ] Tests unitarios

---

## 🧾 5. Orden de ejecución de hooks

```
Request HTTP
    ↓
beforeRequest (autenticación, rate limit)
    ↓
beforeValidation (pre-procesamiento)
    ↓
Validation (JSON Schema)
    ↓
afterValidation (post-procesamiento)
    ↓
beforeHandler (hooks custom)
    ↓
Handler (lógica de negocio)
    ↓
afterHandler (hooks custom)
    ↓
afterRequest (transformación, metadata)
    ↓
Response HTTP

En caso de error:
    ↓
onError (logging, transformación de error)
    ↓
Error Response
```

---

## ⚡ 6. Ejemplo completo: Módulo con hooks

```javascript
/**
 * User Management Module con Hooks Completos
 */
class UserManagementModule {
  constructor() {
    this.name = 'user-management';
    this.users = new Map();
    this.sessions = new Map();
  }

  // ==========================================
  // LIFECYCLE HOOKS
  // ==========================================

  async onLoad(moduleAPI) {
    this.logger = moduleAPI.logger;
    this.eventBus = moduleAPI.eventBus;
    this.metrics = moduleAPI.metrics;

    this.logger.info('module.loaded', { module: this.name });
  }

  async onUnload() {
    this.users.clear();
    this.sessions.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // REQUEST HOOKS
  // ==========================================

  async beforeRequest(req, context) {
    const publicEndpoints = ['/register', '/login', '/health'];
    if (publicEndpoints.includes(context.endpoint.path)) {
      return;
    }

    // Autenticación
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      throw new Error('Authorization header missing');
    }

    const token = authHeader.replace('Bearer ', '');
    const user = await this.validateToken(token);

    if (!user) {
      throw new Error('Invalid or expired token');
    }

    context.user = user;

    this.logger.info('request.authenticated', {
      userId: user.id,
      correlationId: context.correlationId
    });
  }

  async afterRequest(req, context, response) {
    // Sanitizar password
    if (response.data?.password) {
      delete response.data.password;
    }

    // Agregar metadata
    if (response.data && typeof response.data === 'object') {
      response.data._metadata = {
        timestamp: new Date().toISOString(),
        correlationId: context.correlationId
      };
    }

    return response;
  }

  async onError(error, req, context) {
    this.logger.error('request.error', {
      error: error.message,
      correlationId: context.correlationId
    });

    let status = 500;
    let message = 'Internal server error';

    if (error.message.includes('Authorization')) {
      status = 401;
      message = 'Unauthorized';
    }

    return {
      status: status,
      data: { error: message, correlationId: context.correlationId }
    };
  }

  // ==========================================
  // HANDLERS
  // ==========================================

  async handleLogin(req, context) {
    const { username, password } = context.body;

    const user = Array.from(this.users.values())
      .find(u => u.username === username);

    if (!user || user.password !== password) {
      throw new Error('Invalid credentials');
    }

    const token = this.generateToken();
    this.sessions.set(token, {
      ...user,
      expiresAt: Date.now() + 3600000 // 1 hora
    });

    await this.eventBus.publish('user.login', {
      userId: user.id,
      username: user.username
    }, {
      correlationId: context.correlationId
    });

    return {
      status: 200,
      data: {
        token: token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      }
    };
  }

  // ==========================================
  // HELPERS
  // ==========================================

  async validateToken(token) {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  generateToken() {
    return 'token_' + Math.random().toString(36).substring(2);
  }
}

module.exports = UserManagementModule;
```

---

## 🧭 7. Formato de salida esperado

1. **Resumen de hooks implementados**
   - Lifecycle hooks
   - Request hooks
   - Event hooks
   - Custom hooks

2. **Orden de ejecución**
   - Diagrama de flujo
   - Secuencia de hooks

3. **Casos de uso**
   - Autenticación
   - Rate limiting
   - Transformación de datos
   - Logging

---

## 📚 Referencias

- `docs/GUIA_HOOKS.md` - Guía oficial de hooks
- `core/hooks/manager.js` - Hook Manager
- [Express Middleware](https://expressjs.com/en/guide/writing-middleware.html) - Patrón similar
- [AOP (Aspect-Oriented Programming)](https://en.wikipedia.org/wiki/Aspect-oriented_programming) - Concepto

---

**Versión:** 1.0.0
**Última actualización:** 2025-01-14
**Autor:** Event Core Team
