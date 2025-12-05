# Módulo Conversation Manager

**Event-driven conversation management with full project and conversation context**

## 🎯 Propósito

Gestiona conversaciones con AI integrando **dos niveles de contexto**:

1. **Contexto del Proyecto**:
   - Metadata del proyecto (nombre, descripción)
   - Info de storage (archivos disponibles)
   - Tools disponibles
   - Settings del proyecto

2. **Contexto de la Conversación**:
   - Historial de mensajes (configurable window)
   - Tracking de tokens y costos
   - Attachments (via storage-manager)
   - Per-conversation AI settings

---

## 🏗️ Arquitectura

```
┌────────────────────────────────────────────┐
│     Conversation Manager                   │
├────────────────────────────────────────────┤
│ • Conversation Registry                    │
│ • Message History Management               │
│ • Context Loading (Project + Conversation) │
│ • AI Integration (via ai-gateway)          │
│ • Attachment Support                       │
└────────────────────────────────────────────┘
         ↕ via eventos
┌────────────────────────────────────────────┐
│  project-manager    │  storage-manager     │
│  ai-gateway         │  database-manager    │
└────────────────────────────────────────────┘
```

---

## 💬 Crear Conversación

```bash
curl -X POST http://localhost:3000/modules/conversation-manager/conversations \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "proj-123",
    "user_id": "user-456",
    "title": "Planning Session",
    "system_prompt": "You are a helpful project assistant. Help with planning and organizing tasks.",
    "model": "deepseek-chat",
    "provider": "deepseek",
    "temperature": 0.7,
    "max_tokens": 2000,
    "context_window": 20
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "conversation": {
    "id": "conv-abc-123",
    "project_id": "proj-123",
    "user_id": "user-456",
    "title": "Planning Session",
    "system_prompt": "You are a helpful project assistant...",
    "model": "deepseek-chat",
    "provider": "deepseek",
    "temperature": 0.7,
    "max_tokens": 2000,
    "context_window": 20,
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z",
    "message_count": 0,
    "metadata": {}
  }
}
```

---

## 📨 Enviar Mensaje

```bash
curl -X POST http://localhost:3000/modules/conversation-manager/conversations/conv-abc-123/messages \
  -H "Content-Type: application/json" \
  -d '{
    "content": "What files do we have in this project?",
    "user_id": "user-456",
    "attachments": [],
    "metadata": {}
  }'
```

**Flujo interno:**
```
1. Guarda mensaje del usuario en DB
        ↓
2. Carga contexto del proyecto (via project.get.request)
   - Nombre del proyecto
   - Descripción
   - Info de storage (via storage.info.request)
        ↓
3. Carga contexto de conversación (últimos N mensajes)
        ↓
4. Construye mensajes para AI:
   [
     {role: "system", content: "system_prompt + project context"},
     {role: "user", content: "mensaje1"},
     {role: "assistant", content: "respuesta1"},
     ...
     {role: "user", content: "What files do we have..."}
   ]
        ↓
5. Llama AI via ai.chat.request
        ↓
6. Guarda respuesta de AI en DB
        ↓
7. Publica message.sent y message.received
```

**Respuesta:**
```json
{
  "success": true,
  "user_message": {
    "id": "msg-user-123",
    "conversation_id": "conv-abc-123",
    "role": "user",
    "content": "What files do we have in this project?",
    "attachments": [],
    "tokens": null,
    "cost": null,
    "created_at": "2024-01-15T10:35:00.000Z",
    "metadata": {}
  },
  "assistant_message": {
    "id": "msg-ai-456",
    "conversation_id": "conv-abc-123",
    "role": "assistant",
    "content": "Based on the project storage, you have 15 files totaling 5.2MB...",
    "attachments": [],
    "tokens": 450,
    "cost": 0.00075,
    "created_at": "2024-01-15T10:35:02.000Z",
    "metadata": {
      "model": "deepseek-chat",
      "provider": "deepseek"
    }
  },
  "tokens_used": 450,
  "cost": 0.00075,
  "duration": 2345
}
```

