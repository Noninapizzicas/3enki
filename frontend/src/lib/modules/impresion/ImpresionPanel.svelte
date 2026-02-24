<script lang="ts">
  /**
   * ImpresionPanel - Panel de comandas e impresora Bluetooth
   *
   * Tabs:
   * - Reimprimir: Formulario para reimprimir comanda manualmente
   * - Historial: Ultimas comandas impresas
   * - Config: Configuracion de transporte (rfcomm, TCP, comando)
   *
   * Migrado de vanilla JS (public/index.html + impresion.js)
   * al patron estandar del sistema (Svelte + MQTT).
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    impresionStore,
    transporteEstado,
    isConectada,
    totalComandas,
    initImpresionSubscriptions,
    loadEstado,
    loadMetrics,
    loadHistorial,
    conectarImpresora,
    reconectarImpresora,
    imprimirComanda,
    setActiveTab,
    clearResultado,
    clearError,
    type Canal,
    type ComandaItem,
    type ImpresionTab
  } from '$lib/stores/impresion';

  export let panelId: string = '';

  // ==========================================================================
  // STATE
  // ==========================================================================

  let cleanup: (() => void) | null = null;

  // Form: reimprimir
  let cuentaId = '';
  let pedidoId = '';
  let notasGenerales = '';
  let canal: Canal = 'mesa';
  let items: Array<ComandaItem & { _id: number }> = [];
  let itemCounter = 0;

  // Form: config
  let configModo: 'dispositivo' | 'tcp' | 'comando' = 'dispositivo';
  let configMac = '';
  let configDispositivo = '/dev/rfcomm0';
  let configRfcommCanal = 1;
  let configTcpHost = '127.0.0.1';
  let configTcpPuerto = 9100;
  let configComando = '';

  const canales: { id: Canal; label: string }[] = [
    { id: 'mesa', label: 'Mesa' },
    { id: 'telefono', label: 'Tel' },
    { id: 'llevar', label: 'Llevar' },
    { id: 'glovo', label: 'Glovo' }
  ];

  const modos: { id: 'dispositivo' | 'tcp' | 'comando'; label: string }[] = [
    { id: 'dispositivo', label: 'rfcomm' },
    { id: 'tcp', label: 'TCP' },
    { id: 'comando', label: 'Comando' }
  ];

  const anchos = ['58mm', '80mm'] as const;

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  $: tab = $impresionStore.activeTab;
  $: transporte = $impresionStore.transporte;
  $: moduloInfo = $impresionStore.moduloInfo;
  $: impresoraInfo = $impresionStore.impresoraInfo;
  $: metrics = $impresionStore.metrics;
  $: historial = $impresionStore.historial;
  $: loading = $impresionStore.loading;
  $: error = $impresionStore.error;
  $: resultado = $impresionStore.resultado;
  $: estado = $transporteEstado;
  $: conectada = $isConectada;
  $: total = $totalComandas;

  $: canReimprimir = cuentaId.trim().length > 0 && items.some(i => i.nombre.trim().length > 0);

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    cleanup = initImpresionSubscriptions();
    addItem(); // empezar con 1 item
  });

  onDestroy(() => {
    cleanup?.();
  });

  // ==========================================================================
  // HANDLERS - TABS
  // ==========================================================================

  function handleTabChange(newTab: ImpresionTab) {
    setActiveTab(newTab);
    if (newTab === 'historial') loadHistorial();
    if (newTab === 'config') {
      loadEstado();
      loadMetrics();
    }
  }

  // ==========================================================================
  // HANDLERS - REIMPRIMIR
  // ==========================================================================

  function addItem() {
    items = [...items, {
      _id: itemCounter++,
      nombre: '',
      cantidad: 1
    }];
  }

  function removeItem(id: number) {
    items = items.filter(i => i._id !== id);
  }

  async function handleReimprimir() {
    const validItems: ComandaItem[] = items
      .filter(i => i.nombre.trim())
      .map(({ _id, ...rest }) => {
        const item: ComandaItem = {
          nombre: rest.nombre.trim(),
          cantidad: rest.cantidad || 1
        };
        if (rest.ingredientes?.length) item.ingredientes = rest.ingredientes;
        if (rest.variaciones && Object.keys(rest.variaciones).length) item.variaciones = rest.variaciones;
        if (rest.tipo) item.tipo = rest.tipo;
        if (rest.pizza_izquierda) item.pizza_izquierda = rest.pizza_izquierda;
        if (rest.pizza_derecha) item.pizza_derecha = rest.pizza_derecha;
        if (rest.notas) item.notas = rest.notas;
        return item;
      });

    if (!cuentaId.trim()) return;
    if (validItems.length === 0) return;

    const result = await imprimirComanda(
      cuentaId.trim(),
      canal,
      validItems,
      pedidoId.trim() || undefined,
      notasGenerales.trim() || undefined
    );

    if (result) {
      // Limpiar formulario tras exito
      cuentaId = '';
      pedidoId = '';
      notasGenerales = '';
      items = [];
      itemCounter = 0;
      addItem();
    }
  }

  // ==========================================================================
  // HANDLERS - CONFIG
  // ==========================================================================

  async function handleGuardarConfig() {
    const params: Record<string, unknown> = { modo: configModo };

    if (configModo === 'dispositivo') {
      if (configMac) params.mac = configMac;
      if (configDispositivo) params.dispositivo = configDispositivo;
      params.rfcomm_canal = configRfcommCanal;
    } else if (configModo === 'tcp') {
      params.tcp_host = configTcpHost || '127.0.0.1';
      params.tcp_puerto = configTcpPuerto || 9100;
    } else if (configModo === 'comando') {
      if (!configComando) return;
      params.comando = configComando;
    }

    await conectarImpresora(params as any);
  }

  async function handleReconectar() {
    await reconectarImpresora();
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  function getStatusDotClass(est: string): string {
    if (est === 'conectado') return 'dot-ok';
    if (est === 'error') return 'dot-err';
    return 'dot-off';
  }

  function getStatusLabel(est: string): string {
    if (est === 'conectado') return 'Conectada';
    if (est === 'error') return 'Error';
    if (est === 'conectando') return 'Conectando...';
    return 'Desconectada';
  }

  function formatHora(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '-';
    }
  }

  function parseIngredientes(raw: string): string[] {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
</script>

<div class="impresion-panel">
  <!-- Header: estado de impresora -->
  <div class="panel-header">
    <div class="header-left">
      <button class="status-indicator" on:click={handleReconectar} title="Clic para reconectar">
        <span class="status-dot {getStatusDotClass(estado)}"></span>
        <span class="status-label">{getStatusLabel(estado)}</span>
      </button>
    </div>
    <div class="tabs">
      <button
        class="tab"
        class:active={tab === 'reimprimir'}
        on:click={() => handleTabChange('reimprimir')}
      >
        Reimprimir
      </button>
      <button
        class="tab"
        class:active={tab === 'historial'}
        on:click={() => handleTabChange('historial')}
      >
        Historial
      </button>
      <button
        class="tab"
        class:active={tab === 'config'}
        on:click={() => handleTabChange('config')}
      >
        Config
      </button>
    </div>
  </div>

  <!-- Content -->
  <div class="panel-content">

    <!-- ================================================================== -->
    <!-- TAB: REIMPRIMIR -->
    <!-- ================================================================== -->
    {#if tab === 'reimprimir'}
      <div class="form-section">
        <label class="form-label">
          <span>Mesa / Referencia</span>
          <input
            type="text"
            class="input"
            bind:value={cuentaId}
            placeholder="mesa_5, tel_123..."
          />
        </label>

        <label class="form-label">
          <span>Pedido ID <span class="optional">(opcional)</span></span>
          <input
            type="text"
            class="input"
            bind:value={pedidoId}
            placeholder="pedido_1234"
          />
        </label>

        <!-- Canal -->
        <div class="form-label">
          <span>Canal</span>
          <div class="chip-group">
            {#each canales as c}
              <button
                class="chip"
                class:active={canal === c.id}
                on:click={() => canal = c.id}
              >
                {c.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Items -->
        <div class="form-label">
          <div class="label-row">
            <span>Items</span>
            <button class="btn-small" on:click={addItem}>+ Item</button>
          </div>
          <div class="items-list">
            {#each items as item (item._id)}
              <div class="item-card">
                <div class="item-row">
                  <input
                    type="number"
                    class="input input-qty"
                    bind:value={item.cantidad}
                    min="1"
                    placeholder="x"
                  />
                  <input
                    type="text"
                    class="input input-name"
                    bind:value={item.nombre}
                    placeholder="Nombre producto"
                  />
                  <button class="btn-remove" on:click={() => removeItem(item._id)}>X</button>
                </div>
                <div class="item-extras">
                  <input
                    type="text"
                    class="input"
                    placeholder="Ingredientes: jamon, queso..."
                    on:blur={(e) => {
                      const val = e.currentTarget.value;
                      if (val) item.ingredientes = parseIngredientes(val);
                    }}
                  />
                  <div class="item-row-sm">
                    <input
                      type="text"
                      class="input"
                      placeholder="SIN: cebolla..."
                      on:blur={(e) => {
                        const val = e.currentTarget.value;
                        if (val) {
                          item.variaciones = { ...item.variaciones, ingredientes_quitar: parseIngredientes(val) };
                        }
                      }}
                    />
                    <input
                      type="text"
                      class="input"
                      placeholder="CON: extra queso..."
                      on:blur={(e) => {
                        const val = e.currentTarget.value;
                        if (val) {
                          item.variaciones = { ...item.variaciones, ingredientes_anadir: parseIngredientes(val) };
                        }
                      }}
                    />
                  </div>
                  <div class="item-row-sm">
                    <input
                      type="text"
                      class="input"
                      placeholder="Mitad IZQ (opc)"
                      on:blur={(e) => {
                        const val = e.currentTarget.value;
                        if (val) { item.tipo = 'mitad-mitad'; item.pizza_izquierda = val; }
                      }}
                    />
                    <input
                      type="text"
                      class="input"
                      placeholder="Mitad DER (opc)"
                      on:blur={(e) => {
                        const val = e.currentTarget.value;
                        if (val) { item.tipo = 'mitad-mitad'; item.pizza_derecha = val; }
                      }}
                    />
                  </div>
                  <input
                    type="text"
                    class="input"
                    placeholder="Notas: bien hecha, sin sal..."
                    on:blur={(e) => { item.notas = e.currentTarget.value || undefined; }}
                  />
                </div>
              </div>
            {/each}
          </div>
        </div>

        <label class="form-label">
          <span>Notas generales <span class="optional">(opcional)</span></span>
          <textarea
            class="input"
            bind:value={notasGenerales}
            placeholder="Notas para cocina..."
            rows="2"
          ></textarea>
        </label>

        <button
          class="btn primary btn-print"
          on:click={handleReimprimir}
          disabled={!canReimprimir || loading}
        >
          Imprimir Comanda
        </button>
      </div>

    <!-- ================================================================== -->
    <!-- TAB: HISTORIAL -->
    <!-- ================================================================== -->
    {:else if tab === 'historial'}
      <div class="historial-section">
        <div class="section-header">
          <span class="section-count">{historial.length} de {$impresionStore.historialTotal}</span>
          <button class="btn-small" on:click={() => loadHistorial()}>Actualizar</button>
        </div>

        {#if loading && historial.length === 0}
          <div class="empty-state">
            <span class="spinner">...</span>
            <span>Cargando historial...</span>
          </div>
        {:else if historial.length === 0}
          <div class="empty-state">
            <span class="empty-icon">🖨️</span>
            <span>No hay comandas todavia</span>
          </div>
        {:else}
          <div class="historial-list">
            {#each historial as comanda (comanda.comanda_id)}
              <div class="historial-item">
                <div class="hist-main">
                  <span class="hist-hora">{formatHora(comanda.generada_at)}</span>
                  <span class="hist-ref">{comanda.cuenta_id || comanda.pedido_id || '-'}</span>
                  {#if comanda.reimpresion}
                    <span class="tag tag-re">RE</span>
                  {/if}
                  <span class="hist-items">{comanda.items_count} items</span>
                </div>
                <span class="hist-id">{comanda.comanda_id || ''}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    <!-- ================================================================== -->
    <!-- TAB: CONFIG -->
    <!-- ================================================================== -->
    {:else if tab === 'config'}
      <div class="config-section">
        <!-- Modo de conexion -->
        <div class="form-label">
          <span>Modo de conexion</span>
          <div class="chip-group">
            {#each modos as m}
              <button
                class="chip"
                class:active={configModo === m.id}
                on:click={() => configModo = m.id}
              >
                {m.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Config rfcomm -->
        {#if configModo === 'dispositivo'}
          <label class="form-label">
            <span>MAC Bluetooth</span>
            <input type="text" class="input mono" bind:value={configMac} placeholder="AA:BB:CC:DD:EE:FF" />
          </label>
          <label class="form-label">
            <span>Dispositivo</span>
            <input type="text" class="input mono" bind:value={configDispositivo} />
          </label>
          <label class="form-label">
            <span>Canal RFCOMM</span>
            <input type="number" class="input" bind:value={configRfcommCanal} min="1" max="30" />
          </label>
        {/if}

        <!-- Config TCP -->
        {#if configModo === 'tcp'}
          <label class="form-label">
            <span>Host</span>
            <input type="text" class="input mono" bind:value={configTcpHost} />
          </label>
          <label class="form-label">
            <span>Puerto</span>
            <input type="number" class="input" bind:value={configTcpPuerto} />
          </label>
        {/if}

        <!-- Config Comando -->
        {#if configModo === 'comando'}
          <label class="form-label">
            <span>Comando shell</span>
            <input type="text" class="input mono" bind:value={configComando} placeholder="cat > /dev/rfcomm0" />
          </label>
        {/if}

        <button
          class="btn primary"
          on:click={handleGuardarConfig}
          disabled={loading}
        >
          Conectar Impresora
        </button>

        <!-- Estado detallado -->
        <div class="estado-detalle">
          <div class="section-title">Estado Actual</div>
          <div class="info-grid">
            <div class="info-row">
              <span class="info-label">Estado</span>
              <span class="info-value">{transporte?.estado || '-'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Modo</span>
              <span class="info-value">{transporte?.modo || '-'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">MAC</span>
              <span class="info-value mono">{transporte?.mac || '-'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Dispositivo</span>
              <span class="info-value mono">{transporte?.dispositivo || '-'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Comandas</span>
              <span class="info-value">{total}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Errores</span>
              <span class="info-value">{metrics?.errores || 0}</span>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Resultado / Error bar -->
  {#if resultado}
    <div class="result-bar result-{resultado.type}">
      <span>{resultado.message}</span>
      <button class="close-btn" on:click={clearResultado}>X</button>
    </div>
  {/if}
  {#if error}
    <div class="error-bar">
      <span>{error}</span>
      <button class="close-btn" on:click={clearError}>X</button>
    </div>
  {/if}
</div>

<style>
  .impresion-panel {
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
    gap: 0.5rem;
  }

  .header-left {
    flex-shrink: 0;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .status-indicator:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-ok { background: #22c55e; box-shadow: 0 0 4px #22c55e; }
  .dot-err { background: #ef4444; box-shadow: 0 0 4px #ef4444; }
  .dot-off { background: #666; }

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

  .tab:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--color-text, #e5e5e5);
  }

  .tab.active {
    background: var(--color-primary, #3b82f6);
    color: white;
  }

  /* ===== CONTENT ===== */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  /* ===== FORMS ===== */
  .form-section,
  .config-section {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .form-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .form-label > span {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
    font-weight: 500;
  }

  .optional {
    font-weight: 400;
    opacity: 0.6;
  }

  .label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .input {
    padding: 0.375rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
    width: 100%;
    box-sizing: border-box;
  }

  .input:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .input.mono {
    font-family: monospace;
  }

  textarea.input {
    resize: vertical;
  }

  /* ===== CHIPS ===== */
  .chip-group {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .chip {
    padding: 0.3rem 0.6rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text-muted, #888);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .chip:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--color-text, #e5e5e5);
  }

  .chip.active {
    background: var(--color-primary, #3b82f6);
    border-color: var(--color-primary, #3b82f6);
    color: white;
  }

  /* ===== ITEMS ===== */
  .items-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .item-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    border-radius: 0.375rem;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .item-row {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .input-qty {
    width: 3rem;
    flex-shrink: 0;
    text-align: center;
  }

  .input-name {
    flex: 1;
  }

  .item-extras {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .item-row-sm {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
  }

  .btn-remove {
    padding: 0.25rem 0.5rem;
    background: rgba(239, 68, 68, 0.15);
    border: none;
    border-radius: 0.25rem;
    color: var(--color-error, #ef4444);
    font-size: 0.75rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .btn-remove:hover {
    background: rgba(239, 68, 68, 0.3);
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

  .btn.primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-print {
    margin-top: 0.25rem;
  }

  .btn-small {
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.25rem;
    color: var(--color-text-muted, #888);
    font-size: 0.7rem;
    cursor: pointer;
  }

  .btn-small:hover {
    background: rgba(255, 255, 255, 0.12);
    color: var(--color-text, #e5e5e5);
  }

  /* ===== HISTORIAL ===== */
  .historial-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-count {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }

  .historial-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .historial-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    border-radius: 0.375rem;
  }

  .hist-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hist-hora {
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
    font-family: monospace;
  }

  .hist-ref {
    font-size: 0.8rem;
    font-weight: 500;
  }

  .hist-items {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }

  .hist-id {
    font-size: 0.65rem;
    color: var(--color-text-muted, #888);
    font-family: monospace;
  }

  .tag {
    padding: 0.1rem 0.3rem;
    border-radius: 0.2rem;
    font-size: 0.6rem;
    font-weight: 600;
  }

  .tag-re {
    background: rgba(249, 115, 22, 0.2);
    color: #f97316;
  }

  /* ===== CONFIG - ESTADO ===== */
  .estado-detalle {
    margin-top: 0.75rem;
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
    gap: 0.25rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.2rem 0;
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

  /* ===== EMPTY & LOADING ===== */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    text-align: center;
    color: var(--color-text-muted, #888);
  }

  .empty-icon {
    font-size: 2rem;
    opacity: 0.5;
  }

  .spinner {
    font-size: 1rem;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* ===== RESULT / ERROR BARS ===== */
  .result-bar,
  .error-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    font-size: 0.75rem;
  }

  .result-ok {
    background: rgba(34, 197, 94, 0.15);
    border-top: 1px solid rgba(34, 197, 94, 0.3);
    color: var(--color-success, #22c55e);
  }

  .result-error,
  .error-bar {
    background: rgba(239, 68, 68, 0.15);
    border-top: 1px solid rgba(239, 68, 68, 0.3);
    color: var(--color-error, #ef4444);
  }

  .result-info {
    background: rgba(59, 130, 246, 0.15);
    border-top: 1px solid rgba(59, 130, 246, 0.3);
    color: var(--color-primary, #3b82f6);
  }

  .close-btn {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0.25rem;
    font-size: 0.7rem;
  }
</style>
