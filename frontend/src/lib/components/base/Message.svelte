<script lang="ts">
  /**
   * Message - Componente de mensaje de chat
   *
   * Features:
   * - Estilos diferenciados por rol (user, assistant, system)
   * - Timestamp formateado
   * - Adjuntos inline
   * - Indicador de streaming
   * - Soporte markdown (futuro)
   */

  import type { Message, Attachment } from '$lib/ui-core';
  import Chip from './Chip.svelte';

  export let message: Message;

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

  $: roleIcon = getRoleIcon(message.role);
  $: formattedTime = formatTime(message.timestamp);
  $: hasAttachments = message.attachments && message.attachments.length > 0;
</script>

<div class="message {message.role}" class:streaming={message.streaming}>
  <div class="header">
    <span class="role-icon">{roleIcon}</span>
    <span class="time">{formattedTime}</span>
    {#if message.streaming}
      <span class="streaming-indicator">●</span>
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

<style>
  .message {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    max-width: 85%;
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
