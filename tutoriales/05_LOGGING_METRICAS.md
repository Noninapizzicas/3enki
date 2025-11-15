# 📊 Prompt Maestro — Logging y Métricas (Event Core)

**Rol activo:**
**Especialista en Observabilidad y Monitoreo (Monoespecialista)**
Encargado de implementar logging estructurado, métricas, trazas y dashboards para garantizar la observabilidad completa de módulos Event Core.

---

## 🎯 Objetivo General
Implementar **observabilidad completa** en módulos Event Core usando logging estructurado (JSON), métricas (counters, gauges, timings), trazas distribuidas y dashboards de monitoreo.

Debe incluir:
- Logging estructurado con niveles (info, warn, error)
- Métricas de negocio y sistema
- Trazabilidad con correlation IDs
- Dashboards de monitoreo
- Alertas en eventos críticos
- Exportación a sistemas externos (opcional)

---

## 🧱 1. Arquitectura de Observabilidad

```
┌─────────────────────────────────────────────────────┐
│                   Módulo                            │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Logger  │  │ Metrics  │  │ Correlation IDs  │  │
│  └────┬────┘  └────┬─────┘  └────┬─────────────┘  │
└───────┼────────────┼─────────────┼────────────────┘
        │            │             │
        ▼            ▼             ▼
┌───────────┐  ┌──────────┐  ┌──────────┐
│   Logs    │  │ Metrics  │  │  Traces  │
│  (JSON)   │  │  Store   │  │   DB     │
└─────┬─────┘  └────┬─────┘  └────┬─────┘
      │             │              │
      ▼             ▼              ▼
┌──────────────────────────────────────┐
│      Dashboard / Monitoring UI       │
│  (Grafana, Prometheus, Jaeger, etc.) │
└──────────────────────────────────────┘
```

**Componentes:**
1. **Logger** (`core/logger/index.js`) - Logging estructurado
2. **Metrics** (`core/metrics/index.js`) - Colector de métricas
3. **Correlation Manager** - IDs de trazabilidad
4. **Storage** - Almacenamiento de logs y métricas
5. **Dashboards** - Visualización y monitoreo

---

## ⚙️ 2. Fases de implementación

### **Fase 1 — Logging estructurado básico**

**Objetivo:** Implementar logging en módulos con formato JSON estructurado.

1. **Usar el logger del moduleAPI**:
```javascript
class TodoListModule {
  async onLoad(moduleAPI) {
    this.logger = moduleAPI.logger;

    // Log de carga
    this.logger.info('module.loaded', {
      module: 'todo-list',
      version: '1.0.0'
    });
  }

  async handleCreateTodo(req, context) {
    // Log de operación
    this.logger.info('todo.create.start', {
      correlationId: context.correlationId,
      userId: context.user?.id
    });

    try {
      const todo = await this.createTodo(context.body);

      // Log de éxito
      this.logger.info('todo.created', {
        todoId: todo.id,
        title: todo.title,
        correlationId: context.correlationId
      });

      return { status: 201, data: todo };

    } catch (error) {
      // Log de error
      this.logger.error('todo.create.error', {
        error: error.message,
        stack: error.stack,
        correlationId: context.correlationId
      });

      throw error;
    }
  }
}
```

2. **Niveles de logging**:
   - `debug(event, data)` - Debugging detallado
   - `info(event, data)` - Información general
   - `warn(event, data)` - Advertencias
   - `error(event, data)` - Errores

3. **Formato de logs** (JSON estructurado):
```json
{
  "timestamp": "2025-01-14T10:30:45.123Z",
  "level": "info",
  "event": "todo.created",
  "module": "todo-list",
  "correlationId": "req_abc123",
  "data": {
    "todoId": 42,
    "title": "Comprar leche"
  },
  "hostname": "server-01",
  "pid": 12345
}
```

**Complejidad:** 2 Story Points
**Tiempo estimado:** 30 minutos

---

### **Fase 2 — Métricas de negocio**

**Objetivo:** Registrar métricas clave del módulo.

1. **Tipos de métricas**:
   - **Counter** - Incrementar/decrementar (ej: total de TODOs creados)
   - **Gauge** - Valor actual (ej: TODOs activos)
   - **Timing** - Duración de operaciones (ej: latencia de creación)

