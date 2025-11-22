# 🎨 TEMPLATE: Cómo Crear UIs Correctamente

**Basado en:** Sistema JSON-Driven de `ui-components/`

**Status:** Este es EL estándar. TODAS las UIs deben seguir este template.

---

## 🎯 PRINCIPIOS NO NEGOCIABLES

### 1. ✅ 100% JSON-Driven

**SÍ:**
```json
{
  "component": "grid-cuentas",
  "config": {
    "columns": 2,
    "endpoint": "/modules/cuentas/cuentas",
    "mqtt_topics": ["cuenta.creada", "cuenta.actualizada"]
  }
}
```

**NO:**
```html
<!-- ❌ NUNCA hacer esto -->
<div class="grid">
  <button onclick="createCuenta()">Crear</button>
</div>
```

### 2. ✅ Componentes Reutilizables

**TODO debe estar en `ui-components/`:**
- Botones → `button.component.json`
- Grids → `grid-*.component.json`
- Formularios → `form.component.json`
- Cards → `card.component.json`

### 3. ✅ Configuración en `module.json`

**El módulo define su UI:**

```json
{
  "ui": {
    "enabled": true,
    "title": "Gestión de Cuentas",
    "icon": "📋",
    "components": ["grid-cuentas", "cuenta-button"],
    "views": {
      "main": {
        "type": "grid",
        "component": "grid-cuentas"
      }
    }
  }
}
```

### 4. ✅ UI Renderer hace el trabajo

**NO escribes HTML/CSS/JS. El sistema lo genera automáticamente.**

### 5. ✅ Real-time via MQTT

```json
{
  "mqtt_topics": [
    "cuenta.creada",
    "cuenta.actualizada",
    "cuenta.eliminada"
  ],
  "refresh_on_event": true
}
```

---

## 📁 ESTRUCTURA DE ARCHIVOS

```
event-core/
├── modules/[MODULO]/
│   ├── module.json          # Define la UI aquí
│   └── index.js             # Backend event-driven
│
├── ui-components/
│   └── [componente].component.json   # Componentes reutilizables
│
└── ui/                      # ⚠️ NO TOCAR - Generado automáticamente
    └── [vista]/
```

**IMPORTANTE:** La carpeta `ui/` es generada automáticamente. NUNCA edites archivos ahí directamente.

---

## 📋 CHECKLIST DE CREACIÓN UI

### Paso 1: Definir UI en `module.json`

```json
{
  "name": "mi-modulo",
  "version": "1.0.0",

  "ui": {
    "enabled": true,
    "title": "Mi Módulo",
    "icon": "📦",
    "components": ["grid-items", "item-button"],

    "views": {
      "main": {
        "type": "grid",
        "component": "grid-items",
        "config": {
          "endpoint": "/modules/mi-modulo/items",
          "mqtt_topics": ["item.creado", "item.actualizado"],
          "refresh_on_event": true
        }
      },

      "create": {
        "type": "form",
        "component": "form",
        "config": {
          "endpoint": "/modules/mi-modulo/items",
          "method": "POST",
          "fields": [
            {
              "name": "nombre",
              "type": "text",
              "label": "Nombre",
              "required": true
            }
          ]
        }
      }
    }
  }
}
```

### Paso 2: Crear Componentes JSON (si no existen)

#### Ejemplo: `ui-components/grid-items.component.json`

```json
{
  "component": "grid-items",
  "version": "1.0.0",
  "description": "Grid para mostrar items",

  "config": {
    "type": "grid",
    "layout": {
      "columns": 2,
      "gap": "16px",
      "responsive": {
        "mobile": 1,
        "tablet": 2,
        "desktop": 2
      }
    }
  },

  "item_component": "item-button",

  "mqtt": {
    "enabled": true,
    "topics": [],
    "auto_refresh": true
  },

  "empty_state": {
    "icon": "📦",
    "title": "No hay items",
    "description": "Crea tu primer item"
  },

  "loading_state": {
    "type": "spinner",
    "message": "Cargando items..."
  }
}
```

#### Ejemplo: `ui-components/item-button.component.json`

