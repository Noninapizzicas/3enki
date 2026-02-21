<script lang="ts">
  /**
   * ComanderoScreen — Pantalla de pedido
   *
   * Layout 3 zonas:
   * ┌──────────────────────────────┬──────────┐
   * │ Barra superior (especiales)  │          │
   * ├──────────────────────────────┤ Sidebar  │
   * │                              │(cat+acc) │
   * │  Grid productos 3 columnas   │          │
   * │                              │          │
   * ├──────────────────────────────┤          │
   * │  Pedido actual (scroll up)   │          │
   * └──────────────────────────────┴──────────┘
   */
  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect, setupVisibilityHandler, removeVisibilityHandler } from '$lib/ui-core';
  import {
    comanderoStore,
    categorias,
    productos,
    categoriaActiva,
    pedidoItems,
    pedidoTotal,
    comanderoLoading,
    initComandero,
    selectCategoria,
    addItem,
    updateItem,
    removeItem,
    enviarCocina,
    resetComandero,
    initComanderoSubscriptions,
    type Producto
  } from '$lib/stores/comandero';

  import BotonEspecial from './BotonEspecial.svelte';
  import CategoriaBtn from './CategoriaBtn.svelte';
  import AccionBtn from './AccionBtn.svelte';
  import ProductoBtn from './ProductoBtn.svelte';
  import PedidoList from './PedidoList.svelte';
  import VariacionesPanel from './VariacionesPanel.svelte';
  import CobroPanel from './CobroPanel.svelte';
  import MitadMitadPanel from './MitadMitadPanel.svelte';
  import AlGustoPanel from './AlGustoPanel.svelte';

  /** ID de la cuenta activa */
  export let cuenta_id: string;

  /** ID del proyecto */
  export let projectId: string = '';

  /** Callback para navegar */
  export let onNavigate: ((path: string) => void) | null = null;

  /** Callback para abrir flotante */
  export let onOpenPanel: ((panel: string, data?: any) => void) | null = null;

  let cleanupSubs: (() => void) | null = null;

  // Estado del panel de variaciones
  let showVariaciones = false;
  let productoVariaciones: Producto | null = null;

  // Estado del panel de cobro
  let showCobro = false;

  // Estado del panel mitad y mitad
  let showMitadMitad = false;

  // Estado del panel al gusto
  let showAlGusto = false;

  // Botones especiales (configurables según negocio)
  const botonesEspeciales = [
    { id: 'mitad', label: 'Mitad', icon: '🍕½', color: '#8b5cf6' },
    { id: 'algusto', label: 'Al gusto', icon: '🎨', color: '#ec4899' },
    { id: 'menu', label: 'Menú', icon: '📋', color: '#0ea5e9' }
  ];

  // Acciones sidebar
  const acciones = [
    { id: 'cuenta', label: 'Cuenta', icon: '📄', variant: 'default' as const },
    { id: 'enviar', label: 'Enviar', icon: '🍳', variant: 'primary' as const },
    { id: 'cobro', label: 'Cobro', icon: '💶', variant: 'default' as const },
    { id: 'salir', label: 'Salir', icon: '↩️', variant: 'danger' as const }
  ];

  // Handlers
  function handleCategoriaSelect(e: CustomEvent<{ id: string }>) {
    selectCategoria(e.detail.id);
  }

  function handleProductoAdd(e: CustomEvent<{ producto: Producto }>) {
    addItem(e.detail.producto.id);
  }

  function handleProductoVariaciones(e: CustomEvent<{ producto: Producto }>) {
    productoVariaciones = e.detail.producto;
    showVariaciones = true;
  }

  function handleVariacionesClose() {
    showVariaciones = false;
    productoVariaciones = null;
  }

  function handleCobroClose() {
    showCobro = false;
  }

  function handleCobroSuccess(e: CustomEvent<{ cobro_id: string; estado: string }>) {
    console.log('[Comandero] Cobro completado:', e.detail);
    showCobro = false;
    // Limpiar pedido actual después de cobrar
    resetComandero();
    // Volver a lista de cuentas
    if (onNavigate) onNavigate('/comandero');
  }

  function handleVariacionesConfirm(e: CustomEvent<{
    producto_id: string;
    ingredientes_quitar: string[];
    ingredientes_anadir: { ingrediente_id: string; cantidad: number }[];
    precio_total: number;
  }>) {
    const { producto_id, ingredientes_quitar, ingredientes_anadir, precio_total } = e.detail;

    // Añadir item con variaciones y precio ajustado
    addItem(producto_id, 1, [
      ...ingredientes_quitar.map(id => ({ tipo: 'quitar', ingrediente_id: id })),
      ...ingredientes_anadir.map(item => ({ tipo: 'anadir', ...item }))
    ], { precio_override: precio_total });

    // Cerrar panel
    showVariaciones = false;
    productoVariaciones = null;
  }

  function handleItemIncrement(e: CustomEvent<{ item_id: string }>) {
    const item = $pedidoItems.find(i => i.id === e.detail.item_id);
    if (item) {
      updateItem(e.detail.item_id, { cantidad: item.cantidad + 1 });
    }
  }

  function handleItemDecrement(e: CustomEvent<{ item_id: string }>) {
    const item = $pedidoItems.find(i => i.id === e.detail.item_id);
    if (item && item.cantidad > 1) {
      updateItem(e.detail.item_id, { cantidad: item.cantidad - 1 });
    }
  }

  function handleItemRemove(e: CustomEvent<{ item_id: string }>) {
    removeItem(e.detail.item_id);
  }

  function handleEspecialClick(e: CustomEvent<{ id: string }>) {
    const { id } = e.detail;

    switch (id) {
      case 'mitad':
        showMitadMitad = true;
        break;
      case 'algusto':
        showAlGusto = true;
        break;
      case 'menu':
        if (onOpenPanel) onOpenPanel(id);
        break;
    }
  }

  function handleMitadMitadClose() {
    showMitadMitad = false;
  }

  function handleMitadMitadConfirm(e: CustomEvent<{
    pizza_izquierda: any;
    pizza_derecha: any;
    precio_final: number;
    nombre_compuesto: string;
  }>) {
    const { pizza_izquierda, pizza_derecha, precio_final, nombre_compuesto } = e.detail;

    // Añadir como item especial al pedido
    // Usamos el ID de la primera pizza como base, con metadata de combinación
    addItem(pizza_izquierda.id, 1, [], {
      tipo: 'mitad_mitad',
      nombre_override: nombre_compuesto,
      precio_override: precio_final,
      pizza_izquierda: { id: pizza_izquierda.id, nombre: pizza_izquierda.nombre },
      pizza_derecha: { id: pizza_derecha.id, nombre: pizza_derecha.nombre }
    });

    showMitadMitad = false;
  }

  function handleAlGustoClose() {
    showAlGusto = false;
  }

  function handleAlGustoConfirm(e: CustomEvent<{
    ingredientes: any[];
    precio_total: number;
    nombre_compuesto: string;
  }>) {
    const { ingredientes, precio_total, nombre_compuesto } = e.detail;

    // Añadir como item especial al pedido
    // Usamos un ID especial para pizza al gusto
    addItem('pizza_algusto', 1, [], {
      tipo: 'al_gusto',
      nombre_override: nombre_compuesto,
      precio_override: precio_total,
      ingredientes: ingredientes.map(i => ({ id: i.id, nombre: i.nombre, precio: i.precio_extra }))
    });

    showAlGusto = false;
  }

  async function handleAccionClick(e: CustomEvent<{ id: string }>) {
    const { id } = e.detail;

    switch (id) {
      case 'cuenta':
        if (onNavigate) onNavigate(`/comandero/${cuenta_id}?view=cuenta`);
        break;
      case 'enviar':
        const result = await enviarCocina();
        if (!result.success) {
          console.error('[Comandero] Error enviando:', result.error);
        }
        break;
      case 'cobro':
        showCobro = true;
        break;
      case 'salir':
        if (onNavigate) onNavigate('/comandero');
        break;
    }
  }

  onMount(() => {
    connect().then(() => {
      initComandero(projectId, cuenta_id);
      cleanupSubs = initComanderoSubscriptions(projectId);
    }).catch((err) => {
      console.error('[ComanderoScreen] MQTT connection failed', err);
    });

    setupVisibilityHandler();
  });

  onDestroy(() => {
    cleanupSubs?.();
    resetComandero();
    disconnect();
    removeVisibilityHandler();
  });
