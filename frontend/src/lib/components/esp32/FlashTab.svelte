<script lang="ts">
  import { tick } from 'svelte';
  import {
    esp32Store, loadPorts, startFlash, cancelFlash,
    loadFlashStatus, loadFlashHistory,
    startMonitor, stopMonitor, sendToMonitor,
    elapsed, statusColor
  } from '$lib/stores/esp32';

  type SubTab = 'puertos' | 'grabar' | 'monitor';
  let subTab: SubTab = 'puertos';

  // Flash state
  let selectedPort = '';
  let binaryPath = '';
  let flashMethod: 'esptool' | 'platformio' | 'esphome' | 'mpremote' = 'esptool';
  let flashBaud = 460800;
  let eraseBefore = false;
  let flashError = '';

  // Monitor state
  let monitorBaud = 115200;
  let inputText = '';
  let autoScroll = true;
  let logContainer: HTMLElement;

  $: ports = $esp32Store.ports;
  $: activeFlashes = $esp32Store.activeFlashes;
  $: history = $esp32Store.flashHistory;
  $: lastBuild = $esp32Store.lastBuild;
  $: monitorPort = $esp32Store.monitorPort;
  $: lines = $esp32Store.serialLines;
  $: isMonitoring = monitorPort !== null;

  // Auto-fill binary from last build
  $: if (lastBuild?.binary_path && !binaryPath) {
    binaryPath = lastBuild.binary_path;
  }

  // Auto-scroll serial
  $: if (lines.length && autoScroll && logContainer) {
    tick().then(() => {
      if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
    });
  }

  // --- Flash handlers ---
  async function handleFlash() {
    flashError = '';
    if (!selectedPort) { flashError = 'Selecciona un puerto'; return; }
    if (!binaryPath) { flashError = 'Ruta al .bin requerida'; return; }
    const result = await startFlash({
      port: selectedPort,
      binary_path: binaryPath,
      method: flashMethod,
      baud: flashBaud,
      erase_before: eraseBefore
    });
    if (!result.success) flashError = result.error || 'Error';
  }

  async function handleCancel(flashId: string) {
    await cancelFlash(flashId);
  }

  // --- Monitor handlers ---
  async function handleStartMonitor() {
    if (!selectedPort) return;
    await startMonitor(selectedPort, monitorBaud);
  }

  async function handleStopMonitor() {
    if (monitorPort) await stopMonitor(monitorPort);
  }

  async function handleSend() {
    if (!monitorPort || !inputText) return;
    await sendToMonitor(monitorPort, inputText);
    inputText = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleSend();
  }

  function clearLog() {
    esp32Store.update(s => ({ ...s, serialLines: [] }));
  }

  async function handleRefresh() {
    await Promise.all([loadPorts(), loadFlashStatus(), loadFlashHistory()]);
  }

  function progressBar(percent: number): string {
    const filled = Math.round(percent / 5);
    return '\u2588'.repeat(filled) + '\u2591'.repeat(20 - filled);
  }
</script>

