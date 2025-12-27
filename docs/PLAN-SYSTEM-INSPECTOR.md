# Plan: System Inspector para Claude

> **Objetivo**: Módulo que captura todo lo que ocurre en el sistema (como la consola de DevTools) en formato JSON para que Claude pueda consultarlo directamente.

## Problema que resuelve

```
ANTES:
Usuario mira logs en navegador → Le dice a Claude qué ve → Claude actúa ciego

DESPUÉS:
Claude lee /data/system-console.json → Claude sabe qué pasa → Claude actúa informado
```

## Estructura de archivos

```
modules/system-inspector/
├── module.json              # Manifiesto del módulo
├── index.js                 # Lógica principal
├── lib/
│   ├── console-buffer.js    # Buffer circular para almacenar entradas
│   ├── http-interceptor.js  # Captura requests/responses HTTP
│   ├── mqtt-interceptor.js  # Captura mensajes MQTT
│   ├── error-interceptor.js # Captura errores y warnings
│   └── file-writer.js       # Escribe JSON a disco periódicamente
└── schemas/
    └── status.schema.json   # Schema de validación del output

data/
└── system-console.json      # Archivo que Claude lee (se actualiza cada 2s)
```

## Componentes

### 1. `module.json`
```json
{
  "name": "system-inspector",
  "version": "1.0.0",
  "description": "Captura estado del sistema para consulta por IA",
  "dev_only": true,
  "apis": [
    {
      "method": "GET",
      "path": "/status",
      "handler": "handleGetStatus",
      "description": "Retorna estado completo del sistema"
    },
    {
      "method": "GET",
      "path": "/errors",
      "handler": "handleGetErrors",
      "description": "Retorna solo errores recientes"
    },
    {
      "method": "DELETE",
      "path": "/clear",
      "handler": "handleClear",
      "description": "Limpia el buffer"
    }
  ]
}
```

### 2. `console-buffer.js` - Buffer circular
- Almacena últimas N entradas (configurable, default 500)
- Tipos de entrada: `error`, `warn`, `info`, `debug`, `network`, `mqtt`, `validation`
- Cada entrada tiene: `type`, `source`, `message`, `data`, `timestamp`, `stack` (si aplica)
- Método `getAll()`, `getByType()`, `getSummary()`

### 3. `http-interceptor.js` - Captura HTTP
Se integra con HTTP Gateway via hooks:
- `beforeRequest`: Registra request entrante
- `afterResponse`: Registra response con status, duration, body (truncado)
- Captura: method, path, status, duration_ms, error, request_body, response_body

### 4. `mqtt-interceptor.js` - Captura MQTT
Se suscribe a topics del EventBus:
- `core/+/events/#` - Eventos de todos los cores
- `core/+/errors/#` - Errores
- Captura: topic, payload, timestamp, direction (in/out)

### 5. `error-interceptor.js` - Captura errores
- Hook en `process.on('uncaughtException')`
- Hook en `process.on('unhandledRejection')`
- Intercepta logger.error() y logger.warn()
- Captura: message, stack, source module, context

### 6. `file-writer.js` - Persistencia
- Cada 2 segundos escribe a `/data/system-console.json`
- Formato compacto pero legible
- Rotación: mantiene solo últimas 500 entradas

## Formato de salida (`/data/system-console.json`)

