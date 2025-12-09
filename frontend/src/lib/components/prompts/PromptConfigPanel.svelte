<!--
  PromptConfigPanel.svelte
  ========================
  Panel para configurar/editar prompt existente.

  Abre via long press / click derecho en PromptButton.

  Funcionalidad:
  - Ver prompt seleccionado con versión actual
  - Editar título, descripción, contenido (crea nueva versión)
  - Editar tags
  - Eliminar prompt

  Skinnable via CSS Variables (desde tokens.json):
  --prompt-config-bg, --prompt-config-border, --prompt-config-radius

  Uso:
    <PromptConfigPanel
      bind:open={configOpen}
      prompt={selectedPrompt}
      on:update={handleUpdate}
      on:delete={handleDelete}
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

  /** Prompt a configurar */
  export let prompt: Prompt | null = null;

  /** Nombre del módulo para API */
  const MODULE_NAME = 'prompt-manager';

  // ============================================================================
  // STATE
  // ============================================================================

  let form = {
    title: '',
    description: '',
    content: '',
    tagsInput: ''
  };

  let loading = false;
  let deleting = false;
  let error: string | null = null;
  let confirmDelete = false;

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: hasChanges = prompt && (
    form.title !== (prompt.title || '') ||
    form.description !== (prompt.description || '') ||
    form.content !== prompt.content ||
    form.tagsInput !== (prompt.tags?.join(', ') || '')
  );
  $: contentChanged = prompt && form.content !== prompt.content;
  $: canSave = hasChanges && form.content.trim().length > 0;
  $: detectedVariables = extractVariables(form.content);
  $: tags = form.tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

  // ============================================================================
  // HELPERS
  // ============================================================================

  function extractVariables(content: string): string[] {
    const matches = content.match(/\{\{(\w+)\}\}/g) || [];
    const vars = matches.map(m => m.replace(/\{\{|\}\}/g, ''));
    return [...new Set(vars)];
  }

  function formatDate(dateString: string): string {
    try {
      return new Date(dateString).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    update: { prompt: Prompt };
    delete: { id: string };
    error: { message: string };
  }>();

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  async function updatePrompt(): Promise<void> {
    if (!prompt || !canSave) return;

    loading = true;
    error = null;

    try {
      const variables = detectedVariables.map(name => ({
        name,
        type: 'string',
        required: true
      }));

      const res = await fetch(api.moduleApi(MODULE_NAME, `/prompts/${prompt.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim() || undefined,
          description: form.description.trim() || undefined,
          content: form.content.trim(),
          variables: variables.length > 0 ? variables : undefined,
          tags: tags.length > 0 ? tags : undefined
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success && data.prompt) {
        dispatch('update', { prompt: data.prompt });
        open = false;
      } else {
        error = data.message || data.error || 'Error al actualizar';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'Error de conexión al actualizar';
      dispatch('error', { message: error });
    } finally {
      loading = false;
    }
  }

  async function deletePrompt(): Promise<void> {
    if (!prompt) return;

    deleting = true;
    error = null;

    try {
      const res = await fetch(api.moduleApi(MODULE_NAME, `/prompts/${prompt.id}`), {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success) {
        dispatch('delete', { id: prompt.id });
        resetState();
        open = false;
      } else {
        error = data.message || data.error || 'Error al eliminar';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'Error de conexión al eliminar';
      dispatch('error', { message: error });
    } finally {
      deleting = false;
      confirmDelete = false;
    }
  }

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function resetState(): void {
    form = {
      title: prompt?.title || '',
      description: prompt?.description || '',
      content: prompt?.content || '',
      tagsInput: prompt?.tags?.join(', ') || ''
    };
    error = null;
    confirmDelete = false;
  }

  function handleClose(): void {
    resetState();
    open = false;
  }

  function startDelete(): void {
    confirmDelete = true;
  }

  function cancelDelete(): void {
    confirmDelete = false;
  }

  // Sync form with prompt when it changes or panel opens
  $: if (open && prompt) {
    form = {
      title: prompt.title || '',
      description: prompt.description || '',
      content: prompt.content || '',
      tagsInput: prompt.tags?.join(', ') || ''
    };
    error = null;
    confirmDelete = false;
  }
</script>

<FloatingPanel bind:open>
  <div class="prompt-config">
    {#if prompt}
      <!-- Header -->
      <div class="prompt-config__header">
        <div class="prompt-config__header-info">
          <span class="prompt-config__icon">📝</span>
          <div>
            <h3 class="prompt-config__title">{prompt.title || prompt.name}</h3>
            <span class="prompt-config__subtitle">
              {prompt.name} · v{prompt.current_version}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="prompt-config__close"
          on:click={handleClose}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <!-- Version Badge -->
      <div class="prompt-config__version-info">
        <span class="prompt-config__badge">v{prompt.current_version}</span>
        <span class="prompt-config__date">
          Actualizado: {formatDate(prompt.updated_at)}
        </span>
        {#if contentChanged}
          <span class="prompt-config__new-version">Nueva versión al guardar</span>
        {/if}
      </div>

      <!-- Title Field -->
      <div class="prompt-config__field">
        <label class="prompt-config__label" for="config-title">Título</label>
        <input
          id="config-title"
          type="text"
          class="prompt-config__input"
          placeholder="Display name"
          bind:value={form.title}
          disabled={loading || deleting}
        />
      </div>

      <!-- Description Field -->
      <div class="prompt-config__field">
        <label class="prompt-config__label" for="config-desc">Descripción</label>
        <textarea
          id="config-desc"
          class="prompt-config__textarea"
          placeholder="Descripción del prompt..."
          rows="2"
          bind:value={form.description}
          disabled={loading || deleting}
        />
      </div>

      <!-- Content Field -->
      <div class="prompt-config__field">
        <label class="prompt-config__label" for="config-content">
          Contenido
          {#if contentChanged}
            <span class="prompt-config__changed">(modificado)</span>
          {/if}
        </label>
        <textarea
          id="config-content"
          class="prompt-config__textarea prompt-config__textarea--code"
          rows="6"
          bind:value={form.content}
          disabled={loading || deleting}
        />
        {#if detectedVariables.length > 0}
          <div class="prompt-config__variables">
            {#each detectedVariables as v}
              <code class="prompt-config__variable">{`{{${v}}}`}</code>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Tags Field -->
      <div class="prompt-config__field">
        <label class="prompt-config__label" for="config-tags">Tags</label>
        <input
          id="config-tags"
          type="text"
          class="prompt-config__input"
          placeholder="tag1, tag2, tag3"
          bind:value={form.tagsInput}
          disabled={loading || deleting}
        />
        {#if tags.length > 0}
          <div class="prompt-config__tags">
            {#each tags as tag}
              <span class="prompt-config__tag">{tag}</span>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Save Changes -->
      {#if hasChanges}
        <button
          type="button"
          class="prompt-config__save-btn"
          on:click={updatePrompt}
          disabled={!canSave || loading}
        >
          {loading ? 'Guardando...' : contentChanged ? 'Guardar (nueva versión)' : 'Guardar Cambios'}
        </button>
      {/if}

      <!-- Error -->
      {#if error}
        <div class="prompt-config__error">{error}</div>
      {/if}

      <!-- Divider -->
      <div class="prompt-config__divider"></div>

      <!-- Actions -->
      {#if confirmDelete}
        <div class="prompt-config__confirm-delete">
          <p class="prompt-config__confirm-text">
            ¿Eliminar prompt <strong>{prompt.name}</strong>?
          </p>
          <p class="prompt-config__confirm-warning">
            Se eliminarán todas las versiones
          </p>
          <div class="prompt-config__confirm-actions">
            <button
              type="button"
              class="prompt-config__btn prompt-config__btn--cancel"
              on:click={cancelDelete}
              disabled={deleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              class="prompt-config__btn prompt-config__btn--delete"
              on:click={deletePrompt}
              disabled={deleting}
            >
              {deleting ? 'Eliminando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      {:else}
        <div class="prompt-config__actions">
          <button
            type="button"
            class="prompt-config__btn prompt-config__btn--danger"
            on:click={startDelete}
            disabled={loading || deleting}
          >
            Eliminar
          </button>
        </div>
      {/if}
    {:else}
      <div class="prompt-config__empty">
        <p>Selecciona un prompt para configurar</p>
        <button
          type="button"
          class="prompt-config__btn prompt-config__btn--cancel"
          on:click={handleClose}
        >
          Cerrar
        </button>
      </div>
    {/if}
  </div>
</FloatingPanel>

<style>
  .prompt-config {
    --_bg: var(--prompt-config-bg, var(--color-bg-card, #1a1d24));
    --_color: var(--prompt-config-color, var(--color-text, #ffffff));
    --_color-muted: var(--prompt-config-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--prompt-config-border, var(--color-border, #374151));
    --_radius: var(--prompt-config-radius, var(--radius-lg, 12px));
    --_input-bg: var(--prompt-config-input-bg, var(--color-bg-input, #0d0f12));
    --_danger: var(--prompt-config-danger, var(--color-danger, #ef4444));
    --_success: var(--prompt-config-success, var(--color-success, #22c55e));
    --_primary: var(--prompt-config-primary, var(--color-primary, #3b82f6));
    --_accent: var(--prompt-config-accent, var(--color-warning, #f59e0b));
    --_transition: var(--prompt-config-transition, var(--transition-fast, 150ms));

    min-width: 360px;
    max-width: 420px;
    padding: 1rem;
    background: var(--_bg);
    color: var(--_color);
  }

  .prompt-config__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--_border);
  }

  .prompt-config__header-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .prompt-config__icon {
    font-size: 1.75rem;
  }

  .prompt-config__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .prompt-config__subtitle {
    font-size: 0.75rem;
    color: var(--_color-muted);
  }

  .prompt-config__close {
    background: none;
    border: none;
    font-size: 1rem;
    color: var(--_color-muted);
    cursor: pointer;
    padding: 0.25rem;
    transition: color var(--_transition);
  }

  .prompt-config__close:hover {
    color: var(--_color);
  }

  .prompt-config__version-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .prompt-config__badge {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    background: hsl(217 91% 60% / 0.2);
    color: var(--_primary);
    border-radius: 4px;
    text-transform: uppercase;
  }

  .prompt-config__date {
    font-size: 0.75rem;
    color: var(--_color-muted);
  }

  .prompt-config__new-version {
    font-size: 0.75rem;
    color: var(--_accent);
  }

  .prompt-config__field {
    margin-bottom: 1rem;
  }

  .prompt-config__label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_color-muted);
    margin-bottom: 0.5rem;
  }

  .prompt-config__changed {
    color: var(--_accent);
    font-weight: 400;
  }

  .prompt-config__input {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    background: var(--_input-bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: 8px;
    transition: border-color var(--_transition);
  }

  .prompt-config__input:focus {
    outline: none;
    border-color: var(--_primary);
  }

  .prompt-config__input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .prompt-config__textarea {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    font-family: inherit;
    background: var(--_input-bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: 8px;
    resize: vertical;
    min-height: 60px;
    transition: border-color var(--_transition);
  }

  .prompt-config__textarea--code {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
    min-height: 120px;
  }

  .prompt-config__textarea:focus {
    outline: none;
    border-color: var(--_primary);
  }

  .prompt-config__textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .prompt-config__variables {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.5rem;
  }

  .prompt-config__variable {
    font-size: 0.75rem;
    padding: 0.125rem 0.375rem;
    background: hsl(45 93% 47% / 0.15);
    color: var(--_accent);
    border-radius: 4px;
  }

  .prompt-config__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.5rem;
  }

  .prompt-config__tag {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    background: hsl(217 91% 60% / 0.15);
    color: var(--_primary);
    border-radius: 4px;
  }

  .prompt-config__save-btn {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    background: var(--_primary);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 0.75rem;
    transition: background var(--_transition);
  }

  .prompt-config__save-btn:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  .prompt-config__save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .prompt-config__error {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }

  .prompt-config__divider {
    height: 1px;
    background: var(--_border);
    margin: 1rem 0;
  }

  .prompt-config__actions {
    display: flex;
    gap: 0.5rem;
  }

  .prompt-config__btn {
    flex: 1;
    padding: 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background var(--_transition), transform var(--_transition);
  }

  .prompt-config__btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .prompt-config__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .prompt-config__btn--danger {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
  }

  .prompt-config__btn--danger:hover:not(:disabled) {
    background: hsl(0 84% 60% / 0.25);
  }

  .prompt-config__btn--cancel {
    background: var(--color-bg-hover, #252a33);
    color: var(--_color-muted);
  }

  .prompt-config__btn--cancel:hover:not(:disabled) {
    background: var(--color-bg-hover, #2a2f38);
  }

  .prompt-config__btn--delete {
    background: var(--_danger);
    color: white;
  }

  .prompt-config__btn--delete:hover:not(:disabled) {
    background: var(--color-danger-hover, #dc2626);
  }

  .prompt-config__confirm-delete {
    text-align: center;
  }

  .prompt-config__confirm-text {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
  }

  .prompt-config__confirm-warning {
    margin: 0 0 1rem;
    font-size: 0.75rem;
    color: var(--_danger);
  }

  .prompt-config__confirm-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .prompt-config__empty {
    text-align: center;
    padding: 1rem;
    color: var(--_color-muted);
  }

  .prompt-config__empty p {
    margin: 0 0 1rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .prompt-config__close,
    .prompt-config__input,
    .prompt-config__textarea,
    .prompt-config__save-btn,
    .prompt-config__btn {
      transition: none;
    }
  }
</style>
