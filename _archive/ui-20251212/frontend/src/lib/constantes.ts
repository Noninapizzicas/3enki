/**
 * CONSTANTES PARA FRONTEND
 *
 * Constantes centralizadas para componentes Svelte.
 * Sincronizadas con core/constants.js del backend.
 */

// ============================================
// API BASE PATHS
// ============================================

export const API_BASE = '/api/modules';

export const API_ROUTES = {
  // AI Gateway
  AI: {
    BASE: `${API_BASE}/ai-gateway`,
    CHAT: `${API_BASE}/ai-gateway/chat`,
    CHAT_STREAM: `${API_BASE}/ai-gateway/chat/stream`,
    PROVIDERS: `${API_BASE}/ai-gateway/providers`,
    MODELS: `${API_BASE}/ai-gateway/models`,
    UI_STATE: `${API_BASE}/ai-gateway/ui/state`,
    UI_SELECT: `${API_BASE}/ai-gateway/ui/select`,
    UI_CONFIG: `${API_BASE}/ai-gateway/ui/config`,
  },

  // Conversation Manager
  CONVERSATION: {
    BASE: `${API_BASE}/conversation-manager`,
    LIST: `${API_BASE}/conversation-manager/conversations`,
    CREATE: `${API_BASE}/conversation-manager/conversations`,
    GET: (id: string) => `${API_BASE}/conversation-manager/conversations/${id}`,
    UPDATE: (id: string) => `${API_BASE}/conversation-manager/conversations/${id}`,
    DELETE: (id: string) => `${API_BASE}/conversation-manager/conversations/${id}`,
    MESSAGES: (id: string) => `${API_BASE}/conversation-manager/conversations/${id}/messages`,
    CONTEXT: (id: string) => `${API_BASE}/conversation-manager/conversations/${id}/context`,
    UI_STATE: `${API_BASE}/conversation-manager/ui/state`,
  },

  // Credential Manager
  CREDENTIAL: {
    BASE: `${API_BASE}/credential-manager`,
    LIST: `${API_BASE}/credential-manager/credentials`,
    SAVE: `${API_BASE}/credential-manager/credentials`,
    RESOLVE: `${API_BASE}/credential-manager/credentials/resolve`,
    UPDATE: (key: string) => `${API_BASE}/credential-manager/credentials/${key}`,
    DELETE: (key: string) => `${API_BASE}/credential-manager/credentials/${key}`,
    LEVELS: `${API_BASE}/credential-manager/credentials/levels`,
    UI_STATE: `${API_BASE}/credential-manager/ui/state`,
    UI_TEST: `${API_BASE}/credential-manager/ui/test`,
  },

  // Prompt Manager
  PROMPT: {
    BASE: `${API_BASE}/prompt-manager`,
    LIST: `${API_BASE}/prompt-manager/prompts`,
    CREATE: `${API_BASE}/prompt-manager/prompts`,
    GET: (id: string) => `${API_BASE}/prompt-manager/prompts/${id}`,
    UPDATE: (id: string) => `${API_BASE}/prompt-manager/prompts/${id}`,
    DELETE: (id: string) => `${API_BASE}/prompt-manager/prompts/${id}`,
    VERSIONS: (id: string) => `${API_BASE}/prompt-manager/prompts/${id}/versions`,
    RENDER: (id: string) => `${API_BASE}/prompt-manager/prompts/${id}/render`,
    PRESETS: `${API_BASE}/prompt-manager/presets`,
    UI_STATE: `${API_BASE}/prompt-manager/ui/state`,
  },

  // Project Manager
  PROJECT: {
    BASE: `${API_BASE}/project-manager`,
    LIST: `${API_BASE}/project-manager/projects`,
    CREATE: `${API_BASE}/project-manager/projects`,
    GET: (id: string) => `${API_BASE}/project-manager/projects/${id}`,
    UPDATE: (id: string) => `${API_BASE}/project-manager/projects/${id}`,
    DELETE: (id: string) => `${API_BASE}/project-manager/projects/${id}`,
    ACTIVATE: (id: string) => `${API_BASE}/project-manager/projects/${id}/activate`,
    ACTIVE: `${API_BASE}/project-manager/projects/active`,
  },

  // Storage Manager
  STORAGE: {
    BASE: `${API_BASE}/storage-manager`,
    UPLOAD: (projectId: string) => `${API_BASE}/storage-manager/storage/${projectId}/upload`,
    FILES: (projectId: string) => `${API_BASE}/storage-manager/storage/${projectId}/files`,
    GET_FILE: (projectId: string, fileId: string) => `${API_BASE}/storage-manager/storage/${projectId}/files/${fileId}`,
    DOWNLOAD: (projectId: string, fileId: string) => `${API_BASE}/storage-manager/storage/${projectId}/download/${fileId}`,
    DELETE_FILE: (projectId: string, fileId: string) => `${API_BASE}/storage-manager/storage/${projectId}/files/${fileId}`,
    INFO: (projectId: string) => `${API_BASE}/storage-manager/storage/${projectId}/info`,
  },

  // Menu Generator
  MENU: {
    BASE: `${API_BASE}/menu-generator`,
    UPLOAD: `${API_BASE}/menu-generator/upload`,
    LIST: `${API_BASE}/menu-generator/menus`,
    GET: (id: string) => `${API_BASE}/menu-generator/menus/${id}`,
    VALIDATE: (id: string) => `${API_BASE}/menu-generator/menus/${id}/validate`,
    EXPORT: (id: string) => `${API_BASE}/menu-generator/menus/${id}/export`,
    CONVERSATIONS: `${API_BASE}/menu-generator/conversations`,
    TEMPLATES: `${API_BASE}/menu-generator/templates`,
  },

  // Database Manager
  DATABASE: {
    BASE: `${API_BASE}/database-manager`,
    LIST: `${API_BASE}/database-manager/databases`,
    QUERY: (projectId: string) => `${API_BASE}/database-manager/databases/${projectId}/query`,
    SCHEMA: (projectId: string) => `${API_BASE}/database-manager/databases/${projectId}/schema`,
    TABLES: (projectId: string) => `${API_BASE}/database-manager/databases/${projectId}/tables`,
  },

  // Tool Orchestrator
  TOOL: {
    BASE: `${API_BASE}/tool-orchestrator`,
    LIST: `${API_BASE}/tool-orchestrator/tools`,
    GET: (name: string) => `${API_BASE}/tool-orchestrator/tools/${name}`,
    CALL: (name: string) => `${API_BASE}/tool-orchestrator/tools/${name}/call`,
  },

  // Plugin Manager
  PLUGIN: {
    BASE: `${API_BASE}/plugin-manager`,
    LIST: `${API_BASE}/plugin-manager/plugins`,
    GET: (name: string) => `${API_BASE}/plugin-manager/plugins/${name}`,
    RELOAD: `${API_BASE}/plugin-manager/plugins/reload`,
  },
} as const;

