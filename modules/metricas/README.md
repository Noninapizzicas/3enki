# 📊 Módulo de Métricas

**Versión:** 1.0.0
**Autor:** Pizzepos Team
**Tipo:** Módulo de Infraestructura Event-Core

---

## 📋 Descripción

Módulo centralizado para **captura y exposición de métricas del sistema** en tiempo real. Escucha TODOS los eventos mediante patrones wildcard y genera métricas automáticamente.

### Características principales:

✅ **100% Event-Driven** - Escucha eventos sin acoplar módulos
✅ **Captura automática** - Genera métricas de eventos sin configuración
✅ **Bajo consumo** - Almacenamiento eficiente en memoria
✅ **Real-time** - Dashboard actualizado via MQTT
✅ **APIs REST** - Consulta métricas via HTTP
✅ **Template completo** - Sigue todos los estándares Event-Core

---

## 🎯 Funcionalidad

### Tipos de métricas capturadas:

1. **Counters** - Eventos contados
   - `producto.creado.total`
   - `cuenta.actualizada.total`
   - `errores.total`

2. **Gauges** - Valores instantáneos
   - `sistema.uptime`
   - `metricas.counters.count`
   - `metricas.timings.count`

3. **Timings** - Duraciones de operaciones
   - Últimos 1000 timings almacenados
   - Extraídos de `metadata.duration` en eventos

---

## 📦 Eventos Publicados

### `metricas.snapshot`

Publicado cada 10 segundos con snapshot de todas las métricas.

**Payload:**
```json
{
  "event_type": "metricas.snapshot",
  "payload": {
    "counters": {
      "producto.creado.total": 45,
      "cuenta.creada.total": 23
    },
    "gauges": {
      "sistema.uptime": 3600.5
    },
    "timestamp": "2025-01-19T14:30:00.000Z",
    "uptime": 3600.5
  }
}
```

### `metricas.alerta`

Publicado cuando se detecta anomalía (feature opcional - fase 2).

---

## 📡 Eventos Suscritos

El módulo escucha **patrones wildcard** para capturar eventos automáticamente:

| Patrón | Handler | Acción |
|--------|---------|--------|
| `*.creado` | `onEntityCreated` | Incrementa counters de creación |
| `*.actualizado` | `onEntityUpdated` | Incrementa counters de actualización |
| `*.eliminado` | `onEntityDeleted` | Incrementa counters de eliminación |
| `*.error` | `onError` | Incrementa contador de errores |
| `*.completado` | `onOperationCompleted` | Incrementa counters de completado |

**Ejemplo:**
```javascript
// Cuando el módulo "productos" publica:
await eventBus.publish('producto.creado', { ... });

// El módulo métricas automáticamente incrementa:
// - producto.creado.total
// - producto.creado.total (por dominio)
```

---

## 🔌 APIs HTTP

### GET `/metrics`

Obtener **todas las métricas** del sistema.

**Request:**
```bash
GET /modules/metricas/metrics
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "counters": {
      "producto.creado.total": 45,
      "cuenta.creada.total": 23,
      "errores.total": 3
    },
    "gauges": {
      "sistema.uptime": 3600.5,
      "metricas.counters.count": 10
    },
    "timings": [
      {
        "event_type": "producto.creado",
        "duration": 125,
        "timestamp": "2025-01-19T14:30:00Z",
        "correlation_id": "uuid-123"
      }
    ],
    "timestamp": "2025-01-19T14:30:00Z",
    "uptime": 3600.5
  }
}
```

---

### GET `/metrics/counters`

Obtener **solo counters**.

**Request:**
```bash
GET /modules/metricas/metrics/counters
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "counters": {
      "producto.creado.total": 45,
      "cuenta.creada.total": 23
    },
    "total": 2,
    "timestamp": "2025-01-19T14:30:00Z"
  }
}
```

---

### GET `/metrics/gauges`

Obtener **solo gauges**.

---

