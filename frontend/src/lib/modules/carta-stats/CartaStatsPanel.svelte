<script lang="ts">
  /**
   * CartaStatsPanel - Estadísticas de la carta digital
   *
   * Sesiones activas, pedidos por WhatsApp, productos más vistos, etc.
   * TODO: conectar con backend de analytics.
   */

  export let panelId: string = '';

  // Placeholder stats — se conectarán al backend real
  let stats = {
    activeSessions: 0,
    todayViews: 0,
    todayOrders: 0,
    topProducts: [] as { name: string; views: number }[]
  };

  let loading = true;

  // Simular carga
  import { onMount } from 'svelte';
  onMount(async () => {
    // TODO: mqttRequest para obtener stats reales
    await new Promise(r => setTimeout(r, 300));
    stats = {
      activeSessions: 3,
      todayViews: 47,
      todayOrders: 12,
      topProducts: [
        { name: 'Margherita', views: 23 },
        { name: 'Carbonara', views: 18 },
        { name: 'Tiramisú', views: 15 },
        { name: 'Bruschetta', views: 11 }
      ]
    };
    loading = false;
  });
</script>

<div class="panel-body">
  {#if loading}
    <div class="loading">Cargando estadísticas...</div>
  {:else}
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{stats.activeSessions}</span>
        <span class="stat-label">Sesiones activas</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{stats.todayViews}</span>
        <span class="stat-label">Visitas hoy</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{stats.todayOrders}</span>
        <span class="stat-label">Pedidos hoy</span>
      </div>
    </div>

    {#if stats.topProducts.length > 0}
      <div class="section">
        <span class="section-title">Productos más vistos</span>
        <div class="product-list">
          {#each stats.topProducts as product, i}
            <div class="product-row">
              <span class="product-rank">#{i + 1}</span>
              <span class="product-name">{product.name}</span>
              <span class="product-views">{product.views} vistas</span>
            </div>
          {/each}
        </div>
      </div>
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
  .loading {
    text-align: center;
    color: var(--color-text-muted, #888);
    font-size: 0.8rem;
    padding: 1rem;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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
  .section { display: flex; flex-direction: column; gap: 0.375rem; }
  .section-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-text-muted, #888);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .product-list { display: flex; flex-direction: column; gap: 0.25rem; }
  .product-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    background: rgba(255,255,255,0.03);
    border-radius: 0.375rem;
  }
  .product-rank {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-primary, #3b82f6);
    width: 1.5rem;
  }
  .product-name {
    flex: 1;
    font-size: 0.8rem;
    color: var(--color-text, #e5e5e5);
  }
  .product-views {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }
</style>