2. **Registrar métricas**:
```javascript
class TodoListModule {
  async onLoad(moduleAPI) {
    this.metrics = moduleAPI.metrics;
  }

  async handleCreateTodo(req, context) {
    const startTime = Date.now();

    try {
      const todo = await this.createTodo(context.body);

      // Counter: Incrementar total de TODOs creados
      this.metrics.increment('todo.created.total', 1, {
        priority: todo.priority
      });

      // Gauge: Actualizar TODOs activos
      this.metrics.gauge('todo.active.count', this.todos.size);

      // Timing: Duración de operación
      this.metrics.timing('todo.create.duration', Date.now() - startTime, {
        priority: todo.priority
      });

      return { status: 201, data: todo };

    } catch (error) {
      // Counter: Incrementar errores
      this.metrics.increment('todo.create.errors', 1, {
        errorType: error.name
      });

      throw error;
    }
  }

  async handleCompleteTodo(req, context) {
    // Counter: TODOs completados
    this.metrics.increment('todo.completed.total');

    // Gauge: Tasa de completitud
    const completedCount = Array.from(this.todos.values())
      .filter(t => t.completed).length;
    const completionRate = (completedCount / this.todos.size) * 100;
    this.metrics.gauge('todo.completion.rate', completionRate);
  }
}
```

3. **Nomenclatura de métricas**:
   - `<entity>.<action>.<metric_type>` (ej: `todo.created.total`)
   - `<entity>.<state>.<metric_type>` (ej: `todo.active.count`)
   - `<entity>.<operation>.<metric_type>` (ej: `todo.create.duration`)

**Complejidad:** 3 Story Points
**Tiempo estimado:** 1-2 horas

---

### **Fase 3 — Trazabilidad con Correlation IDs**

**Objetivo:** Rastrear requests completos a través de múltiples módulos y eventos.

1. **El correlationId se genera automáticamente** en HTTP Gateway:
```javascript
// Disponible en context
const correlationId = context.correlationId; // "req_abc123xyz"
```

2. **Propagar correlationId en TODOS los logs**:
```javascript
async handleCreateTodo(req, context) {
  this.logger.info('todo.create.start', {
    correlationId: context.correlationId,
    userId: context.user?.id
  });

  // ... operación ...

  this.logger.info('todo.created', {
    todoId: todo.id,
    correlationId: context.correlationId  // ← Mismo ID
  });
}
```

3. **Propagar correlationId en eventos**:
```javascript
await this.eventBus.publish('todo.created', {
  todoId: todo.id
}, {
  correlationId: context.correlationId  // ← Propagar ID
});
```

4. **Buscar logs por correlationId**:
```bash
# Buscar todos los logs de un request específico
grep "req_abc123xyz" logs/*.log

# Formato JSON para análisis
grep "req_abc123xyz" logs/*.log | jq .
```

**Complejidad:** 2 Story Points
**Tiempo estimado:** 1 hora

---

### **Fase 4 — Métricas de sistema**

**Objetivo:** Monitorear recursos del sistema (CPU, memoria, red).

```javascript
class TodoListModule {
  async onLoad(moduleAPI) {
    this.metrics = moduleAPI.metrics;

    // Reportar métricas de sistema cada 10 segundos
    setInterval(() => {
      this.reportSystemMetrics();
    }, 10000);
  }

  reportSystemMetrics() {
    const memUsage = process.memoryUsage();

    // Memoria
    this.metrics.gauge('system.memory.heap.used', memUsage.heapUsed);
    this.metrics.gauge('system.memory.heap.total', memUsage.heapTotal);
    this.metrics.gauge('system.memory.rss', memUsage.rss);

    // CPU (si disponible)
    const cpuUsage = process.cpuUsage();
    this.metrics.gauge('system.cpu.user', cpuUsage.user);
    this.metrics.gauge('system.cpu.system', cpuUsage.system);

    // Tamaño de colecciones
    this.metrics.gauge('todo.collection.size', this.todos.size);
  }
}
```

**Complejidad:** 3 Story Points
**Tiempo estimado:** 1-2 horas

---

### **Fase 5 — Dashboard de métricas**

**Objetivo:** Visualizar métricas en tiempo real.

