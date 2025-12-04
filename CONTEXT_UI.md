# CONTEXT_UI - Sistema de Interfaz Móvil Event Core

**Versión:** 1.0.0
**Fecha:** 2025-12-03
**Estado:** Definición completa

---

## Filosofía Central

### El Problema que Resolvemos

> **La distracción es el enemigo de la productividad.**

Cada vez que un usuario "sale" de su contexto de trabajo:
- Abre Google → se distrae → 10 minutos perdidos
- Abre Instagram → se distrae → 15 minutos perdidos
- Cambia de app → pierde el foco → cuesta volver

### La Solución

**Una interfaz donde TODO está accesible SIN salir del contexto de trabajo.**

- El usuario nunca pierde el foco
- Acceso puntual a cualquier función
- El trabajo siempre visible como referencia
- La IA es herramienta, no el centro

---

## Principios de Diseño

### 1. Foco Ante Todo
```
El trabajo/módulo actual es lo principal.
El chat y la IA son herramientas de apoyo.
Nunca compiten por la atención.
```

### 2. Mínima Huella Visual
```
Barras de 10-12mm máximo.
Solo iconos cuando está colapsado.
Se expande SOLO cuando el usuario lo necesita.
Vuelve a colapsar automáticamente.
```

### 3. Todo Concentrado
```
3 dominios claros, 3 barras:
- Superior: Módulo/Trabajo actual
- Lateral: Ecosistema/Sistema general
- Inferior: IA y Chat

Cada cosa en su lugar. Sin mezclar.
```

### 4. Curva de Aprendizaje Justificada
```
No es una app casual, es una herramienta profesional.
Vale la pena aprender los patrones porque:
- Todo está ahí
- Nunca pierdes el foco
- Con práctica es muy rápido
```

### 5. Anti-Salida
```
NUNCA hay que "salir a buscar algo".
Todo se resuelve dentro de la interfaz.
Paneles flotantes, no navegación a otras pantallas.
```

---

## Arquitectura de Interfaz

### Vista General

```
┌─────────────────────────────────────────────────────────────┐
│ ████ BARRA SUPERIOR (Módulo/Trabajo) ██████████████████████ │
├─────────────────────────────────────────────────────────┬───┤
│                                                         │███│
│                                                         │███│
│              ZONA CENTRAL                               │ B │
│              Historial Chat + Trabajo                   │ A │
│              (scroll vertical)                          │ R │
│                                                         │ R │
│              El trabajo siempre visible                 │ A │
│              como referencia de fondo                   │   │
│                                                         │ L │
│                                                         │ A │
│                                                         │ T │
│                                                         │███│
├─────────────────────────────────────────────────────────┴───┤
│ ████ SUB-BARRA CHAT SUPERIOR ██████████████████████████████ │
├─────────────────────────────────────────────────────────────┤
│  [input pequeño fijo]                           [Enviar →]  │
├─────────────────────────────────────────────────────────────┤
│ ████ SUB-BARRA CHAT INFERIOR ██████████████████████████████ │
└─────────────────────────────────────────────────────────────┘
```

### Medidas

| Elemento | Tamaño | Comportamiento |
|----------|--------|----------------|
| Barras colapsadas | 10-12mm | Solo iconos visibles |
| Barras expandidas | Variable | Iconos + etiquetas + contenido |
| Input de texto | Fijo pequeño | Doble toque para expandir |
| Ventanas flotantes | 30-50% pantalla | Sobre el contenido, chat visible atrás |

---

## Los 3 Componentes de Barras

### 1. Barra Superior - Módulo/Trabajo

**Posición:** Parte superior de la pantalla
**Dominio:** El trabajo actual, el módulo activo
**Configuración:** VARIABLE por módulo

```
┌──────────────────────────────────────────────────────────┐
│  [●] [●] [●] [●] [●]                                [▼]  │
└──────────────────────────────────────────────────────────┘
     ↑
     Iconos definidos por cada módulo
```

**Ejemplos de contenido por módulo:**

| Módulo | Iconos típicos |
|--------|----------------|
| Tareas | Proyecto, Filtros, Vista, Ordenar |
| Notas | Carpeta, Etiquetas, Buscar, Exportar |
| Dashboard | Período, Métricas, Refresh, Compartir |
| CRM | Cliente, Pipeline, Actividades, Informes |

