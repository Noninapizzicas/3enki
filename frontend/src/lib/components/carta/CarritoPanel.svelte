<script lang="ts">
  /**
   * CarritoPanel — Panel del carrito del cliente
   *
   * Muestra los items seleccionados con variaciones,
   * total, y botones: limpiar / pedir por WhatsApp
   */
  import { createEventDispatcher } from 'svelte';
  import {
    carrito, carritoTotal, carritoCount,
    removeFromCart, updateCartQuantity, clearCart,
    getWhatsAppUrl, formatPedidoWhatsApp,
    cartaStore
  } from '$lib/stores/carta';
  import { get } from 'svelte/store';

  const dispatch = createEventDispatcher<{ close: void }>();

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' \u20ac';
  }

  function handleClose() {
    dispatch('close');
  }

  function handleClearCart() {
    clearCart();
    dispatch('close');
  }

  function handleWhatsApp() {
    const url = getWhatsAppUrl();
    if (url) {
      window.open(url, '_blank');
    }
  }

  function handleShare() {
    const msg = formatPedidoWhatsApp();
    if (navigator.share) {
      navigator.share({ title: 'Mi pedido', text: msg }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
    }
  }

  function increment(itemId: string) {
    const item = $carrito.find(i => i.id === itemId);
    if (item) updateCartQuantity(itemId, item.cantidad + 1);
  }

  function decrement(itemId: string) {
    const item = $carrito.find(i => i.id === itemId);
    if (item) updateCartQuantity(itemId, item.cantidad - 1);
  }

  $: whatsappConfigured = get(cartaStore).config.whatsapp_telefono !== '';
</script>

<div class="overlay" on:click={handleClose} on:keydown={(e) => e.key === 'Escape' && handleClose()}>
  <div class="panel" on:click|stopPropagation>
    <!-- Header -->
    <header class="panel-header">
      <h2 class="panel-title">Tu pedido</h2>
      <button class="close-btn" on:click={handleClose}>✕</button>
    </header>

    <!-- Items -->
    <div class="panel-content">
      {#if $carrito.length === 0}
        <div class="empty-state">
          <span class="empty-icon">🛒</span>
          <p>Tu carrito esta vacio</p>
        </div>
      {:else}
        {#each $carrito as item (item.id)}
          <div class="cart-item">
            <div class="item-info">
              <span class="item-nombre">{item.nombre}</span>
              {#if item.variaciones?.ingredientes_quitar?.length}
                <span class="item-variacion quitar">
                  Sin: {item.variaciones.ingredientes_quitar.join(', ')}
                </span>
              {/if}
              {#if item.variaciones?.ingredientes_anadir?.length}
                <span class="item-variacion anadir">
                  Extra: {item.variaciones.ingredientes_anadir.map(e => e.nombre).join(', ')}
                </span>
              {/if}
            </div>

            <div class="item-controls">
              <div class="qty-controls">
                <button class="qty-btn" on:click={() => decrement(item.id)}>-</button>
                <span class="qty-value">{item.cantidad}</span>
                <button class="qty-btn" on:click={() => increment(item.id)}>+</button>
              </div>
              <span class="item-subtotal">
                {formatPrecio(item.precio_unitario * item.cantidad)}
              </span>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Footer -->
    {#if $carrito.length > 0}
      <footer class="panel-footer">
        <div class="total-row">
          <span class="total-label">Total</span>
          <span class="total-amount">{formatPrecio($carritoTotal)}</span>
        </div>

        <div class="footer-actions">
          <button class="btn btn-clear" on:click={handleClearCart}>
            Vaciar
          </button>
          <button class="btn btn-share" on:click={handleShare}>
            Compartir
          </button>
          {#if whatsappConfigured}
            <button class="btn btn-whatsapp" on:click={handleWhatsApp}>
              WhatsApp
            </button>
          {:else}
            <button class="btn btn-whatsapp" on:click={handleShare}>
              Enviar pedido
            </button>
          {/if}
        </div>
      </footer>
    {/if}
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
    z-index: 1100;
  }

  .panel {
    background: #111;
    border-radius: 20px 20px 0 0;
    width: 100%;
    max-width: 500px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 0.2s ease-out;
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  /* Header */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #222;
  }

  .panel-title {
    font-size: 1.1rem;
    font-weight: 800;
    color: #fff;
    margin: 0;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: #222;
    color: #888;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Content */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 20px;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #555;
  }

  .empty-icon {
    font-size: 2.5rem;
    display: block;
    margin-bottom: 8px;
  }

  /* Cart item */
  .cart-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #1a1a1a;
  }

  .item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .item-nombre {
    font-size: 0.85rem;
    font-weight: 700;
    color: #e5e5e5;
  }

  .item-variacion {
    font-size: 0.65rem;
    line-height: 1.2;
  }

  .item-variacion.quitar {
    color: #ef4444;
  }

  .item-variacion.anadir {
    color: #22c55e;
  }

  .item-controls {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  .qty-controls {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .qty-btn {
    width: 28px;
    height: 28px;
    border: 1px solid #333;
    background: #1a1a1a;
    color: #e5e5e5;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .qty-btn:first-child {
    border-radius: 6px 0 0 6px;
  }

  .qty-btn:last-child {
    border-radius: 0 6px 6px 0;
  }

  .qty-btn:active {
    background: #333;
  }

  .qty-value {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-top: 1px solid #333;
    border-bottom: 1px solid #333;
    background: #1a1a1a;
    font-size: 0.8rem;
    font-weight: 700;
    color: #fff;
  }

  .item-subtotal {
    font-size: 0.8rem;
    font-weight: 700;
    color: #f59e0b;
    font-variant-numeric: tabular-nums;
  }

  /* Footer */
  .panel-footer {
    padding: 16px 20px;
    border-top: 1px solid #222;
    background: #111;
  }

  .total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .total-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
  }

  .total-amount {
    font-size: 1.4rem;
    font-weight: 800;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  .footer-actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 10px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .btn-clear {
    background: #222;
    color: #888;
    flex: 0.5;
  }

  .btn-clear:active {
    background: #333;
  }

  .btn-share {
    background: #222;
    color: #e5e5e5;
    flex: 0.5;
  }

  .btn-share:active {
    background: #333;
  }

  .btn-whatsapp {
    background: #25d366;
    color: #fff;
    flex: 1;
  }

  .btn-whatsapp:active {
    background: #1da851;
  }

  @media (min-width: 600px) {
    .overlay {
      align-items: center;
    }

    .panel {
      border-radius: 20px;
    }
  }
</style>
