<script lang="ts">
  /**
   * ViabilidadRecomendaciones Component
   *
   * Display recommendations for improving viability.
   * Shows:
   * - Recommendation type (subir_precio, bajar_coste, reformular, eliminar)
   * - Priority level (CRÍTICA, ADVERTENCIA, INFO)
   * - Specific action details
   * - Estimated impact
   * - Implementation status
   */

  export let recomendaciones: any[] = [];
  export let onImplement: ((id: string) => void) | null = null;

  function getPrioridadColor(prioridad: string): string {
    if (prioridad === 'CRÍTICA') return '#dc2626';
    if (prioridad === 'ADVERTENCIA') return '#d97706';
    if (prioridad === 'INFO') return '#0891b2';
    return '#6b7280';
  }

  function getPrioridadBg(prioridad: string): string {
    if (prioridad === 'CRÍTICA') return '#fee2e2';
    if (prioridad === 'ADVERTENCIA') return '#fef3c7';
    if (prioridad === 'INFO') return '#e0f2fe';
    return '#f3f4f6';
  }

  function getTipoLabel(tipo: string): string {
    if (tipo === 'subir_precio') return '💰 Aumentar Precio';
    if (tipo === 'bajar_coste') return '📉 Reducir Coste';
    if (tipo === 'reformular') return '🔄 Reformular';
    if (tipo === 'eliminar') return '🗑️ Eliminar';
    return tipo;
  }

  function getImpactoEmoji(impacto: string): string {
    if (impacto.includes('+')) return '↑';
    if (impacto.includes('-')) return '↓';
    return '≈';
  }

  function formatImpacto(impacto: string): string {
    return impacto.replace(/margen/gi, 'Margen').replace(/€/g, '€');
  }
</script>

<div class="recomendaciones-container">
  {#if recomendaciones.length === 0}
    <div class="empty-state">
      <p>✓ Sin recomendaciones</p>
      <p class="hint">Esta receta está optimizada</p>
    </div>
  {:else}
    <div class="recomendaciones-list">
      {#each recomendaciones as rec, idx}
        <div class="recom-item" style={`border-left-color: ${getPrioridadColor(rec.prioridad)}`}>
          <div class="recom-header">
            <span class="tipo-label">{getTipoLabel(rec.tipo)}</span>
            <span
              class="prioridad-badge"
              style={`background: ${getPrioridadBg(rec.prioridad)}; color: ${getPrioridadColor(rec.prioridad)}`}
            >
              {rec.prioridad}
            </span>
            {#if rec.implementada}
              <span class="status-badge implemented">✓ Implementada</span>
            {/if}
          </div>

          {#if rec.accion}
            <div class="recom-action">
              <span class="label">Acción</span>
              <span class="action-text">{rec.accion}</span>
            </div>
          {/if}

          {#if rec.razon}
            <div class="recom-reason">
              <span class="label">Razón</span>
              <span class="reason-text">{rec.razon}</span>
            </div>
          {/if}

          {#if rec.impacto_estimado}
            <div class="recom-impact">
              <span class="label">Impacto Estimado</span>
              <span class="impact-value">
                {getImpactoEmoji(rec.impacto_estimado)}
                {formatImpacto(rec.impacto_estimado)}
              </span>
            </div>
          {/if}

          {#if !rec.implementada && onImplement}
            <div class="recom-actions">
              <button
                class="btn-implement"
                on:click={() => onImplement?.(rec.id)}
              >
                ✓ Marcar como Implementada
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .recomendaciones-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #6b7280;
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

  .recomendaciones-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .recom-item {
    background: white;
    border: 1px solid #e5e7eb;
    border-left: 4px solid #3b82f6;
    border-radius: 6px;
    padding: 12px;
    transition: all 0.2s;
  }

  .recom-item:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .recom-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .tipo-label {
    font-size: 12px;
    font-weight: 600;
    color: #1f2937;
    flex: 1;
  }

  .prioridad-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 3px 6px;
    border-radius: 3px;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .status-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 3px 6px;
    border-radius: 3px;
    white-space: nowrap;
  }

  .status-badge.implemented {
    background: #d1fae5;
    color: #065f46;
  }

  .recom-action,
  .recom-reason,
  .recom-impact {
    display: grid;
    grid-template-columns: 60px 1fr;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 12px;
  }

  .label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
    letter-spacing: 0.3px;
  }

  .action-text,
  .reason-text,
  .impact-value {
    color: #374151;
    font-size: 12px;
    line-height: 1.4;
  }

  .impact-value {
    font-weight: 600;
    color: #059669;
  }

  .recom-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #f3f4f6;
  }

  .btn-implement {
    flex: 1;
    padding: 6px 10px;
    background: #d1fae5;
    border: 1px solid #6ee7b7;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    color: #065f46;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-implement:hover {
    background: #a7f3d0;
    border-color: #6ee7b7;
  }
</style>
