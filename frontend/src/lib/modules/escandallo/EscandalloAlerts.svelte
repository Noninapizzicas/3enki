<script lang="ts">
  /**
   * EscandalloAlerts Component
   *
   * Display price change alerts and detected anomalies.
   * Shows:
   * - Unread alerts with severity levels
   * - Price change history (increased/decreased)
   * - Anomalies detected by analyzer agent
   */

  export let escandallo: any = null;
  export let alertas: any[] = [];
  export let anomalias: any[] = [];
  export let onMarkAsRead: ((alertaId: string) => void) | null = null;

  $: unreadAlerts = alertas.filter(a => !a.leida);
  $: readAlerts = alertas.filter(a => a.leida);

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getSeverityClass(tipo: string): string {
    if (tipo === 'precio_subio') return 'increase';
    if (tipo === 'precio_bajo') return 'decrease';
    if (tipo === 'falta_precio') return 'missing';
    return 'info';
  }

  function getSeverityLabel(tipo: string): string {
    switch (tipo) {
      case 'precio_subio': return 'Precio Subió';
      case 'precio_bajo': return 'Precio Bajó';
      case 'falta_precio': return 'Falta Precio';
      default: return 'Información';
    }
  }

  function getAnomalyIcon(tipo: string): string {
    switch (tipo) {
      case 'ingrediente_muy_caro': return '🚨';
      case 'food_cost_alto': return '⚠️';
      case 'coste_irreal': return '❌';
      default: return 'ℹ️';
    }
  }
</script>

