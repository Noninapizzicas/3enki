<script lang="ts">
  /**
   * ChatAIWorkspaceV2 - Versión refactorizada usando componentes base
   *
   * Reduce ~3700 líneas a ~400 usando:
   * - SelectList para selectores
   * - ToggleList para toggles
   * - ActionForm para formularios
   *
   * @version 2.0.0
   */
  import { createEventDispatcher } from 'svelte';
  import { SelectList } from '$components/ui';
  import { ToggleList } from '$components/ui';
  import { ActionForm } from '$components/ui';
  import type { SelectItem, SelectGroup } from '$components/ui/SelectList.svelte';
  import type { ToggleItem, ToggleGroup } from '$components/ui/ToggleList.svelte';
  import type { FormField, FormAction } from '$components/ui/ActionForm.svelte';
  import type {
    AIModel,
    AICredential,
    AITool,
    AIPlugin,
    ContextItem,
    QuickPrompt,
    ConversationSummary
  } from './types';
  import { DEFAULT_MODELS, getProviderIcon } from './types';

  // ============================================================================
  // PROPS
  // ============================================================================

  // Panel activo (controlado por el padre)
  export let currentPanel: string = '';

  // Modelos
  export let availableModels: AIModel[] = DEFAULT_MODELS;
  export let selectedModelId: string = 'deepseek-chat';

  // Credenciales
  export let credentials: AICredential[] = [];
  export let selectedCredentialKey: string = '';

  // Tools y Plugins
  export let tools: AITool[] = [];
  export let plugins: AIPlugin[] = [];

  // Contexto
  export let contextItems: ContextItem[] = [];

  // Prompts
  export let quickPrompts: QuickPrompt[] = [];

  // Conversaciones
  export let conversations: ConversationSummary[] = [];
  export let selectedConversationId: string = '';

  // ============================================================================
  // DISPATCHER
  // ============================================================================

  const dispatch = createEventDispatcher<{
    modelSelect: { model: AIModel };
    credentialSelect: { credential: AICredential };
    toolsChange: { tools: AITool[] };
    pluginsChange: { plugins: AIPlugin[] };
    contextChange: { items: ContextItem[] };
    promptApply: { prompt: QuickPrompt };
    conversationSelect: { conversation: ConversationSummary };
    credentialCreate: { data: Record<string, unknown> };
    promptCreate: { data: Record<string, unknown> };
    conversationCreate: { data: Record<string, unknown> };
  }>();

  // ============================================================================
  // TRANSFORMERS: Adaptan datos a formato de componentes base
  // ============================================================================

  // Modelos → SelectList items con grupos por proveedor
  $: modelItems = availableModels.map(m => ({
    id: m.id,
    label: m.name,
    description: m.description || '',
    icon: m.recommended ? '⭐' : '🤖',
    group: m.provider,
    meta: m
  })) as SelectItem[];

  $: modelGroups = [...new Set(availableModels.map(m => m.provider))].map(p => ({
    id: p,
    label: `${getProviderIcon(p)} ${p}`,
    collapsed: false
  })) as SelectGroup[];

  // Credenciales → SelectList items con grupos por proveedor
  $: credentialItems = credentials.map(c => ({
    id: c.key,
    label: c.identifier || c.api_key_preview,
    description: `${c.level} - ${c.status || 'active'}`,
    icon: '🔑',
    group: c.provider,
    meta: c
  })) as SelectItem[];

  $: credentialGroups = [...new Set(credentials.map(c => c.provider))].map(p => ({
    id: p,
    label: `${getProviderIcon(p)} ${p}`,
    collapsed: false
  })) as SelectGroup[];

  // Tools → ToggleList items con grupos por categoría
  $: toolItems = tools.map(t => ({
    id: t.id,
    label: t.name,
    description: t.description,
    icon: t.icon || '🔧',
    group: t.category
  })) as ToggleItem[];

  $: toolGroups = [...new Set(tools.map(t => t.category))].map(c => ({
    id: c,
    label: c.charAt(0).toUpperCase() + c.slice(1)
  })) as ToggleGroup[];

  $: enabledToolIds = tools.filter(t => t.enabled).map(t => t.id);

  // Plugins → ToggleList items
  $: pluginItems = plugins.map(p => ({
    id: p.id,
    label: p.name,
    description: `${p.description} (v${p.version})`,
    icon: p.icon || '🔌'
  })) as ToggleItem[];

  $: enabledPluginIds = plugins.filter(p => p.enabled).map(p => p.id);

  // Contexto → ToggleList items
  $: contextToggleItems = contextItems.map(c => ({
    id: c.type,
    label: c.label,
    description: c.value,
    icon: c.icon || '📋'
  })) as ToggleItem[];

  $: activeContextIds = contextItems.filter(c => c.active).map(c => c.type);

  // Prompts → SelectList items con grupos por categoría
  $: promptItems = quickPrompts.map(p => ({
    id: p.id,
    label: p.name,
    description: p.content.substring(0, 50) + '...',
    icon: p.favorite ? '⭐' : (p.icon || '📝'),
    group: p.category,
    meta: p
  })) as SelectItem[];

  $: promptGroups = [...new Set(quickPrompts.map(p => p.category))].map(c => ({
    id: c,
    label: c.charAt(0).toUpperCase() + c.slice(1),
    collapsed: false
  })) as SelectGroup[];

  // Conversaciones → SelectList items
  $: conversationItems = (conversations || []).map(c => ({
    id: c.id,
    label: c.title || 'Sin título',
    description: `${c.messages_count} mensajes`,
    icon: '💬',
    meta: c
  })) as SelectItem[];

  // ============================================================================
  // FORM DEFINITIONS
  // ============================================================================

  const credentialFormFields: FormField[] = [
    { name: 'provider', type: 'select', label: 'Proveedor', required: true,
      options: [
        { value: 'DEEPSEEK', label: 'DeepSeek' },
        { value: 'OPENAI', label: 'OpenAI' },
        { value: 'ANTHROPIC', label: 'Anthropic' },
        { value: 'OLLAMA', label: 'Ollama' }
      ]
    },
    { name: 'identifier', type: 'text', label: 'Identificador', placeholder: 'Mi API Key' },
    { name: 'api_key', type: 'password', label: 'API Key', required: true }
  ];

  const credentialFormActions: FormAction[] = [
    { label: 'Cancelar', emit: 'cancel', variant: 'ghost' },
    { label: 'Guardar', emit: 'submit', variant: 'primary', validate: true }
  ];

  const promptFormFields: FormField[] = [
    { name: 'name', type: 'text', label: 'Nombre', required: true },
    { name: 'content', type: 'textarea', label: 'Contenido', required: true },
    { name: 'category', type: 'select', label: 'Categoría',
      options: [
        { value: 'general', label: 'General' },
        { value: 'code', label: 'Código' },
        { value: 'writing', label: 'Escritura' }
      ]
    }
  ];

  const promptFormActions: FormAction[] = [
    { label: 'Cancelar', emit: 'cancel', variant: 'ghost' },
    { label: 'Crear', emit: 'submit', variant: 'primary', validate: true }
  ];

  const conversationFormFields: FormField[] = [
    { name: 'title', type: 'text', label: 'Título', placeholder: 'Nueva conversación' },
    { name: 'system_prompt', type: 'textarea', label: 'System Prompt' }
  ];

  const conversationFormActions: FormAction[] = [
    { label: 'Cancelar', emit: 'cancel', variant: 'ghost' },
    { label: 'Crear', emit: 'submit', variant: 'primary', validate: true }
  ];

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function handleModelSelect(e: CustomEvent<{ item: SelectItem }>) {
    const model = availableModels.find(m => m.id === e.detail.item.id);
    if (model) {
      selectedModelId = model.id;
      dispatch('modelSelect', { model });
    }
  }

  function handleCredentialSelect(e: CustomEvent<{ item: SelectItem }>) {
    const credential = credentials.find(c => c.key === e.detail.item.id);
    if (credential) {
      selectedCredentialKey = credential.key;
      dispatch('credentialSelect', { credential });
    }
  }

  function handleToolsChange(e: CustomEvent<{ values: string[] }>) {
    const enabledIds = new Set(e.detail.values);
    tools = tools.map(t => ({ ...t, enabled: enabledIds.has(t.id) }));
    dispatch('toolsChange', { tools });
  }

  function handlePluginsChange(e: CustomEvent<{ values: string[] }>) {
    const enabledIds = new Set(e.detail.values);
    plugins = plugins.map(p => ({ ...p, enabled: enabledIds.has(p.id) }));
    dispatch('pluginsChange', { plugins });
  }

  function handleContextChange(e: CustomEvent<{ values: string[] }>) {
    const activeIds = new Set(e.detail.values);
    contextItems = contextItems.map(c => ({ ...c, active: activeIds.has(c.type) }));
    dispatch('contextChange', { items: contextItems });
  }

  function handlePromptSelect(e: CustomEvent<{ item: SelectItem }>) {
    const prompt = quickPrompts.find(p => p.id === e.detail.item.id);
    if (prompt) {
      dispatch('promptApply', { prompt });
    }
  }

  function handleConversationSelect(e: CustomEvent<{ item: SelectItem }>) {
    const conversation = conversations.find(c => c.id === e.detail.item.id);
    if (conversation) {
      selectedConversationId = conversation.id;
      dispatch('conversationSelect', { conversation });
    }
  }

  function handleCredentialSubmit(e: CustomEvent<{ data: Record<string, unknown> }>) {
    dispatch('credentialCreate', e.detail);
  }

  function handlePromptSubmit(e: CustomEvent<{ data: Record<string, unknown> }>) {
    dispatch('promptCreate', e.detail);
  }

  function handleConversationSubmit(e: CustomEvent<{ data: Record<string, unknown> }>) {
    dispatch('conversationCreate', e.detail);
  }
