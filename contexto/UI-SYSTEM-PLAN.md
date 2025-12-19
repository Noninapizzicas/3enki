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

Cada módulo tiene **1 panel** que se abre con **1 clic**:

| Panel | Propósito | Invocación | ¿Obligatorio? |
|-------|-----------|------------|---------------|
| **Panel único** | Ver/elegir/configurar | 1 clic / 1 tap | ✅ Sí |

**Principio:** 1 clic = 1 panel. Sin doble-clic, sin long-press.

El panel único contiene tabs o secciones internas si el módulo necesita:
- Selección de items
- Creación de nuevos elementos
- Configuración/gestión

Ejemplos:
- `credential-manager`: Panel con tabs [Seleccionar | Añadir | Config]
- `ai-gateway`: Panel con [Seleccionar Provider | Seleccionar Modelo]

### Comportamiento

- Paneles aparecen flotantes sobre el workspace
- Click/tap fuera del panel → se cierra
- ESC → se cierra
- Sin navegación tradicional, todo contextual

---

## Componentes Base

### 1. ModuleButton

Botón simple que abre un panel con 1 clic:

```svelte
<ModuleButton
  module="ai-gateway"
  icon="🤖"
  label="AI"
  on:click={openPanel}
/>

<ModuleButton
  module="credential-manager"
  icon="🔐"
  label="Creds"
  on:click={openPanel}
/>
```

Interacciones:
- PC: 1 click → abre panel
- Móvil: 1 tap → abre panel

**Principio:** Sin doble-clic, sin long-press, sin click derecho.

### 2. ChatInputBar

Barra de entrada de chat con estructura sandwich y módulos integrados.

#### Estructura

```
┌─────────────────────────────────────────────────────────────┐
│ TOP: [🤖 AI] [🔐 Creds] [📝 Prompts] [💬 Conv]   [modelo]   │
├─────────────────────────────────────────────────────────────┤
│ ATTACHMENTS: [📄 file.txt ×] [🖼️ imagen.png ×]             │
├─────────────────────────────────────────────────────────────┤
│ INPUT: [📎] [________mensaje__________________] [➤]        │
├─────────────────────────────────────────────────────────────┤
│ BOTTOM: [📂 Proj] [📁 Files] [📝 Editor] [📄 PDF]  hint    │
└─────────────────────────────────────────────────────────────┘
```

#### Props

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `projectId` | `string \| null` | `null` | ID del proyecto actual |
| `message` | `string` | `''` | Mensaje a enviar (bind) |
| `placeholder` | `string` | `'Escribe tu mensaje...'` | Placeholder del input |
| `sending` | `boolean` | `false` | Estado de envío |
| `attachments` | `Attachment[]` | `[]` | Archivos adjuntos |
| `currentModel` | `string` | `''` | Modelo actual (badge) |
| `editorFile` | `any` | `null` | Archivo abierto en editor |
| `pdfFile` | `any` | `null` | Archivo PDF abierto |

#### Eventos

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `send` | `{ message, attachments }` | Enviar mensaje |
| `selectModel` | `{ provider, model }` | Modelo IA seleccionado |
| `selectCredential` | `{ key }` | Credencial seleccionada |
| `selectPrompt` | `{ id, content }` | Prompt aplicado al mensaje |
| `selectConversation` | `{ id }` | Conversación cambiada |
| `selectProject` | `{ id }` | Proyecto cambiado |
| `selectFile` | `{ file }` | Archivo seleccionado |
| `openEditor` | `{ file }` | Abrir archivo en editor |
| `openPdf` | `{ file }` | Abrir PDF en visor |
| `attach` | `{ files }` | Archivos adjuntados |
| `removeAttachment` | `{ id }` | Adjunto eliminado |

#### Uso

```svelte
<ChatInputBar
  {projectId}
  bind:message
  {currentModel}
  on:send={handleSend}
  on:selectModel={handleModelSelect}
  on:selectPrompt={handlePromptSelect}
  on:attach={handleAttach}
/>
```

#### Módulos integrados

