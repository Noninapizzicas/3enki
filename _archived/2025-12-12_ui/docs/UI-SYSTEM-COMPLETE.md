# UI System Complete - Event Core

**Versión:** 2.0.0
**Fecha:** 2025-12-10
**Estado:** Documento unificado (CONTEXT_UI + UI-SYSTEM-PLAN)

---

# PARTE 1: FILOSOFÍA Y PRINCIPIOS

## El Problema que Resolvemos

> **La distracción es el enemigo de la productividad.**

Cada vez que un usuario "sale" de su contexto de trabajo:
- Abre Google → se distrae → 10 minutos perdidos
- Abre Instagram → se distrae → 15 minutos perdidos
- Cambia de app → pierde el foco → cuesta volver

## La Solución

**Una interfaz donde TODO está accesible SIN salir del contexto de trabajo.**

- El usuario nunca pierde el foco
- Acceso puntual a cualquier función
- El trabajo siempre visible como referencia
- La IA es herramienta, no el centro

## Filosofía Base

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

# PARTE 2: ARQUITECTURA DE INTERFAZ

## Vista General - Las 3 Barras

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

## Medidas

| Elemento | Tamaño | Comportamiento |
|----------|--------|----------------|
| Barras colapsadas | 10-12mm | Solo iconos visibles |
| Barras expandidas | Variable | Iconos + etiquetas + contenido |
| Input de texto | Fijo pequeño | Doble toque para expandir |
| Ventanas flotantes | 30-50% pantalla | Sobre el contenido, chat visible atrás |

---

## Barra Superior - Módulo/Trabajo

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
| Menu Generator | Menús, Templates, Filtros, Stats, Export |

**Por qué arriba:** Es lo primero que ves, relacionado con TU trabajo actual.

---

## Barra Lateral - Ecosistema

**Posición:** Lado derecho de la pantalla
**Dominio:** Sistema general, navegación global
**Configuración:** MÁS ESTABLE (ecosistema común)

```
┌───┐
│ ● │  🧩 Módulos
│ ● │  ⚙️ Sistema
│ ● │  🔔 Alertas
│ ● │  👤 Perfil
│[◄]│  Toggle expand
└───┘
```

**Contenido típico:**

| Icono | Función |
|-------|---------|
| 🧩 Módulos | Navegar entre módulos disponibles |
| ⚙️ Configuración | Ajustes del sistema |
| 🔔 Notificaciones | Alertas y avisos |
| 👤 Usuario | Perfil y sesión |

**Por qué lateral:** Es el "ecosistema", lo que rodea tu trabajo pero no es el trabajo en sí.

---

## Barra Chat - IA (Estructura Sandwich)

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

### Sub-barra Superior (PREPARA el mensaje)
Lo que configuras ANTES de escribir

| Icono | Función | Componente |
|-------|---------|------------|
| 🤖 Modelo | Seleccionar modelo IA activo | `AIButton` |
| 🔑 Credencial | API Key / credencial activa | `CredentialButton` |
| 📝 Prompt | Templates de prompts | `PromptButton` |
| 💬 Historial | Conversaciones anteriores | `ConversationButton` |

### Sub-barra Inferior (COMPLEMENTA el mensaje)
Lo que añades DESPUÉS de escribir

| Icono | Función | Componente |
|-------|---------|------------|
| 📁 Files | Explorador de archivos | `FileBrowserButton` |
| 🔧 Tools | Herramientas disponibles | `ToolbarIcon` |
| 📎 Adjuntar | Archivos, imágenes, documentos | `ToolbarIcon` |
| 📋 Contexto | Contexto actual del módulo | `ToolbarIcon` |
| 🔌 Plugins | Plugins activos | `ToolbarIcon` |

### Flujo Cognitivo Natural
```
1. Miro arriba → ¿Qué modelo? ¿Qué prompt?
2. Escribo en el input
3. Miro abajo → ¿Adjunto algo? ¿Activo tools?
4. Envío
```

---

# PARTE 3: SISTEMA DE TRIPLE INTERACCIÓN

## El Patrón Universal

Cada icono en las barras tiene 3 niveles de interacción:

