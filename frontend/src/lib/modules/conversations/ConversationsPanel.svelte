<script lang="ts">
  /**
   * ConversationsPanel - Gestion de conversaciones AI
   *
   * 2 Vistas:
   * - Lista: conversaciones agrupadas por fecha
   * - Config: crear/editar conversación
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    conversationsStore,
    initConversations,
    createConversation,
    selectConversation,
    activeConversationId,
    activeProjectIdMqtt
  } from '$lib/stores';
  import { openPanel, closePanel } from '$lib/stores/ui';

  import HistoryTab from './HistoryTab.svelte';
  import ConfigTab from './ConfigTab.svelte';

  export let panelId: string;

  // ==========================================================================
  // STATE
  // ==========================================================================

  let cleanup: (() => void) | null = null;

  // Vista actual: 'list' o 'config'
  let currentView: 'list' | 'config' = 'list';

  // ID de conversación a editar (null = crear nueva)
  let editingConversationId: string | null = null;

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  $: loading = $conversationsStore.loading;
  $: projectId = $activeProjectIdMqtt;
  $: hasProject = !!projectId;

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    cleanup = initConversations();
  });

  onDestroy(() => {
    cleanup?.();
  });

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  function handleNewConversation() {
    editingConversationId = null;
    currentView = 'config';
  }

  function handleEditConversation(conversationId: string) {
    editingConversationId = conversationId;
    currentView = 'config';
  }

  function handleSelectConversation(conversationId: string) {
    selectConversation(conversationId);
    closePanel();
  }

  function handleBackToList() {
    currentView = 'list';
    editingConversationId = null;
  }

  function handleSaved() {
    // Después de guardar, cerrar panel
    closePanel();
  }

  function handleGoToProjects() {
    openPanel('project');
  }
</script>

<div class="conversations-panel">
  <!-- Header -->
  <div class="panel-header">
    {#if currentView === 'list'}
      <span class="header-title">Conversaciones</span>
      {#if hasProject}
        <button class="new-btn" on:click={handleNewConversation} title="Nueva conversacion">
          + Nueva
        </button>
      {/if}
    {:else}
      <button class="back-btn" on:click={handleBackToList}>
        ← Volver
      </button>
      <span class="header-title">
        {editingConversationId ? 'Editar' : 'Nueva'} Conversación
      </span>
    {/if}
  </div>

  <!-- Content -->
  <div class="panel-content">
    {#if !hasProject}
      <!-- No project selected -->
      <div class="empty-state">
        <span class="empty-icon">📁</span>
        <span class="empty-title">Selecciona un proyecto</span>
        <span class="empty-text">
          Las conversaciones están vinculadas a proyectos.
          Activa uno para comenzar.
        </span>
        <button class="btn primary" on:click={handleGoToProjects}>
          Ir a Proyectos
        </button>
      </div>
    {:else if loading}
      <!-- Loading -->
      <div class="loading-state">
        <span class="loading-icon">⏳</span>
        <span>Cargando...</span>
      </div>
    {:else if currentView === 'list'}
      <HistoryTab
        on:select={(e) => handleSelectConversation(e.detail)}
        on:edit={(e) => handleEditConversation(e.detail)}
        on:newConversation={handleNewConversation}
      />
    {:else if currentView === 'config'}
      <ConfigTab
        conversationId={editingConversationId}
        isNewConversation={!editingConversationId}
        on:saved={handleSaved}
        on:cancel={handleBackToList}
      />
    {/if}
  </div>
</div>

<style>
  .conversations-panel {
    --_bg: var(--panel-bg, var(--color-bg-card, #1a1d24));
    --_bg-surface: var(--panel-bg-surface, rgba(255, 255, 255, 0.05));
    --_text: var(--panel-text, var(--color-text, #e5e5e5));
    --_text-muted: var(--panel-text-muted, var(--color-text-muted, #a3a3a3));
    --_border: var(--panel-border, rgba(255, 255, 255, 0.1));
    --_primary: var(--panel-primary, var(--color-primary, #3b82f6));
    --_success: var(--panel-success, var(--color-success, #22c55e));
    --_danger: var(--panel-danger, var(--color-danger, #ef4444));
    --_radius: var(--panel-radius, 0.5rem);

    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    color: var(--_text);
  }

  /* Header */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--_border);
    flex: 0 0 auto;
    gap: 0.5rem;
  }

  .header-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--_text);
  }

  .back-btn {
    padding: 0.1875rem 0.375rem;
    background: var(--_bg-surface);
    border: none;
    border-radius: var(--_radius);
    color: var(--_text-muted);
    font-size: 0.625rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--_text);
  }

  .new-btn {
    padding: 0.25rem 0.5rem;
    background: var(--_success);
    border: none;
    border-radius: var(--_radius);
    color: white;
    font-size: 0.625rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .new-btn:hover {
    filter: brightness(1.1);
  }

  /* Content */
  .panel-content {
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Empty & Loading States */
  .empty-state, .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
    text-align: center;
    flex: 1;
  }

  .empty-icon, .loading-icon {
    font-size: 2.5rem;
    opacity: 0.5;
  }

  .loading-icon {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .empty-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--_text);
  }

  .empty-text {
    font-size: 0.875rem;
    color: var(--_text-muted);
    max-width: 280px;
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

  .btn.primary {
    background: var(--_primary);
    color: white;
  }

  .btn.primary:hover {
    filter: brightness(1.1);
  }
</style>