<div class="flash-tab">
  <!-- Sub-tab bar -->
  <div class="subtab-bar">
    <button class="subtab" class:active={subTab === 'puertos'} on:click={() => subTab = 'puertos'}>
      Puertos
      {#if ports.length > 0}
        <span class="subtab-count">{ports.length}</span>
      {/if}
    </button>
    <button class="subtab" class:active={subTab === 'grabar'} on:click={() => subTab = 'grabar'}>
      Grabar
      {#if activeFlashes.length > 0}
        <span class="subtab-badge">{activeFlashes.length}</span>
      {/if}
    </button>
    <button class="subtab" class:active={subTab === 'monitor'} on:click={() => subTab = 'monitor'}>
      Monitor
      {#if isMonitoring}
        <span class="subtab-live">LIVE</span>
      {/if}
    </button>
    <button class="btn-icon" on:click={handleRefresh}>↻</button>
  </div>

  <!-- PUERTOS -->
  {#if subTab === 'puertos'}
    {#if ports.length === 0}
      <div class="empty-section">
        <span class="empty-text">No se detectaron puertos serial. Conecta un ESP32 por USB.</span>
      </div>
    {:else}
      <div class="port-list">
        {#each ports as port (port.path)}
          <button
            class="port-row"
            class:active={selectedPort === port.path}
            class:in-use={port.in_use_by !== null}
            on:click={() => selectedPort = port.path}
          >
            <span class="port-icon">🔌</span>
            <div class="port-info">
              <span class="port-path">{port.path}</span>
              <span class="port-type">{port.type}</span>
            </div>
            {#if port.in_use_by}
              <span class="port-busy">{port.in_use_by}</span>
            {:else}
              <span class="port-free">disponible</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if selectedPort}
      <div class="port-actions">
        <button class="btn-action" on:click={() => subTab = 'grabar'}>
          Grabar en {selectedPort}
        </button>
        <button class="btn-action btn-action-alt" on:click={() => subTab = 'monitor'}>
          Monitor en {selectedPort}
        </button>
      </div>
    {/if}

  <!-- GRABAR -->
  {:else if subTab === 'grabar'}
    <!-- Last build hint -->
    {#if lastBuild}
      <div class="build-hint">
        <span class="hint-icon">📦</span>
        <span class="hint-text">
          Ultimo build: <strong>{lastBuild.project_name}</strong>
        </span>
        <button
          class="btn-use-build"
          on:click={() => binaryPath = lastBuild?.binary_path || ''}
        >
          Usar binario
        </button>
      </div>
    {/if}

    <div class="flash-form">
      <div class="form-row">
        <label class="form-label">Puerto</label>
        <select class="input" bind:value={selectedPort}>
          <option value="">— selecciona —</option>
          {#each ports.filter(p => !p.in_use_by) as port}
            <option value={port.path}>{port.path}</option>
          {/each}
        </select>
      </div>

      <div class="form-row">
        <label class="form-label">Binario (.bin)</label>
        <input class="input" bind:value={binaryPath} placeholder="ruta al firmware.bin" />
      </div>

      <div class="form-row-inline">
        <div class="form-row" style="flex:1">
          <label class="form-label">Metodo</label>
          <select class="input" bind:value={flashMethod}>
            <option value="esptool">esptool.py</option>
            <option value="platformio">PlatformIO</option>
            <option value="esphome">ESPHome</option>
            <option value="mpremote">mpremote</option>
          </select>
        </div>
        <div class="form-row" style="flex:1">
          <label class="form-label">Baud</label>
          <select class="input" bind:value={flashBaud}>
            <option value={115200}>115200</option>
            <option value={230400}>230400</option>
            <option value={460800}>460800</option>
            <option value={921600}>921600</option>
          </select>
        </div>
      </div>

      <label class="checkbox-row">
        <input type="checkbox" bind:checked={eraseBefore} />
        <span>Borrar flash antes de escribir</span>
      </label>

      {#if flashError}
        <div class="error-msg">{flashError}</div>
      {/if}

      <button
        class="btn-flash"
        disabled={!selectedPort || !binaryPath || activeFlashes.length > 0}
        on:click={handleFlash}
      >
        Flashear
      </button>
    </div>

    <!-- Active Flashes -->
    {#if activeFlashes.length > 0}
      {#each activeFlashes as flash (flash.flash_id)}
        <div class="flash-active">
          <div class="flash-info-row">
            <span class="flash-port">{flash.port}</span>
            <span class="flash-method">{flash.method}</span>
            <span class="flash-elapsed">{flash.elapsed_ms ? `${(flash.elapsed_ms / 1000).toFixed(0)}s` : ''}</span>
            <button class="btn-cancel-flash" on:click={() => handleCancel(flash.flash_id)}>Cancelar</button>
          </div>
          {#if flash.progress}
            <div class="progress-row">
              <span class="progress-stage">{flash.progress.stage}</span>
              <span class="progress-bar">{progressBar(flash.progress.percent)}</span>
              <span class="progress-pct">{flash.progress.percent}%</span>
            </div>
          {/if}
          {#if flash.log_tail}
            <pre class="flash-log">{flash.log_tail.slice(-5).join('\n')}</pre>
          {/if}
        </div>
      {/each}
    {/if}

    <!-- History -->
    {#if history.length > 0}
      <div class="section-header">
        <h2 class="section-title">Historial</h2>
      </div>
      <div class="history-list">
        {#each history.slice(0, 20) as entry (entry.flash_id)}
          <div class="history-row">
            <span class="hist-dot" style="background: {statusColor(entry.status)}"></span>
            <span class="hist-port">{entry.port}</span>
            <span class="hist-method">{entry.method}</span>
            <span class="hist-status">{entry.status}</span>
            {#if entry.duration_ms}
              <span class="hist-duration">{(entry.duration_ms / 1000).toFixed(1)}s</span>
            {/if}
            <span class="hist-time">{elapsed(entry.timestamp)}</span>
          </div>
        {/each}
      </div>
    {/if}

  <!-- MONITOR -->
  {:else if subTab === 'monitor'}
    <div class="monitor-section">
      <!-- Controls -->
      {#if !isMonitoring}
        <div class="control-row">
          <select class="input" bind:value={selectedPort}>
            <option value="">— puerto —</option>
            {#each ports.filter(p => !p.in_use_by) as port}
              <option value={port.path}>{port.path}</option>
            {/each}
          </select>
          <select class="input input-sm" bind:value={monitorBaud}>
            <option value={9600}>9600</option>
            <option value={19200}>19200</option>
            <option value={38400}>38400</option>
            <option value={57600}>57600</option>
            <option value={115200}>115200</option>
            <option value={230400}>230400</option>
            <option value={460800}>460800</option>
            <option value={921600}>921600</option>
          </select>
          <button class="btn-start" disabled={!selectedPort} on:click={handleStartMonitor}>
            Conectar
          </button>
        </div>
      {:else}
        <div class="control-row">
          <span class="monitor-status">
            <span class="status-dot"></span>
            <span class="status-port">{monitorPort}</span>
            <span class="status-baud">{$esp32Store.monitorBaud} baud</span>
          </span>
          <button class="btn-clear" on:click={clearLog}>Limpiar</button>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={autoScroll} />
            <span>Auto-scroll</span>
          </label>
          <button class="btn-stop" on:click={handleStopMonitor}>Desconectar</button>
        </div>
      {/if}

      <!-- Serial Output -->
      <div class="serial-output" bind:this={logContainer}>
        {#if lines.length === 0}
          <div class="serial-empty">
            {#if isMonitoring}
              <span>Esperando datos del serial...</span>
            {:else}
              <span>Conecta a un puerto serial para ver la salida del ESP32.</span>
            {/if}
          </div>
        {:else}
          {#each lines as line, i}
            <div class="serial-line">
              <span class="line-num">{i + 1}</span>
              <span class="line-text">{line}</span>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Input -->
      {#if isMonitoring}
        <div class="serial-input">
          <input
            class="input input-send"
            bind:value={inputText}
            on:keydown={handleKeydown}
            placeholder="Enviar al serial..."
          />
          <button class="btn-send" on:click={handleSend} disabled={!inputText}>
            Enviar
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .flash-tab { display: flex; flex-direction: column; gap: 14px; height: 100%; }

  /* Sub-tab bar */
  .subtab-bar {
    display: flex; gap: 0; align-items: center;
    background: #111; border-radius: 8px; padding: 2px; overflow: hidden;
    flex-shrink: 0;
  }
  .subtab {
    flex: 1; padding: 6px 10px; border: none; background: none;
    color: #666; font-size: 0.7rem; font-weight: 500; cursor: pointer;
    border-radius: 6px; transition: all 0.15s;
    display: flex; align-items: center; justify-content: center; gap: 4px;
  }
  .subtab:hover { color: #999; }
  .subtab.active { background: #1a1a1a; color: #3b82f6; }
  .subtab-count {
    min-width: 14px; height: 14px; border-radius: 7px;
    background: rgba(59,130,246,0.15); color: #3b82f6; font-size: 0.5rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center; padding: 0 3px;
  }
  .subtab-badge {
    min-width: 14px; height: 14px; border-radius: 7px;
    background: #3b82f6; color: #fff; font-size: 0.5rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center; padding: 0 3px;
  }
  .subtab-live {
    padding: 1px 5px; border-radius: 4px;
    background: rgba(34,197,94,0.2); color: #22c55e;
    font-size: 0.5rem; font-weight: 700; letter-spacing: 0.5px;
    animation: pulse 2s infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .btn-icon {
    width: 26px; height: 26px; border-radius: 50%; border: 1px solid #333;
    background: none; color: #888; cursor: pointer; transition: all 0.15s;
    margin-left: 4px; flex-shrink: 0;
  }
  .btn-icon:hover { color: #ccc; border-color: #555; }

  .section-header { display: flex; align-items: center; gap: 8px; }
  .section-title { font-size: 0.85rem; font-weight: 600; margin: 0; }

  /* Ports */
  .port-list { display: flex; flex-direction: column; gap: 4px; }
  .port-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: 8px; border: 1px solid #222;
    background: #151515; cursor: pointer; transition: all 0.15s;
    color: inherit; font: inherit; text-align: left; width: 100%;
  }
  .port-row:hover { border-color: #333; }
  .port-row.active { border-color: #3b82f6; background: rgba(59,130,246,0.08); }
  .port-row.in-use { opacity: 0.5; }
  .port-icon { font-size: 1rem; }
  .port-info { display: flex; flex-direction: column; flex: 1; }
  .port-path { font-size: 0.8rem; font-family: monospace; font-weight: 600; }
  .port-type { font-size: 0.65rem; color: #555; }
  .port-busy { font-size: 0.6rem; color: #eab308; background: rgba(234,179,8,0.1); padding: 2px 8px; border-radius: 4px; }
  .port-free { font-size: 0.6rem; color: #22c55e; }

  .port-actions { display: flex; gap: 6px; }
  .btn-action {
    flex: 1; padding: 8px 14px; border-radius: 8px; border: none;
    background: #3b82f6; color: #fff; font-weight: 600; cursor: pointer;
    font-size: 0.75rem; transition: all 0.15s;
  }
  .btn-action:hover { background: #2563eb; }
  .btn-action-alt { background: #222; color: #22c55e; }
  .btn-action-alt:hover { background: #333; }

  /* Build hint */
  .build-hint {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; background: rgba(34,197,94,0.06); border-radius: 8px; border: 1px solid rgba(34,197,94,0.15);
  }
  .hint-icon { font-size: 0.9rem; }
  .hint-text { font-size: 0.75rem; color: #888; flex: 1; }
  .hint-text strong { color: #22c55e; }
  .btn-use-build {
    padding: 3px 10px; border-radius: 6px; border: 1px solid #333;
    background: none; color: #22c55e; font-size: 0.65rem; cursor: pointer;
  }

  /* Flash form */
  .flash-form {
    padding: 14px; background: #151515; border-radius: 10px; border: 1px solid #222;
    display: flex; flex-direction: column; gap: 10px;
  }
  .form-row { display: flex; flex-direction: column; gap: 4px; }
  .form-row-inline { display: flex; gap: 10px; }
  .form-label { font-size: 0.65rem; color: #666; }
  .input {
    padding: 6px 10px; border-radius: 6px; border: 1px solid #333;
    background: #0d0d0d; color: #e5e5e5; font-size: 0.8rem;
  }
  .input:focus { outline: none; border-color: #3b82f6; }
  .input-sm { width: 90px; }
  .checkbox-row {
    display: flex; align-items: center; gap: 8px;
    font-size: 0.75rem; color: #888; cursor: pointer;
  }
  .error-msg { font-size: 0.75rem; color: #ef4444; }
  .btn-flash {
    padding: 8px 16px; border-radius: 8px; border: none;
    background: #3b82f6; color: #fff; font-weight: 600; cursor: pointer;
    font-size: 0.8rem; transition: all 0.15s;
  }
  .btn-flash:hover { background: #2563eb; }
  .btn-flash:disabled { opacity: 0.4; cursor: default; }

  /* Active flash */
  .flash-active {
    padding: 12px; background: #111; border-radius: 10px; border: 1px solid #3b82f633;
    display: flex; flex-direction: column; gap: 8px;
  }
  .flash-info-row { display: flex; align-items: center; gap: 8px; }
  .flash-port { font-size: 0.8rem; font-family: monospace; font-weight: 600; }
  .flash-method { font-size: 0.65rem; color: #888; }
  .flash-elapsed { font-size: 0.65rem; color: #555; flex: 1; text-align: right; }
  .btn-cancel-flash {
    padding: 3px 10px; border-radius: 6px; border: 1px solid #ef444444;
    background: none; color: #ef4444; font-size: 0.65rem; cursor: pointer;
  }
  .progress-row { display: flex; align-items: center; gap: 8px; }
  .progress-stage { font-size: 0.7rem; color: #3b82f6; min-width: 80px; }
  .progress-bar { font-size: 0.6rem; font-family: monospace; color: #3b82f6; flex: 1; }
  .progress-pct { font-size: 0.7rem; font-weight: 600; color: #3b82f6; }
  .flash-log {
    font-size: 0.6rem; font-family: monospace; color: #666;
    margin: 0; white-space: pre-wrap; background: #0a0a0a;
    padding: 6px 8px; border-radius: 6px;
  }

  /* History */
  .history-list { display: flex; flex-direction: column; gap: 3px; }
  .history-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; background: #111; border-radius: 6px; font-size: 0.75rem;
  }
  .hist-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .hist-port { font-family: monospace; font-weight: 500; min-width: 110px; }
  .hist-method { font-size: 0.65rem; color: #555; min-width: 60px; }
  .hist-status { font-size: 0.65rem; flex: 1; }
  .hist-duration { font-size: 0.65rem; color: #888; }
  .hist-time { font-size: 0.6rem; color: #444; }

  /* Monitor section */
  .monitor-section {
    display: flex; flex-direction: column; gap: 8px; flex: 1; overflow: hidden;
  }
  .control-row {
    display: flex; gap: 6px; align-items: center; flex-wrap: wrap; flex-shrink: 0;
  }
  .btn-start {
    padding: 6px 14px; border-radius: 6px; border: none;
    background: #22c55e; color: #000; font-weight: 600; cursor: pointer; font-size: 0.75rem;
  }
  .btn-start:disabled { opacity: 0.4; cursor: default; }
  .btn-stop {
    padding: 6px 14px; border-radius: 6px; border: none;
    background: #ef4444; color: #fff; font-weight: 600; cursor: pointer; font-size: 0.75rem;
  }
  .btn-clear {
    padding: 4px 10px; border-radius: 6px; border: 1px solid #333;
    background: none; color: #888; cursor: pointer; font-size: 0.7rem;
  }
  .monitor-status {
    display: flex; align-items: center; gap: 6px; flex: 1;
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #22c55e;
    animation: pulse 1.5s infinite;
  }
  .status-port { font-size: 0.8rem; font-family: monospace; font-weight: 600; }
  .status-baud { font-size: 0.65rem; color: #666; }

  /* Serial Output */
  .serial-output {
    flex: 1; overflow-y: auto; background: #050505;
    border: 1px solid #1a1a1a; border-radius: 8px;
    padding: 8px; font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.7rem; line-height: 1.5; min-height: 200px;
  }
  .serial-output::-webkit-scrollbar { width: 5px; }
  .serial-output::-webkit-scrollbar-track { background: #050505; }
  .serial-output::-webkit-scrollbar-thumb { background: #222; border-radius: 3px; }

  .serial-empty {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: #444; font-size: 0.8rem;
  }
  .serial-line { display: flex; gap: 10px; }
  .serial-line:hover { background: rgba(255,255,255,0.02); }
  .line-num { color: #333; min-width: 40px; text-align: right; user-select: none; flex-shrink: 0; }
  .line-text { color: #22c55e; white-space: pre-wrap; word-break: break-all; }

  .serial-input { display: flex; gap: 6px; flex-shrink: 0; }
  .input-send { flex: 1; font-family: monospace; }
  .btn-send {
    padding: 6px 14px; border-radius: 6px; border: none;
    background: #22c55e; color: #000; font-weight: 600; cursor: pointer; font-size: 0.75rem;
  }
  .btn-send:disabled { opacity: 0.4; cursor: default; }

  .empty-section { padding: 30px; text-align: center; }
  .empty-text { font-size: 0.8rem; color: #555; }
</style>
