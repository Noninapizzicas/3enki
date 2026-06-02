<script lang="ts">
  /**
   * CartaManagerPanel — router interno del modulo carta-manager (Postura B: UI
   * solo lectura, mutaciones via chat). Patron hermano: RecetasPanel
   * (activeView local, sin store global de navegacion).
   *
   * Vistas:
   *   - browser:   catalogo + stats + buscador (CartasBrowser)
   *   - detail:    detalle de una carta + acciones que pre-rellenan el chat
   *   - historial: versiones de una carta + diff + restaurar
   */

  import { onMount } from 'svelte';
  import CartasBrowser from './CartasBrowser.svelte';
  import CartaDetail from './CartaDetail.svelte';
  import HistorialCartaView from './HistorialCartaView.svelte';
  import { loadCartas, getCarta, initCartaManagerSubscriptions } from '$lib/stores/carta-manager';

  export let panelId: string = '';

  let activeView: 'browser' | 'detail' | 'historial' = 'browser';
  let selectedCartaId: string | null = null;
  let cleanupSubs: (() => void) | null = null;

  onMount(() => {
    loadCartas();
    cleanupSubs = initCartaManagerSubscriptions();
    return () => {
      if (cleanupSubs) cleanupSubs();
    };
  });

  function handleSelectCarta(id: string) {
    selectedCartaId = id;
    getCarta(id);
    activeView = 'detail';
  }

  function handleVerHistorial() {
    activeView = 'historial';
  }

  function handleVolverADetail() {
    activeView = 'detail';
  }

  function handleBack() {
    activeView = 'browser';
  }
</script>

<div class="panel-container">
  {#if activeView === 'browser'}
    <CartasBrowser onSelectCarta={handleSelectCarta} />
  {:else if activeView === 'detail'}
    <CartaDetail
      {selectedCartaId}
      onVerHistorial={handleVerHistorial}
      onBack={handleBack}
    />
  {:else if activeView === 'historial'}
    <HistorialCartaView cartaId={selectedCartaId} onBack={handleVolverADetail} />
  {/if}
</div>

<style>
  .panel-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-size: 13px;
    color: var(--text-primary, rgba(228, 228, 231, 1));
    overflow: hidden;
  }
</style>
