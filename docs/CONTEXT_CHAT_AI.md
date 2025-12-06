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
│  │ [📎 Adjuntar] [🎤 Voz] [📷 Cámara] [📂 Explorar] [📁 Proy]  │    │
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
| **toolbar_chat.bottom** | FIJO | Adjuntar, Voz, Cámara, Explorar, Proyecto |
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
│  [📎]     [🎤]     [📷]     [📂]     [📁]              │  ← Complementa
│  Adjuntar Voz      Cámara   Explorar Proyecto          │
└─────────────────────────────────────────────────────────┘
                          ↑
                    DESPUÉS de escribir
```

**Flujo cognitivo natural:**
1. Miro arriba → ¿Qué modelo? ¿Qué prompt? ¿Historial?
2. Escribo en el input
3. Miro abajo → ¿Adjunto algo? ¿Dicto por voz? ¿Foto? ¿Exploro archivos?
4. Envío

---

### Mapeo Iconos → Módulos Event Core

| Icono | Módulo Event Core | Paneles |
|-------|-------------------|---------|
| 🤖 Modelo | ai-gateway | modelo-selector, modelo-config, proveedores-gestionar |
| 🔑 Credencial | credential-manager | credencial-selector, credencial-crear, credenciales-gestionar |
| 📝 Prompt | prompt-manager | prompts-rapidos, prompt-crear, prompts-gestionar |
| 💬 Historial | conversation-manager | conversaciones, historial-gestionar |
| 📁 Proyecto | project-manager | proyectos-selector, proyecto-crear, proyectos-gestionar |
| 📎 Adjuntar | storage-manager | adjuntar-archivo, subir-archivo, archivos-gestionar |
| 🎤 Voz | Web Speech API (nativo) | dictado, config-voz |
| 📷 Cámara | MediaDevices API (nativo) | capturar-foto, config-camara, galeria |
| 📂 Explorar | file-browser + pdf-viewer + text-editor | explorar-archivos, visor-editor, archivos-gestionar |

---

### Triple Interacción Estándar

> **Implementado en:** `ToolbarIcon.svelte` (ver CONTEXT_UI.md - Patrón 1)

Cada icono en las barras tiene 3 niveles de interacción:

| Gesto | Evento | Acción | Uso |
|-------|--------|--------|-----|
| **1 Toque** | `on:tap` | Panel rápido (seleccionar) | 90% |
| **2 Toques** | `on:doubleTap` | Modal crear (nuevo item) | 8% |
| **Long-press** | `on:longPress` | Modal gestión (editar/borrar) | 2% |

```svelte
<ToolbarIcon
  id="modelo"
  icon="🤖"
  displayValue={currentModel}
  on:tap={() => openPanel('modelo-selector')}
  on:doubleTap={() => openPanel('modelo-config')}
  on:longPress={() => openModal('modelos-gestionar')}
/>
```

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
│  [📎] [🎤] [📷] [📂] [📁]                                   │
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

### Componentes Base (CONTEXT_UI.md)

> **IMPORTANTE**: Todos los componentes de UI usan los patrones base definidos en `CONTEXT_UI.md`.

| Componente Base | Ubicación | Uso en Chat |
|-----------------|-----------|-------------|
| `ToolbarIcon` | `$components/toolbar/` | Iconos de toolbar con triple interacción |
| `FloatingPanel` | `$components/feedback/` | Paneles modales centrados |
| `ActionForm` | `$components/ui/` | Formularios de configuración |
| `SelectList` | `$components/ui/` | Selector de modelos, prompts, credenciales |
| `ToggleList` | `$components/ui/` | Activar/desactivar tools, plugins |

**Filosofía de componentes:**
- Padre controla TODO vía CSS variables
- Zero hardcoding
- Tamaño compacto por defecto
- Eventos consistentes (tap, doubleTap, longPress)

---

### Estructura de Archivos Frontend

```
frontend/src/lib/components/
├── ui/                             # COMPONENTES BASE (CONTEXT_UI.md)
│   ├── ActionForm.svelte           # Formularios dinámicos
│   ├── SelectList.svelte           # Lista selección única (acordeón)
│   └── ToggleList.svelte           # Lista selección múltiple
│
├── toolbar/
│   └── ToolbarIcon.svelte          # Icono con triple interacción
│
├── feedback/
│   └── FloatingPanel.svelte        # Panel flotante centrado
│
├── ai/                             # COMPONENTES ESPECÍFICOS CHAT
│   ├── index.ts                    # Exports
│   ├── types.ts                    # Tipos compartidos
│   ├── ChatAIWorkspace.svelte      # Workspace principal (usa base)
│   ├── ChatInput.svelte            # Input de chat
│   └── ConversationPanel.svelte    # Panel de conversaciones
│
└── layout/
    └── MobileWorkspaceLayout.svelte  # Layout principal (usa ToolbarIcon)
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

## Especificación de Botones - toolbar_chat

> Documentación exhaustiva de cada botón con APIs, eventos y paneles de interacción.

---

### Botón 🤖 Modelo (ai-gateway)

**Módulo**: `ai-gateway`
**Versión**: 1.0.0
**Responsabilidad**: Router unificado para múltiples proveedores LLM con fallback automático.
**Ubicación**: `toolbar_chat.top` (primer botón)

#### Importancia

El modelo es el **cerebro** de cada conversación:
- Define qué LLM procesa los mensajes
- Configura parámetros de generación (temperature, max_tokens)
- Permite fallback automático entre proveedores
- Gestiona costos y uso por proveedor

```
🤖 Modelo → ai-gateway
     │
     ├── 🔄 Auto-fallback: DeepSeek → Anthropic → OpenAI → Ollama
     ├── 💰 Cost tracking por proveedor
     ├── ⚡ Rate limiting y retry con backoff
     └── 📊 Usage analytics
```

#### APIs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/chat` | Chat completion (sync con fallback) |
| POST | `/chat/stream` | Chat completion con SSE streaming |
| GET | `/providers` | Listar proveedores y estado |
| GET | `/models` | Listar modelos por proveedor |
| GET | `/models?provider=X` | Modelos de un proveedor específico |
| GET | `/usage` | Estadísticas de uso y costos |
| GET | `/usage?provider=X` | Uso de un proveedor específico |
| POST | `/providers/test` | Probar conectividad de proveedor |

#### Eventos

**Escucha:**
| Evento | Acción |
|--------|--------|
| `ai.request` | Procesa solicitud de IA desde otros módulos |

**Publica:**
| Evento | Cuándo |
|--------|--------|
| `ai.completion.completed` | Respuesta del LLM recibida |
| `ai.chat.response` | Alias de completion |
| `ai.chat.error` | Error en la llamada |

#### Proveedores Soportados

| Proveedor | Prioridad | Modelos | Costo/1K tokens |
|-----------|-----------|---------|-----------------|
| DeepSeek | 1 (más barato) | deepseek-chat, deepseek-coder | $0.0001 / $0.0002 |
| Anthropic | 2 | claude-3-5-sonnet, claude-3-opus | $0.003 / $0.015 |
| OpenAI | 3 | gpt-4o, gpt-4o-mini, gpt-3.5-turbo | $0.0015 / $0.006 |
| Ollama | 4 (local) | llama2, codellama, mistral, mixtral | $0 (local) |

#### Triple Interacción

##### 1 TAP → Panel Selector de Modelo (30%)

```
┌─────────────────────────────────────────┐
│ 🤖 Modelo Activo                        │
├─────────────────────────────────────────┤
│                                         │
│  Proveedor: Anthropic  ▼                │
│  ─────────────────────────────────────  │
│                                         │
│  ● claude-3-5-sonnet-20241022    ✅     │
│    Recomendado | $0.003/1K              │
│                                         │
│  ○ claude-3-opus-20240229              │
│    Más potente | $0.015/1K              │
│                                         │
│  ○ claude-3-haiku-20240307             │
│    Más rápido | $0.00025/1K             │
│                                         │
│  ─────────────────────────────────────  │
│  [🔄 Auto]  Usa prioridad por costo     │
│                                         │
└─────────────────────────────────────────┘
```

**Datos mostrados:**
- Proveedor actual (dropdown para cambiar)
- Lista de modelos del proveedor
- ● = Modelo seleccionado
- Costo por 1K tokens
- Indicadores: Recomendado, Rápido, Potente

**Acciones:**
- Cambiar proveedor → Recarga lista de modelos
- Tap en modelo → Lo selecciona para la conversación
- [🔄 Auto] → Activa fallback automático por prioridad

##### 2 TAPS → Modal Configuración (50%)

