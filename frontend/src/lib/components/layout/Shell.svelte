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
   *
   * Paneles se cargan BAJO DEMANDA al abrirlos.
   */

  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect, activePanel } from '$lib/ui-core';
  import { closePanel } from '$lib/stores/ui';
  import { initWorkspaceSubscriptions, initChatSubscriptions } from '$lib/stores';
  import { registerAllModules, unregisterAllModules } from '$lib/modules';
  import { perfStart, perfEnd, logMsg } from '$lib/utils/perf';

  import WorkBar from './WorkBar.svelte';
  import ChatArea from './ChatArea.svelte';
  import ChatConfig from './ChatConfig.svelte';
  import ChatInput from './ChatInput.svelte';
  import ChatTools from './ChatTools.svelte';
  import SystemBar from './SystemBar.svelte';
  import LazyPanel from './LazyPanel.svelte';
  import { ToastContainer } from '$lib/components/base';

  let cleanupWorkspace: (() => void) | null = null;
  let cleanupChat: (() => void) | null = null;

  onMount(() => {
    perfStart('Shell.onMount.TOTAL');
    logMsg('🚀 Shell mounting...');

    // 1. Registrar módulos UI (para botones, no carga componentes)
    perfStart('Shell.registerAllModules');
    registerAllModules();
    perfEnd('Shell.registerAllModules');

    // 2. Inicializar subscripciones
    perfStart('Shell.initSubscriptions');
    cleanupWorkspace = initWorkspaceSubscriptions();
    cleanupChat = initChatSubscriptions();
    perfEnd('Shell.initSubscriptions');

    // 3. Conectar a MQTT en background
    perfStart('Shell.connect.start');
    connect().catch((error) => {
      logMsg('❌ MQTT connection failed', { error: String(error) });
    });
    perfEnd('Shell.connect.start');

    perfEnd('Shell.onMount.TOTAL');
    logMsg('✅ Shell.onMount completed - UI visible');
  });

  onDestroy(() => {
    console.log('[Shell] Destroying...');

    // 1. Desregistrar módulos (cleanup HMR)
    unregisterAllModules();

    // 2. Limpiar subscripciones
    if (cleanupWorkspace) {
      cleanupWorkspace();
    }
    if (cleanupChat) {
      cleanupChat();
    }

    // 3. Desconectar MQTT
    disconnect();
    console.log('[Shell] Disconnected');
  });

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

  <!-- Toast notifications -->
  <ToastContainer />

  <!-- Active Panel (LAZY LOADED) -->
  {#if $activePanel}
    <LazyPanel
      panelId={$activePanel}
      open={true}
      on:close={handlePanelClose}
    />
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
