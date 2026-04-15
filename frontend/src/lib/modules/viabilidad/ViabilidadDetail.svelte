<script lang="ts">
  /**
   * ViabilidadDetail Component
   *
   * Full details view for a single recipe viability.
   * Shows:
   * - Cost and pricing breakdown
   * - Margin analysis
   * - Food cost assessment
   * - Recommendations panel
   * - Historical comparison
   */

  import ViabilidadRecomendaciones from './ViabilidadRecomendaciones.svelte';

  export let viabilidad: any = null;
  export let recomendaciones: any[] = [];
  export let historico: any[] = [];
  export let onImplementRecondacion: ((id: string) => void) | null = null;
  export let onBack: (() => void) | null = null;

  let showHistory = false;

  function formatPrice(n: number): string {
    return parseFloat(n).toFixed(2) + '€';
  }

  function formatPercent(n: number): string {
    return parseFloat(n).toFixed(1) + '%';
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function getEstadoClass(estado: string): string {
    if (estado === 'VIABLE') return 'viable';
    if (estado === 'ACEPTABLE') return 'aceptable';
    if (estado === 'CRÍTICO') return 'critico';
    if (estado === 'INVIABLE') return 'inviable';
    return 'unknown';
  }

  function getEstadoLabel(estado: string): string {
    if (estado === 'VIABLE') return '✓ Viable';
    if (estado === 'ACEPTABLE') return '⊕ Aceptable';
    if (estado === 'CRÍTICO') return '⚠ Crítico';
    if (estado === 'INVIABLE') return '✗ Inviable';
    return estado;
  }

  function getMargenHealthClass(margen: number): string {
    if (margen > 25) return 'excellent';
    if (margen >= 20) return 'good';
    if (margen >= 15) return 'fair';
    if (margen >= 5) return 'poor';
    return 'critical';
  }

  function getMargenHealthLabel(margen: number): string {
    if (margen > 25) return 'Excelente';
    if (margen >= 20) return 'Bueno';
    if (margen >= 15) return 'Aceptable';
    if (margen >= 5) return 'Pobre';
    return 'Crítico';
  }

  function getFoodCostHealthClass(fc: number): string {
    if (fc <= 30) return 'optimal';
    if (fc <= 35) return 'good';
    if (fc <= 40) return 'warning';
    return 'critical';
  }

  function getFoodCostHealthLabel(fc: number): string {
    if (fc <= 30) return 'Óptimo';
    if (fc <= 35) return 'Bueno';
    if (fc <= 40) return 'Advertencia';
    return 'Crítico';
  }

  function calculateMarkup(coste: number, precio: number): number {
    if (coste === 0) return 0;
    return ((precio - coste) / coste) * 100;
  }

  $: markup = viabilidad ? calculateMarkup(viabilidad.coste_porcion, viabilidad.precio_venta) : 0;
  $: previousVersion = historico && historico.length > 1 ? historico[1] : null;
  $: marginChange = previousVersion ? viabilidad.margen_bruto - previousVersion.margen_bruto : 0;
  $: marginChangePercent = previousVersion ? ((marginChange / previousVersion.margen_bruto) * 100) : 0;
</script>

<div class="detail-container">
  {#if !viabilidad}
    <div class="empty-state">
      <p>Selecciona una receta para ver detalles</p>
    </div>
  {:else}
    <!-- HEADER -->
    <div class="detail-header">
      <div class="header-back">
        <button class="btn-back" on:click={onBack}>← Atrás</button>
      </div>
      <div class="header-title">
        <h1>{viabilidad.receta_nombre}</h1>
        <span class="estado-badge {getEstadoClass(viabilidad.estado)}">
          {getEstadoLabel(viabilidad.estado)}
        </span>
      </div>
    </div>

    <!-- MAIN BREAKDOWN -->
    <div class="detail-content">
      <!-- Cost & Pricing Section -->
      <section class="section">
        <h2 class="section-title">💰 Costes y Precio</h2>
        <div class="breakdown-grid">
          <div class="breakdown-item">
            <span class="label">Coste por Porción</span>
            <span class="value price">{formatPrice(viabilidad.coste_porcion)}</span>
          </div>
          <div class="breakdown-item">
            <span class="label">Precio de Venta</span>
            <span class="value price">{formatPrice(viabilidad.precio_venta)}</span>
          </div>
          <div class="breakdown-item">
            <span class="label">Margen Bruto €</span>
            <span class="value price">{formatPrice(viabilidad.margen_bruto)}</span>
          </div>
          <div class="breakdown-item">
            <span class="label">Markup</span>
            <span class="value">{markup.toFixed(1)}%</span>
          </div>
        </div>
      </section>

      <!-- Profitability Section -->
      <section class="section">
        <h2 class="section-title">📊 Rentabilidad</h2>
        <div class="metrics-grid">
          <div class="metric-card {getMargenHealthClass(viabilidad.margen_porcentaje)}">
            <div class="metric-label">Margen %</div>
            <div class="metric-value">{formatPercent(viabilidad.margen_porcentaje)}</div>
            <div class="metric-status">{getMargenHealthLabel(viabilidad.margen_porcentaje)}</div>
          </div>

          <div class="metric-card {getFoodCostHealthClass(viabilidad.food_cost_porcentaje)}">
            <div class="metric-label">Food Cost</div>
            <div class="metric-value">{formatPercent(viabilidad.food_cost_porcentaje)}</div>
            <div class="metric-status">{getFoodCostHealthLabel(viabilidad.food_cost_porcentaje)}</div>
          </div>
        </div>

        <!-- Margin Visualization -->
        <div class="margin-visualization">
          <div class="margin-bar">
            <div class="margin-segment cost" style={`width: ${viabilidad.food_cost_porcentaje}%`}>
              <span class="segment-label" style={`opacity: ${viabilidad.food_cost_porcentaje > 15 ? 1 : 0}`}>
                Food Cost
              </span>
            </div>
            <div class="margin-segment profit" style={`width: ${viabilidad.margen_porcentaje}%`}>
              <span class="segment-label" style={`opacity: ${viabilidad.margen_porcentaje > 15 ? 1 : 0}`}>
                Margen
              </span>
            </div>
            {#if viabilidad.food_cost_porcentaje + viabilidad.margen_porcentaje < 100}
              <div class="margin-segment other" style={`width: ${100 - viabilidad.food_cost_porcentaje - viabilidad.margen_porcentaje}%`}>
                <span class="segment-label">Otros</span>
              </div>
            {/if}
          </div>
          <div class="margin-legend">
            <span class="legend-item cost">Food Cost: {formatPercent(viabilidad.food_cost_porcentaje)}</span>
            <span class="legend-item profit">Margen: {formatPercent(viabilidad.margen_porcentaje)}</span>
          </div>
        </div>
      </section>

      <!-- Historical Comparison -->
      {#if previousVersion}
        <section class="section">
          <h2 class="section-title">📈 Comparación Histórica</h2>
          <div class="historical-comparison">
            <div class="comparison-item">
              <span class="label">Margen Anterior</span>
              <span class="value">{formatPrice(previousVersion.margen_bruto)}</span>
              <span class="date">{formatDate(previousVersion.evaluado_at)}</span>
            </div>
            <div class="comparison-item">
              <span class="label">Margen Actual</span>
              <span class="value">{formatPrice(viabilidad.margen_bruto)}</span>
              <span class="date">{formatDate(viabilidad.evaluado_at)}</span>
            </div>
            <div class="comparison-change" class:positive={marginChange > 0} class:negative={marginChange < 0}>
              <span class="change-label">Cambio</span>
              <span class="change-value">
                {marginChange > 0 ? '+' : ''}{formatPrice(marginChange)}
                ({marginChangePercent > 0 ? '+' : ''}{marginChangePercent.toFixed(1)}%)
              </span>
            </div>
          </div>
        </section>
      {/if}

      <!-- Recommendations Section -->
      {#if recomendaciones.length > 0}
        <section class="section">
          <h2 class="section-title">💡 Recomendaciones ({recomendaciones.filter(r => !r.implementada).length})</h2>
          <ViabilidadRecomendaciones
            {recomendaciones}
            onImplement={onImplementRecondacion}
          />
        </section>
      {/if}

      <!-- Footer -->
      <div class="detail-footer">
        <span class="evaluado-at">Evaluado: {formatDate(viabilidad.evaluado_at)}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .detail-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: white;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #6b7280;
    font-size: 14px;
  }

  .detail-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-back {
    flex-shrink: 0;
  }

  .btn-back {
    background: none;
    border: none;
    color: #6b7280;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    transition: color 0.2s;
  }

  .btn-back:hover {
    color: #1f2937;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .header-title h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .estado-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .estado-badge.viable {
    background: #d1fae5;
    color: #065f46;
  }

  .estado-badge.aceptable {
    background: #dbeafe;
    color: #0c4a6e;
  }

  .estado-badge.critico {
    background: #fed7aa;
    color: #92400e;
  }

  .estado-badge.inviable {
    background: #fecaca;
    color: #991b1b;
  }

  .detail-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .section {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .section-title {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .breakdown-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
  }

  .breakdown-item {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 12px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label {
    font-size: 11px;
    text-transform: uppercase;
    color: #6b7280;
    letter-spacing: 0.5px;
  }

  .value {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .value.price {
    color: #3b82f6;
    font-size: 15px;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }

  .metric-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 16px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .metric-card.excellent,
  .metric-card.optimal {
    background: #f0fdf4;
    border-color: #dcfce7;
  }

  .metric-card.good {
    background: #f0f9ff;
    border-color: #bfdbfe;
  }

  .metric-card.fair,
  .metric-card.warning {
    background: #fef3c7;
    border-color: #fcd34d;
  }

  .metric-card.poor,
  .metric-card.critical {
    background: #fee2e2;
    border-color: #fca5a5;
  }

  .metric-label {
    font-size: 11px;
    text-transform: uppercase;
    color: #6b7280;
    letter-spacing: 0.5px;
  }

  .metric-value {
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
  }

  .metric-status {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
  }

  .margin-visualization {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .margin-bar {
    display: flex;
    height: 32px;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
  }

  .margin-segment {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 600;
    color: white;
    position: relative;
  }

  .margin-segment.cost {
    background: #ef4444;
  }

  .margin-segment.profit {
    background: #10b981;
  }

  .margin-segment.other {
    background: #9ca3af;
  }

  .segment-label {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .margin-legend {
    display: flex;
    gap: 16px;
    font-size: 12px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .legend-item.cost::before {
    content: '';
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: #ef4444;
  }

  .legend-item.profit::before {
    content: '';
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: #10b981;
  }

  .historical-comparison {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
  }

  .comparison-item {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .comparison-change {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 4px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }

  .comparison-change.positive {
    background: #f0fdf4;
    border-color: #dcfce7;
  }

  .comparison-change.negative {
    background: #fee2e2;
    border-color: #fca5a5;
  }

  .change-label {
    font-size: 11px;
    text-transform: uppercase;
    color: #6b7280;
    letter-spacing: 0.5px;
  }

  .change-value {
    font-size: 14px;
    font-weight: 600;
  }

  .comparison-change.positive .change-value {
    color: #059669;
  }

  .comparison-change.negative .change-value {
    color: #dc2626;
  }

  .date {
    font-size: 10px;
    color: #9ca3af;
  }

  .detail-footer {
    padding: 12px 16px;
    border-top: 1px solid #e5e7eb;
    font-size: 11px;
    color: #9ca3af;
    text-align: center;
  }

  .evaluado-at {
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
</style>
