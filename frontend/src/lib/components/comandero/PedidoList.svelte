<script lang="ts">
  /**
   * PedidoList — Lista de items del pedido actual
   * Anclada abajo, scroll hacia arriba
   */
  import { createEventDispatcher } from 'svelte';
  import type { PedidoItem as PedidoItemType } from '$lib/stores/comandero';
  import PedidoItem from './PedidoItem.svelte';

  export let items: PedidoItemType[] = [];
  export let total: number = 0;

  const dispatch = createEventDispatcher<{
    'increment': { item_id: string };
    'decrement': { item_id: string };
    'remove': { item_id: string };
  }>();

  function formatTotal(total: number): string {
    return total.toFixed(2) + ' €';
  }
</script>

<div class="pedido-list">
  {#if items.length === 0}
    <div class="empty">
      <span class="empty-icon">🛒</span>
      <span class="empty-text">Pedido vacío</span>
    </div>
  {:else}
    <div class="items-scroll">
      {#each items as item (item.id)}
        <PedidoItem
          {item}
          on:increment
          on:decrement
          on:remove
        />
      {/each}
    </div>
    <div class="total-bar">
      <span class="total-label">Total</span>
      <span class="total-amount">{formatTotal(total)}</span>
    </div>
  {/if}
</div>

<style>
  .pedido-list {
    display: flex;
    flex-direction: column;
    background: #111;
    border-top: 1px solid #2a2a2a;
    max-height: 35vh;
    min-height: 80px;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    color: #555;
  }

  .empty-icon {
    font-size: 1.2rem;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 0.8rem;
  }

  .items-scroll {
    flex: 1;
    display: flex;
    flex-direction: column-reverse; /* items nuevos abajo, scroll hacia arriba */
    gap: 6px;
    padding: 8px 10px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .total-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: #1a1a1a;
    border-top: 1px solid #2a2a2a;
    flex-shrink: 0;
  }

  .total-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .total-amount {
    font-size: 1.2rem;
    font-weight: 800;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
</style>
