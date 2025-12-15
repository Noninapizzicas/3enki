<script lang="ts">
  /**
   * Shell - Contenedor principal (SIMPLIFICADO)
   *
   * Sin sistema de módulos - componentes cargados directamente
   */

  import { onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';
  import { connect, disconnect } from '$lib/ui-core';
  import { initWorkspaceSubscriptions, initChatSubscriptions } from '$lib/stores';

  import WorkBar from './WorkBar.svelte';
  import ChatArea from './ChatArea.svelte';
  import ChatConfig from './ChatConfig.svelte';
  import ChatInput from './ChatInput.svelte';
  import ChatTools from './ChatTools.svelte';
  import SystemBar from './SystemBar.svelte';
  import Panel from './Panel.svelte';
  import { ToastContainer } from '$lib/components/base';

  // Paneles - importados directamente (sin lazy loading)
  import ProjectPanel from '$lib/modules/project/ProjectPanel.svelte';
  import ProviderPanel from '$lib/modules/provider/ProviderPanel.svelte';
  import PromptsPanel from '$lib/modules/prompts/PromptsPanel.svelte';
  import CredentialsPanel from '$lib/modules/credentials/CredentialsPanel.svelte';
  import HistoryPanel from '$lib/modules/history/HistoryPanel.svelte';
  import FilesPanel from '$lib/modules/files/FilesPanel.svelte';
  import EditorPanel from '$lib/modules/editor/EditorPanel.svelte';
  import PdfPanel from '$lib/modules/pdf/PdfPanel.svelte';

  // Panel activo - store simple exportado para los hijos
  export const activePanel = writable<string | null>(null);

  // Configuración de paneles
  const panelConfig: Record<string, { component: typeof ProjectPanel; title: string; size: string }> = {
    'project-selector': { component: ProjectPanel, title: 'Seleccionar Proyecto', size: 'md' },
    'provider-selector': { component: ProviderPanel, title: 'Seleccionar Provider', size: 'md' },
    'prompts-manager': { component: PromptsPanel, title: 'Prompts', size: 'lg' },
    'credentials-manager': { component: CredentialsPanel, title: 'Credenciales', size: 'md' },
    'history-viewer': { component: HistoryPanel, title: 'Historial', size: 'lg' },
    'files-browser': { component: FilesPanel, title: 'Archivos', size: 'md' },
    'code-editor': { component: EditorPanel, title: 'Editor', size: 'lg' },
    'pdf-viewer': { component: PdfPanel, title: 'PDF', size: 'lg' }
  };

  let cleanupWorkspace: (() => void) | null = null;
  let cleanupChat: (() => void) | null = null;

  onMount(() => {
    console.log('[Shell] Mounting...');
    cleanupWorkspace = initWorkspaceSubscriptions();
    cleanupChat = initChatSubscriptions();
    connect().catch(e => console.error('[Shell] MQTT:', e));
    console.log('[Shell] Ready');
  });

  onDestroy(() => {
    cleanupWorkspace?.();
    cleanupChat?.();
    disconnect();
  });

  function closePanel() {
    activePanel.set(null);
  }

  $: currentPanel = $activePanel ? panelConfig[$activePanel] : null;
</script>

<div class="shell">
  <WorkBar />

  <main class="main">
    <ChatArea />
    <div class="chat-controls">
      <ChatConfig {activePanel} />
      <ChatInput />
      <ChatTools {activePanel} />
    </div>
  </main>

  <SystemBar />
  <ToastContainer />

  {#if $activePanel && currentPanel}
    <Panel
      title={currentPanel.title}
      size={currentPanel.size}
      position="top"
      open={true}
      on:close={closePanel}
    >
      <svelte:component this={currentPanel.component} />
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
    margin-right: 3rem;
  }

  .chat-controls {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
</style>
