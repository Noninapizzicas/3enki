<script lang="ts">
  import { tick } from 'svelte';
  import {
    esp32Store, loadPorts, startMonitor, stopMonitor, sendToMonitor
  } from '$lib/stores/esp32';

  let selectedPort = '';
  let monitorBaud = 115200;
  let inputText = '';
  let autoScroll = true;
  let logContainer: HTMLElement;

  $: ports = $esp32Store.ports;
  $: monitorPort = $esp32Store.monitorPort;
  $: lines = $esp32Store.serialLines;
  $: isMonitoring = monitorPort !== null;

  // Auto-scroll al final cuando llegan líneas nuevas
  $: if (lines.length && autoScroll && logContainer) {
    tick().then(() => {
      if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
    });
  }

  async function handleStart() {
    if (!selectedPort) return;
    await startMonitor(selectedPort, monitorBaud);
  }

  async function handleStop() {
    if (monitorPort) await stopMonitor(monitorPort);
  }

  async function handleSend() {
    if (!monitorPort || !inputText) return;
    await sendToMonitor(monitorPort, inputText);
    inputText = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSend();
    }
  }

  function clearLog() {
    esp32Store.update(s => ({ ...s, serialLines: [] }));
  }

  async function handleRefresh() {
    await loadPorts();
  }
</script>

<div class="monitor-tab">
  <!-- Controls -->
  <div class="controls">
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
        <button class="btn-start" disabled={!selectedPort} on:click={handleStart}>
          Conectar
        </button>
        <button class="btn-icon" on:click={handleRefresh}>↻</button>
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
        <button class="btn-stop" on:click={handleStop}>Desconectar</button>
      </div>
    {/if}
  </div>

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

<style>
  .monitor-tab {
    display: flex; flex-direction: column; height: 100%;
    gap: 0; overflow: hidden;
  }

  /* Controls */
  .controls {
    padding: 8px 0; flex-shrink: 0;
  }
  .control-row {
    display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
  }
  .input {
    padding: 6px 10px; border-radius: 6px; border: 1px solid #333;
    background: #0d0d0d; color: #e5e5e5; font-size: 0.8rem;
  }
  .input:focus { outline: none; border-color: #22c55e; }
  .input-sm { width: 90px; }
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
  .btn-icon {
    width: 26px; height: 26px; border-radius: 50%; border: 1px solid #333;
    background: none; color: #888; cursor: pointer; transition: all 0.15s;
  }
  .btn-icon:hover { color: #ccc; border-color: #555; }

  .monitor-status {
    display: flex; align-items: center; gap: 6px; flex: 1;
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #22c55e;
    animation: pulse 1.5s infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .status-port { font-size: 0.8rem; font-family: monospace; font-weight: 600; }
  .status-baud { font-size: 0.65rem; color: #666; }

  .checkbox-row {
    display: flex; align-items: center; gap: 4px;
    font-size: 0.7rem; color: #888; cursor: pointer;
  }

  /* Serial Output */
  .serial-output {
    flex: 1; overflow-y: auto; background: #050505;
    border: 1px solid #1a1a1a; border-radius: 8px;
    padding: 8px; font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.7rem; line-height: 1.5;
    min-height: 200px;
  }
  .serial-output::-webkit-scrollbar { width: 5px; }
  .serial-output::-webkit-scrollbar-track { background: #050505; }
  .serial-output::-webkit-scrollbar-thumb { background: #222; border-radius: 3px; }

  .serial-empty {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: #444; font-size: 0.8rem;
  }

  .serial-line {
    display: flex; gap: 10px;
  }
  .serial-line:hover { background: rgba(255,255,255,0.02); }
  .line-num {
    color: #333; min-width: 40px; text-align: right; user-select: none;
    flex-shrink: 0;
  }
  .line-text { color: #22c55e; white-space: pre-wrap; word-break: break-all; }

  /* Serial Input */
  .serial-input {
    display: flex; gap: 6px; padding: 8px 0; flex-shrink: 0;
  }
  .input-send { flex: 1; font-family: monospace; }
  .btn-send {
    padding: 6px 14px; border-radius: 6px; border: none;
    background: #22c55e; color: #000; font-weight: 600; cursor: pointer;
    font-size: 0.75rem;
  }
  .btn-send:disabled { opacity: 0.4; cursor: default; }
</style>
