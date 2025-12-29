# Plan de Integración del Chat

**Fecha:** 2025-12-29
**Estado:** En definición
**Objetivo:** Integrar todos los módulos en un flujo de chat unificado

---

## Visión General

Cada proyecto es un **mundo aislado** dentro del sistema, pero accede a **recursos compartidos** del sistema (credenciales, plugins, tools). El chat es el punto central de interacción.

```
┌─────────────────────────────────────────────────────────────┐
│                      SISTEMA GLOBAL                         │
│  • Config base (DeepSeek default)                          │
│  • Prompt base nuevos proyectos                            │
│  • Recursos compartidos (credenciales, plugins, tools)     │
└─────────────────────────────────────────────────────────────┘
           │              │              │
           ▼              ▼              ▼
    ┌───────────┐  ┌───────────┐  ┌───────────┐
    │ Proyecto A│  │ Proyecto B│  │ Proyecto C│
    │───────────│  │───────────│  │───────────│
    │• /data/A/ │  │• /data/B/ │  │• /data/C/ │
    │• Sus conv │  │• Sus conv │  │• Sus conv │
    │• Su estado│  │• Su estado│  │• Su estado│
    │• Hereda   │  │• Hereda   │  │• Hereda   │
    │  global   │  │  global   │  │  global   │
    └───────────┘  └───────────┘  └───────────┘
```

---

## Módulos Definidos

### 1. AI Gateway

| Decisión | Valor | Notas |
|----------|-------|-------|
| Cambio proveedor/modelo | Selector desde UI | No comandos, solo UI |
| Mostrar costos/tokens | No | Oculto al usuario |
| Streaming | No | Respuesta completa |
| Proveedor default | DeepSeek | Configurable por proyecto |

**Implementación:**
- Selector en header/sidebar del chat
- Dropdown con proveedores disponibles
- Modelos filtrados por proveedor seleccionado
- NO se encarga de traducir formatos de tools (delegado a tool-translator)

---

### 2. Project Manager

| Decisión | Valor | Notas |
|----------|-------|-------|
| Config inicial | Global (DeepSeek) | Override opcional por proyecto |
| Prompt nuevos proyectos | Prompt base del sistema | Heredado, modificable |
| Directorio proyecto | `/data/projects/{nombre}/` | Aislado por proyecto |
| Conversaciones | Solo las del proyecto | Filtrado por project_id |
| Estado sesión | Persistir última sesión | Retomar donde quedó |
| Filosofía | Mundo aislado + acceso a recursos compartidos | |

**Campos a persistir en sesión:**
- `last_conversation_id` - Última conversación abierta
- `scroll_position` - Posición del scroll
- `context_config` - Configuración de contexto
- `ui_state` - Estado de paneles (abiertos/cerrados)

**Estructura de directorio:**
```
/data/projects/
  └── {nombre-proyecto}/
      ├── files/          # Archivos del proyecto
      ├── exports/        # Exportaciones
      └── cache/          # Cache temporal
```

---

### 3. Conversation Manager

| Decisión | Valor | Notas |
|----------|-------|-------|
| Context window | 20 mensajes (default) | Configurable dinámicamente |
| Attachments | Soportado | Archivos adjuntos en mensajes |
| Editar mensaje | No | Descartado |
| Checkbox contexto | Sí | Activar/desactivar por mensaje |
| Máximo contexto | 20 (configurable) | Límite fijo |
| Auto-gestión | FIFO | Antiguos se desactivan automáticamente |

#### Sistema de Contexto Auto-gestionado

**Lógica de funcionamiento:**

```
┌─────────────────────────────────────────────────────┐
│ Proyecto X  │  Conv: "Debug API"                    │
├─────────────────────────────────────────────────────┤
│                                    Contexto: [15]   │ ← contador visible
├─────────────────────────────────────────────────────┤
│ [ ] Msg 1  (auto-desactivado, superó límite)       │
│ [ ] Msg 2  (auto-desactivado)                      │
│ [✓] Msg 3  ← activo                                │
│ [ ] Msg 4  ← desactivado manualmente               │
│ [✓] Msg 5  ← activo                                │
│ [✓] ...                                            │
│ [✓] Msg 20 ← activo (más reciente)                 │
└─────────────────────────────────────────────────────┘
```

