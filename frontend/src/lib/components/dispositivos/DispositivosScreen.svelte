<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect, setupVisibilityHandler, removeVisibilityHandler } from '$lib/ui-core/mqtt';
  import {
    dispositivosStore, activeTab, healthAlerts,
    initDispositivos, initDispositivosSubscriptions,
    setTab, type TabId
  } from '$lib/stores/dispositivos';

  import FleetTab from './FleetTab.svelte';
  import ShadowTab from './ShadowTab.svelte';
  import FirmwareTab from './FirmwareTab.svelte';
  import GatewaysTab from './GatewaysTab.svelte';
  import HealthTab from './HealthTab.svelte';

  let cleanupSubs: (() => void) | null = null;

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'fleet', label: 'Fleet', icon: '📟' },
    { id: 'shadow', label: 'Shadow', icon: '🔄' },
    { id: 'firmware', label: 'Firmware', icon: '⬆' },
    { id: 'gateways', label: 'Gateways', icon: '🌐' },
    { id: 'health', label: 'Health', icon: '💓' }
  ];

  $: onlineCount = $dispositivosStore.devices.filter(d => d.state === 'online').length;
  $: totalCount = $dispositivosStore.devices.length;
  $: alertCount = $healthAlerts.length;

  onMount(async () => {
    await connect();
    cleanupSubs = initDispositivosSubscriptions();
    setupVisibilityHandler();
    await initDispositivos();
  });

  onDestroy(() => {
    cleanupSubs?.();
    removeVisibilityHandler();
    disconnect();
  });
</script>

<div class="screen">
  <!-- Header -->
  <header class="header">
    <div class="header-left">
      <h1 class="header-title">Dispositivos</h1>
      <div class="header-stats">
        <span class="stat">
          <span class="dot dot-online"></span>
          {onlineCount}/{totalCount}
        </span>
        {#if alertCount > 0}
          <span class="stat stat-alert">
            {alertCount} alerta{alertCount !== 1 ? 's' : ''}
          </span>
        {/if}
      </div>
    </div>
    <div class="header-right">
      <span class="clock">{new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  </header>

  <!-- Tab Bar -->
  <nav class="tab-bar">
    {#each tabs as tab}
      <button
        class="tab-btn"
        class:active={$activeTab === tab.id}
        on:click={() => setTab(tab.id)}
      >
        <span class="tab-icon">{tab.icon}</span>
        <span class="tab-label">{tab.label}</span>
        {#if tab.id === 'health' && alertCount > 0}
          <span class="tab-badge">{alertCount}</span>
        {/if}
      </button>
    {/each}
  </nav>

  <!-- Tab Content -->
  <main class="content">
    {#if $dispositivosStore.loading && $dispositivosStore.devices.length === 0}
      <div class="empty-state">
        <span class="empty-icon">⏳</span>
        <span class="empty-text">Cargando dispositivos...</span>
      </div>
    {:else if $activeTab === 'fleet'}
      <FleetTab />
    {:else if $activeTab === 'shadow'}
      <ShadowTab />
    {:else if $activeTab === 'firmware'}
      <FirmwareTab />
    {:else if $activeTab === 'gateways'}
      <GatewaysTab />
    {:else if $activeTab === 'health'}
      <HealthTab />
    {/if}
  </main>
</div>

<style>
  .screen {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #0a0a0a;
    color: #e5e5e5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: #111;
    border-bottom: 1px solid #222;
    flex-shrink: 0;
  }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .header-title { font-size: 1.25rem; font-weight: 700; margin: 0; }
  .header-stats { display: flex; gap: 12px; }
  .stat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: #999;
  }
  .stat-alert { color: #ef4444; font-weight: 600; }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .dot-online { background: #22c55e; box-shadow: 0 0 6px rgba(34, 197, 94, 0.5); }
  .header-right { display: flex; align-items: center; }
  .clock { font-size: 0.85rem; color: #666; font-variant-numeric: tabular-nums; }

  /* Tab Bar */
  .tab-bar {
    display: flex;
    gap: 0;
    background: #111;
    border-bottom: 1px solid #222;
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .tab-bar::-webkit-scrollbar { display: none; }

  .tab-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 12px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #666;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
    min-width: 0;
    white-space: nowrap;
  }
  .tab-btn:hover { color: #999; background: rgba(255, 255, 255, 0.03); }
  .tab-btn.active {
    color: #f59e0b;
    border-bottom-color: #f59e0b;
  }
  .tab-icon { font-size: 1rem; }
  .tab-label { font-size: 0.75rem; }
  .tab-badge {
    position: absolute;
    top: 4px;
    right: 8px;
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    background: #ef4444;
    color: #fff;
    font-size: 0.6rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
  }

  /* Content */
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    -webkit-overflow-scrolling: touch;
  }
  .content::-webkit-scrollbar { width: 6px; }
  .content::-webkit-scrollbar-track { background: #0a0a0a; }
  .content::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 60vh;
    gap: 12px;
  }
  .empty-icon { font-size: 3rem; opacity: 0.4; }
  .empty-text { font-size: 0.9rem; color: #666; }
</style>