---

## 📋 Listar Conversaciones

### Todas las conversaciones
```bash
curl http://localhost:3000/modules/conversation-manager/conversations
```

### Filtrar por proyecto
```bash
curl "http://localhost:3000/modules/conversation-manager/conversations?project_id=proj-123"
```

**Respuesta:**
```json
{
  "success": true,
  "conversations": [
    {
      "id": "conv-abc-123",
      "project_id": "proj-123",
      "title": "Planning Session",
      "message_count": 12,
      "created_at": "2024-01-15T10:30:00.000Z",
      ...
    }
  ],
  "count": 1
}
```

---

## 🔍 Obtener Conversación con Contexto

```bash
curl http://localhost:3000/modules/conversation-manager/conversations/conv-abc-123
```

**Respuesta:**
```json
{
  "success": true,
  "conversation": {
    "id": "conv-abc-123",
    "project_id": "proj-123",
    ...
  },
  "messages": [
    {"role": "user", "content": "...", ...},
    {"role": "assistant", "content": "...", ...}
  ],
  "project_context": {
    "project_id": "proj-123",
    "project_name": "E-commerce Platform",
    "project_description": "Main e-commerce project",
    "storage_info": {
      "total_size": 5242880,
      "file_count": 15,
      "by_category": {
        "uploads": {"size": 3145728, "count": 8},
        "exports": {"size": 1048576, "count": 4}
      }
    },
    "available_tools": [],
    "metadata": {}
  }
}
```

---

## 📜 Obtener Mensajes

```bash
curl "http://localhost:3000/modules/conversation-manager/conversations/conv-abc-123/messages?limit=50&offset=0"
```

**Respuesta:**
```json
{
  "success": true,
  "messages": [
    {
      "id": "msg-1",
      "conversation_id": "conv-abc-123",
      "role": "user",
      "content": "Hello",
      "attachments": [],
      "tokens": null,
      "cost": null,
      "created_at": "2024-01-15T10:31:00.000Z"
    },
    {
      "id": "msg-2",
      "conversation_id": "conv-abc-123",
      "role": "assistant",
      "content": "Hi! How can I help?",
      "tokens": 25,
      "cost": 0.00005,
      "created_at": "2024-01-15T10:31:01.000Z"
    }
  ],
  "count": 2,
  "total_tokens": 25,
  "total_cost": 0.00005
}
```

---

## 🔄 Actualizar Conversación

```bash
curl -X PUT http://localhost:3000/modules/conversation-manager/conversations/conv-abc-123 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Planning Session",
    "temperature": 0.8,
    "system_prompt": "New system prompt"
  }'
```

---

## 🗑️ Eliminar Conversación

```bash
curl -X DELETE http://localhost:3000/modules/conversation-manager/conversations/conv-abc-123
```

**Respuesta:**
```json
{
  "success": true,
  "id": "conv-abc-123",
  "messages_deleted": 12,
  "message": "Conversation deleted successfully"
}
```

---

## 🎯 Contexto Completo

### Endpoint dedicado para ver todo el contexto

```bash
curl http://localhost:3000/modules/conversation-manager/conversations/conv-abc-123/context
```

**Respuesta:**
```json
{
  "success": true,
  "project_context": {
    "project_id": "proj-123",
    "project_name": "E-commerce Platform",
    "project_description": "Main project",
    "storage_info": {...},
    "available_tools": [],
    "metadata": {}
  },
  "conversation_context": {
    "conversation_id": "conv-abc-123",
    "messages": [...],
    "message_count": 12,
    "total_tokens": 5400,
    "total_cost": 0.0045
  }
}
```

---

## 📡 Eventos Publicados

