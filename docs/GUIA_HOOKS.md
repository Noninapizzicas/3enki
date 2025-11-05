# Guía Completa: Hooks para Autenticación e Interceptación

**Nivel:** Intermedio → Avanzado
**Tiempo:** 20-30 minutos
**Fecha:** 2025-10-20

Los Hooks permiten interceptar y modificar el flujo de peticiones HTTP antes y después del procesamiento.

---

## 📋 Tabla de Contenidos

1. [¿Qué son los Hooks?](#qué-son-los-hooks)
2. [Tipos de Hooks](#tipos-de-hooks)
3. [Ejemplo 1: Autenticación con JWT](#ejemplo-1-autenticación-con-jwt)
4. [Ejemplo 2: Rate Limiting](#ejemplo-2-rate-limiting)
5. [Ejemplo 3: Request Logging](#ejemplo-3-request-logging)
6. [Ejemplo 4: CORS Avanzado](#ejemplo-4-cors-avanzado)
7. [Ejemplo 5: Request Validation](#ejemplo-5-request-validation)
8. [Best Practices](#best-practices)

---

## ¿Qué son los Hooks?

Los **Hooks** son puntos de interceptación que permiten ejecutar código:

- **ANTES** de que se procese una petición (`beforeRequest`)
- **DESPUÉS** de que se genere la respuesta (`afterResponse`)

### Casos de Uso Comunes:

✅ **Autenticación** - Verificar tokens, validar usuarios
✅ **Autorización** - Verificar permisos según roles
✅ **Rate Limiting** - Limitar peticiones por IP/usuario
✅ **Logging** - Registrar todas las peticiones
✅ **Validación** - Validar schemas de request/response
✅ **CORS** - Manejar CORS de forma avanzada
✅ **Caching** - Implementar cache de respuestas
✅ **Transformación** - Modificar requests/responses

---

## Tipos de Hooks

### beforeRequest

Se ejecuta **ANTES** de procesar la petición.

**Puede:**
- ✅ Leer y modificar la request
- ✅ Cancelar la petición (retornar error)
- ✅ Añadir datos a la request (ej: usuario autenticado)

**Archivo:** `core/hooks.js`
**Registro:** Cualquier módulo puede registrar hooks en `onLoad()`

```javascript
this.hooks.register('beforeRequest', async ({ request, coreId }) => {
  // request = {
  //   method: "GET",
  //   path: "/api/users",
  //   headers: {...},
  //   query: {...},
  //   body: {...}
  // }

  // Opción 1: Dejar pasar (sin modificar)
  return { cancelled: false, data: { request } };

  // Opción 2: Modificar request
  request.customField = 'value';
  return { cancelled: false, data: { request } };

  // Opción 3: Cancelar (retornar error)
  return {
    cancelled: true,
    statusCode: 401,
    response: { error: 'Unauthorized' }
  };
});
```

### afterResponse

Se ejecuta **DESPUÉS** de procesar la petición.

**Puede:**
- ✅ Leer y modificar la response
- ✅ Añadir headers
- ✅ Logging de respuestas
- ✅ Transformar el body

**NO puede:** Cancelar la petición (ya se procesó)

```javascript
this.hooks.register('afterResponse', async ({ request, response, coreId }) => {
  // response = {
  //   statusCode: 200,
  //   body: {...},
  //   headers: {...}
  // }

  // Añadir headers custom
  response.headers = {
    ...response.headers,
    'X-Core-ID': coreId,
    'X-Response-Time': '15ms'
  };

  return { data: { response } };
});
```

---

## Ejemplo 1: Autenticación con JWT

Vamos a crear un módulo completo de autenticación usando hooks.

### Paso 1: Crear Módulo de Autenticación

```bash
mkdir -p modules/auth
cd modules/auth
```

### Paso 2: `module.json`

```json
{
  "name": "auth",
  "version": "1.0.0",
  "description": "JWT authentication module",
  "main": "index.js",
  "apis": [
    {
      "method": "POST",
      "path": "/login",
      "handler": "handleLogin",
      "description": "Login and get JWT token"
    },
    {
      "method": "POST",
      "path": "/verify",
      "handler": "handleVerify",
      "description": "Verify a JWT token"
    },
    {
      "method": "GET",
      "path": "/me",
      "handler": "handleGetCurrentUser",
      "description": "Get current authenticated user"
    }
  ],
  "events": {
    "publishes": ["auth.login", "auth.logout", "auth.failed"],
    "subscribes": []
  }
}
```

### Paso 3: `index.js` (Implementación Completa)

```javascript
/**
 * Auth Module - JWT Authentication
 *
 * Features:
 * - JWT token generation
 * - Token verification via hook
 * - Auto-injection of user in request
 * - Configurable protected routes
 */

const crypto = require('crypto');

class AuthModule {
  constructor(core) {
    this.core = core;
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;
    this.hooks = core.hooks;

    // Estado
    this.users = new Map();
    this.tokens = new Map(); // token → { userId, expiresAt }

    // Configuración
    this.config = {
      tokenExpiry: 3600000, // 1 hora
      secret: 'my-super-secret-key',

      // Rutas públicas (no requieren auth)
      publicPaths: [
        '/health',
        '/stats',
        '/modules',
        '/modules/auth/login',
        '/modules/auth/verify',
        '/modules/echo/ping'
      ]
    };
  }

  async onLoad() {
    this.logger.info('auth.module.loaded');

    // Registrar hook de autenticación GLOBAL
    this.hooks.register('beforeRequest', this.authenticateRequest.bind(this));

    // Crear usuario de prueba
    this.users.set(1, {
      id: 1,
      email: 'admin@example.com',
      password: this.hashPassword('admin123'),
      name: 'Admin User',
      role: 'admin'
    });

    this.users.set(2, {
      id: 2,
      email: 'user@example.com',
      password: this.hashPassword('user123'),
      name: 'Regular User',
      role: 'user'
    });
  }

  /**
   * HOOK: beforeRequest
   *
   * Este hook se ejecuta en TODAS las peticiones HTTP
   * Verifica el token JWT y añade el usuario a la request
   */
  async authenticateRequest({ request, coreId }) {
    // 1. Verificar si la ruta es pública
    if (this.isPublicPath(request.path)) {
      // Ruta pública, dejar pasar sin autenticación
      return { cancelled: false, data: { request } };
    }

    // 2. Extraer token del header Authorization
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      this.logger.warn('auth.missing_token', {
        path: request.path,
        method: request.method
      });

      this.metrics.increment('auth.failed.missing_token');

      await this.eventBus.publish('auth.failed', {
        reason: 'missing_token',
        path: request.path
      });

      return {
        cancelled: true,
        statusCode: 401,
        response: {
          error: 'Unauthorized',
          message: 'Missing authorization header',
          hint: 'Use: Authorization: Bearer <token>'
        }
      };
    }

    // 3. Parsear token
    if (!authHeader.startsWith('Bearer ')) {
      return {
        cancelled: true,
        statusCode: 401,
        response: {
          error: 'Unauthorized',
          message: 'Invalid authorization format',
          hint: 'Use: Authorization: Bearer <token>'
        }
      };
    }

    const token = authHeader.substring(7);

    // 4. Verificar token
    const tokenData = this.tokens.get(token);

    if (!tokenData) {
      this.logger.warn('auth.invalid_token', {
        path: request.path
      });

      this.metrics.increment('auth.failed.invalid_token');

      return {
        cancelled: true,
        statusCode: 401,
        response: {
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        }
      };
    }

    // 5. Verificar expiración
    if (Date.now() > tokenData.expiresAt) {
      this.tokens.delete(token);

      this.logger.warn('auth.token_expired', {
        userId: tokenData.userId
      });

      return {
        cancelled: true,
        statusCode: 401,
        response: {
          error: 'Unauthorized',
          message: 'Token expired',
          expiredAt: new Date(tokenData.expiresAt).toISOString()
        }
      };
    }

    // 6. Obtener usuario
    const user = this.users.get(tokenData.userId);

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

    // 7. INYECTAR usuario en la request
    // Ahora TODOS los handlers pueden acceder a request.user
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    this.logger.debug('auth.authenticated', {
      userId: user.id,
      email: user.email,
      path: request.path
    });

    this.metrics.increment('auth.success');

    // 8. Continuar con la petición
    return { cancelled: false, data: { request } };
  }

  /**
   * Helper: Verificar si path es público
   */
  isPublicPath(path) {
    return this.config.publicPaths.some(publicPath => {
      if (publicPath.endsWith('*')) {
        // Wildcard: /api/* matches /api/anything
        const prefix = publicPath.slice(0, -1);
        return path.startsWith(prefix);
      }
      return path === publicPath;
    });
  }

  /**
   * Helper: Hash password
   */
  hashPassword(password) {
    return crypto
      .createHash('sha256')
      .update(password + this.config.secret)
      .digest('hex');
  }

  /**
   * Helper: Generate token
   */
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * API: POST /modules/auth/login
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
      this.logger.warn('auth.login.failed', {
        email,
        reason: 'user_not_found'
      });

      this.metrics.increment('auth.login.failed');

      await this.eventBus.publish('auth.failed', {
        reason: 'invalid_credentials',
        email
      });

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

    if (passwordHash !== user.password) {
      this.logger.warn('auth.login.failed', {
        email,
        reason: 'wrong_password'
      });

      this.metrics.increment('auth.login.failed');

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
    const expiresAt = Date.now() + this.config.tokenExpiry;

    this.tokens.set(token, {
      userId: user.id,
      expiresAt
    });

    // Log
    this.logger.info('auth.login.success', {
      userId: user.id,
      email: user.email
    });

    // Evento
    await this.eventBus.publish('auth.login', {
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString()
    });

    // Métrica
    this.metrics.increment('auth.login.success');

    return {
      statusCode: 200,
      body: {
        token,
        expiresAt: new Date(expiresAt).toISOString(),
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
   * API: POST /modules/auth/verify
   */
  async handleVerify(request) {
    const { token } = request.body;

    if (!token) {
      return {
        statusCode: 400,
        body: {
          error: 'Validation failed',
          message: 'Token is required'
        }
      };
    }

    const tokenData = this.tokens.get(token);

    if (!tokenData) {
      return {
        statusCode: 401,
        body: {
          valid: false,
          message: 'Invalid token'
        }
      };
    }

    if (Date.now() > tokenData.expiresAt) {
      return {
        statusCode: 401,
        body: {
          valid: false,
          message: 'Token expired'
        }
      };
    }

    const user = this.users.get(tokenData.userId);

    return {
      statusCode: 200,
      body: {
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        expiresAt: new Date(tokenData.expiresAt).toISOString()
      }
    };
  }

  /**
   * API: GET /modules/auth/me
   *
   * Requiere autenticación (el hook ya lo validó)
   * request.user está disponible gracias al hook
   */
  async handleGetCurrentUser(request) {
    // El hook beforeRequest ya validó el token
    // y añadió request.user

    return {
      statusCode: 200,
      body: {
        user: request.user
      }
    };
  }
}

module.exports = AuthModule;
```

### Paso 4: Probar Autenticación

```bash
# 1. Login (obtener token)
TOKEN=$(curl -s -X POST http://localhost:3000/modules/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "admin123"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token: $TOKEN"

# 2. Acceder a ruta pública (sin token) ✅
curl http://localhost:3000/modules/echo/ping

# 3. Intentar acceder a ruta protegida SIN token ❌
curl http://localhost:3000/modules/auth/me
# → 401 Unauthorized

# 4. Acceder a ruta protegida CON token ✅
curl http://localhost:3000/modules/auth/me \
  -H "Authorization: Bearer $TOKEN"
# → 200 OK con datos del usuario

# 5. Verificar token
curl -X POST http://localhost:3000/modules/auth/verify \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$TOKEN\"}"
```

---

## Ejemplo 2: Rate Limiting

Limitar peticiones por IP o por usuario.

```javascript
class RateLimitModule {
  constructor(core) {
    this.core = core;
    this.hooks = core.hooks;

    // IP → { count, resetAt }
    this.limits = new Map();

    this.config = {
      maxRequests: 100,    // 100 requests
      windowMs: 60000      // por minuto
    };
  }

  async onLoad() {
    this.hooks.register('beforeRequest', this.checkRateLimit.bind(this));

    // Limpiar límites expirados cada minuto
    setInterval(() => this.cleanup(), 60000);
  }

  async checkRateLimit({ request, coreId }) {
    const ip = request.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();

    // Obtener límite actual
    let limit = this.limits.get(ip);

    if (!limit || now > limit.resetAt) {
      // Crear nuevo límite
      limit = {
        count: 0,
        resetAt: now + this.config.windowMs
      };
      this.limits.set(ip, limit);
    }

    // Incrementar contador
    limit.count++;

    // Verificar si excedió el límite
    if (limit.count > this.config.maxRequests) {
      const resetIn = Math.ceil((limit.resetAt - now) / 1000);

      this.core.logger.warn('ratelimit.exceeded', {
        ip,
        count: limit.count,
        max: this.config.maxRequests
      });

      return {
        cancelled: true,
        statusCode: 429,
        response: {
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${resetIn} seconds`,
          limit: {
            max: this.config.maxRequests,
            remaining: 0,
            resetAt: new Date(limit.resetAt).toISOString()
          }
        }
      };
    }

    // Añadir headers de rate limit
    request.rateLimitInfo = {
      limit: this.config.maxRequests,
      remaining: this.config.maxRequests - limit.count,
      resetAt: limit.resetAt
    };

    return { cancelled: false, data: { request } };
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, limit] of this.limits.entries()) {
      if (now > limit.resetAt) {
        this.limits.delete(ip);
      }
    }
  }
}
```

---

## Ejemplo 3: Request Logging

Registrar todas las peticiones con detalles.

```javascript
class RequestLoggerModule {
  constructor(core) {
    this.core = core;
    this.hooks = core.hooks;
  }

  async onLoad() {
    this.hooks.register('beforeRequest', this.logRequest.bind(this));
    this.hooks.register('afterResponse', this.logResponse.bind(this));
  }

  async logRequest({ request, coreId }) {
    // Añadir timestamp de inicio
    request.startTime = Date.now();
    request.requestId = this.generateRequestId();

    this.core.logger.info('http.request.start', {
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      userAgent: request.headers['user-agent'],
      ip: request.headers['x-forwarded-for'] || 'unknown'
    });

    return { cancelled: false, data: { request } };
  }

  async logResponse({ request, response, coreId }) {
    const duration = Date.now() - request.startTime;

    this.core.logger.info('http.request.end', {
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      duration: duration,
      bodySize: JSON.stringify(response.body).length
    });

    // Añadir headers
    response.headers = {
      ...response.headers,
      'X-Request-ID': request.requestId,
      'X-Response-Time': `${duration}ms`
    };

    return { data: { response } };
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

---

## Ejemplo 4: CORS Avanzado

Configuración dinámica de CORS.

```javascript
class CORSModule {
  constructor(core) {
    this.core = core;
    this.hooks = core.hooks;

    this.config = {
      allowedOrigins: [
        'http://localhost:3000',
        'https://myapp.com'
      ],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    };
  }

  async onLoad() {
    this.hooks.register('afterResponse', this.addCORSHeaders.bind(this));
  }

  async addCORSHeaders({ request, response, coreId }) {
    const origin = request.headers.origin;

    // Verificar si el origin está permitido
    if (this.config.allowedOrigins.includes(origin)) {
      response.headers = {
        ...response.headers,
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': this.config.allowedMethods.join(', '),
        'Access-Control-Allow-Headers': this.config.allowedHeaders.join(', '),
        'Access-Control-Allow-Credentials': 'true'
      };
    }

    return { data: { response } };
  }
}
```

---

## Ejemplo 5: Request Validation

Validar schemas de request automáticamente.

```javascript
class ValidationModule {
  constructor(core) {
    this.core = core;
    this.hooks = core.hooks;

    // Schemas por ruta
    this.schemas = {
      'POST /modules/user/create': {
        email: { type: 'string', required: true, pattern: /@/ },
        name: { type: 'string', required: true, minLength: 2 },
        age: { type: 'number', required: false, min: 0, max: 150 }
      }
    };
  }

  async onLoad() {
    this.hooks.register('beforeRequest', this.validateRequest.bind(this));
  }

  async validateRequest({ request, coreId }) {
    const key = `${request.method} ${request.path}`;
    const schema = this.schemas[key];

    if (!schema) {
      // No hay schema, dejar pasar
      return { cancelled: false, data: { request } };
    }

    // Validar
    const errors = this.validate(request.body, schema);

    if (errors.length > 0) {
      return {
        cancelled: true,
        statusCode: 400,
        response: {
          error: 'Validation failed',
          errors: errors
        }
      };
    }

    return { cancelled: false, data: { request } };
  }

  validate(data, schema) {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      // Required
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`Field '${field}' is required`);
        continue;
      }

      if (value === undefined) continue;

      // Type
      if (rules.type && typeof value !== rules.type) {
        errors.push(`Field '${field}' must be ${rules.type}`);
      }

      // Pattern (string)
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`Field '${field}' has invalid format`);
      }

      // Min/max (number)
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`Field '${field}' must be >= ${rules.min}`);
      }

      if (rules.max !== undefined && value > rules.max) {
        errors.push(`Field '${field}' must be <= ${rules.max}`);
      }

      // MinLength (string)
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`Field '${field}' must have at least ${rules.minLength} characters`);
      }
    }

    return errors;
  }
}
```

---

## Best Practices

### 1. Hooks Deben Ser Rápidos

Los hooks se ejecutan en TODAS las peticiones, deben ser eficientes:

```javascript
// ❌ MAL: Operación lenta
async beforeRequest({ request }) {
  await this.databaseQuery(); // Lento!
  return { cancelled: false, data: { request } };
}

// ✅ BIEN: Operación rápida
async beforeRequest({ request }) {
  const token = this.tokens.get(request.token); // Map lookup, rápido
  return { cancelled: false, data: { request } };
}
```

### 2. No Modificar Objetos Originales

Siempre crea copias:

```javascript
// ❌ MAL
async beforeRequest({ request }) {
  request.headers.authorization = 'modified'; // Modifica original
  return { cancelled: false, data: { request } };
}

// ✅ BIEN
async beforeRequest({ request }) {
  const modifiedRequest = {
    ...request,
    headers: {
      ...request.headers,
      'X-Custom': 'value'
    }
  };
  return { cancelled: false, data: { request: modifiedRequest } };
}
```

### 3. Manejo de Errores

Los hooks deben manejar sus propios errores:

```javascript
async beforeRequest({ request }) {
  try {
    const result = await this.verifyToken(request.token);
    return { cancelled: false, data: { request } };
  } catch (error) {
    this.core.logger.error('hook.error', { error: error.message });
    // No cancelar si hay error interno
    return { cancelled: false, data: { request } };
  }
}
```

### 4. Logging

Loggea acciones importantes:

```javascript
this.core.logger.debug('auth.check', {
  path: request.path,
  hasToken: !!request.headers.authorization
});
```

---

## 🎯 Resumen

Los **Hooks** son extremadamente poderosos para:

✅ **Autenticación global** - Un hook valida TODAS las peticiones
✅ **Rate limiting** - Proteger APIs de abuso
✅ **Logging** - Trazabilidad completa
✅ **Validación** - Schemas automáticos
✅ **CORS** - Configuración avanzada
✅ **Transformación** - Modificar requests/responses

**Siguiente:** Lee `docs/GUIA_TESTING.md` para aprender a testear tus APIs y hooks.