**Por qué arriba:** Es lo primero que ves, relacionado con TU trabajo actual.

---

### 2. Barra Lateral - Ecosistema

**Posición:** Lado derecho de la pantalla
**Dominio:** Sistema general, navegación global
**Configuración:** MÁS ESTABLE (ecosistema común)

```
┌───┐
│ ● │
│ ● │
│ ● │
│ ● │
│ ● │
│[◄]│
└───┘
```

**Contenido típico:**

| Icono | Función |
|-------|---------|
| Módulos | Navegar entre módulos disponibles |
| Configuración | Ajustes del sistema |
| Notificaciones | Alertas y avisos |
| Usuario | Perfil y sesión |
| Ayuda | Documentación y soporte |

**Por qué lateral:** Es el "ecosistema", lo que rodea tu trabajo pero no es el trabajo en sí.

---

### 3. Barra Chat - IA (Estructura Sandwich)

**Posición:** Parte inferior, envolviendo el input
**Dominio:** Todo lo relacionado con IA y Chat
**Configuración:** FIJA (no cambia por módulo)

```
┌─────────────────────────────────────────┐
│  [🤖] [🔑] [📝] [💬]                    │  ← SUB-BARRA SUPERIOR
├─────────────────────────────────────────┤
│  [input...]                    [Enviar] │  ← INPUT (relleno)
├─────────────────────────────────────────┤
│  [🔧] [📎] [📋] [🔌]                    │  ← SUB-BARRA INFERIOR
└─────────────────────────────────────────┘
```

**Sub-barra Superior (Chat directo):**
Lo que PREPARA el mensaje - configuras ANTES de escribir

| Icono | Función |
|-------|---------|
| 🤖 Modelo | Seleccionar modelo IA activo |
| 🔑 Credencial | API Key / credencial activa |
| 📝 Prompt | Templates de prompts |
| 💬 Historial | Conversaciones anteriores |

**Sub-barra Inferior (Adyacentes):**
Lo que COMPLEMENTA el mensaje - añades DESPUÉS de escribir

| Icono | Función |
|-------|---------|
| 🔧 Tools | Herramientas disponibles |
| 📎 Adjuntar | Archivos, imágenes, documentos |
| 📋 Contexto | Contexto actual del módulo |
| 🔌 Plugins | Plugins activos |

**Flujo cognitivo natural:**
```
1. Miro arriba → ¿Qué modelo? ¿Qué prompt?
2. Escribo en el input
3. Miro abajo → ¿Adjunto algo? ¿Activo tools?
4. Envío
```

---

## Sistema de Triple Interacción

### El Patrón

Cada icono en las barras tiene 3 niveles de interacción:

| Gesto | Acción | Uso típico |
|-------|--------|------------|
| **1 toque** | Panel rápido | Ver y seleccionar (lo más frecuente) |
| **2 toques** | Crear nuevo | Añadir elemento nuevo |
| **Long-press** | Gestión completa | Editar, borrar, configurar |

### Justificación

```
1 TOQUE (90% del uso):
- Rápido, inmediato
- Ver estado actual
- Seleccionar opción

2 TOQUES (8% del uso):
- Crear algo nuevo
- No tan frecuente como seleccionar
- Requiere intención clara

LONG-PRESS (2% del uso):
- Gestión completa
- Editar, eliminar, duplicar
- Acciones de mantenimiento
```

### Feedback Visual

```
1 toque:
[●] → Panel aparece inmediatamente

2 toques:
[●] → [●] → Modal de creación

Long-press:
[●]━━━━━● → Círculo de progreso mientras mantienes
           → Modal de gestión al completar
```

### Descubribilidad

La triple interacción NO es obvia. Estrategias para enseñarla:

1. **Onboarding inicial:** Tutorial breve la primera vez
2. **Tooltips contextuales:** "Mantén pulsado para más opciones"
3. **Indicador visual:** Círculo que se llena durante long-press
4. **Consistencia:** TODOS los iconos funcionan igual

---

## Input de Texto

### Comportamiento Base

```
┌─────────────────────────────────────────┐
│  [Escribe aquí...]            [Enviar]  │
└─────────────────────────────────────────┘

- Tamaño FIJO pequeño (no crece)
- Enter = salto de línea (NUNCA enviar)
- Botón Enviar obligatorio para mandar
```

### Expansión (Doble toque)

