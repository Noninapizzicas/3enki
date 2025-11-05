# Guía Completa: Crear un Módulo con APIs

**Nivel:** Principiante → Avanzado
**Tiempo:** 15-30 minutos
**Fecha:** 2025-10-20

Esta guía te enseñará a crear un módulo completo desde cero con APIs REST.

> **📱 Interfaces Gráficas:** Los módulos pueden tener UI automática definiendo JSON en `module.json`.
> Ver **`UI_DEVELOPER_GUIDE.md`** para agregar interfaces a tus módulos.

---

## 📋 Tabla de Contenidos

1. [Ejemplo 1: Módulo TODO List (Básico)](#ejemplo-1-módulo-todo-list-básico)
2. [Ejemplo 2: Módulo User Management (Intermedio)](#ejemplo-2-módulo-user-management-intermedio)
3. [Ejemplo 3: Módulo con Base de Datos (Avanzado)](#ejemplo-3-módulo-con-base-de-datos-avanzado)
4. [Estructura Completa de un Módulo](#estructura-completa-de-un-módulo)
5. [Best Practices](#best-practices)

---

## Ejemplo 1: Módulo TODO List (Básico)

Vamos a crear un módulo simple de TODO list con operaciones CRUD completas.

### Paso 1: Crear Estructura de Directorios

```bash
cd /data/data/com.termux/files/home/event-core
mkdir -p modules/todo-list
cd modules/todo-list
```

### Paso 2: Crear `module.json` (Manifest)

```bash
cat > module.json << 'EOF'
{
  "name": "todo-list",
  "version": "1.0.0",
  "description": "Simple TODO list manager",
  "author": "Event Core Team",
  "main": "index.js",
  "apis": [
    {
      "method": "GET",
      "path": "/todos",
      "handler": "handleListTodos",
      "description": "List all TODOs"
    },
    {
      "method": "POST",
      "path": "/todos",
      "handler": "handleCreateTodo",
      "description": "Create a new TODO"
    },
    {
      "method": "GET",
      "path": "/todos/:id",
      "handler": "handleGetTodo",
      "description": "Get a specific TODO by ID"
    },
    {
      "method": "PUT",
      "path": "/todos/:id",
      "handler": "handleUpdateTodo",
      "description": "Update a TODO"
    },
    {
      "method": "DELETE",
      "path": "/todos/:id",
      "handler": "handleDeleteTodo",
      "description": "Delete a TODO"
    },
    {
      "method": "POST",
      "path": "/todos/:id/complete",
      "handler": "handleCompleteTodo",
      "description": "Mark a TODO as complete"
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
  }
}
EOF
```

### Paso 3: Crear `index.js` (Implementación)

```bash
cat > index.js << 'EOF'
/**
 * TODO List Module
 *
 * Módulo simple de gestión de tareas (TODOs)
 *
 * Features:
 * - CRUD completo de TODOs
 * - Marcar como completado
 * - Persistencia en memoria (podría ser DB)
 * - Publicación de eventos para cada acción
 */

class TodoListModule {
  constructor(core) {
    this.core = core;
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;
    this.hooks = core.hooks;

    // Estado: almacenamiento en memoria
    this.todos = new Map();
    this.nextId = 1;
  }

  /**
   * Lifecycle: Se ejecuta cuando el módulo se carga
   */
  async onLoad() {
    this.logger.info('todo-list.module.loaded', {
      module: 'todo-list',
      version: '1.0.0'
    });

    // Crear algunos TODOs de ejemplo
    this.createTodo({
      title: 'Aprender Event Core',
      description: 'Leer la documentación completa',
      completed: false
    });

    this.createTodo({
      title: 'Crear mi primer módulo',
      description: 'Seguir la guía paso a paso',
      completed: false
    });
  }

  /**
   * Lifecycle: Se ejecuta cuando el módulo se descarga
   */
  async onUnload() {
    this.logger.info('todo-list.module.unloaded', {
      totalTodos: this.todos.size
    });
  }

  /**
   * Helper: Crear TODO (interno)
   */
  createTodo(data) {
    const id = this.nextId++;
    const todo = {
      id,
      title: data.title,
      description: data.description || '',
      completed: data.completed || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.todos.set(id, todo);
    return todo;
  }

  /**
   * API: GET /modules/todo-list/todos
   * Lista todos los TODOs
   */
  async handleListTodos(request) {
    // Obtener query params
    const { completed, search } = request.query;

    // Filtrar TODOs
    let todos = Array.from(this.todos.values());

    if (completed !== undefined) {
      const isCompleted = completed === 'true';
      todos = todos.filter(t => t.completed === isCompleted);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      todos = todos.filter(t =>
        t.title.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower)
      );
    }

    this.logger.info('todo-list.list', {
      total: todos.length,
      completed: completed,
      search: search
    });

    return {
      statusCode: 200,
      body: {
        todos: todos,
        total: todos.length,
        filters: { completed, search }
      }
    };
  }

  /**
   * API: POST /modules/todo-list/todos
   * Crea un nuevo TODO
   */
  async handleCreateTodo(request) {
    const { title, description } = request.body;

    // Validación
    if (!title || title.trim().length === 0) {
      return {
        statusCode: 400,
        body: {
          error: 'Validation failed',
          message: 'Title is required'
        }
      };
    }

    // Crear TODO
    const todo = this.createTodo({
      title: title.trim(),
      description: description?.trim() || '',
      completed: false
    });

    // Log
    this.logger.info('todo-list.created', {
      todoId: todo.id,
      title: todo.title
    });

    // Publicar evento
    await this.eventBus.publish('todo.created', {
      todoId: todo.id,
      title: todo.title,
      createdAt: todo.createdAt
    });

    // Métrica
    this.metrics.increment('todo.created.total');

    return {
      statusCode: 201,
      body: {
        todo: todo,
        message: 'TODO created successfully'
      }
    };
  }

  /**
   * API: GET /modules/todo-list/todos/:id
   * Obtiene un TODO específico
   */
  async handleGetTodo(request) {
    // Extraer ID del path: /todos/123 → id = 123
    const pathParts = request.path.split('/');
    const id = parseInt(pathParts[pathParts.length - 1]);

    if (isNaN(id)) {
      return {
        statusCode: 400,
        body: {
          error: 'Invalid ID',
          message: 'ID must be a number'
        }
      };
    }

    const todo = this.todos.get(id);

    if (!todo) {
      return {
        statusCode: 404,
        body: {
          error: 'Not found',
          message: `TODO with ID ${id} not found`
        }
      };
    }

    return {
      statusCode: 200,
      body: {
        todo: todo
      }
    };
  }

  /**
   * API: PUT /modules/todo-list/todos/:id
   * Actualiza un TODO
   */
  async handleUpdateTodo(request) {
    // Extraer ID
    const pathParts = request.path.split('/');
    const id = parseInt(pathParts[pathParts.length - 1]);

    const todo = this.todos.get(id);

    if (!todo) {
      return {
        statusCode: 404,
        body: {
          error: 'Not found',
          message: `TODO with ID ${id} not found`
        }
      };
    }

    // Actualizar campos
    const { title, description, completed } = request.body;

    if (title !== undefined) {
      if (title.trim().length === 0) {
        return {
          statusCode: 400,
          body: {
            error: 'Validation failed',
            message: 'Title cannot be empty'
          }
        };
      }
      todo.title = title.trim();
    }

    if (description !== undefined) {
      todo.description = description.trim();
    }

    if (completed !== undefined) {
      todo.completed = completed;
    }

    todo.updatedAt = new Date().toISOString();

    // Log
    this.logger.info('todo-list.updated', {
      todoId: todo.id,
      title: todo.title
    });

    // Publicar evento
    await this.eventBus.publish('todo.updated', {
      todoId: todo.id,
      title: todo.title,
      updatedAt: todo.updatedAt
    });

    // Métrica
    this.metrics.increment('todo.updated.total');

    return {
      statusCode: 200,
      body: {
        todo: todo,
        message: 'TODO updated successfully'
      }
    };
  }

  /**
   * API: DELETE /modules/todo-list/todos/:id
   * Elimina un TODO
   */
  async handleDeleteTodo(request) {
    // Extraer ID
    const pathParts = request.path.split('/');
    const id = parseInt(pathParts[pathParts.length - 1]);

    const todo = this.todos.get(id);

    if (!todo) {
      return {
        statusCode: 404,
        body: {
          error: 'Not found',
          message: `TODO with ID ${id} not found`
        }
      };
    }

    // Eliminar
    this.todos.delete(id);

    // Log
    this.logger.info('todo-list.deleted', {
      todoId: id,
      title: todo.title
    });

    // Publicar evento
    await this.eventBus.publish('todo.deleted', {
      todoId: id,
      title: todo.title,
      deletedAt: new Date().toISOString()
    });

    // Métrica
    this.metrics.increment('todo.deleted.total');

    return {
      statusCode: 200,
      body: {
        message: 'TODO deleted successfully',
        deletedTodo: todo
      }
    };
  }

  /**
   * API: POST /modules/todo-list/todos/:id/complete
   * Marca un TODO como completado
   */
  async handleCompleteTodo(request) {
    // Extraer ID
    const pathParts = request.path.split('/');
    const id = parseInt(pathParts[pathParts.indexOf('todos') + 1]);

    const todo = this.todos.get(id);

    if (!todo) {
      return {
        statusCode: 404,
        body: {
          error: 'Not found',
          message: `TODO with ID ${id} not found`
        }
      };
    }

    // Marcar como completado
    todo.completed = true;
    todo.updatedAt = new Date().toISOString();
    todo.completedAt = new Date().toISOString();

    // Log
    this.logger.info('todo-list.completed', {
      todoId: todo.id,
      title: todo.title
    });

    // Publicar evento
    await this.eventBus.publish('todo.completed', {
      todoId: todo.id,
      title: todo.title,
      completedAt: todo.completedAt
    });

    // Métrica
    this.metrics.increment('todo.completed.total');

    return {
      statusCode: 200,
      body: {
        todo: todo,
        message: 'TODO marked as complete'
      }
    };
  }
}

module.exports = TodoListModule;
EOF
```

### Paso 4: Probar el Módulo

```bash
# 1. Reiniciar Event Core (para cargar el nuevo módulo)
cd /data/data/com.termux/files/home/event-core
node index.js

# 2. En otra terminal, probar las APIs:

# Listar todos los TODOs
curl http://localhost:3000/modules/todo-list/todos

# Crear un TODO
curl -X POST http://localhost:3000/modules/todo-list/todos \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Comprar leche",
    "description": "Ir al supermercado"
  }'

# Obtener TODO específico (ID 1)
curl http://localhost:3000/modules/todo-list/todos/1

# Actualizar TODO
curl -X PUT http://localhost:3000/modules/todo-list/todos/1 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Comprar leche y pan",
    "description": "Ir al supermercado a las 5pm"
  }'

# Marcar como completado
curl -X POST http://localhost:3000/modules/todo-list/todos/1/complete

# Filtrar TODOs completados
curl "http://localhost:3000/modules/todo-list/todos?completed=true"

# Buscar TODOs
curl "http://localhost:3000/modules/todo-list/todos?search=leche"

# Eliminar TODO
curl -X DELETE http://localhost:3000/modules/todo-list/todos/1
```

### Respuestas Esperadas

**GET /modules/todo-list/todos:**
```json
{
  "todos": [
    {
      "id": 1,
      "title": "Aprender Event Core",
      "description": "Leer la documentación completa",
      "completed": false,
      "createdAt": "2025-10-20T10:30:00.000Z",
      "updatedAt": "2025-10-20T10:30:00.000Z"
    },
    {
      "id": 2,
      "title": "Crear mi primer módulo",
      "description": "Seguir la guía paso a paso",
      "completed": false,
      "createdAt": "2025-10-20T10:30:00.100Z",
      "updatedAt": "2025-10-20T10:30:00.100Z"
    }
  ],
  "total": 2,
  "filters": {}
}
```

**POST /modules/todo-list/todos:**
```json
{
  "todo": {
    "id": 3,
    "title": "Comprar leche",
    "description": "Ir al supermercado",
    "completed": false,
    "createdAt": "2025-10-20T10:35:00.000Z",
    "updatedAt": "2025-10-20T10:35:00.000Z"
  },
  "message": "TODO created successfully"
}
```

**POST /modules/todo-list/todos/1/complete:**
```json
{
  "todo": {
    "id": 1,
    "title": "Aprender Event Core",
    "description": "Leer la documentación completa",
    "completed": true,
    "createdAt": "2025-10-20T10:30:00.000Z",
    "updatedAt": "2025-10-20T10:36:00.000Z",
    "completedAt": "2025-10-20T10:36:00.000Z"
  },
  "message": "TODO marked as complete"
}
```

---

## Ejemplo 2: Módulo User Management (Intermedio)

Ahora vamos a crear un módulo más avanzado con autenticación y validación.

### Paso 1: Crear Estructura

```bash
mkdir -p modules/user-management
cd modules/user-management
```

### Paso 2: Crear `module.json`

```json
{
  "name": "user-management",
  "version": "1.0.0",
  "description": "User management with authentication",
  "main": "index.js",
  "apis": [
    {
      "method": "POST",
      "path": "/register",
      "handler": "handleRegister",
      "description": "Register a new user"
    },
    {
      "method": "POST",
      "path": "/login",
      "handler": "handleLogin",
      "description": "Login and get token"
    },
    {
      "method": "GET",
      "path": "/profile",
      "handler": "handleGetProfile",
      "description": "Get user profile (requires auth)"
    },
    {
      "method": "PUT",
      "path": "/profile",
      "handler": "handleUpdateProfile",
      "description": "Update user profile (requires auth)"
    },
    {
      "method": "GET",
      "path": "/users",
      "handler": "handleListUsers",
      "description": "List all users (admin only)"
    }
  ],
  "events": {
    "publishes": [
      "user.registered",
      "user.login",
      "user.profile.updated"
    ],
    "subscribes": []
  },
  "config": {
    "tokenExpiry": 3600,
    "minPasswordLength": 8
  }
}
```

### Paso 3: Crear `index.js`

```javascript
/**
 * User Management Module
 *
 * Features:
 * - User registration
 * - Login with tokens
 * - Profile management
 * - Role-based access (user, admin)
 */

const crypto = require('crypto');

class UserManagementModule {
  constructor(core) {
    this.core = core;
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;
    this.hooks = core.hooks;

    // Estado
    this.users = new Map();
    this.tokens = new Map(); // token → userId
    this.nextId = 1;

    // Config
    this.config = {
      tokenExpiry: 3600000, // 1 hora en ms
      minPasswordLength: 8
    };
  }

  async onLoad() {
    this.logger.info('user-management.loaded');

    // Registrar hook de autenticación
    this.hooks.register('beforeRequest', this.authenticateRequest.bind(this));

    // Crear usuario admin por defecto
    this.createUser({
      email: 'admin@eventcore.local',
      password: 'admin123',
      name: 'Administrator',
      role: 'admin'
    });
  }

  /**
   * Hook: beforeRequest - Autenticación automática
   */
  async authenticateRequest({ request, coreId }) {
    // Rutas públicas (no requieren auth)
    const publicPaths = [
      '/modules/user-management/register',
      '/modules/user-management/login',
      '/health',
      '/stats'
    ];

    if (publicPaths.includes(request.path)) {
      return { cancelled: false, data: { request } };
    }

    // Verificar token
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        cancelled: true,
        statusCode: 401,
        response: {
          error: 'Unauthorized',
          message: 'Missing or invalid authorization header'
        }
      };
    }

    const token = authHeader.substring(7); // Remover "Bearer "
    const userId = this.tokens.get(token);

    if (!userId) {
      return {
        cancelled: true,
        statusCode: 401,
        response: {
          error: 'Unauthorized',
          message: 'Invalid token'
        }
      };
    }

    const user = this.users.get(userId);

    if (!user) {
      return {
        cancelled: true,
        statusCode: 401,
        response: {
          error: 'Unauthorized',
          message: 'User not found'
        }
      };
    }

    // Añadir usuario al request
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    this.logger.debug('user.authenticated', {
      userId: user.id,
      email: user.email,
      path: request.path
    });

    return { cancelled: false, data: { request } };
  }

  /**
   * Helper: Crear usuario
   */
  createUser(data) {
    const id = this.nextId++;
    const passwordHash = this.hashPassword(data.password);

    const user = {
      id,
      email: data.email,
      passwordHash,
      name: data.name,
      role: data.role || 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.users.set(id, user);
    return user;
  }

  /**
   * Helper: Hash password
   */
  hashPassword(password) {
    return crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');
  }

  /**
   * Helper: Generate token
   */
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * API: POST /modules/user-management/register
   */
  async handleRegister(request) {
    const { email, password, name } = request.body;

    // Validación
    if (!email || !password || !name) {
      return {
        statusCode: 400,
        body: {
          error: 'Validation failed',
          message: 'Email, password, and name are required'
        }
      };
    }

    if (password.length < this.config.minPasswordLength) {
      return {
        statusCode: 400,
        body: {
          error: 'Validation failed',
          message: `Password must be at least ${this.config.minPasswordLength} characters`
        }
      };
    }

    // Verificar si el email ya existe
    const existingUser = Array.from(this.users.values())
      .find(u => u.email === email);

    if (existingUser) {
      return {
        statusCode: 409,
        body: {
          error: 'Conflict',
          message: 'Email already registered'
        }
      };
    }

    // Crear usuario
    const user = this.createUser({
      email,
      password,
      name,
      role: 'user'
    });

    // Log
    this.logger.info('user.registered', {
      userId: user.id,
      email: user.email
    });

    // Evento
    await this.eventBus.publish('user.registered', {
      userId: user.id,
      email: user.email,
      name: user.name
    });

    // Métrica
    this.metrics.increment('user.registered.total');

    // No retornar password hash
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      statusCode: 201,
      body: {
        user: userWithoutPassword,
        message: 'User registered successfully'
      }
    };
  }

  /**
   * API: POST /modules/user-management/login
   */
  async handleLogin(request) {
    const { email, password } = request.body;

    // Validación
    if (!email || !password) {
      return {
        statusCode: 400,
        body: {
          error: 'Validation failed',
          message: 'Email and password are required'
        }
      };
    }

    // Buscar usuario
    const user = Array.from(this.users.values())
      .find(u => u.email === email);

    if (!user) {
      return {
        statusCode: 401,
        body: {
          error: 'Unauthorized',
          message: 'Invalid email or password'
        }
      };
    }

    // Verificar password
    const passwordHash = this.hashPassword(password);

    if (passwordHash !== user.passwordHash) {
      return {
        statusCode: 401,
        body: {
          error: 'Unauthorized',
          message: 'Invalid email or password'
        }
      };
    }

    // Generar token
    const token = this.generateToken();
    this.tokens.set(token, user.id);

    // Log
    this.logger.info('user.login', {
      userId: user.id,
      email: user.email
    });

    // Evento
    await this.eventBus.publish('user.login', {
      userId: user.id,
      email: user.email
    });

    // Métrica
    this.metrics.increment('user.login.total');

    return {
      statusCode: 200,
      body: {
        token,
        expiresIn: this.config.tokenExpiry / 1000,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    };
  }

  /**
   * API: GET /modules/user-management/profile
   * Requiere autenticación (el hook ya lo validó)
   */
  async handleGetProfile(request) {
    // request.user ya está disponible gracias al hook
    const userId = request.user.id;
    const user = this.users.get(userId);

    const { passwordHash, ...userWithoutPassword } = user;

    return {
      statusCode: 200,
      body: {
        user: userWithoutPassword
      }
    };
  }

  /**
   * API: PUT /modules/user-management/profile
   */
  async handleUpdateProfile(request) {
    const userId = request.user.id;
    const user = this.users.get(userId);

    const { name, email } = request.body;

    if (name) {
      user.name = name;
    }

    if (email) {
      user.email = email;
    }

    user.updatedAt = new Date().toISOString();

    // Log
    this.logger.info('user.profile.updated', {
      userId: user.id
    });

    // Evento
    await this.eventBus.publish('user.profile.updated', {
      userId: user.id,
      email: user.email
    });

    const { passwordHash, ...userWithoutPassword } = user;

    return {
      statusCode: 200,
      body: {
        user: userWithoutPassword,
        message: 'Profile updated successfully'
      }
    };
  }

  /**
   * API: GET /modules/user-management/users
   * Solo admin
   */
  async handleListUsers(request) {
    // Verificar rol admin
    if (request.user.role !== 'admin') {
      return {
        statusCode: 403,
        body: {
          error: 'Forbidden',
          message: 'Admin access required'
        }
      };
    }

    const users = Array.from(this.users.values())
      .map(({ passwordHash, ...user }) => user);

    return {
      statusCode: 200,
      body: {
        users,
        total: users.length
      }
    };
  }
}

module.exports = UserManagementModule;
```

### Paso 4: Probar Autenticación

```bash
# 1. Registrar usuario
curl -X POST http://localhost:3000/modules/user-management/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "juan@example.com",
    "password": "password123",
    "name": "Juan Pérez"
  }'

# 2. Login (obtener token)
curl -X POST http://localhost:3000/modules/user-management/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "juan@example.com",
    "password": "password123"
  }'

# Respuesta:
# {
#   "token": "a1b2c3d4e5f6...",
#   "expiresIn": 3600,
#   "user": { ... }
# }

# 3. Guardar el token y usarlo en peticiones
TOKEN="a1b2c3d4e5f6..."

# 4. Ver perfil (requiere token)
curl http://localhost:3000/modules/user-management/profile \
  -H "Authorization: Bearer $TOKEN"

# 5. Actualizar perfil
curl -X PUT http://localhost:3000/modules/user-management/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Juan Carlos Pérez"
  }'

# 6. Sin token → 401 Unauthorized
curl http://localhost:3000/modules/user-management/profile
```

---

## Ejemplo 3: Módulo con Base de Datos (Avanzado)

Ver `docs/GUIA_BASE_DATOS.md` para un ejemplo completo con SQLite.

---

## Estructura Completa de un Módulo

```
modules/mi-modulo/
├── module.json          ← Manifest con APIs y metadata
├── index.js             ← Clase principal del módulo
├── handlers/            ← Handlers separados (opcional)
│   ├── users.js
│   └── products.js
├── models/              ← Modelos de datos (opcional)
│   └── user.js
├── validators/          ← Validadores (opcional)
│   └── userValidator.js
├── utils/               ← Utilidades (opcional)
│   └── helpers.js
├── config.json          ← Configuración del módulo (opcional)
├── README.md            ← Documentación
└── tests/               ← Tests del módulo (opcional)
    └── index.test.js
```

---

## Best Practices

### 1. Validación de Input

Siempre valida el input antes de procesarlo:

```javascript
async handleCreate(request) {
  const { name, email } = request.body;

  // Validación de campos requeridos
  if (!name) {
    return {
      statusCode: 400,
      body: { error: 'Name is required' }
    };
  }

  // Validación de formato
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      statusCode: 400,
      body: { error: 'Invalid email format' }
    };
  }

  // Continuar...
}
```

### 2. Manejo de Errores

Usa try/catch para operaciones peligrosas:

```javascript
async handleOperation(request) {
  try {
    const result = await this.riskyOperation();
    return {
      statusCode: 200,
      body: { result }
    };
  } catch (error) {
    this.logger.error('operation.failed', {
      error: error.message,
      stack: error.stack
    });

    return {
      statusCode: 500,
      body: {
        error: 'Operation failed',
        message: error.message
      }
    };
  }
}
```

### 3. Logging Estructurado

Usa logging para trazabilidad:

```javascript
this.logger.info('operation.started', {
  userId: request.user.id,
  operation: 'createOrder',
  timestamp: Date.now()
});

// ... ejecutar

this.logger.info('operation.completed', {
  userId: request.user.id,
  operation: 'createOrder',
  duration: Date.now() - start,
  orderId: order.id
});
```

### 4. Publicar Eventos

Permite que otros módulos reaccionen:

```javascript
await this.eventBus.publish('order.created', {
  orderId: order.id,
  userId: order.userId,
  total: order.total
});
```

### 5. Métricas

Registra métricas para observabilidad:

```javascript
this.metrics.increment('orders.created.total');
this.metrics.histogram('order.value', order.total);
```

### 6. No Retornar Datos Sensibles

Nunca retornes passwords, tokens, etc:

```javascript
const { password, passwordHash, ...safeUser } = user;
return {
  statusCode: 200,
  body: { user: safeUser }
};
```

---

## 🎯 Checklist para Crear un Módulo

**Backend (APIs):**
- [ ] Crear directorio `modules/mi-modulo/`
- [ ] Crear `module.json` con APIs definidas
- [ ] Crear `index.js` con clase del módulo
- [ ] Implementar constructor con `core` parameter
- [ ] Implementar `onLoad()` lifecycle hook
- [ ] Implementar `onUnload()` lifecycle hook
- [ ] Implementar handlers para cada API
- [ ] Validar todos los inputs
- [ ] Manejar todos los errores con try/catch
- [ ] Usar logging estructurado
- [ ] Publicar eventos importantes
- [ ] Registrar métricas
- [ ] No retornar datos sensibles
- [ ] Probar todas las APIs con curl
- [ ] Documentar en README.md

**Interfaz Gráfica (Opcional):**
- [ ] Agregar sección `ui` en `module.json` (ver `UI_DEVELOPER_GUIDE.md`)
- [ ] Probar la interfaz en `http://localhost:3000/ui`

---

> **💡 Tip:** Event Core incluye un sistema UI que genera interfaces gráficas automáticamente desde JSON.
> No necesitas escribir HTML/CSS/JS. Solo define vistas en `module.json`.
> Ver **`docs/UI_DEVELOPER_GUIDE.md`** para detalles completos.

---

## 📚 Guías Relacionadas

**Siguiente lectura recomendada:**
- **`docs/GUIA_HOOKS.md`** - Autenticación y middleware con hooks
- **`docs/GUIA_EVENT_BUS.md`** - Comunicación entre módulos con eventos
- **`docs/UI_DEVELOPER_GUIDE.md`** - Agregar interfaces gráficas a tus módulos
- **`docs/GUIA_TESTING.md`** - Testing de módulos