| Fila | Módulos | Propósito |
|------|---------|-----------|
| **Top** | AI, Credential, Prompt, Conversation | Preparación del mensaje |
| **Bottom** | Project, FileBrowser, TextEditor, PdfViewer | Contexto y workspace |

### 3. FloatingPanel

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
| ¿Comunicación? | MQTT pub/sub para estado y selección |
| ¿Elementos UI? | Lista proveedores, lista modelos, badges estado |
| ¿Panel? | Panel único con tabs [Providers | Modelos | Config] |

---

## Módulos Principales

| Módulo | Panel | Contenido | Prioridad |
|--------|-------|-----------|-----------|
| `ai-gateway` | AIPanel | Providers, Modelos, Config | Alta |
| `credential-manager` | CredentialPanel | Lista, Añadir, Config | Alta |
| `prompt-manager` | PromptPanel | Lista, Añadir, Config | Alta |
| `conversation-manager` | ConversationPanel | Lista, Nueva, Config | Media |
| `project-manager` | ProjectPanel | Lista, Nuevo, Config | Media |
| `menu-generator` | MenuPanel | Lista, Nuevo, Config | Media |
| `file-browser` | FilesPanel | Explorador, Nuevo, Config | Media |
| `text-editor` | EditorPanel | Editor, Config | Media |
| `pdf-viewer` | PdfPanel | Visor, Config | Media |

---

## Flujo de Trabajo

```
Workspace
    │
    ├── TopToolbar (módulos de workspace)
    │       │
    │       ├── [📁 Files] ───► FilesPanel (1 clic)
    │       ├── [📝 Editor] ──► EditorPanel (1 clic)
    │       └── [📄 PDF] ─────► PdfPanel (1 clic)
    │
    └── ChatInputBar (módulos de chat)
            │
            ├── [🤖 AI] ──────► AIPanel (1 clic)
            ├── [🔐 Creds] ───► CredentialPanel (1 clic)
            ├── [📝 Prompts] ─► PromptPanel (1 clic)
            ├── [💬 Conv] ────► ConversationPanel (1 clic)
            ├── [📂 Project] ─► ProjectPanel (1 clic)
            └── [🍔 Menu] ────► MenuPanel (1 clic)
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
├── toolbar/          # Barras y botones (ToolbarIcon, TopToolbar...)
├── chat/             # ChatInputBar con módulos integrados
├── ai/               # AIButton, AIPanel
├── credentials/      # CredentialButton, CredentialPanel
├── prompts/          # PromptButton, PromptPanel
├── projects/         # ProjectButton, ProjectPanel
├── conversations/    # ConversationButton, ConversationPanel
├── menu/             # MenuButton, MenuPanel
├── files/            # FilesButton, FilesPanel
├── editor/           # EditorButton, EditorPanel
├── pdf/              # PdfButton, PdfPanel
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

**Componentes por carpeta:**
- toolbar/: FloatingToolbar, ToolbarIcon, TopToolbar, ModuleToolbar, ChatToolbar
- layout/: MobileWorkspaceLayout
- chat/: ChatInputBar
- ai/: AIButton, AIPanel, ChatInput
- Todos los módulos: {Module}Button, {Module}Panel

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

### Patrón: 1 panel por módulo

| Panel | Invocación | Propósito |
|-------|------------|-----------|
| Panel único | 1 clic / 1 tap | Ver, elegir, crear, configurar |

**Principio:** 1 clic = 1 panel. El panel puede tener tabs internas si necesita múltiples funciones.

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

## Reglas de Comunicación

### MQTT como fuente de datos

El frontend obtiene datos via **MQTT**, no via endpoints `/ui/state`:

```
Frontend suscribe → topic MQTT → transforma datos → renderiza
```

### Reglas:
- **NO hay endpoints `/ui/state`** - frontend transforma datos MQTT
- **Acciones via eventos MQTT** publicados al backend
- **Estado reactivo** en Svelte stores sincronizados con MQTT
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

# PARTE 4: Perfil del Ejecutor

## Perfil Ideal para Implementación

El ejecutor de este sistema debe cumplir con el siguiente perfil para garantizar eficiencia y calidad.

---

### Formación Técnica

| Área | Nivel | Conocimientos Específicos |
|------|-------|---------------------------|
| **JavaScript/TypeScript** | Avanzado | ES6+, async/await, tipos, interfaces |
| **Svelte/SvelteKit** | Intermedio-Avanzado | Componentes, stores, eventos, SSR |
| **CSS/Tailwind** | Intermedio | Flexbox, Grid, variables CSS, tokens |
| **Event-Driven** | Intermedio | Pub/Sub, MQTT, EventEmitter |
| **REST APIs** | Intermedio | Diseño, consumo, estados HTTP |
| **JSON Schema** | Básico | Validación, tipos, estructuras |

---

### Habilidades Requeridas

```
DISEÑO:
├── Pensamiento visual (bocetos rápidos)
├── Diagramación de flujos
├── Identificación de estados UI
└── Simplificación de interfaces

