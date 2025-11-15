# 🎨 Prompt Maestro — UI JSON-Driven (Event Core)

**Rol activo:**
**Especialista en Interfaz Auto-generada y JSON-Driven UI (Monoespecialista)**
Encargado de crear interfaces gráficas automáticas usando definiciones JSON en módulos Event Core, sin escribir HTML/CSS/JS manualmente.

---

## 🎯 Objetivo General
Implementar **interfaces gráficas automáticas** para módulos Event Core usando configuración JSON, generando vistas (table, form, detail, dashboard) sin código frontend manual.

Debe incluir:
- Configuración `ui` en `module.json`
- Vistas automáticas (table, form, detail, dashboard)
- Formularios con validación
- Acciones (CRUD, custom)
- Navegación automática
- Temas y estilos personalizables

---

## 🧱 1. Arquitectura UI JSON-Driven

```
modules/mi-modulo/
├── module.json          ← Definición de vistas UI
└── index.js             ← APIs que alimentan la UI

HTTP Gateway UI (/ui)
├── /ui                  ← Dashboard principal
├── /ui/modules          ← Lista de módulos
├── /ui/todo-list        ← Vista del módulo todo-list
│   ├── /list            ← Vista tabla
│   ├── /create          ← Vista formulario
│   └── /detail/:id      ← Vista detalle
```

**Componentes:**
1. **UI Gateway** - Renderiza vistas desde JSON
2. **Module UI Config** - Sección `ui` en `module.json`
3. **View Types** - table, form, detail, dashboard, custom
4. **Actions** - Botones y operaciones CRUD
5. **Validators** - Validación en cliente (desde schemas)

---

## ⚙️ 2. Fases de implementación

### **Fase 1 — Vista de tabla (list)**

**Objetivo:** Mostrar datos en tabla con paginación, búsqueda y acciones.

1. **Agregar sección `ui` en `module.json`**:
```json
{
  "name": "todo-list",
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
              "confirm": "Are you sure you want to delete this TODO?"
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
      }
    }
  }
}
```

2. **Acceder a la vista**:
   - URL: `http://localhost:3000/ui/todo-list`
   - La vista se genera automáticamente desde la config

3. **Personalizar tabla**:
   - Columnas configurables
   - Ordenamiento por columna
   - Búsqueda en tiempo real
   - Paginación automática

**Complejidad:** 5 Story Points
**Tiempo estimado:** 2-3 horas

---

### **Fase 2 — Vista de formulario (create/edit)**

**Objetivo:** Crear y editar registros con validación.

1. **Agregar vista de formulario**:
```json
{
  "ui": {
    "views": {
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
          },
          {
            "name": "tags",
            "label": "Tags",
            "type": "multiselect",
            "options": [
              { "value": "work", "label": "Work" },
              { "value": "personal", "label": "Personal" },
              { "value": "urgent", "label": "Urgent" }
            ]
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
      }
    }
  }
}
```

2. **Tipos de campos disponibles**:
   - `text` - Input de texto
   - `textarea` - Área de texto multilínea
   - `number` - Input numérico
   - `email` - Input de email con validación
   - `password` - Input de contraseña
   - `date` - Selector de fecha
   - `datetime` - Selector de fecha y hora
   - `time` - Selector de hora
   - `select` - Dropdown de selección única
   - `multiselect` - Dropdown de selección múltiple
   - `radio` - Radio buttons
   - `checkbox` - Checkbox
   - `toggle` - Toggle switch
   - `file` - Upload de archivos
   - `color` - Selector de color
   - `range` - Slider de rango

3. **Validación automática**:
   - Validación en cliente desde schemas
   - Validación en servidor automática
   - Mensajes de error inline

**Complejidad:** 8 Story Points
**Tiempo estimado:** 4-5 horas

---

### **Fase 3 — Vista de detalle (detail)**

**Objetivo:** Mostrar detalles completos de un registro.

```json
{
  "ui": {
    "views": {
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
      }
    }
  }
}
```

**Complejidad:** 5 Story Points
**Tiempo estimado:** 2-3 horas

---

