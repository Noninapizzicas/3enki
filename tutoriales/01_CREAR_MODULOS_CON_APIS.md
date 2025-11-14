# 🧩 Prompt Maestro — Crear un Módulo con APIs (Event Core)

**Rol activo:**
**Especialista en Implementación de Módulos Event Core (Monoespecialista)**
Encargado de guiar, crear y validar módulos completos con APIs REST, eventos y hooks, según la arquitectura de Event Core.

---

## 🎯 Objetivo General
Implementar un **módulo funcional en Event Core** con APIs REST, validación, logging estructurado, publicación de eventos y métricas.

Debe incluir:
- `module.json` (manifiesto con endpoints, eventos y configuración)
- `index.js` (clase principal del módulo)
- Ejemplos funcionales (`todo-list`, `user-management`)
- Buenas prácticas de seguridad, validación y trazabilidad
- (Opcional) Sección `ui` para activar interfaz JSON-Driven

---

## 🧱 1. Estructura esperada del módulo

```
modules/mi-modulo/
├── module.json          ← Manifest con APIs y metadata
├── index.js             ← Clase principal del módulo
├── handlers/            ← Handlers separados (opcional)
│   ├── users.js
│   └── products.js
├── models/              ← Modelos de datos (opcional)
│   └── user.js
├── validators/          ← Validadores personalizados (opcional)
│   └── userValidator.js
├── utils/               ← Utilidades (opcional)
│   └── helpers.js
├── config.json          ← Configuración del módulo (opcional)
├── README.md            ← Documentación
└── tests/               ← Tests unitarios (opcional)
    └── index.test.js
```

---

## ⚙️ 2. Fases de implementación

### **Fase 1 — Módulo básico (TODO List)**

**Objetivo:** Crear un módulo CRUD básico en memoria.

1. **Crear directorio** `modules/todo-list/`

2. **Crear `module.json`** con rutas CRUD:
   - `GET /todos` - Listar todos
   - `POST /todos` - Crear todo
   - `GET /todos/:id` - Obtener todo por ID
   - `PUT /todos/:id` - Actualizar todo
   - `DELETE /todos/:id` - Eliminar todo
   - `POST /todos/:id/complete` - Marcar como completado

3. **Crear `index.js`** con clase `TodoListModule`:
   - Estado en memoria usando `Map`
   - Hooks: `onLoad()`, `onUnload()`
   - Publicar eventos: `todo.created`, `todo.updated`, `todo.deleted`, `todo.completed`
   - Registrar métricas: `todo.created.total`, `todo.completed.total`, etc.

4. **Probar** con `curl` todos los endpoints básicos

**Complejidad:** 3 Story Points
**Tiempo estimado:** 1-2 horas

---

### **Fase 2 — Módulo intermedio (User Management)**

**Objetivo:** Implementar autenticación, autorización y manejo de sesiones.

1. **Crear** `modules/user-management/`

2. **Crear `module.json`** con rutas:
   - `POST /register` - Registro de usuarios
   - `POST /login` - Login con token
   - `GET /profile` - Perfil del usuario (requiere auth)
   - `PUT /profile` - Actualizar perfil
   - `GET /users` - Listar usuarios (solo admin)

3. **Implementar `index.js`** con:
   - Registro y login con token (`crypto.randomBytes`)
   - Hook `beforeRequest` para validar autenticación
   - Sistema de roles (`user`, `admin`)
   - Validación de input con schemas JSON Schema
   - Publicación de eventos: `user.registered`, `user.login`, `user.profile.updated`
   - Almacenamiento seguro (hash de contraseñas con bcrypt o similar)

4. **Probar flujo completo**:
   ```bash
   # Registrar usuario
   curl -X POST http://localhost:3000/modules/user-management/register \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "secret123", "email": "admin@example.com"}'

   # Login
   TOKEN=$(curl -X POST http://localhost:3000/modules/user-management/login \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "secret123"}' | jq -r '.token')

   # Ver perfil
   curl http://localhost:3000/modules/user-management/profile \
     -H "Authorization: Bearer $TOKEN"
   ```

**Complejidad:** 8 Story Points
**Tiempo estimado:** 4-6 horas

---

### **Fase 3 — Módulo avanzado (con persistencia)**

**Objetivo:** Integrar base de datos y funcionalidades avanzadas.

1. **Extender `index.js`** para persistencia:
   - Opción 1: SQLite (embebido, sin dependencias externas)
   - Opción 2: PostgreSQL (producción)
   - Opción 3: MongoDB (NoSQL)

