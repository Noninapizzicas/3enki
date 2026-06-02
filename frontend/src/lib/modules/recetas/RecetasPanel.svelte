<script lang="ts">
  /**
   * RecetasPanel — router interno del modulo recetas (Postura B: UI solo
   * lectura, mutaciones via chat). Patron hermano: ViabilidadPanel /
   * EscandalloPanel (activeView local, sin store global de navegacion).
   *
   * Vistas:
   *   - browser:   lista + stats + buscador (RecetasBrowser)
   *   - detail:    detalle de una receta + acciones que pre-rellenan el chat
   *   - historial: versiones de una receta + diff + revertir
   */

  import { onMount } from 'svelte';
  import RecetasBrowser from './RecetasBrowser.svelte';
  import RecetasDetail from './RecetasDetail.svelte';
  import HistorialView from './HistorialView.svelte';
  import { loadRecetas, loadStats, initRecetasSubscriptions } from '$lib/stores/recetas';

  export let panelId: string = '';

  let activeView: 'browser' | 'detail' | 'historial' = 'browser';
  let selectedRecetaId: string | null = null;
  let cleanupSubs: (() => void) | null = null;

  onMount(() => {
    loadRecetas();
    loadStats();
    cleanupSubs = initRecetasSubscriptions();
    return () => {
      if (cleanupSubs) cleanupSubs();
    };
  });

  function handleSelectReceta(id: string) {
    selectedRecetaId = id;
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
    <RecetasBrowser onSelectReceta={handleSelectReceta} />
  {:else if activeView === 'detail'}
    <RecetasDetail
      {selectedRecetaId}
      onVerHistorial={handleVerHistorial}
      onBack={handleBack}
    />
  {:else if activeView === 'historial'}
    <HistorialView recetaId={selectedRecetaId} onBack={handleVolverADetail} />
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
