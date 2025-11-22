# 🔗 TEMPLATE: Cómo Crear APIs HTTP Correctamente

**Basado en:** Event Core Router System

**Status:** Este es EL estándar. TODOS los handlers HTTP deben seguir este template.

---

## 🎯 PRINCIPIOS NO NEGOCIABLES

### 1. ✅ Firma Correcta del Handler

**SIEMPRE:**
```javascript
async handleNombreAccion(req, context) {
  // req = request data
  // context = metadata del request
}
```

**NUNCA:**
```javascript
// ❌ MAL - Falta req
async handleNombreAccion(context) { }

// ❌ MAL - Falta context
async handleNombreAccion(req) { }

// ❌ MAL - Parámetros invertidos
async handleNombreAccion(context, req) { }
```

### 2. ✅ Respuesta Estándar

**SIEMPRE retornar:**
```javascript
return {
  status: 200,        // Código HTTP
  data: { ... }       // Payload de respuesta
};
```

**NUNCA:**
```javascript
// ❌ MAL - Retornar solo data
return { id: '123', nombre: 'Test' };

// ❌ MAL - Usar body en vez de data
return { status: 200, body: { ... } };

// ❌ MAL - No retornar nada
console.log('Done');
```

### 3. ✅ Validación de Inputs

**SIEMPRE validar antes de procesar:**
```javascript
async handleCreateProducto(req, context) {
  const { nombre, precio } = req.body;

  if (!nombre || typeof nombre !== 'string') {
    return {
      status: 400,
      data: { error: 'nombre es requerido y debe ser string' }
    };
  }

  if (typeof precio !== 'number' || precio <= 0) {
    return {
      status: 400,
      data: { error: 'precio debe ser un número positivo' }
    };
  }

  // Procesar...
}
```

### 4. ✅ correlationId en Logs

**SIEMPRE incluir:**
```javascript
this.logger.info('producto.creado', {
  producto_id: producto.id,
  correlation_id: context.correlationId
});
```

### 5. ✅ Try-Catch con Respuesta de Error

```javascript
async handleCreateProducto(req, context) {
  try {
    // Lógica...
    return { status: 201, data: producto };
  } catch (error) {
    this.logger.error('producto.create.error', {
      error: error.message,
      correlation_id: context.correlationId
    });

    return {
      status: 500,
      data: { error: 'Error interno del servidor' }
    };
  }
}
```

---

## 📦 OBJETOS REQUEST Y CONTEXT

### Request Object (`req`)

```javascript
{
  body: { ... },      // POST/PUT/PATCH data
  params: { ... },    // URL params (:id)
  query: { ... },     // Query string (?filter=x)
  headers: { ... }    // HTTP headers
}
```

**Ejemplos de acceso:**

```javascript
// POST /productos con body { "nombre": "Pizza" }
const { nombre } = req.body;

// GET /productos/:id
const { id } = req.params;

// GET /productos?tipo=pizza&estado=activo
const { tipo, estado } = req.query;

// Headers
const apiKey = req.headers['x-api-key'];
```

### Context Object (`context`)

```javascript
{
  correlationId: "uuid-para-trazar",  // SIEMPRE usar en logs
  timestamp: "2025-01-19T14:30:00Z",
  method: "POST",
  path: "/modules/productos/productos",
  moduleId: "productos"
}
```

---

## 📊 CÓDIGOS HTTP ESTÁNDAR

### Códigos de Éxito (2xx)

| Código | Cuándo usar | Ejemplo |
|--------|-------------|---------|
| `200` | GET exitoso, UPDATE exitoso | Listar productos, actualizar producto |
| `201` | Recurso creado | Crear producto nuevo |
| `204` | Acción exitosa sin contenido | Eliminar producto |

### Códigos de Error Cliente (4xx)

| Código | Cuándo usar | Ejemplo |
|--------|-------------|---------|
| `400` | Request mal formado | Falta campo requerido, tipo incorrecto |
| `401` | No autenticado | Token faltante o inválido |
| `403` | No autorizado | Sin permisos para esta acción |
| `404` | Recurso no encontrado | Producto con ID no existe |
| `409` | Conflicto | Producto ya existe con ese nombre |
| `422` | Datos inválidos | Precio negativo, email mal formado |

