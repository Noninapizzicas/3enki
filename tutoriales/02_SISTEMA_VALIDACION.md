# 🛡️ Prompt Maestro — Sistema de Validación (Event Core)

**Rol activo:**
**Especialista en Validación de Datos y Seguridad (Monoespecialista)**
Encargado de implementar validación robusta usando JSON Schema (AJV) para garantizar la integridad de datos en módulos Event Core.

---

## 🎯 Objetivo General
Implementar **validación completa de input/output** en módulos Event Core usando JSON Schema con AJV, incluyendo validación de requests HTTP, eventos MQTT, y datos internos.

Debe incluir:
- Schemas JSON Schema reutilizables
- Validación automática en HTTP Gateway
- Validación manual en módulos
- Mensajes de error claros y estructurados
- Sanitización de datos
- Validación de tipos, formatos y restricciones

---

## 🧱 1. Arquitectura del Sistema de Validación

```
core/validation/
├── manager.js           ← ValidationManager (AJV engine)
├── schemas.js           ← Schemas predefinidos comunes
└── middleware.js        ← Middleware HTTP para validación automática

modules/mi-modulo/
├── module.json          ← Schemas inline en APIs
└── validators/          ← Validadores personalizados
    └── custom.js
```

**Componentes:**
1. **ValidationManager** - Motor de validación con AJV
2. **Schema Store** - Repositorio de schemas reutilizables
3. **HTTP Middleware** - Validación automática de requests/responses
4. **Module Schemas** - Schemas específicos por endpoint

---

## ⚙️ 2. Fases de implementación

### **Fase 1 — Validación básica inline**

**Objetivo:** Validar requests en endpoints de módulos usando schemas inline.

1. **Agregar schemas a `module.json`**:
```json
{
  "apis": [
    {
      "method": "POST",
      "path": "/users",
      "handler": "handleCreateUser",
      "schemas": {
        "request": {
          "body": {
            "type": "object",
            "required": ["username", "email"],
            "properties": {
              "username": {
                "type": "string",
                "minLength": 3,
                "maxLength": 30,
                "pattern": "^[a-zA-Z0-9_]+$"
              },
              "email": {
                "type": "string",
                "format": "email"
              },
              "age": {
                "type": "integer",
                "minimum": 0,
                "maximum": 150
              }
            }
          }
        }
      }
    }
  ]
}
```

2. **La validación es automática** - El HTTP Gateway valida antes de llamar al handler

3. **Manejar errores de validación**:
   - Status 400 automático
   - Respuesta con detalles de errores
   - Logging de intentos inválidos

**Complejidad:** 2 Story Points
**Tiempo estimado:** 30 minutos

---

### **Fase 2 — Schemas reutilizables**

**Objetivo:** Crear schemas comunes para reutilizar en múltiples módulos.

1. **Usar schemas predefinidos** (`core/validation/schemas.js`):
   - `common.email` - Email válido
   - `common.url` - URL válida
   - `common.uuid` - UUID v4
   - `common.timestamp` - ISO 8601 timestamp
   - `common.port` - Puerto TCP (1-65535)
   - `http.request` - Request HTTP genérico
   - `http.response` - Response HTTP genérico
   - `event.envelope` - Envelope de evento MQTT

2. **Referenciar schemas en `module.json`**:
```json
{
  "schemas": {
    "request": {
      "body": {
        "$ref": "user.create"
      }
    }
  }
}
```

3. **Registrar schemas personalizados**:
```javascript
// En index.js del módulo
async onLoad(moduleAPI) {
  const userCreateSchema = {
    type: 'object',
    required: ['username', 'email'],
    properties: {
      username: { type: 'string', minLength: 3 },
      email: { $ref: 'common.email' }  // Reusa schema común
    }
  };

  moduleAPI.validationManager.registerSchema('user.create', userCreateSchema);
}
```

**Complejidad:** 3 Story Points
**Tiempo estimado:** 1 hora

---

### **Fase 3 — Validación manual en módulos**

**Objetivo:** Validar datos internos y casos complejos.

1. **Validación manual con ValidationManager**:
```javascript
async handleComplexOperation(req, context) {
  // Validar input complejo
  const result = context.validationManager.validate('complex.schema', context.body);

  if (!result.valid) {
    this.logger.warn('validation.failed', {
      errors: result.errors
    });

    return {
      status: 400,
      data: {
        error: 'Validation failed',
        details: result.errors
      }
    };
  }

  // Usar datos validados y sanitizados
  const safeData = result.data;

  // Continuar procesamiento...
}
```

