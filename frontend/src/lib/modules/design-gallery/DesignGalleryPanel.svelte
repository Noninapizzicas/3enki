<script lang="ts">
  /**
   * DesignGalleryPanel — Galería de diseños + selector de carta
   *
   * 1. Seleccionar carta base (de menu-generator)
   * 2. Ver diseños previos generados
   * 3. Ver hints de layout (stats de la carta)
   *
   * Consumidor READ-ONLY — no modifica datos de carta.
   */
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import {
    cartaDesignStore,
    loadCartaForDesign,
    loadGallery,
    initCartaDesignSubscriptions,
    designGallery,
    designLoading,
    designError,
    cartaLoaded,
    cartaResumen,
    clearDesignError
  } from '$lib/stores/carta-design';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let panelId: string = '';

  let cleanup: (() => void) | null = null;
  let cartas: Array<{ id: string; nombre: string; productos?: number; categorias?: number }> = [];
  let loadingCartas = true;

  onMount(async () => {
    cleanup = initCartaDesignSubscriptions();
    await loadCartasList();
  });

  onDestroy(() => {
    cleanup?.();
  });

  async function loadCartasList() {
    loadingCartas = true;
    try {
      const projectId = $page.params.project_id;
      const res = await mqttRequest<any>('menu', 'list', { project_id: projectId });
      cartas = (res.data?.cartas || []).filter((c: any) => c.estado === 'generada');
    } catch {}
    loadingCartas = false;
  }

  async function selectCarta(cartaId: string) {
    await loadCartaForDesign(cartaId);
    await loadGallery(cartaId);
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  }

  function formatSize(bytes: number): string {
    return (bytes / 1024).toFixed(0) + ' KB';
  }
</script>

<div class="panel">
  <!-- Selector de carta -->
  <section class="section">
    <h3 class="section-title">Carta base</h3>
    {#if loadingCartas}
      <div class="hint">Cargando cartas...</div>
    {:else if cartas.length === 0}
      <div class="hint">No hay cartas generadas. Usa menu-generator primero.</div>
    {:else}
      <div class="carta-list">
        {#each cartas as carta}
          <button
            class="carta-item"
            class:active={$cartaDesignStore.cartaId === carta.id}
            on:click={() => selectCarta(carta.id)}
          >
            <span class="carta-name">{carta.nombre || carta.id}</span>
            <span class="carta-meta">{carta.productos || '?'} prod · {carta.categorias || '?'} cat</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Resumen de la carta -->
  {#if $cartaLoaded && $cartaResumen}
    <section class="section">
      <h3 class="section-title">Carta seleccionada</h3>
      <div class="hints-grid">
        <div class="hint-item">
          <span class="hint-label">Productos</span>
          <span class="hint-value">{$cartaResumen.total_productos}</span>
        </div>
        <div class="hint-item">
          <span class="hint-label">Categorías</span>
          <span class="hint-value">{$cartaResumen.total_categorias}</span>
        </div>
        <div class="hint-item">
          <span class="hint-label">Precios</span>
          <span class="hint-value">{$cartaResumen.precio_min.toFixed(2)}–{$cartaResumen.precio_max.toFixed(2)} €</span>
        </div>
      </div>
      <div class="hint">Pide al chat que diseñe esta carta. El estudio creativo te guiará.</div>
    </section>
  {/if}

  <!-- Galería de diseños -->
  {#if $cartaDesignStore.cartaId}
    <section class="section">
      <h3 class="section-title">Diseños generados</h3>
      {#if $designGallery.length === 0}
        <div class="hint">Sin diseños aún. Pide uno al chat.</div>
      {:else}
        <div class="gallery">
          {#each $designGallery as design}
            <div class="design-card">
              <div class="design-info">
                <span class="design-name">{design.nombre}</span>
                <span class="design-meta">{formatDate(design.created_at)} · {formatSize(design.size_bytes)}</span>
              </div>
              {#if design.profile_id}
                <span class="design-profile">{design.profile_id}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- Error -->
  {#if $designError}
    <div class="error" on:click={clearDesignError}>{$designError}</div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px;
    height: 100%;
    overflow-y: auto;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #888);
    margin: 0;
  }

  .carta-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .carta-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    background: var(--color-surface, #1a1a1a);
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    font-size: 0.8rem;
    transition: border-color 0.15s;
  }

  .carta-item:hover { border-color: #555; }
  .carta-item.active {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
  }

  .carta-name { font-weight: 600; }
  .carta-meta { font-size: 0.7rem; color: var(--color-text-muted, #666); }

  .hints-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .hint-item {
    display: flex;
    justify-content: space-between;
    padding: 6px 8px;
    background: var(--color-surface-2, #222);
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .hint-label { color: var(--color-text-muted, #888); }
  .hint-value { font-weight: 600; color: var(--color-text, #e5e5e5); }

  .hint {
    font-size: 0.7rem;
    color: var(--color-text-muted, #666);
    text-align: center;
    padding: 8px;
  }

  .gallery {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .design-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    background: var(--color-surface-2, #222);
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .design-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .design-name { font-weight: 600; color: var(--color-text, #e5e5e5); }
  .design-meta { font-size: 0.65rem; color: var(--color-text-muted, #666); }
  .design-profile {
    font-size: 0.6rem;
    padding: 2px 6px;
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border-radius: 3px;
  }

  .error {
    padding: 8px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #ef4444;
    font-size: 0.75rem;
    cursor: pointer;
  }
</style>
