<script lang="ts">
  /**
   * CartasImpresionPanel — Lista de cartas del proyecto con versión imprimible
   *
   * Muestra las cartas disponibles (desde carta-manager) y permite:
   *   - Ver preview del HTML imprimible
   *   - Regenerar (dispara agentes architect → builder)
   *   - Imprimir directamente
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    sortedCartas,
    initCartaManagerSubscriptions,
    type CartaResumen
  } from '$lib/stores/carta-manager';
  import {
    selectedImpresion,
    impresionError,
    generatingCartas,
    loadImpresion,
    generarImpresion,
    selectCarta,
    clearError,
    initImpresionSubscriptions
  } from '$lib/stores/carta-impresion';

  export let panelId: string = '';

  let cleanup1: (() => void) | null = null;
  let cleanup2: (() => void) | null = null;
  let view: 'list' | 'preview' = 'list';
  let selectedId: string | null = null;

  $: cartas = $sortedCartas;
  $: impresion = $selectedImpresion;
  $: error = $impresionError;
  $: generating = $generatingCartas;

  onMount(() => {
    cleanup1 = initCartaManagerSubscriptions();
    cleanup2 = initImpresionSubscriptions();
  });

  onDestroy(() => {
    cleanup1?.();
    cleanup2?.();
  });

  async function handleView(carta: CartaResumen) {
    selectedId = carta.id;
    selectCarta(carta.id);
    await loadImpresion(carta.id);
    view = 'preview';
  }

  async function handleRegenerar(cartaId: string, event?: MouseEvent) {
    event?.stopPropagation();
    await generarImpresion(cartaId);
  }

  function handleBack() {
    view = 'list';
    selectedId = null;
    selectCarta(null);
  }

  function handlePrint() {
    if (!impresion?.html) return;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(impresion.html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
  }

  function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    return new Date(s).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }
</script>

<div class="panel-body">
  {#if error}
    <div class="error-msg">
      <span>{error}</span>
      <button class="close-btn" on:click={clearError}>✕</button>
    </div>
  {/if}

  {#if view === 'list'}
    <!-- LISTA -->
    <div class="header">
      <span class="title">Cartas imprimibles</span>
      <span class="count">{cartas.length}</span>
    </div>

    {#if cartas.length === 0}
      <div class="empty">
        <span class="empty-icon">📋</span>
        <p>Sin cartas todavía</p>
        <p class="small">Genera una carta desde menu-generator</p>
      </div>
    {:else}
      <div class="cartas-list">
        {#each cartas as c (c.id)}
          {@const isGen = generating.has(c.id)}
          <div
            class="carta-row"
            role="button"
            tabindex="0"
            on:click={() => handleView(c)}
            on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleView(c)}>
            <div class="carta-info">
              <span class="carta-name">{c.nombre}</span>
              <span class="carta-meta">{c.productos} prod · {c.categorias} cat</span>
            </div>
            <div class="carta-actions">
              <button
                class="btn-sm"
                title="Regenerar HTML imprimible"
                disabled={isGen}
                on:click={(e) => handleRegenerar(c.id, e)}>
                {isGen ? '⏳' : '🔄'}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

  {:else if view === 'preview'}
    <!-- PREVIEW -->
    <div class="header">
      <button class="btn-back" on:click={handleBack}>← Volver</button>
      <div class="preview-actions">
        <button
          class="btn-sm"
          disabled={!impresion?.html || (selectedId && generating.has(selectedId))}
          on:click={() => selectedId && handleRegenerar(selectedId)}>
          {selectedId && generating.has(selectedId) ? '⏳ Generando...' : '🔄 Regenerar'}
        </button>
        <button class="btn-sm action" disabled={!impresion?.html} on:click={handlePrint}>
          🖨️ Imprimir
        </button>
      </div>
    </div>

    {#if !impresion}
      <div class="empty">
        <span class="empty-icon">⏳</span>
        <p>Cargando...</p>
      </div>
    {:else if !impresion.html}
      <div class="empty">
        <span class="empty-icon">📄</span>
        <p>Sin versión imprimible todavía</p>
        <p class="small">Pulsa <strong>Regenerar</strong> para crearla — los agentes la generarán</p>
        <button
          class="btn-action"
          disabled={selectedId ? generating.has(selectedId) : true}
          on:click={() => selectedId && handleRegenerar(selectedId)}>
          {selectedId && generating.has(selectedId) ? 'Generando...' : 'Generar ahora'}
        </button>
      </div>
    {:else}
      <div class="preview-container">
        <iframe
          title="Carta imprimible"
          srcdoc={impresion.html}
          class="preview-frame"
          sandbox="allow-same-origin allow-scripts">
        </iframe>
      </div>
      {#if impresion.metadata}
        <div class="preview-meta">
          <span class="meta-label">Generada:</span>
          <span class="meta-value">{formatDate(impresion.metadata.generado_at)}</span>
          {#if impresion.metadata.layout?.decision}
            <span class="meta-label">Layout:</span>
            <span class="meta-value">{impresion.metadata.layout.decision}</span>
          {/if}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .panel-body {
    display: flex; flex-direction: column; height: 100%;
    gap: 0.5rem; padding: 0.5rem;
  }

  .header {
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .title { font-size: 0.8rem; font-weight: 600; }
  .count {
    font-size: 0.65rem; color: var(--color-text-muted, #888);
    padding: 0.1rem 0.4rem;
    background: rgba(255,255,255,0.05);
    border-radius: 0.25rem;
  }

  .btn-back {
    padding: 0.25rem 0.5rem;
    background: rgba(255,255,255,0.08);
    border: none; border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.7rem; cursor: pointer;
  }
  .btn-back:hover { background: rgba(255,255,255,0.12); }

  .preview-actions { display: flex; gap: 0.3rem; }

  .cartas-list {
    display: flex; flex-direction: column; gap: 0.25rem;
    overflow-y: auto;
  }
  .carta-row {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 0.375rem;
    cursor: pointer;
    text-align: left;
    color: var(--color-text, #e5e5e5);
  }
  .carta-row:hover {
    background: rgba(255,255,255,0.06);
    border-color: rgba(59,130,246,0.3);
  }
  .carta-info {
    flex: 1; display: flex; flex-direction: column; gap: 0.1rem;
    min-width: 0;
  }
  .carta-name {
    font-size: 0.8rem; font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .carta-meta {
    font-size: 0.65rem; color: var(--color-text-muted, #888);
  }
  .carta-actions { display: flex; gap: 0.25rem; }

  .btn-sm {
    padding: 0.3rem 0.5rem;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.7rem; cursor: pointer;
  }
  .btn-sm:hover:not(:disabled) { background: rgba(255,255,255,0.14); }
  .btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-sm.action {
    background: var(--color-primary, #3b82f6); border: none; color: white; font-weight: 600;
  }
  .btn-sm.action:hover:not(:disabled) { filter: brightness(1.1); }

  .btn-action {
    padding: 0.5rem 1rem;
    background: var(--color-primary, #3b82f6);
    border: none; border-radius: 0.375rem;
    color: white; font-size: 0.8rem; font-weight: 600; cursor: pointer;
    margin-top: 0.75rem;
  }
  .btn-action:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }

  .preview-container {
    flex: 1;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 0.5rem;
    overflow: hidden;
    background: #fff;
    min-height: 300px;
  }
  .preview-frame {
    width: 100%; height: 100%;
    border: none; min-height: 300px;
  }
  .preview-meta {
    display: flex; flex-wrap: wrap; gap: 0.5rem;
    font-size: 0.65rem; color: var(--color-text-muted, #888);
    padding-top: 0.4rem;
  }
  .meta-label { font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }

  .empty {
    flex: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.4rem;
    padding: 2rem; text-align: center;
    font-size: 0.8rem; color: var(--color-text-muted, #888);
  }
  .empty p { margin: 0; }
  .empty .small { font-size: 0.7rem; }
  .empty-icon { font-size: 2rem; opacity: 0.5; }

  .error-msg {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.4rem 0.5rem;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 0.375rem;
    color: var(--color-error, #ef4444); font-size: 0.75rem;
  }
  .close-btn {
    background: none; border: none; color: inherit; cursor: pointer;
    padding: 0.15rem; font-size: 1rem;
  }
</style>