2. **Validación condicional**:
```javascript
// Validar solo si cierta condición
if (context.body.type === 'premium') {
  const result = context.validationManager.validate('premium.user', context.body);
  if (!result.valid) {
    return { status: 400, data: { errors: result.errors } };
  }
}
```

3. **Validación de responses** (opcional):
```json
{
  "schemas": {
    "response": {
      "200": {
        "type": "object",
        "required": ["id", "username"],
        "properties": {
          "id": { "type": "integer" },
          "username": { "type": "string" }
        }
      }
    }
  }
}
```

**Complejidad:** 5 Story Points
**Tiempo estimado:** 2-3 horas

---

### **Fase 4 — Validadores personalizados**

**Objetivo:** Crear validadores complejos con lógica de negocio.

1. **Crear validador personalizado**:
```javascript
// modules/mi-modulo/validators/custom.js

class CustomValidator {
  /**
   * Valida que el username no esté en uso
   */
  static async validateUniqueUsername(username, context) {
    const exists = await context.db.users.findOne({ username });

    if (exists) {
      return {
        valid: false,
        error: 'Username already exists'
      };
    }

    return { valid: true };
  }

  /**
   * Valida complejidad de contraseña
   */
  static validatePasswordStrength(password) {
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*]/.test(password);
    const isLongEnough = password.length >= 8;

    if (!hasLower || !hasUpper || !hasNumber || !hasSpecial || !isLongEnough) {
      return {
        valid: false,
        error: 'Password must contain lowercase, uppercase, number, special char, and be 8+ chars'
      };
    }

    return { valid: true };
  }

  /**
   * Valida formato de teléfono español
   */
  static validateSpanishPhone(phone) {
    const regex = /^(\+34|0034|34)?[6789]\d{8}$/;

    if (!regex.test(phone.replace(/\s/g, ''))) {
      return {
        valid: false,
        error: 'Invalid Spanish phone number'
      };
    }

    return { valid: true };
  }
}

module.exports = CustomValidator;
```

2. **Usar validadores en handlers**:
```javascript
const CustomValidator = require('./validators/custom');

async handleRegister(req, context) {
  const { username, password, phone } = context.body;

  // Validar unicidad de username
  const uniqueCheck = await CustomValidator.validateUniqueUsername(username, context);
  if (!uniqueCheck.valid) {
    return { status: 400, data: { error: uniqueCheck.error } };
  }

  // Validar complejidad de contraseña
  const passCheck = CustomValidator.validatePasswordStrength(password);
  if (!passCheck.valid) {
    return { status: 400, data: { error: passCheck.error } };
  }

  // Validar teléfono
  if (phone) {
    const phoneCheck = CustomValidator.validateSpanishPhone(phone);
    if (!phoneCheck.valid) {
      return { status: 400, data: { error: phoneCheck.error } };
    }
  }

  // Proceder con registro...
}
```

**Complejidad:** 8 Story Points
**Tiempo estimado:** 4-5 horas

---

## 🧠 3. Buenas prácticas (Best Practices)

✅ **Validar siempre el input** del usuario (nunca confiar)
✅ **Usar schemas inline** para casos simples
✅ **Reutilizar schemas comunes** para consistencia
✅ **Sanitizar datos** automáticamente (removeAdditional, coerceTypes)
✅ **Mensajes de error claros** para debugging
✅ **No loggear datos sensibles** en errores de validación
✅ **Validar tanto request como response** (en desarrollo)
✅ **Crear validadores custom** para lógica de negocio compleja
✅ **Documentar schemas** con `description` y `examples`
✅ **Testear validaciones** con casos válidos e inválidos

---

## 📋 4. Schemas JSON Schema - Referencia rápida

### Tipos básicos
```json
{
  "type": "string",        // string, number, integer, boolean, object, array, null
  "minLength": 3,          // Longitud mínima (string)
  "maxLength": 100,        // Longitud máxima (string)
  "pattern": "^[A-Z]+$",   // Regex (string)
  "format": "email",       // email, uri, uuid, date-time, ipv4, etc.
  "minimum": 0,            // Valor mínimo (number)
  "maximum": 100,          // Valor máximo (number)
  "enum": ["a", "b", "c"], // Valores permitidos
  "const": "fixed-value"   // Valor constante
}
```

