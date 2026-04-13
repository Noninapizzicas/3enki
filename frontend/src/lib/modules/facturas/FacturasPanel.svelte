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
    pipelineMetrics,
    loadPipelineMetrics,
    type Factura,
    type FacturaEstado,
    type FacturaSource,
    type PipelineMetricsDashboard
  } from '$lib/stores/facturas';
  import {
    channelsStore,
    loadChannels,
    registerChannel,
    removeChannel,
    channelsByType,
    type ChannelBinding
  } from '$lib/stores/channels';
  import { activeProject } from '$lib/stores/workspace';
  import {
    mqttRequest
  } from '$lib/ui-core/mqtt-request';

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

  // Config state
  let configTab: 'telegram' | 'gmail' | 'metrics' = 'telegram';
  let telegramBotName = '';
  let gmailAccount = '';
  let gmailQuery = 'has:attachment is:unread';
  let gmailChecking = false;
  let fuentesConfig: any = null;
  let configLoading = false;

  // Reactive
  $: tab = $facturasStore.activeTab;
  $: stats = $facturasStats;
  $: loading = $facturasLoading;
  $: error = $facturasError;
  $: selected = $selectedFactura;
  $: facturas = $filteredFacturas;
  $: filter = $facturasStore.filter;
  $: project = $activeProject;
  $: metrics = $pipelineMetrics;
  $: projectChannels = ($channelsStore.channels || []).filter(
    (ch: ChannelBinding) => ch.project_id === project?.id
  );
  $: telegramChannels = projectChannels.filter((ch: ChannelBinding) => ch.channel_type === 'telegram');
  $: gmailChannels = projectChannels.filter((ch: ChannelBinding) => ch.channel_type === 'gmail');

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    cleanup = initFacturasSubscriptions();
    loadChannels();
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
    await exportarExcel();
  }

  // ==========================================================================
  // HANDLERS - CONFIG
  // ==========================================================================

  async function loadFuentesConfig() {
    if (!project?.id) return;
    configLoading = true;
    try {
      const res = await mqttRequest<any>('fuentes', 'get-config', { proyecto: project.id });
      fuentesConfig = res.data;
      const fuentes = fuentesConfig?.fuentes || {};
      gmailAccount = fuentes.gmail?.account || '';
      gmailQuery = fuentes.gmail?.query || 'has:attachment is:unread';
    } catch (e) {
      console.error('[Config] Load failed:', e);
    }
    configLoading = false;
  }

  async function handleAddTelegramChannel() {
    if (!project?.id || !telegramBotName.trim()) return;
    try {
      await registerChannel('telegram', telegramBotName.trim(), project.id, 'facturas', `Bot ${telegramBotName.trim()}`);
      telegramBotName = '';
    } catch (e) { /* error in store */ }
  }

  async function handleRemoveChannel(type: string, externalId: string) {
    await removeChannel(type, externalId);
  }

  async function handleSaveGmailConfig() {
    if (!project?.id) return;
    configLoading = true;
    try {
      const fuentes = fuentesConfig?.fuentes || {};
      fuentes.gmail = {
        enabled: !!gmailAccount,
        account: gmailAccount,
        query: gmailQuery
      };
      await mqttRequest('fuentes', 'save-config', { proyecto: project.id, fuentes });
      await loadFuentesConfig();
    } catch (e) {
      console.error('[Config] Gmail save failed:', e);
    }
    configLoading = false;
  }

  async function handleCheckGmailNow() {
    if (!project?.id) return;
    gmailChecking = true;
    try {
      const res = await mqttRequest<any>('fuentes', 'check-gmail', { proyecto: project.id });
      const data = res.data;
      alert(`Gmail: ${data.processed || 0} procesadas, ${data.errors || 0} errores, ${data.total_attachments || 0} adjuntos`);
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'desconocido'}`);
    }
    gmailChecking = false;
  }

  function handleConfigTabChange(newTab: typeof configTab) {
    configTab = newTab;
    if (newTab === 'metrics') loadPipelineMetrics();
    if (newTab === 'telegram' || newTab === 'gmail') loadFuentesConfig();
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
      <button
        class="tab"
        class:active={tab === 'config'}
        on:click={() => { handleTabChange('config'); loadFuentesConfig(); loadChannels(); }}
      >
        ⚙️ Config
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

    <!-- ================================================================== -->
    <!-- TAB: CONFIG (Fuentes + Métricas) -->
    <!-- ================================================================== -->
    {:else if tab === 'config'}
      <div class="config-view">
        <!-- Sub-tabs -->
        <div class="config-tabs">
          <button class="config-tab" class:active={configTab === 'telegram'} on:click={() => handleConfigTabChange('telegram')}>
            📱 Telegram
          </button>
          <button class="config-tab" class:active={configTab === 'gmail'} on:click={() => handleConfigTabChange('gmail')}>
            📧 Gmail
          </button>
          <button class="config-tab" class:active={configTab === 'metrics'} on:click={() => handleConfigTabChange('metrics')}>
            📊 Métricas
          </button>
        </div>

        <!-- Telegram config -->
        {#if configTab === 'telegram'}
          <div class="config-section">
            <h4>Bots de Telegram vinculados</h4>
            <p class="config-hint">Vincula un bot de Telegram para recibir facturas. Las fotos y PDFs enviados al bot se procesarán automáticamente.</p>

            {#if telegramChannels.length > 0}
              <div class="channel-list">
                {#each telegramChannels as ch (ch.id)}
                  <div class="channel-item">
                    <span class="channel-icon">📱</span>
                    <div class="channel-info">
                      <span class="channel-name">{ch.label || ch.external_id}</span>
                      <span class="channel-meta">@{ch.external_id} · {ch.purpose}</span>
                    </div>
                    <button class="btn-icon danger" on:click={() => handleRemoveChannel('telegram', ch.external_id)} title="Eliminar">
                      ✕
                    </button>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="config-empty">
                Sin bots vinculados. Añade uno abajo.
              </div>
            {/if}

            <div class="config-form">
              <input
                type="text"
                class="config-input"
                placeholder="Nombre del bot (ej: mi_facturas_bot)"
                bind:value={telegramBotName}
                on:keydown={(e) => e.key === 'Enter' && handleAddTelegramChannel()}
              />
              <button class="btn primary" on:click={handleAddTelegramChannel} disabled={!telegramBotName.trim()}>
                + Vincular bot
              </button>
            </div>

            <div class="config-flow">
              <h4>Flujo automático</h4>
              <div class="flow-diagram">
                <span class="flow-step">📱 Foto/PDF al bot</span>
                <span class="flow-arrow">→</span>
                <span class="flow-step">📥 Descarga</span>
                <span class="flow-arrow">→</span>
                <span class="flow-step">🔍 OCR</span>
                <span class="flow-arrow">→</span>
                <span class="flow-step">🤖 IA estructura</span>
                <span class="flow-arrow">→</span>
                <span class="flow-step">✅ Factura lista</span>
              </div>
            </div>
          </div>

        <!-- Gmail config -->
        {:else if configTab === 'gmail'}
          <div class="config-section">
            <h4>Cuenta Gmail</h4>
            <p class="config-hint">Configura una cuenta de Gmail para importar facturas automáticamente desde correos con adjuntos PDF.</p>

            <div class="config-form">
              <label class="config-label">Nombre de la cuenta (credential-manager)</label>
              <input
                type="text"
                class="config-input"
                placeholder="ej: Nonina"
                bind:value={gmailAccount}
              />

              <label class="config-label">Filtro de búsqueda</label>
              <input
                type="text"
                class="config-input"
                placeholder="has:attachment is:unread"
                bind:value={gmailQuery}
              />

              <div class="config-actions">
                <button class="btn primary" on:click={handleSaveGmailConfig} disabled={configLoading}>
                  {configLoading ? '⏳' : '💾'} Guardar
                </button>
                <button class="btn" on:click={handleCheckGmailNow} disabled={gmailChecking || !gmailAccount}>
                  {gmailChecking ? '⏳ Buscando...' : '📧 Revisar ahora'}
                </button>
              </div>
            </div>

            <div class="config-flow">
              <h4>Flujo</h4>
              <div class="flow-diagram">
                <span class="flow-step">📧 Correo con adjunto</span>
                <span class="flow-arrow">→</span>
                <span class="flow-step">📥 Descarga PDF</span>
                <span class="flow-arrow">→</span>
                <span class="flow-step">🔍 OCR</span>
                <span class="flow-arrow">→</span>
                <span class="flow-step">🤖 IA estructura</span>
                <span class="flow-arrow">→</span>
                <span class="flow-step">✅ Factura lista</span>
              </div>
            </div>
          </div>

        <!-- Metrics -->
        {:else if configTab === 'metrics'}
          <div class="config-section">
            {#if !metrics.available}
              <div class="config-empty">Sin datos de métricas. Procesa alguna factura primero.</div>
            {:else}
              <!-- Summary -->
              <div class="metrics-grid">
                <div class="metric-card">
                  <span class="metric-value">{metrics.summary?.total || 0}</span>
                  <span class="metric-label">Total procesadas</span>
                </div>
                <div class="metric-card success">
                  <span class="metric-value">{metrics.summary?.successRate || 0}%</span>
                  <span class="metric-label">Tasa de éxito</span>
                </div>
                <div class="metric-card">
                  <span class="metric-value">{metrics.cost?.totalEur || '0'} EUR</span>
                  <span class="metric-label">Coste total IA</span>
                </div>
                <div class="metric-card">
                  <span class="metric-value">{metrics.cost?.totalTokens || 0}</span>
                  <span class="metric-label">Tokens consumidos</span>
                </div>
              </div>

              <!-- Timing -->
              {#if metrics.timing?.overall?.count}
                <h4>Tiempos de procesamiento</h4>
                <div class="metrics-grid">
                  <div class="metric-card">
                    <span class="metric-value">{(metrics.timing.overall.avg / 1000).toFixed(1)}s</span>
                    <span class="metric-label">Media</span>
                  </div>
                  <div class="metric-card">
                    <span class="metric-value">{(metrics.timing.overall.p50 / 1000).toFixed(1)}s</span>
                    <span class="metric-label">P50</span>
                  </div>
                  <div class="metric-card">
                    <span class="metric-value">{(metrics.timing.overall.p95 / 1000).toFixed(1)}s</span>
                    <span class="metric-label">P95</span>
                  </div>
                </div>
              {/if}

              <!-- Validation -->
              {#if metrics.validation?.total}
                <h4>Validación</h4>
                <div class="metrics-grid">
                  <div class="metric-card success">
                    <span class="metric-value">{metrics.validation.passed}</span>
                    <span class="metric-label">Válidas</span>
                  </div>
                  <div class="metric-card danger">
                    <span class="metric-value">{metrics.validation.failed}</span>
                    <span class="metric-label">Con errores</span>
                  </div>
                  <div class="metric-card">
                    <span class="metric-value">{metrics.validation.totalIssues}</span>
                    <span class="metric-label">Issues detectados</span>
                  </div>
                </div>
              {/if}

              <!-- Recent -->
              {#if metrics.recent && metrics.recent.length > 0}
                <h4>Últimas facturas</h4>
                <div class="recent-list">
                  {#each metrics.recent as item}
                    <div class="recent-item" class:success={item.success} class:error={!item.success}>
                      <span class="recent-status">{item.success ? '✅' : '❌'}</span>
                      <span class="recent-provider">{item.proveedor || 'Desconocido'}</span>
                      <span class="recent-total">{item.total ? `${item.total.toFixed(2)} EUR` : '-'}</span>
                      <span class="recent-time">{(item.duration_ms / 1000).toFixed(1)}s</span>
                    </div>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        {/if}
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

  /* ===== CONFIG VIEW ===== */
  .config-view { padding: 0.5rem; overflow-y: auto; flex: 1; }

  .config-tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.1));
    padding-bottom: 0.5rem;
  }

  .config-tab {
    padding: 0.375rem 0.625rem;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    color: var(--color-text-muted, #888);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .config-tab:hover { background: rgba(255,255,255,0.05); color: var(--color-text, #e5e5e5); }
  .config-tab.active { background: rgba(59,130,246,0.2); color: var(--color-primary, #3b82f6); }

  .config-section h4 { margin: 0.75rem 0 0.25rem; font-size: 0.8rem; font-weight: 600; }
  .config-hint { font-size: 0.7rem; color: var(--color-text-muted, #888); margin-bottom: 0.5rem; }
  .config-empty { padding: 1rem; text-align: center; color: var(--color-text-muted, #888); font-size: 0.75rem; }

  .config-form { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }
  .config-label { font-size: 0.7rem; color: var(--color-text-muted, #888); }
  .config-input {
    padding: 0.5rem;
    background: rgba(0,0,0,0.2);
    border: 1px solid var(--color-border, rgba(255,255,255,0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
  }
  .config-input:focus { outline: none; border-color: var(--color-primary, #3b82f6); }
  .config-actions { display: flex; gap: 0.5rem; margin-top: 0.25rem; }

  .btn { padding: 0.375rem 0.75rem; border: 1px solid var(--color-border, rgba(255,255,255,0.15)); border-radius: 0.375rem; background: transparent; color: var(--color-text, #e5e5e5); font-size: 0.75rem; cursor: pointer; }
  .btn:hover:not(:disabled) { background: rgba(255,255,255,0.05); }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .btn.primary { background: rgba(59,130,246,0.2); border-color: rgba(59,130,246,0.3); color: var(--color-primary, #3b82f6); }
  .btn.primary:hover:not(:disabled) { background: rgba(59,130,246,0.3); }

  /* Channel list */
  .channel-list { display: flex; flex-direction: column; gap: 0.25rem; }
  .channel-item {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.5rem; border-radius: 0.375rem;
    background: rgba(0,0,0,0.15);
  }
  .channel-icon { font-size: 1.1rem; }
  .channel-info { flex: 1; display: flex; flex-direction: column; }
  .channel-name { font-size: 0.8rem; font-weight: 500; }
  .channel-meta { font-size: 0.65rem; color: var(--color-text-muted, #888); }
  .btn-icon { background: none; border: none; color: var(--color-text-muted, #888); cursor: pointer; padding: 0.25rem; font-size: 0.8rem; }
  .btn-icon.danger:hover { color: var(--color-error, #ef4444); }

  /* Flow diagram */
  .config-flow { margin-top: 0.75rem; }
  .flow-diagram { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; padding: 0.5rem; background: rgba(0,0,0,0.15); border-radius: 0.375rem; }
  .flow-step { font-size: 0.7rem; padding: 0.25rem 0.5rem; background: rgba(59,130,246,0.1); border-radius: 0.25rem; white-space: nowrap; }
  .flow-arrow { color: var(--color-text-muted, #888); font-size: 0.7rem; }

  /* Metrics */
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 0.5rem; margin: 0.5rem 0; }
  .metric-card {
    padding: 0.5rem; text-align: center;
    background: rgba(0,0,0,0.15); border-radius: 0.375rem;
    border: 1px solid var(--color-border, rgba(255,255,255,0.05));
  }
  .metric-card.success { border-color: rgba(34,197,94,0.3); }
  .metric-card.danger { border-color: rgba(239,68,68,0.3); }
  .metric-value { display: block; font-size: 1.1rem; font-weight: 700; }
  .metric-label { display: block; font-size: 0.65rem; color: var(--color-text-muted, #888); margin-top: 0.125rem; }

  .recent-list { display: flex; flex-direction: column; gap: 0.25rem; }
  .recent-item {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.375rem 0.5rem; border-radius: 0.25rem;
    background: rgba(0,0,0,0.1); font-size: 0.75rem;
  }
  .recent-item.error { background: rgba(239,68,68,0.08); }
  .recent-provider { flex: 1; }
  .recent-total { color: var(--color-text-muted, #888); }
  .recent-time { color: var(--color-text-muted, #888); font-size: 0.65rem; }
</style>
