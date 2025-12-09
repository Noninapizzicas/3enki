# Reglas de Código - Event Core

## Filosofía Base

Derivado de `CONTEXT.md` y `CONTEXT_UI.md`:

```
SIMPLICIDAD RADICAL     → Mínimo código necesario
CORE MINIMALISTA        → Solo infraestructura en core/
MODULARIDAD TOTAL       → Features como módulos independientes
API-FIRST               → Todo expuesto vía HTTP/MQTT
ZERO DEPENDENCIAS       → Solo lo esencial
PORTABLE                → Termux → Docker → K8s
COMPONENT-FIRST         → Máxima reutilización UI
```

---

## 1. Estructura de Archivos

### Backend (Módulos)

```
modules/{nombre}/
├── index.js          # Lógica del módulo (obligatorio)
├── module.json       # Configuración y eventos (obligatorio)
├── README.md         # Documentación
└── schemas/          # JSON Schemas (si tiene APIs)
    └── {entidad}.json
```

### Frontend (Componentes)

```
frontend/src/lib/components/
├── ui/               # Componentes base (Button, Input, Card...)
├── feedback/         # Feedback (Modal, Toast, FloatingPanel...)
├── layout/           # Layouts (Sidebar, Header...)
├── toolbar/          # Barras y botones (ToolbarIcon...)
├── ai/               # Componentes IA (ChatWorkspace...)
└── {dominio}/        # Componentes específicos de dominio
```

### Rutas

```
frontend/src/routes/
├── +layout.svelte    # Layout global
├── +page.svelte      # Home
└── {modulo}/         # Una carpeta por módulo con UI
    └── +page.svelte
```

---

## 2. Naming Conventions

| Tipo | Formato | Ejemplo |
|------|---------|---------|
| Módulo backend | kebab-case | `ai-gateway` |
| Archivo JS | kebab-case | `context-manager.js` |
| Componente Svelte | PascalCase | `FloatingPanel.svelte` |
| Store Svelte | camelCase | `mqttStore.ts` |
| Evento MQTT | dot.notation | `ai.model.selected` |
| Constante | UPPER_SNAKE | `EVENTS.AI.MODEL_SELECTED` |
| Variable/función | camelCase | `handleModelSelect` |
| Prop Svelte | camelCase | `selectedModelId` |
| CSS class | kebab-case | `floating-panel` |

---

## 3. Reglas de Módulos Backend

### module.json

```json
{
  "name": "nombre-modulo",
  "version": "1.0.0",
  "description": "Descripción clara y corta",
  "events": {
    "publishes": [
      { "event": "nombre-modulo.accion.completada", "description": "..." }
    ],
    "subscribes": [
      { "event": "otro.evento", "handler": "onOtroEvento" }
    ]
  },
  "api": {
    "prefix": "/nombre-modulo",
    "routes": []
  }
}
```

### index.js

```javascript
class NombreModulo {
  constructor(core) {
    this.core = core;
    this.eventBus = core.eventBus;
  }

  async initialize() {
    // Suscribirse a eventos
    // Registrar APIs
  }

  async shutdown() {
    // Limpieza
  }
}

module.exports = NombreModulo;
```

### Reglas:
- **Un módulo = Una responsabilidad**
- **Sin dependencias directas entre módulos** (solo eventos)
- **Usar constantes** para nombres de eventos
- **Validar inputs** con JSON Schema
- **Documentar APIs** en module.json

---

## 4. Reglas de Componentes Svelte

### Estructura de Componente

```svelte
<script lang="ts">
  // 1. Imports
  import { createEventDispatcher } from 'svelte';
  import Button from '$components/ui/Button.svelte';

  // 2. Props (interface primero)
  interface Props {
    value: string;
    disabled?: boolean;
  }
  export let value: Props['value'];
  export let disabled: Props['disabled'] = false;

  // 3. Estado local
  let isOpen = false;

  // 4. Dispatcher
  const dispatch = createEventDispatcher<{
    select: { id: string };
    close: void;
  }>();

  // 5. Funciones
  function handleSelect(id: string) {
    dispatch('select', { id });
  }
</script>

<!-- Template -->
<div class="component-name">
  ...
</div>

<style>
  /* Estilos con CSS variables de Tailwind */
</style>
```