2. **Integrar modelos y migraciones**:
   - Crear carpeta `models/` con esquemas de datos
   - Implementar validadores personalizados en `validators/`
   - Agregar migraciones de BD si es necesario

3. **Publicar métricas adicionales**:
   - Latencia de consultas DB
   - Tasa de errores
   - Conexiones activas

4. **(Opcional) Incluir sección `ui`** en `module.json` para interfaz JSON-Driven

**Complejidad:** 13 Story Points
**Tiempo estimado:** 1-2 días

---

## 🧠 3. Buenas prácticas (Best Practices)

✅ **Validación de input** antes de procesar (usar ValidationManager)
✅ **Manejo de errores** con `try/catch` en todos los handlers
✅ **Logging estructurado** (`this.logger.info('operation', {...})`)
✅ **Publicar eventos** con `this.eventBus.publish()` para trazabilidad
✅ **Registrar métricas** con `this.metrics.increment()` o `this.metrics.timing()`
✅ **Nunca retornar datos sensibles** (passwords, tokens completos, etc.)
✅ **Sanitizar input** para prevenir XSS, SQL injection
✅ **Documentar APIs** en `README.md` con ejemplos de `curl`
✅ **Usar async/await** para operaciones asíncronas
✅ **Implementar rate limiting** si es necesario

---

## 🧩 4. Opcional — Interfaz gráfica (UI JSON-Driven)

Si el módulo debe tener UI automática:

1. **Agregar en `module.json`** una sección `ui` con vistas (`table`, `form`, `detail`, etc.)
2. **Seguir la guía** `docs/UI_DEVELOPER_GUIDE.md`
3. **Acceder a la UI** en `http://localhost:3000/ui`

**Ejemplo:**
```json
{
  "ui": {
    "views": {
      "list": {
        "type": "table",
        "title": "Lista de TODOs",
        "endpoint": "/modules/todo-list/todos",
        "columns": ["id", "title", "completed", "createdAt"]
      },
      "create": {
        "type": "form",
        "title": "Crear TODO",
        "endpoint": "/modules/todo-list/todos",
        "method": "POST",
        "fields": [
          { "name": "title", "type": "text", "required": true },
          { "name": "description", "type": "textarea" }
        ]
      }
    }
  }
}
```

---

## 📋 5. Checklist de entrega

**Backend:**
- [ ] Crear estructura del módulo
- [ ] Definir `module.json` con APIs completas
- [ ] Implementar clase principal en `index.js`
- [ ] Validar input con schemas (ValidationManager)
- [ ] Manejar errores con try/catch
- [ ] Publicar eventos en operaciones clave
- [ ] Registrar métricas (creaciones, actualizaciones, errores)
- [ ] No retornar datos sensibles
- [ ] Probar todas las APIs con `curl`
- [ ] Documentar en `README.md` con ejemplos

**UI (opcional):**
- [ ] Definir sección `ui` en `module.json`
- [ ] Probar la UI en `/ui`
- [ ] Validar vistas autogeneradas (table, form, detail)

**Seguridad:**
- [ ] Sanitizar todo input del usuario
- [ ] Implementar autenticación si es necesario
- [ ] Validar permisos en endpoints protegidos
- [ ] No loggear información sensible

---

## 🧾 6. Ejemplo completo: `module.json` (TODO List)

```json
{
  "name": "todo-list",
  "version": "1.0.0",
  "description": "Simple TODO list manager with CRUD operations",
  "main": "index.js",
  "apis": [
    {
      "method": "GET",
      "path": "/todos",
      "handler": "handleListTodos",
      "description": "List all todos"
    },
    {
      "method": "POST",
      "path": "/todos",
      "handler": "handleCreateTodo",
      "description": "Create a new todo",
      "schemas": {
        "request": {
          "body": {
            "type": "object",
            "required": ["title"],
            "properties": {
              "title": { "type": "string", "minLength": 1, "maxLength": 200 },
              "description": { "type": "string", "maxLength": 1000 }
            }
          }
        }
      }
    },
    {
      "method": "GET",
      "path": "/todos/:id",
      "handler": "handleGetTodo",
      "description": "Get a todo by ID"
    },
    {
      "method": "PUT",
      "path": "/todos/:id",
      "handler": "handleUpdateTodo",
      "description": "Update a todo"
    },
    {
      "method": "DELETE",
      "path": "/todos/:id",
      "handler": "handleDeleteTodo",
      "description": "Delete a todo"
    },
    {
      "method": "POST",
      "path": "/todos/:id/complete",
      "handler": "handleCompleteTodo",
      "description": "Mark a todo as completed"
    }
  ],
  "events": {
    "publishes": [
      "todo.created",
      "todo.updated",
      "todo.deleted",
      "todo.completed"
    ],
    "subscribes": []
  },
  "config": {
    "maxTodos": 1000
  }
}
```

