<!--
  ConversationConfigPanel.svelte
  ==============================
  Panel para configurar/editar conversación existente.

  Abre via long press / click derecho en ConversationButton.

  Funcionalidad:
  - Ver conversación seleccionada
  - Editar título y system prompt
  - Ver info: proyecto, mensajes, modelo
  - Eliminar conversación

  Skinnable via CSS Variables (desde tokens.json):
  --conv-config-bg, --conv-config-border, --conv-config-radius

  Uso:
    <ConversationConfigPanel
      bind:open={configOpen}
      conversation={selectedConversation}
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

  export interface Conversation {
    id: string;
    project_id?: string;
    user_id?: string;
    title: string;
    system_prompt?: string;
    model?: string;
    provider?: string;
    temperature?: number;
    message_count: number;
    created_at: string;
    updated_at: string;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel abierto/cerrado */
  export let open = false;

  /** Conversación a configurar */
  export let conversation: Conversation | null = null;

  /** Nombre del módulo para API */
  const MODULE_NAME = 'conversation-manager';

  // ============================================================================
  // STATE
  // ============================================================================

  let form = {
    title: '',
    system_prompt: ''
  };

  let loading = false;
  let deleting = false;
  let error: string | null = null;
  let confirmDelete = false;

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: hasChanges = conversation && (
    form.title !== conversation.title ||
    form.system_prompt !== (conversation.system_prompt || '')
  );
  $: canSave = hasChanges && form.title.trim().length > 0;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    update: { conversation: Conversation };
    delete: { id: string };
    error: { message: string };
  }>();

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  async function updateConversation(): Promise<void> {
    if (!conversation || !canSave) return;

    loading = true;
    error = null;

    try {
      const res = await fetch(api.moduleApi(MODULE_NAME, `/conversations/${conversation.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          system_prompt: form.system_prompt.trim() || undefined
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success && data.conversation) {
        dispatch('update', { conversation: data.conversation });
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

  async function deleteConversation(): Promise<void> {
    if (!conversation) return;

    deleting = true;
    error = null;

    try {
      const res = await fetch(api.moduleApi(MODULE_NAME, `/conversations/${conversation.id}`), {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success) {
        dispatch('delete', { id: conversation.id });
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
      title: conversation?.title || '',
      system_prompt: conversation?.system_prompt || ''
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

  // Sync form with conversation when it changes or panel opens
  $: if (open && conversation) {
    form = {
      title: conversation.title || '',
      system_prompt: conversation.system_prompt || ''
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
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  }
</script>

<FloatingPanel bind:open>
  <div class="conv-config">
    {#if conversation}
      <!-- Header -->
      <div class="conv-config__header">
        <div class="conv-config__header-info">
          <span class="conv-config__icon">💬</span>
          <div>
            <h3 class="conv-config__title">{conversation.title}</h3>
            <span class="conv-config__subtitle">
              {conversation.message_count} mensajes
            </span>
          </div>
        </div>
        <button
          type="button"
          class="conv-config__close"
          on:click={handleClose}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <!-- Info Section -->
      <div class="conv-config__info">
        <div class="conv-config__info-row">
          <span class="conv-config__info-label">Proyecto</span>
          <span class="conv-config__info-value">
            {conversation.project_id || 'Sin proyecto'}
          </span>
        </div>
        <div class="conv-config__info-row">
          <span class="conv-config__info-label">Modelo</span>
          <span class="conv-config__info-value">
            {conversation.model || 'auto'} ({conversation.provider || 'auto'})
          </span>
        </div>
        <div class="conv-config__info-row">
          <span class="conv-config__info-label">Creada</span>
          <span class="conv-config__info-value">
            {formatDate(conversation.created_at)}
          </span>
        </div>
      </div>

      <!-- Title Field -->
      <div class="conv-config__field">
        <label class="conv-config__label" for="config-title">Título</label>
        <input
          id="config-title"
          type="text"
          class="conv-config__input"
          bind:value={form.title}
          disabled={loading || deleting}
        />
      </div>

      <!-- System Prompt Field -->
      <div class="conv-config__field">
        <label class="conv-config__label" for="config-prompt">System Prompt</label>
        <textarea
          id="config-prompt"
          class="conv-config__textarea"
          rows="3"
          placeholder="Comportamiento del asistente..."
          bind:value={form.system_prompt}
          disabled={loading || deleting}
        />
      </div>

      <!-- Save Changes -->
      {#if hasChanges}
        <button
          type="button"
          class="conv-config__save-btn"
          on:click={updateConversation}
          disabled={!canSave || loading}
        >
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      {/if}

      <!-- Error -->
      {#if error}
        <div class="conv-config__error">{error}</div>
      {/if}

      <!-- Divider -->
      <div class="conv-config__divider"></div>

      <!-- Actions -->
      {#if confirmDelete}
        <div class="conv-config__confirm-delete">
          <p class="conv-config__confirm-text">
            ¿Eliminar conversación?
          </p>
          <p class="conv-config__confirm-warning">
            Se eliminarán {conversation.message_count} mensajes
          </p>
          <div class="conv-config__confirm-actions">
            <button
              type="button"
              class="conv-config__btn conv-config__btn--cancel"
              on:click={cancelDelete}
              disabled={deleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              class="conv-config__btn conv-config__btn--delete"
              on:click={deleteConversation}
              disabled={deleting}
            >
              {deleting ? 'Eliminando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      {:else}
        <div class="conv-config__actions">
          <button
            type="button"
            class="conv-config__btn conv-config__btn--danger"
            on:click={startDelete}
            disabled={loading || deleting}
          >
            Eliminar
          </button>
        </div>
      {/if}
    {:else}
      <div class="conv-config__empty">
        <p>Selecciona una conversación para configurar</p>
        <button
          type="button"
          class="conv-config__btn conv-config__btn--cancel"
          on:click={handleClose}
        >
          Cerrar
        </button>
      </div>
    {/if}
  </div>
</FloatingPanel>

<style>
  .conv-config {
    --_bg: var(--conv-config-bg, var(--color-bg-card, #1a1d24));
    --_color: var(--conv-config-color, var(--color-text, #ffffff));
    --_color-muted: var(--conv-config-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--conv-config-border, var(--color-border, #374151));
    --_radius: var(--conv-config-radius, var(--radius-lg, 12px));
    --_input-bg: var(--conv-config-input-bg, var(--color-bg-input, #0d0f12));
    --_danger: var(--conv-config-danger, var(--color-danger, #ef4444));
    --_primary: var(--conv-config-primary, var(--color-primary, #3b82f6));
    --_transition: var(--conv-config-transition, var(--transition-fast, 150ms));

    min-width: 320px;
    max-width: 380px;
    padding: 1rem;
    background: var(--_bg);
    color: var(--_color);
  }

  .conv-config__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--_border);
  }

  .conv-config__header-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .conv-config__icon {
    font-size: 1.75rem;
  }

  .conv-config__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .conv-config__subtitle {
    font-size: 0.75rem;
    color: var(--_color-muted);
  }

  .conv-config__close {
    background: none;
    border: none;
    font-size: 1rem;
    color: var(--_color-muted);
    cursor: pointer;
    padding: 0.25rem;
    transition: color var(--_transition);
  }

  .conv-config__close:hover {
    color: var(--_color);
  }

  .conv-config__info {
    background: var(--_input-bg);
    border-radius: 8px;
    padding: 0.75rem;
    margin-bottom: 1rem;
  }

  .conv-config__info-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    padding: 0.25rem 0;
  }

  .conv-config__info-label {
    color: var(--_color-muted);
  }

  .conv-config__info-value {
    color: var(--_color);
    font-weight: 500;
  }

  .conv-config__field {
    margin-bottom: 1rem;
  }

  .conv-config__label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_color-muted);
    margin-bottom: 0.5rem;
  }

  .conv-config__input {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    background: var(--_input-bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: 8px;
    transition: border-color var(--_transition);
  }

  .conv-config__input:focus {
    outline: none;
    border-color: var(--_primary);
  }

  .conv-config__input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .conv-config__textarea {
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

  .conv-config__textarea:focus {
    outline: none;
    border-color: var(--_primary);
  }

  .conv-config__textarea::placeholder {
    color: var(--_color-muted);
  }

  .conv-config__textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .conv-config__save-btn {
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

  .conv-config__save-btn:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  .conv-config__save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .conv-config__error {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }

  .conv-config__divider {
    height: 1px;
    background: var(--_border);
    margin: 1rem 0;
  }

  .conv-config__actions {
    display: flex;
    gap: 0.5rem;
  }

  .conv-config__btn {
    flex: 1;
    padding: 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background var(--_transition), transform var(--_transition);
  }

  .conv-config__btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .conv-config__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .conv-config__btn--danger {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
  }

  .conv-config__btn--danger:hover:not(:disabled) {
    background: hsl(0 84% 60% / 0.25);
  }

  .conv-config__btn--cancel {
    background: var(--color-bg-hover, #252a33);
    color: var(--_color-muted);
  }

  .conv-config__btn--cancel:hover:not(:disabled) {
    background: var(--color-bg-hover, #2a2f38);
  }

  .conv-config__btn--delete {
    background: var(--_danger);
    color: white;
  }

  .conv-config__btn--delete:hover:not(:disabled) {
    background: var(--color-danger-hover, #dc2626);
  }

  .conv-config__confirm-delete {
    text-align: center;
  }

  .conv-config__confirm-text {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
  }

  .conv-config__confirm-warning {
    margin: 0 0 1rem;
    font-size: 0.75rem;
    color: var(--_danger);
  }

  .conv-config__confirm-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .conv-config__empty {
    text-align: center;
    padding: 1rem;
    color: var(--_color-muted);
  }

  .conv-config__empty p {
    margin: 0 0 1rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .conv-config__close,
    .conv-config__input,
    .conv-config__textarea,
    .conv-config__save-btn,
    .conv-config__btn {
      transition: none;
    }
  }
</style>
