<script lang="ts">
  /**
   * LlevadooScreen — Pantalla principal de delivery Llevadoo
   *
   * Tres vistas:
   *  - carta: Ver productos con precios delivery, añadir al carrito
   *  - pedidos: Ver pedidos activos, marcar recogido
   *  - config: Configurar recargos
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    llevadooStore,
    initLlevadoo, initLlevadooSubscriptions, resetLlevadoo,
    selectCategoria, setVista, addToCarrito,
    removeFromCarrito, updateCarritoCantidad, clearCarrito,
    enviarPedido, marcarRecogido, cancelarPedido,
    setConfigRecargo,
    categorias, productos, categoriaActiva,
    carrito, carritoTotal, carritoCount, carritoRecargoTotal,
    pedidosActivos, vistaActiva, llevadooLoading, llevadooError,
    configRecargo
  } from '$lib/stores/llevadoo';
  import type { ProductoDelivery, PedidoLlevadoo } from '$lib/stores/llevadoo';

  export let projectId: string;

  // Datos del nuevo pedido
  let nombreCliente = '';
  let telefonoCliente = '';
  let direccion = '';
  let notasPedido = '';
  let showCheckout = false;
  let enviando = false;
  let nuevoRecargo = '';

  let unsubscribe: (() => void) | null = null;

  onMount(async () => {
    await initLlevadoo(projectId);
    unsubscribe = initLlevadooSubscriptions(projectId);
  });

  onDestroy(() => {
    unsubscribe?.();
    resetLlevadoo();
  });

  // ---- Handlers ----

  function handleProductoClick(producto: ProductoDelivery) {
    addToCarrito(producto);
  }

  async function handleEnviarPedido() {
    enviando = true;
    const result = await enviarPedido({
      nombre_cliente: nombreCliente || undefined,
      telefono_cliente: telefonoCliente || undefined,
      direccion: direccion || undefined,
      notas: notasPedido || undefined
    });

    if (result.success) {
      showCheckout = false;
      nombreCliente = '';
      telefonoCliente = '';
      direccion = '';
      notasPedido = '';
      setVista('pedidos');
    }
    enviando = false;
  }

  async function handleRecogido(cuenta_id: string) {
    await marcarRecogido(cuenta_id);
  }

  async function handleCancelar(cuenta_id: string) {
    if (confirm('¿Cancelar este pedido?')) {
      await cancelarPedido(cuenta_id);
    }
  }

  async function handleGuardarRecargo() {
    const valor = parseFloat(nuevoRecargo);
    if (!isNaN(valor) && valor >= 0) {
      await setConfigRecargo({ recargo_por_producto: valor });
      nuevoRecargo = '';
    }
  }

  function getEstadoColor(estado: string): string {
    switch (estado) {
      case 'recibido': return '#3b82f6';
      case 'aceptado': return '#8b5cf6';
      case 'en_preparacion': return '#f59e0b';
      case 'listo': return '#22c55e';
      case 'recogido': return '#6b7280';
      default: return '#6b7280';
    }
  }

  function getEstadoLabel(estado: string): string {
    switch (estado) {
      case 'recibido': return 'Recibido';
      case 'aceptado': return 'Aceptado';
      case 'en_preparacion': return 'En preparacion';
      case 'listo': return 'LISTO';
      case 'recogido': return 'Recogido';
      case 'cancelado': return 'Cancelado';
      default: return estado;
    }
  }

  function tiempoDesde(fecha: string): string {
    const diff = Date.now() - new Date(fecha).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins}min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}min`;
  }

  // Category colors
  const COLORES = ['#eab308', '#22c55e', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
</script>

<div class="llevadoo">
  <!-- Header -->
  <header class="header">
    <div class="header-left">
      <h1>Llevadoo</h1>
      <span class="badge">Delivery</span>
    </div>
    <nav class="tabs">
      <button class="tab" class:active={$vistaActiva === 'carta'} on:click={() => setVista('carta')}>
        Carta
      </button>
      <button class="tab" class:active={$vistaActiva === 'pedidos'} on:click={() => setVista('pedidos')}>
        Pedidos
        {#if $pedidosActivos.length > 0}
          <span class="tab-badge">{$pedidosActivos.length}</span>
        {/if}
      </button>
      <button class="tab" class:active={$vistaActiva === 'config'} on:click={() => setVista('config')}>
        Config
      </button>
    </nav>
  </header>

  {#if $llevadooLoading}
    <div class="loading">Cargando carta delivery...</div>

  {:else if $llevadooError}
    <div class="error">{$llevadooError}</div>

  {:else if $vistaActiva === 'carta'}
    <!-- ============ VISTA CARTA ============ -->
    <div class="carta-layout">
      <!-- Categorías -->
      <div class="categorias-bar">
        {#each $categorias as cat, i}
          <button
            class="cat-btn"
            class:active={$categoriaActiva === cat.id}
            style="--cat-color: {COLORES[i % COLORES.length]}"
            on:click={() => selectCategoria(cat.id)}
          >
            {cat.icon || ''} {cat.nombre}
          </button>
        {/each}
      </div>

      <!-- Productos grid -->
      <div class="productos-grid">
        {#each $productos as producto}
          <button class="producto-card" on:click={() => handleProductoClick(producto)}>
            <div class="producto-nombre">{producto.nombre}</div>
            <div class="producto-precios">
              <span class="precio-delivery">{producto.precio.toFixed(2)}€</span>
              {#if producto.recargo_delivery > 0}
                <span class="precio-original">{producto.precio_original.toFixed(2)}€</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>

      <!-- Carrito flotante -->
      {#if $carritoCount > 0}
        <div class="carrito-fab" on:click={() => showCheckout = true}>
          <span class="fab-count">{$carritoCount}</span>
          <span class="fab-total">{$carritoTotal.toFixed(2)}€</span>
          {#if $carritoRecargoTotal > 0}
            <span class="fab-recargo">(+{$carritoRecargoTotal.toFixed(2)}€)</span>
          {/if}
        </div>
      {/if}

      <!-- Panel Checkout -->
      {#if showCheckout}
        <div class="checkout-overlay" on:click|self={() => showCheckout = false}>
          <div class="checkout-panel">
            <h2>Nuevo Pedido Llevadoo</h2>

            <!-- Items del carrito -->
            <div class="checkout-items">
              {#each $carrito as item}
                <div class="checkout-item">
                  <div class="item-info">
                    <span class="item-nombre">{item.nombre}</span>
                    <span class="item-precio">{item.precio_delivery.toFixed(2)}€</span>
                  </div>
                  <div class="item-controls">
                    <button class="qty-btn" on:click={() => updateCarritoCantidad(item.producto_id, item.cantidad - 1)}>-</button>
                    <span class="qty">{item.cantidad}</span>
                    <button class="qty-btn" on:click={() => updateCarritoCantidad(item.producto_id, item.cantidad + 1)}>+</button>
                    <button class="remove-btn" on:click={() => removeFromCarrito(item.producto_id)}>x</button>
                  </div>
                </div>
              {/each}
            </div>

            <div class="checkout-total">
              <span>Total: <strong>{$carritoTotal.toFixed(2)}€</strong></span>
              <span class="recargo-info">Recargo delivery: +{$carritoRecargoTotal.toFixed(2)}€</span>
            </div>

            <!-- Datos cliente -->
            <div class="checkout-form">
              <input type="text" placeholder="Nombre cliente" bind:value={nombreCliente} />
              <input type="tel" placeholder="Telefono (opcional)" bind:value={telefonoCliente} />
              <input type="text" placeholder="Direccion entrega" bind:value={direccion} />
              <textarea placeholder="Notas..." bind:value={notasPedido} rows="2"></textarea>
            </div>

            <div class="checkout-actions">
              <button class="btn-cancel" on:click={() => showCheckout = false}>Volver</button>
              <button class="btn-clear" on:click={() => { clearCarrito(); showCheckout = false; }}>Vaciar</button>
              <button class="btn-send" on:click={handleEnviarPedido} disabled={enviando}>
                {enviando ? 'Enviando...' : 'Enviar a cocina'}
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>

  {:else if $vistaActiva === 'pedidos'}
    <!-- ============ VISTA PEDIDOS ============ -->
    <div class="pedidos-layout">
      {#if $pedidosActivos.length === 0}
        <div class="empty-state">No hay pedidos activos</div>
      {:else}
        <div class="pedidos-grid">
          {#each $pedidosActivos as pedido}
            <div class="pedido-card" style="--estado-color: {getEstadoColor(pedido.estado)}">
              <div class="pedido-header">
                <span class="pedido-num">#{pedido.numero_pedido}</span>
                <span class="pedido-estado" style="background: {getEstadoColor(pedido.estado)}">
                  {getEstadoLabel(pedido.estado)}
                </span>
              </div>

              <div class="pedido-cliente">
                {#if pedido.nombre_cliente}
                  <strong>{pedido.nombre_cliente}</strong>
                {/if}
                {#if pedido.direccion}
                  <span class="pedido-dir">{pedido.direccion}</span>
                {/if}
              </div>

              <div class="pedido-meta">
                <span>{tiempoDesde(pedido.hora_pedido)}</span>
                <span class="pedido-total">{pedido.total.toFixed(2)}€</span>
              </div>

              {#if pedido.notas}
                <div class="pedido-notas">{pedido.notas}</div>
              {/if}

              <div class="pedido-actions">
                {#if pedido.estado === 'listo'}
                  <button class="btn-recogido" on:click={() => handleRecogido(pedido.cuenta_id)}>
                    Marcar Recogido
                  </button>
                {:else if pedido.estado !== 'recogido'}
                  <button class="btn-cancelar" on:click={() => handleCancelar(pedido.cuenta_id)}>
                    Cancelar
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  {:else if $vistaActiva === 'config'}
    <!-- ============ VISTA CONFIG ============ -->
    <div class="config-layout">
      <div class="config-card">
        <h3>Recargo por producto</h3>
        <p class="config-current">Actual: <strong>{$configRecargo.recargo_por_producto.toFixed(2)}€</strong> por producto</p>
        <div class="config-input-row">
          <input type="number" step="0.1" min="0" placeholder="Nuevo recargo (€)" bind:value={nuevoRecargo} />
          <button class="btn-save" on:click={handleGuardarRecargo}>Guardar</button>
        </div>
      </div>

      <div class="config-card">
        <h3>Recargos especificos</h3>
        <p class="config-desc">Override por producto (no implementado en UI aun, via API)</p>
        {#if Object.keys($configRecargo.recargos_especificos).length > 0}
          {#each Object.entries($configRecargo.recargos_especificos) as [pid, recargo]}
            <div class="config-especifico">{pid}: +{recargo}€</div>
          {/each}
        {:else}
          <p class="config-empty">Sin recargos especificos</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .llevadoo {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    background: #0a0a0a;
    color: #e5e5e5;
    font-family: system-ui, -apple-system, sans-serif;
    overflow: hidden;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: #141414;
    border-bottom: 1px solid #262626;
    flex-shrink: 0;
  }
  .header-left { display: flex; align-items: center; gap: 0.5rem; }
  .header-left h1 { font-size: 1.2rem; font-weight: 700; margin: 0; color: #f59e0b; }
  .badge {
    font-size: 0.65rem;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    background: #f59e0b;
    color: #000;
    font-weight: 600;
    text-transform: uppercase;
  }

  .tabs { display: flex; gap: 0.25rem; }
  .tab {
    padding: 0.4rem 0.8rem;
    border: none;
    background: transparent;
    color: #a3a3a3;
    font-size: 0.85rem;
    cursor: pointer;
    border-radius: 6px;
    position: relative;
  }
  .tab.active { background: #262626; color: #f59e0b; font-weight: 600; }
  .tab-badge {
    position: absolute;
    top: -2px;
    right: -4px;
    background: #ef4444;
    color: #fff;
    font-size: 0.6rem;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
  }

  /* Loading / Error */
  .loading, .error, .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: 1rem;
    color: #737373;
  }
  .error { color: #ef4444; }

  /* Categorías */
  .categorias-bar {
    display: flex;
    gap: 0.3rem;
    padding: 0.5rem;
    overflow-x: auto;
    flex-shrink: 0;
    -webkit-overflow-scrolling: touch;
  }
  .cat-btn {
    padding: 0.4rem 0.8rem;
    border: 2px solid var(--cat-color);
    background: transparent;
    color: var(--cat-color);
    border-radius: 20px;
    font-size: 0.8rem;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.15s;
  }
  .cat-btn.active {
    background: var(--cat-color);
    color: #000;
    font-weight: 600;
  }

  /* Carta layout */
  .carta-layout {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Productos grid */
  .productos-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.4rem;
    padding: 0.5rem;
    overflow-y: auto;
    align-content: start;
  }
  .producto-card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0.6rem;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    min-height: 70px;
    text-align: left;
  }
  .producto-card:hover { border-color: #f59e0b; transform: scale(1.02); }
  .producto-card:active { transform: scale(0.98); }
  .producto-nombre { font-size: 0.85rem; font-weight: 500; margin-bottom: 0.3rem; }
  .producto-precios { display: flex; gap: 0.4rem; align-items: baseline; }
  .precio-delivery { font-size: 1rem; font-weight: 700; color: #f59e0b; }
  .precio-original { font-size: 0.75rem; color: #737373; text-decoration: line-through; }

  /* Carrito FAB */
  .carrito-fab {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    background: #f59e0b;
    color: #000;
    padding: 0.6rem 1.2rem;
    border-radius: 30px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(245, 158, 11, 0.4);
    z-index: 50;
    font-size: 0.95rem;
  }
  .fab-count {
    background: #000;
    color: #f59e0b;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }
  .fab-recargo { font-size: 0.7rem; opacity: 0.7; }

  /* Checkout overlay */
  .checkout-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    z-index: 100;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .checkout-panel {
    background: #1a1a1a;
    border-radius: 16px 16px 0 0;
    padding: 1.2rem;
    width: 100%;
    max-width: 500px;
    max-height: 85vh;
    overflow-y: auto;
  }
  .checkout-panel h2 {
    margin: 0 0 0.8rem;
    font-size: 1.1rem;
    color: #f59e0b;
  }

  .checkout-items { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.8rem; }
  .checkout-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem;
    background: #262626;
    border-radius: 6px;
  }
  .item-info { display: flex; gap: 0.5rem; align-items: center; }
  .item-nombre { font-size: 0.85rem; }
  .item-precio { font-weight: 600; color: #f59e0b; font-size: 0.85rem; }
  .item-controls { display: flex; align-items: center; gap: 0.3rem; }
  .qty-btn {
    width: 28px;
    height: 28px;
    border: 1px solid #555;
    background: transparent;
    color: #e5e5e5;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
  }
  .qty { font-size: 0.9rem; min-width: 20px; text-align: center; }
  .remove-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: #7f1d1d;
    color: #fca5a5;
    border-radius: 4px;
    cursor: pointer;
    margin-left: 0.3rem;
  }

  .checkout-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem;
    background: #262626;
    border-radius: 6px;
    margin-bottom: 0.8rem;
    font-size: 1rem;
  }
  .recargo-info { font-size: 0.75rem; color: #f59e0b; }

  .checkout-form {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 0.8rem;
  }
  .checkout-form input, .checkout-form textarea {
    padding: 0.5rem;
    background: #262626;
    border: 1px solid #404040;
    border-radius: 6px;
    color: #e5e5e5;
    font-size: 0.85rem;
  }
  .checkout-form input:focus, .checkout-form textarea:focus {
    outline: none;
    border-color: #f59e0b;
  }

  .checkout-actions {
    display: flex;
    gap: 0.4rem;
  }
  .checkout-actions button {
    flex: 1;
    padding: 0.6rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .btn-cancel { background: #404040; color: #e5e5e5; }
  .btn-clear { background: #7f1d1d; color: #fca5a5; }
  .btn-send { background: #f59e0b; color: #000; }
  .btn-send:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Pedidos layout */
  .pedidos-layout { flex: 1; padding: 0.5rem; overflow-y: auto; }
  .pedidos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.5rem;
  }
  .pedido-card {
    background: #1a1a1a;
    border: 2px solid var(--estado-color);
    border-radius: 10px;
    padding: 0.8rem;
  }
  .pedido-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.4rem;
  }
  .pedido-num { font-size: 1.3rem; font-weight: 700; }
  .pedido-estado {
    padding: 0.2rem 0.6rem;
    border-radius: 12px;
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
  }
  .pedido-cliente { margin-bottom: 0.3rem; }
  .pedido-dir { display: block; font-size: 0.8rem; color: #a3a3a3; }
  .pedido-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #a3a3a3;
    margin-bottom: 0.3rem;
  }
  .pedido-total { font-weight: 700; color: #f59e0b; }
  .pedido-notas {
    font-size: 0.8rem;
    color: #d4d4d4;
    background: #262626;
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    margin-bottom: 0.4rem;
  }
  .pedido-actions { display: flex; gap: 0.3rem; }
  .btn-recogido {
    flex: 1;
    padding: 0.5rem;
    border: none;
    background: #22c55e;
    color: #000;
    border-radius: 8px;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .btn-cancelar {
    padding: 0.5rem 0.8rem;
    border: 1px solid #7f1d1d;
    background: transparent;
    color: #fca5a5;
    border-radius: 8px;
    font-size: 0.8rem;
    cursor: pointer;
  }

  /* Config layout */
  .config-layout { flex: 1; padding: 1rem; overflow-y: auto; }
  .config-card {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 10px;
    padding: 1rem;
    margin-bottom: 0.8rem;
  }
  .config-card h3 { margin: 0 0 0.4rem; color: #f59e0b; font-size: 1rem; }
  .config-current { font-size: 0.9rem; margin-bottom: 0.5rem; }
  .config-input-row {
    display: flex;
    gap: 0.4rem;
  }
  .config-input-row input {
    flex: 1;
    padding: 0.5rem;
    background: #262626;
    border: 1px solid #404040;
    border-radius: 6px;
    color: #e5e5e5;
  }
  .btn-save {
    padding: 0.5rem 1rem;
    background: #f59e0b;
    color: #000;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }
  .config-desc { font-size: 0.8rem; color: #737373; }
  .config-empty { font-size: 0.8rem; color: #525252; font-style: italic; }
  .config-especifico { font-size: 0.85rem; padding: 0.2rem 0; }
</style>
