<script lang="ts">
  import { MobileWorkspaceLayout } from '$components/layout';
  import { toast } from '$stores/toast';

  // Ejemplo: Configuración de botones para Menu Generator
  const topButtons = [
    {
      id: 'provider',
      emoji: '🤖',
      label: 'IA',
      primaryAction: { type: 'panel' as const, panelId: 'provider', label: 'Ver proveedores' },
      secondaryAction: { type: 'panel' as const, panelId: 'provider-add', label: 'Añadir proveedor' },
      tertiaryAction: { type: 'panel' as const, panelId: 'provider-config', label: 'Configurar' }
    },
    {
      id: 'prompt',
      emoji: '📝',
      label: 'Prompt',
      badge: 3,
      primaryAction: { type: 'panel' as const, panelId: 'prompts', label: 'Ver prompts' },
      secondaryAction: { type: 'panel' as const, panelId: 'prompt-add', label: 'Añadir prompt' },
      tertiaryAction: { type: 'panel' as const, panelId: 'prompt-edit', label: 'Editar prompt' }
    },
    {
      id: 'project',
      emoji: '📁',
      label: 'Proyecto',
      primaryAction: { type: 'panel' as const, panelId: 'projects', label: 'Ver proyectos' },
      secondaryAction: { type: 'panel' as const, panelId: 'project-add', label: 'Nuevo proyecto' },
      tertiaryAction: { type: 'panel' as const, panelId: 'project-edit', label: 'Editar proyecto' }
    },
    {
      id: 'conversation',
      emoji: '💬',
      label: 'Conv',
      badge: 2,
      primaryAction: { type: 'panel' as const, panelId: 'conversations', label: 'Ver conversaciones' },
      secondaryAction: { type: 'panel' as const, panelId: 'conversation-new', label: 'Nueva conversación' }
    },
    {
      id: 'files',
      emoji: '📎',
      label: 'Archivos',
      primaryAction: { type: 'panel' as const, panelId: 'files', label: 'Ver archivos' },
      secondaryAction: { type: 'panel' as const, panelId: 'file-upload', label: 'Subir archivo' }
    }
  ];

  const bottomButtons = [
    {
      id: 'templates',
      emoji: '📋',
      label: 'Plantillas',
      primaryAction: { type: 'panel' as const, panelId: 'templates', label: 'Ver plantillas' },
      secondaryAction: { type: 'panel' as const, panelId: 'template-add', label: 'Nueva plantilla' }
    },
    {
      id: 'history',
      emoji: '🕐',
      label: 'Historial',
      primaryAction: { type: 'panel' as const, panelId: 'history', label: 'Ver historial' }
    },
    {
      id: 'settings',
      emoji: '⚙️',
      label: 'Config',
      primaryAction: { type: 'panel' as const, panelId: 'settings', label: 'Configuración' }
    },
    {
      id: 'download',
      emoji: '⬇️',
      label: 'Exportar',
      variant: 'success' as const,
      primaryAction: { type: 'emit' as const, label: 'Exportar menú' }
    }
  ];

  const sideButtons = [
    {
      id: 'home',
      emoji: '🏠',
      primaryAction: { type: 'navigate' as const, target: '/', label: 'Inicio' }
    },
    {
      id: 'credentials',
      emoji: '🔐',
      primaryAction: { type: 'panel' as const, panelId: 'credentials', label: 'Ver credenciales' },
      secondaryAction: { type: 'panel' as const, panelId: 'credential-add', label: 'Añadir' },
      tertiaryAction: { type: 'panel' as const, panelId: 'credential-edit', label: 'Editar' }
    },
    {
      id: 'help',
      emoji: '❓',
      primaryAction: { type: 'panel' as const, panelId: 'help', label: 'Ayuda' }
    }
  ];

  const panels = {
    'provider': { title: 'Proveedores de IA', size: 'lg' as const },
    'provider-add': { title: 'Añadir Proveedor', size: 'md' as const },
    'provider-config': { title: 'Configurar Proveedor', size: 'full' as const },
    'prompts': { title: 'Mis Prompts', size: 'lg' as const },
    'prompt-add': { title: 'Nuevo Prompt', size: 'md' as const },
    'prompt-edit': { title: 'Editar Prompt', size: 'full' as const },
    'projects': { title: 'Proyectos', size: 'lg' as const },
    'project-add': { title: 'Nuevo Proyecto', size: 'md' as const },
    'project-edit': { title: 'Editar Proyecto', size: 'full' as const },
    'conversations': { title: 'Conversaciones', size: 'lg' as const },
    'conversation-new': { title: 'Nueva Conversación', size: 'md' as const },
    'files': { title: 'Archivos', size: 'lg' as const },
    'file-upload': { title: 'Subir Archivo', size: 'md' as const },
    'templates': { title: 'Plantillas', size: 'lg' as const },
    'template-add': { title: 'Nueva Plantilla', size: 'md' as const },
    'history': { title: 'Historial', size: 'lg' as const },
    'settings': { title: 'Configuración', size: 'full' as const },
    'credentials': { title: 'Credenciales', size: 'lg' as const },
    'credential-add': { title: 'Añadir Credencial', size: 'md' as const },
    'credential-edit': { title: 'Editar Credencial', size: 'md' as const },
    'help': { title: 'Ayuda', size: 'md' as const }
  };

  let currentPanel = '';

  function handleButtonAction(e: CustomEvent) {
    const { buttonId, actionType, action } = e.detail;
    toast.info(`${actionType}: ${action.label}`);
  }

  function handleChatSubmit(e: CustomEvent) {
    const { message } = e.detail;
    toast.success(`Mensaje enviado: ${message}`);
  }

  function handlePanelOpen(e: CustomEvent) {
    currentPanel = e.detail.panelId;
  }

  function handlePanelClose() {
    currentPanel = '';
  }
