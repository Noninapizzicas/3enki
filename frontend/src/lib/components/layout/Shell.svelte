<script lang="ts">
  /**
   * Shell - Página de Chat
   *
   * Usa AppShell como base y añade componentes específicos de chat:
   * - WorkBar: Barra superior con proyecto activo
   * - ChatArea: Área de mensajes (scrollable)
   * - ChatConfig: Configuración de conversación
   * - ChatInput: Entrada de mensajes
   * - ChatTools: Herramientas y archivos adjuntos
   */

  import { onDestroy } from 'svelte';
  import { initChatSubscriptions, initConversations } from '$lib/stores';
  import { perfStart, perfEnd, logMsg } from '$lib/utils/perf';

  import AppShell from './AppShell.svelte';
  import WorkBar from './WorkBar.svelte';
  import ChatArea from './ChatArea.svelte';
  import ChatConfig from './ChatConfig.svelte';
  import ChatInput from './ChatInput.svelte';
  import ChatTools from './ChatTools.svelte';

  let cleanupChat: (() => void) | null = null;
  let cleanupConversations: (() => void) | null = null;

  // Inicialización específica de Chat cuando MQTT está conectado
  function handleConnected() {
    perfStart('Shell.initChat');
    cleanupChat = initChatSubscriptions();
    cleanupConversations = initConversations();
    perfEnd('Shell.initChat');
    logMsg('✅ Chat initialized');
  }

  // Cleanup específico de Chat (AppShell maneja lo base)
  onDestroy(() => {
    if (cleanupChat) cleanupChat();
    if (cleanupConversations) cleanupConversations();
  });
</script>

<AppShell onConnected={handleConnected}>
  <!-- Top Bar -->
  <WorkBar slot="top-bar" />

  <!-- Chat Area (scrollable messages) -->
  <ChatArea slot="content" />

  <!-- Chat Controls -->
  <svelte:fragment slot="controls">
    <ChatConfig />
    <ChatInput />
  </svelte:fragment>

  <!-- Chat Tools (files, attachments) -->
  <ChatTools slot="tools" />
</AppShell>
