<script lang="ts">
  /**
   * LlevadooScreen — Pantalla de delivery Llevadoo
   *
   * Reutiliza el mismo sistema que Comandero:
   *  - Grid de CuentaCards filtrado a pedidos llevadoo_ solamente
   *  - Botón "Nuevo Pedido" que crea cuenta vía llevadoo strategy
   *  - Click en tarjeta → abre ComanderoScreen (con precios delivery)
   *
   * Las únicas diferencias con el comandero normal:
   *  1. Precios con recargo (carta_delivery en vez de carta_completa)
   *  2. Solo muestra pedidos con prefijo llevadoo_
   */
  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect, setupVisibilityHandler, removeVisibilityHandler } from '$lib/ui-core';
  import { ConnectionStatus } from '$lib/components/base';
  import {
    cuentas,
    cuentasLoading,
    cuentasCount,
    initCuentasSubscriptions,
    createLlevadoo,
    loadCuentasFromPersistencia
  } from '$lib/stores/cuentas';
  import { derived } from 'svelte/store';

  import CuentaCardMesa from '../comandero/CuentaCardMesa.svelte';

  export let projectId: string;
  export let onNavigate: ((path: string) => void) | null = null;

  let cleanupSubs: (() => void) | null = null;
  let clock = '';
  let clockInterval: ReturnType<typeof setInterval>;
  let creating = false;

  // Filtrar solo cuentas llevadoo_
  const cuentasLlevadoo = derived(cuentas, $c => $c.filter(c => c.id.startsWith('llevadoo_')));
  const cuentasLlevadooCount = derived(cuentasLlevadoo, $c => $c.length);

  function updateClock() {
    const now = new Date();
    clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  async function handleNuevoPedido() {
    if (creating) return;
    creating = true;
    try {
      const cuenta_id = await createLlevadoo(projectId);
      if (cuenta_id && onNavigate) {
        onNavigate(`/comandero/${cuenta_id}`);
      }
    } finally {
      creating = false;
    }
  }

  function handleOpenComandero(e: CustomEvent<{ cuenta_id: string }>) {
    if (onNavigate) {
      onNavigate(`/comandero/${e.detail.cuenta_id}`);
    }
  }

  function handleOpenCuenta(e: CustomEvent<{ cuenta_id: string }>) {
    if (onNavigate) {
      onNavigate(`/comandero/${e.detail.cuenta_id}?view=cuenta`);
    }
  }

  onMount(() => {
    updateClock();
    clockInterval = setInterval(updateClock, 10000);

    connect().then(() => {
      cleanupSubs = initCuentasSubscriptions(projectId);
    }).catch((err) => {
      console.error('[LlevadooScreen] MQTT connection failed', err);
    });

    setupVisibilityHandler();
  });

  onDestroy(() => {
    clearInterval(clockInterval);
    cleanupSubs?.();
    disconnect();
    removeVisibilityHandler();
  });
</script>

<div class="llevadoo-screen">
  <!-- Header -->
  <header class="screen-header">
    <div class="header-left">
      <h1 class="title">Llevadoo</h1>
      <span class="badge">Delivery</span>
      <span class="count">{$cuentasLlevadooCount}</span>
    </div>
    <div class="header-right">
      <ConnectionStatus showLabel={true} size="md" />
      <span class="clock">{clock}</span>
    </div>
  </header>

  <div class="screen-body">
    <!-- Sidebar: solo botón Nuevo Pedido -->
    <aside class="sidebar">
      <button
        class="nuevo-btn"
        class:creating
        on:click={handleNuevoPedido}
        disabled={creating}
        title="Nuevo pedido Llevadoo"
      >
        <span class="icon">+</span>
        <span class="label">{creating ? '...' : 'Nuevo'}</span>
      </button>
    </aside>

    <!-- Main grid -->
    <main class="grid-area">
      {#if $cuentasLoading && $cuentasLlevadooCount === 0}
        <div class="empty-state">
          <span class="empty-icon">...</span>
          <p>Cargando pedidos</p>
        </div>
      {:else if $cuentasLlevadooCount === 0}
        <div class="empty-state">
          <span class="empty-icon">+</span>
          <p>Sin pedidos Llevadoo</p>
          <p class="empty-hint">Pulsa "Nuevo" para crear un pedido</p>
        </div>
      {:else}
        <div class="cuentas-grid">
          {#each $cuentasLlevadoo as cuenta (cuenta.id)}
            <CuentaCardMesa
              {cuenta}
              {projectId}
              categoriasMap={{}}
              on:open-comandero={handleOpenComandero}
              on:open-cuenta={handleOpenCuenta}
            />
          {/each}
        </div>
      {/if}
    </main>
  </div>
</div>

<style>
  .llevadoo-screen {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: #0a0a0a;
    color: #e5e5e5;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .screen-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: #111;
    border-bottom: 1px solid #222;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: #f59e0b;
  }

  .badge {
    font-size: 0.6rem;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    background: #f59e0b;
    color: #000;
    font-weight: 600;
    text-transform: uppercase;
  }

  .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    background: #333;
    color: #aaa;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .clock {
    font-size: 0.9rem;
    font-weight: 600;
    color: #888;
    font-variant-numeric: tabular-nums;
  }

  .screen-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 8px;
    width: 80px;
    flex-shrink: 0;
    background: #0d0d0d;
    border-left: 1px solid #1a1a1a;
    order: 1;
    overflow-y: auto;
  }

  .nuevo-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    padding: 12px 8px;
    border: 2px solid #f59e0b;
    border-radius: 12px;
    background: color-mix(in srgb, #f59e0b 10%, transparent);
    color: #f59e0b;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .nuevo-btn:active:not(:disabled) {
    transform: scale(0.95);
    background: color-mix(in srgb, #f59e0b 25%, transparent);
  }

  .nuevo-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .nuevo-btn.creating {
    animation: pulse-create 0.6s ease-in-out infinite;
  }

  .nuevo-btn .icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  .nuevo-btn .label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  @keyframes pulse-create {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .grid-area {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 12px;
  }

  .cuentas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
    align-content: start;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    text-align: center;
    color: #555;
  }

  .empty-icon {
    font-size: 3rem;
    line-height: 1;
    color: #333;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9rem;
  }

  .empty-hint {
    font-size: 0.75rem !important;
    color: #444;
  }

  @media (max-width: 600px) {
    .screen-header { padding: 5px 10px; }
    .title { font-size: 0.85rem; }
    .count { min-width: 18px; height: 18px; font-size: 0.65rem; padding: 0 4px; }

    .screen-body { flex-direction: column; }

    .sidebar {
      flex-direction: row;
      width: 100%;
      order: 0;
      border-left: none;
      border-bottom: 1px solid #1a1a1a;
      padding: 4px 8px;
      gap: 6px;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .nuevo-btn {
      flex-direction: row;
      padding: 8px 10px;
      gap: 5px;
      border-radius: 8px;
      border-width: 1.5px;
    }
    .nuevo-btn .icon { font-size: 1.1rem; }
    .nuevo-btn .label { font-size: 0.6rem; }

    .grid-area { padding: 6px; }
    .cuentas-grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 6px;
    }
    .empty-icon { font-size: 2rem; }
    .empty-state p { font-size: 0.75rem; }
  }

  @media (min-width: 601px) and (max-width: 1024px) {
    .cuentas-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media (min-width: 1400px) {
    .cuentas-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  }
</style>
