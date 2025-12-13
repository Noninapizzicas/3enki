<script lang="ts">
  /**
   * ChatArea - Área de mensajes del chat
   *
   * Features:
   * - Scroll vertical
   * - Auto-scroll al nuevo mensaje
   * - Mensaje vacío cuando no hay conversación
   * - Indicador de typing/streaming
   * - Indicador de conexión
   */

  import { messages, hasConversation, isStreaming } from '$lib/stores';
  import { Message, ConnectionStatus } from '$lib/components/base';
  import { connected } from '$lib/ui-core';
  import { afterUpdate } from 'svelte';
  import { fade } from 'svelte/transition';

  let containerEl: HTMLDivElement;
  let shouldAutoScroll = true;

  // Auto-scroll cuando hay nuevos mensajes
  afterUpdate(() => {
    if (shouldAutoScroll && containerEl) {
      containerEl.scrollTop = containerEl.scrollHeight;
    }
  });

  // Detectar si el usuario ha hecho scroll manual
  function handleScroll() {
    if (!containerEl) return;

    const { scrollTop, scrollHeight, clientHeight } = containerEl;
    // Si está cerca del fondo (50px), mantener auto-scroll
    shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 50;
  }
</script>

<div
  class="chat-area"
  bind:this={containerEl}
  on:scroll={handleScroll}
>
  <!-- Status bar -->
  <div class="status-bar">
    <ConnectionStatus showLabel={!$connected} />
  </div>

  {#if $messages.length > 0}
    <div class="messages">
      {#each $messages as message (message.id)}
        <Message {message} />
      {/each}

      <!-- Typing indicator -->
      {#if $isStreaming}
        <div class="typing-indicator" transition:fade={{ duration: 150 }}>
          <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span class="typing-text">Escribiendo...</span>
        </div>
      {/if}
    </div>
  {:else if $hasConversation}
    <div class="empty">
      <span class="empty-icon">💬</span>
      <p>Conversación vacía</p>
      <p class="hint">Escribe un mensaje para comenzar</p>
    </div>
  {:else}
    <div class="empty">
      <span class="empty-icon">👋</span>
      <p>Bienvenido</p>
      <p class="hint">Selecciona un proyecto y escribe para comenzar</p>
    </div>
  {/if}
</div>

<style>
  .chat-area {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
  }

  /* Status bar */
  .status-bar {
    position: sticky;
    top: 0;
    display: flex;
    justify-content: flex-end;
    padding: 0.25rem 0.5rem;
    z-index: 5;
  }

  .messages {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
  }

  /* Typing indicator */
  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border-radius: 1rem;
    width: fit-content;
  }

  .typing-dots {
    display: flex;
    gap: 4px;
  }

  .typing-dots span {
    width: 6px;
    height: 6px;
    background: var(--color-primary, #3b82f6);
    border-radius: 50%;
    animation: typing-bounce 1.4s ease-in-out infinite;
  }

  .typing-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .typing-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes typing-bounce {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.6;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  .typing-text {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--color-text-muted, #a3a3a3);
    gap: 0.5rem;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 0.5rem;
  }

  .empty p {
    margin: 0;
    font-size: 1.125rem;
  }

  .empty .hint {
    font-size: 0.875rem;
    opacity: 0.7;
  }

  /* Custom scrollbar */
  .chat-area::-webkit-scrollbar {
    width: 6px;
  }

  .chat-area::-webkit-scrollbar-track {
    background: transparent;
  }

  .chat-area::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar, rgba(255, 255, 255, 0.2));
    border-radius: 3px;
  }

  .chat-area::-webkit-scrollbar-thumb:hover {
    background: var(--color-scrollbar-hover, rgba(255, 255, 255, 0.3));
  }
</style>
