# Flujos: Crear Archivo con Frase Motivadora

> Documentación exhaustiva de dos flujos que resultan en la creación de un archivo con una frase motivadora.
>
> **Fecha**: 2026-01-07
> **Versión**: 2.0.0

---

## Tabla de Contenidos

1. [Resumen de Flujos](#resumen-de-flujos)
2. [Flujo 1: Usuario en Chat](#flujo-1-usuario-en-chat)
3. [Flujo 2: Agente Telegram por Imagen](#flujo-2-agente-telegram-por-imagen)
4. [Comparativa de Flujos](#comparativa-de-flujos)

---

## Resumen de Flujos

| Flujo | Trigger | Acción | Resultado |
|-------|---------|--------|-----------|
| **Flujo 1** | Usuario escribe en chat: "Crea un archivo con una frase motivadora" | AI procesa y usa tool `fs_write` | Archivo `frase_motivadora.txt` creado |
| **Flujo 2** | Usuario envía imagen al bot de Telegram | Agente detecta imagen y automáticamente crea frase | Archivo `frase_motivadora.txt` creado |

**Resultado idéntico, triggers diferentes.**

---

## Flujo 1: Usuario en Chat

### Escenario

> **Usuario en la interfaz web**: Escribe "Crea un archivo con una frase motivadora"
> **Sistema**: Procesa la petición, llama a la IA, ejecuta tool, crea archivo

### Diagrama de Secuencia Completo

```
┌──────────┐     ┌─────────────────────┐     ┌───────────────┐     ┌──────────────┐
│    UI    │     │ conversation-manager│     │ chat-ai-bridge│     │ chat-session │
│ (React)  │     │      (facade)       │     │ (coordinador) │     │   (CRUD)     │
└────┬─────┘     └──────────┬──────────┘     └───────┬───────┘     └──────┬───────┘
     │                      │                        │                    │
     │  chat.send.request   │                        │                    │
     │  {content: "Crea..."}│                        │                    │
     │─────────────────────>│                        │                    │
     │                      │                        │                    │
     │                      │   Delegar proceso      │                    │
     │                      │───────────────────────>│                    │
     │                      │                        │                    │
     │                      │                        │ session.create.req │
     │                      │                        │───────────────────>│
     │                      │                        │                    │
     │                      │                        │ session.create.res │
     │                      │                        │<───────────────────│
     │                      │                        │ {conv_id: "c-123"} │
     │                      │                        │                    │
     │                      │                        │ session.save.req   │
     │                      │                        │ {role: "user"}     │
     │                      │                        │───────────────────>│
     │                      │                        │                    │
     │                      │                        │ session.save.res   │
     │                      │                        │<───────────────────│
     │                      │                        │ {msg_id: "m-456"}  │
     │                      │                        │                    │

┌──────────────┐     ┌────────────────┐     ┌─────────────┐     ┌────────────┐
│ chat-session │     │ prompt-composer│     │  ai-gateway │     │ filesystem │
└──────┬───────┘     └───────┬────────┘     └──────┬──────┘     └─────┬──────┘
       │                     │                     │                  │
       │ context.load.req    │                     │                  │
       │<────────────────────│                     │                  │
       │                     │                     │                  │
       │ context.load.res    │                     │                  │
       │ {messages: [...]}   │                     │                  │
       │────────────────────>│                     │                  │
       │                     │                     │                  │
       │                     │ prompt.compose.req  │                  │
       │                     │<────────────────────│                  │
       │                     │                     │                  │
       │                     │ prompt.compose.res  │                  │
       │                     │ {system_prompt}     │                  │
       │                     │────────────────────>│                  │
       │                     │                     │                  │

┌─────────────┐     ┌──────────────────┐     ┌────────────┐
│  ai-gateway │     │   Anthropic API  │     │ filesystem │
└──────┬──────┘     └────────┬─────────┘     └─────┬──────┘
       │                     │                     │
       │ POST /v1/messages   │                     │
       │ {messages, tools}   │                     │
       │────────────────────>│                     │
       │                     │                     │
       │ Response:           │                     │
       │ tool_use: fs_write  │                     │
       │ {path, content}     │                     │
       │<────────────────────│                     │
       │                     │                     │
       │ ══════════════════════════════════════════│
       │ LOOP AGENTIC - EJECUTAR TOOL              │
       │ ══════════════════════════════════════════│
       │                     │                     │
       │                     │  executeTool        │
       │                     │  fs_write           │
       │─────────────────────│────────────────────>│
       │                     │                     │
       │                     │  {success: true,    │
       │                     │   path: "..."}      │
       │<────────────────────│─────────────────────│
       │                     │                     │
       │ POST /v1/messages   │                     │
       │ {tool_result}       │                     │
       │────────────────────>│                     │
       │                     │                     │
       │ Response final:     │                     │
       │ "He creado el..."   │                     │
       │<────────────────────│                     │
       │                     │                     │
```

### Paso a Paso Detallado

---

#### PASO 1: Usuario Envía Mensaje (t=0ms)

**Acción**: El usuario escribe en la interfaz de chat y presiona enviar.

**Evento emitido**:
```javascript
// Evento: chat.send.request
{
  event_id: "evt-001",
  event_type: "chat.send.request",
  timestamp: "2026-01-07T12:00:00.000Z",
  source: {
    module_id: "ui-handler"
  },
  data: {
    conversation_id: null,           // null = nueva conversación
    content: "Crea un archivo con una frase motivadora",
    project_id: "proj-xyz"
  },
  trace: {
    trace_id: "trace-abc-123",
    span_id: "span-001"
  }
}
```

**Quién escucha**: `conversation-manager`

**Qué hace**:
- Recibe el request
- Delega todo el procesamiento a `chat-ai-bridge`

---

#### PASO 2: Crear Conversación (t=5ms)

**Acción**: Como `conversation_id` es null, se crea una nueva conversación.

**Evento emitido por chat-ai-bridge**:
```javascript
// Evento: session.create.request
{
  event_id: "evt-002",
  event_type: "session.create.request",
  timestamp: "2026-01-07T12:00:00.005Z",
  source: {
    module_id: "chat-ai-bridge"
  },
  data: {
    request_id: "req-001",
    project_id: "proj-xyz",
    title: "Nueva conversación",
    metadata: {
      source: "ui",
      created_by: "user"
    }
  }
}
```

**Quién escucha**: `chat-session`

**Qué hace**:
1. Genera UUID para la conversación: `conv-123`
2. Inserta registro en base de datos:
   ```sql
   INSERT INTO conversations (id, project_id, title, created_at)
   VALUES ('conv-123', 'proj-xyz', 'Nueva conversación', NOW())
   ```
3. Emite respuesta

**Evento de respuesta**:
```javascript
// Evento: session.create.response
{
  event_id: "evt-003",
  event_type: "session.create.response",
  timestamp: "2026-01-07T12:00:00.010Z",
  source: {
    module_id: "chat-session"
  },
  data: {
    request_id: "req-001",
    success: true,
    conversation_id: "conv-123",
    created_at: "2026-01-07T12:00:00.010Z"
  }
}
```

---

#### PASO 3: Guardar Mensaje del Usuario (t=15ms)

**Acción**: Se persiste el mensaje del usuario en la base de datos.

**Evento emitido por chat-ai-bridge**:
```javascript
// Evento: session.save.request
{
  event_id: "evt-004",
  event_type: "session.save.request",
  timestamp: "2026-01-07T12:00:00.015Z",
  source: {
    module_id: "chat-ai-bridge"
  },
  data: {
    request_id: "req-002",
    conversation_id: "conv-123",
    role: "user",
    content: "Crea un archivo con una frase motivadora"
  }
}
```

**Quién escucha**: `chat-session`

**Qué hace**:
1. Genera UUID para el mensaje: `msg-456`
2. Inserta en base de datos:
   ```sql
   INSERT INTO messages (id, conversation_id, role, content, in_context, created_at)
   VALUES ('msg-456', 'conv-123', 'user', 'Crea un archivo...', 1, NOW())
   ```
3. Aplica política FIFO si hay demasiados mensajes en contexto
4. Emite respuesta

**Evento de respuesta**:
```javascript
// Evento: session.save.response
{
  event_id: "evt-005",
  event_type: "session.save.response",
  timestamp: "2026-01-07T12:00:00.020Z",
  source: {
    module_id: "chat-session"
  },
  data: {
    request_id: "req-002",
    success: true,
    message: {
      message_id: "msg-456",
      conversation_id: "conv-123",
      role: "user",
      content: "Crea un archivo con una frase motivadora",
      in_context: 1,
      created_at: "2026-01-07T12:00:00.020Z"
    }
  }
}
```

---

#### PASO 4: Cargar Contexto de Conversación (t=25ms)

**Acción**: Se cargan todos los mensajes que están dentro del contexto de la conversación.

**Evento emitido por chat-ai-bridge**:
```javascript
// Evento: session.context.load.request
{
  event_id: "evt-006",
  event_type: "session.context.load.request",
  timestamp: "2026-01-07T12:00:00.025Z",
  source: {
    module_id: "chat-ai-bridge"
  },
  data: {
    request_id: "req-003",
    conversation_id: "conv-123",
    max_messages: 50
  }
}
```

**Quién escucha**: `chat-session`

**Qué hace**:
1. Query a la base de datos:
   ```sql
   SELECT * FROM messages
   WHERE conversation_id = 'conv-123'
   AND in_context = 1
   ORDER BY created_at ASC
   ```
2. Retorna array de mensajes

**Evento de respuesta**:
```javascript
// Evento: session.context.load.response
{
  event_id: "evt-007",
  event_type: "session.context.load.response",
  timestamp: "2026-01-07T12:00:00.030Z",
  source: {
    module_id: "chat-session"
  },
  data: {
    request_id: "req-003",
    success: true,
    conversation_id: "conv-123",
    messages: [
      {
        message_id: "msg-456",
        role: "user",
        content: "Crea un archivo con una frase motivadora",
        created_at: "2026-01-07T12:00:00.020Z"
      }
    ],
    total_messages: 1,
    tokens_estimate: 10
  }
}
```

---

#### PASO 5: Componer System Prompt (t=35ms)

**Acción**: Se genera el system prompt con contexto del proyecto y herramientas disponibles.

**Evento emitido por chat-ai-bridge**:
```javascript
// Evento: prompt.compose.request
{
  event_id: "evt-008",
  event_type: "prompt.compose.request",
  timestamp: "2026-01-07T12:00:00.035Z",
  source: {
    module_id: "chat-ai-bridge"
  },
  data: {
    request_id: "req-004",
    project_id: "proj-xyz",
    template: "default",
    variables: {
      date: "2026-01-07",
      user_name: "Usuario"
    }
  }
}
```

**Quién escucha**: `prompt-composer`

**Qué hace**:
1. Carga información del proyecto
2. Obtiene lista de tools disponibles
3. Aplica variables al template
4. Genera prompt compuesto

**Evento de respuesta**:
```javascript
// Evento: prompt.compose.response
{
  event_id: "evt-009",
  event_type: "prompt.compose.response",
  timestamp: "2026-01-07T12:00:00.045Z",
  source: {
    module_id: "prompt-composer"
  },
  data: {
    request_id: "req-004",
    success: true,
    system_prompt: `Eres un asistente inteligente del proyecto "Mi Proyecto".

Fecha actual: 2026-01-07

## Herramientas Disponibles

Tienes acceso a las siguientes herramientas:

### fs_write
Escribe contenido en un archivo.
Parámetros:
- path (string, requerido): Ruta del archivo
- content (string, requerido): Contenido a escribir

### fs_read
Lee el contenido de un archivo.
Parámetros:
- path (string, requerido): Ruta del archivo

## Instrucciones
- Responde de manera útil y concisa
- Usa las herramientas cuando sea necesario para completar tareas
- Confirma las acciones realizadas`,
    tokens_estimate: 180
  }
}
```

---

#### PASO 6: Llamar a la IA (t=50ms)

**Acción**: Se envía la petición al ai-gateway con los mensajes y herramientas habilitadas.

**Evento emitido por chat-ai-bridge**:
```javascript
// Evento: ai.chat.request
{
  event_id: "evt-010",
  event_type: "ai.chat.request",
  timestamp: "2026-01-07T12:00:00.050Z",
  source: {
    module_id: "chat-ai-bridge"
  },
  data: {
    request_id: "req-005",
    messages: [
      {
        role: "system",
        content: "Eres un asistente inteligente del proyecto..."
      },
      {
        role: "user",
        content: "Crea un archivo con una frase motivadora"
      }
    ],
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.7,
    max_tokens: 2048,
    tools: true,
    execute_tools: true,
    project_id: "proj-xyz"
  }
}
```

**Quién escucha**: `ai-gateway`

---

#### PASO 7: AI-Gateway Procesa (t=50ms - t=2000ms)

**Acción interna del ai-gateway**:

##### 7.1 Resolver Credenciales

```javascript
// Emite internamente
eventBus.emit('credential.resolve.request', {
  request_id: 'cred-001',
  provider: 'ANTHROPIC',
  project_id: 'proj-xyz'
});

// Recibe
// credential.resolve.response con api_key
```

##### 7.2 Cargar Tools Disponibles

```javascript
const tools = moduleLoader.getAvailableTools();
// Retorna:
[
  {
    name: "fs_write",
    description: "Escribe contenido en un archivo",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "fs_read",
    description: "Lee el contenido de un archivo",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" }
      },
      required: ["path"]
    }
  }
]
```

##### 7.3 Traducir Tools a Formato Anthropic

```javascript
const anthropicTools = [
  {
    name: "fs_write",
    description: "Escribe contenido en un archivo",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "fs_read",
    description: "Lee el contenido de un archivo",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" }
      },
      required: ["path"]
    }
  }
];
```

##### 7.4 Primera Llamada a Anthropic

**Request HTTP**:
```http
POST https://api.anthropic.com/v1/messages
Content-Type: application/json
x-api-key: sk-ant-xxxxx
anthropic-version: 2023-06-01

{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 2048,
  "system": "Eres un asistente inteligente del proyecto...",
  "messages": [
    {
      "role": "user",
      "content": "Crea un archivo con una frase motivadora"
    }
  ],
  "tools": [
    {
      "name": "fs_write",
      "description": "Escribe contenido en un archivo",
      "input_schema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "content": { "type": "string" }
        },
        "required": ["path", "content"]
      }
    }
  ]
}
```

**Response de Anthropic**:
```json
{
  "id": "msg_01XYZ",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Voy a crear un archivo con una frase motivadora para ti."
    },
    {
      "type": "tool_use",
      "id": "toolu_01ABC",
      "name": "fs_write",
      "input": {
        "path": "frase_motivadora.txt",
        "content": "El único modo de hacer un gran trabajo es amar lo que haces. Si no lo has encontrado todavía, sigue buscando. No te conformes. - Steve Jobs"
      }
    }
  ],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": "tool_use",
  "usage": {
    "input_tokens": 245,
    "output_tokens": 98
  }
}
```

##### 7.5 Ejecutar Tool (Loop Agentic - Iteración 1)

**Detección de tool_use**:
```javascript
// ai-gateway detecta que hay tool_use en la respuesta
const toolCalls = response.content
  .filter(block => block.type === 'tool_use')
  .map(block => ({
    id: block.id,           // "toolu_01ABC"
    name: block.name,       // "fs_write"
    arguments: block.input  // {path, content}
  }));

// toolCalls = [{
//   id: "toolu_01ABC",
//   name: "fs_write",
//   arguments: {
//     path: "frase_motivadora.txt",
//     content: "El único modo de hacer un gran trabajo..."
//   }
// }]
```

**Ejecución del tool**:
```javascript
// ai-gateway llama al moduleLoader
const result = await moduleLoader.executeTool('fs_write', {
  path: 'frase_motivadora.txt',
  content: 'El único modo de hacer un gran trabajo es amar lo que haces. Si no lo has encontrado todavía, sigue buscando. No te conformes. - Steve Jobs'
});
```

**Dentro de filesystem module**:
```javascript
// filesystem/index.js

async function handleFsWrite({ path, content, encoding = 'utf-8' }) {
  // 1. Resolver ruta completa (relativa al proyecto activo)
  const fullPath = resolvePath(path);
  // fullPath = "/home/user/event-core/data/projects/proj-xyz/storage/frase_motivadora.txt"

  // 2. Crear directorios si no existen
  await fs.mkdir(dirname(fullPath), { recursive: true });

  // 3. Escribir archivo
  await fs.writeFile(fullPath, content, encoding);

  // 4. Obtener stats
  const stats = await fs.stat(fullPath);

  // 5. Emitir evento de archivo creado
  eventBus.emit('fs.file.created', {
    path: fullPath,
    size: stats.size,
    created_at: new Date().toISOString()
  });

  // 6. Retornar resultado
  return {
    success: true,
    path: fullPath,
    size: stats.size,
    created_at: new Date().toISOString()
  };
}
```

**Resultado del tool**:
```javascript
{
  status: 'success',
  data: {
    success: true,
    path: '/home/user/event-core/data/projects/proj-xyz/storage/frase_motivadora.txt',
    size: 156,
    created_at: '2026-01-07T12:00:01.200Z'
  }
}
```

##### 7.6 Segunda Llamada a Anthropic (con tool_result)

**Actualizar conversación para siguiente iteración**:
```javascript
// Agregar respuesta del asistente
messages.push({
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: 'Voy a crear un archivo con una frase motivadora para ti.'
    },
    {
      type: 'tool_use',
      id: 'toolu_01ABC',
      name: 'fs_write',
      input: {
        path: 'frase_motivadora.txt',
        content: 'El único modo de hacer un gran trabajo...'
      }
    }
  ]
});

// Agregar resultado del tool
messages.push({
  role: 'user',
  content: [
    {
      type: 'tool_result',
      tool_use_id: 'toolu_01ABC',
      content: JSON.stringify({
        success: true,
        path: '/home/user/event-core/data/projects/proj-xyz/storage/frase_motivadora.txt',
        size: 156
      })
    }
  ]
});
```

**Request HTTP (segunda llamada)**:
```http
POST https://api.anthropic.com/v1/messages
Content-Type: application/json

{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 2048,
  "system": "Eres un asistente inteligente...",
  "messages": [
    {
      "role": "user",
      "content": "Crea un archivo con una frase motivadora"
    },
    {
      "role": "assistant",
      "content": [
        {"type": "text", "text": "Voy a crear un archivo..."},
        {"type": "tool_use", "id": "toolu_01ABC", "name": "fs_write", "input": {...}}
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "toolu_01ABC",
          "content": "{\"success\":true,\"path\":\"...\",\"size\":156}"
        }
      ]
    }
  ],
  "tools": [...]
}
```

**Response de Anthropic (final)**:
```json
{
  "id": "msg_02XYZ",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "¡Listo! He creado el archivo `frase_motivadora.txt` con una cita inspiradora de Steve Jobs sobre la importancia de amar lo que haces. El archivo se ha guardado correctamente en tu proyecto."
    }
  ],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 380,
    "output_tokens": 52
  }
}
```

**Fin del Loop**: `stop_reason` es `"end_turn"` (no `"tool_use"`), por lo tanto el loop agentic termina.

---

#### PASO 8: AI-Gateway Responde (t=2000ms)

**Evento emitido por ai-gateway**:
```javascript
// Evento: ai.chat.response
{
  event_id: "evt-011",
  event_type: "ai.chat.response",
  timestamp: "2026-01-07T12:00:02.000Z",
  source: {
    module_id: "ai-gateway"
  },
  data: {
    request_id: "req-005",
    success: true,
    content: "¡Listo! He creado el archivo `frase_motivadora.txt` con una cita inspiradora de Steve Jobs sobre la importancia de amar lo que haces. El archivo se ha guardado correctamente en tu proyecto.",
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    tokens: {
      input: 625,
      output: 150,
      total: 775
    },
    iterations: 2,
    tool_results: [
      {
        tool_call_id: "toolu_01ABC",
        name: "fs_write",
        status: "success",
        result: {
          success: true,
          path: "/home/user/event-core/data/projects/proj-xyz/storage/frase_motivadora.txt",
          size: 156
        }
      }
    ],
    cost_usd: 0.0039
  }
}
```

---

#### PASO 9: Guardar Respuesta del Asistente (t=2010ms)

**Evento emitido por chat-ai-bridge**:
```javascript
// Evento: session.save.request
{
  event_id: "evt-012",
  event_type: "session.save.request",
  timestamp: "2026-01-07T12:00:02.010Z",
  source: {
    module_id: "chat-ai-bridge"
  },
  data: {
    request_id: "req-006",
    conversation_id: "conv-123",
    role: "assistant",
    content: "¡Listo! He creado el archivo `frase_motivadora.txt` con una cita inspiradora de Steve Jobs sobre la importancia de amar lo que haces. El archivo se ha guardado correctamente en tu proyecto.",
    metadata: {
      model: "claude-3-5-sonnet-20241022",
      provider: "anthropic",
      tokens: {
        input: 625,
        output: 150,
        total: 775
      },
      tool_calls: [
        {
          name: "fs_write",
          status: "success",
          path: "frase_motivadora.txt"
        }
      ],
      iterations: 2,
      cost_usd: 0.0039
    }
  }
}
```

**Quién escucha**: `chat-session`

**Qué hace**:
1. Inserta mensaje en BD
2. Emite respuesta

**Evento de respuesta**:
```javascript
// Evento: session.save.response
{
  event_id: "evt-013",
  event_type: "session.save.response",
  timestamp: "2026-01-07T12:00:02.020Z",
  source: {
    module_id: "chat-session"
  },
  data: {
    request_id: "req-006",
    success: true,
    message: {
      message_id: "msg-457",
      conversation_id: "conv-123",
      role: "assistant",
      content: "¡Listo! He creado el archivo...",
      in_context: 1,
      created_at: "2026-01-07T12:00:02.020Z"
    }
  }
}
```

---

#### PASO 10: Respuesta Final a UI (t=2025ms)

**Evento emitido por conversation-manager**:
```javascript
// Evento: chat.send.response
{
  event_id: "evt-014",
  event_type: "chat.send.response",
  timestamp: "2026-01-07T12:00:02.025Z",
  source: {
    module_id: "conversation-manager"
  },
  data: {
    request_id: "original-request-id",
    success: true,
    conversation_id: "conv-123",
    user_message: {
      message_id: "msg-456",
      role: "user",
      content: "Crea un archivo con una frase motivadora",
      created_at: "2026-01-07T12:00:00.020Z"
    },
    assistant_message: {
      message_id: "msg-457",
      role: "assistant",
      content: "¡Listo! He creado el archivo `frase_motivadora.txt` con una cita inspiradora de Steve Jobs sobre la importancia de amar lo que haces. El archivo se ha guardado correctamente en tu proyecto.",
      created_at: "2026-01-07T12:00:02.020Z"
    },
    tokens_used: 775,
    cost_usd: 0.0039,
    tools_executed: [
      {
        name: "fs_write",
        status: "success",
        result: {
          path: "/home/user/event-core/data/projects/proj-xyz/storage/frase_motivadora.txt"
        }
      }
    ]
  }
}
```

### Archivo Creado

**Ruta**: `/home/user/event-core/data/projects/proj-xyz/storage/frase_motivadora.txt`

**Contenido**:
```
El único modo de hacer un gran trabajo es amar lo que haces. Si no lo has encontrado todavía, sigue buscando. No te conformes. - Steve Jobs
```

### Timeline Completo

```
t=0ms      Usuario envía mensaje en UI
t=5ms      chat.send.request recibido por conversation-manager
t=10ms     session.create.response - conversación creada
t=20ms     session.save.response - mensaje usuario guardado
t=30ms     session.context.load.response - contexto cargado
t=45ms     prompt.compose.response - system prompt listo
t=50ms     ai.chat.request enviado a ai-gateway
t=100ms    credential.resolve.response - API key obtenida
t=150ms    Primera llamada HTTP a Anthropic
t=800ms    Respuesta de Anthropic con tool_use
t=850ms    Ejecutar fs_write
t=1200ms   Archivo creado en disco
t=1250ms   Segunda llamada HTTP a Anthropic
t=1900ms   Respuesta final de Anthropic
t=2000ms   ai.chat.response emitido
t=2020ms   session.save.response - mensaje asistente guardado
t=2025ms   chat.send.response enviado a UI
─────────────────────────────────────────────────────
TOTAL: ~2 segundos
```

---

## Flujo 2: Agente Telegram por Imagen

### Escenario

> **Usuario en Telegram**: Envía cualquier imagen al bot
> **Agente**: Detecta automáticamente la imagen y crea un archivo con una frase motivadora

### Configuración del Agente

El agente está configurado para activarse cuando llega una imagen:

```json
{
  "name": "motivational-image-agent",
  "version": "1.0.0",
  "description": "Cuando recibe una imagen, crea un archivo con frase motivadora",
  "enabled": true,
  "triggers": [
    {
      "event": "telegram.photo.received",
      "conditions": {
        "bot_name": "mi_bot"
      }
    }
  ],
  "config": {
    "model": "claude-3-5-sonnet-20241022",
    "tools": ["fs_write"],
    "max_iterations": 5
  },
  "system_prompt": "Eres un agente que crea frases motivadoras. Cuando recibas una notificación de imagen, tu tarea es:\n1. Crear un archivo llamado 'frase_motivadora.txt'\n2. Escribir una frase motivadora inspiradora en ese archivo\n3. No necesitas analizar la imagen, solo crear la frase"
}
```

### Diagrama de Secuencia Completo

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Telegram API │     │ telegram-service │     │ ai-agent-framework  │
│   (externo)  │     │    (polling)     │     │    (orquestador)    │
└──────┬───────┘     └────────┬─────────┘     └──────────┬──────────┘
       │                      │                         │
       │ getUpdates           │                         │
       │ (polling cada 1s)    │                         │
       │<─────────────────────│                         │
       │                      │                         │
       │ Update con photo     │                         │
       │─────────────────────>│                         │
       │                      │                         │
       │                      │ Procesar mensaje        │
       │                      │ Detectar: tiene foto    │
       │                      │                         │
       │                      │ telegram.photo.received │
       │                      │────────────────────────>│
       │                      │                         │
       │                      │                         │ Buscar agentes
       │                      │                         │ con trigger match
       │                      │                         │
       │                      │                         │ Encontrado:
       │                      │                         │ motivational-image-agent
       │                      │                         │

┌─────────────────────┐     ┌─────────────┐     ┌──────────────────┐     ┌────────────┐
│ ai-agent-framework  │     │  ai-gateway │     │  Anthropic API   │     │ filesystem │
└──────────┬──────────┘     └──────┬──────┘     └────────┬─────────┘     └─────┬──────┘
           │                       │                     │                     │
           │ ai.chat.request       │                     │                     │
           │ {system_prompt,       │                     │                     │
           │  "Imagen recibida"}   │                     │                     │
           │──────────────────────>│                     │                     │
           │                       │                     │                     │
           │                       │ POST /v1/messages   │                     │
           │                       │────────────────────>│                     │
           │                       │                     │                     │
           │                       │ Response: tool_use  │                     │
           │                       │ fs_write            │                     │
           │                       │<────────────────────│                     │
           │                       │                     │                     │
           │                       │ ═══════════════════════════════════════════
           │                       │ LOOP AGENTIC                              │
           │                       │ ═══════════════════════════════════════════
           │                       │                     │                     │
           │                       │                     │  executeTool        │
           │                       │                     │  fs_write           │
           │                       │─────────────────────│────────────────────>│
           │                       │                     │                     │
           │                       │                     │  {success: true}    │
           │                       │<────────────────────│─────────────────────│
           │                       │                     │                     │
           │                       │ POST /v1/messages   │                     │
           │                       │ {tool_result}       │                     │
           │                       │────────────────────>│                     │
           │                       │                     │                     │
           │                       │ Response final      │                     │
           │                       │<────────────────────│                     │
           │                       │                     │                     │
           │ ai.chat.response      │                     │                     │
           │<──────────────────────│                     │                     │
           │                       │                     │                     │

┌─────────────────────┐     ┌──────────────────┐     ┌──────────────┐
│ ai-agent-framework  │     │ telegram-service │     │ Telegram API │
└──────────┬──────────┘     └────────┬─────────┘     └──────┬───────┘
           │                         │                      │
           │ telegram.send_message   │                      │
           │ .request                │                      │
           │ {chat_id, "Listo!"}     │                      │
           │────────────────────────>│                      │
           │                         │                      │
           │                         │ POST /sendMessage    │
           │                         │─────────────────────>│
           │                         │                      │
           │                         │ OK                   │
           │                         │<─────────────────────│
           │                         │                      │
           │ telegram.send_message   │                      │
           │ .response               │                      │
           │<────────────────────────│                      │
           │                         │                      │
           │ agent.execution         │                      │
           │ .completed              │                      │
           │─────────────────────────│──────────────────────│
           │                         │                      │
```

### Paso a Paso Detallado

---

#### PASO 1: Usuario Envía Imagen a Telegram (t=0ms)

**Acción**: El usuario abre Telegram y envía una imagen al bot.

**Lo que recibe telegram-service en el polling**:
```json
{
  "ok": true,
  "result": [
    {
      "update_id": 123456789,
      "message": {
        "message_id": 42,
        "from": {
          "id": 987654321,
          "is_bot": false,
          "first_name": "Juan",
          "username": "juanperez",
          "language_code": "es"
        },
        "chat": {
          "id": 987654321,
          "first_name": "Juan",
          "username": "juanperez",
          "type": "private"
        },
        "date": 1704628800,
        "photo": [
          {
            "file_id": "AgACAgIAAxk_small",
            "file_unique_id": "AQADAgAT_small",
            "file_size": 1234,
            "width": 90,
            "height": 90
          },
          {
            "file_id": "AgACAgIAAxk_medium",
            "file_unique_id": "AQADAgAT_medium",
            "file_size": 12345,
            "width": 320,
            "height": 320
          },
          {
            "file_id": "AgACAgIAAxk_large",
            "file_unique_id": "AQADAgAT_large",
            "file_size": 98765,
            "width": 800,
            "height": 800
          }
        ],
        "caption": "Mira esta foto"
      }
    }
  ]
}
```

---

#### PASO 2: Telegram-Service Procesa el Update (t=50ms)

**Acción interna del telegram-service**:

```javascript
// telegram-service/index.js

function processUpdate(update) {
  const message = update.message;

  // Detectar tipo de mensaje
  if (message.photo && message.photo.length > 0) {
    // Es una foto
    emitPhotoReceived(message);
  } else if (message.text) {
    // Es texto
    emitTextReceived(message);
  }
  // ... otros tipos
}

function emitPhotoReceived(message) {
  // Seleccionar la foto de mejor calidad (última del array)
  const bestPhoto = message.photo[message.photo.length - 1];

  eventBus.emit('telegram.photo.received', {
    event_id: generateUUID(),
    event_type: 'telegram.photo.received',
    timestamp: new Date().toISOString(),
    source: {
      module_id: 'telegram-service',
      bot_name: 'mi_bot'
    },
    data: {
      bot_name: 'mi_bot',
      chat_id: message.chat.id,
      message_id: message.message_id,
      from: {
        id: message.from.id,
        first_name: message.from.first_name,
        username: message.from.username
      },
      photo: {
        file_id: bestPhoto.file_id,
        file_unique_id: bestPhoto.file_unique_id,
        width: bestPhoto.width,
        height: bestPhoto.height,
        file_size: bestPhoto.file_size
      },
      caption: message.caption || null,
      date: message.date
    },
    trace: {
      trace_id: generateTraceId(),
      span_id: generateSpanId()
    }
  });
}
```

**Evento emitido**:
```javascript
// Evento: telegram.photo.received
{
  event_id: "evt-tg-001",
  event_type: "telegram.photo.received",
  timestamp: "2026-01-07T12:00:00.050Z",
  source: {
    module_id: "telegram-service",
    bot_name: "mi_bot"
  },
  data: {
    bot_name: "mi_bot",
    chat_id: 987654321,
    message_id: 42,
    from: {
      id: 987654321,
      first_name: "Juan",
      username: "juanperez"
    },
    photo: {
      file_id: "AgACAgIAAxk_large",
      file_unique_id: "AQADAgAT_large",
      width: 800,
      height: 800,
      file_size: 98765
    },
    caption: "Mira esta foto",
    date: 1704628800
  },
  trace: {
    trace_id: "trace-tg-001",
    span_id: "span-tg-001"
  }
}
```

---

#### PASO 3: AI-Agent-Framework Detecta Trigger (t=60ms)

**Quién escucha**: `ai-agent-framework`

**Qué hace**:
1. Recibe el evento `telegram.photo.received`
2. Busca agentes con triggers que coincidan
3. Encuentra `motivational-image-agent`
4. Verifica condiciones (bot_name = "mi_bot") ✓
5. Crea contexto de ejecución

```javascript
// ai-agent-framework/index.js

function handleEvent(event) {
  // Buscar agentes con este trigger
  const matchingAgents = agents.filter(agent => {
    return agent.enabled && agent.triggers.some(trigger => {
      // Verificar tipo de evento
      if (trigger.event !== event.event_type) return false;

      // Verificar condiciones
      if (trigger.conditions) {
        for (const [key, value] of Object.entries(trigger.conditions)) {
          if (event.data[key] !== value) return false;
        }
      }

      return true;
    });
  });

  // Ejecutar cada agente que matchea
  for (const agent of matchingAgents) {
    executeAgent(agent, event);
  }
}

async function executeAgent(agent, triggerEvent) {
  // Crear contexto de ejecución
  const execution = {
    execution_id: generateUUID(),
    agent_id: agent.name,
    agent_version: agent.version,
    trigger_event: triggerEvent.event_type,
    trigger_data: triggerEvent.data,
    status: 'running',
    started_at: new Date().toISOString()
  };

  // Emitir evento de inicio
  eventBus.emit('agent.execution.started', {
    event_type: 'agent.execution.started',
    data: execution
  });

  // Preparar mensaje para la IA
  const userMessage = buildUserMessage(agent, triggerEvent);

  // Llamar a ai-gateway
  eventBus.emit('ai.chat.request', {
    request_id: execution.execution_id,
    data: {
      messages: [
        { role: 'user', content: userMessage }
      ],
      system: agent.system_prompt,
      model: agent.config.model,
      tools: true,
      execute_tools: true,
      context: {
        agent_id: agent.name,
        trigger: triggerEvent.event_type,
        telegram_chat_id: triggerEvent.data.chat_id
      }
    }
  });
}

function buildUserMessage(agent, event) {
  // Construir mensaje descriptivo del trigger
  return `Se ha recibido una imagen en Telegram.

Detalles:
- Usuario: ${event.data.from.first_name} (@${event.data.from.username})
- Chat ID: ${event.data.chat_id}
- Caption: ${event.data.caption || 'Sin caption'}

Por favor, crea un archivo con una frase motivadora como respuesta.`;
}
```

**Evento emitido (inicio de agente)**:
```javascript
// Evento: agent.execution.started
{
  event_id: "evt-agent-001",
  event_type: "agent.execution.started",
  timestamp: "2026-01-07T12:00:00.060Z",
  source: {
    module_id: "ai-agent-framework"
  },
  data: {
    execution_id: "exec-001",
    agent_id: "motivational-image-agent",
    agent_version: "1.0.0",
    trigger_event: "telegram.photo.received",
    trigger_data: {
      bot_name: "mi_bot",
      chat_id: 987654321,
      from: { first_name: "Juan" }
    },
    status: "running",
    started_at: "2026-01-07T12:00:00.060Z"
  }
}
```

---

#### PASO 4: Llamar a AI-Gateway (t=70ms)

**Evento emitido por ai-agent-framework**:
```javascript
// Evento: ai.chat.request
{
  event_id: "evt-agent-002",
  event_type: "ai.chat.request",
  timestamp: "2026-01-07T12:00:00.070Z",
  source: {
    module_id: "ai-agent-framework"
  },
  data: {
    request_id: "exec-001",
    messages: [
      {
        role: "user",
        content: `Se ha recibido una imagen en Telegram.

Detalles:
- Usuario: Juan (@juanperez)
- Chat ID: 987654321
- Caption: Mira esta foto

Por favor, crea un archivo con una frase motivadora como respuesta.`
      }
    ],
    system: "Eres un agente que crea frases motivadoras. Cuando recibas una notificación de imagen, tu tarea es:\n1. Crear un archivo llamado 'frase_motivadora.txt'\n2. Escribir una frase motivadora inspiradora en ese archivo\n3. No necesitas analizar la imagen, solo crear la frase",
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.8,
    max_tokens: 1024,
    tools: true,
    execute_tools: true,
    context: {
      agent_id: "motivational-image-agent",
      trigger: "telegram.photo.received",
      telegram_chat_id: 987654321
    }
  }
}
```

---

#### PASO 5: AI-Gateway Procesa (t=70ms - t=1800ms)

##### 5.1 Primera Llamada a Anthropic

**Request HTTP**:
```http
POST https://api.anthropic.com/v1/messages
Content-Type: application/json
x-api-key: sk-ant-xxxxx
anthropic-version: 2023-06-01

{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "system": "Eres un agente que crea frases motivadoras...",
  "messages": [
    {
      "role": "user",
      "content": "Se ha recibido una imagen en Telegram.\n\nDetalles:\n- Usuario: Juan (@juanperez)\n- Chat ID: 987654321\n- Caption: Mira esta foto\n\nPor favor, crea un archivo con una frase motivadora como respuesta."
    }
  ],
  "tools": [
    {
      "name": "fs_write",
      "description": "Escribe contenido en un archivo",
      "input_schema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "content": { "type": "string" }
        },
        "required": ["path", "content"]
      }
    }
  ]
}
```

**Response de Anthropic**:
```json
{
  "id": "msg_agent_01",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "¡Perfecto! Voy a crear un archivo con una frase motivadora para Juan."
    },
    {
      "type": "tool_use",
      "id": "toolu_agent_01",
      "name": "fs_write",
      "input": {
        "path": "frase_motivadora.txt",
        "content": "Cada día es una nueva oportunidad para ser la mejor versión de ti mismo. No importa lo que pasó ayer, hoy tienes el poder de escribir una nueva historia. ¡Adelante, Juan! 🌟"
      }
    }
  ],
  "stop_reason": "tool_use",
  "usage": {
    "input_tokens": 198,
    "output_tokens": 112
  }
}
```

##### 5.2 Ejecutar Tool fs_write

```javascript
// ai-gateway ejecuta el tool
const result = await moduleLoader.executeTool('fs_write', {
  path: 'frase_motivadora.txt',
  content: 'Cada día es una nueva oportunidad para ser la mejor versión de ti mismo. No importa lo que pasó ayer, hoy tienes el poder de escribir una nueva historia. ¡Adelante, Juan! 🌟'
});

