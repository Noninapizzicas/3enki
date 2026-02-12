# 📡 TEMPLATE: Cómo Usar Eventos Correctamente

**Basado en:** Event Bus de Pizzepos (EventEmitter + MQTT)

**Status:** Este es EL estándar. TODA comunicación entre módulos debe seguir este template.

---

## 🎯 PRINCIPIOS NO NEGOCIABLES

### 1. ✅ 100% Event-Driven + Declarativo

**SÍ (declarar suscripciones en module.json — auto-wired por el loader):**
```json
{
  "events": {
    "subscribes": [
      { "event": "cuenta.creada", "handler": "onCuentaCreada" }
    ]
  }
}
```

```javascript
// Publicar evento (esto sí se hace en código)
await this.eventBus.publish('pedido.creado', {
  pedido_id: pedido.id,
  cliente: pedido.cliente,
  total: pedido.total
}, {
  correlationId: context.correlationId
});
```

**NO:**
```javascript
// ❌ NUNCA suscribirse imperativamente (el loader lo hace desde module.json)
await this.eventBus.subscribe('cuenta.creada', this.onCuentaCreada.bind(this));

// ❌ NUNCA hacer HTTP interno
const response = await fetch('http://localhost:3339/modules/otro-modulo/datos');

// ❌ NUNCA acceder directamente a otros módulos
const otroModulo = core.getModule('otro-modulo');
const data = await otroModulo.getData();
```

### 2. ✅ Siempre correlationId

**OBLIGATORIO en toda publicación:**

```javascript
await this.eventBus.publish('evento.tipo', datos, {
  correlationId: context.correlationId  // ← SIEMPRE
});
```

### 3. ✅ Try-Catch en TODOS los Handlers

```javascript
async onEventoRecibido(envelope) {
  try {
    // Procesar evento...
  } catch (error) {
    this.logger.error('evento.handler.error', {
      error: error.message,
      event_id: envelope.event_id
    });
    // NO relanzar - evitar cascada de errores
  }
}
```

### 4. ✅ Validar Payloads Recibidos

```javascript
async onPedidoCreado(envelope) {
  const { pedido_id, total } = envelope.data;

  if (!pedido_id || typeof total !== 'number') {
    this.logger.warn('pedido.creado.invalid', {
      reason: 'Payload inválido',
      event_id: envelope.event_id
    });
    return;
  }

  // Procesar...
}
```

### 5. ✅ Logging Estructurado

```javascript
this.logger.info('pedido.creado.procesado', {
  pedido_id: pedido.id,
  total: pedido.total,
  correlation_id: envelope.metadata?.correlationId,
  event_id: envelope.event_id
});
```

---

## 📦 ESTRUCTURA DEL EVENT ENVELOPE

Cada evento está envuelto en un **Event Envelope** estándar:

```javascript
{
  // Identificación
  event_id: "550e8400-e29b-41d4-a716-446655440000",  // UUID único
  event_type: "pedido.creado",                        // dominio.accion
  timestamp: "2025-01-19T14:30:00.123Z",             // ISO 8601

  // Origen
  source: {
    core_id: "core-a",                              // Core que emite
    module_id: "pedidos"                            // Módulo que emite
  },

  // Payload
  data: {                                           // Tu data
    pedido_id: "pedido_123",
    cliente: "Juan Pérez",
    total: 45.99
  },

  // Trazabilidad
  metadata: {                                       // Metadata adicional
    correlationId: "uuid-para-trazar",
    custom_field: "valor"
  },

  // Tracing (opcional)
  trace: {
    trace_id: "0af7651916cd43dd8448eb211c80319c",
    span_id: "b7ad6b7169203331"
  }
}
```

---

## 🔌 API DEL EVENT BUS

### Métodos Principales

| Método | Uso | Retorna |
|--------|-----|---------|
| `publish(type, data, options)` | Publicar evento | `Promise<void>` |
| `subscribe(type, handler)` | Suscribirse | `Function` (unsubscribe) |
| `emit(type, data, options)` | Alias de publish | `Promise<void>` |
| `on(type, handler)` | Alias de subscribe | `Function` (unsubscribe) |
| `once(type, handler?)` | Escuchar una vez | `Promise` o `Function` |
| `emitTo(coreId, type, data)` | Enviar a core específico | `Promise<void>` |
| `getStats()` | Estadísticas | `Object` |

### Ejemplos de Uso

