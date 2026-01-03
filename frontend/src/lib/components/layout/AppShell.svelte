<script lang="ts">
  /**
   * AppShell - Layout base reutilizable para todas las páginas
   *
   * Layout:
   * ┌─────────────────────────────────────────┬───────┐
   * │ slot:top-bar                         [▼]│       │
   * ├─────────────────────────────────────────┤ System│
   * │                                         │  Bar  │
   * │ slot:content (área principal scroll)    │       │
   * │                                         │       │
   * ├─────────────────────────────────────────┤       │
   * │ slot:controls (controles)               │       │
   * ├─────────────────────────────────────────┤       │
   * │ slot:tools (herramientas)               │       │
   * └─────────────────────────────────────────┴───────┘
   * + LazyPanel (modales/paneles dinámicos)
   * + ToastContainer (notificaciones)
   *
   * Uso:
   * <AppShell>
   *   <WorkBar slot="top-bar" />
   *   <MyContent slot="content" />
   *   <MyControls slot="controls" />
   *   <MyTools slot="tools" />
   * </AppShell>
   */

  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect, activePanel, setupVisibilityHandler, removeVisibilityHandler } from '$lib/ui-core';
  import { closePanel } from '$lib/stores/ui';
  import {
    initWorkspaceSubscriptions,
    initProjectsSubscriptions
  } from '$lib/stores';
  import { registerAllModules, unregisterAllModules } from '$lib/modules';
  import { perfStart, perfEnd, logMsg } from '$lib/utils/perf';

  import SystemBar from './SystemBar.svelte';
  import LazyPanel from './LazyPanel.svelte';
  import { ToastContainer } from '$lib/components/base';

  // Props opcionales para configuración
  export let showSystemBar = true;
  export let showTopBar = true;
  export let showTools = true;

  // Callbacks para inicialización adicional por página
  export let onConnected: (() => void) | null = null;

  let cleanupWorkspace: (() => void) | null = null;
  let cleanupProjects: (() => void) | null = null;

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
      // Inicializar proyectos (compartido entre páginas)
      perfStart('AppShell.initProjects');
      cleanupProjects = initProjectsSubscriptions();
      perfEnd('AppShell.initProjects');
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
  <!-- Top Bar (slot) -->
  {#if showTopBar}
    <header class="top-bar">
      <slot name="top-bar" />
    </header>
  {/if}

  <!-- Main content area -->
  <main class="main" class:no-system-bar={!showSystemBar}>
    <!-- Content Area (scrollable) -->
    <div class="content">
      <slot name="content" />
    </div>

    <!-- Controls + Tools -->
    <div class="bottom-area">
      <slot name="controls" />
      {#if showTools}
        <slot name="tools" />
      {/if}
    </div>
  </main>

  <!-- System Bar (floating right) -->
  {#if showSystemBar}
    <SystemBar />
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

  .top-bar {
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
