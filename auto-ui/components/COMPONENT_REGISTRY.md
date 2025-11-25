# Auto-UI v2.0 - Component Registry

## 📦 Component Library Overview

This registry documents all available components in the Auto-UI v2.0 system. Each component is defined as a JSON file with complete specifications including variants, props, features, and examples.

**Total Components: 21**

---

## 📁 Component Categories

### 🧩 Core Components (1)
Basic interactive elements

### 📊 Data Components (4)
Components for displaying and organizing data

### 📝 Form Components (6)
Input and form field components

### 🧭 Navigation Components (4)
Navigation and wayfinding components

### 🎨 Layout Components (1)
Layout and container components

### 💬 Feedback Components (5)
User feedback and loading states

---

## 🧩 Core Components

### 1. Button (`core/button.json`)
**Description:** Botón interactivo con múltiples variantes y tamaños

**Variants:**
- `primary` - Botón principal
- `secondary` - Botón secundario
- `success` - Botón de éxito
- `warning` - Botón de advertencia
- `danger` - Botón de peligro
- `ghost` - Botón transparente
- `outline` - Botón con borde

**Sizes:** `sm`, `md`, `lg`

**Special Features:**
- Hold interaction (mantener presionado)
- Loading state
- Icon support
- Disabled state

**Example:**
```json
{
  "component": "button",
  "variant": "primary",
  "size": "md",
  "props": {
    "label": "Guardar",
    "icon": "💾",
    "disabled": false
  }
}
```

---

## 📊 Data Components

### 2. Table (`data/table.json`)
**Description:** Tabla de datos con soporte para ordenamiento, filtrado y paginación

**Variants:**
- `default` - Tabla básica
- `striped` - Filas alternadas
- `bordered` - Con bordes
- `hover` - Efecto hover
- `compact` - Versión compacta

**Key Features:**
- ✅ Sorting (client/server)
- ✅ Filtering (client/server)
- ✅ Pagination (client/server)
- ✅ Row selection (single/multi)
- ✅ Row actions
- ✅ Column resizing
- ✅ Keyboard navigation

**Example:**
```json
{
  "widget": "table",
  "variant": "striped",
  "props": {
    "columns": [
      {"key": "id", "label": "ID", "sortable": true},
      {"key": "name", "label": "Nombre", "sortable": true}
    ],
    "data": "@data.items",
    "sortable": true,
    "paginated": true
  }
}
```

---

### 3. Grid (`data/grid.json`)
**Description:** Grid de items con diseño de tarjetas responsive

**Variants:**
- `cards` - Grid de tarjetas
- `masonry` - Estilo masonry
- `compact` - Grid compacto

**Key Features:**
- ✅ Responsive columns
- ✅ Lazy loading
- ✅ Infinite scroll
- ✅ Filtering
- ✅ Sorting
- ✅ Custom item rendering

**Example:**
```json
{
  "widget": "grid",
  "variant": "cards",
  "props": {
    "items": "@data.products",
    "columns": {"xs": 1, "sm": 2, "md": 3, "lg": 4},
    "gap": "md",
    "minItemWidth": "280px"
  }
}
```

---

### 4. List (`data/list.json`)
**Description:** Lista de items con soporte para avatares, badges y acciones

**Variants:**
- `default` - Lista simple
- `divided` - Con divisores
- `bordered` - Con borde
- `interactive` - Con hover y click

**Key Features:**
- ✅ Avatar support
- ✅ Icon support
- ✅ Badge support
- ✅ Actions per item
- ✅ Selectable items
- ✅ Dense mode

**Example:**
```json
{
  "widget": "list",
  "variant": "interactive",
  "props": {
    "items": "@data.users",
    "showAvatar": true,
    "showBadge": true,
    "showActions": true
  }
}
```

---

### 5. Tree (`data/tree.json`)
**Description:** Vista de árbol jerárquica con nodos expandibles

