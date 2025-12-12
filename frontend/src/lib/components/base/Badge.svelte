<script lang="ts">
  /**
   * Badge - Indicador visual para contadores y estados
   *
   * Features:
   * - Número o texto corto
   * - Variantes de color: default, success, warning, error
   * - Posición absoluta o inline
   */

  export let value: string | number | null = null;
  export let variant: 'default' | 'success' | 'warning' | 'error' = 'default';
  export let dot: boolean = false;
  export let position: 'inline' | 'top-right' = 'inline';

  $: displayValue = typeof value === 'number' && value > 99 ? '99+' : value;
  $: isEmpty = value === null || value === '' || value === 0;
</script>

{#if !isEmpty || dot}
  <span
    class="badge {variant}"
    class:dot
    class:positioned={position === 'top-right'}
  >
    {#if !dot && displayValue !== null}
      {displayValue}
    {/if}
  </span>
{/if}

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding: 0 0.375rem;
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 1;
    border-radius: 9999px;
    background: var(--color-badge, #3b82f6);
    color: white;
  }

  .badge.positioned {
    position: absolute;
    top: -0.25rem;
    right: -0.25rem;
  }

  /* Dot mode (sin número) */
  .badge.dot {
    min-width: 0.5rem;
    width: 0.5rem;
    height: 0.5rem;
    padding: 0;
  }

  /* Variantes */
  .badge.default {
    background: var(--color-primary, #3b82f6);
  }

  .badge.success {
    background: var(--color-success, #22c55e);
  }

  .badge.warning {
    background: var(--color-warning, #f59e0b);
  }

  .badge.error {
    background: var(--color-error, #ef4444);
  }
</style>
