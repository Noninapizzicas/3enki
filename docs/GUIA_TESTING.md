# Guía Completa: Testing de APIs y Módulos

**Nivel:** Principiante → Avanzado
**Tiempo:** 30-45 minutos
**Fecha:** 2025-10-20

Esta guía te enseñará a crear tests completos para tus módulos y APIs.

---

## 📋 Tabla de Contenidos

1. [Tipos de Tests](#tipos-de-tests)
2. [Tests Unitarios de Handlers](#tests-unitarios-de-handlers)
3. [Tests de Integración HTTP](#tests-de-integración-http)
4. [Tests de Hooks](#tests-de-hooks)
5. [Tests de Event Bus](#tests-de-event-bus)
6. [Test Helper Utilities](#test-helper-utilities)
7. [Best Practices](#best-practices)

---

## Tipos de Tests

### 1. Tests Unitarios
- Testean **handlers individuales** sin HTTP
- Usan **mocks** del core
- **Rápidos** y aislados
- Verifican lógica de negocio

### 2. Tests de Integración
- Testean **HTTP completo** (request → response)
- Usan **Event Core real** corriendo
- **Lentos** pero realistas
- Verifican flujo completo

### 3. Tests de Hooks
- Testean **interceptación** de requests
- Verifican **autenticación**, validación, etc.
- Usan mocks o HTTP real

### 4. Tests de Eventos
- Testean **publicación** y **suscripción**
- Verifican comunicación entre módulos
- Usan Event Bus real o mock

---

## Tests Unitarios de Handlers

### Ejemplo 1: Test del Módulo TODO

Crear: `modules/todo-list/tests/unit.test.js`

```javascript
#!/usr/bin/env node

/**
 * Unit Tests - TODO List Module
 *
 * Testea handlers individuales sin HTTP
 */

const TodoListModule = require('../index');

// ============================================================================
// Test Utilities
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`   ✅ ${message}`);
    testsPassed++;
  } else {
    console.error(`   ❌ ${message}`);
    testsFailed++;
  }
}

async function assertEqual(actual, expected, message) {
  const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
  assert(isEqual, message);
  if (!isEqual) {
    console.log(`      Expected:`, expected);
    console.log(`      Got:`, actual);
  }
}

// ============================================================================
// Mock del Core
// ============================================================================

const mockCore = {
  id: 'test-core',

  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  },

  eventBus: {
    publish: async (topic, payload) => {
      // Capturar eventos publicados
      mockCore._events = mockCore._events || [];
      mockCore._events.push({ topic, payload });
    }
  },

  metrics: {
    increment: () => {},
    histogram: () => {}
  },

  hooks: {
    register: () => {}
  },

  // Helpers
  _events: []
};

// ============================================================================
// Test Suite
// ============================================================================

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           TODO List Module - Unit Tests                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Crear instancia del módulo
  const todoModule = new TodoListModule(mockCore);
  await todoModule.onLoad();

  // ========================================================================
  // Test Suite 1: handleListTodos
  // ========================================================================
  console.log('\n📦 Test Suite 1: handleListTodos\n');

  // Test 1.1: Listar todos
  const listResponse = await todoModule.handleListTodos({
    query: {},
    path: '/todos'
  });

  assert(listResponse.statusCode === 200, 'Retorna 200 OK');
  assert(Array.isArray(listResponse.body.todos), 'Body contiene array de todos');
  assert(listResponse.body.todos.length === 2, 'Hay 2 TODOs iniciales');

  // Test 1.2: Filtrar por completed
  const completedResponse = await todoModule.handleListTodos({
    query: { completed: 'false' },
    path: '/todos'
  });

  assert(completedResponse.statusCode === 200, 'Retorna 200 para filtro completed');
  assert(completedResponse.body.todos.every(t => !t.completed),
    'Todos los TODOs son no completados');

  // Test 1.3: Buscar por texto
  const searchResponse = await todoModule.handleListTodos({
    query: { search: 'Event Core' },
    path: '/todos'
  });

  assert(searchResponse.statusCode === 200, 'Retorna 200 para búsqueda');
  assert(searchResponse.body.todos.length > 0, 'Encuentra TODOs');
  assert(searchResponse.body.todos[0].title.includes('Event Core'),
    'TODO encontrado contiene el texto buscado');

  // ========================================================================
  // Test Suite 2: handleCreateTodo
  // ========================================================================
  console.log('\n📦 Test Suite 2: handleCreateTodo\n');

  // Limpiar eventos
  mockCore._events = [];

  // Test 2.1: Crear TODO válido
  const createResponse = await todoModule.handleCreateTodo({
    body: {
      title: 'Test TODO',
      description: 'This is a test'
    },
    path: '/todos'
  });

  assert(createResponse.statusCode === 201, 'Retorna 201 Created');
  assert(createResponse.body.todo.title === 'Test TODO', 'TODO creado con título correcto');
  assert(createResponse.body.todo.id === 3, 'TODO tiene ID 3');
  assert(createResponse.body.todo.completed === false, 'TODO no completado por defecto');
  assert(typeof createResponse.body.todo.createdAt === 'string', 'Tiene timestamp de creación');

  // Test 2.2: Evento publicado
  assert(mockCore._events.length === 1, 'Se publicó 1 evento');
  assert(mockCore._events[0].topic === 'todo.created', 'Evento es todo.created');
  assert(mockCore._events[0].payload.todoId === 3, 'Evento contiene ID del TODO');

  // Test 2.3: Crear TODO sin título (error)
  const errorResponse = await todoModule.handleCreateTodo({
    body: {
      description: 'No title'
    },
    path: '/todos'
  });

  assert(errorResponse.statusCode === 400, 'Retorna 400 Bad Request');
  assert(errorResponse.body.error === 'Validation failed', 'Mensaje de error correcto');

  // ========================================================================
  // Test Suite 3: handleGetTodo
  // ========================================================================
  console.log('\n📦 Test Suite 3: handleGetTodo\n');

  // Test 3.1: Obtener TODO existente
  const getResponse = await todoModule.handleGetTodo({
    path: '/todos/1',
    query: {}
  });

  assert(getResponse.statusCode === 200, 'Retorna 200 OK');
  assert(getResponse.body.todo.id === 1, 'Retorna TODO con ID 1');

  // Test 3.2: Obtener TODO inexistente
  const notFoundResponse = await todoModule.handleGetTodo({
    path: '/todos/999',
    query: {}
  });

  assert(notFoundResponse.statusCode === 404, 'Retorna 404 Not Found');
  assert(notFoundResponse.body.error === 'Not found', 'Mensaje de error correcto');

  // Test 3.3: ID inválido
  const invalidIdResponse = await todoModule.handleGetTodo({
    path: '/todos/abc',
    query: {}
  });

  assert(invalidIdResponse.statusCode === 400, 'Retorna 400 para ID inválido');

  // ========================================================================
  // Test Suite 4: handleUpdateTodo
  // ========================================================================
  console.log('\n📦 Test Suite 4: handleUpdateTodo\n');

  mockCore._events = [];

  // Test 4.1: Actualizar TODO
  const updateResponse = await todoModule.handleUpdateTodo({
    path: '/todos/1',
    body: {
      title: 'Updated Title',
      description: 'Updated description'
    }
  });

  assert(updateResponse.statusCode === 200, 'Retorna 200 OK');
  assert(updateResponse.body.todo.title === 'Updated Title', 'Título actualizado');
  assert(updateResponse.body.todo.description === 'Updated description',
    'Descripción actualizada');

  // Test 4.2: Evento publicado
  assert(mockCore._events.length === 1, 'Se publicó evento de actualización');
  assert(mockCore._events[0].topic === 'todo.updated', 'Evento es todo.updated');

  // ========================================================================
  // Test Suite 5: handleCompleteTodo
  // ========================================================================
  console.log('\n📦 Test Suite 5: handleCompleteTodo\n');

  mockCore._events = [];

  // Test 5.1: Completar TODO
  const completeResponse = await todoModule.handleCompleteTodo({
    path: '/todos/1/complete'
  });

  assert(completeResponse.statusCode === 200, 'Retorna 200 OK');
  assert(completeResponse.body.todo.completed === true, 'TODO marcado como completado');
  assert(typeof completeResponse.body.todo.completedAt === 'string',
    'Tiene timestamp de completado');

  // Test 5.2: Evento publicado
  assert(mockCore._events.length === 1, 'Se publicó evento de completado');
  assert(mockCore._events[0].topic === 'todo.completed', 'Evento es todo.completed');

  // ========================================================================
  // Test Suite 6: handleDeleteTodo
  // ========================================================================
  console.log('\n📦 Test Suite 6: handleDeleteTodo\n');

  // Test 6.1: Eliminar TODO
  const deleteResponse = await todoModule.handleDeleteTodo({
    path: '/todos/1'
  });

  assert(deleteResponse.statusCode === 200, 'Retorna 200 OK');
  assert(deleteResponse.body.deletedTodo.id === 1, 'Retorna TODO eliminado');

  // Test 6.2: Verificar que se eliminó
  const getDeletedResponse = await todoModule.handleGetTodo({
    path: '/todos/1',
    query: {}
  });

  assert(getDeletedResponse.statusCode === 404,
    'TODO eliminado ya no existe (404)');

  // ========================================================================
  // Results
  // ========================================================================
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST RESULTS                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`   ✅ Tests Passed: ${testsPassed}`);
  console.log(`   ❌ Tests Failed: ${testsFailed}`);
  console.log(`   📊 Total Tests:  ${testsPassed + testsFailed}\n`);

  if (testsFailed === 0) {
    console.log('🎉 All tests passed!\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed.\n');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('💥 Test suite crashed:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
```

### Correr Tests Unitarios

```bash
chmod +x modules/todo-list/tests/unit.test.js
node modules/todo-list/tests/unit.test.js
```

---

## Tests de Integración HTTP

### Ejemplo 2: Test HTTP Completo

Crear: `tests/integration/todo-api.test.js`

```javascript
#!/usr/bin/env node

/**
 * Integration Tests - TODO API
 *
 * Testea el flujo HTTP completo:
 * Cliente HTTP → Gateway → Hooks → Handler → Response
 */

const http = require('http');

// ============================================================================
// Test Utilities
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`   ✅ ${message}`);
    testsPassed++;
  } else {
    console.error(`   ❌ ${message}`);
    testsFailed++;
  }
}

/**
 * Helper: Hacer petición HTTP
 */
function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Helper: Sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Test Suite
// ============================================================================

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           TODO API - Integration Tests                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('⚠️  Asegúrate de que Event Core esté corriendo en localhost:3000\n');

  await sleep(1000);

  // ========================================================================
  // Test Suite 1: Health Check
  // ========================================================================
  console.log('\n📦 Test Suite 1: Health Check\n');

  const healthRes = await makeRequest('GET', '/health');
  assert(healthRes.statusCode === 200, 'Health check retorna 200');
  assert(healthRes.body.status === 'healthy', 'Status es healthy');

  // ========================================================================
  // Test Suite 2: List TODOs
  // ========================================================================
  console.log('\n📦 Test Suite 2: List TODOs\n');

  const listRes = await makeRequest('GET', '/modules/todo-list/todos');
  assert(listRes.statusCode === 200, 'List retorna 200');
  assert(Array.isArray(listRes.body.todos), 'Body contiene array de todos');
  assert(listRes.body.total >= 0, 'Total es un número');

  // ========================================================================
  // Test Suite 3: Create TODO
  // ========================================================================
  console.log('\n📦 Test Suite 3: Create TODO\n');

  const createRes = await makeRequest('POST', '/modules/todo-list/todos', {
    title: 'Integration Test TODO',
    description: 'Created via HTTP test'
  });

  assert(createRes.statusCode === 201, 'Create retorna 201');
  assert(createRes.body.todo.title === 'Integration Test TODO',
    'TODO creado con título correcto');

  const todoId = createRes.body.todo.id;
  assert(typeof todoId === 'number', 'TODO tiene ID numérico');

  // ========================================================================
  // Test Suite 4: Get TODO
  // ========================================================================
  console.log('\n📦 Test Suite 4: Get TODO\n');

  const getRes = await makeRequest('GET', `/modules/todo-list/todos/${todoId}`);
  assert(getRes.statusCode === 200, 'Get retorna 200');
  assert(getRes.body.todo.id === todoId, 'Retorna TODO correcto');

  // ========================================================================
  // Test Suite 5: Update TODO
  // ========================================================================
  console.log('\n📦 Test Suite 5: Update TODO\n');

  const updateRes = await makeRequest('PUT', `/modules/todo-list/todos/${todoId}`, {
    title: 'Updated via HTTP'
  });

  assert(updateRes.statusCode === 200, 'Update retorna 200');
  assert(updateRes.body.todo.title === 'Updated via HTTP',
    'Título actualizado correctamente');

  // ========================================================================
  // Test Suite 6: Complete TODO
  // ========================================================================
  console.log('\n📦 Test Suite 6: Complete TODO\n');

  const completeRes = await makeRequest('POST',
    `/modules/todo-list/todos/${todoId}/complete`);

  assert(completeRes.statusCode === 200, 'Complete retorna 200');
  assert(completeRes.body.todo.completed === true,
    'TODO marcado como completado');

  // ========================================================================
  // Test Suite 7: Delete TODO
  // ========================================================================
  console.log('\n📦 Test Suite 7: Delete TODO\n');

  const deleteRes = await makeRequest('DELETE',
    `/modules/todo-list/todos/${todoId}`);

  assert(deleteRes.statusCode === 200, 'Delete retorna 200');

  // Verificar que se eliminó
  const getDeletedRes = await makeRequest('GET',
    `/modules/todo-list/todos/${todoId}`);

  assert(getDeletedRes.statusCode === 404,
    'TODO eliminado retorna 404');

  // ========================================================================
  // Test Suite 8: Error Handling
  // ========================================================================
  console.log('\n📦 Test Suite 8: Error Handling\n');

  // 8.1: Crear sin título
  const createErrorRes = await makeRequest('POST', '/modules/todo-list/todos', {
    description: 'No title'
  });

  assert(createErrorRes.statusCode === 400, 'Crear sin título retorna 400');
  assert(createErrorRes.body.error === 'Validation failed',
    'Mensaje de error correcto');

  // 8.2: GET de TODO inexistente
  const getNotFoundRes = await makeRequest('GET', '/modules/todo-list/todos/99999');
  assert(getNotFoundRes.statusCode === 404, 'TODO inexistente retorna 404');

  // 8.3: Ruta inválida
  const invalidRouteRes = await makeRequest('GET', '/modules/todo-list/invalid');
  assert(invalidRouteRes.statusCode === 404, 'Ruta inválida retorna 404');

  // ========================================================================
  // Test Suite 9: Query Filters
  // ========================================================================
  console.log('\n📦 Test Suite 9: Query Filters\n');

  // Crear un TODO completado
  const todo1Res = await makeRequest('POST', '/modules/todo-list/todos', {
    title: 'Completed TODO'
  });
  const todo1Id = todo1Res.body.todo.id;

  await makeRequest('POST', `/modules/todo-list/todos/${todo1Id}/complete`);

  // Filtrar completados
  const completedRes = await makeRequest('GET',
    '/modules/todo-list/todos?completed=true');

  assert(completedRes.statusCode === 200, 'Filtro completed retorna 200');
  assert(completedRes.body.todos.every(t => t.completed),
    'Todos los TODOs son completados');

  // Búsqueda
  const searchRes = await makeRequest('GET',
    '/modules/todo-list/todos?search=Completed');

  assert(searchRes.statusCode === 200, 'Búsqueda retorna 200');
  assert(searchRes.body.todos.length > 0, 'Encuentra TODOs');

  // ========================================================================
  // Results
  // ========================================================================
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST RESULTS                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`   ✅ Tests Passed: ${testsPassed}`);
  console.log(`   ❌ Tests Failed: ${testsFailed}`);
  console.log(`   📊 Total Tests:  ${testsPassed + testsFailed}\n`);

  if (testsFailed === 0) {
    console.log('🎉 All integration tests passed!\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed.\n');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('💥 Test suite crashed:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
```

### Correr Tests de Integración

```bash
# Terminal 1: Iniciar Event Core
node index.js

# Terminal 2: Correr tests
chmod +x tests/integration/todo-api.test.js
node tests/integration/todo-api.test.js
```

---

## Tests de Hooks

### Ejemplo 3: Testear Autenticación

```javascript
/**
 * Test de Hook de Autenticación
 */

const AuthModule = require('../../modules/auth');

async function testAuthHook() {
  // Mock del core
  const mockCore = {
    id: 'test',
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    eventBus: { publish: async () => {} },
    metrics: { increment: () => {} },
    hooks: { register: () => {} }
  };

  const authModule = new AuthModule(mockCore);
  await authModule.onLoad();

  // Test 1: Ruta pública (sin token) → OK
  const publicResult = await authModule.authenticateRequest({
    request: {
      path: '/modules/echo/ping',
      headers: {}
    },
    coreId: 'test'
  });

  assert(!publicResult.cancelled, 'Ruta pública no requiere auth');

  // Test 2: Ruta protegida sin token → 401
  const noTokenResult = await authModule.authenticateRequest({
    request: {
      path: '/modules/auth/me',
      headers: {}
    },
    coreId: 'test'
  });

  assert(noTokenResult.cancelled, 'Sin token cancela la request');
  assert(noTokenResult.statusCode === 401, 'Retorna 401');

  // Test 3: Login y obtener token
  const loginRes = await authModule.handleLogin({
    body: {
      email: 'admin@example.com',
      password: 'admin123'
    }
  });

  assert(loginRes.statusCode === 200, 'Login exitoso');
  const token = loginRes.body.token;

  // Test 4: Ruta protegida CON token → OK
  const withTokenResult = await authModule.authenticateRequest({
    request: {
      path: '/modules/auth/me',
      headers: {
        authorization: `Bearer ${token}`
      }
    },
    coreId: 'test'
  });

  assert(!withTokenResult.cancelled, 'Con token permite la request');
  assert(withTokenResult.data.request.user, 'Añade usuario a la request');
  assert(withTokenResult.data.request.user.email === 'admin@example.com',
    'Usuario correcto inyectado');

  console.log('✅ Todos los tests de auth hook pasaron');
}
```

---

## Test Helper Utilities

Crear: `tests/helpers/index.js`

```javascript
/**
 * Test Helper Utilities
 */

const http = require('http');

class TestHelper {
  static async makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data ? JSON.parse(data) : null
            });
          } catch (error) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data
            });
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  static createMockCore() {
    return {
      id: 'test-core',
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {}
      },
      eventBus: {
        publish: async (topic, payload) => {
          this._events = this._events || [];
          this._events.push({ topic, payload });
        }
      },
      metrics: {
        increment: () => {},
        histogram: () => {}
      },
      hooks: {
        register: () => {}
      },
      _events: []
    };
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TestHelper;
```

---

## Best Practices

### 1. Separar Tests Unitarios e Integración

```
tests/
├── unit/               ← Tests rápidos, sin HTTP
│   └── todo.test.js
└── integration/        ← Tests lentos, HTTP real
    └── todo-api.test.js
```

### 2. Usar Mocks para Tests Unitarios

```javascript
const mockCore = {
  logger: { info: () => {} },  // No-op logger
  eventBus: { publish: async () => {} },  // No-op event bus
  // ...
};
```

### 3. Limpiar Estado Entre Tests

```javascript
beforeEach(() => {
  mockCore._events = [];
  todoModule.todos.clear();
});
```

### 4. Tests Descriptivos

```javascript
// ❌ MAL
assert(res.statusCode === 200);

// ✅ BIEN
assert(res.statusCode === 200, 'Create TODO retorna 200 OK');
```

### 5. Testear Happy Path y Error Cases

```javascript
// Happy path
const validRes = await handleCreate({ body: { title: 'Valid' } });
assert(validRes.statusCode === 201);

// Error case
const invalidRes = await handleCreate({ body: {} });
assert(invalidRes.statusCode === 400);
```

---

## 🎯 Checklist de Testing

- [ ] Tests unitarios de cada handler
- [ ] Tests de validación de input
- [ ] Tests de error handling
- [ ] Tests de integración HTTP
- [ ] Tests de hooks (auth, validation)
- [ ] Tests de eventos publicados
- [ ] Tests de casos edge (IDs inválidos, etc)
- [ ] Tests de filters y queries
- [ ] Coverage > 80%

---

**Siguiente:** Lee `docs/GUIA_EVENT_BUS.md` para integración con eventos.
