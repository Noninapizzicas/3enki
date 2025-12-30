# Plan de Integración del Chat

**Fecha:** 2025-12-29
**Actualizado:** 2025-12-30
**Estado:** ✅ Implementado (verificado contra código real)
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

## Módulos Implementados

### 1. AI Gateway ✅

**Estado:** Implementado en `modules/ai-gateway/`

| Decisión | Valor | Notas |
|----------|-------|-------|
| Cambio proveedor/modelo | Selector desde UI | APIs: `/ui/state`, `/ui/select` |
| Mostrar costos/tokens | Sí (interno) | Tracking habilitado |
| Streaming | Sí | `/chat/stream` con SSE |
| Proveedor default | DeepSeek | Configurable por proyecto |

**APIs implementadas (12):**
- `POST /chat` - Chat completion
- `POST /chat/stream` - Chat con streaming SSE
- `GET /providers` - Listar proveedores
- `GET /models` - Listar modelos por proveedor
- `GET /usage` - Estadísticas de uso y costos
- `POST /providers/test` - Probar conectividad
- `GET /ui/state` - Estado completo para UI
- `POST /ui/select` - Seleccionar provider/modelo
- `GET /ui/config` - Configuración LLM
- `POST /ui/config` - Actualizar configuración
- `GET /tools` - Listar tools disponibles
- `POST /tools/:name/execute` - Ejecutar tool

**Proveedores soportados:**
- DeepSeek (prioridad 1)
- Anthropic/Claude (prioridad 2)
- OpenAI (prioridad 3)
- Ollama (prioridad 4, local)

---

### 2. Project Manager ✅

**Estado:** Implementado en `modules/project-manager/`

| Decisión | Valor | Notas |
|----------|-------|-------|
| Config inicial | Global (DeepSeek) | Override opcional por proyecto |
| Prompt nuevos proyectos | Prompt base del sistema | Heredado, modificable |
| Directorio proyecto | `/data/projects/{nombre}/` | Aislado por proyecto |
| Conversaciones | Solo las del proyecto | Filtrado por project_id |
| Estado sesión | Persistir última sesión | Retomar donde quedó |
| Filosofía | Mundo aislado + acceso a recursos compartidos | |

**Estructura de directorio:**
```
/data/projects/
  └── {nombre-proyecto}/
      ├── files/          # Archivos del proyecto
      ├── exports/        # Exportaciones
      └── cache/          # Cache temporal
```

---

### 3. Conversation Manager ✅

**Estado:** Implementado en `modules/conversation-manager/`

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

---

### 4. Sistema de Tools (Arquitectura Unificada) ✅

**Estado:** Implementado en `core/modules/loader.js` + `modules/ai-gateway/`

> **NOTA:** La arquitectura original con `tool-translator` y `tool-orchestrator` como módulos separados fue **unificada** en el Module Loader y AI Gateway.

#### Arquitectura Real Implementada

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FLUJO DE TOOLS                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────┐                    ┌─────────────────────┐
  │   MÓDULOS LOCALES   │                    │   PLUGINS EXTERNOS  │
  │   (filesystem, db)  │                    │   (github, slack)   │
  └──────────┬──────────┘                    └──────────┬──────────┘
             │                                          │
             │ module.json                              │ plugin.json
             │ + tools[]                                │
             ▼                                          ▼
  ┌─────────────────────┐                    ┌─────────────────────┐
  │    Module Loader    │                    │   Plugin Manager    │
  │  registerToolsForAI │                    │                     │
  └──────────┬──────────┘                    └──────────┬──────────┘
             │                                          │
             │                                          ▼
             │                               ┌─────────────────────┐
             │                               │  Calling Generator  │
             │                               │  registerToolForAI  │
             │                               └──────────┬──────────┘
             │                                          │
             └─────────────────┬────────────────────────┘
                               │
                               ▼
                ┌───────────────────────────┐
                │  moduleLoader.toolsRegistry│
                │                           │
                │  Map<toolName, {          │
                │    name,                  │
                │    description,           │
                │    parameters,            │
                │    handler,               │
                │    module,                │
                │    confirmation           │
                │  }>                       │
                └─────────────┬─────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌───────────┐      ┌───────────┐      ┌───────────┐
    │    UI     │      │    AI     │      │  Módulos  │
    │ (MQTT)    │      │ (Gateway) │      │ (eventBus)│
    └─────┬─────┘      └─────┬─────┘      └─────┬─────┘
          │                  │                  │
          │ mqttRequest      │ tool_calls       │ eventBus
          │                  ▼                  │
          │           ┌─────────────┐           │
          │           │executeToolCalls()      │
          │           └──────┬──────┘           │
          │                  │                  │
          └─────────────────►├◄─────────────────┘
                             │
                             ▼
                ┌───────────────────────────┐
                │ moduleLoader.executeTool  │
                │                           │
                │ 1. Get tool from registry │
                │ 2. Check confirmation     │
                │ 3. Execute handler        │
                │ 4. Return result          │
                └───────────────────────────┘