```json
{
  "component": "item-button",
  "version": "1.0.0",
  "description": "Botón individual para item",

  "dimensions": {
    "width": "100%",
    "min_width": "120px",
    "height": "75px"
  },

  "layout": {
    "type": "flex",
    "direction": "column",
    "align": "center",
    "justify": "center"
  },

  "content": {
    "icon": {
      "position": "top-left",
      "size": "16px",
      "field": "tipo_emoji"
    },
    "title": {
      "field": "nombre",
      "font_size": "14px",
      "font_weight": "700"
    },
    "subtitle": {
      "field": "hora",
      "font_size": "11px"
    }
  },

  "states": {
    "default": {
      "background": "#667eea",
      "color": "#ffffff"
    },
    "hover": {
      "transform": "translateY(-2px)",
      "box_shadow": "0 8px 16px rgba(0,0,0,0.4)"
    },
    "active": {
      "transform": "scale(0.98)"
    }
  },

  "actions": {
    "onClick": {
      "type": "navigate",
      "url": "/ui/comandero?item_id={{id}}"
    }
  }
}
```

### Paso 3: El UI Renderer lo hace TODO

Una vez configurado:

1. El **UI Renderer** lee el `module.json`
2. Carga los componentes desde `ui-components/`
3. Genera el HTML/CSS/JS automáticamente
4. Conecta MQTT para real-time
5. Renderiza en `/ui/[vista]/`

**TÚ NO HACES NADA MÁS.**

---

## 🎨 COMPONENTES DISPONIBLES

### 1. **Grid Component**

```json
{
  "type": "grid",
  "component": "grid-[nombre]",
  "config": {
    "columns": 2,
    "endpoint": "/api/datos",
    "mqtt_topics": ["evento.creado"],
    "item_component": "nombre-button"
  }
}
```

### 2. **Button Component**

```json
{
  "component": "button",
  "content": {
    "icon": "🍕",
    "text": "Click Me"
  },
  "actions": {
    "onClick": {
      "type": "navigate",
      "url": "/destino"
    }
  }
}
```

### 3. **Form Component**

```json
{
  "type": "form",
  "config": {
    "endpoint": "/api/crear",
    "method": "POST",
    "fields": [
      {
        "name": "nombre",
        "type": "text",
        "label": "Nombre",
        "required": true
      }
    ]
  }
}
```

### 4. **Card Component**

```json
{
  "component": "card",
  "content": {
    "title": "Título",
    "body": "Contenido",
    "footer": "Footer"
  },
  "variant": "default"
}
```

---

## 🔌 INTEGRACIÓN MQTT AUTOMÁTICA

El sistema conecta MQTT automáticamente:

```json
{
  "mqtt_topics": [
    "cuenta.creada",
    "cuenta.actualizada",
    "cuenta.eliminada"
  ],
  "refresh_on_event": true,
  "update_strategy": "merge"
}
```

**Estrategias:**
- `merge` → Actualiza item existente
- `append` → Añade nuevo item
- `remove` → Elimina item
- `replace` → Reemplaza todo el grid

---

## ❌ ANTI-PATRONES (NO HACER)

### 1. Escribir HTML Manual

```html
<!-- ❌ MAL -->
<!DOCTYPE html>
<html>
<head>
  <style>
    .button { background: blue; }
  </style>
</head>
<body>
  <button class="button">Click</button>
</body>
</html>
```

**✅ BIEN:** Define componente en JSON, deja que el sistema lo renderice.

### 2. JavaScript Inline

```javascript
// ❌ MAL
<script>
function handleClick() {
  fetch('/api/crear').then(...);
}
</script>
```

**✅ BIEN:** Define acciones en el JSON del componente.

### 3. CSS Manual

