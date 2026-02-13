# Módulo AI Gateway v2.0

**Gateway unificado para múltiples proveedores LLM - 100% Event-Driven**

## 🎯 Responsabilidad

Abstraer múltiples proveedores de IA (DeepSeek, Anthropic, OpenAI, Ollama) detrás de una interfaz unificada. Procesar solicitudes de IA via eventos MQTT con fallback automático y tracking de costos.

## ✅ Características

- ✅ **100% Event-Driven** - Comunica SOLO via `eventBus.publish()` / `subscribe()`
- ✅ **Multi-Provider** - DeepSeek, Anthropic (Claude), OpenAI, Ollama
- ✅ **Fallback Automático** - Si un proveedor falla, intenta con el siguiente
- ✅ **Cost Tracking** - Seguimiento de tokens y costos por proveedor
- ✅ **JSON Schema Validation** - Contratos formales
- ✅ **Logging estructurado** - Todos los logs con `correlationId`
- ✅ **Métricas completas** - Counters, gauges, timings
- ✅ **< 500 líneas** - Core simple, providers externalizados

## 🔄 Flujo de Trabajo

```
ai.request (MQTT) → ai-gateway
    ↓
Seleccionar proveedor (por prioridad/disponibilidad)
    ↓
Procesar con provider (DeepSeek/Claude/OpenAI)
    ↓
Parsear respuesta y calcular costo
    ↓
Publicar ai.response (MQTT)
    ↓
menu-generator recibe respuesta
```

## 📦 Eventos Publicados

### `ai.response`

Respuesta de procesamiento IA exitosa.

```json
{
  "event_type": "ai.response",
  "payload": {
    "request_id": "req_abc123",
    "status": "success",
    "data": {
      "productos": [...],
      "categorias": [...]
    },
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "usage": {
      "prompt_tokens": 1250,
      "completion_tokens": 3420,
      "total_tokens": 4670,
      "cost": 0.0852
    },
    "duration_ms": 8500
  }
}
```

### `ai.error`

Error en procesamiento IA.

```json
{
  "event_type": "ai.error",
  "payload": {
    "request_id": "req_abc123",
    "error_type": "provider_unavailable",
    "message": "All providers are unavailable",
    "provider": "anthropic",
    "details": {
      "attempted_providers": ["anthropic", "deepseek", "openai"]
    }
  }
}
```

## 📡 Eventos Suscritos

### `ai.request`

Solicitud de procesamiento IA.

**Payload esperado:**

```json
{
  "request_id": "req_abc123",
  "type": "menu_parse",
  "prompt_id": "menu_parser_v1",
  "data": {
    "file_base64": "...",
    "file_name": "menu.jpg",
    "file_type": "image/jpeg",
    "context": {
      "extraction_requirements": [...]
    }
  },
  "options": {
    "temperature": 0.3,
    "max_tokens": 4000
  }
}
```

**Acción:**
1. Seleccionar proveedor disponible (por prioridad)
2. Construir prompt según tipo de request
3. Ejecutar con provider
4. Parsear respuesta
5. Publicar `ai.response` o `ai.error`

## 🔌 APIs HTTP

| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/chat` | Chat completion directo (también publica ai.response) |
| GET | `/providers` | Listar proveedores y su estado |
| GET | `/models` | Listar modelos por proveedor |
| GET | `/usage` | Estadísticas de uso y costos |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas del módulo |

## 📊 Métricas

**Counters:**
- `ai.request.total` - Total de solicitudes procesadas
- `ai.response.total` - Total de respuestas exitosas
- `ai.error.total` - Total de errores
- `ai.tokens.total` - Total de tokens consumidos

**Gauges:**
- `ai.providers.active` - Proveedores activos
- `ai.cost.total` - Costo total acumulado

**Timings:**
- `ai.request.duration` - Latencia de procesamiento

## 🧪 Ejemplos de Uso

### Chat completion directo (HTTP)

```bash
curl -X POST http://localhost:3339/modules/ai-gateway/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "Eres un asistente útil"
      },
      {
        "role": "user",
        "content": "¿Qué es una pizza?"
      }
    ],
    "provider": "auto",
    "temperature": 0.7,
    "max_tokens": 500
  }'
```

**Respuesta:**
```json
{
  "status": 200,
  "data": {
    "id": "msg_abc123",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "message": {
      "role": "assistant",
      "content": "Una pizza es..."
    },
    "usage": {
      "prompt_tokens": 25,
      "completion_tokens": 150,
      "total_tokens": 175,
      "cost": 0.00004
    },
    "duration_ms": 1250
  }
}
```

### Consultar proveedores

```bash
curl http://localhost:3339/modules/ai-gateway/providers
```

**Respuesta:**
```json
{
  "status": 200,
  "data": {
    "providers": [
      {
        "name": "deepseek",
        "enabled": true,
        "available": true,
        "priority": 1,
        "models": ["deepseek-chat", "deepseek-coder"],
        "default_model": "deepseek-chat"
      },
      {
        "name": "anthropic",
        "enabled": true,
        "available": true,
        "priority": 2,
        "models": ["claude-3-5-sonnet-20241022"],
        "default_model": "claude-3-5-sonnet-20241022"
      }
    ],
    "total": 2
  }
}
```

### Estadísticas de uso

```bash
curl http://localhost:3339/modules/ai-gateway/usage
```

**Respuesta:**
```json
{
  "status": 200,
  "data": {
    "total_requests": 45,
    "total_tokens": 125340,
    "total_cost": 1.2456,
    "by_provider": {
      "deepseek": {
        "requests": 30,
        "tokens": 85000,
        "cost": 0.0170,
        "errors": 0
      },
      "anthropic": {
        "requests": 15,
        "tokens": 40340,
        "cost": 1.2286,
        "errors": 0
      }
    }
  }
}
```

## 🏗️ Arquitectura

```
ai.request (MQTT)
    ↓