#### Publicar Evento
```javascript
await this.eventBus.publish('pedido.creado', {
  pedido_id: pedido.id,
  cliente: pedido.cliente,
  total: pedido.total,
  timestamp: new Date().toISOString()
}, {
  correlationId: context.correlationId,
  moduleId: 'pedidos'
});
```

#### Suscribirse a Evento
```javascript
async onLoad(core) {
  this.eventBus = core.eventBus;

  // Suscribirse en onLoad
  await this.eventBus.subscribe(
    'pedido.creado',
    this.onPedidoCreado.bind(this)
  );
}

async onPedidoCreado(envelope) {
  try {
    const { pedido_id, total } = envelope.data;
    // Procesar...
  } catch (error) {
    this.logger.error('pedido.creado.error', { error });
  }
}
```

#### Esperar Evento Único
```javascript
// Útil para request-response
const respuesta = await this.eventBus.once('datos.respondidos');
console.log(respuesta.data);
```

---

## 🏷️ CONVENCIONES DE NOMBRES

### Formato

```
<dominio>.<accion>[.<sub-entidad>]
```

### Ejemplos por Dominio

| Dominio | Eventos |
|---------|---------|
| **pedido** | `pedido.creado`, `pedido.actualizado`, `pedido.completado`, `pedido.item.added` |
| **cuenta** | `cuenta.creada`, `cuenta.actualizada`, `cuenta.estado-changed`, `cuenta.eliminada` |
| **cobro** | `cobro.iniciado`, `cobro.completado`, `cobro.fallido` |
| **producto** | `producto.creado`, `producto.actualizado`, `producto.stock.updated` |
| **cocina** | `cocina.pedido.recibido`, `cocina.pedido.preparado`, `cocina.pedido.listo` |
| **caja** | `caja.abierta`, `caja.cerrada`, `dia.iniciado` |

### Acciones Estándar

| Acción | Cuándo usar |
|--------|-------------|
| `creado` / `created` | Entidad nueva creada |
| `actualizado` / `updated` | Entidad modificada |
| `eliminado` / `deleted` | Entidad borrada |
| `completado` / `completed` | Proceso terminado exitosamente |
| `iniciado` / `started` | Proceso comenzado |
| `fallido` / `failed` | Proceso falló |
| `changed` | Estado cambió |
| `solicitado` / `requested` | Solicitud hecha |

---

## 📋 PATRONES DE IMPLEMENTACIÓN

### Patrón 1: Suscripción Declarativa en module.json (RECOMENDADO)

**module.json:**
```json
{
  "events": {
    "subscribes": [
      { "event": "pedido.creado", "handler": "onPedidoCreado" },
      { "event": "cuenta.actualizada", "handler": "onCuentaActualizada" }
    ]
  }
}
```

**index.js:**
```javascript
class MiModulo {
  constructor() {
    this.name = 'mi-modulo';
    this.eventBus = null;
    this.logger = null;
  }

  async onLoad(core) {
    this.eventBus = core.eventBus;
    this.logger = core.logger;

    // NO suscribirse aquí — el loader auto-wira desde module.json
    this.logger.info('modulo.loaded', { module: this.name });
  }

  // Handler auto-wired por el loader
  async onPedidoCreado(envelope) {
    try {
      const { pedido_id, total } = envelope.data;

      this.logger.info('pedido.creado.recibido', {
        pedido_id,
        correlation_id: envelope.metadata?.correlationId
      });

      // Procesar...

    } catch (error) {
      this.logger.error('pedido.creado.error', {
        error: error.message,
        event_id: envelope.event_id
      });
    }
  }
}
```

### Patrón 2: Publicación con Métricas

```javascript
async handleCreatePedido(req, context) {
  const start = Date.now();

  try {
    const pedido = {
      id: `pedido_${Date.now()}`,
      cliente: req.body.cliente,
      total: req.body.total,
      timestamp: new Date().toISOString()
    };

    // Guardar
    this.pedidos.set(pedido.id, pedido);

    // Publicar evento
    await this.eventBus.publish('pedido.creado', {
      pedido_id: pedido.id,
      cliente: pedido.cliente,
      total: pedido.total,
      timestamp: pedido.timestamp
    }, {
      correlationId: context.correlationId
    });

    // Métricas
    this.metrics.increment('pedido.creado.total');
    this.metrics.timing('pedido.create.duration', Date.now() - start);

    // Log
    this.logger.info('pedido.creado', {
      pedido_id: pedido.id,
      correlation_id: context.correlationId,
      duration: Date.now() - start
    });

    return { status: 201, data: pedido };

  } catch (error) {
    this.metrics.increment('pedido.create.error');
    this.logger.error('pedido.create.error', {
      error: error.message,
      correlation_id: context.correlationId
    });

    return { status: 500, data: { error: error.message } };
  }
}
```