<div class="alerts-container">
  {#if unreadAlerts.length === 0 && anomalias.length === 0}
    <div class="empty-state">
      <p>✓ Sin alertas activas</p>
      <p class="hint">Los cálculos y precios están al día</p>
    </div>
  {:else}
    <!-- PRICE CHANGE ALERTS -->
    {#if unreadAlerts.length > 0}
      <div class="alerts-section">
        <h3>Alertas de Cambios de Precio</h3>
        <div class="alerts-list">
          {#each unreadAlerts as alerta}
            <div class="alert-card {getSeverityClass(alerta.tipo_alerta)}">
              <div class="alert-header">
                <span class="ingredient">{alerta.ingrediente_nombre}</span>
                <span class="type {getSeverityClass(alerta.tipo_alerta)}">
                  {getSeverityLabel(alerta.tipo_alerta)}
                </span>
              </div>
              <div class="alert-details">
                <div class="price-info">
                  {#if alerta.precio_anterior}
                    <span class="label">Anterior</span>
                    <span class="value">{parseFloat(alerta.precio_anterior).toFixed(2)}€</span>
                  {/if}
                  {#if alerta.precio_nuevo}
                    <span class="label">Nuevo</span>
                    <span class="value">{parseFloat(alerta.precio_nuevo).toFixed(2)}€</span>
                  {/if}
                </div>
                {#if alerta.porcentaje_cambio}
                  <div class="change-badge {getSeverityClass(alerta.tipo_alerta)}">
                    {alerta.porcentaje_cambio > 0 ? '+' : ''}{alerta.porcentaje_cambio.toFixed(1)}%
                  </div>
                {/if}
              </div>
              <div class="alert-footer">
                <span class="date">{formatDate(alerta.detectada_at)}</span>
                {#if !alerta.leida}
                  <button
                    class="mark-read-btn"
                    on:click={() => onMarkAsRead?.(alerta.id)}
                    title="Marcar como leído"
                  >
                    ✓
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ANOMALIES FROM ANALYZER -->
    {#if anomalias.length > 0}
      <div class="alerts-section">
        <h3>Anomalías Detectadas</h3>
        <div class="anomalies-list">
          {#each anomalias as anomalia}
            <div class="anomaly-card">
              <div class="anomaly-icon">{getAnomalyIcon(anomalia.tipo)}</div>
              <div class="anomaly-content">
                <div class="anomaly-title">{anomalia.razon || anomalia.tipo}</div>
                {#if anomalia.ingrediente}
                  <p class="anomaly-detail">Ingrediente: {anomalia.ingrediente}</p>
                {/if}
                {#if anomalia.porcentaje}
                  <p class="anomaly-detail">Porcentaje: {anomalia.porcentaje}%</p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- READ ALERTS (COLLAPSED) -->
    {#if readAlerts.length > 0}
      <details class="read-alerts">
        <summary>
          Alertas Anteriores ({readAlerts.length})
        </summary>
        <div class="alerts-list">
          {#each readAlerts as alerta}
            <div class="alert-card read {getSeverityClass(alerta.tipo_alerta)}">
              <div class="alert-header">
                <span class="ingredient">{alerta.ingrediente_nombre}</span>
                <span class="type {getSeverityClass(alerta.tipo_alerta)}">
                  {getSeverityLabel(alerta.tipo_alerta)}
                </span>
              </div>
              <div class="alert-details">
                {#if alerta.porcentaje_cambio}
                  <span class="change-badge">
                    {alerta.porcentaje_cambio.toFixed(1)}%
                  </span>
                {/if}
              </div>
              <span class="date">{formatDate(alerta.detectada_at)}</span>
            </div>
          {/each}
        </div>
      </details>
    {/if}
  {/if}
</div>

<style>
  .alerts-container {
    padding: 16px;
    background: white;
  }

  .empty-state {
    text-align: center;
    padding: 20px;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: #22c55e;
  }

  .empty-state .hint {
    font-size: 12px;
    color: #6b7280;
    margin-top: 4px;
  }

  .alerts-section {
    margin-bottom: 20px;
  }

  .alerts-section h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .alerts-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .alert-card {
    padding: 12px;
    border-left: 4px solid #9ca3af;
    background: #f9fafb;
    border-radius: 4px;
    font-size: 12px;
  }

  .alert-card.increase {
    border-left-color: #ef4444;
    background: #fef2f2;
  }

  .alert-card.decrease {
    border-left-color: #22c55e;
    background: #f0fdf4;
  }

  .alert-card.missing {
    border-left-color: #f59e0b;
    background: #fffbeb;
  }

  .alert-card.read {
    opacity: 0.6;
  }

  .alert-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .ingredient {
    font-weight: 600;
    color: #1f2937;
  }

  .type {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 3px;
    background: white;
  }

  .type.increase {
    color: #991b1b;
    background: #fee2e2;
  }

  .type.decrease {
    color: #166534;
    background: #dcfce7;
  }

  .type.missing {
    color: #92400e;
    background: #fef3c7;
  }

  .alert-details {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }

  .price-info {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 8px;
    font-size: 11px;
  }

  .price-info .label {
    color: #6b7280;
  }

  .price-info .value {
    font-weight: 600;
    color: #1f2937;
  }

  .change-badge {
    padding: 4px 8px;
    background: white;
    border-radius: 3px;
    font-weight: 600;
    margin-left: auto;
  }

  .change-badge.increase {
    color: #991b1b;
  }

  .change-badge.decrease {
    color: #166534;
  }

  .alert-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 8px;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
  }

  .date {
    color: #9ca3af;
    font-size: 10px;
  }

  .mark-read-btn {
    padding: 2px 6px;
    background: #22c55e;
    color: white;
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .mark-read-btn:hover {
    background: #16a34a;
  }

  .anomalies-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .anomaly-card {
    display: flex;
    gap: 12px;
    padding: 12px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 4px;
    font-size: 12px;
  }

  .anomaly-icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .anomaly-content {
    flex: 1;
  }

  .anomaly-title {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 4px;
  }

  .anomaly-detail {
    margin: 0;
    color: #6b7280;
    font-size: 11px;
  }

  .read-alerts {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .read-alerts summary {
    cursor: pointer;
    color: #6b7280;
    font-size: 12px;
    font-weight: 500;
  }

  .read-alerts[open] summary {
    margin-bottom: 12px;
  }
</style>
