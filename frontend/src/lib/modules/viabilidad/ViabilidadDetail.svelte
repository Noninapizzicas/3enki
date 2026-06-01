<script lang="ts">
  /**
   * ViabilidadDetail Component
   *
   * Vista de detalle de un expediente de viabilidad (shape canonico del
   * blueprint: input.nombre, calculo.coste_porcion, pvp_efectivo,
   * food_cost_pct, margen_porcion, veredicto, advertencias, caminos).
   * Muestra costes y precio, rentabilidad (food cost / margen), veredicto,
   * advertencias y los caminos (la brujula) como tarjetas que lanzan el chat.
   */

  import ViabilidadRecomendaciones from './ViabilidadRecomendaciones.svelte';

  export let viabilidad: any = null;
  export let caminos: any[] = [];
  export let onBack: (() => void) | null = null;

  function formatPrice(n: number): string {
    if (typeof n !== 'number' || isNaN(n)) return '—';
    return n.toFixed(2) + '€';
  }

  function formatPercent(n: number): string {
    if (typeof n !== 'number' || isNaN(n)) return '—';
    return n.toFixed(1) + '%';
  }

  function formatDate(iso: string): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('es-ES', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function getVeredictoClass(v: string): string {
    if (v === 'viable') return 'viable';
    if (v === 'viable_con_advertencias') return 'aceptable';
    if (v === 'no_viable_economicamente') return 'inviable';
    if (v === 'sin_pvp_objetivo') return 'orientativo';
    return 'unknown';
  }

  function getVeredictoLabel(v: string): string {
    if (v === 'viable') return '✓ Viable';
    if (v === 'viable_con_advertencias') return '⚠ Viable con advertencias';
    if (v === 'no_viable_economicamente') return '✗ No viable';
    if (v === 'sin_pvp_objetivo') return '⊙ Sin PVP objetivo';
    return v || '—';
  }

  function getFoodCostHealthClass(fc: number): string {
    if (typeof fc !== 'number' || isNaN(fc)) return '';
    if (fc <= 30) return 'optimal';
    if (fc <= 35) return 'good';
    if (fc <= 45) return 'warning';
    return 'critical';
  }

  function getFoodCostHealthLabel(fc: number): string {
    if (typeof fc !== 'number' || isNaN(fc)) return '—';
    if (fc <= 30) return 'Óptimo';
    if (fc <= 35) return 'Bueno';
    if (fc <= 45) return 'Apretado';
    return 'Crítico';
  }

  $: costePorcion = viabilidad?.calculo?.coste_porcion;
  $: pvpEfectivo = viabilidad?.pvp_efectivo;
  $: pvpSugerido = viabilidad?.pvp_sugerido;
  $: margenPorcion = viabilidad?.margen_porcion;
  $: foodCostPct = viabilidad?.food_cost_pct;
  $: margenPct = typeof foodCostPct === 'number' ? 100 - foodCostPct : null;
  $: nombre = viabilidad?.input?.nombre;
  $: advertencias = Array.isArray(viabilidad?.advertencias) ? viabilidad.advertencias : [];
</script>

<div class="detail-container">
  {#if !viabilidad}
    <div class="empty-state">
      <p>Selecciona un expediente para ver detalles</p>
    </div>
  {:else}
    <!-- HEADER -->
    <div class="detail-header">
      <div class="header-back">
        <button class="btn-back" on:click={onBack}>← Atrás</button>
      </div>
      <div class="header-title">
        <h1>{nombre || 'Producto sin nombre'}</h1>
        <span class="estado-badge {getVeredictoClass(viabilidad.veredicto)}">
          {getVeredictoLabel(viabilidad.veredicto)}
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
            <span class="value price">{formatPrice(costePorcion)}</span>
          </div>
          <div class="breakdown-item">
            <span class="label">PVP Efectivo</span>
            <span class="value price">{formatPrice(pvpEfectivo)}</span>
          </div>
          <div class="breakdown-item">
            <span class="label">Margen por Porción</span>
            <span class="value price">{formatPrice(margenPorcion)}</span>
          </div>
          <div class="breakdown-item">
            <span class="label">PVP Sugerido</span>
            <span class="value">{formatPrice(pvpSugerido)}</span>
          </div>
        </div>
      </section>

      <!-- Profitability Section -->
      <section class="section">
        <h2 class="section-title">📊 Rentabilidad</h2>
        <div class="metrics-grid">
          <div class="metric-card {getFoodCostHealthClass(foodCostPct)}">
            <div class="metric-label">Margen %</div>
            <div class="metric-value">{formatPercent(margenPct)}</div>
            <div class="metric-status">{getFoodCostHealthLabel(foodCostPct)}</div>
          </div>

          <div class="metric-card {getFoodCostHealthClass(foodCostPct)}">
            <div class="metric-label">Food Cost</div>
            <div class="metric-value">{formatPercent(foodCostPct)}</div>
            <div class="metric-status">{getFoodCostHealthLabel(foodCostPct)}</div>
          </div>
        </div>

        <!-- Margin Visualization -->
        {#if typeof foodCostPct === 'number' && typeof margenPct === 'number'}
          <div class="margin-visualization">
            <div class="margin-bar">
              <div class="margin-segment cost" style={`width: ${foodCostPct}%`}>
                <span class="segment-label" style={`opacity: ${foodCostPct > 15 ? 1 : 0}`}>
                  Food Cost
                </span>
              </div>
              <div class="margin-segment profit" style={`width: ${margenPct}%`}>
                <span class="segment-label" style={`opacity: ${margenPct > 15 ? 1 : 0}`}>
                  Margen
                </span>
              </div>
            </div>
            <div class="margin-legend">
              <span class="legend-item cost">Food Cost: {formatPercent(foodCostPct)}</span>
              <span class="legend-item profit">Margen: {formatPercent(margenPct)}</span>
            </div>
          </div>
        {/if}
      </section>

      <!-- Advertencias -->
      {#if advertencias.length > 0}
        <section class="section">
          <h2 class="section-title">⚠ Advertencias</h2>
          <ul class="advertencias-list">
            {#each advertencias as adv}
              <li>{adv}</li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- Caminos (la brujula) -->
      <section class="section">
        <h2 class="section-title">🧭 Caminos ({caminos.length})</h2>
        <ViabilidadRecomendaciones {caminos} />
      </section>

      <!-- Footer -->
      <div class="detail-footer">
        <span class="evaluado-at">Evaluado: {formatDate(viabilidad.fecha_evaluacion)}</span>
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
    background: #fef3c7;
    color: #92400e;
  }

  .estado-badge.orientativo {
    background: #dbeafe;
    color: #0c4a6e;
  }

  .estado-badge.inviable {
    background: #fecaca;
    color: #991b1b;
  }

  .estado-badge.unknown {
    background: #f3f4f6;
    color: #6b7280;
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

  .metric-card.optimal {
    background: #f0fdf4;
    border-color: #dcfce7;
  }

  .metric-card.good {
    background: #f0f9ff;
    border-color: #bfdbfe;
  }

  .metric-card.warning {
    background: #fef3c7;
    border-color: #fcd34d;
  }

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

  .advertencias-list {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .advertencias-list li {
    font-size: 12px;
    color: #92400e;
    line-height: 1.4;
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
