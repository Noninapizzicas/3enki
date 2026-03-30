<script lang="ts">
  import {
    dispositivosStore, loadHealthDashboard, loadAlerts,
    elapsed, stateColor, typeIcon,
    type HealthDevice, type HealthAlert
  } from '$lib/stores/dispositivos';

  $: summary = $dispositivosStore.healthSummary;
  $: healthDevices = $dispositivosStore.healthDevices;
  $: alerts = $dispositivosStore.healthAlerts;

  // Separate active vs resolved alerts
  $: activeAlerts = alerts.filter(a => !a.resolved);
  $: resolvedAlerts = alerts.filter(a => a.resolved);

  // Sort devices: offline first, then by uptime ascending
  $: sortedDevices = [...healthDevices].sort((a, b) => {
    if (a.is_offline !== b.is_offline) return a.is_offline ? -1 : 1;
    return a.uptime_pct_24h - b.uptime_pct_24h;
  });

  async function handleRefresh() {
    await Promise.all([loadHealthDashboard(), loadAlerts()]);
  }

  function uptimeColor(pct: number): string {
    if (pct >= 99) return '#22c55e';
    if (pct >= 95) return '#eab308';
    if (pct >= 80) return '#f97316';
    return '#ef4444';
  }

  function alertIcon(type: string): string {
    switch (type) {
      case 'offline': return '⚠';
      case 'reconnect_loop': return '🔁';
      case 'ota_failed': return '❌';
      default: return '⚡';
    }
  }

  function alertTypeLabel(type: string): string {
    switch (type) {
      case 'offline': return 'Offline';
      case 'reconnect_loop': return 'Reconexión';
      case 'ota_failed': return 'OTA fallida';
      default: return type;
    }
  }
</script>

