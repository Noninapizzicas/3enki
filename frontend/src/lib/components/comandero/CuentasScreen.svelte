<script lang="ts">
  /**
   * CuentasScreen — Pantalla principal de cuentas activas
   *
   * Filosofía: empieza vacía, se llena de vida con el trabajo.
   * NO es un POS típico. Es flujo de trabajo dinámico.
   *
   * Scoped por proyecto: recibe projectId como prop.
   *
   * Layout:
   * ┌──────────────────────────────┬──────┐
   * │ Header (proyecto, reloj)     │      │
   * ├──────────────────────────────┤ Side │
   * │                              │ bar  │
   * │   Grid de CuentaCards        │(tipo │
   * │   (o estado vacío)           │ btns)│
   * │                              │      │
   * └──────────────────────────────┴──────┘
   *
   * Mobile: sidebar se mueve arriba como barra horizontal
   */
  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect, setupVisibilityHandler, removeVisibilityHandler } from '$lib/ui-core';
  import { ConnectionStatus } from '$lib/components/base';
  import {
    cuentas,
    cuentasLoading,
    cuentasCount,
    initCuentasSubscriptions,
    type TipoCuenta
  } from '$lib/stores/cuentas';

  import TipoButton from './TipoButton.svelte';
  import CuentaCard from './CuentaCard.svelte';

  // Props
  export let onNavigate: ((path: string) => void) | null = null;
  export let projectId: string = '';

  let cleanupSubs: (() => void) | null = null;
  let clock = '';
  let clockInterval: ReturnType<typeof setInterval>;

  // Clock
  function updateClock() {
    const now = new Date();
    clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  // Navigation handlers
  function handleCreated(e: CustomEvent<{ cuenta_id: string; tipo: TipoCuenta }>) {
    // New cuenta created via sidebar → open comandero for it
    if (onNavigate) {
      onNavigate(`/comandero/${e.detail.cuenta_id}`);
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

  const tipos: TipoCuenta[] = ['local', 'delivery', 'llevar'];

  onMount(() => {
    updateClock();
    clockInterval = setInterval(updateClock, 10000);

    // Connect MQTT + init subscriptions
    connect().then(() => {
      cleanupSubs = initCuentasSubscriptions(projectId);
    }).catch((err) => {
      console.error('[CuentasScreen] MQTT connection failed', err);
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

<div class="cuentas-screen">
  <!-- Header -->
  <header class="screen-header">
    <div class="header-left">
      <h1 class="title">{projectId || 'Cuentas'}</h1>
      <span class="count">{$cuentasCount}</span>
    </div>
    <div class="header-right">
      <ConnectionStatus showLabel={true} size="md" />
      <span class="clock">{clock}</span>
    </div>
  </header>

  <div class="screen-body">
    <!-- Sidebar: type buttons (right on desktop, top on mobile) -->
    <aside class="sidebar">
      {#each tipos as tipo}
        <TipoButton {tipo} {projectId} on:created={handleCreated} />
      {/each}
    </aside>

    <!-- Main grid -->
    <main class="grid-area">
      {#if $cuentasLoading && $cuentasCount === 0}
        <div class="empty-state">
          <span class="empty-icon">...</span>
          <p>Cargando cuentas</p>
        </div>
      {:else if $cuentasCount === 0}
        <div class="empty-state">
          <span class="empty-icon">+</span>
          <p>Sin cuentas abiertas</p>
          <p class="empty-hint">Pulsa un tipo de cuenta para empezar</p>
        </div>
      {:else}
        <div class="cuentas-grid">
          {#each $cuentas as cuenta (cuenta.id)}
            <CuentaCard
              {cuenta}
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
  .cuentas-screen {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: #0a0a0a;
    color: #e5e5e5;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  /* Header */
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
    color: #fff;
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
    font-variant-numeric: tabular-nums;
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

  /* Body layout */
  .screen-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 8px;
    width: 80px;
    flex-shrink: 0;
    background: #0d0d0d;
    border-left: 1px solid #1a1a1a;
    order: 1; /* Right side */
    overflow-y: auto;
  }

  /* Grid area */
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

  /* Empty state */
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

  /* Mobile: sidebar becomes horizontal bar at top */
  @media (max-width: 600px) {
    .screen-body {
      flex-direction: column;
    }

    .sidebar {
      flex-direction: row;
      width: 100%;
      order: 0; /* Top */
      border-left: none;
      border-bottom: 1px solid #1a1a1a;
      padding: 8px 12px;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .cuentas-grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }
  }

  /* Tablet */
  @media (min-width: 601px) and (max-width: 1024px) {
    .cuentas-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Wide */
  @media (min-width: 1400px) {
    .cuentas-grid {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }
  }
</style>
