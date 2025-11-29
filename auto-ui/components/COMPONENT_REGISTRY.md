# Auto-UI v2.0 - Component Registry

## 📦 Component Library Overview

This registry documents all available components in the Auto-UI v2.0 system. Each component is defined as a JSON file with complete specifications including variants, props, features, and examples.

**Total Components: 29**

---

## 📁 Component Categories

### 🧩 Core Components (1)
Basic interactive elements

### 📊 Data Components (4)
Components for displaying and organizing data

### 📝 Form Components (6)
Input and form field components

### 🧭 Navigation Components (5)
Navigation and wayfinding components

### 🎨 Layout Components (2)
Layout and container components

### 💬 Feedback Components (7)
User feedback and loading states

### 🤖 AI Components (3)
AI integration and configuration components

### 📁 Input Components (1)
Advanced file input and upload components

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

### 16. Corner Info Button (`navigation/corner-info-button.json`)
**Description:** Botón cuadrado informativo con emojis en las 4 esquinas, marco de 4mm y colores variables

**Variants:**
- `primary` - Estilo principal (azul)
- `secondary` - Estilo secundario (gris)
- `success` - Éxito (verde)
- `warning` - Advertencia (amarillo)
- `danger` - Peligro (rojo)
- `info` - Informativo (cyan)
- `custom` - Colores personalizados

**Sizes:** `sm` (120x120px), `md` (160x160px), `lg` (200x200px), `xl` (240x240px)

**Key Features:**
- ✅ Texto central grande y legible
- ✅ 4 emojis personalizables en las esquinas
- ✅ Marco de 4mm de grosor configurable
- ✅ Colores de borde y fondo personalizables
- ✅ Efecto hover con escala y sombra
- ✅ Efecto ripple al hacer click
- ✅ Vibración háptica en dispositivos móviles
- ✅ Funciona como botón o enlace
- ✅ Responsive y optimizado para touch
- ✅ ARIA compliant

**Example:**
```json
{
  "component": "corner-info-button",
  "variant": "primary",
  "size": "md",
  "props": {
    "text": "Panel de Ventas",
    "cornerTopLeft": "📊",
    "cornerTopRight": "📈",
    "cornerBottomLeft": "💰",
    "cornerBottomRight": "🎯",
    "href": "/dashboard/sales",
    "hoverEffect": true,
    "rippleEffect": true,
    "hapticFeedback": true,
    "ariaLabel": "Acceder al panel de ventas"
  }
}
```

**Usage (JavaScript):**
```javascript
// Crear programáticamente
const button = AutoUI.components['corner-info-button'].create({
  text: 'Documentos',
  variant: 'success',
  size: 'lg',
  cornerTopLeft: '📄',
  cornerTopRight: '📋',
  cornerBottomLeft: '✅',
  cornerBottomRight: '📝',
  href: '/documents'
});

// Actualizar texto
button.setText('Mis Documentos');

// Actualizar esquina
button.setCorner('top-left', '🎉');

// Deshabilitar/habilitar
button.disable();
button.enable();
```

---

## 🎨 Layout Components

### 17. Card (`layout/card.json`)
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

### 18. FloatingActionBar (`layout/floating-action-bar.json`)
**Description:** Barra de acciones flotante multifunción - horizontal (bottom/top) o vertical (right/left) para navegación móvil intuitiva

**Positions:**
- **Horizontal:** `bottom`, `top`, `bottom-sticky`, `top-sticky`
- **Vertical:** `right`, `left`, `right-sticky`, `left-sticky`
- **Auto:** Auto-detecta mano dominante del usuario

**Orientations:**
- `horizontal` - Scroll horizontal de botones (bottom/top)
- `vertical` - Scroll vertical con grid adaptativo (right/left)

**Grid Modes (vertical):**
- `auto` - 2×1 para TouchActionButton, 1×1 para CornerInfoButton
- `single` - 1 botón por fila
- `double` - 2 botones por fila
- `triple` - 3 botones por fila

**Variants:**
- `default` - Con glassmorphism blur
- `solid` - Fondo sólido
- `minimal` - Sin fondo
- `elevated` - Sombra elevada

**Key Features:**
- ✅ Multifunción - Horizontal o Vertical
- ✅ Grid adaptativo según tipo de botón
- ✅ Integración automática con FloatingPanel
- ✅ Auto-detección mano dominante (diestro/zurdo)
- ✅ Click → Panel flotante → Mantiene contexto
- ✅ Swipe para ocultar/mostrar
- ✅ Auto-hide en scroll
- ✅ Safe-area support (notch, home indicator)
- ✅ Feedback háptico
- ✅ Collapsible
- ✅ Compatible con TouchActionButton y CornerInfoButton
- ✅ ARIA compliant

