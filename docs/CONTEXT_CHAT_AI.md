# CONTEXT_CHAT_AI.md - Sistema Chat AI Event-Driven

> Documento de contexto para la aplicación Chat AI de Event-Core.
> Define todos los módulos relacionados con conversaciones, IA y gestión de proyectos.

---

## Arquitectura General

```
                    ┌─────────────────────────────────────────┐
                    │             FRONTEND CHAT               │
                    │          (SvelteKit + MQTT)             │
                    └─────────────────┬───────────────────────┘
                                      │
                         conversation │ message
                              .send   │ .sent
                                      ▼
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│ conversation- │           │  credential-  │           │    prompt-    │
│    manager    │◄─────────►│    manager    │           │    manager    │
│ (historial)   │           │  (API keys)   │           │  (templates)  │
└───────┬───────┘           └───────────────┘           └───────┬───────┘
        │                                                       │
        │ ai.chat.request                                       │
        ▼                                                       │
┌───────────────┐           ┌───────────────┐                   │
│  ai-gateway   │◄──────────│ ai-agent-     │◄──────────────────┘
│ (LLM router)  │           │  framework    │
└───────┬───────┘           └───────┬───────┘
        │                           │
        │ ai.chat.response          │ tool.call.request
        ▼                           ▼
┌───────────────┐           ┌───────────────┐
│ conversation- │           │    tool-      │
│    manager    │           │ orchestrator  │
│ (save msg)    │           │  (execute)    │
└───────┬───────┘           └───────────────┘
        │
        │ db.query.request
        ▼
┌───────────────────────────────────────────────────────────────┐
│                     INFRAESTRUCTURA                            │
├───────────────┬───────────────┬───────────────────────────────┤
│   database-   │    storage-   │         project-              │
│    manager    │    manager    │         manager               │
│   (SQLite)    │   (files)     │      (lifecycle)              │
└───────────────┴───────────────┴───────────────────────────────┘
```

---

## Principio de Autonomía

**IMPORTANTE**: Cada módulo es AUTÓNOMO e INDEPENDIENTE.

```
✅ CORRECTO:
- El módulo hace su trabajo
- Publica eventos sobre LO QUE HIZO
- NO sabe quién escucha
- NO llama directamente a otros módulos

❌ INCORRECTO:
- Llamar APIs de otros módulos directamente
- Importar código de otros módulos
- Depender de que alguien escuche
```

---

## Módulos del Sistema

### 1. ai-gateway (Gateway LLM)

**Responsabilidad**: Router unificado para múltiples proveedores de IA.

**Proveedores Soportados**:
| Proveedor | Modelos | Prioridad | Costo/1K tokens |
|-----------|---------|-----------|-----------------|
| DeepSeek | deepseek-chat, deepseek-coder | 1 | $0.0001 / $0.0002 |
| Anthropic | claude-3-5-sonnet, claude-3-opus | 2 | $0.003 / $0.015 |
| OpenAI | gpt-4o, gpt-4o-mini, gpt-3.5-turbo | 3 | $0.0015 / $0.006 |
| Ollama | llama2, codellama, mistral, mixtral | 4 | $0 (local) |

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `ai.request.created` | `onAIRequest` | Procesa request de IA |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `ai.chat.response` | Respuesta del LLM recibida |
| `ai.chat.error` | Error en la llamada |

**APIs**:
```
POST /chat           - Chat completion (sync/fallback)
POST /chat/stream    - Chat completion con SSE streaming
GET  /providers      - Listar proveedores y estado
GET  /models         - Listar modelos por proveedor
GET  /usage          - Estadísticas de uso y costos
POST /providers/test - Probar conectividad
```

**Configuración**:
```javascript
{
  retry: {
    max_attempts: 3,
    initial_delay_ms: 1000,
    backoff_multiplier: 2
  },
  fallback: {
    enabled: true,
    strategy: "priority"  // Usa siguiente proveedor si falla
  },
  streaming: {
    enabled: true,
    chunk_size: 1024
  }
}
```

