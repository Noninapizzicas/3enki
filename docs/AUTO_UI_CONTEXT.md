# Auto-UI v2.0 System - Contexto Completo

## 📋 Índice

1. [Descripción General](#descripción-general)
2. [Arquitectura v2.0](#arquitectura-v20)
3. [Sistemas Core](#sistemas-core)
4. [Componentes del Motor](#componentes-del-motor)
5. [Biblioteca de Componentes](#biblioteca-de-componentes)
6. [Sistema de Templates y Scripts](#sistema-de-templates-y-scripts)
7. [Integración con HTTP Gateway](#integración-con-http-gateway)
8. [Sistema de Temas](#sistema-de-temas)
9. [Configuración en module.json](#configuración-en-modulejson)
10. [Flujo de Renderizado](#flujo-de-renderizado)
11. [API Reference](#api-reference)
12. [Ejemplos de Uso](#ejemplos-de-uso)
13. [Migración desde v1](#migración-desde-v1)

---

## Descripción General

**Auto-UI v2.0** es un motor de generación automática de interfaces de usuario que crea UIs completas, robustas e innovadoras desde configuraciones JSON definidas en `module.json`.

### Características Principales

- ✅ **Schema-Driven**: UI generada desde schemas de módulos
- ✅ **Zero-Frontend Code**: No requiere escribir HTML/CSS/JS
- ✅ **Real-time Updates**: Integración MQTT/SSE
- ✅ **Component System**: 21 componentes predefinidos con variantes
- ✅ **Advanced Validation**: Sistema de validación sync/async con custom validators
- ✅ **Permission System**: Control de acceso granular field-level y row-level
- ✅ **Layout Engine**: 10 tipos de layouts declarativos
- ✅ **Widget Factory**: 9 widgets pre-construidos para dashboards
- ✅ **Data Resolver**: Binding dinámico con @data, @compute, @api, @metrics
- ✅ **Theme System**: Design tokens centralizados con CSS variables
- ✅ **HTMX Integration**: Interactividad sin JavaScript custom
- ✅ **Modern CSS**: 600+ líneas de CSS con animaciones y utilities
- ✅ **Client Scripts**: Toast, modals, validación, hold interactions

### Novedades en v2.0

🆕 **ComponentSystem** - Registro y renderizado de componentes con caché
🆕 **Resolver** - Data binding dinámico con funciones compute
🆕 **LayoutEngine** - 10 layouts predefinidos (tabs, accordion, grid, etc.)
🆕 **WidgetFactory** - Widgets para dashboards (stat-cards, charts, tables)
🆕 **Validator** - Validación avanzada con custom y async validators
🆕 **PermissionSystem** - Permisos granulares con custom resolvers
🆕 **Composer** - Orquestación de todos los subsistemas
🆕 **GeneratorV2** - Templates HTML mejorados con CSS moderno
🆕 **Client Scripts** - core.js con 15+ funcionalidades cliente

### Ubicación en el Proyecto

```
/auto-ui/
├── engine/
│   ├── index-v2.js          # Engine v2.0 (orchestrador principal)
│   ├── index.js             # Engine v1 (legacy, retrocompatibilidad)
│   ├── generator-v2.js      # Generador v2 con templates mejorados
│   ├── generator.js         # Generador v1 (legacy)
│   ├── component-system.js  # Sistema de componentes
│   ├── resolver.js          # Resolución de datos dinámicos
│   ├── layout-engine.js     # Motor de layouts
│   ├── widget-factory.js    # Fábrica de widgets
│   ├── validator.js         # Sistema de validación
│   ├── permission-system.js # Sistema de permisos
│   ├── composer.js          # Composición de vistas
│   ├── loader.js            # Cargador de recursos
│   └── bridge.js            # Puente MQTT/SSE
├── client/
│   └── core.js              # Scripts del cliente (570 líneas)
├── components/
│   ├── COMPONENT_REGISTRY.md # Registro completo de 21 componentes
│   ├── core/                # Componentes básicos (1)
│   ├── data/                # Componentes de datos (4)
│   ├── form/                # Componentes de formulario (6)
│   ├── navigation/          # Componentes de navegación (4)
│   ├── layout/              # Componentes de layout (1)
│   └── feedback/            # Componentes de feedback (5)
├── config/
│   └── theme.json           # Tema activo
├── examples/
│   ├── 01-basic-crud.json   # CRUD básico
│   ├── 02-dashboard-complex.json # Dashboard complejo
│   ├── 03-form-validation.json   # Validación avanzada
│   └── README.md
├── ARCHITECTURE.md          # Arquitectura detallada v2.0
├── MIGRATION_GUIDE.md       # Guía de migración v1 → v2
└── TEMPLATES_SCRIPTS_GUIDE.md # Guía de templates y scripts
```

---

## Arquitectura v2.0

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│             HTTP Gateway (port 3000/3001)                   │
│    Detecta rutas /auto-ui/* → delega a AutoUI v2           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              AutoUI v2 Engine (index-v2.js)                 │
│  • Routing interno (/auto-ui/*)                             │
│  • Coordina 7 sistemas core                                 │
│  • Sirve static JS (/auto-ui/js/core.js)                   │
└─┬────────────┬─────────────┬─────────────┬─────────────┬───┘
  │            │             │             │             │
  ▼            ▼             ▼             ▼             ▼
┌──────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐
│Loader│  │Component │  │ Resolver │  │  Layout  │  │ Widget │
│      │  │  System  │  │          │  │  Engine  │  │Factory │
└──────┘  └──────────┘  └──────────┘  └──────────┘  └────────┘
             │
             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │Validator │  │Permission│  │ Composer │
        │          │  │  System  │  │          │
        └──────────┘  └──────────┘  └──────────┘
             │
             ▼
        ┌──────────────┐  ┌──────────┐
        │ GeneratorV2  │  │  Bridge  │
        │              │  │ MQTT↔SSE │
        └──────────────┘  └──────────┘
```

### Flujo de Request v2.0

```
1. Browser → GET /auto-ui/credential-manager
2. HTTP Gateway → Detecta /auto-ui/*
3. AutoUIv2.handle(req, res)
4. Loader.getModule('credential-manager')
5. Composer.composeView(module.views.main, context)
   ├─→ Resolver.resolveDeep(@data references)
   ├─→ PermissionSystem.filterByPermissions(user)
   ├─→ LayoutEngine.render(layout, sections)
   ├─→ WidgetFactory.create(widgets)
   ├─→ ComponentSystem.render(components)
   └─→ Validator.validateSchema(forms)
6. GeneratorV2.page(title, content, options)
7. HTML completo con estilos modernos + HTMX + Client Scripts
8. Response → Browser renderiza con AutoUI.js ejecutándose
```

---

## Sistemas Core

Auto-UI v2.0 se compone de 7 sistemas core interconectados:

### 1. ComponentSystem (`component-system.js`)

**Responsabilidades:**
- Registrar y gestionar componentes declarativos
- Renderizar componentes con props y contexto
- Cachear renders para performance (LRU cache de 200 items)
- Validar definiciones de componentes
- Normalizar props y variantes

**API:**
```javascript
componentSystem.register(name, definition)
componentSystem.render(name, props, context)
componentSystem.has(name)
componentSystem.list()
componentSystem.getStats()
```

**Ejemplo:**
```javascript
componentSystem.render('button', {
  variant: 'primary',
  size: 'md',
  label: 'Click me',
  icon: '🚀'
}, context);
// → Retorna HTML del botón con estilos aplicados
```

---

### 2. Resolver (`resolver.js`)

**Responsabilidades:**
- Resolver referencias dinámicas (@data, @metrics, @api, @env, @compute)
- Ejecutar funciones compute (sum, avg, count, min, max, etc.)
- Resolver profundo (deep) de objetos anidados
- Registrar custom resolvers
- Cachear resoluciones

**Referencias Soportadas:**

| Tipo | Ejemplo | Descripción |
|------|---------|-------------|
| `@data` | `@data.user.name` | Datos del contexto |
| `@metrics` | `@metrics.tasks.count` | Métricas del sistema |
| `@env` | `@env.NODE_ENV` | Variables de entorno |
| `@compute` | `@compute.sum(@data.items, "price")` | Cálculos dinámicos |
| `@api` | `@api./stats/total` | Llamadas a API |

**Funciones Compute:**
- `sum(array, field)` - Sumar valores
- `avg(array, field)` - Promedio
- `count(array, condition?)` - Contar elementos
- `min(array, field)` - Mínimo valor
- `max(array, field)` - Máximo valor
- `filter(array, condition)` - Filtrar elementos
- `map(array, transform)` - Transformar elementos
- `find(array, condition)` - Encontrar elemento
- `format(value, type)` - Formatear (date, currency, etc.)

**Ejemplo:**
```javascript
// En module.json
{
  "widget": "stat-card",
  "config": {
    "label": "Total Ventas",
    "value": "@compute.sum(@data.orders, 'total')",
    "icon": "💰"
  }
}

// El resolver ejecuta:
const orders = context.data.orders;
const total = orders.reduce((sum, o) => sum + o.total, 0);
// → Retorna el valor calculado
```

---

### 3. LayoutEngine (`layout-engine.js`)

**Responsabilidades:**
- Renderizar 10 tipos de layouts predefinidos
- Coordinar secciones y contenido
- Generar HTML con estructura semántica
- Soportar layouts anidados

**Layouts Disponibles:**

| Layout | Descripción | Uso |
|--------|-------------|-----|
| `two-column` | Dos columnas configurables | Dashboards, paneles |
| `three-column` | Tres columnas | Layouts complejos |
| `grid` | Grid responsive | Cards, productos |
| `flex` | Flexbox layout | Listas flexibles |
| `tabs` | Pestañas | Organizar contenido |
| `accordion` | Acordeón expandible | FAQs, secciones |
| `split` | Split vertical/horizontal | Editores |
| `sidebar` | Sidebar + main | Navegación lateral |
| `header-content-footer` | 3 secciones | Página completa |
| `masonry` | Masonry layout | Pinterest-style |

**Ejemplo:**
```javascript
// En module.json
{
  "views": {
    "main": {
      "type": "dashboard",
      "layout": {
        "type": "two-column",
        "config": {
          "leftWidth": "65%",
          "rightWidth": "35%",
          "gap": "var(--space-lg)"
        }
      }
    }
  }
}
```

---

### 4. WidgetFactory (`widget-factory.js`)

**Responsabilidades:**
- Crear widgets pre-construidos para dashboards
- Renderizar con datos dinámicos
- Registrar custom widgets
- Gestionar variantes de widgets

**Widgets Disponibles:**

| Widget | Descripción | Props Clave |
|--------|-------------|-------------|
| `stat-card` | Tarjeta de estadística | value, label, icon, trend |
| `progress-bar` | Barra de progreso | value, max, label, color |
| `table-advanced` | Tabla avanzada | columns, data, sortable |
| `list` | Lista con items | items, showIcon, showBadge |
| `activity-feed` | Feed de actividad | activities, maxItems |
| `chart` | Gráfico (placeholder) | type, data, options |
| `badge` | Badge/etiqueta | text, variant, size |
| `alert` | Alerta/mensaje | message, type, closable |
| `empty-state` | Estado vacío | icon, title, description |

**Ejemplo:**
```javascript
// En module.json
{
  "sections": [
    {
      "widget": "stat-card",
      "config": {
        "label": "Usuarios Activos",
        "value": "@metrics.users.active",
        "icon": "👥",
        "trend": "+12%",
        "trendDirection": "up"
      }
    }
  ]
}
```

---

### 5. Validator (`validator.js`)

**Responsabilidades:**
- Validar campos de formularios
- Soporte para validación síncrona y asíncrona
- Custom validators registrables
- Validación condicional
- Validación de dependencies entre campos

**Reglas Built-in:**

| Regla | Descripción | Ejemplo |
|-------|-------------|---------|
| `required` | Campo requerido | `{required: true}` |
| `type` | Validación de tipo | `{type: 'email'}` |
| `minLength/maxLength` | Longitud de texto | `{minLength: 3, maxLength: 50}` |
| `min/max` | Valor numérico | `{min: 0, max: 100}` |
| `pattern` | Regex pattern | `{pattern: '^[A-Z]'}` |
| `email` | Email válido | `{email: true}` |
| `url` | URL válida | `{url: true}` |
| `custom` | Validador custom | `{custom: 'myValidator'}` |
| `async` | Validador async | `{async: 'checkUnique'}` |
| `conditional` | Validación condicional | `{if: {...}}` |

**Validators Custom Built-in:**
- `apiKey` - Validar formato de API key
- `strongPassword` - Contraseña fuerte
- `phone` - Número de teléfono
- `creditCard` - Tarjeta de crédito
- `ipAddress` - Dirección IP
- `macAddress` - Dirección MAC
- `uuid` - UUID válido
- `slug` - URL slug
- `hexColor` - Color hexadecimal
- Y más...

**Ejemplo:**
```javascript
// En module.json
{
  "schema": {
    "email": {
      "type": "string",
      "required": true,
      "email": true,
      "async": "checkEmailUnique"
    },
    "password": {
      "type": "string",
      "required": true,
      "custom": "strongPassword",
      "minLength": 8
    },
    "confirmPassword": {
      "type": "string",
      "required": true,
      "match": "password"
    }
  }
}
```

---

### 6. PermissionSystem (`permission-system.js`)

**Responsabilidades:**
- Control de acceso granular a vistas y campos
- Permisos basados en roles
- Operadores lógicos (AND, OR, NOT)
- Custom permission resolvers
- Field-level permissions
- Row-level permissions

**Estructura de Permisos:**

```javascript
// Simple - lista de roles
"permissions": ["admin", "user"]

// AND - todos deben cumplirse
"permissions": {
  "and": ["admin", {"custom": "isOwner"}]
}

// OR - al menos uno debe cumplirse
"permissions": {
  "or": ["admin", {"custom": "isOwner"}]
}

// NOT - negar permiso
"permissions": {
  "not": "guest"
}

// Combinado
"permissions": {
  "and": [
    "user",
    {
      "or": [
        "admin",
        {"custom": "isOwner"}
      ]
    }
  ]
}
```

**Resolvers Built-in:**
- `isAdmin` - Usuario es admin
- `isOwner` - Usuario es dueño del recurso
- `hasRole` - Usuario tiene rol específico
- `hasPermission` - Usuario tiene permiso específico
- `isAuthenticated` - Usuario autenticado
- `isGuest` - Usuario no autenticado
- `isMember` - Usuario es miembro de grupo
- `custom` - Resolver personalizado

**Ejemplo:**
```javascript
// En module.json
{
  "views": {
    "main": {
      "permissions": ["admin", "user"]
    },
    "create": {
      "permissions": {
        "or": [
          "admin",
          {"custom": "canCreateInDepartment"}
        ]
      }
    }
  },
  "schema": {
    "salary": {
      "type": "number",
      "permissions": {
        "view": ["admin", "hr"],
        "edit": ["admin"]
      }
    }
  }
}
```

---

### 7. Composer (`composer.js`)

**Responsabilidades:**
- Orquestar todos los subsistemas
- Componer vistas completas desde definiciones
- Coordinar resolución, permisos, layouts, widgets
- Generar HTML final

**Flujo de Composición:**

```
1. Composer.composeView(viewDef, context)
2. → Resolver.resolveDeep(viewDef) - Resolver @data, @compute
3. → PermissionSystem.filterByPermissions(resolved, user) - Filtrar por permisos
4. → Determinar tipo de vista (dashboard, form, modal, etc.)
5. → LayoutEngine.render(layout, sections) - Renderizar layout
6. → Para cada section:
   ├─→ Si es widget: WidgetFactory.create(widget)
   ├─→ Si es component: ComponentSystem.render(component)
   └─→ Si es form: Validator.getValidationRules(schema)
7. → Retornar HTML compuesto
```

**Tipos de Vista Soportados:**
- `dashboard` - Dashboard con widgets
- `form` - Formulario create/edit
- `detail` - Vista de detalle
- `modal` - Modal con contenido
- `list` - Lista de items
- `table` - Tabla de datos
- `custom` - Vista personalizada

---

## Componentes del Motor

### AutoUI v2 Engine (`auto-ui/engine/index-v2.js`)

**Inicialización:**
```javascript
class AutoUIv2 {
  constructor(options = {}) {
    this.loader = new Loader({...});
    this.bridge = new Bridge({...});

    // V2 Systems
    this.componentSystem = new ComponentSystem({...});
    this.resolver = new Resolver({...});
    this.layoutEngine = new LayoutEngine({...});
    this.widgetFactory = new WidgetFactory({...});
    this.validator = new Validator({...});
    this.permissionSystem = new PermissionSystem({...});
    this.composer = new Composer({...});

    // V2 Generator
    this.generator = new GeneratorV2({...});

    // Legacy support
    this.generatorLegacy = new Generator({...});
  }
}
```

**Rutas Disponibles:**

| Ruta | Método | Handler | Descripción |
|------|--------|---------|-------------|
| `/auto-ui` | GET | `handleDashboard` | Dashboard principal |
| `/auto-ui/:module` | GET | `handleModuleView` | Vista de módulo (v2) |
| `/auto-ui/:module/list` | GET | `handleModuleList` | Lista/tabla |
| `/auto-ui/:module/rows` | GET | `handleModuleRows` | Filas de tabla (HTMX) |
| `/auto-ui/:module/form` | GET | `handleModuleForm` | Formulario crear |
| `/auto-ui/:module/form/:id` | GET | `handleModuleForm` | Formulario editar |
| `/auto-ui/:module/detail/:id` | GET | `handleModuleDetail` | Vista detalle |
| `/auto-ui/events` | GET | `bridge.connect` | SSE stream |
| `/auto-ui/js/core.js` | GET | `handleStaticJS` | JavaScript cliente |
| `/auto-ui/theme` | GET | `handleGetTheme` | Obtener tema |
| `/auto-ui/theme` | PUT | `handleSetTheme` | Cambiar tema |

---

### Generator V2 (`auto-ui/engine/generator-v2.js`)

**Mejoras en v2:**
- ✅ 600+ líneas de CSS moderno
- ✅ 6 keyframes de animación (fadeIn, slideIn, toastIn, spin, shimmer, pulse)
- ✅ 50+ utility classes (flex, grid, text, spacing)
- ✅ Componentes mejorados (buttons, cards, forms, tables)
- ✅ Estados y variantes completos
- ✅ Responsive design (breakpoint 768px)
- ✅ Dark theme por defecto
- ✅ Skeleton loaders y spinners

**CSS Variables Generadas:**
```css
:root {
  /* Colors - 17 variables */
  --bg, --bg-card, --bg-hover, --bg-input
  --text, --text-muted, --text-disabled
  --primary, --primary-hover
  --success, --warning, --danger, --info
  --border, --border-focus, --overlay

  /* Spacing - 6 niveles */
  --space-xs, --space-sm, --space-md, --space-lg, --space-xl, --space-2xl

  /* Border Radius - 6 opciones */
  --radius-none, --radius-sm, --radius-md, --radius-lg, --radius-xl, --radius-full

  /* Typography - 9 variables */
  --font, --font-mono
  --size-xs, --size-sm, --size-base, --size-lg, --size-xl, --size-2xl
  --weight-normal, --weight-medium, --weight-semibold, --weight-bold
  --line-height

  /* Shadows - 5 niveles */
  --shadow-none, --shadow-sm, --shadow-md, --shadow-lg, --shadow-xl

  /* Transitions - 3 velocidades */
  --transition-fast, --transition-normal, --transition-slow
}
```

**Métodos:**
```javascript
page(title, content, options)          // Página completa con layout
generateCSS()                          // CSS completo con theme
generateThemeVariables(theme)          // CSS variables
generateBaseStyles()                   // Estilos base
generateComponentStyles()              // Estilos de componentes
generateAnimations()                   // Keyframes
generateUtilities()                    // Utility classes
sidebar()                              // Sidebar navegación
dashboard()                            // Dashboard principal
list(module, options)                  // Vista lista/tabla
rows(module, data)                     // Filas de tabla
form(module, data)                     // Formulario
detail(module, data)                   // Vista detalle
```

---

### Client Scripts (`auto-ui/client/core.js`)

**570 líneas de JavaScript cliente con:**

#### Toast System
```javascript
AutoUI.showToast(message, type, duration)
// Types: success, warning, danger, info
// Auto-dismiss, closable, múltiples toasts simultáneos
```

#### Modal System
```javascript
AutoUI.openModal(content, options)
AutoUI.closeModal(modal)
// Focus trap, click outside to close, múltiples modales, animaciones
```

#### Action Executor
```javascript
AutoUI.executeAction(action, params, element)
// Actions: navigate, back, refresh, show_toast, open_modal,
//          close_modal, delete, submit_form, emit, custom
```

#### Hold Interaction
```javascript
// Mantener presionado para ejecutar acción
// Progress circular visual, cancelable, feedback visual
// data-hold='{"action":"delete","endpoint":"/api/item/123","duration":2000}'
```

#### Form Validation
```javascript
AutoUI.validateForm(form)
AutoUI.validateField(input)
AutoUI.showFieldError(input, error)
AutoUI.clearFieldError(input)
// Validación en submit, validación en blur, mensajes de error
```

#### Utilities
```javascript
AutoUI.escapeHtml(str)
AutoUI.copyToClipboard(text)
AutoUI.downloadJSON(data, filename)
AutoUI.debounce(func, delay)
AutoUI.toggleSidebar()
AutoUI.switchTab(idx)
AutoUI.toggleAccordion(btn)
```

#### Keyboard Shortcuts
- `Esc` - Cerrar modal
- `Ctrl/Cmd + K` - Focus en search

#### HTMX Events
- `htmx:afterSwap` - Log después de swap
- `htmx:responseError` - Toast de error

---

## Biblioteca de Componentes

Auto-UI v2.0 incluye **21 componentes** organizados en 6 categorías.

### 📊 Componentes por Categoría

| Categoría | Cantidad | Componentes |
|-----------|----------|-------------|
| **Core** | 1 | button |
| **Data** | 4 | table, grid, list, tree |
| **Form** | 6 | input, select, checkbox, radio, textarea, file-upload |
| **Navigation** | 4 | navbar, breadcrumb, pagination, tabs |
| **Layout** | 1 | card |
| **Feedback** | 5 | toast, alert, progress, skeleton, spinner |

### Componentes Destacados

#### Button (`core/button.json`)
- 7 variantes: primary, secondary, success, warning, danger, ghost, outline
- 3 tamaños: sm, md, lg
- Hold interaction (mantener presionado)
- Loading state, icon support

#### Table (`data/table.json`)
- Sorting client/server
- Filtering client/server
- Pagination client/server
- Row selection (single/multi)
- Row actions
- Column resizing

#### Input (`form/input.json`)
- 10 tipos: text, email, password, number, tel, url, search, date, time, datetime-local
- Validation built-in
- Prefix/suffix icons
- Help text y error states

#### Select (`form/select.json`)
- Single/multi select
- Searchable
- Remote search
- Virtual scrolling
- Tags creation

#### Navbar (`navigation/navbar.json`)
- Responsive (hamburger menu)
- Dropdowns
- Search integration
- Sticky behavior
- Avatar menu

#### Alert (`feedback/alert.json`)
- 4 tipos: info, success, warning, danger
- 3 estilos: solid, outlined, subtle
- Closable, actions, banner mode

#### Progress (`feedback/progress.json`)
- 4 variantes: bar, circle, ring, line
- Determinate/indeterminate
- Multi-segment
- Gradient colors

#### Skeleton (`feedback/skeleton.json`)
- 7 tipos: text, title, paragraph, avatar, image, button, card
- 3 animaciones: wave, pulse, shimmer
- Presets: post, userCard, table, form

#### Spinner (`feedback/spinner.json`)
- 8 variantes: circle, dots, bars, ring, dualRing, bounce, pulse, ellipsis
- 5 tamaños: xs (16px) a xl (64px)
- Overlay y fullscreen mode

**Ver documentación completa:** `/auto-ui/components/COMPONENT_REGISTRY.md`

---

## Sistema de Templates y Scripts

### Templates HTML Mejorados (GeneratorV2)

**Características:**
- 600+ líneas de CSS inline
- 6 keyframes de animación
- 50+ utility classes
- Componentes con estados completos
- Responsive design (768px breakpoint)
- Dark theme por defecto

**Componentes Estilizados:**
- Buttons (6 variantes, 3 tamaños)
- Cards (3 variantes)
- Forms (todos los inputs, states, validation)
- Tables (striped, hover, responsive)
- Modals (animations, backdrop, focus trap)
- Toasts (4 tipos, animations, auto-dismiss)
- Loading states (spinners, skeletons)

### Client Scripts (core.js)

**15+ Funcionalidades:**
1. Toast notification system
2. Modal system
3. Action executor
4. Hold interaction
5. Sidebar toggle
6. Tab system
7. Accordion system
8. Form validation
9. Keyboard shortcuts
10. HTMX event handlers
11. Debounce utility
12. Escape HTML
13. Copy to clipboard
14. Download JSON
15. Get clip path (circular progress)

**Ver documentación completa:** `/auto-ui/TEMPLATES_SCRIPTS_GUIDE.md`

---

## Integración con HTTP Gateway

### En `core/gateway/http.js`

```javascript
// Inicialización (actualizar a v2)
const AutoUI = require('../../auto-ui/engine/index-v2');  // v2!
this.autoUI = new AutoUI({
  modulesPath: this.moduleLoader.modulesPath,
  eventBus: this.eventBus,
  logger: this.logger
});

// Routing
if (this.autoUI && pathname.startsWith('/auto-ui')) {
  await this.handleAutoUIRoute(req, res);
  return;
}

// Handler
async handleAutoUIRoute(req, res) {
  try {
    res.req = req;  // Attach para SSE
    await this.autoUI.handle(req, res);
  } catch (error) {
    this.sendError(res, 500, 'Auto-UI error');
  }
}
```

---

## Sistema de Temas

### Estructura theme.json (Expandida en v2)

```json
{
  "name": "event-core-dark",
  "version": "2.0.0",

  "colors": {
    "bg": "#0f1216",
    "bg-card": "#1a1d24",
    "bg-hover": "#262932",
    "bg-input": "#1f2329",
    "text": "#ffffff",
    "text-muted": "#9ca3af",
    "text-disabled": "#6b7280",
    "primary": "#3b82f6",
    "primary-hover": "#2563eb",
    "success": "#22c55e",
    "warning": "#f59e0b",
    "danger": "#ef4444",
    "info": "#3b82f6",
    "border": "#374151",
    "border-focus": "#3b82f6",
    "overlay": "rgba(0, 0, 0, 0.5)"
  },

  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px",
    "2xl": "48px"
  },

  "radius": {
    "none": "0",
    "sm": "4px",
    "md": "8px",
    "lg": "12px",
    "xl": "16px",
    "full": "9999px"
  },

  "typography": {
    "font": "system-ui, -apple-system, 'Segoe UI', sans-serif",
    "font-mono": "'Fira Code', 'Consolas', monospace",
    "size-xs": "0.75rem",
    "size-sm": "0.875rem",
    "size-base": "1rem",
    "size-lg": "1.125rem",
    "size-xl": "1.25rem",
    "size-2xl": "1.5rem",
    "weight-normal": "400",
    "weight-medium": "500",
    "weight-semibold": "600",
    "weight-bold": "700",
    "line-height": "1.5"
  },

  "shadows": {
    "none": "none",
    "sm": "0 1px 2px rgba(0, 0, 0, 0.3)",
    "md": "0 4px 6px rgba(0, 0, 0, 0.4)",
    "lg": "0 10px 15px rgba(0, 0, 0, 0.5)",
    "xl": "0 20px 25px rgba(0, 0, 0, 0.6)"
  },

  "transitions": {
    "fast": "150ms cubic-bezier(0.4, 0, 0.2, 1)",
    "normal": "250ms cubic-bezier(0.4, 0, 0.2, 1)",
    "slow": "350ms cubic-bezier(0.4, 0, 0.2, 1)"
  }
}
```

---

## Configuración en module.json

### Configuración v2.0 (Expandida)

```json
{
  "name": "tasks",
  "version": "2.0.0",

  "ui": {
    "enabled": true,
    "version": "2.0",  // Importante para usar v2!
    "title": "Task Manager",
    "icon": "✓",
    "description": "Gestión de tareas",

    "views": {
      "main": {
        "type": "dashboard",
        "permissions": ["admin", "user"],

        "layout": {
          "type": "two-column",
          "config": {
            "leftWidth": "65%",
            "rightWidth": "35%",
            "gap": "var(--space-lg)"
          }
        },

        "sections": [
          {
            "id": "stats",
            "widget": "stat-card",
            "config": {
              "label": "Total Tareas",
              "value": "@compute.count(@data.tasks)",
              "icon": "📊",
              "trend": "@compute.percentage(@data.completedToday, @data.totalToday)",
              "trendDirection": "up"
            }
          },
          {
            "id": "tasks_table",
            "widget": "table-advanced",
            "config": {
              "columns": [
                {"key": "title", "label": "Título", "sortable": true},
                {"key": "status", "label": "Estado", "sortable": true},
                {"key": "dueDate", "label": "Vencimiento", "format": "date"}
              ],
              "dataSource": "@data.tasks",
              "sortable": true,
              "filterable": true,
              "paginated": true,
              "actions": [
                {
                  "label": "Editar",
                  "icon": "✏️",
                  "action": "edit",
                  "permissions": ["admin", {"custom": "isOwner"}]
                },
                {
                  "label": "Eliminar",
                  "icon": "🗑️",
                  "action": "delete",
                  "permissions": ["admin"],
                  "confirm": true
                }
              ]
            }
          }
        ]
      },

      "create": {
        "type": "form",
        "permissions": {
          "or": ["admin", {"custom": "canCreateTasks"}]
        },
        "config": {
          "title": "Nueva Tarea",
          "endpoint": "/modules/tasks/tasks",
          "method": "POST",
          "validation": true,
          "fields": [
            {
              "name": "title",
              "component": "input",
              "variant": "text",
              "props": {
                "label": "Título",
                "required": true,
                "minLength": 3,
                "maxLength": 100,
                "helpText": "Nombre descriptivo de la tarea"
              }
            },
            {
              "name": "description",
              "component": "textarea",
              "variant": "autosize",
              "props": {
                "label": "Descripción",
                "minRows": 3,
                "maxRows": 10,
                "maxLength": 500,
                "showCounter": true
              }
            },
            {
              "name": "priority",
              "component": "select",
              "variant": "default",
              "props": {
                "label": "Prioridad",
                "options": [
                  {"value": "low", "label": "Baja", "icon": "🟢"},
                  {"value": "medium", "label": "Media", "icon": "🟡"},
                  {"value": "high", "label": "Alta", "icon": "🔴"}
                ],
                "required": true
              }
            },
            {
              "name": "dueDate",
              "component": "input",
              "variant": "date",
              "props": {
                "label": "Fecha de Vencimiento",
                "required": true,
                "min": "@env.TODAY"
              }
            }
          ]
        }
      }
    },

    "mqtt": {
      "enabled": true,
      "topics": [
        "task.created",
        "task.updated",
        "task.deleted"
      ],
      "auto_refresh": true
    }
  },

  "schema": {
    "title": {
      "type": "string",
      "label": "Título",
      "required": true,
      "minLength": 3,
      "maxLength": 100
    },
    "description": {
      "type": "string",
      "label": "Descripción",
      "maxLength": 500
    },
    "priority": {
      "type": "enum",
      "label": "Prioridad",
      "enum": ["low", "medium", "high"],
      "required": true
    },
    "status": {
      "type": "enum",
      "label": "Estado",
      "enum": ["pending", "in_progress", "completed"],
      "default": "pending"
    },
    "dueDate": {
      "type": "date",
      "label": "Vencimiento",
      "required": true
    }
  },

  "apis": [
    {
      "method": "GET",
      "path": "/tasks",
      "handler": "handleListTasks"
    },
    {
      "method": "POST",
      "path": "/tasks",
      "handler": "handleCreateTask"
    },
    {
      "method": "PUT",
      "path": "/tasks/:id",
      "handler": "handleUpdateTask"
    },
    {
      "method": "DELETE",
      "path": "/tasks/:id",
      "handler": "handleDeleteTask"
    }
  ]
}
```

---

## Flujo de Renderizado

### Flujo Completo v2.0

```
1. Request
   Browser → GET /auto-ui/tasks

2. Gateway Routing
   HTTP Gateway → detecta /auto-ui/* → delega a AutoUIv2

3. AutoUI Processing
   AutoUIv2.handle(req, res)
   ├─→ Parsear ruta → moduleName='tasks', view='main'
   ├─→ Loader.getModule('tasks')
   └─→ Verificar ui.version === '2.0'

4. View Composition
   Composer.composeView(module.views.main, context)
   ├─→ Resolver.resolveDeep(viewDef)
   │   ├─→ @data.tasks → fetch de API
   │   ├─→ @compute.count(@data.tasks) → calcular
   │   └─→ @metrics.* → obtener métricas
   ├─→ PermissionSystem.filterByPermissions(resolved, user)
   │   ├─→ Verificar permisos de vista
   │   ├─→ Filtrar acciones por permisos
   │   └─→ Ocultar campos sin permisos
   ├─→ LayoutEngine.render('two-column', sections)
   │   └─→ Generar estructura HTML del layout
   └─→ Para cada section:
       ├─→ Si es widget:
       │   └─→ WidgetFactory.create('stat-card', config)
       ├─→ Si es component:
       │   └─→ ComponentSystem.render('table', props, context)
       └─→ Si es form:
           └─→ Validator.getValidationRules(schema)

5. HTML Generation
   GeneratorV2.page(title, composedContent, options)
   ├─→ generateCSS() → 600+ líneas de CSS con theme
   ├─→ sidebar() → navegación lateral
   ├─→ Wrap content en layout
   └─→ Inyectar scripts (HTMX, core.js, SSE)

6. Response
   res.end(html)
   └─→ HTML completo (~2000 líneas) con:
       ├─→ CSS inline con variables
       ├─→ HTMX para interactividad
       ├─→ AutoUI.js ejecutándose
       ├─→ SSE conectado
       └─→ UI completamente funcional

7. Browser Rendering
   ├─→ Parsear HTML
   ├─→ Aplicar CSS (dark theme)
   ├─→ HTMX inicializa
   ├─→ core.js inicializa
   │   ├─→ Restaurar sidebar state
   │   ├─→ Setup form validation
   │   ├─→ Setup keyboard shortcuts
   │   └─→ Setup HTMX events
   ├─→ Conectar SSE
   └─→ Renderizar UI completamente funcional

8. Real-time Updates
   Backend → emite task.created (MQTT)
   ├─→ Bridge detecta evento
   ├─→ Envía por SSE a clientes conectados
   ├─→ core.js recibe evento
   └─→ HTMX refresh automático de tabla
```

---

## API Reference

### AutoUIv2 Class

```javascript
class AutoUIv2 {
  constructor(options)
  async init()
  async handle(req, res)
  handleDashboard(req, res)
  handleModuleView(req, res, moduleName)  // Nueva en v2
  handleModuleList(req, res, moduleName)
  handleModuleRows(req, res, moduleName)
  handleModuleForm(req, res, moduleName, id)
  handleModuleDetail(req, res, moduleName, id)
  handleStaticJS(res)                     // Nueva en v2
  handleGetTheme(req, res)
  handleSetTheme(req, res)
  async reload()
  getStats()
}
```

### ComponentSystem Class

```javascript
class ComponentSystem {
  register(name, definition)
  render(name, props, context)
  has(name)
  list()
  unregister(name)
  clearCache()
  getStats()
}
```

### Resolver Class

```javascript
class Resolver {
  async resolve(value, context)
  async resolveDeep(obj, context)
  parseReference(ref)
  resolveData(ref, context)
  resolveMetrics(ref, context)
  resolveEnv(ref, context)
  async resolveCompute(ref, context)
  async resolveApi(ref, context)
  registerComputeFunction(name, fn)
  registerResolver(type, fn)
}
```

### LayoutEngine Class

```javascript
class LayoutEngine {
  register(name, definition)
  async render(type, config, context, engine)
  has(name)
  list()
  unregister(name)
}
```

### WidgetFactory Class

```javascript
class WidgetFactory {
  register(name, definition)
  create(type, data, config)
  has(name)
  list()
  unregister(name)
}
```

### Validator Class

```javascript
class Validator {
  async validate(value, rules, context)
  async validateObject(obj, schema, context)
  register(name, fn)
  has(name)
  list()
  unregister(name)
}
```

### PermissionSystem Class

```javascript
class PermissionSystem {
  async check(permission, context)
  async filterByPermissions(obj, context)
  registerResolver(name, fn)
  hasResolver(name)
  listResolvers()
  unregisterResolver(name)
}
```

### Composer Class

```javascript
class Composer {
  async composeView(viewDef, context)
  async composeDashboard(viewDef, context)
  async composeForm(viewDef, context)
  async composeDetail(viewDef, context)
  async composeModal(viewDef, context)
  async composeList(viewDef, context)
  async composeTable(viewDef, context)
}
```

### GeneratorV2 Class

```javascript
class GeneratorV2 {
  page(title, content, options)
  generateCSS()
  generateThemeVariables(theme)
  generateBaseStyles()
  generateComponentStyles()
  generateAnimations()
  generateUtilities()
  sidebar()
  dashboard()
  list(module, options)
  rows(module, data)
  form(module, data)
  detail(module, data)
  sseScript()
}
```

---

## Ejemplos de Uso

### Ejemplo 1: CRUD Básico

Ver: `/auto-ui/examples/01-basic-crud.json`

**Características:**
- Tabla con sorting, filtering, pagination
- CRUD operations (Create, Read, Update, Delete)
- Form validation
- Real-time updates via MQTT

### Ejemplo 2: Dashboard Complejo

Ver: `/auto-ui/examples/02-dashboard-complex.json`

**Características:**
- Two-column layout
- Multiple widgets (stat-cards, charts, tables, activity feeds)
- Data binding con @compute
- Permission-based access
- Tabbed interface

### Ejemplo 3: Form Validation

Ver: `/auto-ui/examples/03-form-validation.json`

**Características:**
- Comprehensive validation rules
- Async validation (username/email uniqueness)
- Custom validators (strong password, phone, etc.)
- Conditional validation
- Field dependencies

---

## Migración desde v1

### Cambios Breaking

#### 1. Módulos deben especificar versión

```json
// v1 (implícito)
{ "ui": { "enabled": true } }

// v2 (explícito)
{ "ui": { "enabled": true, "version": "2.0" } }
```

#### 2. Importar engine v2

```javascript
// v1
const AutoUI = require('./auto-ui/engine');

// v2
const AutoUI = require('./auto-ui/engine/index-v2');
```

#### 3. Estructura de vistas

```json
// v1 - Simple
{
  "ui": {
    "views": {
      "main": { "type": "dashboard" }
    }
  }
}

// v2 - Expandida con layout y permissions
{
  "ui": {
    "version": "2.0",
    "views": {
      "main": {
        "type": "dashboard",
        "permissions": ["admin", "user"],
        "layout": {
          "type": "two-column",
          "config": { "leftWidth": "65%" }
        },
        "sections": [...]
      }
    }
  }
}
```

### Migración Step-by-Step

**Ver guía completa:** `/auto-ui/MIGRATION_GUIDE.md`

1. Actualizar `ui.version` a `"2.0"`
2. Actualizar import del engine
3. Migrar vistas simples a estructura de layouts
4. Añadir permisos a vistas y acciones
5. Migrar data bindings a @data/@compute
6. Añadir validación a formularios
7. Testing

---

## Ventajas de Auto-UI v2.0

### ✅ Productividad

- **Component System**: 21 componentes reutilizables
- **Data Resolver**: Binding dinámico sin código
- **Layouts Declarativos**: 10 layouts predefinidos
- **Widgets Pre-construidos**: 9 widgets listos para usar
- **Validación Built-in**: 15+ validators custom
- **Permisos Declarativos**: Control de acceso granular

### ✅ Mantenibilidad

- **Single Source of Truth**: module.json
- **Composable Systems**: 7 sistemas independientes
- **Component Registry**: Documentación completa
- **Examples**: 3 ejemplos completos
- **Migration Guide**: Guía de v1 → v2

### ✅ Performance

- **CSS Inline**: Sin requests externos
- **Component Cache**: LRU cache de 200 items
- **Lazy Loading**: Widgets y componentes bajo demanda
- **Virtual Scrolling**: Para selects y tablas grandes
- **Debounced Handlers**: Para búsqueda y scroll

### ✅ Experiencia de Usuario

- **Modern CSS**: 600+ líneas con animaciones
- **Client Scripts**: 15+ funcionalidades
- **Real-time**: SSE con MQTT bridge
- **Responsive**: Mobile-first design
- **Accessible**: ARIA attributes completos
- **Dark Theme**: Por defecto

### ✅ Extensibilidad

- **Custom Components**: Registrar propios componentes
- **Custom Validators**: Añadir validadores
- **Custom Resolvers**: Resolver permisos custom
- **Custom Widgets**: Crear widgets propios
- **Custom Layouts**: Registrar layouts nuevos

---

## Debugging Auto-UI v2.0

### Ver módulos cargados

```bash
curl http://localhost:3001/auto-ui/
```

### Ver stats del sistema

```javascript
const stats = autoUI.getStats();
console.log(stats);
// {
//   initialized: true,
//   version: '2.0.0',
//   loader: { modules: { total: 15, withUI: 4, v2: 2 } },
//   componentSystem: { total: 21, cached: 45 },
//   resolver: { resolvers: 5, cache: 120 },
//   layoutEngine: { layouts: 10 },
//   widgetFactory: { widgets: 9 },
//   validator: { validators: 23 },
//   permissionSystem: { resolvers: 8 },
//   bridge: { connections: 2 },
//   generator: { version: 2 }
// }
```

### Ver componentes registrados

```javascript
const components = autoUI.componentSystem.list();
console.log(components);
// ['button', 'card', 'input', 'select', ...]
```

### Ver tema activo

```bash
curl http://localhost:3001/auto-ui/theme
```

---

## Troubleshooting

### Problema: Módulo usa v1 en lugar de v2

**Causa:** `ui.version` no especificado

**Solución:**
```json
{ "ui": { "enabled": true, "version": "2.0" } }
```

---

### Problema: Componente no encontrado

**Causa:** Componente no registrado en ComponentSystem

**Verificar:**
```javascript
const has = autoUI.componentSystem.has('my-component');
console.log(has);  // false
```

**Solución:** Crear `/auto-ui/components/{category}/my-component.json`

---

### Problema: @data no se resuelve

**Causa:** Dato no existe en contexto

**Debug:**
```javascript
// En handler del módulo
context.data = { users: [...] };
// Ahora @data.users funciona
```

---

### Problema: Permisos bloquean acceso

**Causa:** Usuario no tiene roles requeridos

**Debug:**
```javascript
const canAccess = await autoUI.permissionSystem.check(
  ['admin', 'user'],
  { user: currentUser }
);
console.log(canAccess);  // false
```

---

## Próximos Pasos

### Roadmap v2.1

- [ ] Light theme
- [ ] More widgets (calendar, kanban)
- [ ] Chart integration (Chart.js)
- [ ] Rich text editor component
- [ ] Drag & drop layouts
- [ ] Multi-language support
- [ ] Export to CSV/PDF
- [ ] Component playground
- [ ] Visual theme editor
- [ ] Performance monitoring dashboard

---

## Referencias

### Documentación Interna

- **Arquitectura v2.0:** `/auto-ui/ARCHITECTURE.md`
- **Migration Guide:** `/auto-ui/MIGRATION_GUIDE.md`
- **Templates & Scripts:** `/auto-ui/TEMPLATES_SCRIPTS_GUIDE.md`
- **Component Registry:** `/auto-ui/components/COMPONENT_REGISTRY.md`
- **Examples:** `/auto-ui/examples/README.md`

### Código Fuente

- **Engine v2:** `/auto-ui/engine/index-v2.js`
- **7 Core Systems:** `/auto-ui/engine/{system}.js`
- **Generator v2:** `/auto-ui/engine/generator-v2.js`
- **Client Scripts:** `/auto-ui/client/core.js`
- **Components:** `/auto-ui/components/{category}/*.json`

### Referencias Externas

- **HTMX:** https://htmx.org
- **Server-Sent Events:** https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
- **CSS Variables:** https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties

---

**Última actualización:** 2025-11-25
**Versión Auto-UI:** 2.0.0
**Autor:** Event Core Team
