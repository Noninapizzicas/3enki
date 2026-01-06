# Refactorización: Módulos del Chat

## Problema Actual

`conversation-manager` es un "God Module" con 2469 líneas que hace demasiado:
- CRUD de conversaciones y mensajes
- Gestión de contexto (FIFO)
- Composición de prompts
- Carga de tools
- Ejecución de tools (llamada directa a moduleLoader)
- Loop de tool_calls
- Llamadas a IA
- UI handlers
- HTTP handlers

**Problema crítico**: Ejecuta tools via `moduleLoader.executeTool()` (llamada directa), no via eventos.

---

## Nueva Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        FLUJO DEL CHAT                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  UI ──► chat-orchestrator ──► conversation-manager             │
│              │                                                  │
│              ├──► ai-gateway (decisión IA)                     │
│              │                                                  │
│              └──► tool-executor ──► módulos (fs, telegram...)  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. conversation-manager (Refactorizado)

### Responsabilidad
Gestión de datos de conversaciones y mensajes. Solo CRUD y persistencia.

### NO hace
- ❌ Llamar a la IA
- ❌ Ejecutar tools
- ❌ Componer prompts
- ❌ Orquestar flujos

### Eventos que ESCUCHA

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `conversation.create.request` | `{ request_id, project_id, user_id, title?, system_prompt?, model?, provider? }` | Crear conversación |
| `conversation.update.request` | `{ request_id, conversation_id, title?, system_prompt?, ... }` | Actualizar conversación |
| `conversation.delete.request` | `{ request_id, conversation_id }` | Eliminar conversación |
| `conversation.get.request` | `{ request_id, conversation_id }` | Obtener conversación |
| `conversation.list.request` | `{ request_id, project_id }` | Listar conversaciones |
| `conversation.message.save.request` | `{ request_id, conversation_id, role, content, metadata? }` | Guardar mensaje |
| `conversation.messages.get.request` | `{ request_id, conversation_id, limit?, offset? }` | Obtener mensajes |
| `conversation.context.get.request` | `{ request_id, conversation_id }` | Obtener contexto (mensajes en ventana) |

### Eventos que PUBLICA

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `conversation.create.response` | `{ request_id, success, conversation, error? }` | Respuesta crear |
| `conversation.update.response` | `{ request_id, success, conversation, error? }` | Respuesta actualizar |
| `conversation.delete.response` | `{ request_id, success, error? }` | Respuesta eliminar |
| `conversation.get.response` | `{ request_id, success, conversation, error? }` | Respuesta obtener |
| `conversation.list.response` | `{ request_id, success, conversations, count, error? }` | Respuesta listar |
| `conversation.message.save.response` | `{ request_id, success, message, error? }` | Respuesta guardar mensaje |
| `conversation.messages.get.response` | `{ request_id, success, messages, count, error? }` | Respuesta obtener mensajes |
| `conversation.context.get.response` | `{ request_id, success, messages, total_tokens, error? }` | Respuesta contexto |
| `conversation.created` | `{ conversation_id, project_id, created_at }` | Evento de notificación |
| `conversation.updated` | `{ conversation_id, updated_fields, updated_at }` | Evento de notificación |
| `conversation.deleted` | `{ conversation_id, deleted_at }` | Evento de notificación |

### Métodos internos

```javascript
class ConversationManager {
  // CRUD Conversaciones
  async createConversation(projectId, userId, options)
  async updateConversation(conversationId, updates)
  async deleteConversation(conversationId)
  async getConversation(conversationId)
  async listConversations(projectId)

  // CRUD Mensajes
  async saveMessage(conversationId, role, content, metadata)
  async getMessages(conversationId, limit, offset)

  // Contexto
  async getContextMessages(conversationId)  // Mensajes dentro de la ventana
  async applyContextFIFO(conversationId)    // Gestión automática de ventana
  async toggleMessageContext(messageId, inContext)

  // Base de datos
  async queryDatabase(projectId, query, params)
  async ensureProjectSchema(projectId)
}
```

### Tamaño estimado
~500-600 líneas

---

## 2. chat-orchestrator (NUEVO)

### Responsabilidad
Orquestar el flujo completo del chat: recibir mensaje → pedir decisión IA → ejecutar tools → guardar respuesta.

### Filosofía
- Solo coordina via eventos
- NO ejecuta nada directamente
- NO tiene lógica de negocio de otros módulos

### Eventos que ESCUCHA

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `chat.message.send` | `{ conversation_id, content, user_id?, attachments? }` | Usuario envía mensaje |
| `ai.chat.response` | `{ request_id, success, content, tool_calls?, tokens, cost, model }` | Respuesta de IA |
| `tool.execute.response` | `{ request_id, tool_call_id, success, result, error? }` | Resultado de tool |
| `conversation.message.save.response` | `{ request_id, success, message }` | Confirmación mensaje guardado |
| `conversation.context.get.response` | `{ request_id, success, messages }` | Contexto de conversación |