| Gesto | Acción | Uso típico | Frecuencia |
|-------|--------|------------|------------|
| **1 toque/click** | Panel rápido | Ver y seleccionar | 90% |
| **2 toques/doble click** | Crear nuevo | Añadir elemento | 8% |
| **Long-press/click derecho** | Gestión completa | Editar, borrar, configurar | 2% |

## Feedback Visual

```
1 toque:
[●] → Panel aparece inmediatamente

2 toques:
[●] → [●] → Modal de creación

Long-press:
[●]━━━━━● → Círculo de progreso mientras mantienes
           → Modal de gestión al completar
```

## Timings

```typescript
const TIMING = {
  tapDelay: 250,        // Espera para distinguir tap de doubleTap
  doubleTapMax: 300,    // Máximo entre dos taps para ser doubleTap
  longPressDuration: 500 // Duración para activar longPress
};
```

## Descubribilidad

La triple interacción NO es obvia. Estrategias para enseñarla:

1. **Onboarding inicial:** Tutorial breve la primera vez
2. **Tooltips contextuales:** "Mantén pulsado para más opciones"
3. **Indicador visual:** Círculo que se llena durante long-press
4. **Consistencia:** TODOS los iconos funcionan igual

---

# PARTE 4: SISTEMA DE PANELES FLOTANTES

## Estructura por Módulo

Cada módulo tiene **2-3 paneles** según necesidad:

| Panel | Propósito | PC | Móvil | ¿Obligatorio? |
|-------|-----------|-----|-------|---------------|
| **Select** | Ver/elegir items | Click | Tap | ✅ Sí |
| **Add** | Crear nuevo | Doble click | Doble tap | ⚠️ Opcional |
| **Config** | Config/avanzado | Click derecho | Long press | ✅ Sí |

### Decisión `enableAdd`

```
¿Se puede CREAR un nuevo elemento desde la UI?
    │
    ├── SÍ → enableAdd = true (3 interacciones)
    │        Ejemplos: credential-manager, prompt-manager
    │
    └── NO → enableAdd = false (2 interacciones)
             Requiere archivos/config backend
             Ejemplos: ai-gateway (providers en JSON)
```

## Comportamiento de Paneles

- Paneles aparecen flotantes sobre el workspace
- **Click/tap fuera del panel → se cierra** (siempre)
- **ESC → se cierra** (siempre)
- Sin navegación tradicional, todo contextual
- Siempre centrados

## Tipos de Ventana

| Tipo | Tamaño | Cuándo aparece |
|------|--------|----------------|
| Panel rápido | 20-30% | 1 toque - selección rápida |
| Modal crear | 40-50% | 2 toques - formulario creación |
| Modal gestión | 60-80% | Long-press - lista completa + acciones |
| Editor texto | 50% | Doble toque en input |

## Z-Index Strategy

```css
z-index: 10   → Zona central (chat/trabajo)
z-index: 100  → Barras flotantes
z-index: 200  → Panel rápido (1 toque)
z-index: 300  → Modal crear (2 toques)
z-index: 400  → Modal gestión (long-press)
z-index: 500  → Editor texto expandido
z-index: 999  → Overlays críticos (confirmaciones)
```

---

# PARTE 5: COMPONENTES BASE

## Arquitectura Component-First

> **Principio fundamental: Máxima reutilización, mínima duplicación.**