**Example (Horizontal):**
```json
{
  "component": "floating-action-bar",
  "variant": "default",
  "position": "bottom",
  "props": {
    "buttons": [
      {"component": "touch-action-button", "emoji": "🏠", "label": "Inicio"},
      {"component": "touch-action-button", "emoji": "📋", "label": "Tareas"},
      {"component": "touch-action-button", "emoji": "➕", "label": "Crear"}
    ],
    "spacing": "normal",
    "swipeable": true,
    "showHandle": true
  }
}
```

**Example (Vertical con Panels):**
```json
{
  "component": "floating-action-bar",
  "position": "right",
  "props": {
    "gridMode": "auto",
    "openPanelsOnClick": true,
    "buttons": [
      {
        "id": "home",
        "component": "touch-action-button",
        "emoji": "🏠",
        "label": "Inicio"
      },
      {
        "id": "sales",
        "component": "corner-info-button",
        "text": "Ventas",
        "variant": "primary",
        "size": "sm",
        "cornerTopLeft": "📊",
        "cornerTopRight": "📈",
        "cornerBottomLeft": "💰",
        "cornerBottomRight": "🎯"
      }
    ],
    "panels": {
      "home": {
        "title": "Panel de Inicio",
        "content": "<p>Contenido...</p>",
        "size": "medium"
      },
      "sales": {
        "title": "Panel de Ventas",
        "content": "<p>Dashboard...</p>",
        "size": "full"
      }
    },
    "width": "80px",
    "maxHeight": "80vh"
  }
}
```

**Usage (JavaScript):**
```javascript
// Crear barra vertical con panels
const actionBar = document.createElement('div');
actionBar.setAttribute('data-component', 'floating-action-bar');
actionBar.setAttribute('data-config', JSON.stringify({
  position: 'right',
  gridMode: 'auto',
  openPanelsOnClick: true,
  buttons: [...],
  panels: {...}
}));
document.body.appendChild(actionBar);

// Auto-inicialización
AutoUI.components['floating-action-bar'].initAll();

// Detectar mano dominante y guardar preferencia
localStorage.setItem('floating-action-bar-handedness', 'left'); // o 'right'
```

---

## 💬 Feedback Components

### 19. Toast (`feedback/toast.json`)
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

### 20. Alert (`feedback/alert.json`)
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

### 21. Progress (`feedback/progress.json`)
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

### 22. Skeleton (`feedback/skeleton.json`)
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

### 23. Spinner (`feedback/spinner.json`)
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

## 🤖 AI Components

### 24. ConversationPanel (`ai/conversation-panel.json`)
**Description:** Panel de conversación completo con soporte para chat AI, markdown, streaming, attachments y voice

**Variants:**
- `ai-chat` - Chat completo con IA y todas las features
- `notes` - Solo notas sin respuesta de IA
- `support` - Chat de soporte bidireccional
- `instructions` - Instrucciones paso a paso (read-only)

**Sizes:** `sm` (300px), `md` (500px), `lg` (700px), `fullscreen`

**Key Features:**
- ✅ Lista de mensajes con scroll automático
- ✅ Renderizado markdown (bold, italic, code blocks, lists, links)
- ✅ Streaming SSE de respuestas AI en tiempo real
- ✅ Typing indicator animado ('IA está escribiendo...')
- ✅ Avatares por rol (user 👤 / assistant 🤖 / system ⚙️)
- ✅ Timestamps relativos (hace 2 min, hace 1 hora)
- ✅ Adjuntar archivos inline (si habilitado)
- ✅ Input de voz con Web Speech API (si habilitado)
- ✅ Comandos especiales: /help, /clear, /export, /regenerate, /model
- ✅ Soporte MQTT para actualizaciones en tiempo real
- ✅ Auto-scroll inteligente (solo si ya estás al final)
- ✅ Copy to clipboard para mensajes
- ✅ Regenerate response para mensajes AI
- ✅ Editar mensajes de usuario
- ✅ Contador de caracteres en input
- ✅ Accesible con keyboard navigation
- ✅ Responsive y mobile-first

**Example:**
```json
{
  "component": "conversation-panel",
  "variant": "ai-chat",
  "size": "lg",
  "props": {
    "conversationId": "conv_menu_gen_123",
    "endpoint": "/modules/chat-api/conversations/conv_menu_gen_123/messages",
    "streamingEndpoint": "/modules/chat-api/conversations/conv_menu_gen_123/stream",
    "enableMarkdown": true,
    "enableAttachments": true,
    "placeholder": "Pregunta sobre el menú generado...",
    "aiProvider": "deepseek",
    "showTypingIndicator": true,
    "mqttEnabled": true
  }
}
```