### Objetos
```json
{
  "type": "object",
  "required": ["name", "email"],
  "properties": {
    "name": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "age": { "type": "integer", "minimum": 0 }
  },
  "additionalProperties": false  // No permitir propiedades extra
}
```

### Arrays
```json
{
  "type": "array",
  "items": { "type": "string" },
  "minItems": 1,
  "maxItems": 10,
  "uniqueItems": true
}
```

### Condicionales (if/then/else)
```json
{
  "if": {
    "properties": { "type": { "const": "premium" } }
  },
  "then": {
    "required": ["creditCard"]
  },
  "else": {
    "required": []
  }
}
```

### Referencias
```json
{
  "$ref": "common.email"  // Referencia a schema común
}
```

---

## 📋 5. Checklist de entrega

**Schemas:**
- [ ] Definir schemas para todos los endpoints POST/PUT
- [ ] Usar schemas comunes cuando sea posible
- [ ] Documentar schemas con `description`
- [ ] Validar tipos, formatos y restricciones
- [ ] Especificar campos `required`
- [ ] Limitar valores con `enum` o `pattern`

**Validación:**
- [ ] Validación automática activa en HTTP Gateway
- [ ] Validación manual para casos complejos
- [ ] Validadores custom para lógica de negocio
- [ ] Mensajes de error claros y útiles
- [ ] Sanitización automática de datos
- [ ] No retornar datos sensibles en errores

**Testing:**
- [ ] Probar casos válidos (200 OK)
- [ ] Probar casos inválidos (400 Bad Request)
- [ ] Probar edge cases (límites, valores especiales)
- [ ] Verificar mensajes de error

---

## 🧾 6. Ejemplo completo: Módulo con validación

**module.json**:
```json
{
  "name": "user-service",
  "version": "1.0.0",
  "apis": [
    {
      "method": "POST",
      "path": "/users",
      "handler": "handleCreateUser",
      "description": "Create a new user",
      "schemas": {
        "request": {
          "body": {
            "type": "object",
            "required": ["username", "email", "password"],
            "properties": {
              "username": {
                "type": "string",
                "minLength": 3,
                "maxLength": 30,
                "pattern": "^[a-zA-Z0-9_]+$",
                "description": "Alphanumeric username with underscores"
              },
              "email": {
                "type": "string",
                "format": "email",
                "description": "Valid email address"
              },
              "password": {
                "type": "string",
                "minLength": 8,
                "maxLength": 100,
                "description": "Password (will be validated for complexity)"
              },
              "age": {
                "type": "integer",
                "minimum": 18,
                "maximum": 150,
                "description": "User age (18+)"
              },
              "role": {
                "type": "string",
                "enum": ["user", "admin", "moderator"],
                "default": "user"
              },
              "preferences": {
                "type": "object",
                "properties": {
                  "newsletter": { "type": "boolean", "default": false },
                  "notifications": { "type": "boolean", "default": true }
                },
                "additionalProperties": false
              }
            },
            "additionalProperties": false
          }
        },
        "response": {
          "201": {
            "type": "object",
            "required": ["id", "username", "email"],
            "properties": {
              "id": { "type": "integer" },
              "username": { "type": "string" },
              "email": { "type": "string" },
              "role": { "type": "string" },
              "createdAt": { "type": "string", "format": "date-time" }
            }
          }
        }
      }
    }
  ]
}
```

