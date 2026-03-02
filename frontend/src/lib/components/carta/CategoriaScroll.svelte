<script lang="ts">
  /**
   * CategoriaScroll — Selector horizontal de categorias
   *
   * Scroll touch-friendly, estilo pills.
   * Incluye boton "Todas" para ver toda la carta.
   */
  import { createEventDispatcher } from 'svelte';
  import type { Categoria } from '$lib/stores/carta';

  export let categorias: Categoria[] = [];
  export let activa: string | null = null;

  const dispatch = createEventDispatcher<{
    select: string;
    all: void;
  }>();
</script>

<nav class="cat-scroll">
  <div class="cat-track">
    <button
      class="cat-pill"
      class:active={activa === null}
      on:click={() => dispatch('all')}
    >
      Todas
    </button>
    {#each categorias as cat (cat.id)}
      <button
        class="cat-pill"
        class:active={activa === cat.id}
        on:click={() => dispatch('select', cat.id)}
      >
        {#if cat.icon}
          <span class="cat-icon">{cat.icon}</span>
        {/if}
        {cat.nombre}
      </button>
    {/each}
  </div>
</nav>

<style>
  .cat-scroll {
    background: #111;
    border-bottom: 1px solid #1a1a1a;
    overflow: hidden;
  }

  .cat-track {
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .cat-track::-webkit-scrollbar {
    display: none;
  }

  .cat-pill {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    border: 1px solid #2a2a2a;
    border-radius: 20px;
    background: transparent;
    color: #888;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .cat-pill:hover {
    border-color: #444;
    color: #bbb;
  }

  .cat-pill.active {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
  }

  .cat-pill:active {
    transform: scale(0.95);
  }

  .cat-icon {
    font-size: 0.9rem;
  }
</style>
