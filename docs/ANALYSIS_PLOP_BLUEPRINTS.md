# Análisis de Plop Templates y Blueprints - Event Core

> Documento de análisis de los sistemas de generación de código y scaffolding.

---

## Resumen Ejecutivo

Event-Core tiene **dos sistemas complementarios** para generación de código:

| Sistema | Propósito | Formato | Comando |
|---------|-----------|---------|---------|
| **Plop Templates** | Generación interactiva | Handlebars (.hbs) | `npx plop <generator>` |
| **Blueprints** | Definición declarativa | YAML | `npx plop from-blueprint` |

---

## 1. Plop Templates

### Ubicación: `plop-templates/`

### Generadores Disponibles (plopfile.js)

| Generador | Descripción | Archivos Generados |
|-----------|-------------|-------------------|
| `module` | Módulo backend básico | index.js, module.json, README.md, schemas/ |
| `full-module` | Backend + Frontend CRUD | Todo de module + +page.svelte |
| `chat-module` | Módulo con Chat IA | Backend chat + UI ChatAIWorkspace |
| `svelte-component` | Componente Svelte | Component.svelte + export en index.ts |
| `api` | Agregar API (instrucciones) | Solo muestra código a copiar |
| `event` | Agregar evento (instrucciones) | Solo muestra código a copiar |
| `from-blueprint` | Genera desde YAML | Según definición del blueprint |

---

### 1.1 Template: `module/`

**Propósito**: Módulo backend Event-Core estándar.

**Archivos:**

```
plop-templates/module/
├── index.js.hbs        # Clase del módulo
├── module.json.hbs     # Configuración + UI Auto-UI v2.0
├── README.md.hbs       # Documentación
└── schemas/
    ├── events.json.hbs # Schema de eventos
    └── main.json.hbs   # Schema principal
```

**index.js.hbs - Estructura:**
```javascript
class {{pascalCase name}}Module {
  constructor() { ... }

  // Lifecycle
  async onLoad(core) { ... }
  async onUnload() { ... }

  // Event Subscriptions (si hasSubscriptions)
  async subscribeToEvents() { ... }
  {{#each subscriptions}}
  async {{this.handler}}(envelope) { ... }
  {{/each}}

  // HTTP API Handlers
  {{#each apis}}
  async {{this.handler}}(req, context) { ... }
  {{/each}}

  // Persistencia JSON (si persistence)
  async loadFromJSON() { ... }
  async persistToJSON() { ... }
}
```

**module.json.hbs - Estructura:**
```json
{
  "name": "{{name}}",
  "version": "1.0.0",
  "provides": { "events": [...], "queries": [] },
  "events": {
    "publishes": [...],
    "subscribes": [...]
  },
  "apis": [...],
  "ui": {
    "version": "2.0",
    "views": {
      "main": { /* dashboard */ },
      "create": { /* form */ }
    },
    "mqtt": { "topics": [...] }
  },
  "schema": { ... },
  "observability": { ... },
  "config": { ... }
}
```

---

### 1.2 Template: `full-module/`

**Propósito**: Módulo completo con UI Svelte para CRUD.

**Archivos adicionales:**
```
plop-templates/full-module/
└── page.svelte.hbs     # Página Svelte con grid, modal, MQTT
```

**page.svelte.hbs - Características:**
- Grid responsivo de Cards
- Modal crear/editar con formulario dinámico
- Integración MQTT para real-time updates
- Manejo de estados: loading, error, empty
- Toast notifications
- Formateo de fechas

---

### 1.3 Template: `chat-module/`

**Propósito**: Módulo con interfaz de Chat IA usando ChatAIWorkspace.

**Archivos:**
```
plop-templates/chat-module/
├── index.js.hbs        # Backend con conversaciones + AI Gateway
├── module.json.hbs     # Config módulo chat
└── page.svelte.hbs     # UI con MobileWorkspaceLayout
```

**index.js.hbs - Funcionalidades:**
- Map de conversaciones en memoria
- Integración con ai-gateway
- Handlers: list/create/get conversations, send message
- Generación de respuestas IA con fallback

**page.svelte.hbs - Componentes:**
- MobileWorkspaceLayout (barras flotantes)
- ChatAIWorkspace (paneles IA)
- Selector de modelos, credenciales, prompts
- Tools y plugins configurables
- Context items

---

### 1.4 Template: `svelte-component/`

**Propósito**: Componente Svelte reutilizable.

**Archivos:**
```
plop-templates/svelte-component/
└── component.svelte.hbs
```

