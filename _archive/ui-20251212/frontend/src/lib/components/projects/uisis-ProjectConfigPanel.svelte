<!--
  ProjectConfigPanel.svelte
  =========================
  Panel para configurar/editar proyecto existente.

  Abre via long press / click derecho en ProjectButton.

  Funcionalidad:
  - Ver proyecto seleccionado
  - Editar nombre y descripción
  - Activar proyecto (POST /projects/:id/activate)
  - Eliminar proyecto (DELETE /projects/:id)
    - No se puede eliminar proyecto activo

  Skinnable via CSS Variables (desde tokens.json):
  --proj-config-bg, --proj-config-border, --proj-config-radius
  --proj-config-danger, --proj-config-success

  Uso:
    <ProjectConfigPanel
      bind:open={configOpen}
      project={selectedProject}
      on:update={handleUpdate}
      on:activate={handleActivate}
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

  /** Proyecto a configurar */
  export let project: Project | null = null;

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
  let activating = false;
  let deleting = false;
  let error: string | null = null;
  let confirmDelete = false;

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: hasChanges = project && (
    form.name !== project.name ||
    form.description !== (project.description || '')
  );
  $: canSave = hasChanges && form.name.trim().length > 0;
  $: canDelete = project && !project.is_active;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    update: { project: Project };
    activate: { project: Project };
    delete: { id: string };
    error: { message: string };
  }>();

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  async function updateProject(): Promise<void> {
    if (!project || !canSave) return;

    loading = true;
    error = null;

    try {
      const res = await fetch(api.moduleApi(MODULE_NAME, `/projects/${project.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success && data.project) {
        dispatch('update', { project: data.project });
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

  async function activateProject(): Promise<void> {
    if (!project || project.is_active) return;

    activating = true;
    error = null;

    try {
      const res = await fetch(api.moduleApi(MODULE_NAME, `/projects/${project.id}/activate`), {
        method: 'POST'
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success && data.project) {
        dispatch('activate', { project: data.project });
        open = false;
      } else {
        error = data.message || data.error || 'Error al activar';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'Error de conexión al activar';
      dispatch('error', { message: error });
    } finally {
      activating = false;
    }
  }

  async function deleteProject(): Promise<void> {
    if (!project || !canDelete) return;

    deleting = true;
    error = null;

    try {
      const res = await fetch(api.moduleApi(MODULE_NAME, `/projects/${project.id}`), {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success) {
        dispatch('delete', { id: project.id });
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
      name: project?.name || '',
      description: project?.description || ''
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

  // Sync form with project when it changes or panel opens
  $: if (open && project) {
    form = {
      name: project.name,
      description: project.description || ''
    };
    error = null;
    confirmDelete = false;
  }

  // Format date helper
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
</script>

<FloatingPanel bind:open>
  <div class="proj-config">
    {#if project}
      <!-- Header -->
      <div class="proj-config__header">
        <div class="proj-config__header-info">
          <span class="proj-config__icon">📁</span>
          <div>
            <h3 class="proj-config__title">{project.name}</h3>
            <span class="proj-config__subtitle">
              Creado: {formatDate(project.created_at)}
            </span>
          </div>
        </div>
        <div class="proj-config__header-actions">
          {#if project.is_active}
            <span class="proj-config__badge proj-config__badge--active">ACTIVO</span>
          {/if}
          <button
            type="button"
            class="proj-config__close"
            on:click={handleClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Name Field -->
      <div class="proj-config__field">
        <label class="proj-config__label" for="proj-config-name">Nombre</label>
        <input
          id="proj-config-name"
          type="text"
          class="proj-config__input"
          bind:value={form.name}
          disabled={loading || activating || deleting}
        />
      </div>

      <!-- Description Field -->
      <div class="proj-config__field">
        <label class="proj-config__label" for="proj-config-desc">Descripción</label>
        <textarea
          id="proj-config-desc"
          class="proj-config__textarea"
          rows="3"
          bind:value={form.description}
          disabled={loading || activating || deleting}
        />
      </div>

      <!-- Save Changes -->
      {#if hasChanges}
        <button
          type="button"
          class="proj-config__save-btn"
          on:click={updateProject}
          disabled={!canSave || loading}
        >
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      {/if}

      <!-- Error -->
      {#if error}
        <div class="proj-config__error">{error}</div>
      {/if}

      <!-- Divider -->
      <div class="proj-config__divider"></div>

      <!-- Actions -->
      {#if confirmDelete}
        <!-- Delete Confirmation -->
        <div class="proj-config__confirm-delete">
          <p class="proj-config__confirm-text">
            ¿Eliminar proyecto <strong>{project.name}</strong>?
          </p>
          <p class="proj-config__confirm-warning">
            Esta acción no se puede deshacer
          </p>
          <div class="proj-config__confirm-actions">
            <button
              type="button"
              class="proj-config__btn proj-config__btn--cancel"
              on:click={cancelDelete}
              disabled={deleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              class="proj-config__btn proj-config__btn--delete"
              on:click={deleteProject}
              disabled={deleting}
            >
              {deleting ? 'Eliminando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      {:else}
        <!-- Normal Actions -->
        <div class="proj-config__actions">
          <!-- Activate Button -->
          <button
            type="button"
            class="proj-config__btn proj-config__btn--activate"
            class:proj-config__btn--active={project.is_active}
            on:click={activateProject}
            disabled={project.is_active || activating || loading || deleting}
            title={project.is_active ? 'Este proyecto ya está activo' : 'Activar este proyecto'}
          >
            {#if project.is_active}
              ✓ Activo
            {:else if activating}
              Activando...
            {:else}
              Activar
            {/if}
          </button>

          <!-- Delete Button -->
          <button
            type="button"
            class="proj-config__btn proj-config__btn--danger"
            on:click={startDelete}
            disabled={!canDelete || loading || activating || deleting}
            title={!canDelete ? 'No se puede eliminar el proyecto activo' : 'Eliminar proyecto'}
          >
            Eliminar
          </button>
        </div>

        {#if !canDelete}
          <p class="proj-config__hint">
            Desactiva el proyecto (activa otro) antes de poder eliminarlo
          </p>
        {/if}
      {/if}
    {:else}
      <!-- No project selected -->
      <div class="proj-config__empty">
        <p>Selecciona un proyecto para configurar</p>
        <button
          type="button"
          class="proj-config__btn proj-config__btn--cancel"
          on:click={handleClose}
        >
          Cerrar
        </button>
      </div>
    {/if}
  </div>
</FloatingPanel>

<style>
  /*
   * CSS Variables - Skinnable desde el padre
   * =========================================
   */
  .proj-config {
    /* === SKINNABLE VARIABLES === */
    --_bg: var(--proj-config-bg, var(--color-bg-card, #1a1d24));
    --_color: var(--proj-config-color, var(--color-text, #ffffff));
    --_color-muted: var(--proj-config-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--proj-config-border, var(--color-border, #374151));
    --_radius: var(--proj-config-radius, var(--radius-lg, 12px));
    --_input-bg: var(--proj-config-input-bg, var(--color-bg-input, #0d0f12));
    --_danger: var(--proj-config-danger, var(--color-danger, #ef4444));
    --_success: var(--proj-config-success, var(--color-success, #22c55e));
    --_primary: var(--proj-config-primary, var(--color-primary, #3b82f6));
    --_transition: var(--proj-config-transition, var(--transition-fast, 150ms));

    /* === LAYOUT === */
    min-width: 320px;
    max-width: 380px;
    padding: 1rem;
    background: var(--_bg);
    color: var(--_color);
  }

  /* === HEADER === */
  .proj-config__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--_border);
  }

  .proj-config__header-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .proj-config__header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .proj-config__icon {
    font-size: 2rem;
  }

  .proj-config__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .proj-config__subtitle {
    font-size: 0.75rem;
    color: var(--_color-muted);
  }

  .proj-config__badge {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .proj-config__badge--active {
    background: hsl(142 71% 45% / 0.2);
    color: var(--_success);
  }

  .proj-config__close {
    background: none;
    border: none;
    font-size: 1rem;
    color: var(--_color-muted);
    cursor: pointer;
    padding: 0.25rem;
    transition: color var(--_transition);
  }

  .proj-config__close:hover {
    color: var(--_color);
  }

  /* === FIELD === */
  .proj-config__field {
    margin-bottom: 1rem;
  }

  .proj-config__label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_color-muted);
    margin-bottom: 0.5rem;
  }

  /* === INPUT === */
  .proj-config__input {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    background: var(--_input-bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: 8px;
    transition: border-color var(--_transition);
  }

  .proj-config__input:focus {
    outline: none;
    border-color: var(--_primary);
  }

  .proj-config__input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* === TEXTAREA === */
  .proj-config__textarea {
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

  .proj-config__textarea:focus {
    outline: none;
    border-color: var(--_primary);
  }

  .proj-config__textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* === SAVE BUTTON === */
  .proj-config__save-btn {
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

  .proj-config__save-btn:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  .proj-config__save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* === ERROR === */
  .proj-config__error {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }

  /* === DIVIDER === */
  .proj-config__divider {
    height: 1px;
    background: var(--_border);
    margin: 1rem 0;
  }

  /* === ACTIONS === */
  .proj-config__actions {
    display: flex;
    gap: 0.5rem;
  }

  .proj-config__btn {
    flex: 1;
    padding: 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background var(--_transition), transform var(--_transition);
  }

  .proj-config__btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .proj-config__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .proj-config__btn--activate {
    background: hsl(142 71% 45% / 0.15);
    color: var(--_success);
    border: 1px solid var(--_success);
  }

  .proj-config__btn--activate:hover:not(:disabled) {
    background: hsl(142 71% 45% / 0.25);
  }

  .proj-config__btn--active {
    background: var(--_success);
    color: white;
    border-color: var(--_success);
  }

  .proj-config__btn--danger {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
  }

  .proj-config__btn--danger:hover:not(:disabled) {
    background: hsl(0 84% 60% / 0.25);
  }

  .proj-config__btn--cancel {
    background: var(--color-bg-hover, #252a33);
    color: var(--_color-muted);
  }

  .proj-config__btn--cancel:hover:not(:disabled) {
    background: var(--color-bg-hover, #2a2f38);
  }

  .proj-config__btn--delete {
    background: var(--_danger);
    color: white;
  }

  .proj-config__btn--delete:hover:not(:disabled) {
    background: var(--color-danger-hover, #dc2626);
  }

  /* === CONFIRM DELETE === */
  .proj-config__confirm-delete {
    text-align: center;
  }

  .proj-config__confirm-text {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
  }

  .proj-config__confirm-warning {
    margin: 0 0 1rem;
    font-size: 0.75rem;
    color: var(--_danger);
  }

  .proj-config__confirm-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  /* === HINT === */
  .proj-config__hint {
    margin: 0.75rem 0 0;
    font-size: 0.75rem;
    color: var(--_color-muted);
    text-align: center;
  }

  /* === EMPTY STATE === */
  .proj-config__empty {
    text-align: center;
    padding: 1rem;
    color: var(--_color-muted);
  }

  .proj-config__empty p {
    margin: 0 0 1rem;
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .proj-config__close,
    .proj-config__input,
    .proj-config__textarea,
    .proj-config__save-btn,
    .proj-config__btn {
      transition: none;
    }
  }
</style>
