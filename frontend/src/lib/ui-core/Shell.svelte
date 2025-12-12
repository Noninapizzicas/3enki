<script lang="ts">
  /**
   * Shell - Contenedor principal de la UI modular
   *
   * NO tiene lógica de negocio.
   * Solo renderiza zonas y coordina módulos.
   */

  import { onMount, onDestroy } from 'svelte';
  import { registry, eventBus } from './index';
  import type { UIButton, UIButtonAction } from './types';

  // Props
  export let showChat = true;

  // State
  let activePanel: string | null = null;
  let activePanelModule: string | null = null;

  // Stores derivados del registry
  $: zones = $registry.buttonsByZone;
  $: panels = $registry.panels;

  // Buscar componente de panel
  $: activePanelData = activePanel
    ? panels.find(p => p.panel.id === activePanel)
    : null;

  $: PanelComponent = activePanelData
    ? registry.getModule(activePanelData.moduleId)?.PanelComponent
    : null;

  // Escuchar eventos de panel
  let unsubOpen: () => void;
  let unsubClose: () => void;

  onMount(() => {
    unsubOpen = eventBus.on('ui.panel.open', (e) => {
      const data = e.data as { panelId: string };
      activePanel = data.panelId;
      // Encontrar módulo del panel
      const panelInfo = panels.find(p => p.panel.id === data.panelId);
      activePanelModule = panelInfo?.moduleId || null;
    });

    unsubClose = eventBus.on('ui.panel.close', () => {
      activePanel = null;
      activePanelModule = null;
    });
  });

  onDestroy(() => {
    unsubOpen?.();
    unsubClose?.();
  });

  // Ejecutar acción de botón
  function executeAction(action: UIButtonAction, moduleId?: string) {
    if (action.type === 'panel' && action.panel) {
      eventBus.emit('ui.panel.open', { panelId: action.panel });
    } else if (action.type === 'emit' && action.event) {
      eventBus.emit(action.event, action.payload || {}, moduleId);
    } else if (action.type === 'navigate' && action.route) {
      // Navegación
      window.location.href = action.route;
    }
  }

  // Handlers de interacción
  function handleClick(btn: UIButton) {
    executeAction(btn.primary);
  }

  function handleDblClick(btn: UIButton) {
    if (btn.secondary) {
      executeAction(btn.secondary);
    }
  }

  // Cerrar panel
  function closePanel() {
    eventBus.emit('ui.panel.close', {});
  }

  // Obtener título del panel
  $: panelTitle = activePanelData?.panel.title || '';
</script>

<div class="shell">
  <!-- TOPBAR -->
  {#if zones.topbar.length > 0}
    <div class="shell__zone shell__zone--top">
      {#each zones.topbar as btn (btn.id)}
        <button
          class="shell__btn"
          on:click={() => handleClick(btn)}
          on:dblclick={() => handleDblClick(btn)}
          title={btn.label}
        >
          <span class="shell__btn-icon">{btn.emoji}</span>
          {#if btn.badge}
            <span class="shell__btn-badge">{btn.badge}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  <!-- SIDEBAR -->
  {#if zones.sidebar.length > 0}
    <div class="shell__zone shell__zone--side">
      {#each zones.sidebar as btn (btn.id)}
        <button
          class="shell__btn"
          on:click={() => handleClick(btn)}
          on:dblclick={() => handleDblClick(btn)}
          title={btn.label}
        >
          <span class="shell__btn-icon">{btn.emoji}</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- CENTRAL -->
  <main class="shell__content">
    <slot />
  </main>

  <!-- BOTTOMBAR + CHAT -->
  {#if showChat}
    <div class="shell__zone shell__zone--bottom">
      <!-- Chat Top -->
      {#if zones['chat-top'].length > 0}
        <div class="shell__chat-bar">
          {#each zones['chat-top'] as btn (btn.id)}
            <button
              class="shell__chat-btn"
              on:click={() => handleClick(btn)}
              on:dblclick={() => handleDblClick(btn)}
              title={btn.label}
            >
              <span>{btn.emoji}</span>
              {#if btn.label}
                <span class="shell__chat-btn-label">{btn.label}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Input -->
      <div class="shell__chat-input">
        <input type="text" placeholder="Escribe un mensaje..." />
        <button class="shell__send-btn">Enviar</button>
      </div>

      <!-- Chat Bottom -->
      {#if zones['chat-bottom'].length > 0}
        <div class="shell__chat-bar">
          {#each zones['chat-bottom'] as btn (btn.id)}
            <button
              class="shell__chat-btn"
              on:click={() => handleClick(btn)}
              on:dblclick={() => handleDblClick(btn)}
              title={btn.label}
            >
              <span>{btn.emoji}</span>
              {#if btn.label}
                <span class="shell__chat-btn-label">{btn.label}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- PANEL FLOTANTE -->
  {#if activePanel && PanelComponent}
    <div class="shell__overlay" on:click={closePanel} on:keydown={() => {}}>
      <div class="shell__panel" on:click|stopPropagation on:keydown={() => {}}>
        <div class="shell__panel-header">
          <span>{panelTitle}</span>
          <button class="shell__panel-close" on:click={closePanel}>✕</button>
        </div>
        <div class="shell__panel-content">
          <svelte:component this={PanelComponent} panelId={activePanel} />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0a0a0a;
    color: #fff;
    font-family: system-ui, sans-serif;
  }

  /* Zonas */
  .shell__zone {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    background: #111;
    border: 1px solid #222;
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
    border-bottom: none;
    border-left: none;
    border-right: none;
    gap: 0;
  }

  /* Contenido */
  .shell__content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  /* Botones */
  .shell__btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1px solid #333;
    border-radius: 8px;
    background: #1a1a1a;
    cursor: pointer;
    transition: all 0.15s;
  }

  .shell__btn:hover {
    background: #2a2a2a;
    border-color: #444;
  }

  .shell__btn-icon {
    font-size: 1.25rem;
  }

  .shell__btn-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    font-size: 0.65rem;
    background: #ef4444;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Chat */
  .shell__chat-bar {
    display: flex;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem;
    background: #151515;
    overflow-x: auto;
  }

  .shell__chat-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.625rem;
    border: 1px solid #333;
    border-radius: 6px;
    background: #1a1a1a;
    color: #fff;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .shell__chat-btn:hover {
    background: #2a2a2a;
  }

  .shell__chat-btn-label {
    color: #888;
  }

  .shell__chat-input {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    background: #111;
  }

  .shell__chat-input input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid #333;
    border-radius: 6px;
    background: #1a1a1a;
    color: #fff;
    font-size: 0.875rem;
  }

  .shell__send-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    background: #3b82f6;
    color: #fff;
    cursor: pointer;
  }

  /* Panel */
  .shell__overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .shell__panel {
    width: 90%;
    max-width: 400px;
    max-height: 80vh;
    background: #111;
    border: 1px solid #333;
    border-radius: 12px;
    overflow: hidden;
  }

  .shell__panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: #1a1a1a;
    border-bottom: 1px solid #333;
    font-weight: 500;
  }

  .shell__panel-close {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #888;
    cursor: pointer;
  }

  .shell__panel-close:hover {
    background: #333;
    color: #fff;
  }

  .shell__panel-content {
    overflow-y: auto;
    max-height: calc(80vh - 50px);
  }
</style>