**Prompts del generador:**
- name: Nombre PascalCase
- category: ui, data, feedback, layout, navigation, input, ai
- propsRaw: Props con tipos y defaults
- hasVariants: Variantes visuales
- hasEvents: Eventos personalizados
- hasSlots: Slots adicionales
- baseClasses: Clases Tailwind base

---

## 2. Blueprints

### Ubicación: `blueprints/`

### Estructura del Sistema

```
blueprints/
├── _schema.yaml              # Documentación del schema
├── _template.yaml            # Template base para copiar
├── schemas/
│   ├── ui-template.schema.json
│   └── ui-component.schema.json
├── tareas.yaml               # Ejemplo: gestión de tareas
├── ui-designer.yaml          # Diseñador visual de UI
├── mobile-chat-screen.yaml   # Pantalla móvil con chat
└── menu-generator-screen.yaml # Específico para menu-generator
```

---

### 2.1 Schema de Blueprints (_schema.yaml)

**Campos principales:**

```yaml
# Metadata (requerido)
name: string              # kebab-case
description: string
version: string           # Semver
author: string
icon: string              # Emoji

# Entidad principal (requerido)
entity:
  name: string            # Singular
  plural: string          # Plural
  titleField: string      # Campo para título
  descriptionField: string

# Campos (requerido, mínimo 1)
fields:
  - name: string
    type: string          # string, number, boolean, date, array, object
    label: string
    required: boolean
    default: any
    validation:           # minLength, maxLength, min, max, pattern, enum
    ui:                   # inputType, placeholder, helpText, options

# Eventos (opcional)
events:
  publish:
    - name: string
      description: string
      payload: [...]
  subscribe:
    - name: string
      handler: string

# APIs (opcional, CRUD auto-generado)
apis:
  - method: string
    path: string
    handler: string
    description: string
    auth: boolean

# UI (opcional)
ui:
  enabled: boolean
  layout: string          # grid, list, table, kanban
  features: [...]         # create, edit, delete, search, filter, sort, pagination, export
  colors: [...]           # Por estado

# Relaciones (opcional)
relations:
  - module: string
    type: string          # hasOne, hasMany, belongsTo
    field: string

# Config (opcional)
config:
  persistence: boolean
  caching: boolean
  metrics: boolean
  realtime: boolean
```

---

### 2.2 Blueprint: tareas.yaml

**Propósito**: Gestión de tareas con estados y prioridades.

**Campos definidos:**
- titulo (string, required)
- descripcion (string)
- estado (enum: pendiente, en_progreso, completada, cancelada)
- prioridad (enum: baja, media, alta, urgente)
- fecha_limite (date)
- etiquetas (array)

**Eventos:**
- tarea.creada
- tarea.actualizada
- tarea.completada
- tarea.eliminada

**APIs custom:**
- POST /tareas/:id/completar
- POST /tareas/:id/reabrir

**UI:**
- Layout: list
- Features: create, edit, delete, search, filter, sort
- Colores por estado

---

### 2.3 Blueprint: ui-designer.yaml

**Propósito**: Diseñador visual de interfaces para Event-Core.

**Entidad**: template (UI templates)

**Campos principales:**
- name, display_name, description, icon
- type: view, modal, form, dashboard, component, page
- category: general, admin, data, analytics, settings, ai, custom
- layout_type: single-column, two-column, grid, tabs, sidebar, kanban
- components: array de componentes
- status: draft, published, archived
- target_module, tags, theme, responsive, permissions, mqtt_topics

**APIs (24 endpoints):**
- CRUD templates
- Acciones: duplicate, publish, archive
- Componentes: list, get schema, get examples
- Export: yaml, svelte, json, module
- Preview
- Library
- Layouts

**Component Registry (documentado):**
- Layout: header, sidebar, footer, section, card, panel
- Data: table, list, grid, tree, stat-card, chart, event-stream
- Form: form, input, textarea, select, checkbox, radio, file-upload, date-picker
- Feedback: modal, alert, toast, spinner, progress, skeleton
- Navigation: tabs, breadcrumb, pagination, menu
- Actions: button, button-group, dropdown
- AI: chat-input, conversation-panel, prompt-selector
- Custom: custom, slot

**Predefined Templates:**
- dashboard-basic
- crud-form
- modal-confirm
- list-with-filters

---

### 2.4 Blueprint: mobile-chat-screen.yaml

**Propósito**: Template base para pantallas móviles con chat IA.

**Filosofía** (de CONTEXT_UI.md):
- Foco ante todo
- Mínima huella visual (barras 10-12mm)
- Todo concentrado en 3 dominios

**Barras definidas:**

