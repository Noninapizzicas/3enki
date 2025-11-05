# 🧠 Prompt Maestro — Arquitectura JSON-Driven UI para Event Core

**Versión:** 1.0.0
**Fecha:** 2025-11-04
**Proyecto:** Event Core v0.2.0
**Tipo:** Prompt de Implementación Monoespecialista

---

## 0) Contexto del Sistema

### Estado Actual del Proyecto
- **Proyecto:** Event Core - Meta-Core Event-Driven Framework
- **Versión:** v0.1.0 (Foundation) + Port Management System
- **Directorio Base:** `/data/data/com.termux/files/home/event-core/`
- **Estado:** Sistema backend completo; sin interfaz gráfica

### Lo que ya existe (✅ Completado)
```
event-core/
├── core/                        ✅ Sistema completo
│   ├── hooks.js                 ✅ Hook System
│   ├── observability/           ✅ Logger, Tracer, Metrics
│   ├── mqtt/                    ✅ MQTT Client + Broker
│   ├── events/                  ✅ Event Bus
│   ├── modules/                 ✅ Module Loader
│   ├── gateway/                 ✅ HTTP Gateway
│   │   └── http.js              ✅ REST API Gateway
│   ├── utils/                   ✅ Port Manager + Registry
│   └── orchestrator/            ✅ Service Orchestrator
├── modules/                     ✅ 3 módulos funcionales
│   ├── echo/                    ✅ Módulo de ejemplo
│   ├── file-watcher/            ✅ File watcher
│   └── todo-list/               ⏳ Necesita UI definition
├── ui/                          ⏳ En progreso
│   └── styles/                  ✅ Design System creado
│       ├── variables.css        ✅ Variables completas
│       └── components.css       ✅ Componentes base
├── docs/                        ✅ Documentación completa
│   ├── API_SYSTEM.md            ✅ Sistema de APIs
│   ├── GUIA_CREAR_MODULO.md    ✅ Guía de módulos
│   └── UI_SYSTEM_DESIGN.md     ✅ Diseño UI propuesto
└── tests/                       ✅ 115 tests (100% pasando)
```

### Objetivo
Implementar un **Admin Panel SPA** con **UI Renderer JSON-Driven** que permita:
- ✅ Que cada módulo defina su UI en JSON
- ✅ Generar interfaces automáticamente desde definiciones
- ✅ Mantener consistencia visual total
- ✅ Facilitar desarrollo (solo escribir JSON, no frontend)
- ✅ Extensibilidad para casos avanzados

### Restricciones Técnicas
- ✅ Zero dependencias pesadas (solo Node.js built-ins + vanilla JS)
- ✅ Ligero (~50KB total)
- ✅ Compatible con Port Management System existente
- ✅ Integración con HTTP Gateway actual
- ✅ Mantener filosofía Event Core (modular, extensible, minimalista)

---

## 1) Rol del Especialista

**Arquitecto-Implementador de UI JSON-Driven (Monoespecialista)**

Responsable de:
1. Completar el Admin Panel SPA
2. Implementar UI Renderer universal
3. Crear UI Gateway (extensión del HTTP Gateway)
4. Añadir UI definitions a módulos existentes
5. Validar con JSON Schema
6. Documentar para autores de módulos

---

## 2) Estructura Final Objetivo