**Variants:**
- `default` - Árbol estándar
- `compact` - Árbol compacto
- `bordered` - Con bordes

**Key Features:**
- ✅ Hierarchical data
- ✅ Expand/collapse
- ✅ Lazy loading
- ✅ Search with highlighting
- ✅ Drag & drop
- ✅ Checkboxes
- ✅ Multi-select

**Example:**
```json
{
  "widget": "tree",
  "props": {
    "data": "@data.folders",
    "showIcons": true,
    "selectable": true,
    "checkboxes": false
  }
}
```

---

## 📝 Form Components

### 6. Input (`form/input.json`)
**Description:** Campo de entrada de texto con validación y estados

**Variants:**
- `text`, `email`, `password`, `number`, `tel`, `url`, `search`, `date`, `time`, `datetime-local`

**Sizes:** `sm`, `md`, `lg`

**Key Features:**
- ✅ Built-in validation
- ✅ Prefix/suffix icons
- ✅ Help text
- ✅ Error states
- ✅ Auto-complete
- ✅ Pattern matching

**Example:**
```json
{
  "component": "input",
  "variant": "email",
  "props": {
    "label": "Correo electrónico",
    "name": "email",
    "required": true,
    "prefixIcon": "📧"
  }
}
```

---

### 7. Select (`form/select.json`)
**Description:** Selector desplegable con búsqueda y selección múltiple

**Variants:**
- `default` - Select nativo
- `custom` - Select customizado
- `searchable` - Con búsqueda

**Sizes:** `sm`, `md`, `lg`

**Key Features:**
- ✅ Single/multi select
- ✅ Searchable
- ✅ Clearable
- ✅ Grouped options
- ✅ Remote search
- ✅ Virtual scrolling
- ✅ Tags creation

**Example:**
```json
{
  "component": "select",
  "variant": "searchable",
  "props": {
    "label": "País",
    "options": [
      {"value": "mx", "label": "México", "icon": "🇲🇽"}
    ],
    "searchable": true,
    "clearable": true
  }
}
```

---

### 8. Checkbox (`form/checkbox.json`)
**Description:** Checkbox para selección múltiple

**Variants:**
- `default` - Checkbox estándar
- `switch` - Estilo switch
- `button` - Estilo botón

**Sizes:** `sm`, `md`, `lg`

**Key Features:**
- ✅ Indeterminate state
- ✅ Checkbox groups
- ✅ Select all
- ✅ Inline/stacked layout

**Example:**
```json
{
  "component": "checkbox",
  "props": {
    "label": "Acepto los términos",
    "name": "terms",
    "required": true
  }
}
```

---

### 9. Radio (`form/radio.json`)
**Description:** Radio button para selección única

**Variants:**
- `default` - Radio estándar
- `button` - Estilo botón
- `card` - Estilo tarjeta

**Sizes:** `sm`, `md`, `lg`

**Key Features:**
- ✅ Radio groups
- ✅ Inline/stacked layout
- ✅ Icons and descriptions
- ✅ Card-style options

**Example:**
```json
{
  "component": "radio-group",
  "variant": "button",
  "props": {
    "label": "Método de pago",
    "options": [
      {"value": "card", "label": "Tarjeta", "icon": "💳"}
    ]
  }
}
```

---

### 10. Textarea (`form/textarea.json`)
**Description:** Área de texto multilinea con contador de caracteres

**Variants:**
- `default` - Textarea estándar
- `code` - Para código (monospace)
- `autosize` - Altura automática

**Sizes:** `sm` (2 rows), `md` (4 rows), `lg` (8 rows)

**Key Features:**
- ✅ Auto-resize
- ✅ Character counter
- ✅ Min/max length
- ✅ Markdown support
- ✅ Resizable

**Example:**
```json
{
  "component": "textarea",
  "variant": "autosize",
  "props": {
    "label": "Comentarios",
    "maxLength": 500,
    "showCounter": true,
    "minRows": 3,
    "maxRows": 10
  }
}
```

