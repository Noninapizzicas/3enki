<script lang="ts">
  /**
   * Página de Pruebas - MobileChatWorkspace
   *
   * Prueba del workspace móvil completo con:
   * - Barra superior (módulo)
   * - Barra lateral (ecosistema)
   * - Barra chat sandwich (con FileBrowser, TextEditor, PdfViewer)
   */
  import MobileChatWorkspace from '$components/toolbar/uisis-MobileChatWorkspace.svelte';

  // Estado
  let message = '';
  let sending = false;
  let currentModel = 'claude-3';
  let currentCredential = 'anthropic-key';
  let notificationCount = 3;

  // Iconos del módulo actual (ejemplo)
  const moduleIcons = [
    {
      id: 'filter',
      icon: '🔍',
      label: 'Filtrar',
      actions: {
        tap: { type: 'panel', target: 'filtros', size: 'small' }
      }
    },
    {
      id: 'sort',
      icon: '↕️',
      label: 'Ordenar',
      actions: {
        tap: { type: 'panel', target: 'ordenar', size: 'small' }
      }
    }
  ];

  // Handlers
  function handleSend(e: CustomEvent<{ message: string }>) {
    console.log('📤 Send:', e.detail.message);
    sending = true;
    setTimeout(() => {
      sending = false;
      message = '';
    }, 1500);
  }

  function handleModuleAction(e: CustomEvent) {
    console.log('🧩 Module action:', e.detail);
  }

  function handleEcosystemAction(e: CustomEvent) {
    console.log('🌐 Ecosystem action:', e.detail);
  }

  function handleChatAction(e: CustomEvent) {
    console.log('💬 Chat action:', e.detail);
  }

  function handleNavigate(e: CustomEvent) {
    console.log('🚀 Navigate:', e.detail);
  }

  function handleOpenPanel(e: CustomEvent) {
    console.log('📋 Panel:', e.detail);
  }

  function handleOpenModal(e: CustomEvent) {
    console.log('🪟 Modal:', e.detail);
  }
</script>

<MobileChatWorkspace
  moduleName="Pruebas"
  {moduleIcons}
  bind:message
  {sending}
  {currentModel}
  {currentCredential}
  {notificationCount}
  on:send={handleSend}
  on:moduleAction={handleModuleAction}
  on:ecosystemAction={handleEcosystemAction}
  on:chatAction={handleChatAction}
  on:navigate={handleNavigate}
  on:openPanel={handleOpenPanel}
  on:openModal={handleOpenModal}
>
  <!-- Contenido del workspace -->
  <div class="chat-content">
    <div class="welcome">
      <h2>MobileChatWorkspace</h2>
      <p>Prueba las interacciones:</p>
      <ul>
        <li><strong>TAP</strong> - Panel selector</li>
        <li><strong>2× TAP</strong> - Panel agregar</li>
        <li><strong>HOLD</strong> - Panel config</li>
      </ul>
      <p class="hint">Abre la consola para ver los eventos</p>
    </div>
  </div>
</MobileChatWorkspace>

<style>
  .chat-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 2rem;
    text-align: center;
  }

  .welcome {
    max-width: 300px;
  }

  .welcome h2 {
    margin: 0 0 1rem;
    font-size: 1.25rem;
    color: var(--color-text, #fff);
  }

  .welcome p {
    margin: 0 0 0.75rem;
    color: var(--color-text-muted, #888);
    font-size: 0.875rem;
  }

  .welcome ul {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
    text-align: left;
  }

  .welcome li {
    padding: 0.5rem 0;
    color: var(--color-text, #fff);
    font-size: 0.8125rem;
    border-bottom: 1px solid var(--color-border, #333);
  }

  .welcome li:last-child {
    border-bottom: none;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--color-text-muted, #666);
    font-style: italic;
  }
</style>