// Resultado:
{
  status: 'success',
  data: {
    success: true,
    path: '/home/user/event-core/data/projects/active/storage/frase_motivadora.txt',
    size: 198,
    created_at: '2026-01-07T12:00:01.000Z'
  }
}
```

##### 5.3 Segunda Llamada a Anthropic

**Request con tool_result**:
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "system": "Eres un agente que crea frases motivadoras...",
  "messages": [
    {
      "role": "user",
      "content": "Se ha recibido una imagen en Telegram..."
    },
    {
      "role": "assistant",
      "content": [
        {"type": "text", "text": "¡Perfecto! Voy a crear..."},
        {"type": "tool_use", "id": "toolu_agent_01", "name": "fs_write", "input": {...}}
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "toolu_agent_01",
          "content": "{\"success\":true,\"path\":\"/home/user/event-core/data/projects/active/storage/frase_motivadora.txt\",\"size\":198}"
        }
      ]
    }
  ],
  "tools": [...]
}
```

**Response final**:
```json
{
  "id": "msg_agent_02",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "¡Listo! He creado el archivo `frase_motivadora.txt` con un mensaje motivador personalizado para Juan. El archivo contiene una frase inspiradora para comenzar el día con energía positiva."
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 345,
    "output_tokens": 48
  }
}
```