```
Doble toque en el input:
                    ↓
┌─────────────────────────────────────────┐
│                                         │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │  Texto completo editable          │  │  ← Ventana 50%
│  │  (scroll, edición cómoda)         │  │
│  │                                   │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Chat visible de fondo (50% inferior)   │
│                                         │
└─────────────────────────────────────────┘

Tocar fuera → Cierra y vuelve al input pequeño
```

### Por qué Input Fijo

```
PROBLEMA con input expandible automático:
- El teclado móvil ya ocupa 40% de pantalla
- Si el input crece, desplaza todo
- Pierdes contexto del chat
- UX caótica

SOLUCIÓN con input fijo:
- Siempre sabes dónde está todo
- Expansión VOLUNTARIA (doble toque)
- Mantienes control total
```

---

## Ventanas Flotantes

### Tipos de Ventana

| Tipo | Tamaño | Cuándo aparece |
|------|--------|----------------|
| Panel rápido | 20-30% | 1 toque - selección rápida |
| Modal crear | 40-50% | 2 toques - formulario creación |
| Modal gestión | 60-80% | Long-press - lista completa + acciones |
| Editor texto | 50% | Doble toque en input |

### Comportamiento Común

```
TODAS las ventanas flotantes:
- Aparecen SOBRE el contenido
- El chat/trabajo visible de fondo (blur opcional)
- Cerrar: tocar fuera O swipe down
- Nunca bloquean TODO - siempre hay contexto visible
```

### Z-Index Strategy

```
z-index: 10   → Zona central (chat/trabajo)
z-index: 100  → Barras flotantes
z-index: 200  → Panel rápido (1 toque)
z-index: 300  → Modal crear (2 toques)
z-index: 400  → Modal gestión (long-press)
z-index: 500  → Editor texto expandido
z-index: 999  → Overlays críticos (confirmaciones)
```

---

## Integración con Event Core

### Mapeo de Componentes a Módulos

| Componente UI | Módulo Event Core |
|---------------|-------------------|
| Selector Modelo | ai-gateway |
| Selector Credencial | credential-manager |
| Selector Prompt | prompt-manager |
| Lista Tools | tool-orchestrator |
| Plugins | plugin-manager |
| Historial Chat | (nuevo: conversation-manager) |
| Contexto | ai-agent-framework/context-manager |

### Eventos Relevantes

```javascript
// La UI emite eventos cuando el usuario interactúa
eventBus.publish('ui.model.selected', { model_id: 'deepseek-chat' });
eventBus.publish('ui.credential.selected', { credential_id: 'cred_123' });
eventBus.publish('ui.tool.toggled', { tool_id: 'github', enabled: true });
eventBus.publish('ui.message.sent', { content: '...', context: {...} });

// La UI escucha eventos para actualizar estado
eventBus.subscribe('ai.response.chunk', (chunk) => { /* streaming */ });
eventBus.subscribe('ai.response.complete', (response) => { /* done */ });
eventBus.subscribe('tool.execution.started', (tool) => { /* indicator */ });
```

### Estructura de Archivos

```
frontend/src/lib/components/
├── toolbar/
│   ├── FloatingToolbar.svelte      # Componente base genérico
│   ├── ToolbarIcon.svelte          # Icono con triple interacción
│   ├── ToolbarPanel.svelte         # Panel flotante genérico
│   │
│   ├── ModuleToolbar.svelte        # Barra superior (configurable)
│   ├── EcosystemToolbar.svelte     # Barra lateral (ecosistema)
│   └── ChatToolbar.svelte          # Barra chat (sandwich fijo)
│
├── chat/
│   ├── ChatInput.svelte            # Input con expansión
│   ├── ChatHistory.svelte          # Historial con scroll
│   └── MessageBubble.svelte        # Burbuja de mensaje
│
├── panels/
│   ├── QuickPanel.svelte           # Panel 1 toque
│   ├── CreateModal.svelte          # Modal 2 toques
│   └── ManageModal.svelte          # Modal long-press
│
└── layouts/
    └── MobileChatWorkspace.svelte  # Layout completo integrado
```

---

## Configuración por Módulo

### Estructura de Configuración

Cada módulo puede definir su barra superior en `module.json`:

