<script lang="ts">
  /**
   * ProductoDetalle — Modal de info completa de un producto
   *
   * Muestra: imagen, nombre, descripcion, ingredientes con emojis,
   * alérgenos, metadata (vegano, vegetariano), precio.
   * Botones: "Añadir" (directo) y "Personalizar" (variaciones)
   */
  import { createEventDispatcher } from 'svelte';
  import type { Producto } from '$lib/stores/carta';

  export let producto: Producto;

  const dispatch = createEventDispatcher<{
    close: void;
    add: { producto: Producto; variaciones?: boolean };
  }>();

  $: ingredientes = producto.ingredientes_base || producto.ingredientes || [];
  $: tieneVariaciones = ingredientes.length > 0;
  $: badges = getBadges(producto);

  function getBadges(prod: Producto): { label: string; color: string }[] {
    const b: { label: string; color: string }[] = [];
    if (prod.metadata?.vegano) b.push({ label: 'Vegano', color: '#22c55e' });
    if (prod.metadata?.vegetariano) b.push({ label: 'Vegetariano', color: '#4ade80' });
    return b;
  }

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' \u20ac';
  }

  function handleAdd() {
    dispatch('add', { producto, variaciones: false });
  }

  function handlePersonalizar() {
    dispatch('add', { producto, variaciones: true });
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<div class="overlay" on:click={handleClose} on:keydown={(e) => e.key === 'Escape' && handleClose()}>
  <div class="panel" on:click|stopPropagation>
    <!-- Image / Visual -->
    <div class="panel-visual">
      {#if producto.imagen}
        <img src={producto.imagen} alt={producto.nombre} class="panel-img" />
      {:else}
        <div class="panel-placeholder">
          <span class="placeholder-emoji">{producto.emoji || '🍕'}</span>
        </div>
      {/if}
      <button class="close-btn" on:click={handleClose}>✕</button>
    </div>

    <!-- Content -->
    <div class="panel-content">
      <!-- Header -->
      <div class="detail-header">
        <h2 class="detail-nombre">{producto.nombre}</h2>
        <span class="detail-precio">{formatPrecio(producto.precio)}</span>
      </div>

      <!-- Badges -->
      {#if badges.length > 0}
        <div class="detail-badges">
          {#each badges as badge}
            <span class="detail-badge" style="background: {badge.color}">
              {badge.label}
            </span>
          {/each}
        </div>
      {/if}

      <!-- Descripcion -->
      {#if producto.descripcion}
        <p class="detail-desc">{producto.descripcion}</p>
      {/if}

      <!-- Ingredientes -->
      {#if ingredientes.length > 0}
        <section class="detail-section">
          <h3 class="section-title">Ingredientes</h3>
          <div class="ingredientes-list">
            {#each ingredientes as ing}
              <span class="ingrediente-chip">
                {#if ing.emoji}
                  <span class="ing-emoji">{ing.emoji}</span>
                {/if}
                <span class="ing-nombre">{ing.nombre}</span>
              </span>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Alergenos -->
      {#if producto.alergenos && producto.alergenos.length > 0}
        <section class="detail-section">
          <h3 class="section-title alergenos-title">Alergenos</h3>
          <div class="ingredientes-list">
            {#each producto.alergenos as alergeno}
              <span class="ingrediente-chip alergeno">{alergeno}</span>
            {/each}
          </div>
        </section>
      {/if}
    </div>

    <!-- Footer -->
    <footer class="panel-footer">
      {#if tieneVariaciones}
        <button class="btn btn-secondary" on:click={handlePersonalizar}>
          Personalizar
        </button>
      {/if}
      <button class="btn btn-primary" on:click={handleAdd}>
        Añadir {formatPrecio(producto.precio)}
      </button>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 1000;
  }

  .panel {
    background: #111;
    border-radius: 20px 20px 0 0;
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 0.25s ease-out;
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  /* Visual */
  .panel-visual {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #1a1a1a;
    overflow: hidden;
  }

  .panel-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .panel-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #1a1a1a 0%, #252525 100%);
  }

  .placeholder-emoji {
    font-size: 4rem;
    opacity: 0.4;
  }

  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
  }

  /* Content */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .detail-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .detail-nombre {
    font-size: 1.3rem;
    font-weight: 800;
    color: #fff;
    margin: 0;
    line-height: 1.2;
  }

  .detail-precio {
    font-size: 1.2rem;
    font-weight: 800;
    color: #f59e0b;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .detail-badges {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }

  .detail-badge {
    padding: 3px 8px;
    border-radius: 4px;
    color: #fff;
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .detail-desc {
    font-size: 0.85rem;
    color: #aaa;
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .detail-section {
    margin-bottom: 16px;
  }

  .section-title {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #555;
    margin: 0 0 8px;
  }

  .alergenos-title {
    color: #ef4444;
  }

  .ingredientes-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ingrediente-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: 1px solid #2a2a2a;
    border-radius: 20px;
    background: #1a1a1a;
    font-size: 0.75rem;
    color: #bbb;
  }

  .ingrediente-chip.alergeno {
    border-color: rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }

  .ing-emoji {
    font-size: 0.85rem;
  }

  .ing-nombre {
    font-weight: 500;
  }

  /* Footer */
  .panel-footer {
    display: flex;
    gap: 10px;
    padding: 16px 20px;
    border-top: 1px solid #222;
    background: #111;
  }

  .btn {
    flex: 1;
    padding: 14px;
    border: none;
    border-radius: 12px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .btn-primary {
    background: #f59e0b;
    color: #000;
  }

  .btn-primary:active {
    background: #d97706;
  }

  .btn-secondary {
    background: #222;
    color: #e5e5e5;
    flex: 0.6;
  }

  .btn-secondary:active {
    background: #333;
  }

  /* Desktop centering */
  @media (min-width: 600px) {
    .overlay {
      align-items: center;
    }

    .panel {
      border-radius: 20px;
      max-height: 80vh;
    }
  }
</style>