---

#### PASO 6: AI-Gateway Responde (t=1800ms)

**Evento emitido por ai-gateway**:
```javascript
// Evento: ai.chat.response
{
  event_id: "evt-agent-003",
  event_type: "ai.chat.response",
  timestamp: "2026-01-07T12:00:01.800Z",
  source: {
    module_id: "ai-gateway"
  },
  data: {
    request_id: "exec-001",
    success: true,
    content: "¡Listo! He creado el archivo `frase_motivadora.txt` con un mensaje motivador personalizado para Juan. El archivo contiene una frase inspiradora para comenzar el día con energía positiva.",
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    tokens: {
      input: 543,
      output: 160,
      total: 703
    },
    iterations: 2,
    tool_results: [
      {
        tool_call_id: "toolu_agent_01",
        name: "fs_write",
        status: "success",
        result: {
          success: true,
          path: "/home/user/event-core/data/projects/active/storage/frase_motivadora.txt",
          size: 198
        }
      }
    ]
  }
}
```

---

#### PASO 7: Notificar al Usuario en Telegram (t=1850ms)

**Acción del ai-agent-framework**:

```javascript
// ai-agent-framework recibe la respuesta y notifica al usuario
function handleAiResponse(response) {
  const context = response.data.context;

  if (context && context.telegram_chat_id) {
    // Enviar mensaje al usuario de Telegram
    eventBus.emit('telegram.send_message.request', {
      request_id: generateUUID(),
      data: {
        bot_name: 'mi_bot',
        chat_id: context.telegram_chat_id,
        text: `✨ ¡Mensaje motivador creado!\n\n${response.data.content}\n\n📁 Archivo: frase_motivadora.txt`,
        parse_mode: 'HTML'
      }
    });
  }
}
```

