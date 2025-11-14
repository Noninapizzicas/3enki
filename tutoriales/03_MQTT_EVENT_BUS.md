# 📡 Prompt Maestro — MQTT y Event Bus (Event Core)

**Rol activo:**
**Especialista en Comunicación Asíncrona y Event-Driven Architecture (Monoespecialista)**
Encargado de implementar publicación y suscripción de eventos MQTT para comunicación desacoplada entre módulos Event Core.

---

## 🎯 Objetivo General
Implementar **comunicación basada en eventos** usando MQTT pub/sub para desacoplar módulos, habilitar integraciones y crear flujos reactivos.

Debe incluir:
- Publicación de eventos desde módulos
- Suscripción a eventos de otros módulos
- Event Bus como broker centralizado
- Patrones pub/sub, request/response, broadcast
- Trazabilidad con correlation IDs
- Manejo de errores y reintentos

---

## 🧱 1. Arquitectura del Event Bus

```
┌─────────────┐          MQTT Topics          ┌─────────────┐
│  Módulo A   │────► /events/user.created ───►│  Módulo B   │
│ (Publisher) │                                 │ (Subscriber)│
└─────────────┘                                 └─────────────┘
                 ┌───────────────┐
                 │  MQTT Broker  │ (Mosquitto)
                 └───────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│   Módulo C   │ │  Módulo D   │ │  Módulo E  │
│ (Subscriber) │ │ (Subscriber)│ │(Subscriber)│
└──────────────┘ └─────────────┘ └────────────┘
```

**Componentes:**
1. **EventBus** (`core/event-bus/index.js`) - Cliente MQTT centralizado
2. **MQTTClient** (`core/mqtt/client.js`) - Wrapper de MQTT con pools
3. **Event Schemas** - Validación de payloads de eventos
4. **Subscription Manager** - Gestión de suscripciones por módulo

---

## ⚙️ 2. Fases de implementación

### **Fase 1 — Publicar eventos básicos**

**Objetivo:** Publicar eventos desde un módulo sin esperar respuesta.

1. **Definir eventos en `module.json`**:
```json
{
  "name": "user-service",
  "events": {
    "publishes": [
      "user.created",
      "user.updated",
      "user.deleted",
      "user.login"
    ]
  }
}
```

2. **Publicar evento desde un handler**:
```javascript
class UserServiceModule {
  async handleCreateUser(req, context) {
    // Crear usuario...
    const user = { id: 123, username: 'john', email: 'john@example.com' };

    // Publicar evento
    await this.eventBus.publish('user.created', {
      userId: user.id,
      username: user.username,
      email: user.email,
      timestamp: new Date().toISOString()
    });

    this.logger.info('user.created.event.published', {
      userId: user.id,
      topic: 'user.created'
    });

    return { status: 201, data: user };
  }
}
```

3. **Verificar que el evento se publica**:
   - Logs deben mostrar `user.created.event.published`
   - MQTT broker debe recibir mensaje en topic `/events/user.created`

**Complejidad:** 2 Story Points
**Tiempo estimado:** 30 minutos

---

### **Fase 2 — Suscribirse a eventos**

**Objetivo:** Escuchar eventos de otros módulos y reaccionar.

1. **Definir suscripciones en `module.json`**:
```json
{
  "name": "notification-service",
  "events": {
    "subscribes": [
      "user.created",
      "user.login",
      "order.placed"
    ]
  }
}
```

2. **Implementar handlers de eventos**:
```javascript
class NotificationServiceModule {
  async onLoad(moduleAPI) {
    this.eventBus = moduleAPI.eventBus;
    this.logger = moduleAPI.logger;

    // Suscribirse a evento
    await this.eventBus.subscribe('user.created', this.handleUserCreated.bind(this));
    await this.eventBus.subscribe('user.login', this.handleUserLogin.bind(this));

    this.logger.info('notification.subscriptions.registered', {
      topics: ['user.created', 'user.login']
    });
  }

  /**
   * Handler para evento user.created
   */
  async handleUserCreated(event) {
    try {
      this.logger.info('user.created.received', {
        userId: event.payload.userId,
        correlationId: event.correlationId
      });

      // Enviar email de bienvenida
      await this.sendWelcomeEmail(event.payload.email, event.payload.username);

      // Publicar evento de notificación enviada
      await this.eventBus.publish('notification.sent', {
        type: 'welcome_email',
        userId: event.payload.userId,
        correlationId: event.correlationId
      });

      this.metrics.increment('notification.welcome.sent');

    } catch (error) {
      this.logger.error('user.created.handler.error', {
        error: error.message,
        userId: event.payload?.userId
      });
    }
  }

  /**
   * Handler para evento user.login
   */
  async handleUserLogin(event) {
    this.logger.info('user.login.received', {
      userId: event.payload.userId
    });

    // Registrar última conexión
    await this.updateLastSeen(event.payload.userId);
  }
}
```