</script>

<div class="comandero-screen">
  <!-- Barra superior: botones especiales -->
  <header class="top-bar">
    {#each botonesEspeciales as btn}
      <BotonEspecial
        id={btn.id}
        label={btn.label}
        icon={btn.icon}
        color={btn.color}
        on:click={handleEspecialClick}
      />
    {/each}
  </header>

  <div class="main-body">
    <!-- Sidebar: categorías + acciones -->
    <aside class="sidebar">
      <div class="categorias">
        {#each $categorias as cat}
          <CategoriaBtn
            id={cat.id}
            nombre={cat.nombre}
            icon={cat.icon}
            color={cat.color || '#6366f1'}
            active={$categoriaActiva === cat.id}
            on:select={handleCategoriaSelect}
          />
        {/each}
      </div>

      <div class="acciones">
        {#each acciones as acc}
          <AccionBtn
            id={acc.id}
            label={acc.label}
            icon={acc.icon}
            variant={acc.variant}
            on:click={handleAccionClick}
          />
        {/each}
      </div>
    </aside>

    <!-- Área principal: grid + pedido -->
    <main class="content">
      <!-- Grid de productos -->
      <div class="productos-area">
        {#if $comanderoLoading && $productos.length === 0}
          <div class="loading">Cargando productos...</div>
        {:else if $productos.length === 0}
          <div class="empty">
            <span>Selecciona una categoría</span>
          </div>
        {:else}
          <div class="productos-grid">
            {#each $productos as producto (producto.id)}
              <ProductoBtn
                {producto}
                on:add={handleProductoAdd}
                on:variaciones={handleProductoVariaciones}
              />
            {/each}
          </div>
        {/if}
      </div>

      <!-- Lista pedido (anclada abajo) -->
      <PedidoList
        items={$pedidoItems}
        total={$pedidoTotal}
        on:increment={handleItemIncrement}
        on:decrement={handleItemDecrement}
        on:remove={handleItemRemove}
      />
    </main>
  </div>

  <!-- Panel flotante: Variaciones -->
  {#if showVariaciones && productoVariaciones}
    <VariacionesPanel
      producto={productoVariaciones}
      visible={showVariaciones}
      {projectId}
      on:close={handleVariacionesClose}
      on:confirm={handleVariacionesConfirm}
    />
  {/if}

  <!-- Panel flotante: Cobro -->
  {#if showCobro}
    <CobroPanel
      {cuenta_id}
      monto={$pedidoTotal}
      pedido_ids={$pedidoItems.map(i => i.id)}
      visible={showCobro}
      on:close={handleCobroClose}
      on:success={handleCobroSuccess}
    />
  {/if}

  <!-- Panel flotante: Mitad y Mitad -->
  {#if showMitadMitad}
    <MitadMitadPanel
      visible={showMitadMitad}
      {projectId}
      on:close={handleMitadMitadClose}
      on:confirm={handleMitadMitadConfirm}
    />
  {/if}

  <!-- Panel flotante: Al Gusto -->
  {#if showAlGusto}
    <AlGustoPanel
      visible={showAlGusto}
      {projectId}
      on:close={handleAlGustoClose}
      on:confirm={handleAlGustoConfirm}
    />
  {/if}
</div>

<style>
  .comandero-screen {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: #0a0a0a;
    color: #e5e5e5;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  /* Top bar */
  .top-bar {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    background: #111;
    border-bottom: 1px solid #222;
    overflow-x: auto;
    overflow-y: hidden;
    flex-shrink: 0;
    scrollbar-width: none;
  }

  .top-bar::-webkit-scrollbar {
    display: none;
  }

  /* Main body */
  .main-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    display: flex;
    flex-direction: column;
    width: 80px;
    flex-shrink: 0;
    background: #0d0d0d;
    border-left: 1px solid #1a1a1a;
    order: 1; /* Right side */
  }

  .categorias {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 6px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .acciones {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 6px;
    border-top: 1px solid #222;
    flex-shrink: 0;
  }

  /* Content */
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .productos-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 10px;
    min-height: 0;
  }

  .productos-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    align-content: start;
  }

  .loading, .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #555;
    font-size: 0.85rem;
  }

  /* Mobile */
  @media (max-width: 600px) {
    .main-body {
      flex-direction: column;
    }

    .sidebar {
      flex-direction: row;
      width: 100%;
      height: auto;
      order: 0; /* Top */
      border-left: none;
      border-bottom: 1px solid #1a1a1a;
    }

    .categorias {
      flex-direction: row;
      flex: 1;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 6px;
    }

    .acciones {
      flex-direction: row;
      border-top: none;
      border-left: 1px solid #222;
      padding: 6px;
    }

    .productos-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Tablet */
  @media (min-width: 601px) and (max-width: 900px) {
    .productos-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
