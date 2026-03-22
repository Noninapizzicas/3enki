<script lang="ts">
  import {
    dispositivosStore, loadGateways, restartGateway, discoverGateway
  } from '$lib/stores/dispositivos';

  let discovering: string | null = null;
  let discoveredDevices: any[] = [];

  $: gateways = $dispositivosStore.gateways;
  $: activeGateways = gateways.filter(g => g.running);
  $: inactiveGateways = gateways.filter(g => !g.running);

  async function handleRestart(type: string) {
    await restartGateway(type);
  }

  async function handleDiscover(type: string) {
    discovering = type;
    discoveredDevices = await discoverGateway(type);
    discovering = null;
  }

  function gwIcon(type: string): string {
    switch (type) {
      case 'tcp': return '🔌';
      case 'ble': return '📶';
      case 'usb': return '🔗';
      case 'cmd': return '⌨';
      default: return '🌐';
    }
  }

  function gwDescription(type: string): string {
    switch (type) {
      case 'tcp': return 'Impresoras de red, CNC, displays IP (puerto 9100)';
      case 'ble': return 'Impresoras Bluetooth directas (rfcomm)';
      case 'usb': return 'Impresoras USB conectadas al servidor';
      case 'cmd': return 'CUPS, lp, scripts shell personalizados';
      default: return '';
    }
  }
</script>

