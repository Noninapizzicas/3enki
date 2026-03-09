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
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    background: color-mix(in srgb, var(--cat-color) 12%, #1a1a1a);
    color: #bbb;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, box-shadow 0.15s;
    border: 2px solid color-mix(in srgb, var(--cat-color) 25%, transparent);
    -webkit-tap-highlight-color: transparent;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .categoria-btn:active {
    background: color-mix(in srgb, var(--cat-color) 25%, #1a1a1a);
  }

  .categoria-btn.active {
    background: color-mix(in srgb, var(--cat-color) 30%, #111);
    color: #fff;
    border-color: var(--cat-color);
    box-shadow: 0 0 8px color-mix(in srgb, var(--cat-color) 40%, transparent);
  }

  .icon {
    font-size: 1rem;
    line-height: 1;
  }

  .nombre {
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 80px;
  }

  @media (max-width: 600px) {
    .categoria-btn {
      padding: 4px 8px;
      gap: 3px;
      border-radius: 5px;
      font-size: 0.6rem;
    }
    .icon { font-size: 0.85rem; }
    .nombre { max-width: 60px; }
  }
</style>
