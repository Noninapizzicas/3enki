<script lang="ts">
  /**
   * EscandalloPanel - Análisis de costes
   *
   * Views:
   * - Global: resumen de costes de todas las recetas
   * - Receta: escandallo detallado de una receta
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    escandalloStore,
    escandalloReceta,
    escandalloGlobal,
    escandalloLoading,
    escandalloError,
    initEscandalloSubscriptions,
    setActiveView,
    clearError
  } from '$lib/stores/escandallo';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  export let panelId: string = '';

  let cleanup: (() => void) | null = null;

  $: view = $escandalloStore.activeView;
  $: receta = $escandalloReceta;
  $: global_ = $escandalloGlobal;
  $: loading = $escandalloLoading;
  $: error = $escandalloError;

  onMount(() => { cleanup = initEscandalloSubscriptions(); });
  onDestroy(() => { cleanup?.(); });

  function formatPrice(n: number): string { return n.toFixed(2) + '€'; }
  function formatPct(n: number): string { return n.toFixed(1) + '%'; }

  function getFoodCostColor(fc: number): string {
    if (fc <= 25) return '#22c55e';
    if (fc <= 33) return 'rgba(245, 158, 11, 1)';
    return '#ef4444';
  }
</script>

<div class="escandallo-panel">
  <div class="tabs">
    <button class="tab" class:active={view === 'global'} on:click={() => setActiveView('global')}>
      Resumen Global
    </button>
    <button class="tab" class:active={view === 'receta'} on:click={() => setActiveView('receta')} disabled={!receta}>
      Detalle Receta
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

  <!-- GLOBAL VIEW -->
  {#if view === 'global'}
    <div class="content">
      {#if !global_ || global_.total_recetas === 0}
        <div class="empty">
          <p>No hay datos de escandallo.</p>
          <p class="hint">Crea recetas primero en la sección Recetas. Luego:</p>
          <button class="action-button" on:click={() => prefillChatInput('Dame el escandallo global.')}>
            Calcular escandallo global
          </button>
        </div>
      {:else}
        <div class="kpi-row">
          <div class="kpi">
            <span class="kpi-value">{global_.total_recetas}</span>
            <span class="kpi-label">Recetas</span>
          </div>
          <div class="kpi">
            <span class="kpi-value">{formatPrice(global_.coste_unidad_medio)}</span>
            <span class="kpi-label">Coste medio/porción</span>
          </div>
          <div class="kpi">
            <span class="kpi-value">{formatPrice(global_.coste_unidad_min)} - {formatPrice(global_.coste_unidad_max)}</span>
            <span class="kpi-label">Rango costes</span>
          </div>
        </div>

        {#if global_.ranking_por_coste?.length > 0}
          <h4>Ranking por coste/porción</h4>
          <div class="ranking">
            {#each global_.ranking_por_coste as r, i}
              <div class="ranking-row">
                <span class="ranking-pos">#{i + 1}</span>
                <span class="ranking-name">{r.nombre}</span>
                <span class="ranking-cat">{r.categoria}</span>
                <span class="ranking-cost">{formatPrice(r.coste_unidad)}</span>
              </div>
            {/each}
          </div>
        {/if}

        {#if global_.top_ingredientes_por_coste?.length > 0}
          <h4>Ingredientes por impacto en coste</h4>
          <div class="ranking">
            {#each global_.top_ingredientes_por_coste.slice(0, 8) as ing}
              <div class="ranking-row">
                <span class="ranking-name">{ing.nombre}</span>
                <span class="ranking-cat">{ing.recetas} receta{ing.recetas !== 1 ? 's' : ''}</span>
                <span class="ranking-cost">{formatPrice(ing.coste_total)}</span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- RECETA VIEW -->
  {#if view === 'receta'}
    <div class="content">
      {#if !receta}
        <div class="empty">
          <p>Selecciona una receta para ver su escandallo.</p>
          <button class="action-button" on:click={() => prefillChatInput('Calcula el escandallo de la receta "<nombre>".')}>
            Calcular escandallo
          </button>
        </div>
      {:else}
        <h3>{receta.nombre}</h3>
        <div class="badge-row">
          <span class="badge">{receta.categoria}</span>
          <span class="badge">{receta.porciones} porciones</span>
        </div>

        <div class="action-bar">
          <button class="action-button" on:click={() => prefillChatInput(`Calcula el escandallo de la receta "${receta.nombre}".`)}>
            Recalcular escandallo
          </button>
        </div>

        <div class="kpi-row">
          <div class="kpi">
            <span class="kpi-value">{formatPrice(receta.coste_total)}</span>
            <span class="kpi-label">Coste total</span>
          </div>
          <div class="kpi highlight">
            <span class="kpi-value">{formatPrice(receta.coste_unidad)}</span>
            <span class="kpi-label">Coste/porción</span>
          </div>
          {#if receta.food_cost_porcentaje !== undefined}
            <div class="kpi">
              <span class="kpi-value" style="color: {getFoodCostColor(receta.food_cost_porcentaje)}">{formatPct(receta.food_cost_porcentaje)}</span>
              <span class="kpi-label">Food cost</span>
            </div>
          {/if}
          {#if receta.margen_euro !== undefined}
            <div class="kpi">
              <span class="kpi-value">{formatPrice(receta.margen_euro)}</span>
              <span class="kpi-label">Margen/porción</span>
            </div>
          {/if}
        </div>

        <h4>Desglose de costes</h4>
        <div class="desglose">
          {#each receta.desglose as d}
            <div class="desglose-row">
              <div class="desglose-bar" style="width: {d.porcentaje}%"></div>
              <span class="desglose-name">{d.nombre}</span>
              <span class="desglose-qty">{d.cantidad} {d.unidad}</span>
              <span class="desglose-pct">{formatPct(d.porcentaje)}</span>
              <span class="desglose-price">{formatPrice(d.precio)}</span>
            </div>
          {/each}
        </div>

        {#if receta.insights?.length}
          <h4>Observaciones</h4>
          <ul class="insights">
            {#each receta.insights as insight}
              <li>{insight}</li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .escandallo-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-size: 13px;
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color, #333);
    padding: 0 8px;
    flex-shrink: 0;
  }
  .tab {
    padding: 8px 12px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    cursor: pointer;
    font-size: 12px;
  }
  .tab:hover:not(:disabled) { color: var(--text-primary, rgba(228, 228, 231, 1)); }
  .tab.active { color: var(--accent-color, rgba(96, 165, 250, 1)); border-bottom-color: var(--accent-color, rgba(96, 165, 250, 1)); }
  .tab:disabled { opacity: 0.4; cursor: default; }

  .content { flex: 1; overflow-y: auto; padding: 12px; }
  .error { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(239, 68, 68, 0.15); color: rgba(248, 113, 113, 1); font-size: 12px; }
  .error button { background: none; border: none; color: inherit; cursor: pointer; font-size: 16px; }
  .loading { padding: 12px; text-align: center; color: var(--text-secondary, rgba(161, 161, 170, 1)); font-size: 12px; }
  .empty { text-align: center; padding: 32px 16px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .empty .hint { font-size: 12px; margin-top: 8px; opacity: 0.7; }

  .action-bar { display: flex; gap: 8px; margin-bottom: 12px; }
  .action-button {
    padding: 6px 12px;
    background: rgba(96, 165, 250, 0.15);
    border: 1px solid rgba(96, 165, 250, 0.4);
    border-radius: 6px;
    color: var(--accent-color, rgba(96, 165, 250, 1));
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }
  .action-button:hover { background: rgba(96, 165, 250, 0.25); }

  h3 { margin: 0 0 8px; font-size: 16px; }
  h4 { margin: 16px 0 8px; font-size: 13px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }

  .badge-row { display: flex; gap: 6px; margin-bottom: 12px; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); }

  .kpi-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
  .kpi {
    display: flex;
    flex-direction: column;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-color, #333);
    border-radius: 8px;
    min-width: 80px;
  }
  .kpi.highlight { background: rgba(96, 165, 250, 0.08); border-color: rgba(96, 165, 250, 0.3); }
  .kpi-value { font-size: 18px; font-weight: 700; }
  .kpi-label { font-size: 10px; color: var(--text-secondary, rgba(161, 161, 170, 1)); margin-top: 2px; }

  .ranking { display: flex; flex-direction: column; gap: 2px; }
  .ranking-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
  }
  .ranking-row:hover { background: rgba(255, 255, 255, 0.05); }
  .ranking-pos { font-size: 11px; color: var(--text-secondary, rgba(113, 113, 122, 1)); width: 24px; }
  .ranking-name { flex: 1; }
  .ranking-cat { font-size: 11px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .ranking-cost { font-weight: 600; color: var(--accent-color, rgba(96, 165, 250, 1)); }

  .desglose { display: flex; flex-direction: column; gap: 3px; }
  .desglose-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }
  .desglose-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: rgba(96, 165, 250, 0.08);
    border-radius: 4px;
  }
  .desglose-name { flex: 1; position: relative; z-index: 1; }
  .desglose-qty { font-size: 11px; color: var(--text-secondary, rgba(161, 161, 170, 1)); position: relative; z-index: 1; }
  .desglose-pct { font-size: 11px; color: var(--text-secondary, rgba(161, 161, 170, 1)); width: 40px; text-align: right; position: relative; z-index: 1; }
  .desglose-price { font-weight: 600; color: var(--accent-color, rgba(96, 165, 250, 1)); width: 50px; text-align: right; position: relative; z-index: 1; }

  .insights { padding-left: 20px; font-size: 12px; line-height: 1.6; }
  .insights li { margin-bottom: 4px; }
</style>
