<script lang="ts">
  /**
   * ViabilidadBrowser Component
   *
   * Search and filter interface for viability data.
   * Features:
   * - Viability status filtering (VIABLE, ACEPTABLE, CRÍTICO, INVIABLE)
   * - Margin range filtering
   * - Food cost range filtering
   * - Risk level filtering
   * - Sort/rank options
   * - Results summary statistics
   */

  import ViabilidadCard from './ViabilidadCard.svelte';

  export let results: any[] = [];
  export let summary: any = null;
  export let loading = false;
  export let onSearch: ((criteria: any) => void) | null = null;
  export let onSelect: ((id: string) => void) | null = null;

  let margenMin = '';
  let margenMax = '';
  let foodCostMin = '';
  let foodCostMax = '';
  let selectedEstados: string[] = [];
  let tieneRiesgo = false;
  let sortBy = 'relevance';
  let expandFilters = false;

  const estadoOptions = [
    { value: 'VIABLE', label: 'Viable' },
    { value: 'ACEPTABLE', label: 'Aceptable' },
    { value: 'CRÍTICO', label: 'Crítico' },
    { value: 'INVIABLE', label: 'Inviable' }
  ];

  function applyFilters() {
    const criteria: any = {};

    if (margenMin) criteria.margen_min = parseFloat(margenMin);
    if (margenMax) criteria.margen_max = parseFloat(margenMax);
    if (foodCostMin) criteria.food_cost_min = parseFloat(foodCostMin);
    if (foodCostMax) criteria.food_cost_max = parseFloat(foodCostMax);
    if (selectedEstados.length > 0) criteria.estado = selectedEstados;
    if (tieneRiesgo) criteria.tiene_riesgo = true;

    onSearch?.({
      ...criteria,
      rankBy: sortBy
    });
  }

  function resetFilters() {
    margenMin = '';
    margenMax = '';
    foodCostMin = '';
    foodCostMax = '';
    selectedEstados = [];
    tieneRiesgo = false;
    sortBy = 'relevance';
    applyFilters();
  }

  function toggleEstado(estado: string) {
    if (selectedEstados.includes(estado)) {
      selectedEstados = selectedEstados.filter(e => e !== estado);
    } else {
      selectedEstados = [...selectedEstados, estado];
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      applyFilters();
    }
  }

  $: hasActiveFilters = margenMin || margenMax || foodCostMin || foodCostMax || selectedEstados.length > 0 || tieneRiesgo;

  function getEstadoColor(estado: string): string {
    if (estado === 'VIABLE') return '#059669';
    if (estado === 'ACEPTABLE') return '#0891b2';
    if (estado === 'CRÍTICO') return '#d97706';
    if (estado === 'INVIABLE') return '#dc2626';
    return '#6b7280';
  }
</script>

<div class="browser-container">
  <div class="header">
    <h2>Explorador de Viabilidad</h2>
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
        <!-- Estado Filters -->
        <div class="filter-group">
          <label>Estado</label>
          <div class="estado-buttons">
            {#each estadoOptions as option}
              <button
                class="estado-btn"
                class:active={selectedEstados.includes(option.value)}
                style={selectedEstados.includes(option.value) ? `border-color: ${getEstadoColor(option.value)}; background-color: ${getEstadoColor(option.value)}22;` : ''}
                on:click={() => toggleEstado(option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Margin Range -->
        <div class="filter-group">
          <label>Rango de Margen (%)</label>
          <div class="range-inputs">
            <input
              type="number"
              placeholder="Mín"
              bind:value={margenMin}
              on:keydown={handleKeydown}
              step="0.5"
              min="0"
              max="100"
            />
            <span class="range-sep">-</span>
            <input
              type="number"
              placeholder="Máx"
              bind:value={margenMax}
              on:keydown={handleKeydown}
              step="0.5"
              min="0"
              max="100"
            />
          </div>
        </div>

        <!-- Food Cost Range -->
        <div class="filter-group">
          <label>Rango de Food Cost (%)</label>
          <div class="range-inputs">
            <input
              type="number"
              placeholder="Mín"
              bind:value={foodCostMin}
              on:keydown={handleKeydown}
              step="0.5"
              min="0"
              max="100"
            />
            <span class="range-sep">-</span>
            <input
              type="number"
              placeholder="Máx"
              bind:value={foodCostMax}
              on:keydown={handleKeydown}
              step="0.5"
              min="0"
              max="100"
            />
          </div>
        </div>

        <!-- Risk Filter -->
        <div class="filter-group">
          <label>Filtros</label>
          <label class="checkbox">
            <input type="checkbox" bind:checked={tieneRiesgo} on:change={applyFilters} />
            Solo con riesgos
          </label>
        </div>

        <!-- Sort -->
        <div class="filter-group">
          <label>Ordenar por</label>
          <select bind:value={sortBy} on:change={applyFilters}>
            <option value="relevance">Relevancia</option>
            <option value="riesgo">Por Riesgo</option>
            <option value="margen">Mayor Margen</option>
            <option value="margen_asc">Menor Margen</option>
            <option value="mejora">Potencial de Mejora</option>
            <option value="viable_first">Viables Primero</option>
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
      {#if summary.viable > 0}
        <div class="stat viable">
          <span class="stat-label">Viables</span>
          <span class="stat-value">{summary.viable} ({summary.porcentaje_viable?.toFixed(0)}%)</span>
        </div>
      {/if}
      {#if summary.aceptable > 0}
        <div class="stat aceptable">
          <span class="stat-label">Aceptables</span>
          <span class="stat-value">{summary.aceptable}</span>
        </div>
      {/if}
      {#if summary.critico > 0 || summary.inviable > 0}
        <div class="stat alert">
          <span class="stat-label">Con Riesgo</span>
          <span class="stat-value">{summary.critico + summary.inviable}</span>
        </div>
      {/if}
      <div class="stat">
        <span class="stat-label">Margen Promedio</span>
        <span class="stat-value">{summary.margen_promedio?.toFixed(1)}%</span>
      </div>
      <div class="stat">
        <span class="stat-label">Food Cost Promedio</span>
        <span class="stat-value">{summary.food_cost_promedio?.toFixed(1)}%</span>
      </div>
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
        <p class="hint">Ajusta los filtros para encontrar recetas</p>
      </div>
    {:else}
      <div class="results-grid">
        {#each results as result}
          <ViabilidadCard
            viabilidad={result}
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

  .estado-buttons {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .estado-btn {
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .estado-btn:hover {
    border-color: #9ca3af;
  }

  .estado-btn.active {
    color: white;
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

  .checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    cursor: pointer;
    user-select: none;
    font-weight: 400;
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

  .stat.viable {
    background: #f0fdf4;
    border-color: #dcfce7;
  }

  .stat.aceptable {
    background: #f0f9ff;
    border-color: #bfdbfe;
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