CÓDIGO:
├── Componentización (dividir en partes pequeñas)
├── Reutilización (detectar patrones repetidos)
├── Tipado estricto (TypeScript)
└── Código limpio (legible > ingenioso)

SISTEMA:
├── Entender arquitectura event-driven
├── Separar responsabilidades (módulo = 1 cosa)
├── API-first thinking
└── Debugging de eventos asíncronos
```

---

### Carácter y Actitud

#### Obligatorio

```
MINIMALISTA
└── Pregunta: "¿Puedo hacerlo con menos?"
└── Rechaza: Sobre-ingeniería, features innecesarias
└── Busca: La solución más simple que funcione

METÓDICO
└── Sigue el proceso: Análisis → Boceto → Diagrama → Código
└── No salta pasos por "ahorrar tiempo"
└── Documenta mientras avanza

PRAGMÁTICO
└── Prioriza: Funciona > Perfecto
└── Itera: Versión simple primero, mejora después
└── Entrega: Prefiere algo terminado a algo a medias

CONSISTENTE
└── Sigue convenciones establecidas
└── No inventa nuevos patrones sin razón
└── Respeta la filosofía del proyecto
```

#### Deseable

```
PACIENTE
└── Los paneles flotantes requieren atención al detalle
└── Las interacciones móviles necesitan pruebas

VISUAL
└── Puede "ver" la UI antes de codificarla
└── Detecta inconsistencias visuales

COMUNICATIVO
└── Pregunta cuando hay ambigüedad
└── Documenta decisiones técnicas
```

---

### Anti-perfil (NO debe ser)

```
❌ PERFECCIONISTA PARALIZANTE
   "No puedo empezar hasta que esté todo definido"

❌ SOBRE-INGENIERO
   "Voy a crear una abstracción para esto"

❌ COWBOY
   "Ya sé cómo hacerlo, no necesito bocetos"

❌ ACUMULADOR
   "Mejor añado esta feature por si acaso"

❌ INCONSISTENTE
   "En este componente lo hago diferente"
```

---

### Flujo de Trabajo Esperado

```
1. RECIBIR TAREA
   └── Leer requisitos
   └── Identificar módulo(s) involucrados

2. ANALIZAR (10%)
   └── Aplicar template de análisis
   └── Responder las 6 preguntas
   └── Identificar endpoints necesarios

3. DISEÑAR (20%)
   └── Boceto visual de cada panel
   └── Diagrama de interacciones
   └── Completar checklist pre-código

4. CODIFICAR (50%)
   └── Componentes base primero
   └── Integración después
   └── Tipado completo

5. VERIFICAR (15%)
   └── Funciona en móvil
   └── Funciona en PC
   └── Estados manejados (loading, error, empty)

6. DOCUMENTAR (5%)
   └── Props documentadas
   └── Eventos documentados
   └── Ejemplo de uso
