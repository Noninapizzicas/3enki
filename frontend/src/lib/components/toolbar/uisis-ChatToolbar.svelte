<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ToolbarIcon from './uisis-ToolbarIcon.svelte';
  import type { ActionConfig } from './uisis-FloatingToolbar.svelte';

  // Componentes uisis- con paneles auto-gestionados
  import { FileBrowserButton } from '$components/files';
  import { TextEditorButton } from '$components/editor';
  import { PdfViewerButton } from '$components/pdf';
  import { AIButton } from '$components/ai';
  import { CredentialButton } from '$components/credentials';
  import { PromptButton } from '$components/prompts';
  import { ConversationButton } from '$components/conversations';

  /**
   * ChatToolbar - Barra de chat con estructura sandwich
   *
   * Siguiendo CONTEXT_UI.md:
   * - Estructura: Sub-barra superior + Input + Sub-barra inferior
   * - Posición: Parte inferior de la pantalla
   * - Dominio: Todo lo relacionado con IA y Chat
   * - Configuración: FIJA (no cambia por módulo)
   *
   * Sub-barra superior: Lo que PREPARA el mensaje (modelo, creds, prompt, historial)
   * Sub-barra inferior: Lo que COMPLEMENTA el mensaje (tools, adjuntar, contexto, plugins)
   */

  // Props
  export let message = '';
  export let placeholder = 'Escribe aquí...';
  export let sending = false;
  export let currentModel: string = '';
  export let currentCredential: string = '';
  export let projectId: string | null = null;
  export let currentFile: { name: string; path: string; extension?: string } | null = null;
  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher<{
    send: { message: string };
    action: {
      type: 'tap' | 'doubleTap' | 'longPress';
      iconId: string;
      action?: ActionConfig;
      bar: 'top' | 'bottom';
    };
    expandInput: void;
    // Eventos de file browser
    fileSelect: { file: unknown };
    fileAdd: { path: string };
    // Eventos de editor
    editorOpen: { file: unknown };
    editorSave: { file: unknown; content: string };
    // Eventos de PDF
    pdfOpen: { file: unknown };
    pdfExtractText: { text: string };
  }>();

  // Nota: Los iconos de la barra superior ahora son componentes uisis- Button
  // que auto-gestionan sus propios paneles (AIButton, CredentialButton, etc.)

  // Iconos fijos - Sub-barra inferior (Adyacentes)
  const bottomBarIcons = [
    {
      id: 'herramientas',
      icon: '🔧',
      label: 'Tools',
      actions: {
        tap: { type: 'panel' as const, target: 'tools-disponibles', size: 'medium' as const },
        longPress: { type: 'modal' as const, target: 'tools-config', size: 'full' as const }
      }
    },
    {
      id: 'adjuntar',
      icon: '📎',
      label: 'Adjuntar',
      actions: {
        tap: { type: 'panel' as const, target: 'adjuntar-archivo', size: 'small' as const }
      }
    },
    {
      id: 'contexto',
      icon: '📋',
      label: 'Contexto',
      actions: {
        tap: { type: 'panel' as const, target: 'contexto-actual', size: 'medium' as const },
        doubleTap: { type: 'modal' as const, target: 'contexto-editar', size: 'medium' as const },
        longPress: { type: 'modal' as const, target: 'contexto-gestionar', size: 'full' as const }
      }
    },
    {
      id: 'plugins',
      icon: '🔌',
      label: 'Plugins',
      actions: {
        tap: { type: 'panel' as const, target: 'plugins-activos', size: 'medium' as const },
        longPress: { type: 'modal' as const, target: 'plugins-gestionar', size: 'full' as const }
      }
    }
  ];

  // Estado del input
  let inputElement: HTMLTextAreaElement;
  let tapCount = 0;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;

  // Handler de iconos para barra inferior (los de la barra superior son componentes uisis-)
  function handleBottomIconEvent(type: 'tap' | 'doubleTap' | 'longPress') {
    return (event: CustomEvent<{ id: string }>) => {
      const icon = bottomBarIcons.find(i => i.id === event.detail.id);
      dispatch('action', {
        type,
        iconId: event.detail.id,
        action: icon?.actions?.[type],
        bar: 'bottom'
      });
    };
  }

  // Handler de envío
  function handleSend() {
    if (!message.trim() || sending) return;
    dispatch('send', { message: message.trim() });
    message = '';
  }

  // Handler de teclas en input
  function handleKeydown(e: KeyboardEvent) {
    // Enter = nueva línea (NO enviar)
    // Solo Ctrl+Enter o Cmd+Enter envía
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  // Doble tap en input para expandir
  function handleInputTap() {
    tapCount++;

    if (tapCount === 1) {
      tapTimer = setTimeout(() => {
        tapCount = 0;
      }, 300);
    } else if (tapCount === 2) {
      if (tapTimer) clearTimeout(tapTimer);
      tapCount = 0;
      dispatch('expandInput');
    }
  }

</script>

<div class="chat-toolbar fixed bottom-0 left-0 right-0 z-100 bg-bg-card/95 backdrop-blur-sm border-t border-border {className}">
  <!-- Sub-barra superior (Chat directo) - Componentes uisis- con paneles auto-gestionados -->
  <div class="chat-bar-top flex items-center gap-1 px-2 py-1 border-b border-border/50">
    <!-- Modelo IA (uisis- con panel auto-gestionado) -->
    <AIButton
      size="sm"
      showLabel={false}
      on:selectModel={(e) => dispatch('action', { type: 'tap', iconId: 'modelo', bar: 'top' })}
    />

    <!-- Credenciales (uisis- con panel auto-gestionado) -->
    <CredentialButton
      size="sm"
      showLabel={false}
      {projectId}
      on:select={(e) => dispatch('action', { type: 'tap', iconId: 'credencial', bar: 'top' })}
    />

    <!-- Prompts (uisis- con panel auto-gestionado) -->
    <PromptButton
      size="sm"
      showLabel={false}
      {projectId}
      on:select={(e) => dispatch('action', { type: 'tap', iconId: 'prompt', bar: 'top' })}
    />

    <!-- Conversaciones/Historial (uisis- con panel auto-gestionado) -->
    <ConversationButton
      size="sm"
      showLabel={false}
      {projectId}
      on:select={(e) => dispatch('action', { type: 'tap', iconId: 'historial', bar: 'top' })}
    />

    <!-- Indicador de modelo activo -->
    {#if currentModel}
      <span class="ml-auto text-xs text-text-muted truncate max-w-[100px]">
        {currentModel}
      </span>
    {/if}
  </div>

  <!-- Input de mensaje (el relleno del sandwich) -->
  <div class="chat-input flex items-center gap-2 px-3 py-2">
    <textarea
      bind:this={inputElement}
      bind:value={message}
      {placeholder}
      disabled={sending}
      rows="1"
      class="flex-1 resize-none bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
      on:keydown={handleKeydown}
      on:click={handleInputTap}
    ></textarea>

    <button
      type="button"
      class="send-btn flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-primary-hover active:scale-95"
      disabled={!message.trim() || sending}
      on:click={handleSend}
      aria-label="Enviar mensaje"
    >
      {#if sending}
        <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      {:else}
        <span class="text-lg">➤</span>
      {/if}
    </button>
  </div>

  <!-- Sub-barra inferior (Adyacentes) -->
  <div class="chat-bar-bottom flex items-center gap-1 px-2 py-1 border-t border-border/50">
    <!-- File Browser (uisis- con paneles auto-gestionados) -->
    <FileBrowserButton
      size="sm"
      showLabel={false}
      {projectId}
      on:select={(e) => dispatch('fileSelect', { file: e.detail.file })}
      on:add={(e) => dispatch('fileAdd', { path: e.detail.path })}
    />

    <!-- Text Editor (uisis- con paneles auto-gestionados) -->
    <TextEditorButton
      size="sm"
      showLabel={false}
      file={currentFile}
      {projectId}
      on:openEditor={(e) => dispatch('editorOpen', { file: e.detail.file })}
      on:save={(e) => dispatch('editorSave', { file: e.detail.file, content: e.detail.content })}
    />

    <!-- PDF Viewer (uisis- con paneles auto-gestionados) -->
    <PdfViewerButton
      size="sm"
      showLabel={false}
      file={currentFile?.extension === 'pdf' ? currentFile : null}
      {projectId}
      on:openViewer={(e) => dispatch('pdfOpen', { file: e.detail.file })}
      on:extractText={(e) => dispatch('pdfExtractText', { text: e.detail.text })}
    />

    <!-- Separador visual -->
    <div class="w-px h-6 bg-border/50 mx-1"></div>

    <!-- Iconos estáticos (tools, adjuntar, contexto, plugins) -->
    {#each bottomBarIcons as icon (icon.id)}
      <ToolbarIcon
        id={icon.id}
        icon={icon.icon}
        label={icon.label}
        badge={icon.badge}
        showLabel={false}
        orientation="horizontal"
        on:tap={handleBottomIconEvent('tap')}
        on:doubleTap={handleBottomIconEvent('doubleTap')}
        on:longPress={handleBottomIconEvent('longPress')}
      />
    {/each}
  </div>

  <!-- Safe area para móviles -->
  <div class="h-[env(safe-area-inset-bottom,0)]"></div>
</div>

<style>
  .chat-toolbar {
    /* Sombra hacia arriba */
    box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .chat-input textarea {
    max-height: 80px;
    min-height: 40px;
    line-height: 1.4;
  }

  /* Hint visual para doble tap */
  .chat-input textarea:focus::placeholder {
    opacity: 0.5;
  }

  .send-btn {
    flex-shrink: 0;
  }
</style>
