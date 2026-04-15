<script lang="ts">
  /**
   * ViabilidadCard Component
   *
   * Compact card view for a single recipe viability.
   * Shows:
   * - Recipe name and margin
   * - Food cost percentage
   * - Viability status (VIABLE, ACEPTABLE, CRÍTICO, INVIABLE)
   * - Pending recommendations count
   * - Color-coded indicators
   */

  export let viabilidad: any = null;
  export let onSelect: ((id: string) => void) | null = null;
  export let compact = false;

  $: hasRecommendations = viabilidad?.recomendaciones_pendientes > 0;
  $: hasCriticalRisks = viabilidad?.riesgos_criticos > 0;

  function formatPrice(n: number): string {
    return parseFloat(n).toFixed(2) + '€';
  }

  function formatPercent(n: number): string {
    return parseFloat(n).toFixed(1) + '%';
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

  function getFoodCostClass(fc: number): string {
    if (fc <= 30) return 'optimal';
    if (fc <= 35) return 'good';
    if (fc <= 40) return 'warning';
    return 'critical';
  }

  function getMargenClass(margen: number): string {
    if (margen > 25) return 'optimal';
    if (margen >= 15) return 'good';
    if (margen >= 5) return 'warning';
    return 'critical';
  }
</script>

<div class="card" class:compact on:click={() => onSelect?.(viabilidad.id)}>
  <div class="card-header">
    <h3>{viabilidad.receta_nombre || 'Receta'}</h3>
    <span class="estado-badge {getEstadoClass(viabilidad.estado)}">
      {getEstadoLabel(viabilidad.estado)}
    </span>
  </div>

  <div class="card-content">
    <div class="margin-main">
      <span class="label">Margen</span>
      <span class="value {getMargenClass(viabilidad.margen_porcentaje)}">
        {formatPercent(viabilidad.margen_porcentaje)}
      </span>
    </div>

    <div class="food-cost">
      <span class="label">Food Cost</span>
      <span class="value {getFoodCostClass(viabilidad.food_cost_porcentaje)}">
        {formatPercent(viabilidad.food_cost_porcentaje)}
      </span>
    </div>

    {#if viabilidad.margen_bruto}
      <div class="margin-bruto">
        <span class="label">Margen €</span>
        <span class="value">{formatPrice(viabilidad.margen_bruto)}</span>
      </div>
    {/if}
  </div>

  <div class="card-alerts">
    {#if hasRecommendations}
      <span class="alert-badge {hasCriticalRisks ? 'critical' : 'warning'}">
        {viabilidad.recomendaciones_pendientes} rec{viabilidad.recomendaciones_pendientes > 1 ? 's' : ''}
      </span>
    {/if}
  </div>

  <div class="card-footer">
    <span class="date">{formatDate(viabilidad.evaluado_at)}</span>
    <span class="clickhint">→</span>
  </div>
</div>

<style>
  .card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
  }

  .card:hover {
    border-color: #3b82f6;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
    transform: translateY(-2px);
  }

  .card.compact {
    padding: 12px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .card-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    flex: 1;
  }

  .estado-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
    margin-left: 8px;
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

  .card-content {
    display: grid;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 12px;
  }

  .margin-main,
  .food-cost,
  .margin-bruto {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .label {
    color: #6b7280;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .value {
    font-weight: 600;
    color: #1f2937;
    font-size: 13px;
  }

  .value.optimal {
    color: #059669;
  }

  .value.good {
    color: #0891b2;
  }

  .value.warning {
    color: #d97706;
  }

  .value.critical {
    color: #dc2626;
  }

  .card-alerts {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
    min-height: 20px;
  }

  .alert-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .alert-badge.warning {
    background: #fef3c7;
    color: #92400e;
  }

  .alert-badge.critical {
    background: #fee2e2;
    color: #991b1b;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 8px;
    border-top: 1px solid #f3f4f6;
    font-size: 11px;
  }

  .date {
    color: #9ca3af;
  }

  .clickhint {
    color: #d1d5db;
  }
</style>
