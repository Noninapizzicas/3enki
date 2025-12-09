<!--
  PromptAddPanel.svelte
  =====================
  Panel para crear nuevo prompt.

  Abre via doble tap/doble click en PromptButton.

  Funcionalidad:
  - Nombre del prompt (slug único, required)
  - Título (display name, optional)
  - Contenido del template (required) - soporta {{variables}}
  - Tags (optional)

  Skinnable via CSS Variables (desde tokens.json):
  --prompt-add-bg, --prompt-add-border, --prompt-add-radius
  --prompt-add-input-bg, --prompt-add-btn-primary

  Uso:
    <PromptAddPanel
      bind:open={addOpen}
      on:save={handleSave}
      on:cancel={handleCancel}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { FloatingPanel } from '$components/feedback';
  import { api } from '$lib/config';

  // ============================================================================
  // TYPES
  // ============================================================================

  export interface Prompt {
    id: string;
    name: string;
    title?: string;
    description?: string;
    content: string;
    variables?: Array<{ name: string; type: string; required: boolean }>;
    tags?: string[];
    current_version: string;
    created_at: string;
    updated_at: string;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel abierto/cerrado */
  export let open = false;

  /** Nombre del módulo para API */
  const MODULE_NAME = 'prompt-manager';

  // ============================================================================
  // STATE
  // ============================================================================

  let form = {
    name: '',
    title: '',
    content: '',
    tagsInput: ''
  };

  let loading = false;
  let error: string | null = null;

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: canSave = form.name.trim().length > 0 && form.content.trim().length > 0;
  $: detectedVariables = extractVariables(form.content);
  $: tags = form.tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

  // ============================================================================
  // HELPERS
  // ============================================================================

  /** Extrae variables {{var}} del contenido */
  function extractVariables(content: string): string[] {
    const matches = content.match(/\{\{(\w+)\}\}/g) || [];
    const vars = matches.map(m => m.replace(/\{\{|\}\}/g, ''));
    return [...new Set(vars)]; // unique
  }

  /** Convierte nombre a slug */
  function toSlug(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    save: { prompt: Prompt };
    cancel: void;
    error: { message: string };
  }>();

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  async function createPrompt(): Promise<void> {
    if (!canSave) return;

    loading = true;
    error = null;

    try {
      const variables = detectedVariables.map(name => ({
        name,
        type: 'string',
        required: true
      }));

      const res = await fetch(api.moduleApi(MODULE_NAME, '/prompts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: toSlug(form.name),
          title: form.title.trim() || undefined,
          content: form.content.trim(),
          variables: variables.length > 0 ? variables : undefined,
          tags: tags.length > 0 ? tags : undefined
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success && data.prompt) {
        dispatch('save', { prompt: data.prompt });
        resetForm();
        open = false;
      } else {
        error = data.message || data.error || 'Error al crear prompt';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'Error de conexión al crear prompt';
      dispatch('error', { message: error });
    } finally {
      loading = false;
    }
  }

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function resetForm(): void {
    form = {
      name: '',
      title: '',
      content: '',
      tagsInput: ''
    };
    error = null;
  }

  function handleCancel(): void {
    resetForm();
    dispatch('cancel');
    open = false;
  }

  // Reset form cuando se abre
  $: if (open) {
    error = null;
  }
</script>

<FloatingPanel bind:open>
  <div class="prompt-add">
    <!-- Header -->
    <div class="prompt-add__header">
      <h3 class="prompt-add__title">Nuevo Prompt</h3>
    </div>

    <!-- Name Field -->
    <div class="prompt-add__field">
      <label class="prompt-add__label" for="prompt-name">
        Nombre <span class="prompt-add__required">*</span>
      </label>
      <input
        id="prompt-name"
        type="text"
        class="prompt-add__input"
        placeholder="mi-prompt"
        bind:value={form.name}
        disabled={loading}
      />
      {#if form.name}
        <span class="prompt-add__hint">Slug: {toSlug(form.name)}</span>
      {/if}
    </div>

    <!-- Title Field -->
    <div class="prompt-add__field">
      <label class="prompt-add__label" for="prompt-title">Título</label>
      <input
        id="prompt-title"
        type="text"
        class="prompt-add__input"
        placeholder="Mi Prompt (display name)"
        bind:value={form.title}
        disabled={loading}
      />
    </div>

    <!-- Content Field -->
    <div class="prompt-add__field">
      <label class="prompt-add__label" for="prompt-content">
        Contenido <span class="prompt-add__required">*</span>
      </label>
      <textarea
        id="prompt-content"
        class="prompt-add__textarea prompt-add__textarea--code"
        placeholder="Escribe el prompt...&#10;&#10;Usa {{variable}} para variables"
        rows="6"
        bind:value={form.content}
        disabled={loading}
      />
      {#if detectedVariables.length > 0}
        <div class="prompt-add__variables">
          <span class="prompt-add__variables-label">Variables detectadas:</span>
          {#each detectedVariables as v}
            <code class="prompt-add__variable">{`{{${v}}}`}</code>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tags Field -->
    <div class="prompt-add__field">
      <label class="prompt-add__label" for="prompt-tags">Tags</label>
      <input
        id="prompt-tags"
        type="text"
        class="prompt-add__input"
        placeholder="code, review, assistant (separados por coma)"
        bind:value={form.tagsInput}
        disabled={loading}
      />
      {#if tags.length > 0}
        <div class="prompt-add__tags">
          {#each tags as tag}
            <span class="prompt-add__tag">{tag}</span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Error -->
    {#if error}
      <div class="prompt-add__error">{error}</div>
    {/if}

    <!-- Actions -->
    <div class="prompt-add__actions">
      <button
        type="button"
        class="prompt-add__btn prompt-add__btn--cancel"
        on:click={handleCancel}
        disabled={loading}
      >
        Cancelar
      </button>
      <button
        type="button"
        class="prompt-add__btn prompt-add__btn--save"
        on:click={createPrompt}
        disabled={!canSave || loading}
      >
        {#if loading}
          <span class="prompt-add__spinner"></span> Creando...
        {:else}
          Crear Prompt
        {/if}
      </button>
    </div>
  </div>
</FloatingPanel>

<style>
  .prompt-add {
    --_bg: var(--prompt-add-bg, var(--color-bg-card, #1a1d24));
    --_color: var(--prompt-add-color, var(--color-text, #ffffff));
    --_color-muted: var(--prompt-add-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--prompt-add-border, var(--color-border, #374151));
    --_radius: var(--prompt-add-radius, var(--radius-lg, 12px));
    --_input-bg: var(--prompt-add-input-bg, var(--color-bg-input, #0d0f12));
    --_btn-primary: var(--prompt-add-btn-primary, var(--color-primary, #3b82f6));
    --_danger: var(--prompt-add-danger, var(--color-danger, #ef4444));
    --_accent: var(--prompt-add-accent, var(--color-warning, #f59e0b));
    --_transition: var(--prompt-add-transition, var(--transition-fast, 150ms));

    min-width: 360px;
    max-width: 420px;
    padding: 1rem;
    background: var(--_bg);
    color: var(--_color);
  }

  .prompt-add__header {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--_border);
  }

  .prompt-add__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .prompt-add__field {
    margin-bottom: 1rem;
  }

  .prompt-add__label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_color-muted);
    margin-bottom: 0.5rem;
  }

  .prompt-add__required {
    color: var(--_danger);
  }

  .prompt-add__input {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    background: var(--_input-bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: 8px;
    transition: border-color var(--_transition);
  }

  .prompt-add__input:focus {
    outline: none;
    border-color: var(--_btn-primary);
  }

  .prompt-add__input::placeholder {
    color: var(--_color-muted);
  }

  .prompt-add__input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .prompt-add__textarea {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    font-family: inherit;
    background: var(--_input-bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: 8px;
    resize: vertical;
    min-height: 120px;
    transition: border-color var(--_transition);
  }

  .prompt-add__textarea--code {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .prompt-add__textarea:focus {
    outline: none;
    border-color: var(--_btn-primary);
  }

  .prompt-add__textarea::placeholder {
    color: var(--_color-muted);
    font-family: inherit;
  }

  .prompt-add__textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .prompt-add__hint {
    display: block;
    font-size: 0.75rem;
    color: var(--_color-muted);
    margin-top: 0.25rem;
  }

  .prompt-add__variables {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .prompt-add__variables-label {
    font-size: 0.75rem;
    color: var(--_color-muted);
  }

  .prompt-add__variable {
    font-size: 0.75rem;
    padding: 0.125rem 0.375rem;
    background: hsl(45 93% 47% / 0.15);
    color: var(--_accent);
    border-radius: 4px;
  }

  .prompt-add__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.5rem;
  }

  .prompt-add__tag {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    background: hsl(217 91% 60% / 0.15);
    color: var(--_btn-primary);
    border-radius: 4px;
  }

  .prompt-add__error {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  .prompt-add__actions {
    display: flex;
    gap: 0.5rem;
  }

  .prompt-add__btn {
    flex: 1;
    padding: 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: background var(--_transition), transform var(--_transition);
  }

  .prompt-add__btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .prompt-add__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .prompt-add__btn--cancel {
    background: var(--color-bg-hover, #252a33);
    color: var(--_color-muted);
  }

  .prompt-add__btn--cancel:hover:not(:disabled) {
    background: var(--color-bg-hover, #2a2f38);
  }

  .prompt-add__btn--save {
    flex: 2;
    background: var(--_btn-primary);
    color: white;
  }

  .prompt-add__btn--save:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  .prompt-add__spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .prompt-add__input,
    .prompt-add__textarea,
    .prompt-add__btn {
      transition: none;
    }
    .prompt-add__spinner {
      animation: none;
    }
  }
</style>
