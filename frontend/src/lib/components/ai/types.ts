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
  recommended?: boolean;
  tags?: ('fast' | 'powerful' | 'balanced' | 'cheap')[];
}

// Proveedor de IA
export interface AIProvider {
  id: string;
  name: string;
  priority: number;
  status: 'available' | 'no_key' | 'error' | 'offline';
  models: string[];
  stats: {
    requests: number;
    tokens: number;
    cost: number;
  };
  icon?: string;
}

// Configuración del modelo para generación
export interface ModelConfig {
  mode: 'auto' | 'manual';
  providerId?: string;
  modelId?: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  applyToNew?: boolean;
}

// Niveles de credencial con prioridad
export type CredentialLevel = 'CUSTOM' | 'CLIENT' | 'PROJECT' | 'GLOBAL';

// Credencial de API
export interface AICredential {
  key: string;
  provider: string;
  level: CredentialLevel;
  identifier: string | null;
  api_key_preview: string;
  status?: 'active' | 'error' | 'expired';
  created_at?: string;
  last_used?: string;
}

// Estado de credencial por proveedor (para selector)
export interface ProviderCredentialStatus {
  provider: string;
  level: CredentialLevel | null;
  status: 'active' | 'no_key' | 'error';
  resolvedFrom?: string;
}

// Formulario para crear credencial
export interface NewCredentialForm {
  provider: string;
  level: CredentialLevel;
  identifier: string;
  api_key: string;
  showKey: boolean;
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

// Prompt rápido (legacy, usar PromptTemplate para nuevos)
export interface QuickPrompt {
  id: string;
  name: string;
  content: string;
  category: string;
  favorite: boolean;
  icon?: string;
}

// Template de Prompt completo (según prompt-manager)
export interface PromptTemplate {
  id: string;
  name: string;
  title: string;
  description?: string;
  content: string;
  variables: string[];
  tags: string[];
  current_version: string;
  versions?: PromptVersion[];
  stats?: PromptStats;
  created_at?: string;
  updated_at?: string;
  favorite?: boolean;
  active?: boolean;
}

// Versión de prompt
export interface PromptVersion {
  version: string;
  content: string;
  created_at: string;
}

// Estadísticas de prompt
export interface PromptStats {
  uses: number;
  tokens_avg: number;
  rating: number;
  last_used?: string;
}

// Formulario para crear/editar prompt
export interface NewPromptForm {
  name: string;
  title: string;
  content: string;
  tags: string;
  description?: string;
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
  project_id?: string;
  title?: string;
  system_prompt?: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at?: string;
  messages_count: number;
  ai_settings?: ConversationAISettings;
  stats?: ConversationStats;
  metadata?: Record<string, unknown>;
}

// Configuración de IA por conversación
export interface ConversationAISettings {
  provider?: string;
  model?: string;
  temperature: number;
  max_tokens: number;
  context_window: number;
}

// Estadísticas de conversación
export interface ConversationStats {
  total_tokens: number;
  total_cost: number;
  avg_response_time?: number;
}

// Resumen de conversación para listas
export interface ConversationSummary {
  id: string;
  title: string;
  project_id?: string;
  project_name?: string;
  messages_count: number;
  model?: string;
  total_tokens?: number;
  total_cost?: number;
  updated_at: string;
  is_active?: boolean;
}

// Formulario para crear conversación
export interface NewConversationForm {
  project_id: string;
  title: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  context_window: number;
}

// Proyecto (referencia simplificada)
export interface ProjectRef {
  id: string;
  name: string;
  is_active?: boolean;
}

// Categorías de archivos
export type FileCategory = 'uploads' | 'exports' | 'temp' | 'files';

// Archivo en storage
export interface StorageFile {
  id: string;
  project_id: string;
  filename: string;
  original_filename: string;
  path: string;
  relative_path: string;
  size: number;
  mime_type: string;
  category: FileCategory;
  created_at: string;
  metadata?: Record<string, unknown>;
}

// Información de uso de storage
export interface StorageInfo {
  project_id: string;
  total_size: number;
  by_category: {
    uploads: { count: number; size: number };
    exports: { count: number; size: number };
    temp: { count: number; size: number };
    files: { count: number; size: number };
  };
}

// Archivo pendiente de subir
export interface PendingUpload {
  file: File;
  name: string;
  size: number;
  type: string;
}

// Formulario de subida
export interface UploadForm {
  category: FileCategory;
  attachToMessage: boolean;
  files: PendingUpload[];
}

// Metadata de proyecto
export interface ProjectMetadata {
  default_provider?: string;
  default_model?: string;
  tags?: string[];
}

// Proyecto completo
export interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  metadata?: ProjectMetadata;
}

// Estadísticas de proyecto para display
export interface ProjectStats {
  conversations_count: number;
  storage_size: number;
  total_cost: number;
}

// Resumen de proyecto para listas
export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stats: ProjectStats;
  metadata?: ProjectMetadata;
}

// Formulario para crear/editar proyecto
export interface NewProjectForm {
  name: string;
  description: string;
  default_provider: string;
  default_model: string;
  activate_immediately: boolean;
}

// Archivo o carpeta en el explorador
export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  modified_at?: string;
  mime_type?: string;
  children_count?: number;
}

// Contenido de archivo abierto
export interface FileContent {
  path: string;
  content: string;
  format: 'json' | 'md' | 'txt' | 'js' | 'html' | 'css' | 'xml' | 'yaml' | 'other';
  size: number;
  is_valid?: boolean;
  line_count?: number;
}

// Configuración de PDF viewer
export interface PDFViewerState {
  path: string;
  current_page: number;
  total_pages: number;
  zoom: number;
  extracted_text?: string;
}

// Configuración de voz (Web Speech API)
export interface VoiceConfig {
  // Speech-to-Text
  stt_language: string;
  continuous_mode: boolean;
  auto_send_on_silence: boolean;
  // Text-to-Speech
  tts_voice: string;
  tts_rate: number;
  tts_pitch: number;
  // Accesibilidad
  auto_read_responses: boolean;
  confirm_before_send: boolean;
}

// Estado de dictado
export interface DictationState {
  is_listening: boolean;
  transcript: string;
  interim_transcript: string;
  confidence: number;
}

// Configuración de cámara (MediaDevices API)
export interface CameraConfig {
  device_id: string;
  facing_mode: 'user' | 'environment';
  resolution: 'low' | 'medium' | 'high';
  format: 'jpeg' | 'png';
  auto_attach: boolean;
}

// Captura de cámara
export interface CameraCapture {
  id: string;
  data_url: string;
  timestamp: string;
  size: number;
  width: number;
  height: number;
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
