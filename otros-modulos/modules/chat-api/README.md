# Módulo Chat API

**Gestión de conversaciones con integración AI usando arquitectura event-driven**

## 🔗 Integración con Otros Módulos

Este módulo se comunica **100% vía eventos** con:
- **database-manager** - Persistencia de conversaciones y mensajes
- **ai-connector** - Generación de respuestas AI

**NO usa HTTP interno** - Cumple con el template.

---

## 📦 Eventos Publicados

### `chat.conversation.created`
Nueva conversación creada.

```json
{
  "event_type": "chat.conversation.created",
  "payload": {
    "conversation_id": "conv_1234567890_abc123",
    "title": "New Conversation",
    "project_id": "default",
    "provider": "deepseek",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### `chat.conversation.deleted`
Conversación eliminada.

```json
{
  "event_type": "chat.conversation.deleted",
  "payload": {
    "conversation_id": "conv_1234567890_abc123",
    "deleted_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### `chat.message.sent`
Mensaje de usuario enviado.

```json
{
  "event_type": "chat.message.sent",
  "payload": {
    "message_id": "msg_1234567890_xyz",
    "conversation_id": "conv_1234567890_abc123",
    "content": "What is machine learning?",
    "content_length": 26
  }
}
```

### `chat.message.ai.received`
Respuesta AI recibida.

```json
{
  "event_type": "chat.message.ai.received",
  "payload": {
    "message_id": "msg_1234567891_def",
    "conversation_id": "conv_1234567890_abc123",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "tokens": 250,
    "duration": 1500
  }
}
```

### `chat.send.response`
Respuesta a solicitud de envío vía eventos.

```json
{
  "event_type": "chat.send.response",
  "payload": {
    "request_id": "req_123",
    "success": true,
    "user_message_id": "msg_123",
    "ai_message_id": "msg_124",
    "ai_content": "Machine learning is...",
    "provider": "deepseek",
    "duration": 1500
  }
}
```

---

## 📡 Eventos Suscritos

### `chat.send.request`
Permite enviar mensajes desde otros módulos.

```json
{
  "conversation_id": "conv_123",
  "content": "Hello AI",
  "provider": "openai",
  "model": "gpt-4",
  "skip_ai": false,
  "request_id": "req_123",
  "correlation_id": "uuid"
}
```

### `db.query.response`
Recibe respuestas de database-manager.

### `db.schema.init.response`
Recibe confirmación de inicialización de esquema.

### `ai.generate.response`
Recibe respuestas de ai-connector.

---

## 🔌 APIs HTTP

| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/conversations` | Crear conversación |
| GET | `/conversations` | Listar conversaciones |
| GET | `/conversations/:id` | Obtener conversación con mensajes |
| DELETE | `/conversations/:id` | Eliminar conversación |
| POST | `/conversations/:id/messages` | Enviar mensaje (genera respuesta AI) |
| GET | `/conversations/:id/messages` | Obtener mensajes |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas |

---

## 🧪 Ejemplos de Uso

### Crear conversación
```bash
curl -X POST http://localhost:3000/modules/chat-api/conversations \
  -H "Content-Type: application/json" \
  -d '{
    "title": "AI Discussion",
    "provider": "deepseek",
    "system_prompt": "You are a helpful assistant specialized in AI topics"
  }'
```

### Listar conversaciones
```bash
curl http://localhost:3000/modules/chat-api/conversations
```

### Enviar mensaje (con respuesta AI)
```bash
curl -X POST http://localhost:3000/modules/chat-api/conversations/conv_123/messages \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Explain neural networks in simple terms",
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

### Enviar mensaje (sin respuesta AI)
```bash
curl -X POST http://localhost:3000/modules/chat-api/conversations/conv_123/messages \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This is just a note",
    "skip_ai": true
  }'
```

### Obtener conversación completa
```bash
curl http://localhost:3000/modules/chat-api/conversations/conv_123
```

### Obtener solo mensajes
```bash
curl http://localhost:3000/modules/chat-api/conversations/conv_123/messages
```

### Eliminar conversación
```bash
curl -X DELETE http://localhost:3000/modules/chat-api/conversations/conv_123
```

---

## 🔄 Uso desde Otros Módulos (Event-Driven)

### Enviar mensaje vía eventos
```javascript
// En otro módulo
async sendChatMessage(conversationId, content, correlationId) {
  const requestId = `chat_${Date.now()}`;

  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 65000);

    const unsubscribe = this.eventBus.on('chat.send.response', (event) => {
      if (event.payload.request_id === requestId) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.payload);
      }
    });
  });

  await this.eventBus.publish('chat.send.request', {
    conversation_id: conversationId,
    content,
    request_id: requestId,
    correlation_id: correlationId
  });

  const response = await responsePromise;

  if (!response.success) {
    throw new Error(response.error);
  }

  return response;
}
```

---

## 🗄️ Esquema de Base de Datos

### Tabla: conversations
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  project_id TEXT,
  provider TEXT,
  model TEXT,
  system_prompt TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Tabla: messages
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  tokens INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
```

---

## 📊 Métricas

### Counters
- `chat.conversation.created.total` - Conversaciones creadas
- `chat.conversation.deleted.total` - Conversaciones eliminadas
- `chat.message.sent.total` - Mensajes de usuario
- `chat.message.ai.total` - Respuestas AI
- `chat.errors.total` - Errores

### Gauges
- `chat.conversations.active` - Conversaciones activas
- `chat.pending.requests` - Solicitudes en progreso

### Timings
- `chat.message.ai.duration` - Tiempo de respuesta AI
- `chat.db.query.duration` - Tiempo de queries DB

---

## 🔄 Flujo de Datos (Event-Driven)

```
1. Usuario envía mensaje via HTTP
   ↓
2. chat-api guarda mensaje en DB via evento
   → Publica: db.query.request
   ← Recibe: db.query.response
   ↓
3. chat-api solicita generación AI via evento
   → Publica: ai.generate.request
   ↓
4. ai-connector solicita credencial via evento
   → Publica: credential.resolve.request
   ← Recibe: credential.resolve.response
   ↓
5. ai-connector llama API externa
   ↓
6. ai-connector responde via evento
   → Publica: ai.generate.response
   ← chat-api recibe respuesta
   ↓
7. chat-api guarda respuesta AI en DB via evento
   → Publica: db.query.request
   ← Recibe: db.query.response
   ↓
8. chat-api retorna resultado al usuario
```

**Todo vía eventos - CERO HTTP interno**

---

## ⚙️ Configuración

```json
{
  "defaultProjectId": "default",
  "defaultProvider": "deepseek",
  "maxMessagesPerConversation": 1000,
  "messageTimeout": 60000
}
```
