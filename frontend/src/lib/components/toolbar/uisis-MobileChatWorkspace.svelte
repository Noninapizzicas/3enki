<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ModuleToolbar from './uisis-ModuleToolbar.svelte';
  import EcosystemToolbar from './uisis-EcosystemToolbar.svelte';
  import ChatToolbar from './uisis-ChatToolbar.svelte';
  import type { ToolbarIconConfig, ActionConfig } from './uisis-FloatingToolbar.svelte';

  /**
   * MobileChatWorkspace - Layout completo para pantalla móvil con chat
   *
   * Integra:
   * - Barra superior (módulo) - configurable
   * - Barra lateral (ecosistema) - estable
   * - Barra chat (sandwich) - fija
   * - Zona central (chat history + contenido)
   *
   * Ver CONTEXT_UI.md y blueprints/mobile-chat-screen.yaml
   */

  // Props
  export let moduleName: string = '';
  export let moduleIcons: ToolbarIconConfig[] = [];
  export let currentModel: string = '';
  export let currentCredential: string = '';
  export let notificationCount: number = 0;
  export let sending: boolean = false;
  export let projectId: string | null = null;
  export let currentFile: { name: string; path: string; extension?: string } | null = null;
  let className = '';
  export { className as class };

  // Estado de mensaje
  export let message = '';

  const dispatch = createEventDispatcher<{
    send: { message: string };
    moduleAction: {
      type: 'tap' | 'doubleTap' | 'longPress';
      iconId: string;
      action?: ActionConfig;
      moduleName: string;
    };
    ecosystemAction: {
      type: 'tap' | 'doubleTap' | 'longPress';
      iconId: string;
      action?: ActionConfig;
    };
    chatAction: {
      type: 'tap' | 'doubleTap' | 'longPress';
      iconId: string;
      action?: ActionConfig;
      bar: 'top' | 'bottom';
    };
    expandInput: void;
    openPanel: { target: string; size: 'small' | 'medium' | 'full' };
    openModal: { target: string; size: 'small' | 'medium' | 'full' };
    navigate: { moduleId: string };
  }>();

  // Estado de barras expandidas
  let moduleToolbarExpanded = false;
  let ecosystemToolbarExpanded = false;

  // Panel/Modal activo
  let activePanel: { target: string; size: string } | null = null;
  let activeModal: { target: string; size: string } | null = null;

  // Handlers de acciones
  function handleAction(action: ActionConfig | undefined) {
    if (!action) return;

    if (action.type === 'panel') {
      activePanel = { target: action.target, size: action.size || 'medium' };
      dispatch('openPanel', { target: action.target, size: action.size || 'medium' });
    } else if (action.type === 'modal') {
      activeModal = { target: action.target, size: action.size || 'medium' };
      dispatch('openModal', { target: action.target, size: action.size || 'medium' });
    } else if (action.type === 'navigate') {
      dispatch('navigate', { moduleId: action.target });
    } else if (action.type === 'emit-event') {
      // El padre maneja eventos custom
    }
  }

  function handleModuleAction(event: CustomEvent) {
    dispatch('moduleAction', event.detail);
    handleAction(event.detail.action);
  }

  function handleEcosystemAction(event: CustomEvent) {
    dispatch('ecosystemAction', event.detail);
    handleAction(event.detail.action);
  }

  function handleChatAction(event: CustomEvent) {
    dispatch('chatAction', event.detail);
    handleAction(event.detail.action);
  }

  function handleSend(event: CustomEvent<{ message: string }>) {
    dispatch('send', event.detail);
  }

  function handleExpandInput() {
    dispatch('expandInput');
  }

  function closePanel() {
    activePanel = null;
  }

  function closeModal() {
    activeModal = null;
  }

  // Calcular padding para zona central
  $: mainPadding = {
    top: '52px',    // Barra superior
    right: '52px',  // Barra lateral
    bottom: '140px' // Barra chat (3 filas)
  };
</script>

