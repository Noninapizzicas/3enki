<script lang="ts">
  /**
   * CartaScreen — Pantalla principal de la carta digital del cliente
   *
   * Layout: Header | Categorias scroll | Grid productos | Carrito FAB
   * Paneles flotantes: ProductoDetalle, VariacionesPanel, CarritoPanel
   */
  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect } from '$lib/ui-core';
  import {
    cartaStore,
    initCarta, resetCarta,
    selectCategoria, showAllProducts,
    addToCart, openDetalle, closeDetalle,
    carrito, carritoCount, carritoTotal,
    productoDetalle, categorias, productos,
    categoriaActiva, cartaLoading, cartaError,
    ingredientes,
    type Producto, type CarritoItem
  } from '$lib/stores/carta';

  import CategoriaScroll from './CategoriaScroll.svelte';
  import ProductoCard from './ProductoCard.svelte';
  import ProductoDetalle from './ProductoDetalle.svelte';
  import CarritoPanel from './CarritoPanel.svelte';
  import VariacionesPanel from '$lib/components/comandero/VariacionesPanel.svelte';

  export let projectId: string;

  // Panels state
  let showCarrito = false;
  let showVariaciones = false;
  let variacionesProducto: any = null;

  // Init
  onMount(async () => {
    await connect();
    await initCarta(projectId);
  });

  onDestroy(() => {
    resetCarta();
    disconnect();
  });

  // Handlers
  function handleProductoInfo(e: CustomEvent<Producto>) {
    openDetalle(e.detail);
  }

  function handleProductoVariaciones(e: CustomEvent<Producto>) {
    const prod = e.detail;
    variacionesProducto = {
      id: prod.id,
      nombre: prod.nombre,
      precio: prod.precio,
      ingredientes_base: prod.ingredientes_base || prod.ingredientes || []
    };
    showVariaciones = true;
  }

  function handleProductoAdd(e: CustomEvent<Producto>) {
    addToCart(e.detail);
  }

  function handleVariacionesConfirm(e: CustomEvent<any>) {
    const data = e.detail;
    const prod = $productos.find(p => p.id === data.producto_id) || variacionesProducto;
    if (!prod) return;

    addToCart(
      prod,
      1,
      {
        ingredientes_quitar: data.ingredientes_quitar || [],
        ingredientes_anadir: data.ingredientes_anadir || []
      },
      data.ingredientes_base,
      data.precio_total
    );

    showVariaciones = false;
    variacionesProducto = null;
  }

  function handleVariacionesClose() {
    showVariaciones = false;
    variacionesProducto = null;
  }

  function handleDetalleAdd(e: CustomEvent<{ producto: Producto; variaciones?: boolean }>) {
    const { producto, variaciones } = e.detail;
    closeDetalle();
    if (variaciones) {
      variacionesProducto = {
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        ingredientes_base: producto.ingredientes_base || producto.ingredientes || []
      };
      showVariaciones = true;
    } else {
      addToCart(producto);
    }
  }

  function toggleCarrito() {
    showCarrito = !showCarrito;
  }

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' \u20ac';
  }
</script>

<div class="carta-screen">
  <!-- Header -->
  <header class="carta-header">
    <div class="header-brand">
      <span class="brand-name">Pizzicas</span>
      <span class="brand-sub">Carta Digital</span>
    </div>
  </header>

  <!-- Categorias -->
  {#if $categorias.length > 0}
    <CategoriaScroll
      categorias={$categorias}
      activa={$categoriaActiva}
      on:select={(e) => selectCategoria(e.detail)}
      on:all={() => showAllProducts()}
    />
  {/if}

  <!-- Content -->
  <main class="carta-content">
    {#if $cartaLoading}
      <div class="state-msg">Cargando carta...</div>
    {:else if $cartaError}
      <div class="state-msg error">{$cartaError}</div>
    {:else if $productos.length === 0}
      <div class="state-msg">No hay productos en esta categoria</div>
    {:else}
      <div class="productos-grid">
        {#each $productos as producto (producto.id)}
          <ProductoCard
            {producto}
            on:info={handleProductoInfo}
            on:variaciones={handleProductoVariaciones}
            on:add={handleProductoAdd}
          />
        {/each}
      </div>
    {/if}
  </main>

  <!-- FAB Carrito -->
  {#if $carritoCount > 0}
    <button class="fab-carrito" on:click={toggleCarrito}>
      <span class="fab-count">{$carritoCount}</span>
      <span class="fab-total">{formatPrecio($carritoTotal)}</span>
    </button>
  {/if}

  <!-- Panels -->
  {#if $productoDetalle}
    <ProductoDetalle
      producto={$productoDetalle}
      on:close={() => closeDetalle()}
      on:add={handleDetalleAdd}
    />
  {/if}

  {#if showVariaciones && variacionesProducto}
    <VariacionesPanel
      producto={variacionesProducto}
      visible={true}
      projectId={projectId}
      catalogoIngredientes={$ingredientes}
      on:confirm={handleVariacionesConfirm}
      on:close={handleVariacionesClose}
    />
  {/if}

  {#if showCarrito}
    <CarritoPanel
      on:close={() => showCarrito = false}
    />
  {/if}
</div>

<style>
  .carta-screen {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
    background: #0a0a0a;
    color: #e5e5e5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* Header */
  .carta-header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 20px;
    background: #111;
    border-bottom: 1px solid #222;
  }

  .header-brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .brand-name {
    font-size: 1.4rem;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #f59e0b;
  }

  .brand-sub {
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #666;
  }

  /* Content */
  .carta-content {
    flex: 1;
    padding: 16px;
    padding-bottom: 100px;
    overflow-y: auto;
  }

  .state-msg {
    text-align: center;
    padding: 60px 20px;
    font-size: 0.9rem;
    color: #666;
  }

  .state-msg.error {
    color: #ef4444;
  }

  /* Grid */
  .productos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }

  /* FAB */
  .fab-carrito {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border: none;
    border-radius: 50%;
    background: #f59e0b;
    color: #000;
    cursor: pointer;
    z-index: 50;
    box-shadow: 0 4px 20px rgba(245, 158, 11, 0.4);
    transition: transform 0.15s;
  }

  .fab-carrito:active {
    transform: scale(0.92);
  }

  .fab-count {
    font-size: 1.1rem;
    font-weight: 800;
    line-height: 1;
  }

  .fab-total {
    font-size: 0.55rem;
    font-weight: 600;
    opacity: 0.85;
  }

  /* Mobile */
  @media (max-width: 400px) {
    .productos-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .carta-content {
      padding: 10px;
      padding-bottom: 100px;
    }
  }

  @media (min-width: 600px) {
    .productos-grid {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
  }
</style>