**Reglas:**

| Regla | Comportamiento |
|-------|----------------|
| Máximo | 20 activos (configurable por usuario) |
| Nuevos mensajes | Se activan automáticamente |
| Si supera máximo | El más antiguo ACTIVO se desactiva (FIFO) |
| Manual OFF | Usuario desactiva → queda OFF permanentemente |
| Manual ON | Usuario reactiva → si hay 20, desactiva otro antiguo |
| Contador | Siempre visible en UI |

**Campos en tabla `messages`:**
```sql
ALTER TABLE messages ADD COLUMN in_context BOOLEAN DEFAULT TRUE;
ALTER TABLE messages ADD COLUMN manually_toggled BOOLEAN DEFAULT FALSE;
```

**Algoritmo al enviar mensaje:**
```javascript
async function addMessageToContext(conversationId, newMessage) {
  const maxContext = conversation.max_context || 20;

  // 1. Contar mensajes activos actuales
  const activeCount = await countActiveMessages(conversationId);

  // 2. Si supera límite, desactivar el más antiguo NO manualmente fijado
  if (activeCount >= maxContext) {
    await deactivateOldestAutoMessage(conversationId);
  }

  // 3. Insertar nuevo mensaje como activo
  await insertMessage(newMessage, { in_context: true });

  // 4. Actualizar contador en UI
  emitContextCountUpdate(conversationId);
}
```

---

### 4. Sistema de Tools (Function Calling Nativo)

#### Decisión Arquitectural

**Enfoque elegido:** Function Calling Nativo con módulo traductor separado.

**Razón:** Todos los proveedores (Claude, OpenAI, DeepSeek, Ollama) soportan function calling. En lugar de sobrecargar ai-gateway con traducciones, se crea un módulo dedicado.

#### Arquitectura de Tools

```
┌─────────────────────────────────────────────────────────────┐
│                    conversation-manager                      │
│  • Recibe mensaje del usuario                               │
│  • Obtiene TODAS las tools del sistema                      │
│  • Pasa mensaje + tools al flujo                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    tool-translator (NUEVO)                   │
│                                                              │
│  • Recibe tools en formato interno                          │
│  • Detecta proveedor destino (Claude/OpenAI/DeepSeek/etc)   │
│  • Traduce al formato correcto del proveedor                │
│  • Traduce respuestas de vuelta (tool_calls → interno)      │
│  • Fallback prompt-based para Ollama sin soporte nativo     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      ai-gateway                              │
│                                                              │
│  • Solo comunicación con proveedores                        │
│  • Fallback entre proveedores                               │
│  • Rate limiting                                            │
│  • Tracking de costos                                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼ (si hay tool_call)
┌─────────────────────────────────────────────────────────────┐
│                    tool-orchestrator                         │
│                                                              │
│  • Registry central de TODAS las tools                      │
│  • Validación de argumentos (JSON Schema)                   │
│  • Ejecución de tools                                       │
│  • Timeout y permisos                                       │
└─────────────────────────────────────────────────────────────┘
```

#### 4.1 tool-translator (NUEVO MÓDULO)

**Responsabilidad:** Traducir formatos de tools entre el sistema interno y cada proveedor.

**Formatos por proveedor:**

| Proveedor | Formato tools | Formato respuesta |
|-----------|---------------|-------------------|
| OpenAI | `tools: [{type: "function", function: {...}}]` | `tool_calls: [{id, function: {name, arguments}}]` |
| Claude | `tools: [{name, description, input_schema}]` | `tool_use: [{id, name, input}]` |
| DeepSeek | Igual que OpenAI | Igual que OpenAI |
| Ollama | Variable (algunos sí, otros no) | Fallback a prompt-based |

