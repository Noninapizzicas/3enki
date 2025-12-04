<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Badge, Button } from '$components/ui';
  import type {
    AIModel,
    AICredential,
    AITool,
    AIPlugin,
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
    modelSelect: { modelId: string; model: AIModel };
    credentialSelect: { credential: AICredential };
    toolToggle: { toolId: string; enabled: boolean };
    pluginToggle: { pluginId: string; enabled: boolean };
    promptApply: { prompt: QuickPrompt };
    promptFavorite: { promptId: string; favorite: boolean };
    panelChange: { panelId: string };
    addCredential: void;
  }>();

  // Computed
  $: selectedModel = availableModels.find(m => m.id === selectedModelId);
  $: modelsByProvider = availableModels.reduce((acc, m) => {
    acc[m.provider] = acc[m.provider] || [];
    acc[m.provider].push(m);
    return acc;
  }, {} as Record<string, AIModel[]>);

  $: toolsByCategory = tools.reduce((acc, t) => {
    acc[t.category] = acc[t.category] || [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, AITool[]>);

  $: favoritePrompts = quickPrompts.filter(p => p.favorite);
  $: nonFavoritePrompts = quickPrompts.filter(p => !p.favorite);

  $: enabledToolsCount = tools.filter(t => t.enabled).length;
  $: enabledPluginsCount = plugins.filter(p => p.enabled).length;

  // Handlers
  function selectModel(modelId: string) {
    selectedModelId = modelId;
    const model = availableModels.find(m => m.id === modelId);
    if (model) {
      dispatch('modelSelect', { modelId, model });
    }
    dispatch('panelChange', { panelId: '' });
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

<!-- Panel: Modelo Selector -->
{#if currentPanel === 'modelo-selector'}
  <div class="space-y-2">
    {#each Object.entries(modelsByProvider) as [provider, models]}
      <div class="mb-3">
        <h4 class="text-xs font-medium text-text-muted mb-2 uppercase">{provider}</h4>
        {#each models as model (model.id)}
          <button
            class="w-full text-left p-3 rounded-lg transition-colors mb-1 {selectedModelId === model.id ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
            on:click={() => selectModel(model.id)}
          >
            <div class="flex items-center gap-3">
              <span class="text-lg">{getProviderIcon(provider)}</span>
              <div class="flex-1">
                <p class="font-medium text-sm">{model.name}</p>
                {#if model.description}
                  <p class="text-xs text-text-muted">{model.description}</p>
                {/if}
              </div>
              {#if selectedModelId === model.id}
                <span class="text-primary">✓</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/each}
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