```json
{
  "name": "tareas",
  "version": "1.0.0",

  "ui": {
    "mobile": {
      "toolbar_top": {
        "icons": [
          {
            "id": "proyecto",
            "icon": "📁",
            "label": "Proyecto",
            "actions": {
              "tap": { "type": "panel", "target": "proyecto-selector" },
              "doubleTap": { "type": "modal", "target": "proyecto-crear" },
              "longPress": { "type": "modal", "target": "proyecto-gestionar" }
            }
          },
          {
            "id": "filtros",
            "icon": "🔍",
            "label": "Filtros",
            "actions": {
              "tap": { "type": "panel", "target": "filtros-rapidos" }
            }
          }
        ]
      }
    }
  }
}
```

### Barra Lateral (Ecosistema) - Configuración Global

```json
// config/ui.json
{
  "ecosystem_toolbar": {
    "icons": [
      { "id": "modulos", "icon": "🧩", "label": "Módulos" },
      { "id": "config", "icon": "⚙️", "label": "Sistema" },
      { "id": "notificaciones", "icon": "🔔", "label": "Alertas" },
      { "id": "usuario", "icon": "👤", "label": "Perfil" }
    ]
  }
}
```

### Barra Chat - Fija (No configurable)

```javascript
// Definida en ChatToolbar.svelte - NO cambia por módulo
const CHAT_TOOLBAR_TOP = [
  { id: 'modelo', icon: '🤖', label: 'Modelo IA' },
  { id: 'credencial', icon: '🔑', label: 'API Key' },
  { id: 'prompt', icon: '📝', label: 'Prompt' },
  { id: 'historial', icon: '💬', label: 'Historial' }
];

const CHAT_TOOLBAR_BOTTOM = [
  { id: 'herramientas', icon: '🔧', label: 'Tools' },
  { id: 'adjuntar', icon: '📎', label: 'Adjuntar' },
  { id: 'contexto', icon: '📋', label: 'Contexto' },
  { id: 'plugins', icon: '🔌', label: 'Plugins' }
];
```

---

## Checklist de Implementación

### Componente Base
- [ ] FloatingToolbar.svelte (posición, tamaño, expandible)
- [ ] ToolbarIcon.svelte (triple interacción)
- [ ] ToolbarPanel.svelte (ventanas flotantes)

### Barras Específicas
- [ ] ModuleToolbar.svelte (superior, configurable)
- [ ] EcosystemToolbar.svelte (lateral, ecosistema)
- [ ] ChatToolbar.svelte (sandwich, fijo)

### Chat
- [ ] ChatInput.svelte (fijo + expansión doble toque)
- [ ] ChatHistory.svelte (scroll, burbujas)
- [ ] TextExpandModal.svelte (editor 50%)

### Layout
- [ ] MobileChatWorkspace.svelte (integra todo)

### Paneles por Funcionalidad
- [ ] ModelSelector.svelte
- [ ] CredentialSelector.svelte
- [ ] PromptSelector.svelte
- [ ] ToolsPanel.svelte
- [ ] AttachPanel.svelte
- [ ] ContextPanel.svelte
- [ ] PluginsPanel.svelte
- [ ] HistoryPanel.svelte

---

## Resumen Ejecutivo

```
FILOSOFÍA:
"Todo accesible, nunca salir, foco siempre"

ESTRUCTURA:
3 barras flotantes (10-12mm) + zona central de trabajo

INTERACCIÓN:
Triple toque (1, 2, long) consistente en todos los iconos

DOMINIOS:
- Superior: Módulo actual (variable)
- Lateral: Ecosistema (estable)
- Inferior: IA/Chat sandwich (fijo)

VENTANAS:
Flotantes, nunca bloquean todo, chat siempre visible

INPUT:
Fijo pequeño, doble toque expande, Enter ≠ Enviar
```

---

## Componentes Reutilizables Implementados

### ChatAIWorkspace - Componente Principal

**Ubicación:** `frontend/src/lib/components/ai/ChatAIWorkspace.svelte`

El componente `ChatAIWorkspace` encapsula toda la funcionalidad del chat con IA, incluyendo todos los paneles de las sub-barras del chat. Es **completamente reutilizable** en cualquier módulo que necesite interfaz de chat con IA.

**Paneles incluidos:**

