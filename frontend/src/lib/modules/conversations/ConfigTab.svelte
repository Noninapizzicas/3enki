<script lang="ts">
  /**
   * ConfigTab - Configuracion de la conversacion activa
   * - Model/Provider
   * - Temperature, max_tokens
   * - System prompt
   */

  import {
    activeConversation,
    updateConversation
  } from '$lib/stores';

  // ==========================================================================
  // STATE
  // ==========================================================================

  let saving = false;

  // Local form state (initialized from conversation)
  let form = {
    title: '',
    provider: '',
    model: '',
    temperature: 0.7,
    max_tokens: 2000,
    context_window: 20,
    system_prompt: ''
  };

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  $: conversation = $activeConversation;

  // Sync form with conversation when it changes
  $: if (conversation) {
    form = {
      title: conversation.title || '',
      provider: conversation.provider || '',
      model: conversation.model || '',
      temperature: conversation.temperature ?? 0.7,
      max_tokens: conversation.max_tokens ?? 2000,
      context_window: conversation.context_window ?? 20,
      system_prompt: conversation.system_prompt || ''
    };
  }

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  async function handleSave() {
    if (!conversation || saving) return;

    saving = true;
    try {
      await updateConversation(conversation.id, {
        title: form.title,
        provider: form.provider || null,
        model: form.model || null,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
        context_window: form.context_window,
        system_prompt: form.system_prompt
      });
    } finally {
      saving = false;
    }
  }

  function handleReset() {
    if (!conversation) return;
    form = {
      title: conversation.title || '',
      provider: conversation.provider || '',
      model: conversation.model || '',
      temperature: conversation.temperature ?? 0.7,
      max_tokens: conversation.max_tokens ?? 2000,
      context_window: conversation.context_window ?? 20,
      system_prompt: conversation.system_prompt || ''
    };
  }

  // Provider options
  const providers = [
    { value: '', label: 'Auto (default)' },
    { value: 'deepseek', label: 'DeepSeek' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'ollama', label: 'Ollama (local)' }
  ];
</script>

<div class="config-tab">
  {#if !conversation}
    <div class="empty-state">
      <span class="empty-icon">⚙️</span>
      <span class="empty-text">Selecciona una conversacion para configurar</span>
    </div>
  {:else}
    <div class="form">
      <!-- Title -->
      <div class="field">
        <label class="label" for="config-title">Titulo</label>
        <input
          id="config-title"
          type="text"
          class="input"
          placeholder="Nombre de la conversacion"
          bind:value={form.title}
        />
      </div>

      <!-- Provider & Model -->
      <div class="row">
        <div class="field">
          <label class="label" for="config-provider">Provider</label>
          <select id="config-provider" class="input" bind:value={form.provider}>
            {#each providers as p}
              <option value={p.value}>{p.label}</option>
            {/each}
          </select>
        </div>

        <div class="field">
          <label class="label" for="config-model">Modelo</label>
          <input
            id="config-model"
            type="text"
            class="input"
            placeholder="ej: deepseek-chat"
            bind:value={form.model}
          />
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

      <!-- System Prompt -->
      <div class="field">
        <label class="label" for="config-prompt">System Prompt</label>
        <textarea
          id="config-prompt"
          class="textarea"
          rows="8"
          placeholder="Instrucciones para la IA..."
          bind:value={form.system_prompt}
        ></textarea>
        <span class="hint">
          Variables: {`{{project_name}}`}, {`{{tools_count}}`}, {`{{date}}`}, {`{{file_count}}`}
        </span>
      </div>

      <!-- Actions -->
      <div class="actions">
        <button class="btn secondary" on:click={handleReset}>
          Restablecer
        </button>
        <button class="btn primary" on:click={handleSave} disabled={saving}>
          {saving ? '⏳ Guardando...' : '💾 Guardar cambios'}
        </button>
      </div>
    </div>
  {/if}
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

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
    text-align: center;
    flex: 1;
  }

  .empty-icon {
    font-size: 2.5rem;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 0.875rem;
    color: var(--_text-muted);
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
    min-height: 100px;
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
</style>
