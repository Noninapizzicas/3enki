# Sistema de APIs - Event Core

**Fecha:** 2025-10-20
**Versión:** v0.1.0

---

## 📚 Tabla de Contenidos

1. [Arquitectura del Sistema de APIs](#arquitectura-del-sistema-de-apis)
2. [Componentes Principales](#componentes-principales)
3. [Flujo de una Petición HTTP](#flujo-de-una-petición-http)
4. [Cómo los Módulos Exponen APIs](#cómo-los-módulos-exponen-apis)
5. [HTTP Gateway en Detalle](#http-gateway-en-detalle)
6. [Hook System e Interceptación](#hook-system-e-interceptación)
7. [Ejemplos Prácticos](#ejemplos-prácticos)
8. [Testing de APIs](#testing-de-apis)
9. [Mejores Prácticas](#mejores-prácticas)

---

## Arquitectura del Sistema de APIs

Event Core utiliza un sistema de APIs **modular y extensible** donde:

1. **HTTP Gateway** (`core/gateway/http.js`) - Servidor HTTP central que maneja todas las peticiones
2. **Module Loader** (`core/modules/loader.js`) - Registra automáticamente las rutas de los módulos
3. **Módulos** (`modules/*/`) - Definen y exportan sus propias APIs
4. **Hook System** (`core/hooks.js`) - Intercepta peticiones/respuestas (beforeRequest, afterResponse)

### Diagrama de Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                         CLIENTE                              │
│  (CLI, Browser, curl, Postman, etc.)                        │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP Request
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                    HTTP GATEWAY                              │
│  core/gateway/http.js                                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  RUTAS CORE (Built-in)                                 │ │
│  │  GET  /health      → Health check                      │ │
│  │  GET  /stats       → Estadísticas                      │ │
│  │  GET  /modules     → Lista de módulos                  │ │
│  │  POST /events      → Publicar evento                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  RUTAS DE MÓDULOS (Auto-registradas)                   │ │
│  │  /modules/{module_name}/{path}                         │ │
│  │                                                         │ │
│  │  Ejemplo: /modules/echo/ping                           │ │
│  │          /modules/file-watcher/watch                   │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                   HOOK SYSTEM                                │
│  beforeRequest  → Intercepta antes de procesar              │
│  afterResponse  → Intercepta después de procesar            │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                   MODULE LOADER                              │
│  Encuentra el módulo correcto                                │
│  Invoca el handler correspondiente                           │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                      MÓDULO                                  │
│  Ejecuta lógica de negocio                                   │
│  Retorna respuesta                                           │
└──────────────────────────────────────────────────────────────┘
```

---

## Componentes Principales

### 1. HTTP Gateway (`core/gateway/http.js`)

**Responsabilidad:** Servidor HTTP central que:
- Escucha en el puerto configurado (default: 3000)
- Define rutas core del sistema (/health, /stats, /modules, /events)
- Registra automáticamente rutas de módulos
- Ejecuta hooks antes/después de cada petición
- Maneja CORS
- Registra métricas y logs

**Archivo:** `core/gateway/http.js` (~400 líneas)

**Creación:**
```javascript
const gateway = new HTTPGateway({
  port: 3000,
  coreId: 'core-a',
  logger: logger,
  metrics: metrics,
  eventBus: eventBus,
  moduleLoader: moduleLoader
});

await gateway.start();
```

### 2. Module Loader (`core/modules/loader.js`)

**Responsabilidad:**
- Descubre módulos en `./modules/`
- Carga el manifest `module.json` de cada módulo
- Registra las APIs definidas en el manifest
- Proporciona acceso a los módulos al HTTP Gateway

**Archivo:** `core/modules/loader.js` (~300 líneas)

**APIs en Module Manifest:**
```json
{
  "name": "echo",
  "version": "1.0.0",
  "apis": [
    {
      "method": "GET",
      "path": "/ping",
      "handler": "handlePing",
      "description": "Ping endpoint"
    },
    {
      "method": "POST",
      "path": "/echo",
      "handler": "handleEcho",
      "description": "Echo back the request body"
    }
  ]
}
```

### 3. Módulos (`modules/*/index.js`)

**Responsabilidad:**
- Implementan la lógica de negocio
- Exportan handlers para cada API
- Reciben contexto del core (logger, eventBus, hooks, metrics)

**Estructura de un módulo:**
```javascript
class EchoModule {
  constructor(core) {
    this.core = core;
    this.logger = core.logger;
    this.eventBus = core.eventBus;
  }

  // Handler para GET /modules/echo/ping
  async handlePing(req, res) {
    return {
      statusCode: 200,
      body: {
        message: 'pong',
        timestamp: new Date().toISOString()
      }
    };
  }

  // Handler para POST /modules/echo/echo
  async handleEcho(req, res) {
    return {
      statusCode: 200,
      body: {
        echo: req.body,
        receivedAt: new Date().toISOString()
      }
    };
  }
}
```

---

## Flujo de una Petición HTTP

### Paso a Paso Completo

#### 1️⃣ Cliente hace una petición

```bash
curl -X POST http://localhost:3000/modules/echo/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello World"}'
```

#### 2️⃣ HTTP Gateway recibe la petición

**Archivo:** `core/gateway/http.js:100` (aprox)

```javascript
this.server.on('request', async (req, res) => {
  const startTime = Date.now();

  // Parsear URL y body
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Log de entrada
  this.logger.info('http.request.received', {
    method: req.method,
    path: pathname,
    core_id: this.coreId
  });

  // ... continúa en paso 3
});
```

#### 3️⃣ Se ejecuta el Hook "beforeRequest"

**Archivo:** `core/gateway/http.js:150` (aprox)

```javascript
// Crear objeto de petición
const request = {
  method: req.method,
  path: pathname,
  query: parsedUrl.query,
  headers: req.headers,
  body: parsedBody
};

// Ejecutar hook beforeRequest
const beforeResult = await this.hooks.execute('beforeRequest', {
  request,
  coreId: this.coreId
});

// Si el hook cancela, retornar inmediatamente
if (beforeResult.cancelled) {
  res.writeHead(beforeResult.statusCode || 403, {
    'Content-Type': 'application/json'
  });
  res.end(JSON.stringify(beforeResult.response));
  return;
}

// El hook puede modificar la request
const modifiedRequest = beforeResult.data.request;
```

**Ejemplo de Hook:**
```javascript
// Un módulo puede interceptar ANTES de procesar
hooks.register('beforeRequest', async ({ request, coreId }) => {
  // Autenticación, validación, rate limiting, etc.
  if (!request.headers.authorization) {
    return {
      cancelled: true,
      statusCode: 401,
      response: { error: 'Unauthorized' }
    };
  }

  // Modificar la request (añadir datos)
  request.user = decodeToken(request.headers.authorization);

  return { cancelled: false, data: { request } };
});
```

#### 4️⃣ Routing - Identificar qué handler usar

**Archivo:** `core/gateway/http.js:200` (aprox)

```javascript
// Rutas CORE (built-in)
if (pathname === '/health') {
  response = await this.handleHealth(modifiedRequest);
}
else if (pathname === '/stats') {
  response = await this.handleStats(modifiedRequest);
}
else if (pathname === '/modules') {
  response = await this.handleModules(modifiedRequest);
}
else if (pathname === '/events' && req.method === 'POST') {
  response = await this.handlePublishEvent(modifiedRequest);
}

// Rutas de MÓDULOS: /modules/{name}/{path}
else if (pathname.startsWith('/modules/')) {
  response = await this.handleModuleRequest(modifiedRequest);
}

// 404 Not Found
else {
  response = {
    statusCode: 404,
    body: { error: 'Not found', path: pathname }
  };
}
```

#### 5️⃣ Handler de Módulo (si es ruta de módulo)

**Archivo:** `core/gateway/http.js:300` (aprox)

```javascript
async handleModuleRequest(request) {
  // Parsear: /modules/{moduleName}/{path}
  const pathParts = request.path.split('/');
  const moduleName = pathParts[2];  // 'echo'
  const modulePath = '/' + pathParts.slice(3).join('/');  // '/echo'

  // Obtener el módulo cargado
  const module = this.moduleLoader.getModule(moduleName);

  if (!module) {
    return {
      statusCode: 404,
      body: { error: `Module '${moduleName}' not found` }
    };
  }

  // Buscar la API en el manifest
  const api = module.manifest.apis.find(api =>
    api.method === request.method && api.path === modulePath
  );

  if (!api) {
    return {
      statusCode: 404,
      body: { error: `API '${request.method} ${modulePath}' not found in module '${moduleName}'` }
    };
  }

  // Invocar el handler del módulo
  const handlerName = api.handler;  // 'handleEcho'
  const handler = module.instance[handlerName];

  if (!handler) {
    return {
      statusCode: 500,
      body: { error: `Handler '${handlerName}' not found in module '${moduleName}'` }
    };
  }

  // EJECUTAR EL HANDLER
  try {
    const result = await handler.call(module.instance, request);
    return result;
  } catch (error) {
    this.logger.error('http.module.handler_error', {
      module: moduleName,
      handler: handlerName,
      error: error.message
    }, error);

    return {
      statusCode: 500,
      body: { error: 'Internal server error', details: error.message }
    };
  }
}
```

#### 6️⃣ Módulo ejecuta la lógica

**Archivo:** `modules/echo/index.js:50` (aprox)

```javascript
async handleEcho(request) {
  // Lógica de negocio
  const input = request.body;

  // Publicar evento (opcional)
  await this.eventBus.publish('echo.message', {
    message: input.message,
    timestamp: new Date().toISOString()
  });

  // Log
  this.logger.info('echo.message.received', {
    message: input.message
  });

  // Incrementar métrica
  this.core.metrics.increment('echo.requests');

  // Retornar respuesta
  return {
    statusCode: 200,
    body: {
      echo: input,
      receivedAt: new Date().toISOString(),
      processedBy: this.core.id
    }
  };
}
```

#### 7️⃣ Se ejecuta el Hook "afterResponse"

**Archivo:** `core/gateway/http.js:400` (aprox)

```javascript
// Ejecutar hook afterResponse
const afterResult = await this.hooks.execute('afterResponse', {
  request: modifiedRequest,
  response: response,
  coreId: this.coreId
});

// El hook puede modificar la respuesta
const finalResponse = afterResult.data.response;
```

**Ejemplo de Hook:**
```javascript
// Un módulo puede interceptar DESPUÉS de procesar
hooks.register('afterResponse', async ({ request, response, coreId }) => {
  // Añadir headers custom, logging, caching, etc.
  response.headers = {
    ...response.headers,
    'X-Core-ID': coreId,
    'X-Response-Time': `${Date.now() - request.startTime}ms`
  };

  return { data: { response } };
});
```

#### 8️⃣ Enviar respuesta al cliente

**Archivo:** `core/gateway/http.js:450` (aprox)

```javascript
// Preparar headers
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  ...finalResponse.headers
};

// Enviar respuesta
res.writeHead(finalResponse.statusCode || 200, headers);
res.end(JSON.stringify(finalResponse.body));

// Log de salida
const duration = Date.now() - startTime;
this.logger.info('http.request.completed', {
  method: req.method,
  path: pathname,
  status: finalResponse.statusCode,
  duration_ms: duration
});

// Métrica
this.metrics.histogram('http.request.duration', duration, {
  method: req.method,
  path: pathname,
  status: finalResponse.statusCode
});
```

#### 9️⃣ Cliente recibe la respuesta

```json
{
  "echo": {
    "message": "Hello World"
  },
  "receivedAt": "2025-10-20T10:30:00.000Z",
  "processedBy": "core-a"
}
```

---

## Cómo los Módulos Exponen APIs

### Paso 1: Definir APIs en `module.json`

**Archivo:** `modules/echo/module.json`

```json
{
  "name": "echo",
  "version": "1.0.0",
  "description": "Simple echo module for testing",
  "main": "index.js",
  "apis": [
    {
      "method": "GET",
      "path": "/ping",
      "handler": "handlePing",
      "description": "Health check endpoint"
    },
    {
      "method": "POST",
      "path": "/echo",
      "handler": "handleEcho",
      "description": "Echo back the request body"
    },
    {
      "method": "GET",
      "path": "/stats",
      "handler": "handleStats",
      "description": "Get module statistics"
    }
  ],
  "events": {
    "publishes": ["echo.ping", "echo.message"],
    "subscribes": []
  }
}
```

### Paso 2: Implementar Handlers en `index.js`

**Archivo:** `modules/echo/index.js`

```javascript
class EchoModule {
  constructor(core) {
    this.core = core;
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;
    this.hooks = core.hooks;

    // Estado interno del módulo
    this.requestCount = 0;
  }

  /**
   * Handler para GET /modules/echo/ping
   */
  async handlePing(request) {
    this.requestCount++;

    // Publicar evento
    await this.eventBus.publish('echo.ping', {
      timestamp: new Date().toISOString(),
      coreId: this.core.id
    });

    // Retornar respuesta
    return {
      statusCode: 200,
      body: {
        message: 'pong',
        timestamp: new Date().toISOString(),
        coreId: this.core.id
      }
    };
  }

  /**
   * Handler para POST /modules/echo/echo
   */
  async handleEcho(request) {
    this.requestCount++;

    // Validar input
    if (!request.body || !request.body.message) {
      return {
        statusCode: 400,
        body: {
          error: 'Missing required field: message'
        }
      };
    }

    const message = request.body.message;

    // Log
    this.logger.info('echo.message.received', {
      message,
      from: request.headers['x-forwarded-for'] || 'unknown'
    });

    // Publicar evento
    await this.eventBus.publish('echo.message', {
      message,
      timestamp: new Date().toISOString()
    });

    // Métrica
    this.metrics.increment('echo.messages.total');

    // Retornar respuesta
    return {
      statusCode: 200,
      body: {
        echo: message,
        receivedAt: new Date().toISOString(),
        processedBy: this.core.id,
        requestNumber: this.requestCount
      }
    };
  }

  /**
   * Handler para GET /modules/echo/stats
   */
  async handleStats(request) {
    return {
      statusCode: 200,
      body: {
        moduleName: 'echo',
        requestCount: this.requestCount,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };
  }

  // Lifecycle hooks
  async onLoad() {
    this.logger.info('echo.module.loaded');
  }

  async onUnload() {
    this.logger.info('echo.module.unloaded');
  }
}

module.exports = EchoModule;
```

### Paso 3: Module Loader Auto-registra las APIs

Cuando el sistema arranca:

1. Module Loader escanea `./modules/`
2. Encuentra `modules/echo/module.json`
3. Lee las APIs definidas
4. Carga `modules/echo/index.js`
5. Instancia `EchoModule` pasando el core context
6. HTTP Gateway registra rutas automáticamente:
   - `GET /modules/echo/ping` → `handlePing`
   - `POST /modules/echo/echo` → `handleEcho`
   - `GET /modules/echo/stats` → `handleStats`

**No hay configuración manual de rutas** - Todo es automático basado en el manifest.

---

## HTTP Gateway en Detalle

### Rutas Core (Built-in)

#### GET /health

Health check del core.

**Request:**
```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "healthy",
  "core_id": "core-a",
  "uptime": 123.45,
  "version": "0.1.0"
}
```

**Código:** `core/gateway/http.js:handleHealth()`

---

#### GET /stats

Estadísticas del core y módulos.

**Request:**
```bash
curl http://localhost:3000/stats
```

**Response:**
```json
{
  "core": {
    "id": "core-a",
    "uptime": 123.45,
    "memoryUsage": {
      "heapUsed": 25000000,
      "heapTotal": 50000000
    }
  },
  "modules": {
    "loaded": 3,
    "names": ["echo", "file-watcher", "security-p2p"]
  },
  "mqtt": {
    "connected": true,
    "usingEmbedded": true
  },
  "metrics": {
    "http.requests.total": 42,
    "events.published.total": 15
  }
}
```

**Código:** `core/gateway/http.js:handleStats()`

---

#### GET /modules

Lista de módulos cargados.

**Request:**
```bash
curl http://localhost:3000/modules
```

**Response:**
```json
{
  "modules": [
    {
      "name": "echo",
      "version": "1.0.0",
      "description": "Simple echo module",
      "apis": [
        {
          "method": "GET",
          "path": "/modules/echo/ping",
          "description": "Health check endpoint"
        },
        {
          "method": "POST",
          "path": "/modules/echo/echo",
          "description": "Echo back the request body"
        }
      ],
      "events": {
        "publishes": ["echo.ping", "echo.message"],
        "subscribes": []
      }
    },
    {
      "name": "file-watcher",
      "version": "1.0.0",
      "apis": [ ... ]
    }
  ]
}
```

**Código:** `core/gateway/http.js:handleModules()`

---

#### POST /events

Publicar un evento al Event Bus.

**Request:**
```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "user.created",
    "payload": {
      "userId": "12345",
      "email": "user@example.com"
    }
  }'
```

**Response:**
```json
{
  "status": "published",
  "topic": "user.created",
  "eventId": "evt_abc123",
  "timestamp": "2025-10-20T10:30:00.000Z"
}
```

**Código:** `core/gateway/http.js:handlePublishEvent()`

---

### CORS Support

El HTTP Gateway incluye soporte CORS completo:

```javascript
// OPTIONS preflight
if (req.method === 'OPTIONS') {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  });
  res.end();
  return;
}
```

Esto permite que browsers hagan peticiones desde cualquier origen.

---

## Hook System e Interceptación

Los módulos pueden interceptar **todas** las peticiones HTTP usando hooks.

### beforeRequest Hook

Se ejecuta **antes** de procesar la petición.

**Casos de uso:**
- Autenticación
- Autorización
- Rate limiting
- Validación de input
- Logging
- Request transformation

**Ejemplo:**
```javascript
// En un módulo de seguridad
class SecurityModule {
  constructor(core) {
    this.core = core;
    this.hooks = core.hooks;

    // Registrar hook
    this.hooks.register('beforeRequest', this.authenticate.bind(this));
  }

  async authenticate({ request, coreId }) {
    // Verificar si la ruta requiere auth
    const publicPaths = ['/health', '/modules/echo/ping'];

    if (publicPaths.includes(request.path)) {
      return { cancelled: false, data: { request } };
    }

    // Verificar token
    const token = request.headers.authorization;

    if (!token) {
      return {
        cancelled: true,
        statusCode: 401,
        response: {
          error: 'Unauthorized',
          message: 'Missing authorization token'
        }
      };
    }

    // Validar token
    try {
      const decoded = await this.verifyToken(token);

      // Añadir usuario a la request
      request.user = decoded;

      return { cancelled: false, data: { request } };

    } catch (error) {
      return {
        cancelled: true,
        statusCode: 401,
        response: {
          error: 'Unauthorized',
          message: 'Invalid token'
        }
      };
    }
  }
}
```

### afterResponse Hook

Se ejecuta **después** de procesar la petición.

**Casos de uso:**
- Añadir headers custom
- Response transformation
- Logging de respuestas
- Caching
- Compression

**Ejemplo:**
```javascript
class ObservabilityModule {
  constructor(core) {
    this.core = core;
    this.hooks = core.hooks;

    // Registrar hook
    this.hooks.register('afterResponse', this.addMetrics.bind(this));
  }

  async addMetrics({ request, response, coreId }) {
    // Añadir headers de observabilidad
    response.headers = {
      ...response.headers,
      'X-Core-ID': coreId,
      'X-Request-ID': request.id,
      'X-Response-Time': `${Date.now() - request.startTime}ms`
    };

    // Log detallado
    this.core.logger.info('http.response.sent', {
      method: request.method,
      path: request.path,
      status: response.statusCode,
      duration: Date.now() - request.startTime,
      userAgent: request.headers['user-agent']
    });

    return { data: { response } };
  }
}
```

---

## Ejemplos Prácticos

### Ejemplo 1: Módulo Simple (Echo)

Ya lo vimos arriba, pero resumido:

1. Define APIs en `module.json`
2. Implementa handlers en `index.js`
3. Sistema lo auto-registra
4. Clientes pueden llamar `/modules/echo/ping`

### Ejemplo 2: Módulo con Estado (File Watcher)

**module.json:**
```json
{
  "name": "file-watcher",
  "apis": [
    {
      "method": "POST",
      "path": "/watch",
      "handler": "handleWatch"
    },
    {
      "method": "POST",
      "path": "/unwatch",
      "handler": "handleUnwatch"
    },
    {
      "method": "GET",
      "path": "/list",
      "handler": "handleList"
    }
  ]
}
```

**index.js:**
```javascript
class FileWatcherModule {
  constructor(core) {
    this.core = core;
    this.watchers = new Map(); // Estado: path → watcher
  }

  async handleWatch(request) {
    const { path } = request.body;

    if (!path) {
      return {
        statusCode: 400,
        body: { error: 'Missing path' }
      };
    }

    if (this.watchers.has(path)) {
      return {
        statusCode: 409,
        body: { error: 'Already watching this path' }
      };
    }

    // Crear watcher
    const watcher = fs.watch(path, (event, filename) => {
      this.core.eventBus.publish('file.changed', {
        path,
        event,
        filename
      });
    });

    this.watchers.set(path, watcher);

    return {
      statusCode: 200,
      body: {
        message: 'Watching started',
        path,
        totalWatchers: this.watchers.size
      }
    };
  }

  async handleUnwatch(request) {
    const { path } = request.body;

    const watcher = this.watchers.get(path);

    if (!watcher) {
      return {
        statusCode: 404,
        body: { error: 'Not watching this path' }
      };
    }

    watcher.close();
    this.watchers.delete(path);

    return {
      statusCode: 200,
      body: {
        message: 'Watching stopped',
        path
      }
    };
  }

  async handleList(request) {
    return {
      statusCode: 200,
      body: {
        watchers: Array.from(this.watchers.keys()),
        count: this.watchers.size
      }
    };
  }
}
```

**Uso:**
```bash
# Empezar a vigilar un directorio
curl -X POST http://localhost:3000/modules/file-watcher/watch \
  -H "Content-Type: application/json" \
  -d '{"path": "/tmp/mydir"}'

# Listar watches activos
curl http://localhost:3000/modules/file-watcher/list

# Dejar de vigilar
curl -X POST http://localhost:3000/modules/file-watcher/unwatch \
  -H "Content-Type: application/json" \
  -d '{"path": "/tmp/mydir"}'
```

### Ejemplo 3: Módulo con Dependencias (Database)

```javascript
class DatabaseModule {
  constructor(core) {
    this.core = core;
    this.db = null;
  }

  async onLoad() {
    // Conectar a DB al cargar
    this.db = await connectToDatabase();
    this.core.logger.info('database.connected');
  }

  async handleQuery(request) {
    const { sql, params } = request.body;

    try {
      const results = await this.db.query(sql, params);

      return {
        statusCode: 200,
        body: {
          results,
          rowCount: results.length
        }
      };
    } catch (error) {
      this.core.logger.error('database.query.error', { error: error.message });

      return {
        statusCode: 500,
        body: {
          error: 'Query failed',
          details: error.message
        }
      };
    }
  }

  async onUnload() {
    // Cerrar conexión al descargar
    if (this.db) {
      await this.db.close();
      this.core.logger.info('database.disconnected');
    }
  }
}
```

---

## Testing de APIs

### Test Unitario de un Handler

```javascript
// tests/unit/echo-module.test.js
const EchoModule = require('../../modules/echo');

// Mock del core
const mockCore = {
  id: 'test-core',
  logger: {
    info: () => {},
    error: () => {}
  },
  eventBus: {
    publish: async () => {}
  },
  metrics: {
    increment: () => {}
  },
  hooks: {
    register: () => {}
  }
};

const echoModule = new EchoModule(mockCore);

// Test: handlePing
const request = {
  method: 'GET',
  path: '/ping',
  headers: {},
  query: {},
  body: null
};

const response = await echoModule.handlePing(request);

assert(response.statusCode === 200);
assert(response.body.message === 'pong');
```

### Test de Integración (HTTP completo)

```javascript
// tests/integration/api.test.js
const http = require('http');

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: JSON.parse(data)
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test: GET /health
const healthResponse = await makeRequest('GET', '/health');
assert(healthResponse.statusCode === 200);
assert(healthResponse.body.status === 'healthy');

// Test: POST /modules/echo/echo
const echoResponse = await makeRequest('POST', '/modules/echo/echo', {
  message: 'test'
});
assert(echoResponse.statusCode === 200);
assert(echoResponse.body.echo === 'test');
```

---

## Mejores Prácticas

### 1. Validación de Input

Siempre valida el input antes de procesarlo:

```javascript
async handleCreate(request) {
  // Validar campos requeridos
  const { name, email } = request.body;

  if (!name || !email) {
    return {
      statusCode: 400,
      body: {
        error: 'Validation failed',
        missing: [
          !name && 'name',
          !email && 'email'
        ].filter(Boolean)
      }
    };
  }

  // Validar formato
  if (!email.includes('@')) {
    return {
      statusCode: 400,
      body: {
        error: 'Invalid email format'
      }
    };
  }

  // Procesar...
}
```

### 2. Manejo de Errores

Usa try/catch y retorna errores apropiados:

```javascript
async handleOperation(request) {
  try {
    const result = await this.doSomethingDangerous();

    return {
      statusCode: 200,
      body: { result }
    };

  } catch (error) {
    this.core.logger.error('operation.failed', {
      error: error.message,
      stack: error.stack
    });

    return {
      statusCode: 500,
      body: {
        error: 'Operation failed',
        message: error.message,
        // NO incluir stack trace en producción
        ...(process.env.NODE_ENV === 'development' && {
          stack: error.stack
        })
      }
    };
  }
}
```

### 3. Logging Estructurado

Usa el logger del core para trazabilidad:

```javascript
async handleRequest(request) {
  this.core.logger.info('operation.started', {
    operation: 'handleRequest',
    userId: request.user?.id,
    requestId: request.id
  });

  // ... procesar

  this.core.logger.info('operation.completed', {
    operation: 'handleRequest',
    duration: Date.now() - startTime
  });
}
```

### 4. Métricas

Registra métricas para observabilidad:

```javascript
async handleRequest(request) {
  const startTime = Date.now();

  try {
    // ... procesar

    this.core.metrics.increment('requests.success');
    this.core.metrics.histogram('request.duration', Date.now() - startTime);

  } catch (error) {
    this.core.metrics.increment('requests.failed');
    throw error;
  }
}
```

### 5. Publicar Eventos

Publica eventos para que otros módulos reaccionen:

```javascript
async handleUserCreated(request) {
  const user = await this.createUser(request.body);

  // Publicar evento
  await this.core.eventBus.publish('user.created', {
    userId: user.id,
    email: user.email,
    createdAt: new Date().toISOString()
  });

  return {
    statusCode: 201,
    body: { user }
  };
}
```

### 6. Versionado de APIs

Incluye versión en el path o headers:

```json
{
  "apis": [
    {
      "method": "GET",
      "path": "/v1/users",
      "handler": "handleListUsersV1"
    },
    {
      "method": "GET",
      "path": "/v2/users",
      "handler": "handleListUsersV2"
    }
  ]
}
```

### 7. Documentación

Documenta tus APIs en el manifest:

```json
{
  "apis": [
    {
      "method": "POST",
      "path": "/users",
      "handler": "handleCreateUser",
      "description": "Create a new user",
      "request": {
        "body": {
          "name": "string (required)",
          "email": "string (required)",
          "age": "number (optional)"
        }
      },
      "response": {
        "statusCode": 201,
        "body": {
          "user": "User object",
          "id": "string"
        }
      }
    }
  ]
}
```

---

## Resumen

### Flujo Completo:

1. **Cliente** hace petición HTTP
2. **HTTP Gateway** recibe y parsea
3. **Hook beforeRequest** se ejecuta (auth, validación)
4. **Routing** identifica el handler correcto
5. **Module Handler** ejecuta lógica de negocio
6. **Hook afterResponse** se ejecuta (headers, logging)
7. **HTTP Gateway** envía respuesta al cliente

### Componentes Clave:

- **HTTP Gateway** - Servidor HTTP central
- **Module Loader** - Auto-registra rutas de módulos
- **Módulos** - Implementan lógica y exponen APIs
- **Hook System** - Intercepta antes/después

### Ventajas del Sistema:

✅ **Modular** - Cada módulo define sus propias APIs
✅ **Auto-registro** - Sin configuración manual de rutas
✅ **Extensible** - Hooks permiten interceptar todo
✅ **Observable** - Logging y métricas integrados
✅ **Testeable** - Handlers son funciones simples

---

**Siguiente lectura recomendada:**
- `docs/MODULE_DEVELOPMENT.md` - Cómo crear módulos
- `docs/EVENT_SYSTEM.md` - Sistema de eventos
- `docs/HOOK_SYSTEM.md` - Sistema de hooks