```
┌─────────────────────────────────────────────────────────────┐
│                   CAPA 1: COMPONENTES BASE                  │
│              (Patrones reutilizables en TODO)               │
├─────────────────────────────────────────────────────────────┤
│  ToolbarIcon    │  FloatingPanel  │  ActionForm             │
│  SelectList     │  ToggleList     │                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              CAPA 2: COMPONENTES ESPECÍFICOS                │
│           (Combinan base + lógica de dominio)               │
├─────────────────────────────────────────────────────────────┤
│  AIButton, CredentialButton, PromptButton...                │
│  {Module}AddPanel, {Module}ConfigPanel...                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 CAPA 3: LAYOUTS/PÁGINAS                     │
├─────────────────────────────────────────────────────────────┤
│  MobileWorkspaceLayout, MobileChatWorkspace                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. ToolbarIcon

> **Ubicación:** `$components/toolbar/uisis-ToolbarIcon.svelte`

Botón con triple interacción universal.

### Props

```typescript
interface ToolbarIconProps {
  id: string;
  icon: string;              // Emoji
  label?: string;
  badge?: number | string;
  badgeColor?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  displayValue?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  active?: boolean;
  disabled?: boolean;
  showLabel?: boolean;
  orientation?: 'horizontal' | 'vertical';
  longPressDuration?: number;  // default: 500ms
  doubleTapDelay?: number;     // default: 250ms
}
```

### CSS Variables

```css
--icon-size: 36px;
--icon-font-size: 1rem;
--icon-radius: 8px;
--icon-bg, --icon-bg-hover, --icon-bg-active
```

### Eventos

- `tap` - 1 toque
- `doubleTap` - 2 toques
- `longPress` - Pulsación larga

### Uso

```svelte
<ToolbarIcon
  id="modelo"
  icon="🤖"
  label="Modelo"
  displayValue={currentModel}
  on:tap={() => openPanel('select')}
  on:doubleTap={() => openPanel('add')}
  on:longPress={() => openPanel('config')}
/>
```

---

## 2. FloatingPanel

> **Ubicación:** `$components/feedback/FloatingPanel.svelte`

Panel/ventana emergente universal.

### Comportamiento

- Aparece sobre el contenido (overlay con fondo oscuro)
- **Tap fuera = cerrar** (siempre)
- **Siempre centrado**
- **Sin título** (el contenido define su propio header)
- ESC también cierra

### Props

```typescript
interface FloatingPanelProps {
  open: boolean;
}
```

### CSS Variables

```css
--panel-padding: 1rem;
--panel-radius: 12px;
--panel-bg: var(--color-bg-card);
--panel-shadow: 0 4px 24px rgba(0,0,0,0.2);
--panel-max-width: 90vw;
--panel-max-height: 80vh;
```

### Uso

```svelte
<FloatingPanel bind:open={panelOpen} on:close={() => panelOpen = false}>
  <h3>Seleccionar Modelo</h3>
  <ModelList {models} on:select={handleSelect} />
</FloatingPanel>
```

---

## 3. ActionForm

> **Ubicación:** `$components/ui/ActionForm.svelte`

Formulario con campos y acciones.

### Props

```typescript
interface ActionFormProps {
  fields: FormField[];
  actions?: FormAction[];
  loading?: boolean;
  disabled?: boolean;
}

interface FormField {
  name: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'password' | 'number';
  label: string;
  placeholder?: string;
  required?: boolean;
  value?: string | number | boolean;
  options?: { value: string; label: string }[];
}

interface FormAction {
  label: string;
  emit: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: string;
  validate?: boolean;
}
```

### Uso

```svelte
<ActionForm
  fields={[
    { name: 'nombre', type: 'text', label: 'Nombre', required: true },
    { name: 'nivel', type: 'select', label: 'Nivel', options: [...] }
  ]}
  actions={[
    { label: 'Cancelar', emit: 'cancel', variant: 'ghost' },
    { label: 'Guardar', emit: 'save', variant: 'primary' }
  ]}
  on:cancel={close}
  on:save={handleSave}
/>
```

---

## 4. SelectList

> **Ubicación:** `$components/ui/SelectList.svelte`

Lista de selección única con grupos acordeón.

### Props

```typescript
interface SelectListProps {
  items: SelectItem[];
  value?: string;
  groups?: SelectGroup[];
  searchable?: boolean;    // default: true
  accordion?: boolean;     // default: true
}

interface SelectItem {
  id: string;
  label: string;
  group?: string;
  icon?: string;
  badge?: string;
  disabled?: boolean;
}
```

### Uso

```svelte
<SelectList
  {value}
  items={models}
  groups={providers}
  on:select={({ detail }) => value = detail.item.id}