---

### 2. conversation-manager (Gestor de Conversaciones)

**Responsabilidad**: Gestionar conversaciones, mensajes y contexto para IA.

**Características**:
- Context window configurable por conversación
- Carga de contexto de proyecto (metadata, storage)
- Settings de IA por conversación (modelo, temperature, max_tokens)
- Soporte de attachments
- Tracking de costos/tokens por mensaje

**Estado**:
```javascript
this.conversations = new Map();  // conversation_id -> conversation
this.messages = new Map();       // conversation_id -> messages[]
this.pendingRequests = new Map(); // correlation_id -> request
```

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `conversation.get.request` | `onGetConversationRequest` | Obtiene conversación |
| `conversation.list.request` | `onListConversationsRequest` | Lista conversaciones |
| `message.list.request` | `onListMessagesRequest` | Lista mensajes |
| `conversation.send.request` | `onSendMessageRequest` | Envía mensaje a IA |
| `db.query.response` | `onDbQueryResponse` | Recibe respuesta DB |
| `ai.chat.response` | `onAIChatResponse` | Recibe respuesta IA |
| `project.get.response` | `onProjectGetResponse` | Contexto de proyecto |
| `storage.info.response` | `onStorageInfoResponse` | Info de storage |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `conversation.created` | Nueva conversación |
| `conversation.updated` | Metadata actualizada |
| `conversation.deleted` | Conversación eliminada |
| `message.sent` | Mensaje de usuario enviado |
| `message.received` | Respuesta de IA recibida |
| `conversation.context.loaded` | Contexto cargado |

**APIs**:
```
POST   /conversations           - Crear conversación
GET    /conversations           - Listar (filtro por proyecto)
GET    /conversations/:id       - Obtener con contexto
PUT    /conversations/:id       - Actualizar metadata
DELETE /conversations/:id       - Eliminar
POST   /conversations/:id/messages - Enviar mensaje
GET    /conversations/:id/messages - Obtener mensajes
GET    /conversations/:id/context  - Contexto completo
```

**Estructura de Conversación**:
```javascript
{
  id: "conv_abc123",
  project_id: "proj_xyz",
  title: "Diseño de API REST",
  system_prompt: "Eres un experto en diseño de APIs...",
  ai_settings: {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.7,
    max_tokens: 4096
  },
  context_window: 20,  // Últimos N mensajes enviados
  metadata: {
    tags: ["api", "diseño"],
    priority: "high"
  },
  stats: {
    message_count: 45,
    total_tokens: 12500,
    total_cost: 0.15
  },
  created_at: "2024-12-01T10:00:00Z",
  updated_at: "2024-12-05T14:30:00Z"
}
```

**Estructura de Mensaje**:
```javascript
{
  id: "msg_xyz789",
  conversation_id: "conv_abc123",
  role: "assistant",  // user | assistant | system
  content: "Para diseñar una API REST efectiva...",
  attachments: [
    { type: "file", file_id: "file_123", name: "spec.json" }
  ],
  tokens: {
    input: 150,
    output: 450
  },
  cost: 0.003,
  model: "claude-3-5-sonnet-20241022",
  timestamp: "2024-12-05T14:30:00Z"
}
```

---

### 3. credential-manager (Gestor de Credenciales)

**Responsabilidad**: Gestión multi-nivel de API keys con resolución en cascada.

**Niveles de Prioridad**:
| Nivel | Prioridad | Requiere ID | Descripción |
|-------|-----------|-------------|-------------|
| CUSTOM | 1 (más alta) | Sí | Credencial personalizada específica |
| CLIENT | 2 | Sí | Por cliente |
| PROJECT | 3 | Sí | Por proyecto |
| GLOBAL | 4 (fallback) | No | Credencial global por defecto |