### Reglas:
- **Props tipadas** con TypeScript
- **Eventos tipados** con `createEventDispatcher<T>`
- **CSS variables** heredables del padre
- **Sin lógica de negocio** en componentes UI base
- **Componentes pequeños** (<200 líneas ideal)

---

## 5. Reglas de Paneles Flotantes

### Patrón: 1-3 paneles por módulo

| Panel | Invocación | Propósito |
|-------|------------|-----------|
| Select | 1 tap / click | Ver y elegir |
| Add | 2 taps / doble click | Crear nuevo |
| Extra | Long press / click derecho | Config/gestión |

### Implementación

```svelte
<FloatingPanel bind:open={panelOpen} on:close={() => panelOpen = false}>
  <!-- Contenido define su estructura -->
  <header>Título</header>
  <SelectList {items} on:select={handleSelect} />
</FloatingPanel>
```

### Reglas:
- **Tap fuera = cerrar** (siempre)
- **ESC = cerrar** (siempre)
- **Sin navegación** dentro de paneles
- **Contenido autónomo** (panel no sabe qué contiene)

---

## 6. Reglas de APIs

### Endpoint UI State

Cada módulo con UI **DEBE** tener:

```
GET /modules/{nombre}/ui/state
```

Respuesta normalizada:

```json
{
  "items": [...],
  "selected": "id_actual",
  "stats": { ... },
  "config": { ... }
}
```

### Reglas:
- **UI State es read-only** (para mostrar)
- **Acciones via POST** a endpoints específicos
- **Respuestas consistentes** entre módulos
- **Sin lógica de UI** en el backend

---

## 7. Reglas de Eventos

### Nomenclatura

```
{modulo}.{entidad}.{accion}

Ejemplos:
- ai-gateway.model.selected
- credential.created
- prompt.deleted
- ui.panel.opened
```

### Payload

```javascript
{
  timestamp: Date.now(),
  source: 'nombre-modulo',
  data: { ... }
}
```

### Reglas:
- **Usar constantes** de `core/constants.js`
- **Payload mínimo** (solo datos necesarios)
- **No duplicar** información disponible en otros lugares

---

## 8. Reglas de Estilo (Tailwind)

### Fuente única

```
design-system/tokens.json → tailwind.config.js
```

### Uso de colores

```html
<!-- Bien -->
<div class="bg-bg-card text-text border-border">

<!-- Mal -->
<div class="bg-[#1a1d24] text-white border-gray-700">
```

### CSS Variables en componentes

```svelte
<style>
  .my-component {
    /* Heredar del padre */
    padding: var(--panel-padding, 1rem);
    background: var(--panel-bg, theme('colors.bg.card'));
  }
</style>
```

### Reglas:
- **No hardcodear colores** (usar tokens)
- **CSS variables** para personalización
- **Clases de Tailwind** para layout/spacing

---

## 9. Checklist por Módulo

Antes de crear UI para un módulo:

```
□ ¿Qué hace el módulo?
□ ¿Tiene persistencia? ¿Dónde?
□ ¿Qué endpoints existen?
□ ¿Necesita endpoint /ui/state?
□ ¿Qué elementos UI necesita?
□ ¿Cuántos paneles? (1-3)
  □ Panel Select
  □ Panel Add
  □ Panel Extra
```

---

## 10. Anti-patrones (NO hacer)

```
❌ Lógica de negocio en componentes UI
❌ Dependencias directas entre módulos
❌ Hardcodear colores/tamaños
❌ Componentes >300 líneas
❌ APIs sin validación
❌ Eventos sin constantes
❌ Navegación tradicional (páginas separadas)
❌ Modales que bloquean todo
❌ Estado global innecesario
```

---

## 11. Patrones Recomendados

```
✅ Componentes pequeños y enfocados
✅ Composición sobre herencia
✅ Eventos para comunicación
✅ CSS variables para theming
✅ Paneles flotantes contextuales
✅ API-first, UI consume
✅ Tipos TypeScript
✅ Validación con JSON Schema
```

---

## Resumen

```
CÓDIGO = Mínimo necesario + Máxima reutilización

BACKEND:
- Módulos independientes
- Comunicación por eventos
- APIs con /ui/state

FRONTEND:
- Componentes base reutilizables
- Paneles flotantes (no páginas)
- Tailwind desde tokens.json

SIEMPRE:
- Tipado
- Validación
- Documentación
```