### Códigos de Error Servidor (5xx)

| Código | Cuándo usar | Ejemplo |
|--------|-------------|---------|
| `500` | Error interno | Excepción no controlada |
| `503` | Servicio no disponible | Base de datos desconectada |

---

## 🛠️ MÉTODOS HTTP Y SEMÁNTICA

### GET - Obtener Recursos

```javascript
// GET /productos - Listar todos
async handleListProductos(req, context) {
  const { tipo, estado, limit = 50, offset = 0 } = req.query;

  let productos = Array.from(this.productos.values());

  // Filtrar
  if (tipo) {
    productos = productos.filter(p => p.tipo === tipo);
  }
  if (estado) {
    productos = productos.filter(p => p.estado === estado);
  }

  // Paginar
  const total = productos.length;
  productos = productos.slice(offset, offset + parseInt(limit));

  return {
    status: 200,
    data: {
      productos,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }
  };
}

// GET /productos/:id - Obtener uno
async handleGetProducto(req, context) {
  const { id } = req.params;

  const producto = this.productos.get(id);

  if (!producto) {
    return {
      status: 404,
      data: { error: `Producto ${id} no encontrado` }
    };
  }

  return {
    status: 200,
    data: producto
  };
}
```

### POST - Crear Recurso

```javascript
// POST /productos
async handleCreateProducto(req, context) {
  const { nombre, precio, tipo = 'general' } = req.body;

  // Validar
  if (!nombre) {
    return {
      status: 400,
      data: { error: 'nombre es requerido' }
    };
  }

  if (typeof precio !== 'number' || precio <= 0) {
    return {
      status: 400,
      data: { error: 'precio debe ser un número positivo' }
    };
  }

  // Crear
  const producto = {
    id: `producto_${Date.now()}`,
    nombre,
    precio,
    tipo,
    estado: 'activo',
    created_at: new Date().toISOString()
  };

  this.productos.set(producto.id, producto);

  // Evento
  await this.eventBus.publish('producto.creado', {
    producto_id: producto.id,
    nombre: producto.nombre,
    precio: producto.precio
  }, {
    correlationId: context.correlationId
  });

  // Métricas y logs
  this.metrics.increment('producto.creado.total');
  this.logger.info('producto.creado', {
    producto_id: producto.id,
    correlation_id: context.correlationId
  });

  return {
    status: 201,
    data: producto
  };
}
```

### PUT - Reemplazar Recurso Completo

```javascript
// PUT /productos/:id
async handleReplaceProducto(req, context) {
  const { id } = req.params;
  const { nombre, precio, tipo, estado } = req.body;

  // Verificar existencia
  if (!this.productos.has(id)) {
    return {
      status: 404,
      data: { error: `Producto ${id} no encontrado` }
    };
  }

  // Validar todos los campos (PUT reemplaza todo)
  if (!nombre || typeof precio !== 'number') {
    return {
      status: 400,
      data: { error: 'nombre y precio son requeridos' }
    };
  }

  // Reemplazar
  const producto = {
    id,
    nombre,
    precio,
    tipo: tipo || 'general',
    estado: estado || 'activo',
    updated_at: new Date().toISOString()
  };

  this.productos.set(id, producto);

  // Evento
  await this.eventBus.publish('producto.actualizado', {
    producto_id: id,
    updates: producto
  }, {
    correlationId: context.correlationId
  });

  return {
    status: 200,
    data: producto
  };
}
```

### PATCH - Actualizar Parcialmente

```javascript
// PATCH /productos/:id
async handleUpdateProducto(req, context) {
  const { id } = req.params;
  const updates = req.body;

  // Verificar existencia
  const producto = this.productos.get(id);
  if (!producto) {
    return {
      status: 404,
      data: { error: `Producto ${id} no encontrado` }
    };
  }

  // Validar updates específicos
  if (updates.precio !== undefined && (typeof updates.precio !== 'number' || updates.precio <= 0)) {
    return {
      status: 400,
      data: { error: 'precio debe ser un número positivo' }
    };
  }

  // Aplicar updates parciales
  const productoActualizado = {
    ...producto,
    ...updates,
    updated_at: new Date().toISOString()
  };

  this.productos.set(id, productoActualizado);

  // Evento
  await this.eventBus.publish('producto.actualizado', {
    producto_id: id,
    updates
  }, {
    correlationId: context.correlationId
  });

  return {
    status: 200,
    data: productoActualizado
  };
}
```