**Cascada de Resolución**:
```
CUSTOM → CLIENT → PROJECT → GLOBAL
   ↓        ↓         ↓         ↓
  🔴       🟡        🔵        🟢
```

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `credential.resolve.request` | `onResolveRequest` | Resuelve credencial |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `credential.saved` | Credencial guardada |
| `credential.updated` | Credencial actualizada |
| `credential.deleted` | Credencial eliminada |
| `credential.resolved` | Resolución exitosa |
| `credential.resolve.failed` | Resolución fallida |

**APIs**:
```
POST   /credentials         - Guardar credencial
GET    /credentials/resolve - Resolver por cascada
GET    /credentials         - Listar (masked)
PUT    /credentials/:key    - Actualizar
DELETE /credentials/:key    - Eliminar
GET    /credentials/levels  - Niveles disponibles
```

**Almacenamiento**: Archivo `.env` con formato:
```
# GLOBAL
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# PROJECT
OPENAI_API_KEY_PROJECT_proj123=sk-...

# CLIENT
DEEPSEEK_API_KEY_CLIENT_client456=sk-...
```

---

### 4. prompt-manager (Gestor de Prompts)

**Responsabilidad**: Sistema de gestión de prompts con versionado, templates y analytics.

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `ai.completion.completed` | `onCompletionCompleted` | Registra analytics |
| `ai.request.started` | `onRequestStarted` | Tracking de uso |

**APIs**:
```
POST   /prompts              - Crear prompt
GET    /prompts              - Listar prompts
GET    /prompts/:id          - Obtener prompt
PUT    /prompts/:id          - Actualizar prompt
DELETE /prompts/:id          - Eliminar prompt
GET    /prompts/:id/versions - Listar versiones
POST   /prompts/:id/render   - Renderizar template
GET    /analytics            - Analytics de uso
POST   /prompts/compare      - A/B testing
```

**Estructura de Prompt**:
```javascript
{
  id: "prompt_menu_gen",
  name: "Menu Generator",
  description: "Genera menús de restaurante",
  category: "generation",
  template: "Genera un menú para {{restaurant_type}} con {{num_items}} items...",
  variables: ["restaurant_type", "num_items", "price_range"],
  versions: [
    { version: 1, template: "...", created_at: "..." },
    { version: 2, template: "...", created_at: "..." }
  ],
  current_version: 2,
  analytics: {
    uses: 150,
    avg_tokens: 800,
    avg_latency_ms: 2500,
    success_rate: 0.95
  }
}
```

---

### 5. tool-orchestrator (Orquestador de Herramientas)

**Responsabilidad**: Registrar y ejecutar herramientas para agentes IA.

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `tool.call.request` | `onToolCallRequest` | Ejecuta herramienta |
| `tool.list.request` | `onListToolsRequest` | Lista herramientas |
| `tool.get.request` | `onGetToolRequest` | Obtiene definición |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `tool.registered` | Herramienta registrada |
| `tool.unregistered` | Herramienta eliminada |
| `tool.call.success` | Ejecución exitosa |
| `tool.call.failed` | Ejecución fallida |
| `tool.call.response` | Respuesta de ejecución |

**APIs**:
```
GET    /tools            - Listar herramientas
GET    /tools/:name      - Obtener definición
POST   /tools/:name/call - Ejecutar herramienta
POST   /tools/register   - Registrar herramienta
DELETE /tools/:name      - Eliminar herramienta
```

**Estructura de Tool**:
```javascript
{
  name: "web_search",
  description: "Search the web for information",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      max_results: { type: "number", default: 5 }
    },
    required: ["query"]
  },
  handler: "external",  // internal | external | event
  endpoint: "https://api.search.com/v1/search",
  timeout_ms: 10000
}
```

---

### 6. ai-agent-framework (Framework de Agentes)

**Responsabilidad**: Framework para crear agentes IA event-driven con context y tool calling.

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `agent.*.created` | `onAgentCreated` | Agente creado |
| `agent.*.completed` | `onAgentCompleted` | Tarea completada |
| `agent.*.failed` | `onAgentFailed` | Tarea fallida |

