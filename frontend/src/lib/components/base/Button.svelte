<script lang="ts">
  /**
   * Button - Botón reutilizable con icono dinámico
   *
   * Features:
   * - Icono (emoji o clase)
   * - Badge opcional
   * - Estados: active, disabled
   * - Tamaños: sm, md, lg
   */

  import Badge from './Badge.svelte';

  export let icon: string;
  export let label: string = '';
  export let badge: string | number | null = null;
  export let active: boolean = false;
  export let disabled: boolean = false;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let title: string = '';

  // Classes dinámicas
  $: sizeClass = {
    sm: 'btn-sm',
    md: 'btn-md',
    lg: 'btn-lg'
  }[size];
</script>

<button
  class="ui-button {sizeClass}"
  class:active
  class:disabled
  {disabled}
  title={title || label}
  on:click
>
  <span class="icon">{icon}</span>

  {#if label}
    <span class="label">{label}</span>
  {/if}

  {#if badge !== null}
    <Badge value={badge} />
  {/if}
</button>

<style>
  .ui-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    border: none;
    background: transparent;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    border-radius: 0.375rem;
    transition: background-color 0.15s, transform 0.1s;
    position: relative;
  }

  .ui-button:hover:not(.disabled) {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .ui-button:active:not(.disabled) {
    transform: scale(0.95);
  }

  .ui-button.active {
    background: var(--color-active, rgba(255, 255, 255, 0.15));
  }

  .ui-button.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Tamaños */
  .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
  }

  .btn-sm .icon {
    font-size: 1rem;
  }

  .btn-md {
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
  }

  .btn-md .icon {
    font-size: 1.25rem;
  }

  .btn-lg {
    padding: 0.75rem 1rem;
    font-size: 1.125rem;
  }

  .btn-lg .icon {
    font-size: 1.5rem;
  }

  .icon {
    line-height: 1;
  }

  .label {
    font-size: 0.75em;
    opacity: 0.9;
  }
</style>
