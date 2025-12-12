<script lang="ts">
  /**
   * ChatInput - Campo de entrada de mensajes
   *
   * Features:
   * - Textarea auto-resize
   * - Botón enviar
   * - Enter para enviar (Shift+Enter para nueva línea)
   * - Deshabilitado durante streaming
   */

  import { sendMessage, isStreaming } from '$lib/stores';
  import { hasAttachments } from '$lib/stores/attachments';

  let inputValue = '';
  let textareaEl: HTMLTextAreaElement;

  $: canSend = (inputValue.trim().length > 0 || $hasAttachments) && !$isStreaming;

  async function handleSend() {
    if (!canSend) return;

    const content = inputValue.trim();
    inputValue = '';

    // Reset textarea height
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }

    await sendMessage(content);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    // Auto-resize textarea
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 150) + 'px';
    }
  }
</script>

<div class="chat-input" class:streaming={$isStreaming}>
  <textarea
    bind:this={textareaEl}
    bind:value={inputValue}
    on:keydown={handleKeydown}
    on:input={handleInput}
    placeholder={$isStreaming ? 'Esperando respuesta...' : 'Escribe un mensaje...'}
    disabled={$isStreaming}
    rows="1"
  ></textarea>

  <button
    class="send-btn"
    on:click={handleSend}
    disabled={!canSend}
    title="Enviar (Enter)"
  >
    ➤
  </button>
</div>

<style>
  .chat-input {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--color-input-bg, rgba(0, 0, 0, 0.2));
  }

  .chat-input.streaming {
    opacity: 0.7;
  }

  textarea {
    flex: 1;
    padding: 0.625rem 0.875rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 1rem;
    color: var(--color-text, #e5e5e5);
    font-family: inherit;
    font-size: 0.9375rem;
    line-height: 1.4;
    resize: none;
    min-height: 2.5rem;
    max-height: 150px;
    overflow-y: auto;
  }

  textarea::placeholder {
    color: var(--color-text-muted, #a3a3a3);
  }

  textarea:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  textarea:disabled {
    cursor: not-allowed;
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: none;
    background: var(--color-primary, #3b82f6);
    color: white;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.125rem;
    transition: background-color 0.15s, transform 0.1s;
    flex-shrink: 0;
  }

  .send-btn:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  .send-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .send-btn:disabled {
    background: var(--color-disabled, #4b5563);
    cursor: not-allowed;
  }
</style>
