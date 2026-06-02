<script lang="ts">
  /**
   * ViabilidadBrowser Component
   *
   * Explorador de expedientes de viabilidad. Filtra por veredicto canonico
   * (viable | viable_con_advertencias | no_viable_economicamente |
   * sin_pvp_objetivo) y muestra un resumen (total, desglose por veredicto,
   * food cost medio). El boton 'Evaluar un producto' lanza el chat
   * pre-rellenado (Postura B: el comerciante describe el producto al chat).
   */

  import ViabilidadCard from './ViabilidadCard.svelte';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  export let results: any[] = [];
  export let summary: any = null;
  export let loading = false;
  export let onSearch: ((criteria: any) => void) | null = null;
  export let onSelect: ((id: string) => void) | null = null;

  const EVALUAR_PROMPT = 'Quiero evaluar la viabilidad de un producto: ';

  let selectedVeredicto = '';
  let expandFilters = false;

  const veredictoOptions = [
    { value: 'viable', label: 'Viable' },
    { value: 'viable_con_advertencias', label: 'Con advertencias' },
    { value: 'no_viable_economicamente', label: 'No viable' },
    { value: 'sin_pvp_objetivo', label: 'Sin PVP' }
  ];

  function applyFilters() {
    const criteria: any = {};
    if (selectedVeredicto) criteria.veredicto = selectedVeredicto;
    onSearch?.(criteria);
  }

  function resetFilters() {
    selectedVeredicto = '';
    applyFilters();
  }

  function toggleVeredicto(veredicto: string) {
    selectedVeredicto = selectedVeredicto === veredicto ? '' : veredicto;
    applyFilters();
  }

  function evaluarProducto() {
    prefillChatInput(EVALUAR_PROMPT);
  }

  $: hasActiveFilters = selectedVeredicto !== '';

  function getVeredictoColor(veredicto: string): string {
    if (veredicto === 'viable') return '#059669';
    if (veredicto === 'viable_con_advertencias') return '#d97706';
    if (veredicto === 'no_viable_economicamente') return '#dc2626';
    if (veredicto === 'sin_pvp_objetivo') return '#0891b2';
    return '#6b7280';
  }

  function formatPercent(n: number): string {
    if (typeof n !== 'number' || isNaN(n)) return '—';
    return n.toFixed(1) + '%';
  }
</script>

<div class="browser-container">
  <div class="header">
    <h2>Explorador de Viabilidad</h2>
    <button class="btn-evaluar" on:click={evaluarProducto}>+ Evaluar un producto</button>
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
        <!-- Veredicto Filter -->
        <div class="filter-group">
          <label>Veredicto</label>
          <div class="estado-buttons">
            {#each veredictoOptions as option}
              <button
                class="estado-btn"
                class:active={selectedVeredicto === option.value}
                style={selectedVeredicto === option.value ? `border-color: ${getVeredictoColor(option.value)}; background-color: ${getVeredictoColor(option.value)}22;` : ''}
                on:click={() => toggleVeredicto(option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        </div>

        {#if hasActiveFilters}
          <div class="filter-actions">
            <button class="btn-reset" on:click={resetFilters}>✕ Limpiar</button>
          </div>
        {/if}
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
      {#if summary.por_veredicto?.viable > 0}
        <div class="stat viable">
          <span class="stat-label">Viables</span>
          <span class="stat-value">{summary.por_veredicto.viable}</span>
        </div>
      {/if}
      {#if summary.por_veredicto?.viable_con_advertencias > 0}
        <div class="stat aceptable">
          <span class="stat-label">Con Advertencias</span>
          <span class="stat-value">{summary.por_veredicto.viable_con_advertencias}</span>
        </div>
      {/if}
      {#if summary.por_veredicto?.no_viable_economicamente > 0}
        <div class="stat alert">
          <span class="stat-label">No Viables</span>
          <span class="stat-value">{summary.por_veredicto.no_viable_economicamente}</span>
        </div>
      {/if}
      {#if summary.food_cost_medio != null}
        <div class="stat">
          <span class="stat-label">Food Cost Medio</span>
          <span class="stat-value">{formatPercent(summary.food_cost_medio)}</span>
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
        <p>Sin expedientes</p>
        <p class="hint">Pulsa "Evaluar un producto" para empezar</p>
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .header h2 {
    margin: 0;
    font-size: 18px;
    color: #1f2937;
  }

  .btn-evaluar {
    flex-shrink: 0;
    padding: 8px 14px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-evaluar:hover {
    background: #2563eb;
    transform: translateY(-1px);
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
    font-weight: 600;
  }

  .filter-actions {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .btn-reset {
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
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
    background: #fef3c7;
    border-color: #fcd34d;
  }

  .stat.alert {
    background: #fee2e2;
    border-color: #fca5a5;
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
