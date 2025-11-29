# 📦 Plop Templates - Event Core

Generadores de código para Auto-UI v2.0 y módulos Event-Core.

## 🚀 Uso Rápido

```bash
# Ver todos los generators disponibles
npm run plop

# O usar directamente
npm run plop <generator>
```

---

## 📋 Generators Disponibles

### 1. 🎯 `module` - Crear Módulo Completo

Genera un módulo Event-Core completo con toda la estructura.

```bash
npm run plop module
```

**Genera:**
- `modules/{name}/index.js` - Lógica del módulo
- `modules/{name}/module.json` - Configuración (Auto-UI v2.0)
- `modules/{name}/README.md` - Documentación
- `modules/{name}/schemas/events.json` - Schema de eventos
- `modules/{name}/schemas/{name}.json` - Schema principal

**Características:**
- ✅ Auto-UI v2.0 integrado
- ✅ Dashboard two-column por defecto
- ✅ Widgets predefinidos (stat-cards, table-advanced, charts)
- ✅ Data binding con @compute
- ✅ Permisos granulares
- ✅ MQTT integration
- ✅ Validación completa

**Ejemplo:**
```bash
📦 Nombre del módulo: task-manager
📝 Descripción: Gestión de tareas
👤 Autor: Mi Equipo
🎨 ¿Incluir UI?: Sí
🔸 Icono: ✅
💾 ¿Persistencia JSON?: No
📤 Eventos a publicar: task.created,task.updated,task.deleted
📥 Eventos a escuchar: user.logged
🔌 APIs HTTP: GET /tasks,POST /tasks,PUT /tasks/:id,DELETE /tasks/:id
```

---

### 2. 🎨 `ui-view` - Crear Vista Auto-UI

Genera vistas Auto-UI v2.0 standalone para módulos existentes.

```bash
npm run plop ui-view
```

**Tipos de vistas disponibles:**

#### A) Dashboard con dos columnas
Layout two-column con widgets en sidebar.

**Incluye:**
- Stat cards (4)
- Table advanced con actions
- Chart (pie/doughnut)
- Activity feed
- Info card

**Ideal para:** Dashboards, paneles de control, resúmenes

---

#### B) Dashboard con tabs
Layout tabs con múltiples secciones.

**Incluye:**
- 5 tabs: overview, data, analytics, activity, settings
- Stat cards y charts
- Table exportable
- Activity feed con groupBy
- Settings form

**Ideal para:** Aplicaciones complejas, múltiples vistas, configuración

---

#### C) Formulario (crear/editar)
Form view completo con validación.

**Incluye:**
- 4 secciones: basic_info, additional_info, settings, attachments
- Todos los componentes: input, textarea, select, radio, checkbox, file-upload
- Validación completa (required, minLength, pattern, etc.)
- Mensajes de error personalizados
- Secciones colapsables

**Ideal para:** Crear/editar entidades, formularios complejos

---

#### D) Vista de detalle
Detail view con layout two-column.

**Incluye:**
- Cards de información (main, additional, timestamps)
- Breadcrumbs
- Actions (editar, eliminar, volver)
- Stat cards en sidebar
- Activity feed
- Quick actions
- Metadata

**Ideal para:** Ver detalles de items, perfiles, información completa

---

**Ejemplo de uso:**
```bash
npm run plop ui-view

📦 Nombre del módulo: task-manager
🎨 Tipo de vista: Dashboard con tabs
🔸 Icono: ✅
👤 Autor: Mi Equipo

✅ Vista creada: modules/task-manager/views/dashboard-tabs.json
```

**Integración en module.json:**
```json
{
  "ui": {
    "version": "2.0",
    "views": {
      "main": {
        // Copiar contenido desde dashboard-tabs.json
      }
    }
  }
}
```

---

### 3. 🧩 `ui-component` - Crear Componente UI

Genera componentes Auto-UI reutilizables.

```bash
npm run plop ui-component
```

**Genera:**
- `auto-ui/components/{category}/{name}.json` - Definición del componente
- `auto-ui/client/js/components/{name}.js` - Comportamiento JavaScript

**Categorías:**
- **core** - Botones, elementos básicos
- **form** - Inputs, selects, checkboxes
- **data** - Tablas, listas, grids
- **navigation** - Navbars, breadcrumbs, tabs
- **feedback** - Toasts, alerts, spinners
- **layout** - Cards, containers
- **custom** - Componentes personalizados

