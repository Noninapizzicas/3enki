# Event Core - Guía de Desarrollo UI

## Introducción

El sistema UI de Event Core permite que todos los módulos tengan interfaces gráficas consistentes sin necesidad de escribir HTML, CSS o JavaScript manualmente. Los módulos definen sus UIs en JSON dentro del archivo `module.json` y el sistema las renderiza automáticamente.

## Características Principales

- **JSON-Driven**: Define interfaces en JSON declarativo
- **Zero Dependencies**: Vanilla JavaScript, sin frameworks
- **Design System**: Estilos consistentes con CSS variables
- **Auto-CRUD**: Genera interfaces automáticamente desde REST APIs
- **5 Tipos de Vistas**: Table, Form, Detail, Dashboard, Custom
- **Componentes Reutilizables**: Button, Input, Table, Form, Card, Badge, etc.

## Estructura del Sistema

```
ui/
├── admin/          # Admin Panel (SPA)
│   ├── index.html  # Layout principal
│   ├── app.js      # Router y API client
│   └── app.css     # Estilos de layout
├── renderer/       # UI Renderer (JSON → HTML)
│   ├── index.js    # Orchestrator principal
│   ├── parser.js   # Parse JSON definitions
│   ├── validator.js # Validate definitions
│   ├── viewTypes/  # Renderers por tipo
│   │   ├── TableView.js
│   │   ├── FormView.js
│   │   ├── DetailView.js
│   │   ├── DashboardView.js
│   │   └── CustomView.js
│   └── fieldTypes/ # (futuro) Renderers de campos
├── components/     # (futuro) Componentes reutilizables
└── styles/         # Design System
    ├── variables.css   # Variables CSS
    └── components.css  # Estilos de componentes
```

## Cómo Agregar UI a un Módulo

### 1. Habilitar UI en `module.json`

```json
{
  "name": "mi-modulo",
  "version": "1.0.0",
  "apis": [
    // ... tus APIs
  ],
  "ui": {
    "enabled": true,
    "title": "Mi Módulo",
    "description": "Descripción del módulo",
    "icon": "📦",
    "views": [
      // ... tus vistas
    ]
  }
}
```

### 2. Definir Vistas

Cada vista tiene un tipo y configuración específica:

#### Vista Tipo: Table

Ideal para listar registros con paginación, filtros y acciones.

```json
{
  "id": "list",
  "type": "table",
  "title": "Lista de Items",
  "api": {
    "method": "GET",
    "url": "/modules/mi-modulo/items"
  },
  "columns": [
    {
      "field": "id",
      "label": "ID",
      "type": "text",
      "width": "80px",
      "sortable": true
    },
    {
      "field": "name",
      "label": "Nombre",
      "type": "text",
      "sortable": true
    },
    {
      "field": "status",
      "label": "Estado",
      "type": "badge",
      "sortable": true
    }
  ],
  "actions": [
    {
      "id": "create",
      "label": "Nuevo",
      "variant": "primary",
      "context": "global"
    },
    {
      "id": "edit",
      "label": "Editar",
      "variant": "secondary",
      "context": "row"
    }
  ],
  "filters": [
    {
      "field": "status",
      "label": "Estado",
      "type": "select",
      "options": [
        { "value": "active", "label": "Activo" },
        { "value": "inactive", "label": "Inactivo" }
      ]
    }
  ]
}
```

**Tipos de Columna Disponibles:**
- `text`: Texto simple
- `badge`: Badge con color según valor
- `boolean`: ✓/✗
- `date`: Formato de fecha
- `datetime`: Formato fecha y hora
- `currency`: Formato de moneda
- `number`: Formato numérico
- `link`: Enlace clickeable

#### Vista Tipo: Form

Para crear y editar registros.

```json
{
  "id": "create",
  "type": "form",
  "title": "Nuevo Item",
  "api": {
    "method": "POST",
    "url": "/modules/mi-modulo/items"
  },
  "fields": [
    {
      "name": "name",
      "label": "Nombre",
      "type": "text",
      "required": true,
      "placeholder": "Ingresa el nombre"
    },
    {
      "name": "description",
      "label": "Descripción",
      "type": "textarea",
      "rows": 4
    },
    {
      "name": "status",
      "label": "Estado",
      "type": "select",
      "required": true,
      "options": [
        { "value": "active", "label": "Activo" },
        { "value": "inactive", "label": "Inactivo" }
      ]
    }
  ],
  "actions": [
    {
      "id": "submit",
      "label": "Guardar",
      "type": "submit",
      "variant": "primary"
    }
  ]
}
```

**Tipos de Campo Disponibles:**
- `text`, `email`, `password`, `url`, `tel`
- `number`: Con opciones `min`, `max`, `step`
- `date`, `time`, `datetime-local`
- `textarea`: Con opción `rows`
- `select`: Requiere `options`
- `radio`: Requiere `options`
- `checkbox`: Puede ser individual o múltiple con `options`
- `file`: Con opción `accept`
- `hidden`

#### Vista Tipo: Detail

Para mostrar detalles de un registro.

