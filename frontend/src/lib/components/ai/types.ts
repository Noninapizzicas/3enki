/**
 * Tipos compartidos para componentes de IA
 * Usados por ChatAIWorkspace y componentes relacionados
 */

// Modelo de IA disponible
export interface AIModel {
  id: string;
  name: string;
  provider: 'DEEPSEEK' | 'OPENAI' | 'ANTHROPIC' | 'OLLAMA' | string;
  description?: string;
  maxTokens?: number;
  costPer1kTokens?: number;
}

// Credencial de API
export interface AICredential {
  key: string;
  provider: string;
  level: 'GLOBAL' | 'PROJECT' | 'CLIENT' | 'CUSTOM';
  identifier: string | null;
  api_key_preview: string;
}

// Herramienta disponible
export interface AITool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: string;
  icon?: string;
}

// Plugin disponible
export interface AIPlugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  version: string;
  icon?: string;
}

// Elemento de contexto
export interface ContextItem {
  type: string;
  label: string;
  value: string;
  active: boolean;
  icon?: string;
}

// Prompt rápido
export interface QuickPrompt {
  id: string;
  name: string;
  content: string;
  category: string;
  favorite: boolean;
  icon?: string;
}

// Mensaje de chat
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  provider?: string;
  model?: string;
  loading?: boolean;
  error?: boolean;
  metadata?: Record<string, unknown>;
}

// Conversación
export interface Conversation {
  id: string;
  title?: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at?: string;
  messages_count: number;
  metadata?: Record<string, unknown>;
}

// Configuración del workspace
export interface ChatWorkspaceConfig {
  // Modelos
  availableModels: AIModel[];
  selectedModelId: string;

  // Credenciales
  credentials: AICredential[];
  selectedCredentialKey?: string;

  // Tools
  availableTools: AITool[];

  // Plugins
  availablePlugins: AIPlugin[];

  // Contexto
  contextItems: ContextItem[];

  // Prompts
  quickPrompts: QuickPrompt[];

  // Conversaciones
  conversations: Conversation[];
  currentConversationId?: string;

  // Mensajes
  messages: ChatMessage[];

  // Estado
  loading: boolean;
  chatLoading: boolean;
}

// Eventos del workspace
export interface ChatWorkspaceEvents {
  // Modelo
  modelSelect: { modelId: string; model: AIModel };

  // Credencial
  credentialSelect: { credential: AICredential };

  // Tools
  toolToggle: { toolId: string; enabled: boolean };

  // Plugins
  pluginToggle: { pluginId: string; enabled: boolean };

  // Prompts
  promptApply: { prompt: QuickPrompt };
  promptFavorite: { promptId: string; favorite: boolean };

  // Chat
  chatSubmit: { message: string; attachments?: File[] };
  chatClear: void;

  // Conversación
  conversationSelect: { conversationId: string };
  conversationCreate: void;

  // Panel
  panelOpen: { panelId: string };
  panelClose: void;
}

// Iconos de proveedores por defecto
export const PROVIDER_ICONS: Record<string, string> = {
  DEEPSEEK: '🔮',
  OPENAI: '🤖',
  ANTHROPIC: '🧠',
  OLLAMA: '🦙',
  DEFAULT: '🔑'
};

// Iconos de categorías de tools por defecto
export const TOOL_CATEGORY_ICONS: Record<string, string> = {
  menu: '🍽️',
  ai: '🤖',
  export: '⬇️',
  import: '⬆️',
  transform: '🔄',
  validate: '✅',
  DEFAULT: '🔧'
};

// Iconos de contexto por defecto
export const CONTEXT_ICONS: Record<string, string> = {
  menu: '🍽️',
  template: '📋',
  style: '🎨',
  language: '🌐',
  file: '📎',
  DEFAULT: '📌'
};

// Modelos por defecto
export const DEFAULT_MODELS: AIModel[] = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DEEPSEEK', description: 'Modelo rápido y económico' },
  { id: 'deepseek-coder', name: 'DeepSeek Coder', provider: 'DEEPSEEK', description: 'Optimizado para código' },
  { id: 'gpt-4', name: 'GPT-4', provider: 'OPENAI', description: 'Modelo más capaz de OpenAI' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OPENAI', description: 'Rápido y económico' },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'ANTHROPIC', description: 'Modelo más capaz de Anthropic' },
  { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'ANTHROPIC', description: 'Balance calidad/velocidad' },
  { id: 'llama3', name: 'Llama 3', provider: 'OLLAMA', description: 'Modelo local open source' }
];

// Helper para obtener icono de proveedor
export function getProviderIcon(provider: string): string {
  return PROVIDER_ICONS[provider.toUpperCase()] || PROVIDER_ICONS.DEFAULT;
}

// Helper para obtener icono de categoría de tool
export function getToolCategoryIcon(category: string): string {
  return TOOL_CATEGORY_ICONS[category.toLowerCase()] || TOOL_CATEGORY_ICONS.DEFAULT;
}

// Helper para obtener icono de contexto
export function getContextIcon(type: string): string {
  return CONTEXT_ICONS[type.toLowerCase()] || CONTEXT_ICONS.DEFAULT;
}
