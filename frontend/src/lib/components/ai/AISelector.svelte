<script lang="ts">
  /**
   * AISelector - Selector de modelo IA con configuración
   *
   * Botón con gestos:
   * - Tap: Abre selector de modelo
   * - Long press: Abre configuración LLM
   *
   * Icono dinámico según modelo seleccionado.
   */
  import { createEventDispatcher } from 'svelte';
  import { FloatingPanel } from '$components/feedback';

  // Props
  export let models = [
    { id: 'auto', name: 'Auto', icon: '⚡' },
    { id: 'deepseek', name: 'DeepSeek', icon: '🔮' },
    { id: 'claude', name: 'Claude', icon: '🧠' },
    { id: 'gpt4', name: 'GPT-4', icon: '🤖' }
  ];

  export let size: 'sm' | 'md' | 'lg' = 'md';

  // Config tiempos
  const TAP_DELAY = 300;
  const LONG_PRESS_TIME = 500;

  // Estado
  let panelOpen = false;
  let panelMode: 'select' | 'config' = 'select';
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

  const dispatch = createEventDispatcher<{
    modelChange: { model: typeof current; index: number };
    configChange: typeof config;
  }>();

  function clearTimers() {
    if (tapTimeout) clearTimeout(tapTimeout);
    if (longPressTimeout) clearTimeout(longPressTimeout);
    tapTimeout = null;
    longPressTimeout = null;
  }

  // === ACCIONES ===
  function doTap() {
    panelMode = 'select';
    panelOpen = true;
  }

  function doLongPress() {
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
      doTap(); // Doble tap = mismo que tap
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
    panelOpen = false;
    dispatch('modelChange', { model: models[idx], index: idx });
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
  }

  function saveConfig() {
    panelOpen = false;
    dispatch('configChange', { ...config });
  }

  // Tamaños
  const sizes = {
    sm: { btn: 48, icon: '1.25rem', label: '0.6rem' },
    md: { btn: 64, icon: '1.75rem', label: '0.7rem' },
    lg: { btn: 80, icon: '2rem', label: '0.75rem' }
  };
  $: s = sizes[size];
</script>

<!-- BOTÓN -->
<button
  class="ai-selector"
  style="--btn-size: {s.btn}px; --icon-size: {s.icon}; --label-size: {s.label};"
  on:touchstart={onTouchStart}
  on:touchend={onTouchEnd}
  on:touchcancel={onTouchCancel}
>
  <span class="ai-selector__icon">{current.icon}</span>
  <span class="ai-selector__label">{current.name}</span>
</button>

<!-- PANEL -->
<FloatingPanel bind:open={panelOpen}>
  {#if panelMode === 'select'}
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
        <label><span>⚡ Streaming</span></label>
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
        <label><span>📝 System Prompt</span></label>
        <textarea
          bind:value={config.systemPrompt}
          placeholder="Instrucciones para el modelo..."
          rows="3"
        ></textarea>
      </div>

      <button class="save-btn" on:click={saveConfig}>Guardar</button>
    </div>
  {/if}
</FloatingPanel>

<style>
  .ai-selector {
    width: var(--btn-size);
    height: var(--btn-size);
    border: none;
    border-radius: 16px;
    background: var(--ai-selector-bg, #333);
    color: var(--ai-selector-color, #fff);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    transition: transform 0.1s, background 0.15s;
  }

  .ai-selector:active {
    background: var(--ai-selector-active, #3b82f6);
    transform: scale(0.95);
  }

  .ai-selector__icon {
    font-size: var(--icon-size);
    line-height: 1;
  }

  .ai-selector__label {
    font-size: var(--label-size);
    opacity: 0.9;
  }

  /* Panel */
  .panel {
    min-width: 280px;
    max-width: 320px;
    padding: 0.5rem;
  }

  .panel h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
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
