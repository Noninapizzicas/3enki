# Módulo AI Connector

**Conexión multi-proveedor AI usando resolución de credenciales event-driven**

## 🤖 Proveedores Soportados

| Proveedor | Modelo Default | Credential Provider |
|-----------|----------------|---------------------|
| deepseek | deepseek-chat | DEEPSEEK |
| openai | gpt-4 | OPENAI |
| anthropic | claude-3-5-sonnet-20241022 | ANTHROPIC |

---

## 📦 Eventos Publicados

### `ai.response.generated`
Respuesta AI generada exitosamente.

```json
{
  "event_type": "ai.response.generated",
  "payload": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "duration": 1500,
    "tokens_used": 250,
    "prompt_length": 100,
    "response_length": 450
  }
}
```

### `ai.response.failed`
Generación AI falló.

```json
{
  "event_type": "ai.response.failed",
  "payload": {
    "provider": "openai",
    "model": "gpt-4",
    "error": "API error 429: Rate limit exceeded",
    "error_code": "RATE_LIMIT"
  }
}
```

### `ai.generate.response`
Respuesta a solicitud de generación vía eventos.

```json
{
  "event_type": "ai.generate.response",
  "payload": {
    "request_id": "req_123",
    "success": true,
    "response": "AI generated text here...",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "usage": {
      "prompt_tokens": 50,
      "completion_tokens": 200,
      "total_tokens": 250
    },
    "duration": 1500
  }
}
```

---

## 📡 Eventos Suscritos

### `ai.generate.request`
Permite a otros módulos solicitar generación AI sin HTTP.

```json
{
  "prompt": "Explain quantum computing",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant" },
    { "role": "user", "content": "Explain quantum computing" }
  ],
  "provider": "openai",
  "model": "gpt-4",
  "project_id": "myapp",
  "client_id": "client123",
  "custom_id": null,
  "temperature": 0.7,
  "max_tokens": 2000,
  "request_id": "req_123",
  "correlation_id": "uuid"
}
```

### `credential.resolve.response`
Recibe respuestas de resolución de credenciales.

---

## 🔌 APIs HTTP

| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/generate` | Generar respuesta AI |
| GET | `/providers` | Listar proveedores |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas |

---

## 🧪 Ejemplos de Uso

### Generar con provider default
```bash
curl -X POST http://localhost:3000/modules/ai-connector/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is machine learning?"
  }'
```

### Generar con provider específico
```bash
curl -X POST http://localhost:3000/modules/ai-connector/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain neural networks",
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.5,
    "max_tokens": 1000
  }'
```

### Generar con contexto de conversación
```bash
curl -X POST http://localhost:3000/modules/ai-connector/generate \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "system", "content": "You are a Python expert" },
      { "role": "user", "content": "How do decorators work?" }
    ],
    "provider": "deepseek"
  }'
```

### Generar con resolución de credenciales específica
```bash
curl -X POST http://localhost:3000/modules/ai-connector/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Hello world",
    "project_id": "myapp",
    "client_id": "acme"
  }'
```

### Listar proveedores
```bash
curl http://localhost:3000/modules/ai-connector/providers
```

---

## 🔄 Uso desde Otros Módulos (Event-Driven)

### Solicitar generación vía eventos
```javascript
// En chat-api
async generateAIResponse(prompt, context) {
  const requestId = `ai_${Date.now()}`;

  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 35000);

    const unsubscribe = this.eventBus.on('ai.generate.response', (event) => {
      if (event.payload.request_id === requestId) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.payload);
      }
    });
  });

  await this.eventBus.publish('ai.generate.request', {
    prompt,
    provider: 'deepseek',
    project_id: context.projectId,
    request_id: requestId,
    correlation_id: context.correlationId
  });

  const response = await responsePromise;

  if (!response.success) {
    throw new Error(response.error);
  }

  return response.response;
}
```

---

## 🔐 Resolución de Credenciales

El módulo usa **eventos** para resolver credenciales:

1. Publica `credential.resolve.request` a credential-manager
2. Espera `credential.resolve.response`
3. Usa el API key resuelto para llamar al proveedor

**NO usa HTTP interno** - 100% event-driven.

---

## 📊 Métricas

### Counters
- `ai.request.total` - Total de solicitudes
- `ai.request.success` - Solicitudes exitosas
- `ai.request.failed` - Solicitudes fallidas
- `ai.request.deepseek` - Solicitudes a Deepseek
- `ai.request.openai` - Solicitudes a OpenAI
- `ai.request.anthropic` - Solicitudes a Anthropic

### Gauges
- `ai.pending.requests` - Solicitudes en progreso

### Timings
- `ai.request.duration` - Tiempo total de solicitud
- `ai.credential.resolve.duration` - Tiempo de resolución de credenciales

---

## ⚙️ Configuración

```json
{
  "defaultProvider": "deepseek",
  "timeout": 30000,
  "retries": 2,
  "providers": {
    "deepseek": {
      "model": "deepseek-chat",
      "endpoint": "https://api.deepseek.com/chat/completions",
      "credentialProvider": "DEEPSEEK"
    },
    "openai": {
      "model": "gpt-4",
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "credentialProvider": "OPENAI"
    },
    "anthropic": {
      "model": "claude-3-5-sonnet-20241022",
      "endpoint": "https://api.anthropic.com/v1/messages",
      "credentialProvider": "ANTHROPIC"
    }
  }
}
```