```
event-core/
├── ui/                          ← Directorio UI principal
│   ├── admin/                   ← Admin Panel (SPA)
│   │   ├── index.html           ⏳ CREAR
│   │   ├── app.js               ⏳ CREAR
│   │   ├── app.css              ⏳ CREAR
│   │   └── assets/              ⏳ CREAR
│   │       └── icons.svg
│   │
│   ├── components/              ← Componentes UI reutilizables
│   │   ├── Button.js            ⏳ CREAR
│   │   ├── Input.js             ⏳ CREAR
│   │   ├── Table.js             ⏳ CREAR
│   │   ├── Form.js              ⏳ CREAR
│   │   ├── Modal.js             ⏳ CREAR
│   │   ├── Card.js              ⏳ CREAR
│   │   ├── Badge.js             ⏳ CREAR
│   │   ├── Alert.js             ⏳ CREAR
│   │   └── Loader.js            ⏳ CREAR
│   │
│   ├── renderer/                ← UI Renderer (JSON → HTML)
│   │   ├── index.js             ⏳ CREAR (orchestrator)
│   │   ├── parser.js            ⏳ CREAR (parsear JSON)
│   │   ├── validator.js         ⏳ CREAR (JSON Schema)
│   │   │
│   │   ├── viewTypes/           ← Tipos de vista
│   │   │   ├── TableView.js     ⏳ CREAR
│   │   │   ├── FormView.js      ⏳ CREAR
│   │   │   ├── DetailView.js    ⏳ CREAR
│   │   │   ├── DashboardView.js ⏳ CREAR
│   │   │   └── CustomView.js    ⏳ CREAR
│   │   │
│   │   └── fieldTypes/          ← Tipos de campo
│   │       ├── TextField.js     ⏳ CREAR
│   │       ├── SelectField.js   ⏳ CREAR
│   │       ├── DateField.js     ⏳ CREAR
│   │       ├── CheckboxField.js ⏳ CREAR
│   │       └── TextareaField.js ⏳ CREAR
│   │
│   └── styles/                  ← Design System
│       ├── variables.css        ✅ COMPLETO
│       ├── components.css       ✅ COMPLETO
│       └── utilities.css        ⏳ CREAR
│
├── core/
│   └── gateway/
│       ├── http.js              ✅ EXISTENTE
│       └── ui.js                ⏳ CREAR (servir UI)
│
└── modules/
    └── todo-list/
        ├── module.json          ⏳ AÑADIR sección "ui"
        ├── index.js             ✅ EXISTENTE
        └── ui/                  ⏳ OPCIONAL (custom views)
            └── kanban-view.js
```

---

## 3) Deliverables Obligatorios (Definition of Done)

### Fase 1: Core UI System (Prioridad Alta)

**1. Admin Panel Shell** (`ui/admin/`)
- [ ] `index.html` - Estructura HTML completa
  - Topbar con logo, búsqueda, notificaciones
  - Sidebar con navegación (dashboard, módulos, sistema)
  - Content area para renderizado dinámico
  - Toast notifications container
  - Modal container
- [ ] `app.js` - Lógica principal
  - Router (hash-based)
  - Navegación entre vistas
  - Carga de módulos desde API
  - Gestión de estado global
  - API client (fetch wrapper)
- [ ] `app.css` - Estilos del layout
  - Grid layout (sidebar + content)
  - Responsive breakpoints
  - Animaciones de transición

**2. UI Renderer** (`ui/renderer/`)
- [ ] `index.js` - Orchestrator principal
  - `render(viewDefinition, container)` - Función principal
  - Dispatch por `view.type`
  - Cache de vistas renderizadas
  - Cleanup de event listeners
- [ ] `parser.js` - Parser de definiciones
  - Parsear JSON a estructura interna
  - Resolver referencias (ej: `{id}` en URLs)
  - Validar estructura básica
- [ ] `validator.js` - Validación con JSON Schema
  - Schema para `view.type: table`
  - Schema para `view.type: form`
  - Schema para field types
  - Mensajes de error descriptivos

**View Types (5 mínimos):**
- [ ] `TableView.js` - Vista de tabla
  - Renderizar columnas desde definition
  - Acciones por fila
  - Filtros
  - Paginación
  - Sorting
- [ ] `FormView.js` - Vista de formulario
  - Renderizar fields desde definition
  - Validación client-side
  - Submit con feedback
  - Error handling
- [ ] `DetailView.js` - Vista de detalle
  - Mostrar entidad single
  - Secciones
  - Acciones (editar, eliminar)
- [ ] `DashboardView.js` - Vista dashboard
  - Widgets (stat, chart)
  - Layout en grid
  - Refresh automático
- [ ] `CustomView.js` - Vista personalizada
  - Cargar componente custom del módulo
  - Pasar props desde definition

**Field Types (mínimo 8):**
- [ ] `TextField.js` (text, email, password, url, tel)
- [ ] `NumberField.js` (number, currency)
- [ ] `SelectField.js` (select, radio)
- [ ] `CheckboxField.js` (checkbox, switch)
- [ ] `TextareaField.js` (textarea, markdown, code)
- [ ] `DateField.js` (date, datetime, time)
- [ ] `FileField.js` (file, image)
- [ ] `ColorField.js` (color)

