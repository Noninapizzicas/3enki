# Manual de Uso - UI Designer

## Descripción General

El **UI Designer** es un módulo visual de Event-Core que permite diseñar interfaces de usuario mediante drag & drop. Permite crear vistas, modales, formularios, dashboards y componentes reutilizables sin escribir código.

---

## Acceso al Módulo

### URL de Acceso
```
http://localhost:5173/ui-designer
```

### Desde el Menú
El módulo aparece en el menú lateral con el icono 🎨 y la etiqueta "UI Designer".

---

## Interfaz Principal

### Lista de Templates

Al acceder al módulo, se muestra una lista de todos los templates creados en formato de tarjetas (grid).

#### Filtros Disponibles
| Filtro | Descripción |
|--------|-------------|
| **Búsqueda** | Buscar por nombre o descripción |
| **Tipo** | view, modal, form, dashboard, component, page |
| **Estado** | draft, published, archived |

#### Acciones en Lista
- **+ Nuevo Template**: Crear template desde cero
- **📋 Desde Plantilla**: Crear desde template predefinido
- **Editar**: Abrir en el editor visual
- **📋 Duplicar**: Crear copia del template
- **🗑️ Eliminar**: Eliminar template

---

## Crear un Template

### Opción 1: Nuevo Template

1. Clic en **"+ Nuevo Template"**
2. Completar el formulario:
   - **Nombre para mostrar**: Nombre legible (ej: "Dashboard de Ventas")
   - **Nombre técnico**: Auto-generado en kebab-case (ej: "dashboard-de-ventas")
   - **Tipo**: Seleccionar el tipo de interfaz
   - **Icono**: Emoji representativo
   - **Categoría**: Clasificación del template
   - **Descripción**: Descripción opcional
3. Clic en **"Crear y Editar"**

### Opción 2: Desde Plantilla Predefinida

1. Clic en **"📋 Desde Plantilla"**
2. Seleccionar una plantilla:
   - **Dashboard Básico**: Stats y tabla de datos
   - **Formulario CRUD**: Formulario crear/editar
   - **Chat con IA**: Interfaz de conversación
   - **Lista con Filtros**: Lista con búsqueda y paginación
3. Clic en **"Crear desde Plantilla"**

---

## Editor Visual