3. **Probar flujo completo**:
   - Crear usuario → Verificar que notification-service recibe evento
   - Verificar logs de ambos módulos
   - Confirmar que email se envía

**Complejidad:** 5 Story Points
**Tiempo estimado:** 2-3 horas

---

### **Fase 3 — Eventos con correlationId (trazabilidad)**

**Objetivo:** Rastrear flujos completos con correlation IDs.

1. **Generar correlationId en request inicial**:
```javascript
// HTTP Gateway genera automáticamente correlationId
// Disponible en context.correlationId
```

2. **Propagar correlationId en eventos**:
```javascript
async handleCreateUser(req, context) {
  const user = await this.createUser(context.body);

  // Publicar con correlationId del request
  await this.eventBus.publish('user.created', {
    userId: user.id,
    username: user.username
  }, {
    correlationId: context.correlationId  // ← Propagar ID
  });

  return { status: 201, data: user };
}
```

3. **Usar correlationId en subscribers**:
```javascript
async handleUserCreated(event) {
  this.logger.info('user.created.received', {
    userId: event.payload.userId,
    correlationId: event.correlationId  // ← Mismo ID
  });

  // Al publicar nuevo evento, mantener correlationId
  await this.eventBus.publish('notification.sent', {
    userId: event.payload.userId
  }, {
    correlationId: event.correlationId  // ← Propagar ID
  });
}
```

4. **Rastrear flujo completo en logs**:
```bash
# Buscar todos los logs de un correlationId específico
grep "correlation_id=abc-123" logs/*.log
```

**Complejidad:** 3 Story Points
**Tiempo estimado:** 1-2 horas

---

### **Fase 4 — Patrones avanzados**

**Objetivo:** Implementar patrones complejos de comunicación.

#### **A) Request/Response (RPC sobre MQTT)**
```javascript
// Publisher (requester)
async getUserProfile(userId) {
  const response = await this.eventBus.request('user.profile.get', {
    userId: userId
  }, {
    timeout: 5000  // 5 segundos
  });

  return response.payload;
}

// Subscriber (responder)
async onLoad(moduleAPI) {
  await this.eventBus.onRequest('user.profile.get', async (request) => {
    const user = await this.getUser(request.payload.userId);

    return {
      user: user,
      timestamp: new Date().toISOString()
    };
  });
}
```

#### **B) Broadcast a múltiples servicios**
```javascript
// Publicar a todos los módulos
await this.eventBus.broadcast('system.shutdown', {
  reason: 'Maintenance',
  gracePeriod: 60000  // 1 minuto
});

// Todos los módulos reciben
async handleSystemShutdown(event) {
  this.logger.warn('system.shutdown.received', {
    reason: event.payload.reason
  });

  // Cerrar conexiones, guardar estado, etc.
  await this.gracefulShutdown();
}
```

#### **C) Event Filtering (filtrado en subscriber)**
```javascript
// Suscribirse solo a eventos específicos
await this.eventBus.subscribe('user.updated', async (event) => {
  // Filtrar solo actualizaciones de email
  if (event.payload.field === 'email') {
    await this.handleEmailChange(event);
  }
});

// Wildcards en topics
await this.eventBus.subscribe('user.*', this.handleAnyUserEvent.bind(this));
await this.eventBus.subscribe('order.*.failed', this.handleOrderFailure.bind(this));
```

#### **D) Dead Letter Queue (DLQ)**
```javascript
async handleUserCreated(event) {
  try {
    await this.processEvent(event);
  } catch (error) {
    // Reintentar hasta 3 veces
    if (event.retryCount < 3) {
      await this.eventBus.publish('user.created', event.payload, {
        retryCount: (event.retryCount || 0) + 1,
        delay: 1000 * Math.pow(2, event.retryCount)  // Backoff exponencial
      });
    } else {
      // Enviar a DLQ
      await this.eventBus.publish('dlq.user.created', {
        originalEvent: event,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      this.logger.error('event.processing.failed.max_retries', {
        event: 'user.created',
        error: error.message
      });
    }
  }
}
```

**Complejidad:** 13 Story Points
**Tiempo estimado:** 1-2 días

---

## 🧠 3. Buenas prácticas (Best Practices)

