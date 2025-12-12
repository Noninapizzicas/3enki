<script lang="ts">
  /**
   * Shell - Contenedor principal de la aplicación
   *
   * Layout:
   * ┌─────────────────────────────────────────┬───┐
   * │ WorkBar (plegable)                    [▼]│   │
   * ├─────────────────────────────────────────┤ S │
   * │                                         │ y │
   * │ ChatArea (scroll)                       │ s │
   * │                                         │ t │
   * │                                         │ e │
   * ├─────────────────────────────────────────┤ m │
   * │ ChatConfig                              │ B │
   * ├─────────────────────────────────────────┤ a │
   * │ ChatInput                               │ r │
   * ├─────────────────────────────────────────┤   │
   * │ ChatTools + Attachments                 │   │
   * └─────────────────────────────────────────┴───┘
   */

  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect, activePanel, getPanelConfig, getPanelComponent } from '$lib/ui-core';
  import { initWorkspaceSubscriptions, initChatSubscriptions } from '$lib/stores';
  import { closePanel } from '$lib/stores/ui';
  import { registerAllModules } from '$lib/modules';

  import WorkBar from './WorkBar.svelte';
  import ChatArea from './ChatArea.svelte';
  import ChatConfig from './ChatConfig.svelte';
  import ChatInput from './ChatInput.svelte';
  import ChatTools from './ChatTools.svelte';
  import SystemBar from './SystemBar.svelte';
  import Panel from './Panel.svelte';

  let cleanupWorkspace: () => void;
  let cleanupChat: () => void;

  onMount(() => {
    // Registrar módulos
    registerAllModules();

    // Conectar MQTT
    connect();

    // Inicializar suscripciones
    cleanupWorkspace = initWorkspaceSubscriptions();
    cleanupChat = initChatSubscriptions();
  });

  onDestroy(() => {
    // Limpiar suscripciones
    cleanupWorkspace?.();
    cleanupChat?.();

    // Desconectar MQTT
    disconnect();
  });

  // Panel activo
  $: panelConfig = $activePanel ? getPanelConfig($activePanel) : null;
  $: PanelComponent = $activePanel ? getPanelComponent($activePanel) : null;

  function handlePanelClose() {
    closePanel();
  }
</script>

<div class="shell">
  <!-- Work Bar (top, collapsible) -->
  <WorkBar />

  <!-- Main content area -->
  <main class="main">
    <!-- Chat Area (scrollable) -->
    <ChatArea />

    <!-- Chat "Sandwich" -->
    <div class="chat-controls">
      <ChatConfig />
      <ChatInput />
      <ChatTools />
    </div>
  </main>

  <!-- System Bar (floating right) -->
  <SystemBar />

  <!-- Active Panel -->
  {#if $activePanel && panelConfig}
    <Panel
      title={panelConfig.title}
      size={panelConfig.size}
      open={true}
      on:close={handlePanelClose}
    >
      {#if PanelComponent}
        <svelte:component this={PanelComponent} panelId={$activePanel} />
      {:else}
        <p>Panel sin contenido</p>
      {/if}
    </Panel>
  {/if}
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: var(--color-bg, #121212);
    color: var(--color-text, #e5e5e5);
    overflow: hidden;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Leave space for system bar */
    margin-right: 3rem;
  }

  .chat-controls {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
</style>
