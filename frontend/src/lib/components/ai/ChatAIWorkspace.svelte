<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Badge, Button } from '$components/ui';
  import type {
    AIModel,
    AICredential,
    AITool,
    AIPlugin,
    AIProvider,
    ModelConfig,
    CredentialLevel,
    ProviderCredentialStatus,
    NewCredentialForm,
    ContextItem,
    QuickPrompt,
    PromptTemplate,
    PromptLevel,
    NewPromptForm,
    ChatMessage,
    Conversation,
    ConversationSummary,
    NewConversationForm,
    ProjectRef,
    FileCategory,
    StorageFile,
    StorageInfo,
    PendingUpload,
    ProjectSummary,
    NewProjectForm,
    FileEntry,
    FileContent,
    VoiceConfig,
    DictationState,
    CameraConfig,
    CameraCapture
  } from './types';
  import {
    DEFAULT_MODELS,
    getProviderIcon,
    getToolCategoryIcon,
    getContextIcon
  } from './types';

  /**
   * ChatAIWorkspace - Componente reutilizable para chat con IA
   *
   * Incluye:
   * - Selector de modelos IA
   * - Selector de credenciales
   * - Prompts rápidos con favoritos
   * - Tools con toggles
   * - Plugins con toggles
   * - Contexto actual
   * - Panel de estadísticas
   * - Panel de configuración
   *
   * Uso:
   * <ChatAIWorkspace
   *   bind:selectedModelId
   *   bind:credentials
   *   bind:tools
   *   bind:plugins
   *   on:modelSelect
   *   on:credentialSelect
   *   on:promptApply
   * />
   */

  // Props - Modelos
  export let availableModels: AIModel[] = DEFAULT_MODELS;
  export let selectedModelId: string = 'deepseek-chat';
  export let selectedProviderId: string = 'DEEPSEEK';
  export let autoFallback: boolean = true;

  // Props - Proveedores
  export let providers: AIProvider[] = [];

  // Props - Configuración del modelo
  export let modelConfig: ModelConfig = {
    mode: 'auto',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1.0,
    applyToNew: false
  };

  // Props - Credenciales
  export let credentials: AICredential[] = [];
  export let providerCredentialStatus: ProviderCredentialStatus[] = [];

  // Estado local para formulario de nueva credencial
  let newCredentialForm: NewCredentialForm = {
    provider: '',
    level: 'GLOBAL',
    identifier: '',
    api_key: '',
    showKey: false
  };

  // Filtros para gestión de credenciales
  let credentialFilterLevel: CredentialLevel | 'ALL' = 'ALL';
  let credentialFilterProvider: string = 'ALL';
  let credentialSearchQuery: string = '';

  // Props - Tools
  export let tools: AITool[] = [];

  // Props - Plugins
  export let plugins: AIPlugin[] = [];

  // Props - Contexto
  export let contextItems: ContextItem[] = [];

  // Props - Prompts
  export let quickPrompts: QuickPrompt[] = [];
  export let promptTemplates: PromptTemplate[] = [];
  export let activePromptId: string = '';

  // Estado local para formulario de nuevo prompt
  let newPromptForm: NewPromptForm = {
    name: '',
    title: '',
    content: '',
    tags: '',
    description: '',
    level: 'PROJECT'
  };

  // Filtros para gestión de prompts
  let promptFilterTag: string = 'ALL';
  let promptFilterLevel: PromptLevel | 'ALL' = 'ALL';
  let promptSearchQuery: string = '';

  // Props - Conversaciones (Historial)
  export let conversations: ConversationSummary[] = [];
  export let activeConversationId: string = '';
  export let projects: ProjectRef[] = [];
  export let currentProjectId: string = '';

  // Estado local para formulario de nueva conversación
  let newConversationForm: NewConversationForm = {
    project_id: '',
    title: '',
    system_prompt: '',
    model: 'auto',
    temperature: 0.7,
    max_tokens: 2000,
    context_window: 20
  };

  // Filtros para gestión de conversaciones
  let conversationFilterProject: string = 'ALL';
  let conversationSortBy: 'recent' | 'messages' | 'cost' = 'recent';
  let conversationSearchQuery: string = '';

  // Props - Archivos (Adjuntar)
  export let storageFiles: StorageFile[] = [];
  export let storageInfo: StorageInfo | null = null;

  // Estado local para selección de archivos
  let selectedFileIds: Set<string> = new Set();
  let fileFilterCategory: FileCategory | 'ALL' = 'ALL';
  let fileSearchQuery: string = '';

  // Estado local para subida de archivos
  let pendingUploads: PendingUpload[] = [];
  let uploadCategory: FileCategory = 'uploads';
  let attachToMessage: boolean = true;
  let isDragging: boolean = false;

  // Props - Proyectos (project-manager)
  export let projectsList: ProjectSummary[] = [];
  export let activeProjectId: string = '';

  // Estado local para formulario de nuevo proyecto
  let newProjectForm: NewProjectForm = {
    name: '',
    description: '',
    default_provider: 'auto',
    default_model: 'auto',
    activate_immediately: true
  };

  // Filtros para gestión de proyectos
  let projectSortBy: 'recent' | 'name' | 'size' = 'recent';
  let projectSearchQuery: string = '';

  // Props - Explorar (file-browser)
  export let fileEntries: FileEntry[] = [];
  export let currentPath: string = '/';

  // Estado local para explorador
  let openedFile: FileContent | null = null;
  let isEditing: boolean = false;
  let editedContent: string = '';
  let explorerSearchQuery: string = '';
  let explorerSearchInContent: boolean = false;
  let explorerFilter: 'all' | 'pdf' | 'text' | 'image' = 'all';

  // Props - Voz (Web Speech API)
  export let voiceConfig: VoiceConfig = {
    stt_language: 'es-ES',
    continuous_mode: false,
    auto_send_on_silence: false,
    tts_voice: '',
    tts_rate: 1.0,
    tts_pitch: 1.0,
    auto_read_responses: false,
    confirm_before_send: true
  };

  // Estado local para voz
  let dictationState: DictationState = {
    is_listening: false,
    transcript: '',
    interim_transcript: '',
    confidence: 0
  };
  let isSpeaking: boolean = false;
  let availableVoices: SpeechSynthesisVoice[] = [];

  // Props - Cámara (MediaDevices API)
  export let cameraConfig: CameraConfig = {
    device_id: '',
    facing_mode: 'environment',
    resolution: 'medium',
    format: 'jpeg',
    auto_attach: false
  };

  // Estado local para cámara
  export let recentCaptures: CameraCapture[] = [];
  let isCameraActive: boolean = false;
  let capturedImage: string | null = null;
  let selectedCaptureIds: Set<string> = new Set();

  // Props - Panel actual
  export let currentPanel: string = '';

  // Props - Estadísticas (para stats panel)
  export let stats: {
    total?: number;
    validated?: number;
    processing?: number;
    errors?: number;
    products?: number;
    categories?: number;
  } = {};

  // Dispatch events
  const dispatch = createEventDispatcher<{
    // Modelo
    modelSelect: { modelId: string; model: AIModel };
    providerSelect: { providerId: string };
    autoFallbackToggle: { enabled: boolean };
    modelConfigSave: { config: ModelConfig };
    providerTest: { providerId: string };
    providerPriorityChange: { providerId: string; direction: 'up' | 'down' };
    // Credencial
    credentialSelect: { credential: AICredential };
    credentialCreate: { form: NewCredentialForm };
    credentialEdit: { key: string };
    credentialDelete: { key: string };
    credentialTest: { key: string };
    credentialReload: void;
    addCredential: void;
    // Tools & Plugins
    toolToggle: { toolId: string; enabled: boolean };
    pluginToggle: { pluginId: string; enabled: boolean };
    // Prompts
    promptApply: { prompt: QuickPrompt };
    promptTemplateApply: { template: PromptTemplate };
    promptCreate: { form: NewPromptForm };
    promptEdit: { promptId: string };
    promptDuplicate: { promptId: string };
    promptDelete: { promptId: string };
    promptStats: { promptId: string };
    promptFavorite: { promptId: string; favorite: boolean };
    // Conversaciones (Historial)
    conversationOpen: { conversationId: string };
    conversationCreate: { form: NewConversationForm };
    conversationEdit: { conversationId: string };
    conversationExport: { conversationId: string; format: 'json' | 'markdown' };
    conversationDelete: { conversationId: string };
    conversationsCleanup: { olderThanDays: number };
    conversationStats: void;
    // Archivos (Adjuntar)
    filesAttach: { fileIds: string[] };
    filesUpload: { files: PendingUpload[]; category: FileCategory; attachToMessage: boolean };
    fileView: { fileId: string };
    fileDownload: { fileId: string };
    fileDelete: { fileId: string };
    filesDeleteMultiple: { fileIds: string[] };
    storageCleanup: void;
    // Proyectos (project-manager)
    projectActivate: { projectId: string };
    projectCreate: { form: NewProjectForm };
    projectEdit: { projectId: string };
    projectDelete: { projectId: string };
    projectExport: { projectId: string };
    projectImport: void;
    projectStats: { projectId: string };
    // Explorar (file-browser)
    explorerNavigate: { path: string };
    explorerOpenFile: { path: string };
    explorerCreateFolder: { path: string; name: string };
    explorerDeleteFile: { path: string };
    explorerSearch: { query: string; searchInContent: boolean };
    explorerSaveFile: { path: string; content: string };
    explorerFormatFile: { path: string };
    explorerAttachFile: { path: string };
    // Voz (Web Speech API)
    voiceStartDictation: void;
    voiceStopDictation: void;
    voiceSendTranscript: { transcript: string };
    voiceReadText: { text: string };
    voiceStopReading: void;
    voiceConfigSave: { config: VoiceConfig };
    // Cámara (MediaDevices API)
    cameraCapture: void;
    cameraAttach: { dataUrl: string };
    cameraAttachMultiple: { captureIds: string[] };
    cameraDeleteCapture: { captureId: string };
    cameraClearAll: void;
    cameraConfigSave: { config: CameraConfig };
    // Panel
    panelChange: { panelId: string };
  }>();

  // Computed
  $: selectedModel = availableModels.find(m => m.id === selectedModelId);
  $: selectedProvider = providers.find(p => p.id === selectedProviderId);
  $: modelsForSelectedProvider = availableModels.filter(m => m.provider === selectedProviderId);
  $: modelsByProvider = availableModels.reduce((acc, m) => {
    acc[m.provider] = acc[m.provider] || [];
    acc[m.provider].push(m);
    return acc;
  }, {} as Record<string, AIModel[]>);
  $: providerOptions = [...new Set(availableModels.map(m => m.provider))];
  $: totalProviderStats = providers.reduce((acc, p) => ({
    requests: acc.requests + p.stats.requests,
    tokens: acc.tokens + p.stats.tokens,
    cost: acc.cost + p.stats.cost
  }), { requests: 0, tokens: 0, cost: 0 });

  // Computed - Credenciales
  $: credentialsByLevel = credentials.reduce((acc, c) => {
    acc[c.level] = acc[c.level] || [];
    acc[c.level].push(c);
    return acc;
  }, {} as Record<CredentialLevel, AICredential[]>);

  $: filteredCredentials = credentials.filter(c => {
    if (credentialFilterLevel !== 'ALL' && c.level !== credentialFilterLevel) return false;
    if (credentialFilterProvider !== 'ALL' && c.provider !== credentialFilterProvider) return false;
    if (credentialSearchQuery) {
      const query = credentialSearchQuery.toLowerCase();
      return c.key.toLowerCase().includes(query) || c.provider.toLowerCase().includes(query);
    }
    return true;
  });

  $: credentialStats = {
    total: credentials.length,
    byLevel: {
      GLOBAL: credentialsByLevel['GLOBAL']?.length || 0,
      PROJECT: credentialsByLevel['PROJECT']?.length || 0,
      CLIENT: credentialsByLevel['CLIENT']?.length || 0,
      CUSTOM: credentialsByLevel['CUSTOM']?.length || 0
    }
  };

  $: credentialProviderOptions = [...new Set(credentials.map(c => c.provider))];

  $: toolsByCategory = tools.reduce((acc, t) => {
    acc[t.category] = acc[t.category] || [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, AITool[]>);

  $: favoritePrompts = quickPrompts.filter(p => p.favorite);
  $: nonFavoritePrompts = quickPrompts.filter(p => !p.favorite);

  // Computed - PromptTemplates
  $: allPromptTags = [...new Set(promptTemplates.flatMap(p => p.tags))];
  $: filteredPromptTemplates = promptTemplates.filter(p => {
    if (promptFilterLevel !== 'ALL' && p.level !== promptFilterLevel) return false;
    if (promptFilterTag !== 'ALL' && !p.tags.includes(promptFilterTag)) return false;
    if (promptSearchQuery) {
      const query = promptSearchQuery.toLowerCase();
      return p.name.toLowerCase().includes(query) ||
             p.title.toLowerCase().includes(query) ||
             p.content.toLowerCase().includes(query);
    }
    return true;
  });
  $: promptsByLevel = promptTemplates.reduce((acc, p) => {
    acc[p.level] = acc[p.level] || [];
    acc[p.level].push(p);
    return acc;
  }, {} as Record<PromptLevel, PromptTemplate[]>);
  $: globalPrompts = promptsByLevel['GLOBAL'] || [];
  $: projectPrompts = promptsByLevel['PROJECT'] || [];
  $: promptTotalStats = promptTemplates.reduce((acc, p) => ({
    uses: acc.uses + (p.stats?.uses || 0),
    tokens: acc.tokens + (p.stats?.tokens_avg || 0) * (p.stats?.uses || 0)
  }), { uses: 0, tokens: 0 });
  $: detectedVariables = (newPromptForm.content.match(/\{\{(\w+)\}\}/g) || [])
    .map(v => v.replace(/[{}]/g, ''));

  // Computed - Conversaciones
  $: filteredConversations = conversations
    .filter(c => {
      if (conversationFilterProject !== 'ALL' && c.project_id !== conversationFilterProject) return false;
      if (conversationSearchQuery) {
        const query = conversationSearchQuery.toLowerCase();
        return c.title.toLowerCase().includes(query);
      }
      return true;
    })
    .sort((a, b) => {
      switch (conversationSortBy) {
        case 'messages': return b.messages_count - a.messages_count;
        case 'cost': return (b.total_cost || 0) - (a.total_cost || 0);
        default: return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

  $: conversationTotalStats = conversations.reduce((acc, c) => ({
    count: acc.count + 1,
    messages: acc.messages + c.messages_count,
    cost: acc.cost + (c.total_cost || 0)
  }), { count: 0, messages: 0, cost: 0 });

  // Computed - Archivos
  $: filteredFiles = storageFiles.filter(f => {
    if (fileFilterCategory !== 'ALL' && f.category !== fileFilterCategory) return false;
    if (fileSearchQuery) {
      const query = fileSearchQuery.toLowerCase();
      return f.original_filename.toLowerCase().includes(query);
    }
    return true;
  });

  $: filesByCategory = storageFiles.reduce((acc, f) => {
    acc[f.category] = acc[f.category] || [];
    acc[f.category].push(f);
    return acc;
  }, {} as Record<FileCategory, StorageFile[]>);

  $: pendingUploadsTotalSize = pendingUploads.reduce((acc, f) => acc + f.size, 0);

  $: enabledToolsCount = tools.filter(t => t.enabled).length;
  $: enabledPluginsCount = plugins.filter(p => p.enabled).length;

  // Computed - Proyectos
  $: filteredProjects = projectsList
    .filter(p => {
      if (projectSearchQuery) {
        const query = projectSearchQuery.toLowerCase();
        return p.name.toLowerCase().includes(query) ||
               (p.description?.toLowerCase().includes(query) ?? false);
      }
      return true;
    })
    .sort((a, b) => {
      switch (projectSortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'size': return b.stats.storage_size - a.stats.storage_size;
        default: return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

  $: activeProject = projectsList.find(p => p.id === activeProjectId);

  $: projectTotalStats = projectsList.reduce((acc, p) => ({
    count: acc.count + 1,
    conversations: acc.conversations + p.stats.conversations_count,
    storage: acc.storage + p.stats.storage_size,
    cost: acc.cost + p.stats.total_cost
  }), { count: 0, conversations: 0, storage: 0, cost: 0 });

  // Computed - Explorar
  $: sortedFileEntries = [...fileEntries].sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });

  $: filteredFileEntries = sortedFileEntries.filter(f => {
    if (explorerFilter === 'pdf' && f.mime_type !== 'application/pdf') return false;
    if (explorerFilter === 'text' && !['json', 'md', 'txt', 'js', 'html', 'css', 'xml', 'yaml'].some(ext => f.name.endsWith(`.${ext}`))) return false;
    if (explorerFilter === 'image' && !f.mime_type?.startsWith('image/')) return false;
    return true;
  });

  $: explorerTotalStats = fileEntries.reduce((acc, f) => ({
    count: acc.count + 1,
    size: acc.size + (f.size || 0)
  }), { count: 0, size: 0 });

  // Computed - Cámara
  $: selectedCapturesCount = selectedCaptureIds.size;

  // Handlers - Modelo
  function selectModel(modelId: string) {
    selectedModelId = modelId;
    const model = availableModels.find(m => m.id === modelId);
    if (model) {
      dispatch('modelSelect', { modelId, model });
    }
    dispatch('panelChange', { panelId: '' });
  }

  function selectProvider(providerId: string) {
    selectedProviderId = providerId;
    dispatch('providerSelect', { providerId });
  }

  function toggleAutoFallback() {
    autoFallback = !autoFallback;
    dispatch('autoFallbackToggle', { enabled: autoFallback });
  }

  function updateModelConfig<K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) {
    modelConfig = { ...modelConfig, [key]: value };
  }

  function saveModelConfig() {
    dispatch('modelConfigSave', { config: modelConfig });
    dispatch('panelChange', { panelId: '' });
  }

  function testProvider(providerId: string) {
    dispatch('providerTest', { providerId });
  }

  function changeProviderPriority(providerId: string, direction: 'up' | 'down') {
    dispatch('providerPriorityChange', { providerId, direction });
  }

  function getProviderStatusIcon(status: string): string {
    switch (status) {
      case 'available': return '✅';
      case 'no_key': return '⚠️';
      case 'error': return '❌';
      case 'offline': return '🔌';
      default: return '❓';
    }
  }

  function getProviderStatusLabel(status: string): string {
    switch (status) {
      case 'available': return 'Disponible';
      case 'no_key': return 'Sin API Key';
      case 'error': return 'Error';
      case 'offline': return 'Offline';
      default: return 'Desconocido';
    }
  }

  function getPriorityBadge(priority: number): string {
    switch (priority) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${priority}`;
    }
  }

  function formatCost(cost: number): string {
    return `$${cost.toFixed(2)}`;
  }

  function formatTokens(tokens: number): string {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  }

  function selectCredential(cred: AICredential) {
    dispatch('credentialSelect', { credential: cred });
    dispatch('panelChange', { panelId: '' });
  }

  function resetNewCredentialForm() {
    newCredentialForm = {
      provider: '',
      level: 'GLOBAL',
      identifier: '',
      api_key: '',
      showKey: false
    };
  }

  function createCredential() {
    if (!newCredentialForm.provider || !newCredentialForm.api_key) return;
    if (newCredentialForm.level !== 'GLOBAL' && !newCredentialForm.identifier) return;

    dispatch('credentialCreate', { form: { ...newCredentialForm } });
    resetNewCredentialForm();
    dispatch('panelChange', { panelId: '' });
  }

  function editCredential(key: string) {
    dispatch('credentialEdit', { key });
  }

  function deleteCredential(key: string) {
    if (confirm('¿Eliminar esta credencial?')) {
      dispatch('credentialDelete', { key });
    }
  }

  function testCredential(key: string) {
    dispatch('credentialTest', { key });
  }

  function reloadCredentials() {
    dispatch('credentialReload');
  }

  function getCredentialStatusIcon(status: string): string {
    switch (status) {
      case 'active': return '✅';
      case 'no_key': return '⚠️';
      case 'error': return '❌';
      default: return '❓';
    }
  }

  function getCredentialStatusLabel(status: string): string {
    switch (status) {
      case 'active': return 'Activa';
      case 'no_key': return 'Sin key';
      case 'error': return 'Error';
      default: return 'Desconocido';
    }
  }

  function getLevelDescription(level: CredentialLevel): string {
    switch (level) {
      case 'GLOBAL': return 'Fallback para todo';
      case 'PROJECT': return 'Solo este proyecto';
      case 'CLIENT': return 'Solo este cliente';
      case 'CUSTOM': return 'Personalizado';
    }
  }

  function getLevelPriority(level: CredentialLevel): number {
    switch (level) {
      case 'CUSTOM': return 1;
      case 'CLIENT': return 2;
      case 'PROJECT': return 3;
      case 'GLOBAL': return 4;
    }
  }

  function toggleTool(toolId: string) {
    const tool = tools.find(t => t.id === toolId);
    if (tool) {
      tool.enabled = !tool.enabled;
      tools = [...tools];
      dispatch('toolToggle', { toolId, enabled: tool.enabled });
    }
  }

  function togglePlugin(pluginId: string) {
    const plugin = plugins.find(p => p.id === pluginId);
    if (plugin) {
      plugin.enabled = !plugin.enabled;
      plugins = [...plugins];
      dispatch('pluginToggle', { pluginId, enabled: plugin.enabled });
    }
  }

  function applyPrompt(prompt: QuickPrompt) {
    dispatch('promptApply', { prompt });
    dispatch('panelChange', { panelId: '' });
  }

  function togglePromptFavorite(promptId: string) {
    const prompt = quickPrompts.find(p => p.id === promptId);
    if (prompt) {
      prompt.favorite = !prompt.favorite;
      quickPrompts = [...quickPrompts];
      dispatch('promptFavorite', { promptId, favorite: prompt.favorite });
    }
  }

  // Handlers - PromptTemplates
  function applyPromptTemplate(template: PromptTemplate) {
    activePromptId = template.id;
    dispatch('promptTemplateApply', { template });
    dispatch('panelChange', { panelId: '' });
  }

  function resetNewPromptForm() {
    newPromptForm = {
      name: '',
      title: '',
      content: '',
      tags: '',
      description: '',
      level: 'PROJECT'
    };
  }

  function getPromptLevelIcon(level: PromptLevel): string {
    switch (level) {
      case 'GLOBAL': return '🌐';
      case 'PROJECT': return '📁';
      case 'CONVERSATION': return '💬';
    }
  }

  function getPromptLevelLabel(level: PromptLevel): string {
    switch (level) {
      case 'GLOBAL': return 'Global';
      case 'PROJECT': return 'Proyecto';
      case 'CONVERSATION': return 'Conversación';
    }
  }

  function createPrompt() {
    if (!newPromptForm.name || !newPromptForm.content) return;
    dispatch('promptCreate', { form: { ...newPromptForm } });
    resetNewPromptForm();
    dispatch('panelChange', { panelId: '' });
  }

  function editPrompt(promptId: string) {
    dispatch('promptEdit', { promptId });
  }

  function duplicatePrompt(promptId: string) {
    dispatch('promptDuplicate', { promptId });
  }

  function deletePrompt(promptId: string) {
    if (confirm('¿Eliminar este prompt?')) {
      dispatch('promptDelete', { promptId });
    }
  }

  function viewPromptStats(promptId: string) {
    dispatch('promptStats', { promptId });
  }

  function togglePromptTemplateFavorite(promptId: string) {
    const template = promptTemplates.find(p => p.id === promptId);
    if (template) {
      template.favorite = !template.favorite;
      promptTemplates = [...promptTemplates];
      dispatch('promptFavorite', { promptId, favorite: template.favorite || false });
    }
  }

  // Handlers - Conversaciones
  function openConversation(conversationId: string) {
    activeConversationId = conversationId;
    dispatch('conversationOpen', { conversationId });
    dispatch('panelChange', { panelId: '' });
  }

  function resetNewConversationForm() {
    newConversationForm = {
      project_id: currentProjectId || '',
      title: '',
      system_prompt: '',
      model: 'auto',
      temperature: 0.7,
      max_tokens: 2000,
      context_window: 20
    };
  }

  function createConversation() {
    if (!newConversationForm.project_id) return;
    dispatch('conversationCreate', { form: { ...newConversationForm } });
    resetNewConversationForm();
    dispatch('panelChange', { panelId: '' });
  }

  function editConversation(conversationId: string) {
    dispatch('conversationEdit', { conversationId });
  }

  function exportConversation(conversationId: string, format: 'json' | 'markdown') {
    dispatch('conversationExport', { conversationId, format });
  }

  function deleteConversation(conversationId: string) {
    if (confirm('¿Eliminar esta conversación?')) {
      dispatch('conversationDelete', { conversationId });
    }
  }

  function cleanupOldConversations() {
    if (confirm('¿Eliminar conversaciones de más de 30 días?')) {
      dispatch('conversationsCleanup', { olderThanDays: 30 });
    }
  }

  function viewConversationStats() {
    dispatch('conversationStats');
  }

  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `hace ${diffMins}m`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    if (diffDays < 7) return `hace ${diffDays}d`;
    return date.toLocaleDateString();
  }

  // Handlers - Archivos
  function toggleFileSelection(fileId: string) {
    if (selectedFileIds.has(fileId)) {
      selectedFileIds.delete(fileId);
    } else {
      selectedFileIds.add(fileId);
    }
    selectedFileIds = new Set(selectedFileIds);
  }

  function attachSelectedFiles() {
    if (selectedFileIds.size > 0) {
      dispatch('filesAttach', { fileIds: Array.from(selectedFileIds) });
      selectedFileIds = new Set();
      dispatch('panelChange', { panelId: '' });
    }
  }

  function handleFileDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    const files = event.dataTransfer?.files;
    if (files) {
      addFilesToUpload(files);
    }
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      addFilesToUpload(input.files);
    }
  }

  function addFilesToUpload(files: FileList) {
    const newFiles: PendingUpload[] = Array.from(files).map(file => ({
      file,
      name: file.name,
      size: file.size,
      type: file.type
    }));
    pendingUploads = [...pendingUploads, ...newFiles];
  }

  function removeFromUpload(index: number) {
    pendingUploads = pendingUploads.filter((_, i) => i !== index);
  }

  function uploadFiles() {
    if (pendingUploads.length > 0) {
      dispatch('filesUpload', {
        files: pendingUploads,
        category: uploadCategory,
        attachToMessage
      });
      pendingUploads = [];
      dispatch('panelChange', { panelId: '' });
    }
  }

  function viewFile(fileId: string) {
    dispatch('fileView', { fileId });
  }

  function downloadFile(fileId: string) {
    dispatch('fileDownload', { fileId });
  }

  function deleteFile(fileId: string) {
    if (confirm('¿Eliminar este archivo?')) {
      dispatch('fileDelete', { fileId });
    }
  }

  function deleteSelectedFiles() {
    if (selectedFileIds.size > 0 && confirm(`¿Eliminar ${selectedFileIds.size} archivos?`)) {
      dispatch('filesDeleteMultiple', { fileIds: Array.from(selectedFileIds) });
      selectedFileIds = new Set();
    }
  }

  function cleanupStorage() {
    if (confirm('¿Limpiar archivos temporales (>24h)?')) {
      dispatch('storageCleanup');
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }

  function getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.startsWith('text/') || mimeType.includes('json')) return '📝';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
    return '📎';
  }

  // Handlers - Proyectos
  function activateProject(projectId: string) {
    activeProjectId = projectId;
    dispatch('projectActivate', { projectId });
    dispatch('panelChange', { panelId: '' });
  }

  function resetNewProjectForm() {
    newProjectForm = {
      name: '',
      description: '',
      default_provider: 'auto',
      default_model: 'auto',
      activate_immediately: true
    };
  }

  function createProject() {
    if (!newProjectForm.name) return;
    dispatch('projectCreate', { form: { ...newProjectForm } });
    resetNewProjectForm();
    dispatch('panelChange', { panelId: '' });
  }

  function editProject(projectId: string) {
    dispatch('projectEdit', { projectId });
  }

  function deleteProject(projectId: string) {
    const project = projectsList.find(p => p.id === projectId);
    if (project?.is_active) {
      alert('No se puede eliminar el proyecto activo');
      return;
    }
    if (confirm('¿Eliminar este proyecto? Se eliminará toda su base de datos y archivos.')) {
      dispatch('projectDelete', { projectId });
    }
  }

  function exportProject(projectId: string) {
    dispatch('projectExport', { projectId });
  }

  function importProject() {
    dispatch('projectImport');
  }

  function viewProjectStats(projectId: string) {
    dispatch('projectStats', { projectId });
  }

  // Handlers - Explorar
  function navigateToPath(path: string) {
    currentPath = path;
    dispatch('explorerNavigate', { path });
  }

  function navigateUp() {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = '/' + parts.join('/');
    navigateToPath(parentPath || '/');
  }

  function openFileEntry(entry: FileEntry) {
    if (entry.type === 'folder') {
      navigateToPath(entry.path);
    } else {
      dispatch('explorerOpenFile', { path: entry.path });
      dispatch('panelChange', { panelId: 'explorar-visor' });
    }
  }

  function createFolder() {
    const name = prompt('Nombre de la carpeta:');
    if (name) {
      dispatch('explorerCreateFolder', { path: currentPath, name });
    }
  }

  function deleteFileEntry(path: string) {
    if (confirm('¿Eliminar este archivo/carpeta?')) {
      dispatch('explorerDeleteFile', { path });
    }
  }

  function searchFiles() {
    dispatch('explorerSearch', { query: explorerSearchQuery, searchInContent: explorerSearchInContent });
  }

  function saveOpenedFile() {
    if (openedFile) {
      dispatch('explorerSaveFile', { path: openedFile.path, content: editedContent });
      isEditing = false;
    }
  }

  function formatOpenedFile() {
    if (openedFile) {
      dispatch('explorerFormatFile', { path: openedFile.path });
    }
  }

  function attachOpenedFile() {
    if (openedFile) {
      dispatch('explorerAttachFile', { path: openedFile.path });
      dispatch('panelChange', { panelId: '' });
    }
  }

  function getFileEntryIcon(entry: FileEntry): string {
    if (entry.type === 'folder') return '📁';
    if (entry.mime_type === 'application/pdf') return '📄';
    if (entry.mime_type?.startsWith('image/')) return '🖼️';
    if (['json', 'md', 'txt', 'js', 'html', 'css', 'xml', 'yaml'].some(ext => entry.name.endsWith(`.${ext}`))) return '📝';
    return '📎';
  }

  // Handlers - Voz
  function startDictation() {
    dictationState = { ...dictationState, is_listening: true, transcript: '', interim_transcript: '' };
    dispatch('voiceStartDictation');
  }

  function stopDictation() {
    dictationState = { ...dictationState, is_listening: false };
    dispatch('voiceStopDictation');
  }

  function cancelDictation() {
    dictationState = { is_listening: false, transcript: '', interim_transcript: '', confidence: 0 };
    dispatch('voiceStopDictation');
    dispatch('panelChange', { panelId: '' });
  }

  function sendTranscript() {
    if (dictationState.transcript) {
      dispatch('voiceSendTranscript', { transcript: dictationState.transcript });
      dictationState = { is_listening: false, transcript: '', interim_transcript: '', confidence: 0 };
      dispatch('panelChange', { panelId: '' });
    }
  }

  function readLastResponse() {
    dispatch('voiceReadText', { text: '' }); // El componente padre determinará qué leer
    isSpeaking = true;
  }

  function stopReading() {
    dispatch('voiceStopReading');
    isSpeaking = false;
  }

  function testVoice() {
    dispatch('voiceReadText', { text: 'Esta es una prueba de voz.' });
  }

  function saveVoiceConfig() {
    dispatch('voiceConfigSave', { config: { ...voiceConfig } });
    dispatch('panelChange', { panelId: '' });
  }

  // Handlers - Cámara
  function capturePhoto() {
    dispatch('cameraCapture');
  }

  function attachCapturedImage() {
    if (capturedImage) {
      dispatch('cameraAttach', { dataUrl: capturedImage });
      capturedImage = null;
      dispatch('panelChange', { panelId: '' });
    }
  }

  function discardCapture() {
    capturedImage = null;
  }

  function toggleCaptureSelection(captureId: string) {
    if (selectedCaptureIds.has(captureId)) {
      selectedCaptureIds.delete(captureId);
    } else {
      selectedCaptureIds.add(captureId);
    }
    selectedCaptureIds = new Set(selectedCaptureIds);
  }

  function attachSelectedCaptures() {
    if (selectedCaptureIds.size > 0) {
      dispatch('cameraAttachMultiple', { captureIds: Array.from(selectedCaptureIds) });
      selectedCaptureIds = new Set();
      dispatch('panelChange', { panelId: '' });
    }
  }

  function deleteCapture(captureId: string) {
    dispatch('cameraDeleteCapture', { captureId });
  }

  function clearAllCaptures() {
    if (confirm('¿Eliminar todas las capturas?')) {
      dispatch('cameraClearAll');
    }
  }

  function saveCameraConfig() {
    dispatch('cameraConfigSave', { config: { ...cameraConfig } });
    dispatch('panelChange', { panelId: '' });
  }

  function openAddCredential() {
    dispatch('addCredential');
  }
</script>

<!-- Panel: Modelo Selector (1 TAP - 30%) -->
{#if currentPanel === 'modelo-selector'}
  <div class="space-y-3">
    <!-- Header con título -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">🤖</span>
      <h3 class="font-medium">Modelo Activo</h3>
    </div>

    <!-- Selector de proveedor -->
    <div>
      <label class="text-xs text-text-muted mb-1 block">Proveedor</label>
      <select
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        value={selectedProviderId}
        on:change={(e) => selectProvider(e.currentTarget.value)}
      >
        {#each providerOptions as provider}
          <option value={provider}>{getProviderIcon(provider)} {provider}</option>
        {/each}
      </select>
    </div>

    <!-- Lista de modelos del proveedor seleccionado -->
    <div class="space-y-1">
      {#each modelsForSelectedProvider as model (model.id)}
        <button
          class="w-full text-left p-3 rounded-lg transition-colors {selectedModelId === model.id ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
          on:click={() => selectModel(model.id)}
        >
          <div class="flex items-center gap-3">
            <span class="text-lg">{selectedModelId === model.id ? '●' : '○'}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="font-medium text-sm truncate">{model.name}</p>
                {#if selectedModelId === model.id}
                  <span class="text-success text-xs">✅</span>
                {/if}
              </div>
              <div class="flex items-center gap-2 text-xs text-text-muted">
                {#if model.recommended}
                  <span class="text-primary">Recomendado</span>
                {/if}
                {#if model.tags?.includes('fast')}
                  <span>⚡ Rápido</span>
                {/if}
                {#if model.tags?.includes('powerful')}
                  <span>💪 Potente</span>
                {/if}
                {#if model.costPer1kTokens !== undefined}
                  <span>| ${model.costPer1kTokens}/1K</span>
                {/if}
              </div>
            </div>
          </div>
        </button>
      {/each}
      {#if modelsForSelectedProvider.length === 0}
        <p class="text-center text-text-muted py-4">No hay modelos disponibles para este proveedor</p>
      {/if}
    </div>

    <!-- Botón de auto fallback -->
    <div class="pt-2 border-t border-border">
      <button
        class="w-full p-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors {autoFallback ? 'bg-primary/20 text-primary' : 'bg-bg-hover text-text-muted hover:bg-bg-card'}"
        on:click={toggleAutoFallback}
      >
        <span>🔄</span>
        <span>Auto (fallback por costo)</span>
        {#if autoFallback}
          <span>✓</span>
        {/if}
      </button>
      <p class="text-xs text-text-muted text-center mt-1">
        Usa proveedores en orden de costo si hay errores
      </p>
    </div>
  </div>

<!-- Panel: Modelo Config (2 TAPS - 50%) -->
{:else if currentPanel === 'modelo-config'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-lg">🤖</span>
        <h3 class="font-medium">Configurar Modelo</h3>
      </div>
    </div>

    <!-- Modo de selección -->
    <div>
      <label class="text-xs text-text-muted mb-2 block">Modo de Selección</label>
      <div class="flex gap-2">
        <button
          class="flex-1 p-2 rounded-lg text-sm transition-colors {modelConfig.mode === 'auto' ? 'bg-primary/20 text-primary border border-primary' : 'bg-bg-hover'}"
          on:click={() => updateModelConfig('mode', 'auto')}
        >
          ○ Auto (fallback)
        </button>
        <button
          class="flex-1 p-2 rounded-lg text-sm transition-colors {modelConfig.mode === 'manual' ? 'bg-primary/20 text-primary border border-primary' : 'bg-bg-hover'}"
          on:click={() => updateModelConfig('mode', 'manual')}
        >
          ● Manual
        </button>
      </div>
    </div>

    <!-- Selector de proveedor (solo en modo manual) -->
    {#if modelConfig.mode === 'manual'}
      <div>
        <label class="text-xs text-text-muted mb-1 block">Proveedor *</label>
        <select
          class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
          value={selectedProviderId}
          on:change={(e) => selectProvider(e.currentTarget.value)}
        >
          {#each providerOptions as provider}
            <option value={provider}>{provider}</option>
          {/each}
        </select>
      </div>

      <div>
        <label class="text-xs text-text-muted mb-1 block">Modelo *</label>
        <select
          class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
          value={selectedModelId}
          on:change={(e) => selectModel(e.currentTarget.value)}
        >
          {#each modelsForSelectedProvider as model}
            <option value={model.id}>{model.name}</option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- Parámetros de generación -->
    <div class="pt-2 border-t border-border">
      <h4 class="text-xs font-medium text-text-muted mb-3 uppercase">Parámetros de Generación</h4>

      <!-- Temperature -->
      <div class="mb-4">
        <div class="flex justify-between text-sm mb-1">
          <label>Temperature (Creatividad)</label>
          <span class="font-mono text-primary">{modelConfig.temperature.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={modelConfig.temperature}
          on:input={(e) => updateModelConfig('temperature', parseFloat(e.currentTarget.value))}
          class="w-full accent-primary"
        />
        <div class="flex justify-between text-xs text-text-muted">
          <span>0 (Preciso)</span>
          <span>2 (Creativo)</span>
        </div>
      </div>

      <!-- Max Tokens -->
      <div class="mb-4">
        <div class="flex justify-between text-sm mb-1">
          <label>Max Tokens (Longitud)</label>
          <span class="font-mono text-primary">{modelConfig.maxTokens}</span>
        </div>
        <input
          type="range"
          min="100"
          max="8192"
          step="100"
          value={modelConfig.maxTokens}
          on:input={(e) => updateModelConfig('maxTokens', parseInt(e.currentTarget.value))}
          class="w-full accent-primary"
        />
        <div class="flex justify-between text-xs text-text-muted">
          <span>100</span>
          <span>8192</span>
        </div>
      </div>

      <!-- Top P -->
      <div class="mb-4">
        <div class="flex justify-between text-sm mb-1">
          <label>Top P (Nucleus sampling)</label>
          <span class="font-mono text-primary">{modelConfig.topP.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={modelConfig.topP}
          on:input={(e) => updateModelConfig('topP', parseFloat(e.currentTarget.value))}
          class="w-full accent-primary"
        />
        <div class="flex justify-between text-xs text-text-muted">
          <span>0</span>
          <span>1</span>
        </div>
      </div>
    </div>

    <!-- Checkbox aplicar a nuevas conversaciones -->
    <label class="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={modelConfig.applyToNew}
        on:change={(e) => updateModelConfig('applyToNew', e.currentTarget.checked)}
        class="accent-primary"
      />
      <span>Aplicar a todas las conversaciones nuevas</span>
    </label>

    <!-- Botón guardar -->
    <Button variant="primary" class="w-full" on:click={saveModelConfig}>
      💾 Guardar Configuración
    </Button>
  </div>

<!-- Panel: Proveedores Gestionar (LONG-PRESS - 80%) -->
{:else if currentPanel === 'proveedores-gestionar'}
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-lg">🤖</span>
        <h3 class="font-medium">Gestionar Proveedores</h3>
      </div>
    </div>

    <!-- Barra de búsqueda y orden -->
    <div class="flex gap-2">
      <select class="flex-1 p-2 bg-bg-hover rounded-lg border border-border text-sm">
        <option value="priority">Ordenar: Prioridad</option>
        <option value="usage">Ordenar: Uso</option>
        <option value="cost">Ordenar: Costo</option>
      </select>
      <input
        type="text"
        placeholder="🔍 Buscar modelo..."
        class="flex-1 p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
      />
    </div>

    <!-- Lista de proveedores -->
    <div class="space-y-2">
      {#each providers.sort((a, b) => a.priority - b.priority) as provider (provider.id)}
        <div class="p-3 bg-bg-hover rounded-lg border border-border">
          <!-- Header del proveedor -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-lg">{getPriorityBadge(provider.priority)}</span>
              <span class="font-medium">{provider.name}</span>
            </div>
            <span class="text-sm {provider.status === 'available' ? 'text-success' : 'text-warning'}">
              {getProviderStatusIcon(provider.status)} {getProviderStatusLabel(provider.status)}
            </span>
          </div>

          <!-- Stats -->
          <div class="text-xs text-text-muted mb-2">
            Prioridad: {provider.priority} |
            Requests: {provider.stats.requests} |
            Tokens: {formatTokens(provider.stats.tokens)} |
            {formatCost(provider.stats.cost)}
          </div>

          <!-- Modelos -->
          <div class="text-xs text-text-muted mb-2">
            Modelos: {provider.models.join(', ')}
          </div>

          <!-- Acciones -->
          <div class="flex gap-1 flex-wrap">
            {#if provider.status === 'available'}
              <button
                class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
                on:click={() => testProvider(provider.id)}
              >
                🧪 Test
              </button>
              <button class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors">
                📊 Stats
              </button>
              <button
                class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
                on:click={() => changeProviderPriority(provider.id, 'up')}
                disabled={provider.priority === 1}
              >
                ⬆️
              </button>
              <button
                class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
                on:click={() => changeProviderPriority(provider.id, 'down')}
              >
                ⬇️
              </button>
            {:else if provider.status === 'no_key'}
              <button
                class="px-2 py-1 text-xs bg-warning/20 text-warning rounded hover:bg-warning/30 transition-colors"
                on:click={() => dispatch('addCredential')}
              >
                🔑 Configurar Key
              </button>
              <button class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors">
                📊 Stats
              </button>
            {/if}
          </div>
        </div>
      {/each}

      {#if providers.length === 0}
        <p class="text-center text-text-muted py-4">No hay proveedores configurados</p>
      {/if}
    </div>

    <!-- Totales -->
    {#if providers.length > 0}
      <div class="p-3 bg-bg-card rounded-lg border border-border">
        <div class="text-sm">
          📊 <strong>Totales:</strong> {totalProviderStats.requests} requests |
          {formatTokens(totalProviderStats.tokens)} tokens |
          {formatCost(totalProviderStats.cost)}
        </div>
      </div>
    {/if}

    <!-- Acciones globales -->
    <div class="flex gap-2">
      <Button variant="secondary" class="flex-1">
        🔄 Refrescar
      </Button>
      <Button variant="primary" class="flex-1">
        📈 Dashboard completo
      </Button>
    </div>
  </div>

<!-- Panel: Credencial Selector (1 TAP - 30%) -->
{:else if currentPanel === 'credencial-selector'}
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">🔑</span>
      <h3 class="font-medium">Credenciales Activas</h3>
    </div>

    <!-- Lista de proveedores con estado -->
    {#if providerCredentialStatus.length > 0}
      <div class="space-y-1">
        <div class="grid grid-cols-3 text-xs text-text-muted px-2 pb-1 border-b border-border">
          <span>Proveedor</span>
          <span>Nivel</span>
          <span class="text-right">Estado</span>
        </div>
        {#each providerCredentialStatus as pcs (pcs.provider)}
          <button
            class="w-full text-left p-2 rounded-lg transition-colors hover:bg-bg-hover"
            on:click={() => {
              const cred = credentials.find(c => c.provider === pcs.provider);
              if (cred) selectCredential(cred);
            }}
          >
            <div class="grid grid-cols-3 items-center text-sm">
              <div class="flex items-center gap-2">
                <span>{pcs.status === 'active' ? '●' : '○'}</span>
                <span>{pcs.provider}</span>
              </div>
              <span class="text-text-muted">{pcs.level || '---'}</span>
              <span class="text-right {pcs.status === 'active' ? 'text-success' : pcs.status === 'no_key' ? 'text-warning' : 'text-error'}">
                {getCredentialStatusIcon(pcs.status)} {getCredentialStatusLabel(pcs.status)}
              </span>
            </div>
          </button>
        {/each}
      </div>
    {:else if credentials.length === 0}
      <p class="text-center text-text-muted py-4">No hay credenciales configuradas</p>
      <Button variant="primary" class="w-full" on:click={openAddCredential}>
        ➕ Añadir Credencial
      </Button>
    {:else}
      <!-- Fallback: mostrar credenciales existentes -->
      {#each credentials as cred (cred.key)}
        <button
          class="w-full text-left p-2 rounded-lg transition-colors hover:bg-bg-hover"
          on:click={() => selectCredential(cred)}
        >
          <div class="flex items-center gap-3">
            <span class="text-lg">{getProviderIcon(cred.provider)}</span>
            <div class="flex-1">
              <p class="font-medium text-sm">{cred.provider}</p>
              <p class="text-xs text-text-muted">{cred.level}{cred.identifier ? ` • ${cred.identifier}` : ''}</p>
            </div>
            <span class="text-xs font-mono text-text-muted">{cred.api_key_preview}</span>
          </div>
        </button>
      {/each}
    {/if}

    <!-- Info de resolución -->
    <div class="pt-2 border-t border-border">
      <p class="text-xs text-text-muted text-center">
        Resolución: CUSTOM → CLIENT → PROJECT → GLOBAL
      </p>
    </div>
  </div>

<!-- Panel: Credencial Crear (2 TAPS - 50%) -->
{:else if currentPanel === 'credencial-crear'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-lg">🔑</span>
        <h3 class="font-medium">Nueva Credencial</h3>
      </div>
    </div>

    <!-- Formulario -->
    <div>
      <label class="text-xs text-text-muted mb-1 block">Proveedor *</label>
      <select
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        bind:value={newCredentialForm.provider}
      >
        <option value="">Seleccionar proveedor...</option>
        {#each providerOptions as provider}
          <option value={provider}>{getProviderIcon(provider)} {provider}</option>
        {/each}
      </select>
    </div>

    <div>
      <label class="text-xs text-text-muted mb-2 block">Nivel *</label>
      <div class="space-y-1">
        {#each ['GLOBAL', 'PROJECT', 'CLIENT', 'CUSTOM'] as level}
          <button
            class="w-full text-left p-2 rounded-lg text-sm transition-colors {newCredentialForm.level === level ? 'bg-primary/20 border border-primary' : 'bg-bg-hover'}"
            on:click={() => newCredentialForm.level = level}
          >
            <div class="flex items-center gap-2">
              <span>{newCredentialForm.level === level ? '●' : '○'}</span>
              <span class="font-medium">{level}</span>
              <span class="text-xs text-text-muted">({getLevelDescription(level)})</span>
            </div>
          </button>
        {/each}
      </div>
    </div>

    {#if newCredentialForm.level !== 'GLOBAL'}
      <div>
        <label class="text-xs text-text-muted mb-1 block">Identificador *</label>
        <input
          type="text"
          placeholder="proj_abc123 o client_456"
          class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
          bind:value={newCredentialForm.identifier}
        />
      </div>
    {/if}

    <div>
      <label class="text-xs text-text-muted mb-1 block">API Key *</label>
      <div class="relative">
        <input
          type={newCredentialForm.showKey ? 'text' : 'password'}
          placeholder="sk-..."
          class="w-full p-2 pr-10 bg-bg-hover rounded-lg border border-border text-sm font-mono focus:border-primary focus:outline-none"
          bind:value={newCredentialForm.api_key}
        />
        <button
          class="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
          on:click={() => newCredentialForm.showKey = !newCredentialForm.showKey}
        >
          {newCredentialForm.showKey ? '🙈' : '👁️'}
        </button>
      </div>
    </div>

    <!-- Botón guardar -->
    <Button
      variant="primary"
      class="w-full"
      on:click={createCredential}
      disabled={!newCredentialForm.provider || !newCredentialForm.api_key || (newCredentialForm.level !== 'GLOBAL' && !newCredentialForm.identifier)}
    >
      💾 Guardar Credencial
    </Button>

    <!-- Advertencia -->
    <p class="text-xs text-warning text-center">
      ⚠️ La API key se guarda en .env (no en DB)
    </p>
  </div>

<!-- Panel: Credenciales Gestionar (LONG-PRESS - 80%) -->
{:else if currentPanel === 'credenciales-gestionar'}
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-lg">🔑</span>
        <h3 class="font-medium">Gestionar Credenciales</h3>
      </div>
    </div>

    <!-- Filtros -->
    <div class="flex gap-2 flex-wrap">
      <select
        class="flex-1 min-w-[100px] p-2 bg-bg-hover rounded-lg border border-border text-sm"
        bind:value={credentialFilterLevel}
      >
        <option value="ALL">Todos los niveles</option>
        <option value="GLOBAL">GLOBAL</option>
        <option value="PROJECT">PROJECT</option>
        <option value="CLIENT">CLIENT</option>
        <option value="CUSTOM">CUSTOM</option>
      </select>
      <select
        class="flex-1 min-w-[100px] p-2 bg-bg-hover rounded-lg border border-border text-sm"
        bind:value={credentialFilterProvider}
      >
        <option value="ALL">Todos los proveedores</option>
        {#each credentialProviderOptions as provider}
          <option value={provider}>{provider}</option>
        {/each}
      </select>
      <input
        type="text"
        placeholder="🔍 Buscar..."
        class="flex-1 min-w-[120px] p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        bind:value={credentialSearchQuery}
      />
    </div>

    <!-- Lista agrupada por nivel -->
    <div class="space-y-3">
      {#each ['GLOBAL', 'PROJECT', 'CLIENT', 'CUSTOM'] as level}
        {@const levelCreds = filteredCredentials.filter(c => c.level === level)}
        {#if levelCreds.length > 0}
          <div>
            <h4 class="text-xs font-medium text-text-muted mb-2 uppercase">{level}</h4>
            <div class="space-y-1">
              {#each levelCreds as cred (cred.key)}
                <div class="p-2 bg-bg-hover rounded-lg border border-border">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-mono truncate flex-1">{cred.key}</span>
                    <span class="text-xs {cred.status === 'active' ? 'text-success' : cred.status === 'error' ? 'text-error' : 'text-warning'}">
                      {getCredentialStatusIcon(cred.status || 'active')}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-text-muted font-mono">{cred.api_key_preview}</span>
                    <div class="flex gap-1">
                      <button
                        class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
                        on:click={() => editCredential(cred.key)}
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-error/20 transition-colors"
                        on:click={() => deleteCredential(cred.key)}
                        title="Eliminar"
                      >
                        🗑️
                      </button>
                      <button
                        class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
                        on:click={() => testCredential(cred.key)}
                        title="Probar"
                      >
                        🧪
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}

      {#if filteredCredentials.length === 0}
        <p class="text-center text-text-muted py-4">No hay credenciales que coincidan</p>
      {/if}
    </div>

    <!-- Stats -->
    <div class="p-2 bg-bg-card rounded-lg border border-border text-sm">
      📊 <strong>Total:</strong> {credentialStats.total} credenciales |
      GLOBAL: {credentialStats.byLevel.GLOBAL} |
      PROJECT: {credentialStats.byLevel.PROJECT} |
      CLIENT: {credentialStats.byLevel.CLIENT}
    </div>

    <!-- Acciones globales -->
    <div class="flex gap-2">
      <Button variant="secondary" class="flex-1" on:click={() => dispatch('panelChange', { panelId: 'credencial-crear' })}>
        + Nueva Credencial
      </Button>
      <Button variant="primary" class="flex-1" on:click={reloadCredentials}>
        🔄 Recargar .env
      </Button>
    </div>
  </div>

<!-- Panel: Prompts Rápidos (1 TAP - 30%) -->
{:else if currentPanel === 'prompts'}
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">📝</span>
      <h3 class="font-medium">Prompts</h3>
    </div>

    <!-- Prompts Globales -->
    {#if globalPrompts.length > 0}
      <div>
        <p class="text-xs text-text-muted uppercase font-medium mb-2">🌐 Globales</p>
        <div class="space-y-1">
          {#each globalPrompts.slice(0, 3) as template (template.id)}
            <button
              class="w-full text-left p-2 rounded-lg transition-colors {activePromptId === template.id ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
              on:click={() => applyPromptTemplate(template)}
            >
              <div class="flex items-center gap-2">
                <span>{activePromptId === template.id ? '●' : '○'}</span>
                <p class="font-medium text-sm truncate flex-1">{template.title || template.name}</p>
                <span class="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">🌐</span>
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Prompts del Proyecto -->
    <div>
      <p class="text-xs text-text-muted uppercase font-medium mb-2">📁 Proyecto</p>
      <div class="space-y-1">
        {#each projectPrompts.slice(0, 4) as template (template.id)}
          <button
            class="w-full text-left p-2 rounded-lg transition-colors {activePromptId === template.id ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
            on:click={() => applyPromptTemplate(template)}
          >
            <div class="flex items-center gap-2">
              <span>{activePromptId === template.id ? '●' : '○'}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="font-medium text-sm truncate">{template.title || template.name}</p>
                  <span class="text-xs text-text-muted">v{template.current_version}</span>
                  {#if template.favorite}
                    <span class="text-warning">⭐</span>
                  {/if}
                </div>
              </div>
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Lista de prompts legacy (fallback) -->
    <div class="space-y-1">
      {#each promptTemplates.filter(t => t.level === 'CONVERSATION').slice(0, 3) as template (template.id)}
        <button
          class="w-full text-left p-2 rounded-lg transition-colors {activePromptId === template.id ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
          on:click={() => applyPromptTemplate(template)}
        >
          <div class="flex items-center gap-2">
            <span>{activePromptId === template.id ? '●' : '○'}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="font-medium text-sm truncate">{template.title || template.name}</p>
                <span class="text-xs px-1.5 py-0.5 bg-warning/10 text-warning rounded">💬</span>
              </div>
            </div>
          </div>
        </button>
      {/each}

      {#if promptTemplates.length === 0}
        <!-- Fallback a quickPrompts legacy -->
        {#each quickPrompts as prompt (prompt.id)}
          <button
            class="w-full text-left p-2 rounded-lg transition-colors bg-bg-hover hover:bg-bg-card"
            on:click={() => applyPrompt(prompt)}
          >
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <p class="font-medium text-sm">{prompt.name}</p>
                <p class="text-xs text-text-muted truncate">{prompt.content}</p>
              </div>
              {#if prompt.favorite}
                <span class="text-warning">⭐</span>
              {/if}
            </div>
          </button>
        {/each}
      {/if}

      {#if promptTemplates.length === 0 && quickPrompts.length === 0}
        <p class="text-center text-text-muted py-4">No hay prompts disponibles</p>
      {/if}
    </div>

    <!-- Tags rápidos -->
    {#if allPromptTags.length > 0}
      <div class="pt-2 border-t border-border">
        <p class="text-xs text-text-muted mb-2">Tags:</p>
        <div class="flex flex-wrap gap-1">
          {#each allPromptTags.slice(0, 5) as tag}
            <button
              class="px-2 py-1 text-xs rounded-full bg-bg-hover hover:bg-primary/20 transition-colors"
              on:click={() => { promptFilterTag = tag; dispatch('panelChange', { panelId: 'prompts-gestionar' }); }}
            >
              {tag}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Búsqueda rápida -->
    <input
      type="text"
      placeholder="🔍 Buscar..."
      class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
      bind:value={promptSearchQuery}
      on:input={() => { if (promptSearchQuery) dispatch('panelChange', { panelId: 'prompts-gestionar' }); }}
    />
  </div>

<!-- Panel: Prompt Crear (2 TAPS - 50%) -->
{:else if currentPanel === 'prompt-crear'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-lg">📝</span>
        <h3 class="font-medium">Nuevo Prompt</h3>
      </div>
    </div>

    <!-- Formulario -->
    <div>
      <label class="text-xs text-text-muted mb-1 block">Nombre * (slug)</label>
      <input
        type="text"
        placeholder="mi-prompt-personalizado"
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm font-mono focus:border-primary focus:outline-none"
        bind:value={newPromptForm.name}
      />
    </div>

    <div>
      <label class="text-xs text-text-muted mb-1 block">Título</label>
      <input
        type="text"
        placeholder="Mi Prompt Personalizado"
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        bind:value={newPromptForm.title}
      />
    </div>

    <div>
      <label class="text-xs text-text-muted mb-1 block">Contenido * (usa {'{{variable}}'} para templates)</label>
      <textarea
        placeholder="Eres un {{role}} experto en {{domain}}..."
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none min-h-[120px] resize-y"
        bind:value={newPromptForm.content}
      ></textarea>
    </div>

    <!-- Variables detectadas -->
    {#if detectedVariables.length > 0}
      <div class="p-2 bg-bg-card rounded-lg border border-border">
        <p class="text-xs text-text-muted mb-1">Variables detectadas:</p>
        <div class="flex flex-wrap gap-1">
          {#each detectedVariables as variable}
            <span class="px-2 py-0.5 text-xs bg-primary/20 text-primary rounded">
              {variable}
            </span>
          {/each}
        </div>
      </div>
    {/if}

    <div>
      <label class="text-xs text-text-muted mb-1 block">Tags (separados por coma)</label>
      <input
        type="text"
        placeholder="chat, asistente, custom"
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        bind:value={newPromptForm.tags}
      />
    </div>

    <!-- Selector de nivel -->
    <div>
      <label class="text-xs text-text-muted mb-1 block">Alcance</label>
      <div class="flex gap-2">
        <button
          class="flex-1 p-2 rounded-lg text-sm transition-colors {newPromptForm.level === 'GLOBAL' ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
          on:click={() => newPromptForm.level = 'GLOBAL'}
        >
          🌐 Global
        </button>
        <button
          class="flex-1 p-2 rounded-lg text-sm transition-colors {newPromptForm.level === 'PROJECT' ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
          on:click={() => newPromptForm.level = 'PROJECT'}
        >
          📁 Proyecto
        </button>
        <button
          class="flex-1 p-2 rounded-lg text-sm transition-colors {newPromptForm.level === 'CONVERSATION' ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
          on:click={() => newPromptForm.level = 'CONVERSATION'}
        >
          💬 Conv.
        </button>
      </div>
      <p class="text-xs text-text-muted mt-1">
        {#if newPromptForm.level === 'GLOBAL'}
          Disponible en todos los proyectos
        {:else if newPromptForm.level === 'PROJECT'}
          Solo en el proyecto actual
        {:else}
          Solo en esta conversación
        {/if}
      </p>
    </div>

    <!-- Botón crear -->
    <Button
      variant="primary"
      class="w-full"
      on:click={createPrompt}
      disabled={!newPromptForm.name || !newPromptForm.content}
    >
      💾 Crear Prompt
    </Button>
  </div>

<!-- Panel: Prompts Gestionar (LONG-PRESS - 80%) -->
{:else if currentPanel === 'prompts-gestionar'}
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-lg">📝</span>
        <h3 class="font-medium">Gestionar Prompts</h3>
      </div>
    </div>

    <!-- Filtro por nivel -->
    <div class="flex gap-1">
      <button
        class="px-2 py-1 text-xs rounded {promptFilterLevel === 'ALL' ? 'bg-primary/20 text-primary' : 'bg-bg-hover'}"
        on:click={() => promptFilterLevel = 'ALL'}
      >
        Todos
      </button>
      <button
        class="px-2 py-1 text-xs rounded {promptFilterLevel === 'GLOBAL' ? 'bg-primary/20 text-primary' : 'bg-bg-hover'}"
        on:click={() => promptFilterLevel = 'GLOBAL'}
      >
        🌐 Global
      </button>
      <button
        class="px-2 py-1 text-xs rounded {promptFilterLevel === 'PROJECT' ? 'bg-primary/20 text-primary' : 'bg-bg-hover'}"
        on:click={() => promptFilterLevel = 'PROJECT'}
      >
        📁 Proyecto
      </button>
      <button
        class="px-2 py-1 text-xs rounded {promptFilterLevel === 'CONVERSATION' ? 'bg-primary/20 text-primary' : 'bg-bg-hover'}"
        on:click={() => promptFilterLevel = 'CONVERSATION'}
      >
        💬 Conv.
      </button>
    </div>

    <!-- Filtros -->
    <div class="flex gap-2 flex-wrap">
      <select
        class="flex-1 min-w-[100px] p-2 bg-bg-hover rounded-lg border border-border text-sm"
        bind:value={promptFilterTag}
      >
        <option value="ALL">Todos los tags</option>
        {#each allPromptTags as tag}
          <option value={tag}>🏷️ {tag}</option>
        {/each}
      </select>
      <input
        type="text"
        placeholder="🔍 Buscar..."
        class="flex-1 min-w-[120px] p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        bind:value={promptSearchQuery}
      />
    </div>

    <!-- Lista de prompts -->
    <div class="space-y-2 max-h-[350px] overflow-y-auto">
      {#each filteredPromptTemplates as template (template.id)}
        <div class="p-3 bg-bg-hover rounded-lg border border-border">
          <!-- Header del prompt -->
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-2">
              <span>📝</span>
              <span class="font-medium text-sm">{template.title || template.name}</span>
              <span class="text-xs px-1.5 py-0.5 rounded {template.level === 'GLOBAL' ? 'bg-primary/10 text-primary' : template.level === 'PROJECT' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}">
                {getPromptLevelIcon(template.level)} {getPromptLevelLabel(template.level)}
              </span>
            </div>
            <span class="text-xs text-text-muted">v{template.current_version}</span>
          </div>

          <!-- Preview del contenido -->
          <p class="text-xs text-text-muted mb-2 truncate">"{template.content.slice(0, 50)}..."</p>

          <!-- Tags -->
          {#if template.tags.length > 0}
            <div class="flex flex-wrap gap-1 mb-2">
              {#each template.tags as tag}
                <span class="px-1.5 py-0.5 text-xs bg-bg-card rounded">{tag}</span>
              {/each}
            </div>
          {/if}

          <!-- Stats -->
          {#if template.stats}
            <div class="text-xs text-text-muted mb-2">
              Usos: {template.stats.uses} | Tokens avg: {template.stats.tokens_avg} | ⭐ {template.stats.rating.toFixed(1)}
            </div>
          {/if}

          <!-- Acciones -->
          <div class="flex gap-1 flex-wrap">
            <button
              class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
              on:click={() => editPrompt(template.id)}
            >
              ✏️ Editar
            </button>
            <button
              class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
              on:click={() => duplicatePrompt(template.id)}
            >
              📋 Duplicar
            </button>
            <button
              class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
              on:click={() => viewPromptStats(template.id)}
            >
              📊 Stats
            </button>
            <button
              class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-error/20 transition-colors"
              on:click={() => deletePrompt(template.id)}
            >
              🗑️
            </button>
          </div>
        </div>
      {/each}

      {#if filteredPromptTemplates.length === 0}
        <p class="text-center text-text-muted py-4">No hay prompts que coincidan</p>
      {/if}
    </div>

    <!-- Stats totales -->
    <div class="p-2 bg-bg-card rounded-lg border border-border text-sm">
      📊 <strong>Total:</strong> {promptTemplates.length} prompts |
      Usos hoy: {promptTotalStats.uses} |
      Tokens: {formatTokens(promptTotalStats.tokens)}
    </div>

    <!-- Acciones globales -->
    <div class="flex gap-2 flex-wrap">
      <Button variant="secondary" class="flex-1" on:click={() => dispatch('panelChange', { panelId: 'prompt-crear' })}>
        + Nuevo Prompt
      </Button>
      <button class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-primary/20 transition-colors">
        📊 Analytics
      </button>
      <button class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-primary/20 transition-colors">
        🔬 A/B Test
      </button>
    </div>
  </div>

<!-- Panel: Conversaciones (1 TAP - 30%) -->
{:else if currentPanel === 'conversaciones'}
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">💬</span>
      <h3 class="font-medium">Conversaciones</h3>
    </div>

    <!-- Lista de conversaciones recientes -->
    <div class="space-y-1">
      {#each conversations.slice(0, 6) as conv (conv.id)}
        <button
          class="w-full text-left p-2 rounded-lg transition-colors {activeConversationId === conv.id ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
          on:click={() => openConversation(conv.id)}
        >
          <div class="flex items-center gap-2">
            <span>{activeConversationId === conv.id ? '●' : '○'}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <p class="font-medium text-sm truncate">{conv.title}</p>
                <span class="text-xs text-text-muted">{formatRelativeTime(conv.updated_at)}</span>
              </div>
              <div class="text-xs text-text-muted">
                {conv.messages_count} msgs | {conv.model || 'Auto'} | {formatCost(conv.total_cost || 0)}
              </div>
            </div>
          </div>
        </button>
      {/each}

      {#if conversations.length === 0}
        <p class="text-center text-text-muted py-4">No hay conversaciones</p>
      {/if}
    </div>

    <!-- Filtro por proyecto -->
    <div class="pt-2 border-t border-border">
      <label class="text-xs text-text-muted mb-1 block">Proyecto:</label>
      <select
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm"
        bind:value={conversationFilterProject}
      >
        <option value="ALL">Todos los proyectos</option>
        {#each projects as project}
          <option value={project.id}>{project.name}</option>
        {/each}
      </select>
    </div>

    <!-- Botón nueva conversación -->
    <Button variant="primary" class="w-full" on:click={() => dispatch('panelChange', { panelId: 'conversacion-crear' })}>
      + Nueva conversación
    </Button>
  </div>

<!-- Panel: Conversación Crear (2 TAPS - 50%) -->
{:else if currentPanel === 'conversacion-crear'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-lg">💬</span>
        <h3 class="font-medium">Nueva Conversación</h3>
      </div>
    </div>

    <!-- Formulario -->
    <div>
      <label class="text-xs text-text-muted mb-1 block">Proyecto *</label>
      <select
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        bind:value={newConversationForm.project_id}
      >
        <option value="">Seleccionar proyecto...</option>
        {#each projects as project}
          <option value={project.id}>{project.name}</option>
        {/each}
      </select>
    </div>

    <div>
      <label class="text-xs text-text-muted mb-1 block">Título</label>
      <input
        type="text"
        placeholder="Nueva conversación"
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        bind:value={newConversationForm.title}
      />
    </div>

    <div>
      <label class="text-xs text-text-muted mb-1 block">System Prompt (opcional)</label>
      <textarea
        placeholder="Eres un asistente experto en..."
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none min-h-[80px] resize-y"
        bind:value={newConversationForm.system_prompt}
      ></textarea>
    </div>

    <!-- Configuración IA -->
    <div class="pt-2 border-t border-border">
      <h4 class="text-xs font-medium text-text-muted mb-3 uppercase">Configuración IA (opcional)</h4>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label class="text-xs text-text-muted mb-1 block">Modelo</label>
          <select
            class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm"
            bind:value={newConversationForm.model}
          >
            <option value="auto">Auto</option>
            {#each availableModels as model}
              <option value={model.id}>{model.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="text-xs text-text-muted mb-1 block">Temp</label>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm"
            bind:value={newConversationForm.temperature}
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-xs text-text-muted mb-1 block">Max Tokens</label>
          <input
            type="number"
            min="100"
            max="8192"
            step="100"
            class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm"
            bind:value={newConversationForm.max_tokens}
          />
        </div>
        <div>
          <label class="text-xs text-text-muted mb-1 block">Context Window</label>
          <input
            type="number"
            min="1"
            max="100"
            class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm"
            bind:value={newConversationForm.context_window}
          />
          <p class="text-xs text-text-muted mt-1">mensajes</p>
        </div>
      </div>
    </div>

    <!-- Botón crear -->
    <Button
      variant="primary"
      class="w-full"
      on:click={createConversation}
      disabled={!newConversationForm.project_id}
    >
      💬 Crear Conversación
    </Button>
  </div>

<!-- Panel: Conversaciones Gestionar (LONG-PRESS - 80%) -->
{:else if currentPanel === 'conversaciones-gestionar'}
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-lg">💬</span>
        <h3 class="font-medium">Gestionar Conversaciones</h3>
      </div>
    </div>

    <!-- Filtros -->
    <div class="flex gap-2 flex-wrap">
      <select
        class="flex-1 min-w-[100px] p-2 bg-bg-hover rounded-lg border border-border text-sm"
        bind:value={conversationFilterProject}
      >
        <option value="ALL">Todos los proyectos</option>
        {#each projects as project}
          <option value={project.id}>{project.name}</option>
        {/each}
      </select>
      <select
        class="p-2 bg-bg-hover rounded-lg border border-border text-sm"
        bind:value={conversationSortBy}
      >
        <option value="recent">Recientes</option>
        <option value="messages">Mensajes</option>
        <option value="cost">Costo</option>
      </select>
      <input
        type="text"
        placeholder="🔍 Buscar..."
        class="flex-1 min-w-[100px] p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        bind:value={conversationSearchQuery}
      />
    </div>

    <!-- Lista de conversaciones -->
    <div class="space-y-2 max-h-[400px] overflow-y-auto">
      {#each filteredConversations as conv (conv.id)}
        <div class="p-3 bg-bg-hover rounded-lg border border-border">
          <!-- Header -->
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-2">
              <span>💬</span>
              <span class="font-medium text-sm truncate">{conv.title}</span>
            </div>
            <span class="text-xs text-text-muted">{formatRelativeTime(conv.updated_at)}</span>
          </div>

          <!-- Info -->
          <div class="text-xs text-text-muted mb-2">
            {#if conv.project_name}Proyecto: {conv.project_name} | {/if}
            {conv.messages_count} msgs
          </div>
          <div class="text-xs text-text-muted mb-2">
            {conv.model || 'Auto'} | Tokens: {formatTokens(conv.total_tokens || 0)} | {formatCost(conv.total_cost || 0)}
          </div>

          <!-- Acciones -->
          <div class="flex gap-1 flex-wrap">
            <button
              class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
              on:click={() => openConversation(conv.id)}
            >
              📖 Abrir
            </button>
            <button
              class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
              on:click={() => editConversation(conv.id)}
            >
              ✏️ Editar
            </button>
            <button
              class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
              on:click={() => exportConversation(conv.id, 'markdown')}
            >
              📤 Exportar
            </button>
            <button
              class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-error/20 transition-colors"
              on:click={() => deleteConversation(conv.id)}
            >
              🗑️
            </button>
          </div>
        </div>
      {/each}

      {#if filteredConversations.length === 0}
        <p class="text-center text-text-muted py-4">No hay conversaciones que coincidan</p>
      {/if}
    </div>

    <!-- Stats totales -->
    <div class="p-2 bg-bg-card rounded-lg border border-border text-sm">
      📊 <strong>Total:</strong> {conversationTotalStats.count} conversaciones |
      {conversationTotalStats.messages} msgs |
      {formatCost(conversationTotalStats.cost)}
    </div>

    <!-- Acciones globales -->
    <div class="flex gap-2 flex-wrap">
      <Button variant="secondary" class="flex-1" on:click={() => dispatch('panelChange', { panelId: 'conversacion-crear' })}>
        + Nueva
      </Button>
      <button
        class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-error/20 transition-colors"
        on:click={cleanupOldConversations}
      >
        🗑️ Limpiar antiguas
      </button>
      <button
        class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-primary/20 transition-colors"
        on:click={viewConversationStats}
      >
        📊 Stats
      </button>
    </div>
  </div>

<!-- Panel: Adjuntar Archivo (1 TAP - 30%) -->
{:else if currentPanel === 'adjuntar-archivo'}
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">📎</span>
      <h3 class="font-medium">Adjuntar Archivo</h3>
    </div>

    <!-- Filtro por categoría -->
    <div>
      <label class="text-xs text-text-muted mb-1 block">Categoría:</label>
      <select
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm"
        bind:value={fileFilterCategory}
      >
        <option value="ALL">Todas</option>
        <option value="uploads">📤 Uploads</option>
        <option value="exports">📥 Exports</option>
        <option value="temp">⏰ Temporales</option>
        <option value="files">📁 Sistema</option>
      </select>
    </div>

    <!-- Lista de archivos con checkbox -->
    <div class="space-y-1 max-h-[250px] overflow-y-auto">
      {#each filteredFiles as file (file.id)}
        <button
          class="w-full text-left p-2 rounded-lg transition-colors flex items-center gap-2 {selectedFileIds.has(file.id) ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
          on:click={() => toggleFileSelection(file.id)}
        >
          <span class="text-lg">{selectedFileIds.has(file.id) ? '☑️' : '☐'}</span>
          <span class="text-lg">{getFileIcon(file.mime_type)}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm truncate">{file.original_filename}</p>
            <p class="text-xs text-text-muted">{formatFileSize(file.size)} • {formatRelativeTime(file.created_at)}</p>
          </div>
        </button>
      {/each}

      {#if filteredFiles.length === 0}
        <p class="text-center text-text-muted py-4">No hay archivos</p>
      {/if}
    </div>

    <!-- Seleccionados y acciones -->
    <div class="pt-2 border-t border-border flex items-center justify-between">
      <span class="text-sm text-text-muted">Seleccionados: {selectedFileIds.size}</span>
      <Button
        variant="primary"
        disabled={selectedFileIds.size === 0}
        on:click={attachSelectedFiles}
      >
        📎 Adjuntar
      </Button>
    </div>

    <!-- Subir nuevo -->
    <Button variant="secondary" class="w-full" on:click={() => dispatch('panelChange', { panelId: 'subir-archivo' })}>
      📤 Subir nuevo...
    </Button>
  </div>

<!-- Panel: Subir Archivo (2 TAPS - 50%) -->
{:else if currentPanel === 'subir-archivo'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-lg">📎</span>
        <h3 class="font-medium">Subir Archivo</h3>
      </div>
    </div>

    <!-- Zona de drag & drop -->
    <div
      class="border-2 border-dashed rounded-lg p-6 text-center transition-colors {isDragging ? 'border-primary bg-primary/10' : 'border-border'}"
      on:dragover|preventDefault={() => isDragging = true}
      on:dragleave={() => isDragging = false}
      on:drop={handleFileDrop}
    >
      <div class="text-4xl mb-2">📤</div>
      <p class="text-sm text-text-muted mb-2">Arrastra archivos aquí</p>
      <p class="text-xs text-text-muted mb-3">o</p>
      <label class="inline-block">
        <input
          type="file"
          multiple
          class="hidden"
          on:change={handleFileSelect}
        />
        <span class="px-4 py-2 bg-primary text-white rounded-lg cursor-pointer hover:bg-primary/90 transition-colors">
          Seleccionar archivos
        </span>
      </label>
    </div>

    <!-- Categoría -->
    <div>
      <label class="text-xs text-text-muted mb-1 block">Categoría destino:</label>
      <select
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm"
        bind:value={uploadCategory}
      >
        <option value="uploads">📤 Uploads</option>
        <option value="temp">⏰ Temporales</option>
      </select>
    </div>

    <!-- Checkbox adjuntar -->
    <label class="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        bind:checked={attachToMessage}
        class="accent-primary"
      />
      <span>Adjuntar al mensaje actual</span>
    </label>

    <!-- Archivos pendientes -->
    {#if pendingUploads.length > 0}
      <div class="pt-2 border-t border-border">
        <h4 class="text-xs font-medium text-text-muted mb-2 uppercase">Archivos seleccionados</h4>
        <div class="space-y-1">
          {#each pendingUploads as upload, index}
            <div class="flex items-center justify-between p-2 bg-bg-hover rounded-lg">
              <div class="flex items-center gap-2 min-w-0">
                <span>{getFileIcon(upload.type)}</span>
                <span class="text-sm truncate">{upload.name}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-text-muted">{formatFileSize(upload.size)}</span>
                <button
                  class="text-error hover:text-error/80"
                  on:click={() => removeFromUpload(index)}
                >
                  ✕
                </button>
              </div>
            </div>
          {/each}
        </div>
        <div class="text-right text-sm text-text-muted mt-2">
          Total: {formatFileSize(pendingUploadsTotalSize)}
        </div>
      </div>
    {/if}

    <!-- Botón subir -->
    <Button
      variant="primary"
      class="w-full"
      disabled={pendingUploads.length === 0}
      on:click={uploadFiles}
    >
      📤 Subir ({pendingUploads.length} archivos)
    </Button>

    <!-- Límites -->
    <p class="text-xs text-text-muted text-center">
      ⚠️ Máximo: 100 MB por archivo | Formatos: imágenes, PDF, texto, JSON
    </p>
  </div>

<!-- Panel: Archivos Gestionar (LONG-PRESS - 80%) -->
{:else if currentPanel === 'archivos-gestionar'}
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-lg">📎</span>
        <h3 class="font-medium">Gestionar Archivos</h3>
      </div>
    </div>

    <!-- Filtros -->
    <div class="flex gap-2 flex-wrap">
      <select
        class="flex-1 min-w-[100px] p-2 bg-bg-hover rounded-lg border border-border text-sm"
        bind:value={fileFilterCategory}
      >
        <option value="ALL">Todas las categorías</option>
        <option value="uploads">📤 Uploads</option>
        <option value="exports">📥 Exports</option>
        <option value="temp">⏰ Temp</option>
        <option value="files">📁 Sistema</option>
      </select>
      <input
        type="text"
        placeholder="🔍 Buscar..."
        class="flex-1 min-w-[100px] p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        bind:value={fileSearchQuery}
      />
    </div>

    <!-- Lista por categoría -->
    <div class="space-y-3 max-h-[350px] overflow-y-auto">
      {#each ['uploads', 'exports', 'temp', 'files'] as category}
        {@const categoryFiles = filesByCategory[category] || []}
        {#if categoryFiles.length > 0 && (fileFilterCategory === 'ALL' || fileFilterCategory === category)}
          <div>
            <h4 class="text-xs font-medium text-text-muted mb-2 flex items-center justify-between">
              <span>📁 {category}/</span>
              <span>{categoryFiles.length} archivos</span>
            </h4>
            <div class="space-y-1 pl-2 border-l-2 border-border">
              {#each categoryFiles as file (file.id)}
                <div class="p-2 bg-bg-hover rounded-lg">
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2 min-w-0">
                      <span>{getFileIcon(file.mime_type)}</span>
                      <span class="text-sm truncate">{file.original_filename}</span>
                    </div>
                    <span class="text-xs text-text-muted">{formatFileSize(file.size)}</span>
                  </div>
                  <div class="text-xs text-text-muted mb-2">
                    ID: {file.id.slice(0, 8)}... | {formatRelativeTime(file.created_at)}
                  </div>
                  <div class="flex gap-1">
                    <button
                      class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
                      on:click={() => viewFile(file.id)}
                    >
                      👁️ Ver
                    </button>
                    <button
                      class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-primary/20 transition-colors"
                      on:click={() => downloadFile(file.id)}
                    >
                      📥 Descargar
                    </button>
                    <button
                      class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-error/20 transition-colors"
                      on:click={() => deleteFile(file.id)}
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}

      {#if storageFiles.length === 0}
        <p class="text-center text-text-muted py-4">No hay archivos</p>
      {/if}
    </div>

    <!-- Stats de uso -->
    {#if storageInfo}
      <div class="p-2 bg-bg-card rounded-lg border border-border text-sm">
        📊 <strong>Uso:</strong> {formatFileSize(storageInfo.total_size)} |
        uploads: {formatFileSize(storageInfo.by_category.uploads.size)} ({storageInfo.by_category.uploads.count}) |
        exports: {formatFileSize(storageInfo.by_category.exports.size)} ({storageInfo.by_category.exports.count}) |
        temp: {formatFileSize(storageInfo.by_category.temp.size)}
      </div>
    {/if}

    <!-- Acciones globales -->
    <div class="flex gap-2 flex-wrap">
      <Button variant="secondary" class="flex-1" on:click={() => dispatch('panelChange', { panelId: 'subir-archivo' })}>
        📤 Subir
      </Button>
      <button
        class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-warning/20 transition-colors"
        on:click={cleanupStorage}
      >
        🧹 Limpiar temp
      </button>
      {#if selectedFileIds.size > 0}
        <button
          class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-error/20 transition-colors"
          on:click={deleteSelectedFiles}
        >
          🗑️ Eliminar sel.
        </button>
      {/if}
    </div>
  </div>

<!-- Panel: Proyectos (1 TAP - 30%) -->
{:else if currentPanel === 'proyectos'}
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">📁</span>
      <h3 class="font-medium">Proyectos</h3>
    </div>

    <!-- Lista de proyectos -->
    <div class="space-y-2">
      {#each filteredProjects as project (project.id)}
        <button
          class="w-full text-left p-3 rounded-lg transition-colors {project.is_active ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
          on:click={() => activateProject(project.id)}
        >
          <div class="flex items-center gap-3">
            <span class="text-lg">{project.is_active ? '●' : '○'}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="font-medium text-sm truncate">{project.name}</p>
                {#if project.is_active}
                  <span class="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded">activo</span>
                {/if}
              </div>
              <div class="flex items-center gap-2 text-xs text-text-muted">
                <span>💬 {project.stats.conversations_count}</span>
                <span>|</span>
                <span>📦 {formatFileSize(project.stats.storage_size)}</span>
              </div>
            </div>
          </div>
        </button>
      {/each}

      {#if projectsList.length === 0}
        <p class="text-center text-text-muted py-4">No hay proyectos</p>
      {/if}
    </div>

    <!-- Acciones -->
    <div class="pt-2 border-t border-border">
      <Button
        variant="secondary"
        class="w-full"
        on:click={() => dispatch('panelChange', { panelId: 'proyecto-crear' })}
      >
        + Nuevo proyecto
      </Button>
    </div>
  </div>

<!-- Panel: Proyecto Crear (2 TAPS - 50%) -->
{:else if currentPanel === 'proyecto-crear'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">📁</span>
      <h3 class="font-medium">Nuevo Proyecto</h3>
    </div>

    <!-- Formulario -->
    <div class="space-y-4">
      <div>
        <label class="text-sm font-medium mb-1 block">Nombre *</label>
        <input
          type="text"
          class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
          placeholder="Mi Nuevo Proyecto"
          bind:value={newProjectForm.name}
        />
      </div>

      <div>
        <label class="text-sm font-medium mb-1 block">Descripción</label>
        <textarea
          class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none resize-none"
          placeholder="Descripción del proyecto..."
          rows="3"
          bind:value={newProjectForm.description}
        ></textarea>
      </div>

      <!-- Configuración por defecto -->
      <div class="pt-2 border-t border-border">
        <p class="text-xs text-text-muted mb-3">Configuración por defecto (opcional)</p>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-text-muted mb-1 block">Proveedor</label>
            <select
              class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
              bind:value={newProjectForm.default_provider}
            >
              <option value="auto">Auto</option>
              {#each providerOptions as provider}
                <option value={provider}>{getProviderIcon(provider)} {provider}</option>
              {/each}
            </select>
          </div>
          <div>
            <label class="text-xs text-text-muted mb-1 block">Modelo</label>
            <select
              class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
              bind:value={newProjectForm.default_model}
            >
              <option value="auto">Auto</option>
              {#each availableModels as model}
                <option value={model.id}>{model.name}</option>
              {/each}
            </select>
          </div>
        </div>
      </div>

      <!-- Activar inmediatamente -->
      <div class="flex items-center gap-2">
        <input
          type="checkbox"
          id="activate-immediately"
          class="rounded"
          bind:checked={newProjectForm.activate_immediately}
        />
        <label for="activate-immediately" class="text-sm">Activar inmediatamente</label>
      </div>

      <!-- Botón crear -->
      <Button
        variant="primary"
        class="w-full"
        disabled={!newProjectForm.name}
        on:click={createProject}
      >
        📁 Crear Proyecto
      </Button>

      <p class="text-xs text-text-muted text-center">
        ⚠️ Se creará DB y storage aislados
      </p>
    </div>
  </div>

<!-- Panel: Proyectos Gestionar (LONG-PRESS - 80%) -->
{:else if currentPanel === 'proyectos-gestionar'}
  <div class="space-y-4">
    <!-- Header con filtros -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">📁</span>
      <h3 class="font-medium flex-1">Gestionar Proyectos</h3>
    </div>

    <!-- Filtros y búsqueda -->
    <div class="flex gap-2">
      <select
        class="flex-1 p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        bind:value={projectSortBy}
      >
        <option value="recent">Recientes</option>
        <option value="name">Nombre</option>
        <option value="size">Tamaño</option>
      </select>
      <input
        type="text"
        class="flex-1 p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        placeholder="🔍 Buscar..."
        bind:value={projectSearchQuery}
      />
    </div>

    <!-- Lista de proyectos -->
    <div class="space-y-3 max-h-[400px] overflow-y-auto">
      {#each filteredProjects as project (project.id)}
        <div class="p-3 bg-bg-hover rounded-lg">
          <!-- Cabecera del proyecto -->
          <div class="flex items-start gap-2 mb-2">
            <span class="text-lg">📁</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="font-medium text-sm truncate">{project.name}</p>
                {#if project.is_active}
                  <span class="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded">⭐ ACTIVO</span>
                {/if}
              </div>
              {#if project.description}
                <p class="text-xs text-text-muted truncate">{project.description}</p>
              {/if}
            </div>
          </div>

          <!-- Estadísticas -->
          <div class="flex items-center gap-3 text-xs text-text-muted mb-2">
            <span>Creado: {new Date(project.created_at).toLocaleDateString()}</span>
            <span>|</span>
            <span>Actualizado: {formatRelativeTime(project.updated_at)}</span>
          </div>
          <div class="flex items-center gap-3 text-xs mb-3">
            <span>💬 {project.stats.conversations_count} conversaciones</span>
            <span>|</span>
            <span>📦 {formatFileSize(project.stats.storage_size)}</span>
            <span>|</span>
            <span>💰 {formatCost(project.stats.total_cost)}</span>
          </div>

          <!-- Acciones -->
          <div class="flex gap-2 flex-wrap">
            {#if !project.is_active}
              <button
                class="px-2 py-1 text-xs bg-primary/20 text-primary rounded hover:bg-primary/30 transition-colors"
                on:click={() => activateProject(project.id)}
              >
                ▶️ Activar
              </button>
            {/if}
            <button
              class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-bg-hover transition-colors"
              on:click={() => editProject(project.id)}
            >
              ✏️ Editar
            </button>
            <button
              class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-bg-hover transition-colors"
              on:click={() => viewProjectStats(project.id)}
            >
              📊 Stats
            </button>
            <button
              class="px-2 py-1 text-xs bg-bg-card rounded hover:bg-bg-hover transition-colors"
              on:click={() => exportProject(project.id)}
            >
              📤 Exportar
            </button>
            {#if !project.is_active}
              <button
                class="px-2 py-1 text-xs bg-error/10 text-error rounded hover:bg-error/20 transition-colors"
                on:click={() => deleteProject(project.id)}
              >
                🗑️
              </button>
            {/if}
          </div>
        </div>
      {/each}

      {#if filteredProjects.length === 0}
        <p class="text-center text-text-muted py-4">
          {projectSearchQuery ? 'No se encontraron proyectos' : 'No hay proyectos'}
        </p>
      {/if}
    </div>

    <!-- Footer con estadísticas totales -->
    <div class="pt-2 border-t border-border">
      <div class="flex items-center justify-between text-xs text-text-muted mb-3">
        <span>📊 Total: {projectTotalStats.count} proyectos</span>
        <span>💬 {projectTotalStats.conversations} conversaciones</span>
        <span>📦 {formatFileSize(projectTotalStats.storage)}</span>
        <span>💰 {formatCost(projectTotalStats.cost)}</span>
      </div>

      <!-- Acciones globales -->
      <div class="flex gap-2">
        <Button
          variant="secondary"
          class="flex-1"
          on:click={() => dispatch('panelChange', { panelId: 'proyecto-crear' })}
        >
          + Nuevo
        </Button>
        <button
          class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-bg-card transition-colors"
          on:click={importProject}
        >
          📥 Importar proyecto
        </button>
      </div>
    </div>
  </div>

<!-- Panel: Explorar Archivos (1 TAP - 30%) -->
{:else if currentPanel === 'explorar-archivos'}
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">📂</span>
      <h3 class="font-medium flex-1">Explorar Proyecto</h3>
    </div>

    <!-- Navegación -->
    <div class="flex items-center gap-2 text-sm">
      <span class="text-text-muted">📁 Proyecto: {activeProject?.name || 'Sin proyecto'}</span>
    </div>
    <div class="flex items-center gap-2">
      {#if currentPath !== '/'}
        <button
          class="px-2 py-1 text-xs bg-bg-hover rounded hover:bg-bg-card transition-colors"
          on:click={navigateUp}
        >
          ⬆️ Subir
        </button>
      {/if}
      <span class="text-sm text-text-muted">Ruta: {currentPath}</span>
    </div>

    <!-- Lista de archivos -->
    <div class="space-y-1 max-h-[300px] overflow-y-auto">
      {#each sortedFileEntries as entry (entry.path)}
        <button
          class="w-full text-left p-2 rounded-lg bg-bg-hover hover:bg-bg-card transition-colors flex items-center gap-2"
          on:click={() => openFileEntry(entry)}
        >
          <span>{getFileEntryIcon(entry)}</span>
          <span class="flex-1 text-sm truncate">{entry.name}</span>
          {#if entry.type === 'folder'}
            <span class="text-xs text-text-muted">{entry.children_count || 0} archivos</span>
          {:else}
            <span class="text-xs text-text-muted">{formatFileSize(entry.size || 0)}</span>
          {/if}
        </button>
      {/each}

      {#if fileEntries.length === 0}
        <p class="text-center text-text-muted py-4">Carpeta vacía</p>
      {/if}
    </div>

    <!-- Búsqueda -->
    <div class="pt-2 border-t border-border">
      <input
        type="text"
        class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        placeholder="🔍 Buscar..."
        bind:value={explorerSearchQuery}
        on:keydown={(e) => e.key === 'Enter' && searchFiles()}
      />
    </div>
  </div>

<!-- Panel: Explorar Visor/Editor (2 TAPS - 50%) -->
{:else if currentPanel === 'explorar-visor'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">{openedFile?.format === 'json' || openedFile?.format === 'md' ? '📝' : '📄'}</span>
      <h3 class="font-medium flex-1 truncate">{openedFile?.path.split('/').pop() || 'Archivo'}</h3>
      {#if openedFile && ['json', 'md', 'txt', 'js', 'html', 'css', 'xml', 'yaml'].includes(openedFile.format)}
        <button
          class="text-sm px-2 py-1 rounded {isEditing ? 'bg-primary/20 text-primary' : 'bg-bg-hover'}"
          on:click={() => { isEditing = !isEditing; editedContent = openedFile?.content || ''; }}
        >
          ✏️
        </button>
      {/if}
    </div>

    <!-- Contenido -->
    {#if openedFile}
      <div class="bg-bg-hover rounded-lg p-3 max-h-[300px] overflow-auto">
        {#if isEditing}
          <textarea
            class="w-full h-64 bg-transparent text-sm font-mono resize-none focus:outline-none"
            bind:value={editedContent}
          ></textarea>
        {:else}
          <pre class="text-sm font-mono whitespace-pre-wrap">{openedFile.content}</pre>
        {/if}
      </div>

      <!-- Info del archivo -->
      <div class="flex items-center gap-2 text-xs text-text-muted">
        <span>Línea: {openedFile.line_count || 1}</span>
        <span>|</span>
        <span>{openedFile.format.toUpperCase()}</span>
        {#if openedFile.is_valid !== undefined}
          <span>|</span>
          <span class="{openedFile.is_valid ? 'text-success' : 'text-error'}">
            {openedFile.is_valid ? '✅ Válido' : '❌ Inválido'}
          </span>
        {/if}
      </div>

      <!-- Acciones -->
      <div class="flex gap-2 flex-wrap">
        {#if isEditing}
          <Button variant="secondary" on:click={formatOpenedFile}>✨ Formatear</Button>
          <Button variant="primary" on:click={saveOpenedFile}>💾 Guardar</Button>
        {/if}
        <button
          class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-bg-card transition-colors"
          on:click={attachOpenedFile}
        >
          📎 Adjuntar al chat
        </button>
      </div>
    {:else}
      <p class="text-center text-text-muted py-4">No hay archivo abierto</p>
    {/if}
  </div>

<!-- Panel: Explorar Gestionar (LONG-PRESS - 80%) -->
{:else if currentPanel === 'explorar-gestionar'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">📂</span>
      <h3 class="font-medium flex-1">Gestionar Archivos</h3>
    </div>

    <!-- Búsqueda y filtros -->
    <div class="flex gap-2 flex-wrap">
      <input
        type="text"
        class="flex-1 p-2 bg-bg-hover rounded-lg border border-border text-sm focus:border-primary focus:outline-none"
        placeholder="🔍 Buscar en nombre..."
        bind:value={explorerSearchQuery}
      />
      <label class="flex items-center gap-1 text-xs">
        <input type="checkbox" bind:checked={explorerSearchInContent} />
        En contenido
      </label>
      <button
        class="px-3 py-2 text-sm bg-primary/20 text-primary rounded-lg"
        on:click={searchFiles}
      >
        Buscar
      </button>
    </div>

    <div class="flex gap-2">
      <button
        class="px-2 py-1 text-xs rounded {explorerFilter === 'all' ? 'bg-primary/20 text-primary' : 'bg-bg-hover'}"
        on:click={() => explorerFilter = 'all'}
      >
        Todos
      </button>
      <button
        class="px-2 py-1 text-xs rounded {explorerFilter === 'pdf' ? 'bg-primary/20 text-primary' : 'bg-bg-hover'}"
        on:click={() => explorerFilter = 'pdf'}
      >
        📄 PDFs
      </button>
      <button
        class="px-2 py-1 text-xs rounded {explorerFilter === 'text' ? 'bg-primary/20 text-primary' : 'bg-bg-hover'}"
        on:click={() => explorerFilter = 'text'}
      >
        📝 Texto
      </button>
      <button
        class="px-2 py-1 text-xs rounded {explorerFilter === 'image' ? 'bg-primary/20 text-primary' : 'bg-bg-hover'}"
        on:click={() => explorerFilter = 'image'}
      >
        🖼️ Imágenes
      </button>
    </div>

    <!-- Lista de archivos con acciones -->
    <div class="space-y-2 max-h-[300px] overflow-y-auto">
      {#each filteredFileEntries as entry (entry.path)}
        <div class="p-2 bg-bg-hover rounded-lg flex items-center gap-2">
          <span>{getFileEntryIcon(entry)}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm truncate">{entry.name}</p>
            <div class="flex gap-2 text-xs text-text-muted">
              <span>{formatFileSize(entry.size || 0)}</span>
              {#if entry.modified_at}
                <span>| {formatRelativeTime(entry.modified_at)}</span>
              {/if}
            </div>
          </div>
          <div class="flex gap-1">
            <button
              class="p-1 text-xs hover:bg-bg-card rounded"
              on:click={() => openFileEntry(entry)}
            >
              👁️
            </button>
            <button
              class="p-1 text-xs hover:bg-bg-card rounded"
              on:click={() => dispatch('explorerAttachFile', { path: entry.path })}
            >
              📎
            </button>
            <button
              class="p-1 text-xs hover:bg-error/20 text-error rounded"
              on:click={() => deleteFileEntry(entry.path)}
            >
              🗑️
            </button>
          </div>
        </div>
      {/each}
    </div>

    <!-- Footer -->
    <div class="pt-2 border-t border-border">
      <div class="text-xs text-text-muted mb-2">
        📊 Total: {explorerTotalStats.count} archivos | {formatFileSize(explorerTotalStats.size)}
      </div>
      <div class="flex gap-2">
        <button
          class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-bg-card transition-colors"
          on:click={createFolder}
        >
          + Nueva carpeta
        </button>
        <Button variant="secondary" on:click={() => dispatch('panelChange', { panelId: 'subir-archivo' })}>
          📤 Subir archivo
        </Button>
      </div>
    </div>
  </div>

<!-- Panel: Voz Dictado (1 TAP - 30%) -->
{:else if currentPanel === 'voz-dictado'}
  <div class="space-y-4 text-center">
    <!-- Header -->
    <div class="flex items-center justify-center gap-2 pb-2">
      <span class="text-3xl">{dictationState.is_listening ? '🎤' : '🎙️'}</span>
    </div>

    <!-- Estado -->
    <p class="text-lg font-medium">
      {dictationState.is_listening ? 'Escuchando...' : 'Toca para dictar'}
    </p>

    <!-- Barra de audio (simulada) -->
    {#if dictationState.is_listening}
      <div class="flex justify-center gap-1">
        {#each Array(10) as _, i}
          <div
            class="w-2 bg-primary rounded animate-pulse"
            style="height: {Math.random() * 20 + 5}px; animation-delay: {i * 0.1}s"
          ></div>
        {/each}
      </div>
    {/if}

    <!-- Transcripción -->
    <div class="p-3 bg-bg-hover rounded-lg min-h-[60px]">
      <p class="text-sm">
        {dictationState.transcript || dictationState.interim_transcript || '...'}
      </p>
    </div>

    <!-- Acciones -->
    <div class="flex justify-center gap-4">
      {#if dictationState.is_listening}
        <button
          class="px-4 py-2 bg-error/20 text-error rounded-lg hover:bg-error/30 transition-colors"
          on:click={cancelDictation}
        >
          ❌ Cancelar
        </button>
        <button
          class="px-4 py-2 bg-success/20 text-success rounded-lg hover:bg-success/30 transition-colors"
          on:click={sendTranscript}
          disabled={!dictationState.transcript}
        >
          ✅ Enviar
        </button>
      {:else}
        <Button variant="primary" class="w-full" on:click={startDictation}>
          🎤 Iniciar dictado
        </Button>
      {/if}
    </div>
  </div>

<!-- Panel: Voz Configurar (2 TAPS - 50%) -->
{:else if currentPanel === 'voz-configurar'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">🎤</span>
      <h3 class="font-medium">Configurar Voz</h3>
    </div>

    <!-- Speech-to-Text -->
    <div class="space-y-3">
      <p class="text-xs text-text-muted uppercase font-medium">Dictado (Speech-to-Text)</p>

      <div>
        <label class="text-sm mb-1 block">Idioma de dictado</label>
        <select
          class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm"
          bind:value={voiceConfig.stt_language}
        >
          <option value="es-ES">Español (España)</option>
          <option value="es-MX">Español (México)</option>
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="fr-FR">Français</option>
          <option value="de-DE">Deutsch</option>
          <option value="pt-BR">Português (Brasil)</option>
        </select>
      </div>

      <div class="space-y-2">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={voiceConfig.continuous_mode} />
          Modo continuo (sigue escuchando)
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={voiceConfig.auto_send_on_silence} />
          Auto-enviar al detectar silencio
        </label>
      </div>
    </div>

    <!-- Text-to-Speech -->
    <div class="space-y-3 pt-3 border-t border-border">
      <p class="text-xs text-text-muted uppercase font-medium">Lectura (Text-to-Speech)</p>

      <div>
        <label class="text-sm mb-1 block">Voz</label>
        <select
          class="w-full p-2 bg-bg-hover rounded-lg border border-border text-sm"
          bind:value={voiceConfig.tts_voice}
        >
          <option value="">Voz por defecto</option>
          {#each availableVoices as voice}
            <option value={voice.name}>{voice.name} ({voice.lang})</option>
          {/each}
        </select>
      </div>

      <div>
        <label class="text-sm mb-1 block">Velocidad: {voiceConfig.tts_rate}x</label>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          class="w-full"
          bind:value={voiceConfig.tts_rate}
        />
      </div>

      <div>
        <label class="text-sm mb-1 block">Tono: {voiceConfig.tts_pitch}</label>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          class="w-full"
          bind:value={voiceConfig.tts_pitch}
        />
      </div>

      <button
        class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-bg-card transition-colors"
        on:click={testVoice}
      >
        🔊 Probar voz
      </button>
    </div>

    <!-- Accesibilidad -->
    <div class="space-y-2 pt-3 border-t border-border">
      <p class="text-xs text-text-muted uppercase font-medium">Accesibilidad</p>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={voiceConfig.auto_read_responses} />
        Leer respuestas automáticamente
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={voiceConfig.confirm_before_send} />
        Confirmar antes de enviar dictado
      </label>
    </div>

    <!-- Guardar -->
    <Button variant="primary" class="w-full" on:click={saveVoiceConfig}>
      💾 Guardar Configuración
    </Button>
  </div>

<!-- Panel: Voz Lectura (LONG-PRESS) -->
{:else if currentPanel === 'voz-lectura'}
  <div class="space-y-4 text-center">
    <!-- Header -->
    <div class="flex items-center justify-center gap-2 pb-2">
      <span class="text-3xl">{isSpeaking ? '🔊' : '🔇'}</span>
    </div>

    <!-- Estado -->
    <p class="text-lg font-medium">
      {isSpeaking ? 'Leyendo respuesta...' : 'Lectura de voz'}
    </p>

    <!-- Control -->
    {#if isSpeaking}
      <Button variant="secondary" class="w-full" on:click={stopReading}>
        ⏹️ Detener lectura
      </Button>
    {:else}
      <Button variant="primary" class="w-full" on:click={readLastResponse}>
        🔊 Leer última respuesta
      </Button>
    {/if}

    <p class="text-xs text-text-muted">
      Long-press en el botón 🎤 para leer la última respuesta del asistente
    </p>
  </div>

<!-- Panel: Cámara Capturar (1 TAP - 30%) -->
{:else if currentPanel === 'camara-capturar'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">📷</span>
      <h3 class="font-medium">Capturar Foto</h3>
    </div>

    <!-- Vista de cámara (placeholder) -->
    <div class="bg-bg-hover rounded-lg aspect-video flex items-center justify-center">
      {#if capturedImage}
        <img src={capturedImage} alt="Captura" class="max-w-full max-h-full rounded-lg" />
      {:else if isCameraActive}
        <div class="text-center">
          <p class="text-4xl mb-2">📸</p>
          <p class="text-sm text-text-muted">[Vista de la cámara]</p>
        </div>
      {:else}
        <div class="text-center">
          <p class="text-4xl mb-2">📷</p>
          <p class="text-sm text-text-muted">Cámara no activa</p>
        </div>
      {/if}
    </div>

    <!-- Acciones -->
    {#if capturedImage}
      <div class="flex gap-2">
        <Button variant="primary" class="flex-1" on:click={attachCapturedImage}>
          📎 Adjuntar
        </Button>
        <button
          class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-bg-card transition-colors"
          on:click={discardCapture}
        >
          🔄 Otra foto
        </button>
        <button
          class="px-3 py-2 text-sm bg-error/20 text-error rounded-lg hover:bg-error/30 transition-colors"
          on:click={() => { capturedImage = null; dispatch('panelChange', { panelId: '' }); }}
        >
          ❌
        </button>
      </div>
    {:else}
      <div class="flex gap-2">
        <Button variant="primary" class="flex-1" on:click={capturePhoto}>
          📸 Capturar
        </Button>
        <button
          class="px-3 py-2 text-sm bg-bg-hover rounded-lg hover:bg-bg-card transition-colors"
          on:click={() => cameraConfig.facing_mode = cameraConfig.facing_mode === 'user' ? 'environment' : 'user'}
        >
          🔄 Cambiar cámara
        </button>
      </div>
    {/if}
  </div>

<!-- Panel: Cámara Configurar (2 TAPS - 50%) -->
{:else if currentPanel === 'camara-configurar'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">📷</span>
      <h3 class="font-medium">Configurar Cámara</h3>
    </div>

    <!-- Cámara -->
    <div>
      <label class="text-sm font-medium mb-2 block">Cámara</label>
      <div class="space-y-2">
        <label class="flex items-center gap-2 p-2 bg-bg-hover rounded-lg cursor-pointer">
          <input
            type="radio"
            name="facing"
            value="user"
            bind:group={cameraConfig.facing_mode}
          />
          <span class="text-sm">Cámara frontal</span>
        </label>
        <label class="flex items-center gap-2 p-2 bg-bg-hover rounded-lg cursor-pointer">
          <input
            type="radio"
            name="facing"
            value="environment"
            bind:group={cameraConfig.facing_mode}
          />
          <span class="text-sm">Cámara trasera</span>
        </label>
      </div>
    </div>

    <!-- Resolución -->
    <div>
      <label class="text-sm font-medium mb-2 block">Resolución</label>
      <div class="space-y-2">
        <label class="flex items-center gap-2 p-2 bg-bg-hover rounded-lg cursor-pointer">
          <input type="radio" name="resolution" value="low" bind:group={cameraConfig.resolution} />
          <span class="text-sm">Baja (640x480) ~ 50 KB</span>
        </label>
        <label class="flex items-center gap-2 p-2 bg-bg-hover rounded-lg cursor-pointer">
          <input type="radio" name="resolution" value="medium" bind:group={cameraConfig.resolution} />
          <span class="text-sm">Media (1280x720) ~ 150 KB</span>
        </label>
        <label class="flex items-center gap-2 p-2 bg-bg-hover rounded-lg cursor-pointer">
          <input type="radio" name="resolution" value="high" bind:group={cameraConfig.resolution} />
          <span class="text-sm">Alta (1920x1080) ~ 300 KB</span>
        </label>
      </div>
    </div>

    <!-- Formato -->
    <div>
      <label class="text-sm font-medium mb-2 block">Formato de imagen</label>
      <div class="flex gap-4">
        <label class="flex items-center gap-2">
          <input type="radio" name="format" value="jpeg" bind:group={cameraConfig.format} />
          <span class="text-sm">JPEG (más pequeño)</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="radio" name="format" value="png" bind:group={cameraConfig.format} />
          <span class="text-sm">PNG (mejor calidad)</span>
        </label>
      </div>
    </div>

    <!-- Auto-adjuntar -->
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" bind:checked={cameraConfig.auto_attach} />
      Adjuntar automáticamente al capturar
    </label>

    <!-- Guardar -->
    <Button variant="primary" class="w-full" on:click={saveCameraConfig}>
      💾 Guardar Configuración
    </Button>
  </div>

<!-- Panel: Cámara Galería (LONG-PRESS - 80%) -->
{:else if currentPanel === 'camara-galeria'}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-2 border-b border-border">
      <span class="text-lg">📷</span>
      <h3 class="font-medium">Capturas Recientes</h3>
    </div>

    <!-- Grid de capturas -->
    <div class="grid grid-cols-4 gap-2">
      {#each recentCaptures as capture (capture.id)}
        <button
          class="aspect-square bg-bg-hover rounded-lg overflow-hidden relative {selectedCaptureIds.has(capture.id) ? 'ring-2 ring-primary' : ''}"
          on:click={() => toggleCaptureSelection(capture.id)}
        >
          <img src={capture.data_url} alt="Captura" class="w-full h-full object-cover" />
          {#if selectedCaptureIds.has(capture.id)}
            <div class="absolute top-1 right-1 w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center text-xs">
              ✓
            </div>
          {/if}
        </button>
      {/each}

      {#if recentCaptures.length === 0}
        <div class="col-span-4 text-center py-8 text-text-muted">
          No hay capturas recientes
        </div>
      {/if}
    </div>

    <!-- Info de selección -->
    <p class="text-sm text-text-muted">
      Seleccionadas: {selectedCapturesCount}
    </p>

    <!-- Acciones -->
    <div class="flex gap-2">
      <Button
        variant="primary"
        class="flex-1"
        disabled={selectedCapturesCount === 0}
        on:click={attachSelectedCaptures}
      >
        📎 Adjuntar seleccionadas
      </Button>
      <button
        class="px-3 py-2 text-sm bg-error/20 text-error rounded-lg hover:bg-error/30 transition-colors"
        on:click={clearAllCaptures}
        disabled={recentCaptures.length === 0}
      >
        🗑️ Limpiar todas
      </button>
    </div>
  </div>

<!-- Panel: Tools -->
{:else if currentPanel === 'tools'}
  <div class="space-y-2">
    {#each Object.entries(toolsByCategory) as [category, categoryTools]}
      <div class="mb-3">
        <h4 class="text-xs font-medium text-text-muted mb-2 uppercase">
          {getToolCategoryIcon(category)} {category}
        </h4>
        {#each categoryTools as tool (tool.id)}
          <div class="flex items-center justify-between p-3 bg-bg-hover rounded-lg mb-1">
            <div class="flex-1">
              <p class="font-medium text-sm">{tool.name}</p>
              <p class="text-xs text-text-muted">{tool.description}</p>
            </div>
            <button
              class="w-12 h-6 rounded-full transition-colors {tool.enabled ? 'bg-success' : 'bg-bg-card'}"
              on:click={() => toggleTool(tool.id)}
            >
              <span class="block w-5 h-5 rounded-full bg-white shadow transform transition-transform {tool.enabled ? 'translate-x-6' : 'translate-x-0.5'}"></span>
            </button>
          </div>
        {/each}
      </div>
    {/each}
    {#if tools.length === 0}
      <p class="text-center text-text-muted py-4">No hay herramientas disponibles</p>
    {/if}
  </div>

<!-- Panel: Plugins -->
{:else if currentPanel === 'plugins'}
  <div class="space-y-2">
    {#each plugins as plugin (plugin.id)}
      <div class="flex items-center justify-between p-3 bg-bg-hover rounded-lg">
        <div class="flex items-center gap-3">
          <span class="text-xl">{plugin.icon || '🔌'}</span>
          <div>
            <p class="font-medium text-sm">{plugin.name}</p>
            <p class="text-xs text-text-muted">{plugin.description}</p>
            <p class="text-xs text-text-muted">v{plugin.version}</p>
          </div>
        </div>
        <button
          class="w-12 h-6 rounded-full transition-colors {plugin.enabled ? 'bg-success' : 'bg-bg-card'}"
          on:click={() => togglePlugin(plugin.id)}
        >
          <span class="block w-5 h-5 rounded-full bg-white shadow transform transition-transform {plugin.enabled ? 'translate-x-6' : 'translate-x-0.5'}"></span>
        </button>
      </div>
    {/each}
    {#if plugins.length === 0}
      <p class="text-center text-text-muted py-4">No hay plugins disponibles</p>
    {/if}
  </div>

<!-- Panel: Contexto -->
{:else if currentPanel === 'contexto'}
  <div class="space-y-3">
    {#each contextItems as item (item.type)}
      <div class="flex items-center justify-between p-3 bg-bg-hover rounded-lg">
        <div class="flex items-center gap-3">
          <span class="text-lg">{item.icon || getContextIcon(item.type)}</span>
          <div>
            <p class="font-medium text-sm">{item.label}</p>
            <p class="text-xs text-text-muted">{item.value || 'No definido'}</p>
          </div>
        </div>
        <Badge variant={item.active ? 'success' : 'default'} size="sm">
          {item.active ? 'Activo' : 'Inactivo'}
        </Badge>
      </div>
    {/each}
    {#if contextItems.length === 0}
      <p class="text-center text-text-muted py-4">No hay contexto definido</p>
    {:else}
      <div class="pt-2 border-t border-border">
        <p class="text-xs text-text-muted text-center">
          El contexto se usa para enriquecer las peticiones a la IA
        </p>
      </div>
    {/if}
  </div>

<!-- Panel: Stats -->
{:else if currentPanel === 'stats'}
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-3">
      <div class="p-3 bg-bg-hover rounded-lg text-center">
        <p class="text-2xl font-bold">{stats.total || 0}</p>
        <p class="text-xs text-text-muted">Total</p>
      </div>
      <div class="p-3 bg-bg-hover rounded-lg text-center">
        <p class="text-2xl font-bold text-success">{stats.validated || 0}</p>
        <p class="text-xs text-text-muted">Validados</p>
      </div>
      <div class="p-3 bg-bg-hover rounded-lg text-center">
        <p class="text-2xl font-bold text-warning">{stats.processing || 0}</p>
        <p class="text-xs text-text-muted">En proceso</p>
      </div>
      <div class="p-3 bg-bg-hover rounded-lg text-center">
        <p class="text-2xl font-bold">{stats.products || 0}</p>
        <p class="text-xs text-text-muted">Productos</p>
      </div>
    </div>
    {#if stats.total && stats.total > 0}
      <div class="p-3 bg-bg-card rounded-lg border border-border">
        <p class="text-sm font-medium mb-2">Tasa de validación</p>
        <div class="w-full bg-bg-hover rounded-full h-2">
          <div
            class="bg-success h-2 rounded-full transition-all"
            style="width: {(stats.validated || 0) / stats.total * 100}%"
          ></div>
        </div>
        <p class="text-xs text-text-muted mt-1">
          {Math.round((stats.validated || 0) / stats.total * 100)}% validados
        </p>
      </div>
    {/if}
  </div>

<!-- Panel: Settings -->
{:else if currentPanel === 'settings'}
  <div class="space-y-4 text-sm">
    <div class="p-3 bg-bg-hover rounded-lg">
      <p class="font-medium mb-1">Modelo actual</p>
      <p class="text-text-muted">{selectedModel?.name || 'No seleccionado'}</p>
    </div>
    <div class="p-3 bg-bg-hover rounded-lg">
      <p class="font-medium mb-1">Credenciales</p>
      <p class="text-text-muted">{credentials.length} configuradas</p>
    </div>
    <div class="p-3 bg-bg-hover rounded-lg">
      <p class="font-medium mb-1">Tools habilitadas</p>
      <p class="text-text-muted">{enabledToolsCount} de {tools.length}</p>
    </div>
    <div class="p-3 bg-bg-hover rounded-lg">
      <p class="font-medium mb-1">Plugins activos</p>
      <p class="text-text-muted">{enabledPluginsCount} de {plugins.length}</p>
    </div>
  </div>

<!-- Panel: Default / Slot para paneles custom -->
{:else}
  <slot name="panel" panelId={currentPanel}>
    <p class="text-center text-text-muted py-4">Panel: {currentPanel}</p>
  </slot>
{/if}