**Evento emitido**:
```javascript
// Evento: telegram.send_message.request
{
  event_id: "evt-agent-004",
  event_type: "telegram.send_message.request",
  timestamp: "2026-01-07T12:00:01.850Z",
  source: {
    module_id: "ai-agent-framework"
  },
  data: {
    request_id: "send-001",
    bot_name: "mi_bot",
    chat_id: 987654321,
    text: "✨ ¡Mensaje motivador creado!\n\n¡Listo! He creado el archivo `frase_motivadora.txt` con un mensaje motivador personalizado para Juan. El archivo contiene una frase inspiradora para comenzar el día con energía positiva.\n\n📁 Archivo: frase_motivadora.txt",
    parse_mode: "HTML"
  }
}
```

**Quién escucha**: `telegram-service`

**Qué hace**:
1. Obtiene el token del bot
2. Llama a la API de Telegram

**Request a Telegram API**:
```http
POST https://api.telegram.org/botBOT_TOKEN/sendMessage
Content-Type: application/json

{
  "chat_id": 987654321,
  "text": "✨ ¡Mensaje motivador creado!\n\n¡Listo! He creado el archivo...",
  "parse_mode": "HTML"
}
```

**Response de Telegram**:
```json
{
  "ok": true,
  "result": {
    "message_id": 43,
    "from": {
      "id": 123456789,
      "is_bot": true,
      "first_name": "MiBot"
    },
    "chat": {
      "id": 987654321,
      "type": "private"
    },
    "date": 1704628802,
    "text": "✨ ¡Mensaje motivador creado!..."
  }
}
```

