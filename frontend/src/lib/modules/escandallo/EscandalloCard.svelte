<script lang="ts">
  /**
   * EscandalloCard Component
   *
   * Compact card view for a single escandallo calculation.
   * Shows:
   * - Recipe name and cost per portion
   * - Most expensive ingredient
   * - Alert badges (if any)
   * - Food cost indicator (when precio_venta provided)
   */

  export let escandallo: any = null;
  export let onSelect: ((id: string) => void) | null = null;
  export let compact = false;

  $: hasAlerts = escandallo?.alertas_sin_leer > 0;
  $: alertClass = escandallo?.alertas_sin_leer > 2 ? 'critical' : 'warning';

  function formatPrice(n: number): string {
    return parseFloat(n).toFixed(2) + '€';
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getFoodCostClass(fc: number): string {
    if (fc <= 25) return 'optimal';
    if (fc <= 35) return 'good';
    if (fc <= 40) return 'warning';
    return 'critical';
  }
</script>

<div class="card" class:compact on:click={() => onSelect?.(escandallo.id)}>
  <div class="card-header">
    <h3>{escandallo.receta_nombre || 'Receta'}</h3>
    {#if hasAlerts}
      <span class="badge alert {alertClass}">
        {escandallo.alertas_sin_leer} alerta{escandallo.alertas_sin_leer > 1 ? 's' : ''}
      </span>
    {/if}
  </div>

  <div class="card-content">
    <div class="cost-main">
      <span class="label">Coste por porción</span>
      <span class="value">{formatPrice(escandallo.coste_porcion)}</span>
    </div>

    {#if escandallo.coste_total}
      <div class="cost-total">
        <span class="label">Total</span>
        <span class="value">{formatPrice(escandallo.coste_total)}</span>
      </div>
    {/if}

    {#if escandallo.max_cambio_porcentaje}
      <div class="price-change">
        <span class="label">Cambio máximo</span>
        <span class="value" class:significant={escandallo.max_cambio_porcentaje > 20}>
          {escandallo.max_cambio_porcentaje > 0 ? '+' : ''}{escandallo.max_cambio_porcentaje.toFixed(1)}%
        </span>
      </div>
    {/if}
  </div>

  <div class="card-footer">
    <span class="date">{formatDate(escandallo.calculado_at)}</span>
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
  }

  .badge {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .badge.alert {
    background: #fecaca;
    color: #991b1b;
  }

  .badge.alert.critical {
    background: #fca5a5;
    color: #7f1d1d;
  }

  .card-content {
    display: grid;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 12px;
  }

  .cost-main,
  .cost-total,
  .price-change {
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

  .price-change .value.significant {
    color: #ef4444;
  }

  .cost-total .value {
    color: #6366f1;
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