```

#### APIs del Module Loader (interno)

| Método | Descripción |
|--------|-------------|
| `getToolsForAI()` | Retorna tools en formato AI |
| `getTool(name)` | Obtiene tool por nombre |
| `executeTool(name, args)` | Ejecuta tool |
| `toolRequiresConfirmation(name)` | Verifica si requiere confirmación |

#### Traducción de Tools (en ai-gateway)

El `ai-gateway` incluye un `tool-translator.js` interno que traduce automáticamente:

| Proveedor | Formato tools | Formato respuesta |
|-----------|---------------|-------------------|
| OpenAI | `tools: [{type: "function", function: {...}}]` | `tool_calls: [{id, function: {name, arguments}}]` |
| Claude | `tools: [{name, description, input_schema}]` | `tool_use: [{id, name, input}]` |
| DeepSeek | Igual que OpenAI | Igual que OpenAI |
| Ollama | Variable | Fallback a prompt-based |

---

### 5. Calling Generator ✅

**Estado:** Implementado en `modules/calling-generator/`

**Responsabilidad:**
- Genera funciones ejecutables desde definiciones de plugins
- Registra tools de plugins externos en el toolsRegistry
- Publica eventos: `function.generated`, `function.executed`, `function.failed`

**APIs:**
- `GET /functions` - Listar funciones generadas
- `GET /functions/:name` - Obtener metadata
- `POST /functions/:name/execute` - Ejecutar función

---

### 6. Prompt Manager ✅

**Estado:** Implementado en `modules/prompt-manager/`

| Decisión | Valor | Notas |
|----------|-------|-------|
| Selección prompt | Usuario elige | Desde UI del proyecto |
| Tipos de prompt | Simple o combinado | Múltiples prompts encadenados |
| Gestión | Catálogo centralizado | Ordenados, categorizados |
| Slots | system, context, prefix, suffix, format | 5 tipos de slot |
| Versionado | Sí | Hasta 10 versiones por prompt |

**Tools implementadas:**
```javascript
[
  { name: "prompt.list", description: "Lista prompts disponibles" },
  { name: "prompt.get", description: "Obtiene contenido de un prompt" },
  { name: "prompt.render", description: "Renderiza prompt con variables" }
]
```

**APIs (16):**
- CRUD de prompts (`/prompts`)
- Gestión de presets (`/presets`)
- Versionado (`/prompts/:id/versions`)
- Renderizado (`/prompts/:id/render`)
- Analytics (`/analytics`)
- Estado UI (`/ui/state`)

---

### 7. Plugin Manager ✅

**Estado:** Implementado en `modules/plugin-manager/`

| Decisión | Valor | Notas |
|----------|-------|-------|
| Alcance | Sistema (no por proyecto) | Plugins disponibles globalmente |
| Registro | Dinámico | Plugins pueden registrar tools |
| Estado | Habilitar/deshabilitar | Toggle global |

**APIs:**
- `GET /plugins` - Listar plugins
- `GET /plugins/:name` - Obtener plugin específico
- `POST /plugins/reload` - Recargar todos los plugins

**Plugins disponibles** (en `/plugins/`):
- `github` - Integración GitHub API
- `slack` - Integración Slack API
- `weather` - API del clima
- `http-utils` - Utilidades HTTP

---

### 8. Credential Manager ✅

**Estado:** Implementado en `modules/credential-manager/`

| Decisión | Valor | Notas |
|----------|-------|-------|
| Acceso IA | Solo nombres | NUNCA valores de credenciales |
| Niveles | GLOBAL, PROJECT, CLIENT, CUSTOM | Cascada de resolución |
| Proveedores | OPENAI, DEEPSEEK, ANTHROPIC, OLLAMA | 4 proveedores |

**Tool implementada:**
```javascript
{
  name: "credential.list",
  description: "Lista nombres de credenciales disponibles por proveedor y nivel",
  // NOTA: Solo retorna metadata (provider, level, identifier), NUNCA valores
}
```

**APIs (9):**
- CRUD de credenciales (`/credentials`)
- Resolución por cascada (`/credentials/resolve`)
- Niveles disponibles (`/credentials/levels`)
- Test de API key (`/ui/test`)

---

### 9. Filesystem ✅ (reemplaza storage-manager + file-browser)

**Estado:** Implementado en `modules/filesystem/`

> **NOTA:** Este módulo unifica las funcionalidades de `storage-manager` y `file-browser` del plan original.

| Decisión | Valor | Notas |
|----------|-------|-------|
| Función | Operaciones de archivos del sistema | Unificado |
| Alcance | Todo el sistema | No solo por proyecto |
| Permisos | Lectura libre | Escritura/borrado con confirmación |

**Tools implementadas (11):**
```javascript
[
  { name: "fs.list", description: "Lista archivos de un directorio" },
  { name: "fs.read", description: "Lee contenido de un archivo" },
  { name: "fs.write", description: "Escribe contenido", confirmation: true },
  { name: "fs.delete", description: "Elimina archivo/carpeta", confirmation: true },
  { name: "fs.mkdir", description: "Crea directorio" },
  { name: "fs.move", description: "Mueve archivo/carpeta", confirmation: true },
  { name: "fs.copy", description: "Copia archivo" },
  { name: "fs.search", description: "Busca archivos por nombre o contenido" },
  { name: "fs.info", description: "Obtiene metadatos de archivo" },
  { name: "fs.cleanup", description: "Limpia archivos temporales" },
  { name: "fs.stats", description: "Estadísticas de uso del storage" }
]
```

**Handlers MQTT:**
- `fs.list`, `fs.read`, `fs.write`, `fs.delete`
- `fs.mkdir`, `fs.move`, `fs.copy`, `fs.search`
- `fs.info`, `fs.cleanup`, `fs.stats`

---

### 10. Database Manager ✅

**Estado:** Implementado en `modules/database-manager/`

| Decisión | Valor | Notas |
|----------|-------|-------|
| Motor | SQLite via sql.js | JavaScript puro, sin compilación nativa |
| Seguridad | Solo lectura por defecto | Escritura requiere confirmación |
| Alcance | Por proyecto | Cada proyecto tiene su DB |

**Tools implementadas (4):**
```javascript
[
  { name: "db.query", description: "Ejecuta consulta SQL (solo SELECT)" },
  { name: "db.tables", description: "Lista tablas de la base de datos" },
  { name: "db.schema", description: "Obtiene esquema de una tabla" },
  { name: "db.execute", description: "Ejecuta consulta modificadora", requires_confirmation: true }
]
```

**APIs (8):**
- `GET /databases` - Listar bases de datos
- `POST /databases/:projectId/query` - Ejecutar query
- `GET /databases/:projectId/schema` - Obtener schema
- `POST /databases/:projectId/init` - Inicializar schema
- `DELETE /databases/:projectId` - Eliminar DB
- `GET /databases/:projectId/tables` - Listar tablas

---

### 11. Text Editor ⚠️ (parcial)

**Estado:** Implementado en `modules/text-editor/` - **SIN TOOLS para AI**

| Decisión | Valor | Notas |
|----------|-------|-------|
| Función | Edición de archivos | Integrado en UI |
| Formatos | md, json, txt, html, css, js, yaml, xml | 9 formatos |
| Integración AI | ❌ No implementada | Solo APIs HTTP |

**APIs implementadas (4):**
- `GET /editor/open` - Abrir archivo
- `POST /editor/save` - Guardar archivo
- `POST /editor/validate` - Validar JSON
- `POST /editor/format` - Formatear JSON

**Pendiente:**
- [ ] Agregar tools: `editor.open`, `editor.save`, `editor.create`
- [ ] Actualizar dependencia de `file-browser` → `filesystem`

---

### 12. PDF Viewer ✅

**Estado:** Implementado en `modules/pdf-viewer/`

| Decisión | Valor | Notas |
|----------|-------|-------|
| Función | Lectura y extracción de PDFs | Con pdftotext |
| Parser primario | pdftotext (poppler-utils) | Sin dependencias npm |
| Parser fallback | pdf-parse (npm) | Si pdftotext no disponible |

**Tools implementadas (3):**
```javascript
[
  { name: "pdf.list", description: "Lista PDFs de un proyecto" },
  { name: "pdf.metadata", description: "Obtiene metadata del PDF" },
  { name: "pdf.extract", description: "Extrae texto de PDF (todo o por página)" }
]
```

**APIs (4):**
- `GET /pdf/view` - Ver PDF
- `GET /pdf/extract-text` - Extraer texto
- `GET /pdf/metadata` - Obtener metadata
- `GET /pdf/list` - Listar PDFs del proyecto

---

### 13. Code Executor ✅ (NUEVO - no estaba en plan original)

**Estado:** Implementado en `modules/code-executor/`

| Decisión | Valor | Notas |
|----------|-------|-------|
| Función | Ejecución de comandos shell | Con controles de seguridad |
| Timeout default | 30 segundos | Máximo 5 minutos |
| Procesos background | Máximo 10 | Controlados por PID |

**Tools implementadas (5):**
```javascript
[
  { name: "shell.exec", description: "Ejecuta comando shell", requires_confirmation: true },
  { name: "shell.script", description: "Ejecuta script (bash/python/node)", requires_confirmation: true },
  { name: "shell.background", description: "Inicia proceso en background", requires_confirmation: true },
  { name: "shell.kill", description: "Detiene proceso por PID o nombre" },
  { name: "shell.list", description: "Lista procesos activos" }
]
```

**Seguridad:**
- Comandos bloqueados: `rm -rf /`, `sudo`, `mkfs`, etc.
- Patrones peligrosos bloqueados via regex
- Timeout máximo de 5 minutos

---

## Módulos Implementados - Resumen

| # | Módulo | Estado | Tools | Función Principal |
|---|--------|--------|-------|-------------------|
| 1 | AI Gateway | ✅ Implementado | - | Comunicación con proveedores IA |
| 2 | Project Manager | ✅ Implementado | - | Gestión de proyectos aislados |
| 3 | Conversation Manager | ✅ Implementado | - | Contexto FIFO con checkboxes |
| 4 | Tool System | ✅ Implementado | - | Unificado en Module Loader + AI Gateway |
| 5 | Calling Generator | ✅ Implementado | - | Genera funciones desde plugins |
| 6 | Prompt Manager | ✅ Implementado | 3 | Prompts catalogados, combinables |
| 7 | Plugin Manager | ✅ Implementado | - | Plugins JSON que añaden tools |
| 8 | Credential Manager | ✅ Implementado | 1 | Credenciales (solo nombres a IA) |
| 9 | Filesystem | ✅ Implementado | 11 | Unifica storage-manager + file-browser |
| 10 | Database Manager | ✅ Implementado | 4 | Consultas SQL via tools |
| 11 | Text Editor | ⚠️ Parcial | 0 | Solo APIs, sin tools para AI |
| 12 | PDF Viewer | ✅ Implementado | 3 | Lectura y extracción de PDFs |
| 13 | Code Executor | ✅ Implementado | 5 | Ejecución shell con seguridad |

**Total: 27 tools implementadas**

---

## Flujo General del Chat (Implementación Real)

```
Usuario escribe mensaje
        │
        ▼