**3. UI Gateway** (`core/gateway/ui.js`)
- [ ] Servir archivos estáticos de `/ui/`
- [ ] Endpoint `GET /ui/modules` - Lista módulos con UI
- [ ] Endpoint `GET /ui/modules/:name` - Definition de UI
- [ ] Endpoint `GET /ui/schema` - JSON Schema
- [ ] WebSocket para real-time updates (opcional Fase 4)

**4. Componentes Base** (`ui/components/`)
- [ ] `Button.js` - Botón con variantes
- [ ] `Input.js` - Input con validación
- [ ] `Table.js` - Tabla con sorting/paging
- [ ] `Form.js` - Form wrapper con validación
- [ ] `Modal.js` - Modal con backdrop
- [ ] `Card.js` - Card container
- [ ] `Badge.js` - Badge de estado
- [ ] `Alert.js` - Mensajes de alerta
- [ ] `Loader.js` - Loading spinner

**5. Módulo TODO con UI** (`modules/todo-list/module.json`)
- [ ] Añadir sección `ui` completa
  - View `list` (type: table)
  - View `create` (type: form)
  - View `edit` (type: form)
  - View `detail` (type: detail)
- [ ] Probar CRUD completo desde UI

### Fase 2: Generadores Automáticos

- [ ] Auto-CRUD: generar UI desde APIs REST automáticamente
- [ ] Schema inference: detectar field types desde API responses
- [ ] Templates: plantillas para casos comunes

### Fase 3: Más Módulos

- [ ] `user-management` con UI
- [ ] `file-watcher` con UI
- [ ] `security-p2p` con UI (dashboard)

### Fase 4: Features Avanzadas

- [ ] Real-time updates (WebSocket)
- [ ] Theming (dark mode)
- [ ] i18n (español/inglés)
- [ ] Export (CSV, PDF)
- [ ] Búsqueda avanzada
- [ ] Responsive mobile

---

## 4) Especificaciones Técnicas

### 4.1) Formato JSON de UI Definition

**Ejemplo completo para `modules/todo-list/module.json`:**