| Panel ID | Función | Descripción |
|----------|---------|-------------|
| `modelo-selector` | Selector de modelos | Lista modelos agrupados por proveedor (DeepSeek, OpenAI, Anthropic, Ollama) |
| `credencial-selector` | Selector de API Keys | Selección rápida de credencial para el chat |
| `prompts` | Prompts rápidos | Lista con favoritos y todos los prompts disponibles |
| `tools` | Herramientas | Toggle de herramientas agrupadas por categoría |
| `plugins` | Plugins | Activación/desactivación de plugins con versión |
| `contexto` | Contexto actual | Visualización del contexto con badges de estado |
| `stats` | Estadísticas | Métricas con barra de progreso |
| `settings` | Configuración | Vista general de configuración actual |

**Props del componente:**

```svelte
<ChatAIWorkspace
  currentPanel={string}              <!-- Panel activo -->
  availableModels={AIModel[]}        <!-- Modelos disponibles -->
  bind:selectedModelId={string}      <!-- ID del modelo seleccionado -->
  credentials={AICredential[]}       <!-- Credenciales disponibles -->
  bind:tools={AITool[]}              <!-- Herramientas con estado -->
  bind:plugins={AIPlugin[]}          <!-- Plugins con estado -->
  bind:contextItems={ContextItem[]}  <!-- Items de contexto -->
  bind:quickPrompts={QuickPrompt[]}  <!-- Prompts rápidos -->
  stats={{ total, validated, ... }}  <!-- Estadísticas -->

  on:modelSelect                     <!-- Evento: modelo seleccionado -->
  on:credentialSelect                <!-- Evento: credencial seleccionada -->
  on:toolToggle                      <!-- Evento: tool activada/desactivada -->
  on:pluginToggle                    <!-- Evento: plugin activado/desactivado -->
  on:promptApply                     <!-- Evento: prompt aplicado -->
  on:promptFavorite                  <!-- Evento: favorito toggled -->
  on:addCredential                   <!-- Evento: solicitud añadir credencial -->
  on:panelChange                     <!-- Evento: cambio de panel -->
>
  <!-- Slot para paneles custom -->
  <svelte:fragment slot="panel" let:panelId={customPanelId}>
    {#if customPanelId === 'mi-panel-custom'}
      <!-- Contenido custom -->
    {/if}
  </svelte:fragment>
</ChatAIWorkspace>
```

---

### Tipos Compartidos

**Ubicación:** `frontend/src/lib/components/ai/types.ts`

Tipos TypeScript compartidos para todos los componentes de IA:

```typescript
// Modelo de IA
interface AIModel {
  id: string;
  name: string;
  provider: 'DEEPSEEK' | 'OPENAI' | 'ANTHROPIC' | 'OLLAMA' | string;
  description?: string;
}

// Credencial
interface AICredential {
  key: string;
  provider: string;
  level: 'GLOBAL' | 'PROJECT' | 'CLIENT' | 'CUSTOM';
  identifier: string | null;
  api_key_preview: string;
}

// Herramienta
interface AITool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: string;
}

// Plugin
interface AIPlugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  version: string;
}

// Contexto
interface ContextItem {
  type: string;
  label: string;
  value: string;
  active: boolean;
}

// Prompt rápido
interface QuickPrompt {
  id: string;
  name: string;
  content: string;
  category: string;
  favorite: boolean;
}

// Mensaje de chat
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  provider?: string;
  model?: string;
  loading?: boolean;
}
```

**Helpers disponibles:**

```typescript
import {
  DEFAULT_MODELS,           // Array de modelos por defecto
  PROVIDER_ICONS,           // { DEEPSEEK: '🔮', OPENAI: '🤖', ... }
  TOOL_CATEGORY_ICONS,      // { menu: '🍽️', ai: '🤖', ... }
  getProviderIcon,          // (provider) => emoji
  getToolCategoryIcon,      // (category) => emoji
  getContextIcon            // (type) => emoji
} from '$components/ai';
```

---

### Generador Plop: chat-module

**Comando:** `npx plop chat-module`

Genera un módulo completo con interfaz de chat IA en segundos.

**Archivos generados:**

```
modules/{nombre}/
├── index.js              # Backend con handlers de chat
├── module.json           # Configuración del módulo
└── README.md             # Documentación

frontend/src/routes/{nombre}/
└── +page.svelte          # Frontend usando ChatAIWorkspace
```

**Prompts del generador:**

