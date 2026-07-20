<script lang="ts">
  /**
   * ProductoGrid — categorías del proyector + rejilla de productos.
   * No asume "carta de pizza": pinta las categorías que hay y los productos de la activa.
   */
  import { createEventDispatcher } from 'svelte';
  import type { VistaProducto, VistaCategoria } from './tipos';
  import ProductoCard from './ProductoCard.svelte';

  export let categorias: VistaCategoria[] = [];
  export let productos: VistaProducto[] = [];
  export let categoriaActiva: string | null = null;

  const dispatch = createEventDispatcher<{
    categoria: string;
    add: VistaProducto;
    personalizar: VistaProducto;
  }>();

  $: visibles = categoriaActiva
    ? productos.filter(p => p.categoria_id === categoriaActiva)
    : productos;
</script>

{#if categorias.length}
  <nav class="cats">
    {#each categorias as c (c.id)}
      <button class:on={c.id === categoriaActiva} on:click={() => dispatch('categoria', c.id)}>{c.nombre}</button>
    {/each}
  </nav>
{/if}

<div class="grid">
  {#each visibles as p (p.id)}
    <ProductoCard producto={p} on:add on:personalizar />
  {:else}
    <p class="vacio">Sin productos en esta categoría</p>
  {/each}
</div>

<style>
  .cats {
    display: flex; gap: .4rem; overflow-x: auto;
    padding: .6rem 1rem; border-bottom: 1px solid var(--color-border, rgba(255,255,255,.09));
    scrollbar-width: none;
  }
  .cats::-webkit-scrollbar { display: none; }
  .cats button {
    flex: 0 0 auto; border: 1px solid var(--color-border, rgba(255,255,255,.09));
    background: var(--color-surface, rgba(255,255,255,.05)); color: var(--color-text-muted, #94aaa3);
    font-weight: 600; font-size: .85rem; padding: .35rem .8rem; border-radius: 999px; cursor: pointer;
  }
  .cats button.on {
    background: var(--color-primary, #14b8a6); color: var(--color-text-inverse, #04120e);
    border-color: var(--color-primary, #14b8a6);
  }
  .grid {
    flex: 1; overflow-y: auto; padding: .8rem;
    display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; align-content: start;
  }
  .vacio { grid-column: 1 / -1; text-align: center; color: var(--color-text-muted, #94aaa3); padding: 1rem; }
</style>