✅ **Nomenclatura clara** para eventos (`entity.action`, ej: `user.created`)
✅ **Payloads pequeños** (< 1KB), usar IDs en vez de objetos completos
✅ **Eventos inmutables** - No modificar payload recibido
✅ **Idempotencia** - Handlers deben soportar procesamiento múltiple
✅ **Correlation IDs** - Siempre propagar para trazabilidad
✅ **Manejo de errores** - Try/catch en todos los handlers
✅ **Reintentos** - Implementar backoff exponencial
✅ **DLQ** - Dead Letter Queue para eventos fallidos
✅ **Versioning** - Incluir versión en payload para evolución
✅ **Logging** - Loggear publicación y recepción de eventos
✅ **Métricas** - Contar eventos publicados/procesados
✅ **Timeouts** - Límites en request/response
✅ **No bloquear** - Handlers async deben ser rápidos

---

## 📋 4. Estructura de un evento

```javascript
{
  // Metadata (automático)
  "eventId": "evt_abc123",
  "eventType": "user.created",
  "timestamp": "2025-01-14T10:30:00.000Z",
  "correlationId": "req_xyz789",
  "source": "user-service",
  "version": "1.0",

  // Payload (custom)
  "payload": {
    "userId": 123,
    "username": "john_doe",
    "email": "john@example.com",
    "role": "user"
  },

  // Opcionales
  "retryCount": 0,
  "expiresAt": "2025-01-14T11:30:00.000Z"
}
```

---

## 📋 5. Checklist de entrega

**Publicación:**
- [ ] Definir eventos en `module.json` (publishes)
- [ ] Publicar eventos en operaciones clave
- [ ] Incluir payload mínimo necesario
- [ ] Propagar correlationId
- [ ] Loggear eventos publicados
- [ ] Registrar métrica de publicación

**Suscripción:**
- [ ] Definir suscripciones en `module.json` (subscribes)
- [ ] Implementar handlers de eventos
- [ ] Manejo de errores con try/catch
- [ ] Idempotencia en handlers
- [ ] Loggear eventos recibidos
- [ ] Registrar métrica de procesamiento

**Trazabilidad:**
- [ ] Propagar correlationId en cadena
- [ ] Logs estructurados con correlationId
- [ ] Métricas por tipo de evento
- [ ] Dead Letter Queue para fallos

---

## 🧾 6. Ejemplo completo: Sistema de notificaciones

**modules/user-service/module.json**:
```json
{
  "name": "user-service",
  "events": {
    "publishes": [
      "user.created",
      "user.updated",
      "user.deleted"
    ]
  }
}
```

**modules/user-service/index.js**:
```javascript
class UserServiceModule {
  async handleCreateUser(req, context) {
    const user = {
      id: this.nextId++,
      username: context.body.username,
      email: context.body.email,
      createdAt: new Date().toISOString()
    };

    this.users.set(user.id, user);

    // Publicar evento
    await this.eventBus.publish('user.created', {
      userId: user.id,
      username: user.username,
      email: user.email
    }, {
      correlationId: context.correlationId
    });

    this.logger.info('user.created', {
      userId: user.id,
      correlationId: context.correlationId
    });

    this.metrics.increment('user.created.total');

    return { status: 201, data: user };
  }
}
```

**modules/notification-service/module.json**:
```json
{
  "name": "notification-service",
  "events": {
    "subscribes": [
      "user.created",
      "user.updated"
    ],
    "publishes": [
      "notification.sent",
      "notification.failed"
    ]
  }
}
```

