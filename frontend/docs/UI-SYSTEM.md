# Sistema UI - Event Core Frontend

## Índice

1. [Visión General](#1-visión-general)
2. [Arquitectura](#2-arquitectura)
3. [Sistema de Layout](#3-sistema-de-layout)
4. [Sistema de Módulos](#4-sistema-de-módulos)
5. [Sistema de Stores](#5-sistema-de-stores)
6. [Comunicación MQTT](#6-comunicación-mqtt)
7. [Componentes Base](#7-componentes-base)
8. [Flujos de Datos](#8-flujos-de-datos)
9. [Estructura de Archivos](#9-estructura-de-archivos)
10. [Tipos e Interfaces](#10-tipos-e-interfaces)
11. [Guía de Implementación](#11-guía-de-implementación)

---

## 1. Visión General

### 1.1 Principios

1. **Pantalla única** - Todo el trabajo fluye en una sola vista
2. **Lenguaje visual** - Mínimo texto, máximo iconos y colores
3. **Iconos dinámicos** - Reflejan el estado actual
4. **Colores = identidad** - Cada proyecto tiene un color
5. **1 clic = 1 panel** - Sin doble-clic ni long-press
6. **Modular** - Cada funcionalidad es un módulo independiente
7. **Event-driven** - Comunicación via MQTT

### 1.2 Tecnologías

| Tecnología | Uso |
|------------|-----|
| SvelteKit | Framework frontend |
| Svelte Stores | Estado reactivo |
| MQTT.js | Comunicación con backend |
| Monaco Editor | Editor de código |
| PDF.js | Visor de PDFs |

---

## 2. Arquitectura

### 2.1 Capas del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                         VISTA                                │
│  Shell.svelte + Componentes de Layout + Componentes Base    │
├─────────────────────────────────────────────────────────────┤
│                        MÓDULOS                               │
│  provider | project | files | editor | pdf | ...            │
├─────────────────────────────────────────────────────────────┤
│                        REGISTRY                              │
│  Registro y coordinación de módulos por zona                │
├─────────────────────────────────────────────────────────────┤
│                        STORES                                │
│  workspace | chat | attachments | ui                        │
├─────────────────────────────────────────────────────────────┤
│                         MQTT                                 │
│  Conexión WebSocket al broker (puerto 9001)                 │
├─────────────────────────────────────────────────────────────┤
│                        BACKEND                               │
│  Módulos Node.js + MQTT Broker (Aedes)                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Flujo de Datos

```
Usuario → Componente → Store → MQTT → Backend
                                 ↓
Usuario ← Componente ← Store ← MQTT ← Backend
```

---

## 3. Sistema de Layout

### 3.1 Estructura Visual

```
┌─────────────────────────────────────────────────────────────────┬───┐
│ 1. WORK BAR (plegable)                                       [▼]│   │
│    🍕menu  📦productos  💰ventas  📊stats                       │   │
├─────────────────────────────────────────────────────────────────┤ S │
│                                                                  │ Y │
│ 2. CHAT AREA (scroll)                                           │ S │
│                                                                  │ T │
│    ┌─────────────────────────────────────────────────────┐      │ E │
│    │ 🤖 Mensaje AI...                                    │      │ M │
│    └─────────────────────────────────────────────────────┘      │   │
│    ┌─────────────────────────────────────────────────────┐      │ B │
│    │ 👤 Mensaje usuario...                               │      │ A │
│    └─────────────────────────────────────────────────────┘      │ R │
│                                                                  │   │
├─────────────────────────────────────────────────────────────────┤ ⚙ │
│ 3. CHAT CONFIG                                                   │ 🔔│
│    🟢proj  🤖prov  📝prmp  🔐cred  💬hist                       │ 👤│
├─────────────────────────────────────────────────────────────────┤ ❓│
│ 4. CHAT INPUT                                                    │   │
│    [_________________________ mensaje ________________] [➤]     │   │
├─────────────────────────────────────────────────────────────────┤   │
│ 5. CHAT TOOLS                                                    │   │
│    📂files  📄editor  📕pdf     [doc.pdf ✕] [img.png ✕]         │   │
└─────────────────────────────────────────────────────────────────┴───┘
```

### 3.2 Zonas

| # | Zona | ID | Comportamiento | Contenido |
|---|------|----|----------------|-----------|
| 1 | Work Bar | `work-bar` | Plegable | Módulos del workspace activo |
| 2 | Chat Area | `chat-area` | Scroll vertical | Mensajes de conversación |
| 3 | Chat Config | `chat-config` | Fija | Configuración del chat |
| 4 | Chat Input | `chat-input` | Fija | Campo de texto + enviar |
| 5 | Chat Tools | `chat-tools` | Fija | Herramientas + adjuntos |
| → | System Bar | `system-bar` | Flotante derecha | Config sistema |

### 3.3 El "Sandwich" del Chat

La parte inferior agrupa todo lo necesario para enviar un mensaje:

```
┌─────────────────────────────────────────┐
│ CHAT CONFIG                             │  ← Con qué (AI/proyecto/prompt)
├─────────────────────────────────────────┤
│ CHAT INPUT                              │  ← Qué escribo
├─────────────────────────────────────────┤
│ CHAT TOOLS                              │  ← Qué adjunto
└─────────────────────────────────────────┘
```

### 3.4 Componentes de Layout

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| Shell | `Shell.svelte` | Contenedor principal, orquesta todo |
| WorkBar | `WorkBar.svelte` | Barra módulos trabajo (plegable) |
| ChatArea | `ChatArea.svelte` | Área de mensajes con scroll |
| ChatConfig | `ChatConfig.svelte` | Botones de configuración |
| ChatInput | `ChatInput.svelte` | Input + botón enviar |
| ChatTools | `ChatTools.svelte` | Herramientas + chips adjuntos |
| SystemBar | `SystemBar.svelte` | Barra lateral flotante |
| Panel | `Panel.svelte` | Panel desplegable dinámico |

---

## 4. Sistema de Módulos

### 4.1 Definición de Módulo

Un módulo es una unidad funcional que:
- Se registra en una **zona**
- Aporta un **botón** a esa zona
- Puede abrir un **panel**
- Se comunica via **MQTT**
- Tiene **estado reactivo**

### 4.2 Interfaz UIModule

```typescript
interface UIModule {
  manifest: {
    id: string;                    // Identificador único
    name: string;                  // Nombre legible
    version: string;               // Versión
    zone: UIZone;                  // Zona donde aparece

    button: {
      id: string;
      icon: string;                // Icono base (emoji)
      dynamicIcon?: boolean;       // ¿Cambia según estado?
      label: string;               // Tooltip/aria-label
      action: UIButtonAction;      // Qué hace al clicar
      order?: number;              // Orden en la zona
    };

    panels?: {
      id: string;
      title: string;
      size: 'sm' | 'md' | 'lg';
    }[];

    mqtt?: {
      publishes: string[];         // Topics que publica
      subscribes: string[];        // Topics que escucha
    };
  };

  // Funciones para iconos/badges dinámicos
  getIcon?: (state: AppState) => string;
  getBadge?: (state: AppState) => string | number | null;

  // Componente del panel
  PanelComponent?: SvelteComponent;

  // Lifecycle
  onMount?: (ctx: ModuleContext) => void;
  onUnmount?: () => void;
  onMessage?: Record<string, MessageHandler>;
}
```

### 4.3 Zonas de Módulos

```typescript
type UIZone =
  | 'work-bar'      // Barra superior (módulos de trabajo)
  | 'chat-config'   // Barra config del chat
  | 'chat-tools'    // Barra herramientas del chat
  | 'system-bar';   // Barra lateral sistema
```

### 4.4 Mapeo Módulos → Zonas

#### work-bar (configurable por workspace)
| Módulo | Icono | Descripción |
|--------|-------|-------------|
| menu-generator | 🍕 | Generador de menús (POS) |
| productos | 📦 | Gestión productos (POS) |
| ventas | 💰 | Ventas (POS) |
| build | 🔧 | Build (Dev) |
| test | 🧪 | Tests (Dev) |

#### chat-config (fijo)
| Módulo | Icono Base | Icono Dinámico | Descripción |
|--------|------------|----------------|-------------|
| project | 📁 | 🟢🔵🟣🟠 | Proyecto activo |
| provider | 🔌 | 🤖🧠🔮🦙 | Provider AI activo |
| prompts | 📝 | ✨ | Prompt/preset activo |
| credentials | 🔐 | ✓/⚠️ | Estado credenciales |
| history | 💬 | (número) | Historial conversaciones |

#### chat-tools (fijo)
| Módulo | Icono | Descripción |
|--------|-------|-------------|
| files | 📂 | Explorador archivos |
| editor | 📄 | Editor código |
| pdf | 📕 | Visor PDF |

#### system-bar (fijo)
| Módulo | Icono | Descripción |
|--------|-------|-------------|
| config | ⚙️ | Configuración |
| notifications | 🔔 | Notificaciones |
| profile | 👤 | Perfil usuario |
| help | ❓ | Ayuda |

### 4.5 Ejemplo: Módulo Provider

```typescript
// modules/provider/index.ts
import type { UIModule } from '$ui-core';
import ProviderPanel from './ProviderPanel.svelte';
import { activeProvider } from '../../stores/workspace';
import { get } from 'svelte/store';

const providerIcons = {
  openai: '🤖',
  anthropic: '🧠',
  deepseek: '🔮',
  ollama: '🦙'
};

export const providerModule: UIModule = {
  manifest: {
    id: 'provider',
    name: 'Provider',
    version: '1.0.0',
    zone: 'chat-config',

    button: {
      id: 'provider-btn',
      icon: '🔌',
      dynamicIcon: true,
      label: 'Seleccionar provider',
      action: { type: 'panel', panelId: 'provider-panel' },
      order: 2
    },

    panels: [
      { id: 'provider-panel', title: 'Seleccionar Provider', size: 'md' }
    ],

    mqtt: {
      publishes: ['provider/selected', 'provider/model/selected'],
      subscribes: ['provider/state', 'credential/resolved']
    }
  },

  getIcon: () => {
    const provider = get(activeProvider);
    return provider ? providerIcons[provider.id] : '🔌';
  },

  getBadge: () => null,

  PanelComponent: ProviderPanel,

  onMount(ctx) {
    ctx.subscribe('provider/state', (topic, payload) => {
      activeProvider.set(payload);
    });
  },

  onUnmount() {
    // Cleanup
  }
};
```

### 4.6 Registry

El Registry coordina todos los módulos:

```typescript
// ui-core/registry.ts
import { writable, derived, get } from 'svelte/store';
import { subscribe as mqttSubscribe } from './mqtt';

// Store interno de módulos
const modulesStore = writable<Map<string, UIModule>>(new Map());

// Módulos por zona (derivados)
export const workBarModules = derived(modulesStore, $m =>
  filterByZone($m, 'work-bar'));

export const chatConfigModules = derived(modulesStore, $m =>
  filterByZone($m, 'chat-config'));

export const chatToolsModules = derived(modulesStore, $m =>
  filterByZone($m, 'chat-tools'));

export const systemBarModules = derived(modulesStore, $m =>
  filterByZone($m, 'system-bar'));

// Helpers
function filterByZone(modules: Map<string, UIModule>, zone: UIZone) {
  return [...modules.values()]
    .filter(m => m.manifest.zone === zone)
    .sort((a, b) => (a.manifest.button.order || 0) - (b.manifest.button.order || 0));
}

// API pública
export function register(module: UIModule): () => void {
  const id = module.manifest.id;

  modulesStore.update(map => {
    map.set(id, module);
    return map;
  });

  // Suscribir a MQTT
  const unsubscribes: Array<() => void> = [];

  module.manifest.mqtt?.subscribes.forEach(topic => {
    const handler = module.onMessage?.[topic];
    if (handler) {
      const unsub = mqttSubscribe(topic, handler);
      unsubscribes.push(unsub);
    }
  });

  // Llamar onMount
  module.onMount?.({
    publish: mqttPublish,
    subscribe: mqttSubscribe
  });

  // Retornar función de cleanup
  return () => {
    unsubscribes.forEach(fn => fn());
    module.onUnmount?.();
    modulesStore.update(map => {
      map.delete(id);
      return map;
    });
  };
}

export function getPanelComponent(panelId: string): SvelteComponent | null {
  const modules = get(modulesStore);

  for (const module of modules.values()) {
    const panel = module.manifest.panels?.find(p => p.id === panelId);
    if (panel) {
      return module.PanelComponent || null;
    }
  }

  return null;
}

export function getPanelConfig(panelId: string) {
  const modules = get(modulesStore);

  for (const module of modules.values()) {
    const panel = module.manifest.panels?.find(p => p.id === panelId);
    if (panel) return panel;
  }

  return null;
}
```

---

## 5. Sistema de Stores

### 5.1 Stores Principales

| Store | Archivo | Responsabilidad |
|-------|---------|-----------------|
| workspace | `workspace.ts` | Proyecto y workspace activo |
| chat | `chat.ts` | Mensajes y conversación |
| attachments | `attachments.ts` | Archivos adjuntos |
| ui | `ui.ts` | Estado de UI (paneles, barras) |

### 5.2 workspace.ts

```typescript
import { writable, derived } from 'svelte/store';
import { subscribe, publish } from '$ui-core/mqtt';

// Tipos
interface Project {
  id: string;
  name: string;
  color: string;
  icon: string;
  workspaceType: string;
}

interface Provider {
  id: string;
  name: string;
  icon: string;
}

interface Prompt {
  id: string;
  name: string;
  slotType: string;
}

// Stores
export const activeProject = writable<Project | null>(null);
export const activeProvider = writable<Provider | null>(null);
export const activeModel = writable<string | null>(null);
export const activePrompt = writable<Prompt | null>(null);

// Workspace derivado del proyecto
export const activeWorkspace = derived(activeProject, $project => {
  return $project?.workspaceType || 'general';
});

// Configuración de workspaces
export const workspaces = {
  'pos-pizzeria': {
    modules: ['menu-generator', 'productos', 'ventas', 'stats'],
    icon: '🍕'
  },
  'desarrollo': {
    modules: ['build', 'test', 'deploy', 'git'],
    icon: '💻'
  },
  'general': {
    modules: ['notas', 'tareas'],
    icon: '📋'
  }
};

// Acciones
export function selectProject(project: Project) {
  activeProject.set(project);
  publish('project/activate', { projectId: project.id });
}

export function selectProvider(provider: Provider, model: string) {
  activeProvider.set(provider);
  activeModel.set(model);
  publish('provider/selected', {
    providerId: provider.id,
    modelId: model
  });
}

export function selectPrompt(prompt: Prompt) {
  activePrompt.set(prompt);
  publish('prompt/selected', { promptId: prompt.id });
}

// Suscripciones MQTT
subscribe('project/activated', (_, payload) => {
  activeProject.set(payload.project);
});

subscribe('provider/state', (_, payload) => {
  activeProvider.set(payload.provider);
  activeModel.set(payload.model);
});
```

### 5.3 chat.ts

```typescript
import { writable, get } from 'svelte/store';
import { subscribe, publish } from '$ui-core/mqtt';

// Tipos
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  streaming?: boolean;
}

interface Attachment {
  id: string;
  name: string;
  type: string;
  path: string;
}

// Stores
export const messages = writable<Message[]>([]);
export const conversationId = writable<string | null>(null);
export const isStreaming = writable<boolean>(false);

// Acciones
export async function sendMessage(content: string, attachments: Attachment[] = []) {
  const convId = get(conversationId);

  // Agregar mensaje del usuario inmediatamente
  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
    attachments
  };

  messages.update(msgs => [...msgs, userMessage]);

  // Publicar via MQTT
  publish('conversation/send', {
    conversationId: convId,
    content,
    attachments: attachments.map(a => ({ type: a.type, path: a.path }))
  });

  isStreaming.set(true);
}

export function clearMessages() {
  messages.set([]);
}

export function loadConversation(id: string) {
  conversationId.set(id);
  publish('conversation/load', { conversationId: id });
}

// Suscripciones MQTT
subscribe('conversation/+/message', (topic, payload) => {
  const message: Message = {
    id: payload.id,
    role: payload.role,
    content: payload.content,
    timestamp: payload.timestamp,
    streaming: payload.streaming
  };

  messages.update(msgs => {
    // Si es streaming, actualizar último mensaje
    if (message.streaming && msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      if (last.role === 'assistant' && last.streaming) {
        return [...msgs.slice(0, -1), { ...last, content: message.content }];
      }
    }
    return [...msgs, message];
  });
});

subscribe('conversation/stream/end', () => {
  isStreaming.set(false);

  // Marcar último mensaje como no-streaming
  messages.update(msgs => {
    if (msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      return [...msgs.slice(0, -1), { ...last, streaming: false }];
    }
    return msgs;
  });
});

subscribe('conversation/loaded', (_, payload) => {
  messages.set(payload.messages);
});
```

### 5.4 attachments.ts

```typescript
import { writable } from 'svelte/store';

interface Attachment {
  id: string;
  name: string;
  type: string;
  path: string;
  size?: number;
}

export const attachments = writable<Attachment[]>([]);

export function addAttachment(file: Attachment) {
  attachments.update(list => [...list, file]);
}

export function removeAttachment(id: string) {
  attachments.update(list => list.filter(f => f.id !== id));
}

export function clearAttachments() {
  attachments.set([]);
}
```

### 5.5 ui.ts

```typescript
import { writable } from 'svelte/store';

// Panel activo
export const activePanel = writable<string | null>(null);

export function openPanel(panelId: string) {
  activePanel.set(panelId);
}

export function closePanel() {
  activePanel.set(null);
}

// Work bar expandida
export const workBarExpanded = writable<boolean>(true);

export function toggleWorkBar() {
  workBarExpanded.update(v => !v);
}

// Notificaciones
interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

export const notifications = writable<Notification[]>([]);

export function addNotification(type: Notification['type'], message: string) {
  const notification: Notification = {
    id: crypto.randomUUID(),
    type,
    message,
    timestamp: new Date().toISOString()
  };

  notifications.update(list => [...list, notification]);

  // Auto-remove después de 5 segundos
  setTimeout(() => {
    notifications.update(list => list.filter(n => n.id !== notification.id));
  }, 5000);
}
```

---

## 6. Comunicación MQTT

### 6.1 Cliente MQTT

#### Principio Clave: Cola de Mensajes

```
┌─────────────────────────────────────────────────────────────────┐
│  IMPORTANTE: Los mensajes NUNCA se descartan                    │
│                                                                 │
│  Si MQTT no está conectado:                                     │
│    → publish() ENCOLA el mensaje                                │
│    → Al conectar, flushPendingMessages() envía la cola          │
│                                                                 │
│  Beneficio: Los módulos NO necesitan verificar conexión         │
│  Pueden llamar publish() en cualquier momento                   │
└─────────────────────────────────────────────────────────────────┘
```

```typescript
// ui-core/mqtt.ts
import mqtt from 'mqtt';
import { writable, derived, readonly } from 'svelte/store';

// Configuración
interface MqttConfig {
  url: string;
  clientId: string;
  reconnectPeriod: number;
}

const defaultConfig: MqttConfig = {
  url: 'ws://localhost:9001',
  clientId: `ui-${Date.now()}`,
  reconnectPeriod: 5000
};

// Estado
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
const statusStore = writable<ConnectionStatus>('disconnected');
export const status = readonly(statusStore);
export const connected = derived(status, $s => $s === 'connected');

// Cliente
let client: mqtt.MqttClient | null = null;
const handlers = new Map<string, Set<MessageHandler>>();

type MessageHandler = (topic: string, payload: unknown) => void;

// ============ COLA DE MENSAJES PENDIENTES ============
// Mensajes encolados cuando no hay conexión
interface PendingMessage {
  topic: string;
  payload: unknown;
  retain: boolean;
}

const pendingMessages: PendingMessage[] = [];
const MAX_PENDING_MESSAGES = 100;

// Envía todos los mensajes pendientes al conectar
function flushPendingMessages(): void {
  if (pendingMessages.length === 0) return;
  console.log(`[MQTT] Flushing ${pendingMessages.length} pending messages`);

  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift()!;
    if (client?.connected) {
      client.publish(msg.topic, JSON.stringify(msg.payload), { retain: msg.retain });
    }
  }
}

// Conexión
export function connect(config: Partial<MqttConfig> = {}): void {
  const cfg = { ...defaultConfig, ...config };

  statusStore.set('connecting');

  client = mqtt.connect(cfg.url, {
    clientId: cfg.clientId,
    reconnectPeriod: cfg.reconnectPeriod
  });

  client.on('connect', () => {
    statusStore.set('connected');
    console.log('[MQTT] Connected');

    // Re-suscribir a todos los topics
    handlers.forEach((_, pattern) => {
      client?.subscribe(pattern);
    });

    // IMPORTANTE: Enviar mensajes que estaban esperando conexión
    flushPendingMessages();
  });

  client.on('message', (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());

      // Buscar handlers que coincidan
      handlers.forEach((handlerSet, pattern) => {
        if (topicMatches(pattern, topic)) {
          handlerSet.forEach(handler => handler(topic, payload));
        }
      });
    } catch (e) {
      console.error('[MQTT] Error parsing message:', e);
    }
  });

  client.on('error', (error) => {
    statusStore.set('error');
    console.error('[MQTT] Error:', error);
  });

  client.on('close', () => {
    statusStore.set('disconnected');
  });
}

export function disconnect(): void {
  client?.end();
  client = null;
  statusStore.set('disconnected');
}

// Publicar
// IMPORTANTE: Si no está conectado, el mensaje se ENCOLA y se envía al conectar
export function publish(topic: string, payload: unknown, retain = false): void {
  // Si no está conectado, encolar mensaje (NO descartar!)
  if (!client || !client.connected) {
    if (pendingMessages.length < MAX_PENDING_MESSAGES) {
      pendingMessages.push({ topic, payload, retain });
      console.log(`[MQTT] Queued message for ${topic}`);
    }
    return;
  }

  client.publish(topic, JSON.stringify(payload), { retain });
}

// Suscribir
export function subscribe(pattern: string, handler: MessageHandler): () => void {
  if (!handlers.has(pattern)) {
    handlers.set(pattern, new Set());
    client?.subscribe(pattern);
  }

  handlers.get(pattern)!.add(handler);

  // Retornar función de unsubscribe
  return () => {
    const set = handlers.get(pattern);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        handlers.delete(pattern);
        client?.unsubscribe(pattern);
      }
    }
  };
}

// Helper: verificar si topic coincide con pattern
function topicMatches(pattern: string, topic: string): boolean {
  const patternParts = pattern.split('/');
  const topicParts = topic.split('/');

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '#') return true;
    if (patternParts[i] === '+') continue;
    if (patternParts[i] !== topicParts[i]) return false;
  }

  return patternParts.length === topicParts.length;
}
```

### 6.2 Topics del Sistema

#### Frontend → Backend

| Topic | Payload | Descripción |
|-------|---------|-------------|
| `provider/selected` | `{ providerId, modelId }` | Cambio de provider |
| `project/activate` | `{ projectId }` | Activar proyecto |
| `conversation/send` | `{ conversationId, content, attachments }` | Enviar mensaje |
| `conversation/load` | `{ conversationId }` | Cargar conversación |
| `ui/panel/open` | `{ panelId }` | Abrir panel |
| `ui/panel/close` | `{}` | Cerrar panel |

#### Backend → Frontend

| Topic | Payload | Descripción |
|-------|---------|-------------|
| `provider/state` | `{ provider, model, available }` | Estado del provider |
| `project/activated` | `{ project }` | Proyecto activado |
| `conversation/+/message` | `{ id, role, content, ... }` | Mensaje nuevo |
| `conversation/stream/end` | `{}` | Fin de streaming |
| `conversation/loaded` | `{ messages }` | Conversación cargada |
| `credential/resolved` | `{ provider, valid }` | Estado credenciales |
| `file/list/response` | `{ files }` | Lista de archivos |

### 6.3 Patrón de Implementación para Módulos

#### Reglas Obligatorias

```
┌─────────────────────────────────────────────────────────────────┐
│  TODOS los módulos DEBEN seguir este patrón:                    │
│                                                                 │
│  1. DATOS via MQTT (NO endpoints REST /ui/state)                │
│  2. Store con datos DEFAULT para que UI funcione inmediatamente │
│  3. Llamar publish() directamente (cola maneja reconexión)      │
│  4. Suscribirse a eventos de estado del backend                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Plantilla de Store para Módulos

```typescript
// stores/mi-modulo.ts
import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe, publish } from '$lib/ui-core/mqtt';

// 1. DATOS DEFAULT - UI funciona sin esperar MQTT
const DEFAULT_ITEMS = [
  { id: 'default1', name: 'Item 1' },
  { id: 'default2', name: 'Item 2' }
];

// 2. ESTADO INICIAL con defaults
const initialState = {
  items: DEFAULT_ITEMS,  // ← Tiene datos desde el inicio
  loading: false,
  error: null
};

export const store = writable(initialState);

// 3. SUSCRIPCIONES MQTT
let unsubscribeState: (() => void) | null = null;

export function initSubscriptions(): () => void {
  // Recibir estado del backend
  unsubscribeState = mqttSubscribe('mi-modulo/state', (_topic, payload) => {
    store.update(s => ({
      ...s,
      items: payload.items?.length > 0 ? payload.items : DEFAULT_ITEMS,
      loading: false
    }));
  });

  // Solicitar estado inicial
  // (si MQTT no está conectado, se encola automáticamente)
  requestState();

  return () => {
    unsubscribeState?.();
  };
}

// 4. ACCIONES - Solo publish, sin verificar conexión
export function requestState(): void {
  store.update(s => ({ ...s, loading: true }));
  publish('mi-modulo/state/request', {});  // ← Se encola si no hay conexión
}

export function createItem(data: any): void {
  publish('mi-modulo/create', data);  // ← Se encola si no hay conexión
}

export function deleteItem(id: string): void {
  publish('mi-modulo/delete', { id });  // ← Se encola si no hay conexión
}
```

#### Flujo de Datos Garantizado

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   UI Monta   │────>│ requestState │────>│  publish()   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                     ┌────────────────────────────┤
                     │                            │
              MQTT Conectado?              MQTT Desconectado?
                     │                            │
                     ▼                            ▼
              ┌──────────────┐           ┌──────────────┐
              │ Envía ahora  │           │ Encola msg   │
              └──────────────┘           └──────────────┘
                     │                            │
                     │                    Cuando conecta:
                     │                            │
                     │                   ┌──────────────┐
                     │                   │ flush queue  │
                     │                   └──────────────┘
                     │                            │
                     └────────────┬───────────────┘
                                  │
                                  ▼
                     ┌────────────────────────────┐
                     │ Backend recibe y responde  │
                     │ via mi-modulo/state        │
                     └────────────────────────────┘
                                  │
                                  ▼
                     ┌────────────────────────────┐
                     │ Store actualiza con datos  │
                     │ UI re-renderiza            │
                     └────────────────────────────┘
```

#### Anti-patrones (NO HACER)

```typescript
// ❌ INCORRECTO: Verificar conexión antes de publicar
import { connected } from '$lib/ui-core/mqtt';
import { get } from 'svelte/store';

if (get(connected)) {
  publish('topic', data);  // ← NO! La cola ya maneja esto
}

// ❌ INCORRECTO: Esperar conexión manualmente
status.subscribe(($status) => {
  if ($status === 'connected') {
    requestState();  // ← NO! Solo llama requestState() directamente
  }
});

// ❌ INCORRECTO: Usar REST para datos de UI
async function fetchData() {
  const res = await fetch('/modules/mi-modulo/ui/state');  // ← NO! Usa MQTT
  return res.json();
}

// ✅ CORRECTO: Llamar publish() directamente
requestState();  // Se encola automáticamente si no hay conexión
```

---

## 7. Componentes Base

### 7.1 Button.svelte

Botón con icono dinámico y badge opcional:

```svelte
<script lang="ts">
  export let icon: string;
  export let label: string;
  export let badge: string | number | null = null;
  export let active: boolean = false;
  export let disabled: boolean = false;

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<button
  class="btn"
  class:active
  {disabled}
  aria-label={label}
  title={label}
  on:click={() => dispatch('click')}
>
  <span class="btn__icon">{icon}</span>

  {#if badge !== null}
    <span class="btn__badge">{badge}</span>
  {/if}
</button>

<style>
  .btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;

    width: 2.5rem;
    height: 2.5rem;

    border: 1px solid var(--border-color, #333);
    border-radius: 8px;
    background: var(--btn-bg, #1a1a1a);

    cursor: pointer;
    transition: all 0.15s;
  }

  .btn:hover:not(:disabled) {
    background: var(--btn-hover-bg, #2a2a2a);
    border-color: var(--border-hover-color, #444);
  }

  .btn:focus-visible {
    outline: 2px solid var(--focus-color, #3b82f6);
    outline-offset: 2px;
  }

  .btn.active {
    border-color: var(--primary-color, #3b82f6);
    background: rgba(59, 130, 246, 0.1);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn__icon {
    font-size: 1.25rem;
  }

  .btn__badge {
    position: absolute;
    top: -4px;
    right: -4px;

    min-width: 1rem;
    height: 1rem;
    padding: 0 0.25rem;

    font-size: 0.625rem;
    font-weight: bold;
    line-height: 1rem;
    text-align: center;

    background: var(--badge-bg, #ef4444);
    color: white;
    border-radius: 9999px;
  }
</style>
```

### 7.2 Chip.svelte

Chip para archivos adjuntos:

```svelte
<script lang="ts">
  export let label: string;

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<span class="chip">
  <span class="chip__label">{label}</span>
  <button
    class="chip__remove"
    aria-label="Eliminar {label}"
    on:click={() => dispatch('remove')}
  >
    ✕
  </button>
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;

    padding: 0.25rem 0.5rem;

    background: var(--chip-bg, #2a2a2a);
    border: 1px solid var(--border-color, #333);
    border-radius: 9999px;

    font-size: 0.75rem;
  }

  .chip__remove {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 1rem;
    height: 1rem;

    background: none;
    border: none;
    border-radius: 50%;

    color: var(--text-secondary, #888);
    cursor: pointer;

    transition: all 0.15s;
  }

  .chip__remove:hover {
    background: var(--chip-remove-hover, #444);
    color: var(--text-primary, #fff);
  }
</style>
```

### 7.3 Message.svelte

Burbuja de mensaje:

```svelte
<script lang="ts">
  export let role: 'user' | 'assistant' | 'system';
  export let content: string;
  export let timestamp: string;
  export let attachments: Array<{ name: string; type: string }> = [];
  export let streaming: boolean = false;
</script>

<div class="message" class:user={role === 'user'} class:assistant={role === 'assistant'}>
  <div class="message__avatar">
    {role === 'user' ? '👤' : '🤖'}
  </div>

  <div class="message__content">
    <div class="message__text">
      {content}
      {#if streaming}
        <span class="message__cursor">▊</span>
      {/if}
    </div>

    {#if attachments.length > 0}
      <div class="message__attachments">
        {#each attachments as file}
          <span class="message__attachment">📎 {file.name}</span>
        {/each}
      </div>
    {/if}

    <time class="message__time">
      {new Date(timestamp).toLocaleTimeString()}
    </time>
  </div>
</div>

<style>
  .message {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    max-width: 80%;
  }

  .message.user {
    margin-left: auto;
    flex-direction: row-reverse;
  }

  .message__avatar {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .message__content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .message__text {
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--message-bg, #2a2a2a);
    line-height: 1.5;
  }

  .message.user .message__text {
    background: var(--message-user-bg, #3b82f6);
  }

  .message__cursor {
    animation: blink 1s infinite;
  }

  @keyframes blink {
    50% { opacity: 0; }
  }

  .message__attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .message__attachment {
    font-size: 0.75rem;
    color: var(--text-secondary, #888);
  }

  .message__time {
    font-size: 0.625rem;
    color: var(--text-secondary, #888);
  }
</style>
```

---

## 8. Flujos de Datos

### 8.1 Enviar Mensaje

```
1. Usuario escribe en ChatInput
2. Usuario clica ➤ o presiona Enter
3. ChatInput llama sendMessage(content, attachments)
4. chat.ts:
   - Agrega mensaje del usuario a messages store
   - Publica 'conversation/send' via MQTT
   - Limpia attachments store
5. Backend recibe, procesa con AI
6. Backend publica 'conversation/+/message' (streaming)
7. chat.ts recibe, actualiza messages store
8. ChatArea re-renderiza con nuevo mensaje
9. Backend publica 'conversation/stream/end'
10. chat.ts marca streaming = false
```

### 8.2 Cambiar Provider

```
1. Usuario clica botón provider en ChatConfig
2. ChatConfig llama openPanel('provider-panel')
3. ui.ts actualiza activePanel store
4. Panel.svelte renderiza ProviderPanel
5. Usuario selecciona provider/modelo
6. ProviderPanel llama selectProvider(provider, model)
7. workspace.ts:
   - Actualiza activeProvider, activeModel stores
   - Publica 'provider/selected' via MQTT
8. closePanel()
9. ChatConfig re-renderiza con nuevo icono (dinámico)
```

### 8.3 Adjuntar Archivo

```
1. Usuario clica 📂 en ChatTools
2. ChatTools llama openPanel('files-panel')
3. FilesPanel muestra explorador
4. Usuario selecciona archivo
5. FilesPanel llama addAttachment(file)
6. attachments.ts actualiza store
7. closePanel()
8. ChatTools muestra chip del archivo
9. Usuario puede remover con ✕
10. Al enviar mensaje, attachments se incluyen
```

### 8.4 Cambiar Workspace

```
1. Usuario clica botón proyecto en ChatConfig
2. Panel muestra lista de proyectos
3. Usuario selecciona proyecto con workspaceType diferente
4. workspace.ts actualiza activeProject
5. activeWorkspace (derived) cambia
6. WorkBar:
   - Detecta cambio en workspace
   - Registry re-carga módulos de work-bar
   - Re-renderiza con nuevos botones
```

---

## 9. Estructura de Archivos

```
frontend/
├── src/
│   ├── lib/
│   │   ├── ui-core/                 # Core del sistema UI
│   │   │   ├── index.ts             # Exports públicos
│   │   │   ├── mqtt.ts              # Cliente MQTT
│   │   │   ├── registry.ts          # Registro de módulos
│   │   │   └── types.ts             # Tipos compartidos
│   │   │
│   │   ├── layout/                  # Componentes de layout
│   │   │   ├── Shell.svelte         # Contenedor principal
│   │   │   ├── WorkBar.svelte       # Barra módulos trabajo
│   │   │   ├── ChatArea.svelte      # Área de mensajes
│   │   │   ├── ChatConfig.svelte    # Barra config chat
│   │   │   ├── ChatInput.svelte     # Input + enviar
│   │   │   ├── ChatTools.svelte     # Herramientas + adjuntos
│   │   │   ├── SystemBar.svelte     # Barra lateral
│   │   │   └── Panel.svelte         # Panel dinámico
│   │   │
│   │   ├── components/              # Componentes base
│   │   │   ├── Button.svelte        # Botón con icono
│   │   │   ├── Chip.svelte          # Chip de adjunto
│   │   │   ├── Badge.svelte         # Badge numérico
│   │   │   └── Message.svelte       # Burbuja mensaje
│   │   │
│   │   ├── stores/                  # Estado global
│   │   │   ├── workspace.ts         # Proyecto/provider/prompt
│   │   │   ├── chat.ts              # Mensajes/conversación
│   │   │   ├── attachments.ts       # Archivos adjuntos
│   │   │   └── ui.ts                # Estado UI
│   │   │
│   │   └── modules/                 # Módulos
│   │       ├── provider/
│   │       │   ├── index.ts         # Definición módulo
│   │       │   └── ProviderPanel.svelte
│   │       ├── project/
│   │       │   ├── index.ts
│   │       │   └── ProjectPanel.svelte
│   │       ├── prompts/
│   │       │   ├── index.ts
│   │       │   └── PromptsPanel.svelte
│   │       ├── credentials/
│   │       │   ├── index.ts
│   │       │   └── CredentialsPanel.svelte
│   │       ├── history/
│   │       │   ├── index.ts
│   │       │   └── HistoryPanel.svelte
│   │       ├── files/
│   │       │   ├── index.ts
│   │       │   └── FilesPanel.svelte
│   │       ├── editor/
│   │       │   ├── index.ts
│   │       │   └── EditorPanel.svelte
│   │       └── pdf/
│   │           ├── index.ts
│   │           └── PdfPanel.svelte
│   │
│   └── routes/
│       └── +page.svelte             # Página principal
│
├── docs/
│   ├── DISEÑO-UI.md                 # Diseño visual
│   └── UI-SYSTEM.md                 # Este documento
│
└── svelte.config.js
```

---

## 10. Tipos e Interfaces

```typescript
// ui-core/types.ts

// ============ ZONAS ============
export type UIZone =
  | 'work-bar'
  | 'chat-config'
  | 'chat-tools'
  | 'system-bar';

// ============ ACCIONES ============
export type UIButtonAction =
  | { type: 'panel'; panelId: string }
  | { type: 'publish'; topic: string; payload?: Record<string, unknown> }
  | { type: 'navigate'; route: string }
  | { type: 'callback'; handler: () => void };

// ============ MÓDULO ============
export interface UIModuleManifest {
  id: string;
  name: string;
  version: string;
  zone: UIZone;

  button: {
    id: string;
    icon: string;
    dynamicIcon?: boolean;
    label: string;
    action: UIButtonAction;
    order?: number;
  };

  panels?: {
    id: string;
    title: string;
    size: 'sm' | 'md' | 'lg';
  }[];

  mqtt?: {
    publishes: string[];
    subscribes: string[];
  };
}

export interface UIModule {
  manifest: UIModuleManifest;

  getIcon?: (state: AppState) => string;
  getBadge?: (state: AppState) => string | number | null;

  PanelComponent?: typeof SvelteComponent;

  onMount?: (ctx: ModuleContext) => void;
  onUnmount?: () => void;
  onMessage?: Record<string, MessageHandler>;
}

// ============ CONTEXTO ============
export interface ModuleContext {
  publish: (topic: string, payload: unknown) => void;
  subscribe: (pattern: string, handler: MessageHandler) => () => void;
}

export type MessageHandler = (topic: string, payload: unknown) => void;

// ============ ESTADO ============
export interface AppState {
  project: Project | null;
  provider: Provider | null;
  model: string | null;
  prompt: Prompt | null;
  credentials: CredentialStatus;
  conversationCount: number;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  icon: string;
  workspaceType: string;
}

export interface Provider {
  id: string;
  name: string;
  icon: string;
}

export interface Prompt {
  id: string;
  name: string;
  slotType: string;
}

export interface CredentialStatus {
  valid: boolean;
  providers: string[];
}

// ============ CHAT ============
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  streaming?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  path: string;
  size?: number;
}

// ============ VISUAL ============
export const PROJECT_COLORS = [
  { id: 'green',  hex: '#22c55e', emoji: '🟢' },
  { id: 'blue',   hex: '#3b82f6', emoji: '🔵' },
  { id: 'purple', hex: '#a855f7', emoji: '🟣' },
  { id: 'orange', hex: '#f97316', emoji: '🟠' },
  { id: 'red',    hex: '#ef4444', emoji: '🔴' },
  { id: 'yellow', hex: '#eab308', emoji: '🟡' },
  { id: 'cyan',   hex: '#06b6d4', emoji: '🩵' },
  { id: 'pink',   hex: '#ec4899', emoji: '🩷' },
] as const;

export const PROVIDER_ICONS = {
  openai:    '🤖',
  anthropic: '🧠',
  deepseek:  '🔮',
  ollama:    '🦙',
} as const;
```

---

## 11. Guía de Implementación

### 11.1 Orden de Implementación

```
Fase 1: Core
├── 1.1 ui-core/types.ts
├── 1.2 ui-core/mqtt.ts
├── 1.3 ui-core/registry.ts
└── 1.4 ui-core/index.ts

Fase 2: Stores
├── 2.1 stores/ui.ts
├── 2.2 stores/workspace.ts
├── 2.3 stores/chat.ts
└── 2.4 stores/attachments.ts

Fase 3: Componentes Base
├── 3.1 components/Button.svelte
├── 3.2 components/Chip.svelte
├── 3.3 components/Badge.svelte
└── 3.4 components/Message.svelte

Fase 4: Layout
├── 4.1 layout/Shell.svelte
├── 4.2 layout/SystemBar.svelte
├── 4.3 layout/WorkBar.svelte
├── 4.4 layout/ChatArea.svelte
├── 4.5 layout/ChatConfig.svelte
├── 4.6 layout/ChatInput.svelte
├── 4.7 layout/ChatTools.svelte
└── 4.8 layout/Panel.svelte

Fase 5: Módulos Básicos
├── 5.1 modules/provider/
├── 5.2 modules/project/
└── 5.3 modules/files/

Fase 6: Módulos Restantes
├── 6.1 modules/prompts/
├── 6.2 modules/credentials/
├── 6.3 modules/history/
├── 6.4 modules/editor/
└── 6.5 modules/pdf/

Fase 7: Integración
├── 7.1 routes/+page.svelte
└── 7.2 Testing e2e
```

### 11.2 Checklist por Componente

#### Para cada componente de Layout:
- [ ] Props tipadas
- [ ] Suscripción a stores relevantes
- [ ] Renderizado reactivo
- [ ] Estilos CSS variables
- [ ] Accesibilidad (aria-labels, roles)
- [ ] Responsive

#### Para cada módulo:
- [ ] Manifest completo
- [ ] Zona correcta
- [ ] getIcon si es dinámico
- [ ] getBadge si aplica
- [ ] PanelComponent
- [ ] onMount con suscripciones
- [ ] onUnmount con cleanup

### 11.3 Comandos Útiles

```bash
# Desarrollo
npm run dev

# Build
npm run build

# Verificar tipos
npm run check

# Lint
npm run lint
```

---

## Notas Finales

Este documento define la arquitectura completa del sistema UI de Event Core.
Seguir esta especificación garantiza:

1. **Consistencia** - Todos los módulos siguen el mismo patrón
2. **Extensibilidad** - Fácil añadir nuevos módulos
3. **Mantenibilidad** - Separación clara de responsabilidades
4. **Reactividad** - Estado centralizado con Svelte stores
5. **Desacoplamiento** - Comunicación via MQTT, no imports directos

---

*Última actualización: Diciembre 2024*