El editor tiene 3 paneles principales:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Header/Toolbar                          │
├──────────┬────────────────────────────────────┬─────────────────┤
│          │                                    │                 │
│ Paleta   │            Canvas                  │  Propiedades    │
│   de     │                                    │                 │
│Componentes│                                   │                 │
│          │                                    │                 │
│  (264px) │          (flexible)                │    (320px)      │
│          │                                    │                 │
└──────────┴────────────────────────────────────┴─────────────────┘
```

### Panel Izquierdo: Paleta de Componentes

Componentes organizados por categoría:

#### 📐 Layout
| Componente | Descripción |
|------------|-------------|
| `header` | Encabezado con título y subtítulo |
| `card` | Tarjeta contenedora |
| `section` | Sección con título |
| `sidebar` | Barra lateral |
| `footer` | Pie de página |
| `panel` | Panel con cabecera |

#### 📊 Data
| Componente | Descripción |
|------------|-------------|
| `table` | Tabla de datos con paginación |
| `stat-card` | Tarjeta de estadística |
| `list` | Lista de items |
| `grid` | Grid de elementos |
| `tree` | Vista jerárquica |
| `chart` | Gráfico de barras |
| `event-stream` | Flujo de eventos en tiempo real |

#### 📝 Form
| Componente | Descripción |
|------------|-------------|
| `form` | Contenedor de formulario |
| `input` | Campo de texto |
| `textarea` | Área de texto multilínea |
| `select` | Selector desplegable |
| `checkbox` | Casilla de verificación |
| `radio` | Botones de opción |
| `file-upload` | Carga de archivos |
| `date-picker` | Selector de fecha |

#### 💬 Feedback
| Componente | Descripción |
|------------|-------------|
| `modal` | Ventana modal |
| `alert` | Mensaje de alerta |
| `toast` | Notificación emergente |
| `spinner` | Indicador de carga |
| `progress` | Barra de progreso |
| `skeleton` | Placeholder de carga |

#### 🧭 Navigation
| Componente | Descripción |
|------------|-------------|
| `tabs` | Pestañas de navegación |
| `breadcrumb` | Migas de pan |
| `pagination` | Paginación |
| `menu` | Menú de navegación |

#### ⚡ Actions
| Componente | Descripción |
|------------|-------------|
| `button` | Botón de acción |
| `button-group` | Grupo de botones |
| `dropdown` | Menú desplegable |

#### 🤖 AI
| Componente | Descripción |
|------------|-------------|
| `chat-input` | Campo de entrada para chat |
| `conversation-panel` | Panel de conversación |
| `prompt-selector` | Selector de prompts |

#### 🧩 Custom
| Componente | Descripción |
|------------|-------------|
| `custom` | Componente personalizado |
| `slot` | Área para contenido dinámico |

### Panel Central: Canvas

#### Agregar Componentes
1. **Arrastrar**: Arrastrar componente desde la paleta al canvas
2. **Soltar**: Soltar en el área del canvas

#### Gestionar Componentes
- **Clic**: Seleccionar componente
- **↑ / ↓**: Mover arriba/abajo en la lista
- **×**: Eliminar componente

### Panel Derecho: Propiedades

Al seleccionar un componente, aparecen sus propiedades editables:

#### Propiedades Comunes
| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `label` | texto | Etiqueta visible |
| `title` | texto | Título del componente |
| `variant` | select | Variante visual (primary, secondary, etc.) |
| `size` | select | Tamaño (sm, md, lg) |
| `color` | select | Color temático |

#### Configuración del Template
Cuando no hay componente seleccionado:
- **Layout**: Tipo de distribución
- **Descripción**: Descripción del template

---

## Modos de Vista

El editor ofrece 3 modos de visualización:

| Modo | Descripción |
|------|-------------|
| **📝 Editor** | Solo canvas de edición |
| **⬛ Split** | Canvas + Preview lado a lado |
| **👁️ Preview** | Solo preview del resultado |

### Dispositivos de Preview
En modo Split o Preview, seleccionar dispositivo:
- **🖥️ Desktop**: Ancho completo
- **📱 Tablet**: 768px × 1024px
- **📲 Mobile**: 375px × 667px

---

## Acciones del Template

### Toolbar Superior

| Acción | Descripción |
|--------|-------------|
| **← Volver** | Regresar a la lista |
| **💾 Guardar** | Guardar cambios (auto-save cada 3s) |
| **📤 Exportar** | Exportar a diferentes formatos |
| **✅ Publicar** | Cambiar estado a "published" |
| **📦 Archivar** | Cambiar estado a "archived" |

### Estados del Template

```
draft → published → archived
  │         │           │
  └─────────┴───────────┘
       (puede volver)
```

| Estado | Descripción |
|--------|-------------|
| **draft** | En desarrollo, editable |
| **published** | Publicado, listo para usar |
| **archived** | Archivado, oculto |

---

## Exportación

### Formatos Disponibles

#### 1. YAML Blueprint
Genera un archivo YAML compatible con el sistema de blueprints:
```yaml
name: mi-dashboard
description: Dashboard de ejemplo
version: 1.0.0
components:
  - id: header
    component: header
    props:
      title: "Mi Dashboard"
```

#### 2. Código Svelte
Genera un componente Svelte listo para usar:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { Header } from '$components/layout';
  // ...
</script>

<div class="p-6">
  <Header title="Mi Dashboard" />
</div>
```

#### 3. JSON (module.json)
Genera la sección `ui` para un module.json:
```json
{
  "enabled": true,
  "version": "2.0",
  "title": "Mi Dashboard",
  "views": {
    "main": {
      "type": "dashboard",
      "sections": [...]
    }
  }
}
```

### Proceso de Exportación
1. Clic en **"📤 Exportar"**
2. Seleccionar formato (YAML, Svelte, JSON)
3. Revisar el código generado
4. Clic en **"📋 Copiar"** para copiar al portapapeles

---

## Layouts Disponibles