**Evento de respuesta**:
```javascript
// Evento: telegram.send_message.response
{
  event_id: "evt-agent-005",
  event_type: "telegram.send_message.response",
  timestamp: "2026-01-07T12:00:02.100Z",
  source: {
    module_id: "telegram-service"
  },
  data: {
    request_id: "send-001",
    success: true,
    message_id: 43,
    chat_id: 987654321,
    sent_at: "2026-01-07T12:00:02.100Z"
  }
}
```

---

#### PASO 8: Agente Completado (t=2150ms)

**Evento emitido por ai-agent-framework**:
```javascript
// Evento: agent.execution.completed
{
  event_id: "evt-agent-006",
  event_type: "agent.execution.completed",
  timestamp: "2026-01-07T12:00:02.150Z",
  source: {
    module_id: "ai-agent-framework"
  },
  data: {
    execution_id: "exec-001",
    agent_id: "motivational-image-agent",
    agent_version: "1.0.0",
    status: "success",
    trigger_event: "telegram.photo.received",
    duration_ms: 2090,
    iterations: 2,
    tokens_used: {
      input: 543,
      output: 160,
      total: 703
    },
    tools_executed: [
      {
        name: "fs_write",
        status: "success",
        path: "frase_motivadora.txt"
      }
    ],
    files_created: [
      "/home/user/event-core/data/projects/active/storage/frase_motivadora.txt"
    ],
    telegram_notification_sent: true,
    started_at: "2026-01-07T12:00:00.060Z",
    completed_at: "2026-01-07T12:00:02.150Z"
  }
}
```