### **Fase 4 — Dashboard personalizado**

**Objetivo:** Vista dashboard con widgets y métricas.

```json
{
  "ui": {
    "views": {
      "dashboard": {
        "type": "dashboard",
        "title": "TODO Dashboard",
        "widgets": [
          {
            "type": "stat",
            "title": "Total TODOs",
            "endpoint": "/modules/todo-list/stats/total",
            "valueKey": "total",
            "icon": "check-square",
            "color": "blue"
          },
          {
            "type": "stat",
            "title": "Completed",
            "endpoint": "/modules/todo-list/stats/completed",
            "valueKey": "completed",
            "icon": "check",
            "color": "green"
          },
          {
            "type": "stat",
            "title": "Pending",
            "endpoint": "/modules/todo-list/stats/pending",
            "valueKey": "pending",
            "icon": "clock",
            "color": "orange"
          },
          {
            "type": "chart",
            "chartType": "line",
            "title": "TODOs Created Over Time",
            "endpoint": "/modules/todo-list/stats/created-over-time",
            "xKey": "date",
            "yKey": "count",
            "width": "full"
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

**Complejidad:** 13 Story Points
**Tiempo estimado:** 1-2 días

---

## 🧠 3. Buenas prácticas (Best Practices)

✅ **Nomenclatura clara** en labels y títulos
✅ **Iconos descriptivos** usando [Lucide Icons](https://lucide.dev/)
✅ **Validación consistente** con schemas JSON Schema
✅ **Mensajes claros** de éxito/error
✅ **Confirmaciones** en acciones destructivas
✅ **Redirecciones** después de operaciones
✅ **Responsive design** automático
✅ **Accesibilidad** (ARIA labels automáticos)
✅ **Loading states** automáticos
✅ **Error handling** con mensajes útiles

---

## 📋 4. Checklist de entrega

**Configuración:**
- [ ] Agregar sección `ui` en `module.json`
- [ ] Definir título, icono, descripción del módulo
- [ ] Configurar vistas necesarias

**Vistas:**
- [ ] Vista `list` (tabla) funcional
- [ ] Vista `create` (formulario) funcional
- [ ] Vista `edit` (formulario) funcional
- [ ] Vista `detail` (detalle) funcional
- [ ] (Opcional) Vista `dashboard`

**Funcionalidad:**
- [ ] Navegación entre vistas funciona
- [ ] Acciones CRUD funcionan
- [ ] Validación en formularios funciona
- [ ] Mensajes de éxito/error se muestran
- [ ] Confirmaciones en acciones destructivas

**UX:**
- [ ] Interfaz responsive
- [ ] Loading states visibles
- [ ] Errores se manejan gracefully
- [ ] Navegación intuitiva

---

## ⚡ 5. Pruebas de UI

```bash
# 1. Iniciar el sistema
npm start

# 2. Acceder a la UI
open http://localhost:3000/ui

# 3. Navegar a módulo
# Click en "TODO List" → Ver tabla

# 4. Crear TODO
# Click "New TODO" → Llenar formulario → Submit

# 5. Ver detalle
# Click en fila → Ver detalle completo

# 6. Editar TODO
# Click "Edit" → Modificar → Save

# 7. Eliminar TODO
# Click "Delete" → Confirmar
```

---

## 🧭 6. Formato de salida esperado

1. **Resumen de vistas creadas**
   - Lista de vistas implementadas
   - Endpoints que alimentan cada vista

2. **Capturas de pantalla** (opcional)
   - Vista de tabla
   - Vista de formulario
   - Vista de detalle

3. **URLs de acceso**
   - URL de dashboard
   - URL de cada vista

---

## 📚 Referencias

- `docs/UI_DEVELOPER_GUIDE.md` - Guía completa de UI
- `docs/UI_SYSTEM_DESIGN.md` - Diseño del sistema UI
- `core/ui-gateway/` - Implementación del UI Gateway
- [Lucide Icons](https://lucide.dev/) - Catálogo de iconos

---

**Versión:** 1.0.0
**Última actualización:** 2025-01-14
**Autor:** Event Core Team