<div class="health-tab">
  <!-- Summary Cards -->
  {#if summary}
    <div class="summary-bar">
      <div class="summary-card">
        <span class="summary-value">{summary.total}</span>
        <span class="summary-label">Total</span>
      </div>
      <div class="summary-card card-online">
        <span class="summary-value">{summary.online}</span>
        <span class="summary-label">Online</span>
      </div>
      <div class="summary-card card-offline">
        <span class="summary-value">{summary.offline}</span>
        <span class="summary-label">Offline</span>
      </div>
      <div class="summary-card card-alerts">
        <span class="summary-value">{summary.active_alerts}</span>
        <span class="summary-label">Alertas</span>
      </div>
      <div class="summary-card card-uptime">
        <span class="summary-value" style="color: {uptimeColor(summary.avg_uptime_pct)}">
          {summary.avg_uptime_pct.toFixed(1)}%
        </span>
        <span class="summary-label">Uptime 24h</span>
      </div>
    </div>
  {/if}

  <!-- Active Alerts -->
  <div class="section-header">
    <h2 class="section-title">Alertas activas</h2>
    {#if activeAlerts.length > 0}
      <span class="badge-alert">{activeAlerts.length}</span>
    {/if}
    <button class="btn-icon" on:click={handleRefresh}>↻</button>
  </div>

  {#if activeAlerts.length === 0}
    <div class="no-alerts">
      <span class="no-alerts-icon">✓</span>
      <span class="no-alerts-text">Sin alertas activas</span>
    </div>
  {:else}
    <div class="alert-list">
      {#each activeAlerts as alert}
        <div class="alert-row alert-active">
          <span class="alert-icon">{alertIcon(alert.type)}</span>
          <span class="alert-device">{alert.device_id}</span>
          <span class="alert-type-badge">{alertTypeLabel(alert.type)}</span>
          <span class="alert-msg">{alert.message}</span>
          <span class="alert-time">{elapsed(alert.timestamp)}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Fleet Health Table -->
  {#if sortedDevices.length > 0}
    <div class="section-header">
      <h2 class="section-title">Estado de la flota</h2>
    </div>

    <div class="fleet-table">
      <div class="table-header">
        <span class="th-device">Dispositivo</span>
        <span class="th-status">Estado</span>
        <span class="th-uptime">Uptime 24h</span>
        <span class="th-reconn">Reconexiones</span>
        <span class="th-offline">Offline</span>
      </div>

      {#each sortedDevices as hd (hd.device_id)}
        <div class="table-row" class:row-problem={hd.is_offline || hd.uptime_pct_24h < 95}>
          <span class="td-device">
            <span class="td-dot" style="background: {hd.is_offline ? '#ef4444' : '#22c55e'}"></span>
            {hd.device_id}
          </span>
          <span class="td-status" class:offline={hd.is_offline}>
            {hd.is_offline ? 'Offline' : 'Online'}
          </span>
          <span class="td-uptime">
            <span class="uptime-bar-bg">
              <span
                class="uptime-bar-fill"
                style="width: {hd.uptime_pct_24h}%; background: {uptimeColor(hd.uptime_pct_24h)}"
              ></span>
            </span>
            <span class="uptime-pct" style="color: {uptimeColor(hd.uptime_pct_24h)}">
              {hd.uptime_pct_24h.toFixed(1)}%
            </span>
          </span>
          <span class="td-reconn" class:reconn-warn={hd.reconnections_24h >= 5}>
            {hd.reconnections_24h}
          </span>
          <span class="td-offline-time">
            {#if hd.is_offline && hd.consecutive_offline_min > 0}
              {hd.consecutive_offline_min}min
            {:else}
              —
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Resolved Alerts (collapsed) -->
  {#if resolvedAlerts.length > 0}
    <div class="section-header">
      <h2 class="section-title">Alertas resueltas</h2>
      <span class="badge-resolved">{resolvedAlerts.length}</span>
    </div>
    <div class="alert-list">
      {#each resolvedAlerts.slice(0, 10) as alert}
        <div class="alert-row alert-resolved">
          <span class="alert-icon">{alertIcon(alert.type)}</span>
          <span class="alert-device">{alert.device_id}</span>
          <span class="alert-type-badge">{alertTypeLabel(alert.type)}</span>
          <span class="alert-msg">{alert.message}</span>
          <span class="alert-time">{elapsed(alert.timestamp)}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Info -->
  <div class="info-box">
    <p class="info-text">
      Health monitorea la flota en tiempo real. Alertas por desconexión (&gt;5min), bucles de reconexión (5+ en 30min)
      y fallos OTA. El uptime se calcula sobre las últimas 24h.
    </p>
  </div>
</div>

<style>
  .health-tab { display: flex; flex-direction: column; gap: 16px; }

  /* Summary */
  .summary-bar {
    display: flex; gap: 8px; overflow-x: auto;
    scrollbar-width: none; padding-bottom: 4px;
  }
  .summary-bar::-webkit-scrollbar { display: none; }
  .summary-card {
    display: flex; flex-direction: column; align-items: center;
    padding: 10px 16px; background: #151515; border: 1px solid #222;
    border-radius: 10px; min-width: 70px; flex-shrink: 0;
  }
  .summary-value { font-size: 1.3rem; font-weight: 700; }
  .summary-label { font-size: 0.6rem; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .card-online .summary-value { color: #22c55e; }
  .card-offline .summary-value { color: #ef4444; }
  .card-alerts .summary-value { color: #eab308; }

  /* Section */
  .section-header { display: flex; align-items: center; gap: 8px; }
  .section-title { font-size: 0.85rem; font-weight: 600; margin: 0; }
  .btn-icon {
    width: 26px; height: 26px; border-radius: 50%; border: 1px solid #333;
    background: none; color: #888; cursor: pointer; transition: all 0.15s;
    margin-left: auto;
  }
  .btn-icon:hover { color: #ccc; border-color: #555; }
  .badge-alert {
    padding: 2px 8px; border-radius: 10px; font-size: 0.6rem; font-weight: 700;
    background: rgba(239, 68, 68, 0.15); color: #ef4444;
  }
  .badge-resolved {
    padding: 2px 8px; border-radius: 10px; font-size: 0.6rem; font-weight: 700;
    background: rgba(100, 100, 100, 0.15); color: #666;
  }

  /* No alerts */
  .no-alerts {
    display: flex; align-items: center; gap: 8px;
    padding: 16px 20px; background: rgba(34, 197, 94, 0.05);
    border: 1px solid rgba(34, 197, 94, 0.15); border-radius: 10px;
  }
  .no-alerts-icon { font-size: 1rem; color: #22c55e; }
  .no-alerts-text { font-size: 0.8rem; color: #22c55e; }

  /* Alert list */
  .alert-list { display: flex; flex-direction: column; gap: 3px; }
  .alert-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; border-radius: 8px; font-size: 0.75rem;
  }
  .alert-active { background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.15); }
  .alert-resolved { background: #111; border: 1px solid #1a1a1a; opacity: 0.6; }
  .alert-icon { font-size: 0.9rem; flex-shrink: 0; }
  .alert-device { font-weight: 500; min-width: 100px; }
  .alert-type-badge {
    padding: 2px 8px; border-radius: 4px; font-size: 0.6rem; font-weight: 600;
    background: rgba(239, 68, 68, 0.1); color: #ef4444;
  }
  .alert-resolved .alert-type-badge { background: rgba(100,100,100,0.1); color: #666; }
  .alert-msg { flex: 1; color: #888; font-size: 0.7rem; }
  .alert-time { color: #444; font-size: 0.65rem; white-space: nowrap; }

  /* Fleet table */
  .fleet-table {
    display: flex; flex-direction: column; gap: 2px;
    background: #111; border-radius: 10px; padding: 4px; overflow-x: auto;
  }
  .table-header, .table-row {
    display: grid;
    grid-template-columns: 2fr 80px 1.5fr 90px 70px;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    font-size: 0.7rem;
  }
  .table-header {
    color: #555; font-weight: 600; text-transform: uppercase;
    font-size: 0.6rem; letter-spacing: 0.5px;
    border-bottom: 1px solid #1a1a1a;
  }
  .table-row { background: #151515; border-radius: 6px; }
  .table-row.row-problem { background: rgba(239, 68, 68, 0.04); }

  .td-device { display: flex; align-items: center; gap: 6px; font-weight: 500; }
  .td-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .td-status { color: #22c55e; font-size: 0.65rem; font-weight: 600; }
  .td-status.offline { color: #ef4444; }

  .td-uptime { display: flex; align-items: center; gap: 6px; }
  .uptime-bar-bg {
    flex: 1; height: 4px; background: #222; border-radius: 2px; overflow: hidden;
  }
  .uptime-bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
  .uptime-pct { font-size: 0.65rem; font-weight: 600; white-space: nowrap; min-width: 40px; text-align: right; }

  .td-reconn { text-align: center; color: #888; }
  .td-reconn.reconn-warn { color: #eab308; font-weight: 600; }
  .td-offline-time { text-align: center; color: #555; font-size: 0.65rem; }

  @media (max-width: 700px) {
    .table-header, .table-row {
      grid-template-columns: 1.5fr 60px 1fr 60px;
    }
    .th-offline, .td-offline-time { display: none; }
  }

  /* Info */
  .info-box {
    padding: 12px 16px; background: #111; border-radius: 8px;
    border-left: 3px solid #334155;
  }
  .info-text { font-size: 0.7rem; color: #555; margin: 0; line-height: 1.5; }
</style>