### Patrón 3: Request-Response vía Eventos

```javascript
// Módulo solicitante
async obtenerDatos(query, correlationId) {
  // Publicar solicitud
  await this.eventBus.publish('datos.solicitados', {
    query,
    response_event: 'datos.respondidos'
  }, {
    correlationId
  });

  // Esperar respuesta
  const respuesta = await this.eventBus.once('datos.respondidos');
  return respuesta.data;
}

// Módulo que responde
async onDatosSolicitados(envelope) {
  try {
    const { query, response_event } = envelope.data;

    const datos = await this.buscarDatos(query);

    // Publicar respuesta
    await this.eventBus.publish(response_event, {
      datos,
      query
    }, {
      correlationId: envelope.metadata?.correlationId
    });

  } catch (error) {
    this.logger.error('datos.solicitados.error', { error });
  }
}
```

### Patrón 4: Dead Letter Queue (DLQ)

```javascript
async onPedidoCreado(envelope) {
  try {
    // Validar
    if (!envelope.data.pedido_id) {
      throw new Error('pedido_id requerido');
    }

    // Procesar...

  } catch (error) {
    this.logger.error('pedido.creado.error', {
      error: error.message,
      event_id: envelope.event_id
    });

    // Enviar a DLQ para reprocesar después
    await this.eventBus.publish('dlq.pedido.creado', {
      original_event: envelope,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
```

### Patrón 5: Retry con Backoff

```javascript
async publishWithRetry(eventType, data, options = {}, maxRetries = 3) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await this.eventBus.publish(eventType, data, options);
      return; // Éxito
    } catch (error) {
      lastError = error;

      this.logger.warn('event.publish.retry', {
        event_type: eventType,
        attempt: i + 1,
        max_retries: maxRetries,
        error: error.message
      });

      // Esperar con backoff exponencial
      await new Promise(resolve =>
        setTimeout(resolve, 1000 * Math.pow(2, i))
      );
    }
  }

  throw lastError;
}
```

---

## ⚠️ MANEJO DE ERRORES

### Nivel 1: En la Publicación

```javascript
async handleCreatePedido(req, context) {
  try {
    const pedido = { /* ... */ };

    await this.eventBus.publish('pedido.creado', pedido, {
      correlationId: context.correlationId
    });

    return { status: 201, data: pedido };

  } catch (error) {
    // Error publicando - puede ser MQTT desconectado
    this.logger.error('pedido.create.publish.error', {
      error: error.message,
      correlation_id: context.correlationId
    });

    return { status: 500, data: { error: 'Error interno' } };
  }
}
```

### Nivel 2: En el Handler de Evento

```javascript
async onPedidoCreado(envelope) {
  try {
    // Validar payload
    const { pedido_id, total } = envelope.data;

    if (!pedido_id) {
      this.logger.warn('pedido.creado.invalid', {
        reason: 'Missing pedido_id',
        event_id: envelope.event_id
      });
      return; // Ignorar evento inválido
    }

    // Procesar
    await this.procesarPedido(pedido_id, total);

    this.logger.info('pedido.creado.procesado', {
      pedido_id,
      correlation_id: envelope.metadata?.correlationId
    });

  } catch (error) {
    // Capturar error - NO relanzar
    this.logger.error('pedido.creado.handler.error', {
      error: error.message,
      event_id: envelope.event_id,
      stack: error.stack
    });

    this.metrics.increment('pedido.creado.handler.error');

    // Opcional: enviar a DLQ
    await this.eventBus.publish('dlq.pedido.creado', {
      original_event: envelope,
      error: error.message
    });
  }
}
```

---

## 📊 CATÁLOGO DE EVENTOS PRINCIPALES

### Dominio: Pedidos

| Evento | Payload | Publicado por |
|--------|---------|---------------|
| `pedido.creado` | `{pedido_id, cliente, total, timestamp}` | pedidos |
| `pedido.actualizado` | `{pedido_id, updates}` | pedidos |
| `pedido.completado` | `{pedido_id, timestamp}` | pedidos |
| `pedido.item.added` | `{pedido_id, item_id, cantidad}` | pedidos |
| `pedido.enviado-cocina` | `{pedido_id, items}` | pedidos |

