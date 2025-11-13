# UI Components - JSON-Driven System

Sistema de componentes UI configurables por JSON para Event Core.

## 📋 Índice

- [Visión General](#visión-general)
- [Arquitectura](#arquitectura)
- [Design System Tokens](#design-system-tokens)
- [Componentes Disponibles](#componentes-disponibles)
- [Cómo Crear Componentes](#cómo-crear-componentes)
- [API del UI Renderer](#api-del-ui-renderer)
- [Admin Panel](#admin-panel)

## 🎯 Visión General

El sistema UI JSON-driven permite definir componentes de interfaz mediante archivos JSON que son interpretados y renderizados dinámicamente por el **UI Renderer Module**. Este enfoque:

- ✅ **Sin código**: Define UI con JSON, no JavaScript
- ✅ **Design system integrado**: Usa tokens de `biblioteca_componentes_ui_v1.json`
- ✅ **Reutilizable**: Los componentes se pueden usar en cualquier módulo
- ✅ **Consistente**: Todos los componentes siguen el mismo design system
- ✅ **Psicológicamente optimizado**: Colores y espaciados basados en carga cognitiva

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────┐
│          UI Components (JSON Files)             │
│   button.component.json, card.component.json    │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│           UI Renderer Module                    │
│  - Lee componentes JSON                         │
│  - Aplica design tokens                         │
│  - Genera HTML + CSS                            │
│  - Expone API HTTP                              │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│            Admin Panel Module                   │
│  - Consume UI Renderer API                      │
│  - Gestiona Plugins, AI Agents, Prompts         │
│  - Web UI moderna                               │
└─────────────────────────────────────────────────┘
```

## 🎨 Design System Tokens

Los tokens se definen en `docs/biblioteca_componentes_ui_v1.json`:

### Colores

```json
{
  "verde_accion": "#2FBF71",    // Acciones positivas
  "ambar_pendiente": "#F5B700",  // Estados pendientes
  "rojo_error": "#E63946",       // Errores y alertas
  "azul_info": "#1D4ED8",        // Información
  "gris_base": "#6B7280",        // Elementos base
  "gris_fondo": "#0F1216"        // Fondo principal
}
```

### Espaciado

```json
{
  "xs": 4,   // 4px
  "sm": 8,   // 8px
  "md": 12,  // 12px
  "lg": 16   // 16px
}
```

### Touch Targets

Todos los botones y elementos interactivos tienen un **mínimo de 56x56px** para facilitar el uso táctil.

## 📦 Componentes Disponibles

### 1. Button (`button.component.json`)

Botón con múltiples estados:

```json
{
  "component": "button",
  "states": {
    "success": { "color": "#2FBF71", "icon": "✓", "text": "Success" },
    "error": { "color": "#E63946", "icon": "✗", "text": "Error" },
    "pending": { "color": "#F5B700", "icon": "⏳", "text": "Pending" },
    "info": { "color": "#1D4ED8", "icon": "ℹ", "text": "Info" }
  }
}
```

**Uso:**

```javascript
// Renderizar un botón de éxito
const rendered = uiRenderer.renderComponent('button', {
  state: 'success',
  text: 'Save Changes'
});
// Retorna: { html: '...', css: '...' }
```

### 2. Card (`card.component.json`)

Tarjeta para agrupar información:

```json
{
  "component": "card",
  "variants": {
    "default": { "background": "#1a1d24" },
    "highlighted": { "border": "2px solid #2FBF71" },
    "error": { "border": "2px solid #E63946" }
  }
}
```

**Uso:**

```javascript
const rendered = uiRenderer.renderComponent('card', {
  title: 'Plugin Status',
  content: 'All plugins loaded successfully',
  footer: 'Last updated: 2025-11-13'
});
```

### 3. Table (`table.component.json`)

Tabla de datos con hover y estilos:

```json
{
  "component": "table",
  "features": {
    "sortable": true,
    "filterable": true,
    "hoverable": true
  }
}
```

**Uso:**

```javascript
const rendered = uiRenderer.renderComponent('table', {
  columns: [
    { key: 'name', label: 'Plugin Name' },
    { key: 'version', label: 'Version' },
    { key: 'status', label: 'Status' }
  ],
  rows: [
    { name: 'github', version: '1.0.0', status: 'active' },
    { name: 'slack', version: '1.0.0', status: 'active' }
  ]
});
```

### 4. Form (`form.component.json`)

Formulario con validación:

```json
{
  "component": "form",
  "field_types": {
    "text": { "validation": "string" },
    "email": { "validation": "email" },
    "password": { "min_length": 8 }
  }
}
```

**Uso:**

```javascript
const rendered = uiRenderer.renderComponent('form', {
  fields: [
    { name: 'username', type: 'text', label: 'Username', required: true },
    { name: 'email', type: 'email', label: 'Email', required: true },
    { name: 'password', type: 'password', label: 'Password', required: true }
  ]
});
```

## 🔧 Cómo Crear Componentes

### Paso 1: Crear archivo JSON

Crea un archivo en `ui-components/` con el formato `[nombre].component.json`:

```json
{
  "component": "alert",
  "name": "Alert Box",
  "description": "Alert component for notifications",
  "variants": {
    "success": {
      "color": "#2FBF71",
      "icon": "✓"
    },
    "warning": {
      "color": "#F5B700",
      "icon": "⚠"
    },
    "error": {
      "color": "#E63946",
      "icon": "✗"
    }
  }
}
```

### Paso 2: Agregar template en UI Renderer

Edita `modules/ui-renderer/index.js` y agrega un template en `loadTemplates()`:

```javascript
this.templates.set('alert', (component, props) => {
  const variant = props.variant || 'success';
  const variantConfig = component.variants[variant];

  return {
    html: `
      <div class="ui-alert ui-alert-${variant}">
        <span class="ui-alert-icon">${variantConfig.icon}</span>
        <span class="ui-alert-message">${props.message}</span>
      </div>
    `,
    css: `
      .ui-alert {
        background-color: ${variantConfig.color};
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
    `
  };
});
```

### Paso 3: Usar el componente

```javascript
const rendered = uiRenderer.renderComponent('alert', {
  variant: 'error',
  message: 'Failed to load plugin'
});
```

## 🌐 API del UI Renderer

El UI Renderer Module expone las siguientes APIs HTTP:

### GET `/modules/ui-renderer/components`

Lista todos los componentes disponibles:

```bash
curl http://localhost:3000/modules/ui-renderer/components
```

**Response:**

```json
{
  "components": [
    { "component": "button", "name": "Action Button", ... },
    { "component": "card", "name": "Info Card", ... },
    { "component": "table", "name": "Data Table", ... },
    { "component": "form", "name": "Input Form", ... }
  ],
  "count": 4
}
```

### GET `/modules/ui-renderer/component/:name`

Obtiene un componente específico:

```bash
curl http://localhost:3000/modules/ui-renderer/component/button
```

### POST `/modules/ui-renderer/component/:name/render`

Renderiza un componente con props:

```bash
curl -X POST http://localhost:3000/modules/ui-renderer/component/button/render \
  -H "Content-Type: application/json" \
  -d '{"state": "success", "text": "Save"}'
```

**Response:**

```json
{
  "component": "button",
  "html": "<button class='ui-button ui-button-success'>...</button>",
  "css": ".ui-button { background-color: #2FBF71; ... }"
}
```

### GET `/modules/ui-renderer/tokens`

Obtiene los design system tokens:

```bash
curl http://localhost:3000/modules/ui-renderer/tokens
```

## 🖥️ Admin Panel

El **Admin Panel Module** es una aplicación web completa que usa el sistema UI JSON-driven para gestionar Event Core.

### Acceso

```
http://localhost:3000/modules/admin-panel/
```

### Funcionalidades

#### 🧩 **Modules Tab**

- Ver todos los módulos cargados
- Información de versión y APIs disponibles

#### 🔌 **Plugins Tab**

- Listar plugins activos
- Ver funciones disponibles de cada plugin
- Información de autenticación y endpoints

#### 🤖 **AI Agents Tab**

- Crear nuevos agentes AI
- Configurar provider (DeepSeek, Claude, OpenAI, Ollama)
- Definir eventos a los que se suscribe
- Activar/desactivar agentes
- Eliminar agentes

#### 💬 **Prompts Tab**

- Crear nuevos prompts
- Ver prompts existentes con versionado
- Editar prompts
- Organizar por categorías

### Capturas de Interfaz

**Dashboard Stats:**

```
╔════════════════════════════════════════════════╗
║  ⚙️ Event Core Admin Panel                     ║
║                                                ║
║  Modules: 8    Plugins: 4    Agents: 1    Prompts: 5
╚════════════════════════════════════════════════╝
```

**Tabs:**

```
[🧩 Modules] [🔌 Plugins] [🤖 AI Agents] [💬 Prompts]
```

**Plugin Card Example:**

```
┌─────────────────────────────────────┐
│ GitHub                    [Active]  │
│                                     │
│ Version: 1.0.0                      │
│ Functions: 5                        │
│ Auth Type: bearer                   │
│                                     │
│           [View Details]            │
└─────────────────────────────────────┘
```

## 🎯 Best Practices

### 1. Usa Tokens del Design System

Siempre referencia los tokens en lugar de valores hardcoded:

❌ **Incorrecto:**
```json
{ "color": "#00FF00" }
```

✅ **Correcto:**
```json
{ "color": "#2FBF71" }  // verde_accion del design system
```

### 2. Mantén Touch Targets de 56px

Todos los elementos interactivos deben tener al menos 56x56px:

```json
{
  "size": {
    "min_width": "56px",
    "min_height": "56px"
  }
}
```

### 3. Estados Claros

Define estados visuales claros para feedback inmediato:

```json
{
  "states": {
    "success": { "color": "#2FBF71" },  // Verde
    "error": { "color": "#E63946" },    // Rojo
    "pending": { "color": "#F5B700" }   // Ámbar
  }
}
```

### 4. Accesibilidad

- Contraste mínimo WCAG AA (4.5:1)
- Separación de 8px entre targets
- Alternativas de texto para iconos

## 📊 Métricas

El UI Renderer publica eventos para tracking:

- `ui.component.loaded`: Cuando se carga un componente JSON
- `ui.component.rendered`: Cuando se renderiza un componente

## 🔮 Futuras Mejoras

- [ ] Más componentes (dropdown, modal, toast, tabs)
- [ ] Animaciones configurables por JSON
- [ ] Temas dinámicos (dark/light mode)
- [ ] Live preview en Admin Panel
- [ ] Component gallery con ejemplos
- [ ] Export a React/Vue components

## 📚 Referencias

- [Design System Tokens](../docs/biblioteca_componentes_ui_v1.json)
- [Lenguaje Visual](../docs/lenguaje-visual-ui_multirol_v1.json)
- [UI Renderer Module](../modules/ui-renderer/)
- [Admin Panel Module](../modules/admin-panel/)

---

**Event Core v1.2.0 "Visual Admin"**
Sistema UI JSON-Driven con Design System Psicológico