### DELETE - Eliminar Recurso

```javascript
// DELETE /productos/:id
async handleDeleteProducto(req, context) {
  const { id } = req.params;

  // Verificar existencia
  if (!this.productos.has(id)) {
    return {
      status: 404,
      data: { error: `Producto ${id} no encontrado` }
    };
  }

  // Eliminar
  this.productos.delete(id);

  // Evento
  await this.eventBus.publish('producto.eliminado', {
    producto_id: id
  }, {
    correlationId: context.correlationId
  });

  // Log
  this.logger.info('producto.eliminado', {
    producto_id: id,
    correlation_id: context.correlationId
  });

  return {
    status: 200,
    data: { message: `Producto ${id} eliminado` }
  };
}
```

---

## ✅ VALIDACIÓN DE INPUTS

### Patrón: Validación Manual

```javascript
async handleCreateProducto(req, context) {
  const { nombre, precio, email, cantidad } = req.body;

  // String requerido
  if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
    return {
      status: 400,
      data: { error: 'nombre es requerido y debe ser un string no vacío' }
    };
  }

  // Número positivo
  if (typeof precio !== 'number' || precio <= 0) {
    return {
      status: 400,
      data: { error: 'precio debe ser un número positivo' }
    };
  }

  // Email (si presente)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      status: 400,
      data: { error: 'email tiene formato inválido' }
    };
  }

  // Entero en rango
  if (cantidad !== undefined) {
    if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 1000) {
      return {
        status: 400,
        data: { error: 'cantidad debe ser un entero entre 0 y 1000' }
      };
    }
  }

  // Validación OK, continuar...
}
```

### Patrón: Función de Validación Reutilizable

```javascript
class MiModulo {
  validateProducto(data, isUpdate = false) {
    const errors = [];

    if (!isUpdate || data.nombre !== undefined) {
      if (!data.nombre || typeof data.nombre !== 'string') {
        errors.push('nombre es requerido y debe ser string');
      }
    }

    if (!isUpdate || data.precio !== undefined) {
      if (typeof data.precio !== 'number' || data.precio <= 0) {
        errors.push('precio debe ser un número positivo');
      }
    }

    return errors;
  }

  async handleCreateProducto(req, context) {
    const errors = this.validateProducto(req.body);

    if (errors.length > 0) {
      return {
        status: 400,
        data: { errors }
      };
    }

    // Continuar...
  }

  async handleUpdateProducto(req, context) {
    const errors = this.validateProducto(req.body, true);

    if (errors.length > 0) {
      return {
        status: 400,
        data: { errors }
      };
    }

    // Continuar...
  }
}
```

### Patrón: Validaciones Comunes

```javascript
// Helpers de validación
const validators = {
  isString: (val) => typeof val === 'string' && val.trim() !== '',
  isNumber: (val) => typeof val === 'number' && !isNaN(val),
  isPositive: (val) => typeof val === 'number' && val > 0,
  isInteger: (val) => Number.isInteger(val),
  isEmail: (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
  isUUID: (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val),
  isDate: (val) => !isNaN(Date.parse(val)),
  isIn: (val, options) => options.includes(val),
  minLength: (val, min) => typeof val === 'string' && val.length >= min,
  maxLength: (val, max) => typeof val === 'string' && val.length <= max,
  inRange: (val, min, max) => typeof val === 'number' && val >= min && val <= max
};
```

---

## 🔐 ENDPOINTS OBLIGATORIOS

### Health Check

```javascript
// GET /health
async handleHealthCheck(req, context) {
  return {
    status: 200,
    data: {
      status: 'healthy',
      module: this.name,
      version: this.version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  };
}
```

### Métricas

```javascript
// GET /metrics
async handleGetMetrics(req, context) {
  return {
    status: 200,
    data: {
      counters: {
        'producto.creado.total': this.internalMetrics.productos_creados,
        'producto.actualizado.total': this.internalMetrics.productos_actualizados,
        'producto.eliminado.total': this.internalMetrics.productos_eliminados,
        'errores.total': this.internalMetrics.errores
      },
      gauges: {
        'productos.activos.count': this.productos.size
      },
      timestamp: new Date().toISOString()
    }
  };
}
```

