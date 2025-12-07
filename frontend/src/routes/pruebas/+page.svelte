<script lang="ts">
  /**
   * Página de Pruebas - Componente IA con triple interacción
   *
   * INTERACCIONES:
   * - 1 tap: Abre panel de selección
   * - 2 taps: Acción rápida (ej: cambiar al siguiente modelo)
   * - Long press: Panel de configuración avanzada
   */
  import { ToolbarIcon } from '$components/toolbar';
  import { FloatingPanel } from '$components/feedback';
  import { ModelProviderSelector } from '$components/ai';

  // Estado del panel
  let panelOpen = false;
  let panelMode: 'select' | 'config' = 'select';

  // Estado de selección actual
  let currentProvider = 'auto';
  let currentModel = 'Auto';

  // Log de acciones
  let actionLog: string[] = [];

  function logAction(action: string) {
    const time = new Date().toLocaleTimeString();
    actionLog = [`[${time}] ${action}`, ...actionLog.slice(0, 9)];
  }

  // Handlers de interacción
  function handleTap() {
    logAction('TAP → Abrir selector');
    panelMode = 'select';
    panelOpen = true;
  }

  function handleDoubleTap() {
    logAction('DOBLE TAP → Cambio rápido');
    // Aquí podrías ciclar entre modelos favoritos
  }

  function handleLongPress() {
    logAction('LONG PRESS → Config avanzada');
    panelMode = 'config';
    panelOpen = true;
  }

  function handleSelect(e: CustomEvent<{ provider: string; model: string }>) {
    currentProvider = e.detail.provider;
    currentModel = e.detail.model || 'Auto';
    logAction(`SELECCIÓN → ${currentProvider}:${currentModel}`);
    panelOpen = false;
  }

  function handlePanelClose() {
    panelOpen = false;
    logAction('Panel cerrado');
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
    <!-- Sección: ToolbarIcon con triple interacción -->
    <section class="pruebas__section">
      <h2>ToolbarIcon + FloatingPanel + ModelProviderSelector</h2>
      <p class="pruebas__desc">
        <strong>1 tap:</strong> Abrir selector &nbsp;|&nbsp;
        <strong>2 taps:</strong> Cambio rápido &nbsp;|&nbsp;
        <strong>Mantener:</strong> Config
      </p>

      <!-- Área del botón -->
      <div class="pruebas__toolbar">
        <ToolbarIcon
          id="model-selector"
          icon="🤖"
          displayValue={currentModel}
          active={panelOpen}
          on:tap={handleTap}
          on:doubleTap={handleDoubleTap}
          on:longPress={handleLongPress}
        />
      </div>

      <!-- Estado actual -->
      <div class="pruebas__status">
        <span class="pruebas__label">Provider:</span>
        <code>{currentProvider}</code>
        <span class="pruebas__label">Model:</span>
        <code>{currentModel}</code>
      </div>
    </section>

    <!-- Log de acciones -->
    <section class="pruebas__section pruebas__section--log">
      <h2>Log de Acciones</h2>
      <div class="pruebas__log">
        {#if actionLog.length === 0}
          <p class="pruebas__log-empty">Interactúa con el botón...</p>
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
<FloatingPanel bind:open={panelOpen} on:close={handlePanelClose}>
  {#if panelMode === 'select'}
    <ModelProviderSelector on:select={handleSelect} />
  {:else}
    <div class="config-panel">
      <h3>⚙️ Configuración Avanzada</h3>
      <p>Aquí irían opciones avanzadas:</p>
      <ul>
        <li>Límites de tokens</li>
        <li>Temperatura</li>
        <li>API Keys</li>
      </ul>
      <button on:click={() => panelOpen = false}>Cerrar</button>
    </div>
  {/if}
</FloatingPanel>

<style>
  .pruebas {
    min-height: 100vh;
    background: var(--color-bg, #1a1a2e);
    color: var(--color-text, #eee);
  }

  .pruebas__header {
    padding: 1rem;
    background: var(--color-bg-surface, #16213e);
    border-bottom: 1px solid var(--color-border, #0f3460);
  }

  .pruebas__header h1 {
    margin: 0;
    font-size: 1.25rem;
  }

  .pruebas__content {
    padding: 1rem;
  }

  .pruebas__section {
    background: var(--color-bg-surface, #16213e);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .pruebas__section h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
  }

  .pruebas__desc {
    margin: 0 0 1rem 0;
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
  }

  .pruebas__toolbar {
    display: flex;
    justify-content: center;
    padding: 2rem;
    background: var(--color-bg, #1a1a2e);
    border-radius: 8px;
    border: 2px dashed var(--color-border, #0f3460);

    /* CSS vars para ToolbarIcon */
    --icon-size: 64px;
    --icon-font-size: 2rem;
    --icon-radius: 16px;
    --icon-bg: var(--color-bg-surface, #16213e);
    --icon-bg-hover: #1e3a5f;
    --icon-bg-active: #3b82f6;
  }

  .pruebas__status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
    padding: 0.75rem;
    background: var(--color-bg, #1a1a2e);
    border-radius: 8px;
    font-size: 0.875rem;
  }

  .pruebas__label {
    color: var(--color-text-muted, #888);
  }

  .pruebas__status code {
    padding: 0.25rem 0.5rem;
    background: var(--color-primary, #3b82f6);
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .pruebas__section--log {
    max-height: 300px;
    overflow-y: auto;
  }

  .pruebas__log {
    font-family: monospace;
    font-size: 0.75rem;
  }

  .pruebas__log-empty {
    color: var(--color-text-muted, #888);
    text-align: center;
    padding: 1rem;
  }

  .pruebas__log-item {
    padding: 0.5rem;
    border-bottom: 1px solid var(--color-border, #0f3460);
  }

  .pruebas__log-item:last-child {
    border-bottom: none;
  }

  /* Config panel */
  .config-panel {
    min-width: 250px;
    padding: 0.5rem;
  }

  .config-panel h3 {
    margin: 0 0 0.5rem 0;
  }

  .config-panel ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  .config-panel button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--color-primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
</style>
