<script lang="ts">
  /**
   * EscandalloBrowser Component
   *
   * Search and filter interface for escandallo data.
   * Features:
   * - Cost range filtering
   * - Date range filtering
   * - Alert presence filtering
   * - Sort/rank options
   * - Results summary statistics
   */

  import EscandalloCard from './EscandalloCard.svelte';

  export let results: any[] = [];
  export let summary: any = null;
  export let loading = false;
  export let onSearch: ((criteria: any) => void) | null = null;
  export let onSelect: ((id: string) => void) | null = null;

  let costMin = '';
  let costMax = '';
  let hasAlerts = false;
  let hasUnreadAlerts = false;
  let sortBy = 'recent';
  let expandFilters = false;

  function applyFilters() {
    const criteria: any = {};

    if (costMin) criteria.coste_min = parseFloat(costMin);
    if (costMax) criteria.coste_max = parseFloat(costMax);
    if (hasAlerts) criteria.tiene_alerta = true;
    if (hasUnreadAlerts) criteria.tiene_alerta_sin_leer = true;

    onSearch?.({
      ...criteria,
      rankBy: sortBy
    });
  }

  function resetFilters() {
    costMin = '';
    costMax = '';
    hasAlerts = false;
    hasUnreadAlerts = false;
    sortBy = 'recent';
    applyFilters();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      applyFilters();
    }
  }

  $: hasActiveFilters = costMin || costMax || hasAlerts || hasUnreadAlerts;
</script>

<div class="browser-container">
  <div class="header">
    <h2>Explorador de Escandallos</h2>
  </div>

  <!-- FILTERS PANEL -->
  <div class="filters-panel" class:expanded={expandFilters}>
    <div class="filters-header">
      <button class="toggle-btn" on:click={() => (expandFilters = !expandFilters)}>
        {expandFilters ? '▼' : '▶'} Filtros {hasActiveFilters ? '✓' : ''}
      </button>
    </div>

    {#if expandFilters}
      <div class="filters-content">
        <div class="filter-group">
          <label>Rango de Coste (€)</label>
          <div class="range-inputs">
            <input
              type="number"
              placeholder="Mín"
              bind:value={costMin}
              on:keydown={handleKeydown}
              step="0.1"
              min="0"
            />
            <span class="range-sep">-</span>
            <input
              type="number"
              placeholder="Máx"
              bind:value={costMax}
              on:keydown={handleKeydown}
              step="0.1"
              min="0"
            />
          </div>
        </div>

        <div class="filter-group">
          <label>Alertas</label>
          <div class="checkbox-group">
            <label class="checkbox">
              <input type="checkbox" bind:checked={hasUnreadAlerts} />
              Solo sin leer
            </label>
            <label class="checkbox">
              <input type="checkbox" bind:checked={hasAlerts} />
              Con alertas
            </label>
          </div>
        </div>

        <div class="filter-group">
          <label>Ordenar por</label>
          <select bind:value={sortBy} on:change={applyFilters}>
            <option value="relevance">Relevancia (Anomalías)</option>
            <option value="recent">Más Reciente</option>
            <option value="old">Más Antiguo</option>
            <option value="cost">Coste Bajo a Alto</option>
            <option value="cost_desc">Coste Alto a Bajo</option>
            <option value="alerts">Más Alertas</option>
          </select>
        </div>

        <div class="filter-actions">
          <button class="btn-search" on:click={applyFilters} disabled={loading}>
            {loading ? '⟳ Buscando...' : '🔍 Buscar'}
          </button>
          {#if hasActiveFilters}
            <button class="btn-reset" on:click={resetFilters}>✕ Limpiar</button>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- SUMMARY -->
  {#if summary && summary.total > 0}
    <div class="summary-stats">
      <div class="stat">
        <span class="stat-label">Total</span>
        <span class="stat-value">{summary.total}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Coste Medio</span>
        <span class="stat-value">{summary.coste_medio?.toFixed(2)}€</span>
      </div>
      <div class="stat">
        <span class="stat-label">Rango</span>
        <span class="stat-value">
          {summary.coste_min?.toFixed(2)}€ - {summary.coste_max?.toFixed(2)}€
        </span>
      </div>
      {#if summary.con_alertas}
        <div class="stat alert">
          <span class="stat-label">Con Alertas</span>
          <span class="stat-value">{summary.con_alertas}</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- RESULTS -->
  <div class="results-container">
    {#if loading}
      <div class="loading-state">
        <p>⟳ Cargando resultados...</p>
      </div>
    {:else if results.length === 0}
      <div class="empty-state">
        <p>Sin resultados</p>
        <p class="hint">Ajusta los filtros para encontrar escandallos</p>
      </div>
    {:else}
      <div class="results-grid">
        {#each results as result}
          <EscandalloCard
            escandallo={result}
            onSelect={() => onSelect?.(result.id)}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .browser-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: white;
  }

  .header {
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
  }

  .header h2 {
    margin: 0;
    font-size: 18px;
    color: #1f2937;
  }

  .filters-panel {
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
    transition: max-height 0.2s;
  }

  .filters-header {
    padding: 12px 16px;
  }

  .toggle-btn {
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    user-select: none;
  }

  .toggle-btn:hover {
    color: #1f2937;
  }

  .filters-content {
    padding: 16px 20px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .filter-group label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
    letter-spacing: 0.5px;
  }

  .range-inputs {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .range-inputs input {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 12px;
  }

  .range-inputs input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .range-sep {
    color: #d1d5db;
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    cursor: pointer;
    user-select: none;
  }

  .checkbox input[type='checkbox'] {
    cursor: pointer;
  }

  select {
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 12px;
    background-color: white;
    cursor: pointer;
  }

  select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .filter-actions {
    display: flex;
    gap: 8px;
    grid-column: 1 / -1;
  }

  .btn-search,
  .btn-reset {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-search {
    background: #3b82f6;
    color: white;
  }

  .btn-search:hover:not(:disabled) {
    background: #2563eb;
    transform: translateY(-1px);
  }

  .btn-search:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-reset {
    background: #f3f4f6;
    color: #6b7280;
  }

  .btn-reset:hover {
    background: #e5e7eb;
  }

  .summary-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    padding: 12px 16px;
    background: #f0f9ff;
    border-bottom: 1px solid #bfdbfe;
    font-size: 11px;
  }

  .stat {
    padding: 8px;
    background: white;
    border: 1px solid #bfdbfe;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat.alert {
    background: #fef3c7;
    border-color: #fcd34d;
  }

  .stat-label {
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 13px;
    font-weight: 600;
    color: #1f2937;
  }

  .results-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .loading-state,
  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #6b7280;
  }

  .empty-state {
    opacity: 0.7;
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
  }

  .empty-state .hint {
    font-size: 11px;
    margin-top: 4px;
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }
</style>