**Formato interno unificado:**
```javascript
// Tool definition
{
  name: "file.search",
  module: "file-browser",
  description: "Busca texto dentro de archivos del proyecto",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Texto o regex a buscar" },
      path: { type: "string", description: "Directorio base" },
      extensions: { type: "array", description: "Filtrar por extensiones" }
    },
    required: ["query"]
  },
  handler: Function,
  permissions: ["read"],
  timeout_ms: 30000,
  requires_confirmation: false
}

// Tool call (de la IA)
{
  id: "call_abc123",
  tool: "file.search",
  arguments: { query: "login", path: "/src" }
}

// Tool result (para la IA)
{
  tool_call_id: "call_abc123",
  success: true,
  result: { files: [...], matches: 15 }
}
```

**Traducciones:**
```javascript
// Interno → OpenAI
{
  type: "function",
  function: {
    name: "file_search",  // Puntos → underscores
    description: "Busca texto dentro de archivos del proyecto",
    parameters: { type: "object", properties: {...} }
  }
}

// Interno → Claude
{
  name: "file_search",
  description: "Busca texto dentro de archivos del proyecto",
  input_schema: { type: "object", properties: {...} }
}

// Fallback prompt-based (Ollama sin soporte)
<available_tools>
- file.search: Busca texto en archivos. Args: query (string), path (string)
- file.read: Lee un archivo. Args: path (string)
</available_tools>

Para usar una tool, responde con: [TOOL:nombre]({"arg":"valor"})
```

#### 4.2 tool-orchestrator (EXISTENTE - MODIFICAR)

**Cambios necesarios:**

| Cambio | Descripción |
|--------|-------------|
| Escuchar `tool.register.request` | Actualmente no escucha este evento |
| API GET /tools | Listar todas las tools registradas |
| Ejecución paralela | Múltiples tool calls simultáneos |
| Validación JSON Schema | Ya existe, verificar |
| Timeout por tool | Configurable |
| Permisos | Sistema de permisos por tool |

#### 4.3 Registro de Tools (Auto-descubrimiento)

Cada módulo registra sus tools al cargar:

```javascript
// En módulo file-browser/index.js
async onLoad(core) {
  // Registrar tools
  await this.registerTools(core);
}

async registerTools(core) {
  await core.eventBus.publish('tool.register.request', {
    module: 'file-browser',
    tools: [
      {
        name: 'file.list',
        description: 'Lista archivos de un directorio',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directorio a listar' },
            recursive: { type: 'boolean', default: false }
          },
          required: ['path']
        },
        handler: 'handleListFiles'  // Nombre del método
      },
      {
        name: 'file.search',
        description: 'Busca texto en archivos',
        parameters: {...},
        handler: 'handleSearchFiles'
      },
      {
        name: 'file.read',
        description: 'Lee el contenido de un archivo',
        parameters: {...},
        handler: 'handleReadFile'
      }
    ]
  });
}
```

#### 4.4 Tools por Módulo

| Módulo | Tools a registrar |
|--------|-------------------|
| **file-browser** | `file.list`, `file.search`, `file.read`, `file.info` |
| **text-editor** | `editor.open`, `editor.save`, `editor.create` |
| **pdf-viewer** | `pdf.read`, `pdf.extract`, `pdf.info` |
| **database-manager** | `db.query`, `db.tables`, `db.schema` |
| **storage-manager** | `storage.upload`, `storage.download`, `storage.list`, `storage.delete` |
| **notes** | `notes.create`, `notes.list`, `notes.search`, `notes.update` |
| **prompt-manager** | `prompt.get`, `prompt.list`, `prompt.render` |
| **project-manager** | `project.info`, `project.files`, `project.config` |
| **credential-manager** | `credential.list` (solo nombres, no valores) |

#### 4.5 Flujo Completo de Tool Calling

