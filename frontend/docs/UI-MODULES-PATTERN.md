# Patrón de Módulos UI - Event Core

## Principio Simplificado

**1 módulo = 1 panel = 1 tap**

No hay múltiples paneles ni gestos complicados. Cada módulo tiene UN panel que contiene todo lo necesario.

---

## Interacción

| Gesto | Acción |
|-------|--------|
| **TAP / Click** | Abre el panel del módulo |

**NO usamos:**
- ❌ Doble tap
- ❌ Long press / click derecho
- ❌ Múltiples paneles por módulo

---

## Estructura del Panel Único

Cada panel de módulo sigue esta estructura:

```
┌─────────────────────────────────────────┐
│  🔍 [Búsqueda...]              [+ Nuevo]│  ← Header fijo
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🟢 Proyecto 1        [✏️] [🗑️] │    │  ← Items con acciones inline
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ 🔵 Proyecto 2        [✏️] [🗑️] │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ 🟣 Proyecto 3   ✓    [✏️] [🗑️] │    │  ← ✓ indica activo
│  └─────────────────────────────────┘    │
│                                         │
│  [Scroll si hay más items...]           │
│                                         │
├─────────────────────────────────────────┤
│  [Form crear nuevo - expandible]        │  ← Se muestra al clicar [+ Nuevo]
└─────────────────────────────────────────┘
```

---

## Componentes del Panel

### 1. Header (fijo arriba)
- Búsqueda/filtro
- Botón [+ Nuevo] para expandir form de creación

### 2. Lista con scroll
- Items del módulo
- Cada item tiene:
  - Indicador visual (color, icono)
  - Nombre/título
  - Estado (activo, seleccionado)
  - **Botones inline**: editar, eliminar (aparecen en hover o siempre visibles en móvil)

### 3. Form crear (expandible)
- Se muestra al clicar [+ Nuevo]
- Campos necesarios
- Botones: Cancelar, Guardar
- Se colapsa al guardar o cancelar

### 4. Edición inline
- Al clicar ✏️ el item entra en modo edición
- Input reemplaza el texto
- Botones: ✓ Guardar, ✕ Cancelar

---

## Acciones por Item

| Acción | UI | Comportamiento |
|--------|-----|----------------|
| **Seleccionar** | Click en el item | Selecciona y cierra panel |
| **Editar** | Click en ✏️ | Modo edición inline |
| **Eliminar** | Click en 🗑️ | Confirmación + elimina |

---

## Ejemplo: project-manager

```
┌─────────────────────────────────────────┐
│  🔍 Buscar proyecto...         [+ Nuevo]│
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ ▌🟢 Mi Proyecto        [✏️][🗑️]│    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ ▌🔵 Otro Proyecto  ✓   [✏️][🗑️]│    │  ← Activo
│  └─────────────────────────────────┘    │
│                                         │
├─────────────────────────────────────────┤
│  [+ Nuevo] expandido:                   │
│  ┌─────────────────────────────────┐    │
│  │ Nombre: [________________]      │    │
│  │ Color:  🟢🔵🟣🟠🔴🟡            │    │
│  │         [Cancelar] [Crear]      │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

## Módulos y sus Paneles

| Módulo | Panel | Zona | Funciones |
|--------|-------|------|-----------|
| project-manager | ProjectPanel | chat-config | CRUD proyectos |
| ai-gateway | ProviderPanel | chat-config | Seleccionar provider/modelo |
| credential-manager | CredentialsPanel | chat-config | CRUD credenciales |
| prompt-manager | PromptsPanel | chat-config | CRUD prompts |
| conversation-manager | HistoryPanel | system-bar | Ver/cargar conversaciones |
| file-browser | FilesPanel | work-bar | Navegar archivos |
| text-editor | EditorPanel | work-bar | Editar archivos |
| pdf-viewer | PdfPanel | work-bar | Ver PDFs |

---

## Reglas de Implementación

### 1. Un archivo por panel
```
modules/{modulo}/
├── index.ts           # Registro del módulo
└── {Modulo}Panel.svelte  # Panel único
```

### 2. API desde el panel
- GET para listar
- POST para crear
- PUT para actualizar
- DELETE para eliminar
- El panel maneja todo internamente

### 3. Cerrar panel
- Al seleccionar un item → cierra
- Click fuera → cierra
- ESC → cierra
- Al crear exitosamente → NO cierra (permite crear más)

### 4. Estados
- `loading`: Cargando datos
- `error`: Error con retry
- `empty`: Sin items
- `editing`: Item en edición

---

## CSS Variables

Los paneles usan variables CSS del tema:

```css
--color-bg: #121212;
--color-surface: rgba(255, 255, 255, 0.05);
--color-border: rgba(255, 255, 255, 0.1);
--color-text: #e5e5e5;
--color-text-muted: #888;
--color-primary: #3b82f6;
--color-error: #ef4444;
--color-success: #22c55e;
```

---

## Resumen

```
ANTES (complejo):
- 3 paneles por módulo (Select, Add, Config)
- 3 gestos (tap, doble-tap, long-press)
- Flujo fragmentado

AHORA (simple):
- 1 panel por módulo
- 1 gesto (tap)
- Todo en un lugar con scroll
- Acciones inline (editar, eliminar)
```

---

*Última actualización: Diciembre 2024*
