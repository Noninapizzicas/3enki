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

Cada módulo tiene **2-3 paneles** según necesidad:

| Panel | Propósito | Invocación PC | Invocación Móvil | ¿Obligatorio? |
|-------|-----------|---------------|------------------|---------------|
| **Select** | Ver/elegir items | Click | Tap | ✅ Sí |
| **Add** | Crear nuevo | Doble click | Doble tap | ⚠️ Opcional |
| **Extra** | Config/avanzado | Click derecho | Long press | ✅ Sí |

**Nota:** El panel **Add** solo es necesario si el módulo permite crear nuevos elementos desde la UI.
Si crear un nuevo elemento requiere modificar archivos o configuración backend, Add NO aplica.

Ejemplos:
- `credential-manager`: Add ✅ (crear API key desde UI)
- `ai-gateway`: Add ❌ (añadir provider requiere archivos backend)

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
<!-- 2 interacciones (sin Add) - default -->
<ModuleButton
  module="ai-gateway"
  icon="🤖"
  label="AI"
  on:select={openSelectPanel}
  on:extra={openExtraPanel}
/>

<!-- 3 interacciones (con Add) -->
<ModuleButton
  module="credential-manager"
  icon="🔐"
  label="Creds"
  enableAdd={true}
  on:select={openSelectPanel}
  on:add={openAddPanel}
  on:extra={openExtraPanel}
/>
```

Interacciones:
- PC: click / doble click (si `enableAdd=true`) / click derecho
- Móvil: tap / doble tap (si `enableAdd=true`) / long press

**Prop `enableAdd`:**
- `false` (default): Doble tap/click no hace nada
- `true`: Doble tap/click emite evento `on:add`

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
| ¿Paneles? | Select (elegir), Config (parámetros LLM) |
| ¿enableAdd? | ❌ No - añadir provider requiere archivos backend |

---

## Módulos Principales

| Módulo | Paneles | enableAdd | Prioridad |
|--------|---------|-----------|-----------|
| `ai-gateway` | Select, Config | ❌ No | Alta |
| `credential-manager` | Select, Add, Config | ✅ Sí | Alta |
| `prompt-manager` | Select, Add, Config | ✅ Sí | Alta |
| `conversation-manager` | Select, Add, Config | ✅ Sí | Media |
| `project-manager` | Select, Add, Config | ✅ Sí | Media |

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

### Patrón: 2-3 paneles por módulo

| Panel | Invocación | Propósito | ¿Obligatorio? |
|-------|------------|-----------|---------------|
| Select | 1 tap / click | Ver y elegir | ✅ Siempre |
| Add | 2 taps / doble click | Crear nuevo | ⚠️ Si enableAdd=true |
| Extra | Long press / click derecho | Config/gestión | ✅ Siempre |

**Decidir si Add aplica:**
- ¿Se puede crear desde UI? → enableAdd=true
- ¿Requiere archivos/backend? → enableAdd=false (default)

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
- 2-3 paneles por módulo (Select + Config obligatorios, Add opcional)
- enableAdd=true → 3 interacciones (tap/doble tap/long press)
- enableAdd=false → 2 interacciones (tap/long press)
- Tap fuera = cerrar (siempre)
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
- 2-3 paneles por módulo (Select + Config obligatorios, Add opcional)
- ModuleButton con enableAdd prop (2 o 3 interacciones)
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

## PASO 2: Decisión enableAdd

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

---

## PASO 3: Bocetos ASCII

Crear bocetos para cada panel ANTES de codificar:

### Panel Select (tap/click)
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
│  ┌─────────────────────────────────┐    │
│  │ 📄 Item 2                       │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Panel Add (doble tap) - Solo si enableAdd=true
```
┌─────────────────────────────────────────┐
│  ➕ Nueva [Entidad]                     │
│  ───────────────────────────────────────│
│                                         │
│  Campo 1                                │
│  ┌─────────────────────────────────┐    │
│  │ valor...                        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Campo 2 (si depende de otro módulo)    │
│  ┌─────────────────────────────────┐    │
│  │ 📁 Selector de otro módulo   ▼  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌──────────┐  ┌──────────────────┐     │
│  │ Cancelar │  │     ✓ Guardar   │     │
│  └──────────┘  └──────────────────┘     │
└─────────────────────────────────────────┘
```

### Panel Config (long press/click derecho)
```
┌─────────────────────────────────────────┐
│  ⚙️ Configurar [Entidad]                │
│  ───────────────────────────────────────│
│                                         │
│  📄 [Nombre del item seleccionado]      │
│                                         │
│  [Campos editables]                     │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  🧪 Probar / Validar             │   │
│  └──────────────────────────────────┘   │
│                                         │
│  ┌─────────┐ ┌────────┐ ┌─────────┐    │
│  │ 🗑️ Del. │ │ Cancel │ │  Save   │    │
│  └─────────┘ └────────┘ └─────────┘    │
└─────────────────────────────────────────┘
```

---

## PASO 4: Checklist Pre-Código

```
[ ] SelectorPanel tiene adapter para este módulo
[ ] Panel Add necesario? (enableAdd=true)
[ ] Panel Config necesario? (siempre sí)
[ ] Button unificado con gestos
[ ] Integración con otros módulos identificada
```

---

## PASO 5: Estructura de Archivos

```
frontend/src/lib/components/{modulo}/
├── {Modulo}Button.svelte      # Botón con 2-3 interacciones
├── {Modulo}AddPanel.svelte    # Solo si enableAdd=true
├── {Modulo}ConfigPanel.svelte # Siempre
└── index.ts                   # Exports
```

El **SelectorPanel** es genérico y vive en `feedback/`:
```
frontend/src/lib/components/feedback/
├── FloatingPanel.svelte       # Panel base
├── SelectorPanel.svelte       # Selector genérico con adapters
└── index.ts
```

---

## PASO 6: Crear Componentes

### 6.1 {Modulo}Button.svelte

```svelte
<!--
  {Modulo}Button.svelte
  Botón con interacción dual/triple según enableAdd
