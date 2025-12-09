<!--
  ConversationAddPanel.svelte
  ===========================
  Panel para crear nueva conversación.

  Abre via doble tap/doble click en ConversationButton.

  Funcionalidad:
  - Título (required)
  - Proyecto (select from project-manager, optional)
  - System prompt (optional)

  Integración:
  - project-manager: lista de proyectos

  Skinnable via CSS Variables (desde tokens.json):
  --conv-add-bg, --conv-add-border, --conv-add-radius

  Uso:
    <ConversationAddPanel
      bind:open={addOpen}
      on:save={handleSave}
      on:cancel={handleCancel}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { FloatingPanel } from '$components/feedback';
  import { api } from '$lib/config';

  // ============================================================================
  // TYPES
  // ============================================================================

  export interface Conversation {
    id: string;
    project_id?: string;
    user_id: string;
    title: string;
    system_prompt?: string;
    model?: string;
    provider?: string;
    message_count: number;
    created_at: string;
    updated_at: string;
  }

  interface Project {
    id: string;
    name: string;
    description?: string;
    is_active?: boolean;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel abierto/cerrado */
  export let open = false;

  /** Pre-seleccionar proyecto */
  export let projectId: string | null = null;

  /** Nombre del módulo para API */
  const MODULE_NAME = 'conversation-manager';

  // ============================================================================
  // STATE
  // ============================================================================

  let form = {
    title: '',
    project_id: '',
    system_prompt: ''
  };

  let projects: Project[] = [];
  let loadingProjects = false;
  let loading = false;
  let error: string | null = null;

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: canSave = form.title.trim().length > 0;

  // Pre-seleccionar proyecto si viene en props
  $: if (open && projectId && !form.project_id) {
    form.project_id = projectId;
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    save: { conversation: Conversation };
    cancel: void;
    error: { message: string };
  }>();

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  async function loadProjects(): Promise<void> {
    if (loadingProjects || projects.length > 0) return;

    loadingProjects = true;
    try {
      const res = await fetch(api.moduleApi('project-manager', '/projects'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success && Array.isArray(data.projects)) {
        projects = data.projects;
      }
    } catch (err) {
      console.error('ConversationAddPanel: Error loading projects', err);
    } finally {
      loadingProjects = false;
    }
  }

  async function createConversation(): Promise<void> {
    if (!canSave) return;

    loading = true;
    error = null;

    try {
      const res = await fetch(api.moduleApi(MODULE_NAME, '/conversations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          project_id: form.project_id || undefined,
          system_prompt: form.system_prompt.trim() || undefined
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success && data.conversation) {
        dispatch('save', { conversation: data.conversation });
        resetForm();
        open = false;
      } else {
        error = data.message || data.error || 'Error al crear conversación';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'Error de conexión al crear conversación';
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
      title: '',
      project_id: projectId || '',
      system_prompt: ''
    };
    error = null;
  }

  function handleCancel(): void {
    resetForm();
    dispatch('cancel');
    open = false;
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && canSave && !loading) {
      createConversation();
    }
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onMount(() => {
    loadProjects();
  });

  // Load projects when panel opens
  $: if (open) {
    loadProjects();
    error = null;
  }
</script>

<FloatingPanel bind:open>
  <div class="conv-add">
    <!-- Header -->
    <div class="conv-add__header">
      <h3 class="conv-add__title">Nueva Conversación</h3>
    </div>

    <!-- Title Field -->
    <div class="conv-add__field">
      <label class="conv-add__label" for="conv-title">
        Título <span class="conv-add__required">*</span>
      </label>
      <input
        id="conv-title"
        type="text"
        class="conv-add__input"
        placeholder="Mi conversación"
        bind:value={form.title}
        on:keydown={handleKeydown}
        disabled={loading}
      />
    </div>

    <!-- Project Field -->
    <div class="conv-add__field">
      <label class="conv-add__label" for="conv-project">Proyecto</label>
      {#if loadingProjects}
        <div class="conv-add__loading">Cargando proyectos...</div>
      {:else}
        <select
          id="conv-project"
          class="conv-add__select"
          bind:value={form.project_id}
          disabled={loading}
        >
          <option value="">Sin proyecto (global)</option>
          {#each projects as project}
            <option value={project.id}>
              {project.is_active ? '★ ' : ''}{project.name}
            </option>
          {/each}
        </select>
      {/if}
    </div>

    <!-- System Prompt Field -->
    <div class="conv-add__field">
      <label class="conv-add__label" for="conv-prompt">System Prompt</label>
      <textarea
        id="conv-prompt"
        class="conv-add__textarea"
        placeholder="Eres un asistente que ayuda con..."
        rows="3"
        bind:value={form.system_prompt}
        disabled={loading}
      />
      <span class="conv-add__hint">Define el comportamiento del asistente</span>
    </div>

    <!-- Error -->
    {#if error}
      <div class="conv-add__error">{error}</div>
    {/if}

    <!-- Actions -->
    <div class="conv-add__actions">
      <button
        type="button"
        class="conv-add__btn conv-add__btn--cancel"
        on:click={handleCancel}
        disabled={loading}
      >
        Cancelar
      </button>
      <button
        type="button"
        class="conv-add__btn conv-add__btn--save"
        on:click={createConversation}
        disabled={!canSave || loading}
      >
        {#if loading}
          <span class="conv-add__spinner"></span> Creando...
        {:else}
          Crear Conversación
        {/if}
      </button>
    </div>
  </div>
</FloatingPanel>

<style>
  .conv-add {
    --_bg: var(--conv-add-bg, var(--color-bg-card, #1a1d24));
    --_color: var(--conv-add-color, var(--color-text, #ffffff));
    --_color-muted: var(--conv-add-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--conv-add-border, var(--color-border, #374151));
    --_radius: var(--conv-add-radius, var(--radius-lg, 12px));
    --_input-bg: var(--conv-add-input-bg, var(--color-bg-input, #0d0f12));
    --_btn-primary: var(--conv-add-btn-primary, var(--color-primary, #3b82f6));
    --_danger: var(--conv-add-danger, var(--color-danger, #ef4444));
    --_transition: var(--conv-add-transition, var(--transition-fast, 150ms));

    min-width: 320px;
    max-width: 380px;
    padding: 1rem;
    background: var(--_bg);
    color: var(--_color);
  }

  .conv-add__header {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--_border);
  }

  .conv-add__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .conv-add__field {
    margin-bottom: 1rem;
  }

  .conv-add__label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_color-muted);
    margin-bottom: 0.5rem;
  }

  .conv-add__required {
    color: var(--_danger);
  }

  .conv-add__input,
  .conv-add__select {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    background: var(--_input-bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: 8px;
    transition: border-color var(--_transition);
  }

  .conv-add__input:focus,
  .conv-add__select:focus {
    outline: none;
    border-color: var(--_btn-primary);
  }

  .conv-add__input::placeholder {
    color: var(--_color-muted);
  }

  .conv-add__input:disabled,
  .conv-add__select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .conv-add__select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239ca3af' d='M6 8L2 4h8z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    padding-right: 2.5rem;
  }

  .conv-add__select option {
    background: var(--_input-bg);
    color: var(--_color);
  }

  .conv-add__textarea {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    font-family: inherit;
    background: var(--_input-bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: 8px;
    resize: vertical;
    min-height: 80px;
    transition: border-color var(--_transition);
  }

  .conv-add__textarea:focus {
    outline: none;
    border-color: var(--_btn-primary);
  }

  .conv-add__textarea::placeholder {
    color: var(--_color-muted);
  }

  .conv-add__textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .conv-add__hint {
    display: block;
    font-size: 0.75rem;
    color: var(--_color-muted);
    margin-top: 0.25rem;
  }

  .conv-add__loading {
    padding: 0.75rem;
    font-size: 0.875rem;
    color: var(--_color-muted);
    background: var(--_input-bg);
    border: 1px solid var(--_border);
    border-radius: 8px;
    text-align: center;
  }

  .conv-add__error {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  .conv-add__actions {
    display: flex;
    gap: 0.5rem;
  }

  .conv-add__btn {
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

  .conv-add__btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .conv-add__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .conv-add__btn--cancel {
    background: var(--color-bg-hover, #252a33);
    color: var(--_color-muted);
  }

  .conv-add__btn--cancel:hover:not(:disabled) {
    background: var(--color-bg-hover, #2a2f38);
  }

  .conv-add__btn--save {
    flex: 2;
    background: var(--_btn-primary);
    color: white;
  }

  .conv-add__btn--save:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  .conv-add__spinner {
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
    .conv-add__input,
    .conv-add__select,
    .conv-add__textarea,
    .conv-add__btn {
      transition: none;
    }
    .conv-add__spinner {
      animation: none;
    }
  }
</style>
