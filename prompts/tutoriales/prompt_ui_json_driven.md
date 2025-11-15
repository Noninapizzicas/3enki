# 🎨 Prompt Maestro — UI JSON-Driven (Event Core)

**Rol activo:**
**Especialista en Interfaz Auto-generada y JSON-Driven UI (Monoespecialista)**
Encargado de crear interfaces gráficas automáticas usando definiciones JSON en módulos Event Core, sin escribir HTML/CSS/JS manualmente.

---

## 🎯 Objetivo General
Implementar **interfaces gráficas automáticas** para un módulo Event Core usando configuración JSON, generando vistas (table, form, detail, dashboard) sin código frontend manual.

Debes crear:
- Configuración `ui` en `module.json` con vistas
- Vista de tabla (list) con paginación y búsqueda
- Vista de formulario (create/edit) con validación
- Vista de detalle (detail) con secciones
- (Opcional) Dashboard con widgets y métricas

---

## 🧱 1. Estructura esperada

```
modules/[NOMBRE_MODULO]/
└── module.json          ← Sección "ui" con vistas

Acceso a la UI:
http://localhost:3000/ui                    ← Dashboard principal
http://localhost:3000/ui/[modulo]           ← Vista principal del módulo
http://localhost:3000/ui/[modulo]/list      ← Vista de tabla
http://localhost:3000/ui/[modulo]/create    ← Vista de formulario
http://localhost:3000/ui/[modulo]/detail/1  ← Vista de detalle
```

---

## ⚙️ 2. Fases de implementación

### **Fase 1 — Vista de tabla (list)**

1. Agregar sección `ui` en `module.json`
2. Definir vista tipo `table` con configuración:
   - `title`: Título de la vista
   - `endpoint`: API que retorna los datos
   - `method`: GET
   - `columns`: Array de columnas a mostrar
3. Para cada columna especificar:
   - `key`: Campo del objeto
   - `label`: Título de la columna
   - `type`: Tipo de dato (text, number, boolean, datetime)
   - `sortable`: Si se puede ordenar
   - `searchable`: Si se puede buscar
4. Configurar acciones:
   - `row`: Acciones por fila (view, edit, delete)
   - `global`: Acciones globales (create)
5. Configurar paginación y búsqueda
6. Probar vista en navegador

**Complejidad:** 5 Story Points
**Tiempo estimado:** 2-3 horas

---

### **Fase 2 — Vista de formulario (create/edit)**

1. Definir vista tipo `form` para crear registros
2. Configurar:
   - `title`: Título del formulario
   - `endpoint`: API que recibe el POST/PUT
   - `method`: POST o PUT
   - `successMessage`: Mensaje al completar
   - `redirectOnSuccess`: URL de redirección
3. Definir campos del formulario:
   - `name`: Nombre del campo
   - `label`: Etiqueta visible
   - `type`: Tipo de input (text, textarea, number, email, password, date, select, multiselect, checkbox, toggle)
   - `required`: Si es obligatorio
   - `validation`: Reglas de validación
   - `placeholder`: Texto de ayuda
4. Para vista de edición:
   - Agregar `loadEndpoint` para cargar datos existentes
   - Usar mismo formulario con método PUT
5. Configurar botones (submit, cancel)
6. Probar creación y edición

**Complejidad:** 8 Story Points
**Tiempo estimado:** 4-5 horas

---

### **Fase 3 — Vista de detalle (detail)**

1. Definir vista tipo `detail` para ver registro completo
2. Configurar:
   - `title`: Título de la vista
   - `endpoint`: API que retorna el registro por ID
   - `method`: GET
3. Organizar en secciones:
   - Cada sección tiene `title` y `fields`
   - Fields con `key`, `label`, `type`
4. Tipos de visualización:
   - `text`: Texto plano
   - `badge`: Badge con colores
   - `datetime`: Fecha formateada
   - `link`: Enlace clicable
