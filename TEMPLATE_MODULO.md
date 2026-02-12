# 📘 TEMPLATE: Cómo Crear Módulos Correctamente

**Basado en:** Módulo `cuentas` v2.0

**Status:** Este es EL estándar. TODOS los módulos deben seguir este template.

---

## 🎯 PRINCIPIOS NO NEGOCIABLES

### 1. ✅ 100% Event-Driven + Declarativo

**SÍ (declarar en module.json — el loader auto-wira):**
```json
{
  "events": {
    "subscribes": [
      { "event": "pedido.creado", "handler": "onPedidoCreado" }
    ]
  },
  "ui_handlers": [
    { "domain": "producto", "action": "create", "handler": "handleUICreate" }
  ]
}
```

```javascript
// Publicar evento (esto sí se hace en código)
await this.eventBus.publish('producto.creado', {
  producto_id: producto.id,
  nombre: producto.nombre
}, {
  correlationId: context.correlationId
});
```

**NO:**
```javascript
// ❌ NUNCA suscribirse imperativamente (el loader lo hace)
await this.eventBus.subscribe('pedido.creado', this.onPedidoCreado.bind(this));

// ❌ NUNCA registrar UI handlers imperativamente
this.uiHandler.register('producto', 'create', this.handleUICreate.bind(this));

// ❌ NUNCA hacer HTTP interno
const response = await fetch('http://localhost:3339/modules/otro');
```

### 2. ✅ JSON Schema Validation

**Obligatorio** en `module.json`:

```json
{
  "events": {
    "publishes": [{
      "event": "producto.creado",
      "schema": {
        "$ref": "./schemas/events.json#/definitions/producto_creado"
      }
    }]
  }
}
```

### 3. ✅ Logging Estructurado

**SIEMPRE con correlationId:**

```javascript
this.logger.info('producto.creado', {
  producto_id: producto.id,
  correlation_id: context.correlationId,
  duration: Date.now() - start_time
});
```

### 4. ✅ Métricas Completas

```javascript
// Counters
this.metrics.increment('producto.creado.total');

// Gauges
this.metrics.gauge('producto.activos.count', this.productos.size);

// Timings
this.metrics.timing('producto.create.duration', duration);
```

### 5. ✅ Módulo Pequeño

**Objetivo:** < 500 líneas
**Ideal:** < 300 líneas

Si tu módulo crece mucho, **divídelo** en submódulos.

---

## 📁 ESTRUCTURA DE CARPETAS

```
modules/[NOMBRE_MODULO]/
├── module.json          # Manifest + contratos
├── index.js             # Lógica del módulo
├── schemas/             # JSON Schemas
│   ├── [nombre].json   # Schemas de datos
│   └── events.json     # Schemas de eventos
├── README.md            # Documentación
└── tests/               # Tests (opcional)
    └── [nombre].test.js
```

---

## 📋 CHECKLIST DE CREACIÓN

### Paso 1: Crear `module.json`

```json
{
  "name": "mi-modulo",
  "version": "1.0.0",
  "description": "Descripción breve",
  "author": "Pizzepos Team",

  "provides": {
    "events": ["entidad.evento1", "entidad.evento2"],
    "queries": ["entidad.obtener", "entidad.listar"]
  },

  "events": {
    "publishes": [
      {
        "event": "entidad.creada",
        "description": "Descripción del evento",
        "schema": {"$ref": "./schemas/events.json#/definitions/entidad_creada"}
      }
    ],
    "subscribes": [
      {
        "event": "otra_entidad.cambio",
        "description": "Por qué nos suscribimos",
        "handler": "onOtraEntidadCambio"
      }
    ]
  },

  "ui_handlers": [
    {
      "domain": "entidad",
      "action": "list",
      "handler": "handleUIListEntidades"
    },
    {
      "domain": "entidad",
      "action": "create",
      "handler": "handleUICreateEntidad"
    }
  ],

  "apis": [
    {
      "method": "POST",
      "path": "/entidades",
      "handler": "handleCreateEntidad",
      "description": "Crear entidad (publica evento entidad.creada)",
      "request_schema": {"$ref": "./schemas/entidad.json#/definitions/create_request"},
      "response_schema": {"$ref": "./schemas/entidad.json#/definitions/create_response"}
    },
    {
      "method": "GET",
      "path": "/entidades",
      "handler": "handleListEntidades",
      "description": "Listar entidades"
    },
    {
      "method": "GET",
      "path": "/health",
      "handler": "handleHealthCheck",
      "description": "Health check"
    },
    {
      "method": "GET",
      "path": "/metrics",
      "handler": "handleGetMetrics",
      "description": "Métricas del módulo"
    }
  ],

  "observability": {
    "logging": {
      "level": "info",
      "structured": true,
      "correlation_id": true
    },
    "metrics": {
      "enabled": true,
      "counters": ["entidad.creada.total"],
      "gauges": ["entidad.activas.count"],
      "timings": ["entidad.create.duration"]
    }
  }
}
```

