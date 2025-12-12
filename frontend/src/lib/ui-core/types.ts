/**
 * UI Core Types - Sistema de UI modular
 *
 * Define los contratos para:
 * - Zonas de UI (work-bar, chat-config, chat-tools, system-bar)
 * - Módulos y su registro
 * - Estado de la aplicación
 * - Mensajes y adjuntos
 */

import type { ComponentType, SvelteComponent } from 'svelte';

// ============================================================================
// ZONAS
// ============================================================================

/**
 * Zonas donde los módulos pueden registrar botones
 */
export type UIZone =
  | 'work-bar'      // Barra superior (módulos de trabajo, plegable)
  | 'chat-config'   // Barra config del chat (project, provider, prompts, creds, history)
  | 'chat-tools'    // Barra herramientas del chat (files, editor, pdf)
  | 'system-bar';   // Barra lateral sistema (config, notifications, profile, help)

// ============================================================================
// ACCIONES
// ============================================================================

/**
 * Acción que ejecuta un botón al hacer clic
 */
export type UIButtonAction =
  | { type: 'panel'; panelId: string }
  | { type: 'publish'; topic: string; payload?: Record<string, unknown> }
  | { type: 'navigate'; route: string }
  | { type: 'callback'; handler: () => void };

// ============================================================================
// MÓDULO - MANIFEST
// ============================================================================

export interface UIModuleButton {
  id: string;
  icon: string;
  dynamicIcon?: boolean;
  label: string;
  action: UIButtonAction;
  order?: number;
}

export interface UIModulePanel {
  id: string;
  title: string;
  size: 'sm' | 'md' | 'lg';
}

export interface UIModuleManifest {
  id: string;
  name: string;
  version: string;
  zone: UIZone;
  button: UIModuleButton;
  panels?: UIModulePanel[];
  mqtt?: {
    publishes: string[];
    subscribes: string[];
  };
}

// ============================================================================
// MÓDULO - CONTEXTO Y HANDLERS
// ============================================================================

export type MessageHandler = (topic: string, payload: unknown) => void;

export interface ModuleContext {
  publish: (topic: string, payload: unknown) => void;
  subscribe: (pattern: string, handler: MessageHandler) => () => void;
  openPanel: (panelId: string) => void;
  closePanel: () => void;
}

// ============================================================================
// MÓDULO - DEFINICIÓN COMPLETA
// ============================================================================

export interface UIModule {
  manifest: UIModuleManifest;

  /** Icono dinámico basado en estado */
  getIcon?: (state: AppState) => string;

  /** Badge dinámico (número, estado) */
  getBadge?: (state: AppState) => string | number | null;

  /** Componente Svelte para el panel */
  PanelComponent?: ComponentType<SvelteComponent<{ panelId: string }>>;

  /** Lifecycle: al registrar */
  onMount?: (ctx: ModuleContext) => void;

  /** Lifecycle: al desregistrar */
  onUnmount?: () => void;

  /** Handlers MQTT por topic */
  onMessage?: Record<string, MessageHandler>;
}

// ============================================================================
// ESTADO DE LA APLICACIÓN
// ============================================================================

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
  models: string[];
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

export interface AppState {
  project: Project | null;
  provider: Provider | null;
  model: string | null;
  prompt: Prompt | null;
  credentials: CredentialStatus;
  conversationCount: number;
}

// ============================================================================
// CHAT
// ============================================================================

export interface Attachment {
  id: string;
  name: string;
  type: string;
  path: string;
  size?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  streaming?: boolean;
}

// ============================================================================
// WORKSPACES
// ============================================================================

export interface WorkspaceConfig {
  modules: string[];
  icon: string;
}

export type WorkspacesMap = Record<string, WorkspaceConfig>;

export const WORKSPACES: WorkspacesMap = {
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

// ============================================================================
// CONSTANTES VISUALES
// ============================================================================

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

export const PROVIDER_ICONS: Record<string, string> = {
  openai:    '🤖',
  anthropic: '🧠',
  deepseek:  '🔮',
  ollama:    '🦙',
};

export const PANEL_SIZES = {
  sm: '25vh',
  md: '33vh',
  lg: '50vh',
} as const;

// ============================================================================
// TOPICS MQTT
// ============================================================================

export const TOPICS = {
  // UI
  UI_PANEL_OPEN: 'ui/panel/open',
  UI_PANEL_CLOSE: 'ui/panel/close',
  UI_MODULE_REGISTERED: 'ui/module/registered',

  // Chat
  CONVERSATION_SEND: 'conversation/send',
  CONVERSATION_MESSAGE: 'conversation/+/message',
  CONVERSATION_STREAM_END: 'conversation/stream/end',
  CONVERSATION_LOAD: 'conversation/load',
  CONVERSATION_LOADED: 'conversation/loaded',

  // Workspace
  PROJECT_ACTIVATE: 'project/activate',
  PROJECT_ACTIVATED: 'project/activated',
  PROVIDER_SELECTED: 'provider/selected',
  PROVIDER_STATE: 'provider/state',
  PROMPT_SELECTED: 'prompt/selected',
  CREDENTIAL_RESOLVED: 'credential/resolved',
} as const;