### GET `/metrics/timings?limit=50`

Obtener **timings recientes**.

**Query params:**
- `limit` (optional) - Número de timings a retornar (default: 100)

---

### GET `/metrics/eventos`

Métricas **agrupadas por tipo de evento**.

**Response:**
```json
{
  "status": 200,
  "data": {
    "eventos": {
      "producto.creado": {
        "total": 45,
        "ultimo": "2025-01-19T14:30:00Z"
      },
      "cuenta.creada": {
        "total": 23,
        "ultimo": "2025-01-19T14:25:00Z"
      }
    },
    "timestamp": "2025-01-19T14:30:00Z"
  }
}
```

---

### DELETE `/metrics/reset`

**Resetear todas las métricas** (admin only).

**Request:**
```bash
DELETE /modules/metricas/metrics/reset
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "success": true,
    "message": "Métricas reseteadas correctamente",
    "timestamp": "2025-01-19T14:30:00Z"
  }
}
```

---

### GET `/health`

Health check del módulo.

---

## 🎨 UI - Dashboard de Métricas

El módulo incluye un **dashboard JSON-driven** en tiempo real.

### Acceso:
```
http://localhost:3000/ui/metricas
```

### Características:
- ✅ Grid de cards con métricas
- ✅ Actualización automática via MQTT
- ✅ Refresh cada 5 segundos
- ✅ Responsive (mobile/tablet/desktop)

### Componentes UI:
- `dashboard-metricas.component.json` - Layout principal
- `metric-card.component.json` - Cards individuales

---

## 🧪 Ejemplos de Uso

### Consultar métricas via HTTP

```bash
# Todas las métricas
curl http://localhost:3339/modules/metricas/metrics

# Solo counters
curl http://localhost:3339/modules/metricas/metrics/counters

# Timings (últimos 50)
curl http://localhost:3339/modules/metricas/metrics/timings?limit=50

# Métricas por evento
curl http://localhost:3339/modules/metricas/metrics/eventos
```

### Suscribirse a snapshots (desde otro módulo)

```javascript
async onLoad(core) {
  this.eventBus = core.eventBus;

  await this.eventBus.subscribe('metricas.snapshot', this.onMetricasSnapshot.bind(this));
}

async onMetricasSnapshot(envelope) {
  const { counters, gauges } = envelope.data;

  console.log('Counters:', counters);
  console.log('Gauges:', gauges);
}
```

### Agregar duration a eventos (para timings)

```javascript
// En tu módulo
async handleCreateProducto(req, context) {
  const start = Date.now();

  try {
    // ... lógica ...

    const duration = Date.now() - start;

    await this.eventBus.publish('producto.creado', {
      producto_id: producto.id
    }, {
      correlationId: context.correlationId,
      duration  // ← Métricas capturará esto
    });

  } catch (error) {
    // ...
  }
}
```

---

## 📊 Estructura de Datos en Memoria

```javascript
{
  // Counters - Map<string, number>
  counters: Map {
    'producto.creado.total': 45,
    'cuenta.creada.total': 23,
    'errores.total': 3
  },

  // Gauges - Map<string, number>
  gauges: Map {
    'sistema.uptime': 3600.5,
    'metricas.counters.count': 10
  },

  // Timings - Array (últimos 1000)
  timings: [
    {
      event_type: 'producto.creado',
      duration: 125,
      timestamp: '2025-01-19T14:30:00Z',
      correlation_id: 'uuid-123'
    }
  ],

  // Event Metrics - Map<string, {total, ultimo}>
  eventMetrics: Map {
    'producto.creado': { total: 45, ultimo: '2025-01-19T14:30:00Z' }
  }
}
```

---

## ⚙️ Configuración

En `module.json`:

```json
{
  "config": {
    "snapshot_interval_ms": 10000,     // Intervalo de snapshots (10s)
    "max_timings_stored": 1000,        // Máximo de timings almacenados
    "enable_alerts": false             // Alertas (fase 2)
  }
}
```

