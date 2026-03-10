<script lang="ts">
  /**
   * RecetasPanel - Panel de gestión de recetas
   *
   * Tabs:
   * - Recetas: Lista de recetas con resumen
   * - Detalle: Ver receta completa con escandallo
   * - Ingredientes: Catálogo de ingredientes del proyecto
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    recetasStore,
    sortedRecetas,
    selectedReceta,
    recetasStats,
    recetasLoading,
    recetasError,
    recetasIngredientes,
    initRecetasSubscriptions,
    setActiveTab,
    selectReceta,
    getReceta,
    loadIngredientes,
    clearError,
    type Receta,
    type RecetaResumen
  } from '$lib/stores/recetas';

  export let panelId: string = '';

  // ==========================================================================
  // STATE
  // ==========================================================================

  let cleanup: (() => void) | null = null;

  // Reactive
  $: tab = $recetasStore.activeTab;
  $: stats = $recetasStats;
  $: loading = $recetasLoading;
  $: error = $recetasError;
  $: selected = $selectedReceta;
  $: recetas = $sortedRecetas;
  $: ingredientes = $recetasIngredientes;

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    cleanup = initRecetasSubscriptions();
  });

  onDestroy(() => {
    cleanup?.();
  });

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  function handleTabChange(newTab: typeof tab) {
    setActiveTab(newTab);
    if (newTab === 'ingredientes') loadIngredientes();
  }

  async function handleSelectReceta(id: string) {
    await getReceta(id);
  }

  function handleBack() {
    selectReceta(null);
    setActiveTab('recetas');
  }

  function formatPrice(n: number): string {
    return n.toFixed(2) + '€';
  }

  function getDificultadColor(d: string): string {
    if (d === 'baja') return '#22c55e';
    if (d === 'media') return '#f59e0b';
    return '#ef4444';
  }
</script>

<div class="recetas-panel">
  <!-- TABS -->
  <div class="tabs">
    <button
      class="tab" class:active={tab === 'recetas'}
      on:click={() => handleTabChange('recetas')}
    >
      Recetas {stats?.total_recetas ? `(${stats.total_recetas})` : ''}
    </button>
    <button
      class="tab" class:active={tab === 'detalle'}
      on:click={() => handleTabChange('detalle')}
      disabled={!selected}
    >
      Detalle
    </button>
    <button
      class="tab" class:active={tab === 'ingredientes'}
      on:click={() => handleTabChange('ingredientes')}
    >
      Ingredientes {stats?.total_ingredientes ? `(${stats.total_ingredientes})` : ''}
    </button>
  </div>

  <!-- ERROR -->
  {#if error}
    <div class="error">
      <span>{error}</span>
      <button on:click={clearError}>×</button>
    </div>
  {/if}

  <!-- LOADING -->
  {#if loading}
    <div class="loading">Cargando...</div>
  {/if}

  <!-- TAB: RECETAS -->
  {#if tab === 'recetas'}
    <div class="content">
      {#if recetas.length === 0}
        <div class="empty">
          <p>No hay recetas todavía.</p>
          <p class="hint">Usa el chat para crear recetas. Por ejemplo:<br>
            <em>"Investiga una receta de pasta carbonara"</em></p>
        </div>
      {:else}
        <!-- Stats summary -->
        {#if stats?.coste_porcion}
          <div class="stats-bar">
            <span>Coste medio/porción: <strong>{formatPrice(stats.coste_porcion.medio)}</strong></span>
            <span>Min: {formatPrice(stats.coste_porcion.minimo)}</span>
            <span>Max: {formatPrice(stats.coste_porcion.maximo)}</span>
          </div>
        {/if}

        <div class="recetas-list">
          {#each recetas as receta (receta.id)}
            <button
              class="receta-card"
              on:click={() => handleSelectReceta(receta.id)}
            >
              <div class="card-header">
                <span class="card-name">{receta.nombre}</span>
                <span class="card-cat">{receta.categoria}</span>
              </div>
              <div class="card-details">
                <span>{receta.ingredientes_count} ing.</span>
                <span>{receta.porciones} porc.</span>
                <span class="card-cost">{formatPrice(receta.coste_porcion)}/porc.</span>
                <span class="card-total">Total: {formatPrice(receta.coste_total)}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- TAB: DETALLE -->
  {#if tab === 'detalle'}
    <div class="content">
      {#if selected}
        <button class="back-btn" on:click={handleBack}>← Volver</button>

        <h3>{selected.nombre}</h3>
        {#if selected.descripcion}
          <p class="desc">{selected.descripcion}</p>
        {/if}

        <div class="meta">
          <span class="badge">{selected.categoria}</span>
          <span class="badge" style="background: {getDificultadColor(selected.dificultad)}">{selected.dificultad}</span>
          {#if selected.tiempo_preparacion}
            <span class="badge">{selected.tiempo_preparacion} min</span>
          {/if}
          <span class="badge">{selected.porciones} porciones</span>
        </div>

        <!-- COSTES -->
        <div class="costes-box">
          <div class="coste-item">
            <span class="coste-label">Coste total</span>
            <span class="coste-value">{formatPrice(selected.coste_total)}</span>
          </div>
          <div class="coste-item">
            <span class="coste-label">Coste/porción</span>
            <span class="coste-value highlight">{formatPrice(selected.coste_porcion)}</span>
          </div>
        </div>

        <!-- INGREDIENTES -->
        <h4>Ingredientes</h4>
        <div class="ing-table">
          {#each selected.ingredientes as ing}
            <div class="ing-row">
              <span class="ing-name">{ing.nombre}</span>
              <span class="ing-qty">{ing.cantidad} {ing.unidad}</span>
              <span class="ing-price">{formatPrice(ing.precio_mercado)}</span>
            </div>
          {/each}
        </div>

        <!-- ELABORACION -->
        {#if selected.elaboracion && selected.elaboracion.length > 0}
          <h4>Elaboración</h4>
          <ol class="elaboracion">
            {#each selected.elaboracion as paso, i}
              <li>{paso}</li>
            {/each}
          </ol>
        {/if}

        <!-- TAGS -->
        {#if selected.tags && selected.tags.length > 0}
          <div class="tags">
            {#each selected.tags as tag}
              <span class="tag">{tag}</span>
            {/each}
          </div>
        {/if}

        {#if selected.notas}
          <p class="notas"><strong>Notas:</strong> {selected.notas}</p>
        {/if}
      {:else}
        <div class="empty">
          <p>Selecciona una receta de la lista</p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- TAB: INGREDIENTES -->
  {#if tab === 'ingredientes'}
    <div class="content">
      {#if ingredientes.length === 0}
        <div class="empty">
          <p>No hay ingredientes en el catálogo.</p>
          <p class="hint">Los ingredientes se añaden automáticamente al crear recetas.</p>
        </div>
      {:else}
        <div class="ing-catalog">
          {#each ingredientes as ing (ing.id)}
            <div class="ing-catalog-row">
              <div class="ing-catalog-main">
                <span class="ing-name">{ing.nombre}</span>
                <span class="ing-cat">{ing.categoria}</span>
              </div>
              <div class="ing-catalog-details">
                <span>Mercado: {ing.precio_mercado_kg}€/{ing.unidad_base}</span>
                {#if ing.precio_compra_kg !== null}
                  <span>Compra: {ing.precio_compra_kg}€/{ing.unidad_base}</span>
                {/if}
                <span class="ing-count">En {ing.recetas_count} receta{ing.recetas_count !== 1 ? 's' : ''}</span>
              </div>
              {#if ing.fuente_precio}
                <div class="ing-source">{ing.fuente_precio}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .recetas-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-size: 13px;
    color: var(--text-primary, #e4e4e7);
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
    color: var(--text-secondary, #a1a1aa);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }

  .tab:hover:not(:disabled) { color: var(--text-primary, #e4e4e7); }
  .tab.active {
    color: var(--accent-color, #60a5fa);
    border-bottom-color: var(--accent-color, #60a5fa);
  }
  .tab:disabled { opacity: 0.4; cursor: default; }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    font-size: 12px;
    border-bottom: 1px solid rgba(239, 68, 68, 0.3);
  }
  .error button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 16px;
  }

  .loading {
    padding: 12px;
    text-align: center;
    color: var(--text-secondary, #a1a1aa);
    font-size: 12px;
  }

  .empty {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-secondary, #a1a1aa);
  }
  .empty .hint { font-size: 12px; margin-top: 8px; opacity: 0.7; }

  .stats-bar {
    display: flex;
    gap: 16px;
    padding: 8px 12px;
    background: rgba(96, 165, 250, 0.08);
    border-radius: 6px;
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--text-secondary, #a1a1aa);
  }
  .stats-bar strong { color: var(--accent-color, #60a5fa); }

  .recetas-list { display: flex; flex-direction: column; gap: 6px; }

  .receta-card {
    display: block;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    color: inherit;
  }
  .receta-card:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--accent-color, #60a5fa);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .card-name { font-weight: 600; }
  .card-cat {
    font-size: 11px;
    color: var(--text-secondary, #a1a1aa);
    background: rgba(255, 255, 255, 0.06);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .card-details {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--text-secondary, #a1a1aa);
  }
  .card-cost { color: var(--accent-color, #60a5fa); font-weight: 600; }
  .card-total { color: var(--text-secondary, #a1a1aa); }

  .back-btn {
    background: none;
    border: none;
    color: var(--accent-color, #60a5fa);
    cursor: pointer;
    padding: 4px 0;
    font-size: 12px;
    margin-bottom: 8px;
  }

  h3 { margin: 0 0 4px; font-size: 16px; }
  h4 { margin: 16px 0 8px; font-size: 13px; color: var(--text-secondary, #a1a1aa); }

  .desc { font-size: 12px; color: var(--text-secondary, #a1a1aa); margin: 4px 0 12px; }

  .meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, #e4e4e7);
  }

  .costes-box {
    display: flex;
    gap: 16px;
    padding: 12px;
    background: rgba(96, 165, 250, 0.08);
    border-radius: 8px;
    margin-bottom: 12px;
  }
  .coste-item { display: flex; flex-direction: column; gap: 2px; }
  .coste-label { font-size: 11px; color: var(--text-secondary, #a1a1aa); }
  .coste-value { font-size: 18px; font-weight: 700; }
  .coste-value.highlight { color: var(--accent-color, #60a5fa); }

  .ing-table { display: flex; flex-direction: column; gap: 2px; }
  .ing-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
  }
  .ing-row:hover { background: rgba(255, 255, 255, 0.05); }
  .ing-name { flex: 1; }
  .ing-qty { width: 80px; text-align: right; color: var(--text-secondary, #a1a1aa); }
  .ing-price { width: 60px; text-align: right; font-weight: 600; color: var(--accent-color, #60a5fa); }

  .elaboracion { padding-left: 20px; font-size: 12px; line-height: 1.6; }
  .elaboracion li { margin-bottom: 4px; }

  .tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 12px; }
  .tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(96, 165, 250, 0.15);
    color: var(--accent-color, #60a5fa);
  }

  .notas { font-size: 12px; margin-top: 12px; color: var(--text-secondary, #a1a1aa); }

  /* Ingredientes catalog */
  .ing-catalog { display: flex; flex-direction: column; gap: 4px; }
  .ing-catalog-row {
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 6px;
    border: 1px solid var(--border-color, #333);
  }
  .ing-catalog-main {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .ing-cat {
    font-size: 11px;
    color: var(--text-secondary, #a1a1aa);
  }
  .ing-catalog-details {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--text-secondary, #a1a1aa);
  }
  .ing-count { color: var(--accent-color, #60a5fa); }
  .ing-source {
    font-size: 10px;
    color: var(--text-secondary, #71717a);
    margin-top: 2px;
  }
</style>
