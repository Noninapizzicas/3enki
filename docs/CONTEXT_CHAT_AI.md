# CONTEXT_CHAT_AI.md - Sistema Chat AI Event-Driven

> Documento de contexto para la aplicación Chat AI de Event-Core.
> Define los módulos relacionados con conversaciones, IA y gestión de proyectos.
>
> **Para UI y patrones de interacción, ver CONTEXT_UI.md**

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

**Escucha**: `ai.request.created`
**Publica**: `ai.chat.response`, `ai.chat.error`

**APIs**:
```
POST /chat           - Chat completion (sync/fallback)
POST /chat/stream    - Chat completion con SSE streaming
GET  /providers      - Listar proveedores y estado
GET  /models         - Listar modelos por proveedor
GET  /usage          - Estadísticas de uso y costos
POST /providers/test - Probar conectividad
```

---

### 2. conversation-manager (Gestor de Conversaciones)

**Responsabilidad**: Gestionar conversaciones, mensajes y contexto para IA.

**Características**:
- **DB por proyecto**: Cada proyecto tiene su propia base de datos aislada
- Context window configurable por conversación
- Carga de contexto de proyecto (metadata, storage)
- Settings de IA por conversación (modelo, temperature, max_tokens)
- Soporte de attachments
- Tracking de costos/tokens por mensaje
- Lazy loading de conversaciones por proyecto

**Escucha**: `conversation.get.request`, `conversation.list.request`, `message.list.request`, `conversation.send.request`, `db.query.response`, `ai.chat.response`, `project.get.response`, `storage.info.response`

**Publica**: `conversation.created`, `conversation.updated`, `conversation.deleted`, `message.sent`, `message.received`, `conversation.context.loaded`

**APIs**:
```
POST   /conversations              - Crear conversación
GET    /conversations              - Listar (filtro por proyecto)
GET    /conversations/:id          - Obtener con contexto
PUT    /conversations/:id          - Actualizar metadata
DELETE /conversations/:id          - Eliminar
POST   /conversations/:id/messages - Enviar mensaje (trigger AI)
GET    /conversations/:id/messages - Obtener mensajes paginados
GET    /conversations/:id/context  - Contexto completo
GET    /ui/state?project_id=X      - UI-ready (secciones temporales)
```

**Endpoint /ui/state** (Patrón 16):
```javascript
// GET /ui/state?project_id=test-project
{
  success: true,
  project_id: "test-project",
  sections: [
    { id: "today", label: "Hoy", conversations: [...] },
    { id: "yesterday", label: "Ayer", conversations: [...] },
    { id: "this_week", label: "Esta semana", conversations: [...] }
  ],
  stats: {
    total_conversations: 15,
    total_messages: 234,
    active_today: 3
  }
}
```

**Estructura de Conversación**:
```javascript
{
  id: "conv_abc123",
  project_id: "proj_xyz",
  title: "Diseño de API REST",
  system_prompt: "Eres un experto en diseño de APIs...",
  model: "claude-3-5-sonnet-20241022",
  provider: "anthropic",
  temperature: 0.7,
  max_tokens: 4096,
  context_window: 20,
  message_count: 45,
  created_at: "2025-12-08T10:00:00Z",
  updated_at: "2025-12-08T15:30:00Z"
}
```

---

### 3. credential-manager (Gestor de Credenciales)

**Responsabilidad**: Gestión multi-nivel de API keys con resolución en cascada.

**Niveles de Prioridad**:
| Nivel | Prioridad | Descripción |
|-------|-----------|-------------|
| CUSTOM | 1 (más alta) | Credencial personalizada específica |
| CLIENT | 2 | Por cliente |
| PROJECT | 3 | Por proyecto |
| GLOBAL | 4 (fallback) | Credencial global por defecto |

**Escucha**: `credential.resolve.request`
**Publica**: `credential.saved`, `credential.updated`, `credential.deleted`, `credential.resolved`, `credential.resolve.failed`

**APIs**:
```
POST   /credentials         - Guardar credencial
GET    /credentials/resolve - Resolver por cascada
GET    /credentials         - Listar (masked)
PUT    /credentials/:key    - Actualizar
DELETE /credentials/:key    - Eliminar
```

---

### 4. prompt-manager (Gestor de Prompts)

**Responsabilidad**: Sistema de gestión de prompts con versionado, templates y analytics.

**Características**:
- Versionado automático (cada cambio en content crea nueva versión)
- Templates con variables `{{variable}}`
- Analytics: tokens, latencia, costos por prompt
- A/B Testing

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
```

---

### 5. tool-orchestrator (Orquestador de Herramientas)

**Responsabilidad**: Registrar y ejecutar herramientas para agentes IA.

**Escucha**: `tool.call.request`, `tool.list.request`, `tool.get.request`
**Publica**: `tool.registered`, `tool.unregistered`, `tool.call.success`, `tool.call.failed`, `tool.call.response`

**APIs**:
```
GET    /tools            - Listar herramientas
GET    /tools/:name      - Obtener definición
POST   /tools/:name/call - Ejecutar herramienta
POST   /tools/register   - Registrar herramienta
DELETE /tools/:name      - Eliminar herramienta
```

---

### 6. ai-agent-framework (Framework de Agentes)

**Responsabilidad**: Framework para crear agentes IA event-driven con context y tool calling.

**Componentes**:
- ContextManager: Gestiona memoria/contexto de agentes
- ToolManager: Gestiona tools disponibles
- Agent: Instancia de agente con configuración

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
```

