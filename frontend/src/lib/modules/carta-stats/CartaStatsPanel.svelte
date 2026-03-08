<script lang="ts">
  /**
   * CartaStatsPanel - Estadísticas de la carta digital
   *
   * Usa el backend real:
   *   mqttRequest('carta-digital', 'stats', { project_id })
   *
   * Devuelve: sesiones_activas, total_sesiones, pedidos_hoy, total_pedidos
   */
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let panelId: string = '';

  $: projectId = $page.params.project_id;

  let loading = true;
  let error = '';
  let stats = {
    sesiones_activas: 0,
    total_sesiones: 0,
    pedidos_hoy: 0,
    total_pedidos: 0
  };

  let refreshInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    loadStats();
    refreshInterval = setInterval(loadStats, 30000);
  });

  onDestroy(() => {
    clearInterval(refreshInterval);
  });

  async function loadStats() {
    error = '';
    try {
      const res = await mqttRequest<any>('carta-digital', 'stats', { project_id: projectId });
      const d = res.data || res;
      stats = {
        sesiones_activas: d.sesiones_activas ?? 0,
        total_sesiones: d.total_sesiones ?? 0,
        pedidos_hoy: d.pedidos_hoy ?? 0,
        total_pedidos: d.total_pedidos ?? 0
      };
    } catch (err: any) {
      error = err.message || 'Error cargando stats';
    } finally {
      loading = false;
    }
  }
</script>

<div class="panel-body">
  {#if loading}
    <div class="loading">Cargando estadísticas...</div>
  {:else}
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{stats.sesiones_activas}</span>
        <span class="stat-label">Sesiones activas</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{stats.pedidos_hoy}</span>
        <span class="stat-label">Pedidos hoy</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{stats.total_pedidos}</span>
        <span class="stat-label">Total pedidos</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{stats.total_sesiones}</span>
        <span class="stat-label">Total sesiones</span>
      </div>
    </div>

    <button class="btn-sm" on:click={loadStats}>Refrescar</button>

    {#if error}
      <div class="error-msg">{error}</div>
    {/if}
  {/if}
</div>

<style>
  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.5rem;
  }
  .loading { text-align: center; color: var(--color-text-muted, #888); font-size: 0.8rem; padding: 1rem; }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }
  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.6rem 0.4rem;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 0.5rem;
  }
  .stat-value {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--color-text, #e5e5e5);
  }
  .stat-label {
    font-size: 0.6rem;
    color: var(--color-text-muted, #888);
    text-align: center;
  }
  .btn-sm {
    padding: 0.4rem 0.625rem;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.75rem;
    cursor: pointer;
    align-self: flex-start;
  }
  .btn-sm:hover { background: rgba(255,255,255,0.12); }
  .error-msg {
    padding: 0.4rem 0.5rem;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 0.375rem;
    color: var(--color-error, #ef4444); font-size: 0.75rem;
  }
</style>
