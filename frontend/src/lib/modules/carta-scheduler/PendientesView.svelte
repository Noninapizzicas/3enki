<script lang="ts">
  /**
   * Vista de cambios pendientes de confirmar. Lista de PendienteCard.
   * Los pendientes SON proximos_cambios ya calculados por el backend (D7) —
   * la UI solo los muestra, no calcula nada local.
   */
  import { pendientesStore, pendientesLoading } from '$lib/stores/carta-scheduler';
  import PendienteCard from './PendienteCard.svelte';
</script>

<section class="pendientes-view">
  <header class="view-header">
    <h2>Pendientes de confirmar</h2>
    <p class="hint">
      Cambios calculados a partir de las reglas activas que esperan OK humano antes de aplicarse.
    </p>
  </header>

  {#if $pendientesLoading}
    <div class="loading">Cargando...</div>
  {:else if $pendientesStore.length === 0}
    <div class="empty-state">
      <p>Sin cambios pendientes. Las reglas activas no tienen disparos proximos o ya se aplicaron todos.</p>
    </div>
  {:else}
    <ul class="pendientes-list">
      {#each $pendientesStore as p}
        <PendienteCard pendiente={p} />
      {/each}
    </ul>
  {/if}
</section>

<style>
  .pendientes-view {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .view-header h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }
  .hint {
    margin: 0.2rem 0 0;
    font-size: 0.8rem;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .empty-state {
    text-align: center;
    padding: 1.5rem 1rem;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-size: 0.88rem;
  }
  .pendientes-list {
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