---

### 11. File Upload (`form/file-upload.json`)
**Description:** Componente para subida de archivos con drag & drop

**Variants:**
- `default` - Upload estándar
- `dropzone` - Zona de arrastre destacada
- `avatar` - Upload circular
- `button` - Solo botón

**Key Features:**
- ✅ Drag & drop
- ✅ Multiple files
- ✅ File validation (type, size, dimensions)
- ✅ Preview thumbnails
- ✅ Upload progress
- ✅ Auto-upload
- ✅ Image dimension validation

**Example:**
```json
{
  "component": "file-upload",
  "variant": "dropzone",
  "props": {
    "accept": ".pdf,.doc,.docx",
    "multiple": true,
    "maxFiles": 5,
    "maxSize": 10485760
  }
}
```

---

## 🧭 Navigation Components

### 12. Navbar (`navigation/navbar.json`)
**Description:** Barra de navegación responsive con menús y acciones

**Variants:**
- `default` - Navbar estándar
- `fixed` - Fija en top
- `transparent` - Transparente
- `minimal` - Minimalista

**Positions:** `top`, `bottom`, `static`

**Key Features:**
- ✅ Responsive (hamburger menu)
- ✅ Dropdowns
- ✅ Search integration
- ✅ Sticky behavior
- ✅ Hide/shrink on scroll
- ✅ Avatar menu

**Example:**
```json
{
  "component": "navbar",
  "variant": "fixed",
  "props": {
    "brand": {"logo": "🚀", "text": "Auto-UI"},
    "items": [
      {"label": "Dashboard", "url": "/dashboard", "active": true}
    ],
    "actions": [
      {"type": "search"},
      {"type": "avatar"}
    ]
  }
}
```

---

### 13. Breadcrumb (`navigation/breadcrumb.json`)
**Description:** Migas de pan para navegación jerárquica

**Variants:**
- `default` - Separador chevron
- `slash` - Separador /
- `chevron` - Separador ›
- `dot` - Separador ·

**Key Features:**
- ✅ Custom separators
- ✅ Home icon
- ✅ Collapsible (max items)
- ✅ Responsive
- ✅ Truncation

**Example:**
```json
{
  "component": "breadcrumb",
  "variant": "chevron",
  "props": {
    "items": [
      {"label": "Inicio", "url": "/"},
      {"label": "Proyectos", "url": "/projects"},
      {"label": "Mi Proyecto", "active": true}
    ]
  }
}
```

---

### 14. Pagination (`navigation/pagination.json`)
**Description:** Paginación para navegar entre páginas de datos

**Variants:**
- `default` - Paginación completa
- `simple` - Solo prev/next
- `compact` - Versión compacta
- `rounded` - Botones redondeados

**Sizes:** `sm`, `md`, `lg`

**Key Features:**
- ✅ First/last buttons
- ✅ Prev/next buttons
- ✅ Page numbers with ellipsis
- ✅ Page info display
- ✅ Page size selector
- ✅ Keyboard navigation
- ✅ URL sync

**Example:**
```json
{
  "component": "pagination",
  "props": {
    "currentPage": 5,
    "totalPages": 20,
    "showInfo": true,
    "showPageSize": true
  }
}
```

---

### 15. Tabs (`navigation/tabs.json`)
**Description:** Pestañas para organizar contenido en secciones

**Variants:**
- `default` - Tabs con línea inferior
- `pills` - Estilo píldoras
- `boxed` - Con fondo
- `lifted` - Elevadas
- `minimal` - Minimalistas

**Sizes:** `sm`, `md`, `lg`

**Key Features:**
- ✅ Horizontal/vertical
- ✅ Lazy loading
- ✅ Keep alive
- ✅ Icons and badges
- ✅ Closable tabs
- ✅ Addable tabs
- ✅ Draggable tabs
- ✅ URL sync
- ✅ Scrollable