```

---

### Métricas de Éxito

| Métrica | Objetivo |
|---------|----------|
| Componentes < 200 líneas | 90% |
| Reutilización de base | 80%+ |
| Tipado completo | 100% |
| Boceto antes de código | 100% |
| Tiempo diseño vs código | 30% / 70% |

---

### Prompt del Ejecutor

```
Eres un desarrollador frontend especializado en Event-Core.

## Conocimientos
- JavaScript/TypeScript avanzado (ES6+, async/await, tipos)
- Svelte/SvelteKit (componentes, stores, eventos)
- Tailwind CSS (tokens, variables CSS)
- Arquitectura event-driven (Pub/Sub, MQTT)
- REST APIs y JSON Schema

## Filosofía
SIMPLICIDAD RADICAL: Mínimo código necesario.
MODULARIDAD: Un módulo = una responsabilidad.
API-FIRST: UI consume, backend expone.
COMPONENT-FIRST: Máxima reutilización.

## Proceso Obligatorio
Antes de escribir código SIEMPRE:
1. Analizar: Responder las 6 preguntas del template
2. Bocetar: Dibujar cada panel visualmente
3. Diagramar: Mapear interacciones y eventos
4. Checklist: Estados, props, endpoints identificados

## Reglas de Código
- Componentes < 200 líneas
- Props y eventos tipados con TypeScript
- Colores desde tokens.json, nunca hardcodeados
- Sin lógica de negocio en componentes UI
- Un módulo NO importa otro módulo (solo eventos)

## Paneles Flotantes
- 1 panel por módulo (con tabs internas si necesita)
- 1 clic = 1 panel (sin doble-clic, sin long-press)
- Tap/clic fuera = cerrar (siempre)
- Sin navegación tradicional

## Carácter
MINIMALISTA: "¿Puedo hacerlo con menos?"
METÓDICO: Sigo el proceso sin saltar pasos.
PRAGMÁTICO: Funciona > Perfecto.
CONSISTENTE: Sigo convenciones, no invento.

## NO Hacer
- Sobre-ingeniería ni abstracciones prematuras
- Saltar bocetos por "ahorrar tiempo"
- Añadir features "por si acaso"
- Crear componentes > 300 líneas
- Hardcodear colores o tamaños

## Entrega
- Código tipado al 100%
- Estados manejados (loading, error, empty)
- Props y eventos documentados
- Funciona en móvil y PC
```

---

# RESUMEN

```
CÓDIGO = Mínimo necesario + Máxima reutilización

UI:
- Paneles flotantes (no páginas)
- 1 panel por módulo (con tabs internas si necesita)
- 1 clic = 1 panel (sin doble-clic, sin long-press)
- Click fuera = cerrar

BACKEND:
- Módulos independientes
- Comunicación por eventos MQTT
- NO endpoints /ui/state

FRONTEND:
- Componentes base reutilizables
- Tailwind desde tokens.json
- TypeScript tipado
- Datos via MQTT, no REST

SIEMPRE:
- Tipado
- Validación
- Documentación
```

---

# PARTE 4: GUÍA DE GENERACIÓN DE UI POR MÓDULO

Esta guía es el **patrón definitivo** para crear la UI de cualquier módulo.
Seguir estos pasos en orden garantiza consistencia y cumplimiento del sistema.

---

## PASO 1: Análisis del Módulo (6 Preguntas)

Antes de escribir código, responder estas 6 preguntas:

| # | Pregunta | Ejemplo (credential-manager) |
|---|----------|------------------------------|
| 1 | ¿Qué **SELECCIONA** el usuario? | Credencial existente |
| 2 | ¿Qué **AÑADE** el usuario? | Nueva API key |
| 3 | ¿Qué **CONFIGURA** el usuario? | Editar/eliminar credencial |
| 4 | ¿Qué **datos** necesita del backend? | GET /ui/state → credentials, providers, levels |
| 5 | ¿Qué **eventos** emite? | credential.saved, credential.deleted |
| 6 | ¿Cómo se **integra** con otros módulos? | Necesita project-manager para nivel PROJECT |

---

## PASO 2: Definir contenido del panel

```
¿Qué funciones necesita el panel?
    │
    ├── Solo selección → Panel simple con lista
    │
    ├── Selección + Creación → Panel con tabs [Lista | Nuevo]
    │
    └── Selección + Creación + Config → Panel con tabs [Lista | Nuevo | Config]