**APIs**:
```
POST   /agents             - Registrar agente
GET    /agents             - Listar agentes
GET    /agents/:id         - Obtener detalles
PUT    /agents/:id         - Actualizar config
DELETE /agents/:id         - Eliminar agente
POST   /agents/:id/trigger - Trigger manual
GET    /agents/:id/context - Obtener contexto/memoria
DELETE /agents/:id/context - Limpiar contexto
GET    /tools              - Tools disponibles
GET    /agents/:id/stats   - Estadísticas
```

**Estructura de Agente**:
```javascript
{
  id: "agent_support",
  name: "Customer Support Agent",
  description: "Agente de soporte al cliente",
  trigger: {
    event: "ticket.created",
    filter: { priority: "high" }
  },
  prompt_id: "prompt_support_v2",
  tools: ["search_kb", "create_ticket", "send_email"],
  context: {
    max_messages: 50,
    include_user_history: true
  },
  config: {
    provider: "anthropic",
    model: "claude-3-5-sonnet",
    temperature: 0.3,
    max_tokens: 2000
  },
  stats: {
    total_runs: 1250,
    success_rate: 0.92,
    avg_duration_ms: 3500
  }
}
```

---

## Módulos de Infraestructura

### 7. database-manager (Base de Datos)

**Responsabilidad**: SQLite via sql.js con aislamiento por proyecto.

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `db.query.request` | `onQueryRequest` | Ejecuta query SQL |
| `db.schema.init.request` | `onSchemaInitRequest` | Inicializa schema |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `db.created` | Base de datos creada |
| `db.deleted` | Base de datos eliminada |
| `db.query.executed` | Query ejecutado |
| `db.schema.initialized` | Schema inicializado |
| `db.query.response` | Respuesta a query |

**APIs**:
```
GET    /databases                    - Listar bases de datos
POST   /databases/:projectId/query   - Ejecutar SQL
GET    /databases/:projectId/schema  - Obtener schema
POST   /databases/:projectId/init    - Inicializar schema
DELETE /databases/:projectId         - Eliminar DB
GET    /databases/:projectId/tables  - Listar tablas
```

**Almacenamiento**: `./data/projects/{projectId}/database.sqlite`

---

### 8. storage-manager (Almacenamiento)

**Responsabilidad**: Gestión de archivos con aislamiento por proyecto.

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `project.created` | `onProjectCreated` | Auto-crea storage |
| `project.deleted` | `onProjectDeleted` | Auto-elimina storage |
| `file.list.request` | `onFileListRequest` | Lista archivos |
| `file.get.request` | `onFileGetRequest` | Obtiene metadata |
| `storage.info.request` | `onStorageInfoRequest` | Info de uso |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `storage.created` | Storage de proyecto creado |
| `storage.deleted` | Storage eliminado |
| `storage.cleaned` | Temporales limpiados |
| `file.uploaded` | Archivo subido |
| `file.deleted` | Archivo eliminado |

**APIs**:
```
POST   /storage/:projectId/upload       - Subir archivo
GET    /storage/:projectId/files        - Listar archivos
GET    /storage/:projectId/files/:id    - Metadata de archivo
GET    /storage/:projectId/download/:id - Descargar archivo
DELETE /storage/:projectId/files/:id    - Eliminar archivo
POST   /storage/:projectId/cleanup      - Limpiar temporales
GET    /storage/:projectId/info         - Info de uso
```

**Estructura de Directorios**:
```
data/storage/{projectId}/
├── uploads/      # Archivos subidos por usuario
├── exports/      # Archivos exportados
├── temp/         # Temporales (auto-cleanup 24h)
└── files/        # Archivos del sistema
```

**Configuración**:
```javascript
{
  maxFileSize: 104857600,  // 100MB
  allowedMimeTypes: ["image/*", "application/pdf", "text/*", "application/json"],
  tempCleanupAfterHours: 24
}
```

---

### 9. project-manager (Gestor de Proyectos)