---

## 📋 DECLARAR EN module.json

```json
{
  "name": "productos",
  "version": "1.0.0",

  "apis": [
    {
      "method": "GET",
      "path": "/productos",
      "handler": "handleListProductos",
      "description": "Listar todos los productos",
      "query_params": [
        {"name": "tipo", "type": "string", "description": "Filtrar por tipo"},
        {"name": "estado", "type": "string", "description": "Filtrar por estado"},
        {"name": "limit", "type": "number", "default": 50},
        {"name": "offset", "type": "number", "default": 0}
      ]
    },
    {
      "method": "GET",
      "path": "/productos/:id",
      "handler": "handleGetProducto",
      "description": "Obtener un producto por ID"
    },
    {
      "method": "POST",
      "path": "/productos",
      "handler": "handleCreateProducto",
      "description": "Crear nuevo producto",
      "request_schema": {
        "$ref": "./schemas/producto.json#/definitions/create_request"
      },
      "response_schema": {
        "$ref": "./schemas/producto.json#/definitions/producto"
      }
    },
    {
      "method": "PUT",
      "path": "/productos/:id",
      "handler": "handleReplaceProducto",
      "description": "Reemplazar producto completo"
    },
    {
      "method": "PATCH",
      "path": "/productos/:id",
      "handler": "handleUpdateProducto",
      "description": "Actualizar producto parcialmente"
    },
    {
      "method": "DELETE",
      "path": "/productos/:id",
      "handler": "handleDeleteProducto",
      "description": "Eliminar producto"
    },
    {
      "method": "GET",
      "path": "/health",
      "handler": "handleHealthCheck",
      "description": "Health check del módulo"
    },
    {
      "method": "GET",
      "path": "/metrics",
      "handler": "handleGetMetrics",
      "description": "Métricas del módulo"
    }
  ]
}
```

---

## ❌ ANTI-PATRONES (NO HACER)

### 1. Firma Incorrecta

```javascript
// ❌ MAL
async handleCreate(context) {
  const data = context.body;  // context no tiene body
}

// ❌ MAL
async handleCreate(req) {
  const correlationId = req.correlationId;  // req no tiene correlationId
}

// ✅ BIEN
async handleCreate(req, context) {
  const data = req.body;
  const correlationId = context.correlationId;
}
```

### 2. Retorno Incorrecto

```javascript
// ❌ MAL - Sin status
return { producto };

// ❌ MAL - body en vez de data
return { status: 200, body: producto };

// ❌ MAL - Throw directo
throw new Error('No encontrado');

// ✅ BIEN
return { status: 200, data: producto };

// ✅ BIEN - Error controlado
return { status: 404, data: { error: 'No encontrado' } };
```

### 3. Sin Validación

```javascript
// ❌ MAL - Confiar en el input
async handleCreate(req, context) {
  const producto = {
    id: `producto_${Date.now()}`,
    nombre: req.body.nombre,  // Puede ser undefined
    precio: req.body.precio   // Puede ser string
  };
  this.productos.set(producto.id, producto);
  return { status: 201, data: producto };
}

// ✅ BIEN - Validar primero
async handleCreate(req, context) {
  const { nombre, precio } = req.body;

  if (!nombre) {
    return { status: 400, data: { error: 'nombre requerido' } };
  }

  if (typeof precio !== 'number' || precio <= 0) {
    return { status: 400, data: { error: 'precio inválido' } };
  }

  // Ahora sí crear...
}
```

### 4. Códigos HTTP Incorrectos

```javascript
// ❌ MAL - 200 para creación
async handleCreate(req, context) {
  const producto = { /* ... */ };
  return { status: 200, data: producto };  // Debería ser 201
}

// ❌ MAL - 500 para not found
async handleGet(req, context) {
  const producto = this.productos.get(req.params.id);
  if (!producto) {
    return { status: 500, data: { error: 'No encontrado' } };  // Debería ser 404
  }
}

// ❌ MAL - 200 para error de validación
async handleCreate(req, context) {
  if (!req.body.nombre) {
    return { status: 200, data: { error: 'nombre requerido' } };  // Debería ser 400
  }
}
```

