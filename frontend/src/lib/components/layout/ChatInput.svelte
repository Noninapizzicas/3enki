<script lang="ts">
  /**
   * ChatInput - Campo de entrada de mensajes
   *
   * Features:
   * - Textarea auto-resize
   * - Botón enviar
   * - Enter para enviar (Shift+Enter para nueva línea)
   * - Integración con chat store via MQTT
   */

  import { hasAttachments } from '$lib/stores/attachments';
  import { sendMessage, isStreaming, stopGeneration, agentWorking, agentWorkingName, agentWorkingStep } from '$lib/stores';

  let inputValue = '';
  let textareaEl: HTMLTextAreaElement;

  $: isBlocked = $isStreaming || $agentWorking;
  $: canSend = (inputValue.trim().length > 0 || $hasAttachments) && !isBlocked;

  async function handleSend() {
    if (!canSend) return;

    const content = inputValue.trim();
    console.log('[ChatInput] Sending:', content);

    // Limpiar input inmediatamente
    inputValue = '';

    // Reset textarea height
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }

    // Enviar via chat store (que publica a MQTT)
    await sendMessage(content);
  }

  function handleStop() {
    stopGeneration();
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

<div class="chat-input-wrapper">
{#if $agentWorking}
  <div class="agent-banner">
    <span class="agent-banner-dot"></span>
    <span class="agent-banner-text">
      {#if $agentWorkingStep}
        {$agentWorkingStep}
      {:else}
        Agente{$agentWorkingName ? ` (${$agentWorkingName})` : ''} trabajando…
      {/if}
    </span>
    <span class="agent-banner-hint">La respuesta aparecerá aquí</span>
  </div>
{/if}
<div class="chat-input">
  <textarea
    bind:this={textareaEl}
    bind:value={inputValue}
    on:keydown={handleKeydown}
    on:input={handleInput}
    placeholder="Escribe un mensaje..."
    rows="1"
  ></textarea>

  {#if $isStreaming}
    <button
      class="stop-btn"
      on:click={handleStop}
      title="Detener generación"
    >
      <span class="stop-icon"></span>
    </button>
  {:else if $agentWorking}
    <button class="agent-btn" disabled title="Agente trabajando...">
      <span class="agent-spinner"></span>
    </button>
  {:else}
    <button
      class="send-btn"
      on:click={handleSend}
      disabled={!canSend}
      title="Enviar (Enter)"
    >
      ➤
    </button>
  {/if}
</div>
</div>

<style>
  .chat-input-wrapper {
    display: flex;
    flex-direction: column;
  }

  .agent-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 1rem;
    background: rgba(251, 191, 36, 0.08);
    border-top: 1px solid rgba(251, 191, 36, 0.25);
    font-size: 0.75rem;
    color: #fbbf24;
  }

  .agent-banner-text {
    flex: 1;
  }

  .agent-banner-hint {
    font-size: 0.7rem;
    opacity: 0.6;
    white-space: nowrap;
  }

  .agent-banner-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    background: #fbbf24;
    border-radius: 50%;
    flex-shrink: 0;
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .chat-input {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--color-input-bg, rgba(0, 0, 0, 0.2));
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

  /* Stop button */
  .stop-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 2px solid rgba(239, 68, 68, 0.7);
    background: transparent;
    border-radius: 50%;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .stop-btn:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: #ef4444;
  }

  .stop-icon {
    display: block;
    width: 0.75rem;
    height: 0.75rem;
    background: #ef4444;
    border-radius: 2px;
  }

  /* Agent working button */
  .agent-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 2px solid rgba(251, 191, 36, 0.7);
    background: transparent;
    border-radius: 50%;
    cursor: not-allowed;
    flex-shrink: 0;
  }

  .agent-spinner {
    display: block;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid rgba(251, 191, 36, 0.3);
    border-top-color: #fbbf24;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
