# UI System & Code Rules - Event Core

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

**UI:** No hay dashboard centralizado. Los módulos se usan en el contexto que se necesiten, invocados mediante paneles flotantes.

---

# PARTE 1: Sistema de UI

## Sistema de Paneles Flotantes

### Estructura por módulo

Cada módulo tiene **1-3 paneles** según necesidad:

| Panel | Propósito | Invocación PC | Invocación Móvil |
|-------|-----------|---------------|------------------|
| **Select** | Ver/elegir items | Click | Tap |
| **Add** | Crear nuevo | Doble click | Doble tap |
| **Extra** | Config/avanzado | Click derecho | Long press |

### Comportamiento

- Paneles aparecen flotantes sobre el workspace
- Click/tap fuera del panel → se cierra
- ESC → se cierra
- Sin navegación tradicional, todo contextual

---

## Componentes Base

### 1. ModuleButton

Botón que detecta tipo de interacción:

```svelte
<ModuleButton
  module="ai-gateway"
  icon="🤖"
  label="AI"
  on:select={openSelectPanel}
  on:add={openAddPanel}
  on:extra={openExtraPanel}
/>
```

Interacciones:
- PC: click / doble click / click derecho
- Móvil: tap / doble tap / long press

### 2. FloatingPanel

Panel flotante genérico:

```svelte
<FloatingPanel bind:open={panelOpen} on:close={() => panelOpen = false}>
  <!-- Contenido del módulo -->
</FloatingPanel>
```

Comportamiento:
- Click fuera → cierra
- Escape → cierra
- Centrado siempre

---

## Template de Análisis por Módulo

Antes de implementar cada módulo, responder:

```
┌─────────────────────────────────────────────────────┐
│  MÓDULO: [nombre]                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. ¿Qué hace?                                      │
│     └─ Función principal del módulo                 │
│                                                     │
│  2. ¿Persistencia?                                  │
│     └─ ¿Guarda datos? ¿Dónde? ¿JSON/DB/memoria?     │
│                                                     │
│  3. ¿Endpoints existentes?                          │
│     └─ GET/POST/PUT/DELETE actuales                 │
│                                                     │
│  4. ¿Necesita endpoint UI?                          │
│     └─ /ui/state para datos pre-formateados         │
│                                                     │
│  5. ¿Elementos UI necesarios?                       │
│     └─ Listas, forms, selectores, badges...         │
│                                                     │
│  6. ¿Cuántos paneles? (1-3)                         │
│     └─ Select / Add / Extra                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Ejemplo: ai-gateway

| Pregunta | Respuesta |
|----------|-----------|
| ¿Qué hace? | Gateway unificado para LLMs |
| ¿Persistencia? | Config en JSON, selección en memoria |
| ¿Endpoints? | GET /ui/state, POST /ui/select |
| ¿Endpoint UI? | Ya existe /ui/state |
| ¿Elementos UI? | Lista proveedores, lista modelos, badges estado |
| ¿Paneles? | Select (elegir), Add (nuevo proveedor), Extra (config avanzada) |

---

## Módulos Principales

| Módulo | Paneles | Prioridad |
|--------|---------|-----------|
| `ai-gateway` | Select, Add, Config | Alta |
| `credential-manager` | Select, Add | Alta |
| `prompt-manager` | Select, Add | Alta |
| `conversation-manager` | Select, Add | Media |
| `project-manager` | Select, Add | Media |

---

## Flujo de Trabajo

```
Workspace
    │
    └── Toolbar con ModuleButtons
            │
            ├── [🤖 AI] ──────► AIGatewayPanel
            ├── [🔐 Creds] ───► CredentialPanel
            ├── [📝 Prompts] ─► PromptPanel
            └── [💬 Conv] ────► ConversationPanel
                    │
                    └── FloatingPanel
                          │
                          └── Click fuera → Cierra
