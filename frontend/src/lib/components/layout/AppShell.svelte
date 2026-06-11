<script lang="ts">
  /**
   * AppShell - Layout base para todas las páginas
   *
   * Layout fijo:
   * ┌─────────────────────────────────────────┬───────┐
   * │ slot:work-bar (módulos de página)       │       │
   * ├─────────────────────────────────────────┤ System│
   * │                                         │  Bar  │
   * │ slot:content (área principal scroll)    │       │
   * │                                         │       │
   * ├─────────────────────────────────────────┤       │
   * │ 📁 🤖 🧘 💬 🔐  ChatConfig (FIJO)       │       │
   * ├─────────────────────────────────────────┤       │
   * │ [____ChatInput____] ➤  (FIJO)          │       │
   * ├─────────────────────────────────────────┤       │
   * │ 🗂️ ChatTools (FIJO)                    │       │
   * └─────────────────────────────────────────┴───────┘
   *
   * Uso:
   * <AppShell>
   *   <MyWorkBarModules slot="work-bar" />
   *   <MyContent slot="content" />
   * </AppShell>
   */

  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect, activePanel, setupVisibilityHandler, removeVisibilityHandler } from '$lib/ui-core';
  import { closePanel } from '$lib/stores/ui';
  import {
    initWorkspaceSubscriptions,
    initProjectsSubscriptions,
    initChatSubscriptions,
    initConversations
  } from '$lib/stores';
  import { registerAllModules, unregisterAllModules } from '$lib/modules';
  import { perfStart, perfEnd, logMsg } from '$lib/utils/perf';

  import PageNavStrip from './PageNavStrip.svelte';
  import ChatConfig from './ChatConfig.svelte';
  import ChatInput from './ChatInput.svelte';
  import ChatTools from './ChatTools.svelte';
  import LazyPanel from './LazyPanel.svelte';
  import SetupRequiredPanel from '$lib/components/SetupRequiredPanel.svelte';
  import { ToastContainer } from '$lib/components/base';

  // Props opcionales para configuración
  export let showSystemBar = true;
  export let showWorkBar = true;
  export let showChatInput = true;
  export let showChatTools = true;

  // Callbacks para inicialización adicional por página
  export let onConnected: (() => void) | null = null;

  let cleanupWorkspace: (() => void) | null = null;
  let cleanupProjects: (() => void) | null = null;
  let cleanupChat: (() => void) | null = null;
  let cleanupConversations: (() => void) | null = null;

  onMount(() => {
    perfStart('AppShell.onMount.TOTAL');
    logMsg('🚀 AppShell mounting...');

    // 1. Registrar módulos UI (para botones, no carga componentes)
    perfStart('AppShell.registerAllModules');
    registerAllModules();
    perfEnd('AppShell.registerAllModules');

    // 2. Inicializar subscripciones base
    perfStart('AppShell.initSubscriptions');
    cleanupWorkspace = initWorkspaceSubscriptions();
    perfEnd('AppShell.initSubscriptions');

    // 3. Conectar a MQTT en background
    perfStart('AppShell.connect.start');
    connect().then(() => {
      // Inicializar proyectos
      perfStart('AppShell.initProjects');
      cleanupProjects = initProjectsSubscriptions();
      perfEnd('AppShell.initProjects');

      // Inicializar chat (siempre disponible)
      perfStart('AppShell.initChat');
      cleanupChat = initChatSubscriptions();
      cleanupConversations = initConversations();
      perfEnd('AppShell.initChat');

      logMsg('✅ AppShell connected');

      // Callback para inicialización adicional por página
      if (onConnected) {
        onConnected();
      }
    }).catch((error) => {
      logMsg('❌ MQTT connection failed', { error: String(error) });
    });
    perfEnd('AppShell.connect.start');

    // 4. Registrar handler de visibilidad (HyperOS/MIUI fix)
    setupVisibilityHandler();

    perfEnd('AppShell.onMount.TOTAL');
    logMsg('✅ AppShell.onMount completed');
  });

  onDestroy(() => {
    console.log('[AppShell] Destroying...');

    // 1. Desregistrar módulos
    unregisterAllModules();

    // 2. Limpiar subscripciones
    if (cleanupWorkspace) cleanupWorkspace();
    if (cleanupProjects) cleanupProjects();
    if (cleanupChat) cleanupChat();
    if (cleanupConversations) cleanupConversations();

    // 3. Desconectar MQTT
    disconnect();

    // 4. Remover handler de visibilidad
    removeVisibilityHandler();

    console.log('[AppShell] Disconnected');
  });

  function handlePanelClose() {
    closePanel();
  }
</script>

<div class="app-shell">
  <!-- Work Bar: módulos específicos de página -->
  {#if showWorkBar}
    <header class="work-bar">
      <slot name="work-bar" />
    </header>
  {/if}

  <!-- Main content area -->
  <main class="main" class:no-system-bar={!showSystemBar}>
    <!-- Content Area (scrollable) -->
    <div class="content">
      <slot name="content" />
    </div>

    <!-- Bottom Area: Config + Input + Tools (FIJO) -->
    <div class="bottom-area">
      <!-- ChatConfig: 📁 🤖 🧘 💬 🔐 -->
      <ChatConfig />

      <!-- ChatInput: siempre disponible -->
      {#if showChatInput}
        <ChatInput />
      {/if}

      <!-- ChatTools: 🗂️ -->
      {#if showChatTools}
        <ChatTools />
      {/if}
    </div>

    <!-- SetupRequiredPanel: aparece cuando falta project o conversation activos -->
    <SetupRequiredPanel />
  </main>

  <!-- Right rail: navegación de páginas (contextual) + paneles de sistema.
       Sustituye a SystemBar: el rail incluye sus paneles en la seccion inferior. -->
  {#if showSystemBar}
    <PageNavStrip />
  {/if}

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
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: var(--color-bg, #121212);
    color: var(--color-text, #e5e5e5);
    overflow: hidden;
  }

  .work-bar {
    flex-shrink: 0;
  }

  .main {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin-right: 3rem; /* Space for system bar */
  }

  .main.no-system-bar {
    margin-right: 0;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .bottom-area {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
</style>
