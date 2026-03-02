<script lang="ts">
  /**
   * ProductoCard — Tarjeta de producto para carta digital
   *
   * Dual-zone (como ProductoBtn del comandero):
   * - Zona principal (izq): muestra info, tap → detalle
   * - Zona derecha: si tiene variaciones → abre panel variaciones
   *                 si no → añade directo al carrito
   */
  import { createEventDispatcher } from 'svelte';
  import type { Producto } from '$lib/stores/carta';

  export let producto: Producto;

  const dispatch = createEventDispatcher<{
    info: Producto;
    variaciones: Producto;
    add: Producto;
  }>();

  $: tieneVariaciones = producto.tiene_variaciones ||
    (producto.ingredientes_base && producto.ingredientes_base.length > 0) ||
    (producto.ingredientes && producto.ingredientes.length > 0);

  $: ingredientesPreview = getIngredientesPreview(producto);
  $: badges = getBadges(producto);

  function getIngredientesPreview(prod: Producto): string {
    const ings = prod.ingredientes_base || prod.ingredientes || [];
    const nombres = ings.slice(0, 5).map((i: any) => i.emoji ? `${i.emoji}` : i.nombre?.slice(0, 8));
    if (ings.length > 5) nombres.push('...');
    return nombres.join(' ');
  }

  function getBadges(prod: Producto): string[] {
    const b: string[] = [];
    // From enrichment tags
    if (prod.tags?.includes('vegano') || prod.metadata?.vegano) b.push('Vegano');
    else if (prod.tags?.includes('vegetariano') || prod.metadata?.vegetariano) b.push('Vegetariano');
    if (prod.tags?.includes('picante')) b.push('Picante');
    if (prod.tags?.includes('popular')) b.push('Popular');
    if (prod.tags?.includes('nuevo')) b.push('Nuevo');
    if (prod.tags?.includes('premium')) b.push('Premium');
    return b;
  }

  function handleInfoClick() {
    dispatch('info', producto);
  }

  function handleActionClick(e: Event) {
    e.stopPropagation();
    if (tieneVariaciones) {
      dispatch('variaciones', producto);
    } else {
      dispatch('add', producto);
    }
  }

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' \u20ac';
  }
</script>

<div class="card" on:click={handleInfoClick} on:keydown={(e) => e.key === 'Enter' && handleInfoClick()} role="button" tabindex="0">
  <!-- Imagen / Placeholder -->
  <div class="card-visual">
    {#if producto.imagen}
      <img src={producto.imagen} alt={producto.nombre} class="card-img" />
    {:else}
      <div class="card-placeholder">
        <span class="placeholder-emoji">{producto.emoji || '🍕'}</span>
      </div>
    {/if}

    {#if badges.length > 0}
      <div class="badges">
        {#each badges as badge}
          <span class="badge">{badge}</span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Info -->
  <div class="card-body">
    <span class="card-nombre">{producto.emoji || ''} {producto.nombre}</span>
    {#if producto.descripcion}
      <span class="card-descripcion">{producto.descripcion}</span>
    {:else if ingredientesPreview}
      <span class="card-ingredientes">{ingredientesPreview}</span>
    {/if}
  </div>

  <!-- Footer: precio + action -->
  <div class="card-footer">
    <span class="card-precio">{formatPrecio(producto.precio)}</span>
    <button class="card-action" on:click={handleActionClick} title={tieneVariaciones ? 'Personalizar' : 'Añadir'}>
      {#if tieneVariaciones}
        <span class="action-icon">+</span>
      {:else}
        <span class="action-icon">+</span>
      {/if}
    </button>
  </div>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    background: #151515;
    border: 1px solid #252525;
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.1s;
    -webkit-tap-highlight-color: transparent;
  }

  .card:hover {
    border-color: #333;
  }

  .card:active {
    transform: scale(0.97);
  }

  /* Visual */
  .card-visual {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #1a1a1a;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #1a1a1a 0%, #222 100%);
  }

  .placeholder-emoji {
    font-size: 2.5rem;
    opacity: 0.6;
  }

  .badges {
    position: absolute;
    top: 6px;
    left: 6px;
    display: flex;
    gap: 4px;
  }

  .badge {
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(34, 197, 94, 0.85);
    color: #fff;
    font-size: 0.5rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Body */
  .card-body {
    padding: 10px 10px 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-nombre {
    font-size: 0.85rem;
    font-weight: 700;
    color: #e5e5e5;
    line-height: 1.2;
  }

  .card-descripcion {
    font-size: 0.7rem;
    color: #999;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-ingredientes {
    font-size: 0.65rem;
    color: #666;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Footer */
  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px 10px;
    margin-top: auto;
  }

  .card-precio {
    font-size: 0.95rem;
    font-weight: 800;
    color: #f59e0b;
    font-variant-numeric: tabular-nums;
  }

  .card-action {
    width: 30px;
    height: 30px;
    border: 2px solid #333;
    border-radius: 50%;
    background: transparent;
    color: #f59e0b;
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .card-action:hover {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }

  .card-action:active {
    transform: scale(0.9);
    background: #f59e0b;
    color: #000;
  }

  .action-icon {
    line-height: 1;
  }
</style>