```yaml
toolbar_top:       # CONFIGURABLE por módulo
toolbar_right:     # ECOSISTEMA (estable)
  - modulos, config, notificaciones, usuario
toolbar_chat:      # FIJO
  top:             # Prepara mensaje
    - modelo, credencial, prompt, historial
  bottom:          # Complementa mensaje
    - herramientas, adjuntar, contexto, plugins
```

**Triple Interacción:**
- tap: Panel rápido (300ms delay)
- doubleTap: Crear nuevo (300ms max entre toques)
- longPress: Gestión completa (500ms duration, progress feedback)

**Layout:**
```yaml
layout:
  type: mobile-chat-workspace
  zones:
    main: chat-history (scroll)
    panels: overlay (small: 30%, medium: 50%, full: 80%)
```

**Input:**
```yaml
input:
  type: fixed-expandable
  enterBehavior: newline
  sendShortcut: ctrl+enter
  expandOnDoubleTap: true
  expandedSize: "50%"
```

---

### 2.5 Blueprint: menu-generator-screen.yaml

**Propósito**: Pantalla específica para el módulo menu-generator.

**Extiende**: mobile-chat-screen

**Características únicas:**
- Header disabled (sin barra Event-Core)
- toolbar_top con: Menús, Templates, Filtros, Stats, Export
- toolbar_right minimalista (28px, transparente)
- Paneles específicos: menus-lista, menu-upload, templates-lista, filtros-menu, stats-resumen, export-opciones
- Item templates: menu-list-item, template-card, conversation-item, credential-item
- Actions: uploadMenu, validateMenu, exportMenu, saveCredential, newConversation, sendMessage
- Data sources con endpoints y MQTT refresh
- Estado inicial con styleConfig (menuType, language, includeDescriptions, etc.)

---

## 3. Flujo de Trabajo Recomendado

### Crear módulo nuevo (rápido):
```bash
npx plop module           # Solo backend
npx plop full-module      # Backend + UI CRUD
npx plop chat-module      # Con Chat IA
```

### Crear módulo desde especificación (completo):
```bash
# 1. Copiar template
cp blueprints/_template.yaml blueprints/mi-modulo.yaml

# 2. Definir especificación en YAML

# 3. Generar
npx plop from-blueprint
# → Seleccionar: blueprints/mi-modulo.yaml
```

### Crear componente Svelte:
```bash
npx plop svelte-component
```

### Agregar funcionalidad a módulo existente:
```bash
npx plop api              # Muestra código para copiar
npx plop event            # Muestra código para copiar
```

---

## 4. Helpers de Handlebars Disponibles

| Helper | Ejemplo | Resultado |
|--------|---------|-----------|
| `pascalCase` | `{{pascalCase "mi-modulo"}}` | `MiModulo` |
| `titleCase` | `{{titleCase "mi-modulo"}}` | `Mi Modulo` |
| `snakeCase` | `{{snakeCase "mi.evento"}}` | `mi_evento` |
| `json` | `{{json object}}` | JSON stringified |
| `currentDate` | `{{currentDate}}` | `2025-12-06` |
| `eq` | `{{#eq a b}}...{{/eq}}` | Comparación |

---

## 5. Integración UI

### Componentes reutilizables (frontend/src/lib/components/):

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `MobileWorkspaceLayout` | layout/ | Layout con barras flotantes |
| `ChatAIWorkspace` | ai/ | Paneles de chat IA integrados |
| `ToolbarIcon` | toolbar/ | Icono con triple interacción |
| `FloatingPanel` | toolbar/ | Panel flotante genérico |
| `ChatInput` | ai/ | Input de chat expandible |

### Tipos compartidos (ai/types.ts):
- AIModel, AICredential, AITool, AIPlugin
- ContextItem, QuickPrompt, ChatMessage
- DEFAULT_MODELS, PROVIDER_ICONS, TOOL_CATEGORY_ICONS

---

## 6. Relación entre Sistemas

```
┌─────────────────────────────────────────────────────────────┐
│                     BLUEPRINTS (YAML)                        │
│  Definición declarativa de módulos                          │
│  - Campos, validaciones, UI                                 │
│  - Eventos, APIs, relaciones                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ npx plop from-blueprint
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   PLOP TEMPLATES (HBS)                       │
│  Generación de código                                       │
│  - index.js, module.json, schemas                           │
│  - +page.svelte                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ Archivos generados
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    MÓDULO EVENT-CORE                         │
│  modules/{name}/                                            │
│  frontend/src/routes/{name}/                                │
└─────────────────────────────────────────────────────────────┘
```

---

*Generado: 2025-12-06*
*Autor: Claude AI Analysis*