### Dominio: Cuentas

| Evento | Payload | Publicado por |
|--------|---------|---------------|
| `cuenta.creada` | `{cuenta_id, tipo, nombre, timestamp}` | cuentas |
| `cuenta.actualizada` | `{cuenta_id, updates}` | cuentas |
| `cuenta.estado-changed` | `{cuenta_id, estado_anterior, estado_nuevo}` | cuentas |
| `cuenta.eliminada` | `{cuenta_id}` | cuentas |

### Dominio: Cobros

| Evento | Payload | Publicado por |
|--------|---------|---------------|
| `cobro.iniciado` | `{cobro_id, cuenta_id, total, timestamp}` | cobros |
| `cobro.completado` | `{cobro_id, cuenta_id, metodo_pago, total}` | cobros |
| `cobro.fallido` | `{cobro_id, razon, timestamp}` | cobros |

### Dominio: Sistema

| Evento | Payload | Publicado por |
|--------|---------|---------------|
| `caja.abierta` | `{timestamp, usuario_id}` | sistema |
| `caja.cerrada` | `{timestamp, totales}` | sistema |
| `dia.iniciado` | `{fecha, timestamp}` | sistema |

---

## ❌ ANTI-PATRONES (NO HACER)

### 1. HTTP Interno entre Módulos

```javascript
// ❌ MAL - Encontrado en pos-app, admin-panel
async fetchInternal(path) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3339,
      path: `/modules/${path}`
    }, (res) => { /* ... */ });
    req.end();
  });
}

// ✅ BIEN
await this.eventBus.publish('datos.solicitados', { query });
const respuesta = await this.eventBus.once('datos.respondidos');
```

### 2. Sin correlationId

```javascript
// ❌ MAL
await this.eventBus.publish('pedido.creado', pedido);

this.logger.info('pedido.creado', { pedido_id });

// ✅ BIEN
await this.eventBus.publish('pedido.creado', pedido, {
  correlationId: context.correlationId
});

this.logger.info('pedido.creado', {
  pedido_id,
  correlation_id: context.correlationId
});
```

### 3. Event Handler sin Try-Catch

```javascript
// ❌ MAL - Si falla, puede crashear el módulo
async onPedidoCreado(envelope) {
  const { pedido_id } = envelope.data;
  await this.procesarPedido(pedido_id); // Error no manejado
}

// ✅ BIEN
async onPedidoCreado(envelope) {
  try {
    const { pedido_id } = envelope.data;
    await this.procesarPedido(pedido_id);
  } catch (error) {
    this.logger.error('pedido.creado.error', { error });
    // NO relanzar
  }
}
```

### 4. Ignorar Eventos Silenciosamente

```javascript
// ❌ MAL
async onPedidoCreado(envelope) {
  if (!envelope.data.pedido_id) {
    return; // Silencioso - imposible debuggear
  }
}

// ✅ BIEN
async onPedidoCreado(envelope) {
  if (!envelope.data.pedido_id) {
    this.logger.warn('pedido.creado.invalid', {
      reason: 'Missing pedido_id',
      event_id: envelope.event_id
    });
    return;
  }
}
```

### 5. Acceso Directo a Módulos

```javascript
// ❌ MAL
const pedidosModule = this.core.getModule('pedidos');
const pedido = await pedidosModule.getPedido(id);

// ✅ BIEN
await this.eventBus.publish('pedido.solicitado', { pedido_id: id });
const { data } = await this.eventBus.once('pedido.respondido');
```

### 6. Publicar sin Await

```javascript
// ❌ MAL - No espera, posible pérdida de evento
this.eventBus.publish('pedido.creado', pedido);

// ✅ BIEN
await this.eventBus.publish('pedido.creado', pedido, {
  correlationId: context.correlationId
});
```

---

## 📝 DECLARAR EN module.json (Auto-Wiring)

**Obligatorio declarar eventos publicados, suscritos (con handler), y UI handlers:**