---

## Módulos de Infraestructura

### 7. database-manager (Base de Datos)

**Responsabilidad**: SQLite via sql.js con aislamiento por proyecto.

**Escucha**: `db.query.request`, `db.schema.init.request`
**Publica**: `db.created`, `db.deleted`, `db.query.executed`, `db.schema.initialized`, `db.query.response`

**Almacenamiento**: `./data/projects/{projectId}/database.sqlite`

---

### 8. storage-manager (Almacenamiento)

**Responsabilidad**: Gestión de archivos con aislamiento por proyecto.

**Escucha**: `project.created`, `project.deleted`, `file.list.request`, `file.get.request`, `storage.info.request`
**Publica**: `storage.created`, `storage.deleted`, `storage.cleaned`, `file.uploaded`, `file.deleted`

**Estructura de Directorios**:
```
data/storage/{projectId}/
├── uploads/      # Archivos subidos por usuario
├── exports/      # Archivos exportados
├── temp/         # Temporales (auto-cleanup 24h)
└── files/        # Archivos del sistema
```

---

### 9. project-manager (Gestor de Proyectos)

**Responsabilidad**: Ciclo de vida de proyectos con integración DB y credenciales.

**Escucha**: `project.get.request`, `project.list.request`, `project.active.request`, `db.query.response`
**Publica**: `project.created`, `project.updated`, `project.deleted`, `project.activated`, `project.deactivated`

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
                ├─► message.sent (guardar en DB)
                │
                ├─► credential.resolve.request
                │         │
                │         ▼
                │   credential-manager → credential.resolved
                │
                ├─► Cargar contexto (N mensajes + proyecto)
                │
                ▼
         ai.chat.request → ai-gateway
                              │
                              ├─► DeepSeek (prioridad 1)
                              │   └─ ❌ Fallback si falla
                              ├─► Anthropic (prioridad 2)
                              │
                              ▼
                       ai.chat.response
                              │
                              ▼
                       conversation-manager
                              │
                              ├─► Guardar mensaje en DB
                              │
                              └─► message.received → Frontend (MQTT)
```

### 3. Ejecutar Herramienta (Tool Calling)

```
ai-gateway → tool_calls en respuesta
        │
        ▼
   ai-agent-framework → tool.call.request → tool-orchestrator
                                                    │
                                                    ├─► Validar args
                                                    ├─► Ejecutar handler
                                                    │
                                                    ▼
                                             tool.call.response
                                                    │
                                                    ▼
                                          ai-agent-framework
                                          (continúa con resultado)
```

---

## Ubicación de Módulos

```
event-core/modules/
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

---

## Interfaz de Usuario

> **Ver CONTEXT_UI.md para documentación completa de UI**
>
> - Estructura de barras (superior, lateral, chat sandwich)
> - Triple interacción (tap, doubleTap, longPress)
> - Componentes base (ToolbarIcon, FloatingPanel, ActionForm, etc.)
> - Patrones de diseño móvil

### Mapeo Botones → Módulos → Componentes

| Botón | Módulo | Componente | Gestos |
|-------|--------|------------|--------|
| 🤖 Modelo | ai-gateway | `AISelector` | tap: lista, long: config |
| 🔑 Credencial | credential-manager | `CredentialSelector` | tap: ver, 2x: añadir |
| 📝 Prompt | prompt-manager | `SlotSelector` | tap: slots, 2x: añadir, long: presets |
| 💬 Chat | conversation-manager | `ConversationPanel` | tap: chat/lista, 2x: nueva, long: config |
| 📁 Proyecto | project-manager | (pendiente) | tap: selector, 2x: crear |
| 📎 Adjuntar | storage-manager | (pendiente) | tap: archivos, 2x: subir |
| 📂 Explorar | file-browser | (pendiente) | tap: explorar |
| 🎤 Voz | Web Speech API | (nativo) | tap: dictado |
| 📷 Cámara | MediaDevices API | (nativo) | tap: capturar |

### Componentes Implementados

```
frontend/src/lib/components/
├── ai/
│   └── AISelector.svelte         # Selector de modelo/proveedor
├── credentials/
│   └── CredentialSelector.svelte # Gestión de API keys
├── prompts/
│   └── SlotSelector.svelte       # Gestión de prompts por slot
└── conversations/
    └── ConversationPanel.svelte  # Chat + gestión conversaciones
```

---

## Especificación de Botones Chat

### 🤖 Modelo (ai-gateway)