| Prompt | Descripción | Ejemplo |
|--------|-------------|---------|
| Nombre | kebab-case | `mi-chat-module` |
| Descripción | Descripción del módulo | `Chat para X` |
| Icono | Emoji | `🤖` |
| Placeholder | Texto del input | `Escribe tu mensaje...` |
| Tools | nombre:desc:cat | `parser:Extrae datos:ai` |
| Prompts | nombre:contenido | `Ejemplo:Genera un ejemplo` |

**Ejemplo de uso:**

```bash
$ npx plop chat-module

? 📦 Nombre del módulo: recetas-generator
? 📝 Descripción: Generador de recetas con IA
? 🔸 Icono: 🍳
? 💬 Placeholder: Describe la receta que quieres...
? 🔧 Tools: ocr:Lee ingredientes:ai,validator:Valida receta:recipe
? 📝 Prompts: Italiana:Receta italiana tradicional,Vegana:Receta 100% vegana

✅ Módulo con Chat IA creado
```

---

### Ejemplo de Implementación: Menu Generator

**Ubicación:** `frontend/src/routes/menu-generator/+page.svelte`

El módulo `menu-generator` es el ejemplo de referencia de una implementación completa con todas las funcionalidades del chat IA.

**Estructura de botones implementada:**

```
┌─────────────────────────────────────────────────────────────┐
│ [🍽️ Menús] [📋 Templates] [🔍 Filtros] [📊 Stats] [⬇️ Export] │  ← BARRA SUPERIOR
├─────────────────────────────────────────────────────────────┤
│                                                         [🏠]│
│                                                         [🧩]│
│              CONTENIDO PRINCIPAL                        [🔐]│  ← BARRA LATERAL
│              (Stats + Últimos menús)                    [⚙️]│
│                                                         [❓]│
├─────────────────────────────────────────────────────────────┤
│ [🤖 Modelo] [🔑 API Key] [📝 Prompt] [💬 Chats]             │  ← SUB-BARRA CHAT TOP
├─────────────────────────────────────────────────────────────┤
│  [Describe el menú que quieres generar...]        [Enviar]  │  ← INPUT
├─────────────────────────────────────────────────────────────┤
│ [🔧 Tools] [📎 Adjuntar] [📋 Contexto] [🔌 Plugins]         │  ← SUB-BARRA CHAT BOTTOM
├─────────────────────────────────────────────────────────────┤
│ [🕐 Historial]                                              │  ← BARRA INFERIOR
└─────────────────────────────────────────────────────────────┘
```

**Paneles implementados:**

| Barra | Paneles |
|-------|---------|
| Superior | menus, menus-gestionar, templates, template-aplicar, filtros, stats, stats-detallado, export, export-lote, upload |
| Lateral | modulos, credentials, credential-add, credential-edit, settings, settings-full, help |
| Chat Top | modelo-selector, modelo-config, credencial-selector, prompts, prompt-crear, conversations, historial-gestionar |
| Chat Bottom | tools, tools-config, contexto, contexto-editar, plugins, plugins-gestionar |
| Inferior | history |

**Datos de estado definidos:**

```typescript
// Modelos IA disponibles
let availableModels: AIModel[] = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DEEPSEEK' },
  { id: 'gpt-4', name: 'GPT-4', provider: 'OPENAI' },
  // ...
];

// Herramientas específicas del módulo
let availableTools: Tool[] = [
  { id: 'menu-parser', name: 'Parser de Menús', category: 'menu', enabled: true },
  { id: 'image-ocr', name: 'OCR de Imágenes', category: 'ai', enabled: true },
  // ...
];

// Plugins disponibles
let availablePlugins: Plugin[] = [
  { id: 'menu-validator', name: 'Validador de Menús', enabled: true, version: '1.0.0' },
  // ...
];

// Prompts rápidos
let quickPrompts: QuickPrompt[] = [
  { id: 'p1', name: 'Menú italiano', content: 'Genera un menú italiano...', favorite: true },
  // ...
];

// Contexto del módulo
let contextItems: ContextItem[] = [
  { type: 'menu', label: 'Menú actual', value: '', active: false },
  { type: 'style', label: 'Estilo', value: 'Restaurante', active: true },
  // ...
];
```

---

### Cómo Reutilizar en Otro Módulo

**Opción 1: Usar el generador plop (recomendado)**

```bash
npx plop chat-module
```

