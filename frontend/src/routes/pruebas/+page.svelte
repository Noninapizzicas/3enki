<script lang="ts">
  /**
   * PRUEBA - Botón IA con 3 interacciones
   * - 1 tap: Selector de modelo
   * - 2 taps: Siguiente modelo
   * - Long press: Configuración LLM
   */
  import { onMount } from 'svelte';
  import { FloatingPanel } from '$components/feedback';

  // Config
  const TAP_DELAY = 300;
  const LONG_PRESS_TIME = 500;

  // Estado
  let panelOpen = false;
  let panelMode: 'select' | 'config' = 'select';
  let log: string[] = [];

  // Modelos (mock)
  const models = [
    { id: 'auto', name: 'Auto', icon: '⚡' },
    { id: 'deepseek', name: 'DeepSeek', icon: '🔮' },
    { id: 'claude', name: 'Claude', icon: '🧠' },
    { id: 'gpt4', name: 'GPT-4', icon: '🤖' }
  ];
  let currentIdx = 0;
  $: current = models[currentIdx];

  // Configuración LLM
  let config = {
    temperature: 0.7,
    maxTokens: 2048,
    topP: 1.0,
    frequencyPenalty: 0,
    presencePenalty: 0,
    systemPrompt: '',
    stream: true
  };

  // Presets
  const presets = [
    { id: 'precise', name: 'Preciso', icon: '🎯' },
    { id: 'balanced', name: 'Balanceado', icon: '⚖️' },
    { id: 'creative', name: 'Creativo', icon: '🎨' },
    { id: 'code', name: 'Código', icon: '💻' }
  ];
  let activePreset = 'balanced';

  // Timers
  let tapTimeout: number | null = null;
  let longPressTimeout: number | null = null;
  let tapCount = 0;
  let isLongPress = false;

  function addLog(msg: string) {
    log = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...log.slice(0, 9)];
  }

  function clearTimers() {
    if (tapTimeout) clearTimeout(tapTimeout);
    if (longPressTimeout) clearTimeout(longPressTimeout);
    tapTimeout = null;
    longPressTimeout = null;
  }

  // === ACCIONES ===
  function doTap() {
    addLog('TAP → Selector');
    panelMode = 'select';
    panelOpen = true;
  }

  function doDoubleTap() {
    currentIdx = (currentIdx + 1) % models.length;
    addLog(`DOBLE TAP → ${models[currentIdx].name}`);
  }

  function doLongPress() {
    addLog('LONG PRESS → Config');
    panelMode = 'config';
    panelOpen = true;
  }

  // === EVENTOS TOUCH ===
  function onTouchStart(e: TouchEvent) {
    e.preventDefault();
    isLongPress = false;
    longPressTimeout = window.setTimeout(() => {
      isLongPress = true;
      clearTimers();
      doLongPress();
    }, LONG_PRESS_TIME);
  }

  function onTouchEnd(e: TouchEvent) {
    e.preventDefault();
    if (isLongPress) {
      isLongPress = false;
      return;
    }
    clearTimers();
    tapCount++;
    if (tapCount === 1) {
      tapTimeout = window.setTimeout(() => {
        if (tapCount === 1) doTap();
        tapCount = 0;
      }, TAP_DELAY);
    } else if (tapCount >= 2) {
      clearTimers();
      doDoubleTap();
      tapCount = 0;
    }
  }

  function onTouchCancel() {
    clearTimers();
    tapCount = 0;
    isLongPress = false;
  }

  function selectModel(idx: number) {
    currentIdx = idx;
    addLog(`Modelo: ${models[idx].name}`);
    panelOpen = false;
  }

  function applyPreset(presetId: string) {
    activePreset = presetId;
    switch (presetId) {
      case 'precise':
        config.temperature = 0.3;
        config.topP = 0.9;
        break;
      case 'balanced':
        config.temperature = 0.7;
        config.topP = 1.0;
        break;
      case 'creative':
        config.temperature = 1.2;
        config.topP = 0.95;
        break;
      case 'code':
        config.temperature = 0.2;
        config.topP = 0.9;
        config.systemPrompt = 'Eres un experto programador.';
        break;
    }
    addLog(`Preset: ${presetId}`);
  }

  function saveConfig() {
    addLog(`Config guardada: temp=${config.temperature}`);
    panelOpen = false;
  }
</script>