</script>

<svelte:head>
  <title>Workspace - Event-Core</title>
</svelte:head>

<MobileWorkspaceLayout
  title="Menu Generator"
  {topButtons}
  {bottomButtons}
  {sideButtons}
  {panels}
  showChat={true}
  chatPlaceholder="Describe el menú que quieres generar..."
  on:buttonAction={handleButtonAction}
  on:chatSubmit={handleChatSubmit}
  on:panelOpen={handlePanelOpen}
  on:panelClose={handlePanelClose}
>
  <!-- Contenido principal -->
  <div class="workspace-content">
    <div class="workspace-header">
      <h1>Menu Generator</h1>
      <p class="text-text-muted">Workspace de prueba - Sistema de pulsaciones</p>
    </div>

    <div class="workspace-info">
      <div class="info-card">
        <span class="info-icon">👆</span>
        <div>
          <strong>1 Tap</strong>
          <p>Ver / Consultar</p>
        </div>
      </div>
      <div class="info-card">
        <span class="info-icon">👆👆</span>
        <div>
          <strong>2 Taps</strong>
          <p>Añadir / Crear</p>
        </div>
      </div>
      <div class="info-card">
        <span class="info-icon">👇</span>
        <div>
          <strong>Hold 3s</strong>
          <p>Editar / Configurar</p>
        </div>
      </div>
    </div>

    <div class="workspace-demo">
      <p>Prueba los botones de las barras:</p>
      <ul>
        <li><strong>Arriba:</strong> Opciones de IA (proveedor, prompts, proyecto, conversaciones, archivos)</li>
        <li><strong>Abajo:</strong> Acciones (plantillas, historial, config, exportar)</li>
        <li><strong>Lateral:</strong> Acceso rápido (inicio, credenciales, ayuda)</li>
      </ul>
    </div>
  </div>

  <!-- Panel content slot -->
  <svelte:fragment slot="panel" let:panelId>
    <div class="panel-content">
      {#if panelId === 'credentials'}
        <p>Lista de credenciales configuradas...</p>
        <div class="credential-item">
          <span>🔑</span>
          <div>
            <strong>OpenAI</strong>
            <p class="text-text-muted text-sm">sk-***************</p>
          </div>
        </div>
        <div class="credential-item">
          <span>🔑</span>
          <div>
            <strong>Anthropic</strong>
            <p class="text-text-muted text-sm">sk-ant-***************</p>
          </div>
        </div>
      {:else if panelId === 'prompts'}
        <p>Prompts guardados:</p>
        <div class="prompt-item">Genera un menú italiano tradicional</div>
        <div class="prompt-item">Crea carta de tapas españolas</div>
        <div class="prompt-item">Menú de cafetería moderna</div>
      {:else if panelId === 'help'}
        <h3>Gestos disponibles</h3>
        <p><strong>Tap:</strong> Ver elemento</p>
        <p><strong>Doble tap:</strong> Crear nuevo</p>
        <p><strong>Mantener 3s:</strong> Editar</p>
      {:else}
        <p>Panel: {panelId}</p>
        <p class="text-text-muted">Contenido del panel...</p>
      {/if}
    </div>
  </svelte:fragment>
</MobileWorkspaceLayout>

<style>
  .workspace-content {
    max-width: 600px;
    margin: 0 auto;
  }

  .workspace-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .workspace-header h1 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .workspace-info {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    margin-bottom: 2rem;
  }

  .info-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 1rem;
    text-align: center;
  }

  .info-icon {
    font-size: 1.5rem;
    display: block;
    margin-bottom: 0.5rem;
  }

  .info-card strong {
    display: block;
    font-size: 0.875rem;
  }

  .info-card p {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .workspace-demo {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 1rem;
  }

  .workspace-demo ul {
    margin: 0.5rem 0 0 1rem;
    font-size: 0.875rem;
  }

  .workspace-demo li {
    margin-bottom: 0.5rem;
  }

  .panel-content {
    min-height: 200px;
  }

  .credential-item,
  .prompt-item {
    background: var(--color-bg-hover);
    border-radius: 8px;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .prompt-item {
    font-size: 0.875rem;
  }
</style>
