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
    clearDesignError,
    loadDesignHtml,
    deleteDesign,
    markDesignOficial
  } from '$lib/stores/carta-design';
  import type { DesignMeta } from '$lib/stores/carta-design';
  // La carta base la sirve carta-manager (CUSTODIO de /pizzepos/cartas/). Bebemos de SU
  // store, no de menu.list (dueño viejo) ni filtrando estado='generada' (vocabulario que
  // ya no existe: carta-manager usa borrador/en_servicio/archivada).
  import { sortedCartas, loadCartas, cartasLoading } from '$lib/stores/carta-manager';
  // El nervio del frontend (qué carta ve el usuario) lo cubre vista-bridge de forma
  // central, leyendo cartaDesignStore.cartaId — el panel no necesita reportar nada.

  export let panelId: string = '';

  let cleanup: (() => void) | null = null;

  // Cartas diseñables = todas las no archivadas, mapeadas a la forma del panel.
  $: cartas = $sortedCartas
    .filter((c: any) => c.estado !== 'archivada')
    .map((c: any) => ({
      id: c.id,
      nombre: c.nombre,
      productos: Array.isArray(c.productos) ? c.productos.length : undefined,
      categorias: Array.isArray(c.categorias) ? c.categorias.length : undefined
    }));
  $: loadingCartas = $cartasLoading;

  onMount(async () => {
    cleanup = initCartaDesignSubscriptions();
    await loadCartas();
  });

  onDestroy(() => {
    cleanup?.();
  });

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

  // ── acciones por diseño: preview · abrir · descargar · imprimir · borrar ──
  let busy: string | null = null;        // filename en proceso
  let previewFile: string | null = null; // diseño con preview inline abierto
  let previewHtml = '';

  // Preview inline (iframe srcdoc, sandbox sin scripts — el HTML del diseño no usa JS).
  async function togglePreview(d: DesignMeta) {
    if (previewFile === d.filename) { previewFile = null; previewHtml = ''; return; }
    busy = d.filename;
    const html = await loadDesignHtml(d.filename);
    busy = null;
    if (!html) return;
    previewHtml = html;
    previewFile = d.filename;
  }

  async function abrirEnPestana(d: DesignMeta) {
    busy = d.filename;
    const html = await loadDesignHtml(d.filename);
    busy = null;
    if (!html) return;
    const win = window.open('', '_blank');
    if (win) { win.document.open(); win.document.write(html); win.document.close(); }
  }

  async function imprimirDesign(d: DesignMeta) {
    busy = d.filename;
    const html = await loadDesignHtml(d.filename);
    busy = null;
    if (!html) return;
    const win = window.open('', '_blank');
    if (win) { win.document.open(); win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400); }
  }

  async function descargarDesign(d: DesignMeta) {
    busy = d.filename;
    const html = await loadDesignHtml(d.filename);
    busy = null;
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = d.filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function borrarDesign(d: DesignMeta) {
    if (!confirm(`¿Borrar el diseño "${d.nombre || d.filename}"? No se puede deshacer.`)) return;
    busy = d.filename;
    await deleteDesign(d.filename);
    busy = null;
    if (previewFile === d.filename) { previewFile = null; previewHtml = ''; }
  }

  async function marcarOficial(d: DesignMeta) {
    const cid = $cartaDesignStore.cartaId;
    if (!cid) return;
    busy = d.filename;
    await markDesignOficial(cid, d.filename);
    busy = null;
  }

  // Es el oficial de la carta seleccionada.
  $: esOficial = (d: DesignMeta) =>
    !!$cartaDesignStore.cartaId && $cartaDesignStore.oficial[$cartaDesignStore.cartaId] === d.filename;
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
            <div class="design-card" class:oficial={esOficial(design)} class:abierto={previewFile === design.filename}>
              <div class="design-row">
                <div class="design-info">
                  <span class="design-name">{esOficial(design) ? '⭐ ' : ''}{design.nombre || design.filename}{esOficial(design) ? ' · OFICIAL' : ''}</span>
                  <span class="design-meta">{design.formato ? design.formato + ' · ' : ''}{formatDate(design.generado_at || design.created_at || '')} · {formatSize(design.size_bytes)}</span>
                </div>
                <div class="design-actions">
                  <button title={esOficial(design) ? 'Es la oficial' : 'Marcar como oficial'} disabled={busy === design.filename || esOficial(design)} on:click={() => marcarOficial(design)}>{esOficial(design) ? '⭐' : '☆'}</button>
                  <button title={previewFile === design.filename ? 'Ocultar preview' : 'Vista previa'} class:active={previewFile === design.filename} disabled={busy === design.filename} on:click={() => togglePreview(design)}>👁️</button>
                  <button title="Abrir en pestaña" disabled={busy === design.filename} on:click={() => abrirEnPestana(design)}>↗</button>
                  <button title="Imprimir" disabled={busy === design.filename} on:click={() => imprimirDesign(design)}>🖨️</button>
                  <button title="Descargar" disabled={busy === design.filename} on:click={() => descargarDesign(design)}>⬇️</button>
                  <button title="Borrar" class="danger" disabled={busy === design.filename} on:click={() => borrarDesign(design)}>🗑️</button>
                </div>
              </div>
              {#if previewFile === design.filename}
                <div class="design-preview">
                  <iframe title={'Vista previa de ' + (design.nombre || design.filename)} srcdoc={previewHtml} sandbox=""></iframe>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- Error -->
  {#if $designError}
    <button class="error" type="button" on:click={clearDesignError} title="Descartar">{$designError}</button>
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
    flex-direction: column;
    background: var(--color-surface-2, #222);
    border-radius: 6px;
    font-size: 0.8rem;
    overflow: hidden;
  }
  .design-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
  }

  .design-card.oficial {
    border: 1px solid var(--color-accent, #eab308);
    box-shadow: inset 2px 0 0 var(--color-accent, #eab308);
  }
  .design-card.oficial .design-name { color: var(--color-accent, #eab308); font-weight: 600; }
  .design-actions button.active { border-color: var(--color-primary, #f59e0b); background: rgba(245, 158, 11, 0.12); }

  .design-preview {
    border-top: 1px solid var(--color-border, #333);
    background: #fff;
  }
  .design-preview iframe {
    width: 100%;
    height: 420px;
    border: none;
    display: block;
  }

  .design-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .design-actions button {
    background: transparent;
    border: 1px solid var(--color-border, #333);
    border-radius: 5px;
    padding: 3px 6px;
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
  }
  .design-actions button:hover:not(:disabled) { background: var(--color-surface-3, #2c2c2c); }
  .design-actions button:disabled { opacity: 0.4; cursor: default; }
  .design-actions button.danger:hover:not(:disabled) { background: #5a1f1f; border-color: #a33; }

  .design-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .design-name { font-weight: 600; color: var(--color-text, #e5e5e5); }
  .design-meta { font-size: 0.65rem; color: var(--color-text-muted, #666); }

  .error {
    width: 100%;
    text-align: left;
    font-family: inherit;
    padding: 8px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #ef4444;
    font-size: 0.75rem;
    cursor: pointer;
  }
</style>