**Use Cases:**
- Menu-generator: Conversar sobre menú mientras se genera
- AiChat-UI: Chat multi-proyecto con IA
- Comandero: Ayuda contextual para camareros
- Admin: Soporte técnico interno

---

### 25. AIControlBar (`ai/ai-control-bar.json`)
**Description:** Barra de controles para configurar parámetros de IA: provider, modelo, temperature, prompts, credenciales

**Variants:**
- `full` - Todos los controles visibles
- `compact` - Solo provider y modelo
- `minimal` - Solo botón de configuración

**Positions:** `bottom`, `top`, `right`, `left`, `floating`

**Key Features:**
- ✅ Selector visual de providers con iconos (🔥 DeepSeek, 🟢 OpenAI, 🟣 Claude, 🦙 Ollama)
- ✅ Selector de modelos específicos por provider
- ✅ Slider interactivo de temperature con preview de valor
- ✅ Input numérico de max_tokens con validación
- ✅ Integración con PromptSelector para prompts guardados
- ✅ Integración con CredentialIndicator para verificar API keys
- ✅ Botón de configuración avanzada que abre panel expandible
- ✅ Estados visuales para cada control (activo, hover, disabled)
- ✅ Colapsar/expandir con animación smooth
- ✅ Persistencia de configuración en localStorage
- ✅ Responsive y adaptable a mobile/tablet/desktop
- ✅ Orientaciones horizontal y vertical
- ✅ Position sticky para siempre visible
- ✅ Cambios en tiempo real sin recargar
- ✅ Accesible con keyboard navigation

**Example:**
```json
{
  "component": "ai-control-bar",
  "variant": "full",
  "position": "bottom",
  "props": {
    "providers": ["deepseek", "openai", "claude", "ollama"],
    "defaultProvider": "deepseek",
    "defaultTemperature": 0.7,
    "defaultMaxTokens": 1000,
    "showPrompts": true,
    "showCredentials": true,
    "collapsible": true,
    "sticky": true
  }
}
```

**Use Cases:**
- Menu-generator: Ajustar parámetros de generación de menús
- AiChat-UI: Control completo de configuración de chat
- Productos: Configurar generación de descripciones

---

### 26. PromptSelector (`ai/prompt-selector.json`)
**Description:** Selector de prompts guardados con búsqueda, categorías, versioning y CRUD completo

**Variants:**
- `panel` - Panel completo con todas las features
- `dropdown` - Dropdown compacto
- `modal` - Modal fullscreen

**Key Features:**
- ✅ Lista de prompts por categoría
- ✅ Búsqueda y filtrado
- ✅ Preview de prompt con variables
- ✅ Versionado de prompts (v1.0, v1.1, etc.)
- ✅ Crear/editar/eliminar prompts
- ✅ Reemplazo de variables {{var}}
- ✅ Scope: global/project/user
- ✅ Favoritos
- ✅ Historial de uso

**Example:**
```json
{
  "component": "prompt-selector",
  "variant": "panel",
  "props": {
    "endpoint": "/modules/prompt-manager/prompts",
    "scope": "all",
    "categories": ["menu", "product", "support", "general"],
    "showVersioning": true,
    "enableCreate": true,
    "searchEnabled": true
  }
}
```

**Use Cases:**
- AiChat-UI: Seleccionar prompts pre-configurados
- Menu-generator: Prompts específicos para parsing de menús
- Admin: Gestión de prompts del sistema

---

## 📁 Input Components

### 27. FileDropZone (`input/file-drop-zone.json`)
**Description:** Zona de carga de archivos genérica con drag & drop, camera capture, clipboard paste y preview

**Variants:**
- `image-only` - Solo imágenes con crop opcional
- `document` - Documentos (PDF, Word, Excel)
- `media` - Imágenes y videos
- `any` - Cualquier tipo de archivo

**Sizes:** `sm` (200px), `md` (300px), `lg` (400px), `fullscreen`

**Key Features:**
- ✅ Drag & drop de archivos con feedback visual
- ✅ Click para abrir selector de archivos nativo
- ✅ Captura desde cámara (mobile) con elección frontal/trasera
- ✅ Paste desde clipboard (Ctrl+V o Cmd+V)
- ✅ Preview de archivos con thumbnails
- ✅ Validación de tipo MIME y tamaño
- ✅ Progress bar durante upload
- ✅ Soporte múltiples archivos con conteo
- ✅ Compresión opcional de imágenes
- ✅ Crop opcional de imágenes (variant image-only)
- ✅ Estados visuales: idle, dragging, uploading, success, error
- ✅ Accesible con keyboard navigation
- ✅ Responsive y mobile-first
- ✅ Integración con cualquier endpoint backend

