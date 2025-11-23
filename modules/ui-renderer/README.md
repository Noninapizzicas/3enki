# Módulo UI Renderer

**Renderizador de componentes UI basado en JSON con design system tokens**

## 🎨 Design System Tokens

```javascript
{
  "tokens": {
    "color": {
      "verde_accion": "#2FBF71",    // Success/Action
      "ambar_pendiente": "#F5B700", // Warning/Pending
      "rojo_error": "#E63946",      // Error
      "azul_info": "#1D4ED8",       // Info
      "gris_base": "#6B7280",       // Base gray
      "gris_fondo": "#0F1216"       // Background
    },
    "espaciado": {
      "xs": 4,
      "sm": 8,
      "md": 12,
      "lg": 16
    }
  }
}
```

---

## 🧩 Componentes Soportados

| Tipo | Descripción | Props |
|------|-------------|-------|
| **button** | Botón con estados | `state`, `text`, `icon` |
| **card** | Tarjeta con header/body/footer | `title`, `content`, `footer` |
| **table** | Tabla de datos | `columns`, `rows` |
| **form** | Formulario con campos | `fields` |

---

## 📁 Estructura de Componentes

Los componentes se definen en `ui-components/`:

```
ui-components/
├── action-button.component.json
├── info-card.component.json
└── user-form.component.json
```

### Ejemplo: Button Component

```json
{
  "component": "button",
  "name": "ActionButton",
  "description": "Primary action button",
  "states": {
    "default": {
      "color": "#2FBF71",
      "text": "Action",
      "icon": "▶"
    },
    "loading": {
      "color": "#F5B700",
      "text": "Loading...",
      "icon": "⏳"
    },
    "error": {
      "color": "#E63946",
      "text": "Error",
      "icon": "❌"
    }
  }
}
```

---

## 📦 Eventos Publicados

### `ui.component.loaded`
Componente cargado desde archivo.

```json
{
  "event_type": "ui.component.loaded",
  "payload": {
    "component": "action-button",
    "type": "button",
    "has_states": true,
    "loaded_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### `ui.component.rendered`
Componente renderizado con props.

```json
{
  "event_type": "ui.component.rendered",
  "payload": {
    "component": "action-button",
    "type": "button",
    "duration": 5,
    "html_length": 150,
    "css_length": 300
  }
}
```

### `ui.tokens.loaded`
Design system tokens cargados.

```json
{
  "event_type": "ui.tokens.loaded",


  "payload": {
    "source": "./docs/biblioteca_componentes_ui_v1.json",
    "color_count": 6,
    "spacing_count": 4,
    "loaded_at": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## 📡 Eventos Suscritos

### `ui.component.get.request`
Obtener definición de componente.

```json
{
  "name": "action-button",
  "request_id": "req_123",
  "correlation_id": "uuid"
}
```

### `ui.component.render.request`
Renderizar componente con props.

```json
{
  "name": "action-button",
  "props": {
    "state": "loading",
    "text": "Saving..."
  },
  "request_id": "req_456",
  "correlation_id": "uuid"
}
```

### `ui.tokens.get.request`
Obtener design system tokens.

```json
{
  "request_id": "req_789",
  "correlation_id": "uuid"
}
```

---

## 🔌 APIs HTTP

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/components/:name` | Obtener definición |
| GET | `/components` | Listar componentes |
| POST | `/components/:name/render` | Renderizar con props |
| GET | `/tokens` | Obtener tokens |
| POST | `/components/reload` | Recargar desde disco |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas |

---

## 🧪 Ejemplos de Uso

### Listar componentes
```bash
curl http://localhost:3000/modules/ui-renderer/components
```

### Obtener definición
```bash
curl http://localhost:3000/modules/ui-renderer/components/action-button
```

### Renderizar botón
```bash
curl -X POST http://localhost:3000/modules/ui-renderer/components/action-button/render \
  -H "Content-Type: application/json" \
  -d '{
    "state": "loading",
    "text": "Processing..."
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "component": "action-button",
  "html": "<button class=\"ui-button ui-button-loading\">...</button>",
  "css": ".ui-button { background-color: #F5B700; ... }"
}
```

### Renderizar tabla
```bash
curl -X POST http://localhost:3000/modules/ui-renderer/components/data-table/render \
  -H "Content-Type: application/json" \
  -d '{
    "columns": [
      { "key": "id", "label": "ID" },
      { "key": "name", "label": "Name" },
      { "key": "status", "label": "Status" }
    ],
    "rows": [
      { "id": 1, "name": "Item 1", "status": "Active" },
      { "id": 2, "name": "Item 2", "status": "Pending" }
    ]
  }'
```

### Renderizar formulario
```bash

curl -X POST http://localhost:3000/modules/ui-renderer/components/user-form/render \
  -H "Content-Type: application/json" \
  -d '{
    "fields": [
      { "name": "email", "label": "Email", "type": "email", "required": true },
      { "name": "password", "label": "Password", "type": "password", "required": true }
    ]
  }'
```

### Obtener tokens
```bash
curl http://localhost:3000/modules/ui-renderer/tokens
```

---

## 🔄 Uso desde Otros Módulos (Event-Driven)

### Renderizar componente vía eventos
```javascript
// En otro módulo
async renderUIComponent(componentName, props, correlationId) {
  const requestId = `render_${Date.now()}`;

  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

    const unsubscribe = this.eventBus.on('ui.component.render.response', (event) => {
      if (event.payload.request_id === requestId) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.payload);
      }
    });
  });

  await this.eventBus.publish('ui.component.render.request', {
    name: componentName,
    props,
    request_id: requestId,
    correlation_id: correlationId
  });

  const response = await responsePromise;

  if (!response.success) {
    throw new Error(response.error);
  }

  return {
    html: response.html,
    css: response.css
  };
}
```

---

## 📊 Métricas

### Counters
- `ui.component.loaded.total` - Componentes cargados
- `ui.component.rendered.total` - Renderizados ejecutados
- `ui.component.error.total` - Errores
- `ui.reload.total` - Recargas

### Gauges
- `ui.component.count` - Componentes disponibles
- `ui.template.count` - Templates registrados

### Timings
- `ui.component.render.duration` - Tiempo de renderizado
- `ui.component.load.duration` - Tiempo de carga

---

## ⚙️ Configuración

```json
{
  "componentsPath": "./ui-components",
  "tokensPath": "./docs/biblioteca_componentes_ui_v1.json",
  "autoReload": false,
  "watchInterval": 5000
}
```

---

## 🎯 Casos de Uso

1. **Dashboard Admin** - Renderizar cards, tablas, botones dinámicamente
2. **Formularios Dinámicos** - Generar forms desde JSON
3. **Themes** - Aplicar tokens de diseño consistentes
4. **Server-Side Rendering** - Generar HTML/CSS para respuestas HTTP
5. **Design System** - Mantener consistencia visual
