<script lang="ts">
  /**
   * CartaGeneralZone — zona siempre visible (D9) con la carta general del
   * proyecto: la que sirven todos los canales sin asignacion propia. Selector
   * VISUAL (span + button), NO un <select> de form (Postura B, D2). Las
   * acciones pre-rellenan el chat (Q4).
   */

  import { cartaGeneralResuelta } from '$lib/stores/tarifas';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  function cambiarGeneral() {
    prefillChatInput('Cambia la carta general del proyecto a [escribe el nombre de la nueva carta].');
  }

  function asignarPrimera() {
    prefillChatInput('Asigna la carta [escribe el nombre] como carta general del proyecto.');
  }
</script>

<section class="zona-general">
  <h2>Carta general</h2>
  <p class="hint">La carta que sirven todos los canales que no tengan asignacion propia.</p>
  {#if $cartaGeneralResuelta}
    <div class="selector-actual">
      <span class="label">Actual:</span>
      <span class="valor">{$cartaGeneralResuelta.nombre}</span>
      <button class="action-btn" on:click={cambiarGeneral}>Cambiar</button>
    </div>
  {:else}
    <div class="empty-general">
      <span>Sin carta general asignada.</span>
      <button class="action-btn" on:click={asignarPrimera}>Asignar primera carta</button>
    </div>
  {/if}
</section>

<style>
  .zona-general {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .selector-actual,
  .empty-general {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    flex-wrap: wrap;
  }
  .label {
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-size: 12px;
  }
  .valor {
    font-weight: 600;
  }
  .action-btn {
    padding: 4px 10px;
    background: var(--accent-soft, rgba(99, 102, 241, 0.15));
    color: var(--accent, rgb(129, 140, 248));
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }
  .action-btn:hover {
    background: var(--accent-soft-hover, rgba(99, 102, 241, 0.25));
  }
</style>