Principio: 1 clic = 1 panel con tabs internas
```

---

## PASO 3: Bocetos ASCII

Crear boceto del panel único ANTES de codificar:

### Panel único con tabs (1 clic)
```
┌─────────────────────────────────────────┐
│  🔐 [Módulo]                        [×] │
│  ───────────────────────────────────────│
│  [Lista] [Nuevo] [Config]    ← tabs     │
│  ───────────────────────────────────────│
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🔍 Buscar...                    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── Grupo 1 ─────────────────────────   │
│  ┌─────────────────────────────────┐    │
│  │ 📄 Item 1                    ✓  │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ 📄 Item 2                       │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

### Contenido tab "Nuevo"
```
│  Campo 1                                │
│  ┌─────────────────────────────────┐    │
│  │ valor...                        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌──────────┐  ┌──────────────────┐     │
│  │ Cancelar │  │     ✓ Guardar   │     │
│  └──────────┘  └──────────────────┘     │
```

### Contenido tab "Config"
```
│  📄 [Nombre del item seleccionado]      │
│  [Campos editables]                     │
│                                         │
│  ┌─────────┐ ┌────────┐ ┌─────────┐    │
│  │ 🗑️ Del. │ │ Cancel │ │  Save   │    │
│  └─────────┘ └────────┘ └─────────┘    │
```

---

## PASO 4: Checklist Pre-Código

```
[ ] Panel único diseñado con tabs necesarias
[ ] Button simple (1 clic = abre panel)
[ ] Comunicación MQTT definida (topics pub/sub)
[ ] Integración con otros módulos identificada
[ ] Sin endpoints /ui/state (datos via MQTT)
```

---

## PASO 5: Estructura de Archivos

```
frontend/src/lib/components/{modulo}/
├── {Modulo}Button.svelte      # Botón simple (1 clic)
├── {Modulo}Panel.svelte       # Panel único con tabs
└── index.ts                   # Exports
```

El **FloatingPanel** es genérico y vive en `feedback/`:
```
frontend/src/lib/components/feedback/
├── FloatingPanel.svelte       # Panel base flotante
└── index.ts
```

---

## PASO 6: Crear Componentes

### 6.1 {Modulo}Button.svelte

```svelte
<!--
  {Modulo}Button.svelte
  Botón simple: 1 clic = abre panel
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let icon: string;
  export let label: string;
  export let disabled = false;

  const dispatch = createEventDispatcher();

  function handleClick() {
    dispatch('click');
  }
</script>

<button
  class="module-btn"
  {disabled}
  aria-label={label}
  on:click={handleClick}
>
  {icon}
</button>
```

### 6.2 {Modulo}Panel.svelte

```svelte
<!--
  Panel único con tabs internas si necesita múltiples funciones.
  Comunicación via MQTT, no endpoints /ui/state.

  Estructura:
  - Tab "Lista": selección de items
  - Tab "Nuevo": formulario de creación (si aplica)
  - Tab "Config": edición/eliminación (si aplica)
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { subscribe, publish } from '$lib/mqtt';

  let activeTab = 'lista';
  let items = [];

  onMount(() => {
    // Suscribir a MQTT para obtener datos
    return subscribe('modulo/state', (_, data) => {
      items = data.items;
    });
  });
</script>
```

---

## PASO 7: Compliance Checklist

| Área | Verificación |
|------|--------------|
| **CSS** | Variables de tokens.json con fallbacks |
| **Datos** | Via MQTT, NO endpoints /ui/state |
| **Eventos** | Svelte createEventDispatcher |
| **Naming** | BEM para CSS, camelCase para props |
| **Types** | TypeScript interfaces para datos |