**Responsabilidad**: Ciclo de vida de proyectos con integración DB y credenciales.

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `project.get.request` | `onGetProjectRequest` | Obtiene proyecto |
| `project.list.request` | `onListProjectsRequest` | Lista proyectos |
| `project.active.request` | `onGetActiveProjectRequest` | Proyecto activo |
| `db.query.response` | `onDbQueryResponse` | Respuesta de DB |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `project.created` | Proyecto creado |
| `project.updated` | Proyecto actualizado |
| `project.deleted` | Proyecto eliminado |
| `project.activated` | Proyecto activado |
| `project.deactivated` | Proyecto desactivado |

**APIs**:
```
POST   /projects            - Crear proyecto
GET    /projects            - Listar proyectos
GET    /projects/:id        - Obtener proyecto
PUT    /projects/:id        - Actualizar proyecto
DELETE /projects/:id        - Eliminar proyecto
POST   /projects/:id/activate - Activar proyecto
GET    /projects/active     - Proyecto activo actual
```

**Estructura de Proyecto**:
```javascript
{
  id: "proj_abc123",
  name: "Mi Asistente IA",
  description: "Asistente personalizado para desarrollo",
  settings: {
    default_provider: "anthropic",
    default_model: "claude-3-5-sonnet",
    context_window: 30
  },
  credentials: {
    level: "PROJECT",
    providers: ["anthropic", "openai"]
  },
  stats: {
    conversations: 25,
    messages: 1500,
    total_tokens: 500000,
    total_cost: 15.50
  },
  is_active: true,
  created_at: "2024-11-01T10:00:00Z",
  updated_at: "2024-12-05T14:30:00Z"
}
```

---

## Flujo de Eventos Completo

### 1. Crear Conversación

```
Usuario → POST /conversations
                │
                ▼
         conversation-manager
                │
     ┌──────────┴──────────┐
     │                     │
     ▼                     ▼
db.query.request     project.get.request
     │                     │
     ▼                     ▼
database-manager     project-manager
     │                     │
     ▼                     ▼
db.query.response    project.get.response
     │                     │
     └──────────┬──────────┘
                │
                ▼
         conversation.created
```

### 2. Enviar Mensaje y Obtener Respuesta

```
Usuario → POST /conversations/:id/messages
                │
                ▼
         conversation-manager
                │
                ▼
          message.sent
                │
     ┌──────────┴──────────┐
     │                     │
     ▼                     ▼
credential.resolve    load context
     │                     │
     ▼                     ▼
credential-manager    db.query.request
     │                     │
     ▼                     │
credential.resolved        │
     │                     │
     └──────────┬──────────┘
                │
                ▼
         ai.chat.request
                │
                ▼
           ai-gateway
                │
     ┌──────────┴──────────┐
     │                     │
     ▼                     ▼
  DeepSeek           Fallback
  (priority 1)       (si falla)
     │                     │
     └──────────┬──────────┘
                │
                ▼
         ai.chat.response
                │
                ▼
         conversation-manager
                │
     ┌──────────┴──────────┐
     │                     │
     ▼                     ▼
save message         message.received
to database                │
     │                     ▼
     │              Frontend (MQTT)
     │
     ▼
db.query.executed
```

### 3. Ejecutar Herramienta (Tool Calling)

```
ai-gateway → tool_calls en respuesta
                │
                ▼
         ai-agent-framework
                │
                ▼
         tool.call.request
                │
                ▼
         tool-orchestrator
                │
     ┌──────────┴──────────┐
     │                     │
     ▼                     ▼
  validate          execute tool
  parameters              │
     │                    ▼
     │             tool.call.success
     │                    │
     └──────────┬─────────┘
                │
                ▼
         tool.call.response
                │
                ▼
         ai-agent-framework
         (continue with result)
```

---

## Ubicación de Módulos

```
event-core/
└── modules/
    ├── ai-gateway/           # Gateway LLM multi-proveedor
    ├── ai-agent-framework/   # Framework de agentes IA
    ├── prompt-manager/       # Gestión de prompts
    ├── credential-manager/   # Gestión de credenciales
    ├── tool-orchestrator/    # Orquestador de herramientas
    ├── conversation-manager/ # Gestión de conversaciones
    ├── database-manager/     # Base de datos SQLite
    ├── storage-manager/      # Almacenamiento de archivos
    └── project-manager/      # Gestión de proyectos
```