**Example:**
```json
{
  "component": "tabs",
  "variant": "pills",
  "props": {
    "tabs": [
      {"id": "overview", "label": "Resumen", "icon": "📊"},
      {"id": "details", "label": "Detalles", "badge": {"text": "3"}}
    ],
    "defaultTab": "overview"
  }
}
```

---

## 🎨 Layout Components

### 16. Card (`layout/card.json`)
**Description:** Tarjeta para agrupar contenido relacionado

**Variants:**
- `default` - Tarjeta estándar
- `elevated` - Con sombra elevada
- `outlined` - Solo borde
- `interactive` - Con hover

**Key Features:**
- ✅ Header/body/footer sections
- ✅ Hover effects
- ✅ Clickable
- ✅ Loading state

**Example:**
```json
{
  "component": "card",
  "variant": "elevated",
  "props": {
    "header": "Título de la tarjeta",
    "body": "Contenido...",
    "footer": "Acciones"
  }
}
```

---

## 💬 Feedback Components

### 17. Toast (`feedback/toast.json`)
**Description:** Notificaciones temporales no intrusivas

**Variants:**
- `info` - Información
- `success` - Éxito
- `warning` - Advertencia
- `danger` - Error

**Key Features:**
- ✅ Auto-dismiss
- ✅ Manual close
- ✅ Icons automáticos
- ✅ Multiple toasts
- ✅ Position control

**Usage (JavaScript):**
```javascript
AutoUI.showToast('Guardado correctamente', 'success');
```

---

### 18. Alert (`feedback/alert.json`)
**Description:** Alertas para mostrar mensajes importantes

**Variants:**
- `info` - Informativa (ℹ️)
- `success` - Éxito (✓)
- `warning` - Advertencia (⚠️)
- `danger` - Error (✗)

**Styles:** `solid`, `outlined`, `subtle`

**Sizes:** `sm`, `md`, `lg`

**Key Features:**
- ✅ Title and message
- ✅ Icons
- ✅ Closable
- ✅ Actions/buttons
- ✅ Banner mode
- ✅ Auto-close

**Example:**
```json
{
  "component": "alert",
  "variant": "warning",
  "style": "solid",
  "props": {
    "title": "Atención",
    "message": "Tu suscripción expira pronto",
    "closable": true,
    "actions": [
      {"label": "Renovar", "action": "renew"}
    ]
  }
}
```

---

### 19. Progress (`feedback/progress.json`)
**Description:** Barra de progreso para mostrar el avance de operaciones

**Variants:**
- `bar` - Barra horizontal
- `circle` - Progreso circular
- `ring` - Anillo
- `line` - Línea delgada

**Sizes:** `xs`, `sm`, `md`, `lg`, `xl`

**Colors:** `primary`, `success`, `warning`, `danger`, `info`

**Key Features:**
- ✅ Determinate/indeterminate
- ✅ Value display
- ✅ Label support
- ✅ Striped/animated
- ✅ Buffer mode
- ✅ Multi-segment
- ✅ Gradient colors

**Example:**
```json
{
  "component": "progress",
  "variant": "bar",
  "props": {
    "value": 65,
    "label": "Subiendo archivo...",
    "showValue": true,
    "animated": true
  }
}
```

---

### 20. Skeleton (`feedback/skeleton.json`)
**Description:** Skeleton loaders para estados de carga

**Variants:**
- `text` - Línea de texto
- `title` - Título
- `paragraph` - Párrafo
- `avatar` - Avatar circular
- `image` - Imagen
- `button` - Botón
- `card` - Tarjeta completa

**Sizes:** `xs`, `sm`, `md`, `lg`, `xl`

**Animations:** `wave`, `pulse`, `shimmer`, `none`