```
1. Usuario escribe: "busca dónde se usa la función login"
   │
   ▼
2. conversation-manager
   ├─► Carga contexto (mensajes activos con checkbox ON)
   ├─► Carga prompt del proyecto
   ├─► GET /tools → obtiene TODAS las tools
   │
   ▼
3. tool-translator
   ├─► Detecta proveedor activo (ej: Claude)
   ├─► Traduce tools a formato Claude
   │
   ▼
4. ai-gateway
   ├─► Envía a Claude con tools traducidas
   ├─► Recibe respuesta
   │
   ▼
5. tool-translator (respuesta)
   ├─► Detecta tool_use en respuesta
   ├─► Traduce a formato interno: { tool: "file.search", arguments: {...} }
   │
   ▼
6. tool-orchestrator
   ├─► Valida argumentos
   ├─► Ejecuta handler de file-browser
   ├─► Retorna resultado
   │
   ▼
7. tool-translator
   ├─► Formatea resultado para Claude
   │
   ▼
8. ai-gateway
   ├─► Envía resultado a Claude
   ├─► Recibe respuesta final
   │
   ▼
9. conversation-manager
   ├─► Guarda respuesta
   ├─► Actualiza contexto FIFO
   ├─► Notifica UI
   │
   ▼
10. Usuario ve: "Encontré 'login' en: src/auth.js:45, src/api.js:120..."
```

#### 4.6 Casos Especiales

**Tool calls múltiples (paralelos):**
```javascript
// La IA pide varias tools a la vez
{
  tool_calls: [
    { tool: "file.search", args: { query: "login" } },
    { tool: "file.search", args: { query: "logout" } }
  ]
}
// → Ejecutar en paralelo, agregar resultados
```

**Tool calls encadenados:**
```javascript
// Loop hasta respuesta final (máximo 10 iteraciones)
1. IA pide: file.search("config")
2. Sistema ejecuta, retorna: ["config.json", "config.yaml"]
3. IA pide: file.read("config.json")
4. Sistema ejecuta, retorna: { contenido... }
5. IA responde al usuario con la info
```

**Tools que fallan:**
```javascript
// Retornar error a la IA para que maneje
{
  tool_call_id: "call_123",
  success: false,
  error: "File not found: /path/to/file.txt"
}
// La IA debe responder gracefully al usuario
```

**Tools peligrosas:**
```javascript
// Requieren confirmación del usuario
{
  name: "file.delete",
  requires_confirmation: true,
  permissions: ["write", "delete"]
}
// UI muestra modal: "¿Permitir eliminar archivo X?"
```

**Ollama sin function calling:**
```javascript
// Fallback a prompt-based
// 1. Añadir tools al system prompt
// 2. Parsear respuesta buscando [TOOL:name](args)
// 3. Ejecutar y re-enviar resultado
```

#### 4.7 Configuración

```javascript
// config.json o por proyecto
{
  "tools": {
    "enabled": true,
    "max_calls_per_message": 10,       // Límite de iteraciones
    "timeout_ms": 30000,               // Timeout por tool
    "parallel_execution": true,        // Ejecutar en paralelo
    "require_confirmation_for": [      // Tools que piden confirmación
      "file.delete",
      "storage.delete",
      "db.drop"
    ],
    "disabled_tools": [],              // Tools bloqueadas globalmente
    "ollama_fallback": true            // Usar prompt-based para Ollama
  }
}
```

#### 4.8 UI Necesaria

| Elemento | Función |
|----------|---------|
| Indicador "🔧 Ejecutando..." | Feedback mientras ejecuta tool |
| Badge de tool ejecutada | "file.search ✓" (opcional, colapsable) |
| Modal confirmación | Para tools con `requires_confirmation: true` |
| Config de tools | Panel para habilitar/deshabilitar (opcional) |

#### 4.9 Observabilidad

```javascript
// Logs
logger.info('tool.called', { tool: 'file.search', args: {...} });
logger.info('tool.completed', { tool: 'file.search', duration_ms: 45 });
logger.error('tool.failed', { tool: 'file.read', error: 'Not found' });

// Métricas
metrics.increment('tool.calls.total', { tool: 'file.search' });
metrics.timing('tool.duration', 45, { tool: 'file.search' });
metrics.increment('tool.errors', { tool: 'file.read', reason: 'not_found' });

// System Inspector
// Todas las tool calls se capturan en /data/system-console.json
```

---

### 5. Calling Generator

**Estado:** Se integra con el sistema de tools.

**Responsabilidad:**
- Generar definiciones de tools dinámicamente (si es necesario)
- Puede usarse para crear tools desde plugins

**Integración:**
- Publica `tool.register.request` → tool-orchestrator escucha y registra

---

## Módulos Pendientes de Definir

