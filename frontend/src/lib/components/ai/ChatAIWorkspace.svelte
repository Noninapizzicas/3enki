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
    ContextItem,
    QuickPrompt,
    ChatMessage,
    Conversation
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

  // Props - Tools
  export let tools: AITool[] = [];

  // Props - Plugins
  export let plugins: AIPlugin[] = [];

  // Props - Contexto
  export let contextItems: ContextItem[] = [];

  // Props - Prompts
  export let quickPrompts: QuickPrompt[] = [];

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
    addCredential: void;
    // Tools & Plugins
    toolToggle: { toolId: string; enabled: boolean };
    pluginToggle: { pluginId: string; enabled: boolean };
    // Prompts
    promptApply: { prompt: QuickPrompt };
    promptFavorite: { promptId: string; favorite: boolean };
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

  $: toolsByCategory = tools.reduce((acc, t) => {
    acc[t.category] = acc[t.category] || [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, AITool[]>);

  $: favoritePrompts = quickPrompts.filter(p => p.favorite);
  $: nonFavoritePrompts = quickPrompts.filter(p => !p.favorite);

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

<!-- Panel: Credencial Selector -->
{:else if currentPanel === 'credencial-selector'}
  <div class="space-y-2">
    {#if credentials.length === 0}
      <p class="text-center text-text-muted py-4">No hay credenciales configuradas</p>
      <Button variant="primary" class="w-full" on:click={openAddCredential}>
        ➕ Añadir Credencial
      </Button>
    {:else}
      {#each credentials as cred (cred.key)}
        <button
          class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors"
          on:click={() => selectCredential(cred)}
        >
          <div class="flex items-center gap-3">
            <span class="text-xl">{getProviderIcon(cred.provider)}</span>
            <div class="flex-1">
              <p class="font-medium text-sm">{cred.provider}</p>
              <p class="text-xs text-text-muted">{cred.level}{cred.identifier ? ` • ${cred.identifier}` : ''}</p>
            </div>
            <span class="text-xs font-mono text-text-muted">{cred.api_key_preview}</span>
          </div>
        </button>
      {/each}
    {/if}
  </div>

<!-- Panel: Prompts Rápidos -->
{:else if currentPanel === 'prompts'}
  <div class="space-y-3">
    {#if favoritePrompts.length > 0}
      <div class="mb-3">
        <h4 class="text-xs font-medium text-text-muted mb-2 uppercase">⭐ Favoritos</h4>
        {#each favoritePrompts as prompt (prompt.id)}
          <button
            class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors mb-1"
            on:click={() => applyPrompt(prompt)}
          >
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <p class="font-medium text-sm">{prompt.name}</p>
                <p class="text-xs text-text-muted truncate">{prompt.content}</p>
              </div>
              <button
                class="p-1 text-warning hover:text-warning/80"
                on:click|stopPropagation={() => togglePromptFavorite(prompt.id)}
              >
                ⭐
              </button>
            </div>
          </button>
        {/each}
      </div>
    {/if}
    {#if nonFavoritePrompts.length > 0}
      <div>
        <h4 class="text-xs font-medium text-text-muted mb-2 uppercase">📝 Todos</h4>
        {#each nonFavoritePrompts as prompt (prompt.id)}
          <button
            class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors mb-1"
            on:click={() => applyPrompt(prompt)}
          >
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <p class="font-medium text-sm">{prompt.name}</p>
                <p class="text-xs text-text-muted truncate">{prompt.content}</p>
              </div>
              <button
                class="p-1 text-text-muted hover:text-warning"
                on:click|stopPropagation={() => togglePromptFavorite(prompt.id)}
              >
                ☆
              </button>
            </div>
          </button>
        {/each}
      </div>
    {/if}
    {#if quickPrompts.length === 0}
      <p class="text-center text-text-muted py-4">No hay prompts disponibles</p>
    {/if}
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
