<script lang="ts">
  /**
   * ViabilidadCard Component
   *
   * Tarjeta compacta de un expediente de viabilidad (shape canonico del
   * blueprint). Muestra nombre del producto, veredicto, food cost, margen
   * por porcion y conteo de caminos disponibles.
   */

  export let viabilidad: any = null;
  export let onSelect: ((id: string) => void) | null = null;
  export let compact = false;

  $: nombre = viabilidad?.input?.nombre;
  $: foodCostPct = viabilidad?.food_cost_pct;
  $: margenPct = typeof foodCostPct === 'number' ? 100 - foodCostPct : null;
  $: margenPorcion = viabilidad?.margen_porcion;
  $: numCaminos = Array.isArray(viabilidad?.caminos) ? viabilidad.caminos.length : 0;

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
    return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    if (v === 'viable_con_advertencias') return '⚠ Con advertencias';
    if (v === 'no_viable_economicamente') return '✗ No viable';
    if (v === 'sin_pvp_objetivo') return '⊙ Sin PVP';
    return v || '—';
  }

  function getFoodCostClass(fc: number): string {
    if (typeof fc !== 'number' || isNaN(fc)) return '';
    if (fc <= 30) return 'optimal';
    if (fc <= 35) return 'good';
    if (fc <= 45) return 'warning';
    return 'critical';
  }
</script>

<div class="card" class:compact on:click={() => onSelect?.(viabilidad.id)}>
  <div class="card-header">
    <h3>{nombre || 'Producto'}</h3>
    <span class="estado-badge {getVeredictoClass(viabilidad?.veredicto)}">
      {getVeredictoLabel(viabilidad?.veredicto)}
    </span>
  </div>

  <div class="card-content">
    <div class="margin-main">
      <span class="label">Margen</span>
      <span class="value {getFoodCostClass(foodCostPct)}">
        {formatPercent(margenPct)}
      </span>
    </div>

    <div class="food-cost">
      <span class="label">Food Cost</span>
      <span class="value {getFoodCostClass(foodCostPct)}">
        {formatPercent(foodCostPct)}
      </span>
    </div>

    {#if typeof margenPorcion === 'number'}
      <div class="margin-bruto">
        <span class="label">Margen €</span>
        <span class="value">{formatPrice(margenPorcion)}</span>
      </div>
    {/if}
  </div>

  <div class="card-alerts">
    {#if numCaminos > 0}
      <span class="alert-badge caminos">
        🧭 {numCaminos} camino{numCaminos > 1 ? 's' : ''}
      </span>
    {/if}
  </div>

  <div class="card-footer">
    <span class="date">{formatDate(viabilidad?.fecha_evaluacion)}</span>
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

  .alert-badge.caminos {
    background: #eff6ff;
    color: #1d4ed8;
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