**Características del JS generado:**

Según la categoría, el componente incluye:

#### Core Components
- ✅ Loading states con spinner
- ✅ Icon rendering
- ✅ Hover effects
- ✅ Click handling
- ✅ Keyboard accessibility

#### Form Components
- ✅ Validación automática (required, minLength, maxLength, email, url)
- ✅ Error messages
- ✅ Focus/blur handling
- ✅ Change events
- ✅ Real-time validation

#### Data Components
- ✅ Data loading (fetch API)
- ✅ Sorting setup
- ✅ Filtering setup
- ✅ Loading states

#### Navigation Components
- ✅ Active state tracking
- ✅ URL sync
- ✅ Popstate listener

#### Feedback Components
- ✅ Auto-dismiss
- ✅ Close button
- ✅ Dismiss animation
- ✅ ESC key handling

**Ejemplo:**
```bash
npm run plop ui-component

🎨 Nombre: status-badge
📁 Categoría: feedback
🎭 ¿Variantes?: Sí

✅ Componentes creados:
   ├── auto-ui/components/feedback/status-badge.json
   └── auto-ui/client/js/components/status-badge.js
```

**Uso en vistas:**
```json
{
  "component": "status-badge",
  "variant": "success",
  "size": "md",
  "props": {
    "label": "Activo",
    "icon": "✓"
  }
}
```

**Uso en JavaScript:**
```javascript
// Auto-inicializado en elementos con data-component="status-badge"
<div data-component="status-badge" data-variant="success">
  Activo
</div>

// O manualmente
const badge = new AutoUI.components['status-badge'](element);
badge.setState({ variant: 'danger' });

// Eventos
element.addEventListener('status-badge:click', (e) => {
  console.log('Badge clicked', e.detail);
});
```

---

### 4. 🎨 `ui-theme` - Crear Tema

Genera temas personalizados para Auto-UI.

```bash
npm run plop ui-theme
```

**Genera:**
- `auto-ui/config/themes/{name}.json` - Definición del tema

**Bases disponibles:**
- **dark** - Tema oscuro (por defecto)
- **light** - Tema claro
- **high-contrast** - Alto contraste
- **scratch** - Desde cero

**Ejemplo:**
```bash
npm run plop ui-theme

🎨 Nombre del tema: ocean-blue
📋 Basado en: dark

✅ Tema creado: auto-ui/config/themes/ocean-blue.json
```

**Activar tema:**
```bash
cp auto-ui/config/themes/ocean-blue.json auto-ui/config/theme.json
```

---

### 5. 🔌 `api` - Agregar API a Módulo

Asistente para agregar endpoints HTTP a módulos existentes.

```bash
npm run plop api
```

**Ejemplo:**
```bash
📦 Nombre del módulo: task-manager
🔸 Método HTTP: POST
🔸 Path: /tasks/:id/complete
📝 Descripción: Marcar tarea como completada
```

**Te indica cómo agregar:**
1. En `module.json`:
```json
{
  "method": "POST",
  "path": "/tasks/:id/complete",
  "handler": "handleComplete"
}
```

2. En `index.js`:
```javascript
async handleComplete(req, context) {
  const { id } = req.params;
  // TODO: Implementar
  return { status: 200, data: { completed: true } };
}
```

---

### 6. 📡 `event` - Agregar Evento a Módulo

Asistente para agregar eventos (publicar/suscribir) a módulos.

```bash
npm run plop event
```

**Ejemplo:**
```bash
📦 Nombre del módulo: task-manager
🔸 Tipo: publish (publicar)
🔸 Nombre del evento: task.completed

✅ Instrucciones para agregar el evento mostradas
```

---

## 📚 Ejemplos Completos

### Crear un módulo de gestión de usuarios

```bash
npm run plop module

# Configuración:
nombre: user-manager
descripción: Sistema de gestión de usuarios
autor: Mi Equipo
UI: Sí
icono: 👥
persistencia: No
eventos publicar: user.created,user.updated,user.deleted
eventos escuchar: auth.login,auth.logout
APIs: GET /users,POST /users,PUT /users/:id,DELETE /users/:id,GET /users/:id
```

**Resultado:**
- Módulo completo con UI v2.0
- Dashboard two-column con stat-cards y tabla
- Eventos configurados
- APIs configuradas
- Listo para personalizar

---

