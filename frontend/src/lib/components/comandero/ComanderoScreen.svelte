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
  import { renameMesa } from '$lib/stores/cuentas';

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

  /** Vista inicial: 'cuenta' abre panel de cobro al cargar */
  export let initialView: string | undefined = undefined;

  let cleanupSubs: (() => void) | null = null;
  let contentEl: HTMLElement;
  let pedidoSectionEl: HTMLElement;

  function scrollToPedido() {
    pedidoSectionEl?.scrollIntoView({ behavior: 'smooth' });
  }

  // Nombre editable de la mesa
  const isMesa = cuenta_id.startsWith('mesa_');
  let cuentaNombre = isMesa ? 'Mesa...' : cuenta_id.split('_')[0] || 'Cuenta';
  let editingName = false;
  let nameInput = '';
  let nameInputEl: HTMLInputElement;

  // Voice recognition
  let listening = false;
  let voiceError = '';

  function startEditName() {
    nameInput = cuentaNombre;
    editingName = true;
    setTimeout(() => nameInputEl?.focus(), 50);
  }

  async function saveName() {
    editingName = false;
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === cuentaNombre) return;

    if (isMesa) {
      const ok = await renameMesa(projectId, cuenta_id, trimmed);
      if (ok) cuentaNombre = trimmed;
    }
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') { editingName = false; }
  }

  async function startVoice() {
    voiceError = '';

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      voiceError = 'Voz no soportada';
      setTimeout(() => voiceError = '', 3000);
      return;
    }

    // Pedir permisos de micrófono explícitamente
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Liberamos el stream inmediatamente — solo necesitábamos el permiso
      stream.getTracks().forEach(t => t.stop());
    } catch (err: any) {
      console.error('[Voice] Mic permission denied:', err);
      voiceError = 'Sin micro';
      setTimeout(() => voiceError = '', 3000);
      return;
    }

    try {
      const recognition = new SR();
      recognition.lang = 'es-ES';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      listening = true;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript && transcript.trim()) {
          nameInput = transcript.trim();
          cuentaNombre = nameInput;
          listening = false;
          // Guardar directamente
          renameMesa(projectId, cuenta_id, nameInput);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('[Voice] Error:', event.error);
        listening = false;
        if (event.error === 'not-allowed') {
          voiceError = 'Sin permiso micro';
        } else if (event.error === 'no-speech') {
          voiceError = 'No te he oído';
        } else if (event.error === 'network') {
          voiceError = 'Sin conexión';
        } else {
          voiceError = 'Error de voz';
        }
        setTimeout(() => voiceError = '', 3000);
      };

      recognition.onend = () => { listening = false; };

      recognition.start();
    } catch (err: any) {
      console.error('[Voice] Start failed:', err);
      listening = false;
      voiceError = 'Error al iniciar';
      setTimeout(() => voiceError = '', 3000);
    }
  }

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
    connect().then(async () => {
      await initComandero(projectId, cuenta_id);
      cleanupSubs = initComanderoSubscriptions(projectId);

      // Cargar nombre real de la mesa
      if (isMesa) {
        try {
          const { mqttRequest } = await import('$lib/ui-core/mqtt-request');
          const res = await mqttRequest('mesa', 'get', {
            project_id: projectId,
            cuenta_id
          });
          const data = (res as any)?.data;
          if (data?.nombre) cuentaNombre = data.nombre;
        } catch { /* usa nombre por defecto */ }
      }

      // Auto-abrir cobro si se navega con ?view=cuenta
      if (initialView === 'cuenta') {
        showCobro = true;
      }
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
  <!-- Header: nombre de cuenta editable -->
  <header class="cuenta-header">
    <button class="back-btn" on:click={() => onNavigate?.('/comandero')}>
      &#8592;
    </button>

    {#if editingName}
      <input
        bind:this={nameInputEl}
        bind:value={nameInput}
        class="name-input"
        on:blur={saveName}
        on:keydown={handleNameKeydown}
        placeholder="Nombre..."
        maxlength="50"
      />
    {:else}
      <button
        class="name-display"
        class:is-mesa={isMesa}
        on:click={isMesa ? startEditName : undefined}
        title={isMesa ? 'Tap para renombrar' : ''}
      >
        {cuentaNombre}
      </button>
    {/if}

    {#if isMesa && !editingName}
      <button
        class="voice-btn"
        class:listening
        class:voice-error={!!voiceError}
        on:click={startVoice}
        disabled={listening}
        title="Renombrar por voz"
      >
        {#if voiceError}
          <span class="voice-error-text">{voiceError}</span>
        {:else if listening}
          <span class="voice-pulse">...</span>
        {:else}
          🎤
        {/if}
      </button>
    {/if}
  </header>

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

    <!-- Área principal: grid + pedido en scroll continuo -->
    <main class="content" bind:this={contentEl}>
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

      <!-- Lista pedido (debajo de productos, dentro del scroll) -->
      <div class="pedido-section" bind:this={pedidoSectionEl}>
        <PedidoList
          items={$pedidoItems}
          total={$pedidoTotal}
          on:increment={handleItemIncrement}
          on:decrement={handleItemDecrement}
          on:remove={handleItemRemove}
        />
      </div>
    </main>

    <!-- Botón flotante: ir al pedido -->
    {#if $pedidoItems.length > 0}
      <button class="fab-pedido" on:click={scrollToPedido}>
        <span class="fab-count">{$pedidoItems.reduce((s, i) => s + i.cantidad, 0)}</span>
        <span class="fab-total">{$pedidoTotal.toFixed(2)}{'\u20AC'}</span>
      </button>
    {/if}
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

  /* Cuenta header */
  .cuenta-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #111;
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
  }

  .back-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 1.2rem;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 6px;
    line-height: 1;
  }

  .back-btn:active {
    background: #222;
  }

  .name-display {
    background: none;
    border: none;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    padding: 4px 8px;
    cursor: default;
    border-radius: 6px;
    text-align: left;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name-display.is-mesa {
    cursor: pointer;
    border: 1px dashed transparent;
  }

  .name-display.is-mesa:active {
    background: #1a1a1a;
    border-color: #333;
  }

  .name-input {
    flex: 1;
    background: #1a1a1a;
    border: 1px solid #3b82f6;
    border-radius: 6px;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    padding: 4px 8px;
    outline: none;
    min-width: 0;
  }

  .voice-btn {
    background: none;
    border: 1px solid #333;
    color: #888;
    font-size: 1.1rem;
    padding: 4px 10px;
    cursor: pointer;
    border-radius: 8px;
    flex-shrink: 0;
    transition: all 0.15s;
    min-width: 40px;
    text-align: center;
  }

  .voice-btn:active:not(:disabled) {
    background: #222;
  }

  .voice-btn:disabled {
    cursor: not-allowed;
  }

  .voice-btn.listening {
    border-color: #ef4444;
    color: #ef4444;
    animation: pulse-voice 1s ease-in-out infinite;
  }

  .voice-btn.voice-error {
    border-color: #f59e0b;
    color: #f59e0b;
    animation: none;
  }

  .voice-error-text {
    font-size: 0.6rem;
    font-weight: 600;
  }

  .voice-pulse {
    font-weight: 700;
  }

  @keyframes pulse-voice {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
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

  /* Content — scroll continuo: productos + pedido */
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
  }

  .productos-area {
    padding: 10px;
    flex-shrink: 0;
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
    min-height: 200px;
    color: #555;
    font-size: 0.85rem;
  }

  .pedido-section {
    flex-shrink: 0;
    padding-top: 4px;
  }

  /* FAB flotante — ir al pedido */
  .fab-pedido {
    position: fixed;
    bottom: 16px;
    right: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #6366f1;
    color: #fff;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.5);
    z-index: 50;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .fab-pedido:active {
    transform: scale(0.9);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
  }

  .fab-count {
    font-size: 1rem;
    font-weight: 800;
    line-height: 1;
  }

  .fab-total {
    font-size: 0.55rem;
    font-weight: 600;
    opacity: 0.85;
    line-height: 1;
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