### 5. Sin correlationId en Logs

```javascript
// ❌ MAL
this.logger.info('producto.creado', { producto_id });

// ✅ BIEN
this.logger.info('producto.creado', {
  producto_id,
  correlation_id: context.correlationId
});
```

### 6. Error Handler sin Return

```javascript
// ❌ MAL - Sin return en catch
async handleCreate(req, context) {
  try {
    // ...
    return { status: 201, data: producto };
  } catch (error) {
    this.logger.error('error', { error });
    // Falta return! El handler no responde nada
  }
}

// ✅ BIEN
async handleCreate(req, context) {
  try {
    // ...
    return { status: 201, data: producto };
  } catch (error) {
    this.logger.error('error', { error });
    return { status: 500, data: { error: 'Error interno' } };
  }
}
```

---

## 🧪 EJEMPLO COMPLETO

```javascript
class ProductosModule {
  constructor() {
    this.name = 'productos';
    this.version = '1.0.0';
    this.productos = new Map();
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.internalMetrics = {
      productos_creados: 0,
      productos_actualizados: 0,
      errores: 0
    };
  }

  async onLoad(core) {
    this.eventBus = core.eventBus;
    this.logger = core.logger;
    this.metrics = core.metrics;
  }

  // ==========================================
  // Validación
  // ==========================================

  validateProducto(data, isUpdate = false) {
    const errors = [];

    if (!isUpdate) {
      if (!data.nombre || typeof data.nombre !== 'string') {
        errors.push('nombre es requerido');
      }
      if (typeof data.precio !== 'number' || data.precio <= 0) {
        errors.push('precio debe ser positivo');
      }
    } else {
      if (data.nombre !== undefined && typeof data.nombre !== 'string') {
        errors.push('nombre debe ser string');
      }
      if (data.precio !== undefined && (typeof data.precio !== 'number' || data.precio <= 0)) {
        errors.push('precio debe ser positivo');
      }
    }

    return errors;
  }

  // ==========================================
  // HTTP Handlers
  // ==========================================

  async handleListProductos(req, context) {
    try {
      const { tipo, estado, limit = 50, offset = 0 } = req.query;

      let productos = Array.from(this.productos.values());

      if (tipo) {
        productos = productos.filter(p => p.tipo === tipo);
      }

      if (estado) {
        productos = productos.filter(p => p.estado === estado);
      }

      const total = productos.length;
      productos = productos.slice(
        parseInt(offset),
        parseInt(offset) + parseInt(limit)
      );

      this.logger.info('productos.listados', {
        total,
        filtros: { tipo, estado },
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: { productos, total, limit: parseInt(limit), offset: parseInt(offset) }
      };

    } catch (error) {
      this.internalMetrics.errores++;
      this.logger.error('productos.list.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return { status: 500, data: { error: 'Error interno' } };
    }
  }

  async handleGetProducto(req, context) {
    try {
      const { id } = req.params;

      const producto = this.productos.get(id);

      if (!producto) {
        return {
          status: 404,
          data: { error: `Producto ${id} no encontrado` }
        };
      }

      return { status: 200, data: producto };

    } catch (error) {
      this.internalMetrics.errores++;
      this.logger.error('producto.get.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return { status: 500, data: { error: 'Error interno' } };
    }
  }

  async handleCreateProducto(req, context) {
    const start = Date.now();

    try {
      // Validar
      const errors = this.validateProducto(req.body);
      if (errors.length > 0) {
        return { status: 400, data: { errors } };
      }

      const { nombre, precio, tipo = 'general' } = req.body;

      // Crear
      const producto = {
        id: `producto_${Date.now()}`,
        nombre,
        precio,
        tipo,
        estado: 'activo',
        created_at: new Date().toISOString()
      };

      this.productos.set(producto.id, producto);

      // Evento
      await this.eventBus.publish('producto.creado', {
        producto_id: producto.id,
        nombre,
        precio
      }, {
        correlationId: context.correlationId
      });

      // Métricas
      this.internalMetrics.productos_creados++;
      this.metrics.increment('producto.creado.total');
      this.metrics.timing('producto.create.duration', Date.now() - start);

      // Log
      this.logger.info('producto.creado', {
        producto_id: producto.id,
        correlation_id: context.correlationId,
        duration: Date.now() - start
      });

      return { status: 201, data: producto };

    } catch (error) {
      this.internalMetrics.errores++;
      this.metrics.increment('producto.create.error');
      this.logger.error('producto.create.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return { status: 500, data: { error: 'Error interno' } };
    }
  }

  async handleUpdateProducto(req, context) {
    try {
      const { id } = req.params;

      // Verificar existencia
      const producto = this.productos.get(id);
      if (!producto) {
        return {
          status: 404,
          data: { error: `Producto ${id} no encontrado` }
        };
      }

      // Validar
      const errors = this.validateProducto(req.body, true);
      if (errors.length > 0) {
        return { status: 400, data: { errors } };
      }

      // Actualizar
      const productoActualizado = {
        ...producto,
        ...req.body,
        updated_at: new Date().toISOString()
      };

      this.productos.set(id, productoActualizado);

      // Evento
      await this.eventBus.publish('producto.actualizado', {
        producto_id: id,
        updates: req.body
      }, {
        correlationId: context.correlationId
      });

      // Métricas y log
      this.internalMetrics.productos_actualizados++;
      this.logger.info('producto.actualizado', {
        producto_id: id,
        correlation_id: context.correlationId
      });

      return { status: 200, data: productoActualizado };

    } catch (error) {
      this.internalMetrics.errores++;
      this.logger.error('producto.update.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return { status: 500, data: { error: 'Error interno' } };
    }
  }

  async handleDeleteProducto(req, context) {
    try {
      const { id } = req.params;

      if (!this.productos.has(id)) {
        return {
          status: 404,
          data: { error: `Producto ${id} no encontrado` }
        };
      }

      this.productos.delete(id);

      // Evento
      await this.eventBus.publish('producto.eliminado', {
        producto_id: id
      }, {
        correlationId: context.correlationId
      });

      this.logger.info('producto.eliminado', {
        producto_id: id,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: { message: `Producto ${id} eliminado` }
      };

    } catch (error) {
      this.internalMetrics.errores++;
      this.logger.error('producto.delete.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return { status: 500, data: { error: 'Error interno' } };
    }
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        counters: this.internalMetrics,
        gauges: {
          'productos.count': this.productos.size
        },
        timestamp: new Date().toISOString()
      }
    };
  }

  async onUnload() {
    this.logger.info('productos.unloading', { module: this.name });
  }
}

module.exports = ProductosModule;
```

