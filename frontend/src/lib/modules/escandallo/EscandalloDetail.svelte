<script lang="ts">
  /**
   * EscandalloDetail Component
   *
   * Full details view for an escandallo calculation.
   * Shows:
   * - Complete cost breakdown by ingredient
   * - Percentage contribution of each ingredient
   * - Historical comparison
   * - Viability assessment (food cost %)
   */

  export let escandallo: any = null;
  export let historico: any[] = [];

  $: ingredientes = (escandallo as any)?.precio_mercado_snapshot
    ? Object.entries((escandallo as any).precio_mercado_snapshot)
        .map(([nombre, precio]: [string, any]) => ({
          nombre,
          precio,
          porcentaje: ((precio / (escandallo.coste_total || 1)) * 100).toFixed(1)
        }))
        .sort((a, b) => parseFloat(b.porcentaje) - parseFloat(a.porcentaje))
    : [];

  $: fc = escandallo?.precio_venta
    ? ((escandallo.coste_unidad / escandallo.precio_venta) * 100)
    : 0;

  $: fcStatus = getFoodCostStatus(fc);

  function formatPrice(n: number): string {
    return parseFloat(n).toFixed(2) + '€';
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function getTopIngredient() {
    return ingredientes[0];
  }

  function getFoodCostStatus(porcentaje: number): { text: string; class: string } {
    if (porcentaje <= 25) return { text: 'Excelente', class: 'optimal' };
    if (porcentaje <= 35) return { text: 'Aceptable', class: 'good' };
    if (porcentaje <= 40) return { text: 'Advertencia', class: 'warning' };
    return { text: 'Crítico', class: 'critical' };
  }
</script>

<div class="detail-container">
  <div class="header">
    <h2>{escandallo?.receta_nombre || 'Escandallo'}</h2>
    <p class="timestamp">{formatDate(escandallo?.calculado_at)}</p>
  </div>

  <div class="summary-grid">
    <div class="summary-item">
      <span class="label">Coste Total</span>
      <span class="value large">{formatPrice(escandallo?.coste_total)}</span>
    </div>
    <div class="summary-item">
      <span class="label">Coste por Porción</span>
      <span class="value large">{formatPrice(escandallo?.coste_unidad)}</span>
    </div>
    {#if escandallo?.precio_venta}
      <div class="summary-item">
        <span class="label">Precio Venta</span>
        <span class="value large">{formatPrice(escandallo.precio_venta)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Margen</span>
        <span class="value large">{formatPrice(escandallo.precio_venta - escandallo.coste_unidad)}</span>
      </div>
    {/if}
  </div>

  {#if escandallo?.precio_venta}
    <div class="food-cost-section">
      <h3>Análisis de Viabilidad</h3>
      <div class="food-cost-box {fcStatus.class}">
        <div class="fc-value">{fc.toFixed(1)}%</div>
        <div class="fc-label">Food Cost</div>
        <div class="fc-status">{fcStatus.text}</div>
        {#if fc > 35}
          <p class="recommendation">
            Para 30% recomendado: {formatPrice(escandallo.coste_unidad / 0.30)}
          </p>
        {/if}
      </div>
    </div>
  {/if}

  <div class="breakdown-section">
    <h3>Desglose por Ingrediente</h3>
    {#if ingredientes.length > 0}
      <div class="ingredient-list">
        {#each ingredientes as ing}
          <div class="ingredient-item">
            <div class="ingredient-name">{ing.nombre}</div>
            <div class="ingredient-price">{formatPrice(ing.precio)}</div>
            <div class="ingredient-bar">
              <div class="bar-fill" style="width: {ing.porcentaje}%"></div>
            </div>
            <div class="ingredient-pct">{ing.porcentaje}%</div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="empty">Sin desglose disponible</p>
    {/if}
  </div>

  {#if historico && historico.length > 0}
    <div class="history-section">
      <h3>Histórico</h3>
      <div class="history-list">
        {#each historico as hist}
          {@const diff = escandallo?.coste_unidad ? escandallo.coste_unidad - hist.coste_unidad : 0}
          {@const pct = hist.coste_unidad ? (diff / hist.coste_unidad) * 100 : 0}
          <div class="history-item">
            <span class="hist-date">{formatDate(hist.calculado_at)}</span>
            <span class="hist-cost">{formatPrice(hist.coste_unidad)}</span>
            {#if escandallo && hist.coste_unidad !== escandallo.coste_unidad}
              <span class="hist-change" class:increase={diff > 0} class:decrease={diff < 0}>
                {diff > 0 ? '+' : ''}{pct.toFixed(1)}%
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .detail-container {
    padding: 20px;
    background: white;
  }

  .header {
    margin-bottom: 20px;
  }

  .header h2 {
    margin: 0 0 4px 0;
    font-size: 20px;
    color: #1f2937;
  }

  .timestamp {
    margin: 0;
    font-size: 12px;
    color: #9ca3af;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }

  .summary-item {
    padding: 12px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .summary-item .label {
    font-size: 11px;
    text-transform: uppercase;
    color: #6b7280;
    letter-spacing: 0.5px;
  }

  .summary-item .value {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .summary-item .value.large {
    font-size: 18px;
  }

  .food-cost-section {
    margin-bottom: 20px;
  }

  .food-cost-section h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .food-cost-box {
    padding: 16px;
    border-radius: 8px;
    text-align: center;
  }

  .food-cost-box.optimal {
    background: #dcfce7;
    border: 1px solid #86efac;
  }

  .food-cost-box.good {
    background: #fef3c7;
    border: 1px solid #fcd34d;
  }

  .food-cost-box.warning {
    background: #fed7aa;
    border: 1px solid #fdba74;
  }

  .food-cost-box.critical {
    background: #fecaca;
    border: 1px solid #fca5a5;
  }

  .fc-value {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .fc-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.7;
  }

  .fc-status {
    font-size: 13px;
    font-weight: 600;
    margin: 8px 0 0 0;
  }

  .recommendation {
    margin: 8px 0 0 0;
    font-size: 11px;
    opacity: 0.8;
  }

  .breakdown-section h3,
  .history-section h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .ingredient-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ingredient-item {
    display: grid;
    grid-template-columns: 120px 60px 1fr 40px;
    gap: 8px;
    align-items: center;
    font-size: 12px;
  }

  .ingredient-name {
    font-weight: 500;
    color: #1f2937;
  }

  .ingredient-price {
    text-align: right;
    font-weight: 600;
    color: #3b82f6;
  }

  .ingredient-bar {
    height: 20px;
    background: #f3f4f6;
    border-radius: 4px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #06b6d4);
  }

  .ingredient-pct {
    text-align: right;
    color: #6b7280;
    font-size: 11px;
  }

  .empty {
    color: #9ca3af;
    font-size: 12px;
  }

  .history-section {
    margin-top: 20px;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .history-item {
    display: grid;
    grid-template-columns: 100px 80px 1fr;
    gap: 12px;
    padding: 8px;
    background: #f9fafb;
    border-radius: 4px;
    font-size: 12px;
    align-items: center;
  }

  .hist-date {
    color: #6b7280;
  }

  .hist-cost {
    font-weight: 600;
    color: #3b82f6;
  }

  .hist-change {
    text-align: right;
    font-weight: 600;
  }

  .hist-change.increase {
    color: #ef4444;
  }

  .hist-change.decrease {
    color: #22c55e;
  }
</style>