### Archivo Creado

**Ruta**: `/home/user/event-core/data/projects/active/storage/frase_motivadora.txt`

**Contenido**:
```
Cada día es una nueva oportunidad para ser la mejor versión de ti mismo. No importa lo que pasó ayer, hoy tienes el poder de escribir una nueva historia. ¡Adelante, Juan! 🌟
```

### Timeline Completo

```
t=0ms      Usuario envía imagen en Telegram
t=50ms     telegram-service detecta en polling
t=55ms     telegram.photo.received emitido
t=60ms     ai-agent-framework detecta trigger
t=65ms     agent.execution.started emitido
t=70ms     ai.chat.request enviado a ai-gateway
t=100ms    Primera llamada HTTP a Anthropic
t=700ms    Respuesta con tool_use: fs_write
t=750ms    Ejecutar fs_write
t=1000ms   Archivo creado en disco
t=1050ms   Segunda llamada HTTP a Anthropic
t=1750ms   Respuesta final de Anthropic
t=1800ms   ai.chat.response emitido
t=1850ms   telegram.send_message.request emitido
t=2100ms   Mensaje enviado al usuario en Telegram
t=2150ms   agent.execution.completed emitido
─────────────────────────────────────────────────────
TOTAL: ~2.1 segundos
```

### Lo que ve el Usuario en Telegram

