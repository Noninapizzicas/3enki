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
   * - Toggle de contexto por mensaje
   */

  import { messages, hasConversation, isStreaming, lastMessage, toolStatus, toggleMessageContext } from '$lib/stores';
  import { Message, ConnectionStatus } from '$lib/components/base';
  import { connected } from '$lib/ui-core';
  import { afterUpdate } from 'svelte';
  import { fade } from 'svelte/transition';

  // Show typing dots only when streaming AND no content has arrived yet
  $: showTypingDots = $isStreaming && !($lastMessage?.role === 'assistant' && $lastMessage?.streaming) && !$toolStatus;

  // Handler para toggle de contexto
  async function handleToggleContext(event: CustomEvent<{ id: string; inContext: boolean }>) {
    const { id, inContext } = event.detail;
    try {
      await toggleMessageContext(id, inContext);
    } catch (error) {
      console.error('[ChatArea] Failed to toggle context:', error);
    }
  }

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
        <Message {message} on:toggleContext={handleToggleContext} />
      {/each}

      <!-- Tool execution indicator -->
      {#if $toolStatus}
        <div class="tool-indicator" transition:fade={{ duration: 150 }}>
          <span class="tool-icon">{$toolStatus.status === 'executing' ? '⚙️' : $toolStatus.status === 'error' ? '❌' : '✅'}</span>
          <span class="tool-text">
            {$toolStatus.status === 'executing' ? `Ejecutando ${$toolStatus.name}...` :
             $toolStatus.status === 'error' ? `Error en ${$toolStatus.name}` :
             `${$toolStatus.name} completado`}
          </span>
        </div>
      {/if}

      <!-- Typing indicator: only show when waiting for first chunk -->
      {#if showTypingDots}
        <div class="typing-indicator" transition:fade={{ duration: 150 }}>
          <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span class="typing-text">Generando...</span>
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
    min-height: 0; /* Necesario para scroll en flexbox */
    overflow-y: auto;
    -webkit-overflow-scrolling: touch; /* Scroll suave en móvil */
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

  /* Tool execution indicator */
  .tool-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.875rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    width: fit-content;
  }

  .tool-icon {
    font-size: 0.875rem;
  }

  .tool-text {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    font-style: italic;
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