**Example:**
```json
{
  "component": "file-drop-zone",
  "variant": "image-only",
  "size": "md",
  "props": {
    "maxFiles": 5,
    "maxFileSize": 5242880,
    "captureMode": "environment",
    "showPreview": true,
    "enableCrop": true,
    "compressionEnabled": true,
    "endpoint": "/modules/menu-generator/upload",
    "dropMessage": "Sube fotos de la carta de menú",
    "icon": "📸"
  }
}
```

**Use Cases:**
- Menu-generator: Subir fotos de cartas de menú
- Productos: Subir imágenes de productos
- Chat: Adjuntar archivos en conversaciones
- Admin: Subir documentos, logos, facturas

---

## 💬 Feedback Components (Updated)

### 28. ResultPreviewCard (`feedback/result-preview-card.json`)
**Description:** Card de preview de resultados con estados, acciones y renderizado adaptativo (JSON, tabla, cards, lista)

**Variants:**
- `menu-preview` - Preview de menú generado por IA
- `product-preview` - Preview de producto
- `order-summary` - Resumen de pedido
- `payment-summary` - Resumen de cobro
- `generic` - Preview genérico

**States:** `pending` (⏳), `processing` (⚙️), `completed` (✅), `error` (❌)

**Key Features:**
- ✅ Renderizado adaptativo según tipo de datos
- ✅ Estados visuales con iconos y colores
- ✅ Animación de spinner en estado 'processing'
- ✅ Expand/collapse de detalles
- ✅ Acciones contextuales configurables
- ✅ Highlights de cambios/diferencias
- ✅ Vista JSON con syntax highlighting
- ✅ Vista tabla con columnas configurables
- ✅ Vista cards con layout flexible
- ✅ Vista lista con items expandibles
- ✅ Scroll interno con max-height
- ✅ Responsive y mobile-optimized

**Example:**
```json
{
  "component": "result-preview-card",
  "variant": "menu-preview",
  "props": {
    "status": "completed",
    "dataFormat": "cards",
    "endpoint": "/modules/menu-generator/menus/123",
    "title": "Menú Generado",
    "actions": [
      {"label": "Validar", "icon": "✅", "action": "validate"},
      {"label": "Editar", "icon": "✏️", "action": "edit"}
    ],
    "expandable": true
  }
}
```

---

### 29. CredentialIndicator (`feedback/credential-indicator.json`)
**Description:** Indicador visual de estado de credenciales con niveles (GLOBAL/PROJECT/CLIENT/CUSTOM) y quick actions

**Variants:**
- `badge` - Badge compacto con icono y estado
- `detailed` - Vista detallada con nivel y botones
- `inline` - Inline para formularios

**States:** `ok` (🔑 verde), `warning` (⚠️ amarillo), `error` (❌ rojo), `loading` (⏳ azul)

**Levels:**
- `CUSTOM` (prioridad 1) - Credencial específica para esta sesión
- `CLIENT` (prioridad 2) - Credencial del cliente actual
- `PROJECT` (prioridad 3) - Credencial del proyecto
- `GLOBAL` (prioridad 4) - Credencial global del sistema

**Key Features:**
- ✅ Indicador visual de estado (verde/amarillo/rojo)
- ✅ Muestra nivel de credencial (CUSTOM/CLIENT/PROJECT/GLOBAL)
- ✅ Tooltip con información detallada
- ✅ Click para gestionar credenciales
- ✅ Quick add si falta credencial
- ✅ Auto-verificación periódica
- ✅ Valores enmascarados (***)
- ✅ Integración con credential-manager

**Example:**
```json
{
  "component": "credential-indicator",
  "variant": "detailed",
  "props": {
    "provider": "deepseek",
    "showLevel": true,
    "showStatus": true,
    "enableQuickAdd": true,
    "checkOnInit": true
  }
}
```

**Use Cases:**
- AI-control-bar: Verificar credenciales antes de usar provider
- Menu-generator: Verificar API keys antes de generar
- Admin-panel: Gestión de credenciales

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

**Version:** 2.1.0
**Last Updated:** 2025-11-29
**Total Components:** 29
**Author:** Event Core Team

**Latest Additions (v2.1.0):**
- 🤖 AI Components: ConversationPanel, AIControlBar, PromptSelector
- 📁 Input Components: FileDropZone
- 💬 Feedback Components: ResultPreviewCard, CredentialIndicator