onAIRequest()
    ↓
selectProviderByPriority()
    ↓
    ├── DeepSeek (priority 1) ← Más económico
    ├── Anthropic (priority 2) ← Mejor calidad
    ├── OpenAI (priority 3)
    └── Ollama (priority 4) ← Local, gratis
    ↓
provider.chatCompletion()
    ↓
publishAIResponse() → MQTT
    ↓
menu-generator recibe respuesta
```

**NO hay HTTP interno entre módulos.** Solo eventos MQTT.

## 🤖 Proveedores Soportados

### DeepSeek (Recomendado para producción)

- **Prioridad:** 1 (mayor)
- **Modelo:** deepseek-chat
- **Costo:** $0.0001/1K tokens input, $0.0002/1K output
- **Velocidad:** Rápido
- **Uso:** Parseo de menús, tareas generales

### Anthropic (Claude)

- **Prioridad:** 2
- **Modelo:** claude-3-5-sonnet-20241022
- **Costo:** $0.003/1K tokens input, $0.015/1K output
- **Velocidad:** Medio
- **Uso:** Tareas complejas, visión (si soporta imágenes)

### OpenAI

- **Prioridad:** 3
- **Modelo:** gpt-4o-mini
- **Costo:** $0.0015/1K tokens input, $0.006/1K output
- **Velocidad:** Medio-rápido
- **Uso:** Fallback

### Ollama (Local)

- **Prioridad:** 4 (menor)
- **Modelo:** llama2
- **Costo:** $0 (gratis, local)
- **Velocidad:** Depende del hardware
- **Uso:** Desarrollo local sin costos

## 🔍 Logging

Todos los logs incluyen `correlationId`:

```json
{
  "timestamp": "2025-01-17T10:00:00Z",
  "level": "info",
  "event": "ai.request.completed",
  "module": "ai-gateway",
  "correlation_id": "req_abc123",
  "data": {
    "request_id": "req_abc123",
    "provider": "deepseek",
    "duration": 1250
  }
}
```

## 💰 Cálculo de Costos

Costos por proveedor (por 1K tokens):

| Proveedor | Input | Output | Total (ejemplo 1K+1K) |
|-----------|-------|--------|----------------------|
| DeepSeek | $0.0001 | $0.0002 | $0.0003 |
| Anthropic | $0.003 | $0.015 | $0.018 |
| OpenAI | $0.0015 | $0.006 | $0.0075 |
| Ollama | $0 | $0 | $0 |

**Ejemplo parseo de menú típico:**
- Input: ~1,500 tokens (prompt + imagen)
- Output: ~3,500 tokens (JSON productos)
- Total: ~5,000 tokens

**Costo con DeepSeek:** ~$0.001 (1/10 de centavo)
**Costo con Claude:** ~$0.057 (6 centavos)

## 🧩 Integración con Otros Módulos

```
menu-generator
    ↓ ai.request (MQTT)
ai-gateway ← Procesa con provider
    ↓ ai.response (MQTT)
menu-generator ← Recibe menú parseado
```

**Todo via eventos MQTT.**

## 📝 Notas de Implementación

### Variables de Entorno

Cada proveedor requiere su API key:

```bash
DEEPSEEK_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
# Ollama no requiere key (local)
```

### Fallback Strategy

Si `fallback.enabled = true`:
1. Intenta con proveedor de mayor prioridad
2. Si falla, intenta con siguiente
3. Si todos fallan, publica `ai.error`

### Timeout

Request timeout: 60 segundos por defecto.

### Retry

- Max attempts: 3
- Backoff: Exponencial (1s, 2s, 4s)

## 🎓 Ventajas del Enfoque

1. **Abstracción** - Cambiar de proveedor sin modificar otros módulos
2. **Fallback** - Alta disponibilidad automática
3. **Cost Optimization** - Usa el proveedor más económico primero
4. **Tracking** - Visibilidad completa de uso y costos
5. **Event-Driven** - Desacoplamiento total
6. **Escalable** - Añadir nuevos providers fácilmente

## 🔧 Añadir Nuevo Proveedor

1. Crear `providers/nuevo-provider.js` extendiendo `BaseProvider`
2. Implementar `chatCompletion()` y `isAvailable()`
3. Añadir configuración en `module.json`
4. Importar en `index.js`

---

**Versión:** 2.0.0
**Líneas de código:** ~480 (core) + ~400 (providers)
**Cumplimiento prompts:** 100%
**Basado en:** TEMPLATE_MODULO.md y ARQUITECTURA_MENU_GENERATIVO.md