### conversation.created
```json
{
  "event_type": "conversation.created",
  "payload": {
    "conversation_id": "conv-abc-123",
    "project_id": "proj-123",
    "user_id": "user-456",
    "title": "Planning Session",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### message.sent
```json
{
  "event_type": "message.sent",
  "payload": {
    "message_id": "msg-user-123",
    "conversation_id": "conv-abc-123",
    "project_id": "proj-123",
    "user_id": "user-456",
    "content": "What files do we have?",
    "attachments": [],
    "sent_at": "2024-01-15T10:35:00.000Z"
  }
}
```

### message.received
```json
{
  "event_type": "message.received",
  "payload": {
    "message_id": "msg-ai-456",
    "conversation_id": "conv-abc-123",
    "project_id": "proj-123",
    "content": "You have 15 files...",
    "tokens": 450,
    "cost": 0.00075,
    "model": "deepseek-chat",
    "provider": "deepseek",
    "received_at": "2024-01-15T10:35:02.000Z"
  }
}
```

### conversation.context.loaded
```json
{
  "event_type": "conversation.context.loaded",
  "payload": {
    "conversation_id": "conv-abc-123",
    "project_id": "proj-123",
    "message_count": 12,
    "context_size": 5400,
    "loaded_at": "2024-01-15T10:35:00.500Z"
  }
}
```

---

## 🔍 Eventos de Query (Request/Response)

### conversation.send.request / conversation.send.response

**Otros módulos pueden enviar mensajes via eventos:**

```javascript
await eventBus.publish('conversation.send.request', {
  request_id: 'req-123',
  conversation_id: 'conv-abc-123',
  content: 'Hello from another module',
  user_id: 'user-456',
  attachments: [],
  metadata: {},
  correlation_id: 'corr-789'
});

// Response:
{
  "event_type": "conversation.send.response",
  "payload": {
    "request_id": "req-123",
    "success": true,
    "user_message": {...},
    "assistant_message": {...},
    "tokens_used": 450,
    "cost": 0.00075,
    "duration": 2345
  }
}
```

---

## 🧠 Context Window

El **context window** controla cuántos mensajes se incluyen en la conversación con AI.

**Ejemplo:**
```json
{
  "context_window": 20
}
```

- Solo los últimos **20 mensajes** se envían a AI
- Mensajes más antiguos permanecen en DB pero no se incluyen
- Configurable por conversación
- Default: 20 (configurable en module.json)

**Beneficios:**
- ✅ Reduce costos (menos tokens)
- ✅ Evita límites de contexto del modelo
- ✅ Mantiene conversaciones relevantes

---

## 📎 Attachments

Soporte para archivos adjuntos (integración con storage-manager):

```bash
# 1. Upload archivo a storage
curl -X POST http://localhost:3000/modules/storage-manager/storage/proj-123/upload \
  -F "file=@document.pdf" \
  -F "category=uploads"

# Respuesta: {"file": {"id": "file-abc-123", ...}}

# 2. Enviar mensaje con attachment
curl -X POST http://localhost:3000/modules/conversation-manager/conversations/conv-123/messages \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Please review this document",
    "attachments": [
      {
        "file_id": "file-abc-123",
        "filename": "document.pdf",
        "type": "application/pdf"
      }
    ]
  }'
