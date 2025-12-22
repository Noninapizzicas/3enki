<script lang="ts">
  /**
   * HistoryPanel - Panel de historial de conversaciones
   *
   * Features:
   * - Lista de conversaciones pasadas
   * - Cargar conversación
   * - Nueva conversación
   * - Eliminar conversación
   */

  import { conversationId, loadConversation, newConversation } from '$lib/stores';
  import { closePanel } from '$lib/stores/ui';
  import { publish } from '$lib/ui-core';

  export let _panelId: string;

  // Interfaz de conversación
  interface Conversation {
    id: string;
    title: string;
    preview: string;
    timestamp: string;
    messageCount: number;
  }

  // Demo conversations - en producción vendrían del backend
  let conversations: Conversation[] = [
    {
      id: 'conv-1',
      title: 'Debug de API',
      preview: 'Ayúdame a encontrar el error en esta función...',
      timestamp: '2024-12-13T10:30:00Z',
      messageCount: 12
    },
    {
      id: 'conv-2',
      title: 'Refactor de componentes',
      preview: 'Necesito mejorar la estructura de estos componentes...',
      timestamp: '2024-12-12T15:45:00Z',
      messageCount: 8
    },
    {
      id: 'conv-3',
      title: 'Diseño de UI',
      preview: 'Quiero implementar un sistema de paneles...',
      timestamp: '2024-12-11T09:00:00Z',
      messageCount: 24
    }
  ];

  function formatDate(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Hoy ' + date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Ayer';
    } else if (diffDays < 7) {
      return `Hace ${diffDays} días`;
    } else {
      return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
    }
  }

  function handleSelect(conv: Conversation) {
    loadConversation(conv.id);
    closePanel();
  }

  function handleNew() {
    newConversation();
    closePanel();
  }

  function handleDelete(convId: string, event: MouseEvent) {
    event.stopPropagation();
    publish('conversation/delete', { conversationId: convId });
    conversations = conversations.filter(c => c.id !== convId);
  }
</script>

<div class="history-panel">
  <button class="new-conversation" on:click={handleNew}>
    ➕ Nueva conversación
  </button>

  <div class="conversations-list">
    {#if conversations.length === 0}
      <div class="empty-state">
        <span class="empty-icon">💬</span>
        <span class="empty-text">No hay conversaciones</span>
        <span class="empty-hint">Inicia una nueva conversación</span>
      </div>
    {:else}
      {#each conversations as conv (conv.id)}
        <button
          class="conversation-item"
          class:active={$conversationId === conv.id}
          on:click={() => handleSelect(conv)}
        >
          <div class="conv-header">
            <span class="conv-title">{conv.title}</span>
            <span class="conv-date">{formatDate(conv.timestamp)}</span>
          </div>
          <p class="conv-preview">{conv.preview}</p>
          <div class="conv-footer">
            <span class="conv-count">{conv.messageCount} mensajes</span>
            <button
              class="delete-btn"
              on:click={(e) => handleDelete(conv.id, e)}
              title="Eliminar"
            >
              🗑️
            </button>
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .history-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
  }

  .new-conversation {
    width: 100%;
    padding: 0.75rem 1rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.375rem;
    color: white;
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .new-conversation:hover {
    background: var(--color-primary-hover, #2563eb);
  }

  .conversations-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .empty-icon {
    font-size: 2.5rem;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 1rem;
    font-weight: 500;
  }

  .empty-hint {
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .conversation-item {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }

  .conversation-item:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
    border-color: var(--color-border-hover, rgba(255, 255, 255, 0.2));
  }

  .conversation-item.active {
    background: var(--color-active, rgba(59, 130, 246, 0.2));
    border-color: var(--color-primary, #3b82f6);
  }

  .conv-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .conv-title {
    font-weight: 500;
    color: var(--color-text, #e5e5e5);
    font-size: 0.9375rem;
  }

  .conv-date {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .conv-preview {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-muted, #a3a3a3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conv-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.25rem;
  }

  .conv-count {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    opacity: 0.7;
  }

  .delete-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background-color 0.15s;
    font-size: 0.875rem;
  }

  .conversation-item:hover .delete-btn {
    opacity: 0.7;
  }

  .delete-btn:hover {
    opacity: 1 !important;
    background: rgba(239, 68, 68, 0.2);
  }
</style>
