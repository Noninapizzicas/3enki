<script lang="ts">
  /**
   * CartaPreviewPanel — Vista previa de la carta pública
   *
   * Carga la carta compuesta via cartadigital.carta-publica y la renderiza
   * en el panel. Si no hay carta compuesta aún, muestra un mensaje y botón
   * para disparar la composición.
   */
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let panelId: string = '';

  $: projectId = $page.params.project_id;

  let loading = true;
  let composing = false;
  let error = '';
  let cartaCompuesta: any = null;
  let config: any = null;
  let viewMode: 'mobile' | 'desktop' = 'mobile';

  onMount(() => loadCarta());

  async function loadCarta() {
    loading = true;
    error = '';
    try {
      const res = await mqttRequest<any>('carta-digital', 'carta-publica', { project_id: projectId });
      const data = res.data || res;
      cartaCompuesta = data.carta || null;
      config = data.config || null;
    } catch (err: any) {
      error = err.message || 'Error cargando carta';
    } finally {
      loading = false;
    }
  }

  async function composerCarta() {
    composing = true;
    error = '';
    try {
      // Publicar evento para que carta-digital dispare el composer
      // El backend lo hace automáticamente con carta.actualizada, pero forzamos aquí
      await mqttRequest('carta-digital', 'carta-publica', { project_id: projectId, force: true });
      // Esperar y recargar
      setTimeout(() => loadCarta(), 2000);
    } catch (err: any) {
      error = err.message || 'Error componiendo carta';
      composing = false;
    }
  }

  function formatPrecio(p: number, moneda = '€') {
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2 }).format(p) + ' ' + moneda;
  }

  function getProductosByCategoria(categoriaId: string) {
    if (!cartaCompuesta?.productos) return [];
    return cartaCompuesta.productos.filter((p: any) => p.categoria === categoriaId);
  }
</script>