---

## 🔧 Instalación

El módulo se carga automáticamente si está en `modules/metricas/`.

**Verificar carga:**
```bash
# Logs
tail -f /var/log/pizzepos.log | grep metricas.loading

# Health check
curl http://localhost:3339/modules/metricas/health
```

---

## 📈 Consumo de Memoria

Estimación de consumo:

- **Counters:** ~32 bytes por counter (Map entry)
- **Gauges:** ~32 bytes por gauge
- **Timings:** ~150 bytes por timing × 1000 = ~150KB
- **Event Metrics:** ~100 bytes por evento

**Total estimado:** < 1 MB para 100 counters, 50 gauges, 1000 timings.

---

## ✅ Validación de Templates

Este módulo cumple con **TODOS los templates Event-Core**:

- [x] **TEMPLATE_MODULO.md**
  - [x] Estructura de carpetas estándar
  - [x] `module.json` completo con events, apis, ui
  - [x] Schemas JSON definidos
  - [x] Observability configurada

- [x] **TEMPLATE_API.md**
  - [x] Firma `async handleX(req, context)`
  - [x] Retorno `{ status, data }`
  - [x] Validación de inputs
  - [x] Try/catch con logging
  - [x] Códigos HTTP correctos
  - [x] `correlationId` en logs

- [x] **TEMPLATE_EVENTOS.md**
  - [x] 100% event-driven (sin HTTP interno)
  - [x] `eventBus.publish()` con `correlationId`
  - [x] Handlers con `try/catch`
  - [x] Validación de payloads
  - [x] Logging estructurado
  - [x] Documentación en `module.json`

- [x] **TEMPLATE_UI.md**
  - [x] 100% JSON-driven
  - [x] Componentes en `ui-components/`
  - [x] MQTT configurado
  - [x] Sección `ui` en `module.json`

---

## 🎓 Uso como Template

Este módulo sirve como **template de referencia** para crear nuevos módulos.

**Para crear un nuevo módulo basado en este:**

1. Copiar la estructura de carpetas
2. Adaptar `module.json` (cambiar nombre, eventos, APIs)
3. Modificar `index.js` (cambiar lógica de negocio)
4. Ajustar schemas JSON
5. Crear componentes UI personalizados

**Mantener SIEMPRE:**
- Estructura de archivos
- Patrones de eventos
- Firmas de handlers
- Logging y validación
- Documentación

---

## 🐛 Troubleshooting

### El módulo no captura eventos

**Verificar:**
```bash
# ¿Está cargado?
curl http://localhost:3339/modules/metricas/health

# ¿Eventos llegando?
tail -f /var/log/pizzepos.log | grep metricas.evento.procesado
```

### Counters no incrementan

**Posible causa:** Eventos no siguen patrón `*.creado`, `*.actualizado`, etc.

**Solución:** Verificar que otros módulos publiquen eventos con nombres correctos.

### Memoria crece indefinidamente

**Posible causa:** Timings acumulándose sin límite.

**Solución:** Configurar `max_timings_stored` en `module.json`.

---

## 📞 Soporte

**Documentación:**
- `TEMPLATE_MODULO.md`
- `TEMPLATE_API.md`
- `TEMPLATE_EVENTOS.md`
- `TEMPLATE_UI.md`

**Referencias:**
- `modules/cuentas/` - Módulo de ejemplo
- `ui-components/README.md` - Sistema JSON-driven

---

## 🚀 Roadmap (Fase 2)

- [ ] Alertas automáticas cuando métricas exceden umbrales
- [ ] Gráficas en tiempo real (histogramas, line charts)
- [ ] Exportar métricas a Prometheus/StatsD
- [ ] Persistencia de métricas históricas
- [ ] Agregaciones (avg, min, max, percentiles)

---

**Versión:** 1.0.0
**Última actualización:** 2025-01-19
**Licencia:** MIT
