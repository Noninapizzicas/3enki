<script lang="ts">
  /**
   * PedidoItem — Item completo en la lista del pedido
   * Muestra: cantidad, nombre, tipo, variaciones detalladas,
   *          mitad/mitad (ambas pizzas), al gusto (ingredientes),
   *          notas, precio unitario y subtotal
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
    return precio.toFixed(2) + ' \u20AC';
  }

  // Extraer variaciones legibles (soporta array legacy y objeto nuevo)
  $: variacionesTexto = extractVariacionesTexto(item.variaciones);

  function extractVariacionesTexto(v: any): string[] {
    if (!v) return [];

    // Formato nuevo (objeto): { ingredientes_quitar: string[], ingredientes_anadir: [{nombre, ...}] }
    if (!Array.isArray(v) && typeof v === 'object') {
      const textos: string[] = [];
      if (Array.isArray(v.ingredientes_quitar)) {
        for (const nombre of v.ingredientes_quitar) {
          textos.push(`sin ${nombre}`);
        }
      }
      if (Array.isArray(v.ingredientes_anadir)) {
        for (const ing of v.ingredientes_anadir) {
          const nombre = typeof ing === 'string' ? ing : ing.nombre;
          if (nombre) textos.push(`+ ${nombre}`);
        }
      }
      return textos;
    }

    // Formato legacy (array): [{ tipo: 'quitar'|'anadir', nombre|ingrediente_id }]
    if (Array.isArray(v)) {
      return v.map((vi: any) => {
        if (vi.tipo === 'quitar') return `sin ${vi.nombre || vi.ingrediente_id}`;
        if (vi.tipo === 'anadir') return `+ ${vi.nombre || vi.ingrediente_id}`;
        return vi.nombre || vi.ingrediente_id || '';
      }).filter(Boolean);
    }

    return [];
  }

  $: tieneDetalle = variacionesTexto.length > 0
    || item.notas
    || item.tipo === 'mitad_mitad'
    || item.tipo === 'al_gusto';
</script>

<div
  class="pedido-item"
  class:mitad-mitad={item.tipo === 'mitad_mitad'}
  class:al-gusto={item.tipo === 'al_gusto'}
>
  <!-- Fila principal: cantidad + nombre + acciones + precio -->
  <div class="row-main">
    <div class="item-left">
      <span class="cantidad">{item.cantidad}x</span>
      {#if item.tipo === 'mitad_mitad'}
        <span class="tipo-badge mitad">MITAD</span>
      {:else if item.tipo === 'al_gusto'}
        <span class="tipo-badge gusto">AL GUSTO</span>
      {/if}
      <span class="nombre">{item.nombre}</span>
    </div>

    <div class="item-right">
      <div class="item-actions">
        <button
          class="qty-btn"
          on:click={() => dispatch('decrement', { item_id: item.id })}
          disabled={item.cantidad <= 1}
        >-</button>
        <button
          class="qty-btn"
          on:click={() => dispatch('increment', { item_id: item.id })}
        >+</button>
        <button
          class="delete-btn"
          on:click={() => dispatch('remove', { item_id: item.id })}
        >x</button>
      </div>
      <span class="item-subtotal">{formatPrecio(item.subtotal)}</span>
    </div>
  </div>

  <!-- Detalle: variaciones, mitad/mitad, al gusto, notas -->
  {#if tieneDetalle}
    <div class="row-detail">
      {#if item.tipo === 'mitad_mitad' && item.pizza_izquierda && item.pizza_derecha}
        <span class="detail-line mitad-detail">
          {item.pizza_izquierda.nombre} | {item.pizza_derecha.nombre}
        </span>
      {/if}

      {#if item.tipo === 'al_gusto' && item.ingredientes?.length}
        <span class="detail-line ingredientes-detail">
          {item.ingredientes.map((i: any) => i.nombre).join(', ')}
        </span>
      {/if}

      {#if variacionesTexto.length > 0}
        {#each variacionesTexto as v}
          <span class="detail-line variacion-detail">{v}</span>
        {/each}
      {/if}

      {#if item.notas}
        <span class="detail-line notas-detail">Nota: {item.notas}</span>
      {/if}

      {#if item.cantidad > 1}
        <span class="detail-line precio-unit">c/u {formatPrecio(item.precio)}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .pedido-item {
    display: flex;
    flex-direction: column;
    padding: 8px 10px;
    background: #161616;
    border-radius: 8px;
    border: 1px solid #222;
    gap: 4px;
  }

  .row-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .item-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .cantidad {
    font-size: 0.9rem;
    font-weight: 800;
    color: #6366f1;
    flex-shrink: 0;
  }

  .nombre {
    font-size: 0.9rem;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tipo-badge {
    font-size: 0.55rem;
    font-weight: 800;
    padding: 2px 4px;
    border-radius: 3px;
    flex-shrink: 0;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .tipo-badge.mitad {
    background: rgba(139, 92, 246, 0.25);
    color: #a78bfa;
    border: 1px solid rgba(139, 92, 246, 0.4);
  }

  .tipo-badge.gusto {
    background: rgba(236, 72, 153, 0.25);
    color: #f472b6;
    border: 1px solid rgba(236, 72, 153, 0.4);
  }

  .pedido-item.mitad-mitad {
    border-color: rgba(139, 92, 246, 0.3);
  }

  .pedido-item.al-gusto {
    border-color: rgba(236, 72, 153, 0.3);
  }

  .item-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .item-actions {
    display: flex;
    gap: 3px;
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
    font-size: 0.9rem;
    font-weight: 800;
    color: #fff;
    font-variant-numeric: tabular-nums;
    min-width: 55px;
    text-align: right;
  }

  /* Detalle */
  .row-detail {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 8px;
    padding-left: 30px;
  }

  .detail-line {
    font-size: 0.7rem;
    line-height: 1.3;
  }

  .mitad-detail {
    color: #a78bfa;
    font-weight: 600;
  }

  .ingredientes-detail {
    color: #f472b6;
  }

  .variacion-detail {
    color: #f59e0b;
  }

  .notas-detail {
    color: #60a5fa;
    font-style: italic;
  }

  .precio-unit {
    color: #555;
  }
</style>