```

---

## ⚙️ Configuración

```json
{
  "contextWindow": 20,
  "maxMessagesPerConversation": 10000,
  "dbTimeout": 10000,
  "aiTimeout": 60000,
  "includeProjectContext": true,
  "includeStorageInfo": true,
  "defaultSystemPrompt": "You are a helpful AI assistant..."
}
```

**Parámetros:**
- `contextWindow`: Mensajes incluidos en AI context (default: 20)
- `maxMessagesPerConversation`: Límite total de mensajes (default: 10000)
- `dbTimeout`: Timeout para DB queries (default: 10000ms)
- `aiTimeout`: Timeout para AI requests (default: 60000ms)
- `includeProjectContext`: Incluir contexto del proyecto en system prompt (default: true)
- `includeStorageInfo`: Incluir info de storage en context (default: true)
- `defaultSystemPrompt`: System prompt por defecto

---

## 📊 Métricas

### Counters
- `conversation.created.total`
- `conversation.updated.total`
- `conversation.deleted.total`
- `message.sent.total`
- `message.received.total`
- `conversation.context.loaded.total`
- `conversation.error.total`

### Gauges
- `conversation.active.count`
- `conversation.messages.total`
- `conversation.pending.requests`

### Timings
- `conversation.message.duration`
- `conversation.context.load.duration`

---

## 🎯 Casos de Uso

1. **Project-scoped Chat** - Conversaciones aisladas por proyecto
2. **Context-aware AI** - AI conoce archivos y estado del proyecto
3. **Multi-user Collaboration** - Usuarios comparten conversaciones en proyecto
4. **Document Q&A** - Preguntas sobre archivos del proyecto
5. **Task Planning** - AI ayuda a organizar tareas del proyecto

---

## 🔗 Integración con Otros Módulos

### Project Manager
Contexto del proyecto cargado automáticamente:
```javascript
const projectContext = await loadProjectContext(projectId, correlationId);
// Include in system prompt: "Project: ${project_name}, Description: ..."
```

### Storage Manager
Info de archivos en contexto:
```javascript
const storageInfo = await loadStorageInfo(projectId, correlationId);
// AI sabe: "You have 15 files, 5.2MB total..."
```

### AI Gateway
Respuestas AI via eventos:
```javascript
await eventBus.publish('ai.chat.request', {
  messages: [...],
  provider: 'deepseek',
  model: 'deepseek-chat',
  ...
});
```

### Database Manager
Persistencia completa:
```javascript
await eventBus.publish('db.query.request', {
  project_id: 'system',
  query: 'INSERT INTO conversations ...',
  ...
});
```

---

## 📝 Ejemplo Completo: Flujo End-to-End

```bash
# 1. Crear proyecto
curl -X POST http://localhost:3000/modules/project-manager/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "My SaaS", "description": "Production"}'
# → {"project": {"id": "proj-123", ...}}

# 2. Upload archivo al proyecto
curl -X POST http://localhost:3000/modules/storage-manager/storage/proj-123/upload \
  -F "file=@requirements.pdf"
# → {"file": {"id": "file-456", ...}}

# 3. Crear conversación en el proyecto
curl -X POST http://localhost:3000/modules/conversation-manager/conversations \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "proj-123",
    "user_id": "user-789",
    "title": "Planning",
    "system_prompt": "You are a project assistant. Help with planning."
  }'
# → {"conversation": {"id": "conv-abc", ...}}

# 4. Enviar mensaje (AI tendrá contexto del proyecto + archivo)
curl -X POST http://localhost:3000/modules/conversation-manager/conversations/conv-abc/messages \
  -H "Content-Type: application/json" \
  -d '{
    "content": "What files do we have? Can you summarize the requirements?",
    "user_id": "user-789"
  }'
# → AI responde con contexto completo del proyecto

# 5. Ver contexto completo
curl http://localhost:3000/modules/conversation-manager/conversations/conv-abc/context
# → Muestra project context + conversation context

# 6. Continuar conversación
curl -X POST http://localhost:3000/modules/conversation-manager/conversations/conv-abc/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Create a task list based on requirements", "user_id": "user-789"}'
# → AI genera task list con contexto de mensajes anteriores
```

---

## 🏁 Health & Metrics

```bash
# Health
curl http://localhost:3000/modules/conversation-manager/health

# Respuesta
{
  "status": "healthy",
  "module": "conversation-manager",
  "conversations_count": 25,
  "pending_requests": 2,
  "uptime": 3600.5
}

# Metrics
curl http://localhost:3000/modules/conversation-manager/metrics

# Respuesta
{
  "module": "conversation-manager",
  "metrics": {
    "conversations_count": 25,
    "pending_db_requests": 0,
    "pending_ai_requests": 2
  }
}
```