</script>

<!-- ============================================================================ -->
<!-- PANEL CONTENT: Renderizado condicional según currentPanel -->
<!-- ============================================================================ -->

{#if currentPanel === 'modelo-selector'}
  <!-- Selector de modelos (SelectList con grupos por proveedor) -->
  <SelectList
    items={modelItems}
    groups={modelGroups}
    bind:value={selectedModelId}
    searchable={true}
    accordion={true}
    on:select={handleModelSelect}
  />

{:else if currentPanel === 'credencial-selector'}
  <!-- Selector de credenciales (SelectList con grupos por proveedor) -->
  <SelectList
    items={credentialItems}
    groups={credentialGroups}
    bind:value={selectedCredentialKey}
    searchable={false}
    accordion={true}
    on:select={handleCredentialSelect}
  />

{:else if currentPanel === 'credencial-crear'}
  <!-- Formulario de nueva credencial (ActionForm) -->
  <ActionForm
    fields={credentialFormFields}
    actions={credentialFormActions}
    on:submit={handleCredentialSubmit}
  />

{:else if currentPanel === 'prompts-rapidos' || currentPanel === 'prompts'}
  <!-- Selector de prompts (SelectList con grupos por categoría) -->
  <SelectList
    items={promptItems}
    groups={promptGroups}
    searchable={true}
    accordion={true}
    on:select={handlePromptSelect}
  />

{:else if currentPanel === 'prompt-crear'}
  <!-- Formulario de nuevo prompt (ActionForm) -->
  <ActionForm
    fields={promptFormFields}
    actions={promptFormActions}
    on:submit={handlePromptSubmit}
  />

{:else if currentPanel === 'conversaciones'}
  <!-- Selector de conversaciones (SelectList) -->
  <SelectList
    items={conversationItems}
    bind:value={selectedConversationId}
    searchable={true}
    on:select={handleConversationSelect}
  />

{:else if currentPanel === 'conversacion-crear'}
  <!-- Formulario de nueva conversación (ActionForm) -->
  <ActionForm
    fields={conversationFormFields}
    actions={conversationFormActions}
    on:submit={handleConversationSubmit}
  />

{:else if currentPanel === 'tools-disponibles' || currentPanel === 'tools'}
  <!-- Lista de tools (ToggleList con grupos por categoría) -->
  <ToggleList
    items={toolItems}
    groups={toolGroups}
    bind:values={enabledToolIds}
    showSelectAll={true}
    on:change={handleToolsChange}
  />

{:else if currentPanel === 'plugins-activos' || currentPanel === 'plugins'}
  <!-- Lista de plugins (ToggleList) -->
  <ToggleList
    items={pluginItems}
    bind:values={enabledPluginIds}
    on:change={handlePluginsChange}
  />

{:else if currentPanel === 'contexto-actual' || currentPanel === 'contexto'}
  <!-- Lista de contexto (ToggleList) -->
  <ToggleList
    items={contextToggleItems}
    bind:values={activeContextIds}
    on:change={handleContextChange}
  />

{:else}
  <!-- Panel personalizado (slot) -->
  <slot name="panel" panelId={currentPanel}>
    <p class="text-center text-text-muted py-4">Panel: {currentPanel}</p>
  </slot>
{/if}
