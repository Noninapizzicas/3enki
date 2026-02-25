<script lang="ts">
  /**
   * CocinaHeader — Barra superior fija (80px)
   * Info: estacion, reloj HH:MM:SS, pedidos activos, items pendientes, tiempo promedio, MQTT
   */
  import { ConnectionStatus } from '$lib/components/base';
  import { pedidosCount, itemsPendientes, itemsPreparando, cocinaMetrics } from '$lib/stores/cocina';

  let clock = '';
  let clockInterval: ReturnType<typeof setInterval>;

  function updateClock() {
    const now = new Date();
    clock = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
  });

  onDestroy(() => {
    clearInterval(clockInterval);
  });

  $: avgTime = $cocinaMetrics?.tiempo_promedio_preparacion
    ? `${Math.floor($cocinaMetrics.tiempo_promedio_preparacion / 60)}:${String($cocinaMetrics.tiempo_promedio_preparacion % 60).padStart(2, '0')}`
    : '--:--';
</script>

<header class="cocina-header">
  <div class="header-section">
    <h1 class="station-name">COCINA</h1>
  </div>

  <div class="header-metrics">
    <div class="metric">
      <span class="metric-value">{$pedidosCount}</span>
      <span class="metric-label">pedidos</span>
    </div>
    <div class="metric-divider"></div>
    <div class="metric">
      <span class="metric-value pending">{$itemsPendientes}</span>
      <span class="metric-label">pendientes</span>
    </div>
    <div class="metric-divider"></div>
    <div class="metric">
      <span class="metric-value preparing">{$itemsPreparando}</span>
      <span class="metric-label">preparando</span>
    </div>
    <div class="metric-divider"></div>
    <div class="metric">
      <span class="metric-value avg">{avgTime}</span>
      <span class="metric-label">promedio</span>
    </div>
  </div>

  <div class="header-section right">
    <ConnectionStatus showLabel={false} size="sm" />
    <span class="clock">{clock}</span>
  </div>
</header>

<style>
  .cocina-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 80px;
    padding: 0 20px;
    background: #111827;
    border-bottom: 2px solid #1e293b;
    flex-shrink: 0;
    gap: 16px;
  }

  .header-section {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 140px;
  }

  .header-section.right {
    justify-content: flex-end;
  }

  .station-name {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
    color: #f8fafc;
    letter-spacing: 2px;
  }

  .header-metrics {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    justify-content: center;
  }

  .metric {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .metric-value {
    font-size: 1.8rem;
    font-weight: 800;
    color: #f8fafc;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .metric-value.pending { color: #94a3b8; }
  .metric-value.preparing { color: #eab308; }
  .metric-value.avg { color: #60a5fa; font-size: 1.3rem; }

  .metric-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #64748b;
    font-weight: 600;
  }

  .metric-divider {
    width: 1px;
    height: 36px;
    background: #1e293b;
  }

  .clock {
    font-size: 1.4rem;
    font-weight: 700;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  @media (max-width: 600px) {
    .cocina-header {
      height: 60px;
      padding: 0 12px;
    }
    .station-name { font-size: 1rem; }
    .metric-value { font-size: 1.2rem; }
    .clock { font-size: 1rem; }
  }
</style>
