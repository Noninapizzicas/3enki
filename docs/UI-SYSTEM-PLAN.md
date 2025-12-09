# UI System Plan - Event Core

## Filosofía

No hay dashboard centralizado. Los módulos se usan en el contexto que se necesiten, invocados desde el workspace mediante paneles flotantes.

---

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
- Sin navegación tradicional, todo contextual

---

## Componentes base

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
<FloatingPanel
  module="ai-gateway"
  mode="select|add|extra"
  position="right|left|center"
  on:close={handleClose}
>
  <!-- Contenido del módulo -->
</FloatingPanel>
```

Comportamiento:
- Click fuera → cierra
- Escape → cierra
- Posición configurable

---

## Template de análisis por módulo

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

## Módulos principales a implementar

| Módulo | Paneles | Prioridad |
|--------|---------|-----------|
| `ai-gateway` | Select, Add, Config | Alta |
| `credential-manager` | Select, Add | Alta |
| `prompt-manager` | Select, Add | Alta |
| `conversation-manager` | Select, Add | Media |
| `project-manager` | Select, Add | Media |

---

## Flujo de trabajo

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