```json
{
  "name": "todo-list",
  "version": "1.0.0",
  "description": "Lista de tareas",

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
    },
    {
      "method": "GET",
      "path": "/todos/:id",
      "handler": "handleGetTodo"
    },
    {
      "method": "PUT",
      "path": "/todos/:id",
      "handler": "handleUpdateTodo"
    },
    {
      "method": "DELETE",
      "path": "/todos/:id",
      "handler": "handleDeleteTodo"
    },
    {
      "method": "POST",
      "path": "/todos/:id/complete",
      "handler": "handleCompleteTodo"
    }
  ],

  "ui": {
    "enabled": true,
    "title": "Lista de Tareas",
    "icon": "check-square",
    "color": "#4CAF50",
    "description": "Gestiona tus tareas pendientes",

    "views": [
      {
        "id": "list",
        "title": "Mis TODOs",
        "type": "table",
        "default": true,
        "api": {
          "method": "GET",
          "url": "/modules/todo-list/todos"
        },
        "refreshInterval": 5000,

        "columns": [
          {
            "field": "id",
            "label": "ID",
            "width": 60,
            "sortable": false
          },
          {
            "field": "title",
            "label": "Título",
            "sortable": true,
            "searchable": true
          },
          {
            "field": "completed",
            "label": "Estado",
            "type": "badge",
            "width": 120,
            "values": {
              "true": {
                "label": "Completado",
                "color": "success",
                "icon": "check"
              },
              "false": {
                "label": "Pendiente",
                "color": "warning",
                "icon": "clock"
              }
            }
          },
          {
            "field": "createdAt",
            "label": "Creado",
            "type": "date",
            "format": "DD/MM/YYYY HH:mm",
            "sortable": true
          }
        ],

        "actions": [
          {
            "label": "Completar",
            "icon": "check",
            "variant": "success",
            "api": {
              "method": "POST",
              "url": "/modules/todo-list/todos/{id}/complete"
            },
            "confirm": "¿Marcar como completado?",
            "condition": "row.completed === false",
            "refresh": true
          },
          {
            "label": "Editar",
            "icon": "edit",
            "action": "openModal:edit"
          },
          {
            "label": "Eliminar",
            "icon": "trash",
            "variant": "danger",
            "api": {
              "method": "DELETE",
              "url": "/modules/todo-list/todos/{id}"
            },
            "confirm": "¿Estás seguro de eliminar esta tarea?",
            "refresh": true
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
            "placeholder": "Buscar por título...",
            "debounce": 300
          }
        ],

        "toolbar": [
          {
            "label": "Nuevo TODO",
            "icon": "plus",
            "variant": "primary",
            "action": "openModal:create"
          },
          {
            "label": "Exportar",
            "icon": "download",
            "action": "export:csv"
          }
        ],

        "pagination": {
          "enabled": true,
          "pageSize": 20,
          "pageSizes": [10, 20, 50, 100]
        }
      },

      {
        "id": "create",
        "title": "Crear TODO",
        "type": "form",
        "modal": true,
        "api": {
          "method": "POST",
          "url": "/modules/todo-list/todos"
        },
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
              "maxLength": 100,
              "pattern": "^[\\w\\s]+$",
              "message": "Título debe tener entre 3-100 caracteres"
            }
          },
          {
            "name": "description",
            "label": "Descripción",
            "type": "textarea",
            "rows": 4,
            "placeholder": "Descripción opcional del TODO...",
            "validation": {
              "maxLength": 500
            }
          },
          {
            "name": "priority",
            "label": "Prioridad",
            "type": "select",
            "options": [
              { "value": "low", "label": "Baja" },
              { "value": "medium", "label": "Media" },
              { "value": "high", "label": "Alta" }
            ],
            "default": "medium"
          },
          {
            "name": "dueDate",
            "label": "Fecha límite",
            "type": "date",
            "min": "today"
          }
        ],

        "buttons": [
          {
            "label": "Crear",
            "type": "submit",
            "variant": "primary",
            "icon": "check"
          },
          {
            "label": "Cancelar",
            "action": "closeModal",
            "variant": "secondary"
          }
        ]
      },

      {
        "id": "edit",
        "title": "Editar TODO",
        "type": "form",
        "modal": true,
        "api": {
          "method": "PUT",
          "url": "/modules/todo-list/todos/{id}",
          "load": {
            "method": "GET",
            "url": "/modules/todo-list/todos/{id}"
          }
        },
        "successMessage": "TODO actualizado exitosamente",
        "onSuccess": "refreshView:list",

        "fields": [
          {
            "name": "title",
            "label": "Título",
            "type": "text",
            "required": true
          },
          {
            "name": "description",
            "label": "Descripción",
            "type": "textarea",
            "rows": 4
          },
          {
            "name": "completed",
            "label": "Completado",
            "type": "checkbox"
          }
        ],

        "buttons": [
          {
            "label": "Guardar",
            "type": "submit",
            "variant": "primary"
          },
          {
            "label": "Cancelar",
            "action": "closeModal"
          }
        ]
      },

      {
        "id": "dashboard",
        "title": "Dashboard",
        "type": "dashboard",

        "widgets": [
          {
            "type": "stat",
            "title": "Total TODOs",
            "api": {
              "method": "GET",
              "url": "/modules/todo-list/stats"
            },
            "value": "total",
            "icon": "list",
            "color": "primary"
          },
          {
            "type": "stat",
            "title": "Completados",
            "api": {
              "method": "GET",
              "url": "/modules/todo-list/stats"
            },
            "value": "completed",
            "icon": "check",
            "color": "success"
          },
          {
            "type": "stat",
            "title": "Pendientes",
            "api": {
              "method": "GET",
              "url": "/modules/todo-list/stats"
            },
            "value": "pending",
            "icon": "clock",
            "color": "warning"
          },
          {
            "type": "chart",
            "title": "Completados por día",
            "api": {
              "method": "GET",
              "url": "/modules/todo-list/stats/daily"
            },
            "chartType": "line",
            "xAxis": "date",
            "yAxis": "count"
          }
        ]
      }
    ]
  }
}
```