-->
<script lang="ts">
  // Props
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let projectId: string | null = null;
  export let disabled = false;

  // Paneles
  let selectorOpen = false;
  let addOpen = false;      // Solo si enableAdd
  let configOpen = false;

  // Gestos
  const TIMING = {
    tapDelay: 250,
    doubleTapMax: 300,
    longPressDuration: 500
  };

  // Acciones
  function doSelect() { selectorOpen = true; }
  function doAdd() { addOpen = true; }     // Solo si enableAdd
  function doConfig() { configOpen = true; }
</script>
```

### 6.2 {Modulo}AddPanel.svelte (si enableAdd=true)

```svelte
<!--
  Integración con otros módulos:
  Si un campo depende de otro módulo, hacer fetch:

  $: if (needsOtherModule) {
    fetch(api.moduleApi('otro-modulo', '/endpoint'));
  }
-->
```

### 6.3 {Modulo}ConfigPanel.svelte

```svelte
<!--
  Siempre incluir:
  - Vista del item seleccionado
  - Campos editables
  - Botón test/validar (si aplica)
  - Acciones: Eliminar, Cancelar, Guardar
-->
```

---

## PASO 7: Compliance Checklist

| Área | Verificación |
|------|--------------|
| **CSS** | Variables de tokens.json con fallbacks |
| **API** | Usar `api.moduleApi(module, path)` |
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

### API Pattern
```typescript
import { api } from '$lib/config';

// ✅ Correcto
const res = await fetch(api.moduleApi('mi-modulo', '/ui/state'));

// ❌ Incorrecto
const res = await fetch(`/api/modules/mi-modulo/ui/state`);
```

---

## PASO 8: Actualizar Exports

```typescript
// frontend/src/lib/components/{modulo}/index.ts

/** @deprecated Use {Modulo}Button instead */
export { default as {Modulo}Selector } from './{Modulo}Selector.svelte';

// Nuevos componentes (UI-SYSTEM-PLAN compliant)
export { default as {Modulo}Button } from './{Modulo}Button.svelte';
export { default as {Modulo}AddPanel } from './{Modulo}AddPanel.svelte';
export { default as {Modulo}ConfigPanel } from './{Modulo}ConfigPanel.svelte';
```

---

## PASO 9: Commit Pattern

```bash
# Primer commit: componentes principales
feat(ui): add {Modulo}AddPanel, {Modulo}ConfigPanel and deprecate {Modulo}Selector

# Segundo commit: botón unificado
feat(ui): complete {modulo} UI with triple interaction

# Fix de compliance
fix(ui): use api.moduleApi() helper instead of hardcoded paths
```

---

## EJEMPLO COMPLETO: credential-manager

### Análisis
| Pregunta | Respuesta |
|----------|-----------|
| ¿Selecciona? | Credencial (provider + level + identifier) |
| ¿Añade? | Nueva API key |
| ¿Configura? | Editar key, test, eliminar |
| ¿Datos? | GET /ui/state → credentials, providers, levels |
| ¿Eventos? | credential.saved, credential.deleted |
| ¿Integración? | project-manager (para nivel PROJECT) |

### enableAdd = true
Porque se puede crear API key desde UI sin modificar archivos.

### Integración con project-manager
```typescript
// En CredentialAddPanel.svelte
$: if (form.level === 'PROJECT' && projects.length === 0) {
  loadProjects();
}

async function loadProjects() {
  const res = await fetch(api.moduleApi('project-manager', '/projects'));
  const data = await res.json();
  projects = data.projects;
}
```

### Componentes creados
- `CredentialButton.svelte` - 3 interacciones
- `CredentialAddPanel.svelte` - Con selector de proyectos
- `CredentialConfigPanel.svelte` - Edit/test/delete

---

## PLANTILLA RÁPIDA

Para un nuevo módulo, copiar y adaptar:

```
1. Leer module.json del módulo
2. Responder 6 preguntas
3. Decidir enableAdd (true/false)
4. Crear bocetos ASCII
5. Verificar SelectorPanel adapter
6. Crear {Modulo}Button.svelte
7. Crear {Modulo}AddPanel.svelte (si enableAdd)
8. Crear {Modulo}ConfigPanel.svelte
9. Actualizar index.ts
10. Pasar compliance checklist
11. Commit y push
```

---

## MÓDULOS PENDIENTES

| Módulo | enableAdd | Integración | Estado |
|--------|-----------|-------------|--------|
| ai-gateway | ❌ | - | ✅ Completo |
| credential-manager | ✅ | project-manager | ✅ Completo |
| prompt-manager | ✅ | ? | ⏳ Pendiente |
| conversation-manager | ✅ | project-manager | ⏳ Pendiente |
| project-manager | ✅ | - | ⏳ Pendiente |
