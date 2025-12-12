<!--
  ProjectAddPanel.svelte
  ======================
  Panel para crear nuevo proyecto.

  Abre via doble tap/doble click en ProjectButton.

  Funcionalidad:
  - Nombre del proyecto (required)
  - Descripción (optional)
  - Crear proyecto via POST /projects

  Skinnable via CSS Variables (desde tokens.json):
  --proj-add-bg, --proj-add-border, --proj-add-radius
  --proj-add-input-bg, --proj-add-btn-primary, --proj-add-btn-cancel

  Uso:
    <ProjectAddPanel
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

  export interface Project {
    id: string;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
    is_active: boolean;
    metadata?: Record<string, unknown>;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel abierto/cerrado */
  export let open = false;

  /** Nombre del módulo para API */
  const MODULE_NAME = 'project-manager';

  // ============================================================================
  // STATE
  // ============================================================================

  let form = {
    name: '',
    description: ''
  };

  let loading = false;
  let error: string | null = null;

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: canSave = form.name.trim().length > 0;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    save: { project: Project };
    cancel: void;
    error: { message: string };
  }>();

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  async function createProject(): Promise<void> {
    if (!canSave) return;

    loading = true;
    error = null;

    try {
      const res = await fetch(api.moduleApi(MODULE_NAME, '/projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success && data.project) {
        dispatch('save', { project: data.project });
        resetForm();
        open = false;
      } else {
        error = data.message || data.error || 'Error al crear proyecto';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'Error de conexión al crear proyecto';
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
      description: ''
    };
    error = null;
  }

  function handleCancel(): void {
    resetForm();
    dispatch('cancel');
    open = false;
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && canSave && !loading) {
      createProject();
    }
  }

  // Reset form cuando se abre
  $: if (open) {
    error = null;
  }
</script>

<FloatingPanel bind:open>
  <div class="proj-add">
    <!-- Header -->
    <div class="proj-add__header">
      <h3 class="proj-add__title">Nuevo Proyecto</h3>
    </div>

    <!-- Name Field -->
    <div class="proj-add__field">
      <label class="proj-add__label" for="proj-name">
        Nombre <span class="proj-add__required">*</span>
      </label>
      <input
        id="proj-name"
        type="text"
        class="proj-add__input"
        placeholder="Mi Proyecto"
        bind:value={form.name}
        on:keydown={handleKeydown}
        disabled={loading}
      />
    </div>

    <!-- Description Field -->
    <div class="proj-add__field">
      <label class="proj-add__label" for="proj-desc">Descripción</label>
      <textarea
        id="proj-desc"
        class="proj-add__textarea"
        placeholder="Descripción opcional del proyecto..."
        rows="3"
        bind:value={form.description}
        disabled={loading}
      />
    </div>

    <!-- Error -->
    {#if error}
      <div class="proj-add__error">{error}</div>
    {/if}

    <!-- Actions -->
    <div class="proj-add__actions">
      <button
        type="button"
        class="proj-add__btn proj-add__btn--cancel"
        on:click={handleCancel}
        disabled={loading}
      >
        Cancelar
      </button>
      <button
        type="button"
        class="proj-add__btn proj-add__btn--save"
        on:click={createProject}
        disabled={!canSave || loading}
      >
        {#if loading}
          <span class="proj-add__spinner"></span> Creando...
        {:else}
          Crear Proyecto
        {/if}
      </button>
    </div>
  </div>
</FloatingPanel>

<style>
  /*
   * CSS Variables - Skinnable desde el padre
   * =========================================
   */
  .proj-add {
    /* === SKINNABLE VARIABLES === */
    --_bg: var(--proj-add-bg, var(--color-bg-card, #1a1d24));
    --_color: var(--proj-add-color, var(--color-text, #ffffff));
    --_color-muted: var(--proj-add-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--proj-add-border, var(--color-border, #374151));
    --_radius: var(--proj-add-radius, var(--radius-lg, 12px));
    --_input-bg: var(--proj-add-input-bg, var(--color-bg-input, #0d0f12));
    --_btn-primary: var(--proj-add-btn-primary, var(--color-primary, #3b82f6));
    --_btn-cancel: var(--proj-add-btn-cancel, var(--color-bg-hover, #252a33));
    --_danger: var(--proj-add-danger, var(--color-danger, #ef4444));
    --_transition: var(--proj-add-transition, var(--transition-fast, 150ms));

    /* === LAYOUT === */
    min-width: 320px;
    max-width: 380px;
    padding: 1rem;
    background: var(--_bg);
    color: var(--_color);
  }

  /* === HEADER === */
  .proj-add__header {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--_border);
  }

  .proj-add__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  /* === FIELD === */
  .proj-add__field {
    margin-bottom: 1rem;
  }

  .proj-add__label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_color-muted);
    margin-bottom: 0.5rem;
  }

  .proj-add__required {
    color: var(--_danger);
  }

  /* === INPUT === */
  .proj-add__input {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    background: var(--_input-bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: 8px;
    transition: border-color var(--_transition);
  }

  .proj-add__input:focus {
    outline: none;
    border-color: var(--_btn-primary);
  }

  .proj-add__input::placeholder {
    color: var(--_color-muted);
  }

  .proj-add__input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* === TEXTAREA === */
  .proj-add__textarea {
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

  .proj-add__textarea:focus {
    outline: none;
    border-color: var(--_btn-primary);
  }

  .proj-add__textarea::placeholder {
    color: var(--_color-muted);
  }

  .proj-add__textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* === ERROR === */
  .proj-add__error {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  /* === ACTIONS === */
  .proj-add__actions {
    display: flex;
    gap: 0.5rem;
  }

  .proj-add__btn {
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

  .proj-add__btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .proj-add__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .proj-add__btn--cancel {
    background: var(--_btn-cancel);
    color: var(--_color-muted);
  }

  .proj-add__btn--cancel:hover:not(:disabled) {
    background: var(--color-bg-hover, #2a2f38);
  }

  .proj-add__btn--save {
    flex: 2;
    background: var(--_btn-primary);
    color: white;
  }

  .proj-add__btn--save:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  /* === SPINNER === */
  .proj-add__spinner {
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

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .proj-add__input,
    .proj-add__textarea,
    .proj-add__btn {
      transition: none;
    }
    .proj-add__spinner {
      animation: none;
    }
  }
</style>