### 4.2) Tipos de Vista Soportados

| Type | Descripción | Props Principales |
|------|-------------|-------------------|
| `table` | Lista con columnas, filtros, acciones | `columns`, `actions`, `filters`, `toolbar` |
| `form` | Formulario para crear/editar | `fields`, `buttons`, `validation` |
| `detail` | Vista de detalle de una entidad | `sections`, `fields`, `actions` |
| `dashboard` | Dashboard con widgets | `widgets` (stat, chart, table) |
| `custom` | Vista personalizada del módulo | `component`, `props` |

### 4.3) Tipos de Campo Soportados

| Type | HTML Input | Validaciones | Props |
|------|-----------|--------------|-------|
| `text` | `<input type="text">` | minLength, maxLength, pattern | placeholder |
| `email` | `<input type="email">` | email format | placeholder |
| `password` | `<input type="password">` | minLength | placeholder |
| `number` | `<input type="number">` | min, max, step | placeholder |
| `date` | `<input type="date">` | min, max | - |
| `datetime` | `<input type="datetime-local">` | min, max | - |
| `select` | `<select>` | - | options |
| `radio` | `<input type="radio">` | - | options |
| `checkbox` | `<input type="checkbox">` | - | label |
| `switch` | `<input type="checkbox">` (styled) | - | label |
| `textarea` | `<textarea>` | minLength, maxLength | rows, placeholder |
| `file` | `<input type="file">` | accept, maxSize | accept |
| `color` | `<input type="color">` | - | - |

---

## 5) Design System (Ya Completado ✅)

### Variables CSS (`ui/styles/variables.css`) ✅

Ya definidas:
- Colores: primary, success, warning, danger, info, grays
- Tipografía: font-family, sizes, weights, line-heights
- Spacing: 0-20 (4px scale)
- Borders: radius, width
- Shadows: sm, md, lg, xl
- Transitions: fast, base, slow
- Z-index layers
- Layout: sidebar-width, topbar-height

### Componentes CSS (`ui/styles/components.css`) ✅

Ya definidos:
- Buttons (variants, sizes)
- Inputs (text, select, textarea)
- Forms (form-group, labels, errors)
- Tables (sortable, hover)
- Cards (header, body, footer)
- Badges (colors)
- Alerts (variants)
- Modals (backdrop, structure)
- Loader (spinner)
- Pagination
- Utility classes

---

## 6) Reglas de Implementación

### Técnicas
1. **Zero Dependencies Pesadas**
   - Solo vanilla JavaScript (ES6+)
   - No React, Vue, Angular
   - No jQuery
   - Permitir librerías pequeñas (<10KB): date-fns, marked

2. **Performance**
   - Lazy loading de vistas
   - Virtual scrolling para tablas grandes
   - Debounce en búsquedas
   - Cache de definiciones

3. **Seguridad**
   - Sanitizar inputs (XSS prevention)
   - CSRF tokens en formularios
   - Validación client + server side

4. **Accesibilidad**
   - Roles ARIA básicos
   - Navegación por teclado
   - Focus management
   - Labels descriptivos

5. **Extensibilidad**
   - Custom views no rompen el core
   - Plugins para field types adicionales
   - Hooks para modificar renderizado

### Convenciones de Código

```javascript
// Nombres de clases
class TableView { }
class FormView { }

// Nombres de archivos
table-view.js
form-view.js

// Funciones públicas
render(definition, container)
validate(data, schema)

// Funciones privadas
_parseColumns(columns)
_renderField(field)

// Event handlers
handleSubmit(event)
handleClick(event)

// Constants
const VIEW_TYPES = { ... }
const FIELD_TYPES = { ... }
```

---

## 7) Flujo de Renderizado

```
1. Usuario navega a módulo (ej: #/modules/todo-list)
                 ↓
2. app.js detecta cambio de ruta
                 ↓
3. app.js fetch UI definition:
   GET /ui/modules/todo-list
                 ↓
4. Valida definition con JSON Schema
                 ↓
5. Pasa al Renderer:
   renderer.render(definition, container)
                 ↓
6. Renderer identifica view.type (table)
                 ↓
7. Invoca TableView.render(definition)
                 ↓
8. TableView:
   - Fetch data desde API
   - Renderiza columnas
   - Renderiza filtros
   - Renderiza acciones
   - Attach event listeners
                 ↓
9. Usuario interactúa (ej: click "Completar")
                 ↓
10. Event handler:
    - Ejecuta action.api
    - Muestra feedback (toast)
    - Refresh vista si necesario
```