| # | Módulo | Estado |
|---|--------|--------|
| 5 | Prompt Manager | ⏳ Pendiente |
| 6 | Plugin Manager | ⏳ Pendiente |
| 7 | Credential Manager | ⏳ Pendiente |
| 8 | Storage Manager | ⏳ Pendiente |
| 9 | Database Manager | ⏳ Pendiente |
| 10 | File Browser | ⏳ Pendiente |
| 11 | Text Editor | ⏳ Pendiente |
| 12 | PDF Viewer | ⏳ Pendiente |

---

## Flujo General del Chat (Actualizado)

```
Usuario escribe mensaje
        │
        ▼
┌─────────────────────────┐
│ Conversation Manager    │
│ • Guarda mensaje        │
│ • Gestiona contexto     │
│ • Obtiene ALL tools     │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│   Prompt Manager        │
│ • Prompt del proyecto   │
│ • System prompt         │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│   Tool Translator       │
│ • Traduce tools al      │
│   formato del proveedor │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│    AI Gateway           │
│ • Envía a proveedor     │
│ • Recibe respuesta      │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│   Tool Translator       │
│ • Traduce tool_calls    │
│   a formato interno     │
└─────────┬───────────────┘
          │
    ¿Tool call?
     /        \
   Sí          No
   │            │
   ▼            │
┌─────────────┐ │
│Tool Orchest.│ │
│• Valida     │ │
│• Ejecuta    │ │
│• Retorna    │ │
└──────┬──────┘ │
       │        │
       ▼        │
  Loop hasta    │
  respuesta     │
  final         │
       │        │
       ▼        ▼
┌─────────────────────────┐
│ Conversation Manager    │
│ • Guarda respuesta      │
│ • Actualiza contexto    │
│ • Notifica UI           │
└─────────────────────────┘
```

---

## Checklist de Implementación

### tool-translator (NUEVO)
- [ ] Crear módulo `modules/tool-translator/`
- [ ] Traducir tools interno → OpenAI format
- [ ] Traducir tools interno → Claude format
- [ ] Traducir tools interno → DeepSeek format
- [ ] Fallback prompt-based para Ollama
- [ ] Traducir tool_calls de respuesta → interno
- [ ] Traducir resultados interno → proveedor

### tool-orchestrator (MODIFICAR)
- [ ] Escuchar `tool.register.request`
- [ ] API GET /tools (listar todas)
- [ ] Ejecución paralela de múltiples tools
- [ ] Sistema de permisos por tool
- [ ] Confirmación para tools peligrosas
- [ ] Timeout configurable por tool

### ai-gateway (MODIFICAR)
- [ ] Recibir tools ya traducidas (no traduce)
- [ ] Loop de tool calls hasta respuesta final
- [ ] Límite de iteraciones (max 10)

### conversation-manager (MODIFICAR)
- [ ] Obtener tools del orchestrator
- [ ] Pasarlas al flujo
- [ ] Guardar tool calls en historial (opcional)

### Módulos (CADA UNO)
- [ ] file-browser: registrar file.list, file.search, file.read
- [ ] text-editor: registrar editor.open, editor.save, editor.create
- [ ] pdf-viewer: registrar pdf.read, pdf.extract
- [ ] database-manager: registrar db.query, db.tables
- [ ] storage-manager: registrar storage.upload, storage.download, storage.list
- [ ] notes: registrar notes.create, notes.list, notes.search
- [ ] prompt-manager: registrar prompt.get, prompt.list
- [ ] project-manager: registrar project.info, project.files

### UI
- [ ] Indicador "ejecutando tool"
- [ ] Modal confirmación tools peligrosas
- [ ] Badge de tool ejecutada (opcional)

---

## Notas Adicionales

- **System Inspector:** Módulo de observabilidad para que Claude pueda consultar estado del sistema en `/data/system-console.json`.
- **ai-agent-framework:** Disponible para crear agentes especializados, pero el chat principal usa function calling nativo.

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2025-12-28 | Documento inicial con AI Gateway, Project Manager, Conversation Manager |
| 2025-12-29 | Añadido sistema de Tools completo: tool-translator, tool-orchestrator, flujo, casos especiales |

