<script lang="ts">
  import {
    esp32Store, loadPorts, startFlash, cancelFlash,
    loadFlashStatus, loadFlashHistory, elapsed, statusColor
  } from '$lib/stores/esp32';

  let selectedPort = '';
  let binaryPath = '';
  let flashMethod: 'esptool' | 'platformio' = 'esptool';
  let flashBaud = 460800;
  let eraseBefore = false;
  let flashError = '';

  $: ports = $esp32Store.ports;
  $: activeFlashes = $esp32Store.activeFlashes;
  $: history = $esp32Store.flashHistory;
  $: lastBuild = $esp32Store.lastBuild;

  // Auto-fill binary path from last build
  $: if (lastBuild?.binary_path && !binaryPath) {
    binaryPath = lastBuild.binary_path;
  }

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

    if (!result.success) {
      flashError = result.error || 'Error';
    }
  }

  async function handleCancel(flashId: string) {
    await cancelFlash(flashId);
  }

  async function handleRefresh() {
    await Promise.all([loadPorts(), loadFlashStatus(), loadFlashHistory()]);
  }

  function progressBar(percent: number): string {
    const filled = Math.round(percent / 5);
    return '█'.repeat(filled) + '░'.repeat(20 - filled);
  }
</script>

<div class="flash-tab">
  <!-- Ports -->
  <div class="section-header">
    <h2 class="section-title">Puertos Serial</h2>
    <button class="btn-icon" on:click={handleRefresh}>↻</button>
  </div>

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
          <span class="port-path">{port.path}</span>
          <span class="port-type">{port.type}</span>
          {#if port.in_use_by}
            <span class="port-busy">{port.in_use_by}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Last build hint -->
  {#if lastBuild}
    <div class="build-hint">
      <span class="hint-icon">📦</span>
      <span class="hint-text">
        Último build: <strong>{lastBuild.project_name}</strong>
      </span>
      <button
        class="btn-use-build"
        on:click={() => binaryPath = lastBuild?.binary_path || ''}
      >
        Usar binario
      </button>
    </div>
  {/if}

  <!-- Flash Form -->
  <div class="flash-form">
    <h3 class="form-title">Flashear Firmware</h3>

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
      <input class="input" bind:value={binaryPath} placeholder="/data/esp32-dev/projects/mi-proyecto/.pio/build/esp32dev/firmware.bin" />
    </div>

    <div class="form-row-inline">
      <div class="form-row" style="flex:1">
        <label class="form-label">Método</label>
        <select class="input" bind:value={flashMethod}>
          <option value="esptool">esptool.py</option>
          <option value="platformio">PlatformIO</option>
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
    <div class="section-header">
      <h2 class="section-title">Flash en progreso</h2>
    </div>
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
</div>

<style>
  .flash-tab { display: flex; flex-direction: column; gap: 16px; }

  .section-header { display: flex; align-items: center; gap: 8px; }
  .section-title { font-size: 0.85rem; font-weight: 600; margin: 0; }
  .btn-icon {
    width: 26px; height: 26px; border-radius: 50%; border: 1px solid #333;
    background: none; color: #888; cursor: pointer; transition: all 0.15s;
  }
  .btn-icon:hover { color: #ccc; border-color: #555; }

  /* Ports */
  .port-list { display: flex; gap: 6px; flex-wrap: wrap; }
  .port-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-radius: 8px; border: 1px solid #222;
    background: #151515; cursor: pointer; transition: all 0.15s;
    color: inherit; font: inherit;
  }
  .port-row:hover { border-color: #333; }
  .port-row.active { border-color: #3b82f6; background: rgba(59,130,246,0.08); }
  .port-row.in-use { opacity: 0.5; }
  .port-icon { font-size: 0.9rem; }
  .port-path { font-size: 0.8rem; font-family: monospace; font-weight: 600; }
  .port-type { font-size: 0.65rem; color: #555; }
  .port-busy { font-size: 0.6rem; color: #eab308; background: rgba(234,179,8,0.1); padding: 1px 6px; border-radius: 4px; }

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
  .form-title { font-size: 0.85rem; font-weight: 600; margin: 0; }
  .form-row { display: flex; flex-direction: column; gap: 4px; }
  .form-row-inline { display: flex; gap: 10px; }
  .form-label { font-size: 0.65rem; color: #666; }
  .input {
    padding: 6px 10px; border-radius: 6px; border: 1px solid #333;
    background: #0d0d0d; color: #e5e5e5; font-size: 0.8rem;
  }
  .input:focus { outline: none; border-color: #3b82f6; }
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

  .empty-section { padding: 30px; text-align: center; }
  .empty-text { font-size: 0.8rem; color: #555; }
</style>
