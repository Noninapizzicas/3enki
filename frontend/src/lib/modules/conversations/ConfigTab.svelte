<script lang="ts">
  /**
   * ConfigTab - Configuracion de conversacion
   *
   * Modos:
   * - Crear: isNewConversation=true, conversationId=null
   * - Editar: isNewConversation=false, conversationId=id
   */

  import { createEventDispatcher, onMount } from 'svelte';
  import {
    conversationsStore,
    createConversation,
    updateConversation,
    selectConversation
  } from '$lib/stores';
  import {
    promptsStore,
    loadPresets,
    applyPreset,
    renderComposer
  } from '$lib/stores/prompts';

  const dispatch = createEventDispatcher();

  // ==========================================================================
  // PROPS
  // ==========================================================================

  export let conversationId: string | null = null;
  export let isNewConversation: boolean = false;

  // ==========================================================================
  // STATE
  // ==========================================================================

  let saving = false;
  let selectedPresetId = '';
  let applyingPreset = false;

  // Local form state
  let form = {
    title: '',
    provider: '',
    model: '',
    temperature: 0.7,
    max_tokens: 2000,
    context_window: 20,
    system_prompt: 'You are a helpful AI assistant.'
  };

  // Presets desde el store
  $: presets = $promptsStore.presets;

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  // Find conversation to edit
  $: editingConversation = conversationId
    ? $conversationsStore.conversations.find(c => c.id === conversationId)
    : null;

  // Sync form with conversation when editing.
  // Normaliza la config GUARDADA del provider deepseek retirado (OpenAI-compat) al nativo,
  // espejo de las redes del backend (_normalizeProviderName + _coerceModel): así una
  // conversación vieja con provider 'deepseek' + model 'deepseek-chat' se ve bien en los
  // dropdowns (DeepSeek + deepseek-v4-flash) en vez de quedar en blanco.
  $: if (editingConversation && !isNewConversation) {
    const provRaw = editingConversation.provider || '';
    const prov = provRaw === 'deepseek' ? 'deepseek-anthropic' : provRaw;
    let mdl = editingConversation.model || '';
    if (prov === 'deepseek-anthropic' && ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'].includes(mdl)) {
      mdl = 'deepseek-v4-flash';
    }
    form = {
      title: editingConversation.title || '',
      provider: prov,
      model: mdl,
      temperature: editingConversation.temperature ?? 0.7,
      max_tokens: editingConversation.max_tokens ?? 2000,
      context_window: editingConversation.context_window ?? 20,
      system_prompt: editingConversation.system_prompt || ''
    };
  }

  // Reset form when switching to new conversation mode
  $: if (isNewConversation) {
    form = {
      title: '',
      provider: '',
      model: '',
      temperature: 0.7,
      max_tokens: 2000,
      context_window: 20,
      system_prompt: 'You are a helpful AI assistant.'
    };
    selectedPresetId = '';
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    loadPresets();
  });

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  async function handleSave() {
    if (saving) return;

    saving = true;
    try {
      if (isNewConversation) {
        // Crear nueva conversación
        const newConv = await createConversation({
          title: form.title || 'Nueva conversación',
          provider: form.provider || null,
          model: form.model || null,
          temperature: form.temperature,
          max_tokens: form.max_tokens,
          context_window: form.context_window,
          system_prompt: form.system_prompt
        });

        if (newConv) {
          // Activar la nueva conversación
          await selectConversation(newConv.id);
        }
      } else if (conversationId) {
        // Actualizar conversación existente
        await updateConversation(conversationId, {
          title: form.title,
          provider: form.provider || null,
          model: form.model || null,
          temperature: form.temperature,
          max_tokens: form.max_tokens,
          context_window: form.context_window,
          system_prompt: form.system_prompt
        });

        // Activar la conversación editada
        await selectConversation(conversationId);
      }

      dispatch('saved');
    } finally {
      saving = false;
    }
  }

  function handleCancel() {
    dispatch('cancel');
  }

  function handleReset() {
    if (isNewConversation) {
      form = {
        title: '',
        provider: '',
        model: '',
        temperature: 0.7,
        max_tokens: 2000,
        context_window: 20,
        system_prompt: 'You are a helpful AI assistant.'
      };
    } else if (editingConversation) {
      form = {
        title: editingConversation.title || '',
        provider: editingConversation.provider || '',
        model: editingConversation.model || '',
        temperature: editingConversation.temperature ?? 0.7,
        max_tokens: editingConversation.max_tokens ?? 2000,
        context_window: editingConversation.context_window ?? 20,
        system_prompt: editingConversation.system_prompt || ''
      };
    }
    selectedPresetId = '';
  }

  async function handleApplyPreset() {
    if (!selectedPresetId || applyingPreset) return;

    applyingPreset = true;
    try {
      const applied = await applyPreset(selectedPresetId);
      if (!applied) return;

      const rendered = await renderComposer();
      if (rendered?.finalPrompt) {
        form.system_prompt = rendered.finalPrompt;
      }
    } finally {
      applyingPreset = false;
    }
  }

  // Provider + modelos (cada provider trae sus modelos; el modelo se elige según el provider)
  // Espejo de ai-gateway/module.json config.providers. Auto = el default por prioridad (DeepSeek).
  const providerOptions = [
    { value: '',                  label: 'Auto (por defecto)',  models: [] },
    { value: 'deepseek-anthropic', label: 'DeepSeek 🔮',        models: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
    { value: 'kimi',              label: 'Kimi (Moonshot) 🌙',  models: ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2-thinking', 'moonshot-v1-128k'] },
    { value: 'anthropic',         label: 'Anthropic 🧠',        models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-3-5-haiku-20241022'] },
    { value: 'openai',            label: 'OpenAI 🤖',           models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'] },
    { value: 'groq',              label: 'Groq ⚡',             models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'] },
    { value: 'gemini',            label: 'Google Gemini 💎',    models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
    { value: 'ollama',            label: 'Ollama (local) 🦙',   models: ['llama2', 'codellama', 'mistral', 'mixtral'] },
    { value: 'claude-cli',        label: 'Claude Code (1M) 🟣', models: ['sonnet', 'opus', 'haiku'] }
  ];

  // modelos del provider elegido
  $: modelOptions = providerOptions.find(p => p.value === form.provider)?.models ?? [];

  // al cambiar de provider, si el modelo actual no es suyo, vuelve a "por defecto"
  function onProviderChange() {
    const models = providerOptions.find(p => p.value === form.provider)?.models ?? [];
    if (!models.includes(form.model)) form.model = '';
  }
</script>

<div class="config-tab">
  <div class="form">
    <!-- Title -->
    <div class="field">
      <label class="label" for="config-title">Título</label>
      <input
        id="config-title"
        type="text"
        class="input"
        placeholder="Nombre de la conversación"
        bind:value={form.title}
      />
    </div>

    <!-- Provider & Model -->
    <div class="row">
      <div class="field">
        <label class="label" for="config-provider">Provider</label>
        <select id="config-provider" class="input" bind:value={form.provider} on:change={onProviderChange}>
          {#each providerOptions as p}
            <option value={p.value}>{p.label}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label class="label" for="config-model">Modelo</label>
        <select id="config-model" class="input" bind:value={form.model} disabled={modelOptions.length === 0}>
          <option value="">{form.provider ? '(modelo por defecto)' : 'Auto'}</option>
          {#each modelOptions as m}
            <option value={m}>{m}</option>
          {/each}
          {#if form.model && !modelOptions.includes(form.model)}
            <option value={form.model}>{form.model} (actual)</option>
          {/if}
        </select>
      </div>
    </div>

    <!-- Temperature -->
    <div class="field">
      <label class="label" for="config-temperature">
        Temperature: <span class="value">{form.temperature.toFixed(1)}</span>
      </label>
      <input
        id="config-temperature"
        type="range"
        class="slider"
        min="0"
        max="2"
        step="0.1"
        bind:value={form.temperature}
      />
      <div class="slider-labels">
        <span>Preciso</span>
        <span>Creativo</span>
      </div>
    </div>

    <!-- Max Tokens & Context Window -->
    <div class="row">
      <div class="field">
        <label class="label" for="config-tokens">Max Tokens</label>
        <input
          id="config-tokens"
          type="number"
          class="input"
          min="100"
          max="128000"
          bind:value={form.max_tokens}
        />
      </div>

      <div class="field">
        <label class="label" for="config-context">Context Window</label>
        <input
          id="config-context"
          type="number"
          class="input"
          min="1"
          max="100"
          bind:value={form.context_window}
        />
        <span class="hint">mensajes</span>
      </div>
    </div>

    <!-- Preset Selector -->
    <div class="field">
      <label class="label">Cargar Preset</label>
      <div class="preset-row">
        <select class="input" bind:value={selectedPresetId}>
          <option value="">-- Seleccionar preset --</option>
          {#each presets as preset}
            <option value={preset.id}>{preset.name}</option>
          {/each}
        </select>
        <button
          class="btn apply"
          on:click={handleApplyPreset}
          disabled={!selectedPresetId || applyingPreset}
        >
          {applyingPreset ? '...' : 'Aplicar'}
        </button>
      </div>
      {#if presets.length === 0}
        <span class="hint">No hay presets. Créalos en el panel de Prompts.</span>
      {/if}
    </div>

    <!-- System Prompt -->
    <div class="field">
      <label class="label" for="config-prompt">System Prompt</label>
      <textarea
        id="config-prompt"
        class="textarea"
        rows="6"
        placeholder="Instrucciones para la IA..."
        bind:value={form.system_prompt}
      ></textarea>
      <span class="hint">
        Variables: {`{{project_name}}`}, {`{{tools_count}}`}, {`{{date}}`}, {`{{file_count}}`}
      </span>
    </div>

    <!-- Actions -->
    <div class="actions">
      <button class="btn secondary" on:click={handleCancel}>
        Cancelar
      </button>
      <button class="btn secondary" on:click={handleReset}>
        Restablecer
      </button>
      <button class="btn primary" on:click={handleSave} disabled={saving}>
        {saving ? '⏳ Guardando...' : isNewConversation ? '✨ Crear' : '💾 Guardar'}
      </button>
    </div>
  </div>
</div>

<style>
  .config-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    padding: 0.75rem;
    --_bg-surface: var(--panel-bg-surface, rgba(255, 255, 255, 0.05));
    --_text: var(--panel-text, var(--color-text, #e5e5e5));
    --_text-muted: var(--panel-text-muted, var(--color-text-muted, #a3a3a3));
    --_border: var(--panel-border, rgba(255, 255, 255, 0.1));
    --_primary: var(--panel-primary, var(--color-primary, #3b82f6));
    --_success: var(--panel-success, var(--color-success, #22c55e));
    --_radius: var(--panel-radius, 0.5rem);
  }

  /* Form */
  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--_text-muted);
  }

  .label .value {
    color: var(--_primary);
    font-weight: 600;
  }

  .input, .textarea {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    background: var(--_bg-surface);
    color: var(--_text);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    transition: border-color 0.15s;
  }

  .input:focus, .textarea:focus {
    outline: none;
    border-color: var(--_primary);
  }

  .textarea {
    resize: vertical;
    min-height: 80px;
    font-family: monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .slider {
    width: 100%;
    height: 4px;
    background: var(--_bg-surface);
    border-radius: 2px;
    -webkit-appearance: none;
    appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    background: var(--_primary);
    border-radius: 50%;
    cursor: pointer;
  }

  .slider-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.625rem;
    color: var(--_text-muted);
  }

  .hint {
    font-size: 0.625rem;
    color: var(--_text-muted);
    font-style: italic;
  }

  /* Actions */
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--_border);
  }

  .btn {
    padding: 0.625rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    border-radius: var(--_radius);
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.primary {
    background: var(--_success);
    color: white;
  }

  .btn.primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn.secondary {
    background: var(--_bg-surface);
    color: var(--_text-muted);
  }

  .btn.secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: var(--_text);
  }

  .btn.apply {
    background: var(--_primary);
    color: white;
    padding: 0.625rem 0.75rem;
    white-space: nowrap;
  }

  .btn.apply:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  /* Preset Row */
  .preset-row {
    display: flex;
    gap: 0.5rem;
  }

  .preset-row select {
    flex: 1;
  }
</style>
