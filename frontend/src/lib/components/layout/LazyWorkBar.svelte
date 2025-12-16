<script lang="ts">
  /**
   * LazyWorkBar - Barra de trabajo con carga bajo demanda
   *
   * Solo muestra íconos de las definiciones.
   * Al hacer click, carga el módulo correspondiente.
   */
  import { workBarDefinitions, moduleLoadState } from '$lib/ui-core/lazy-registry';
  import LazyButton from '$lib/components/base/LazyButton.svelte';

  let expanded = true;

  function toggleExpand() {
    expanded = !expanded;
  }
</script>

<div class="workbar" class:collapsed={!expanded}>
  <div class="workbar-content">
    {#each $workBarDefinitions as def (def.id)}
      <LazyButton
        definition={def}
        size="md"
        showLabel={expanded}
        on:loaded={(e) => console.log('[WorkBar] Loaded:', e.detail.id)}
      />
    {/each}
  </div>

  <button class="toggle-btn" on:click={toggleExpand} title={expanded ? 'Colapsar' : 'Expandir'}>
    {expanded ? '▲' : '▼'}
  </button>
</div>

<style>
  .workbar {
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    background: var(--color-bg-elevated, #1a1a1a);
    border-bottom: 1px solid var(--color-border, #333);
    gap: 0.5rem;
    transition: padding 0.2s ease;
  }

  .workbar.collapsed {
    padding: 0.25rem 1rem;
  }

  .workbar-content {
    display: flex;
    flex: 1;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .collapsed .workbar-content {
    gap: 0.25rem;
  }

  .toggle-btn {
    background: transparent;
    border: none;
    color: var(--color-text-muted, #666);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border-radius: 0.25rem;
    transition: color 0.15s;
  }

  .toggle-btn:hover {
    color: var(--color-text, #e5e5e5);
    background: var(--color-bg-hover, rgba(255,255,255,0.05));
  }
</style>
