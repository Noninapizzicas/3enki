<script lang="ts">
  /**
   * ProductoBtn — Botón de producto en grid
   *
   * Productos CON variaciones: doble zona táctil
   *   - Izquierda → añade producto íntegro
   *   - Derecha → abre flotante variaciones
   *
   * Productos SIN variaciones: tap en cualquier sitio añade directo
   */
  import { createEventDispatcher } from 'svelte';
  import type { Producto } from '$lib/stores/comandero';

  export let producto: Producto;

  const dispatch = createEventDispatcher<{
    'add': { producto: Producto };
    'variaciones': { producto: Producto };
  }>();

  function handleLeftTap() {
    dispatch('add', { producto });
  }

  function handleRightTap() {
    dispatch('variaciones', { producto });
  }

  function handleTap() {
    dispatch('add', { producto });
  }

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' €';
  }
</script>

<div class="producto-btn" class:has-variaciones={producto.tiene_variaciones}>
  {#if producto.tiene_variaciones}
    <!-- Doble zona -->
    <button class="zone zone-left" on:click={handleLeftTap} title="Añadir íntegro">
      <span class="nombre">{producto.nombre}</span>
      <span class="precio">{formatPrecio(producto.precio)}</span>
    </button>
    <button class="zone zone-right" on:click={handleRightTap} title="Variaciones">
      <span class="var-icon">+/-</span>
    </button>
  {:else}
    <!-- Zona única -->
    <button class="zone zone-full" on:click={handleTap}>
      <span class="nombre">{producto.nombre}</span>
      <span class="precio">{formatPrecio(producto.precio)}</span>
    </button>
  {/if}
</div>

<style>
  .producto-btn {
    display: flex;
    min-height: 70px;
    border-radius: 10px;
    overflow: hidden;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    transition: border-color 0.15s;
  }

  .producto-btn:hover {
    border-color: #444;
  }

  .zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px 6px;
    border: none;
    background: transparent;
    color: #e5e5e5;
    cursor: pointer;
    transition: background 0.1s;
    -webkit-tap-highlight-color: transparent;
  }

  .zone:active {
    background: rgba(255, 255, 255, 0.08);
  }

  .zone-full {
    flex: 1;
    width: 100%;
  }

  .zone-left {
    flex: 1;
    border-right: 1px solid #2a2a2a;
  }

  .zone-right {
    width: 44px;
    flex-shrink: 0;
    background: rgba(99, 102, 241, 0.1);
  }

  .zone-right:active {
    background: rgba(99, 102, 241, 0.25);
  }

  .nombre {
    font-size: 0.78rem;
    font-weight: 600;
    text-align: center;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .precio {
    font-size: 0.72rem;
    font-weight: 500;
    color: #888;
    font-variant-numeric: tabular-nums;
  }

  .var-icon {
    font-size: 0.8rem;
    font-weight: 700;
    color: #6366f1;
  }
</style>
