<script lang="ts">
  /**
   * CategoriaBtn — Botón de categoría en sidebar
   */
  import { createEventDispatcher } from 'svelte';

  export let id: string;
  export let nombre: string;
  export let icon: string = '';
  export let color: string = '#333';
  export let active: boolean = false;

  const dispatch = createEventDispatcher<{
    select: { id: string };
  }>();

  function handleClick() {
    dispatch('select', { id });
  }
</script>

<button
  class="categoria-btn"
  class:active
  style="--cat-color: {color}"
  on:click={handleClick}
>
  {#if icon}
    <span class="icon">{icon}</span>
  {/if}
  <span class="nombre">{nombre}</span>
</button>

<style>
  .categoria-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    padding: 10px 6px;
    border: none;
    border-radius: 8px;
    background: #1a1a1a;
    color: #aaa;
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    border: 2px solid transparent;
    -webkit-tap-highlight-color: transparent;
  }

  .categoria-btn:active {
    background: #222;
  }

  .categoria-btn.active {
    background: color-mix(in srgb, var(--cat-color) 15%, #111);
    color: var(--cat-color);
    border-color: var(--cat-color);
  }

  .icon {
    font-size: 1.2rem;
    line-height: 1;
  }

  .nombre {
    text-align: center;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  @media (max-width: 600px) {
    .categoria-btn {
      padding: 6px 4px;
      gap: 2px;
      border-radius: 6px;
      font-size: 0.6rem;
    }
    .icon { font-size: 0.9rem; }
    .nombre { -webkit-line-clamp: 1; }
  }
</style>
