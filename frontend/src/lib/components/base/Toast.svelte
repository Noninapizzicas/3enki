<script lang="ts">
  /**
   * Toast - Notificación temporal
   *
   * Features:
   * - Auto-dismiss configurable
   * - Tipos: info, success, warning, error
   * - Animación entrada/salida
   * - Click para cerrar
   */

  import { createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';

  export let id: string;
  export let type: 'info' | 'success' | 'warning' | 'error' = 'info';
  export let message: string;

  const dispatch = createEventDispatcher<{ dismiss: string }>();

  const icons = {
    info: 'i',
    success: '✓',
    warning: '!',
    error: '✕'
  };

  function handleClick() {
    dispatch('dismiss', id);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      dispatch('dismiss', id);
    }
  }
</script>

<div
  class="toast toast-{type}"
  role="alert"
  tabindex="0"
  on:click={handleClick}
  on:keydown={handleKeydown}
  in:fly={{ x: 100, duration: 200 }}
  out:fade={{ duration: 150 }}
>
  <span class="icon">{icons[type]}</span>
  <span class="message">{message}</span>
  <button class="close" on:click|stopPropagation={handleClick} title="Cerrar">
    ✕
  </button>
</div>

<style>
  .toast {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--color-surface, #262626);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    max-width: 360px;
    border-left: 3px solid;
  }

  .toast-info {
    border-left-color: #3b82f6;
  }

  .toast-success {
    border-left-color: #22c55e;
  }

  .toast-warning {
    border-left-color: #eab308;
  }

  .toast-error {
    border-left-color: #ef4444;
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .toast-info .icon {
    background: rgba(59, 130, 246, 0.2);
    color: #3b82f6;
  }

  .toast-success .icon {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .toast-warning .icon {
    background: rgba(234, 179, 8, 0.2);
    color: #eab308;
  }

  .toast-error .icon {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .message {
    flex: 1;
    font-size: 0.875rem;
    color: var(--color-text, #e5e5e5);
    line-height: 1.4;
  }

  .close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-muted, #a3a3a3);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.625rem;
    opacity: 0.6;
    transition: opacity 0.15s;
  }

  .close:hover {
    opacity: 1;
  }

  .toast:hover {
    background: var(--color-surface-hover, #2a2a2a);
  }
</style>
