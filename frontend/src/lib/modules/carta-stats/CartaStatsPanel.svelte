<script lang="ts">
  /**
   * CartaStatsPanel - Estadísticas de la carta digital.
   *
   * Stats requieren analytics persistido (sesiones, pedidos). El JS legacy
   * tenia un sink propio que se perdio en la migracion a blueprint; el
   * blueprint actual de carta-digital NO declara operacion `stats` ni
   * persiste sesiones. Hasta que se decida donde viven los analytics
   * (subscriber dedicado, agent-observer, log estructurado en filesystem),
   * el panel muestra placeholder.
   */
  export let panelId: string = '';
</script>

<div class="panel-body">
  <div class="placeholder">
    <div class="icon">📊</div>
    <p class="title">Estadísticas no disponibles aún</p>
    <p class="hint">
      La captura de sesiones y pedidos está pendiente de implementar
      en el blueprint de <code>carta-digital</code>. Mientras tanto,
      consulta los pedidos directamente en la página de cocina o pídelos
      por chat.
    </p>
  </div>
</div>

<style>
  .panel-body {
    display: flex; flex-direction: column;
    padding: 1rem;
    height: 100%;
  }
  .placeholder {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 0.5rem;
    flex: 1;
    text-align: center;
    color: var(--color-text-muted, #888);
  }
  .icon { font-size: 2.5rem; opacity: 0.4; }
  .title { margin: 0; font-size: 0.85rem; color: var(--color-text, #e5e5e5); font-weight: 600; }
  .hint {
    margin: 0; font-size: 0.7rem; line-height: 1.45;
    max-width: 28rem;
  }
  .hint code {
    font-family: monospace;
    padding: 0.05rem 0.3rem;
    background: rgba(255,255,255,0.06);
    border-radius: 0.2rem;
    font-size: 0.65rem;
  }
</style>