---

## ✅ CHECKLIST DE VALIDACIÓN

Antes de considerar tu API completa, verifica:

- [ ] **Firma:** Todos los handlers usan `(req, context)`
- [ ] **Respuesta:** Todos retornan `{ status, data }`
- [ ] **Validación:** Inputs validados antes de procesar
- [ ] **Códigos HTTP:** Usar código correcto (201 create, 404 not found, etc.)
- [ ] **correlationId:** Incluido en todos los logs
- [ ] **Try-catch:** Todos los handlers tienen manejo de errores
- [ ] **Eventos:** Publicar eventos después de operaciones
- [ ] **Métricas:** Counters y timings para operaciones
- [ ] **Health check:** Endpoint `/health` implementado
- [ ] **Metrics:** Endpoint `/metrics` implementado
- [ ] **module.json:** Todos los endpoints documentados

---

## 🎓 REFERENCIAS

**Templates relacionados:**
- `TEMPLATE_MODULO.md` - Estructura general de módulos
- `TEMPLATE_EVENTOS.md` - Comunicación via eventos
- `TEMPLATE_UI.md` - Interfaces de usuario

**Código de referencia:**
- `event-core/modules/cuentas/index.js`
- `event-core/modules/productos/index.js`
- `event-core/modules/cobros/index.js`

---

## 💡 FILOSOFÍA

> "Si tu handler no valida inputs, no está completo. Si no tiene try-catch, no está listo para producción."

- **Validación** antes de todo
- **Códigos HTTP** semánticamente correctos
- **Errores** siempre controlados
- **Trazabilidad** con correlationId

---

**Si tu API no pasa esta validación, NO está completa.**

**Versión:** 1.0.0
**Basado en:** Event Core Router System
**Autor:** Pizzepos Team