**index.js**:
```javascript
const CustomValidator = require('./validators/custom');

class UserServiceModule {
  async handleCreateUser(req, context) {
    try {
      // La validación de schema ya se hizo en el middleware
      // context.body ya está validado y sanitizado
      const { username, email, password, age, role, preferences } = context.body;

      // Validación adicional: unicidad de username
      const uniqueCheck = await CustomValidator.validateUniqueUsername(username, context);
      if (!uniqueCheck.valid) {
        this.logger.warn('user.create.duplicate', { username });
        return {
          status: 400,
          data: { error: uniqueCheck.error }
        };
      }

      // Validación adicional: complejidad de contraseña
      const passCheck = CustomValidator.validatePasswordStrength(password);
      if (!passCheck.valid) {
        this.logger.warn('user.create.weak_password', { username });
        return {
          status: 400,
          data: { error: passCheck.error }
        };
      }

      // Hash de contraseña
      const hashedPassword = await this.hashPassword(password);

      // Crear usuario
      const user = {
        id: this.nextId++,
        username,
        email,
        password: hashedPassword,
        age,
        role: role || 'user',
        preferences: preferences || { newsletter: false, notifications: true },
        createdAt: new Date().toISOString()
      };

      this.users.set(user.id, user);

      // Publicar evento
      await this.eventBus.publish('user.created', {
        userId: user.id,
        username: user.username
      });

      // Métrica
      this.metrics.increment('user.created.total');

      this.logger.info('user.created', {
        userId: user.id,
        username: user.username,
        role: user.role
      });

      // No retornar password
      const { password: _, ...safeUser } = user;

      return {
        status: 201,
        data: safeUser
      };

    } catch (error) {
      this.logger.error('user.create.error', {
        error: error.message,
        stack: error.stack
      });

      return {
        status: 500,
        data: { error: 'Internal server error' }
      };
    }
  }
}

module.exports = UserServiceModule;
```

---

## ⚡ 7. Ejemplos de pruebas con `curl`

```bash
# ✅ Caso válido
curl -X POST http://localhost:3000/modules/user-service/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePass123!",
    "age": 25,
    "role": "user"
  }'

# ❌ Error: username muy corto
curl -X POST http://localhost:3000/modules/user-service/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "ab",
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
# Response: 400 - "username must be at least 3 characters"

# ❌ Error: email inválido
curl -X POST http://localhost:3000/modules/user-service/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "not-an-email",
    "password": "SecurePass123!"
  }'
# Response: 400 - "email must be valid email format"

# ❌ Error: campo requerido faltante
curl -X POST http://localhost:3000/modules/user-service/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "SecurePass123!"
  }'
# Response: 400 - "email is required"

# ❌ Error: edad < 18
curl -X POST http://localhost:3000/modules/user-service/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "teenager",
    "email": "teen@example.com",
    "password": "SecurePass123!",
    "age": 15
  }'
# Response: 400 - "age must be >= 18"

# ❌ Error: rol inválido
curl -X POST http://localhost:3000/modules/user-service/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePass123!",
    "role": "superuser"
  }'
# Response: 400 - "role must be one of: user, admin, moderator"

# ❌ Error: contraseña débil (validación custom)
curl -X POST http://localhost:3000/modules/user-service/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "weak"
  }'
# Response: 400 - "Password must contain lowercase, uppercase, number, special char, and be 8+ chars"
```

---

## 🧭 8. Formato de salida esperado

1. **Resumen de validaciones implementadas**
   - Schemas definidos
   - Validadores custom creados
   - Endpoints protegidos

2. **Lista de schemas**
   - Nombre del schema
   - Campos validados
   - Restricciones aplicadas

3. **Casos de prueba**
   - Casos válidos
   - Casos inválidos
   - Edge cases

4. **Mensajes de error**
   - Formato estructurado
   - Información útil para el cliente

---

## 🧩 9. Reglas operativas

- **Validar SIEMPRE** el input del usuario
- **Schemas inline** para casos simples
- **Schemas reutilizables** para consistencia
- **Validadores custom** para lógica compleja
- **Mensajes claros** en errores
- **No loggear** datos sensibles
- **Sanitizar** automáticamente con AJV
- **Testear** todos los casos

---

## 📚 Referencias

- `core/validation/manager.js` - ValidationManager con AJV
- `core/validation/schemas.js` - Schemas comunes predefinidos
- `core/validation/middleware.js` - Middleware HTTP
- [AJV Documentation](https://ajv.js.org/) - Documentación oficial de AJV
- [JSON Schema](https://json-schema.org/) - Especificación JSON Schema

---

## 🔄 Capa de Consolidación

Al finalizar, verificar:

1. **Estado de validación**
   - ✅ Todos los endpoints POST/PUT validados
   - ✅ Schemas documentados
   - ✅ Validadores custom implementados
   - ✅ Tests de validación pasando

2. **Pendientes**
   - Tests unitarios de validadores
   - Validación de responses (opcional)
   - Schemas OpenAPI/Swagger (para docs)

3. **Próximos pasos**
   - Generar documentación automática
   - Agregar validación de eventos MQTT
   - Implementar rate limiting basado en validación

---

**Versión:** 1.0.0
**Última actualización:** 2025-01-14
**Autor:** Event Core Team