---

## Métricas y Observabilidad

Todos los módulos exponen:
- `GET /health` - Health check
- `GET /metrics` - Métricas del módulo

**Tipos de Métricas**:
- **Counters**: Operaciones totales (ej: `conversation.created.total`)
- **Gauges**: Estado actual (ej: `conversation.active.count`)
- **Timings**: Duración de operaciones (ej: `ai.chat.duration`)

---

## Notas de Implementación

1. **Persistencia**: Todos los módulos usan eventos para persistir en database-manager.

2. **Aislamiento**: Cada proyecto tiene su propia base de datos y storage.

3. **Correlación**: Siempre propagar `correlation_id` para trazabilidad.

4. **Context Window**: Configurable por conversación (default: 20 mensajes).

5. **Fallback**: ai-gateway hace fallback automático entre proveedores.

6. **Costos**: Se trackean tokens y costos por mensaje en conversation-manager.

7. **Attachments**: Archivos se suben a storage-manager y se referencian en mensajes.

---

## Interfaz de Usuario - Estructura Estándar

> Basado en `blueprints/mobile-chat-screen.yaml` y `CONTEXT_UI.md`

### Vista General

```
┌─────────────────────────────────────────────────────────────────────┐
│ BARRA SUPERIOR (toolbar_top) - CONFIGURABLE por módulo             │
│ [  ]  [  ]  [  ]  [  ]  [  ]     ← Cada módulo define sus iconos   │
├─────────────────────────────────────────────────────────────────┬───┤
│                                                                 │🧩│
│                                                                 │   │
│                                                                 │⚙️│
│                    ZONA CENTRAL                                 │   │ toolbar_right
│                    (chat-history)                               │🔔│ ECOSISTEMA
│                                                                 │   │ (estable)
│              ┌─────────────────────────────────┐                │👤│
│              │ 👤 Usuario                      │                │   │
│              │ 🤖 Asistente                    │                │   │
│              │ 👤 Usuario                      │                │   │
│              │ 🤖 Asistente                    │                │   │
│              └─────────────────────────────────┘                │   │
│                    (scroll vertical)                            │   │
│                                                                 │◀️│
├─────────────────────────────────────────────────────────────────┴───┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ toolbar_chat.top - FIJO (prepara mensaje)                   │    │
│  │ [🤖 Modelo] [🔑 Credencial] [📝 Prompt] [💬 Historial]      │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │ [Escribe aquí...]                                 [Enviar →]│    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │ toolbar_chat.bottom - FIJO (complementa mensaje)            │    │
│  │ [🔧 Tools] [📎 Adjuntar] [📋 Contexto] [🔌 Plugins]         │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Componentes FIJOS vs CONFIGURABLES

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   CONFIGURABLE (cada módulo define)        FIJO (nunca cambia)     │
│   ════════════════════════════════         ═══════════════════     │
│                                                                     │
│   ┌─────────────────────────┐              ┌─────────────────────┐  │
│   │     toolbar_top         │              │   toolbar_right     │  │
│   │   (iconos del módulo)   │              │   (ecosistema)      │  │
│   │   icons: []             │              │   🧩 Módulos        │  │
│   └─────────────────────────┘              │   ⚙️ Sistema        │  │
│                                            │   🔔 Alertas        │  │
│                                            │   👤 Perfil         │  │
│                                            └─────────────────────┘  │
│                                                                     │
│                                            ┌─────────────────────┐  │
│                                            │   toolbar_chat      │  │
│                                            │   (IA/Chat)         │  │
│                                            │                     │  │
│                                            │   TOP:              │  │
│                                            │   🤖 Modelo         │  │
│                                            │   🔑 Credencial     │  │
│                                            │   📝 Prompt         │  │
│                                            │   💬 Historial      │  │
│                                            │                     │  │
│                                            │   BOTTOM:           │  │
│                                            │   🔧 Tools          │  │
│                                            │   📎 Adjuntar       │  │
│                                            │   📋 Contexto       │  │
│                                            │   🔌 Plugins        │  │
│                                            └─────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

| Elemento | Tipo | Contenido |
|----------|------|-----------|
| **toolbar_top** | CONFIGURABLE | Definido por cada módulo |
| **toolbar_right** | FIJO | Ecosistema (módulos, config, alertas, perfil) |
| **toolbar_chat.top** | FIJO | Modelo, Credencial, Prompt, Historial |
| **toolbar_chat.bottom** | FIJO | Tools, Adjuntar, Contexto, Plugins |
| **input** | FIJO | Expandible con doble toque, Enter=newline |

---

### Estructura Sandwich del Chat (Detalle)

```
                    ANTES de escribir
                          ↓
