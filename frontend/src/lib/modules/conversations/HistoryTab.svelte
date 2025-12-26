<script lang="ts">
  /**
   * HistoryTab - Lista de conversaciones agrupadas por fecha
   */

  import { createEventDispatcher } from 'svelte';
  import {
    conversationsStore,
    conversationSections,
    activeConversationId,
    deleteConversation,
    hasConversations
  } from '$lib/stores';

  const dispatch = createEventDispatcher();

  // ==========================================================================
  // STATE
  // ==========================================================================

  let searchQuery = '';
  let expandedSections: Record<string, boolean> = {
    today: true,
    yesterday: true,
    this_week: true,
    this_month: false,
    older: false
  };
  let deleting: string | null = null;

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  $: sections = $conversationSections;
  $: currentId = $activeConversationId;
  $: hasAny = $hasConversations;

  // Filter sections by search
  $: filteredSections = searchQuery
    ? sections.map(section => ({
        ...section,
        conversations: section.conversations.filter(c =>
          c.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(s => s.conversations.length > 0)
    : sections;

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  function handleSelect(conversationId: string) {
    dispatch('select', conversationId);
  }

  function handleNewConversation() {
    dispatch('newConversation');
  }

  async function handleDelete(conversationId: string, event: Event) {
    event.stopPropagation();
    if (deleting) return;

    if (!confirm('¿Eliminar esta conversacion?')) return;

    deleting = conversationId;
    try {
      await deleteConversation(conversationId);
    } finally {
      deleting = null;
    }
  }

  function toggleSection(sectionId: string) {
    expandedSections[sectionId] = !expandedSections[sectionId];
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes}m`;
    if (hours < 24) return `hace ${hours}h`;

    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
</script>

<div class="history-tab">
  <!-- Search -->
  <div class="search-container">
    <input
      type="text"
      class="search-input"
      placeholder="🔍 Buscar conversaciones..."
      bind:value={searchQuery}
    />
  </div>

  <!-- Content -->
  {#if !hasAny}
    <div class="empty-state">
      <span class="empty-icon">📜</span>
      <span class="empty-title">Sin conversaciones</span>
      <span class="empty-text">
        Crea tu primera conversacion para comenzar
      </span>
      <button class="btn primary" on:click={handleNewConversation}>
        + Nueva conversacion
      </button>
    </div>
  {:else if filteredSections.length === 0}
    <div class="empty-state">
      <span class="empty-icon">🔍</span>
      <span class="empty-title">Sin resultados</span>
      <span class="empty-text">
        No hay conversaciones que coincidan con "{searchQuery}"
      </span>
    </div>
  {:else}
    <div class="sections-list">
      {#each filteredSections as section (section.id)}
        <div class="section">
          <button
            class="section-header"
            on:click={() => toggleSection(section.id)}
          >
            <span class="section-toggle">
              {expandedSections[section.id] ? '▼' : '▶'}
            </span>
            <span class="section-label">{section.label}</span>
            <span class="section-count">{section.conversations.length}</span>
          </button>

          {#if expandedSections[section.id]}
            <div class="section-content">
              {#each section.conversations as conversation (conversation.id)}
                <div
                  class="conversation-item"
                  class:active={currentId === conversation.id}
                  role="button"
                  tabindex="0"
                  on:click={() => handleSelect(conversation.id)}
                  on:keydown={(e) => e.key === 'Enter' && handleSelect(conversation.id)}
                >
                  <div class="conversation-info">
                    <span class="conversation-title">{conversation.title}</span>
                    <span class="conversation-meta">
                      {conversation.message_count} mensajes · {formatRelativeTime(conversation.updated_at)}
                    </span>
                  </div>
                  <button
                    class="delete-btn"
                    on:click|stopPropagation={(e) => handleDelete(conversation.id, e)}
                    disabled={deleting === conversation.id}
                    title="Eliminar"
                  >
                    {deleting === conversation.id ? '⏳' : '🗑️'}
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .history-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    --_bg-surface: var(--panel-bg-surface, rgba(255, 255, 255, 0.05));
    --_text: var(--panel-text, var(--color-text, #e5e5e5));
    --_text-muted: var(--panel-text-muted, var(--color-text-muted, #a3a3a3));
    --_border: var(--panel-border, rgba(255, 255, 255, 0.1));
    --_primary: var(--panel-primary, var(--color-primary, #3b82f6));
    --_danger: var(--panel-danger, var(--color-danger, #ef4444));
    --_radius: var(--panel-radius, 0.5rem);
  }

  /* Search */
  .search-container {
    padding: 0.75rem;
    border-bottom: 1px solid var(--_border);
  }

  .search-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--_bg-surface);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    color: var(--_text);
    font-size: 0.875rem;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--_primary);
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

  .empty-title {
    font-size: 1rem;
    font-weight: 600;
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
  }

  .btn.primary {
    background: var(--_primary);
    color: white;
  }

  /* Sections */
  .sections-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .section {
    margin-bottom: 0.5rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--_text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    cursor: pointer;
    text-align: left;
  }

  .section-header:hover {
    color: var(--_text);
  }

  .section-toggle {
    font-size: 0.625rem;
  }

  .section-label {
    flex: 1;
  }

  .section-count {
    padding: 0.125rem 0.375rem;
    background: var(--_bg-surface);
    border-radius: 9999px;
    font-size: 0.625rem;
  }

  .section-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-left: 0.5rem;
  }

  /* Conversation Item */
  .conversation-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: var(--_bg-surface);
    border: 1px solid transparent;
    border-radius: var(--_radius);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .conversation-item:hover {
    border-color: var(--_border);
  }

  .conversation-item.active {
    border-color: var(--_primary);
    background: rgba(59, 130, 246, 0.1);
  }

  .conversation-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .conversation-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conversation-meta {
    font-size: 0.75rem;
    color: var(--_text-muted);
  }

  .delete-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .conversation-item:hover .delete-btn {
    opacity: 0.5;
  }

  .delete-btn:hover {
    opacity: 1 !important;
  }

  .delete-btn:disabled {
    cursor: wait;
  }
</style>
