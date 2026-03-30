<script lang="ts">
  /**
   * ImpresorasTab — Printer management with connection chain diagnostics and onboarding wizard.
   *
   * Shows each printer with its full connection chain:
   *   Sistema → MQTT → ESP32 → BLE → Impresora
   *
   * Includes an onboarding wizard for setting up new printers via ESP32.
   */
  import {
    dispositivosStore, impresoras, impresorasOnline,
    loadPerifericos, getPerifericoStatus, testPeriferico,
    discoverPerifericos, deletePeriferico, registerPeriferico,
    buildPrinterChain, setOnboardingStep,
    type Periferico, type ChainNode, type OnboardingStep
  } from '$lib/stores/dispositivos';

  // ---------- State ----------
  let selectedPrinter: string | null = null;
  let selectedDetail: any = null;
  let detailLoading = false;
  let testResult: { ok: boolean; msg: string } | null = null;
  let testRunning = false;
  let showWizard = false;

  // Wizard state
  let wizStep: OnboardingStep = 'idle';
  let wizDevices: any[] = [];
  let wizScanning = false;
  let wizSelectedEsp32: string = '';
  let wizPrinterName: string = '';
  let wizTestOk = false;
  let wizTestRunning = false;

  // ---------- Reactivity ----------
  $: printers = $impresoras;
  $: onlineCount = $impresorasOnline.length;
  $: devices = $dispositivosStore.devices;

  // ---------- Actions ----------
  async function selectPrinter(p: Periferico) {
    selectedPrinter = p.nombre;
    testResult = null;
    detailLoading = true;
    selectedDetail = await getPerifericoStatus(p.nombre);
    detailLoading = false;
  }

  function closePrinterDetail() {
    selectedPrinter = null;
    selectedDetail = null;
    testResult = null;
  }

  async function runTest(nombre: string) {
    testRunning = true;
    testResult = null;
    const ok = await testPeriferico(nombre);
    testResult = { ok, msg: ok ? 'Impresion de prueba enviada' : 'Error al enviar' };
    testRunning = false;
  }

  async function handleDelete(nombre: string) {
    if (confirm(`Eliminar impresora "${nombre}"?`)) {
      await deletePeriferico(nombre);
      closePrinterDetail();
    }
  }

  function getChain(p: Periferico): ChainNode[] {
    return buildPrinterChain(p, devices);
  }

  function chainStatusIcon(status: string): string {
    switch (status) {
      case 'ok': return '✅';
      case 'error': return '❌';
      case 'loading': return '⏳';
      default: return '❔';
    }
  }

  function chainHasError(chain: ChainNode[]): boolean {
    return chain.some(n => n.status === 'error');
  }

  function firstErrorNode(chain: ChainNode[]): ChainNode | null {
    return chain.find(n => n.status === 'error') || null;
  }

  // ---------- Wizard ----------
  function startWizard() {
    showWizard = true;
    wizStep = 'flash';
    wizDevices = [];
    wizSelectedEsp32 = '';
    wizPrinterName = '';
    wizTestOk = false;
  }

  function closeWizard() {
    showWizard = false;
    wizStep = 'idle';
    setOnboardingStep('idle');
  }

  async function wizScanDevices() {
    wizScanning = true;
    wizDevices = await discoverPerifericos();
    wizScanning = false;
    if (wizDevices.length === 0) {
      // Also check device registry for ESP32s that haven't registered as perifericos yet
      wizDevices = devices
        .filter(d => d.state === 'online' && (d.type === 'unknown' || d.type === 'impresora-termica' || d.type === 'print-proxy'))
        .map(d => ({
          nombre: d.name || d.device_id,
          device_id: d.device_id,
          tipo: d.type,
          estado: d.state,
          metadata: d.metadata
        }));
    }
  }

  async function wizSelectAndPair(deviceId: string) {
    wizSelectedEsp32 = deviceId;
    wizStep = 'pair';
    // ESP32 auto-discovery should handle pairing via MQTT
    // The ESP32 firmware (print-proxy) handles BLE scanning internally
    // We wait for it to appear as a periferico
    await loadPerifericos();
  }

  async function wizRunTest() {
    if (!wizSelectedEsp32) return;
    wizTestRunning = true;
    wizTestOk = await testPeriferico(wizSelectedEsp32);
    wizTestRunning = false;
    if (wizTestOk) wizStep = 'name';
  }

  async function wizFinish() {
    if (!wizPrinterName || !wizSelectedEsp32) return;
    // Update the periferico name if needed
    // The device was auto-registered, we just need to update its name
    const existing = printers.find(p => p.nombre === wizSelectedEsp32);
    if (!existing) {
      // Register as new periferico
      await registerPeriferico({
        nombre: wizPrinterName,
        tipo: 'impresora-termica',
        capacidades: ['imprimir', 'cortar-papel'],
        transporte: {
          tipo: 'esp32-proxy',
          config: { esp32_device_id: wizSelectedEsp32 }
        }
      });
    }
    wizStep = 'done';
    await loadPerifericos();
  }
