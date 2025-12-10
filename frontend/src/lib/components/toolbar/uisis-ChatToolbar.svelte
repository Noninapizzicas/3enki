<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ToolbarIcon from './uisis-ToolbarIcon.svelte';
  import type { ActionConfig } from './uisis-FloatingToolbar.svelte';

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
  }>();

  // Iconos fijos - Sub-barra superior (Chat directo)
  const topBarIcons = [
    {
      id: 'modelo',
      icon: '🤖',
      label: 'Modelo IA',
      actions: {
        tap: { type: 'panel' as const, target: 'modelo-selector', size: 'small' as const },
        doubleTap: { type: 'modal' as const, target: 'modelo-config', size: 'medium' as const },
        longPress: { type: 'modal' as const, target: 'modelos-gestionar', size: 'full' as const }
      }
    },
    {
      id: 'credencial',
      icon: '🔑',
      label: 'API Key',
      actions: {
        tap: { type: 'panel' as const, target: 'credencial-selector', size: 'small' as const },
        doubleTap: { type: 'modal' as const, target: 'credencial-crear', size: 'medium' as const },
        longPress: { type: 'modal' as const, target: 'credenciales-gestionar', size: 'full' as const }
      }
    },
    {
      id: 'prompt',
      icon: '📝',
      label: 'Prompt',
      actions: {
        tap: { type: 'panel' as const, target: 'prompts-rapidos', size: 'medium' as const },
        doubleTap: { type: 'modal' as const, target: 'prompt-crear', size: 'medium' as const },
        longPress: { type: 'modal' as const, target: 'prompts-gestionar', size: 'full' as const }
      }
    },
    {
      id: 'historial',
      icon: '💬',
      label: 'Historial',
      actions: {
        tap: { type: 'panel' as const, target: 'conversaciones', size: 'medium' as const },
        longPress: { type: 'modal' as const, target: 'historial-gestionar', size: 'full' as const }
      }
    }
  ];

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

  // Handlers de iconos
  function handleIconEvent(bar: 'top' | 'bottom', type: 'tap' | 'doubleTap' | 'longPress') {
    return (event: CustomEvent<{ id: string }>) => {
      const icons = bar === 'top' ? topBarIcons : bottomBarIcons;
      const icon = icons.find(i => i.id === event.detail.id);
      dispatch('action', {
        type,
        iconId: event.detail.id,
        action: icon?.actions?.[type],
        bar
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

  // Badges dinámicos
  $: {
    const modelIcon = topBarIcons.find(i => i.id === 'modelo');
    if (modelIcon && currentModel) {
      // Mostrar abreviación del modelo
      modelIcon.badge = currentModel.slice(0, 3);
    }
  }
</script>

<div class="chat-toolbar fixed bottom-0 left-0 right-0 z-100 bg-bg-card/95 backdrop-blur-sm border-t border-border {className}">
  <!-- Sub-barra superior (Chat directo) -->
  <div class="chat-bar-top flex items-center gap-1 px-2 py-1 border-b border-border/50">
    {#each topBarIcons as icon (icon.id)}
      <ToolbarIcon
        id={icon.id}
        icon={icon.icon}
        label={icon.label}
        badge={icon.badge}
        showLabel={false}
        orientation="horizontal"
        on:tap={handleIconEvent('top', 'tap')}
        on:doubleTap={handleIconEvent('top', 'doubleTap')}
        on:longPress={handleIconEvent('top', 'longPress')}
      />
    {/each}

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
    {#each bottomBarIcons as icon (icon.id)}
      <ToolbarIcon
        id={icon.id}
        icon={icon.icon}
        label={icon.label}
        badge={icon.badge}
        showLabel={false}
        orientation="horizontal"
        on:tap={handleIconEvent('bottom', 'tap')}
        on:doubleTap={handleIconEvent('bottom', 'doubleTap')}
        on:longPress={handleIconEvent('bottom', 'longPress')}
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