### CSS Variables Pattern
```css
.component {
  --_bg: var(--module-bg, var(--color-bg-card, #1a1d24));
  --_color: var(--module-color, var(--color-text, #ffffff));
  --_radius: var(--module-radius, var(--radius-lg, 12px));
}
```

### MQTT Pattern
```typescript
import { subscribe, publish } from '$lib/mqtt';

// ✅ Correcto - obtener datos via MQTT
subscribe('modulo/state', (_, data) => {
  items = data.items;
});

// ✅ Correcto - publicar acción
publish('modulo/select', { id: selectedId });

// ❌ Incorrecto - NO usar endpoints /ui/state
// const res = await fetch('/api/modules/mi-modulo/ui/state');
```

---

## PASO 8: Actualizar Exports

```typescript
// frontend/src/lib/components/{modulo}/index.ts

export { default as {Modulo}Button } from './{Modulo}Button.svelte';
export { default as {Modulo}Panel } from './{Modulo}Panel.svelte';
```

---

## PASO 9: Commit Pattern

```bash
# Componentes del módulo
feat(ui): add {Modulo}Button and {Modulo}Panel

# Fix de compliance
fix(ui): use MQTT instead of REST endpoints
```

---

## EJEMPLO COMPLETO: credential-manager

### Análisis
| Pregunta | Respuesta |
|----------|-----------|
| ¿Selecciona? | Credencial (provider + level + identifier) |
| ¿Añade? | Nueva API key |
| ¿Configura? | Editar key, test, eliminar |
| ¿Datos? | Via MQTT: credential/state |
| ¿Eventos? | credential.saved, credential.deleted |
| ¿Integración? | project-manager (para nivel PROJECT) |

### Panel con tabs
Panel único con tabs: [Lista | Nuevo | Config]

### Integración con project-manager
```typescript
// En CredentialPanel.svelte - tab "Nuevo"
import { subscribe } from '$lib/mqtt';

let projects = [];

onMount(() => {
  // Obtener proyectos via MQTT
  subscribe('project/list', (_, data) => {
    projects = data.projects;
  });
});
```

### Componentes creados
- `CredentialButton.svelte` - 1 clic abre panel
- `CredentialPanel.svelte` - Panel con tabs [Lista | Nuevo | Config]

---

## PLANTILLA RÁPIDA

Para un nuevo módulo, copiar y adaptar:

```
1. Leer module.json del módulo
2. Responder 6 preguntas del análisis
3. Definir tabs necesarias del panel
4. Crear boceto ASCII del panel
5. Crear {Modulo}Button.svelte
6. Crear {Modulo}Panel.svelte con tabs
7. Configurar MQTT pub/sub
8. Actualizar index.ts
9. Pasar compliance checklist
10. Commit y push
```

---

## MÓDULOS DE WORKSPACE

Los módulos de workspace permiten trabajar con archivos y contenido directamente:

### file-browser
| Pregunta | Respuesta |
|----------|-----------|
| ¿Selecciona? | Archivo/carpeta del proyecto |
| ¿Añade? | Nueva carpeta, nuevo archivo |
| ¿Configura? | Renombrar, eliminar, mover |
| Panel | FilesPanel con tabs [Explorar | Nuevo | Config] |

### text-editor
| Pregunta | Respuesta |
|----------|-----------|
| ¿Selecciona? | Archivo abierto (de file-browser) |
| ¿Añade? | No (depende de file-browser) |
| ¿Configura? | Opciones de editor (theme, font size) |
| Panel | EditorPanel con tabs [Editor | Config] |

### pdf-viewer
| Pregunta | Respuesta |
|----------|-----------|
| ¿Selecciona? | PDF abierto (de file-browser) |
| ¿Añade? | No (depende de file-browser) |
| ¿Configura? | Opciones de visualización (zoom, modo) |
| Panel | PdfPanel con tabs [Visor | Config] |

---

## ESTADO DE MÓDULOS