---

## 8) Criterios de Aceptación

### Funcionales
- [ ] Módulos definen UI solo con JSON (sin código frontend)
- [ ] Admin Panel carga y muestra lista de módulos
- [ ] TableView renderiza correctamente con todas las features
- [ ] FormView valida y envía datos
- [ ] Acciones ejecutan APIs y dan feedback
- [ ] Filtros funcionan en tiempo real
- [ ] Paginación funciona correctamente
- [ ] Modals abren y cierran correctamente
- [ ] Refresh automático si configurado
- [ ] Módulo todo-list funciona 100% desde UI

### No Funcionales
- [ ] Diseño consistente (todos usan mismo Design System)
- [ ] Responsive (tablet y móvil básico)
- [ ] Performance (<100ms render, <500ms API)
- [ ] Accesibilidad básica (ARIA, keyboard)
- [ ] Validación con JSON Schema
- [ ] Errores manejados gracefully
- [ ] Loading states en todas las operaciones async

### Documentación
- [ ] README con arquitectura UI
- [ ] Guía para autores de módulos
- [ ] Ejemplos de cada view type
- [ ] JSON Schema documentado
- [ ] API del Renderer documentada

---

## 9) Entregables y Artefactos

### Código
```
event-core/
├── ui/                          ← Sistema UI completo
├── core/gateway/ui.js           ← UI Gateway
├── modules/todo-list/module.json ← Con UI definition
└── docs/
    ├── UI_SYSTEM_DESIGN.md      ✅ Ya existe
    ├── UI_MODULE_GUIDE.md       ⏳ Crear
    └── UI_RENDERER_API.md       ⏳ Crear
```

### Documentación en `docs/`
- [ ] `UI_MODULE_GUIDE.md` - Guía para autores
- [ ] `UI_RENDERER_API.md` - API del renderer
- [ ] `UI_COMPONENTS.md` - Componentes disponibles
- [ ] `UI_SCHEMA.json` - JSON Schema

### Tests
- [ ] `tests/unit/ui-renderer.test.js`
- [ ] `tests/integration/ui-system.test.js`
- [ ] Test manual: CRUD completo de TODO desde UI

---

## 10) Plan de Fases

### Fase 1: Core (1-2 semanas) - PRIORIDAD
- Días 1-3: Admin Panel + Router
- Días 4-5: UI Renderer core
- Días 6-7: TableView + FormView
- Días 8-9: UI Gateway
- Días 10: TODO module UI + testing

### Fase 2: Generadores (1 semana)
- Auto-CRUD desde APIs
- Schema inference
- Templates

### Fase 3: Más módulos (1 semana)
- user-management UI
- file-watcher UI
- security-p2p dashboard

### Fase 4: Avanzadas (2 semanas)
- WebSocket real-time
- Theming
- i18n
- Export
- Mobile optimization

---

## 11) Formato de Respuesta Esperado

### Al completar Fase 1, entregar:

**1. Resumen Ejecutivo** (≤200 palabras)
- Qué se implementó
- Estado actual
- Decisiones técnicas clave

**2. Lista de Archivos Creados**
```
✅ ui/admin/index.html (estructura SPA)
✅ ui/admin/app.js (router + API client)
✅ ui/admin/app.css (layout styles)
✅ ui/renderer/index.js (orchestrator)
✅ ui/renderer/viewTypes/TableView.js
✅ ui/renderer/viewTypes/FormView.js
✅ ui/components/Button.js
✅ ui/components/Input.js
✅ ui/components/Table.js
✅ ui/components/Form.js
✅ ui/components/Modal.js
✅ core/gateway/ui.js (UI Gateway)
✅ modules/todo-list/module.json (con sección ui)
✅ docs/UI_MODULE_GUIDE.md
```

