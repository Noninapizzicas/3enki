<script lang="ts">
  /**
   * ChatArea - Área de mensajes del chat
   *
   * Features:
   * - Scroll vertical
   * - Auto-scroll al nuevo mensaje
   * - Mensaje vacío cuando no hay conversación
   */

  import { messages, hasConversation } from '$lib/stores';
  import { Message } from '$lib/components/base';
  import { afterUpdate } from 'svelte';

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
  {#if $messages.length > 0}
    <div class="messages">
      {#each $messages as message (message.id)}
        <Message {message} />
      {/each}
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

  .messages {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
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