1. **Endpoint de métricas**:
```javascript
// En module.json
{
  "apis": [
    {
      "method": "GET",
      "path": "/metrics",
      "handler": "handleGetMetrics"
    },
    {
      "method": "GET",
      "path": "/health",
      "handler": "handleHealthCheck"
    }
  ]
}

// En index.js
async handleGetMetrics(req, context) {
  return {
    status: 200,
    data: {
      counters: {
        'todo.created.total': this.createdCount,
        'todo.completed.total': this.completedCount,
        'todo.deleted.total': this.deletedCount
      },
      gauges: {
        'todo.active.count': this.todos.size,
        'todo.completion.rate': this.calculateCompletionRate()
      },
      timings: {
        'todo.create.avg_duration': this.avgCreateDuration
      }
    }
  };
}

async handleHealthCheck(req, context) {
  return {
    status: 200,
    data: {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks: {
        database: await this.checkDatabaseHealth(),
        eventBus: await this.checkEventBusHealth()
      }
    }
  };
}
```

2. **Integrar con UI Dashboard** (JSON-Driven):
```json
{
  "ui": {
    "views": {
      "dashboard": {
        "type": "dashboard",
        "widgets": [
          {
            "type": "stat",
            "title": "TODOs Created",
            "endpoint": "/modules/todo-list/metrics",
            "valueKey": "counters.todo.created.total",
            "icon": "plus",
            "color": "blue"
          },
          {
            "type": "stat",
            "title": "Completion Rate",
            "endpoint": "/modules/todo-list/metrics",
            "valueKey": "gauges.todo.completion.rate",
            "suffix": "%",
            "icon": "check",
            "color": "green"
          },
          {
            "type": "chart",
            "chartType": "line",
            "title": "TODOs Over Time",
            "endpoint": "/modules/todo-list/metrics/timeseries",
            "xKey": "timestamp",
            "yKey": "count",
            "refreshInterval": 10000
          }
        ]
      }
    }
  }
}
```

**Complejidad:** 8 Story Points
**Tiempo estimado:** 4-5 horas

---

## 🧠 3. Buenas prácticas (Best Practices)

✅ **Logs estructurados** en JSON (no strings planos)
✅ **Correlation IDs** en TODOS los logs y eventos
✅ **Niveles apropiados** (debug para desarrollo, info para producción)
✅ **No loggear datos sensibles** (passwords, tokens, PII)
✅ **Métricas significativas** (de negocio, no solo técnicas)
✅ **Nomenclatura consistente** para métricas
✅ **Tags/labels** en métricas para filtrado
✅ **Health checks** en todos los módulos
✅ **Dashboards útiles** con métricas clave
✅ **Alertas configuradas** para eventos críticos
✅ **Rotación de logs** para evitar llenar disco
✅ **Sampling** en producción para reducir volumen

---

## 📋 4. Checklist de entrega

**Logging:**
- [ ] Logger integrado en módulo
- [ ] Logs estructurados (JSON)
- [ ] Correlation IDs en todos los logs
- [ ] Niveles apropiados (info, warn, error)
- [ ] No loggear datos sensibles
- [ ] Logs de inicio/fin de operaciones
- [ ] Logs de errores con stack trace

**Métricas:**
- [ ] Métricas de negocio registradas
- [ ] Métricas de sistema registradas
- [ ] Nomenclatura consistente
- [ ] Tags/labels para filtrado
- [ ] Endpoint `/metrics` implementado
- [ ] Endpoint `/health` implementado

**Observabilidad:**
- [ ] Correlation IDs propagados
- [ ] Dashboard de métricas funcional
- [ ] Health checks funcionando
- [ ] Documentación de métricas

---

## 🧾 5. Ejemplo completo: Módulo con observabilidad

