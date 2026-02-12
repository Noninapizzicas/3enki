# Guía Completa: Integración con Event Bus

**Nivel:** Intermedio
**Tiempo:** 20-30 minutos
**Fecha:** 2025-10-20

El Event Bus permite comunicación asíncrona entre módulos mediante eventos.

---

## 📋 Tabla de Contenidos

1. [¿Qué es el Event Bus?](#qué-es-el-event-bus)
2. [Publicar Eventos](#publicar-eventos)
3. [Suscribirse a Eventos](#suscribirse-a-eventos)
4. [Ejemplo 1: TODO con Notificaciones](#ejemplo-1-todo-con-notificaciones)
5. [Ejemplo 2: User Activity Tracker](#ejemplo-2-user-activity-tracker)
6. [Ejemplo 3: Workflow Automation](#ejemplo-3-workflow-automation)
7. [Eventos entre Cores (MQTT)](#eventos-entre-cores-mqtt)
8. [Best Practices](#best-practices)

---

## ¿Qué es el Event Bus?

El **Event Bus** es el sistema de mensajería que permite a los módulos:

✅ **Publicar eventos** cuando algo importante sucede
✅ **Suscribirse a eventos** de otros módulos
✅ **Comunicarse sin acoplamiento** (módulos no se conocen entre sí)
✅ **Escalar a múltiples cores** vía MQTT

### Arquitectura

```
┌─────────────────┐
│   Módulo A      │
│                 │
│ publish('...') ────┐
└─────────────────┘  │
                     │
                     ▼
              ┌──────────────┐
              │  EVENT BUS   │
              │  (+ MQTT)    │
              └──────────────┘
                     │
      ┌──────────────┼──────────────┐
      │              │              │
      ▼              ▼              ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│ Módulo B│    │ Módulo C│    │ Módulo D│
│         │    │         │    │         │
│subscribe│    │subscribe│    │subscribe│
└─────────┘    └─────────┘    └─────────┘
```

### Eventos Locales vs Distribuidos

- **Locales**: Solo en el core actual (EventEmitter de Node.js)
- **Distribuidos**: Entre múltiples cores (vía MQTT)

---

## Publicar Eventos

### Sintaxis Básica

```javascript
await this.eventBus.publish(topic, payload);
```

**Parámetros:**
- `topic` (string): Nombre del evento (ej: `user.created`, `order.completed`)
- `payload` (object): Datos del evento

### Ejemplo: Publicar Evento

```javascript
class UserModule {
  async handleCreateUser(request) {
    const user = await this.createUser(request.body);

    // Publicar evento
    await this.eventBus.publish('user.created', {
      userId: user.id,
      email: user.email,
      name: user.name,
      createdAt: new Date().toISOString()
    });

    return {
      statusCode: 201,
      body: { user }
    };
  }
}
```

### Convenciones de Nombres

Usa el patrón: `{recurso}.{acción}`

```
user.created
user.updated
user.deleted
user.login
user.logout

order.created
order.paid
order.shipped
order.cancelled

file.uploaded
file.deleted
file.scanned
```

---

## Suscribirse a Eventos

### Método Recomendado: Declarativo en module.json (Auto-Wiring)

Declara las suscripciones en `module.json` y el loader las conecta automáticamente:

**module.json:**
```json
{
  "events": {
    "subscribes": [
      { "event": "user.created", "handler": "handleUserCreated" },
      { "event": "user.login", "handler": "handleUserLogin" }
    ]
  }
}
```

**index.js:**
```javascript
class NotificationModule {
  async onLoad() {
    // NO suscribirse aquí — el loader auto-wira desde module.json
    this.logger.info('notifications.loaded');
  }

  // Estos handlers son invocados automáticamente por el loader
  async handleUserCreated(event) {
    this.logger.info('notification.user.created', {
      userId: event.payload.userId,
      email: event.payload.email
    });
    await this.sendWelcomeEmail(event.payload.email);
  }

  async handleUserLogin(event) {
    this.logger.info('notification.user.login', {
      userId: event.payload.userId
    });
    await this.sendPushNotification(event.payload.userId, 'Bienvenido de nuevo!');
  }
}
```

### Método Imperativo (Solo para Wildcards/Dinámicos)

Solo usa `eventBus.subscribe()` directo para wildcards o suscripciones dinámicas:

```javascript
// Wildcard — NO se puede declarar en module.json
this.eventBus.subscribe('agent.*.completed', this.onAgentCompleted.bind(this));
```

---

## Ejemplo 1: TODO con Notificaciones

Vamos a extender el módulo TODO para enviar notificaciones cuando se completa una tarea.

### Módulo TODO (Publisher)

```javascript
class TodoListModule {
  // ... código anterior ...

  async handleCompleteTodo(request) {
    const id = parseInt(request.path.split('/')[2]);
    const todo = this.todos.get(id);

    if (!todo) {
      return {
        statusCode: 404,
        body: { error: 'Not found' }
      };
    }

    // Marcar como completado
    todo.completed = true;
    todo.completedAt = new Date().toISOString();

    // PUBLICAR EVENTO
    await this.eventBus.publish('todo.completed', {
      todoId: todo.id,
      title: todo.title,
      completedAt: todo.completedAt,
      userId: request.user?.id // Si hay usuario autenticado
    });

    return {
      statusCode: 200,
      body: { todo }
    };
  }
}
```

### Módulo de Notificaciones (Subscriber)

```bash
mkdir -p modules/notifications
cd modules/notifications
```

**module.json:**
```json
{
  "name": "notifications",
  "version": "1.0.0",
  "description": "Notification system",
  "main": "index.js",
  "apis": [],
  "events": {
    "publishes": ["notification.sent"],
    "subscribes": [
      { "event": "todo.completed", "handler": "onTodoCompleted" },
      { "event": "user.created", "handler": "onUserCreated" },
      { "event": "user.login", "handler": "onUserLogin" }
    ]
  }
}
```

**index.js:**
```javascript
class NotificationsModule {
  constructor(core) {
    this.core = core;
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;

    // Historial de notificaciones
    this.notifications = [];
  }

  async onLoad() {
    this.logger.info('notifications.module.loaded');
    // Suscripciones auto-wired desde module.json — nada que hacer aquí
  }

  /**
   * Handler: TODO completado
   */
  async onTodoCompleted(event) {
    const { todoId, title, userId } = event.payload;

    this.logger.info('notifications.todo.completed', {
      todoId,
      title,
      userId
    });

    // Crear notificación
    const notification = {
      id: this.notifications.length + 1,
      type: 'todo_completed',
      title: 'Tarea Completada',
      message: `Has completado: "${title}"`,
      data: { todoId, title },
      userId,
      createdAt: new Date().toISOString(),
      read: false
    };

    this.notifications.push(notification);

    // Simular envío de notificación
    await this.sendNotification(notification);

    // Publicar evento de notificación enviada
    await this.eventBus.publish('notification.sent', {
      notificationId: notification.id,
      userId,
      type: notification.type
    });

    // Métrica
    this.metrics.increment('notifications.sent.total', {
      type: 'todo_completed'
    });
  }

  /**
   * Handler: Usuario creado
   */
  async onUserCreated(event) {
    const { userId, email, name } = event.payload;

    this.logger.info('notifications.user.created', {
      userId,
      email
    });

    const notification = {
      id: this.notifications.length + 1,
      type: 'welcome',
      title: 'Bienvenido',
      message: `Hola ${name}, bienvenido a Event Core!`,
      data: { userId, email },
      userId,
      createdAt: new Date().toISOString(),
      read: false
    };

    this.notifications.push(notification);
    await this.sendNotification(notification);

    await this.eventBus.publish('notification.sent', {
      notificationId: notification.id,
      userId,
      type: notification.type
    });

    this.metrics.increment('notifications.sent.total', {
      type: 'welcome'
    });
  }

  /**
   * Handler: Usuario login
   */
  async onUserLogin(event) {
    const { userId, email } = event.payload;

    this.logger.info('notifications.user.login', {
      userId,
      email
    });

    // Solo log, no enviar notificación
    this.metrics.increment('user.login.tracked');
  }

  /**
   * Helper: Enviar notificación
   * (En producción, esto enviaría email, push, SMS, etc.)
   */
  async sendNotification(notification) {
    // Simular envío
    this.logger.debug('notifications.send', {
      id: notification.id,
      type: notification.type,
      userId: notification.userId
    });

    // Aquí podrías:
    // - Enviar email via Nodemailer
    // - Enviar push notification via Firebase
    // - Enviar SMS via Twilio
    // - Guardar en base de datos
    // - etc.

    return true;
  }
}

module.exports = NotificationsModule;
```

### Probar la Integración

```bash
# 1. Reiniciar Event Core (para cargar nuevo módulo)
node index.js

# 2. Completar un TODO
curl -X POST http://localhost:3000/modules/todo-list/todos/1/complete

# 3. Ver logs - Deberías ver:
#    [info] todo-list.completed (del módulo TODO)
#    [info] notifications.todo.completed (del módulo Notifications)
#    [info] notifications.send (notificación enviada)
```

---

## Ejemplo 2: User Activity Tracker

Módulo que registra toda la actividad de usuarios.

```javascript
class ActivityTrackerModule {
  constructor(core) {
    this.core = core;
    this.logger = core.logger;
    this.eventBus = core.eventBus;

    // Actividad reciente
    this.activities = [];
  }

  async onLoad() {
    this.logger.info('activity-tracker.loaded');

    // Suscribirse a TODOS los eventos de usuario
    this.eventBus.subscribe('user.*', this.trackActivity.bind(this));

    // También a eventos específicos de otros módulos
    this.eventBus.subscribe('todo.created', this.trackActivity.bind(this));
    this.eventBus.subscribe('todo.completed', this.trackActivity.bind(this));
    this.eventBus.subscribe('order.created', this.trackActivity.bind(this));
  }

  async trackActivity(event) {
    // Registrar actividad
    const activity = {
      id: this.activities.length + 1,
      topic: event.topic,
      userId: event.payload.userId,
      timestamp: event.timestamp,
      data: event.payload,
      source: event.source
    };

    this.activities.push(activity);

    // Mantener solo últimas 1000 actividades
    if (this.activities.length > 1000) {
      this.activities.shift();
    }

    this.logger.debug('activity.tracked', {
      topic: event.topic,
      userId: event.payload.userId
    });

    this.metrics.increment('activity.tracked.total', {
      topic: event.topic
    });
  }

  // API para obtener actividad
  async handleGetUserActivity(request) {
    const userId = request.user.id;

    const userActivities = this.activities.filter(a =>
      a.userId === userId
    );

    return {
      statusCode: 200,
      body: {
        activities: userActivities,
        total: userActivities.length
      }
    };
  }

  async handleGetAllActivity(request) {
    // Solo admin
    if (request.user.role !== 'admin') {
      return {
        statusCode: 403,
        body: { error: 'Forbidden' }
      };
    }

    return {
      statusCode: 200,
      body: {
        activities: this.activities,
        total: this.activities.length
      }
    };
  }
}
```

---

## Ejemplo 3: Workflow Automation

Módulo que automatiza workflows basados en eventos.

```javascript
class WorkflowModule {
  constructor(core) {
    this.core = core;
    this.eventBus = core.eventBus;
    this.logger = core.logger;

    // Workflows activos
    this.workflows = new Map();
  }

  async onLoad() {
    this.logger.info('workflow.loaded');

    // Workflow 1: Cuando se crea un usuario, crear TODO de bienvenida
    this.eventBus.subscribe('user.created', async (event) => {
      const { userId, name } = event.payload;

      this.logger.info('workflow.user.created', { userId });

      // Publicar evento para crear TODO
      await this.eventBus.publish('todo.create.request', {
        userId,
        title: `Bienvenido ${name}`,
        description: 'Completa tu perfil'
      });
    });

    // Workflow 2: Cuando se completan 5 TODOs, dar badge
    this.eventBus.subscribe('todo.completed', async (event) => {
      const { userId } = event.payload;

      if (!userId) return;

      // Contar TODOs completados
      const completedCount = await this.countCompletedTodos(userId);

      if (completedCount === 5) {
        // Publicar evento de badge ganado
        await this.eventBus.publish('badge.earned', {
          userId,
          badgeId: 'first_five',
          badgeName: 'Primeros 5',
          description: 'Completaste tus primeras 5 tareas'
        });

        this.logger.info('workflow.badge.earned', {
          userId,
          badgeId: 'first_five'
        });
      }
    });

    // Workflow 3: Cuando un usuario no hace login en 7 días, enviar email
    this.eventBus.subscribe('user.login', async (event) => {
      const { userId } = event.payload;

      // Resetear timer de inactividad
      this.resetInactivityTimer(userId);
    });
  }

  async countCompletedTodos(userId) {
    // Aquí consultarías la base de datos o el módulo TODO
    // Por ahora, retornar mock
    return 5;
  }

  resetInactivityTimer(userId) {
    // Cancelar timer anterior
    if (this.workflows.has(`inactivity_${userId}`)) {
      clearTimeout(this.workflows.get(`inactivity_${userId}`));
    }

    // Crear nuevo timer (7 días)
    const timer = setTimeout(async () => {
      await this.eventBus.publish('user.inactive', {
        userId,
        inactiveDays: 7
      });

      this.logger.warn('workflow.user.inactive', { userId });
    }, 7 * 24 * 60 * 60 * 1000);

    this.workflows.set(`inactivity_${userId}`, timer);
  }
}
```

---

## Eventos entre Cores (MQTT)

El Event Bus automáticamente distribuye eventos entre cores vía MQTT.

### Ejemplo: Multi-Core

```bash
# Terminal 1: Core A
CORE_ID=core-a node index.js

# Terminal 2: Core B
CORE_ID=core-b node index.js

# Terminal 3: Publicar evento en Core A
curl -X POST http://localhost:3000/modules/todo-list/todos/1/complete

# El evento se propaga automáticamente a Core B
# Ambos cores ejecutan sus subscribers
```

### Tópicos MQTT

Event Bus usa el patrón de tópicos:

```
events/{coreId}/{topic}

Ejemplos:
events/core-a/user.created
events/core-b/todo.completed
events/*/user.*  (wildcard)
```

### Suscribirse a Eventos de Otros Cores

```javascript
// Suscribirse solo a eventos del core actual
this.eventBus.subscribe('user.created', handler, { local: true });

// Suscribirse a eventos de TODOS los cores (default)
this.eventBus.subscribe('user.created', handler);

// Suscribirse con wildcard
this.eventBus.subscribe('user.*', handler);
```

---

## Best Practices

### 1. Nombres Descriptivos

```javascript
// ❌ MAL
await this.eventBus.publish('update', { id: 1 });

// ✅ BIEN
await this.eventBus.publish('user.profile.updated', {
  userId: 1,
  fields: ['name', 'email']
});
```

### 2. Payloads Completos

Incluye toda la info relevante:

```javascript
// ❌ MAL
await this.eventBus.publish('order.created', {
  orderId: 123
});

// ✅ BIEN
await this.eventBus.publish('order.created', {
  orderId: 123,
  userId: 456,
  items: [...],
  total: 99.99,
  currency: 'USD',
  createdAt: new Date().toISOString()
});
```

### 3. Manejo de Errores

Los subscribers no deben lanzar errores:

```javascript
async onUserCreated(event) {
  try {
    await this.sendEmail(event.payload.email);
  } catch (error) {
    // Log pero no lanzar
    this.logger.error('email.send.failed', {
      error: error.message,
      userId: event.payload.userId
    });
  }
}
```

### 4. Logging

Loggea eventos importantes:

```javascript
await this.eventBus.publish('user.created', payload);

this.logger.info('event.published', {
  topic: 'user.created',
  userId: payload.userId
});
```

### 5. Métricas

Registra métricas:

```javascript
async onUserCreated(event) {
  // ... lógica ...

  this.metrics.increment('notifications.sent', {
    type: 'welcome'
  });
}
```

### 6. No Abusar de Eventos

Los eventos son para acciones **importantes**:

```javascript
// ✅ BIEN: Eventos importantes
'user.created'
'order.paid'
'file.uploaded'

// ❌ MAL: Eventos triviales
'button.clicked'
'mouse.moved'
'input.changed'
```

---

## 🎯 Resumen

El **Event Bus** permite:

✅ **Desacoplar módulos** - No se conocen entre sí
✅ **Comunicación asíncrona** - Publish/Subscribe pattern
✅ **Escalabilidad** - Eventos distribuidos vía MQTT
✅ **Extensibilidad** - Nuevos módulos pueden suscribirse fácilmente
✅ **Workflows** - Automatización basada en eventos

### Patrón de Uso:

1. **Publisher** publica evento cuando algo sucede
2. **Subscribers** reciben y procesan el evento
3. **Sin acoplamiento** - Publisher no sabe quién escucha
4. **Automático** - Event Bus se encarga de distribución

---

**¡Listo!** Ahora tienes 4 guías completas:
- ✅ `GUIA_CREAR_MODULO.md` - Crear módulos con APIs
- ✅ `GUIA_HOOKS.md` - Autenticación e interceptación
- ✅ `GUIA_TESTING.md` - Testing completo
- ✅ `GUIA_EVENT_BUS.md` - Integración con eventos
