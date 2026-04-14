<script lang="ts">
  /**
   * DeviceStatusPanel — Panel slide-in con resumen del parque de dispositivos.
   * Se abre desde DeviceStatusButton. Muestra:
   *   - Fleet overview (online/offline por tipo)
   *   - Alertas activas
   *   - Acciones rápidas (ir a la página completa)
   *
   * Sigue el patrón de CocinaConfigPanel: slide-in desde la derecha.
   */

  import { createEventDispatcher } from 'svelte';
  import {
    dispositivosStore, healthAlerts, devicesOnline, devicesOffline,
    type Device, type HealthAlert
  } from '$lib/stores/dispositivos';

  const dispatch = createEventDispatcher();

  $: devices = $dispositivosStore.devices;
  $: stats = $dispositivosStore.deviceStats;
  $: alerts = $healthAlerts;
  $: online = $devicesOnline;
  $: offline = $devicesOffline;
  $: healthSummary = $dispositivosStore.healthSummary;

  // Agrupar dispositivos por tipo
  $: byType = devices.reduce((acc, d) => {
    if (!acc[d.type]) acc[d.type] = { online: 0, offline: 0, total: 0 };
    acc[d.type].total++;
    if (d.state === 'online') acc[d.type].online++;
    else acc[d.type].offline++;
    return acc;
  }, {} as Record<string, { online: number; offline: number; total: number }>);

  function typeIcon(type: string): string {
    const icons: Record<string, string> = {
      'print-proxy': '🖨',
      'cocina-display': '📺',
      'gateway-tcp': '🌐',
      'gateway-ble': '📡',
      'sensor': '🌡',
      'camera': '📷'
    };
    return icons[type] || '📟';
  }

  function elapsed(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  function alertIcon(type: string): string {
    if (type === 'offline') return '⏸';
    if (type === 'reconnect_loop') return '🔄';
    if (type === 'ota_failed') return '⚠';
    return '❗';
  }

  function close() {
    dispatch('close');
  }

  function goToDispositivos() {
    // Navegar a la página completa de dispositivos
    const projectId = window.location.pathname.split('/')[1];
    if (projectId) {
      window.location.href = `/${projectId}/dispositivos`;
    }
    close();
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="overlay" on:click={close}></div>
<aside class="panel">
  <!-- Header -->
  <header class="panel-header">
    <h2 class="panel-title">Dispositivos</h2>
    <button class="close-btn" on:click={close}>✕</button>
  </header>

  <div class="panel-content">
    <!-- Fleet overview -->
    <section class="section">
      <h3 class="section-title">Fleet</h3>
      <div class="stats-row">
        <div class="stat-box stat-online">
          <span class="stat-number">{online.length}</span>
          <span class="stat-label">Online</span>
        </div>
        <div class="stat-box stat-offline">
          <span class="stat-number">{offline.length}</span>
          <span class="stat-label">Offline</span>
        </div>
        {#if healthSummary}
          <div class="stat-box">
            <span class="stat-number">{Math.round(healthSummary.avg_uptime_pct)}%</span>
            <span class="stat-label">Uptime</span>
          </div>
        {/if}
      </div>
    </section>

    <!-- By type -->
    {#if Object.keys(byType).length > 0}
      <section class="section">
        <h3 class="section-title">Por tipo</h3>
        <div class="type-list">
          {#each Object.entries(byType) as [type, counts]}
            <div class="type-row">
              <span class="type-icon">{typeIcon(type)}</span>
              <span class="type-name">{type}</span>
              <span class="type-count">
                <span class="dot dot-on"></span>{counts.online}
                {#if counts.offline > 0}
                  <span class="dot dot-off"></span>{counts.offline}
                {/if}
              </span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Alerts -->
    {#if alerts.length > 0}
      <section class="section">
        <h3 class="section-title section-title-alert">
          Alertas <span class="alert-count">{alerts.length}</span>
        </h3>
        <div class="alert-list">
          {#each alerts.slice(0, 5) as alert}
            <div class="alert-row">
              <span class="alert-icon">{alertIcon(alert.type)}</span>
              <div class="alert-body">
                <span class="alert-device">{alert.device_id}</span>
                <span class="alert-msg">{alert.message}</span>
              </div>
              <span class="alert-time">{elapsed(alert.timestamp)}</span>
            </div>
          {/each}
          {#if alerts.length > 5}
            <div class="alert-more">+{alerts.length - 5} más</div>
          {/if}
        </div>
      </section>
    {:else}
      <section class="section">
        <div class="all-good">
          <span class="all-good-icon">✓</span>
          <span>Sin alertas activas</span>
        </div>
      </section>
    {/if}

    <!-- Offline devices -->
    {#if offline.length > 0}
      <section class="section">
        <h3 class="section-title">Offline</h3>
        <div class="offline-list">
          {#each offline as device}
            <div class="offline-row">
              <span class="offline-icon">{typeIcon(device.type)}</span>
              <span class="offline-name">{device.name || device.device_id}</span>
              <span class="offline-since">{elapsed(device.last_seen)}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>

  <!-- Footer -->
  <footer class="panel-footer">
    <button class="footer-btn" on:click={goToDispositivos}>
      Ver todo →
    </button>
  </footer>
</aside>

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 200;
  }

  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 340px;
    max-width: 90vw;
    background: var(--color-bg, #0f172a);
    border-left: 1px solid var(--color-border, #334155);
    z-index: 250;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--color-border, #334155);
    flex-shrink: 0;
  }

  .panel-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text, #f1f5f9);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-text-secondary, #94a3b8);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: var(--color-surface, #1e293b);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
  }

  .section {
    margin-bottom: 16px;
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary, #94a3b8);
    margin-bottom: 8px;
  }

  .section-title-alert {
    color: var(--color-danger, #ef4444);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .alert-count {
    background: var(--color-danger, #ef4444);
    color: #fff;
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 8px;
  }

  /* Stats */
  .stats-row {
    display: flex;
    gap: 8px;
  }

  .stat-box {
    flex: 1;
    background: var(--color-surface, #1e293b);
    border-radius: 8px;
    padding: 10px;
    text-align: center;
    border: 1px solid var(--color-border, #334155);
  }

  .stat-online { border-color: var(--color-success, #22c55e); }
  .stat-offline { border-color: var(--color-text-secondary, #64748b); }

  .stat-number {
    display: block;
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--color-text, #f1f5f9);
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: 0.7rem;
    color: var(--color-text-secondary, #94a3b8);
    text-transform: uppercase;
  }

  /* By type */
  .type-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .type-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--color-surface, #1e293b);
    border-radius: 6px;
  }

  .type-icon { font-size: 1em; }
  .type-name { flex: 1; font-size: 0.85rem; color: var(--color-text, #e2e8f0); }
  .type-count { display: flex; align-items: center; gap: 4px; font-size: 0.8rem; color: var(--color-text-secondary, #94a3b8); }

  .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  .dot-on { background: var(--color-success, #22c55e); }
  .dot-off { background: var(--color-text-secondary, #64748b); }

  /* Alerts */
  .alert-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .alert-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px;
    background: var(--color-surface, #1e293b);
    border-radius: 6px;
    border-left: 3px solid var(--color-danger, #ef4444);
  }

  .alert-icon { font-size: 0.9em; flex-shrink: 0; margin-top: 1px; }
  .alert-body { flex: 1; min-width: 0; }
  .alert-device { display: block; font-size: 0.8rem; font-weight: 600; color: var(--color-text, #e2e8f0); }
  .alert-msg { display: block; font-size: 0.75rem; color: var(--color-text-secondary, #94a3b8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .alert-time { font-size: 0.7rem; color: var(--color-text-secondary, #64748b); flex-shrink: 0; }
  .alert-more { text-align: center; font-size: 0.75rem; color: var(--color-text-secondary, #64748b); padding: 4px; }

  /* All good */
  .all-good {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: var(--color-surface, #1e293b);
    border-radius: 8px;
    border: 1px solid var(--color-success, #22c55e);
    color: var(--color-success, #22c55e);
    font-size: 0.85rem;
  }

  .all-good-icon { font-size: 1.1em; }

  /* Offline list */
  .offline-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .offline-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--color-surface, #1e293b);
    border-radius: 6px;
    opacity: 0.7;
  }

  .offline-icon { font-size: 0.9em; }
  .offline-name { flex: 1; font-size: 0.8rem; color: var(--color-text, #e2e8f0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .offline-since { font-size: 0.7rem; color: var(--color-text-secondary, #64748b); }

  /* Footer */
  .panel-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--color-border, #334155);
    flex-shrink: 0;
  }

  .footer-btn {
    width: 100%;
    padding: 10px;
    background: var(--color-primary, #3b82f6);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .footer-btn:hover {
    background: var(--color-primary-hover, #2563eb);
  }
</style>
