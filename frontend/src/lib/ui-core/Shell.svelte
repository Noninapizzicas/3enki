<script lang="ts">
  /**
   * Shell - Contenedor principal de la UI modular
   *
   * Responsabilidades:
   * - Renderizar zonas dinámicamente según módulos registrados
   * - Gestionar apertura/cierre de paneles
   * - Ejecutar acciones de botones
   * - Accesibilidad (keyboard navigation, aria labels)
   */

  import { onMount, onDestroy } from 'svelte';
  import { subscribe, publish, status, connected } from './mqtt';
  import { buttonsByZone, panels, getModule } from './registry';
  import type { UIButton, UIButtonAction, PanelSize, ActivePanel } from './types';

  // ===========================================================================
  // PROPS
  // ===========================================================================

  /** Mostrar zona de chat */
  export let showChat = true;

  // ===========================================================================
  // ESTADO
  // ===========================================================================

  let activePanel: ActivePanel | null = null;

  // Panel actual con datos completos
  $: activePanelData = activePanel
    ? $panels.find((p) => p.panel.id === activePanel?.panelId)
    : null;

  // Componente del panel activo
  $: PanelComponent = activePanelData
    ? getModule(activePanelData.moduleId)?.PanelComponent
    : null;

  // Título del panel
  $: panelTitle = activePanelData?.panel.title ?? '';

  // Tamaño del panel
  $: panelSize = activePanelData?.panel.size ?? 'md';

  // ===========================================================================
  // SUSCRIPCIONES MQTT
  // ===========================================================================

  let unsubOpen: (() => void) | null = null;
  let unsubClose: (() => void) | null = null;

  onMount(() => {
    // Escuchar apertura de panel
    unsubOpen = subscribe('ui/panel/open', (_topic, payload) => {
      const data = payload as { panelId: string; moduleId?: string };
      const panelInfo = $panels.find((p) => p.panel.id === data.panelId);

      if (panelInfo) {
        activePanel = {
          panelId: data.panelId,
          moduleId: data.moduleId ?? panelInfo.moduleId
        };
      }
    });

    // Escuchar cierre de panel
    unsubClose = subscribe('ui/panel/close', () => {
      activePanel = null;
    });
  });

  onDestroy(() => {
    unsubOpen?.();
    unsubClose?.();
  });

  // ===========================================================================
  // ACCIONES
  // ===========================================================================

  function executeAction(action: UIButtonAction): void {
    switch (action.type) {
      case 'panel':
        publish('ui/panel/open', { panelId: action.panelId });
        break;

      case 'publish':
        publish(action.topic, action.payload ?? {});
        break;

      case 'navigate':
        window.location.href = action.route;
        break;
    }
  }

  function handleButtonClick(btn: UIButton): void {
    executeAction(btn.action);
  }

  function closePanel(): void {
    publish('ui/panel/close', {});
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && activePanel) {
      closePanel();
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  function getPanelMaxWidth(size: PanelSize): string {
    const sizes: Record<PanelSize, string> = {
      sm: '320px',
      md: '400px',
      lg: '560px',
      xl: '720px',
      full: '100%'
    };
    return sizes[size];
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="shell" class:shell--disconnected={!$connected}>
  <!-- INDICADOR DE CONEXIÓN -->
  {#if $status !== 'connected'}
    <div class="shell__status" role="status" aria-live="polite">
      {#if $status === 'connecting'}
        Conectando al servidor...
      {:else if $status === 'error'}
        Error de conexión
      {:else}
        Desconectado
      {/if}
    </div>
  {/if}

  <!-- TOPBAR -->
  {#if $buttonsByZone.topbar.length > 0}
    <nav class="shell__zone shell__zone--top" aria-label="Barra superior">
      {#each $buttonsByZone.topbar as btn (btn.id)}
        <button
          class="shell__btn"
          on:click={() => handleButtonClick(btn)}
          aria-label={btn.label}
          title={btn.label}
        >
          <span class="shell__btn-icon" aria-hidden="true">{btn.emoji}</span>
          {#if btn.badge !== undefined}
            <span class="shell__btn-badge" aria-label="{btn.badge} notificaciones">
              {btn.badge}
            </span>
          {/if}
        </button>
      {/each}
    </nav>
  {/if}

  <!-- SIDEBAR -->
  {#if $buttonsByZone.sidebar.length > 0}
    <nav class="shell__zone shell__zone--side" aria-label="Barra lateral">
      {#each $buttonsByZone.sidebar as btn (btn.id)}
        <button
          class="shell__btn"
          on:click={() => handleButtonClick(btn)}
          aria-label={btn.label}
          title={btn.label}
        >
          <span class="shell__btn-icon" aria-hidden="true">{btn.emoji}</span>
          {#if btn.badge !== undefined}
            <span class="shell__btn-badge">{btn.badge}</span>
          {/if}
        </button>
      {/each}
    </nav>
  {/if}

  <!-- CONTENIDO PRINCIPAL -->
  <main class="shell__content">
    <slot />
  </main>

  <!-- ZONA CHAT -->
  {#if showChat}
    <div class="shell__zone shell__zone--bottom">
      <!-- Botones chat-top -->
      {#if $buttonsByZone['chat-top'].length > 0}
        <div class="shell__chat-bar" role="toolbar" aria-label="Acciones de chat">
          {#each $buttonsByZone['chat-top'] as btn (btn.id)}
            <button
              class="shell__chat-btn"
              on:click={() => handleButtonClick(btn)}
              aria-label={btn.label}
              title={btn.label}
            >
              <span aria-hidden="true">{btn.emoji}</span>
              <span class="shell__chat-btn-label">{btn.label}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Input de chat -->
      <form class="shell__chat-input" on:submit|preventDefault>
        <label for="chat-input" class="visually-hidden">Mensaje</label>
        <input
          id="chat-input"
          type="text"
          placeholder="Escribe un mensaje..."
          disabled={!$connected}
        />
        <button
          type="submit"
          class="shell__send-btn"
          disabled={!$connected}
          aria-label="Enviar mensaje"
        >
          Enviar
        </button>
      </form>

      <!-- Botones chat-bottom -->
      {#if $buttonsByZone['chat-bottom'].length > 0}
        <div class="shell__chat-bar" role="toolbar">
          {#each $buttonsByZone['chat-bottom'] as btn (btn.id)}
            <button
              class="shell__chat-btn"
              on:click={() => handleButtonClick(btn)}
              aria-label={btn.label}
              title={btn.label}
            >
              <span aria-hidden="true">{btn.emoji}</span>
              <span class="shell__chat-btn-label">{btn.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- BOTTOMBAR -->
  {#if $buttonsByZone.bottombar.length > 0}
    <nav class="shell__zone shell__zone--bottombar" aria-label="Barra inferior">
      {#each $buttonsByZone.bottombar as btn (btn.id)}
        <button
          class="shell__btn"
          on:click={() => handleButtonClick(btn)}
          aria-label={btn.label}
          title={btn.label}
        >
          <span class="shell__btn-icon" aria-hidden="true">{btn.emoji}</span>
        </button>
      {/each}
    </nav>
  {/if}

  <!-- PANEL MODAL -->
  {#if activePanel && PanelComponent}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="shell__overlay"
      on:click={closePanel}
      on:keydown={(e) => e.key === 'Escape' && closePanel()}
      role="presentation"
    >
      <div
        class="shell__panel"
        style="max-width: {getPanelMaxWidth(panelSize)}"
        on:click|stopPropagation
        on:keydown|stopPropagation
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        tabindex="-1"
      >
        <header class="shell__panel-header">
          <h2 id="panel-title" class="shell__panel-title">{panelTitle}</h2>
          <button
            class="shell__panel-close"
            on:click={closePanel}
            aria-label="Cerrar panel"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </header>
        <div class="shell__panel-content">
          <svelte:component this={PanelComponent} panelId={activePanel.panelId} />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* ===========================================================================
   * UTILIDADES
   * =========================================================================== */

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* ===========================================================================
   * SHELL BASE
   * =========================================================================== */

  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--shell-bg, #0a0a0a);
    color: var(--shell-text, #fff);
    font-family: system-ui, -apple-system, sans-serif;
  }

  .shell--disconnected {
    opacity: 0.7;
  }

  /* ===========================================================================
   * STATUS BAR
   * =========================================================================== */

  .shell__status {
    padding: 0.5rem 1rem;
    background: var(--shell-warning, #b45309);
    color: #fff;
    text-align: center;
    font-size: 0.875rem;
  }

  /* ===========================================================================
   * ZONAS
   * =========================================================================== */

  .shell__zone {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--shell-zone-bg, #111);
    border: 1px solid var(--shell-border, #222);
  }

  .shell__zone--top {
    border-top: none;
    border-left: none;
    border-right: none;
  }

  .shell__zone--side {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    flex-direction: column;
    border-radius: 8px 0 0 8px;
    z-index: 10;
  }

  .shell__zone--bottom {
    flex-direction: column;
    gap: 0;
    border-bottom: none;
    border-left: none;
    border-right: none;
  }

  .shell__zone--bottombar {
    justify-content: center;
    border-top: none;
    border-left: none;
    border-right: none;
    border-bottom: none;
  }

  /* ===========================================================================
   * CONTENIDO
   * =========================================================================== */

  .shell__content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  /* ===========================================================================
   * BOTONES
   * =========================================================================== */

  .shell__btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--shell-btn-border, #333);
    border-radius: 8px;
    background: var(--shell-btn-bg, #1a1a1a);
    color: var(--shell-text, #fff);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .shell__btn:hover {
    background: var(--shell-btn-hover, #2a2a2a);
    border-color: var(--shell-btn-border-hover, #444);
  }

  .shell__btn:focus-visible {
    outline: 2px solid var(--shell-focus, #3b82f6);
    outline-offset: 2px;
  }

  .shell__btn-icon {
    font-size: 1.25rem;
  }

  .shell__btn-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    font-size: 0.7rem;
    font-weight: 600;
    background: var(--shell-badge, #ef4444);
    color: #fff;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ===========================================================================
   * CHAT
   * =========================================================================== */

  .shell__chat-bar {
    display: flex;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem;
    background: var(--shell-chat-bar, #151515);
    overflow-x: auto;
  }

  .shell__chat-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--shell-btn-border, #333);
    border-radius: 6px;
    background: var(--shell-btn-bg, #1a1a1a);
    color: var(--shell-text, #fff);
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .shell__chat-btn:hover {
    background: var(--shell-btn-hover, #2a2a2a);
  }

  .shell__chat-btn:focus-visible {
    outline: 2px solid var(--shell-focus, #3b82f6);
    outline-offset: 2px;
  }

  .shell__chat-btn-label {
    color: var(--shell-text-secondary, #888);
  }

  .shell__chat-input {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--shell-zone-bg, #111);
  }

  .shell__chat-input input {
    flex: 1;
    padding: 0.625rem 0.875rem;
    border: 1px solid var(--shell-btn-border, #333);
    border-radius: 6px;
    background: var(--shell-btn-bg, #1a1a1a);
    color: var(--shell-text, #fff);
    font-size: 0.875rem;
  }

  .shell__chat-input input:focus {
    outline: none;
    border-color: var(--shell-focus, #3b82f6);
  }

  .shell__chat-input input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .shell__send-btn {
    padding: 0.625rem 1.25rem;
    border: none;
    border-radius: 6px;
    background: var(--shell-primary, #3b82f6);
    color: #fff;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .shell__send-btn:hover:not(:disabled) {
    background: var(--shell-primary-hover, #2563eb);
  }

  .shell__send-btn:focus-visible {
    outline: 2px solid var(--shell-focus, #3b82f6);
    outline-offset: 2px;
  }

  .shell__send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ===========================================================================
   * PANEL MODAL
   * =========================================================================== */

  .shell__overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }

  .shell__panel {
    width: 100%;
    max-height: 85vh;
    background: var(--shell-zone-bg, #111);
    border: 1px solid var(--shell-border, #333);
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .shell__panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.875rem 1rem;
    background: var(--shell-btn-bg, #1a1a1a);
    border-bottom: 1px solid var(--shell-border, #333);
  }

  .shell__panel-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }

  .shell__panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--shell-text-secondary, #888);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .shell__panel-close:hover {
    background: var(--shell-btn-border, #333);
    color: var(--shell-text, #fff);
  }

  .shell__panel-close:focus-visible {
    outline: 2px solid var(--shell-focus, #3b82f6);
    outline-offset: 2px;
  }

  .shell__panel-content {
    flex: 1;
    overflow-y: auto;
  }
</style>