**Key Features:**
- ✅ Custom dimensions
- ✅ Multiple lines
- ✅ Aspect ratio
- ✅ Animation control
- ✅ Presets (post, userCard, table, form)

**Example:**
```json
{
  "component": "skeleton",
  "variant": "card",
  "props": {
    "structure": [
      {"type": "image", "height": "200px"},
      {"type": "title"},
      {"type": "paragraph", "lines": 3}
    ]
  }
}
```

---

### 21. Spinner (`feedback/spinner.json`)
**Description:** Indicadores de carga animados

**Variants:**
- `circle` - Circular
- `dots` - Tres puntos
- `bars` - Barras verticales
- `ring` - Anillo
- `dualRing` - Anillo doble
- `bounce` - Con bounce
- `pulse` - Pulsante
- `ellipsis` - Puntos suspensivos

**Sizes:** `xs` (16px), `sm` (24px), `md` (32px), `lg` (48px), `xl` (64px)

**Colors:** `primary`, `success`, `warning`, `danger`, `info`, `white`, `muted`

**Key Features:**
- ✅ Label support
- ✅ Speed control (slow/normal/fast)
- ✅ Overlay mode
- ✅ Fullscreen mode
- ✅ Inline mode
- ✅ Backdrop
- ✅ Delay (avoid flash)
- ✅ Timeout

**Example:**
```json
{
  "component": "spinner",
  "variant": "ring",
  "size": "lg",
  "props": {
    "label": "Cargando...",
    "overlay": true,
    "backdrop": true
  }
}
```

---

## 🔧 Usage Guidelines

### Loading Components

Components are automatically loaded by the ComponentSystem from the `/auto-ui/components/` directory:

```javascript
// Auto-loaded on initialization
const componentSystem = new ComponentSystem({
  componentsPath: path.join(__dirname, '..', 'components'),
  cacheSize: 200,
  logger: logger
});
```

### Using Components in Views

```javascript
// In your module.json
{
  "views": {
    "main": {
      "type": "dashboard",
      "sections": [
        {
          "widget": "table",
          "variant": "striped",
          "config": {
            "columns": [...],
            "data": "@data.items"
          }
        }
      ]
    }
  }
}
```

### Rendering Components Programmatically

```javascript
// Using ComponentSystem
const html = componentSystem.render('button', {
  variant: 'primary',
  label: 'Click me',
  icon: '🚀'
}, context);
```

---

## 📚 Additional Resources

- **Architecture Guide:** `/auto-ui/ARCHITECTURE.md`
- **Templates & Scripts Guide:** `/auto-ui/TEMPLATES_SCRIPTS_GUIDE.md`
- **Migration Guide:** `/auto-ui/MIGRATION_GUIDE.md`
- **Examples:** `/auto-ui/examples/`

---

## 🎯 Component Development

### Creating a New Component

1. **Create JSON definition** in appropriate category folder:
   ```
   /auto-ui/components/{category}/{component-name}.json
   ```

2. **Define structure** following the standard schema:
   - `name`, `category`, `description`, `version`
   - `variants`, `sizes`, `props`
   - `features`, `accessibility`, `example`

3. **Register with ComponentSystem** (auto-loaded on startup)

4. **Create renderer** in ComponentSystem or Generator (if needed)

5. **Add to this registry**

### Component Schema Template

```json
{
  "name": "my-component",
  "category": "category-name",
  "description": "Component description",
  "version": "2.0.0",

  "variants": {
    "default": {
      "description": "Default variant",
      "className": "my-component"
    }
  },

  "props": {
    "propName": {
      "type": "string",
      "required": true,
      "description": "Prop description"
    }
  },

  "accessibility": {
    "role": "...",
    "ariaLabel": true
  },

  "example": {
    "component": "my-component",
    "props": {...}
  }
}
```

---

**Version:** 2.0.0
**Last Updated:** 2025-11-25
**Total Components:** 21
**Author:** Event Core Team