### Agregar vista de formulario personalizada

```bash
npm run plop ui-view

módulo: user-manager
tipo: Formulario (crear/editar)
icono: ✏️
autor: Mi Equipo
```

**Resultado:**
- `modules/user-manager/views/form-view.json`
- Formulario completo con validación
- Secciones: basic_info, additional_info, settings
- Todos los campos predefinidos

**Personalizar:**
- Editar campos en `form-view.json`
- Copiar a `module.json` → `views.create` y `views.edit`
- Ajustar endpoints y validaciones

---

### Crear componente custom de rating

```bash
npm run plop ui-component

nombre: star-rating
categoría: custom
variantes: Sí
```

**Resultado:**
- `auto-ui/components/custom/star-rating.json`
- `auto-ui/client/js/components/star-rating.js`

**Personalizar:**
1. Editar `star-rating.json`:
```json
{
  "variants": {
    "small": { "description": "Small stars", "className": "star-rating--small" },
    "large": { "description": "Large stars", "className": "star-rating--large" }
  },
  "props": {
    "value": { "type": "number", "default": 0, "description": "Rating value (0-5)" },
    "readonly": { "type": "boolean", "default": false }
  }
}
```

2. Implementar en `star-rating.js`:
```javascript
setupCustomComponent() {
  this.stars = this.config.value || 0;
  this.renderStars();

  if (!this.config.readonly) {
    this.setupClickHandlers();
  }
}

renderStars() {
  this.element.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.className = 'star';
    star.textContent = i <= this.stars ? '★' : '☆';
    star.dataset.value = i;
    this.element.appendChild(star);
  }
}
```

---

## 🔥 Tips y Mejores Prácticas

### Módulos
- Usa nombres en kebab-case: `task-manager`, `user-profile`
- Incluir UI desde el inicio facilita el desarrollo
- Define schemas detallados en `/schemas/`
- Usa eventos para comunicación entre módulos

### Vistas
- Usa `dashboard-two-column` para paneles simples
- Usa `dashboard-tabs` para aplicaciones complejas
- Personaliza los templates generados según necesidades
- Aprovecha @compute para cálculos dinámicos

### Componentes
- Categoriza correctamente (core, form, data, etc.)
- Usa variantes para diferentes estados visuales
- Implementa accessibility desde el inicio
- Emite eventos custom para integración

### Temas
- Basa en dark/light según necesidad
- Define paleta de colores coherente
- Usa design tokens (--primary, --success, etc.)
- Testea en diferentes pantallas

---

## 🎯 Estructura de Archivos Generados

```
event-core/
├── modules/
│   └── {name}/
│       ├── index.js              # Lógica
│       ├── module.json           # Config + UI v2.0
│       ├── README.md             # Docs
│       ├── schemas/
│       │   ├── events.json       # Schema eventos
│       │   └── {name}.json       # Schema principal
│       └── views/                # Vistas standalone
│           ├── dashboard-two-column.json
│           ├── dashboard-tabs.json
│           ├── form-view.json
│           └── detail-view.json
│
├── auto-ui/
│   ├── components/
│   │   └── {category}/
│   │       └── {name}.json       # Definición
│   ├── client/js/components/
│   │   └── {name}.js             # Comportamiento
│   └── config/themes/
│       └── {name}.json           # Tema
│
└── plop-templates/               # Templates
    ├── module/
    ├── view/
    ├── ui-component/
    └── ui-theme/
```

---

## 📖 Referencias

- **Auto-UI v2.0 Context**: `/docs/AUTO_UI_CONTEXT.md`
- **Component Registry**: `/auto-ui/components/COMPONENT_REGISTRY.md`
- **Module Generator**: `/docs/MODULE_GENERATOR.md`
- **Architecture**: `/docs/ARCHITECTURE_FINAL.md`

---

## 🆘 Problemas Comunes

### "Template not found"
Verifica que el template existe en `plop-templates/{generator}/`

### "Invalid name format"
Usa kebab-case: `my-module` (no `myModule`, `my_module`)

### "Module already exists"
El módulo ya existe. Elimínalo o usa otro nombre.

### Componente no se renderiza
1. Verifica que el JSON está bien formado
2. Importa el JS en `auto-ui/client/js/core.js`
3. Reinicia el servidor

---

**Versión:** 2.0.0
**Última actualización:** 2025-11-28
**Autor:** Event Core Team