| Layout | Descripción | Icono |
|--------|-------------|-------|
| `single-column` | Una sola columna | ▐ |
| `two-column` | Dos columnas iguales | ▐▐ |
| `three-column` | Tres columnas | ▐▐▐ |
| `grid` | Grid responsive | ⊞ |
| `tabs` | Contenido en pestañas | ☰ |
| `sidebar` | Sidebar + contenido | ▌▐ |
| `split` | Vista dividida | ◧ |
| `kanban` | Tablero Kanban | ▥ |

---

## API REST

### Base URL
```
/api/modules/ui-designer
```

### Endpoints

#### Templates
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/templates` | Listar templates |
| POST | `/templates` | Crear template |
| GET | `/templates/:id` | Obtener template |
| PUT | `/templates/:id` | Actualizar template |
| DELETE | `/templates/:id` | Eliminar template |
| POST | `/templates/:id/duplicate` | Duplicar |
| POST | `/templates/:id/publish` | Publicar |
| POST | `/templates/:id/archive` | Archivar |

#### Componentes
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/components` | Listar componentes |
| GET | `/components/:name` | Schema de componente |

#### Layouts
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/layouts` | Listar layouts |
| GET | `/layouts/:type` | Configuración de layout |

#### Predefinidos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/predefined` | Templates predefinidos |
| POST | `/predefined/create` | Crear desde predefinido |

#### Exportación
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/export/yaml` | Exportar como YAML |
| POST | `/export/svelte` | Exportar como Svelte |
| POST | `/export/json` | Exportar como JSON |

#### Health
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Estado del módulo |

---

## Ejemplos de Uso

### Ejemplo 1: Dashboard Simple

1. Crear nuevo template tipo "Dashboard"
2. Agregar componentes:
   - `header` con título "Panel de Control"
   - 3x `stat-card` para métricas
   - `table` para datos principales
3. Configurar propiedades de cada stat-card:
   - label: "Usuarios", "Ventas", "Eventos"
   - value: "1,234", "$5,678", "890"
   - icon: "👥", "💰", "📊"
4. Guardar y publicar

### Ejemplo 2: Formulario de Contacto

1. Crear template tipo "Form"
2. Agregar:
   - `header` con título "Contacto"
   - `input` para nombre
   - `input` tipo email
   - `textarea` para mensaje
   - `button` para enviar
3. Configurar validaciones y labels
4. Exportar como Svelte

### Ejemplo 3: Chat con IA

1. Usar plantilla predefinida "Chat con IA"
2. Personalizar:
   - Título del header
   - Mensaje de bienvenida
   - Placeholder del input
3. Ajustar colores si es necesario
4. Publicar

---

## Atajos de Teclado

| Atajo | Acción |
|-------|--------|
| `Ctrl+S` | Guardar (auto-save activo) |
| `Delete` | Eliminar componente seleccionado |
| `Esc` | Deseleccionar componente |

---

## Persistencia de Datos

Los templates se almacenan en:
```
modules/ui-designer/data/templates.json
```

Formato del archivo:
```json
{
  "version": "1.0.0",
  "templates": [...],
  "metadata": {
    "saved_at": "2024-01-15T10:30:00.000Z",
    "count": 5
  }
}
```

---

## Eventos del Sistema

El módulo emite eventos para integración con otros módulos:

| Evento | Descripción |
|--------|-------------|
| `ui-designer.template.created` | Template creado |
| `ui-designer.template.updated` | Template actualizado |
| `ui-designer.template.deleted` | Template eliminado |
| `ui-designer.template.published` | Template publicado |
| `ui-designer.export.yaml` | Exportado a YAML |
| `ui-designer.export.svelte` | Exportado a Svelte |
| `ui-designer.export.json` | Exportado a JSON |

---

## Solución de Problemas

### El componente no aparece en el canvas
- Verificar que el drag & drop se completó correctamente
- Refrescar la página si persiste

### Los cambios no se guardan
- Verificar conexión con el backend
- El auto-save ocurre cada 3 segundos
- Usar botón "Guardar" manualmente

### El preview no se actualiza
- Cambiar a modo Split o Preview
- El preview se actualiza en tiempo real via postMessage

### Error al exportar
- Verificar que el template tenga al menos un componente
- Revisar la consola del navegador para errores

---

## Versión

- **Módulo**: ui-designer v1.0.0
- **Última actualización**: 2024