**modules/notification-service/index.js**:
```javascript
class NotificationServiceModule {
  async onLoad(moduleAPI) {
    this.eventBus = moduleAPI.eventBus;
    this.logger = moduleAPI.logger;
    this.metrics = moduleAPI.metrics;

    // Registrar handlers
    await this.eventBus.subscribe('user.created', this.handleUserCreated.bind(this));
    await this.eventBus.subscribe('user.updated', this.handleUserUpdated.bind(this));

    this.logger.info('notification.service.loaded');
  }

  async handleUserCreated(event) {
    const startTime = Date.now();

    try {
      this.logger.info('user.created.received', {
        userId: event.payload.userId,
        correlationId: event.correlationId
      });

      // Enviar email de bienvenida
      await this.sendEmail({
        to: event.payload.email,
        subject: 'Welcome!',
        template: 'welcome',
        data: {
          username: event.payload.username
        }
      });

      // Publicar éxito
      await this.eventBus.publish('notification.sent', {
        type: 'welcome_email',
        userId: event.payload.userId,
        email: event.payload.email
      }, {
        correlationId: event.correlationId
      });

      this.metrics.increment('notification.sent.total', {
        type: 'welcome_email'
      });

      this.metrics.timing('notification.processing.time', Date.now() - startTime);

    } catch (error) {
      this.logger.error('notification.send.error', {
        error: error.message,
        userId: event.payload?.userId,
        correlationId: event.correlationId
      });

      // Publicar fallo
      await this.eventBus.publish('notification.failed', {
        type: 'welcome_email',
        userId: event.payload.userId,
        error: error.message
      }, {
        correlationId: event.correlationId
      });

      this.metrics.increment('notification.failed.total', {
        type: 'welcome_email'
      });
    }
  }

  async handleUserUpdated(event) {
    // Solo procesar cambios de email
    if (event.payload.field === 'email') {
      this.logger.info('user.email.updated', {
        userId: event.payload.userId
      });

      await this.sendEmail({
        to: event.payload.newEmail,
        subject: 'Email changed',
        template: 'email_changed'
      });
    }
  }

  async sendEmail(options) {
    // Implementación de envío de email
    this.logger.info('email.sent', {
      to: options.to,
      subject: options.subject
    });
  }
}

module.exports = NotificationServiceModule;
```

---

## ⚡ 7. Pruebas de eventos

### **A) Monitorear eventos MQTT**
```bash
# Suscribirse a todos los eventos (debugging)
mosquitto_sub -h localhost -p 1883 -t '/events/#' -v

# Suscribirse a eventos específicos
mosquitto_sub -h localhost -p 1883 -t '/events/user.created'
```

### **B) Publicar evento manualmente (testing)**
```bash
# Publicar evento de prueba
mosquitto_pub -h localhost -p 1883 -t '/events/user.created' \
  -m '{
    "eventType": "user.created",
    "payload": {
      "userId": 999,
      "username": "test_user",
      "email": "test@example.com"
    }
  }'
```

### **C) Probar flujo completo**
```bash
# 1. Crear usuario (trigger evento)
curl -X POST http://localhost:3000/modules/user-service/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "email": "alice@example.com",
    "password": "SecurePass123!"
  }'

# 2. Verificar logs de publicación
tail -f logs/user-service.log | grep "user.created"

# 3. Verificar logs de suscripción
tail -f logs/notification-service.log | grep "user.created.received"

# 4. Verificar que notification.sent se publica
tail -f logs/notification-service.log | grep "notification.sent"
```

---

## 🧭 8. Formato de salida esperado

1. **Resumen de eventos**
   - Eventos publicados por el módulo
   - Eventos a los que se suscribe
   - Handlers implementados

2. **Diagrama de flujo**
   - Secuencia de eventos
   - Módulos involucrados
   - Tiempos aproximados

3. **Pruebas realizadas**
   - Eventos publicados correctamente
   - Eventos recibidos correctamente
   - Correlation IDs propagados

4. **Métricas registradas**
   - Eventos publicados (count)
   - Eventos procesados (count)
   - Latencia de procesamiento (timing)
   - Errores (count)

---

## 🧩 9. Reglas operativas

- **Eventos inmutables** - No modificar payloads
- **Idempotencia** - Procesar mismo evento múltiples veces sin problemas
- **Correlation IDs** - SIEMPRE propagar
- **Payloads pequeños** - Usar referencias en vez de objetos completos
- **Manejo de errores** - Try/catch obligatorio
- **Logging** - Publicación + Recepción + Procesamiento
- **Métricas** - Contar todo
- **No bloquear** - Handlers rápidos (< 100ms ideal)
- **Versionado** - Incluir versión en payload

---

## 📚 Referencias

- `core/event-bus/index.js` - EventBus principal
- `core/mqtt/client.js` - Cliente MQTT
- `docs/GUIA_EVENT_BUS.md` - Guía oficial del Event Bus
- [MQTT Protocol](https://mqtt.org/) - Especificación MQTT
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html) - Patrones

---

## 🔄 Capa de Consolidación

1. **Estado del sistema de eventos**
   - ✅ Publicación funcionando
   - ✅ Suscripción funcionando
   - ✅ Correlation IDs propagándose
   - ✅ Métricas registrándose

2. **Pendientes**
   - Implementar DLQ (Dead Letter Queue)
   - Event sourcing (opcional)
   - Event replay (opcional)
   - Schema validation de eventos

3. **Próximos pasos**
   - Monitoreo de eventos en UI
   - Visualización de flujos
   - Alertas en eventos críticos

---

**Versión:** 1.0.0
**Última actualización:** 2025-01-14
**Autor:** Event Core Team
