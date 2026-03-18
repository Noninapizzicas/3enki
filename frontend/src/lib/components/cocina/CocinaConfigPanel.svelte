<script lang="ts">
  /**
   * CocinaConfigPanel — Panel flotante de configuración por terminal
   *
   * Permite a cada dispositivo de cocina:
   * - Ver/cambiar su nombre de estación
   * - Seleccionar familias/categorías del catálogo completo
   * - Ver su color asignado y los peers conectados
   *
   * Las categorías se cargan del catálogo (módulo categorias) para que
   * estén disponibles ANTES de que lleguen pedidos. El filtrado se aplica
   * client-side cuando llegan pedidos a cocina.
   *
   * Se abre desde el botón engranaje del CocinaHeader.
   * Overlay oscuro con panel lateral derecho.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { page } from '$app/stores';
  import {
    cocinaStore,
    myDeviceColor, myDeviceNombre, myEstacion, filtrosActivos,
    tipoEstacion, tiposDisponibles, cocinaDevices, myImpresora,
    pedidosCocina,
    setFiltros, updateDeviceName, updateEstacion, setTipoEstacion, setImpresora,
    loadImpresorasDisponibles
  } from '$lib/stores/cocina';
  import type { ItemCocina, TipoEstacionInfo, ImpresoraConfig, ImpresoraDisponible } from '$lib/stores/cocina';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  const dispatch = createEventDispatcher();

  // Local state for editing
  let editNombre = '';
  let editEstacion = '';
  let selectedFamilias: Set<string> = new Set();
  let selectedTipoEstacion: string = 'general';
  let saving = false;

  // Impresora — selector de periféricos
  let editEsp32DeviceId = '';
  let selectedImpresora = '';  // nombre lógico del dispositivo seleccionado
  let impresorasDisponibles: ImpresoraDisponible[] = [];
  let loadingImpresoras = false;

  // Categorías cargadas del catálogo
  let catalogCategorias: { id: string; nombre: string; emoji?: string }[] = [];
  let loadingCategorias = false;

  const CACHE_KEY = 'cocina_categorias_cache';

  function loadFromCache(): typeof catalogCategorias {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  function saveToCache(data: typeof catalogCategorias) {
    try {
      if (data.length > 0) localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {}
  }

  // Cargar categorías: cache inmediato + MQTT async
  async function loadCategorias() {
    const projectId = $page.params.project_id;
    if (!projectId) return;

    // Inmediato: cargar desde cache localStorage
    const cached = loadFromCache();
    if (cached.length > 0) {
      catalogCategorias = cached;
    }

    loadingCategorias = catalogCategorias.length === 0;
    try {
      // productos/categorias auto-carga desde archivo si no hay categorías en memoria
      const res = await mqttRequest<any>('productos', 'categorias', { project_id: projectId }, { timeout: 6000 });
      const data = res?.data?.categorias || [];
      if (data.length > 0) {
        catalogCategorias = data;
        saveToCache(data);
      }
    } catch {
      try {
        const res2 = await mqttRequest<any>('productos', 'carta_completa', { project_id: projectId }, { timeout: 6000 });
        const data = res2?.data?.categorias || [];
        if (data.length > 0) {
          catalogCategorias = data;
          saveToCache(data);
        }
      } catch {}
    }
    loadingCategorias = false;
  }

  // Nombres de categorías del catálogo (por id)
  $: catalogFamilias = catalogCategorias.map(c => ({
    id: c.id,
    nombre: c.nombre,
    emoji: c.emoji || ''
  }));

  // También incluir familias de pedidos activos que no estén en el catálogo
  $: allItems = $pedidosCocina.flatMap(p => p.items) as (ItemCocina & { categoria?: string; familia?: string })[];
  $: orderFamilias = [...new Set(
    allItems
      .map(i => (i as any).categoria || (i as any).familia || '')
      .filter(Boolean)
  )];

  // Merge: catálogo + familias de pedidos + filtros activos (para no perder selecciones)
  // Cachear resultado para que esté disponible sin pedidos ni backend
  const FAMILIAS_CACHE_KEY = 'cocina_familias_cache';
  $: allFamilias = (() => {
    const catalogIds = new Set(catalogFamilias.map(c => c.id));
    const merged = [...catalogFamilias];

    // Añadir familias de pedidos activos no presentes en catálogo
    for (const f of orderFamilias) {
      if (!catalogIds.has(f)) {
        merged.push({ id: f, nombre: f, emoji: '' });
        catalogIds.add(f);
      }
    }

    // Añadir familias cacheadas de sesiones anteriores
    try {
      const cachedFamilias: string[] = JSON.parse(localStorage.getItem(FAMILIAS_CACHE_KEY) || '[]');
      for (const f of cachedFamilias) {
        if (!catalogIds.has(f)) {
          merged.push({ id: f, nombre: f, emoji: '' });
          catalogIds.add(f);
        }
      }
    } catch {}

    // Añadir filtros activos no presentes (para no perder selecciones previas)
    for (const f of $filtrosActivos) {
      if (!catalogIds.has(f)) {
        merged.push({ id: f, nombre: f, emoji: '' });
        catalogIds.add(f);
      }
    }

    const sorted = merged.sort((a, b) => a.nombre.localeCompare(b.nombre));

    // Cachear IDs para futuras sesiones
    if (sorted.length > 0) {
      try { localStorage.setItem(FAMILIAS_CACHE_KEY, JSON.stringify(sorted.map(f => f.id))); } catch {}
    }

    return sorted;
  })();

  async function loadImpresoras() {
    loadingImpresoras = true;
    impresorasDisponibles = await loadImpresorasDisponibles();
    loadingImpresoras = false;
  }

  // Init local state from store
  onMount(() => {
    editNombre = $myDeviceNombre || '';
    editEstacion = $myEstacion || '';
    selectedFamilias = new Set($filtrosActivos);
    selectedTipoEstacion = $tipoEstacion || 'general';
    editEsp32DeviceId = $myImpresora?.esp32_device_id || '';
    selectedImpresora = $myImpresora?.destino || '';
    loadCategorias();
    loadImpresoras();
  });

  function toggleFamilia(f: string) {
    if (selectedFamilias.has(f)) {
      selectedFamilias.delete(f);
    } else {
      selectedFamilias.add(f);
    }
    selectedFamilias = selectedFamilias; // trigger reactivity
  }

  function selectAll() {
    selectedFamilias = new Set();
  }

  function selectTipo(tipoId: string) {
    selectedTipoEstacion = tipoId;
  }

  async function handleSave() {
    saving = true;
    const familias = [...selectedFamilias];

    // Update filters
    setFiltros(familias);

    // Update station type
    await setTipoEstacion(selectedTipoEstacion);

    // Update printer — destino de perifericos + ESP32 bridge opcional
    const hasDestino = selectedImpresora.trim();
    const hasEsp32 = editEsp32DeviceId.trim();
    const newImpresora: ImpresoraConfig | null = (hasDestino || hasEsp32)
      ? {
          esp32_device_id: editEsp32DeviceId.trim(),
          ...(hasDestino ? { destino: selectedImpresora.trim() } : {})
        }
      : null;
    await setImpresora(newImpresora);

    // Update name if changed
    const currentName = $myDeviceNombre || '';
    if (editNombre.trim() && editNombre.trim() !== currentName) {
      await updateDeviceName(editNombre.trim());
    }

    // Update station if changed
    const currentEstacion = $myEstacion || '';
    if (editEstacion.trim() !== currentEstacion) {
      await updateEstacion(editEstacion.trim());
    }

    saving = false;
    dispatch('close');
  }

  function handleClose() {
    dispatch('close');
  }

  function handleOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('config-overlay')) {
      handleClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }

  $: isAllSelected = selectedFamilias.size === 0;
  $: peerDevices = $cocinaDevices;
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="config-overlay" on:click={handleOverlayClick} role="dialog" aria-modal="true" aria-label="Configuración de estación">
  <div class="config-panel">
    <!-- Header -->
    <div class="panel-header">
      <h2>Configuración</h2>
      <button class="close-btn" on:click={handleClose} aria-label="Cerrar">&times;</button>
    </div>

    <div class="panel-body">
      <!-- Device info -->
      <section class="config-section">
        <h3>Dispositivo</h3>
        <div class="device-info">
          {#if $myDeviceColor}
            <span class="color-badge" style="background: {$myDeviceColor}"></span>
          {/if}
          <input
            class="name-input"
            type="text"
            bind:value={editNombre}
            placeholder="Nombre del dispositivo..."
            maxlength="20"
          />
        </div>
      </section>

      <!-- Station name -->
      <section class="config-section">
        <h3>Estación</h3>
        <p class="section-hint">Nombre de la estación de trabajo (ej: HORNO, MONTAJE, FREIDORA).</p>
        <input
          class="name-input full-width"
          type="text"
          bind:value={editEstacion}
          placeholder="Nombre de estación..."
          maxlength="30"
        />
      </section>

      <!-- Family filters -->
      <section class="config-section">
        <h3>Familias</h3>
        <p class="section-hint">Selecciona las familias que prepara esta estación. Sin selección = ver todo.</p>

        {#if loadingCategorias}
          <p class="loading-hint">Cargando categorías...</p>
        {:else}
          <div class="familia-grid">
            <button
              class="familia-chip"
              class:active={isAllSelected}
              on:click={selectAll}
            >
              TODO
            </button>

            {#each allFamilias as familia}
              <button
                class="familia-chip"
                class:active={selectedFamilias.has(familia.id)}
                on:click={() => toggleFamilia(familia.id)}
              >
                {#if familia.emoji}<span class="familia-emoji">{familia.emoji}</span>{/if}
                {familia.nombre.toUpperCase()}
              </button>
            {/each}

            {#if allFamilias.length === 0}
              <p class="no-familias">No hay familias disponibles en el catálogo.</p>
            {/if}
          </div>
        {/if}
      </section>

      <!-- Station type selector -->
      <section class="config-section">
        <h3>Tipo de estación</h3>
        <p class="section-hint">El tipo determina los comportamientos automáticos (ej: imprimir ticket al completar).</p>

        <div class="familia-grid">
          {#each $tiposDisponibles as tipo}
            <button
              class="familia-chip tipo-chip"
              class:active={selectedTipoEstacion === tipo.id}
              on:click={() => selectTipo(tipo.id)}
            >
              {tipo.nombre.toUpperCase()}
            </button>
          {/each}

          {#if $tiposDisponibles.length === 0}
            <!-- Fallback si no se cargaron los tipos del backend -->
            {#each ['general', 'horno', 'montaje', 'freidora', 'emplatado', 'plancha'] as tipoId}
              <button
                class="familia-chip tipo-chip"
                class:active={selectedTipoEstacion === tipoId}
                on:click={() => selectTipo(tipoId)}
              >
                {tipoId.toUpperCase()}
              </button>
            {/each}
          {/if}
        </div>

        <!-- Show selected type info -->
        {#if selectedTipoEstacion}
          {@const tipoInfo = $tiposDisponibles.find(t => t.id === selectedTipoEstacion)}
          {#if tipoInfo}
            <div class="tipo-info">
              <p class="tipo-desc">{tipoInfo.descripcion}</p>
              {#if tipoInfo.comportamientos.imprime_al_completar}
                <span class="tipo-badge print">Imprime ticket al completar</span>
              {/if}
            </div>
          {/if}
        {/if}
      </section>

      <!-- Printer selection -->
      <section class="config-section">
        <h3>Impresora</h3>
        <p class="section-hint">Selecciona la impresora destino para esta estación.</p>

        {#if loadingImpresoras}
          <p class="loading-hint">Cargando impresoras...</p>
        {:else if impresorasDisponibles.length > 0}
          <div class="familia-grid">
            <button
              class="familia-chip imp-chip"
              class:active={!selectedImpresora}
              on:click={() => selectedImpresora = ''}
            >
              NINGUNA
            </button>
            {#each impresorasDisponibles as imp}
              <button
                class="familia-chip imp-chip"
                class:active={selectedImpresora === imp.nombre}
                class:offline={imp.estado === 'error'}
                on:click={() => selectedImpresora = imp.nombre}
              >
                {imp.nombre.toUpperCase()}
                <span class="imp-status" class:online={imp.estado === 'online'} class:error={imp.estado === 'error'}></span>
              </button>
            {/each}
          </div>

          {#if selectedImpresora}
            {@const sel = impresorasDisponibles.find(i => i.nombre === selectedImpresora)}
            {#if sel}
              <div class="tipo-info">
                <p class="tipo-desc">{sel.tipo} — {sel.transporte_tipo}{sel.metadata?.ancho ? ` — ${sel.metadata.ancho}` : ''}</p>
                <span class="tipo-badge print">{sel.estado === 'online' ? 'Online' : sel.estado}</span>
              </div>
            {/if}
          {:else}
            <div class="tipo-info">
              <p class="tipo-desc">Sin impresora configurada</p>
            </div>
          {/if}

          <!-- ESP32 bridge ID — solo si el transporte seleccionado es esp32-proxy -->
          {#if selectedImpresora}
            {@const sel = impresorasDisponibles.find(i => i.nombre === selectedImpresora)}
            {#if sel?.transporte_tipo === 'esp32-proxy'}
              <div style="margin-top: 10px;">
                <p class="section-hint">Device ID del ESP32 bridge (auto-detectado del registro).</p>
                <input
                  class="name-input full-width"
                  type="text"
                  bind:value={editEsp32DeviceId}
                  placeholder="Device ID del ESP32 (ej: cocina-1)"
                  maxlength="30"
                />
              </div>
            {/if}
          {/if}
        {:else}
          <!-- Fallback: sin periféricos registrados, input manual de ESP32 -->
          <input
            class="name-input full-width"
            type="text"
            bind:value={editEsp32DeviceId}
            placeholder="Device ID del ESP32 (ej: cocina-1)"
            maxlength="30"
          />

          {#if editEsp32DeviceId.trim()}
            <div class="tipo-info">
              <p class="tipo-desc">ESP32: {editEsp32DeviceId.trim()}</p>
              <span class="tipo-badge print">Activa</span>
            </div>
          {:else}
            <div class="tipo-info">
              <p class="tipo-desc">Sin impresora configurada</p>
            </div>
          {/if}
        {/if}
      </section>

      <!-- Connected devices -->
      {#if peerDevices.length > 0}
        <section class="config-section">
          <h3>Dispositivos conectados</h3>
          <div class="devices-list">
            {#each peerDevices as dev}
              <div class="device-row">
                <span class="dev-dot" style="background: {dev.color}"></span>
                <div class="dev-info">
                  <span class="dev-name">{dev.nombre}</span>
                  {#if dev.estacion}
                    <span class="dev-estacion">{dev.estacion}</span>
                  {/if}
                </div>
                <span class="dev-filtros">
                  {dev.tipo_estacion || 'general'}
                </span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>

    <!-- Footer -->
    <div class="panel-footer">
      <button class="btn-cancel" on:click={handleClose}>Cancelar</button>
      <button class="btn-save" on:click={handleSave} disabled={saving}>
        {saving ? 'Guardando...' : 'Aplicar'}
      </button>
    </div>
  </div>
</div>

<style>
  .config-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: flex-end;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .config-panel {
    width: 320px;
    max-width: 85vw;
    max-height: 100vh;
    height: auto;
    background: #1e293b;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.2s ease-out;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.4);
    border-radius: 16px 0 0 16px;
    margin: auto 0;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid #334155;
    flex-shrink: 0;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.8rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    transition: color 0.15s, background 0.15s;
  }

  .close-btn:active {
    background: rgba(255, 255, 255, 0.05);
    color: #f8fafc;
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 18px;
    max-height: 70vh;
  }

  .panel-body::-webkit-scrollbar {
    width: 4px;
  }
  .panel-body::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 2px;
  }

  .config-section {
    margin-bottom: 18px;
  }

  .config-section h3 {
    margin: 0 0 8px;
    font-size: 0.8rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .section-hint {
    margin: -4px 0 8px;
    font-size: 0.7rem;
    color: #64748b;
  }

  /* Device info */
  .device-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .color-badge {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 8px currentColor;
  }

  .name-input {
    flex: 1;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 8px 12px;
    color: #f8fafc;
    font-size: 0.9rem;
    font-weight: 600;
    outline: none;
    transition: border-color 0.15s;
  }

  .name-input:focus {
    border-color: #3b82f6;
  }

  .name-input::placeholder {
    color: #475569;
  }

  .name-input.full-width {
    width: 100%;
  }

  /* Family chips */
  .familia-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .familia-chip {
    padding: 8px 14px;
    border: 2px solid #334155;
    border-radius: 10px;
    background: transparent;
    color: #94a3b8;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .familia-chip:active {
    background: rgba(255, 255, 255, 0.05);
  }

  .familia-chip.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: #fff;
  }

  .familia-chip.tipo-chip.active {
    background: #8b5cf6;
    border-color: #8b5cf6;
    color: #fff;
  }

  .tipo-info {
    margin-top: 10px;
    padding: 8px 12px;
    background: #0f172a;
    border-radius: 8px;
  }

  .tipo-desc {
    margin: 0 0 6px;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .tipo-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tipo-badge.print {
    background: rgba(249, 115, 22, 0.2);
    color: #f97316;
    border: 1px solid rgba(249, 115, 22, 0.3);
  }

  /* Impresora chips */
  .imp-chip {
    position: relative;
    padding-right: 24px;
  }

  .imp-chip.offline {
    opacity: 0.5;
  }

  .imp-status {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #64748b;
  }

  .imp-status.online {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
  }

  .imp-status.error {
    background: #ef4444;
  }

  .familia-chip.imp-chip.active {
    background: #f97316;
    border-color: #f97316;
    color: #fff;
  }

  .no-familias {
    color: #475569;
    font-size: 0.8rem;
    font-style: italic;
  }

  .loading-hint {
    color: #64748b;
    font-size: 0.8rem;
    font-style: italic;
  }

  .familia-emoji {
    margin-right: 4px;
  }

  /* Connected devices list */
  .devices-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .device-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: #0f172a;
    border-radius: 8px;
  }

  .dev-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dev-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dev-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: #e2e8f0;
  }

  .dev-estacion {
    font-size: 0.65rem;
    font-weight: 700;
    color: #f97316;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .dev-filtros {
    font-size: 0.7rem;
    color: #64748b;
    text-transform: uppercase;
  }

  /* Footer */
  .panel-footer {
    display: flex;
    gap: 10px;
    padding: 12px 18px;
    border-top: 1px solid #334155;
    flex-shrink: 0;
  }

  .btn-cancel {
    flex: 1;
    padding: 10px;
    border: 1px solid #334155;
    border-radius: 10px;
    background: transparent;
    color: #94a3b8;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-cancel:active {
    background: rgba(255, 255, 255, 0.05);
  }

  .btn-save {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 10px;
    background: #3b82f6;
    color: #fff;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
  }

  .btn-save:active {
    background: #2563eb;
  }

  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Mobile */
  @media (max-width: 600px) {
    .config-panel {
      width: 100vw;
      max-width: 100vw;
      border-radius: 0;
    }

    .panel-header {
      padding: 10px 14px;
    }

    .panel-body {
      padding: 12px 14px;
    }

    .panel-footer {
      padding: 10px 14px;
    }

    .familia-chip {
      padding: 6px 10px;
      font-size: 0.75rem;
    }
  }
</style>