**1 TAP**: Panel selector con modelos agrupados por proveedor
**2 TAPS**: Modal configuración (temperature, max_tokens, top_p)
**LONG-PRESS**: Modal gestión de proveedores (stats, prioridad, test)

**Integración**: El modelo se guarda en `conversation.ai_settings`

---

### 🔑 Credencial (credential-manager)

**1 TAP**: Panel selector con credenciales por proveedor/nivel
**2 TAPS**: Modal crear nueva credencial
**LONG-PRESS**: Modal gestión de credenciales (editar, eliminar, test)

**Formato de Key**: `{PROVIDER}_API_KEY_{LEVEL}[_{IDENTIFIER}]`

---

### 📝 Prompt (prompt-manager)

**1 TAP**: Panel selector con prompts recientes/favoritos
**2 TAPS**: Modal crear nuevo prompt
**LONG-PRESS**: Modal gestión de prompts (editar, duplicar, stats)

---

### 💬 Chat (conversation-manager) - `ConversationPanel`

**Componente**: `frontend/src/lib/components/conversations/ConversationPanel.svelte`

**1 TAP**: Chat activo o lista de conversaciones agrupada por fecha
**2 TAPS**: Modal crear nueva conversación
**LONG-PRESS**: Modal configuración de conversación activa

**Modos del Panel**:
| Modo | Descripción |
|------|-------------|
| `list` | Lista agrupada por secciones temporales (Hoy, Ayer, etc.) |
| `chat` | Interfaz de chat con mensajes y input |
| `create` | Formulario nueva conversación |
| `settings` | Config + zona de peligro (eliminar) |

**Props**:
```svelte
<ConversationPanel
  projectId="mi-proyecto"  <!-- Requerido -->
  size="md"
  on:select={...}
  on:message={...}
  on:create={...}
  on:delete={...}
/>
```

**Eventos**:
- `select`: Conversación seleccionada
- `message`: Mensaje enviado (con respuesta AI)
- `create`: Nueva conversación creada
- `delete`: Conversación eliminada

---

### 📁 Proyecto (project-manager)

**1 TAP**: Panel selector de proyectos
**2 TAPS**: Modal crear nuevo proyecto
**LONG-PRESS**: Modal gestión de proyectos (editar, stats, exportar)

**Importancia**: El proyecto es el contexto raíz - cada uno tiene su propia DB y storage.

---

### 📎 Adjuntar (storage-manager)

**1 TAP**: Panel selector de archivos del proyecto
**2 TAPS**: Modal subir archivo (drag & drop)
**LONG-PRESS**: Modal gestión de archivos (ver, descargar, eliminar)

Los archivos se adjuntan como referencias en los mensajes:
```javascript
attachments: [{ type: "file", file_id: "abc123", name: "doc.pdf", mime_type: "application/pdf" }]
```

---

### 📂 Explorar (file-browser + pdf-viewer + text-editor)

**1 TAP**: Panel explorador de archivos
**2 TAPS**: Modal visor/editor según tipo de archivo
**LONG-PRESS**: Modal gestión de archivos con búsqueda

**Módulos involucrados**:
- `file-browser`: Navegación y estructura
- `pdf-viewer`: Visualización de PDFs
- `text-editor`: Edición de texto (json, md, txt, js, etc.)

---

### 🎤 Voz (Web Speech API - Nativo)

**1 TAP**: Iniciar dictado (SpeechRecognition)
**2 TAPS**: Modal configuración de voz
**LONG-PRESS**: Leer último mensaje del asistente (SpeechSynthesis)

No requiere módulo backend - usa APIs nativas del navegador.

---

### 📷 Cámara (MediaDevices API - Nativo)

**1 TAP**: Capturar foto
**2 TAPS**: Modal configuración de cámara
**LONG-PRESS**: Galería de capturas recientes

Las imágenes se suben via storage-manager. Compatible con modelos multimodales.

---

## Notas de Implementación

1. **Persistencia**: Todos los módulos usan eventos para persistir en database-manager
2. **Aislamiento**: Cada proyecto tiene su propia base de datos y storage
3. **DB por Proyecto**: conversation-manager usa `ensureProjectSchema(projectId)` para lazy init
4. **Correlación**: Siempre propagar `correlation_id` para trazabilidad
5. **Context Window**: Configurable por conversación (default: 20 mensajes)
6. **Fallback**: ai-gateway hace fallback automático entre proveedores
7. **Costos**: Se trackean tokens y costos por mensaje en conversation-manager
8. **Attachments**: Archivos se suben a storage-manager y se referencian en mensajes
9. **UI-Ready**: Endpoints `/ui/state` devuelven datos listos para pintar en componentes

---

## Página de Pruebas

Todos los componentes se pueden probar en `/pruebas`:

```svelte
<AISelector size="lg" />
<CredentialSelector size="lg" />
<SlotSelector size="lg" />
<ConversationPanel size="lg" projectId="test-project" />
```

---

*Última actualización: 2025-12-08*
*Versión: 2.1.0*