```json
{
  "name": "pedidos",
  "version": "1.0.0",

  "events": {
    "publishes": [
      {
        "event": "pedido.creado",
        "description": "Cuando un nuevo pedido es creado",
        "schema": {
          "$ref": "./schemas/events.json#/definitions/pedido_creado"
        }
      }
    ],

    "subscribes": [
      {
        "event": "cuenta.creada",
        "description": "Para crear pedido automático cuando se abre cuenta",
        "handler": "onCuentaCreada"
      },
      {
        "event": "cobro.completado",
        "description": "Para marcar pedido como pagado",
        "handler": "onCobroCompletado"
      }
    ]
  },

  "ui_handlers": [
    { "domain": "pedido", "action": "list", "handler": "handleUIList" },
    { "domain": "pedido", "action": "create", "handler": "handleUICreate" }
  ]
}
```

> **El loader lee estos campos y auto-conecta todo.** No escribas `eventBus.subscribe()` ni `uiHandler.register()` en tu código.
> **Excepción:** Wildcards (`agent.*.completed`) y suscripciones dinámicas sí van imperativas en `onLoad()`.

---

## 🔍 DEBUGGING

### Ver Estadísticas del Event Bus

```javascript
const stats = this.eventBus.getStats();
console.log(stats);
// {
//   core_id: 'core-a',
//   listeners: {
//     'pedido.creado': 2,
//     'cuenta.actualizada': 1
//   },
//   mqtt_connected: true
// }
```

### Buscar por correlationId

```bash
# En logs
grep "correlation_id.*uuid-aqui" /var/log/pizzepos.log

# Ver flujo completo de un request
grep "uuid-aqui" /var/log/pizzepos.log | sort -t'T' -k2
```

### Verificar Suscripciones

```javascript
// En onLoad del módulo
this.logger.info('modulo.suscripciones', {
  eventos: ['pedido.creado', 'cuenta.actualizada']
});
```

---

## ✅ CHECKLIST DE VALIDACIÓN

Antes de considerar tus eventos correctos, verifica:

- [ ] **correlationId:** SIEMPRE incluido en publish() y logs
- [ ] **Try-catch:** TODOS los event handlers tienen try-catch
- [ ] **Validación:** Payloads recibidos son validados
- [ ] **Logging:** Eventos loggeados con datos relevantes
- [ ] **Métricas:** Counters para eventos enviados/recibidos/errores
- [ ] **Documentación:** module.json documenta publishes/subscribes
- [ ] **Sin HTTP interno:** CERO fetchInternal() o http.request()
- [ ] **Sin acceso directo:** CERO getModule() para llamar a otros
- [ ] **Nombres estándar:** Formato `dominio.accion`
- [ ] **DLQ:** Eventos fallidos van a dead letter queue

---

## 🎓 REFERENCIAS

**Análisis completo:**
- `ANALISIS_EVENT_BUS_COMPLETO.md` - 1700+ líneas de documentación

**Referencia rápida:**
- `EVENT_BUS_QUICK_REFERENCE.md` - Cheatsheet

**Implementación:**
- `event-core/core/events/bus.js` - Event Bus
- `event-core/core/events/envelope.js` - Event Envelope

**Templates relacionados:**
- `TEMPLATE_MODULO.md` - Crear módulos
- `TEMPLATE_UI.md` - Crear UIs

---

## 💡 FILOSOFÍA

> "Si estás haciendo HTTP interno entre módulos, estás haciendo algo mal."

- **Eventos** sobre llamadas directas
- **Desacoplamiento** sobre dependencias
- **Trazabilidad** sobre conveniencia
- **Resiliencia** sobre velocidad

---

## ⚡ QUICK START

```json
// 1. En module.json — declarar suscripciones (auto-wired)
{
  "events": {
    "subscribes": [
      { "event": "pedido.creado", "handler": "onPedidoCreado" }
    ]
  }
}
```

```javascript
// 2. Handler en index.js — con try-catch
async onPedidoCreado(envelope) {
  try {
    const { pedido_id } = envelope.data;
    // Procesar...
  } catch (error) {
    this.logger.error('pedido.creado.error', { error });
  }
}

// 3. Publicar — con correlationId (esto sí va en código)
await this.eventBus.publish('pedido.actualizado', {
  pedido_id: pedido.id,
  updates: { estado: 'preparando' }
}, {
  correlationId: context.correlationId
});
```

---

**Si tus eventos no pasan esta validación, NO están completos.**

**Versión:** 1.0.0
**Basado en:** Event Bus Pizzepos (EventEmitter + MQTT)
**Autor:** Pizzepos Team
