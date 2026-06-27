<script lang="ts">
  /**
   * MenuGeneratorPanel - Panel de generacion de cartas
   *
   * Tabs:
   * - Generar: Textarea para pegar texto de carta, nombre, provider, boton generar
   * - Cartas: Lista de cartas generadas con estado
   * - Detalle: Ver carta generada (categorias, productos, ingredientes)
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    menuGeneratorStore,
    sortedCartas,
    selectedCarta,
    menuHealth,
    menuLoading,
    menuGenerating,
    menuError,
    initMenuGeneratorSubscriptions,
    generateMenu,
    getCarta,
    setActiveTab,
    clearError,
    type CartaResumen,
    type CartaEstado,
    type Producto,
    type Categoria
  } from '$lib/stores/menu-generator';

  export let panelId: string = '';

  // ==========================================================================
  // STATE
  // ==========================================================================

  let cleanup: (() => void) | null = null;

  // Form
  let texto = '';
  let nombre = '';
  let provider = 'auto';

  // Reactive
  $: tab = $menuGeneratorStore.activeTab;
  $: cartas = $sortedCartas;
  $: carta = $selectedCarta;
  $: health = $menuHealth;
  $: loading = $menuLoading;
  $: generating = $menuGenerating;
  $: error = $menuError;

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    cleanup = initMenuGeneratorSubscriptions();
  });

  onDestroy(() => {
    cleanup?.();
  });

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  function handleTabChange(newTab: typeof tab) {
    setActiveTab(newTab);
    clearError();
  }

  async function handleGenerate() {
    if (!texto.trim()) return;

    const success = await generateMenu(texto.trim(), nombre.trim() || undefined, provider);
    if (success) {
      texto = '';
      nombre = '';
      provider = 'auto';
    }
  }

  async function handleViewCarta(id: string) {
    await getCarta(id);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      handleGenerate();
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  function getEstadoIcon(estado: CartaEstado): string {
    const icons: Record<CartaEstado, string> = {
      generando: '⏳',
      generada: '✅',
      error: '❌'
    };
    return icons[estado] || '📄';
  }

  function getEstadoColor(estado: CartaEstado): string {
    const colors: Record<CartaEstado, string> = {
      generando: 'var(--color-warning, #f59e0b)',
      generada: 'var(--color-success, #22c55e)',
      error: 'var(--color-error, #ef4444)'
    };
    return colors[estado] || 'var(--color-text)';
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  }

  function getProductosByCategoria(productos: Producto[], categoriaId: string): Producto[] {
    return productos.filter(p => p.categoria === categoriaId);
  }
</script>

<div class="menu-panel">
  <!-- Header -->
  <div class="panel-header">
    <div class="tabs">
      <button
        class="tab"
        class:active={tab === 'generar'}
        on:click={() => handleTabChange('generar')}
      >
        ✨ Generar
      </button>
      <button
        class="tab"
        class:active={tab === 'cartas'}
        on:click={() => handleTabChange('cartas')}
      >
        📋 Cartas
      </button>
      <button
        class="tab"
        class:active={tab === 'detalle'}
        on:click={() => handleTabChange('detalle')}
        disabled={!carta}
      >
        👁️ Detalle
      </button>
    </div>
    <div class="health-badges">
      {#if health.generando > 0}
        <span class="health-badge generating">⏳ {health.generando}</span>
      {/if}
      <span class="health-badge">{health.generadas} cartas</span>
    </div>
  </div>

  <!-- Content -->
  <div class="panel-content">
    <!-- ================================================================== -->
    <!-- TAB: GENERAR -->
    <!-- ================================================================== -->
    {#if tab === 'generar'}
      <div class="generate-view">
        <div class="form-group">
          <label class="form-label" for="menu-nombre">Nombre de la carta</label>
          <input
            id="menu-nombre"
            type="text"
            class="form-input"
            placeholder="Carta Pizzicas, Menu Restaurante..."
            bind:value={nombre}
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="menu-texto">
            Contenido de la carta
            <span class="required">*</span>
          </label>
          <textarea
            id="menu-texto"
            class="form-textarea"
            placeholder="Pega aqui el texto de la carta, resultado OCR, o JSON crudo...

Ejemplo:
PIZZAS
Margarita 8.50
Tomate, mozzarella, albahaca

Country 11.50
Tomate, BBQ, nata, pollo, quesos, cebolla, bacon"
            rows="12"
            bind:value={texto}
            on:keydown={handleKeydown}
          ></textarea>
          <span class="form-hint">
            {texto.length > 0 ? `${texto.length} caracteres` : 'Ctrl+Enter para generar'}
          </span>
        </div>

        <div class="form-group">
          <label class="form-label" for="menu-provider">Provider AI</label>
          <select
            id="menu-provider"
            class="form-select"
            bind:value={provider}
          >
            <option value="auto">Automatico (recomendado)</option>
            <option value="deepseek-anthropic">DeepSeek</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
          </select>
        </div>

        <button
          class="btn-generate"
          on:click={handleGenerate}
          disabled={!texto.trim() || generating}
        >
          {#if generating}
            <span class="spinner">⏳</span> Generando carta...
          {:else}
            ✨ Generar Carta
          {/if}
        </button>

        {#if generating}
          <div class="generating-info">
            <p>La IA esta analizando el texto y estructurando la carta.</p>
            <p>Esto puede tardar unos segundos.</p>
          </div>
        {/if}
      </div>

    <!-- ================================================================== -->
    <!-- TAB: CARTAS -->
    <!-- ================================================================== -->
    {:else if tab === 'cartas'}
      {#if loading && cartas.length === 0}
        <div class="loading-state">
          <span class="spinner">⏳</span>
          <span>Cargando cartas...</span>
        </div>
      {:else if cartas.length === 0}
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <span class="empty-title">Sin cartas</span>
          <span class="empty-text">Genera tu primera carta desde la pestana Generar</span>
          <button class="btn primary" on:click={() => handleTabChange('generar')}>
            ✨ Generar carta
          </button>
        </div>
      {:else}
        <div class="cartas-list">
          {#each cartas as carta_item (carta_item.id)}
            <div class="carta-item" class:error={carta_item.estado === 'error'}>
              <span class="carta-estado" style="color: {getEstadoColor(carta_item.estado)}">
                {getEstadoIcon(carta_item.estado)}
              </span>
              <div class="carta-info">
                <span class="carta-nombre">{carta_item.nombre}</span>
                <span class="carta-meta">
                  {#if carta_item.estado === 'generada'}
                    {carta_item.productos || 0} productos · {carta_item.categorias || 0} categorias
                  {:else if carta_item.estado === 'error'}
                    {carta_item.error || 'Error desconocido'}
                  {:else}
                    Generando...
                  {/if}
                </span>
              </div>
              <div class="carta-actions">
                <span class="carta-fecha">{formatDate(carta_item.created_at)}</span>
                {#if carta_item.estado === 'generada'}
                  <button
                    class="btn-view"
                    on:click={() => handleViewCarta(carta_item.id)}
                    title="Ver carta"
                  >
                    👁️
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

    <!-- ================================================================== -->
    <!-- TAB: DETALLE -->
    <!-- ================================================================== -->
    {:else if tab === 'detalle'}
      {#if carta}
        <div class="detalle-view">
          <!-- Meta -->
          <div class="detalle-header">
            <h3 class="detalle-title">{carta.meta.nombre}</h3>
            <div class="detalle-meta">
              <span class="meta-badge">{carta.meta.generado_desde}</span>
              <span class="meta-date">{formatDate(carta.meta.created_at)}</span>
            </div>
          </div>

          <!-- Stats -->
          <div class="detalle-stats">
            <div class="stat-card">
              <span class="stat-value">{carta.categorias.length}</span>
              <span class="stat-label">Categorias</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{carta.productos.length}</span>
              <span class="stat-label">Productos</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">
                {carta.productos.reduce((acc, p) => {
                  const ingredientes = new Set(p.ingredientes.map(i => i.nombre));
                  ingredientes.forEach(i => acc.add(i));
                  return acc;
                }, new Set()).size}
              </span>
              <span class="stat-label">Ingredientes</span>
            </div>
          </div>

          <!-- Categorias con productos -->
          <div class="categorias-list">
            {#each carta.categorias.sort((a, b) => a.orden - b.orden) as cat (cat.id)}
              {@const productos = getProductosByCategoria(carta.productos, cat.id)}
              <div class="categoria-section">
                <div class="categoria-header">
                  <span class="categoria-nombre">{cat.nombre}</span>
                  <span class="categoria-count">{productos.length}</span>
                </div>
                <div class="productos-grid">
                  {#each productos as prod (prod.id)}
                    <div class="producto-card">
                      <div class="producto-header">
                        <span class="producto-nombre">{prod.nombre}</span>
                        <span class="producto-precio">
                          {prod.precio > 0 ? formatCurrency(prod.precio) : '-'}
                        </span>
                      </div>
                      {#if prod.ingredientes.length > 0}
                        <div class="producto-ingredientes">
                          {#each prod.ingredientes as ing}
                            <span class="ingrediente-tag">
                              {#if ing.emoji}{ing.emoji} {/if}{ing.nombre}
                            </span>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="empty-state">
          <span class="empty-icon">👁️</span>
          <span class="empty-text">Selecciona una carta para ver su detalle</span>
          <button class="btn secondary" on:click={() => handleTabChange('cartas')}>
            Ir a Cartas
          </button>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Error bar -->
  {#if error}
    <div class="error-bar">
      <span>❌ {error}</span>
      <button class="close-btn" on:click={clearError}>✕</button>
    </div>
  {/if}
</div>

<style>
  .menu-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--color-text, #e5e5e5);
  }

  /* ===== HEADER ===== */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
  }

  .tab {
    padding: 0.375rem 0.625rem;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    color: var(--color-text-muted, #888);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
    color: var(--color-text, #e5e5e5);
  }

  .tab.active {
    background: var(--color-primary, #3b82f6);
    color: white;
  }

  .tab:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .health-badges {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }

  .health-badge {
    font-size: 0.65rem;
    color: var(--color-text-muted, #888);
    padding: 0.15rem 0.375rem;
    border-radius: 0.25rem;
    background: rgba(255, 255, 255, 0.05);
  }

  .health-badge.generating {
    color: var(--color-warning, #f59e0b);
    background: rgba(245, 158, 11, 0.1);
  }

  /* ===== CONTENT ===== */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  /* ===== GENERATE VIEW ===== */
  .generate-view {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .form-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-text-muted, #888);
  }

  .form-label .required {
    color: var(--color-error, #ef4444);
  }

  .form-input,
  .form-select {
    padding: 0.5rem 0.625rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
  }

  .form-input:focus,
  .form-select:focus,
  .form-textarea:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .form-textarea {
    padding: 0.5rem 0.625rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
    font-family: monospace;
    resize: vertical;
    min-height: 150px;
    line-height: 1.5;
  }

  .form-hint {
    font-size: 0.65rem;
    color: var(--color-text-muted, #666);
    text-align: right;
  }

  .btn-generate {
    padding: 0.75rem 1rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.5rem;
    color: white;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-generate:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  .btn-generate:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .generating-info {
    text-align: center;
    padding: 0.75rem;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
    line-height: 1.5;
  }

  .generating-info p {
    margin: 0 0 0.25rem 0;
  }

  .generating-info p:last-child {
    margin: 0;
  }

  /* ===== CARTAS LIST ===== */
  .cartas-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .carta-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    border-radius: 0.375rem;
    transition: all 0.15s;
  }

  .carta-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .carta-item.error {
    border-color: rgba(239, 68, 68, 0.3);
  }

  .carta-estado {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .carta-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .carta-nombre {
    font-size: 0.8rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .carta-meta {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }

  .carta-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .carta-fecha {
    font-size: 0.65rem;
    color: var(--color-text-muted, #888);
    white-space: nowrap;
  }

  .btn-view {
    padding: 0.25rem 0.375rem;
    background: rgba(255, 255, 255, 0.08);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-view:hover {
    background: rgba(59, 130, 246, 0.2);
  }

  /* ===== DETALLE VIEW ===== */
  .detalle-view {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .detalle-header {
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .detalle-title {
    margin: 0 0 0.375rem 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .detalle-meta {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .meta-badge {
    padding: 0.15rem 0.375rem;
    background: rgba(59, 130, 246, 0.15);
    border-radius: 0.25rem;
    font-size: 0.65rem;
    color: var(--color-primary, #3b82f6);
    text-transform: uppercase;
  }

  .meta-date {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }

  /* Stats */
  .detalle-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.375rem;
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    border-radius: 0.375rem;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-primary, #3b82f6);
  }

  .stat-label {
    font-size: 0.65rem;
    color: var(--color-text-muted, #888);
    text-transform: uppercase;
  }

  /* Categorias */
  .categorias-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .categoria-section {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .categoria-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.625rem;
    background: rgba(255, 255, 255, 0.04);
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.06));
  }

  .categoria-nombre {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
  }

  .categoria-count {
    font-size: 0.65rem;
    padding: 0.1rem 0.375rem;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 0.25rem;
    color: var(--color-text-muted, #888);
  }

  .productos-grid {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .producto-card {
    padding: 0.375rem 0.625rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .producto-card:last-child {
    border-bottom: none;
  }

  .producto-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }

  .producto-nombre {
    font-size: 0.8rem;
    font-weight: 500;
  }

  .producto-precio {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-success, #22c55e);
    white-space: nowrap;
  }

  .producto-ingredientes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  .ingrediente-tag {
    padding: 0.1rem 0.375rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.25rem;
    font-size: 0.65rem;
    color: var(--color-text-muted, #999);
  }

  /* ===== EMPTY & LOADING ===== */
  .empty-state,
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 2rem;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .empty-text {
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
  }

  .spinner {
    font-size: 1rem;
    animation: spin 1s linear infinite;
    display: inline-block;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* ===== BUTTONS ===== */
  .btn {
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 500;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn.primary {
    background: var(--color-primary, #3b82f6);
    color: white;
  }

  .btn.primary:hover {
    filter: brightness(1.1);
  }

  .btn.secondary {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text, #e5e5e5);
  }

  .btn.secondary:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  /* ===== ERROR BAR ===== */
  .error-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    background: rgba(239, 68, 68, 0.15);
    border-top: 1px solid rgba(239, 68, 68, 0.3);
    color: var(--color-error, #ef4444);
    font-size: 0.75rem;
  }

  .close-btn {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0.25rem;
  }
</style>
