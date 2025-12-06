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
    NewPromptForm,
    ChatMessage,
    Conversation,
    ConversationSummary,
    NewConversationForm,
    ProjectRef
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
    description: ''
  };

  // Filtros para gestión de prompts
  let promptFilterTag: string = 'ALL';
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
    if (promptFilterTag !== 'ALL' && !p.tags.includes(promptFilterTag)) return false;
    if (promptSearchQuery) {
      const query = promptSearchQuery.toLowerCase();
      return p.name.toLowerCase().includes(query) ||
             p.title.toLowerCase().includes(query) ||
             p.content.toLowerCase().includes(query);
    }
    return true;
  });
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

  $: enabledToolsCount = tools.filter(t => t.enabled).length;
  $: enabledPluginsCount = plugins.filter(p => p.enabled).length;

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
      description: ''
    };
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
      <h3 class="font-medium">Prompts Recientes</h3>
    </div>

    <!-- Lista de prompts -->
    <div class="space-y-1">
      {#each promptTemplates.slice(0, 6) as template (template.id)}
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
    <div class="space-y-2">
      {#each filteredPromptTemplates as template (template.id)}
        <div class="p-3 bg-bg-hover rounded-lg border border-border">
          <!-- Header del prompt -->
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-2">
              <span>📝</span>
              <span class="font-medium text-sm">{template.title || template.name}</span>
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
</script>