┌─────────────────────────┐
│ Conversation Manager    │
│ • Guarda mensaje        │
│ • Gestiona contexto     │
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
│    AI Gateway           │
│ • getAvailableTools()   │
│ • Traduce tools (interno)│
│ • Envía a proveedor     │
│ • Recibe respuesta      │
└─────────┬───────────────┘
          │
    ¿Tool call?
     /        \
   Sí          No
   │            │
   ▼            │
┌─────────────┐ │
│ Module      │ │
│ Loader      │ │
│• executeTool│ │
│• Valida     │ │
│• Ejecuta    │ │
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

### Core ✅
- [x] Module Loader toolsRegistry
- [x] AI Gateway tool execution
- [x] Tool translation (interno en ai-gateway)

### Módulos con Tools ✅
- [x] credential-manager: `credential.list`
- [x] prompt-manager: `prompt.list`, `prompt.get`, `prompt.render`
- [x] database-manager: `db.query`, `db.tables`, `db.schema`, `db.execute`
- [x] filesystem: 11 tools (fs.*)
- [x] pdf-viewer: `pdf.list`, `pdf.metadata`, `pdf.extract`
- [x] code-executor: 5 tools (shell.*)

### Pendiente ⚠️
- [ ] text-editor: agregar tools `editor.open`, `editor.save`, `editor.create`
- [ ] text-editor: actualizar dependencia `file-browser` → `filesystem`

