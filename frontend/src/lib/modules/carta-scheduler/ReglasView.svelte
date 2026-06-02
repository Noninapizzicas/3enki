<script lang="ts">
  /**
   * Vista de reglas activas. Boton crear + recalcular pre-rellenan chat (Postura B).
   * Lista de ReglaCard. Empty state con CTA si no hay reglas.
   */
  import { reglasActivas, reglasLoading } from '$lib/stores/carta-scheduler';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';
  import ReglaCard from './ReglaCard.svelte';

  function crearRegla() {
    prefillChatInput(
      'Crea una regla de programacion: [describe canal, carta, cron_expression, prioridad opcional].'
    );
  }

  function recalcular() {
    prefillChatInput('Recalcula los proximos cambios programados de carta+canal.');
  }
</script>

<section class="reglas-view">
  <header class="view-header">
    <h2>Reglas activas</h2>
    <div class="acciones-header">
      <button on:click={crearRegla}>+ Nueva regla</button>
      <button on:click={recalcular}>↻ Recalcular pendientes</button>
    </div>
  </header>

  {#if $reglasLoading}
    <div class="loading">Cargando...</div>
  {:else if $reglasActivas.length === 0}
    <div class="empty-state">
      <p>
        Sin reglas activas. Crea la primera regla de programacion para que las cartas roten
        automaticamente por canal y franja horaria.
      </p>
      <button on:click={crearRegla}>Crear primera regla</button>
    </div>
  {:else}
    <ul class="reglas-list">
      {#each $reglasActivas as regla}
        <ReglaCard {regla} />
      {/each}
    </ul>
  {/if}
</section>

<style>
  .reglas-view {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .view-header h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }
  .acciones-header {
    display: flex;
    gap: 0.4rem;
  }
  .acciones-header button {
    background: var(--accent-soft, rgba(99, 102, 241, 0.15));
    color: var(--accent, rgb(129, 140, 248));
    border: none;
    border-radius: 6px;
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .acciones-header button:hover {
    background: var(--accent-soft-hover, rgba(99, 102, 241, 0.25));
  }
  .empty-state {
    text-align: center;
    padding: 1.5rem 1rem;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-size: 0.88rem;
  }
  .empty-state button {
    margin-top: 0.6rem;
    background: var(--accent-soft, rgba(99, 102, 241, 0.15));
    color: var(--accent, rgb(129, 140, 248));
    border: none;
    border-radius: 6px;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
  }
  .reglas-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .loading {
    padding: 1rem;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-size: 0.85rem;
  }
</style>
