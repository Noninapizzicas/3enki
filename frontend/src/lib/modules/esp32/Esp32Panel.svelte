<script lang="ts">
  /**
   * Esp32Panel — Panel de desarrollo ESP32 dentro de LazyShell
   *
   * 3 tabs principales con sub-tabs:
   *   Drivers:  Drivers   | Build
   *   Firmware: Catalogo  | OTAs      | Rollback
   *   Flash:    Puertos   | Grabar    | Monitor
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    esp32Store, activeTab, initEsp32, initEsp32Subscriptions,
    setTab, type TabId
  } from '$lib/stores/esp32';

  import DevTab from '$lib/components/esp32/DevTab.svelte';
  import FirmwareTab from '$lib/components/esp32/FirmwareTab.svelte';
  import FlashTab from '$lib/components/esp32/FlashTab.svelte';

  export let panelId: string = '';

  let cleanupSubs: (() => void) | null = null;

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'drivers', label: 'Drivers', icon: '🔧' },
    { id: 'firmware', label: 'Firmware', icon: '⬆' },
    { id: 'flash', label: 'Flash', icon: '⚡' }
  ];

  $: driverCount = $esp32Store.drivers.length;
  $: portCount = $esp32Store.ports.length;
  $: isMonitoring = $esp32Store.monitorPort !== null;
  $: activeFlashCount = $esp32Store.activeFlashes.length;
  $: otaPendingCount = $esp32Store.otaPending.length;

  function handleSetTab(tab: TabId) {
    setTab(tab);
  }

  onMount(async () => {
    cleanupSubs = initEsp32Subscriptions();
    await initEsp32();
  });

  onDestroy(() => {
    cleanupSubs?.();
  });
</script>

<div class="panel-esp32">
  <!-- Header Stats -->
  <div class="stats-bar">
    <span class="stat">
      <span class="stat-num">{driverCount}</span> driver{driverCount !== 1 ? 's' : ''}
    </span>
    <span class="stat">
      <span class="dot" class:dot-active={portCount > 0}></span>
      {portCount} puerto{portCount !== 1 ? 's' : ''}
    </span>
    {#if isMonitoring}
      <span class="stat stat-monitor">
        serial activo
      </span>
    {/if}
    {#if activeFlashCount > 0}
      <span class="stat stat-flash">
        flashing...
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
        {#if tab.id === 'firmware' && otaPendingCount > 0}
          <span class="tab-badge">{otaPendingCount}</span>
        {/if}
        {#if tab.id === 'flash' && isMonitoring}
          <span class="tab-badge-live">LIVE</span>
        {:else if tab.id === 'flash' && activeFlashCount > 0}
          <span class="tab-badge">{activeFlashCount}</span>
        {/if}
      </button>
    {/each}
  </nav>

  <!-- Tab Content -->
  <main class="content">
    {#if $esp32Store.loading && $esp32Store.drivers.length === 0}
      <div class="empty-state">
        <span class="empty-icon">⏳</span>
        <span class="empty-text">Cargando...</span>
      </div>
    {:else if $activeTab === 'drivers'}
      <DevTab />
    {:else if $activeTab === 'firmware'}
      <FirmwareTab />
    {:else if $activeTab === 'flash'}
      <FlashTab />
    {/if}
  </main>
</div>

<style>
  .panel-esp32 {
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
  .stat-num { font-weight: 600; color: #ccc; }
  .stat-monitor { color: #22c55e; font-weight: 600; }
  .stat-flash { color: #3b82f6; font-weight: 600; }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #333;
  }
  .dot-active { background: #22c55e; box-shadow: 0 0 6px rgba(34, 197, 94, 0.5); }

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
    min-width: 14px;
    height: 14px;
    border-radius: 7px;
    background: #3b82f6;
    color: #fff;
    font-size: 0.55rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
  }
  .tab-badge-live {
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    animation: pulse 2s infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  /* Content */
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
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
