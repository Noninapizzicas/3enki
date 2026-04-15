<script lang="ts">
  /**
   * ViabilidadPanel - Recipe Viability Analysis v2.0.0
   *
   * Main panel for evaluating recipe viability:
   * - Margin, food cost, profitability analysis
   * - Risk detection and recommendations
   * - Search and filtering by estado, margin, risk level
   *
   * Views:
   * - Browser: Search/filter interface with results grid
   * - Detail: Full details for selected recipe
   */

  import { onMount, onDestroy } from 'svelte';
  import ViabilidadBrowser from './ViabilidadBrowser.svelte';
  import ViabilidadDetail from './ViabilidadDetail.svelte';

  export let panelId: string = '';

  let activeView = 'browser'; // 'browser' or 'detail'
  let selectedViabilidad: any = null;
  let results: any[] = [];
  let recomendaciones: any[] = [];
  let historico: any[] = [];
  let summary: any = null;
  let loading = false;
  let error: string | null = null;

  onMount(async () => {
    // Initialize with default search
    await loadViabilidades();
  });

  async function loadViabilidades(criteria: any = {}) {
    loading = true;
    error = null;
    try {
      // Call API to fetch viabilidades with criteria
      const response = await fetch('/api/viabilidad/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria)
      });

      if (!response.ok) throw new Error('Failed to load viabilities');

      const data = await response.json();
      results = data.results || [];
      summary = data.summary || null;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  async function selectViabilidad(id: string) {
    selectedViabilidad = results.find(r => r.id === id);
    if (selectedViabilidad) {
      // Fetch detailed data
      try {
        const response = await fetch(`/api/viabilidad/${id}`);
        if (response.ok) {
          const data = await response.json();
          recomendaciones = data.recomendaciones || [];
          historico = data.historico || [];
        }
      } catch (err) {
        console.error('Failed to load detail:', err);
      }
      activeView = 'detail';
    }
  }

  async function implementRecomendacion(recId: string) {
    try {
      const response = await fetch(`/api/viabilidad/recomendacion/${recId}/implement`, {
        method: 'POST'
      });

      if (response.ok) {
        // Update recommendation status
        recomendaciones = recomendaciones.map(r =>
          r.id === recId ? { ...r, implementada: true } : r
        );
      }
    } catch (err) {
      error = (err as Error).message;
    }
  }

  function handleSearch(criteria: any) {
    loadViabilidades(criteria);
  }

  function handleSelectCard(id: string) {
    selectViabilidad(id);
  }

  function handleBack() {
    activeView = 'browser';
    selectedViabilidad = null;
  }
</script>

<div class="panel-container">
  {#if error}
    <div class="error-banner">
      <span>{error}</span>
      <button on:click={() => (error = null)}>×</button>
    </div>
  {/if}

  {#if activeView === 'browser'}
    <ViabilidadBrowser
      {results}
      {summary}
      {loading}
      onSearch={handleSearch}
      onSelect={handleSelectCard}
    />
  {:else if activeView === 'detail'}
    <ViabilidadDetail
      viabilidad={selectedViabilidad}
      {recomendaciones}
      {historico}
      onImplementRecondacion={implementRecomendacion}
      onBack={handleBack}
    />
  {/if}
</div>

<style>
  .panel-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: white;
    overflow: hidden;
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: #fee2e2;
    color: #991b1b;
    font-size: 12px;
    border-bottom: 1px solid #fca5a5;
    flex-shrink: 0;
  }

  .error-banner button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 18px;
    padding: 0;
    opacity: 0.7;
  }

  .error-banner button:hover {
    opacity: 1;
  }
</style>