/>
```

---

## 5. ToggleList

> **Ubicación:** `$components/ui/ToggleList.svelte`

Lista de selección múltiple con grupos visuales.

### Props

```typescript
interface ToggleListProps {
  items: ToggleItem[];
  values: string[];
  groups?: ToggleGroup[];
  showSelectAll?: boolean;
  max?: number;
}
```

### Uso

```svelte
<ToggleList
  values={enabledTools}
  items={tools}
  groups={categories}
  showSelectAll
  max={5}
  on:change={({ detail }) => enabledTools = detail.values}
/>
```

---

## Componentes de Módulo (Button + Panels)

Cada módulo tiene 3 componentes con prefijo `uisis-`:

```
frontend/src/lib/components/{modulo}/
├── uisis-{Modulo}Button.svelte      # Botón con 2-3 interacciones
├── uisis-{Modulo}AddPanel.svelte    # Solo si enableAdd=true
├── uisis-{Modulo}ConfigPanel.svelte # Siempre
└── index.ts                         # Exports
```

### Componentes Implementados

| Módulo | Button | AddPanel | ConfigPanel |
|--------|--------|----------|-------------|
| ai | ✅ `AIButton` | ❌ | ✅ `AIConfigPanel` |
| credentials | ✅ `CredentialButton` | ✅ | ✅ |
| prompts | ✅ `PromptButton` | ✅ | ✅ |
| conversations | ✅ `ConversationButton` | ✅ | ✅ |
| projects | ✅ `ProjectButton` | ✅ | ✅ |
| menu | ✅ `MenuGeneratorButton` | ✅ | ✅ |
| files | ✅ `FileBrowserButton` | ✅ | ✅ |

---

# PARTE 6: REGLAS DE CÓDIGO

## Naming Conventions

| Tipo | Formato | Ejemplo |
|------|---------|---------|
| Módulo backend | kebab-case | `ai-gateway` |
| Archivo JS | kebab-case | `context-manager.js` |
| Componente Svelte | PascalCase | `FloatingPanel.svelte` |
| **Componente UI-SYSTEM** | **uisis-PascalCase** | `uisis-ToolbarIcon.svelte` |
| Store Svelte | camelCase | `mqttStore.ts` |
| Evento MQTT | dot.notation | `ai.model.selected` |
| Constante | UPPER_SNAKE | `EVENTS.AI.MODEL_SELECTED` |
| Variable/función | camelCase | `handleModelSelect` |
| Prop Svelte | camelCase | `selectedModelId` |
| CSS class | kebab-case | `floating-panel` |

## Prefijo `uisis-`

Los componentes que cumplen con este sistema llevan prefijo `uisis-`:

```
uisis-ToolbarIcon.svelte     ✅ Cumple UI-SYSTEM
ToolbarIcon.svelte           ❌ Versión legacy (deprecated)
```

**Beneficios:**
- Identificación inmediata de componentes alineados
- Migración gradual sin romper código existente
- Los exports mantienen nombres limpios

---

## Estructura de Archivos

### Backend (Módulos)

```
modules/{nombre}/
├── index.js          # Lógica del módulo (obligatorio)
├── module.json       # Configuración y eventos (obligatorio)
├── README.md         # Documentación
└── schemas/          # JSON Schemas (si tiene APIs)
```

### Frontend (Componentes)

```
frontend/src/lib/components/
├── ui/               # Componentes base (Button, Input, Card...)
├── feedback/         # Feedback (Modal, Toast, FloatingPanel...)
├── layout/           # Layouts (MobileWorkspaceLayout...)
├── toolbar/          # Barras y botones (ToolbarIcon, ChatToolbar...)
├── chat/             # ChatInputBar con módulos integrados
├── ai/               # AIButton, AIConfigPanel, ChatInput
├── credentials/      # CredentialButton, AddPanel, ConfigPanel
├── prompts/          # PromptButton, AddPanel, ConfigPanel
├── projects/         # ProjectButton, AddPanel, ConfigPanel
├── conversations/    # ConversationButton, AddPanel, ConfigPanel
├── menu/             # MenuGeneratorButton, AddPanel, ConfigPanel
├── files/            # FileBrowserButton, AddPanel, ConfigPanel
└── ecosystem/        # EcosystemToolbar
```

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
  /* Estilos con CSS variables */
</style>
```

### Reglas