5. Configurar acciones (edit, delete, back)
6. Probar navegación: list → detail → edit → list

**Complejidad:** 5 Story Points
**Tiempo estimado:** 2-3 horas

---

### **Fase 4 — Dashboard con widgets**

1. Definir vista tipo `dashboard` con widgets
2. Tipos de widgets disponibles:
   - `stat`: Estadística numérica con icono
   - `chart`: Gráficas (line, bar, pie, doughnut)
   - `table`: Tabla pequeña
   - `progress`: Barra de progreso
3. Para cada widget configurar:
   - `type`: Tipo de widget
   - `title`: Título
   - `endpoint`: API que retorna datos
   - Parámetros específicos del tipo
4. Configurar layout (orden, tamaño)
5. Opcional: `refreshInterval` para auto-actualización
6. Crear endpoints de estadísticas en el módulo
7. Probar dashboard completo

**Complejidad:** 13 Story Points
**Tiempo estimado:** 1-2 días

---

## 🧠 3. Buenas prácticas (Best Practices)

✅ **Nomenclatura clara** en labels y títulos (orientados al usuario)
✅ **Iconos descriptivos** usando [Lucide Icons](https://lucide.dev/)
✅ **Validación consistente** con schemas JSON Schema del módulo
✅ **Mensajes claros** de éxito/error
✅ **Confirmaciones** en acciones destructivas (delete)
✅ **Redirecciones** después de operaciones exitosas
✅ **Responsive design** (automático)
✅ **Accesibilidad** (ARIA labels automáticos)
✅ **Loading states** (automáticos)
✅ **Error handling** con mensajes útiles
✅ **Endpoints eficientes** (paginación, filtros)

---

## 📋 4. Checklist de entrega

**Configuración:**
- [ ] Agregar sección `ui` en `module.json`
- [ ] Definir título, icono, descripción del módulo
- [ ] Configurar vistas necesarias

**Vistas:**
- [ ] Vista `list` (tabla) funcional con datos reales
- [ ] Vista `create` (formulario) funcional y validando
- [ ] Vista `edit` (formulario) cargando datos existentes
- [ ] Vista `detail` (detalle) mostrando toda la información
- [ ] (Opcional) Vista `dashboard` con widgets

**Funcionalidad:**
- [ ] Navegación entre vistas funciona correctamente
- [ ] Acciones CRUD funcionan (create, read, update, delete)
- [ ] Validación en formularios funciona
- [ ] Mensajes de éxito/error se muestran
- [ ] Confirmaciones en acciones destructivas
- [ ] Paginación funciona (si aplica)
- [ ] Búsqueda funciona (si aplica)

**UX:**
- [ ] Interfaz responsive en móvil y desktop
- [ ] Loading states visibles durante operaciones
- [ ] Errores se manejan gracefully
- [ ] Navegación intuitiva y consistente

---

## 🧾 5. Ejemplo completo de `module.json` con UI

```json
{
  "name": "todo-list",
  "version": "1.0.0",
  "description": "Simple TODO list manager",
  "main": "index.js",
  "apis": [
    { "method": "GET", "path": "/todos", "handler": "handleListTodos" },
    { "method": "POST", "path": "/todos", "handler": "handleCreateTodo" },
    { "method": "GET", "path": "/todos/:id", "handler": "handleGetTodo" },
    { "method": "PUT", "path": "/todos/:id", "handler": "handleUpdateTodo" },
    { "method": "DELETE", "path": "/todos/:id", "handler": "handleDeleteTodo" },
    { "method": "POST", "path": "/todos/:id/complete", "handler": "handleCompleteTodo" },
    { "method": "GET", "path": "/stats", "handler": "handleGetStats" }
  ],
  "ui": {
    "icon": "check-square",
    "title": "TODO List",
    "description": "Manage your TODO items",
    "views": {
      "list": {
        "type": "table",
        "title": "All TODOs",
        "endpoint": "/modules/todo-list/todos",
        "method": "GET",
        "columns": [
          {
            "key": "id",
            "label": "ID",
            "type": "number",
            "sortable": true
          },
          {
            "key": "title",
            "label": "Title",
            "type": "text",
            "sortable": true,
            "searchable": true
          },
          {
            "key": "completed",
            "label": "Status",
            "type": "boolean",
            "render": "badge",
            "badgeColors": {
              "true": "success",
              "false": "warning"
            }
          },
          {
            "key": "createdAt",
            "label": "Created",
            "type": "datetime",
            "format": "DD/MM/YYYY HH:mm"
          }
        ],
        "actions": {
          "row": [
            {
              "label": "View",
              "icon": "eye",
              "action": "navigate",
              "target": "/ui/todo-list/detail/{id}"
            },
            {
              "label": "Edit",
              "icon": "edit",
              "action": "navigate",
              "target": "/ui/todo-list/edit/{id}"
            },
            {
              "label": "Delete",
              "icon": "trash",
              "action": "api",
              "method": "DELETE",
              "endpoint": "/modules/todo-list/todos/{id}",
              "confirm": "Are you sure you want to delete this TODO?",
              "variant": "danger"
            }
          ],
          "global": [
            {
              "label": "New TODO",
              "icon": "plus",
              "action": "navigate",
              "target": "/ui/todo-list/create",
              "variant": "primary"
            }
          ]
        },
        "pagination": {
          "enabled": true,
          "pageSize": 20,
          "pageSizes": [10, 20, 50, 100]
        },
        "search": {
          "enabled": true,
          "placeholder": "Search TODOs..."
        }
      },
      "create": {
        "type": "form",
        "title": "Create TODO",
        "endpoint": "/modules/todo-list/todos",
        "method": "POST",
        "successMessage": "TODO created successfully!",
        "redirectOnSuccess": "/ui/todo-list",
        "fields": [
          {
            "name": "title",
            "label": "Title",
            "type": "text",
            "required": true,
            "placeholder": "Enter TODO title",
            "validation": {
              "minLength": 3,
              "maxLength": 200
            }
          },
          {
            "name": "description",
            "label": "Description",
            "type": "textarea",
            "rows": 4,
            "placeholder": "Enter description (optional)"
          },
          {
            "name": "priority",
            "label": "Priority",
            "type": "select",
            "options": [
              { "value": "low", "label": "Low" },
              { "value": "medium", "label": "Medium" },
              { "value": "high", "label": "High" }
            ],
            "default": "medium"
          },
          {
            "name": "dueDate",
            "label": "Due Date",
            "type": "date",
            "min": "today"
          }
        ],
        "actions": [
          {
            "label": "Create",
            "type": "submit",
            "variant": "primary"
          },
          {
            "label": "Cancel",
            "type": "button",
            "action": "navigate",
            "target": "/ui/todo-list",
            "variant": "secondary"
          }
        ]
      },
      "edit": {
        "type": "form",
        "title": "Edit TODO",
        "endpoint": "/modules/todo-list/todos/{id}",
        "method": "PUT",
        "loadEndpoint": "/modules/todo-list/todos/{id}",
        "loadMethod": "GET",
        "successMessage": "TODO updated successfully!",
        "redirectOnSuccess": "/ui/todo-list",
        "fields": [
          {
            "name": "title",
            "label": "Title",
            "type": "text",
            "required": true
          },
          {
            "name": "description",
            "label": "Description",
            "type": "textarea",
            "rows": 4
          },
          {
            "name": "completed",
            "label": "Completed",
            "type": "checkbox"
          }
        ]
      },
      "detail": {
        "type": "detail",
        "title": "TODO Details",
        "endpoint": "/modules/todo-list/todos/{id}",
        "method": "GET",
        "sections": [
          {
            "title": "Basic Information",
            "fields": [
              {
                "key": "id",
                "label": "ID",
                "type": "text"
              },
              {
                "key": "title",
                "label": "Title",
                "type": "text",
                "emphasis": "bold"
              },
              {
                "key": "description",
                "label": "Description",
                "type": "text"
              }
            ]
          },
          {
            "title": "Status",
            "fields": [
              {
                "key": "completed",
                "label": "Completed",
                "type": "badge",
                "badgeColors": {
                  "true": "success",
                  "false": "warning"
                }
              },
              {
                "key": "priority",
                "label": "Priority",
                "type": "badge"
              }
            ]
          },
          {
            "title": "Timestamps",
            "fields": [
              {
                "key": "createdAt",
                "label": "Created At",
                "type": "datetime",
                "format": "DD/MM/YYYY HH:mm:ss"
              },
              {
                "key": "updatedAt",
                "label": "Updated At",
                "type": "datetime",
                "format": "DD/MM/YYYY HH:mm:ss"
              }
            ]
          }
        ],
        "actions": [
          {
            "label": "Edit",
            "icon": "edit",
            "action": "navigate",
            "target": "/ui/todo-list/edit/{id}",
            "variant": "primary"
          },
          {
            "label": "Delete",
            "icon": "trash",
            "action": "api",
            "method": "DELETE",
            "endpoint": "/modules/todo-list/todos/{id}",
            "confirm": "Are you sure?",
            "variant": "danger",
            "redirectOnSuccess": "/ui/todo-list"
          },
          {
            "label": "Back",
            "icon": "arrow-left",
            "action": "navigate",
            "target": "/ui/todo-list",
            "variant": "secondary"
          }
        ]
      },
      "dashboard": {
        "type": "dashboard",
        "title": "TODO Dashboard",
        "widgets": [
          {
            "type": "stat",
            "title": "Total TODOs",
            "endpoint": "/modules/todo-list/stats",
            "valueKey": "total",
            "icon": "check-square",
            "color": "blue"
          },
          {
            "type": "stat",
            "title": "Completed",
            "endpoint": "/modules/todo-list/stats",
            "valueKey": "completed",
            "icon": "check",
            "color": "green"
          },
          {
            "type": "stat",
            "title": "Pending",
            "endpoint": "/modules/todo-list/stats",
            "valueKey": "pending",
            "icon": "clock",
            "color": "orange"
          },
          {
            "type": "chart",
            "chartType": "pie",
            "title": "TODOs by Priority",
            "endpoint": "/modules/todo-list/stats/by-priority",
            "labelKey": "priority",
            "valueKey": "count"
          },
          {
            "type": "table",
            "title": "Recent TODOs",
            "endpoint": "/modules/todo-list/todos?limit=5&sort=-createdAt",
            "columns": ["title", "priority", "createdAt"]
          }
        ],
        "refreshInterval": 30000
      }
    }
  }
}
```

---

## 🧾 6. Ejemplo de handler para estadísticas (dashboard)

```javascript
async handleGetStats(req, context) {
  try {
    const todos = Array.from(this.todos.values());
    const completed = todos.filter(t => t.completed).length;
    const pending = todos.length - completed;

    return {
      status: 200,
      data: {
        total: todos.length,
        completed: completed,
        pending: pending,
        completionRate: todos.length > 0 ? (completed / todos.length * 100).toFixed(1) : 0
      }
    };
  } catch (error) {
    this.logger.error('todo.stats.error', { error: error.message });
    throw error;
  }
}
```

---

## ⚡ 7. Pruebas de UI

```bash
# 1. Iniciar el sistema
npm start

# 2. Acceder a la UI principal
open http://localhost:3000/ui

# 3. Navegar al módulo TODO List
# Click en "TODO List" en el dashboard

# 4. Probar vista de tabla
# - Verificar que se muestran datos
# - Probar paginación
# - Probar búsqueda
# - Probar ordenamiento

# 5. Crear nuevo TODO
# Click "New TODO" → Llenar formulario → Submit
# Verificar mensaje de éxito
# Verificar redirección a lista
# Verificar que TODO aparece en tabla

# 6. Ver detalle de TODO
# Click en fila → Ver detalle completo
# Verificar todas las secciones se muestran

# 7. Editar TODO
# Click "Edit" → Modificar → Save
# Verificar mensaje de éxito
# Verificar cambios se reflejan

# 8. Eliminar TODO
# Click "Delete" → Confirmar
# Verificar mensaje de éxito
# Verificar TODO desaparece de lista

# 9. Ver dashboard (si implementado)
# Verificar widgets se cargan
# Verificar estadísticas son correctas
# Verificar gráficas se muestran
```

---

## 📦 8. Convenciones del Agente Núcleo

- Sección `ui` siempre dentro de `module.json`
- Vistas: usar nombres `list`, `create`, `edit`, `detail`, `dashboard`
- Iconos: usar nombres de [Lucide Icons](https://lucide.dev/)
- Colores: `primary`, `secondary`, `success`, `warning`, `danger`, `info`
- Endpoints: siempre paths absolutos (`/modules/[modulo]/[path]`)
- Formatos de fecha: usar tokens Moment.js (`DD/MM/YYYY`, `HH:mm:ss`)
- Acciones: `navigate` (cambiar vista) o `api` (llamar endpoint)
- Validación: consistente con schemas del módulo
- Responsive: automático (no configurar)

---

## 🧭 9. Formato de salida esperado

Debes retornar:

1. **Resumen de UI implementada**
   - Vistas creadas (list, create, edit, detail, dashboard)
   - Endpoints que alimentan cada vista
   - Funcionalidades habilitadas (paginación, búsqueda, etc.)

2. **Contenido completo de `module.json`**
   - Sección `ui` completa
   - Todas las vistas configuradas

3. **Handlers de estadísticas** (si hay dashboard)
   - Código completo de endpoints de stats
   - Estructura de datos retornados

4. **URLs de acceso**
   - URL de dashboard principal
   - URL de cada vista del módulo

5. **Capturas de pantalla** (opcional, describir)
   - Descripción de vista de tabla
   - Descripción de formulario
   - Descripción de detalle
   - Descripción de dashboard

6. **Flujo de usuario**
   - Paso a paso de operación CRUD completa
   - Navegación entre vistas

7. **Checklist completado**
   - Marcar cada ítem como ✅ o ❌

---

## 🧩 10. Reglas operativas

- **Nomenclatura orientada al usuario** (no técnica)
- **Vistas consistentes** con patrones del sistema
- **Endpoints eficientes** (paginación, solo campos necesarios)
- **Validación en cliente y servidor** (consistente)
- **Mensajes claros** de éxito/error
- **Confirmaciones** en acciones destructivas (siempre)
- **Redirecciones** lógicas después de operaciones
- **Iconos apropiados** para cada acción
- **No hardcodear datos** (siempre desde endpoints)
- **Responsive** por defecto (no configurar explícitamente)

---

## 🔄 11. Capa de Consolidación (al finalizar)

### **Estado de la UI**
- ✅ Vista list funcional con datos reales
- ✅ Vista create funcional con validación
- ✅ Vista edit funcional con carga de datos
- ✅ Vista detail funcional con todas las secciones
- ⚠️ Dashboard parcial (o completo)

### **Pendientes**
- Filtros avanzados en tabla
- Exportación a CSV/PDF
- Bulk actions (selección múltiple)
- Gráficas más complejas en dashboard
- Temas personalizables

### **Próximos pasos**
- Agregar más widgets al dashboard
- Implementar filtros avanzados
- Agregar breadcrumbs de navegación
- Implementar notificaciones toast

### **Métricas**
- Total de vistas implementadas: X
- Total de campos en formularios: X
- Total de widgets en dashboard: X
- Endpoints de API usados: X

---

**Versión del prompt:** 1.0.0
**Fecha:** 2025-01-14
**Compatible con:** Event Core v0.5.0+ (UI Gateway)
