<script lang="ts">
  /**
   * DispositivosPanel — Panel flotante IoT dentro de LazyShell
   *
   * Misma funcionalidad que DispositivosScreen pero integrado
   * en el sistema de paneles con chat/IA disponible.
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    dispositivosStore, activeTab, healthAlerts,
    initDispositivos, initDispositivosSubscriptions,
    setTab, type TabId
  } from '$lib/stores/dispositivos';
  import { updatePageState } from '$lib/stores/page-context';

  import FleetTab from '$lib/components/dispositivos/FleetTab.svelte';
  import ImpresorasTab from '$lib/components/dispositivos/ImpresorasTab.svelte';
  import ShadowTab from '$lib/components/dispositivos/ShadowTab.svelte';
  import FirmwareTab from '$lib/components/dispositivos/FirmwareTab.svelte';
  import GatewaysTab from '$lib/components/dispositivos/GatewaysTab.svelte';
  import HealthTab from '$lib/components/dispositivos/HealthTab.svelte';

  export let panelId: string = '';

  let cleanupSubs: (() => void) | null = null;

  import { impresoras, impresorasOnline } from '$lib/stores/dispositivos';

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'fleet', label: 'Fleet', icon: '📟' },
    { id: 'impresoras', label: 'Impresoras', icon: '🖨' },
    { id: 'shadow', label: 'Shadow', icon: '🔄' },
    { id: 'firmware', label: 'Firmware', icon: '⬆' },
    { id: 'gateways', label: 'Gateways', icon: '🌐' },
    { id: 'health', label: 'Health', icon: '💓' }
  ];

  $: onlineCount = $dispositivosStore.devices.filter(d => d.state === 'online').length;
  $: totalCount = $dispositivosStore.devices.length;
  $: alertCount = $healthAlerts.length;

  // Sync state to page context for the AI
  $: updatePageState('devices', { online: onlineCount, total: totalCount, alerts: alertCount });
  $: updatePageState('activeTab', $activeTab);

  function handleSetTab(tab: TabId) {
    setTab(tab);
    updatePageState('activeTab', tab);
  }

  onMount(async () => {
    cleanupSubs = initDispositivosSubscriptions();
    await initDispositivos();
  });

  onDestroy(() => {
    cleanupSubs?.();
  });
</script>

<div class="panel-dispositivos">
  <!-- Header Stats -->
  <div class="stats-bar">
    <span class="stat">
      <span class="dot dot-online"></span>
      {onlineCount}/{totalCount} online
    </span>
    {#if alertCount > 0}
      <span class="stat stat-alert">
        {alertCount} alerta{alertCount !== 1 ? 's' : ''}
      </span>
    {/if}
  </div>

  <!-- Tab Bar -->
  <nav class="tab-bar">
    {#each tabs as tab}
      <button
        class="tab-btn"
        class:active={$activeTab === tab.id}
        on:click={() => handleSetTab(tab.id)}
      >
        <span class="tab-icon">{tab.icon}</span>
        <span class="tab-label">{tab.label}</span>
        {#if tab.id === 'health' && alertCount > 0}
          <span class="tab-badge">{alertCount}</span>
        {/if}
        {#if tab.id === 'impresoras' && $impresoras.length > 0}
          <span class="tab-badge printer-badge">{$impresorasOnline.length}/{$impresoras.length}</span>
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
    {:else if $activeTab === 'impresoras'}
      <ImpresorasTab />
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
  .panel-dispositivos {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0a0a0a;
    color: #e5e5e5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  /* Stats */
  .stats-bar {
    display: flex;
    gap: 12px;
    padding: 8px 12px;
    background: #111;
    border-bottom: 1px solid #222;
    flex-shrink: 0;
  }
  .stat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: #999;
  }
  .stat-alert { color: #ef4444; font-weight: 600; }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .dot-online { background: #22c55e; box-shadow: 0 0 6px rgba(34, 197, 94, 0.5); }

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
    gap: 4px;
    padding: 8px 6px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #666;
    font-size: 0.7rem;
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
  .tab-icon { font-size: 0.85rem; }
  .tab-label { font-size: 0.65rem; }
  .tab-badge {
    position: absolute;
    top: 2px;
    right: 4px;
    min-width: 14px;
    height: 14px;
    border-radius: 7px;
    background: #ef4444;
    color: #fff;
    font-size: 0.55rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
  }
  .tab-badge.printer-badge {
    background: #22c55e;
  }

  /* Content */
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    -webkit-overflow-scrolling: touch;
  }
  .content::-webkit-scrollbar { width: 5px; }
  .content::-webkit-scrollbar-track { background: #0a0a0a; }
  .content::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: 8px;
  }
  .empty-icon { font-size: 2rem; opacity: 0.4; }
  .empty-text { font-size: 0.8rem; color: #666; }
</style>