// ============================================
// EVENTOS MQTT (para WebSocket/SSE)
// ============================================

export const EVENTS = {
  // AI Events
  AI: {
    CHAT_REQUEST: 'ai.chat.request',
    CHAT_RESPONSE: 'ai.chat.response',
    REQUEST: 'ai.request',
    RESPONSE: 'ai.response',
    ERROR: 'ai.error',
  },

  // Conversation Events
  CONVERSATION: {
    CREATED: 'conversation.created',
    UPDATED: 'conversation.updated',
    DELETED: 'conversation.deleted',
    GET_REQUEST: 'conversation.get.request',
    GET_RESPONSE: 'conversation.get.response',
    LIST_REQUEST: 'conversation.list.request',
    LIST_RESPONSE: 'conversation.list.response',
  },

  // Message Events
  MESSAGE: {
    SENT: 'message.sent',
    RECEIVED: 'message.received',
    LIST_REQUEST: 'message.list.request',
    LIST_RESPONSE: 'message.list.response',
  },

  // Project Events
  PROJECT: {
    CREATED: 'project.created',
    UPDATED: 'project.updated',
    DELETED: 'project.deleted',
    ACTIVATED: 'project.activated',
    DEACTIVATED: 'project.deactivated',
  },

  // Credential Events
  CREDENTIAL: {
    SAVED: 'credential.saved',
    UPDATED: 'credential.updated',
    DELETED: 'credential.deleted',
    RESOLVED: 'credential.resolved',
  },

  // Storage Events
  STORAGE: {
    CREATED: 'storage.created',
    DELETED: 'storage.deleted',
    CLEANED: 'storage.cleaned',
  },

  // File Events
  FILE: {
    UPLOADED: 'file.uploaded',
    DELETED: 'file.deleted',
  },

  // Plugin Events
  PLUGIN: {
    LOADED: 'plugin.loaded',
    UNLOADED: 'plugin.unloaded',
    ERROR: 'plugin.error',
  },
} as const;