```json
{
  "id": "detail",
  "type": "detail",
  "title": "Detalle de Item",
  "api": {
    "method": "GET",
    "url": "/modules/mi-modulo/items/:id"
  },
  "layout": "vertical",
  "fields": [
    {
      "name": "id",
      "label": "ID",
      "type": "text"
    },
    {
      "name": "name",
      "label": "Nombre",
      "type": "text"
    },
    {
      "name": "createdAt",
      "label": "Creado",
      "type": "datetime"
    }
  ],
  "actions": [
    {
      "id": "edit",
      "label": "Editar",
      "variant": "primary"
    },
    {
      "id": "delete",
      "label": "Eliminar",
      "variant": "danger",
      "confirm": true
    }
  ]
}
```

**Layouts Disponibles:**
- `vertical`: Una columna
- `horizontal`: Dos columnas

#### Vista Tipo: Dashboard

Para mostrar estadísticas y resúmenes.

```json
{
  "id": "dashboard",
  "type": "dashboard",
  "title": "Dashboard",
  "widgets": [
    {
      "id": "total",
      "type": "stat",
      "title": "Total de Items",
      "api": {
        "method": "GET",
        "url": "/modules/mi-modulo/stats/total"
      }
    },
    {
      "id": "recent",
      "type": "list",
      "title": "Recientes",
      "api": {
        "method": "GET",
        "url": "/modules/mi-modulo/items?limit=5"
      }
    }
  ]
}
```

**Tipos de Widget Disponibles:**
- `stat`: Estadística simple (número)
- `chart`: Gráfico (implementación futura)
- `table`: Tabla pequeña
- `list`: Lista de items
- `custom`: Widget personalizado

#### Vista Tipo: Custom

Para vistas totalmente personalizadas.

```json
{
  "id": "custom",
  "type": "custom",
  "title": "Vista Personalizada",
  "html": "<div class='custom-view'>Mi contenido HTML</div>",
  "script": "console.log('Mi código JS');"
}
```

## Design System

El sistema usa CSS Variables para mantener consistencia:

### Colores

```css
--primary-500: #2196F3
--success-500: #4CAF50
--warning-500: #FF9800
--danger-500: #F44336
--info-500: #00BCD4
```

### Spacing

```css
--spacing-1: 4px
--spacing-2: 8px
--spacing-3: 12px
--spacing-4: 16px
```

### Componentes CSS Disponibles

- `.btn`, `.btn-primary`, `.btn-success`, `.btn-danger`
- `.input`, `.select`, `.textarea`
- `.table`, `.table-container`
- `.card`, `.card-header`, `.card-body`
- `.badge`, `.badge-primary`, `.badge-success`
- `.alert`, `.alert-success`, `.alert-danger`

## Ejemplos Completos

Ver el módulo TODO en `modules/todo-list/module.json` para un ejemplo completo con todas las vistas.

## API del Módulo

Para que la UI funcione, tu módulo debe exponer APIs REST:

```javascript
class MiModulo {
  async onLoad(core) {
    this.core = core;
    // Inicialización
  }

  // GET /items
  async handleListItems({ query }) {
    return {
      items: [...],
      total: 100
    };
  }

  // GET /items/:id
  async handleGetItem({ params }) {
    return { id: params.id, name: "Item" };
  }

  // POST /items
  async handleCreateItem({ body }) {
    return {
      success: true,
      item: { ...body }
    };
  }

  // PUT /items/:id
  async handleUpdateItem({ params, body }) {
    return {
      success: true,
      item: { id: params.id, ...body }
    };
  }

  // DELETE /items/:id
  async handleDeleteItem({ params }) {
    return {
      success: true
    };
  }
}
```

## Endpoints de la UI

- `GET /ui` - Admin Panel
- `GET /ui/modules` - Lista módulos con UI
- `GET /ui/modules/:name` - Definición UI de un módulo
- `GET /ui/styles/*` - Archivos CSS
- `GET /ui/admin/*` - Archivos del Admin Panel

## Testing

1. Inicia Event Core:
```bash
node index.js --port 3000
```

2. Abre el navegador:
```
http://localhost:3000/ui
```

3. Verifica que tu módulo aparece en el sidebar

4. Navega por las vistas definidas

## Troubleshooting

### Mi módulo no aparece en la UI

- Verifica que `ui.enabled: true` en `module.json`
- Verifica que el módulo se cargó correctamente (revisa los logs)
- Verifica que las APIs están definidas en `module.json`

### Las vistas no se renderizan

- Verifica la definición JSON con el validator
- Revisa la consola del navegador para errores JS
- Verifica que las APIs devuelven el formato correcto

### Los estilos no se aplican

- Verifica que estás usando las clases CSS correctas
- Revisa que las variables CSS están definidas
- Usa el inspector del navegador para debuggear

## Próximos Pasos

1. Implementar Field Types personalizados
2. Agregar soporte para gráficos (Chart.js o similar)
3. Implementar permisos y roles
4. Agregar paginación server-side
5. Agregar búsqueda y filtros avanzados
6. Implementar WebSockets para actualizaciones en tiempo real

## Recursos

- [Design System](./UI_SYSTEM_DESIGN.md)
- [Prompt de Implementación](../prompts/ui-system-implementation.md)
- [Módulo TODO Ejemplo](../modules/todo-list/)
- [API System Docs](./API_SYSTEM.md)
