# Auto-UI System - Arquitectura v2.0

## 🎯 Visión

Sistema de generación automática de interfaces de usuario **enterprise-grade**:
- ✅ 100% Declarativo (zero frontend code)
- ✅ Real-time por defecto
- ✅ Componentes reutilizables
- ✅ Layouts complejos
- ✅ Validación avanzada
- ✅ Sistema de permisos
- ✅ Performance optimizado
- ✅ Completamente testeable

---

## 📐 Arquitectura de Capas

```
┌─────────────────────────────────────────────────────────┐
│                    HTTP Gateway (3001)                   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  AutoUI Engine (Core)                    │
│  • Router          • Security        • Caching           │
└─────┬───────────────────┬────────────────────┬──────────┘
      │                   │                    │
      ▼                   ▼                    ▼
┌──────────┐      ┌──────────────┐    ┌─────────────┐
│  Loader  │      │  Orchestrator │    │   Bridge    │
│          │      │               │    │             │
│ Modules  │◄────►│  • Resolver   │    │  MQTT↔SSE   │
│ Comps    │      │  • Composer   │    │             │
│ Themes   │      │  • Renderer   │    └─────────────┘
└──────────┘      └───────┬───────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │Component │   │  Layout  │   │ Widget   │
    │ System   │   │  Engine  │   │ Factory  │
    └──────────┘   └──────────┘   └──────────┘
```

---

## 🧩 Componentes Principales

### 1. Engine Core
**Responsabilidad:** Orchestración y routing

**Nuevas capacidades:**
- ✅ Middleware system (auth, validation, caching)
- ✅ Plugin architecture
- ✅ Error boundary
- ✅ Performance monitoring

### 2. Component System
**Responsabilidad:** Componentes declarativos reutilizables

**Arquitectura:**
```javascript
Component {
  metadata: { name, version, type, category }
  schema: { props, variants, states, events }
  template: { render(), renderStatic() }
  logic: { validate(), transform(), compose() }
  styles: { base, variants, responsive }
}
```

**Categorías:**
- `core/`: Primitivos (button, input, select, checkbox, radio)
- `data/`: Visualización (table, grid, list, tree, timeline)
- `layout/`: Estructura (card, modal, sidebar, tabs, accordion)
- `feedback/`: Respuestas (toast, alert, progress, skeleton)
- `chart/`: Gráficos (line, bar, pie, donut, area)
- `form/`: Formularios (fieldset, validation, wizard)

### 3. Layout Engine
**Responsabilidad:** Composición de vistas complejas

**Layouts soportados:**
```javascript
{
  "type": "dashboard",
  "layouts": {
    "single": "100%",
    "two-column": "60% | 40%",
    "three-column": "33% | 33% | 33%",
    "sidebar-left": "280px | flex",
    "sidebar-right": "flex | 280px",
    "grid": "repeat(auto-fit, minmax(300px, 1fr))",
    "masonry": "column-count: 3",
    "flex": "custom flex layout"
  }
}
```

### 4. Widget Factory
**Responsabilidad:** Widgets dinámicos complejos

**Widgets disponibles:**
- `stat`: Métrica con icono, valor, cambio, trend
- `chart`: Gráficos interactivos (Chart.js wrapper)
- `table-advanced`: Tabla con sorting, filtering, pagination
- `calendar`: Vista de calendario con eventos
- `kanban`: Board estilo Kanban
- `timeline`: Línea de tiempo
- `map`: Mapas interactivos
- `activity-feed`: Feed de actividades

### 5. Resolver
**Responsabilidad:** Resolución de datos y referencias

**Capacidades:**
```javascript
// Resolver soporta:
"value": "@data.user.name"           // Data binding
"value": "@metrics.total"            // Metrics reference
"value": "@env.API_URL"              // Environment vars
"value": "@compute:sum(items.price)" // Computed values
"value": "@i18n.messages.welcome"    // Internationalization
```

### 6. Composer
**Responsabilidad:** Composición de UI desde definiciones

**Proceso:**
```
module.json → Resolver → Components → Layout → HTML
    ↓
ui.views.main → Parse → Resolve refs → Compose → Render
```

### 7. Validator
**Responsabilidad:** Validación avanzada de formularios

**Reglas soportadas:**
```javascript
{
  "required": true,
  "type": "email",
  "minLength": 5,
  "maxLength": 100,
  "pattern": "^[A-Z]",
  "custom": "validateApiKey",
  "async": "checkUniqueness",
  "dependencies": ["other_field"],
  "conditional": { "when": "type", "equals": "custom", "required": true }
}
```

### 8. Permission System
**Responsabilidad:** Control de acceso granular

**Modelo:**
```javascript
{
  "permissions": {
    "view": ["admin", "user"],
    "create": ["admin"],
    "edit": ["admin", "owner"],
    "delete": ["admin"],
    "custom": {
      "export": ["admin", "analyst"],
      "import": ["admin"]
    }
  },
  "fieldLevel": {
    "api_key": { "view": ["admin"], "edit": ["admin"] },
    "status": { "edit": ["admin"] }
  }
}
```

---

## 🎨 Sistema de Temas v2