```
┌─────────────────────────────────────────────────────┐
│ 🤖 Configurar Modelo                          [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ─── Selección de Modelo ───                        │
│                                                     │
│  Modo: ○ Auto (fallback)  ● Manual                  │
│                                                     │
│  Proveedor *                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ ▼ Anthropic                                 │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Modelo *                                           │
│  ┌─────────────────────────────────────────────┐   │
│  │ ▼ claude-3-5-sonnet-20241022                │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ─── Parámetros de Generación ───                   │
│                                                     │
│  Temperature           [0.7]  ─────●───── 0-2       │
│  (Creatividad)                                      │
│                                                     │
│  Max Tokens            [4096] ───●──────── 100-8K   │
│  (Longitud máxima)                                  │
│                                                     │
│  Top P                 [1.0]  ──────────●─ 0-1      │
│  (Nucleus sampling)                                 │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │           💾 Guardar Configuración          │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  □ Aplicar a todas las conversaciones nuevas       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Validaciones:**
- Temperature: 0.0 - 2.0 (default 0.7)
- Max Tokens: 100 - 8192 (según modelo)
- Top P: 0.0 - 1.0 (default 1.0)

**Evento al guardar:** Actualiza `conversation.ai_settings`

##### LONG-PRESS → Modal Gestión de Proveedores (80%)

```
┌─────────────────────────────────────────────────────────────────┐
│ 🤖 Gestionar Proveedores                                  [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Ordenar: [Prioridad ▼]  [🔍 Buscar modelo...]                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🥇 DeepSeek                              ✅ Disponible         │
│     Prioridad: 1 | Requests: 150 | Tokens: 45K | $0.45         │
│     Modelos: deepseek-chat, deepseek-coder                     │
│     [🧪 Test] [📊 Stats] [⬆️⬇️ Prioridad]                      │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🥈 Anthropic                             ✅ Disponible         │
│     Prioridad: 2 | Requests: 89 | Tokens: 120K | $12.50        │
│     Modelos: claude-3-5-sonnet, claude-3-opus, claude-3-haiku  │
│     [🧪 Test] [📊 Stats] [⬆️⬇️ Prioridad]                      │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🥉 OpenAI                                ⚠️ Sin API Key        │
│     Prioridad: 3 | Requests: 0 | Tokens: 0 | $0.00             │
│     Modelos: gpt-4o, gpt-4o-mini, gpt-3.5-turbo                │
│     [🔑 Configurar Key] [📊 Stats]                              │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🏠 Ollama (Local)                        ✅ Disponible         │
│     Prioridad: 4 | Requests: 25 | Tokens: 8K | $0.00           │
│     Modelos: llama2, codellama, mistral, mixtral               │
│     [🧪 Test] [📊 Stats] [⬆️⬇️ Prioridad]                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📊 Totales: 264 requests | 173K tokens | $12.95               │
│                                                                 │
│  [🔄 Refrescar]                    [📈 Dashboard completo]      │
└─────────────────────────────────────────────────────────────────┘
```

**Acciones por proveedor:**
- 🧪 Test → Prueba conectividad (POST /providers/test)
- 📊 Stats → Ver estadísticas detalladas
- ⬆️⬇️ Prioridad → Cambiar orden de fallback
- 🔑 Configurar Key → Abre modal de credential-manager

**Indicadores de estado:**
- ✅ Disponible: API key configurada y funcional
- ⚠️ Sin API Key: Necesita configuración
- ❌ Error: Fallo en conectividad/autenticación

#### Integración con conversation-manager

El modelo seleccionado se guarda en `conversation.ai_settings`:

```javascript
{
  conversation_id: "conv_abc123",
  ai_settings: {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.7,
    max_tokens: 4096,
    top_p: 1.0
  }
}
```

#### Flujo de Fallback Automático

```
Usuario envía mensaje
        │
        ▼
   ai-gateway
        │
        ├─► Intenta: DeepSeek (prioridad 1)
        │   └─ ❌ Error/No disponible
        │
        ├─► Intenta: Anthropic (prioridad 2)
        │   └─ ✅ Éxito → Responde
        │
        └─► Si todos fallan:
            └─ ai.chat.error + mensaje al usuario
```

---

### Botón 🔑 Credencial (credential-manager)

**Módulo**: `credential-manager`
**Versión**: 2.0.0
**Responsabilidad**: Gestión multi-nivel de API keys con resolución en cascada.

#### APIs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/credentials` | Guardar credencial (provider, level, identifier, api_key) |
| GET | `/credentials/resolve?provider=X` | Resolver credencial por cascada |
| GET | `/credentials` | Listar credenciales (masked) |
| PUT | `/credentials/:key` | Actualizar api_key |
| DELETE | `/credentials/:key` | Eliminar credencial |
| GET | `/credentials/levels` | Niveles disponibles con prioridad |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas del módulo |

#### Eventos

**Escucha:**
| Evento | Acción |
|--------|--------|
| `credential.resolve.request` | Resuelve credencial y responde |

**Publica:**
| Evento | Cuándo |
|--------|--------|
| `credential.saved` | Nueva credencial guardada |
| `credential.updated` | Credencial actualizada |
| `credential.deleted` | Credencial eliminada |
| `credential.resolved` | Resolución exitosa |
| `credential.resolve.failed` | No se encontró credencial |
| `credential.resolve.response` | Respuesta a request |

#### Niveles de Prioridad

```
Prioridad    Nivel      Requiere ID    Descripción
─────────────────────────────────────────────────────
    1        CUSTOM        Sí          Específico personalizado
    2        CLIENT        Sí          Por cliente
    3        PROJECT       Sí          Por proyecto
    4        GLOBAL        No          Fallback global
```

**Formato de Key**: `{PROVIDER}_API_KEY_{LEVEL}[_{IDENTIFIER}]`
```
OPENAI_API_KEY_GLOBAL
ANTHROPIC_API_KEY_PROJECT_proj123
DEEPSEEK_API_KEY_CLIENT_client456
```

#### Triple Interacción

##### 1 TAP → Panel Selector (30%)

```
┌─────────────────────────────────────────┐
│ 🔑 Credenciales Activas                 │
├─────────────────────────────────────────┤
│                                         │
│  Proveedor      Nivel      Estado       │
│  ─────────────────────────────────────  │
│  ● Anthropic    PROJECT    ✅ Activa    │
│  ○ OpenAI       GLOBAL     ✅ Activa    │
│  ○ DeepSeek     ---        ⚠️ Sin key   │
│  ○ Ollama       LOCAL      ✅ Activa    │
│                                         │
│  ─────────────────────────────────────  │
│  Resolución: CUSTOM→CLIENT→PROJECT→GLOBAL│
│                                         │
└─────────────────────────────────────────┘
```

**Datos mostrados:**
- Lista de proveedores conocidos
- Nivel desde el que se resuelve cada uno
- Estado: ✅ Activa, ⚠️ Sin key, ❌ Error
- Indicador visual del nivel activo

**Acciones:**
- Tap en proveedor → Ver detalles/preview de la key
- Cambiar nivel activo (si hay múltiples)

##### 2 TAPS → Modal Crear (50%)

```
┌─────────────────────────────────────────────────────┐
│ 🔑 Nueva Credencial                           [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Proveedor *                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ ▼ Seleccionar proveedor...                  │   │
│  │   ○ Anthropic                               │   │
│  │   ○ OpenAI                                  │   │
│  │   ○ DeepSeek                                │   │
│  │   ○ Ollama                                  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Nivel *                                            │
│  ┌─────────────────────────────────────────────┐   │
│  │ ○ GLOBAL    (fallback para todo)            │   │
│  │ ○ PROJECT   (solo este proyecto)            │   │
│  │ ○ CLIENT    (solo este cliente)             │   │
│  │ ○ CUSTOM    (personalizado)                 │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Identificador (si nivel ≠ GLOBAL)                  │
│  ┌─────────────────────────────────────────────┐   │
│  │ proj_abc123                                 │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  API Key *                                          │
│  ┌─────────────────────────────────────────────┐   │
│  │ sk-ant-api03-...                        👁️  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              💾 Guardar Credencial          │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ⚠️ La API key se guarda en .env (no en DB)        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Validaciones:**
- Proveedor obligatorio
- Nivel obligatorio
- Identificador obligatorio si nivel ≠ GLOBAL
- API Key obligatoria y no vacía

**Evento al guardar:** `credential.saved`

##### LONG-PRESS → Modal Gestión (80%)

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔑 Gestionar Credenciales                                 [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Filtros:  [Todos ▼]  [Anthropic ▼]  [🔍 Buscar...]            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GLOBAL                                                         │
│  ├── OPENAI_API_KEY_GLOBAL                                      │
│  │   sk-...************abcd    ✅    [✏️] [🗑️] [🧪]            │
│  ├── ANTHROPIC_API_KEY_GLOBAL                                   │
│  │   sk-ant-...********1234    ✅    [✏️] [🗑️] [🧪]            │
│  └── DEEPSEEK_API_KEY_GLOBAL                                    │
│      sk-...************5678    ✅    [✏️] [🗑️] [🧪]            │
│                                                                 │
│  PROJECT                                                        │
│  ├── ANTHROPIC_API_KEY_PROJECT_proj123                          │
│  │   sk-ant-...********wxyz    ✅    [✏️] [🗑️] [🧪]            │
│  └── OPENAI_API_KEY_PROJECT_proj456                             │
│      sk-...************9999    ⚠️    [✏️] [🗑️] [🧪]            │
│                                                                 │
│  CLIENT                                                         │
│  └── DEEPSEEK_API_KEY_CLIENT_client789                          │
│      sk-...************0000    ✅    [✏️] [🗑️] [🧪]            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📊 Total: 6 credenciales | GLOBAL: 3 | PROJECT: 2 | CLIENT: 1 │
│                                                                 │
│  [+ Nueva Credencial]                      [🔄 Recargar .env]   │
└─────────────────────────────────────────────────────────────────┘
```

**Acciones por credencial:**
- ✏️ Editar → Actualizar API key (PUT /credentials/:key)
- 🗑️ Eliminar → Confirmar y borrar (DELETE /credentials/:key)
- 🧪 Test → Probar conectividad (POST /providers/test vía ai-gateway)

**Acciones globales:**
- + Nueva Credencial → Abre modal crear
- 🔄 Recargar .env → Re-lee archivo de credenciales

#### Integración con ai-gateway

El `credential-manager` se integra con `ai-gateway` así:

```
ai-gateway                          credential-manager
    │                                      │
    │  credential.resolve.request          │
    │  {provider, project_id, client_id}   │
    │ ────────────────────────────────────►│
    │                                      │
    │                                      │ Cascada:
    │                                      │ CUSTOM→CLIENT→PROJECT→GLOBAL
    │                                      │
    │  credential.resolve.response         │
    │  {success, api_key, resolved_from}   │
    │ ◄────────────────────────────────────│
    │                                      │
```

---

### Botón 📝 Prompt (prompt-manager)

**Módulo**: `prompt-manager`
**Responsabilidad**: Gestión de prompts con versionado, templates y analytics.

#### APIs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/prompts` | Crear prompt (name, content, variables, tags) |
| GET | `/prompts` | Listar prompts (?tag=X&search=Y) |
| GET | `/prompts/:id` | Obtener prompt completo |
| PUT | `/prompts/:id` | Actualizar (auto-versiona si content cambia) |
| DELETE | `/prompts/:id` | Eliminar prompt |
| GET | `/prompts/:id/versions` | Historial de versiones |
| POST | `/prompts/:id/render` | Renderizar template con variables |
| GET | `/analytics` | Analytics de uso (?prompt_id=X&days=N) |
| POST | `/prompts/compare` | Comparar prompts (A/B testing) |

#### Eventos

**Escucha (via hook):**
| Evento | Acción |
|--------|--------|
| `ai.*.completed` | Registra analytics (tokens, latency, cost) |

**No publica eventos directamente** - opera vía HTTP.

#### Características

- **Versionado automático**: Cada cambio en `content` crea nueva versión
- **Templates**: Variables con sintaxis `{{variable}}`
- **Max versiones**: Configurable (default 10)
- **Analytics**: Tokens, latencia, costos por prompt
- **A/B Testing**: Comparar rendimiento entre prompts

#### Estructura de Prompt

```javascript
{
  id: "abc123",
  name: "chat-assistant",
  title: "Asistente de Chat",
  description: "Prompt para conversación general",
  content: "Eres un asistente {{tone}}. Responde en {{language}}.",
  variables: ["tone", "language"],
  tags: ["chat", "general"],
  versions: [
    { version: "1.0.0", content: "...", created_at: "..." }
  ],
  current_version: "1.0.0",
  created_at: "...",
  updated_at: "..."
}
```

#### Triple Interacción

##### 1 TAP → Panel Selector Rápido (30%)

```
┌─────────────────────────────────────────┐
│ 📝 Prompts Recientes                    │
├─────────────────────────────────────────┤
│                                         │
│  ● Chat General           v1.2.0   ⭐   │
│  ○ Asistente Técnico      v2.0.0        │
│  ○ Traductor              v1.0.0        │
│  ○ Código Review          v3.1.0        │
│                                         │
│  ─────────────────────────────────────  │
│  Tags: [chat] [código] [traducción]     │
│                                         │
│  [🔍 Buscar...]                         │
│                                         │
└─────────────────────────────────────────┘
```

**Datos mostrados:**
- Prompts ordenados por uso reciente
- Versión actual
- ⭐ = Prompt activo en conversación actual
- Filtro rápido por tags

**Acciones:**
- Tap en prompt → Lo aplica a la conversación
- Tap en tag → Filtra por ese tag

##### 2 TAPS → Modal Crear (50%)

```
┌─────────────────────────────────────────────────────┐
│ 📝 Nuevo Prompt                               [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Nombre *                                           │
│  ┌─────────────────────────────────────────────┐   │
│  │ mi-prompt-personalizado                     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Título                                             │
│  ┌─────────────────────────────────────────────┐   │
│  │ Mi Prompt Personalizado                     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Contenido *                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ Eres un {{role}} experto en {{domain}}.     │   │
│  │ Tu objetivo es {{objective}}.               │   │
│  │                                             │   │
│  │ Responde siempre en {{language}}.           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Variables detectadas: role, domain, objective,    │
│                        language                     │
│                                                     │
│  Tags (separados por coma)                         │
│  ┌─────────────────────────────────────────────┐   │
│  │ custom, asistente                           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              💾 Crear Prompt                │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Validaciones:**
- Nombre único obligatorio
- Contenido obligatorio
- Variables auto-detectadas de `{{var}}`

##### LONG-PRESS → Modal Gestión (80%)

```
┌─────────────────────────────────────────────────────────────────┐
│ 📝 Gestionar Prompts                                      [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Filtros: [Todos ▼] [🏷️ chat ▼]  [🔍 Buscar...]                │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📝 Chat General                                    v1.2.0      │
│     "Eres un asistente amable..."                              │
│     Tags: chat, general                                         │
│     Usos: 245 | Tokens avg: 850 | ⭐ 4.5                        │
│     [✏️ Editar] [📋 Duplicar] [📊 Stats] [🗑️]                  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📝 Asistente Técnico                               v2.0.0      │
│     "Eres un experto en desarrollo..."                         │
│     Tags: código, técnico                                       │
│     Usos: 189 | Tokens avg: 1200 | ⭐ 4.8                       │
│     [✏️ Editar] [📋 Duplicar] [📊 Stats] [🗑️]                  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📝 Traductor                                       v1.0.0      │
│     "Traduce el siguiente texto a {{lang}}..."                 │
│     Tags: traducción, idiomas                                   │
│     Usos: 56 | Tokens avg: 400 | ⭐ 4.2                         │
│     [✏️ Editar] [📋 Duplicar] [📊 Stats] [🗑️]                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📊 Total: 12 prompts | Usos hoy: 45 | Tokens: 38K             │
│                                                                 │
│  [+ Nuevo Prompt]              [📊 Analytics] [🔬 A/B Test]    │
└─────────────────────────────────────────────────────────────────┘
```

**Acciones por prompt:**
- ✏️ Editar → Abre editor (nuevo version si cambia content)
- 📋 Duplicar → Crea copia con nombre-copy
- 📊 Stats → Ver analytics detallado
- 🗑️ Eliminar → Confirmar y borrar

**Acciones globales:**
- + Nuevo Prompt → Abre modal crear
- 📊 Analytics → Dashboard de analytics
- 🔬 A/B Test → Comparar 2 prompts

#### Renderizado de Templates

```javascript
// POST /prompts/:id/render
{
  variables: {
    role: "programador",
    domain: "Python",
    objective: "ayudar con código",
    language: "español"
  }
}

// Resultado:
{
  rendered: "Eres un programador experto en Python. Tu objetivo es ayudar con código. Responde siempre en español."
}
```

---

### Botón 💬 Historial (conversation-manager)

**Módulo**: `conversation-manager`
**Versión**: 1.0.0
**Responsabilidad**: Gestión de conversaciones, mensajes y contexto para IA.

#### APIs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/conversations` | Crear conversación (project_id, title, system_prompt, ai_settings) |
| GET | `/conversations` | Listar conversaciones (?project_id=X) |
| GET | `/conversations/:id` | Obtener con mensajes y contexto de proyecto |
| PUT | `/conversations/:id` | Actualizar (title, system_prompt, model, etc.) |
| DELETE | `/conversations/:id` | Eliminar conversación y mensajes |
| POST | `/conversations/:id/messages` | Enviar mensaje → obtener respuesta IA |
| GET | `/conversations/:id/messages` | Obtener mensajes (?limit=N&offset=M) |
| GET | `/conversations/:id/context` | Contexto completo (project + conversation) |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas del módulo |

#### Eventos

**Escucha:**
| Evento | Acción |
|--------|--------|
| `db.query.response` | Respuesta de database-manager |
| `ai.chat.response` | Respuesta de ai-gateway |
| `project.get.response` | Contexto de project-manager |
| `storage.info.response` | Info de storage-manager |
| `conversation.get.request` | Query de conversación |
| `conversation.list.request` | Query lista |
| `message.list.request` | Query mensajes |
| `conversation.send.request` | Enviar mensaje vía evento |

**Publica:**
| Evento | Cuándo |
|--------|--------|
| `conversation.created` | Nueva conversación |
| `conversation.updated` | Metadata actualizada |
| `conversation.deleted` | Conversación eliminada |
| `message.sent` | Mensaje de usuario guardado |
| `message.received` | Respuesta de IA recibida |

#### Características

- **Context Window**: Últimos N mensajes (configurable por conversación)
- **AI Settings por conversación**: provider, model, temperature, max_tokens
- **Attachments**: Referencia a archivos en storage-manager
- **Cost Tracking**: Tokens y costos por mensaje
- **Project Context**: Carga metadata y storage del proyecto

#### Triple Interacción

##### 1 TAP → Panel Conversaciones Recientes (30%)

```
┌─────────────────────────────────────────┐
│ 💬 Conversaciones                       │
├─────────────────────────────────────────┤
│                                         │
│  ● Diseño API REST            hace 2h   │
│    45 msgs | Claude 3.5 | $0.15        │
│                                         │
│  ○ Debug módulo auth          hace 1d   │
│    23 msgs | GPT-4o | $0.08            │
│                                         │
│  ○ Refactor database          hace 3d   │
│    12 msgs | DeepSeek | $0.01          │
│                                         │
│  ─────────────────────────────────────  │
│  Proyecto: [Mi Proyecto ▼]              │
│                                         │
│  [+ Nueva conversación]                 │
│                                         │
└─────────────────────────────────────────┘
```

**Datos mostrados:**
- Conversaciones ordenadas por updated_at
- Conteo de mensajes, modelo usado, costo total
- ● = Conversación activa actual
- Filtro por proyecto

**Acciones:**
- Tap en conversación → La carga en el chat
- Filtrar por proyecto
- + Nueva conversación

##### 2 TAPS → Modal Crear Conversación (50%)

```
┌─────────────────────────────────────────────────────┐
│ 💬 Nueva Conversación                         [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Proyecto *                                         │
│  ┌─────────────────────────────────────────────┐   │
│  │ ▼ Mi Proyecto Actual                        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Título                                             │
│  ┌─────────────────────────────────────────────┐   │
│  │ Nueva conversación                          │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  System Prompt (opcional)                           │
│  ┌─────────────────────────────────────────────┐   │
│  │ Eres un asistente experto en...             │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ─── Configuración IA (opcional) ───               │
│                                                     │
│  Modelo: [Auto ▼]  Temp: [0.7]  MaxTokens: [2000] │
│                                                     │
│  Context Window: [20] mensajes                     │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │           💬 Crear Conversación             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Validaciones:**
- Proyecto obligatorio
- Título auto-generado si vacío

**Evento al crear:** `conversation.created`

##### LONG-PRESS → Modal Gestión (80%)

```
┌─────────────────────────────────────────────────────────────────┐
│ 💬 Gestionar Conversaciones                               [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Proyecto: [Todos ▼]  Ordenar: [Recientes ▼]  [🔍 Buscar...]   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  💬 Diseño API REST                                   hace 2h   │
│     Proyecto: Mi Proyecto | 45 msgs                            │
│     Claude 3.5 Sonnet | Tokens: 12.5K | $0.15                  │
│     [📖 Abrir] [✏️ Editar] [📤 Exportar] [🗑️]                  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  💬 Debug módulo auth                                  hace 1d  │
│     Proyecto: Mi Proyecto | 23 msgs                            │
│     GPT-4o | Tokens: 8.2K | $0.08                              │
│     [📖 Abrir] [✏️ Editar] [📤 Exportar] [🗑️]                  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  💬 Refactor database                                  hace 3d  │
│     Proyecto: Otro Proyecto | 12 msgs                          │
│     DeepSeek | Tokens: 3.1K | $0.01                            │
│     [📖 Abrir] [✏️ Editar] [📤 Exportar] [🗑️]                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📊 Total: 15 conversaciones | 234 msgs | $1.25                │
│                                                                 │
│  [+ Nueva]                    [🗑️ Limpiar antiguas] [📊 Stats] │
└─────────────────────────────────────────────────────────────────┘
```

**Acciones por conversación:**
- 📖 Abrir → Cargar en chat
- ✏️ Editar → Cambiar título, system prompt, settings
- 📤 Exportar → JSON/Markdown
- 🗑️ Eliminar → Confirmar y borrar

**Acciones globales:**
- + Nueva → Modal crear
- 🗑️ Limpiar antiguas → Eliminar >30 días
- 📊 Stats → Dashboard de uso

#### Flujo de Mensaje

```
Usuario escribe mensaje
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ message.sent    │────►│ Guardar en DB   │
└─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Cargar contexto │────►│ project-manager │
│ (N mensajes)    │     │ storage-manager │
└─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ ai.chat.request │────►│   ai-gateway    │
└─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ ai.chat.response│────►│ Guardar en DB   │
└─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ message.received│────► Frontend (MQTT)
└─────────────────┘
```

---

## Especificación de Botones - toolbar_top

> Botones CONFIGURABLES por módulo. El botón Proyecto es esencial para módulos con chat.

---

### Botón 📁 Proyecto (project-manager)

**Módulo**: `project-manager`
**Versión**: 1.0.0
**Responsabilidad**: Ciclo de vida de proyectos con aislamiento de DB y storage.
**Ubicación**: `toolbar_top` (primer botón recomendado)

#### Importancia

El proyecto es el **contexto raíz** de toda la aplicación:
- Cada proyecto tiene su propia **base de datos** (database-manager)
- Cada proyecto tiene su propio **storage** (storage-manager)
- Las conversaciones pertenecen a un proyecto
- Las credenciales pueden ser por proyecto (nivel PROJECT)

```
📁 Proyecto
     │
     ├── 🗄️ database-manager (SQLite aislada)
     ├── 📦 storage-manager (archivos aislados)
     ├── 💬 conversation-manager (filtrado por proyecto)
     └── 🔑 credential-manager (nivel PROJECT)
```

#### APIs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/projects` | Crear proyecto (name, description, metadata) |
| GET | `/projects` | Listar proyectos + active_project_id |
| GET | `/projects/:id` | Obtener proyecto |
| PUT | `/projects/:id` | Actualizar (name, description, metadata) |
| DELETE | `/projects/:id` | Eliminar (no puede ser el activo) |
| POST | `/projects/:id/activate` | Activar proyecto |
| GET | `/projects/active` | Obtener proyecto activo |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas |

#### Eventos

**Escucha:**
| Evento | Acción |
|--------|--------|
| `db.query.response` | Respuesta de database-manager |
| `project.get.request` | Query de proyecto |
| `project.list.request` | Query lista |
| `project.active.request` | Query proyecto activo |

**Publica:**
| Evento | Cuándo | Reacción |
|--------|--------|----------|
| `project.created` | Nuevo proyecto | → storage-manager crea carpeta |
| `project.updated` | Metadata actualizada | |
| `project.deleted` | Proyecto eliminado | → storage-manager elimina carpeta |
| `project.activated` | Proyecto activado | → UI actualiza contexto |
| `project.deactivated` | Proyecto desactivado | |

#### Cadena de Eventos al Crear Proyecto

```
POST /projects {name: "Mi Proyecto"}
         │
         ▼
   project-manager
         │
         ├─► db.query.request (INSERT INTO projects)
         │         │
         │         ▼
         │   database-manager
         │         │
         │         ▼
         │   db.query.response
         │
         ├─► project.created {project_id, name}
         │         │
         │         ├──────────────────────────────┐
         │         ▼                              ▼
         │   storage-manager                database-manager
         │   (crea carpeta)                (crea DB proyecto)
         │         │                              │
         │         ▼                              ▼
         │   storage.created              db.created
         │
         └─► Respuesta HTTP: {success, project}
```

#### Triple Interacción

##### 1 TAP → Panel Selector de Proyecto (30%)

```
┌─────────────────────────────────────────┐
│ 📁 Proyectos                            │
├─────────────────────────────────────────┤
│                                         │
│  ● Mi Asistente IA              activo  │
│    5 conversaciones | 2.5 MB           │
│                                         │
│  ○ Proyecto Cliente ABC                 │
│    12 conversaciones | 15 MB           │
│                                         │
│  ○ Experimentos LLM                     │
│    3 conversaciones | 500 KB           │
│                                         │
│  ─────────────────────────────────────  │
│  [+ Nuevo proyecto]                     │
│                                         │
└─────────────────────────────────────────┘
```

**Datos mostrados:**
- Proyectos ordenados por updated_at
- ● = Proyecto activo
- Conteo de conversaciones
- Uso de storage

**Acciones:**
- Tap en proyecto → Lo activa (project.activated)
- + Nuevo proyecto → Modal crear

##### 2 TAPS → Modal Crear Proyecto (50%)

```
┌─────────────────────────────────────────────────────┐
│ 📁 Nuevo Proyecto                             [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Nombre *                                           │
│  ┌─────────────────────────────────────────────┐   │
│  │ Mi Nuevo Proyecto                           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Descripción                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ Proyecto para experimentos con Claude...    │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ─── Configuración por defecto (opcional) ───      │
│                                                     │
│  Proveedor: [Auto ▼]  Modelo: [Auto ▼]             │
│                                                     │
│  □ Activar inmediatamente                          │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              📁 Crear Proyecto              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ⚠️ Se creará DB y storage aislados               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Validaciones:**
- Nombre obligatorio y único
- Descripción opcional

**Eventos al crear:**
1. `project.created` → storage-manager + database-manager reaccionan
2. Si "Activar inmediatamente": `project.activated`

##### LONG-PRESS → Modal Gestión (80%)

```
┌─────────────────────────────────────────────────────────────────┐
│ 📁 Gestionar Proyectos                                    [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Ordenar: [Recientes ▼]  [🔍 Buscar...]                        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📁 Mi Asistente IA                              ⭐ ACTIVO     │
│     Creado: 01/11/2024 | Actualizado: hace 2h                  │
│     💬 5 conversaciones | 📦 2.5 MB | 💰 $1.50                 │
│     [✏️ Editar] [📊 Stats] [📤 Exportar]                       │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📁 Proyecto Cliente ABC                                        │
│     Creado: 15/10/2024 | Actualizado: hace 1d                  │
│     💬 12 conversaciones | 📦 15 MB | 💰 $5.20                 │
│     [▶️ Activar] [✏️ Editar] [📊 Stats] [📤 Exportar] [🗑️]    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📁 Experimentos LLM                                            │
│     Creado: 20/09/2024 | Actualizado: hace 1w                  │
│     💬 3 conversaciones | 📦 500 KB | 💰 $0.30                 │
│     [▶️ Activar] [✏️ Editar] [📊 Stats] [📤 Exportar] [🗑️]    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📊 Total: 3 proyectos | 20 conversaciones | 18 MB | $7.00     │
│                                                                 │
│  [+ Nuevo]                               [📥 Importar proyecto] │
└─────────────────────────────────────────────────────────────────┘
```

**Acciones por proyecto:**
- ▶️ Activar → Activa el proyecto (project.activated)
- ✏️ Editar → Cambiar nombre, descripción
- 📊 Stats → Dashboard de uso del proyecto
- 📤 Exportar → Exportar proyecto completo (DB + storage)
- 🗑️ Eliminar → Solo si NO está activo (confirmar)

**Nota:** El proyecto activo NO puede eliminarse directamente.

**Acciones globales:**
- + Nuevo → Modal crear
- 📥 Importar proyecto → Cargar proyecto exportado

#### Estructura de Proyecto

```javascript
{
  id: "proj_abc123",
  name: "Mi Asistente IA",
  description: "Asistente para desarrollo",
  created_at: "2024-11-01T10:00:00Z",
  updated_at: "2024-12-05T14:30:00Z",
  is_active: true,
  metadata: {
    default_provider: "anthropic",
    default_model: "claude-3-5-sonnet",
    tags: ["desarrollo", "IA"]
  }
}
```

#### Almacenamiento por Proyecto

```
data/
├── projects/
│   └── {project_id}/
│       └── database.sqlite    ← database-manager
│
└── storage/
    └── {project_id}/
        ├── uploads/           ← storage-manager
        ├── exports/
        ├── temp/
        └── files/
```

---

## Especificación de Botones - toolbar_chat.bottom

> Botones FIJOS para funcionalidades auxiliares del chat.

---

### Botón 🔧 Tools (tool-orchestrator) - DEPRECADO

> ⚠️ **DEPRECADO**: Este botón ha sido removido de la interfaz de usuario.
> El tool-orchestrator sigue funcionando internamente para AI agents,
> pero no requiere interacción directa del usuario en el chat.

**Módulo**: `tool-orchestrator`
**Versión**: 2.0.0
**Responsabilidad**: Orquestar tool calls entre AI y proveedores de herramientas.
**Ubicación**: ~~`toolbar_chat.bottom`~~ (removido)

#### Qué es Tool Calling

Cuando el LLM necesita ejecutar una acción (buscar info, ejecutar código, etc.):

```
Usuario: "¿Qué hora es en Tokyo?"
         │
         ▼
   ai-gateway (LLM)
         │
         │  tool_call: {name: "get_time", args: {city: "Tokyo"}}
         ▼
   tool-orchestrator
         │
         ├─► Valida args con JSON Schema
         ├─► Ejecuta handler con timeout
         └─► Retorna resultado al LLM
         │
         ▼
   ai-gateway (LLM continúa)
         │
         ▼
   "Son las 3:45 AM en Tokyo"
```

#### APIs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/tools` | Listar tools registradas |
| GET | `/tools/:name` | Obtener tool específica |
| POST | `/tools/:name/call` | Ejecutar tool manualmente |
| POST | `/tools/register` | Registrar tool (placeholder) |
| DELETE | `/tools/:name` | Desregistrar tool |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas |

#### Eventos

**Escucha:**
| Evento | Acción |
|--------|--------|
| `tool.call.request` | Ejecuta tool y responde |
| `tool.list.request` | Lista tools disponibles |
| `tool.get.request` | Obtiene info de tool |

**Publica:**
| Evento | Cuándo |
|--------|--------|
| `tool.registered` | Nueva tool registrada |
| `tool.unregistered` | Tool eliminada |
| `tool.call.success` | Ejecución exitosa |
| `tool.call.failed` | Ejecución fallida (error/timeout) |
| `tool.call.response` | Respuesta a request |

#### Estructura de Tool

```javascript
{
  full_name: "weather.get_current",
  module_name: "weather",
  tool_name: "get_current",
  description: "Obtiene el clima actual de una ciudad",
  schema: {
    type: "object",
    properties: {
      city: { type: "string", description: "Nombre de la ciudad" },
      units: { type: "string", enum: ["celsius", "fahrenheit"] }
    },
    required: ["city"]
  },
  handler: async (args) => { ... }  // Solo en runtime
}
```

#### Triple Interacción

##### 1 TAP → Panel Tools Activas (30%)

```
┌─────────────────────────────────────────┐
│ 🔧 Tools Disponibles                    │
├─────────────────────────────────────────┤
│                                         │
│  ✅ weather.get_current                 │
│     Obtiene clima actual                │
│                                         │
│  ✅ calculator.evaluate                 │
│     Evalúa expresiones matemáticas      │
│                                         │
│  ✅ web.search                          │
│     Busca en internet                   │
│                                         │
│  ⚠️ code.execute (sin handler)          │
│     Ejecuta código                      │
│                                         │
│  ─────────────────────────────────────  │
│  Total: 4 tools | 3 activas             │
│                                         │
└─────────────────────────────────────────┘
```

**Datos mostrados:**
- Lista de tools registradas
- Estado: ✅ activa, ⚠️ sin handler
- Descripción breve

**Acciones:**
- Tap en tool → Ver detalle/schema
- Toggle para habilitar/deshabilitar en conversación

##### 2 TAPS → Modal Test Tool (50%)

```
┌─────────────────────────────────────────────────────┐
│ 🔧 Probar Tool                                [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Tool: [weather.get_current ▼]                      │
│                                                     │
│  Descripción: Obtiene el clima actual de una ciudad│
│                                                     │
│  ─── Argumentos ───                                │
│                                                     │
│  city * (string)                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │ Madrid                                      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  units (string) - celsius | fahrenheit              │
│  ┌─────────────────────────────────────────────┐   │
│  │ celsius                                     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              ▶️ Ejecutar Tool               │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ─── Resultado ───                                 │
│  ┌─────────────────────────────────────────────┐   │
│  │ {                                           │   │
│  │   "temperature": 18,                        │   │
│  │   "condition": "sunny",                     │   │
│  │   "humidity": 45                            │   │
│  │ }                                           │   │
│  │ ✅ 245ms                                    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Funcionalidad:**
- Seleccionar tool
- Formulario dinámico basado en schema
- Ejecutar y ver resultado
- Medir tiempo de ejecución

##### LONG-PRESS → Modal Gestión (80%)

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔧 Gestionar Tools                                        [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Filtros: [Todos ▼] [Módulo ▼]  [🔍 Buscar...]                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📦 weather                                                     │
│  ├── 🔧 get_current                              ✅ activa      │
│  │   Obtiene clima actual                                      │
│  │   Calls: 45 | Avg: 180ms | Errors: 2                       │
│  │   [📋 Schema] [▶️ Test] [📊 Stats]                          │
│  │                                                             │
│  └── 🔧 get_forecast                             ✅ activa      │
│      Pronóstico de 5 días                                      │
│      Calls: 12 | Avg: 320ms | Errors: 0                       │
│      [📋 Schema] [▶️ Test] [📊 Stats]                          │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📦 calculator                                                  │
│  └── 🔧 evaluate                                 ✅ activa      │
│      Evalúa expresiones matemáticas                            │
│      Calls: 120 | Avg: 5ms | Errors: 8                        │
│      [📋 Schema] [▶️ Test] [📊 Stats]                          │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📦 code                                                        │
│  └── 🔧 execute                                  ⚠️ sin handler │
│      Ejecuta código en sandbox                                 │
│      [📋 Schema] [🗑️ Eliminar]                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📊 Total: 4 tools | Calls hoy: 177 | Errors: 10 (5.6%)        │
│                                                                 │
│  [📊 Dashboard]                              [🔄 Recargar]      │
└─────────────────────────────────────────────────────────────────┘
```

**Acciones por tool:**
- 📋 Schema → Ver JSON Schema completo
- ▶️ Test → Abre modal de prueba
- 📊 Stats → Métricas de uso
- 🗑️ Eliminar → Solo tools sin handler

**Acciones globales:**
- 📊 Dashboard → Métricas generales
- 🔄 Recargar → Re-descubrir tools

#### Flujo de Tool Call

```
ai-gateway
    │
    │  tool.call.request
    │  {tool_name, args, request_id}
    │ ────────────────────────────────►  tool-orchestrator
    │                                           │
    │                                    1. Buscar tool
    │                                    2. Validar args (AJV)
    │                                    3. Ejecutar con timeout
    │                                           │
    │  tool.call.response                       │
    │  {success, result, duration}              │
    │ ◄────────────────────────────────────────┘
    │
    ▼
  LLM continúa con resultado
```

#### Registro Programático

```javascript
// Desde otro módulo
toolOrchestrator.registerTool(
  'mymodule',           // moduleName
  'my_action',          // toolName
  'Ejecuta mi acción',  // description
  {                     // JSON Schema
    type: 'object',
    properties: {
      param1: { type: 'string' }
    },
    required: ['param1']
  },
  async (args) => {     // handler
    return { result: 'ok' };
  }
);
```

---

### Botón 📎 Adjuntar (storage-manager)

**Módulo**: `storage-manager`
**Versión**: 1.0.0
**Responsabilidad**: Gestión de archivos con aislamiento por proyecto.
**Ubicación**: `toolbar_chat.bottom`

#### Propósito en Chat

El botón Adjuntar permite incluir archivos en los mensajes:
- Subir imágenes, PDFs, documentos para que el LLM los analice
- Adjuntar código fuente para review
- Incluir contexto adicional en forma de archivos

```
📎 Adjuntar → Archivos del proyecto → Adjuntar al mensaje
                     │
                     ├── uploads/   (archivos del usuario)
                     ├── exports/   (exports del sistema)
                     ├── temp/      (temporales, auto-limpieza 24h)
                     └── files/     (archivos del sistema)
```

#### APIs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/storage/:projectId/upload` | Subir archivo (multipart/form-data) |
| GET | `/storage/:projectId/files` | Listar archivos (?category=X) |
| GET | `/storage/:projectId/files/:id` | Metadata de archivo |
| GET | `/storage/:projectId/download/:id` | Descargar archivo |
| DELETE | `/storage/:projectId/files/:id` | Eliminar archivo |
| POST | `/storage/:projectId/cleanup` | Limpiar temporales (>24h) |
| GET | `/storage/:projectId/info` | Info de uso (por categoría) |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas |

#### Eventos

**Escucha:**
| Evento | Acción |
|--------|--------|
| `project.created` | Auto-crea estructura de carpetas |
| `project.deleted` | Auto-elimina storage del proyecto |
| `file.list.request` | Lista archivos y responde |
| `file.get.request` | Obtiene metadata y responde |
| `storage.info.request` | Info de uso y responde |

**Publica:**
| Evento | Cuándo |
|--------|--------|
| `storage.created` | Storage de proyecto creado |
| `storage.deleted` | Storage eliminado (con stats) |
| `storage.cleaned` | Temporales limpiados (files_deleted, bytes_freed) |
| `file.uploaded` | Archivo subido (file_id, size, mime_type) |
| `file.deleted` | Archivo eliminado |

#### Características

- **Aislamiento por proyecto**: Cada proyecto tiene su carpeta
- **Categorías**: uploads, exports, temp, files
- **Auto-creación**: Se crea al crear proyecto (project.created)
- **Auto-limpieza**: Temporales >24h se eliminan automáticamente
- **Registro en memoria**: Map() con metadata de archivos
- **MIME detection**: Detección automática por extensión

#### Estructura de Archivo

```javascript
{
  id: "abc123-uuid",
  project_id: "proj_xyz",
  filename: "abc123-uuid_documento.pdf",
  original_filename: "documento.pdf",
  path: "/data/storage/proj_xyz/uploads/abc123-uuid_documento.pdf",
  relative_path: "proj_xyz/uploads/abc123-uuid_documento.pdf",
  size: 1048576,  // bytes
  mime_type: "application/pdf",
  category: "uploads",
  created_at: "2024-12-05T10:00:00Z",
  metadata: {
    // Custom metadata opcional
  }
}
```

#### Triple Interacción

##### 1 TAP → Panel Selector de Archivo (30%)

```
┌─────────────────────────────────────────┐
│ 📎 Adjuntar Archivo                     │
├─────────────────────────────────────────┤
│                                         │
│  Categoría: [uploads ▼]                 │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  □ 📄 documento.pdf           1.2 MB    │
│      Subido: hace 2h                    │
│                                         │
│  □ 🖼️ captura.png             450 KB    │
│      Subido: hace 1d                    │
│                                         │
│  □ 📝 codigo.js                12 KB    │
│      Subido: hace 3d                    │
│                                         │
│  ─────────────────────────────────────  │
│  Seleccionados: 0 | [📎 Adjuntar]       │
│                                         │
│  [📤 Subir nuevo...]                    │
│                                         │
└─────────────────────────────────────────┘
```

**Datos mostrados:**
- Archivos del proyecto activo
- Filtro por categoría
- Tamaño y fecha de subida
- Checkbox para selección múltiple

**Acciones:**
- Seleccionar archivos → Adjuntar al mensaje actual
- 📤 Subir nuevo → Abre file picker nativo
- Cambiar categoría → Filtrar lista

##### 2 TAPS → Modal Subir Archivo (50%)

```
┌─────────────────────────────────────────────────────┐
│ 📎 Subir Archivo                              [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │        ┌───────────────────────┐           │   │
│  │        │                       │           │   │
│  │        │    📤 Arrastra        │           │   │
│  │        │    archivos aquí      │           │   │
│  │        │                       │           │   │
│  │        │    o haz clic         │           │   │
│  │        │                       │           │   │
│  │        └───────────────────────┘           │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Categoría: [uploads ▼]                             │
│                                                     │
│  □ Adjuntar al mensaje actual                       │
│                                                     │
│  ─── Archivos seleccionados ───                    │
│                                                     │
│  📄 reporte.pdf                          2.1 MB    │
│  🖼️ diagrama.png                         800 KB    │
│                                         ────────    │
│                                Total:    2.9 MB    │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              📤 Subir (2 archivos)          │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ⚠️ Máximo: 100 MB por archivo                     │
│  Formatos: imágenes, PDF, texto, JSON              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Funcionalidad:**
- Drag & drop o click para seleccionar
- Preview de archivos seleccionados
- Seleccionar categoría destino
- Opción de adjuntar inmediatamente al mensaje
- Validación de tamaño y tipo MIME

**Evento al subir:** `file.uploaded` por cada archivo

##### LONG-PRESS → Modal Gestión de Archivos (80%)

```
┌─────────────────────────────────────────────────────────────────┐
│ 📎 Gestionar Archivos                                      [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Proyecto: Mi Asistente IA                                      │
│  Categoría: [Todas ▼]  Ordenar: [Recientes ▼]  [🔍 Buscar...]  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📁 uploads/                                        12 archivos │
│  ├── 📄 documento.pdf                                  1.2 MB   │
│  │   ID: abc123 | Subido: 05/12/2024 10:30              │
│  │   [👁️ Ver] [📥 Descargar] [🗑️ Eliminar]                    │
│  │                                                             │
│  ├── 🖼️ captura.png                                    450 KB   │
│  │   ID: def456 | Subido: 04/12/2024 15:20                     │
│  │   [👁️ Ver] [📥 Descargar] [🗑️ Eliminar]                    │
│  │                                                             │
│  └── 📝 codigo.js                                       12 KB   │
│      ID: ghi789 | Subido: 02/12/2024 09:15                     │
│      [👁️ Ver] [📥 Descargar] [🗑️ Eliminar]                    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📁 exports/                                         3 archivos │
│  └── 📄 conversacion_export.json                       85 KB   │
│      ID: jkl012 | Creado: 01/12/2024 18:00                     │
│      [👁️ Ver] [📥 Descargar] [🗑️ Eliminar]                    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📁 temp/                                            5 archivos │
│  └── ⚠️ 5 archivos temporales (auto-limpieza en 18h)           │
│      [🧹 Limpiar ahora]                                        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📊 Uso: 2.5 MB / ∞                                            │
│     uploads: 1.7 MB (12) | exports: 85 KB (3) | temp: 700 KB   │
│                                                                 │
│  [📤 Subir]           [🧹 Limpiar temp]        [🗑️ Eliminar sel.]│
└─────────────────────────────────────────────────────────────────┘
```

**Acciones por archivo:**
- 👁️ Ver → Preview (imágenes) o abrir en nueva pestaña
- 📥 Descargar → GET /storage/:projectId/download/:id
- 🗑️ Eliminar → Confirmar y DELETE

**Acciones globales:**
- 📤 Subir → Abre modal subir
- 🧹 Limpiar temp → POST /storage/:projectId/cleanup
- 🗑️ Eliminar seleccionados → Borrar múltiples archivos

#### Integración con project-manager

El storage-manager reacciona automáticamente a eventos de proyecto:

```
project-manager                        storage-manager
      │                                      │
      │  project.created                     │
      │  {project_id}                        │
      │ ────────────────────────────────────►│
      │                                      │ Crea:
      │                                      │ data/storage/{project_id}/
      │                                      │   ├── uploads/
      │  storage.created                     │   ├── exports/
      │  {project_id, directories}           │   ├── temp/
      │ ◄────────────────────────────────────│   └── files/
      │                                      │
      │                                      │
      │  project.deleted                     │
      │  {project_id}                        │
      │ ────────────────────────────────────►│
      │                                      │ Elimina carpeta
      │  storage.deleted                     │ y registry
      │  {project_id, files_deleted,         │
      │   bytes_freed}                       │
      │ ◄────────────────────────────────────│
```

#### Integración con conversation-manager

Los archivos adjuntos se referencian en los mensajes:

```javascript
// Mensaje con attachment
{
  id: "msg_xyz",
  conversation_id: "conv_abc",
  role: "user",
  content: "¿Puedes analizar este documento?",
  attachments: [
    {
      type: "file",
      file_id: "abc123-uuid",        // Referencia al storage
      name: "documento.pdf",
      size: 1048576,
      mime_type: "application/pdf"
    }
  ],
  timestamp: "2024-12-05T10:00:00Z"
}
```

#### Configuración

```javascript
{
  basePath: "data/storage",
  directories: {
    uploads: "uploads",
    exports: "exports",
    temp: "temp",
    files: "files"
  },
  maxFileSize: 104857600,  // 100MB
  allowedMimeTypes: [
    "image/*",
    "application/pdf",
    "text/*",
    "application/json"
  ],
  tempCleanupAfterHours: 24
}
```

---

### Botón 📂 Explorar (file-browser + pdf-viewer + text-editor)

**Módulos**: `file-browser`, `pdf-viewer`, `text-editor`
**Versiones**: 1.0.0
**Responsabilidad**: Navegación, visualización y edición de archivos del proyecto.
**Ubicación**: `toolbar_chat.bottom`

#### Importancia

El botón Explorar es el **visor unificado** de archivos del proyecto:
- Navegar estructura de carpetas
- Ver PDFs generados o adjuntos
- Editar archivos de texto (JSON, MD, código)
- Buscar archivos por nombre o contenido
- Sin salir del contexto del chat

```
📂 Explorar
     │
     ├── 📁 file-browser   → Navegación y estructura
     │   ├── Listar archivos/carpetas
     │   ├── Crear/eliminar archivos
     │   └── Buscar (por nombre o contenido)
     │
     ├── 📄 pdf-viewer     → Visualizar PDFs
     │   ├── Renderizado base64
     │   ├── Extracción de texto
     │   └── Metadata del PDF
     │
     └── 📝 text-editor    → Editar texto
         ├── Formatos: json, md, txt, js, html, css, xml, yaml
         ├── Validación de sintaxis
         └── Formateo automático
```

#### APIs - file-browser

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/files?project_id=X&path=/` | Listar archivos/carpetas |
| GET | `/files/content?project_id=X&file_path=Y` | Obtener contenido de archivo |
| POST | `/files` | Crear archivo o carpeta |
| DELETE | `/files?project_id=X&file_path=Y` | Eliminar archivo/carpeta |
| GET | `/files/search?project_id=X&query=Y` | Buscar por nombre |
| GET | `/files/search?project_id=X&query=Y&search_content=true` | Buscar en contenido |

#### APIs - pdf-viewer

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/pdf/view?project_id=X&file_path=Y` | Ver PDF (base64) |
| GET | `/pdf/extract?project_id=X&file_path=Y` | Extraer texto del PDF |
| GET | `/pdf/metadata?project_id=X&file_path=Y` | Metadata del PDF |
| GET | `/pdf/list?project_id=X` | Listar todos los PDFs del proyecto |

#### APIs - text-editor

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/editor/open?project_id=X&file_path=Y` | Abrir archivo para edición |
| POST | `/editor/save` | Guardar cambios (project_id, file_path, content) |
| POST | `/editor/validate` | Validar sintaxis (content, format) |
| POST | `/editor/format` | Formatear contenido (content, format) |

#### Eventos

**file-browser escucha:**
| Evento | Acción |
|--------|--------|
| `file.list.request` | Lista archivos y responde |
| `file.content.request` | Obtiene contenido y responde |
| `file.create.request` | Crea archivo/carpeta |
| `file.delete.request` | Elimina y responde |
| `file.search.request` | Busca y responde |

**file-browser publica:**
| Evento | Cuándo |
|--------|--------|
| `file.created` | Archivo/carpeta creado |
| `file.deleted` | Archivo/carpeta eliminado |
| `file.list.response` | Respuesta a list request |
| `file.content.response` | Respuesta a content request |
| `file.search.response` | Resultados de búsqueda |

**pdf-viewer escucha:**
| Evento | Acción |
|--------|--------|
| `pdf.view.request` | Carga PDF en base64 |
| `pdf.extract.request` | Extrae texto |
| `pdf.metadata.request` | Obtiene metadata |
| `pdf.list.request` | Lista PDFs del proyecto |

**pdf-viewer publica:**
| Evento | Cuándo |
|--------|--------|
| `pdf.view.response` | PDF cargado (base64) |
| `pdf.extract.response` | Texto extraído |
| `pdf.metadata.response` | Metadata obtenida |
| `pdf.list.response` | Lista de PDFs |

**text-editor escucha:**
| Evento | Acción |
|--------|--------|
| `editor.open.request` | Abre archivo para edición |
| `editor.save.request` | Guarda cambios |
| `editor.validate.request` | Valida sintaxis |
| `editor.format.request` | Formatea contenido |

**text-editor publica:**
| Evento | Cuándo |
|--------|--------|
| `editor.open.response` | Archivo abierto con contenido |
| `editor.saved` | Archivo guardado exitosamente |
| `editor.validate.response` | Resultado de validación |
| `editor.format.response` | Contenido formateado |
| `editor.error` | Error en operación |

#### Formatos Soportados (text-editor)

| Extensión | Validación | Formateo |
|-----------|------------|----------|
| `.json` | Sintaxis JSON válido | Indentación automática |
| `.md` | Links markdown | Trim de espacios finales |
| `.txt` | - | - |
| `.js` | - | - |
| `.html` | - | - |
| `.css` | - | - |
| `.xml` | - | - |
| `.yaml` | - | - |

#### Triple Interacción

##### 1 TAP → Panel Explorador de Archivos (30%)

```
┌─────────────────────────────────────────┐
│ 📂 Explorar Proyecto                    │
├─────────────────────────────────────────┤
│                                         │
│  📁 Proyecto: Mi Asistente IA           │
│  Ruta: /                                │
│  ─────────────────────────────────────  │
│                                         │
│  📁 uploads/               12 archivos  │
│  📁 exports/                3 archivos  │
│  📁 docs/                   5 archivos  │
│  ─────────────────────────────────────  │
│  📄 config.json                  2 KB   │
│  📄 notas.md                     5 KB   │
│  📄 informe.pdf                 1.2 MB  │
│                                         │
│  ─────────────────────────────────────  │
│  [🔍 Buscar...]                         │
│                                         │
└─────────────────────────────────────────┘
```

**Datos mostrados:**
- Estructura de carpetas del proyecto
- Archivos ordenados: carpetas primero, luego alfabético
- Tamaño de archivos
- Contador de archivos en carpetas

**Acciones:**
- Tap en carpeta → Navega dentro
- Tap en archivo → Abre visor correspondiente:
  - `.pdf` → pdf-viewer
  - `.json`, `.md`, `.txt`, etc → text-editor
  - Otros → Descarga
- 🔍 Buscar → Busca por nombre

##### 2 TAPS → Modal Visor/Editor (50%)

**Para PDFs:**
```
┌─────────────────────────────────────────────────────┐
│ 📄 informe.pdf                                [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │          [Renderizado del PDF]              │   │
│  │                                             │   │
│  │                                             │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Página: [1] de 5   [◀️] [▶️]   [🔍+] [🔍-]         │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  Tamaño: 1.2 MB | Modificado: hace 2h              │
│                                                     │
│  [📋 Extraer texto] [📎 Adjuntar al chat] [⬇️]     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Para texto/código:**
```
┌─────────────────────────────────────────────────────┐
│ 📝 config.json                          ✏️    [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ {                                           │   │
│  │   "nombre": "Mi Proyecto",                  │   │
│  │   "version": "1.0.0",                       │   │
│  │   "settings": {                             │   │
│  │     "theme": "dark",                        │   │
│  │     "language": "es"                        │   │
│  │   }                                         │   │
│  │ }                                           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Línea: 8 | Columna: 1 | JSON válido ✅             │
│                                                     │
│  [✨ Formatear] [💾 Guardar] [📎 Adjuntar al chat]  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Acciones editor:**
- ✏️ → Activar modo edición
- ✨ Formatear → Aplica formato según tipo
- 💾 Guardar → Guarda cambios (valida primero si es JSON)
- 📎 Adjuntar al chat → Añade como attachment al mensaje

##### LONG-PRESS → Modal Gestión de Archivos (80%)

```
┌─────────────────────────────────────────────────────────────────┐
│ 📂 Gestionar Archivos                                     [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [🔍 Buscar en nombre...]  [🔍📄 Buscar en contenido...]       │
│                                                                 │
│  Filtrar: [Todos ▼]  [📄 PDFs] [📝 Texto] [🖼️ Imágenes]        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📁 uploads/                                      12 archivos   │
│  ─────────────────────────────────────────────────────────────  │
│  │  📄 documento1.pdf         1.2 MB    hace 2h    [👁️][📎][🗑️]│
│  │  📄 documento2.pdf         800 KB    hace 1d    [👁️][📎][🗑️]│
│  │  🖼️ captura.png            450 KB    hace 3d    [👁️][📎][🗑️]│
│  │  📝 notas.md                 5 KB    hace 1w    [👁️][📎][🗑️]│
│  └────────────────────────────────────────────────────────────  │
│                                                                 │
│  📁 exports/                                       3 archivos   │
│  ─────────────────────────────────────────────────────────────  │
│  │  📄 reporte.pdf            2.5 MB    hace 1h    [👁️][📎][🗑️]│
│  │  📝 datos.json              15 KB    hace 2h    [👁️][📎][🗑️]│
│  │  📝 resumen.md               8 KB    hace 2h    [👁️][📎][🗑️]│
│  └────────────────────────────────────────────────────────────  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📊 Total: 15 archivos | 6.5 MB                                │
│                                                                 │
│  [+ Nueva carpeta]  [📤 Subir archivo]     [🗑️ Limpiar temp]   │
└─────────────────────────────────────────────────────────────────┘
```

**Acciones por archivo:**
- 👁️ Ver → Abre en visor correspondiente
- 📎 Adjuntar → Añade al mensaje actual
- 🗑️ Eliminar → Confirma y borra

**Acciones globales:**
- + Nueva carpeta → Crea carpeta
- 📤 Subir archivo → Upload nuevo archivo
- 🗑️ Limpiar temp → Elimina archivos temporales >24h

#### Flujo de Búsqueda

```
Usuario busca "factura"
        │
        ▼
   file-browser
        │
        ├─► search_content=false
        │   └─ Busca en nombres: factura*.pdf, *factura*.json
        │
        └─► search_content=true
            └─ Busca en contenido de archivos de texto
            └─ Extensiones: .md, .txt, .json, .js, .html, .css, .xml, .yaml
```

#### Integración con Chat

Los archivos explorados pueden adjuntarse al mensaje:

```javascript
// Usuario ve un PDF y hace clic en "📎 Adjuntar al chat"
{
  action: "attach_to_message",
  file: {
    path: "/exports/reporte.pdf",
    type: "pdf",
    size: 2621440
  }
}
// → Se añade al mensaje como attachment
// → conversation-manager lo incluye en el contexto
```

---

### Botón 🎤 Voz (Web Speech API)

**Módulo**: Integración nativa del navegador
**Tecnología**: Web Speech API (SpeechRecognition + SpeechSynthesis)
**Responsabilidad**: Entrada y salida de voz en el chat.
**Ubicación**: `toolbar_chat.bottom`

#### Propósito

El botón Voz permite interactuar con el chat mediante voz:
- Dictar mensajes en lugar de escribir
- Escuchar respuestas del LLM leídas en voz alta
- Modo manos libres para accesibilidad

```
🎤 Voz
     │
     ├── 🎙️ Speech-to-Text (STT)
     │   └── Web Speech API: SpeechRecognition
     │
     └── 🔊 Text-to-Speech (TTS)
         └── Web Speech API: SpeechSynthesis
```

#### Características

| Funcionalidad | Tecnología | Soporte |
|---------------|------------|---------|
| Dictado de voz | SpeechRecognition | Chrome, Edge, Safari |
| Lectura de respuestas | SpeechSynthesis | Todos los navegadores modernos |
| Idiomas | API del navegador | Español, Inglés, +50 idiomas |

#### Triple Interacción

##### 1 TAP → Iniciar Dictado

```
┌─────────────────────────────────────────┐
│                                         │
│              🎤 Escuchando...           │
│                                         │
│         ████████████░░░░░░░░            │
│                                         │
│  "Explícame cómo funciona..."          │
│                                         │
│  ─────────────────────────────────────  │
│  [❌ Cancelar]     [✅ Enviar]          │
│                                         │
└─────────────────────────────────────────┘
```

**Comportamiento:**
- Activa el micrófono
- Transcribe en tiempo real
- Muestra texto reconocido
- Al finalizar: inserta en el input

##### 2 TAPS → Modal Configuración de Voz (50%)

```
┌─────────────────────────────────────────────────────┐
│ 🎤 Configurar Voz                             [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ─── Dictado (Speech-to-Text) ───                   │
│                                                     │
│  Idioma de dictado                                  │
│  ┌─────────────────────────────────────────────┐   │
│  │ ▼ Español (España)                          │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  □ Modo continuo (sigue escuchando)                │
│  □ Auto-enviar al detectar silencio                │
│                                                     │
│  ─── Lectura (Text-to-Speech) ───                   │
│                                                     │
│  Voz                                                │
│  ┌─────────────────────────────────────────────┐   │
│  │ ▼ Microsoft Helena (es-ES)                  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Velocidad         [1.0x] ────●──────── 0.5-2x     │
│  Tono              [1.0]  ─────●─────── 0.5-2      │
│                                                     │
│  [🔊 Probar voz]                                   │
│                                                     │
│  ─── Accesibilidad ───                              │
│                                                     │
│  □ Leer respuestas automáticamente                 │
│  □ Confirmar antes de enviar dictado               │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │           💾 Guardar Configuración          │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

##### LONG-PRESS → Modo Lectura (leer respuesta)

- Lee en voz alta el último mensaje del asistente
- Botón se convierte en ⏹️ para detener

#### Implementación Frontend

```javascript
// Dictado
const recognition = new webkitSpeechRecognition();
recognition.lang = 'es-ES';
recognition.continuous = false;
recognition.interimResults = true;

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  inputField.value = transcript;
};

// Lectura
const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = 'es-ES';
utterance.rate = 1.0;
speechSynthesis.speak(utterance);
```

#### Nota

Este botón NO requiere módulo backend. Usa APIs nativas del navegador.
Los eventos de uso pueden publicarse opcionalmente para analytics.

---

### Botón 📷 Cámara (MediaDevices API)

**Módulo**: Integración nativa del navegador
**Tecnología**: MediaDevices API (getUserMedia)
**Responsabilidad**: Captura de fotos para adjuntar al chat.
**Ubicación**: `toolbar_chat.bottom`

#### Propósito

El botón Cámara permite capturar imágenes para enviar al LLM:
- Tomar fotos de documentos, pantallas, objetos
- Capturar para análisis visual (modelos multimodales)
- Subir directamente como attachment

```
📷 Cámara
     │
     ├── 📸 Captura de foto
     │   └── MediaDevices: getUserMedia({video: true})
     │
     └── 📤 Subida automática
         └── → storage-manager → attachment
```

#### Triple Interacción

##### 1 TAP → Capturar Foto

```
┌─────────────────────────────────────────┐
│ 📷 Capturar Foto                        │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │      [Vista de la cámara]       │   │
│  │                                 │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│           [ 📸 Capturar ]              │
│                                         │
│  [🔄 Cambiar cámara]    [❌ Cancelar]   │
│                                         │
└─────────────────────────────────────────┘
```

**Al capturar:**
- Toma foto del video stream
- Muestra preview
- Ofrece: [📎 Adjuntar] [🔄 Otra foto] [❌ Descartar]

##### 2 TAPS → Modal Configuración (50%)

```
┌─────────────────────────────────────────────────────┐
│ 📷 Configurar Cámara                          [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Cámara                                             │
│  ┌─────────────────────────────────────────────┐   │
│  │ ▼ Cámara frontal                            │   │
│  │   ○ Cámara trasera                          │   │
│  │   ○ Cámara externa USB                      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Resolución                                         │
│  ┌─────────────────────────────────────────────┐   │
│  │ ○ Baja (640x480)     ~ 50 KB                │   │
│  │ ● Media (1280x720)   ~ 150 KB               │   │
│  │ ○ Alta (1920x1080)   ~ 300 KB               │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Formato de imagen                                  │
│  ○ JPEG (más pequeño)  ● PNG (mejor calidad)       │
│                                                     │
│  □ Adjuntar automáticamente al capturar            │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │           💾 Guardar Configuración          │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

##### LONG-PRESS → Galería de capturas recientes

```
┌─────────────────────────────────────────────────────────────────┐
│ 📷 Capturas Recientes                                     [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ 📷      │  │ 📷      │  │ 📷      │  │ 📷      │            │
│  │ img1    │  │ img2    │  │ img3    │  │ img4    │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
│   hace 5m      hace 1h      hace 2h      hace 1d               │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Seleccionadas: 0                                              │
│                                                                 │
│  [📎 Adjuntar seleccionadas]            [🗑️ Limpiar todas]     │
└─────────────────────────────────────────────────────────────────┘
```

#### Implementación Frontend

```javascript
// Obtener stream de video
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'environment', // Cámara trasera
    width: { ideal: 1280 },
    height: { ideal: 720 }
  }
});

// Mostrar en video element
videoElement.srcObject = stream;

// Capturar foto
function capturePhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  canvas.getContext('2d').drawImage(videoElement, 0, 0);

  const imageData = canvas.toDataURL('image/jpeg', 0.8);
  // → Subir a storage-manager
  // → Adjuntar al mensaje
}
```

#### Flujo de Captura

```
Usuario tap 📷
        │
        ▼
   getUserMedia()
        │
        ▼
   Video preview
        │
   [📸 Capturar]
        │
        ▼
   Canvas snapshot
        │
        ├─► base64 → storage-manager POST /upload
        │
        └─► attachment en mensaje
                │
                ▼
           conversation-manager
           (mensaje con imagen)
```

#### Nota

Este botón NO requiere módulo backend específico.
Las imágenes capturadas se suben via `storage-manager`.
Compatible con modelos multimodales (Claude vision, GPT-4V, etc).

---

### Botón 📋 Contexto (ai-agent-framework) - DEPRECADO

> ⚠️ **DEPRECADO**: Este botón ha sido removido de la interfaz de usuario.
> El ai-agent-framework es infraestructura interna para agentes backend,
> no para interacción directa del usuario en el chat. El contexto de la
> conversación se gestiona automáticamente por conversation-manager.

**Módulo**: `ai-agent-framework`
**Versión**: 1.0.0
**Responsabilidad**: Framework de agentes IA con context management, tool calling y orchestration.
**Ubicación**: ~~`toolbar_chat.bottom`~~ (removido)

#### Propósito en Chat

El botón Contexto permite ver y gestionar lo que el LLM "sabe" al responder:

```
📋 Contexto → ¿Qué ve el LLM?
                    │
                    ├── System Prompt (instrucciones base)
                    ├── Context Window (últimos N mensajes)
                    ├── Variables (datos dinámicos)
                    ├── Attachments (archivos adjuntos)
                    └── Agent Config (si hay agente activo)
```

**Por qué es importante:**
- Ver qué información tiene el LLM disponible
- Editar variables de contexto dinámicamente
- Ajustar el context window (más/menos historial)
- Debug de respuestas inesperadas

#### APIs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/agents` | Registrar nuevo agente |
| GET | `/agents` | Listar agentes (?enabled=true) |
| GET | `/agents/:id` | Obtener configuración de agente |
| PUT | `/agents/:id` | Actualizar agente |
| DELETE | `/agents/:id` | Eliminar agente |
| POST | `/agents/:id/trigger` | Ejecutar agente manualmente |
| GET | `/agents/:id/context` | Obtener contexto/memoria del agente |
| DELETE | `/agents/:id/context` | Limpiar contexto del agente |
| GET | `/tools` | Listar tools disponibles |
| GET | `/agents/:id/stats` | Estadísticas del agente |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas |

#### Eventos

**El módulo principalmente opera vía HTTP/request-response.**

Los agentes escuchan eventos configurados y publican resultados:

```javascript
// Agente configurado para escuchar
agent.subscribes = ['ticket.created', 'support.request'];

// Cuando llega el evento, el agente:
// 1. Carga su contexto
// 2. Ejecuta el LLM con tools
// 3. Publica resultado
```

**Eventos de agentes:**
| Evento | Cuándo |
|--------|--------|
| `agent.{name}.created` | Agente registrado |
| `agent.{name}.completed` | Ejecución exitosa |
| `agent.{name}.failed` | Ejecución fallida |

#### Componentes Internos

```
ai-agent-framework
       │
       ├── ContextManager     ← Gestiona memoria/contexto
       │   ├── contexts: Map<agentId, context>
       │   ├── max_messages: 100 (configurable)
       │   └── ttl_minutes: 1440 (auto-cleanup)
       │
       ├── ToolManager        ← Gestiona tools disponibles
       │   └── tools: Map<name, tool>
       │
       └── Agent              ← Instancia de agente
           ├── id, name, description
           ├── prompt_id (referencia a prompt-manager)
           ├── provider, model, temperature
           ├── subscribes: [] (eventos que escucha)
           └── tools: [] (tools que puede usar)
```

#### Estructura de Contexto

```javascript
{
  agent_id: "agent_support",
  messages: [
    { role: "user", content: "...", timestamp: "..." },
    { role: "assistant", content: "...", timestamp: "..." }
  ],
  metadata: {
    // Variables personalizadas
    user_name: "Juan",
    project_type: "e-commerce",
    language: "es"
  },
  created_at: "2024-12-05T10:00:00Z",
  updated_at: "2024-12-05T14:30:00Z"
}
```

#### Triple Interacción

##### 1 TAP → Panel Vista de Contexto (30%)

```
┌─────────────────────────────────────────┐
│ 📋 Contexto Actual                      │
├─────────────────────────────────────────┤
│                                         │
│  System Prompt:                         │
│  ┌─────────────────────────────────┐   │
│  │ "Eres un asistente experto..."  │   │
│  │ (ver completo →)                │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Context Window: 20 mensajes            │
│  ├── últimos: hace 5 min               │
│  └── tokens estimados: ~3.2K           │
│                                         │
│  Variables:                             │
│  ├── project: "Mi Proyecto"            │
│  ├── language: "español"               │
│  └── user: "Usuario123"                │
│                                         │
│  Attachments: 2 archivos               │
│  └── documento.pdf, imagen.png         │
│                                         │
│  ─────────────────────────────────────  │
│  [✏️ Editar variables]                  │
│                                         │
└─────────────────────────────────────────┘
```

**Datos mostrados:**
- System prompt (truncado con link a ver completo)
- Tamaño del context window
- Tokens estimados
- Variables activas
- Archivos adjuntos referenciados

**Acciones:**
- Ver prompt completo
- Editar variables rápidamente

##### 2 TAPS → Modal Editar Contexto (50%)

```
┌─────────────────────────────────────────────────────┐
│ 📋 Editar Contexto                            [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ─── System Prompt ───                             │
│  ┌─────────────────────────────────────────────┐   │
│  │ Eres un asistente experto en desarrollo.    │   │
│  │ Tu objetivo es ayudar con tareas de         │   │
│  │ programación de manera clara y concisa.     │   │
│  │                                             │   │
│  │ Variables disponibles: {{project}}, {{lang}}│   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ─── Context Window ───                            │
│  Mensajes a incluir: [20 ▼]                        │
│  □ Incluir mensajes del sistema                    │
│  ☑ Incluir attachments                             │
│                                                     │
│  ─── Variables ───                                 │
│  ┌──────────────┬────────────────────────────┐    │
│  │ project      │ Mi Proyecto                 │    │
│  │ language     │ español                     │    │
│  │ user_role    │ developer                   │    │
│  │ + Añadir     │                             │    │
│  └──────────────┴────────────────────────────┘    │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              💾 Guardar Cambios             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ⚠️ Los cambios aplican a la conversación actual   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Funcionalidad:**
- Editar system prompt de la conversación
- Ajustar context window (número de mensajes)
- Añadir/editar/eliminar variables
- Las variables se interpolan con `{{variable}}`

##### LONG-PRESS → Modal Gestión de Agentes (80%)

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋 Gestionar Agentes y Contexto                            [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ─── Agentes Registrados ───                                   │
│                                                                 │
│  🤖 support-agent                              ✅ activo        │
│     Agente de soporte al cliente                               │
│     Prompt: support-v2 | Model: Claude 3.5                     │
│     Subscribes: ticket.created, support.request                │
│     Context: 45 msgs | Updated: hace 2h                        │
│     [⚙️ Config] [📋 Ver contexto] [🧹 Limpiar] [▶️ Trigger]     │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🤖 code-reviewer                              ✅ activo        │
│     Revisor automático de código                               │
│     Prompt: code-review-v1 | Model: GPT-4o                     │
│     Subscribes: pr.created                                     │
│     Context: 12 msgs | Updated: hace 1d                        │
│     [⚙️ Config] [📋 Ver contexto] [🧹 Limpiar] [▶️ Trigger]     │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🤖 translator                                 ⚪ inactivo      │
│     Traductor automático                                       │
│     Prompt: translator-v1 | Model: DeepSeek                    │
│     Context: vacío                                             │
│     [⚙️ Config] [▶️ Activar] [🗑️ Eliminar]                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📊 Resumen: 3 agentes | 2 activos | 57 msgs en contexto       │
│                                                                 │
│  [+ Nuevo Agente]               [🧹 Limpiar todos] [📊 Stats]   │
└─────────────────────────────────────────────────────────────────┘
```

**Acciones por agente:**
- ⚙️ Config → Modal de configuración del agente
- 📋 Ver contexto → Ver memoria/historial del agente
- 🧹 Limpiar → DELETE /agents/:id/context
- ▶️ Trigger → POST /agents/:id/trigger (ejecución manual)
- ▶️ Activar / ⏸️ Desactivar → PUT /agents/:id {enabled: true/false}
- 🗑️ Eliminar → DELETE /agents/:id

**Acciones globales:**
- + Nuevo Agente → Modal crear agente
- 🧹 Limpiar todos → Limpiar contexto de todos los agentes
- 📊 Stats → Dashboard de estadísticas

#### Modal Crear/Editar Agente

```
┌─────────────────────────────────────────────────────┐
│ 🤖 Nuevo Agente                               [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Nombre *                                           │
│  ┌─────────────────────────────────────────────┐   │
│  │ mi-agente-personalizado                     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Descripción                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ Agente para automatizar tareas de...        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ─── Configuración IA ───                          │
│                                                     │
│  Prompt: [Seleccionar... ▼]                        │
│  Provider: [anthropic ▼]  Model: [claude-3-5 ▼]   │
│  Temperature: [0.7]  Max Tokens: [2000]            │
│                                                     │
│  ─── Triggers (eventos) ───                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ ticket.created                              │   │
│  │ support.request                             │   │
│  │ + Añadir evento                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ─── Tools disponibles ───                         │
│  ☑ search_kb        ☑ create_ticket               │
│  ☑ send_email       □ execute_code                │
│                                                     │
│  ☑ Activar inmediatamente                          │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              🤖 Crear Agente                │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Estructura de Agente

```javascript
{
  id: "agent_abc123",
  name: "support-agent",
  description: "Agente de soporte al cliente",
  prompt_id: "prompt_support_v2",   // Referencia a prompt-manager
  provider: "anthropic",
  model: "claude-3-5-sonnet",
  temperature: 0.3,
  max_tokens: 2000,
  subscribes: [                      // Eventos que escucha
    "ticket.created",
    "support.request"
  ],
  tools: [                          // Tools que puede usar
    "search_kb",
    "create_ticket",
    "send_email"
  ],
  enabled: true,
  metadata: {
    department: "support",
    priority: "high"
  },
  stats: {
    total_runs: 1250,
    success_rate: 0.92,
    avg_duration_ms: 3500,
    total_tokens: 500000
  },
  created_at: "2024-11-01T10:00:00Z",
  updated_at: "2024-12-05T14:30:00Z"
}
```

#### Flujo de Ejecución de Agente

```
Evento llega (ej: ticket.created)
         │
         ▼
   ai-agent-framework
         │
         ├─► Busca agentes que escuchan ese evento
         │
         ▼
   Agent.handleEvent(event)
         │
         ├─► 1. Cargar contexto (ContextManager)
         │
         ├─► 2. Renderizar prompt (prompt-manager)
         │   POST /prompts/:id/render
         │
         ├─► 3. Llamar LLM (ai-gateway)
         │   POST /chat
         │
         ├─► 4. Si hay tool_calls → tool-orchestrator
         │   tool.call.request
         │
         ├─► 5. Guardar en contexto
         │
         └─► 6. Publicar resultado
             agent.{name}.completed
```

#### Context Window en Chat

El context window determina cuántos mensajes se envían al LLM:

```
┌──────────────────────────────────────────────────────────┐
│                  Conversación Completa                    │
│  ┌──────────────────────────────────────────────────┐    │
│  │ [msg 1] [msg 2] [msg 3] ... [msg 18] [msg 19] [msg 20]│
│  │         ↑──────────────────────────────────────────│   │
│  │                    Context Window = 20              │    │
│  │                    (esto se envía al LLM)           │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘

         Lo que el LLM "ve":
         ┌─────────────────────────────────────┐
         │ System Prompt                       │
         │ + Context Window (20 msgs)          │
         │ + Variables interpoladas            │
         │ + Attachments (si los hay)          │
         └─────────────────────────────────────┘
```

**Configuración:**
- Valor por defecto: 20 mensajes
- Configurable por conversación (ai_settings.context_window)
- Más mensajes = más contexto, pero más tokens/costo

---

### Botón 🔌 Plugins (plugin-manager) - DEPRECADO

> ⚠️ **DEPRECADO**: Este botón ha sido removido de la interfaz de usuario.
> La gestión de plugins es un tema avanzado que requiere su propia interfaz
> de administración separada. Los plugins siguen funcionando internamente
> pero el usuario no los gestiona desde el chat.

**Módulo**: `plugin-manager`
**Versión**: 2.0.0
**Responsabilidad**: Descubrimiento y gestión de plugins JSON con funciones.
**Ubicación**: ~~`toolbar_chat.bottom`~~ (removido)

#### Propósito en Chat

El botón Plugins permite extender las capacidades del chat con funciones adicionales:

```
🔌 Plugins → Funciones adicionales para el LLM
                    │
                    ├── weather/
                    │   └── weather.functions.json
                    │       ├── get_current
                    │       └── get_forecast
                    │
                    ├── calculator/
                    │   └── calculator.functions.json
                    │       └── evaluate
                    │
                    └── search/
                        └── search.functions.json
                            └── web_search
```

**Diferencia con Tools:**
- **Tools** (tool-orchestrator): Herramientas con handlers ejecutables
- **Plugins** (plugin-manager): Definiciones JSON de funciones (schema para LLM)

Los plugins definen QUÉ puede hacer el LLM, los tools definen CÓMO ejecutarlo.

#### APIs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/plugins` | Listar plugins y funciones |
| GET | `/plugins/:name` | Obtener plugin específico |
| POST | `/plugins/reload` | Recargar plugins desde disco |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas |

#### Eventos

**Escucha:**
| Evento | Acción |
|--------|--------|
| `plugin.get.request` | Obtiene plugin y responde |
| `plugin.list.request` | Lista plugins y responde |

**Publica:**
| Evento | Cuándo |
|--------|--------|
| `plugin.loaded` | Plugin cargado exitosamente |
| `plugin.unloaded` | Plugin descargado |
| `plugin.reloaded` | Plugins recargados |
| `plugin.error` | Error al cargar plugin |

#### Estructura de Plugin

Los plugins son archivos JSON con esta estructura:

```javascript
// plugins/weather/weather.functions.json
{
  "metadata": {
    "name": "weather",
    "version": "1.0.0",
    "description": "Funciones para consultar el clima"
  },
  "functions": {
    "get_current": {
      "description": "Obtiene el clima actual de una ciudad",
      "parameters": {
        "type": "object",
        "properties": {
          "city": {
            "type": "string",
            "description": "Nombre de la ciudad"
          },
          "units": {
            "type": "string",
            "enum": ["celsius", "fahrenheit"],
            "default": "celsius"
          }
        },
        "required": ["city"]
      }
    },
    "get_forecast": {
      "description": "Obtiene pronóstico de 5 días",
      "parameters": {
        "type": "object",
        "properties": {
          "city": { "type": "string" },
          "days": { "type": "number", "default": 5 }
        },
        "required": ["city"]
      }
    }
  }
}
```

#### Triple Interacción

##### 1 TAP → Panel Plugins Activos (30%)

```
┌─────────────────────────────────────────┐
│ 🔌 Plugins Activos                      │
├─────────────────────────────────────────┤
│                                         │
│  ☑ weather                   2 funcs   │
│    get_current, get_forecast           │
│                                         │
│  ☑ calculator                1 func    │
│    evaluate                            │
│                                         │
│  ☑ search                    1 func    │
│    web_search                          │
│                                         │
│  □ experimental              3 funcs   │
│    (desactivado)                       │
│                                         │
│  ─────────────────────────────────────  │
│  Total: 4 plugins | 7 funciones        │
│                                         │
│  [🔄 Recargar]                          │
│                                         │
└─────────────────────────────────────────┘
```

**Datos mostrados:**
- Lista de plugins descubiertos
- Checkbox para activar/desactivar en conversación
- Número de funciones por plugin
- Nombres de funciones

**Acciones:**
- Toggle plugin → Activar/desactivar para la conversación
- 🔄 Recargar → POST /plugins/reload

##### 2 TAPS → Modal Ver Plugin (50%)

```
┌─────────────────────────────────────────────────────┐
│ 🔌 Plugin: weather                            [X]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Versión: 1.0.0                                     │
│  Descripción: Funciones para consultar el clima    │
│                                                     │
│  ─── Funciones (2) ───                             │
│                                                     │
│  📦 get_current                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Obtiene el clima actual de una ciudad       │   │
│  │                                             │   │
│  │ Parámetros:                                 │   │
│  │ • city* (string): Nombre de la ciudad       │   │
│  │ • units (string): celsius | fahrenheit      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  📦 get_forecast                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │ Obtiene pronóstico de 5 días                │   │
│  │                                             │   │
│  │ Parámetros:                                 │   │
│  │ • city* (string): Nombre de la ciudad       │   │
│  │ • days (number): default 5                  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ─── Archivo ───                                   │
│  📄 plugins/weather/weather.functions.json         │
│                                                     │
│  [☑ Usar en conversación]                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Funcionalidad:**
- Ver detalles completos del plugin
- Ver schema de cada función
- Activar/desactivar para la conversación actual

##### LONG-PRESS → Modal Gestión de Plugins (80%)

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔌 Gestionar Plugins                                       [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Ruta: /plugins/                            [🔄 Recargar todo]  │
│  Auto-reload: ✅ Activo (5s)                                    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🔌 weather                                     v1.0.0   ✅     │
│     Funciones para consultar el clima                          │
│     📦 get_current, get_forecast (2 funcs)                     │
│     Cargado: hace 2h                                           │
│     [👁️ Ver] [📋 Schema] [🔄 Recargar]                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🔌 calculator                                  v1.0.0   ✅     │
│     Evaluador de expresiones matemáticas                       │
│     📦 evaluate (1 func)                                       │
│     Cargado: hace 2h                                           │
│     [👁️ Ver] [📋 Schema] [🔄 Recargar]                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🔌 search                                      v2.0.0   ✅     │
│     Búsqueda web                                               │
│     📦 web_search (1 func)                                     │
│     Cargado: hace 2h                                           │
│     [👁️ Ver] [📋 Schema] [🔄 Recargar]                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ⚠️ experimental                                v0.1.0   ❌     │
│     Plugin en desarrollo                                       │
│     Error: Invalid JSON at line 45                            │
│     [🔄 Reintentar] [📄 Ver archivo]                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📊 Total: 4 plugins | 3 OK | 1 error | 7 funciones           │
│                                                                 │
│  [📁 Abrir carpeta]           [📖 Docs: crear plugin]          │
└─────────────────────────────────────────────────────────────────┘
```

**Acciones por plugin:**
- 👁️ Ver → Modal detalle del plugin
- 📋 Schema → Ver JSON Schema completo
- 🔄 Recargar → Recargar solo este plugin
- 🔄 Reintentar → Para plugins con error

**Acciones globales:**
- 🔄 Recargar todo → POST /plugins/reload
- 📁 Abrir carpeta → Abrir directorio de plugins
- 📖 Docs → Cómo crear un plugin

#### Descubrimiento Automático

El plugin-manager descubre plugins automáticamente:

```
plugins/                           ← Ruta configurable
├── weather/
│   └── weather.functions.json     ← Detectado ✓
├── calculator/
│   └── calculator.functions.json  ← Detectado ✓
├── search/
│   └── search.functions.json      ← Detectado ✓
└── my-plugin/
    ├── my-plugin.functions.json   ← Detectado ✓
    └── README.md                  ← Ignorado
```

**Reglas:**
- Busca en subdirectorios de `plugins/`
- Detecta archivos `*.functions.json`
- Valida estructura (metadata.name + functions)
- Auto-reload opcional (cada 5s por defecto)

#### Integración con LLM

Los plugins definen funciones que el LLM puede "llamar":

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Usuario: "¿Qué tiempo hace en Madrid?"                       │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ 1. Chat envía mensaje a ai-gateway                      │   │
│   │                                                         │   │
│   │ 2. ai-gateway incluye plugins activos como "tools"      │   │
│   │    disponibles para el LLM                              │   │
│   │                                                         │   │
│   │ 3. LLM decide llamar weather.get_current                │   │
│   │    → tool_call: {name: "weather.get_current",           │   │
│   │                  args: {city: "Madrid"}}                │   │
│   │                                                         │   │
│   │ 4. tool-orchestrator ejecuta la función                 │   │
│   │    (si tiene handler registrado)                        │   │
│   │                                                         │   │
│   │ 5. LLM recibe resultado y genera respuesta              │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Asistente: "En Madrid hace 18°C con cielo despejado."        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Crear un Plugin

Para crear un nuevo plugin:

1. **Crear directorio**: `plugins/mi-plugin/`

2. **Crear archivo JSON**: `mi-plugin.functions.json`

```json
{
  "metadata": {
    "name": "mi-plugin",
    "version": "1.0.0",
    "description": "Mi plugin personalizado"
  },
  "functions": {
    "mi_funcion": {
      "description": "Descripción de lo que hace",
      "parameters": {
        "type": "object",
        "properties": {
          "param1": {
            "type": "string",
            "description": "Descripción del parámetro"
          }
        },
        "required": ["param1"]
      }
    }
  }
}
```

3. **Recargar plugins**: POST /plugins/reload

4. **(Opcional) Registrar handler** en tool-orchestrator:

```javascript
toolOrchestrator.registerTool(
  'mi-plugin',
  'mi_funcion',
  'Descripción',
  schema,
  async (args) => {
    // Implementación
    return { result: '...' };
  }
);
```

#### Configuración

```javascript
{
  pluginsPath: "plugins",      // Ruta relativa a módulos
  autoReload: true,            // Recargar automáticamente
  watchInterval: 5000          // Intervalo de watch (ms)
}
```

---

*Última actualización: 2024-12-05*
*Versión: 1.9.0*