</script>

<div class="impresoras-tab">
  {#if showWizard}
    <!-- ========== ONBOARDING WIZARD ========== -->
    <div class="wizard">
      <div class="wizard-header">
        <span class="wizard-title">Configurar impresora</span>
        <button class="wizard-close" on:click={closeWizard}>✕</button>
      </div>

      <!-- Steps indicator -->
      <div class="wizard-steps">
        {#each ['flash', 'connect', 'pair', 'test', 'name', 'done'] as step, i}
          <div class="step-dot"
            class:active={step === wizStep}
            class:completed={['flash','connect','pair','test','name','done'].indexOf(wizStep) > i}
          >{i + 1}</div>
          {#if i < 5}<div class="step-line" class:completed={['flash','connect','pair','test','name','done'].indexOf(wizStep) > i}></div>{/if}
        {/each}
      </div>

      <div class="wizard-body">
        {#if wizStep === 'flash'}
          <div class="wiz-section">
            <h3>1. Preparar ESP32</h3>
            <p class="wiz-desc">
              El ESP32 actua como puente entre el sistema y la impresora Bluetooth.
              Necesitas un ESP32 flasheado con el firmware <strong>gateway-printer</strong>.
            </p>
            <div class="wiz-options">
              <button class="wiz-btn primary" on:click={() => { wizStep = 'connect'; }}>
                Ya tengo un ESP32 listo
              </button>
              <p class="wiz-hint">
                Si no tienes uno preparado, ve al panel <strong>ESP32 → Dev → Templates</strong>
                y usa la plantilla <em>gateway-printer</em>, luego flashea via <strong>ESP32 → Flash</strong>.
              </p>
            </div>
          </div>

        {:else if wizStep === 'connect'}
          <div class="wiz-section">
            <h3>2. Conectar ESP32</h3>
            <p class="wiz-desc">
              Enciende el ESP32 y espera a que se conecte al WiFi y aparezca en el sistema.
            </p>
            <button class="wiz-btn" on:click={wizScanDevices} disabled={wizScanning}>
              {wizScanning ? 'Buscando...' : 'Buscar dispositivos'}
            </button>

            {#if wizDevices.length > 0}
              <div class="wiz-device-list">
                {#each wizDevices as dev}
                  <button class="wiz-device-card" on:click={() => wizSelectAndPair(dev.device_id || dev.nombre)}>
                    <span class="wiz-dev-icon">📟</span>
                    <div class="wiz-dev-info">
                      <span class="wiz-dev-name">{dev.nombre || dev.device_id}</span>
                      <span class="wiz-dev-meta">
                        {dev.metadata?.ip || ''} {dev.metadata?.firmware || ''}
                      </span>
                    </div>
                    <span class="wiz-dev-state" class:online={dev.estado === 'online'}>
                      {dev.estado || '?'}
                    </span>
                  </button>
                {/each}
              </div>
            {:else if !wizScanning}
              <p class="wiz-hint">
                No se encontraron dispositivos. Asegurate de que el ESP32 esta encendido
                y conectado a la misma red WiFi.
              </p>
            {/if}
          </div>

        {:else if wizStep === 'pair'}
          <div class="wiz-section">
            <h3>3. Emparejar impresora</h3>
            <p class="wiz-desc">
              ESP32 <strong>{wizSelectedEsp32}</strong> seleccionado.
              El firmware del ESP32 escanea impresoras BLE automaticamente.
              Enciende la impresora y espera a que se conecte.
            </p>
            <div class="wiz-pairing">
              <div class="pairing-animation">
                <span>📟</span>
                <span class="pairing-dots">···</span>
                <span>🖨</span>
              </div>
              <p class="wiz-hint">
                El ESP32 publicara su estado cuando detecte la impresora.
              </p>
            </div>
            <button class="wiz-btn" on:click={() => { wizStep = 'test'; }}>
              La impresora esta encendida, continuar
            </button>
          </div>

        {:else if wizStep === 'test'}
          <div class="wiz-section">
            <h3>4. Test de impresion</h3>
            <p class="wiz-desc">
              Vamos a enviar una impresion de prueba para verificar que todo funciona.
            </p>
            <button class="wiz-btn primary" on:click={wizRunTest} disabled={wizTestRunning}>
              {wizTestRunning ? 'Enviando...' : 'Imprimir test'}
            </button>
            {#if wizTestOk}
              <p class="wiz-success">Impresion enviada correctamente</p>
            {:else if wizTestOk === false && !wizTestRunning}
              <p class="wiz-error">
                No se pudo imprimir. Verifica que la impresora esta encendida y emparejada con el ESP32.
              </p>
              <button class="wiz-btn" on:click={wizRunTest}>Reintentar</button>
            {/if}
          </div>

        {:else if wizStep === 'name'}
          <div class="wiz-section">
            <h3>5. Nombrar impresora</h3>
            <p class="wiz-desc">
              Dale un nombre logico para identificarla facilmente (ej: Cocina-01, Barra-02).
            </p>
            <input
              type="text"
              class="wiz-input"
              placeholder="Nombre de la impresora..."
              bind:value={wizPrinterName}
              on:keydown={(e) => e.key === 'Enter' && wizFinish()}
            />
            <button class="wiz-btn primary" on:click={wizFinish} disabled={!wizPrinterName.trim()}>
              Guardar y finalizar
            </button>
          </div>

        {:else if wizStep === 'done'}
          <div class="wiz-section wiz-done">
            <span class="done-icon">✅</span>
            <h3>Impresora configurada</h3>
            <p class="wiz-desc">
              <strong>{wizPrinterName || wizSelectedEsp32}</strong> esta lista para usar.
            </p>
            <button class="wiz-btn" on:click={closeWizard}>Cerrar</button>
          </div>
        {/if}
      </div>
    </div>

  {:else if selectedPrinter}
    <!-- ========== PRINTER DETAIL ========== -->
    {@const printer = printers.find(p => p.nombre === selectedPrinter)}
    {#if printer}
      {@const chain = getChain(printer)}
      <div class="detail">
        <button class="detail-back" on:click={closePrinterDetail}>← Volver</button>

        <div class="detail-header">
          <span class="detail-icon">🖨</span>
          <div class="detail-title">
            <span class="detail-name">{printer.nombre}</span>
            <span class="detail-type">{printer.tipo}</span>
          </div>
          <span class="detail-state" style="color: {printer.estado === 'online' ? '#22c55e' : '#ef4444'}">
            ● {printer.estado}
          </span>
        </div>

        <!-- Connection Chain (detailed view) -->
        <div class="chain-detail">
          <h4>Cadena de conexion</h4>
          <div class="chain-vertical">
            {#each chain as node, i}
              <div class="chain-node-row">
                <span class="chain-status">{chainStatusIcon(node.status)}</span>
                <div class="chain-info">
                  <span class="chain-label">{node.label}</span>
                  {#if node.detail}
                    <span class="chain-detail-text">{node.detail}</span>
                  {/if}
                </div>
              </div>
              {#if i < chain.length - 1}
                <div class="chain-connector" class:error={chain[i + 1].status === 'error'}></div>
              {/if}
            {/each}
          </div>
        </div>

        <!-- Metadata -->
        {#if selectedDetail}
          <div class="detail-section">
            <h4>Detalles</h4>
            <div class="detail-grid">
              <span class="detail-key">Transporte</span>
              <span class="detail-val">{selectedDetail.transporte?.tipo || printer.transporte_tipo}</span>
              <span class="detail-key">Conectado</span>
              <span class="detail-val">{selectedDetail.transporte?.conectado ? 'Si' : 'No'}</span>
              {#if printer.metadata?.ip}
                <span class="detail-key">IP</span>
                <span class="detail-val">{printer.metadata.ip}</span>
              {/if}
              {#if printer.metadata?.firmware}
                <span class="detail-key">Firmware</span>
                <span class="detail-val">{printer.metadata.firmware}</span>
              {/if}
              {#if printer.metadata?.printer_name}
                <span class="detail-key">Modelo</span>
                <span class="detail-val">{printer.metadata.printer_name}</span>
              {/if}
              {#if printer.metadata?.printer_addr}
                <span class="detail-key">BLE MAC</span>
                <span class="detail-val font-mono">{printer.metadata.printer_addr}</span>
              {/if}
            </div>
          </div>
        {:else if detailLoading}
          <p class="loading-text">Cargando detalles...</p>
        {/if}

        <!-- Actions -->
        <div class="detail-actions">
          <button class="action-btn test" on:click={() => runTest(printer.nombre)} disabled={testRunning}>
            {testRunning ? 'Enviando...' : 'Test impresion'}
          </button>
          <button class="action-btn danger" on:click={() => handleDelete(printer.nombre)}>
            Eliminar
          </button>
        </div>

        {#if testResult}
          <div class="test-result" class:ok={testResult.ok} class:err={!testResult.ok}>
            {testResult.ok ? '✅' : '❌'} {testResult.msg}
          </div>
        {/if}
      </div>
    {/if}

  {:else}
    <!-- ========== PRINTER LIST ========== -->
    <div class="list-header">
      <div class="list-stats">
        <span class="stat-pill">🖨 {printers.length} impresora{printers.length !== 1 ? 's' : ''}</span>
        <span class="stat-pill online">{onlineCount} online</span>
      </div>
      <button class="add-btn" on:click={startWizard}>+ Añadir</button>
    </div>

    {#if printers.length === 0}
      <div class="empty">
        <span class="empty-icon">🖨</span>
        <span class="empty-text">No hay impresoras registradas</span>
        <button class="empty-btn" on:click={startWizard}>Configurar primera impresora</button>
      </div>
    {:else}
      <div class="printer-list">
        {#each printers as printer (printer.nombre)}
          {@const chain = getChain(printer)}
          {@const hasError = chainHasError(chain)}
          {@const errorNode = firstErrorNode(chain)}
          <button
            class="printer-card"
            class:has-error={hasError}
            on:click={() => selectPrinter(printer)}
          >
            <div class="card-top">
              <span class="card-icon">🖨</span>
              <span class="card-state" style="color: {printer.estado === 'online' ? '#22c55e' : '#ef4444'}">
                ● {printer.estado}
              </span>
            </div>
            <span class="card-name">{printer.nombre}</span>
            {#if printer.metadata?.printer_name}
              <span class="card-model">{printer.metadata.printer_name}</span>
            {/if}

            <!-- Connection Chain (compact) -->
            <div class="chain-compact">
              {#each chain as node, i}
                <span class="chain-dot" class:ok={node.status === 'ok'} class:err={node.status === 'error'} class:unknown={node.status === 'unknown'} title="{node.label}: {node.detail || node.status}">
                </span>
                {#if i < chain.length - 1}
                  <span class="chain-line" class:err={chain[i + 1].status === 'error' || chain[i + 1].status === 'unknown'}></span>
                {/if}
              {/each}
            </div>
            <div class="chain-labels">
              {#each chain as node}
                <span class="chain-lbl">{node.label}</span>
              {/each}
            </div>

            {#if hasError && errorNode}
              <span class="card-error">Corte en {errorNode.label}{errorNode.detail ? ': ' + errorNode.detail : ''}</span>
            {/if}

            <span class="card-transport">{printer.transporte_tipo}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .impresoras-tab { display: flex; flex-direction: column; gap: 12px; }

  /* ---------- List Header ---------- */
  .list-header { display: flex; justify-content: space-between; align-items: center; }
  .list-stats { display: flex; gap: 8px; }
  .stat-pill {
    padding: 4px 10px;
    background: #151515;
    border: 1px solid #222;
    border-radius: 16px;
    font-size: 0.7rem;
    color: #999;
  }
  .stat-pill.online { color: #22c55e; border-color: rgba(34, 197, 94, 0.3); }
  .add-btn {
    padding: 6px 14px;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    color: #f59e0b;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .add-btn:hover { background: rgba(245, 158, 11, 0.25); }

  /* ---------- Printer Cards ---------- */
  .printer-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }
  .printer-card {
    display: flex;
    flex-direction: column;
    padding: 14px;
    background: #151515;
    border: 1px solid #222;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    color: inherit;
    font: inherit;
    gap: 4px;
  }
  .printer-card:hover { border-color: #333; background: #1a1a1a; }
  .printer-card.has-error { border-color: rgba(239, 68, 68, 0.3); }

  .card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .card-icon { font-size: 1.3rem; }
  .card-state { font-size: 0.7rem; font-weight: 600; }
  .card-name { font-size: 0.85rem; font-weight: 600; color: #f8fafc; }
  .card-model { font-size: 0.65rem; color: #666; }
  .card-transport {
    font-size: 0.6rem;
    color: #555;
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 4px;
    width: fit-content;
    margin-top: 4px;
  }
  .card-error {
    font-size: 0.65rem;
    color: #ef4444;
    margin-top: 2px;
  }

  /* ---------- Chain (compact in card) ---------- */
  .chain-compact {
    display: flex;
    align-items: center;
    gap: 0;
    margin-top: 8px;
    padding: 6px 0;
  }
  .chain-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #333;
  }
  .chain-dot.ok { background: #22c55e; box-shadow: 0 0 4px rgba(34, 197, 94, 0.4); }
  .chain-dot.err { background: #ef4444; box-shadow: 0 0 4px rgba(239, 68, 68, 0.4); }
  .chain-dot.unknown { background: #666; }
  .chain-line {
    flex: 1;
    height: 2px;
    background: #22c55e;
    min-width: 8px;
  }
  .chain-line.err { background: #444; }
  .chain-labels {
    display: flex;
    justify-content: space-between;
    padding: 0 1px;
  }
  .chain-lbl { font-size: 0.5rem; color: #555; }

  /* ---------- Detail View ---------- */
  .detail { display: flex; flex-direction: column; gap: 16px; }
  .detail-back {
    background: none;
    border: none;
    color: #888;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0;
    text-align: left;
    width: fit-content;
  }
  .detail-back:hover { color: #ccc; }

  .detail-header { display: flex; align-items: center; gap: 12px; }
  .detail-icon { font-size: 2rem; }
  .detail-title { flex: 1; display: flex; flex-direction: column; }
  .detail-name { font-size: 1.1rem; font-weight: 700; color: #f8fafc; }
  .detail-type { font-size: 0.7rem; color: #666; }
  .detail-state { font-size: 0.85rem; font-weight: 600; }

  /* Chain vertical */
  .chain-detail {
    background: #111;
    border: 1px solid #222;
    border-radius: 10px;
    padding: 14px;
  }
  .chain-detail h4 { font-size: 0.75rem; color: #888; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px; }
  .chain-vertical { display: flex; flex-direction: column; }
  .chain-node-row { display: flex; align-items: center; gap: 10px; }
  .chain-status { font-size: 0.9rem; }
  .chain-info { display: flex; flex-direction: column; }
  .chain-label { font-size: 0.8rem; font-weight: 600; color: #e5e5e5; }
  .chain-detail-text { font-size: 0.65rem; color: #666; }
  .chain-connector {
    width: 2px;
    height: 16px;
    background: #22c55e;
    margin-left: 9px;
  }
  .chain-connector.error { background: #ef4444; }

  /* Detail section */
  .detail-section {
    background: #111;
    border: 1px solid #222;
    border-radius: 10px;
    padding: 14px;
  }
  .detail-section h4 { font-size: 0.75rem; color: #888; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px; }
  .detail-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    font-size: 0.75rem;
  }
  .detail-key { color: #666; }
  .detail-val { color: #ccc; }
  .font-mono { font-family: 'SF Mono', monospace; font-size: 0.7rem; }

  .loading-text { font-size: 0.75rem; color: #555; }

  /* Actions */
  .detail-actions { display: flex; gap: 8px; }
  .action-btn {
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid #333;
    background: #1a1a1a;
    color: #ccc;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .action-btn:hover { background: #222; }
  .action-btn.test { border-color: rgba(34, 197, 94, 0.3); color: #22c55e; }
  .action-btn.test:hover { background: rgba(34, 197, 94, 0.1); }
  .action-btn.danger { border-color: rgba(239, 68, 68, 0.3); color: #ef4444; }
  .action-btn.danger:hover { background: rgba(239, 68, 68, 0.1); }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .test-result {
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.75rem;
  }
  .test-result.ok { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
  .test-result.err { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

  /* ---------- Wizard ---------- */
  .wizard {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .wizard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid #222;
  }
  .wizard-title { font-size: 0.9rem; font-weight: 700; color: #f8fafc; }
  .wizard-close {
    background: none;
    border: none;
    color: #666;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 4px;
  }
  .wizard-close:hover { color: #ccc; }

  /* Steps indicator */
  .wizard-steps {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 0;
    gap: 0;
  }
  .step-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #222;
    color: #555;
    font-size: 0.65rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s;
  }
  .step-dot.active { background: #f59e0b; color: #000; }
  .step-dot.completed { background: #22c55e; color: #fff; }
  .step-line {
    width: 24px;
    height: 2px;
    background: #222;
    transition: background 0.2s;
  }
  .step-line.completed { background: #22c55e; }

  .wizard-body { padding-top: 8px; }

  .wiz-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .wiz-section h3 { font-size: 0.85rem; font-weight: 700; color: #f8fafc; margin: 0; }
  .wiz-desc { font-size: 0.75rem; color: #999; line-height: 1.5; margin: 0; }
  .wiz-hint { font-size: 0.7rem; color: #666; line-height: 1.4; margin: 0; }
  .wiz-success { font-size: 0.75rem; color: #22c55e; margin: 0; }
  .wiz-error { font-size: 0.75rem; color: #ef4444; margin: 0; }

  .wiz-options { display: flex; flex-direction: column; gap: 10px; }

  .wiz-btn {
    padding: 10px 18px;
    border-radius: 8px;
    border: 1px solid #333;
    background: #1a1a1a;
    color: #ccc;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    width: fit-content;
  }
  .wiz-btn:hover { background: #222; }
  .wiz-btn.primary { background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.4); color: #f59e0b; }
  .wiz-btn.primary:hover { background: rgba(245, 158, 11, 0.25); }
  .wiz-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .wiz-input {
    padding: 10px 14px;
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    color: #e5e5e5;
    font-size: 0.8rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .wiz-input:focus { border-color: #f59e0b; }

  /* Wizard device list */
  .wiz-device-list { display: flex; flex-direction: column; gap: 6px; }
  .wiz-device-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: #151515;
    border: 1px solid #222;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
    color: inherit;
    font: inherit;
    text-align: left;
  }
  .wiz-device-card:hover { border-color: #f59e0b; background: #1a1a1a; }
  .wiz-dev-icon { font-size: 1.1rem; }
  .wiz-dev-info { flex: 1; display: flex; flex-direction: column; }
  .wiz-dev-name { font-size: 0.8rem; font-weight: 600; color: #f8fafc; }
  .wiz-dev-meta { font-size: 0.65rem; color: #666; }
  .wiz-dev-state { font-size: 0.65rem; font-weight: 600; color: #666; }
  .wiz-dev-state.online { color: #22c55e; }

  /* Pairing animation */
  .wiz-pairing { display: flex; justify-content: center; padding: 20px 0; }
  .pairing-animation {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 2rem;
  }
  .pairing-dots {
    font-size: 1.5rem;
    color: #f59e0b;
    animation: blink 1.2s infinite;
  }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }

  .wiz-done {
    align-items: center;
    text-align: center;
    padding: 30px 0;
  }
  .done-icon { font-size: 3rem; }

  /* ---------- Empty ---------- */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    gap: 10px;
  }
  .empty-icon { font-size: 3rem; opacity: 0.3; }
  .empty-text { font-size: 0.85rem; color: #555; }
  .empty-btn {
    margin-top: 8px;
    padding: 8px 18px;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    color: #f59e0b;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .empty-btn:hover { background: rgba(245, 158, 11, 0.25); }
</style>