### Paso 2: Crear Schemas JSON

#### `schemas/entidad.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://pizzepos.com/schemas/entidad.json",

  "definitions": {
    "entidad": {
      "type": "object",
      "required": ["id", "nombre", "created_at"],
      "properties": {
        "id": {"type": "string", "pattern": "^entidad_[a-z0-9]+$"},
        "nombre": {"type": "string", "minLength": 1},
        "created_at": {"type": "string", "format": "date-time"}
      },
      "additionalProperties": false
    },

    "create_request": {
      "type": "object",
      "required": ["nombre"],
      "properties": {
        "nombre": {"type": "string", "minLength": 1}
      },
      "additionalProperties": false
    }
  }
}
```

#### `schemas/events.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",

  "definitions": {
    "event_envelope": {
      "type": "object",
      "required": ["event_id", "event_type", "correlation_id", "occurred_at", "producer", "schema_version", "payload"],
      "properties": {
        "event_id": {"type": "string", "format": "uuid"},
        "event_type": {"type": "string"},
        "correlation_id": {"type": "string", "format": "uuid"},
        "occurred_at": {"type": "string", "format": "date-time"},
        "producer": {"type": "string"},
        "schema_version": {"type": "string"},
        "payload": {"type": "object"}
      },
      "additionalProperties": false
    },

    "entidad_creada": {
      "allOf": [
        {"$ref": "#/definitions/event_envelope"},
        {
          "properties": {
            "event_type": {"const": "entidad.creada"},
            "payload": {
              "type": "object",
              "required": ["entidad_id", "nombre"],
              "properties": {
                "entidad_id": {"type": "string"},
                "nombre": {"type": "string"}
              },
              "additionalProperties": false
            }
          }
        }
      ]
    }
  }
}
```

### Paso 3: Crear `index.js`

```javascript
/**
 * Módulo [Nombre]
 * Descripción
 */