### Eventos que PUBLICA

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `conversation.message.save.request` | `{ request_id, conversation_id, role, content, metadata }` | Guardar mensaje |
| `conversation.context.get.request` | `{ request_id, conversation_id }` | Obtener contexto |
| `ai.chat.request` | `{ request_id, messages, tools?, model?, temperature? }` | Pedir decisión a IA |
| `tool.execute.request` | `{ request_id, tool_call_id, tool_name, arguments }` | Ejecutar tool |
| `chat.message.sent` | `{ conversation_id, user_message, assistant_message, tokens, cost }` | Flujo completado |
| `chat.message.error` | `{ conversation_id, error, phase }` | Error en flujo |

### Flujo interno

```
chat.message.send
      │
      ▼
┌─────────────────────────────────────┐
│ 1. Guardar mensaje usuario          │
│    → conversation.message.save.req  │
│    ← conversation.message.save.res  │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ 2. Obtener contexto                 │
│    → conversation.context.get.req   │
│    ← conversation.context.get.res   │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ 3. Pedir decisión a IA              │
│    → ai.chat.request                │
│    ← ai.chat.response               │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ 4. ¿Hay tool_calls?                 │
│    NO → Guardar respuesta (paso 6)  │
│    SÍ → Ejecutar tools (paso 5)     │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ 5. Por cada tool_call:              │
│    → tool.execute.request           │
│    ← tool.execute.response          │
│                                     │
│    Agregar resultados a mensajes    │
│    → Volver al paso 3 (loop)        │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ 6. Guardar respuesta asistente      │
│    → conversation.message.save.req  │
│    ← conversation.message.save.res  │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ 7. Publicar resultado               │
│    → chat.message.sent              │
└─────────────────────────────────────┘
```

### Estado interno (por flujo)

```javascript
// Map de flujos activos
this.activeFlows = new Map();

// Estructura de un flujo
{
  flowId: 'uuid',
  conversationId: 'uuid',
  phase: 'saving_user_message' | 'getting_context' | 'calling_ai' | 'executing_tools' | 'saving_response',
  iteration: 1,
  maxIterations: 10,
  messages: [],           // Mensajes acumulados para IA
  pendingToolCalls: [],   // Tools pendientes de respuesta
  toolResults: [],        // Resultados acumulados
  startTime: Date.now()
}
```

### Métodos internos

```javascript
class ChatOrchestrator {
  // Gestión de flujos
  async startFlow(conversationId, content, userId)
  async handleAIResponse(flowId, response)
  async handleToolResponse(flowId, toolCallId, result)
  async completeFlow(flowId)
  async failFlow(flowId, error, phase)

  // Helpers
  buildMessagesForAI(contextMessages, toolResults)
  getToolsForConversation(conversationId)
}
```

### Tamaño estimado
~300-400 líneas

---

## 3. tool-executor (NUEVO)

### Responsabilidad
Traducir nombres de tools (formato LLM) a eventos del sistema y ejecutar via eventos.

### Filosofía
- Único punto de ejecución de tools
- Traduce: `fs_write` → `fs.write.request`
- NO conoce la implementación de las tools
- Solo publica eventos y espera respuestas

### Eventos que ESCUCHA

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `tool.execute.request` | `{ request_id, tool_call_id, tool_name, arguments }` | Ejecutar tool |
| `*.response` | `{ request_id, success, result?, error? }` | Respuestas de módulos (dinámico) |

### Eventos que PUBLICA

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `tool.execute.response` | `{ request_id, tool_call_id, success, result, error? }` | Resultado de ejecución |
| `{module}.{action}.request` | `{ request_id, ...args }` | Evento traducido (dinámico) |

### Lógica de traducción

```javascript
/**
 * Convierte nombre de tool (LLM) a evento del sistema
 *
 * Ejemplos:
 *   fs_write          → fs.write.request
 *   fs_read           → fs.read.request
 *   telegram_send_msg → telegram.send_msg.request
 *   http_post         → http.post.request
 */
function translateToolToEvent(toolName) {
  return toolName.replace(/_/g, '.') + '.request';
}

function translateToolToResponseEvent(toolName) {
  return toolName.replace(/_/g, '.') + '.response';
}
```

### Flujo interno

