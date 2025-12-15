<script lang="ts">
  /**
   * WorkBar - Barra superior plegable (SIMPLIFICADO)
   */

  import { workBarExpanded, toggleWorkBar } from '$lib/stores';
</script>

<div class="workbar" class:collapsed={!$workBarExpanded}>
  {#if $workBarExpanded}
    <div class="content">
      <span class="title">Event Core</span>
    </div>
  {/if}

  <button class="toggle" on:click={toggleWorkBar} title={$workBarExpanded ? 'Plegar' : 'Expandir'}>
    {$workBarExpanded ? '▲' : '▼'}
  </button>
</div>

<style>
  .workbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--color-bar-bg, rgba(0, 0, 0, 0.3));
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    min-height: 3rem;
    transition: min-height 0.2s;
  }

  .workbar.collapsed {
    min-height: 2rem;
    padding: 0.25rem 1rem;
  }

  .content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-muted, #a3a3a3);
  }

  .toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-muted, #a3a3a3);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.75rem;
    transition: background-color 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .toggle:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
    color: var(--color-text, #e5e5e5);
  }
</style>