---

## 🧾 7. Ejemplo completo: `index.js` (TODO List)

```javascript
/**
 * TODO List Module
 * Simple CRUD module for managing todo items
 */
class TodoListModule {
  constructor() {
    this.name = 'todo-list';
    this.todos = new Map();
    this.nextId = 1;
  }

  /**
   * Hook: Called when module is loaded
   */
  async onLoad(moduleAPI) {
    this.logger = moduleAPI.logger;
    this.eventBus = moduleAPI.eventBus;
    this.metrics = moduleAPI.metrics;
    this.config = moduleAPI.config || {};

    this.logger.info('todo.module.loaded', {
      module: this.name,
      version: '1.0.0'
    });
  }

  /**
   * Hook: Called when module is unloaded
   */
  async onUnload() {
    this.logger.info('todo.module.unloaded', {
      module: this.name,
      todosCount: this.todos.size
    });
    this.todos.clear();
  }

  /**
   * GET /todos - List all todos
   */
  async handleListTodos(req, context) {
    try {
      const todos = Array.from(this.todos.values());

      this.logger.info('todo.list', {
        count: todos.length
      });

      return {
        status: 200,
        data: {
          todos,
          total: todos.length
        }
      };
    } catch (error) {
      this.logger.error('todo.list.error', { error: error.message });
      throw error;
    }
  }

  /**
   * POST /todos - Create a new todo
   */
  async handleCreateTodo(req, context) {
    try {
      const { title, description = '' } = context.body;

      // Check limit
      if (this.todos.size >= (this.config.maxTodos || 1000)) {
        return {
          status: 400,
          data: { error: 'Maximum todos limit reached' }
        };
      }

      const todo = {
        id: this.nextId++,
        title,
        description,
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.todos.set(todo.id, todo);

      // Publish event
      await this.eventBus.publish('todo.created', {
        todoId: todo.id,
        title: todo.title
      });

      // Register metric
      this.metrics.increment('todo.created.total');

      this.logger.info('todo.created', {
        todoId: todo.id,
        title: todo.title
      });

      return {
        status: 201,
        data: todo
      };
    } catch (error) {
      this.logger.error('todo.create.error', { error: error.message });
      throw error;
    }
  }

  /**
   * GET /todos/:id - Get a todo by ID
   */
  async handleGetTodo(req, context) {
    try {
      const id = parseInt(context.params.id);
      const todo = this.todos.get(id);

      if (!todo) {
        return {
          status: 404,
          data: { error: 'Todo not found' }
        };
      }

      return {
        status: 200,
        data: todo
      };
    } catch (error) {
      this.logger.error('todo.get.error', { error: error.message });
      throw error;
    }
  }

  /**
   * PUT /todos/:id - Update a todo
   */
  async handleUpdateTodo(req, context) {
    try {
      const id = parseInt(context.params.id);
      const todo = this.todos.get(id);

      if (!todo) {
        return {
          status: 404,
          data: { error: 'Todo not found' }
        };
      }

      const { title, description, completed } = context.body;

      if (title !== undefined) todo.title = title;
      if (description !== undefined) todo.description = description;
      if (completed !== undefined) todo.completed = completed;
      todo.updatedAt = new Date().toISOString();

      this.todos.set(id, todo);

      // Publish event
      await this.eventBus.publish('todo.updated', {
        todoId: todo.id,
        title: todo.title
      });

      this.metrics.increment('todo.updated.total');

      this.logger.info('todo.updated', { todoId: todo.id });

      return {
        status: 200,
        data: todo
      };
    } catch (error) {
      this.logger.error('todo.update.error', { error: error.message });
      throw error;
    }
  }

  /**
   * DELETE /todos/:id - Delete a todo
   */
  async handleDeleteTodo(req, context) {
    try {
      const id = parseInt(context.params.id);
      const todo = this.todos.get(id);

      if (!todo) {
        return {
          status: 404,
          data: { error: 'Todo not found' }
        };
      }

      this.todos.delete(id);

      // Publish event
      await this.eventBus.publish('todo.deleted', {
        todoId: id
      });

      this.metrics.increment('todo.deleted.total');

      this.logger.info('todo.deleted', { todoId: id });

      return {
        status: 200,
        data: { message: 'Todo deleted successfully' }
      };
    } catch (error) {
      this.logger.error('todo.delete.error', { error: error.message });
      throw error;
    }
  }

  /**
   * POST /todos/:id/complete - Mark todo as completed
   */
  async handleCompleteTodo(req, context) {
    try {
      const id = parseInt(context.params.id);
      const todo = this.todos.get(id);

      if (!todo) {
        return {
          status: 404,
          data: { error: 'Todo not found' }
        };
      }

      todo.completed = true;
      todo.completedAt = new Date().toISOString();
      todo.updatedAt = new Date().toISOString();

      this.todos.set(id, todo);

      // Publish event
      await this.eventBus.publish('todo.completed', {
        todoId: todo.id
      });

      this.metrics.increment('todo.completed.total');

      this.logger.info('todo.completed', { todoId: todo.id });

      return {
        status: 200,
        data: todo
      };
    } catch (error) {
      this.logger.error('todo.complete.error', { error: error.message });
      throw error;
    }
  }
}

module.exports = TodoListModule;
```