**3. Instrucciones de Ejecución**
```bash
# 1. Iniciar Event Core
cd /data/data/com.termux/files/home/event-core
node index.js

# 2. Abrir Admin Panel
# Navegar a: http://localhost:3000/ui/admin/

# 3. Ir a módulo TODO
# Click en "Lista de Tareas" en sidebar

# 4. Probar CRUD completo
# - Ver lista de TODOs
# - Crear nuevo TODO
# - Completar TODO
# - Eliminar TODO
```

**4. Ejemplo Completo de module.json**
- Ya incluido arriba en sección 4.1

**5. Extracto de renderer/index.js**
```javascript
class UIRenderer {
  render(definition, container) {
    const { type } = definition;

    switch (type) {
      case 'table':
        return TableView.render(definition, container);
      case 'form':
        return FormView.render(definition, container);
      case 'detail':
        return DetailView.render(definition, container);
      case 'dashboard':
        return DashboardView.render(definition, container);
      case 'custom':
        return CustomView.render(definition, container);
      default:
        throw new Error(`Unknown view type: ${type}`);
    }
  }
}
```

**6. Variables del Design System**
- ✅ Ya definidas en `ui/styles/variables.css`

**7. JSON Schema de Validación**
- Incluir en `docs/UI_SCHEMA.json`

**8. Checklist de Aceptación**
- Copiar de sección 8

**9. Estado del Proyecto**
- Componentes completados
- Tests pasando
- Documentación actualizada
- Decisiones técnicas
- Próximos pasos

---

## 12) Integración con Event Core Existente

### HTTP Gateway Extension
```javascript
// En core/gateway/http.js - AÑADIR:

// Servir UI estática
if (pathname.startsWith('/ui/')) {
  return this.uiGateway.handleUIRequest(req, res);
}
```

### UI Gateway (`core/gateway/ui.js`)
```javascript
class UIGateway {
  // Servir /ui/admin/*, /ui/components/*, etc
  handleUIRequest(req, res) { ... }

  // GET /ui/modules - Lista módulos con UI
  handleListModules() { ... }

  // GET /ui/modules/:name - UI definition
  handleGetModuleUI(moduleName) { ... }

  // GET /ui/schema - JSON Schema
  handleGetSchema() { ... }
}
```

### Module Loader Integration
```javascript
// En core/modules/loader.js - AÑADIR:

loadModule(modulePath) {
  const manifest = require(path.join(modulePath, 'module.json'));

  // Validar sección UI si existe
  if (manifest.ui && manifest.ui.enabled) {
    this.validateUIDefinition(manifest.ui);
  }

  // ... resto del código
}

validateUIDefinition(uiDef) {
  // Validar contra JSON Schema
  const Ajv = require('ajv');
  const ajv = new Ajv();
  const valid = ajv.validate(uiSchema, uiDef);

  if (!valid) {
    throw new Error(`Invalid UI definition: ${ajv.errorsText()}`);
  }
}
```

---

## 13) Notas Finales

### Filosofía Event Core
- ✅ Modular
- ✅ Extensible
- ✅ Minimalista
- ✅ Zero Dependencies
- ✅ Observable
- ✅ Testeable

### Principios UI
- ✅ JSON-Driven (declarativo)
- ✅ Consistencia visual total
- ✅ Fácil de usar para autores
- ✅ Extensible para casos avanzados
- ✅ Performance primero

### Mantenimiento
- Todo cambio en UI debe mantener compatibilidad
- Versionado semántico de UI Schema
- Deprecation warnings antes de breaking changes
- Migración automática de definiciones antiguas

---

**FIN DEL PROMPT**

---

## Metadata

- **Versión:** 1.0.0
- **Autor:** Event Core Team
- **Fecha:** 2025-11-04
- **Última actualización:** 2025-11-04
- **Estado:** Listo para implementación
- **Prioridad:** Alta (Fase 1)

---

## Changelog

### v1.0.0 (2025-11-04)
- ✅ Prompt inicial adaptado a Event Core
- ✅ Estructura de directorios definida
- ✅ Design System ya completado
- ✅ Especificaciones técnicas completas
- ✅ Ejemplo de module.json completo
- ✅ Plan de fases detallado
- ✅ Criterios de aceptación definidos