```
┌─────────────────────────────────────────┐
│ Juan                              12:00 │
│ [📷 Imagen]                             │
│ Mira esta foto                          │
├─────────────────────────────────────────┤
│ MiBot                             12:00 │
│ ✨ ¡Mensaje motivador creado!           │
│                                         │
│ ¡Listo! He creado el archivo            │
│ `frase_motivadora.txt` con un mensaje   │
│ motivador personalizado para Juan.      │
│ El archivo contiene una frase           │
│ inspiradora para comenzar el día        │
│ con energía positiva.                   │
│                                         │
│ 📁 Archivo: frase_motivadora.txt        │
└─────────────────────────────────────────┘
```

---

## Comparativa de Flujos

| Aspecto | Flujo 1: Chat UI | Flujo 2: Telegram Agent |
|---------|------------------|-------------------------|
| **Trigger** | Usuario escribe mensaje | Usuario envía imagen |
| **Entrada** | Texto: "Crea un archivo..." | Evento: `telegram.photo.received` |
| **Entry Point** | `conversation-manager` | `telegram-service` |
| **Orquestador** | `chat-ai-bridge` | `ai-agent-framework` |
| **System Prompt** | Dinámico (prompt-composer) | Fijo (config del agente) |
| **Persistencia Chat** | Sí (chat-session) | No |
| **Respuesta** | En UI del chat | Mensaje en Telegram |
| **Tool Usado** | `fs_write` | `fs_write` |
| **Archivo Creado** | `frase_motivadora.txt` | `frase_motivadora.txt` |
| **Latencia** | ~2 segundos | ~2.1 segundos |
| **Tokens** | ~775 | ~703 |

