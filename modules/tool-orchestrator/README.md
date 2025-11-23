# Módulo Tool Orchestrator

**Orquestador de herramientas para AI agents con registro dinámico y validación**

## 🎯 Propósito

Permite registrar, descubrir y ejecutar herramientas (tools) de forma dinámica. Los agentes AI pueden:
- Descubrir herramientas disponibles
- Validar argumentos con JSON Schema
- Ejecutar herramientas con timeout
- Recibir respuestas estructuradas

---

## 🔧 Registro de Herramientas

Las herramientas se registran programáticamente desde otros módulos:

```javascript
// Desde otro módulo en onLoad()
async onLoad() {
  const toolOrchestrator = this.moduleManager.getModule('tool-orchestrator');

  await toolOrchestrator.registerTool(
    'database-manager',           // module_name
    'query',                       // tool_name
    'Execute SQL query',           // description
    {                             // JSON Schema for args
      type: 'object',
      required: ['query', 'project_id'],
      properties: {
        query: { type: 'string' },
        project_id: { type: 'string' },
        params: { type: 'array' }
      }
    },
    async (args, correlationId) => {  // Handler function
      // Execute tool logic
      return { rows: [...], count: 5 };
    }
  );
}
```

---

## 📦 Eventos Publicados

### `tool.registered`
Herramienta registrada exitosamente.

```json
{
  "event_type": "tool.registered",
  "payload": {
    "full_name": "database-manager.query",
    "module_name": "database-manager",
    "tool_name": "query",
    "description": "Execute SQL query",
    "has_schema": true,
    "registered_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### `tool.unregistered`
Herramienta eliminada del registro.

```json
{
  "event_type": "tool.unregistered",
  "payload": {
    "full_name": "database-manager.query",
    "unregistered_at": "2024-01-15T11:00:00.000Z"
  }
}
```

### `tool.call.success`
Herramienta ejecutada exitosamente.

```json
{
  "event_type": "tool.call.success",
  "payload": {
    "full_name": "database-manager.query",
    "request_id": "tool_123",
    "duration": 45,
    "has_result": true
  }
}
```

### `tool.call.failed`
Error en ejecución de herramienta.

```json
{
  "event_type": "tool.call.failed",
  "payload": {
    "full_name": "database-manager.query",
    "request_id": "tool_123",
    "error": "Invalid arguments: query is required",
    "reason": "invalid_arguments"
  }
}
```

**Razones de fallo:**
- `not_found` - Herramienta no existe
- `invalid_arguments` - Argumentos no cumplen schema
- `execution_error` - Error durante ejecución
- `timeout` - Excedió tiempo límite

### `tool.call.response`
Respuesta a solicitud de ejecución.

```json
{
  "event_type": "tool.call.response",
  "payload": {
    "request_id": "tool_123",
    "success": true,
    "result": { "rows": [...], "count": 5 },
    "duration": 45
  }
}
```

### `tool.list.response`
Respuesta a solicitud de listado.

```json
{
  "event_type": "tool.list.response",
  "payload": {
    "request_id": "list_456",
    "success": true,
    "tools": [
      {
        "full_name": "database-manager.query",
        "module_name": "database-manager",
        "tool_name": "query",
        "description": "Execute SQL query",
        "schema": { ... }
      }
    ],
    "count": 1
  }
}
```

### `tool.get.response`
Respuesta a solicitud de definición específica.

```json
{
  "event_type": "tool.get.response",
  "payload": {
    "request_id": "get_789",
    "success": true,
    "tool": {
      "full_name": "database-manager.query",
      "module_name": "database-manager",
      "tool_name": "query",
      "description": "Execute SQL query",
      "schema": { ... }
    }
  }
}
```

---

## 📡 Eventos Suscritos

### `tool.call.request`
Ejecutar herramienta con argumentos.

```json
{
  "full_name": "database-manager.query",
  "args": {
    "query": "SELECT * FROM users",
    "project_id": "proj_123",
    "params": []
  },
  "request_id": "tool_123",
  "correlation_id": "uuid"
}
```

### `tool.list.request`
Listar todas las herramientas disponibles.

```json
{
  "request_id": "list_456",
  "correlation_id": "uuid"
}
```

### `tool.get.request`
Obtener definición de herramienta específica.

```json
{
  "full_name": "database-manager.query",
  "request_id": "get_789",
  "correlation_id": "uuid"
}
```

---

## 🔌 APIs HTTP

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/tools` | Listar herramientas |
| GET | `/tools/:name` | Obtener definición |
| POST | `/tools/:name/call` | Ejecutar herramienta |
| POST | `/tools/register` | Registrar herramienta |
| DELETE | `/tools/:name` | Eliminar herramienta |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas |

---

## 🧪 Ejemplos de Uso

### Listar herramientas disponibles
```bash
curl http://localhost:3000/modules/tool-orchestrator/tools
```

**Respuesta:**
```json
{
  "success": true,
  "tools": [
    {
      "full_name": "database-manager.query",
      "module_name": "database-manager",
      "tool_name": "query",
      "description": "Execute SQL query",
      "schema": { ... }
    },
    {
      "full_name": "ai-connector.generate",
      "module_name": "ai-connector",
      "tool_name": "generate",
      "description": "Generate AI completion"
    }
  ],
  "count": 2
}
```

### Obtener definición de herramienta
```bash
curl http://localhost:3000/modules/tool-orchestrator/tools/database-manager.query
```

**Respuesta:**
```json
{
  "success": true,
  "tool": {
    "full_name": "database-manager.query",
    "module_name": "database-manager",
    "tool_name": "query",
    "description": "Execute SQL query",
    "schema": {
      "type": "object",
      "required": ["query", "project_id"],
      "properties": {
        "query": { "type": "string" },
        "project_id": { "type": "string" },
        "params": { "type": "array" }
      }
    }
  }
}
```

### Ejecutar herramienta
```bash
curl -X POST http://localhost:3000/modules/tool-orchestrator/tools/database-manager.query/call \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "query": "SELECT * FROM users WHERE id = ?",
      "project_id": "proj_123",
      "params": [1]
    }
  }'
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "result": {
    "rows": [
      { "id": 1, "name": "John Doe", "email": "john@example.com" }
    ],
    "count": 1
  },
  "duration": 12
}
```

**Respuesta con error (argumentos inválidos):**
```json
{
  "success": false,
  "error": "Validation failed: 'project_id' is required",
  "details": [
    {
      "instancePath": "",
      "schemaPath": "#/required",
      "keyword": "required",
      "params": { "missingProperty": "project_id" },
      "message": "must have required property 'project_id'"
    }
  ]
}
```

### Registrar herramienta vía HTTP
```bash
curl -X POST http://localhost:3000/modules/tool-orchestrator/tools/register \
  -H "Content-Type: application/json" \
  -d '{
    "module_name": "my-module",
    "tool_name": "my-tool",
    "description": "My custom tool",
    "schema": {
      "type": "object",
      "properties": {
        "input": { "type": "string" }
      }
    }
  }'
```

**Nota:** Registrar vía HTTP **no** permite especificar el handler (función de ejecución). Esta herramienta no será ejecutable, solo consultable. Para herramientas ejecutables, usar el método programático `registerTool()`.

---

## 🔄 Uso desde Otros Módulos (Event-Driven)

### Ejecutar herramienta vía eventos
```javascript
// En otro módulo
async callTool(fullName, args, correlationId) {
  const requestId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Tool call timeout'));
    }, 10000);

    const unsubscribe = this.eventBus.on('tool.call.response', (event) => {
      if (event.payload.request_id === requestId) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.payload);
      }
    });
  });

  await this.eventBus.publish('tool.call.request', {
    full_name: fullName,
    args,
    request_id: requestId,
    correlation_id: correlationId
  });

  const response = await responsePromise;

  if (!response.success) {
    throw new Error(response.error);
  }

  return response.result;
}
```