<div class="page">
  <h1>Pruebas IA</h1>

  <div class="info">
    <span>1 tap: Lista</span>
    <span>2 taps: Siguiente</span>
    <span>Mantener: Config</span>
  </div>

  <!-- BOTÓN -->
  <div class="btn-container">
    <button
      class="btn"
      on:touchstart={onTouchStart}
      on:touchend={onTouchEnd}
      on:touchcancel={onTouchCancel}
    >
      <span class="btn-icon">{current.icon}</span>
      <span class="btn-label">{current.name}</span>
    </button>
  </div>

  <div class="current">
    {current.icon} {current.name} | 🌡️ {config.temperature}
  </div>

  <!-- LOG -->
  <div class="log">
    <h2>Log</h2>
    {#each log as entry}
      <div class="log-item">{entry}</div>
    {:else}
      <div class="log-empty">Toca el botón...</div>
    {/each}
  </div>
</div>

<!-- PANEL -->
<FloatingPanel bind:open={panelOpen}>
  {#if panelMode === 'select'}
    <!-- Panel Selector -->
    <div class="panel">
      <h3>Seleccionar Modelo</h3>
      {#each models as m, i}
        <button
          class="panel-item"
          class:active={i === currentIdx}
          on:click={() => selectModel(i)}
        >
          {m.icon} {m.name}
        </button>
      {/each}
    </div>
  {:else}
    <!-- Panel Config -->
    <div class="panel config-panel">
      <h3>⚙️ Configuración LLM</h3>

      <!-- Presets -->
      <div class="presets">
        {#each presets as p}
          <button
            class="preset-btn"
            class:active={activePreset === p.id}
            on:click={() => applyPreset(p.id)}
          >
            {p.icon}
          </button>
        {/each}
      </div>

      <!-- Temperature -->
      <div class="config-row">
        <label>
          <span>🌡️ Temperatura</span>
          <span class="value">{config.temperature.toFixed(1)}</span>
        </label>
        <input type="range" min="0" max="2" step="0.1" bind:value={config.temperature} />
      </div>

      <!-- Max Tokens -->
      <div class="config-row">
        <label>
          <span>📏 Máx Tokens</span>
          <span class="value">{config.maxTokens}</span>
        </label>
        <input type="range" min="256" max="8192" step="256" bind:value={config.maxTokens} />
      </div>

      <!-- Top P -->
      <div class="config-row">
        <label>
          <span>🎯 Top P</span>
          <span class="value">{config.topP.toFixed(2)}</span>
        </label>
        <input type="range" min="0" max="1" step="0.05" bind:value={config.topP} />
      </div>

      <!-- Stream toggle -->
      <div class="config-row toggle-row">
        <label>
          <span>⚡ Streaming</span>
        </label>
        <button
          class="toggle"
          class:on={config.stream}
          on:click={() => config.stream = !config.stream}
        >
          {config.stream ? 'ON' : 'OFF'}
        </button>
      </div>

      <!-- System Prompt -->
      <div class="config-row">
        <label>
          <span>📝 System Prompt</span>
        </label>
        <textarea
          bind:value={config.systemPrompt}
          placeholder="Instrucciones para el modelo..."
          rows="3"
        ></textarea>
      </div>

      <button class="save-btn" on:click={saveConfig}>
        Guardar
      </button>
    </div>
  {/if}
</FloatingPanel>

<style>
  .page {
    min-height: 100vh;
    padding: 1rem;
    background: #111;
    color: #fff;
  }

  h1 { margin: 0 0 1rem; font-size: 1.5rem; }
  h2 { margin: 0 0 0.5rem; font-size: 1rem; color: #888; }
  h3 { margin: 0 0 1rem; font-size: 1.1rem; }

  .info {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
    font-size: 0.75rem;
  }
  .info span {
    padding: 0.5rem;
    background: #222;
    border-radius: 6px;
  }

  .btn-container {
    display: flex;
    justify-content: center;
    padding: 2rem;
    background: #1a1a1a;
    border-radius: 12px;
    margin-bottom: 1rem;
  }

  .btn {
    width: 80px;
    height: 80px;
    border: none;
    border-radius: 16px;
    background: #333;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .btn:active {
    background: #3b82f6;
    transform: scale(0.95);
  }

  .btn-icon { font-size: 2rem; }
  .btn-label { font-size: 0.7rem; }

  .current {
    text-align: center;
    padding: 0.75rem;
    background: #1a1a1a;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .log {
    background: #1a1a1a;
    border-radius: 12px;
    padding: 1rem;
    max-height: 150px;
    overflow-y: auto;
  }

  .log-item {
    padding: 0.4rem;
    border-bottom: 1px solid #333;
    font-family: monospace;
    font-size: 0.7rem;
  }

  .log-empty {
    color: #666;
    text-align: center;
  }

  /* Panel */
  .panel {
    min-width: 280px;
    max-width: 320px;
    padding: 0.5rem;
  }

  .panel-item {
    display: block;
    width: 100%;
    padding: 0.75rem 1rem;
    margin-bottom: 0.5rem;
    border: 2px solid transparent;
    border-radius: 8px;
    background: #f0f0f0;
    color: #111;
    font-size: 1rem;
    text-align: left;
    cursor: pointer;
  }
  .panel-item.active {
    border-color: #3b82f6;
    background: #e0f0ff;
  }

  /* Config Panel */
  .config-panel {
    max-height: 70vh;
    overflow-y: auto;
  }

  .presets {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .preset-btn {
    flex: 1;
    padding: 0.75rem;
    font-size: 1.25rem;
    border: 2px solid #ddd;
    border-radius: 8px;
    background: #f5f5f5;
    cursor: pointer;
  }
  .preset-btn.active {
    border-color: #3b82f6;
    background: #e0f0ff;
  }

  .config-row {
    margin-bottom: 1rem;
  }

  .config-row label {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
    color: #333;
  }

  .config-row .value {
    font-weight: bold;
    color: #3b82f6;
  }

  .config-row input[type="range"] {
    width: 100%;
    height: 8px;
    border-radius: 4px;
    background: #ddd;
    appearance: none;
  }

  .config-row input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
  }

  .toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .toggle {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 20px;
    font-weight: bold;
    cursor: pointer;
    background: #ddd;
    color: #666;
  }
  .toggle.on {
    background: #22c55e;
    color: white;
  }

  .config-row textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.875rem;
    resize: none;
  }

  .save-btn {
    width: 100%;
    padding: 0.75rem;
    margin-top: 0.5rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
  }
</style>