### Theme Structure
```javascript
{
  "name": "event-core-dark",
  "extends": "base",           // Theme inheritance
  "tokens": {
    "colors": { ... },
    "spacing": { ... },
    "typography": { ... }
  },
  "components": {              // Component-specific overrides
    "button": { ... },
    "card": { ... }
  },
  "breakpoints": { ... },
  "animations": { ... },
  "customProperties": { ... }  // User-defined CSS vars
}
```

### Theme Switching
- Hot-reload sin refresh
- Smooth transitions entre temas
- Per-user theme preferences
- Dark/Light mode automático

---

## 🚀 Performance Optimizations

### 1. Caching Strategy
```javascript
{
  "moduleCache": "LRU(100)",        // Module definitions
  "componentCache": "LRU(200)",     // Component instances
  "dataCache": "TTL(60s)",          // Data from APIs
  "htmlCache": "LRU(50)",           // Rendered HTML
  "cssCache": "Persistent"          // Compiled CSS
}
```

### 2. Lazy Loading
- Components on-demand
- Routes lazy-loaded
- Images lazy-loaded
- Data paginated

### 3. HTML Streaming
- Chunked responses
- Progressive rendering
- Skeleton screens

### 4. Resource Optimization
- CSS minification
- HTML compression
- Inline critical CSS
- Defer non-critical JS

---

## 🔒 Security

### Input Sanitization
- XSS protection
- SQL injection prevention
- CSRF tokens
- Content Security Policy

### Permission Checks
- Request-level auth
- Field-level access control
- Row-level security
- Audit logging

---

## 📊 Observability

### Logging
```javascript
{
  "component": "autoui.renderer",
  "action": "render_view",
  "module": "credential-manager",
  "view": "main",
  "duration": 45,
  "cacheHit": true
}
```

### Metrics
- Render time per view
- Cache hit ratio
- Component usage stats
- Error rates
- Real-time clients count

### Tracing
- Request correlation IDs
- Component render tree
- Data resolution path

---

## 🧪 Testing Strategy

### Unit Tests
- Component rendering
- Validator logic
- Resolver functions
- Permission checks

### Integration Tests
- Full page rendering
- HTMX interactions
- SSE connectivity
- Data fetching

### E2E Tests
- User workflows
- Real browser tests
- Visual regression

---

## 📦 Module Integration

### Module Definition Enhanced
```json
{
  "ui": {
    "enabled": true,
    "version": "2.0",

    "metadata": {
      "title": "Credential Manager",
      "icon": "🔐",
      "description": "...",
      "tags": ["security", "api"]
    },

    "views": {
      "main": {
        "type": "dashboard",
        "layout": "two-column",
        "sections": [
          {
            "id": "header",
            "component": "page-header",
            "props": { ... }
          },
          {
            "id": "content",
            "component": "layout",
            "layout": "two-column",
            "columns": [
              {
                "width": "65%",
                "widgets": [
                  {
                    "component": "table-advanced",
                    "dataSource": "@api:/credentials",
                    "realtime": true,
                    "config": { ... }
                  }
                ]
              },
              {
                "width": "35%",
                "widgets": [
                  { "component": "stat-card", ... },
                  { "component": "chart-pie", ... }
                ]
              }
            ]
          }
        ]
      }
    },

    "components": {
      "stat-card": {
        "template": "custom/stat-card.html",
        "style": "custom/stat-card.css",
        "logic": "custom/stat-card.js"
      }
    },

    "actions": {
      "create": { "modal": "form-create", "permission": "create" },
      "edit": { "modal": "form-edit", "permission": "edit" },
      "delete": { "confirm": true, "permission": "delete" }
    },

    "realtime": {
      "enabled": true,
      "events": ["created", "updated", "deleted"],
      "refreshStrategy": "incremental"
    }
  }
}
```

---

## 🔄 Migration Path

### Phase 1: Core Foundation (Week 1)
- ✅ Component system base
- ✅ Layout engine
- ✅ Enhanced resolver

### Phase 2: Advanced Features (Week 2)
- ✅ Widget factory
- ✅ Validation system
- ✅ Permission system

### Phase 3: Performance & Polish (Week 3)
- ✅ Caching layer
- ✅ Theme system v2
- ✅ Testing suite

### Phase 4: Production Ready (Week 4)
- ✅ Documentation
- ✅ Migration tools
- ✅ Performance tuning

---

## 📚 API Reference

### Component Registration
```javascript
AutoUI.registerComponent('stat-card', {
  schema: { ... },
  render: (props, context) => { ... },
  validate: (props) => { ... }
});
```

### Layout Registration
```javascript
AutoUI.registerLayout('kanban', {
  render: (sections, context) => { ... },
  validate: (config) => { ... }
});
```

### Widget Registration
```javascript
AutoUI.registerWidget('chart-line', {
  render: (data, config) => { ... },
  update: (newData) => { ... }
});
```

---

## 🎯 Success Metrics

### Developer Experience
- ⏱️ Time to create new UI: < 10 minutes
- 📝 Lines of code: 0 (pure JSON)
- 🔧 Customization: Easy via theme/components

### Performance
- ⚡ Initial load: < 500ms
- 🔄 Real-time update: < 50ms
- 💾 Memory usage: < 100MB

### Reliability
- ✅ Test coverage: > 90%
- 🐛 Bug rate: < 1/week
- ⏰ Uptime: > 99.9%

---

**Version:** 2.0.0
**Last Updated:** 2025-11-25
**Authors:** Event Core Team
