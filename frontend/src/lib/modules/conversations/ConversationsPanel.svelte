<script lang="ts">
  /**
   * ConversationsPanel - Gestion de conversaciones AI
   *
   * Tabs:
   * - Chat: Vista de mensajes + envio
   * - Historial: Lista de conversaciones agrupadas
   * - Config: model, temperature, system_prompt
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    conversationsStore,
    initConversations,
    loadConversations,
    createConversation,
    selectConversation,
    hasActiveConversation,
    activeProjectId
  } from '$lib/stores';
  import { openPanel } from '$lib/stores/ui';

  import ChatTab from './ChatTab.svelte';
  import HistoryTab from './HistoryTab.svelte';
  import ConfigTab from './ConfigTab.svelte';

  export let panelId: string;

  // ==========================================================================
  // STATE
  // ==========================================================================

  let cleanup: (() => void) | null = null;
  let activeTab: 'chat' | 'history' | 'config' = 'chat';

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  $: loading = $conversationsStore.loading;
  $: projectId = $activeProjectId;
  $: hasProject = !!projectId;
  $: hasConversation = $hasActiveConversation;

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

  function handleTabChange(tab: typeof activeTab) {
    activeTab = tab;
  }

  async function handleNewConversation() {
    await createConversation();
    activeTab = 'chat';
  }

  function handleGoToProjects() {
    openPanel('project');
  }

  function handleSelectConversation(conversationId: string) {
    selectConversation(conversationId);
    activeTab = 'chat';
  }
</script>

<div class="conversations-panel">
  <!-- Header with tabs -->
  <div class="panel-header">
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'chat'}
        on:click={() => handleTabChange('chat')}
        disabled={!hasProject}
      >
        💬 Chat
      </button>
      <button
        class="tab"
        class:active={activeTab === 'history'}
        on:click={() => handleTabChange('history')}
        disabled={!hasProject}
      >
        📜 Historial
      </button>
      <button
        class="tab"
        class:active={activeTab === 'config'}
        on:click={() => handleTabChange('config')}
        disabled={!hasProject || !hasConversation}
      >
        ⚙️ Config
      </button>
    </div>
    {#if hasProject}
      <button class="new-btn" on:click={handleNewConversation} title="Nueva conversacion">
        + Nueva
      </button>
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
          Las conversaciones estan vinculadas a proyectos.
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
    {:else if activeTab === 'chat'}
      <ChatTab on:newConversation={handleNewConversation} />
    {:else if activeTab === 'history'}
      <HistoryTab
        on:select={(e) => handleSelectConversation(e.detail)}
        on:newConversation={handleNewConversation}
      />
    {:else if activeTab === 'config'}
      <ConfigTab />
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
    color: var(--_text);
  }

  /* Header & Tabs */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    border-bottom: 1px solid var(--_border);
    flex-shrink: 0;
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
  }

  .tab {
    padding: 0.375rem 0.625rem;
    background: transparent;
    border: none;
    border-radius: var(--_radius);
    color: var(--_text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab:hover:not(:disabled) {
    background: var(--_bg-surface);
    color: var(--_text);
  }

  .tab:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tab.active {
    background: var(--_primary);
    color: white;
  }

  .new-btn {
    padding: 0.375rem 0.625rem;
    background: var(--_success);
    border: none;
    border-radius: var(--_radius);
    color: white;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .new-btn:hover {
    filter: brightness(1.1);
  }

  /* Content */
  .panel-content {
    flex: 1;
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
