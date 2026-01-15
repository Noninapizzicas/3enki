<script lang="ts">
  /**
   * FacturasPanel - Panel de gestión de facturas
   *
   * Tabs:
   * - Lista: Ver facturas con filtros y búsqueda
   * - Detalle: Ver/editar factura seleccionada
   * - Subir: Subir factura manualmente
   * - Config: Configuración del proyecto
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    facturasStore,
    filteredFacturas,
    selectedFactura,
    facturasStats,
    facturasLoading,
    facturasError,
    initFacturasSubscriptions,
    setActiveTab,
    selectFactura,
    setFilter,
    updateFactura,
    reprocesarFactura,
    subirFactura,
    exportarExcel,
    marcarPagada,
    clearError,
    type Factura,
    type FacturaEstado,
    type FacturaSource
  } from '$lib/stores/facturas';
  import { activeProject } from '$lib/stores/workspace';

  export let panelId: string = '';

  // ==========================================================================
  // STATE
  // ==========================================================================

  let cleanup: (() => void) | null = null;

  // Upload
  let fileInput: HTMLInputElement;
  let uploading = false;
  let dragOver = false;

  // Edit form
  let editMode = false;
  let editForm: Partial<Factura> = {};

  // Reactive
  $: tab = $facturasStore.activeTab;
  $: stats = $facturasStats;
  $: loading = $facturasLoading;
  $: error = $facturasError;
  $: selected = $selectedFactura;
  $: facturas = $filteredFacturas;
  $: filter = $facturasStore.filter;
  $: project = $activeProject;

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    cleanup = initFacturasSubscriptions();
  });

  onDestroy(() => {
    cleanup?.();
  });

  // ==========================================================================
  // HANDLERS - TABS
  // ==========================================================================

  function handleTabChange(newTab: typeof tab) {
    setActiveTab(newTab);
    clearError();
    editMode = false;
  }

  // ==========================================================================
  // HANDLERS - LISTA
  // ==========================================================================

  function handleSelectFactura(id: number) {
    selectFactura(id);
    editMode = false;
    editForm = {};
  }

  function handleFilterChange(key: keyof typeof filter, value: string) {
    setFilter({ [key]: value });
  }

  // ==========================================================================
  // HANDLERS - DETALLE
  // ==========================================================================

  function startEdit() {
    if (!selected) return;
    editMode = true;
    editForm = {
      numero_factura: selected.numero_factura,
      fecha_factura: selected.fecha_factura,
      nif_proveedor: selected.nif_proveedor,
      nombre_proveedor: selected.nombre_proveedor,
      concepto: selected.concepto,
      base_imponible: selected.base_imponible,
      porcentaje_iva: selected.porcentaje_iva,
      cuota_iva: selected.cuota_iva,
      total: selected.total,
      categoria: selected.categoria
    };
  }

  async function saveEdit() {
    if (!selected) return;
    const success = await updateFactura(selected.id, editForm);
    if (success) {
      editMode = false;
      editForm = {};
    }
  }

  function cancelEdit() {
    editMode = false;
    editForm = {};
  }

  async function handleReprocesar() {
    if (!selected) return;
    await reprocesarFactura(selected.id);
  }

  async function handleMarcarPagada() {
    if (!selected) return;
    await marcarPagada(selected.id, selected.estado_pago !== 'pagada');
  }

  // ==========================================================================
  // HANDLERS - UPLOAD
  // ==========================================================================

  function triggerUpload() {
    fileInput?.click();
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    uploading = true;
    for (const file of files) {
      await subirFactura(file, 'manual');
    }
    uploading = false;
    input.value = '';
    handleTabChange('lista');
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;

    const files = event.dataTransfer?.files;
    if (!files?.length) return;

    uploading = true;
    for (const file of files) {
      if (isValidFile(file)) {
        await subirFactura(file, 'manual');
      }
    }
    uploading = false;
    handleTabChange('lista');
  }

  function isValidFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    return validTypes.includes(file.type);
  }

  // ==========================================================================
  // HANDLERS - EXPORT
  // ==========================================================================

  async function handleExport() {
    const path = await exportarExcel();
    if (path) {
      // TODO: Descargar archivo o mostrar notificación
      console.log('Excel exportado:', path);
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  function getEstadoIcon(estado: FacturaEstado): string {
    const icons: Record<FacturaEstado, string> = {
      pendiente: '⏳',
      procesando: '⚙️',
      procesada: '✅',
      error: '❌',
      exportada: '📤'
    };
    return icons[estado] || '📄';
  }

  function getEstadoColor(estado: FacturaEstado): string {
    const colors: Record<FacturaEstado, string> = {
      pendiente: 'var(--color-warning, #f59e0b)',
      procesando: 'var(--color-primary, #3b82f6)',
      procesada: 'var(--color-success, #22c55e)',
      error: 'var(--color-error, #ef4444)',
      exportada: 'var(--color-text-muted, #888)'
    };
    return colors[estado] || 'var(--color-text)';
  }

  function getSourceIcon(source: FacturaSource): string {
    const icons: Record<FacturaSource, string> = {
      telegram: '📱',
      gmail: '📧',
      manual: '📤'
    };
    return icons[source] || '📄';
  }

  function formatCurrency(value?: number): string {
    if (value === undefined || value === null) return '-';
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-ES');
  }

  const categorias = [
    'suministros',
    'servicios',
    'material',
    'alquiler',
    'seguros',
    'transporte',
    'marketing',
    'otros'
  ];
</script>

<div class="facturas-panel">
  <!-- Header -->
  <div class="panel-header">
    <div class="tabs">
      <button
        class="tab"
        class:active={tab === 'lista'}
        on:click={() => handleTabChange('lista')}
      >
        📋 Lista
      </button>
      <button
        class="tab"
        class:active={tab === 'detalle'}
        on:click={() => handleTabChange('detalle')}
        disabled={!selected}
      >
        📄 Detalle
      </button>
      <button
        class="tab"
        class:active={tab === 'subir'}
        on:click={() => handleTabChange('subir')}
      >
        📤 Subir
      </button>
    </div>
    <span class="stats-badge">
      {stats.total} facturas
    </span>
  </div>

  <!-- Stats bar -->
  <div class="stats-bar">
    <span class="stat" title="Pendientes">⏳ {stats.pendientes}</span>
    <span class="stat" title="Procesadas">✅ {stats.procesadas}</span>
    <span class="stat" title="Errores">❌ {stats.errores}</span>
    <span class="stat" title="Exportadas">📤 {stats.exportadas}</span>
    <button class="export-btn" on:click={handleExport} disabled={loading || stats.procesadas === 0}>
      📊 Excel
    </button>
  </div>

  <!-- Content -->
  <div class="panel-content">
    <!-- ================================================================== -->
    <!-- TAB: LISTA -->
    <!-- ================================================================== -->
    {#if tab === 'lista'}
      <!-- Filtros -->
      <div class="filters">
        <input
          type="text"
          class="search-input"
          placeholder="Buscar..."
          value={filter.search}
          on:input={(e) => handleFilterChange('search', e.currentTarget.value)}
        />
        <select
          class="filter-select"
          value={filter.estado}
          on:change={(e) => handleFilterChange('estado', e.currentTarget.value)}
        >
          <option value="todas">Todos los estados</option>
          <option value="pendiente">⏳ Pendientes</option>
          <option value="procesando">⚙️ Procesando</option>
          <option value="procesada">✅ Procesadas</option>
          <option value="error">❌ Errores</option>
          <option value="exportada">📤 Exportadas</option>
        </select>
        <select
          class="filter-select"
          value={filter.source}
          on:change={(e) => handleFilterChange('source', e.currentTarget.value)}
        >
          <option value="todas">Todos los orígenes</option>
          <option value="telegram">📱 Telegram</option>
          <option value="gmail">📧 Gmail</option>
          <option value="manual">📤 Manual</option>
        </select>
      </div>

      <!-- Lista -->
      {#if loading && facturas.length === 0}
        <div class="loading-state">
          <span class="spinner">⏳</span>
          <span>Cargando facturas...</span>
        </div>
      {:else if facturas.length === 0}
        <div class="empty-state">
          <span class="empty-icon">📄</span>
          <span class="empty-title">Sin facturas</span>
          <span class="empty-text">
            {filter.search || filter.estado !== 'todas' || filter.source !== 'todas'
              ? 'No hay facturas que coincidan con los filtros'
              : 'Sube tu primera factura'}
          </span>
          {#if !filter.search && filter.estado === 'todas' && filter.source === 'todas'}
            <button class="btn primary" on:click={() => handleTabChange('subir')}>
              📤 Subir factura
            </button>
          {/if}
        </div>
      {:else}
        <div class="facturas-list">
          {#each facturas as factura (factura.id)}
            <button
              class="factura-item"
              class:selected={selected?.id === factura.id}
              on:click={() => handleSelectFactura(factura.id)}
            >
              <span class="factura-estado" style="color: {getEstadoColor(factura.estado)}">
                {getEstadoIcon(factura.estado)}
              </span>
              <div class="factura-info">
                <span class="factura-nombre">
                  {factura.nombre_proveedor || factura.nombre_archivo}
                </span>
                <span class="factura-meta">
                  {getSourceIcon(factura.source)}
                  {factura.numero_factura || 'Sin número'}
                  {#if factura.total}
                    · {formatCurrency(factura.total)}
                  {/if}
                </span>
              </div>
              <span class="factura-fecha">{formatDate(factura.fecha_factura || factura.created_at)}</span>
            </button>
          {/each}
        </div>
      {/if}

    <!-- ================================================================== -->
    <!-- TAB: DETALLE -->
    <!-- ================================================================== -->
    {:else if tab === 'detalle'}
      {#if selected}
        <div class="detalle-view">
          <!-- Cabecera -->
          <div class="detalle-header">
            <div class="detalle-title">
              <span class="estado-badge" style="background: {getEstadoColor(selected.estado)}">
                {getEstadoIcon(selected.estado)} {selected.estado}
              </span>
              <span class="source-badge">
                {getSourceIcon(selected.source)} {selected.source}
              </span>
            </div>
            <div class="detalle-actions">
              {#if !editMode}
                <button class="btn-icon" on:click={startEdit} title="Editar">✏️</button>
                <button class="btn-icon" on:click={handleReprocesar} title="Reprocesar OCR" disabled={selected.estado === 'procesando'}>🔄</button>
                <button
                  class="btn-icon"
                  class:active={selected.estado_pago === 'pagada'}
                  on:click={handleMarcarPagada}
                  title={selected.estado_pago === 'pagada' ? 'Marcar no pagada' : 'Marcar pagada'}
                >
                  {selected.estado_pago === 'pagada' ? '💰' : '💵'}
                </button>
              {:else}
                <button class="btn secondary" on:click={cancelEdit}>Cancelar</button>
                <button class="btn primary" on:click={saveEdit}>💾 Guardar</button>
              {/if}
            </div>
          </div>

          <!-- Archivo original -->
          <div class="detalle-section">
            <div class="section-title">📁 Archivo</div>
            <div class="info-row">
              <span class="info-label">Nombre</span>
              <span class="info-value mono">{selected.nombre_archivo}</span>
            </div>
            {#if selected.ocr_confidence}
              <div class="info-row">
                <span class="info-label">Confianza OCR</span>
                <span class="info-value">{Math.round(selected.ocr_confidence * 100)}%</span>
              </div>
            {/if}
            {#if selected.error_mensaje}
              <div class="error-box">
                <span>❌ {selected.error_mensaje}</span>
              </div>
            {/if}
          </div>

          <!-- Datos de la factura -->
          <div class="detalle-section">
            <div class="section-title">📋 Datos de la Factura</div>

            {#if editMode}
              <!-- Modo edición -->
              <div class="edit-form">
                <div class="form-row">
                  <label>
                    <span>Nº Factura</span>
                    <input type="text" bind:value={editForm.numero_factura} placeholder="FAC-001" />
                  </label>
                  <label>
                    <span>Fecha</span>
                    <input type="date" bind:value={editForm.fecha_factura} />
                  </label>
                </div>
                <div class="form-row">
                  <label>
                    <span>NIF Proveedor</span>
                    <input type="text" bind:value={editForm.nif_proveedor} placeholder="B12345678" />
                  </label>
                  <label>
                    <span>Proveedor</span>
                    <input type="text" bind:value={editForm.nombre_proveedor} placeholder="Nombre del proveedor" />
                  </label>
                </div>
                <label class="full-width">
                  <span>Concepto</span>
                  <input type="text" bind:value={editForm.concepto} placeholder="Descripción" />
                </label>
                <div class="form-row">
                  <label>
                    <span>Base Imponible</span>
                    <input type="number" step="0.01" bind:value={editForm.base_imponible} />
                  </label>
                  <label>
                    <span>% IVA</span>
                    <input type="number" step="0.01" bind:value={editForm.porcentaje_iva} />
                  </label>
                </div>
                <div class="form-row">
                  <label>
                    <span>Cuota IVA</span>
                    <input type="number" step="0.01" bind:value={editForm.cuota_iva} />
                  </label>
                  <label>
                    <span>Total</span>
                    <input type="number" step="0.01" bind:value={editForm.total} />
                  </label>
                </div>
                <label>
                  <span>Categoría</span>
                  <select bind:value={editForm.categoria}>
                    <option value="">Sin categoría</option>
                    {#each categorias as cat}
                      <option value={cat}>{cat}</option>
                    {/each}
                  </select>
                </label>
              </div>
            {:else}
              <!-- Modo visualización -->
              <div class="info-grid">
                <div class="info-row">
                  <span class="info-label">Nº Factura</span>
                  <span class="info-value">{selected.numero_factura || '-'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Fecha</span>
                  <span class="info-value">{formatDate(selected.fecha_factura)}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">NIF</span>
                  <span class="info-value mono">{selected.nif_proveedor || '-'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Proveedor</span>
                  <span class="info-value">{selected.nombre_proveedor || '-'}</span>
                </div>
                <div class="info-row full">
                  <span class="info-label">Concepto</span>
                  <span class="info-value">{selected.concepto || '-'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Base</span>
                  <span class="info-value">{formatCurrency(selected.base_imponible)}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">IVA ({selected.porcentaje_iva || 0}%)</span>
                  <span class="info-value">{formatCurrency(selected.cuota_iva)}</span>
                </div>
                <div class="info-row highlight">
                  <span class="info-label">Total</span>
                  <span class="info-value total">{formatCurrency(selected.total)}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Categoría</span>
                  <span class="info-value">{selected.categoria || '-'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Pago</span>
                  <span class="info-value" class:pagada={selected.estado_pago === 'pagada'}>
                    {selected.estado_pago === 'pagada' ? '💰 Pagada' : '💵 Pendiente'}
                    {#if selected.fecha_pago}
                      ({formatDate(selected.fecha_pago)})
                    {/if}
                  </span>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="empty-state">
          <span class="empty-icon">📄</span>
          <span class="empty-text">Selecciona una factura de la lista</span>
          <button class="btn secondary" on:click={() => handleTabChange('lista')}>
            Ir a Lista
          </button>
        </div>
      {/if}

    <!-- ================================================================== -->
    <!-- TAB: SUBIR -->
    <!-- ================================================================== -->
    {:else if tab === 'subir'}
      <div class="upload-view">
        <input
          type="file"
          bind:this={fileInput}
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          on:change={handleFileSelect}
          style="display: none"
        />

        <div
          class="drop-zone"
          class:dragover={dragOver}
          class:uploading
          on:dragover={handleDragOver}
          on:dragleave={handleDragLeave}
          on:drop={handleDrop}
          on:click={triggerUpload}
          role="button"
          tabindex="0"
          on:keydown={(e) => e.key === 'Enter' && triggerUpload()}
        >
          {#if uploading}
            <span class="upload-icon spinning">⏳</span>
            <span class="upload-title">Subiendo...</span>
          {:else if dragOver}
            <span class="upload-icon">📥</span>
            <span class="upload-title">Suelta aquí</span>
          {:else}
            <span class="upload-icon">📤</span>
            <span class="upload-title">Subir factura</span>
            <span class="upload-text">Arrastra archivos o haz clic para seleccionar</span>
            <span class="upload-formats">JPG, PNG, WebP, PDF</span>
          {/if}
        </div>

        <div class="upload-info">
          <p>📌 Las facturas subidas manualmente se procesan igual que las recibidas por Telegram o Gmail.</p>
          <p>⚙️ El OCR extrae automáticamente: proveedor, fecha, importes, etc.</p>
        </div>
      </div>
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
  .facturas-panel {
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

  .stats-badge {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }

  /* ===== STATS BAR ===== */
  .stats-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.375rem 0.5rem;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    font-size: 0.7rem;
  }

  .stat {
    color: var(--color-text-muted, #888);
  }

  .export-btn {
    margin-left: auto;
    padding: 0.25rem 0.5rem;
    background: var(--color-success, #22c55e);
    border: none;
    border-radius: 0.25rem;
    color: white;
    font-size: 0.7rem;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .export-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ===== CONTENT ===== */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  /* ===== FILTERS ===== */
  .filters {
    display: flex;
    gap: 0.375rem;
    margin-bottom: 0.5rem;
  }

  .search-input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.75rem;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .filter-select {
    padding: 0.375rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.7rem;
    cursor: pointer;
  }

  /* ===== LISTA ===== */
  .facturas-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .factura-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }

  .factura-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .factura-item.selected {
    background: rgba(59, 130, 246, 0.1);
    border-color: var(--color-primary, #3b82f6);
  }

  .factura-estado {
    font-size: 1rem;
  }

  .factura-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .factura-nombre {
    font-size: 0.8rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .factura-meta {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }

  .factura-fecha {
    font-size: 0.65rem;
    color: var(--color-text-muted, #888);
    white-space: nowrap;
  }

  /* ===== DETALLE ===== */
  .detalle-view {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .detalle-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .detalle-title {
    display: flex;
    gap: 0.375rem;
  }

  .estado-badge,
  .source-badge {
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.65rem;
    font-weight: 500;
    text-transform: uppercase;
  }

  .estado-badge {
    color: white;
  }

  .source-badge {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text-muted, #888);
  }

  .detalle-actions {
    display: flex;
    gap: 0.25rem;
  }

  .btn-icon {
    padding: 0.375rem;
    background: rgba(255, 255, 255, 0.05);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-icon:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }

  .btn-icon:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-icon.active {
    background: var(--color-success, #22c55e);
  }

  .detalle-section {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    border-radius: 0.375rem;
    padding: 0.625rem;
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted, #888);
    margin-bottom: 0.5rem;
  }

  .info-grid {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0;
  }

  .info-row.full {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .info-row.highlight {
    background: rgba(255, 255, 255, 0.05);
    margin: 0 -0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
  }

  .info-label {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }

  .info-value {
    font-size: 0.8rem;
    color: var(--color-text, #e5e5e5);
  }

  .info-value.mono {
    font-family: monospace;
  }

  .info-value.total {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-success, #22c55e);
  }

  .info-value.pagada {
    color: var(--color-success, #22c55e);
  }

  .error-box {
    padding: 0.5rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.25rem;
    color: var(--color-error, #ef4444);
    font-size: 0.75rem;
  }

  /* ===== EDIT FORM ===== */
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .edit-form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .edit-form label.full-width {
    grid-column: 1 / -1;
  }

  .edit-form label span {
    font-size: 0.65rem;
    color: var(--color-text-muted, #888);
  }

  .edit-form input,
  .edit-form select {
    padding: 0.375rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
  }

  .edit-form input:focus,
  .edit-form select:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  /* ===== UPLOAD ===== */
  .upload-view {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
  }

  .drop-zone {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    background: rgba(255, 255, 255, 0.02);
    border: 2px dashed var(--color-border, rgba(255, 255, 255, 0.15));
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .drop-zone:hover,
  .drop-zone.dragover {
    background: rgba(59, 130, 246, 0.1);
    border-color: var(--color-primary, #3b82f6);
  }

  .drop-zone.uploading {
    pointer-events: none;
    opacity: 0.7;
  }

  .upload-icon {
    font-size: 2.5rem;
  }

  .upload-icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .upload-title {
    font-size: 1rem;
    font-weight: 500;
  }

  .upload-text {
    font-size: 0.8rem;
    color: var(--color-text-muted, #888);
  }

  .upload-formats {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.25rem;
  }

  .upload-info {
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
    line-height: 1.5;
  }

  .upload-info p {
    margin: 0 0 0.5rem 0;
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
    font-size: 1.5rem;
    animation: spin 1s linear infinite;
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
    background: var(--color-success, #22c55e);
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