```

---

# PARTE 2: Reglas de Código

## Estructura de Archivos

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

## Naming Conventions

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

## Reglas de Módulos Backend

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

## Reglas de Componentes Svelte

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

## Reglas de Paneles Flotantes

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

## Reglas de APIs

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

## Reglas de Eventos

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

## Reglas de Estilo (Tailwind)

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

## Anti-patrones (NO hacer)

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

## Patrones Recomendados

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

# PARTE 3: Proceso de Diseño

## Antes de Codificar

**OBLIGATORIO** antes de escribir código:

### 1. Boceto Visual

Dibujar cada elemento/panel:

```
┌─────────────────────────────────────┐
│  BOCETO: [nombre del panel]         │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Header / Título            │    │
│  ├─────────────────────────────┤    │
│  │                             │    │
│  │  Contenido principal        │    │
│  │  - Elementos                │    │
│  │  - Interacciones            │    │
│  │                             │    │
│  ├─────────────────────────────┤    │
│  │  Acciones / Footer          │    │
│  └─────────────────────────────┘    │
│                                     │
│  Notas:                             │
│  - Tamaño aproximado               │
│  - Estados (hover, active, etc.)   │
│                                     │
└─────────────────────────────────────┘
```

### 2. Diagrama de Interacciones

Mapear flujo de acciones:

```
┌─────────────────────────────────────────────────────┐
│  INTERACCIONES: [nombre del módulo]                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Botón] ─── click ───► [Panel Select]              │
│     │                        │                      │
│     │                        ├── seleccionar item   │
│     │                        │      │               │
│     │                        │      ▼               │
│     │                        │   emit: select       │
│     │                        │      │               │
│     │                        │      ▼               │
│     │                        │   cerrar panel       │
│     │                        │                      │
│     ├── dbl click ──► [Panel Add]                   │
│     │                        │                      │
│     │                        ├── llenar form        │
│     │                        ├── validar            │
│     │                        ├── guardar            │
│     │                        │      │               │
│     │                        │      ▼               │
│     │                        │   emit: created      │
│     │                        │                      │
│     └── long press ─► [Panel Extra]                 │
│                              │                      │
│                              ├── editar             │
│                              ├── eliminar           │
│                              └── configurar         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 3. Checklist Pre-Código

```
□ Boceto visual de cada panel
□ Diagrama de interacciones
□ Estados identificados (loading, error, empty, success)
□ Eventos que emite cada acción
□ Datos que necesita (props)
□ Endpoint(s) que consume
```

---

## Ejemplo Completo: credential-manager

### Boceto: Panel Select

```
┌─────────────────────────────────────┐
│  🔐 Credenciales                [×] │
├─────────────────────────────────────┤
│  [🔍 Buscar...]                     │
├─────────────────────────────────────┤
│  ▼ GLOBAL                           │
│    ○ OpenAI      ****7a2f    ✓     │
│    ● DeepSeek    ****3b1c    ✓     │
├─────────────────────────────────────┤
│  ▶ PROJECT                          │
├─────────────────────────────────────┤
│  ▶ CLIENT                           │
└─────────────────────────────────────┘
  Tamaño: 300px ancho, max 400px alto
  Estados: loading, empty, error
```

### Boceto: Panel Add

```
┌─────────────────────────────────────┐
│  Nueva Credencial               [×] │
├─────────────────────────────────────┤
│                                     │
│  Proveedor                          │
│  [▼ Seleccionar...]                 │
│                                     │
│  API Key                            │
│  [********************************] │
│                                     │
│  Nivel                              │
│  ○ Global  ○ Project  ○ Client      │
│                                     │
│  Identificador (opcional)           │
│  [                              ]   │
│                                     │
├─────────────────────────────────────┤
│        [Cancelar]  [💾 Guardar]     │
└─────────────────────────────────────┘
  Validación: provider + api_key requeridos
```

### Diagrama Interacciones

```
[🔐 Creds]
    │
    ├── tap ──────────► Panel Select
    │                      │
    │                      ├── buscar ──► filtrar lista
    │                      ├── expandir grupo
    │                      ├── seleccionar ──► emit:select ──► cerrar
    │                      └── tap fuera ──► cerrar
    │
    ├── dbl tap ──────► Panel Add
    │                      │
    │                      ├── llenar campos
    │                      ├── [Guardar] ──► validar
    │                      │                    │
    │                      │              ┌─────┴─────┐
    │                      │              │           │
    │                      │           válido      error
    │                      │              │           │
    │                      │              ▼           ▼
    │                      │         POST /api   mostrar error
    │                      │              │
    │                      │              ▼
    │                      │         emit:created
    │                      │              │
    │                      │              ▼
    │                      │           cerrar
    │                      │
    │                      └── [Cancelar] ──► cerrar
    │
    └── long press ───► Panel Extra (futuro)
```

---

# RESUMEN

```
CÓDIGO = Mínimo necesario + Máxima reutilización

UI:
- Paneles flotantes (no páginas)
- 1-3 paneles por módulo (Select/Add/Extra)
- ModuleButton con triple interacción
- Click fuera = cerrar

BACKEND:
- Módulos independientes
- Comunicación por eventos
- APIs con /ui/state

FRONTEND:
- Componentes base reutilizables
- Tailwind desde tokens.json
- TypeScript tipado

SIEMPRE:
- Tipado
- Validación
- Documentación
```