```
tool.execute.request { tool_name: 'fs_write', arguments: { path, content } }
      │
      ▼
┌─────────────────────────────────────┐
│ 1. Traducir nombre                  │
│    'fs_write' → 'fs.write.request'  │
│    response: 'fs.write.response'    │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ 2. Suscribirse a respuesta          │
│    eventBus.subscribe('fs.write.response', handler)
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ 3. Publicar request                 │
│    eventBus.publish('fs.write.request', {
│      request_id,
│      path: '/tmp/x.txt',
│      content: 'hello'
│    })
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ 4. Esperar respuesta (con timeout)  │
│    ← fs.write.response              │
│    { request_id, success, result }  │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ 5. Publicar resultado               │
│    → tool.execute.response          │
└─────────────────────────────────────┘
```

### Métodos internos

```javascript
class ToolExecutor {
  constructor() {
    this.pendingExecutions = new Map();  // request_id → { resolve, reject, timeout }
    this.activeSubscriptions = new Map(); // responseEvent → unsubscribe
  }

  // Principal
  async onToolExecuteRequest(event)

  // Helpers
  translateToolToEvent(toolName)
  translateToolToResponseEvent(toolName)

  // Gestión de suscripciones dinámicas
  async subscribeToResponse(responseEvent, requestId)
  unsubscribeFromResponse(responseEvent)
}
```

### Configuración

```javascript
{
  timeout: 30000,          // Timeout por defecto para tools
  timeouts: {              // Timeouts específicos por tool
    'fs_write': 10000,
    'http_post': 60000,
    'telegram_send_photo': 30000
  }
}
```

### Tamaño estimado
~150-200 líneas

---

## 4. Módulos que exponen servicios (sin cambios)

Estos módulos ya funcionan correctamente con eventos:

### filesystem
```
ESCUCHA: fs.write.request, fs.read.request, fs.list.request, ...
PUBLICA: fs.write.response, fs.read.response, fs.list.response, ...
```

### telegram-service
```
ESCUCHA: telegram.send_message.request, telegram.send_photo.request, ...
PUBLICA: telegram.send_message.response, telegram.send_photo.response, ...
```

### ai-gateway
```
ESCUCHA: ai.chat.request
PUBLICA: ai.chat.response
```

### database-manager
```
ESCUCHA: db.query.request
PUBLICA: db.query.response
```

---

## Migración

### Fase 1: Crear tool-executor
1. Crear módulo `modules/tool-executor/index.js`
2. Implementar traducción y ejecución via eventos
3. Probar con tools existentes (fs, telegram)

### Fase 2: Crear chat-orchestrator
1. Crear módulo `modules/chat-orchestrator/index.js`
2. Implementar flujo completo
3. Conectar con tool-executor

### Fase 3: Refactorizar conversation-manager
1. Eliminar lógica de orquestación
2. Eliminar ejecución de tools
3. Dejar solo CRUD
4. Actualizar eventos

### Fase 4: Actualizar ai-agent-framework
1. Usar tool-executor en lugar de toolManager interno
2. Simplificar a solo: escuchar → decidir → pedir

---

## Diagrama final

```
┌─────────────────────────────────────────────────────────────────────┐
│                          ARQUITECTURA FINAL                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐     chat.message.send     ┌──────────────────────┐   │
│  │    UI    │ ─────────────────────────►│  chat-orchestrator   │   │
│  └──────────┘                           └──────────────────────┘   │
│                                                   │                 │
│                         ┌─────────────────────────┼─────────────┐   │
│                         │                         │             │   │
│                         ▼                         ▼             │   │
│  ┌──────────────────────────┐    ┌─────────────────────────┐   │   │
│  │  conversation-manager    │    │      ai-gateway         │   │   │
│  │  (CRUD conversaciones)   │    │   (decisión IA)         │   │   │
│  └──────────────────────────┘    └─────────────────────────┘   │   │
│                                                                 │   │
│                         ┌───────────────────────────────────────┘   │
│                         │ tool.execute.request                      │
│                         ▼                                           │
│              ┌─────────────────────────┐                           │
│              │     tool-executor       │                           │
│              │  (traduce y ejecuta)    │                           │
│              └─────────────────────────┘                           │
│                         │                                           │
│         ┌───────────────┼───────────────┐                          │
│         │               │               │                          │
│         ▼               ▼               ▼                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                   │
│  │ filesystem │  │  telegram  │  │    http    │  ...              │
│  └────────────┘  └────────────┘  └────────────┘                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Beneficios

1. **Separación de responsabilidades**: Cada módulo hace una cosa
2. **Testabilidad**: Fácil mockear eventos para tests
3. **Consistencia**: Una sola forma de ejecutar tools (eventos)
4. **Extensibilidad**: Añadir nuevas tools solo requiere exponer eventos
5. **Trazabilidad**: Todos los flujos pasan por eventos (logs, métricas)
6. **Desacoplamiento**: Los módulos no se conocen entre sí
