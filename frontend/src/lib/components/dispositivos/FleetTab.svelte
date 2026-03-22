<script lang="ts">
  import {
    dispositivosStore, selectDevice, unregisterDevice,
    elapsed, stateColor, typeIcon, setTab,
    type Device
  } from '$lib/stores/dispositivos';

  let filter: 'all' | 'online' | 'offline' = 'all';

  $: allDevices = $dispositivosStore.devices;
  $: filteredDevices = filter === 'all'
    ? allDevices
    : allDevices.filter(d => filter === 'online' ? d.state === 'online' : d.state !== 'online');
  $: stats = $dispositivosStore.deviceStats;

  function handleSelect(device: Device) {
    selectDevice(device.device_id);
    setTab('shadow');
  }

  async function handleRemove(e: Event, deviceId: string) {
    e.stopPropagation();
    if (confirm(`Eliminar dispositivo ${deviceId}?`)) {
      await unregisterDevice(deviceId);
    }
  }
</script>

<div class="fleet">
  <!-- Stats bar -->
  {#if stats}
    <div class="stats-bar">
      <div class="stat-chip">
        <span class="stat-value">{stats.total}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat-chip stat-online">
        <span class="stat-value">{stats.by_state?.online || 0}</span>
        <span class="stat-label">Online</span>
      </div>
      <div class="stat-chip stat-offline">
        <span class="stat-value">{stats.by_state?.offline || 0}</span>
        <span class="stat-label">Offline</span>
      </div>
      {#each Object.entries(stats.by_type || {}) as [type, count]}
        <div class="stat-chip">
          <span class="stat-value">{typeIcon(type)} {count}</span>
          <span class="stat-label">{type}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Filter pills -->
  <div class="filter-bar">
    <button class="pill" class:active={filter === 'all'} on:click={() => filter = 'all'}>
      Todos ({allDevices.length})
    </button>
    <button class="pill" class:active={filter === 'online'} on:click={() => filter = 'online'}>
      Online ({allDevices.filter(d => d.state === 'online').length})
    </button>
    <button class="pill" class:active={filter === 'offline'} on:click={() => filter = 'offline'}>
      Offline ({allDevices.filter(d => d.state !== 'online').length})
    </button>
  </div>

  <!-- Device grid -->
  {#if filteredDevices.length === 0}
    <div class="empty">
      <span class="empty-icon">{filter === 'all' ? '📟' : filter === 'online' ? '✓' : '⏸'}</span>
      <span class="empty-text">
        {filter === 'all' ? 'No hay dispositivos registrados' : `No hay dispositivos ${filter}`}
      </span>
    </div>
  {:else}
    <div class="device-grid">
      {#each filteredDevices as device (device.device_id)}
        <button class="device-card" on:click={() => handleSelect(device)}>
          <div class="card-header">
            <span class="card-icon">{typeIcon(device.type)}</span>
            <span class="card-dot" style="background: {stateColor(device.state)}"></span>
          </div>
          <div class="card-body">
            <span class="card-name">{device.name}</span>
            <span class="card-type">{device.type}</span>
            <div class="card-meta">
              {#if device.firmware}
                <span class="meta-tag">fw {device.firmware}</span>
              {/if}
              <span class="meta-tag">{device.protocol}</span>
              {#if device.gateway}
                <span class="meta-tag">gw:{device.gateway}</span>
              {/if}
            </div>
          </div>
          <div class="card-footer">
            <span class="card-seen">
              {device.state === 'online' ? 'ahora' : device.last_seen ? elapsed(device.last_seen) : '—'}
            </span>
            <div class="card-caps">
              {#each device.capabilities.slice(0, 3) as cap}
                <span class="cap-dot" title={cap}></span>
              {/each}
            </div>
            <button class="card-remove" on:click={(e) => handleRemove(e, device.device_id)} title="Eliminar">
              ✕
            </button>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .fleet { display: flex; flex-direction: column; gap: 12px; }

  /* Stats */
  .stats-bar {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 4px;
  }
  .stats-bar::-webkit-scrollbar { display: none; }
  .stat-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 14px;
    background: #151515;
    border: 1px solid #222;
    border-radius: 10px;
    min-width: 60px;
    flex-shrink: 0;
  }
  .stat-value { font-size: 1.1rem; font-weight: 700; }
  .stat-label { font-size: 0.6rem; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-online .stat-value { color: #22c55e; }
  .stat-offline .stat-value { color: #ef4444; }

  /* Filters */
  .filter-bar { display: flex; gap: 6px; }
  .pill {
    padding: 6px 14px;
    border-radius: 20px;
    border: 1px solid #2a2a2a;
    background: none;
    color: #888;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .pill:hover { border-color: #444; color: #ccc; }
  .pill.active { border-color: #f59e0b; background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

  /* Grid */
  .device-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }

  /* Card */
  .device-card {
    display: flex;
    flex-direction: column;
    padding: 12px;
    background: #151515;
    border: 1px solid #222;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    color: inherit;
    font: inherit;
  }
  .device-card:hover { border-color: #333; background: #1a1a1a; }
  .device-card:active { transform: scale(0.97); }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .card-icon { font-size: 1.5rem; }
  .card-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

  .card-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .card-name { font-size: 0.85rem; font-weight: 600; color: #f8fafc; }
  .card-type { font-size: 0.65rem; color: #666; }

  .card-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .meta-tag {
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    font-size: 0.6rem;
    color: #888;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #1e1e1e;
  }
  .card-seen { font-size: 0.65rem; color: #555; }
  .card-caps { display: flex; gap: 3px; }
  .cap-dot { width: 6px; height: 6px; border-radius: 50%; background: #334155; }
  .card-remove {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background: none;
    color: #444;
    font-size: 0.6rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  .card-remove:hover { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

  /* Empty */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    gap: 8px;
  }
  .empty-icon { font-size: 2.5rem; opacity: 0.3; }
  .empty-text { font-size: 0.85rem; color: #555; }
</style>