### Eliminados del Plan Original
- ~~tool-translator~~ → Integrado en ai-gateway
- ~~tool-orchestrator~~ → Reemplazado por Module Loader
- ~~storage-manager~~ → Unificado en filesystem
- ~~file-browser~~ → Unificado en filesystem

---

## Archivos Clave

| Componente | Archivo |
|------------|---------|
| Tool Registry | `core/modules/loader.js` |
| Tool Execution | `modules/ai-gateway/index.js` |
| Tool Translation | `modules/ai-gateway/tool-translator.js` |
| Filesystem Tools | `modules/filesystem/index.js` |
| Code Executor Tools | `modules/code-executor/index.js` |

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2025-12-28 | Documento inicial con AI Gateway, Project Manager, Conversation Manager |
| 2025-12-29 | Añadido sistema de Tools completo (plan original) |
| 2025-12-29 | Completados TODOS los módulos en plan |
| 2025-12-30 | **VERIFICACIÓN vs código real:** Actualizado para reflejar implementación |
| 2025-12-30 | Documentada arquitectura unificada (Module Loader + AI Gateway) |
| 2025-12-30 | Eliminados módulos inexistentes: tool-translator, tool-orchestrator, storage-manager, file-browser |
| 2025-12-30 | Agregado code-executor (no estaba en plan original) |
| 2025-12-30 | Marcado text-editor como parcial (sin tools) |