// ============================================
// SECCIONES TEMPORALES (para UI)
// ============================================

export const TEMPORAL_SECTIONS = {
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  THIS_WEEK: 'this_week',
  THIS_MONTH: 'this_month',
  OLDER: 'older',
} as const;

export const TEMPORAL_LABELS: Record<string, string> = {
  [TEMPORAL_SECTIONS.TODAY]: 'Hoy',
  [TEMPORAL_SECTIONS.YESTERDAY]: 'Ayer',
  [TEMPORAL_SECTIONS.THIS_WEEK]: 'Esta semana',
  [TEMPORAL_SECTIONS.THIS_MONTH]: 'Este mes',
  [TEMPORAL_SECTIONS.OLDER]: 'Anteriores',
};

// ============================================
// TAMAÑOS DE COMPONENTES
// ============================================

export const COMPONENT_SIZES = {
  SM: 'sm',
  MD: 'md',
  LG: 'lg',
} as const;

export type ComponentSize = typeof COMPONENT_SIZES[keyof typeof COMPONENT_SIZES];

// ============================================
// ESTADOS DE CARGA
// ============================================

export const LOADING_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
} as const;

export type LoadingState = typeof LOADING_STATES[keyof typeof LOADING_STATES];

// ============================================
// ROLES DE MENSAJE
// ============================================

export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const;

export type MessageRole = typeof MESSAGE_ROLES[keyof typeof MESSAGE_ROLES];

// ============================================
// NIVELES DE CREDENCIALES
// ============================================

export const CREDENTIAL_LEVELS = {
  GLOBAL: 'global',
  PROJECT: 'project',
  USER: 'user',
} as const;

export type CredentialLevel = typeof CREDENTIAL_LEVELS[keyof typeof CREDENTIAL_LEVELS];

// ============================================
// PROVEEDORES AI
// ============================================

export const AI_PROVIDERS = {
  DEEPSEEK: 'deepseek',
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  OLLAMA: 'ollama',
} as const;

export type AIProvider = typeof AI_PROVIDERS[keyof typeof AI_PROVIDERS];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Construye URL con query params
 */
export function buildUrl(base: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return base;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${base}?${queryString}` : base;
}

/**
 * Fetch con manejo de errores estandarizado
 */
export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Formatea fecha relativa para UI
 */
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;

  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Determina la sección temporal de una fecha
 */
export function getTemporalSection(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86400000).toDateString();
  const dateStr = date.toDateString();
  const diffMs = now.getTime() - date.getTime();

  if (dateStr === todayStr) return TEMPORAL_SECTIONS.TODAY;
  if (dateStr === yesterdayStr) return TEMPORAL_SECTIONS.YESTERDAY;
  if (diffMs < 7 * 86400000) return TEMPORAL_SECTIONS.THIS_WEEK;
  if (diffMs < 30 * 86400000) return TEMPORAL_SECTIONS.THIS_MONTH;
  return TEMPORAL_SECTIONS.OLDER;
}