- **Props tipadas** con TypeScript
- **Eventos tipados** con `createEventDispatcher<T>`
- **CSS variables** heredables del padre
- **Sin lógica de negocio** en componentes UI base
- **Componentes pequeños** (<200 líneas ideal, máximo 300)

---

## Reglas de CSS

### Fuente única de tokens

```
design-system/tokens.json → tailwind.config.js
```

### Uso de colores

```html
<!-- ✅ Bien -->
<div class="bg-bg-card text-text border-border">

<!-- ❌ Mal -->
<div class="bg-[#1a1d24] text-white border-gray-700">
```

### Patrón CSS Variables

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
  background: hsla(217, 91%, 60%, 0.1); /* ❌ Incorrecto - no usar HSL */
}
```

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

### Patrón de llamada

```typescript
import { api } from '$lib/config';

// ✅ Correcto
const res = await fetch(api.moduleApi('mi-modulo', '/ui/state'));

// ❌ Incorrecto
const res = await fetch(`/api/modules/mi-modulo/ui/state`);
```

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
❌ Usar HSL para colores (usar RGB o variables)
```

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

# PARTE 7: PROCESO DE IMPLEMENTACIÓN

## Antes de Codificar (OBLIGATORIO)

### 1. Análisis del Módulo - 6 Preguntas

| # | Pregunta | Ejemplo |
|---|----------|---------|
| 1 | ¿Qué **SELECCIONA** el usuario? | Credencial existente |
| 2 | ¿Qué **AÑADE** el usuario? | Nueva API key |
| 3 | ¿Qué **CONFIGURA** el usuario? | Editar/eliminar credencial |
| 4 | ¿Qué **datos** necesita del backend? | GET /ui/state |
| 5 | ¿Qué **eventos** emite? | credential.saved |
| 6 | ¿Cómo se **integra** con otros módulos? | Necesita project-manager |

### 2. Decidir enableAdd

```
¿Se puede CREAR un nuevo elemento desde la UI?
    │
    ├── SÍ → enableAdd = true
    │
    └── NO → enableAdd = false (requiere backend)
```

### 3. Boceto ASCII de cada Panel

```
┌─────────────────────────────────────────┐
│  🔐 Seleccionar [Entidad]               │
│  ───────────────────────────────────────│
│  ┌─────────────────────────────────┐    │
│  │ 🔍 Buscar...                    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── Grupo 1 ─────────────────────────   │
│  ┌─────────────────────────────────┐    │
│  │ 📄 Item 1                    ✓  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 4. Checklist Pre-Código

```
[ ] 6 preguntas respondidas
[ ] enableAdd decidido (true/false)
[ ] Boceto de Panel Select
[ ] Boceto de Panel Add (si enableAdd)
[ ] Boceto de Panel Config
[ ] Endpoints identificados
[ ] Eventos identificados
[ ] Integraciones con otros módulos
```

---

## Flujo de Trabajo

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

## Estructura de Archivos por Módulo

```
frontend/src/lib/components/{modulo}/
├── uisis-{Modulo}Button.svelte      # Botón con 2-3 interacciones
├── uisis-{Modulo}AddPanel.svelte    # Solo si enableAdd=true
├── uisis-{Modulo}ConfigPanel.svelte # Siempre
└── index.ts                         # Exports
```

---

## Patrón de Commits

```bash
# Primer commit: componentes principales
feat(ui): add {Modulo}AddPanel, {Modulo}ConfigPanel

# Segundo commit: botón unificado
feat(ui): complete {modulo} UI with triple interaction