### Diagrama Comparativo

```
FLUJO 1: CHAT UI                          FLUJO 2: TELEGRAM AGENT
═══════════════                           ══════════════════════

    Usuario                                   Usuario
       │                                         │
       ▼                                         ▼
  ┌─────────┐                              ┌──────────┐
  │   UI    │                              │ Telegram │
  │ (React) │                              │   App    │
  └────┬────┘                              └────┬─────┘
       │                                        │
       │ "Crea archivo..."                      │ [Envía imagen]
       ▼                                        ▼
  ┌────────────────────┐                  ┌──────────────────┐
  │ conversation-      │                  │ telegram-service │
  │ manager (facade)   │                  │ (polling)        │
  └─────────┬──────────┘                  └────────┬─────────┘
            │                                      │
            ▼                                      ▼
  ┌─────────────────┐                     ┌─────────────────────┐
  │ chat-ai-bridge  │                     │ ai-agent-framework  │
  │ (coordinador)   │                     │ (trigger detector)  │
  └────────┬────────┘                     └──────────┬──────────┘
           │                                         │
           │ ┌──────────────┐                        │
           ├─┤ chat-session │                        │
           │ └──────────────┘                        │
           │ ┌────────────────┐                      │
           ├─┤ prompt-composer│                      │
           │ └────────────────┘                      │
           │                                         │
           ▼                                         ▼
     ┌─────────────────────────────────────────────────┐
     │                   ai-gateway                     │
     │            (loop agentic + tools)               │
     └─────────────────────────────────────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Anthropic  │
                    │     API     │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  filesystem │
                    │  (fs_write) │
                    └──────┬──────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │   frase_motivadora.txt  │
              │   ARCHIVO CREADO ✓      │
              └─────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
    ┌─────────────┐                 ┌─────────────────┐
    │ Respuesta   │                 │ Notificación    │
    │ en Chat UI  │                 │ en Telegram     │
    └─────────────┘                 └─────────────────┘
```

---

## Resumen

Ambos flujos demuestran la arquitectura event-driven de Event-Core:

1. **Desacoplamiento**: Los módulos no se conocen entre sí, solo emiten y escuchan eventos
2. **Loop Agentic**: La IA puede ejecutar herramientas iterativamente hasta completar la tarea
3. **Flexibilidad**: El mismo resultado (crear archivo) se puede lograr desde diferentes triggers
4. **Trazabilidad**: Cada evento lleva `trace_id` para seguimiento end-to-end
5. **Extensibilidad**: Añadir nuevos triggers o acciones es cuestión de configuración

**Resultado final idéntico en ambos casos**:
```
📁 frase_motivadora.txt
"[Frase motivadora inspiradora]"
```
