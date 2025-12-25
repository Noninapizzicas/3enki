<script lang="ts">
  /**
   * ChatTab - Vista de mensajes de conversacion (solo lectura)
   * El input de chat está en el sistema principal, no aquí
   */

  import { createEventDispatcher } from 'svelte';
  import {
    conversationsStore,
    hasActiveConversation,
    conversationMessages,
    activeConversation,
    conversationsSending
  } from '$lib/stores';

  const dispatch = createEventDispatcher();

  // ==========================================================================
  // STATE
  // ==========================================================================

  let messagesContainer: HTMLElement;

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  $: hasConversation = $hasActiveConversation;
  $: messages = $conversationMessages;
  $: conversation = $activeConversation;
  $: sending = $conversationsSending;
  $: error = $conversationsStore.error;

  // Auto-scroll to bottom when messages change
  $: if (messages.length && messagesContainer) {
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);
  }

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  function handleNewConversation() {
    dispatch('newConversation');
  }

  function handleUseInChat() {
    // Cerrar panel y usar esta conversación en el chat principal
    dispatch('useInChat', { conversationId: conversation?.id });
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  function formatTokens(tokens: number | null): string {
    if (!tokens) return '';
    return `${tokens} tok`;
  }
</script>

<div class="chat-tab">
  {#if !hasConversation && messages.length === 0}
    <!-- Empty state -->
    <div class="empty-state">
      <span class="empty-icon">💬</span>
      <span class="empty-title">Sin conversacion activa</span>
      <span class="empty-text">
        Selecciona una conversacion del historial o crea una nueva
      </span>
      <button class="btn primary" on:click={handleNewConversation}>
        + Nueva conversacion
      </button>
    </div>
  {:else}
    <!-- Messages -->
    <div class="messages-container" bind:this={messagesContainer}>
      {#if conversation}
        <div class="conversation-header">
          <div class="header-info">
            <span class="conversation-title">{conversation.title}</span>
            <span class="conversation-model">
              {conversation.provider || 'auto'} / {conversation.model || 'default'}
            </span>
          </div>
          <button class="btn-use" on:click={handleUseInChat} title="Continuar en chat">
            Usar en chat ↗
          </button>
        </div>
      {/if}

      <div class="messages-list">
        {#each messages as message (message.id)}
          <div class="message" class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
            <div class="message-avatar">
              {message.role === 'user' ? '👤' : '🤖'}
            </div>
            <div class="message-content">
              <div class="message-text">{message.content}</div>
              <div class="message-meta">
                <span class="message-time">{formatTime(message.created_at)}</span>
                {#if message.tokens}
                  <span class="message-tokens">{formatTokens(message.tokens)}</span>
                {/if}
                {#if message.metadata?.model}
                  <span class="message-model">{message.metadata.model}</span>
                {/if}
              </div>
            </div>
          </div>
        {/each}

        {#if sending}
          <div class="message assistant typing">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        {/if}
      </div>

      {#if messages.length === 0}
        <div class="no-messages">
          <span>Sin mensajes aún</span>
          <span class="hint">Usa el chat principal para enviar mensajes</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="error-banner">
      <span>⚠️ {error}</span>
      <button on:click={() => conversationsStore.update(s => ({ ...s, error: null }))}>✕</button>
    </div>
  {/if}
</div>

<style>
  .chat-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    --_bg-surface: var(--panel-bg-surface, rgba(255, 255, 255, 0.05));
    --_text: var(--panel-text, var(--color-text, #e5e5e5));
    --_text-muted: var(--panel-text-muted, var(--color-text-muted, #a3a3a3));
    --_border: var(--panel-border, rgba(255, 255, 255, 0.1));
    --_primary: var(--panel-primary, var(--color-primary, #3b82f6));
    --_success: var(--panel-success, var(--color-success, #22c55e));
    --_danger: var(--panel-danger, var(--color-danger, #ef4444));
    --_radius: var(--panel-radius, 0.5rem);
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
    font-size: 3rem;
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

  /* Messages Container */
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .conversation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
    background: var(--_bg-surface);
    border-radius: var(--_radius);
    gap: 0.5rem;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .conversation-title {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .conversation-model {
    font-size: 0.75rem;
    color: var(--_text-muted);
  }

  .btn-use {
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    background: var(--_primary);
    color: white;
    border: none;
    border-radius: var(--_radius);
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-use:hover {
    filter: brightness(1.1);
  }

  .messages-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Message */
  .message {
    display: flex;
    gap: 0.5rem;
    max-width: 85%;
  }

  .message.user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }

  .message.assistant {
    align-self: flex-start;
  }

  .message-avatar {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    flex-shrink: 0;
  }

  .message-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .message-text {
    padding: 0.625rem 0.875rem;
    border-radius: var(--_radius);
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .message.user .message-text {
    background: var(--_primary);
    color: white;
    border-bottom-right-radius: 0.25rem;
  }

  .message.assistant .message-text {
    background: var(--_bg-surface);
    border-bottom-left-radius: 0.25rem;
  }

  .message-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.25rem;
  }

  .message.user .message-meta {
    justify-content: flex-end;
  }

  .message-time, .message-tokens, .message-model {
    font-size: 0.625rem;
    color: var(--_text-muted);
  }

  /* No messages */
  .no-messages {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: var(--_text-muted);
    gap: 0.25rem;
  }

  .no-messages .hint {
    font-size: 0.75rem;
    opacity: 0.7;
  }

  /* Typing Indicator */
  .typing-indicator {
    display: flex;
    gap: 0.25rem;
    padding: 0.75rem 1rem;
  }

  .typing-indicator span {
    width: 6px;
    height: 6px;
    background: var(--_text-muted);
    border-radius: 50%;
    animation: typing 1.4s infinite;
  }

  .typing-indicator span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .typing-indicator span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes typing {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  /* Error Banner */
  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: rgba(239, 68, 68, 0.1);
    border-top: 1px solid var(--_danger);
    font-size: 0.75rem;
    color: var(--_danger);
  }

  .error-banner button {
    background: none;
    border: none;
    color: var(--_danger);
    cursor: pointer;
    padding: 0.25rem;
  }
</style>