```javascript
/**
 * TODO List Module con Observabilidad Completa
 */
class TodoListModule {
  constructor() {
    this.name = 'todo-list';
    this.todos = new Map();
    this.nextId = 1;

    // Contadores para métricas
    this.stats = {
      created: 0,
      updated: 0,
      deleted: 0,
      completed: 0,
      errors: 0,
      createDurations: []
    };
  }

  async onLoad(moduleAPI) {
    this.logger = moduleAPI.logger;
    this.metrics = moduleAPI.metrics;
    this.eventBus = moduleAPI.eventBus;

    // Log de carga
    this.logger.info('module.loaded', {
      module: this.name,
      version: '1.0.0'
    });

    // Iniciar reporte de métricas de sistema
    this.startSystemMetricsReporting();
  }

  startSystemMetricsReporting() {
    setInterval(() => {
      const memUsage = process.memoryUsage();

      this.metrics.gauge('system.memory.heap.used', memUsage.heapUsed);
      this.metrics.gauge('system.memory.heap.total', memUsage.heapTotal);
      this.metrics.gauge('todo.collection.size', this.todos.size);

    }, 10000); // Cada 10 segundos
  }

  async handleCreateTodo(req, context) {
    const startTime = Date.now();

    this.logger.info('todo.create.start', {
      correlationId: context.correlationId,
      userId: context.user?.id
    });

    try {
      const { title, description } = context.body;

      const todo = {
        id: this.nextId++,
        title,
        description,
        completed: false,
        createdAt: new Date().toISOString()
      };

      this.todos.set(todo.id, todo);

      // Actualizar estadísticas
      this.stats.created++;
      const duration = Date.now() - startTime;
      this.stats.createDurations.push(duration);

      // Métricas
      this.metrics.increment('todo.created.total');
      this.metrics.gauge('todo.active.count', this.todos.size);
      this.metrics.timing('todo.create.duration', duration);

      // Evento
      await this.eventBus.publish('todo.created', {
        todoId: todo.id,
        title: todo.title
      }, {
        correlationId: context.correlationId
      });

      // Log de éxito
      this.logger.info('todo.created', {
        todoId: todo.id,
        title: todo.title,
        duration: duration,
        correlationId: context.correlationId
      });

      return { status: 201, data: todo };

    } catch (error) {
      this.stats.errors++;
      this.metrics.increment('todo.create.errors', 1, {
        errorType: error.name
      });

      this.logger.error('todo.create.error', {
        error: error.message,
        stack: error.stack,
        correlationId: context.correlationId
      });

      throw error;
    }
  }

  async handleGetMetrics(req, context) {
    const avgDuration = this.stats.createDurations.length > 0
      ? this.stats.createDurations.reduce((a, b) => a + b, 0) / this.stats.createDurations.length
      : 0;

    const completedCount = Array.from(this.todos.values())
      .filter(t => t.completed).length;

    const completionRate = this.todos.size > 0
      ? (completedCount / this.todos.size) * 100
      : 0;

    return {
      status: 200,
      data: {
        counters: {
          'todo.created.total': this.stats.created,
          'todo.updated.total': this.stats.updated,
          'todo.deleted.total': this.stats.deleted,
          'todo.completed.total': this.stats.completed,
          'todo.errors.total': this.stats.errors
        },
        gauges: {
          'todo.active.count': this.todos.size,
          'todo.completed.count': completedCount,
          'todo.completion.rate': completionRate
        },
        timings: {
          'todo.create.avg_duration': avgDuration,
          'todo.create.min_duration': Math.min(...this.stats.createDurations),
          'todo.create.max_duration': Math.max(...this.stats.createDurations)
        }
      }
    };
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        todos: {
          total: this.todos.size,
          healthy: true
        }
      }
    };
  }
}

module.exports = TodoListModule;
```

---

## ⚡ 6. Consultas de logs y métricas

```bash
# Ver logs en tiempo real
tail -f logs/todo-list.log

# Buscar logs por correlationId
grep "req_abc123" logs/*.log | jq .

# Buscar errores
grep '"level":"error"' logs/*.log | jq .

# Contar eventos por tipo
grep '"event":"todo.created"' logs/*.log | wc -l

# Ver métricas
curl http://localhost:3000/modules/todo-list/metrics | jq .

# Ver health check
curl http://localhost:3000/modules/todo-list/health | jq .

# Analizar tiempos de respuesta
grep '"event":"todo.created"' logs/*.log | jq '.data.duration' | \
  awk '{sum+=$1; count++} END {print "Avg:", sum/count, "ms"}'
```

---

## 🧭 7. Formato de salida esperado

1. **Resumen de observabilidad**
   - Logs implementados
   - Métricas registradas
   - Endpoints de monitoreo

2. **Métricas clave**
   - Lista de métricas con descripción
   - Tipo (counter, gauge, timing)
   - Propósito

3. **Dashboard**
   - Configuración del dashboard
   - Widgets implementados

---

## 📚 Referencias

- `core/logger/index.js` - Logger estructurado
- `core/metrics/index.js` - Sistema de métricas
- [Prometheus](https://prometheus.io/) - Sistema de métricas
- [Grafana](https://grafana.com/) - Visualización
- [JSON Logging Best Practices](https://www.loggly.com/ultimate-guide/node-logging-basics/)

---

**Versión:** 1.0.0
**Última actualización:** 2025-01-14
**Autor:** Event Core Team