```json
{
  "_meta": {
    "generated_at": "2025-12-26T12:00:00.123Z",
    "core_id": "core-a",
    "uptime_seconds": 3600,
    "buffer_size": 500,
    "entries_count": 127
  },
  "summary": {
    "errors": 3,
    "warnings": 12,
    "network_requests": 89,
    "network_failures": 2,
    "mqtt_messages": 234
  },
  "recent_errors": [
    {
      "type": "error",
      "ts": "2025-12-26T11:59:58.000Z",
      "source": "ai-gateway",
      "message": "Connection refused to OpenAI API",
      "stack": "Error: Connection refused\n    at ...",
      "context": { "endpoint": "https://api.openai.com/v1/chat" }
    }
  ],
  "console": [
    {
      "type": "network",
      "ts": "2025-12-26T11:59:59.100Z",
      "method": "POST",
      "path": "/modules/ai-gateway/chat",
      "status": 500,
      "duration_ms": 2340,
      "error": "upstream timeout",
      "request_body": { "model": "gpt-4", "messages": ["...truncated..."] },
      "response_body": { "error": "timeout" }
    },
    {
      "type": "error",
      "ts": "2025-12-26T11:59:58.000Z",
      "source": "ai-gateway",
      "message": "Connection refused to OpenAI API",
      "stack": "Error: Connection refused\n    at ..."
    },
    {
      "type": "mqtt",
      "ts": "2025-12-26T11:59:57.500Z",
      "direction": "in",
      "topic": "core/core-a/events/chat.failed",
      "payload": { "reason": "timeout", "session_id": "abc123" }
    },
    {
      "type": "warn",
      "ts": "2025-12-26T11:59:55.000Z",
      "source": "http-gateway",
      "message": "Slow response detected",
      "data": { "path": "/api/files", "duration_ms": 1523 }
    },
    {
      "type": "info",
      "ts": "2025-12-26T11:59:50.000Z",
      "source": "project-manager",
      "message": "Project created",
      "data": { "project_id": "proj_123", "name": "mi-proyecto" }
    },
    {
      "type": "validation",
      "ts": "2025-12-26T11:59:45.000Z",
      "path": "/modules/user-manager/users",
      "method": "POST",
      "errors": ["body.email: must be valid email format"]
    }
  ]
}
```

## Integración con el sistema existente

### Hooks a registrar en HTTP Gateway
```javascript
// En index.js del módulo
core.hooks.register('http:beforeRequest', this.captureRequest.bind(this));
core.hooks.register('http:afterResponse', this.captureResponse.bind(this));
```

### Suscripciones MQTT
```javascript
core.eventBus.subscribe('core/+/events/#', this.captureMqttEvent.bind(this));
core.eventBus.subscribe('core/+/errors/#', this.captureMqttError.bind(this));
```

### Intercepción de Logger
```javascript
// Wrappear el logger existente
const originalError = core.logger.error.bind(core.logger);
core.logger.error = (msg, data) => {
  this.captureLogEntry('error', msg, data);
  originalError(msg, data);
};
```

## Cómo Claude lo usa

```bash
# Claude ejecuta Read tool:
Read("/home/user/event-core/data/system-console.json")

# O via HTTP:
curl http://localhost:3000/modules/system-inspector/status
```

Claude obtiene JSON completo y puede:
1. Ver errores recientes y sus stack traces
2. Ver qué requests están fallando
3. Ver flujo de eventos MQTT
4. Diagnosticar problemas sin que el usuario mire logs

## Configuración

En `config.json`:
```json
{
  "modules": {
    "system-inspector": {
      "enabled": true,
      "buffer_size": 500,
      "write_interval_ms": 2000,
      "output_file": "./data/system-console.json",
      "capture": {
        "http": true,
        "mqtt": true,
        "errors": true,
        "logs": true,
        "validation": true
      },
      "truncate_bodies": 1000
    }
  }
}
```

## Solo desarrollo (dev_only)

El módulo solo se carga si:
```javascript
process.env.NODE_ENV !== 'production'
```

O si explícitamente está en la lista de módulos habilitados.

## Orden de implementación

1. **Fase 1**: Estructura base
   - [ ] `module.json`
   - [ ] `index.js` con lifecycle básico
   - [ ] `console-buffer.js`

2. **Fase 2**: Interceptores
   - [ ] `http-interceptor.js`
   - [ ] `error-interceptor.js`
   - [ ] `mqtt-interceptor.js`

3. **Fase 3**: Persistencia
   - [ ] `file-writer.js`
   - [ ] Escribir a `/data/system-console.json`

4. **Fase 4**: APIs
   - [ ] GET `/status`
   - [ ] GET `/errors`
   - [ ] DELETE `/clear`

5. **Fase 5**: Testing
   - [ ] Tests unitarios
   - [ ] Test integración con core

## Dependencias

- Ninguna nueva (usa APIs existentes del core)
- Se integra con: HTTP Gateway, EventBus, Logger, Hooks

## Notas

- El archivo JSON se sobreescribe cada 2 segundos (no crece infinitamente)
- Bodies de request/response truncados a 1000 chars para no saturar
- Stack traces completos para errores
- Formato diseñado para que Claude lo parsee fácilmente
