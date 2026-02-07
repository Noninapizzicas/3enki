<script lang="ts">
  /**
   * PedidoItem — Item en la lista del pedido
   * Muestra: nombre, cantidad, precio, subtotal
   * Acciones: +, -, borrar
   */
  import { createEventDispatcher } from 'svelte';
  import type { PedidoItem as PedidoItemType } from '$lib/stores/comandero';

  export let item: PedidoItemType;

  const dispatch = createEventDispatcher<{
    'increment': { item_id: string };
    'decrement': { item_id: string };
    'remove': { item_id: string };
  }>();

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' €';
  }
</script>

<div class="pedido-item">
  <div class="item-info">
    <span class="cantidad">{item.cantidad}x</span>
    <span class="nombre">{item.nombre}</span>
    {#if item.variaciones?.length}
      <span class="variaciones">({item.variaciones.length} var.)</span>
    {/if}
  </div>

  <div class="item-actions">
    <button
      class="qty-btn"
      on:click={() => dispatch('decrement', { item_id: item.id })}
      disabled={item.cantidad <= 1}
    >−</button>
    <button
      class="qty-btn"
      on:click={() => dispatch('increment', { item_id: item.id })}
    >+</button>
    <button
      class="delete-btn"
      on:click={() => dispatch('remove', { item_id: item.id })}
    >✕</button>
  </div>

  <div class="item-subtotal">
    {formatPrecio(item.subtotal)}
  </div>
</div>

<style>
  .pedido-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: #161616;
    border-radius: 6px;
    border: 1px solid #222;
  }

  .item-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .cantidad {
    font-size: 0.85rem;
    font-weight: 700;
    color: #6366f1;
    flex-shrink: 0;
  }

  .nombre {
    font-size: 0.8rem;
    font-weight: 500;
    color: #e5e5e5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .variaciones {
    font-size: 0.65rem;
    color: #666;
    flex-shrink: 0;
  }

  .item-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .qty-btn, .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.1s;
    -webkit-tap-highlight-color: transparent;
  }

  .qty-btn {
    background: #2a2a2a;
    color: #aaa;
  }

  .qty-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .qty-btn:active:not(:disabled) {
    background: #3a3a3a;
  }

  .delete-btn {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  .delete-btn:active {
    background: rgba(239, 68, 68, 0.3);
  }

  .item-subtotal {
    font-size: 0.85rem;
    font-weight: 700;
    color: #fff;
    font-variant-numeric: tabular-nums;
    min-width: 60px;
    text-align: right;
  }
</style>
