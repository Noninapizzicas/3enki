<script lang="ts">
  /**
   * Página de Pruebas - ToolbarIcon con triple interacción
   *
   * INTERACCIONES:
   * - 1 tap: Abre panel de selección
   * - 2 taps: Cambio rápido (cicla modelos)
   * - Long press: Panel de configuración
   */
  import { ToolbarIcon } from '$components/toolbar';
  import { FloatingPanel } from '$components/feedback';

  // Estado del panel
  let panelOpen = false;
  let panelMode: 'select' | 'config' = 'select';

  // Modelos mock (sin backend)
  const mockModels = [
    { id: 'auto', name: 'Auto', icon: '⚡', provider: 'auto' },
    { id: 'deepseek-chat', name: 'DeepSeek', icon: '🔮', provider: 'deepseek' },
    { id: 'claude-3-5-sonnet', name: 'Claude', icon: '🧠', provider: 'anthropic' },
    { id: 'gpt-4o', name: 'GPT-4o', icon: '🤖', provider: 'openai' },
    { id: 'llama2', name: 'Llama 2', icon: '🦙', provider: 'ollama' }
  ];

  let currentIndex = 0;
  $: currentModel = mockModels[currentIndex];

  // Log de acciones
  let actionLog: string[] = [];

  function logAction(action: string) {
    const time = new Date().toLocaleTimeString();
    actionLog = [`[${time}] ${action}`, ...actionLog.slice(0, 9)];
  }

  // Handlers
  function handleTap() {
    logAction('TAP → Abrir selector');
    panelMode = 'select';
    panelOpen = true;
  }

  function handleDoubleTap() {
    currentIndex = (currentIndex + 1) % mockModels.length;
    logAction(`DOBLE TAP → ${currentModel.name}`);
  }

  function handleLongPress() {
    logAction('LONG PRESS → Config');
    panelMode = 'config';
    panelOpen = true;
  }

  function selectModel(index: number) {
    currentIndex = index;
    logAction(`SELECCIÓN → ${mockModels[index].name}`);
    panelOpen = false;
  }
</script>

<svelte:head>
  <title>Pruebas | Event Core</title>
</svelte:head>

<div class="pruebas">
  <header class="pruebas__header">
    <h1>Pruebas de Componentes</h1>
  </header>

  <main class="pruebas__content">
    <!-- Instrucciones -->
    <section class="pruebas__section pruebas__section--info">
      <p><strong>1 tap:</strong> Abrir lista</p>
      <p><strong>2 taps:</strong> Siguiente modelo</p>
      <p><strong>Mantener:</strong> Config</p>
    </section>

    <!-- Botón -->
    <section class="pruebas__section">
      <h2>ToolbarIcon</h2>
      <div class="pruebas__toolbar">
        <ToolbarIcon
          id="model-selector"
          icon={currentModel.icon}
          displayValue={currentModel.name}
          active={panelOpen}
          on:tap={handleTap}
          on:doubleTap={handleDoubleTap}
          on:longPress={handleLongPress}
        />
      </div>

      <div class="pruebas__status">
        <span>{currentModel.icon}</span>
        <strong>{currentModel.name}</strong>
        <code>({currentModel.provider})</code>
      </div>
    </section>

    <!-- Log -->
    <section class="pruebas__section">
      <h2>Log</h2>
      <div class="pruebas__log">
        {#if actionLog.length === 0}
          <p class="pruebas__log-empty">Toca el botón...</p>
        {:else}
          {#each actionLog as log}
            <div class="pruebas__log-item">{log}</div>
          {/each}
        {/if}
      </div>
    </section>
  </main>
</div>

<!-- Panel flotante -->
<FloatingPanel bind:open={panelOpen} on:close={() => panelOpen = false}>
  {#if panelMode === 'select'}
    <div class="select-panel">
      <h3>Seleccionar Modelo</h3>
      <div class="select-panel__list">
        {#each mockModels as model, i}
          <button
            class="select-panel__item"
            class:select-panel__item--active={i === currentIndex}
            on:click={() => selectModel(i)}
          >
            <span class="select-panel__icon">{model.icon}</span>
            <span class="select-panel__name">{model.name}</span>
            {#if i === currentIndex}
              <span class="select-panel__check">✓</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <div class="config-panel">
      <h3>⚙️ Configuración</h3>
      <p>Opciones avanzadas aquí</p>
      <button class="config-panel__close" on:click={() => panelOpen = false}>
        Cerrar
      </button>
    </div>
  {/if}
</FloatingPanel>

<style>
  .pruebas {
    min-height: 100vh;
    background: #1a1a2e;
    color: #eee;
  }

  .pruebas__header {
    padding: 1rem;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
  }

  .pruebas__header h1 {
    margin: 0;
    font-size: 1.25rem;
  }

  .pruebas__content {
    padding: 1rem;
  }

  .pruebas__section {
    background: #16213e;
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .pruebas__section--info {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    flex-wrap: wrap;
  }

  .pruebas__section--info p {
    margin: 0;
    padding: 0.5rem 0.75rem;
    background: #0f3460;
    border-radius: 6px;
  }

  .pruebas__section h2 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    color: #888;
  }

  .pruebas__toolbar {
    display: flex;
    justify-content: center;
    padding: 2rem;
    background: #0f1729;
    border-radius: 8px;

    --icon-size: 72px;
    --icon-font-size: 2rem;
    --icon-radius: 16px;
    --icon-bg: #16213e;
    --icon-bg-hover: #1e3a5f;
    --icon-bg-active: #3b82f6;
  }

  .pruebas__status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 1rem;
    padding: 0.75rem;
    background: #0f1729;
    border-radius: 8px;
    font-size: 1rem;
  }

  .pruebas__status code {
    font-size: 0.75rem;
    color: #888;
  }

  .pruebas__log {
    font-family: monospace;
    font-size: 0.75rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .pruebas__log-empty {
    color: #666;
    text-align: center;
    padding: 1rem;
    margin: 0;
  }

  .pruebas__log-item {
    padding: 0.5rem;
    border-bottom: 1px solid #0f3460;
  }

  /* Panel de selección */
  .select-panel {
    min-width: 280px;
  }

  .select-panel h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
  }

  .select-panel__list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .select-panel__item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #f3f4f6;
    border: 2px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .select-panel__item:hover {
    background: #e5e7eb;
  }

  .select-panel__item--active {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .select-panel__icon {
    font-size: 1.5rem;
  }

  .select-panel__name {
    flex: 1;
    font-weight: 500;
    color: #111;
  }

  .select-panel__check {
    color: #3b82f6;
    font-weight: bold;
  }

  /* Config panel */
  .config-panel {
    min-width: 250px;
    padding: 0.5rem;
  }

  .config-panel h3 {
    margin: 0 0 0.5rem 0;
  }

  .config-panel__close {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
</style>
