# Auto-UI System - Contexto Completo

## 📋 Índice

1. [Descripción General](#descripción-general)
2. [Arquitectura](#arquitectura)
3. [Componentes del Motor](#componentes-del-motor)
4. [Integración con HTTP Gateway](#integración-con-http-gateway)
5. [Sistema de Temas](#sistema-de-temas)
6. [Componentes Auto-UI](#componentes-auto-ui)
7. [Configuración en module.json](#configuración-en-modulejson)
8. [Flujo de Renderizado](#flujo-de-renderizado)
9. [API Reference](#api-reference)
10. [Ejemplos de Uso](#ejemplos-de-uso)

---

## Descripción General

**Auto-UI** es un motor de generación automática de interfaces de usuario que crea UIs completas desde configuraciones JSON definidas en `module.json`.

### Características Principales

- ✅ **Schema-Driven**: UI generada desde schemas de módulos
- ✅ **Zero-Frontend Code**: No requiere escribir HTML/CSS/JS
- ✅ **Real-time Updates**: Integración MQTT/SSE
- ✅ **Theme System**: Design tokens centralizados
- ✅ **HTMX Integration**: Interactividad sin JavaScript custom
- ✅ **Component Library**: Biblioteca de componentes reutilizables

### Ubicación en el Proyecto

```
/auto-ui/
├── engine/
│   ├── index.js       # Orchestrador principal
│   ├── generator.js   # Generador de HTML
│   ├── loader.js      # Cargador de recursos
│   └── bridge.js      # Puente MQTT/SSE
├── components/
│   ├── core/          # Componentes básicos
│   ├── data/          # Componentes de datos
│   ├── layout/        # Componentes de layout
│   └── feedback/      # Componentes de feedback
└── config/
    └── theme.json     # Tema activo
```

---

## Arquitectura

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────┐
│           HTTP Gateway (port 3000/3001)         │
│  Detecta rutas /auto-ui/* → delega a AutoUI    │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│              AutoUI Engine (index.js)           │
│  • Routing interno (/auto-ui/*)                 │
│  • Coordina Loader, Generator, Bridge           │
└──────┬──────────────┬──────────────┬────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────┐  ┌─────────────┐  ┌──────────┐
│  Loader  │  │  Generator  │  │  Bridge  │
│          │  │             │  │          │
│ Carga:   │  │ Genera:     │  │ MQTT↔SSE │
│ • Módulos│  │ • HTML      │  │ Events   │
│ • Temas  │  │ • CSS       │  │          │
│ • Comps  │  │ • Templates │  │          │
└──────────┘  └─────────────┘  └──────────┘
```

### Flujo de Request

```
1. Browser → GET /auto-ui/credential-manager
2. HTTP Gateway → Detecta /auto-ui/*
3. AutoUI.handle(req, res)
4. Loader.getModule('credential-manager')
5. Generator.list(module)
6. HTML completo con estilos + HTMX
7. Response → Browser renderiza
```

---

## Componentes del Motor

### 1. AutoUI Engine (`auto-ui/engine/index.js`)

**Responsabilidades:**
- Orchestrar todos los componentes
- Routing interno con parámetros
- Manejo de requests HTTP
- Integración SSE

**Rutas Disponibles:**

| Ruta | Método | Handler | Descripción |
|------|--------|---------|-------------|
| `/auto-ui` | GET | `handleDashboard` | Dashboard principal |
| `/auto-ui/:module` | GET | `handleModuleList` | Vista de módulo |
| `/auto-ui/:module/list` | GET | `handleModuleList` | Lista/tabla |
| `/auto-ui/:module/rows` | GET | `handleModuleRows` | Filas de tabla (HTMX) |
| `/auto-ui/:module/form` | GET | `handleModuleForm` | Formulario crear |
| `/auto-ui/:module/form/:id` | GET | `handleModuleForm` | Formulario editar |
| `/auto-ui/:module/detail/:id` | GET | `handleModuleDetail` | Vista detalle |
| `/auto-ui/events` | GET | `bridge.connect` | SSE stream |
| `/auto-ui/js/core.js` | GET | `handleStaticJS` | JavaScript cliente |
| `/auto-ui/theme` | GET | `handleGetTheme` | Obtener tema |
| `/auto-ui/theme` | PUT | `handleSetTheme` | Cambiar tema |

**Inicialización:**

```javascript
const AutoUI = require('./auto-ui/engine');

const autoUI = new AutoUI({
  modulesPath: './modules',
  mqttClient: mqttClient,
  eventBus: eventBus,
  logger: logger
});

await autoUI.init();
```

---

### 2. Generator (`auto-ui/engine/generator.js`)

**Responsabilidades:**
- Generar HTML completo desde schemas
- Inyectar CSS desde theme tokens
- Crear templates reutilizables

**Métodos Principales:**

```javascript
// Página completa con layout
page(title, content, options)
  → Returns: HTML completo con <html>, <head>, <body>
  → Options: { sidebar: true/false, sse: true/false }

// Dashboard principal
dashboard()
  → Returns: Grid de módulos disponibles

// Sidebar de navegación
sidebar()
  → Returns: Navegación lateral con módulos

// Vista de lista/tabla
list(module, options)
  → Returns: Tabla con datos del módulo

// Filas de tabla (para HTMX)
rows(module, data)
  → Returns: <tr> elements

// Formulario crear/editar
form(module, data)
  → Returns: Modal con formulario

// Vista de detalle
detail(module, data)
  → Returns: Vista detallada de un registro

// CSS desde theme
generateCSS()
  → Returns: CSS variables desde theme.json
```

**Generación de CSS:**

El generator convierte el theme.json en CSS variables:

```javascript
// theme.json
{
  "colors": { "primary": "#3b82f6" },
  "spacing": { "md": "16px" }
}

// Genera CSS:
:root {
  --primary: #3b82f6;
  --space-md: 16px;
}
```

---

### 3. Loader (`auto-ui/engine/loader.js`)

**Responsabilidades:**
- Cargar módulos desde `/modules/*/module.json`
- Cargar componentes desde `/auto-ui/components/`
- Cargar y gestionar temas
- Cachear recursos

**Métodos Principales:**

```javascript
// Módulos
loadModules()                    → Carga todos los módulos
getModule(name)                  → Obtiene módulo por nombre
listModules()                    → Lista todos
listUIModules()                  → Solo módulos con ui.enabled

// Componentes
loadComponents()                 → Carga todos los componentes
getComponent(name)               → Obtiene componente por nombre
listComponents()                 → Lista todos

// Temas
loadTheme()                      → Carga tema activo
getTheme()                       → Obtiene tema actual
setTheme(themeName)              → Cambia tema
listThemes()                     → Lista temas disponibles

// Utilidades
reloadAll()                      → Recarga todo
getStats()                       → Estadísticas
```

**Caché:**

```javascript
this.modules = new Map()      // módulos cargados
this.components = new Map()   // componentes cargados
this.theme = {}               // tema activo
```

---

### 4. Bridge (`auto-ui/engine/bridge.js`)

**Responsabilidades:**
- Conectar eventos MQTT con SSE
- Sincronización tiempo real con frontend
- Gestión de conexiones SSE

**Eventos Soportados:**

```javascript
// Eventos de módulo
module.created    → Crear registro
module.updated    → Actualizar registro
module.deleted    → Eliminar registro

// Eventos de sistema
ui.theme.changed  → Cambio de tema
ui.reload         → Recargar UI
```

---

## Integración con HTTP Gateway

### En `core/gateway/http.js`

```javascript
// Líneas 128-137: Inicialización
const AutoUI = require('../../auto-ui/engine');
this.autoUI = new AutoUI({
  modulesPath: this.moduleLoader.modulesPath,
  eventBus: this.eventBus,
  logger: this.logger
});

// Líneas 314-318: Routing
if (this.autoUI && pathname.startsWith('/auto-ui')) {
  await this.handleAutoUIRoute(req, res);
  return;
}

// Líneas 900-920: Handler
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

### Estructura theme.json

```json
{
  "name": "event-core-dark",
  "version": "1.0.0",

  "colors": {
    "bg": "#0f1216",
    "bg-card": "#1a1d24",
    "text": "#ffffff",
    "primary": "#3b82f6",
    "success": "#22c55e",
    "warning": "#f59e0b",
    "danger": "#ef4444",
    "border": "#374151"
  },

  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px"
  },

  "radius": {
    "sm": "4px",
    "md": "8px",
    "lg": "12px",
    "full": "9999px"
  },

  "typography": {
    "font": "system-ui, sans-serif",
    "size-base": "1rem",
    "size-lg": "1.25rem",
    "weight-normal": "400",
    "weight-bold": "700"
  },

  "shadows": {
    "sm": "0 1px 2px rgba(0,0,0,0.3)",
    "md": "0 4px 6px rgba(0,0,0,0.4)",
    "lg": "0 10px 15px rgba(0,0,0,0.5)"
  }
}
```

### CSS Generado

```css
:root {
  /* Colors */
  --bg: #0f1216;
  --bg-card: #1a1d24;
  --text: #ffffff;
  --primary: #3b82f6;

  /* Spacing */
  --space-xs: 4px;
  --space-md: 16px;

  /* Radius */
  --radius-md: 8px;
  --radius-lg: 12px;
}

/* Estilos base */
.btn-primary {
  background: var(--primary);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
}
```

---

## Componentes Auto-UI

### Estructura de Componente

Ubicación: `/auto-ui/components/{category}/{component}.json`

```json
{
  "name": "button",
  "version": "1.0.0",
  "type": "core",
  "description": "Botón interactivo",

  "variants": {
    "primary": { "bg": "var(--primary)" },
    "secondary": { "bg": "var(--bg-card)" }
  },

  "sizes": {
    "sm": { "padding": "var(--space-xs)" },
    "md": { "padding": "var(--space-sm)" }
  },

  "interactions": {
    "click": { "enabled": true },
    "hold": { "enabled": true, "duration": 2000 }
  },

  "states": {
    "hover": { "transform": "translateY(-1px)" },
    "disabled": { "opacity": 0.5 }
  }
}
```

### Categorías Disponibles

| Categoría | Componentes | Descripción |
|-----------|-------------|-------------|
| `core/` | button, input | Componentes básicos |
| `data/` | table, grid | Visualización de datos |
| `layout/` | card, modal, sidebar | Estructura de página |
| `feedback/` | toast, alert | Notificaciones |

---

## Configuración en module.json

### Estructura Mínima

```json
{
  "name": "mi-modulo",
  "ui": {
    "enabled": true,
    "title": "Mi Módulo",
    "icon": "📦"
  }
}
```

### Configuración Completa

```json
{
  "name": "credential-manager",
  "version": "2.0.0",

  "ui": {
    "enabled": true,
    "title": "Credential Manager",
    "icon": "🔐",
    "description": "Gestión de credenciales",
    "access_level": "admin",

    "components": [
      "grid-credentials",
      "credential-card",
      "form-credential"
    ],

    "views": {
      "main": {
        "type": "dashboard",
        "layout": "two-column",

        "header": {
          "title": "🔐 Credential Manager",
          "subtitle": "Gestión de API Keys",
          "actions": [
            {
              "type": "button",
              "label": "Nueva Credencial",
              "icon": "➕",
              "action": "open_form",
              "variant": "primary"
            }
          ]
        },

        "left_column": {
          "width": "65%",
          "sections": [
            {
              "id": "credentials_grid",
              "type": "grid",
              "component": "grid-credentials",
              "config": {
                "endpoint": "/modules/credential-manager/credentials",
                "mqtt_topics": ["credential.saved"],
                "refresh_on_event": true
              }
            }
          ]
        },

        "right_column": {
          "width": "35%",
          "sections": [
            {
              "id": "info_panel",
              "type": "card",
              "title": "ℹ️ Información",
              "content": {
                "type": "info",
                "items": [
                  {
                    "label": "Total Credenciales",
                    "value_source": "metrics.credential.count.total"
                  }
                ]
              }
            }
          ]
        }
      },

      "create": {
        "type": "modal",
        "component": "form-credential",
        "mode": "create",
        "config": {
          "title": "Nueva Credencial",
          "endpoint": "/modules/credential-manager/credentials",
          "method": "POST"
        }
      }
    },

    "mqtt": {
      "enabled": true,
      "topics": [
        "credential.saved",
        "credential.updated",
        "credential.deleted"
      ],
      "auto_refresh": true
    },

    "permissions": {
      "view": ["admin"],
      "create": ["admin"],
      "edit": ["admin"],
      "delete": ["admin"]
    }
  },

  "schema": {
    "id": { "type": "string", "label": "ID" },
    "provider": {
      "type": "enum",
      "label": "Provider",
      "enum": ["OPENAI", "DEEPSEEK", "ANTHROPIC"],
      "required": true
    },
    "api_key": {
      "type": "string",
      "label": "API Key",
      "format": "password",
      "required": true
    }
  },

  "apis": [
    {
      "method": "GET",
      "path": "/credentials",
      "handler": "handleListCredentials"
    },
    {
      "method": "POST",
      "path": "/credentials",
      "handler": "handleCreateCredential"
    }
  ]
}
```

---

## Flujo de Renderizado

### 1. Request Inicial

```
User → http://localhost:3001/auto-ui/credential-manager
```

### 2. Gateway Routing

```javascript
// HTTP Gateway detecta /auto-ui/*
if (pathname.startsWith('/auto-ui')) {
  await this.handleAutoUIRoute(req, res);
}
```

### 3. AutoUI Processing

```javascript
// AutoUI Engine procesa
const path = 'credential-manager'
const module = this.loader.getModule('credential-manager')
```

### 4. HTML Generation

```javascript
// Generator crea HTML
const content = this.generator.list(module)
const html = this.generator.page(module.ui.title, content, { sse: true })
```

### 5. HTML Completo

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    :root { --primary: #3b82f6; /* theme tokens */ }
    .btn { /* component styles */ }
  </style>
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
</head>
<body>
  <nav class="sidebar"><!-- módulos --></nav>
  <main class="main">
    <table hx-get="/auto-ui/credential-manager/rows"
           hx-trigger="load">
      <!-- contenido -->
    </table>
  </main>
  <script src="/auto-ui/js/core.js"></script>
  <script>/* SSE connection */</script>
</body>
</html>
```

### 6. Browser Rendering

1. Browser recibe HTML completo
2. Parsea CSS inline (sin archivos externos)
3. Ejecuta HTMX para interactividad
4. Conecta SSE para real-time
5. Renderiza UI completamente funcional

---

## API Reference

### AutoUI Class

```javascript
class AutoUI {
  constructor(options)
  async init()
  async handle(req, res)
  async reload()
  getStats()
}
```

### Generator Class

```javascript
class Generator {
  page(title, content, options)
  dashboard()
  sidebar()
  list(module, options)
  rows(module, data)
  form(module, data)
  detail(module, data)
  generateCSS()
}
```

### Loader Class

```javascript
class Loader {
  async loadModules()
  async loadComponents()
  loadTheme()
  getModule(name)
  getComponent(name)
  getTheme()
  listUIModules()
  async reloadAll()
  getStats()
}
```

---

## Ejemplos de Uso

### Ejemplo 1: Módulo Simple

**module.json:**
```json
{
  "name": "tasks",
  "ui": { "enabled": true, "title": "Tareas", "icon": "✓" },
  "schema": {
    "title": { "type": "string", "required": true },
    "status": { "type": "enum", "enum": ["pending", "done"] }
  },
  "apis": [
    { "method": "GET", "path": "/tasks", "handler": "list" },
    { "method": "POST", "path": "/tasks", "handler": "create" }
  ]
}
```

**Acceso:**
```
http://localhost:3001/auto-ui/tasks
```

**Resultado:**
- ✅ Lista automática de tareas
- ✅ Formulario crear tarea
- ✅ Editar/eliminar con HTMX
- ✅ Todo sin escribir HTML/CSS/JS

---

### Ejemplo 2: Módulo con Dashboard

**module.json:**
```json
{
  "ui": {
    "views": {
      "main": {
        "type": "dashboard",
        "layout": "grid-3",
        "widgets": [
          { "type": "stat", "label": "Total", "endpoint": "/stats/total" },
          { "type": "chart", "label": "Gráfico", "endpoint": "/stats/chart" }
        ]
      }
    }
  }
}
```

---

### Ejemplo 3: Real-time Updates

**module.json:**
```json
{
  "ui": {
    "mqtt": {
      "enabled": true,
      "topics": ["task.created", "task.updated"],
      "auto_refresh": true
    }
  }
}
```

**Comportamiento:**
1. Usuario crea tarea → POST /tasks
2. Backend emite evento MQTT `task.created`
3. Bridge detecta evento → envía por SSE
4. Browser recibe SSE → HTMX refresh automático
5. Tabla se actualiza en tiempo real

---

## Ventajas de Auto-UI

### ✅ Productividad

- **Sin frontend code**: UI completa desde JSON
- **Desarrollo rápido**: Minutos vs días
- **Consistencia**: Mismo look & feel

### ✅ Mantenibilidad

- **Single source of truth**: module.json
- **Cambios centralizados**: Tema único
- **Menos código**: Menos bugs

### ✅ Performance

- **CSS inline**: Sin requests externos
- **HTMX**: Menos JavaScript
- **SSE**: Updates eficientes

### ✅ Experiencia de Usuario

- **Real-time**: Actualizaciones instantáneas
- **Responsive**: Mobile-first
- **Accessible**: ARIA attributes

---

## Comparación: Auto-UI vs Traditional

| Aspecto | Auto-UI | Traditional |
|---------|---------|-------------|
| **HTML** | ❌ No escribir | ✅ Escribir manualmente |
| **CSS** | ❌ No escribir | ✅ Escribir manualmente |
| **JavaScript** | ❌ No escribir | ✅ Escribir manualmente |
| **Config** | ✅ Solo JSON | ❌ Múltiples archivos |
| **Consistencia** | ✅ Automática | ⚠️ Manual |
| **Real-time** | ✅ Built-in | ⚠️ Implementar |
| **Tiempo dev** | ⚡ Minutos | 🐌 Días |

---

## Debugging Auto-UI

### Ver módulos cargados

```bash
curl http://localhost:3001/auto-ui/
```

### Ver configuración de módulo

```javascript
const loader = new Loader({ modulesPath: './modules' });
await loader.loadModules();
const module = loader.getModule('credential-manager');
console.log(module.ui);
```

### Ver tema activo

```bash
curl http://localhost:3001/auto-ui/theme
```

### Stats del sistema

```javascript
const stats = autoUI.getStats();
console.log(stats);
// {
//   loader: { modules: { total: 15, withUI: 4 } },
//   bridge: { connections: 2 },
//   initialized: true
// }
```

---

## Troubleshooting

### Problema: Módulo no aparece en Auto-UI

**Causa:** `ui.enabled` no está en `true`

**Solución:**
```json
{ "ui": { "enabled": true } }
```

---

### Problema: CSS no se aplica

**Causa:** Theme no cargado

**Verificar:**
```bash
curl http://localhost:3001/auto-ui/theme
```

---

### Problema: No hay real-time

**Causa:** MQTT no configurado

**Solución:**
```json
{ "ui": { "mqtt": { "enabled": true, "topics": [...] } } }
```

---

## Próximos Pasos

### Mejoras Planeadas

- [ ] Más componentes (charts, calendars)
- [ ] Temas adicionales (light mode)
- [ ] Drag & drop en tablas
- [ ] Export CSV/PDF
- [ ] Multi-idioma
- [ ] Validación avanzada de formularios

---

## Referencias

- **Código fuente:** `/auto-ui/`
- **Documentación HTMX:** https://htmx.org
- **Server-Sent Events:** https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events

---

**Última actualización:** 2025-11-25
**Versión Auto-UI:** 1.0.0
**Autor:** Event Core Team
