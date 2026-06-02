<script lang="ts">
  /**
   * ViabilidadRecomendaciones Component
   *
   * Renderiza los caminos (la brujula del comerciante) de un expediente de
   * viabilidad como tarjetas. Cada camino = { titulo, prompt }: el boton lanza
   * el chat pre-rellenado con camino.prompt via prefillChatInput (Postura B del
   * contrato ui-frontend-blueprint). El desarrollo cualitativo del camino vive
   * en el chat, no aqui — sin taxonomia fija (tipo/prioridad/impacto).
   */

  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  export let caminos: any[] = [];

  function abrirCamino(prompt: string) {
    if (typeof prompt === 'string' && prompt.length > 0) {
      prefillChatInput(prompt);
    }
  }
</script>

<div class="caminos-container">
  {#if caminos.length === 0}
    <div class="empty-state">
      <p>✓ Sin caminos</p>
      <p class="hint">El producto sale redondo: nada que ajustar</p>
    </div>
  {:else}
    <div class="caminos-list">
      {#each caminos as camino}
        <div class="camino-item">
          <span class="camino-titulo">{camino.titulo}</span>
          <button class="btn-camino" on:click={() => abrirCamino(camino.prompt)}>
            Explorar en el chat →
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .caminos-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .empty-state {
    text-align: center;
    padding: 24px 20px;
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

  .caminos-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .camino-item {
    background: white;
    border: 1px solid #e5e7eb;
    border-left: 4px solid #3b82f6;
    border-radius: 6px;
    padding: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    transition: all 0.2s;
  }

  .camino-item:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .camino-titulo {
    font-size: 13px;
    font-weight: 600;
    color: #1f2937;
    line-height: 1.4;
    flex: 1;
  }

  .btn-camino {
    flex-shrink: 0;
    padding: 6px 12px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    color: #1d4ed8;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .btn-camino:hover {
    background: #dbeafe;
    border-color: #93c5fd;
  }
</style>