<div class="mobile-chat-workspace relative w-full h-screen overflow-hidden bg-bg {className}">
  <!-- Barra Superior (Módulo) -->
  <ModuleToolbar
    {moduleName}
    icons={moduleIcons}
    expanded={moduleToolbarExpanded}
    on:action={handleModuleAction}
    on:expand={() => moduleToolbarExpanded = true}
    on:collapse={() => moduleToolbarExpanded = false}
  />

  <!-- Barra Lateral (Ecosistema) -->
  <EcosystemToolbar
    {notificationCount}
    expanded={ecosystemToolbarExpanded}
    on:action={handleEcosystemAction}
    on:navigate
    on:expand={() => ecosystemToolbarExpanded = true}
    on:collapse={() => ecosystemToolbarExpanded = false}
  />

  <!-- Zona Central (Chat History + Contenido) -->
  <main
    class="main-content absolute inset-0 overflow-y-auto"
    style="
      padding-top: {mainPadding.top};
      padding-right: {mainPadding.right};
      padding-bottom: {mainPadding.bottom};
    "
  >
    <slot>
      <!-- Contenido por defecto: placeholder para chat history -->
      <div class="flex items-center justify-center h-full text-text-muted">
        <p>Zona de chat y contenido del módulo</p>
      </div>
    </slot>
  </main>

  <!-- Barra Chat (Sandwich) -->
  <ChatToolbar
    bind:message
    {currentModel}
    {currentCredential}
    {sending}
    {projectId}
    {currentFile}
    on:send={handleSend}
    on:action={handleChatAction}
    on:expandInput={handleExpandInput}
  />

  <!-- Overlay para paneles -->
  {#if activePanel}
    <div
      class="panel-overlay fixed inset-0 bg-black/30 z-200"
      on:click={closePanel}
      on:keydown={(e) => e.key === 'Escape' && closePanel()}
      role="button"
      tabindex="0"
      aria-label="Cerrar panel"
    >
      <div
        class="panel absolute bottom-0 left-0 right-0 bg-bg-card rounded-t-2xl shadow-xl transform transition-transform"
        class:h-[30vh]={activePanel.size === 'small'}
        class:h-[50vh]={activePanel.size === 'medium'}
        class:h-[80vh]={activePanel.size === 'full'}
        on:click|stopPropagation
        on:keydown|stopPropagation
        role="dialog"
        aria-modal="true"
      >
        <!-- Handle para arrastrar -->
        <div class="flex justify-center py-2">
          <div class="w-10 h-1 bg-border rounded-full"></div>
        </div>

        <!-- Contenido del panel -->
        <div class="panel-content px-4 pb-4 overflow-y-auto h-[calc(100%-2rem)]">
          <slot name="panel" target={activePanel.target}>
            <p class="text-text-muted text-center py-8">
              Panel: {activePanel.target}
            </p>
          </slot>
        </div>
      </div>
    </div>
  {/if}

  <!-- Overlay para modales -->
  {#if activeModal}
    <div
      class="modal-overlay fixed inset-0 bg-black/50 z-300 flex items-center justify-center p-4"
      on:click={closeModal}
      on:keydown={(e) => e.key === 'Escape' && closeModal()}
      role="button"
      tabindex="0"
      aria-label="Cerrar modal"
    >
      <div
        class="modal bg-bg-card rounded-2xl shadow-2xl transform transition-transform max-h-[90vh] overflow-hidden"
        class:w-full={activeModal.size === 'full'}
        class:max-w-md={activeModal.size === 'medium'}
        class:max-w-sm={activeModal.size === 'small'}
        on:click|stopPropagation
        on:keydown|stopPropagation
        role="dialog"
        aria-modal="true"
      >
        <!-- Header del modal -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 class="text-lg font-semibold text-text">
            <slot name="modal-title" target={activeModal.target}>
              {activeModal.target}
            </slot>
          </h2>
          <button
            class="p-1 text-text-muted hover:text-text transition-colors"
            on:click={closeModal}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <!-- Contenido del modal -->
        <div class="modal-content p-4 overflow-y-auto max-h-[calc(90vh-4rem)]">
          <slot name="modal" target={activeModal.target}>
            <p class="text-text-muted text-center py-8">
              Modal: {activeModal.target}
            </p>
          </slot>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .mobile-chat-workspace {
    /* Prevenir scroll del body */
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .main-content {
    -webkit-overflow-scrolling: touch;
  }

  /* Animaciones de paneles */
  .panel {
    animation: slideUp 0.2s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  /* Animaciones de modales */
  .modal {
    animation: scaleIn 0.2s ease-out;
  }

  @keyframes scaleIn {
    from {
      transform: scale(0.95);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