```css
/* ❌ MAL */
.cuenta-btn {
  width: 124px;
  height: 75px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

**✅ BIEN:** Define estilos en el JSON del componente.

### 4. Duplicar Componentes

```json
// ❌ MAL - Crear button.component.json para cada módulo
modules/modulo1/components/button.json
modules/modulo2/components/button.json
```

**✅ BIEN:** Un solo componente reutilizable en `ui-components/button.component.json`

### 5. MQTT Manual

```javascript
// ❌ MAL
const mqtt = require('mqtt');
const client = mqtt.connect('ws://localhost:1884');
client.on('message', (topic, message) => { ... });
```

**✅ BIEN:** Configurar topics en JSON, el sistema conecta automáticamente.

---

## 🎨 DESIGN SYSTEM TOKENS

**Siempre usar tokens del design system:**

```json
{
  "colors": {
    "verde_accion": "#2FBF71",
    "ambar_pendiente": "#F5B700",
    "rojo_error": "#E63946",
    "azul_info": "#1D4ED8",
    "gris_base": "#6B7280",
    "gris_fondo": "#0F1216"
  },

  "espaciado": {
    "xs": "4px",
    "sm": "8px",
    "md": "12px",
    "lg": "16px"
  },

  "touch_target": {
    "min_width": "56px",
    "min_height": "56px"
  }
}
```

**Referencia:** `ui-components/README.md`

---

## 🧪 EJEMPLOS COMPLETOS

### Ejemplo 1: Vista de Listado + Creación

**`module.json`:**

```json
{
  "name": "productos",
  "ui": {
    "enabled": true,
    "title": "Productos",
    "icon": "🍕",
    "components": ["grid-productos", "producto-button"],

    "views": {
      "main": {
        "layout": "sidebar-content",

        "sidebar": {
          "type": "action-bar",
          "buttons": [
            {
              "component": "button",
              "content": {"icon": "🍕", "text": "Nueva Pizza"},
              "actions": {
                "onClick": {"type": "navigate", "url": "/ui/productos/create"}
              }
            }
          ]
        },

        "content": {
          "type": "grid",
          "component": "grid-productos",
          "config": {
            "endpoint": "/modules/productos/productos",
            "mqtt_topics": ["producto.creado", "producto.actualizado"]
          }
        }
      }
    }
  }
}
```

### Ejemplo 2: Vista con Estados Dinámicos

**`ui-components/producto-button.component.json`:**

```json
{
  "component": "producto-button",

  "states": {
    "disponible": {
      "background": "#2FBF71",
      "icon": "✓"
    },
    "agotado": {
      "background": "#E63946",
      "icon": "✗"
    },
    "preparando": {
      "background": "#F5B700",
      "icon": "⏳"
    }
  },

  "state_field": "estado",

  "content": {
    "title": {"field": "nombre"},
    "price": {"field": "precio", "format": "currency"}
  }
}
```

---

## ✅ VALIDACIÓN FINAL

Antes de considerar tu UI terminada, verifica:

- [ ] **100% JSON:** CERO código HTML/CSS/JS manual
- [ ] **Componentes:** Definidos en `ui-components/`
- [ ] **Configuración:** `module.json` tiene sección `ui` completa
- [ ] **MQTT:** Topics configurados para real-time
- [ ] **Design tokens:** Usa colores/espaciado del sistema
- [ ] **Touch targets:** Botones mínimo 56x56px
- [ ] **Responsive:** Layout adaptable a mobile/tablet/desktop
- [ ] **Empty state:** Definido para cuando no hay datos
- [ ] **Loading state:** Definido para carga inicial
- [ ] **Reutilizable:** Componentes usables por otros módulos

---

## 🎓 REFERENCIAS

**Componentes de ejemplo:**
- `ui-components/grid-cuentas.component.json`
- `ui-components/cuenta-button.component.json`
- `ui-components/button.component.json`

**Documentación:**
- `ui-components/README.md` - Filosofía JSON-Driven
- `TEMPLATE_MODULO.md` - Template para backend
- `modules/cuentas/module.json` - Ejemplo de configuración UI

**Prompts:**
- `prompts/tutoriales/prompt_crear_componente_ui.md`

---

## 🚀 FLUJO DE TRABAJO

1. **Diseñar** la UI en papel/Figma
2. **Identificar** componentes necesarios
3. **Verificar** si ya existen en `ui-components/`
4. **Crear** componentes JSON si no existen
5. **Configurar** `module.json` con la UI
6. **Arrancar** el sistema - UI Renderer hace el resto
7. **Probar** en navegador

**NO escribes código. Solo JSON.**

---

## 💡 FILOSOFÍA

> "Si estás escribiendo HTML, CSS o JavaScript manual, estás haciendo algo mal."

- **Declarativo** sobre imperativo
- **Configuración** sobre código
- **Reutilización** sobre duplicación
- **JSON** sobre todo

---

## ⚡ QUICK START

```bash
# 1. Crear componente JSON
vi ui-components/mi-componente.component.json

# 2. Configurar UI en module.json
vi modules/mi-modulo/module.json

# 3. Arrancar el sistema
node index.js

# 4. Abrir navegador
# http://localhost:3000/ui/mi-vista
```

**Eso es todo. El sistema hace el resto.**

---

**Si tu UI no pasa esta validación, NO está completa.**

**Versión:** 1.0.0
**Basado en:** Sistema JSON-Driven de `ui-components/`
**Autor:** Pizzepos Team

---

## 📞 SOPORTE

Si tienes dudas:
1. Lee `ui-components/README.md`
2. Revisa ejemplos en `ui-components/*.component.json`
3. Consulta `modules/cuentas/module.json`

**¡Ahora ve y crea UIs hermosas... sin escribir código!** 🎨✨