Esto genera todo automáticamente con la estructura correcta.

**Opción 2: Implementación manual**

1. **Importar componentes:**

```svelte
<script>
  import { MobileWorkspaceLayout } from '$components/layout';
  import {
    ChatAIWorkspace,
    DEFAULT_MODELS,
    type AIModel,
    type AITool,
    type QuickPrompt
  } from '$components/ai';
</script>
```

2. **Definir estado:**

```typescript
let availableModels = DEFAULT_MODELS;
let selectedModelId = 'deepseek-chat';
let credentials = [];  // Fetch from credential-manager
let tools = [...];     // Específicas del módulo
let quickPrompts = [...]; // Específicas del módulo
let currentPanel = '';
```

3. **Definir botones de barras:**

```typescript
const chatTopButtons = [
  {
    id: 'modelo',
    emoji: '🤖',
    label: 'Modelo',
    primaryAction: { type: 'panel', panelId: 'modelo-selector' }
  },
  // ...
];

const chatBottomButtons = [
  {
    id: 'tools',
    emoji: '🔧',
    label: 'Tools',
    primaryAction: { type: 'panel', panelId: 'tools' }
  },
  // ...
];
```

4. **Usar en template:**

```svelte
<MobileWorkspaceLayout
  {topButtons}
  {bottomButtons}
  {sideButtons}
  {chatTopButtons}
  {chatBottomButtons}
  showChat={true}
  showChatBars={true}
  on:panelOpen={e => currentPanel = e.detail.panelId}
  on:panelClose={() => currentPanel = ''}
>
  <!-- Contenido principal -->

  <svelte:fragment slot="panel" let:panelId>
    <ChatAIWorkspace
      currentPanel={panelId}
      {availableModels}
      bind:selectedModelId
      {credentials}
      bind:tools
      on:modelSelect={handleModelSelect}
    />
  </svelte:fragment>
</MobileWorkspaceLayout>
```

---

### Checklist de Implementación Actualizado

#### Componentes Base (Implementados)
- [x] MobileWorkspaceLayout.svelte
- [x] ToolbarIcon.svelte
- [x] ChatToolbar.svelte
- [x] FloatingPanel.svelte

#### Componentes de IA (Implementados)
- [x] ChatAIWorkspace.svelte
- [x] types.ts (tipos compartidos)
- [x] ChatInput.svelte
- [x] ConversationPanel.svelte

#### Paneles del ChatAIWorkspace (Implementados)
- [x] modelo-selector
- [x] credencial-selector
- [x] prompts
- [x] tools
- [x] plugins
- [x] contexto
- [x] stats
- [x] settings

#### Generadores Plop
- [x] `npx plop module` - Módulo backend básico
- [x] `npx plop full-module` - Módulo con UI CRUD
- [x] `npx plop chat-module` - Módulo con Chat IA
- [x] `npx plop svelte-component` - Componente Svelte
- [x] `npx plop from-blueprint` - Desde YAML

#### Ejemplo de Referencia
- [x] menu-generator (+page.svelte con todas las funcionalidades)

---

## Resumen de Archivos Clave

```
frontend/src/lib/components/
├── ai/
│   ├── index.ts                    # Exports
│   ├── types.ts                    # Tipos compartidos
│   ├── ChatAIWorkspace.svelte      # Componente reutilizable principal
│   ├── ChatInput.svelte            # Input de chat
│   └── ConversationPanel.svelte    # Panel de conversaciones
│
├── layout/
│   └── MobileWorkspaceLayout.svelte  # Layout principal móvil
│
└── toolbar/
    ├── ToolbarIcon.svelte          # Icono con triple interacción
    ├── ChatToolbar.svelte          # Sub-barras del chat
    └── MobileChatWorkspace.svelte  # Workspace de chat

plop-templates/
├── module/                         # Templates módulo básico
├── full-module/                    # Templates módulo con UI
├── chat-module/                    # Templates módulo con Chat IA
│   ├── index.js.hbs
│   ├── module.json.hbs
│   └── page.svelte.hbs
└── svelte-component/               # Templates componente Svelte

frontend/src/routes/
└── menu-generator/
    └── +page.svelte                # Ejemplo de implementación completa
```

---

**Este documento es la referencia canónica para toda la UI móvil de Event Core.**

Cualquier implementación debe seguir estos principios y patrones.
