<script lang="ts">
  /**
   * Message - Componente de mensaje de chat
   *
   * Features:
   * - Estilos diferenciados por rol (user, assistant, system)
   * - Timestamp formateado
   * - Adjuntos inline
   * - Indicador de streaming
   * - Checkbox de contexto (incluir/excluir del contexto AI)
   * - Estilos visuales para mensajes fuera del contexto
   */

  import { createEventDispatcher } from 'svelte';
  import type { Message, Attachment } from '$lib/ui-core';
  import Chip from './Chip.svelte';

  export let message: Message;
  export let showContextToggle: boolean = true;

  const dispatch = createEventDispatcher<{
    toggleContext: { id: string; inContext: boolean };
  }>();

  // Formatear timestamp
  function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Icono por rol
  function getRoleIcon(role: Message['role']): string {
    const icons = {
      user: '👤',
      assistant: '🤖',
      system: '⚙️'
    };
    return icons[role] || '💬';
  }

  function handleToggleContext() {
    const newValue = !inContext;
    dispatch('toggleContext', { id: message.id, inContext: newValue });
  }

  $: roleIcon = getRoleIcon(message.role);
  $: formattedTime = formatTime(message.timestamp);
  $: hasAttachments = message.attachments && message.attachments.length > 0;
  $: inContext = message.in_context !== false; // Default true si undefined
  $: isManuallyToggled = message.manually_toggled === true;
</script>

<div
  class="message {message.role}"
  class:streaming={message.streaming}
  class:out-of-context={!inContext}
>
  <!-- Context toggle checkbox -->
  {#if showContextToggle && message.role !== 'system'}
    <label
      class="context-toggle"
      title={inContext ? 'En contexto (clic para excluir)' : 'Fuera de contexto (clic para incluir)'}
    >
      <input
        type="checkbox"
        checked={inContext}
        on:change={handleToggleContext}
      />
      <span class="checkmark" class:manual={isManuallyToggled}></span>
    </label>
  {/if}

  <div class="message-content">
    <div class="header">
      <span class="role-icon">{roleIcon}</span>
      <span class="time">{formattedTime}</span>
      {#if message.streaming}
        <span class="streaming-indicator">●</span>
      {/if}
      {#if !inContext}
        <span class="context-badge" title="Este mensaje no se incluirá en el contexto de la IA">⊘</span>
      {/if}
    </div>

    <div class="content">
      {message.content}
      {#if message.streaming && !message.content}
        <span class="typing">...</span>
      {/if}
    </div>

    {#if hasAttachments}
      <div class="attachments">
        {#each message.attachments as attachment (attachment.id)}
          <Chip
            id={attachment.id}
            name={attachment.name}
            type={attachment.type}
            size={attachment.size}
            removable={false}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .message {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    max-width: 85%;
    transition: opacity 0.2s ease, filter 0.2s ease;
  }

  .message-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Context toggle checkbox */
  .context-toggle {
    position: relative;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    margin-top: 0.25rem;
    cursor: pointer;
  }

  .context-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }

  .checkmark {
    position: absolute;
    top: 0;
    left: 0;
    width: 16px;
    height: 16px;
    background: transparent;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    transition: all 0.15s ease;
  }

  .context-toggle:hover .checkmark {
    border-color: rgba(255, 255, 255, 0.6);
  }

  .context-toggle input:checked ~ .checkmark {
    background: var(--color-success, #22c55e);
    border-color: var(--color-success, #22c55e);
  }

  .context-toggle input:checked ~ .checkmark::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 1px;
    width: 4px;
    height: 8px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  /* Indicator for manually toggled */
  .checkmark.manual {
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2);
  }

  /* Out of context styles */
  .message.out-of-context {
    opacity: 0.5;
    filter: grayscale(30%);
  }

  .message.out-of-context .content {
    text-decoration: line-through;
    text-decoration-color: rgba(255, 255, 255, 0.3);
  }

  .context-badge {
    font-size: 0.75rem;
    opacity: 0.7;
    margin-left: auto;
  }

  /* Estilos por rol */
  .message.user {
    align-self: flex-end;
    background: var(--color-user-message, #3b82f6);
    color: white;
    border-bottom-right-radius: 0.125rem;
  }

  .message.assistant {
    align-self: flex-start;
    background: var(--color-surface, rgba(255, 255, 255, 0.1));
    color: var(--color-text, #e5e5e5);
    border-bottom-left-radius: 0.125rem;
  }

  .message.system {
    align-self: center;
    background: var(--color-system-message, rgba(255, 255, 255, 0.05));
    color: var(--color-text-muted, #a3a3a3);
    font-size: 0.875rem;
    max-width: 70%;
    text-align: center;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    opacity: 0.8;
  }

  .role-icon {
    font-size: 0.875rem;
  }

  .time {
    color: inherit;
    opacity: 0.7;
  }

  /* Streaming indicator */
  .streaming-indicator {
    animation: pulse 1s infinite;
    color: var(--color-success, #22c55e);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* Content */
  .content {
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .typing {
    animation: typing 1s infinite;
  }

  @keyframes typing {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* Attachments */
  .attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.25rem;
  }

  /* Streaming state */
  .message.streaming {
    border: 1px solid var(--color-success, #22c55e);
  }
</style>
