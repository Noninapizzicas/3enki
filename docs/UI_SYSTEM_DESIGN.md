# Sistema de Interfaz Gráfica para Módulos - Diseño Completo

**Fecha:** 2025-11-04
**Versión:** v0.2.0 Draft
**Estado:** Propuesta de Diseño

---

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura Propuesta](#arquitectura-propuesta)
3. [Opción 1: JSON-Driven UI (Recomendada)](#opción-1-json-driven-ui-recomendada)
4. [Opción 2: Web Components](#opción-2-web-components)
5. [Opción 3: Micro-Frontends](#opción-3-micro-frontends)
6. [Comparación de Opciones](#comparación-de-opciones)
7. [Plan de Implementación](#plan-de-implementación)

---

## Visión General

### Problema

Actualmente Event Core tiene:
- ✅ APIs REST bien definidas
- ✅ Sistema de módulos extensible
- ❌ **Sin interfaz gráfica** - Todo es línea de comandos/APIs

### Objetivo

Crear un sistema donde:
- ✅ Cada módulo puede tener su propia UI
- ✅ Todas las UIs siguen el mismo patrón/diseño
- ✅ UI se genera automáticamente desde el módulo
- ✅ Fácil de desarrollar para creadores de módulos
- ✅ Consistente y profesional

### Principios de Diseño

1. **Auto-generación**: UI se genera desde definición del módulo
2. **Consistencia**: Todos los módulos usan el mismo design system
3. **Simplicidad**: Creadores de módulos no necesitan ser expertos en frontend
4. **Extensibilidad**: Módulos avanzados pueden customizar completamente
5. **Zero Dependencies**: Frontend debe ser ligero

---

## Arquitectura Propuesta

### Vista de Alto Nivel

```
┌─────────────────────────────────────────────────────────────┐
│                    NAVEGADOR (Cliente)                      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │         EVENT CORE ADMIN PANEL (SPA)                  │ │
│  │                                                       │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
│  │  │  Dashboard  │  │   Módulos   │  │   Config    │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │ │
│  │                                                       │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │         MÓDULO UI RENDERER                      │ │ │
│  │  │  (Renderiza UIs de módulos dinámicamente)       │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST API
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   EVENT CORE (Backend)                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Módulo TODO │  │  Módulo User │  │  Módulo File │     │
│  │              │  │              │  │              │     │
│  │  APIs  +  UI │  │  APIs  +  UI │  │  APIs  +  UI │     │
│  │  Definition  │  │  Definition  │  │  Definition  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  Cada módulo define su UI en module.json                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Opción 1: JSON-Driven UI (Recomendada)

### Concepto

Los módulos definen su UI usando JSON, y un renderer universal la convierte en HTML/CSS/JS.

### Ventajas

✅ **Simplicidad extrema** - Solo escribir JSON
✅ **Consistencia garantizada** - Todos usan el mismo renderer
✅ **Validación automática** - Schema para UI definitions
✅ **Zero frontend knowledge** - No necesitas saber React/Vue/etc
✅ **Auto-generación** - CRUD interfaces generadas automáticamente

### Ejemplo: Módulo TODO con UI

**module.json:**
```json
{
  "name": "todo-list",
  "version": "1.0.0",
  "apis": [
    {
      "method": "GET",
      "path": "/todos",
      "handler": "handleListTodos"
    },
    {
      "method": "POST",
      "path": "/todos",
      "handler": "handleCreateTodo"
    }
  ],

  "ui": {
    "enabled": true,
    "title": "Lista de Tareas",
    "icon": "check-square",
    "color": "#4CAF50",

    "views": [
      {
        "id": "list",
        "title": "Mis TODOs",
        "type": "table",
        "api": "GET /modules/todo-list/todos",
        "refreshInterval": 5000,

        "columns": [
          {
            "field": "id",
            "label": "ID",
            "width": 60
          },
          {
            "field": "title",
            "label": "Título",
            "sortable": true
          },
          {
            "field": "completed",
            "label": "Estado",
            "type": "badge",
            "values": {
              "true": { "label": "Completado", "color": "success" },
              "false": { "label": "Pendiente", "color": "warning" }
            }
          },
          {
            "field": "createdAt",
            "label": "Creado",
            "type": "date",
            "format": "DD/MM/YYYY HH:mm"
          }
        ],

        "actions": [
          {
            "label": "Completar",
            "icon": "check",
            "api": "POST /modules/todo-list/todos/{id}/complete",
            "confirm": "¿Marcar como completado?",
            "condition": "row.completed === false"
          },
          {
            "label": "Eliminar",
            "icon": "trash",
            "api": "DELETE /modules/todo-list/todos/{id}",
            "confirm": "¿Estás seguro?",
            "variant": "danger"
          }
        ],

        "filters": [
          {
            "field": "completed",
            "label": "Estado",
            "type": "select",
            "options": [
              { "value": "", "label": "Todos" },
              { "value": "true", "label": "Completados" },
              { "value": "false", "label": "Pendientes" }
            ]
          },
          {
            "field": "search",
            "label": "Buscar",
            "type": "text",
            "placeholder": "Buscar por título..."
          }
        ],

        "toolbar": [
          {
            "label": "Nuevo TODO",
            "icon": "plus",
            "action": "openModal:create"
          }
        ]
      },

      {
        "id": "create",
        "title": "Crear TODO",
        "type": "form",
        "api": "POST /modules/todo-list/todos",
        "method": "POST",
        "successMessage": "TODO creado exitosamente",
        "onSuccess": "refreshView:list",

        "fields": [
          {
            "name": "title",
            "label": "Título",
            "type": "text",
            "required": true,
            "placeholder": "Ej: Comprar leche",
            "validation": {
              "minLength": 3,
              "maxLength": 100
            }
          },
          {
            "name": "description",
            "label": "Descripción",
            "type": "textarea",
            "rows": 4,
            "placeholder": "Descripción opcional..."
          }
        ],

        "buttons": [
          {
            "label": "Crear",
            "type": "submit",
            "variant": "primary"
          },
          {
            "label": "Cancelar",
            "action": "closeModal"
          }
        ]
      }
    ]
  }
}
```

### Renderer Universal

El renderer lee esta definición y genera:

**Lista de TODOs (Auto-generada):**
```html
<div class="module-view" data-module="todo-list" data-view="list">
  <!-- Toolbar -->
  <div class="view-toolbar">
    <h2>Mis TODOs</h2>
    <button class="btn btn-primary" data-action="openModal:create">
      <icon>plus</icon> Nuevo TODO
    </button>
  </div>

  <!-- Filtros -->
  <div class="view-filters">
    <select name="completed">
      <option value="">Todos</option>
      <option value="true">Completados</option>
      <option value="false">Pendientes</option>
    </select>

    <input type="text" name="search" placeholder="Buscar por título...">
  </div>

  <!-- Tabla -->
  <table class="view-table">
    <thead>
      <tr>
        <th width="60">ID</th>
        <th class="sortable">Título</th>
        <th>Estado</th>
        <th>Creado</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody>
      <!-- Renderizado dinámicamente desde API -->
      <tr data-id="1">
        <td>1</td>
        <td>Aprender Event Core</td>
        <td><span class="badge badge-warning">Pendiente</span></td>
        <td>20/10/2025 10:30</td>
        <td>
          <button class="btn-icon" data-action="complete" data-id="1">
            <icon>check</icon>
          </button>
          <button class="btn-icon btn-danger" data-action="delete" data-id="1">
            <icon>trash</icon>
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Tipos de Vistas Soportadas

#### 1. **Table View** (Lista)
```json
{
  "type": "table",
  "api": "GET /endpoint",
  "columns": [...],
  "actions": [...],
  "filters": [...]
}
```

#### 2. **Form View** (Formulario)
```json
{
  "type": "form",
  "api": "POST /endpoint",
  "fields": [...],
  "buttons": [...]
}
```

#### 3. **Detail View** (Detalle)
```json
{
  "type": "detail",
  "api": "GET /endpoint/{id}",
  "sections": [
    {
      "title": "Información General",
      "fields": [...]
    }
  ]
}
```

#### 4. **Dashboard View** (Dashboard)
```json
{
  "type": "dashboard",
  "widgets": [
    {
      "type": "stat",
      "title": "Total TODOs",
      "api": "GET /stats",
      "value": "total"
    },
    {
      "type": "chart",
      "title": "Completados por día",
      "api": "GET /stats/daily",
      "chartType": "line"
    }
  ]
}
```

#### 5. **Custom View** (Personalizada)
```json
{
  "type": "custom",
  "template": "todo-kanban",
  "api": "GET /todos",
  "config": {...}
}
```

### Field Types Soportados

```javascript
{
  // Texto
  "type": "text",
  "type": "email",
  "type": "password",
  "type": "url",
  "type": "tel",

  // Números
  "type": "number",
  "type": "currency",

  // Fechas
  "type": "date",
  "type": "datetime",
  "type": "time",

  // Selección
  "type": "select",
  "type": "radio",
  "type": "checkbox",
  "type": "switch",

  // Texto largo
  "type": "textarea",
  "type": "markdown",
  "type": "code",

  // Archivos
  "type": "file",
  "type": "image",

  // Especiales
  "type": "color",
  "type": "json",
  "type": "tags"
}
```

### Design System

Todos los componentes usan un design system consistente:

**CSS Variables:**
```css
:root {
  /* Colors */
  --primary-color: #2196F3;
  --success-color: #4CAF50;
  --warning-color: #FF9800;
  --danger-color: #F44336;
  --info-color: #00BCD4;

  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Typography */
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-size-sm: 12px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;

  /* Borders */
  --border-radius: 4px;
  --border-color: #e0e0e0;
}
```

### Componentes Base

```javascript
// Todos los módulos usan estos componentes:
- Button
- Input
- Select
- Table
- Form
- Modal
- Card
- Badge
- Alert
- Loader
- Pagination
- Tabs
- Dropdown
```

---

## Opción 2: Web Components

### Concepto

Cada módulo puede proveer sus propios Web Components personalizados.

### Ejemplo

**module.json:**
```json
{
  "name": "todo-list",
  "ui": {
    "enabled": true,
    "components": [
      "/modules/todo-list/ui/todo-list.js",
      "/modules/todo-list/ui/todo-item.js"
    ]
  }
}
```

**modules/todo-list/ui/todo-list.js:**
```javascript
class TodoList extends HTMLElement {
  async connectedCallback() {
    const todos = await this.fetchTodos();
    this.render(todos);
  }

  async fetchTodos() {
    const res = await fetch('/modules/todo-list/todos');
    return res.json();
  }

  render(todos) {
    this.innerHTML = `
      <div class="todo-list">
        ${todos.map(todo => `
          <todo-item id="${todo.id}" title="${todo.title}"></todo-item>
        `).join('')}
      </div>
    `;
  }
}

customElements.define('todo-list', TodoList);
```

### Ventajas

✅ **Flexibilidad total** - Cada módulo controla su UI completamente
✅ **Estándar web** - Web Components es estándar nativo
✅ **Encapsulación** - Shadow DOM previene conflictos CSS

### Desventajas

❌ **Más trabajo** - Desarrolladores necesitan saber frontend
❌ **Inconsistencia** - Cada módulo puede verse diferente
❌ **Complejidad** - Más código para mantener

---

## Opción 3: Micro-Frontends

### Concepto

Cada módulo es un mini-app React/Vue independiente.

### Ejemplo

**module.json:**
```json
{
  "name": "todo-list",
  "ui": {
    "type": "micro-frontend",
    "framework": "react",
    "entryPoint": "/modules/todo-list/ui/bundle.js"
  }
}
```

### Ventajas

✅ **Frameworks modernos** - Usa React/Vue/etc
✅ **Ecosistema rico** - npm packages disponibles
✅ **Developer experience** - Hot reload, TypeScript, etc

### Desventajas

❌ **Complejidad extrema** - Build process, bundling
❌ **Tamaño** - Cada módulo incluye framework completo
❌ **Inconsistencia** - Difícil mantener diseño unificado

---

## Comparación de Opciones

| Criterio | JSON-Driven | Web Components | Micro-Frontends |
|----------|-------------|----------------|-----------------|
| **Facilidad** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Consistencia** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐ |
| **Flexibilidad** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Tamaño** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Mantenibilidad** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |

### Recomendación

🏆 **Opción 1: JSON-Driven UI**

**Razones:**
1. ✅ Más fácil para desarrolladores de módulos
2. ✅ Garantiza consistencia visual
3. ✅ Performance óptimo
4. ✅ Mantenimiento simple
5. ✅ Puede extenderse con custom components cuando necesario

---

## Plan de Implementación

### Fase 1: Core UI System (2-3 semanas)

**Componentes:**
1. **Admin Panel Shell** (`ui/admin/`)
   - Layout principal
   - Navegación
   - Autenticación

2. **UI Renderer** (`ui/renderer/`)
   - Parser de definiciones JSON
   - Generador de HTML
   - Event handlers

3. **Design System** (`ui/components/`)
   - Componentes base (Button, Input, Table, etc)
   - CSS framework ligero
   - Iconos

4. **API para UI** (`core/gateway/ui.js`)
   - Servir archivos estáticos
   - Endpoint para obtener UI definitions
   - WebSocket para real-time updates

### Fase 2: Generadores Automáticos (1 semana)

**Features:**
1. **Auto-CRUD**
   - Generar UI CRUD desde APIs REST automáticamente

2. **Schema Inference**
   - Detectar tipos de campos desde APIs

3. **Templates**
   - Templates pre-hechos para casos comunes

### Fase 3: Módulos con UI (1 semana)

**Implementar UI para:**
1. TODO List module
2. User Management module
3. File Watcher module

### Fase 4: Features Avanzadas (2 semanas)

1. **Real-time Updates** - WebSocket integration
2. **Theming** - Dark mode, custom themes
3. **Internacionalización** - i18n support
4. **Exportación** - CSV, PDF exports
5. **Búsqueda avanzada** - Full-text search
6. **Responsive** - Mobile-friendly

---

## Estructura de Archivos

```
event-core/
├── ui/                          ← Nuevo directorio UI
│   ├── admin/                   ← Admin Panel (SPA)
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── app.css
│   │   └── assets/
│   │
│   ├── components/              ← Componentes UI reutilizables
│   │   ├── Button.js
│   │   ├── Input.js
│   │   ├── Table.js
│   │   ├── Form.js
│   │   └── ...
│   │
│   ├── renderer/                ← UI Renderer
│   │   ├── index.js
│   │   ├── viewTypes/
│   │   │   ├── TableView.js
│   │   │   ├── FormView.js
│   │   │   ├── DetailView.js
│   │   │   └── DashboardView.js
│   │   └── fieldTypes/
│   │       ├── TextField.js
│   │       ├── SelectField.js
│   │       └── ...
│   │
│   └── styles/                  ← Design System
│       ├── variables.css
│       ├── components.css
│       └── utilities.css
│
├── core/
│   └── gateway/
│       └── ui.js                ← UI Gateway (servir UI)
│
└── modules/
    └── todo-list/
        ├── module.json          ← Ahora incluye "ui" definition
        ├── index.js
        └── ui/                  ← UI personalizada (opcional)
            └── custom-view.js
```

---

## Próximos Pasos

1. **Revisar propuesta** - ¿Te gusta esta aproximación?
2. **Elegir opción** - JSON-Driven (recomendado) u otra
3. **Crear prototipo** - Implementar MVP en 1 semana
4. **Iterar** - Mejorar basado en feedback

---

¿Quieres que empiece a implementar el sistema JSON-Driven UI? Puedo crear:
1. El Admin Panel shell
2. El UI Renderer
3. Un ejemplo completo del módulo TODO con UI
4. Documentación para desarrolladores

¿Por dónde empezamos? 🚀
