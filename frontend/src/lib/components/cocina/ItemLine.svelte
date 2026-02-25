<script lang="ts">
  /**
   * ItemLine — Línea de item en la tarjeta de pedido cocina
   *
   * Tap toggle: pendiente → preparando → listo
   * Target mínimo 60px para manos con harina
   * Texto grande legible a 2m
   */
  import { createEventDispatcher } from 'svelte';
  import type { ItemCocina, EstadoItem } from '$lib/stores/cocina';
  import { ESTADO_ITEM_COLORS } from '$lib/stores/cocina';

  export let item: ItemCocina;

  const dispatch = createEventDispatcher<{
    'tap': { item_id: string };
  }>();

  $: color = ESTADO_ITEM_COLORS[item.estado];
  $: isListo = item.estado === 'listo';
  $: isPreparando = item.estado === 'preparando';

  $: variacionesText = buildVariaciones(item);

  function buildVariaciones(item: ItemCocina): string[] {
    const lines: string[] = [];

    // Mitad-mitad
    if (item.tipo === 'mitad_mitad' && item.pizza_izquierda && item.pizza_derecha) {
      lines.push(`IZQ: ${item.pizza_izquierda}`);
      lines.push(`DER: ${item.pizza_derecha}`);
    }

    // Ingredientes extra / quitar
    if (item.variaciones) {
      if (item.variaciones.ingredientes_quitar?.length) {
        for (const ing of item.variaciones.ingredientes_quitar) {
          lines.push(`SIN ${ing.toUpperCase()}`);
        }
      }
      if (item.variaciones.ingredientes_anadir?.length) {
        for (const ing of item.variaciones.ingredientes_anadir) {
          const nombre = typeof ing === 'string' ? ing : ing.nombre;
          lines.push(`+ ${nombre.toUpperCase()}`);
        }
      }
    }

    // Notas
    if (item.notas) {
      lines.push(`>> ${item.notas}`);
    }

    return lines;
  }

  function handleTap() {
    if (!isListo) {
      dispatch('tap', { item_id: item.item_id });
    }
  }
</script>

<button
  class="item-line"
  class:listo={isListo}
  class:preparando={isPreparando}
  style="--item-color: {color}"
  on:click={handleTap}
  disabled={isListo}
>
  <div class="item-state">
    {#if isListo}
      <span class="check">&#10003;</span>
    {:else if isPreparando}
      <span class="fire">&#9711;</span>
    {:else}
      <span class="dot">&#9679;</span>
    {/if}
  </div>

  <div class="item-info">
    <div class="item-main">
      <span class="qty">{item.cantidad}x</span>
      <span class="name">{item.nombre}</span>
    </div>
    {#if variacionesText.length > 0}
      <div class="item-variaciones">
        {#each variacionesText as line}
          <span class="variacion">{line}</span>
        {/each}
      </div>
    {/if}
  </div>
</button>

<style>
  .item-line {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    min-height: 60px;
    padding: 10px 14px;
    border: none;
    border-left: 4px solid var(--item-color);
    background: transparent;
    color: #f8fafc;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, opacity 0.3s;
    -webkit-tap-highlight-color: transparent;
  }

  .item-line:not(.listo):active {
    background: rgba(255, 255, 255, 0.05);
  }

  .item-line.listo {
    opacity: 0.4;
    cursor: default;
    text-decoration: line-through;
    text-decoration-color: #22c55e;
  }

  .item-line.preparando {
    background: rgba(234, 179, 8, 0.08);
  }

  .item-state {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .check {
    font-size: 1.4rem;
    color: #22c55e;
    font-weight: 800;
  }

  .fire {
    font-size: 1.2rem;
    color: #eab308;
    animation: spin-slow 2s linear infinite;
  }

  .dot {
    font-size: 0.8rem;
    color: #64748b;
  }

  .item-info {
    flex: 1;
    min-width: 0;
  }

  .item-main {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .qty {
    font-size: 2rem;
    font-weight: 800;
    color: var(--item-color);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .name {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.1;
    word-break: break-word;
  }

  .item-variaciones {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 4px;
    padding-left: 4px;
  }

  .variacion {
    font-size: 1.1rem;
    color: #fbbf24;
    font-weight: 600;
  }

  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 600px) {
    .qty { font-size: 1.5rem; }
    .name { font-size: 1.2rem; }
    .variacion { font-size: 0.9rem; }
  }
</style>
