<script lang="ts">
  /**
   * ViabilidadPanel - Estudio de viabilidad
   *
   * Views:
   * - Estudio: estudio completo con escenarios
   * - Config: configuración del negocio
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    viabilidadStore,
    viabilidadEstudio,
    viabilidadConfig,
    viabilidadLoading,
    viabilidadError,
    initViabilidadSubscriptions,
    setActiveView,
    clearError
  } from '$lib/stores/viabilidad';

  export let panelId: string = '';

  let cleanup: (() => void) | null = null;

  $: view = $viabilidadStore.activeView;
  $: estudio = $viabilidadEstudio;
  $: config = $viabilidadConfig;
  $: loading = $viabilidadLoading;
  $: error = $viabilidadError;

  onMount(() => { cleanup = initViabilidadSubscriptions(); });
  onDestroy(() => { cleanup?.(); });

  function formatPrice(n: number): string { return n.toFixed(2) + '€'; }
  function formatK(n: number): string {
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k€';
    return n.toFixed(0) + '€';
  }
</script>

<div class="viabilidad-panel">
  <div class="tabs">
    <button class="tab" class:active={view === 'estudio'} on:click={() => setActiveView('estudio')}>
      Estudio
    </button>
    <button class="tab" class:active={view === 'config'} on:click={() => setActiveView('config')}>
      Configuración
    </button>
  </div>

  {#if error}
    <div class="error">
      <span>{error}</span>
      <button on:click={clearError}>×</button>
    </div>
  {/if}

  {#if loading}
    <div class="loading">Calculando...</div>
  {/if}

  <!-- ESTUDIO VIEW -->
  {#if view === 'estudio'}
    <div class="content">
      {#if !estudio}
        <div class="empty">
          <p>No hay estudio de viabilidad.</p>
          <p class="hint">Pide al chat con los datos del negocio:<br>
            <em>"Haz un estudio de viabilidad con 3000€ de gastos fijos, 40 comensales al día"</em></p>
        </div>
      {:else}
        <div class="header">
          <h3>{estudio.negocio.nombre}</h3>
          <span class="tipo">{estudio.negocio.tipo}</span>
        </div>

        <div class="kpi-row">
          <div class="kpi">
            <span class="kpi-value">{estudio.recetas_analizadas}</span>
            <span class="kpi-label">Recetas</span>
          </div>
          <div class="kpi">
            <span class="kpi-value">{estudio.food_cost_medio}%</span>
            <span class="kpi-label">Food cost</span>
          </div>
          <div class="kpi">
            <span class="kpi-value">{formatPrice(estudio.ticket_medio)}</span>
            <span class="kpi-label">Ticket medio</span>
          </div>
        </div>

        <!-- Escenarios -->
        <h4>Escenarios</h4>
        <div class="escenarios">
          {#each Object.entries(estudio.escenarios) as [key, esc]}
            <div class="escenario-card" class:rentable={esc.beneficio.es_rentable} class:perdida={!esc.beneficio.es_rentable}>
              <div class="esc-name">{esc.nombre}</div>
              <div class="esc-grid">
                <div><span class="esc-label">Comensales/día</span><span class="esc-val">{esc.parametros.comensales_dia}</span></div>
                <div><span class="esc-label">Ingresos/mes</span><span class="esc-val">{formatK(esc.ingresos.mes)}</span></div>
                <div><span class="esc-label">Gastos/mes</span><span class="esc-val">{formatK(esc.gastos.total_mes)}</span></div>
                <div><span class="esc-label">Beneficio/mes</span><span class="esc-val" class:positive={esc.beneficio.mes > 0} class:negative={esc.beneficio.mes < 0}>{formatK(esc.beneficio.mes)}</span></div>
                <div><span class="esc-label">Break-even</span><span class="esc-val">{esc.punto_equilibrio.comensales_dia} com./día</span></div>
              </div>
            </div>
          {/each}
        </div>

        <!-- Conclusiones -->
        {#if estudio.conclusiones?.length > 0}
          <h4>Conclusiones</h4>
          <ul class="conclusiones">
            {#each estudio.conclusiones as c}
              <li>{c}</li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- CONFIG VIEW -->
  {#if view === 'config'}
    <div class="content">
      {#if Object.keys(config).length === 0}
        <div class="empty">
          <p>No hay configuración guardada.</p>
          <p class="hint">Pide al chat:<br>
            <em>"Guarda la configuración: restaurante, 3000€ gastos fijos, 25 días, ticket medio 15€"</em></p>
        </div>
      {:else}
        <h4>Datos del negocio</h4>
        <div class="config-list">
          {#if config.nombre_negocio}
            <div class="config-row"><span>Nombre</span><span>{config.nombre_negocio}</span></div>
          {/if}
          {#if config.tipo_negocio}
            <div class="config-row"><span>Tipo</span><span>{config.tipo_negocio}</span></div>
          {/if}
          {#if config.gastos_fijos_mensuales}
            <div class="config-row"><span>Gastos fijos/mes</span><span>{formatPrice(config.gastos_fijos_mensuales)}</span></div>
          {/if}
          {#if config.dias_operacion_mes}
            <div class="config-row"><span>Días operación/mes</span><span>{config.dias_operacion_mes}</span></div>
          {/if}
          {#if config.comensales_dia_estimados}
            <div class="config-row"><span>Comensales/día</span><span>{config.comensales_dia_estimados}</span></div>
          {/if}
          {#if config.ticket_medio}
            <div class="config-row"><span>Ticket medio</span><span>{formatPrice(config.ticket_medio)}</span></div>
          {/if}
          {#if config.food_cost_objetivo}
            <div class="config-row"><span>Food cost objetivo</span><span>{config.food_cost_objetivo}%</span></div>
          {/if}
          {#if config.inversion_inicial}
            <div class="config-row"><span>Inversión inicial</span><span>{formatPrice(config.inversion_inicial)}</span></div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .viabilidad-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-size: 13px;
    color: var(--text-primary, #e4e4e7);
  }

  .tabs { display: flex; border-bottom: 1px solid var(--border-color, #333); padding: 0 8px; flex-shrink: 0; }
  .tab { padding: 8px 12px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-secondary, #a1a1aa); cursor: pointer; font-size: 12px; }
  .tab:hover { color: var(--text-primary, #e4e4e7); }
  .tab.active { color: var(--accent-color, #60a5fa); border-bottom-color: var(--accent-color, #60a5fa); }

  .content { flex: 1; overflow-y: auto; padding: 12px; }
  .error { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(239, 68, 68, 0.15); color: #f87171; font-size: 12px; }
  .error button { background: none; border: none; color: inherit; cursor: pointer; font-size: 16px; }
  .loading { padding: 12px; text-align: center; color: var(--text-secondary, #a1a1aa); font-size: 12px; }
  .empty { text-align: center; padding: 32px 16px; color: var(--text-secondary, #a1a1aa); }
  .empty .hint { font-size: 12px; margin-top: 8px; opacity: 0.7; }

  .header { margin-bottom: 12px; }
  h3 { margin: 0; font-size: 16px; }
  h4 { margin: 16px 0 8px; font-size: 13px; color: var(--text-secondary, #a1a1aa); }
  .tipo { font-size: 12px; color: var(--text-secondary, #a1a1aa); }

  .kpi-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
  .kpi { display: flex; flex-direction: column; padding: 10px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color, #333); border-radius: 8px; }
  .kpi-value { font-size: 18px; font-weight: 700; }
  .kpi-label { font-size: 10px; color: var(--text-secondary, #a1a1aa); margin-top: 2px; }

  .escenarios { display: flex; flex-direction: column; gap: 8px; }
  .escenario-card {
    padding: 12px;
    border: 1px solid var(--border-color, #333);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.02);
  }
  .escenario-card.rentable { border-left: 3px solid #22c55e; }
  .escenario-card.perdida { border-left: 3px solid #ef4444; }
  .esc-name { font-weight: 600; margin-bottom: 8px; }
  .esc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .esc-grid > div { display: flex; justify-content: space-between; }
  .esc-label { font-size: 11px; color: var(--text-secondary, #a1a1aa); }
  .esc-val { font-weight: 600; font-size: 12px; }
  .positive { color: #22c55e; }
  .negative { color: #ef4444; }

  .conclusiones { padding-left: 20px; font-size: 12px; line-height: 1.8; }
  .conclusiones li { margin-bottom: 4px; }

  .config-list { display: flex; flex-direction: column; gap: 4px; }
  .config-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 4px;
  }
  .config-row span:first-child { color: var(--text-secondary, #a1a1aa); }
  .config-row span:last-child { font-weight: 600; }
</style>