# Fix de compliance
fix(ui): use api.moduleApi() helper instead of hardcoded paths
```

---

# PARTE 8: ESTADO DE MÓDULOS

## Módulos Principales

| Módulo | enableAdd | Integración | Estado |
|--------|-----------|-------------|--------|
| `ai-gateway` | ❌ No | - | ✅ Completo |
| `credential-manager` | ✅ Sí | project-manager | ✅ Completo |
| `prompt-manager` | ✅ Sí | - | ✅ Completo |
| `conversation-manager` | ✅ Sí | project-manager | ✅ Completo |
| `project-manager` | ✅ Sí | - | ✅ Completo |
| `menu-generator` | ✅ Sí | - | ✅ Completo |
| `file-browser` | ✅ Sí | project-manager | ✅ Completo |
| `text-editor` | ❌ No | file-browser | ✅ Completo |
| `pdf-viewer` | ❌ No | file-browser | ✅ Completo |

## Componentes de Toolbar

| Componente | Ubicación | Estado |
|------------|-----------|--------|
| `uisis-ToolbarIcon` | `toolbar/` | ✅ Completo |
| `uisis-FloatingToolbar` | `toolbar/` | ✅ Completo |
| `uisis-TopToolbar` | `toolbar/` | ✅ Completo |
| `uisis-ModuleToolbar` | `toolbar/` | ✅ Completo |
| `uisis-ChatToolbar` | `toolbar/` | ✅ Completo |
| `uisis-EcosystemToolbar` | `ecosystem/` | ✅ Completo |
| `uisis-MobileChatWorkspace` | `toolbar/` | ✅ Completo |
| `uisis-MobileWorkspaceLayout` | `layout/` | ✅ Completo |
| `uisis-ChatInputBar` | `chat/` | ✅ Completo |

## Componentes de Módulos (Button + Panels)

| Módulo | Button | AddPanel | ConfigPanel | CSS Tokens |
|--------|--------|----------|-------------|------------|
| menu-generator | ✅ | ✅ | ✅ | ✅ |
| credential-manager | ✅ | ✅ | ✅ | ✅ |
| prompt-manager | ✅ | ✅ | ✅ | ✅ |
| conversation-manager | ✅ | ✅ | ✅ | ✅ |
| project-manager | ✅ | ✅ | ✅ | ✅ |
| file-browser | ✅ | ✅ | ✅ | ✅ |
| ai-gateway | ✅ | ❌ | ✅ | ✅ |

---

# PARTE 9: PERFIL DEL EJECUTOR

## Formación Técnica

| Área | Nivel | Conocimientos |
|------|-------|---------------|
| JavaScript/TypeScript | Avanzado | ES6+, async/await, tipos |
| Svelte/SvelteKit | Intermedio-Avanzado | Componentes, stores, eventos |
| CSS/Tailwind | Intermedio | Flexbox, Grid, variables CSS |
| Event-Driven | Intermedio | Pub/Sub, MQTT |
| REST APIs | Intermedio | Diseño, consumo |

## Habilidades Requeridas

```
DISEÑO:
├── Pensamiento visual (bocetos rápidos)
├── Diagramación de flujos
├── Identificación de estados UI
└── Simplificación de interfaces

CÓDIGO:
├── Componentización
├── Reutilización
├── Tipado estricto
└── Código limpio

SISTEMA:
├── Entender arquitectura event-driven
├── Separar responsabilidades
├── API-first thinking
└── Debugging de eventos asíncronos
```

## Carácter Obligatorio

```
MINIMALISTA
└── Pregunta: "¿Puedo hacerlo con menos?"

METÓDICO
└── Sigue el proceso: Análisis → Boceto → Código

PRAGMÁTICO
└── Prioriza: Funciona > Perfecto

CONSISTENTE
└── Sigue convenciones, no inventa
```

## Anti-perfil (NO debe ser)

```
❌ PERFECCIONISTA PARALIZANTE
❌ SOBRE-INGENIERO
❌ COWBOY (salta bocetos)
❌ ACUMULADOR (añade features "por si acaso")
❌ INCONSISTENTE
```

---

# RESUMEN EJECUTIVO

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

PANELES:
- Select (tap) - obligatorio
- Add (doble tap) - opcional (enableAdd)
- Config (long press) - obligatorio

CÓDIGO:
- Prefijo uisis- para componentes del sistema
- CSS variables con fallbacks
- TypeScript tipado
- Componentes < 200 líneas

PROCESO:
1. 6 preguntas de análisis
2. Bocetos ASCII obligatorios
3. Checklist pre-código
4. Implementar
5. Verificar móvil + PC
```

---

**Este documento es la referencia canónica para toda la UI de Event Core.**

Cualquier implementación debe seguir estos principios, patrones y reglas.