┌─────────────────────────────────────────────────────────┐
│  [🤖]     [🔑]     [📝]     [💬]                        │  ← Configura
│  Modelo   API Key  Prompt   Historial                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [ Escribe aquí... ]                         [Enviar →] │  ← INPUT FIJO
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [🔧]     [📎]     [📋]     [🔌]                        │  ← Complementa
│  Tools    Adjuntar Contexto Plugins                     │
└─────────────────────────────────────────────────────────┘
                          ↑
                    DESPUÉS de escribir
```

**Flujo cognitivo natural:**
1. Miro arriba → ¿Qué modelo? ¿Qué prompt?
2. Escribo en el input
3. Miro abajo → ¿Adjunto algo? ¿Activo tools?
4. Envío

---

### Mapeo Iconos → Módulos Event Core

| Icono | Módulo Event Core | Paneles |
|-------|-------------------|---------|
| 🤖 Modelo | ai-gateway | modelo-selector, modelo-config, modelos-gestionar |
| 🔑 Credencial | credential-manager | credencial-selector, credencial-crear, credenciales-gestionar |
| 📝 Prompt | prompt-manager | prompts-rapidos, prompt-crear, prompts-gestionar |
| 💬 Historial | conversation-manager | conversaciones, historial-gestionar |
| 🔧 Tools | tool-orchestrator | tools-disponibles, tools-config |
| 📎 Adjuntar | storage-manager | adjuntar-archivo |
| 📋 Contexto | ai-agent-framework | contexto-actual, contexto-editar, contexto-gestionar |
| 🔌 Plugins | plugin-manager | plugins-activos, plugins-gestionar |

---

### Triple Interacción Estándar

Cada icono en las barras tiene 3 niveles de interacción:

| Gesto | Acción | Tamaño Panel | Uso |
|-------|--------|--------------|-----|
| **1 Toque** | Panel rápido (seleccionar) | small (30%) | 90% |
| **2 Toques** | Modal crear (nuevo item) | medium (50%) | 8% |
| **Long-press** | Modal gestión (editar/borrar) | full (80%) | 2% |

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   1 TOQUE          2 TOQUES          LONG-PRESS              │
│   ─────────        ─────────         ──────────              │
│   [🤖] →           [🤖][🤖] →        [🤖]━━━━━● →            │
│   Panel rápido     Modal crear       Modal gestión           │
│   (seleccionar)    (nuevo item)      (editar/borrar)         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Configuración de timing:**
```javascript
interaction: {
  tap: { delay: 300 },           // ms antes de confirmar single tap
  doubleTap: { maxDelay: 300 },  // ms máximo entre toques
  longPress: { duration: 500 }   // ms para activar
}
```

---

### Paneles Flotantes

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              ┌─────────────────────────┐                    │
│              │ 🤖 Selector de Modelo   │  ← Panel 30%       │
│              ├─────────────────────────┤                    │
│              │ ○ DeepSeek Chat      🔮 │                    │
│              │ ● GPT-4o             🤖 │                    │
│              │ ○ Claude 3.5         🧠 │                    │
│              │ ○ Llama 2 (local)    🦙 │                    │
│              └─────────────────────────┘                    │
│                                                             │
│  ─ ─ ─ ─ ─ Chat visible de fondo (blur) ─ ─ ─ ─ ─          │
│                                                             │
│  [🤖 Modelo] [🔑] [📝] [💬]                                 │
│  [input...]                                       [Enviar]  │
│  [🔧] [📎] [📋] [🔌]                                        │
└─────────────────────────────────────────────────────────────┘
```