<div class="gateways-tab">
  <!-- Active gateways -->
  {#if activeGateways.length > 0}
    <div class="section-header">
      <h2 class="section-title">Gateways activos</h2>
      <button class="btn-icon" on:click={() => loadGateways()}>↻</button>
    </div>

    <div class="gw-grid">
      {#each activeGateways as gw (gw.type)}
        <div class="gw-card gw-active">
          <div class="gw-header">
            <span class="gw-icon">{gwIcon(gw.type)}</span>
            <span class="gw-name">gateway-{gw.type}</span>
            <span class="gw-state-badge running">running</span>
          </div>
          <p class="gw-desc">{gwDescription(gw.type)}</p>

          <div class="gw-stats">
            <div class="gw-stat">
              <span class="gw-stat-value">{gw.devices_count}</span>
              <span class="gw-stat-label">dispositivos</span>
            </div>
            {#if gw.metrics}
              <div class="gw-stat">
                <span class="gw-stat-value">{gw.metrics.commands_processed || 0}</span>
                <span class="gw-stat-label">comandos</span>
              </div>
              <div class="gw-stat">
                <span class="gw-stat-value">{gw.metrics.errors || 0}</span>
                <span class="gw-stat-label">errores</span>
              </div>
            {/if}
          </div>

          <!-- Devices managed -->
          {#if gw.devices && gw.devices.length > 0}
            <div class="gw-devices">
              {#each gw.devices as d}
                <div class="gw-device-row">
                  <span class="gw-dev-dot" style="background: {d.state === 'online' ? '#22c55e' : '#ef4444'}"></span>
                  <span class="gw-dev-name">{d.device_id}</span>
                  <span class="gw-dev-type">{d.type}</span>
                </div>
              {/each}
            </div>
          {/if}

          <div class="gw-actions">
            <button class="btn-action" on:click={() => handleRestart(gw.type)}>Reiniciar</button>
            <button class="btn-action btn-discover" on:click={() => handleDiscover(gw.type)}>
              {discovering === gw.type ? 'Escaneando...' : 'Descubrir'}
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Inactive gateways -->
  {#if inactiveGateways.length > 0}
    <div class="section-header">
      <h2 class="section-title">Gateways disponibles</h2>
    </div>

    <div class="gw-grid">
      {#each inactiveGateways as gw (gw.type)}
        <div class="gw-card gw-inactive">
          <div class="gw-header">
            <span class="gw-icon">{gwIcon(gw.type)}</span>
            <span class="gw-name">gateway-{gw.type}</span>
            <span class="gw-state-badge stopped">{gw.enabled ? 'enabled' : 'disabled'}</span>
          </div>
          <p class="gw-desc">{gwDescription(gw.type)}</p>
          <div class="gw-actions">
            <button class="btn-action btn-discover" on:click={() => handleDiscover(gw.type)}>
              {discovering === gw.type ? 'Escaneando...' : 'Probar descubrimiento'}
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Discovery results -->
  {#if discoveredDevices.length > 0}
    <div class="section-header">
      <h2 class="section-title">Dispositivos descubiertos</h2>
      <span class="badge-count">{discoveredDevices.length}</span>
    </div>
    <div class="discovered-list">
      {#each discoveredDevices as d}
        <div class="discovered-row">
          <span class="disc-name">{d.device_id || d.nombre || '?'}</span>
          <span class="disc-type">{d.type || d.tipo || 'unknown'}</span>
          {#if d.host}
            <span class="disc-meta">{d.host}:{d.port || d.puerto}</span>
          {/if}
          {#if d.mac}
            <span class="disc-meta">{d.mac}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Info -->
  <div class="info-box">
    <p class="info-text">
      Los gateways traducen MQTT a protocolos nativos. Desde el servidor, un gateway es indistinguible de un ESP32 real.
      Habilita gateways en <code>config.json → gateways.tcp.enabled = true</code>.
    </p>
  </div>
</div>

<style>
  .gateways-tab { display: flex; flex-direction: column; gap: 16px; }

  .section-header { display: flex; align-items: center; gap: 8px; }
  .section-title { font-size: 0.85rem; font-weight: 600; margin: 0; }
  .btn-icon {
    width: 26px; height: 26px; border-radius: 50%; border: 1px solid #333;
    background: none; color: #888; cursor: pointer;
  }
  .badge-count {
    padding: 2px 8px; border-radius: 10px; font-size: 0.6rem; font-weight: 700;
    background: rgba(34,197,94,0.15); color: #22c55e;
  }

  .gw-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }

  .gw-card {
    padding: 14px;
    border-radius: 12px;
    border: 1px solid #222;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .gw-active { background: #151515; }
  .gw-inactive { background: #0d0d0d; opacity: 0.7; }
  .gw-inactive:hover { opacity: 1; }

  .gw-header { display: flex; align-items: center; gap: 8px; }
  .gw-icon { font-size: 1.2rem; }
  .gw-name { font-size: 0.85rem; font-weight: 600; flex: 1; }
  .gw-state-badge {
    padding: 3px 8px; border-radius: 8px; font-size: 0.6rem; font-weight: 600;
  }
  .gw-state-badge.running { background: rgba(34,197,94,0.15); color: #22c55e; }
  .gw-state-badge.stopped { background: rgba(100,100,100,0.15); color: #666; }

  .gw-desc { font-size: 0.7rem; color: #555; margin: 0; }

  .gw-stats { display: flex; gap: 12px; }
  .gw-stat { display: flex; flex-direction: column; align-items: center; }
  .gw-stat-value { font-size: 1.1rem; font-weight: 700; }
  .gw-stat-label { font-size: 0.55rem; color: #555; text-transform: uppercase; }

  .gw-devices {
    display: flex; flex-direction: column; gap: 3px;
    padding: 8px; background: #0d0d0d; border-radius: 6px;
  }
  .gw-device-row { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; }
  .gw-dev-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
  .gw-dev-name { font-weight: 500; flex: 1; }
  .gw-dev-type { color: #555; font-size: 0.6rem; }

  .gw-actions { display: flex; gap: 6px; }
  .btn-action {
    padding: 5px 12px; border-radius: 6px; border: 1px solid #333;
    background: none; color: #888; font-size: 0.7rem; cursor: pointer;
    transition: all 0.15s;
  }
  .btn-action:hover { border-color: #555; color: #ccc; }
  .btn-discover { border-color: #f59e0b33; color: #f59e0b; }
  .btn-discover:hover { background: rgba(245,158,11,0.08); }

  /* Discovered */
  .discovered-list { display: flex; flex-direction: column; gap: 3px; }
  .discovered-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; background: #151515; border-radius: 6px; font-size: 0.75rem;
  }
  .disc-name { font-weight: 500; flex: 1; }
  .disc-type { color: #888; font-size: 0.65rem; }
  .disc-meta { color: #555; font-size: 0.65rem; font-family: monospace; }

  /* Info */
  .info-box {
    padding: 12px 16px; background: #111; border-radius: 8px;
    border-left: 3px solid #334155;
  }
  .info-text { font-size: 0.7rem; color: #555; margin: 0; line-height: 1.5; }
  .info-text code {
    padding: 1px 4px; background: #1a1a1a; border-radius: 3px;
    font-family: monospace; font-size: 0.65rem; color: #888;
  }
</style>