---

## ⚡ 8. Ejemplo de pruebas con `curl`

```bash
# 1. Listar todos (inicialmente vacío)
curl http://localhost:3000/modules/todo-list/todos

# 2. Crear un TODO
curl -X POST http://localhost:3000/modules/todo-list/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Comprar leche", "description": "Ir al supermercado"}'

# 3. Crear otro TODO
curl -X POST http://localhost:3000/modules/todo-list/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Estudiar Event Core", "description": "Leer la documentación"}'

# 4. Listar todos
curl http://localhost:3000/modules/todo-list/todos

# 5. Obtener TODO específico
curl http://localhost:3000/modules/todo-list/todos/1

# 6. Actualizar TODO
curl -X PUT http://localhost:3000/modules/todo-list/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"title": "Comprar leche y pan"}'

# 7. Marcar como completado
curl -X POST http://localhost:3000/modules/todo-list/todos/1/complete

# 8. Eliminar TODO
curl -X DELETE http://localhost:3000/modules/todo-list/todos/2

# 9. Verificar estado final
curl http://localhost:3000/modules/todo-list/todos
```

---

## 🧭 9. Formato de salida esperado

Al completar este tutorial, debes entregar:

1. **Resumen ejecutivo**
   - Qué módulo se creó
   - Funcionalidades implementadas
   - Endpoints disponibles

2. **Lista de archivos creados**
   - Ruta completa + propósito de cada archivo

3. **Instrucciones de prueba**
   - Comandos `curl` para probar cada endpoint
   - Flujo de uso esperado

4. **Contenido completo**
   - `module.json` (manifiesto)
   - `index.js` (implementación)
   - `README.md` (documentación)

5. **Eventos y métricas**
   - Lista de eventos publicados
   - Lista de métricas registradas

6. **Checklist de verificación completado**
   - Marcar cada ítem del checklist

7. **Próximos pasos sugeridos**
   - Mejoras futuras
   - Funcionalidades adicionales

---

## 🧩 10. Reglas operativas

- **No omitir ninguna sección** del checklist
- **Si falta información**, proponer un valor razonable y documentarlo
- **Mantener consistencia** con la arquitectura de Event Core
- **No modificar** la estructura base del sistema
- **Optimizar para**:
  - ✅ Claridad (código legible)
  - ✅ Trazabilidad (logs + eventos)
  - ✅ Mantenibilidad (modular y documentado)
  - ✅ Seguridad (validación + sanitización)

---

## 📚 Referencias

- `docs/GUIA_CREAR_MODULO.md` - Guía oficial de creación de módulos
- `docs/API_SYSTEM.md` - Sistema de APIs REST
- `docs/GUIA_EVENT_BUS.md` - Sistema de eventos
- `docs/UI_DEVELOPER_GUIDE.md` - Interfaz JSON-Driven
- `modules/echo/` - Ejemplo de módulo simple
- `modules/file-watcher/` - Ejemplo de módulo con eventos

---

## 🔄 Capa de Consolidación (al finalizar)

Al completar el módulo, incluir:

1. **Estado del módulo**
   - ✅ Completo
   - ⚠️ Parcial (indicar qué falta)
   - ❌ Bloqueado (indicar bloqueante)

2. **Pendientes o mejoras**
   - Tests unitarios
   - Persistencia en BD
   - UI JSON-Driven
   - Rate limiting
   - Caché de respuestas

3. **Próximos pasos**
   - Integración con otros módulos
   - Despliegue en producción
   - Monitoreo y alertas

---

**Versión:** 1.0.0
**Última actualización:** 2025-01-14
**Autor:** Event Core Team