### Listar herramientas vía eventos
```javascript
async listTools(correlationId) {
  const requestId = `list_${Date.now()}`;

  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

    const unsubscribe = this.eventBus.on('tool.list.response', (event) => {
      if (event.payload.request_id === requestId) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.payload);
      }
    });
  });

  await this.eventBus.publish('tool.list.request', {
    request_id: requestId,
    correlation_id: correlationId
  });

  const response = await responsePromise;
  return response.tools;
}
```

---

## 📊 Métricas

### Counters
- `tool.registered.total` - Total de herramientas registradas
- `tool.unregistered.total` - Total de herramientas eliminadas
- `tool.call.total` - Total de llamadas a herramientas
- `tool.call.success` - Llamadas exitosas
- `tool.call.failed` - Llamadas fallidas
- `tool.call.timeout` - Llamadas con timeout
- `tool.call.invalid_args` - Llamadas con argumentos inválidos

### Gauges
- `tool.registered.count` - Herramientas actualmente registradas

### Timings
- `tool.call.duration` - Tiempo de ejecución de herramientas
- `tool.validation.duration` - Tiempo de validación de argumentos

---

## ⚙️ Configuración

```json
{
  "validationEnabled": true,
  "timeoutMs": 30000,
  "maxRetries": 0,
  "enableCache": false,
  "cacheExpiryMs": 60000
}
```

| Config | Descripción | Default |
|--------|-------------|---------|
| `validationEnabled` | Validar argumentos con JSON Schema | `true` |
| `timeoutMs` | Timeout para ejecución de herramientas | `30000` |
| `maxRetries` | Reintentos en caso de error | `0` |
| `enableCache` | Cache de resultados | `false` |
| `cacheExpiryMs` | Expiración de cache | `60000` |

---

## 🎯 Casos de Uso

1. **AI Agent Tool Discovery** - Agent descubre herramientas disponibles dinámicamente
2. **Validation Layer** - Asegurar que argumentos cumplen contratos
3. **Timeout Protection** - Prevenir bloqueos por herramientas lentas
4. **Cross-Module Integration** - Permitir que módulos expongan funcionalidad como tools
5. **Dynamic Registration** - Cargar/descargar herramientas en runtime

---

## 🔒 Validación con JSON Schema

Todos los argumentos se validan con AJV antes de ejecutar:

```javascript
// Schema de ejemplo
{
  "type": "object",
  "required": ["project_id", "query"],
  "properties": {
    "project_id": {
      "type": "string",
      "minLength": 1
    },
    "query": {
      "type": "string",
      "minLength": 1
    },
    "params": {
      "type": "array",
      "items": {}
    },
    "read_only": {
      "type": "boolean",
      "default": false
    }
  },
  "additionalProperties": false
}
```

**Errores de validación** incluyen detalles específicos en `response.details`:

```json
{
  "success": false,
  "error": "Validation failed: must have required property 'query'",
  "details": [
    {
      "instancePath": "",
      "schemaPath": "#/required",
      "keyword": "required",
      "params": { "missingProperty": "query" },
      "message": "must have required property 'query'"
    }
  ]
}
```

---

## 🏗️ Arquitectura

```
┌─────────────────┐
│   AI Agent      │
└────────┬────────┘
         │ tool.call.request
         ▼
┌─────────────────────────────┐
│  Tool Orchestrator          │
│  ┌──────────────────────┐   │
│  │ 1. Validate Args     │   │
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │ 2. Execute Handler   │   │
│  │    (with timeout)    │   │
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │ 3. Publish Events    │   │
│  └──────────────────────┘   │
└─────────┬───────────────────┘
          │ tool.call.response
          │ tool.call.success/failed
          ▼
    ┌─────────────┐
    │  Listeners  │
    └─────────────┘
```

---

## ✅ Anti-Patrones Evitados

- ❌ **NO** llamar handlers directamente sin validación
- ❌ **NO** bloquear indefinidamente (siempre timeout)
- ❌ **NO** exponer handlers internos vía HTTP sin orquestación
- ✅ **SÍ** validar todos los argumentos
- ✅ **SÍ** emitir eventos para observabilidad
- ✅ **SÍ** manejar timeouts y errores gracefully