**Comportamiento:**
- Aparecen SOBRE el contenido
- Chat/trabajo visible de fondo (blur opcional)
- Cerrar: tocar fuera O swipe down
- Nunca bloquean TODO - siempre hay contexto visible

**Z-Index Strategy:**
```
z-index: 10   → Zona central (chat/trabajo)
z-index: 100  → Barras flotantes
z-index: 200  → Panel rápido (1 toque)
z-index: 300  → Modal crear (2 toques)
z-index: 400  → Modal gestión (long-press)
z-index: 500  → Editor texto expandido
z-index: 999  → Overlays críticos (confirmaciones)
```

---

### Input de Texto

```
┌─────────────────────────────────────────┐
│  [Escribe aquí...]            [Enviar]  │
└─────────────────────────────────────────┘
```

**Comportamiento:**
- Tamaño FIJO pequeño (no crece automáticamente)
- Enter = salto de línea (NUNCA enviar)
- Ctrl/Cmd + Enter = enviar
- Doble toque = expande al 50% de pantalla

**Expansión (doble toque en input):**
```
┌─────────────────────────────────────────┐
│  ┌───────────────────────────────────┐  │
│  │  Texto completo editable          │  │  ← Ventana 50%
│  │  (scroll, edición cómoda)         │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Chat visible de fondo (50% inferior)   │
└─────────────────────────────────────────┘
```

---

### Eventos UI

**Publica:**
```javascript
// Mensaje enviado desde el chat
eventBus.publish('screen.chat.send', {
  message: string,
  context: object
});

// Acción en barra
eventBus.publish('screen.toolbar.action', {
  bar: 'top' | 'right' | 'chat-top' | 'chat-bottom',
  iconId: string,
  actionType: 'tap' | 'doubleTap' | 'longPress',
  target: string
});
```

**Escucha:**
```javascript
// Streaming de respuesta
eventBus.subscribe('ai.response.chunk', (chunk) => { /* streaming */ });

// Respuesta completa
eventBus.subscribe('ai.response.complete', (response) => { /* done */ });

// Eventos del módulo para mostrar en chat
eventBus.subscribe('module.event', (event) => { /* show in chat */ });
```

---

### Estructura de Archivos Frontend

```
frontend/src/lib/components/
├── ai/
│   ├── index.ts                    # Exports
│   ├── types.ts                    # Tipos compartidos
│   ├── ChatAIWorkspace.svelte      # Componente reutilizable principal
│   ├── ChatInput.svelte            # Input de chat
│   └── ConversationPanel.svelte    # Panel de conversaciones
│
├── layout/
│   └── MobileWorkspaceLayout.svelte  # Layout principal móvil
│
└── toolbar/
    ├── ToolbarIcon.svelte          # Icono con triple interacción
    ├── ChatToolbar.svelte          # Sub-barras del chat
    └── FloatingPanel.svelte        # Panel flotante genérico
```

---

### Uso en Módulos

Para crear un módulo con chat, solo hay que:

1. **Definir `toolbar_top`** con los iconos específicos del módulo
2. **Usar `ChatAIWorkspace`** como componente de chat
3. **Las barras de chat (toolbar_chat) son automáticas**

```yaml
# mi-modulo-screen.yaml
name: mi-modulo-screen
extends: mobile-chat-screen

toolbar_top:
  icons:
    - id: mi-accion
      icon: "📁"
      label: Mi Acción
      actions:
        tap: { type: panel, target: mi-panel }
```

---

*Última actualización: 2024-12-05*
*Versión: 1.1.0*
