# Diagrama de Flujo - Sistema de APIs

**Fecha:** 2025-10-20
**Versión:** v0.1.0

Este documento muestra el flujo **exacto** de una petición HTTP con referencias al código real.

---

## 📊 Diagrama Visual Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENTE                                │
│  curl -X POST http://localhost:3000/modules/echo/echo \         │
│    -d '{"message": "Hello"}'                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP POST Request
                         │
                         ▼
╔═════════════════════════════════════════════════════════════════╗
║  PASO 1: HTTP Server Recibe Request                            ║
║  📄 core/gateway/http.js:79-81                                  ║
╚═════════════════════════════════════════════════════════════════╝

  this.server = http.createServer(async (req, res) => {
    await this.handleRequest(req, res);  ← ¡AQUÍ EMPIEZA TODO!
  });

                         │
                         ▼
╔═════════════════════════════════════════════════════════════════╗
║  PASO 2: handleRequest - Parse URL y Body                      ║
║  📄 core/gateway/http.js:125-170                                ║
╚═════════════════════════════════════════════════════════════════╝

  async handleRequest(req, res) {
    const startTime = Date.now();

    // 2.1 Parsear URL
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;  // "/modules/echo/echo"

    // 2.2 Leer body (si existe)
    let body = '';
    req.on('data', chunk => body += chunk);
    await new Promise(resolve => req.on('end', resolve));

    const parsedBody = body ? JSON.parse(body) : null;
    // parsedBody = { "message": "Hello" }

    // 2.3 Log de entrada
    this.logger.info('http.request.received', {
      method: req.method,      // "POST"
      path: pathname,          // "/modules/echo/echo"
      core_id: this.coreId
    });

                         │
                         ▼
╔═════════════════════════════════════════════════════════════════╗
║  PASO 3: CORS - Handle OPTIONS                                 ║
║  📄 core/gateway/http.js:172-182                                ║
╚═════════════════════════════════════════════════════════════════╝

  // Si es OPTIONS (preflight), responder inmediatamente
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

                         │
                         ▼
╔═════════════════════════════════════════════════════════════════╗
║  PASO 4: Ejecutar Hook "beforeRequest"                         ║
║  📄 core/gateway/http.js:184-210                                ║
╚═════════════════════════════════════════════════════════════════╝

  // 4.1 Crear objeto request normalizado
  const request = {
    method: req.method,           // "POST"
    path: pathname,               // "/modules/echo/echo"
    query: parsedUrl.query,       // {}
    headers: req.headers,         // { "content-type": "application/json" }
    body: parsedBody,             // { "message": "Hello" }
    timestamp: Date.now(),
    requestId: generateId()
  };

  // 4.2 Ejecutar hook beforeRequest
  let hookResult = { cancelled: false, data: { request } };

  if (this.hooks) {
    hookResult = await this.hooks.execute('beforeRequest', {
      request,
      coreId: this.coreId
    });
  }

  // 4.3 Si el hook canceló, retornar inmediatamente
  if (hookResult.cancelled) {
    res.writeHead(hookResult.statusCode || 403, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify(hookResult.response));
    return;  // ← ¡Sale aquí si el hook rechaza!
  }

  // 4.4 Obtener request (posiblemente modificada por hook)
  const finalRequest = hookResult.data.request;

                         │
                         ▼
╔═════════════════════════════════════════════════════════════════╗
║  PASO 5: Routing - ¿Qué handler usar?                          ║
║  📄 core/gateway/http.js:212-250                                ║
╚═════════════════════════════════════════════════════════════════╝

  let response;

  // 5.1 Rutas CORE (built-in)
  if (pathname === '/health') {
    response = this.handleHealth();
  }
  else if (pathname === '/stats') {
    response = this.handleStats();
  }
  else if (pathname === '/modules') {
    response = this.handleModulesList();
  }
  else if (pathname === '/events' && req.method === 'POST') {
    response = await this.handlePublishEvent(finalRequest);
  }

  // 5.2 Rutas de MÓDULOS: /modules/{name}/{path}
  else if (pathname.startsWith('/modules/')) {
    response = await this.handleModuleRequest(finalRequest);
    // ← ¡NUESTRA PETICIÓN VA AQUÍ!
  }

  // 5.3 404 - Not Found
  else {
    response = {
      statusCode: 404,
      body: { error: 'Not found', path: pathname }
    };
  }

                         │
                         ▼
╔═════════════════════════════════════════════════════════════════╗
║  PASO 6: handleModuleRequest - Parsear ruta del módulo         ║
║  📄 core/gateway/http.js:320-380                                ║
╚═════════════════════════════════════════════════════════════════╝

  async handleModuleRequest(request) {
    // 6.1 Parsear: /modules/{moduleName}/{path}
    const parts = request.path.split('/').filter(p => p);
    // parts = ["modules", "echo", "echo"]

    const moduleName = parts[1];        // "echo"
    const modulePath = '/' + parts.slice(2).join('/');  // "/echo"

    // 6.2 Obtener módulo del registry
    const moduleInfo = this.registry.getModule(moduleName);

    if (!moduleInfo) {
      return {
        statusCode: 404,
        body: {
          error: `Module '${moduleName}' not found`,
          availableModules: this.registry.listModules()
        }
      };
    }

    // 6.3 Buscar API en el manifest
    const api = moduleInfo.manifest.apis.find(api =>
      api.method === request.method && api.path === modulePath
    );
    // api = {
    //   method: "POST",
    //   path: "/echo",
    //   handler: "handleEcho",
    //   description: "Echo back the request body"
    // }

    if (!api) {
      return {
        statusCode: 404,
        body: {
          error: `API '${request.method} ${modulePath}' not found`,
          availableApis: moduleInfo.manifest.apis.map(a =>
            `${a.method} ${a.path}`
          )
        }
      };
    }

                         │
                         ▼
╔═════════════════════════════════════════════════════════════════╗
║  PASO 7: Invocar Handler del Módulo                            ║
║  📄 core/gateway/http.js:382-410                                ║
╚═════════════════════════════════════════════════════════════════╝

    // 7.1 Obtener handler del módulo
    const handlerName = api.handler;  // "handleEcho"
    const handler = moduleInfo.instance[handlerName];

    if (!handler || typeof handler !== 'function') {
      return {
        statusCode: 500,
        body: {
          error: `Handler '${handlerName}' not found or not a function`
        }
      };
    }

    // 7.2 EJECUTAR EL HANDLER ← ¡AQUÍ SE EJECUTA LA LÓGICA!
    try {
      this.logger.info('gateway.module.handler.invoke', {
        module: moduleName,
        handler: handlerName,
        method: request.method,
        path: modulePath
      });

      const result = await handler.call(moduleInfo.instance, request);
      // ← ¡Llama a modules/echo/index.js:handleEcho()!

      return result;

    } catch (error) {
      this.logger.error('gateway.module.handler.error', {
        module: moduleName,
        handler: handlerName,
        error: error.message,
        stack: error.stack
      });

      return {
        statusCode: 500,
        body: {
          error: 'Handler execution failed',
          message: error.message
        }
      };
    }
  }

                         │
                         ▼
╔═════════════════════════════════════════════════════════════════╗
║  PASO 8: Handler del Módulo Ejecuta Lógica                     ║
║  📄 modules/echo/index.js:50-75                                 ║
╚═════════════════════════════════════════════════════════════════╝

  // En modules/echo/index.js
  class EchoModule {

    async handleEcho(request) {
      // 8.1 Extraer datos
      const input = request.body;  // { "message": "Hello" }

      // 8.2 Validar
      if (!input || !input.message) {
        return {
          statusCode: 400,
          body: { error: 'Missing field: message' }
        };
      }

      // 8.3 Log
      this.logger.info('echo.message.received', {
        message: input.message
      });

      // 8.4 Publicar evento
      await this.eventBus.publish('echo.message', {
        message: input.message,
        timestamp: new Date().toISOString()
      });

      // 8.5 Métrica
      this.metrics.increment('echo.messages.total');

      // 8.6 Retornar respuesta
      return {
        statusCode: 200,
        body: {
          echo: input.message,
          receivedAt: new Date().toISOString(),
          processedBy: this.core.id
        }
      };
    }
  }

  // La respuesta retorna al PASO 7 ↑

                         │
                         ▼
╔═════════════════════════════════════════════════════════════════╗
║  PASO 9: Ejecutar Hook "afterResponse"                         ║
║  📄 core/gateway/http.js:252-270                                ║
╚═════════════════════════════════════════════════════════════════╝

  // 9.1 Ejecutar hook afterResponse
  if (this.hooks) {
    const afterHookResult = await this.hooks.execute('afterResponse', {
      request: finalRequest,
      response: response,
      coreId: this.coreId
    });

    // 9.2 Hook puede modificar la respuesta
    response = afterHookResult.data.response;
  }

  // Ejemplo: Hook añade headers custom
  // response.headers = {
  //   ...response.headers,
  //   'X-Core-ID': 'core-a',
  //   'X-Response-Time': '15ms'
  // }

                         │
                         ▼
╔═════════════════════════════════════════════════════════════════╗
║  PASO 10: Enviar Respuesta HTTP al Cliente                     ║
║  📄 core/gateway/http.js:272-300                                ║
╚═════════════════════════════════════════════════════════════════╝

  // 10.1 Preparar headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...response.headers
  };

  // 10.2 Enviar respuesta
  res.writeHead(response.statusCode || 200, headers);
  res.end(JSON.stringify(response.body));

  // 10.3 Actualizar estadísticas
  this.stats.requests++;
  this.stats.by_method[req.method] =
    (this.stats.by_method[req.method] || 0) + 1;
  this.stats.by_status[response.statusCode] =
    (this.stats.by_status[response.statusCode] || 0) + 1;

  // 10.4 Log de salida
  const duration = Date.now() - startTime;
  this.logger.info('http.request.completed', {
    method: req.method,
    path: pathname,
    status: response.statusCode,
    duration_ms: duration
  });

  // 10.5 Métrica de duración
  this.metrics.histogram('http.request.duration', duration, {
    method: req.method,
    path: pathname,
    status: response.statusCode
  });

  }  // ← Fin de handleRequest

                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENTE RECIBE RESPUESTA                     │