class MiModulo {
  constructor() {
    this.name = 'mi-modulo';
    this.version = '1.0.0';

    // Estado
    this.entidades = new Map();

    // Dependencias (inyectadas)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('modulo.loading', { module: this.name });

    // NO suscribirse aquí — el loader auto-wira desde module.json
    // Solo inicializar estado del módulo

    this.logger.info('modulo.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info('modulo.unloading', { module: this.name });
    // NO hacer unsubscribe/unregister — el loader lo hace automáticamente
    // Solo limpiar estado propio: timers, caches, pending requests
  }

  // ==========================================
  // Event Handlers (auto-wired from module.json)
  // ==========================================

  async onOtraEvento(event) {
    this.logger.info('otra.evento.received', {
      correlation_id: event.correlation_id
    });
    // Procesar evento...
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleCreateEntidad(req, context) {
    const start_time = Date.now();

    this.logger.info('entidad.create.start', {
      correlation_id: context.correlationId
    });

    try {
      const { nombre } = context.body;

      const entidad = {
        id: `entidad_${Date.now()}`,
        nombre,
        created_at: new Date().toISOString()
      };

      this.entidades.set(entidad.id, entidad);

      // Métricas
      this.metrics.increment('entidad.creada.total');
      this.metrics.gauge('entidad.activas.count', this.entidades.size);
      this.metrics.timing('entidad.create.duration', Date.now() - start_time);

      // Publicar evento
      await this.publishEntidadCreada(entidad, context.correlationId);

      this.logger.info('entidad.creada', {
        entidad_id: entidad.id,
        correlation_id: context.correlationId,
        duration: Date.now() - start_time
      });

      return {
        status: 201,
        data: entidad
      };

    } catch (error) {
      this.metrics.increment('entidad.errors.total', 1, { operation: 'create' });

      this.logger.error('entidad.create.error', {
        error: error.message,
        stack: error.stack,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: { error: error.message }
      };
    }
  }

  async handleListEntidades(req, context) {
    const entidades = Array.from(this.entidades.values());

    return {
      status: 200,
      data: { entidades, total: entidades.length }
    };
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: this.version
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        counters: {
          'entidad.creada.total': this.metrics.getCounter('entidad.creada.total') || 0
        },
        gauges: {
          'entidad.activas.count': this.entidades.size
        }
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishEntidadCreada(entidad, correlation_id) {
    await this.eventBus.publish('entidad.creada', {
      entidad_id: entidad.id,
      nombre: entidad.nombre,
      created_at: entidad.created_at
    }, {
      correlationId: correlation_id
    });
  }
}

module.exports = MiModulo;
```

### Paso 4: Crear `README.md`

```markdown
# Módulo [Nombre]

**Descripción breve**

## 📦 Eventos Publicados

### `entidad.creada`

```json
{
  "event_type": "entidad.creada",
  "payload": {
    "entidad_id": "entidad_123",
    "nombre": "Mi Entidad"
  }
}
```

## 📡 Eventos Suscritos

### `otra.evento`

Descripción de por qué nos suscribimos.

## 🔌 APIs HTTP

| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/entidades` | Crear entidad |
| GET | `/entidades` | Listar entidades |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas |

## 🧪 Ejemplos de Uso

```bash
curl -X POST http://localhost:3339/modules/mi-modulo/entidades \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Test"}'
```
```

---

## ❌ ANTI-PATRONES (NO HACER)

### 1. HTTP Interno

```javascript
// ❌ MAL
async fetchInternal(path) {
  const http = require('http');
  // ...
}

// ✅ BIEN
await this.eventBus.publish('solicitud.datos', { ... });
await this.eventBus.subscribe('respuesta.datos', ...);
```

### 2. Llamadas Directas entre Módulos

```javascript
// ❌ MAL
const otroModulo = core.getModule('otro-modulo');
const data = await otroModulo.handleGetDatos();

// ✅ BIEN
await this.eventBus.publish('datos.solicitados', { ... });
// Esperar respuesta via evento 'datos.recibidos'
```

### 3. Validación Manual

```javascript
// ❌ MAL
if (!req.body.nombre) {
  return { status: 400, data: { error: 'nombre requerido' }};
}

// ✅ BIEN
// Definir schema en module.json y dejar que validationManager lo valide
```

### 4. Logs sin correlationId

```javascript
// ❌ MAL
this.logger.info('producto.creado', { producto_id });

// ✅ BIEN
this.logger.info('producto.creado', {
  producto_id,
  correlation_id: context.correlationId
});
```

### 5. HTML Inline

```javascript
// ❌ MAL
return `<div><h1>${title}</h1></div>`;

// ✅ BIEN
// Usar componentes JSON-driven en ui-components/
```

---

## 🎓 REFERENCIAS

**Módulo de ejemplo perfecto:**
- `event-core/modules/cuentas/` - Sigue este al 100%

**Prompts a seguir:**
- `event-core/prompts/tutoriales/prompt_mqtt_event_bus.md`
- `event-core/prompts/tutoriales/prompt_crear_componente_ui.md`
- `event-core/prompts/tutoriales/prompt_logging_metricas.md`
- `event-core/prompts/prompt_diseño_modular.md`

**Documentación:**
- `ANALISIS_CONTRADICCIONES.md` - Qué NO hacer
- `TEMPLATE_MODULO.md` - Este documento

---

## ✅ VALIDACIÓN FINAL

Antes de considerar tu módulo terminado, verifica:

- [ ] **Comunicación:** SOLO via `eventBus.publish()` + subscribes declarados en `module.json`
- [ ] **Sin HTTP interno:** NO usa `fetchInternal` o `http.request`
- [ ] **Schemas:** Todos los eventos tienen JSON Schema
- [ ] **Logging:** Todos los logs incluyen `correlationId`
- [ ] **Métricas:** Counters, gauges, timings implementados
- [ ] **Endpoints:** `/health` y `/metrics` implementados
- [ ] **Tamaño:** < 500 líneas (ideal < 300)
- [ ] **README:** Documentación completa
- [ ] **Tests:** Al menos tests básicos (opcional pero recomendado)

---

**Si tu módulo no pasa esta validación, NO está completo.**

**Versión:** 1.0.0
**Basado en:** Módulo `cuentas` v2.0
**Autor:** Pizzepos Team
