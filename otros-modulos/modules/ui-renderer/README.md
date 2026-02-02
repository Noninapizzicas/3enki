# UI Renderer Module

**Motor de renderizado automático de UIs desde configuración JSON**

## 📋 Descripción

El UI Renderer es el componente clave que hace funcionar el sistema JSON-Driven de Pizzepos. Lee las configuraciones de UI de los módulos y genera HTML/CSS/JS automáticamente.

## 🎯 Funcionamiento

1. **Carga componentes** desde `/ui-components/*.component.json`
2. **Lee configuraciones UI** de todos los `module.json` que tengan `ui.enabled = true`
3. **Genera HTML** basado en layouts y componentes
4. **Inyecta código MQTT** para actualizaciones en tiempo real
5. **Sirve el HTML** cuando se accede a `/modules/ui-renderer/ui/:module/:view`

## 🔌 APIs

### `GET /ui/:module/:view?`

Renderiza una vista de un módulo.

**Ejemplo:**
```bash
GET /modules/ui-renderer/ui/cuentas/main
```

**Response:** HTML generado automáticamente

### `GET /component/:name`

Obtiene la definición de un componente.

**Ejemplo:**
```bash
GET /modules/ui-renderer/component/cuenta-button
```

### `POST /component/:name/render`

Renderiza un componente con datos específicos.

### `GET /components`

Lista todos los componentes disponibles.

## 📦 Componentes Cargados

El renderer carga automáticamente todos los archivos `.component.json` desde `/ui-components/`:

- `cuenta-button.component.json`
- `cuenta-type-button.component.json`
- `grid-cuentas.component.json`
- `button.component.json`
- `card.component.json`
- Etc.

## 🎨 Layouts Soportados

### `sidebar-content`

Layout con barra lateral izquierda y contenido principal.

```json
{
  "layout": "sidebar-content",
  "sidebar": { ... },
  "content": { ... }
}
```

### `full-width`

Layout de ancho completo.

```json
{
  "layout": "full-width",
  "content": { ... }
}
```

## 🚀 Ejemplo de Uso

### En el `module.json` de tu módulo:

```json
{
  "name": "mi-modulo",
  "ui": {
    "enabled": true,
    "title": "Mi Módulo",
    "icon": "📦",
    "components": ["grid-items", "item-button"],
    "views": {
      "main": {
        "layout": "sidebar-content",
        "sidebar": {
          "sections": [
            {
              "title": "Acciones",
              "buttons": [
                {
                  "component": "button",
                  "icon": "➕",
                  "label": "Nuevo Item"
                }
              ]
            }
          ]
        },
        "content": {
          "type": "grid",
          "component": "grid-items",
          "config": {
            "endpoint": "/modules/mi-modulo/items",
            "mqtt_topics": ["item.creado", "item.actualizado"]
          }
        }
      }
    }
  }
}
```

### Acceder a la UI:

```
http://localhost:3000/modules/ui-renderer/ui/mi-modulo/main
```

El renderer generará automáticamente todo el HTML/CSS/JS necesario.

## 📡 Integración MQTT

El renderer inyecta automáticamente el código necesario para conectarse a MQTT y recibir actualizaciones en tiempo real basándose en los `mqtt_topics` configurados.

## 🎓 Filosofía

> "El renderer convierte JSON en UIs funcionales. No debes escribir HTML nunca."

- **Declarativo**: Defines QUÉ quieres, no CÓMO
- **Automático**: El renderer se encarga del resto
- **Consistente**: Todas las UIs siguen el mismo patrón

## 📊 Métricas

- `ui.rendered.total` - Total de UIs renderizadas
- `ui.render_error.total` - Total de errores
- `components.loaded.count` - Componentes cargados
- `ui.render.duration` - Tiempo de renderizado

## ✅ Validación

Antes de arrancar, el renderer valida:
- Que existan los componentes referenciados
- Que la configuración del módulo sea válida
- Que los layouts sean soportados

## 🔮 Próximas Mejoras

- [ ] Cache de UIs renderizadas
- [ ] Hot-reload cuando cambian componentes
- [ ] Renderizado más sofisticado de componentes
- [ ] Soporte para más layouts
- [ ] Temas personalizables

---

**Versión:** 1.0.0
**Autor:** Pizzepos Team