| Módulo | Panel | Tabs | Integración |
|--------|-------|------|-------------|
| ai-gateway | AIPanel | Providers, Modelos | - |
| credential-manager | CredentialPanel | Lista, Nuevo, Config | project-manager |
| prompt-manager | PromptPanel | Lista, Nuevo, Config | - |
| conversation-manager | ConversationPanel | Lista, Nueva, Config | project-manager |
| project-manager | ProjectPanel | Lista, Nuevo, Config | - |
| menu-generator | MenuPanel | Lista, Nuevo, Config | - |
| file-browser | FilesPanel | Explorar, Nuevo, Config | project-manager |
| text-editor | EditorPanel | Editor, Config | file-browser |
| pdf-viewer | PdfPanel | Visor, Config | file-browser |

---

## ESTADO DE COMPONENTES DE TOOLBAR

### Componentes Base

| Componente | Ubicación | CSS Tokens | Estado |
|------------|-----------|------------|--------|
| ToolbarIcon | `toolbar/` | ✅ | ✅ Completo |
| FloatingToolbar | `toolbar/` | ✅ | ✅ Completo |
| TopToolbar | `toolbar/` | ✅ | ✅ Completo |
| ModuleToolbar | `toolbar/` | ✅ | ✅ Completo |
| ChatToolbar | `toolbar/` | ✅ | ✅ Completo |

### Componentes de Sistema

| Componente | Ubicación | Interacción | Estado |
|------------|-----------|-------------|--------|
| SystemBar | `layout/` | 1 clic | ✅ Completo |

**SystemBar** incluye 4 botones (1 clic = 1 panel):

| Botón | Clic → Panel |
|-------|--------------|
| 🧩 Módulos | ModulesPanel |
| ⚙️ Sistema | SystemPanel |
| 🔔 Alertas | AlertsPanel |
| 👤 Usuario | UserPanel |

### Componentes Mobile

| Componente | Ubicación | CSS Tokens | Estado |
|------------|-----------|------------|--------|
| MobileWorkspaceLayout | `layout/` | ✅ | ✅ Completo |
| MobileChatWorkspace | `toolbar/` | ✅ | ✅ Completo |

### Componentes de Chat

| Componente | Ubicación | CSS Tokens | Estado |
|------------|-----------|------------|--------|
| ChatInputBar | `chat/` | ✅ | ✅ Completo |
| ChatInput | `ai/` | ✅ | ✅ Completo |

### Componentes de Módulos (Button + Panel)

| Módulo | Button | Panel | CSS Tokens |
|--------|--------|-------|------------|
| menu-generator | ✅ | ✅ | ✅ |
| credential-manager | ✅ | ✅ | ✅ |
| prompt-manager | ✅ | ✅ | ✅ |
| conversation-manager | ✅ | ✅ | ✅ |
| project-manager | ✅ | ✅ | ✅ |
| file-browser | ✅ | ✅ | ✅ |
| ai-gateway | ✅ | ✅ | ✅ |

---

## CORRECCIONES CSS REALIZADAS

Componentes que tenían HSL hardcodeado y fueron corregidos:

| Componente | Problema | Solución |
|------------|----------|----------|
| ChatInputBar | `hsl(217 91% 60%)` | `var(--color-primary, #3b82f6)` |
| MenuGeneratorButton | `hsla(25, 95%, 53%, 0.1)` | `rgb(249 115 22 / 0.1)` |
| MenuGeneratorAddPanel | HSL en badges/buttons | CSS variables con fallbacks |
| MenuGeneratorConfigPanel | HSL en estados | `var(--color-*, fallback)` |
| TopToolbar | `hsl(220 13% 10%)` | `#1a1d24` (hex fallback) |

### Patrón CSS correcto:

```css
/* Variables locales con fallbacks */
.component {
  --_bg: var(--component-bg, var(--color-bg-card, #1a1d24));
  --_color: var(--component-color, var(--color-text, #ffffff));
  --_accent: var(--component-accent, var(--color-primary, #3b82f6));
}

/* Colores con opacidad */
.element {
  background: rgb(59 130 246 / 0.1);  /* ✅ Correcto */
  background: hsla(217, 91%, 60%, 0.1); /* ❌ Incorrecto */
}
```
