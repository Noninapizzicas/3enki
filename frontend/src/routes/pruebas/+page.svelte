<script lang="ts">
  /**
   * PRUEBA DIRECTA - Botón con 3 interacciones
   * Sin componentes externos, lógica inline
   */
  import { FloatingPanel } from '$components/feedback';

  // Config
  const TAP_DELAY = 300;
  const LONG_PRESS_TIME = 500;

  // Estado
  let panelOpen = false;
  let panelMode: 'select' | 'config' = 'select';
  let log: string[] = [];

  // Modelos
  const models = [
    { id: 'auto', name: 'Auto', icon: '⚡' },
    { id: 'deepseek', name: 'DeepSeek', icon: '🔮' },
    { id: 'claude', name: 'Claude', icon: '🧠' },
    { id: 'gpt4', name: 'GPT-4', icon: '🤖' }
  ];
  let currentIdx = 0;
  $: current = models[currentIdx];

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
    addLog('TAP → Abrir selector');
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

    // Iniciar timer de long press
    longPressTimeout = window.setTimeout(() => {
      isLongPress = true;
      clearTimers();
      doLongPress();
    }, LONG_PRESS_TIME);
  }

  function onTouchEnd(e: TouchEvent) {
    e.preventDefault();

    // Si fue long press, ya se ejecutó
    if (isLongPress) {
      isLongPress = false;
      return;
    }

    clearTimers();
    tapCount++;

    if (tapCount === 1) {
      // Esperar por posible doble tap
      tapTimeout = window.setTimeout(() => {
        if (tapCount === 1) {
          doTap();
        }
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
    addLog(`Seleccionado: ${models[idx].name}`);
    panelOpen = false;
  }
</script>

<div class="page">
  <h1>Pruebas</h1>

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
    Actual: {current.icon} {current.name}
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
    <div class="panel">
      <h3>Seleccionar</h3>
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
    <div class="panel">
      <h3>⚙️ Config</h3>
      <p>Opciones aquí</p>
      <button on:click={() => panelOpen = false}>Cerrar</button>
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
    max-height: 200px;
    overflow-y: auto;
  }

  .log-item {
    padding: 0.5rem;
    border-bottom: 1px solid #333;
    font-family: monospace;
    font-size: 0.75rem;
  }

  .log-empty {
    color: #666;
    text-align: center;
  }

  /* Panel */
  .panel {
    min-width: 250px;
    padding: 0.5rem;
  }
  .panel h3 { margin: 0 0 1rem; }

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
</style>