<div class="panel-body">
  <div class="toolbar">
    <div class="view-toggle">
      <button class="toggle-btn" class:active={viewMode === 'mobile'} on:click={() => viewMode = 'mobile'}>📱 Móvil</button>
      <button class="toggle-btn" class:active={viewMode === 'desktop'} on:click={() => viewMode = 'desktop'}>🖥️ Desktop</button>
    </div>
    <button class="btn-sm" on:click={loadCarta} disabled={loading}>🔄 Refrescar</button>
  </div>

  {#if loading}
    <div class="state-msg">Cargando carta compuesta...</div>
  {:else if error}
    <div class="state-msg error">⚠ {error}</div>
  {:else if !cartaCompuesta}
    <div class="state-msg">
      <div class="empty-icon">📋</div>
      <p>La carta no se ha compuesto todavía.</p>
      <p class="small">El agente composer la genera cuando cambia la carta base.</p>
      <button class="btn-action" on:click={composerCarta} disabled={composing}>
        {composing ? 'Componiendo...' : 'Forzar composición'}
      </button>
    </div>
  {:else}
    <div class="preview-container" class:mobile={viewMode === 'mobile'}>
      <div
        class="preview-canvas"
        style="
          --color-primario: {config?.tema?.color_primario || '#f59e0b'};
          --color-fondo: {config?.tema?.color_fondo || '#0a0a0a'};
          --color-texto: {config?.tema?.color_texto || '#e5e5e5'};
        "
      >
        <header class="preview-header">
          <span class="logo-emoji">{config?.tema?.logo_emoji || '🍕'}</span>
          <h2>{config?.nombre_negocio || cartaCompuesta.metadata?.source_carta_id || 'Carta'}</h2>
        </header>

        {#if cartaCompuesta.categorias && cartaCompuesta.categorias.length > 0}
          {#each cartaCompuesta.categorias.sort((a: any, b: any) => a.orden - b.orden) as cat (cat.id)}
            {@const prods = getProductosByCategoria(cat.id)}
            {#if prods.length > 0}
              <section class="categoria">
                <h3>{cat.icon || ''} {cat.nombre}</h3>
                {#each prods as prod (prod.id)}
                  <div class="producto">
                    <div class="producto-row">
                      <span class="producto-nombre">{prod.emoji || ''} {prod.nombre}</span>
                      <span class="producto-precio">{formatPrecio(prod.precio, config?.moneda)}</span>
                    </div>
                    {#if prod.descripcion}
                      <p class="producto-desc">{prod.descripcion}</p>
                    {/if}
                    {#if prod.ingredientes && prod.ingredientes.length > 0}
                      <div class="producto-ings">
                        {#each prod.ingredientes as ing}
                          <span class="ing">{ing.emoji || ''} {ing.nombre}</span>
                        {/each}
                      </div>
                    {/if}
                    {#if prod.tags && prod.tags.length > 0}
                      <div class="producto-tags">
                        {#each prod.tags as tag}<span class="tag">{tag}</span>{/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </section>
            {/if}
          {/each}
        {:else}
          <p class="state-msg">Sin categorías</p>
        {/if}

        {#if config?.whatsapp_telefono && config?.funcionalidades?.whatsapp}
          <footer class="preview-footer">
            <a href="https://wa.me/{config.whatsapp_telefono}" target="_blank" class="btn-whatsapp">
              📱 Pedir por WhatsApp
            </a>
          </footer>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .panel-body {
    display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; height: 100%;
  }
  .toolbar { display: flex; justify-content: space-between; align-items: center; }
  .view-toggle { display: flex; gap: 0.25rem; }
  .toggle-btn {
    padding: 0.3rem 0.5rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text-muted, #888);
    font-size: 0.7rem; cursor: pointer;
  }
  .toggle-btn.active {
    background: rgba(255,255,255,0.12);
    color: var(--color-text, #e5e5e5);
    border-color: var(--color-primary, #3b82f6);
  }
  .btn-sm, .btn-action {
    padding: 0.3rem 0.5rem;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.7rem; cursor: pointer;
  }
  .btn-action {
    background: var(--color-primary, #3b82f6);
    border: none; color: white; font-weight: 600; margin-top: 0.5rem;
    padding: 0.5rem 0.75rem;
  }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-sm:hover, .btn-action:hover:not(:disabled) { filter: brightness(1.1); }

  .state-msg {
    flex: 1;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 0.4rem;
    padding: 2rem;
    text-align: center;
    color: var(--color-text-muted, #888);
    font-size: 0.8rem;
  }
  .state-msg.error { color: var(--color-error, #ef4444); }
  .state-msg .small { font-size: 0.7rem; opacity: 0.8; }
  .empty-icon { font-size: 2rem; opacity: 0.5; }

  .preview-container {
    flex: 1;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 0.5rem;
    overflow: auto;
    background: #1a1a1a;
  }
  .preview-container.mobile { max-width: 390px; margin: 0 auto; width: 100%; }

  .preview-canvas {
    padding: 1rem;
    background: var(--color-fondo);
    color: var(--color-texto);
    min-height: 100%;
  }
  .preview-header {
    display: flex; align-items: center; gap: 0.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    margin-bottom: 0.75rem;
  }
  .logo-emoji { font-size: 1.5rem; }
  .preview-header h2 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--color-primario);
  }

  .categoria { margin-bottom: 1rem; }
  .categoria h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    color: var(--color-primario);
    border-bottom: 1px solid var(--color-primario);
    padding-bottom: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .producto {
    padding: 0.5rem 0;
    border-bottom: 1px dotted rgba(255,255,255,0.08);
  }
  .producto:last-child { border-bottom: none; }
  .producto-row {
    display: flex; justify-content: space-between; align-items: baseline;
    gap: 0.5rem;
  }
  .producto-nombre { font-weight: 600; font-size: 0.85rem; }
  .producto-precio {
    font-weight: 700; font-size: 0.85rem;
    color: var(--color-primario);
    white-space: nowrap;
  }
  .producto-desc {
    margin: 0.25rem 0 0 0;
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
    font-style: italic;
    line-height: 1.3;
  }
  .producto-ings {
    display: flex; flex-wrap: wrap; gap: 0.2rem;
    margin-top: 0.3rem;
  }
  .ing {
    font-size: 0.6rem;
    padding: 0.05rem 0.3rem;
    background: rgba(255,255,255,0.05);
    border-radius: 0.2rem;
    color: var(--color-text-muted, #999);
  }
  .producto-tags {
    display: flex; flex-wrap: wrap; gap: 0.2rem;
    margin-top: 0.25rem;
  }
  .tag {
    font-size: 0.6rem;
    padding: 0.05rem 0.3rem;
    background: rgba(245,158,11,0.1);
    color: var(--color-primario);
    border-radius: 0.2rem;
    text-transform: capitalize;
  }

  .preview-footer {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(255,255,255,0.1);
    text-align: center;
  }
  .btn-whatsapp {
    display: inline-block;
    padding: 0.6rem 1rem;
    background: #25d366;
    color: white;
    border-radius: 0.5rem;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.8rem;
  }
</style>