│                                                                 │
│  HTTP/1.1 200 OK                                               │
│  Content-Type: application/json                                │
│  X-Core-ID: core-a                                             │
│  X-Response-Time: 15ms                                         │
│                                                                 │
│  {                                                              │
│    "echo": "Hello",                                            │
│    "receivedAt": "2025-10-20T10:30:00.000Z",                   │
│    "processedBy": "core-a"                                     │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Resumen del Flujo (10 Pasos)

| # | Paso | Archivo | Descripción |
|---|------|---------|-------------|
| 1 | HTTP Server | `core/gateway/http.js:79` | Node.js http server recibe request |
| 2 | Parse Request | `core/gateway/http.js:125` | Parsea URL, query, headers, body |
| 3 | CORS Check | `core/gateway/http.js:172` | Maneja OPTIONS preflight |
| 4 | beforeRequest Hook | `core/gateway/http.js:184` | Intercepta ANTES (auth, validación) |
| 5 | Routing | `core/gateway/http.js:212` | Decide qué handler ejecutar |
| 6 | Module Routing | `core/gateway/http.js:320` | Parsea ruta de módulo y busca API |
| 7 | Invoke Handler | `core/gateway/http.js:382` | Llama al handler del módulo |
| 8 | Execute Logic | `modules/*/index.js` | El módulo procesa la request |
| 9 | afterResponse Hook | `core/gateway/http.js:252` | Intercepta DESPUÉS (headers, logging) |
| 10 | Send Response | `core/gateway/http.js:272` | Envía respuesta HTTP al cliente |

---

## 🔍 Ejemplo Real con Trazas

Corramos una petición real y veamos las trazas:

```bash
curl -X POST http://localhost:3000/modules/echo/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello World"}'
```

**Logs generados (en orden):**

```json
// PASO 2: Request recibida
{
  "level": "info",
  "event": "http.request.received",
  "method": "POST",
  "path": "/modules/echo/echo",
  "core_id": "core-a",
  "timestamp": "2025-10-20T10:30:00.000Z"
}

// PASO 4: Hook beforeRequest
{
  "level": "debug",
  "event": "hooks.execute.start",
  "hook": "beforeRequest",
  "timestamp": "2025-10-20T10:30:00.001Z"
}

// PASO 7: Invocando handler
{
  "level": "info",
  "event": "gateway.module.handler.invoke",
  "module": "echo",
  "handler": "handleEcho",
  "method": "POST",
  "path": "/echo",
  "timestamp": "2025-10-20T10:30:00.002Z"
}

// PASO 8: Handler del módulo logea
{
  "level": "info",
  "event": "echo.message.received",
  "message": "Hello World",
  "timestamp": "2025-10-20T10:30:00.003Z"
}

// PASO 8: Evento publicado
{
  "level": "info",
  "event": "eventbus.publish",
  "topic": "echo.message",
  "payload": {
    "message": "Hello World",
    "timestamp": "2025-10-20T10:30:00.003Z"
  },
  "timestamp": "2025-10-20T10:30:00.003Z"
}

// PASO 9: Hook afterResponse
{
  "level": "debug",
  "event": "hooks.execute.start",
  "hook": "afterResponse",
  "timestamp": "2025-10-20T10:30:00.004Z"
}

// PASO 10: Request completada
{
  "level": "info",
  "event": "http.request.completed",
  "method": "POST",
  "path": "/modules/echo/echo",
  "status": 200,
  "duration_ms": 15,
  "timestamp": "2025-10-20T10:30:00.015Z"
}
```

**Métricas generadas:**

```
http.request.duration{method="POST",path="/modules/echo/echo",status=200} = 15ms
echo.messages.total = 1
```

---

## 📝 Referencias al Código

### HTTP Gateway Completo
- **Archivo:** `core/gateway/http.js` (460 líneas)
- **Constructor:** Línea 40
- **start():** Línea 74
- **handleRequest():** Línea 125
- **handleModuleRequest():** Línea 320

### Module Loader
- **Archivo:** `core/modules/loader.js` (320 líneas)
- **loadAll():** Línea 80
- **loadModule():** Línea 120
- **getModule():** Línea 250

### Echo Module (Ejemplo)
- **Archivo:** `modules/echo/index.js` (150 líneas)
- **handlePing():** Línea 30
- **handleEcho():** Línea 50
- **handleStats():** Línea 90

### Hook System
- **Archivo:** `core/hooks.js` (200 líneas)
- **register():** Línea 40
- **execute():** Línea 80

---

## 🎨 Diagrama Simplificado (Vista de Alto Nivel)

```
Cliente
   │
   ▼
┌──────────────────┐
│  HTTP Gateway    │  Recibe HTTP, parsea, CORS
│  (Paso 1-3)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  beforeRequest   │  Hooks de validación/auth
│  Hook (Paso 4)   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Routing         │  Decide handler (core vs módulo)
│  (Paso 5-6)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Module Handler  │  Ejecuta lógica de negocio
│  (Paso 7-8)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  afterResponse   │  Hooks de post-procesamiento
│  Hook (Paso 9)   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Send Response   │  Envía JSON al cliente
│  (Paso 10)       │
└──────────────────┘
```

---

**Siguiente:** Lee `docs/API_SYSTEM.md` para documentación completa y ejemplos.
