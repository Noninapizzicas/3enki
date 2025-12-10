<!--
  TopToolbar.svelte
  Barra superior colapsable para módulos de contexto.

  Uso:
  <TopToolbar bind:expanded>
    <MenuGeneratorButton size="sm" />
    <OtroButton size="sm" />
  </TopToolbar>
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { slide } from 'svelte/transition';

  // Props
  export let expanded = true;
  export let label = 'Herramientas';
  export let persistKey = 'topToolbar.expanded';

  const dispatch = createEventDispatcher<{
    toggle: { expanded: boolean };
  }>();

  // Persistir estado
  onMount(() => {
    if (persistKey && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(persistKey);
      if (saved !== null) {
        expanded = saved === 'true';
      }
    }
  });

  function toggle() {
    expanded = !expanded;
    dispatch('toggle', { expanded });

    if (persistKey && typeof localStorage !== 'undefined') {
      localStorage.setItem(persistKey, String(expanded));
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  }
</script>

<div class="top-toolbar" class:expanded>
  <!-- Toggle button -->
  <button
    class="toggle-btn"
    on:click={toggle}
    on:keydown={handleKeydown}
    aria-expanded={expanded}
    aria-label={expanded ? 'Colapsar barra' : 'Expandir barra'}
  >
    <span class="toggle-icon">{expanded ? '▲' : '▼'}</span>
    <span class="toggle-label">{label}</span>
  </button>

  <!-- Content area -->
  {#if expanded}
    <div class="toolbar-content" transition:slide={{ duration: 200 }}>
      <div class="toolbar-buttons">
        <slot />
      </div>
    </div>
  {/if}
</div>

<style>
  .top-toolbar {
    --_bg: var(--toolbar-bg, var(--color-bg-elevated, #1a1d24));
    --_border: var(--toolbar-border, var(--color-border, #374151));
    --_text: var(--toolbar-text, var(--color-text-secondary, #9ca3af));
    --_radius: var(--toolbar-radius, var(--radius-lg, 12px));

    position: relative;
    background: var(--_bg);
    border-bottom: 1px solid var(--_border);
    z-index: 50;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    color: var(--_text);
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .toggle-btn:hover {
    background: rgb(107 114 128 / 0.1);
  }

  .toggle-btn:focus-visible {
    outline: 2px solid var(--color-primary, #3b82f6);
    outline-offset: -2px;
  }

  .toggle-icon {
    font-size: 0.625rem;
    transition: transform 0.2s ease;
  }

  .toggle-label {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }

  .toolbar-content {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--_border);
  }

  .toolbar-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
  }

  /* Responsive */
  @media (min-width: 640px) {
    .toolbar-buttons {
      justify-content: flex-start;
    }
  }

  /* Cuando está colapsado, el toggle se hace más discreto */
  .top-toolbar:not(.expanded) .toggle-btn {
    padding: 0.375rem 1rem;
  }
</style>
