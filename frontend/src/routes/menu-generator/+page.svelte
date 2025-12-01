<script lang="ts">
  import { onMount } from 'svelte';
  import { MobileWorkspaceLayout } from '$components/layout';
  import { Card, Button, Badge } from '$components/ui';
  import { Spinner } from '$components/feedback';
  import { StatCard } from '$components/data';
  import { FileDropZone } from '$components/input';
  import { subscribe, events } from '$stores/mqtt';
  import { toast } from '$stores/toast';
  import config from '$lib/config';

  // Types
  interface Menu {
    id: string;
    estado: 'generando' | 'generado' | 'validado' | 'error';
    productos_count: number;
    categorias_count: number;
    created_at: string;
    file_name?: string;
  }

  interface Conversation {
    id: string;
    title?: string;
    status: 'active' | 'completed' | 'archived';
    created_at: string;
    messages_count: number;
  }

  interface Template {
    id: string;
    name: string;
    emoji: string;
    description: string;
    categories: string[];
  }

  interface Credential {
    id: string;
    name: string;
    provider: string;
    level: 'global' | 'project' | 'client';
    masked_value: string;
  }

  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    provider?: string;
    model?: string;
    loading?: boolean;
  }

  // State
  let menus: Menu[] = [];
  let conversations: Conversation[] = [];
  let templates: Template[] = [];
  let credentials: Credential[] = [];
  let chatMessages: ChatMessage[] = [];
  let loading = true;
  let chatLoading = false;

  // Current panel content
  let currentPanel = '';
  let selectedMenu: Menu | null = null;
  let selectedCredential: Credential | null = null;

  // Upload
  let uploadFiles: { file: File; id: string; progress: number; status: string }[] = [];

  // API
  const apiBase = `${config.apiUrl}/modules/menu-generator`;
  const credentialsApi = `${config.apiUrl}/modules/credential-manager`;
  const aiGatewayApi = `${config.apiUrl}/modules/ai-gateway`;

  // ===========================================
  // Button Configuration
  // ===========================================

  const topButtons = [
    {
      id: 'provider',
      emoji: '🤖',
      label: 'IA',
      primaryAction: { type: 'panel' as const, panelId: 'providers', label: 'Ver proveedores' },
      secondaryAction: { type: 'panel' as const, panelId: 'provider-add', label: 'Añadir proveedor' },
      tertiaryAction: { type: 'panel' as const, panelId: 'provider-config', label: 'Configurar' }
    },
    {
      id: 'prompt',
      emoji: '📝',
      label: 'Prompt',
      primaryAction: { type: 'panel' as const, panelId: 'prompts', label: 'Ver prompts' },
      secondaryAction: { type: 'panel' as const, panelId: 'prompt-add', label: 'Nuevo prompt' },
      tertiaryAction: { type: 'panel' as const, panelId: 'prompt-edit', label: 'Editar' }
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
      id: 'conversations',
      emoji: '💬',
      label: 'Chat',
      badge: 0,
      primaryAction: { type: 'panel' as const, panelId: 'chat', label: 'Ver chat actual' },
      secondaryAction: { type: 'panel' as const, panelId: 'conversations', label: 'Historial de chats' },
      tertiaryAction: { type: 'panel' as const, panelId: 'conversation-new', label: 'Nueva conversación' }
    },
    {
      id: 'files',
      emoji: '📎',
      label: 'Archivos',
      primaryAction: { type: 'panel' as const, panelId: 'files', label: 'Ver archivos' },
      secondaryAction: { type: 'panel' as const, panelId: 'upload', label: 'Subir archivo' }
    }
  ];

  const bottomButtons = [
    {
      id: 'templates',
      emoji: '📋',
      label: 'Plantillas',
      badge: 0,
      primaryAction: { type: 'panel' as const, panelId: 'templates', label: 'Ver plantillas' },
      secondaryAction: { type: 'panel' as const, panelId: 'template-add', label: 'Nueva plantilla' }
    },
    {
      id: 'menus',
      emoji: '🍽️',
      label: 'Menús',
      badge: 0,
      primaryAction: { type: 'panel' as const, panelId: 'menus', label: 'Ver menús' }
    },
    {
      id: 'history',
      emoji: '🕐',
      label: 'Historial',
      primaryAction: { type: 'panel' as const, panelId: 'history', label: 'Ver historial' }
    },
    {
      id: 'export',
      emoji: '⬇️',
      label: 'Exportar',
      variant: 'success' as const,
      primaryAction: { type: 'panel' as const, panelId: 'export', label: 'Exportar' }
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
      badge: 0,
      primaryAction: { type: 'panel' as const, panelId: 'credentials', label: 'Ver credenciales' },
      secondaryAction: { type: 'panel' as const, panelId: 'credential-add', label: 'Añadir credencial' },
      tertiaryAction: { type: 'panel' as const, panelId: 'credential-edit', label: 'Editar credencial' }
    },
    {
      id: 'settings',
      emoji: '⚙️',
      primaryAction: { type: 'panel' as const, panelId: 'settings', label: 'Configuración' }
    },
    {
      id: 'help',
      emoji: '❓',
      primaryAction: { type: 'panel' as const, panelId: 'help', label: 'Ayuda' }
    }
  ];

  const panels = {
    'providers': { title: 'Proveedores de IA', size: 'lg' as const },
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
    'upload': { title: 'Subir Archivo', size: 'md' as const },
    'templates': { title: 'Plantillas', size: 'lg' as const },
    'template-add': { title: 'Nueva Plantilla', size: 'md' as const },
    'menus': { title: 'Menús Generados', size: 'lg' as const },
    'menu-detail': { title: 'Detalle del Menú', size: 'full' as const },
    'history': { title: 'Historial', size: 'lg' as const },
    'export': { title: 'Exportar', size: 'md' as const },
    'credentials': { title: 'Credenciales', size: 'lg' as const },
    'credential-add': { title: 'Nueva Credencial', size: 'md' as const },
    'credential-edit': { title: 'Editar Credencial', size: 'md' as const },
    'settings': { title: 'Configuración', size: 'full' as const },
    'help': { title: 'Ayuda', size: 'md' as const },
    'chat': { title: 'Chat con IA', size: 'lg' as const }
  };

  // ===========================================
  // API Functions
  // ===========================================

  async function fetchMenus() {
    try {
      const res = await fetch(`${apiBase}/menus`);
      if (!res.ok) return;
      const data = await res.json();
      menus = data.menus || [];
    } catch (err) {
      console.error('Error fetching menus:', err);
    }
  }

  async function fetchConversations() {
    try {
      const res = await fetch(`${apiBase}/conversations`);
      if (!res.ok) return;
      const data = await res.json();
      conversations = data.conversations || [];
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  }

  async function fetchTemplates() {
    try {
      const res = await fetch(`${apiBase}/templates`);
      if (!res.ok) return;
      const data = await res.json();
      templates = data.templates || [];
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  }

  async function fetchCredentials() {
    try {
      const res = await fetch(`${credentialsApi}/credentials`);
      if (!res.ok) return;
      const data = await res.json();
      credentials = data.credentials || [];
    } catch (err) {
      console.error('Error fetching credentials:', err);
    }
  }

  async function loadAll() {
    loading = true;
    await Promise.all([fetchMenus(), fetchConversations(), fetchTemplates(), fetchCredentials()]);
    loading = false;
  }

  // ===========================================
  // Actions
  // ===========================================

  async function handleFileDrop(event: CustomEvent<File[]>) {
    const files = event.detail;
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const base64 = await fileToBase64(file);
        const res = await fetch(`${apiBase}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_base64: base64,
            file_name: file.name,
            file_type: file.type
          })
        });

        if (!res.ok) throw new Error('Error al subir');
        const data = await res.json();
        toast.success(`Menú ${data.menu_id} en proceso`);
      } catch (err) {
        toast.error(`Error subiendo ${file.name}`);
      }
    }
    await fetchMenus();
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function validateMenu(menu: Menu) {
    try {
      const res = await fetch(`${apiBase}/menus/${menu.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error('Error al validar');
      toast.success('Menú validado');
      await fetchMenus();
    } catch (err) {
      toast.error('Error validando menú');
    }
  }

  async function exportMenu(menu: Menu, format: string) {
    try {
      const res = await fetch(`${apiBase}/menus/${menu.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format })
      });
      if (!res.ok) throw new Error('Error al exportar');
      const data = await res.json();

      const blob = new Blob([data.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `menu-${menu.id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exportado como ${format.toUpperCase()}`);
    } catch (err) {
      toast.error('Error exportando');
    }
  }

  async function deleteCredential(cred: Credential) {
    if (!confirm(`¿Eliminar credencial ${cred.name}?`)) return;
    try {
      const res = await fetch(`${credentialsApi}/credentials/${cred.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Error');
      toast.success('Credencial eliminada');
      await fetchCredentials();
    } catch (err) {
      toast.error('Error eliminando credencial');
    }
  }

  // ===========================================
  // Event Handlers
  // ===========================================

  function handleButtonAction(e: CustomEvent) {
    const { buttonId, actionType, action } = e.detail;
    console.log('Button action:', buttonId, actionType, action);
  }

  async function handleChatSubmit(e: CustomEvent) {
    const { message } = e.detail;

    if (!message.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    chatMessages = [...chatMessages, userMessage];

    // Add loading placeholder for assistant
    const assistantId = `msg-${Date.now() + 1}`;
    const loadingMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true
    };
    chatMessages = [...chatMessages, loadingMessage];

    chatLoading = true;

    try {
      // Build messages for AI context
      const aiMessages = [
        {
          role: 'system',
          content: 'Eres un asistente experto en generación de menús para restaurantes. Ayudas a crear, organizar y optimizar menús gastronómicos. Responde de forma concisa y útil.'
        },
        // Include recent conversation context
        ...chatMessages
          .filter(m => !m.loading)
          .slice(-10) // Last 10 messages for context
          .map(m => ({ role: m.role, content: m.content }))
      ];

      const res = await fetch(`${aiGatewayApi}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: aiMessages,
          provider: 'auto', // Use automatic provider fallback
          max_tokens: 1000,
          temperature: 0.7
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${res.status}`);
      }

      const data = await res.json();

      // Update the loading message with actual response
      chatMessages = chatMessages.map(m =>
        m.id === assistantId
          ? {
              ...m,
              content: data.content || data.message || 'Sin respuesta',
              loading: false,
              provider: data.provider,
              model: data.model
            }
          : m
      );

    } catch (err) {
      console.error('Chat error:', err);

      // Update loading message to show error
      chatMessages = chatMessages.map(m =>
        m.id === assistantId
          ? {
              ...m,
              content: `❌ Error: ${err instanceof Error ? err.message : 'No se pudo conectar con la IA'}`,
              loading: false
            }
          : m
      );

      toast.error('Error al enviar mensaje');
    } finally {
      chatLoading = false;
    }
  }

  function handlePanelOpen(e: CustomEvent) {
    currentPanel = e.detail.panelId;
  }

  function handlePanelClose() {
    currentPanel = '';
    selectedMenu = null;
    selectedCredential = null;
  }

  function viewMenuDetail(menu: Menu) {
    selectedMenu = menu;
    currentPanel = 'menu-detail';
  }

  function editCredential(cred: Credential) {
    selectedCredential = cred;
    currentPanel = 'credential-edit';
  }

  // ===========================================
  // Reactive Updates
  // ===========================================

  // Update badges
  $: {
    const convButton = topButtons.find(b => b.id === 'conversations');
    if (convButton) convButton.badge = chatMessages.filter(m => !m.loading).length;

    const templatesButton = bottomButtons.find(b => b.id === 'templates');
    if (templatesButton) templatesButton.badge = templates.length;

    const menusButton = bottomButtons.find(b => b.id === 'menus');
    if (menusButton) menusButton.badge = menus.length;

    const credButton = sideButtons.find(b => b.id === 'credentials');
    if (credButton) credButton.badge = credentials.length;
  }

  // Stats
  $: totalMenus = menus.length;
  $: generandoCount = menus.filter(m => m.estado === 'generando').length;
  $: validadosCount = menus.filter(m => m.estado === 'validado').length;

  // MQTT updates
  $: {
    const lastEvent = $events[$events.length - 1];
    if (lastEvent) {
      if (lastEvent.type.includes('menu')) fetchMenus();
      if (lastEvent.type.includes('conversation')) fetchConversations();
      if (lastEvent.type.includes('credential')) fetchCredentials();
    }
  }

  // ===========================================
  // Helpers
  // ===========================================

  const estadoColors: Record<string, string> = {
    generando: 'warning',
    generado: 'info',
    validado: 'success',
    error: 'danger'
  };

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  onMount(() => {
    loadAll();
    subscribe([
      'core/+/events/menu/#',
      'core/+/events/menu-generator/#',
      'core/+/events/credential/#'
    ]);
  });
</script>

<svelte:head>
  <title>Menu Generator - Event-Core</title>
</svelte:head>

<MobileWorkspaceLayout
  title="Menu Generator"
  {topButtons}
  {bottomButtons}
  {sideButtons}
  {panels}
  showChat={true}
  chatPlaceholder="Describe el menú que quieres generar..."
  chatLoading={chatLoading}
  on:buttonAction={handleButtonAction}
  on:chatSubmit={handleChatSubmit}
  on:panelOpen={handlePanelOpen}
  on:panelClose={handlePanelClose}
>
  <!-- Main Content -->
  {#if loading}
    <div class="flex items-center justify-center h-full">
      <Spinner size="lg" />
    </div>
  {:else}
    <div class="space-y-4">
      <!-- Stats compactos -->
      <div class="grid grid-cols-3 gap-2">
        <div class="stat-mini">
          <span class="stat-mini__value">{totalMenus}</span>
          <span class="stat-mini__label">Menús</span>
        </div>
        <div class="stat-mini">
          <span class="stat-mini__value">{generandoCount}</span>
          <span class="stat-mini__label">Generando</span>
        </div>
        <div class="stat-mini">
          <span class="stat-mini__value">{validadosCount}</span>
          <span class="stat-mini__label">Validados</span>
        </div>
      </div>

      <!-- Quick info -->
      <Card padding="sm">
        <div class="text-center text-sm text-text-muted">
          <p class="mb-2">👆 <strong>Tap</strong> = Ver | 👆👆 <strong>Doble</strong> = Añadir | 👇 <strong>Hold</strong> = Editar</p>
          <p>Usa los botones de las barras para navegar</p>
        </div>
      </Card>

      <!-- Recent menus preview -->
      {#if menus.length > 0}
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-text-muted">Últimos menús</h3>
          {#each menus.slice(0, 3) as menu (menu.id)}
            <button
              class="w-full text-left p-3 bg-bg-card border border-border rounded-lg hover:bg-bg-hover transition-colors"
              on:click={() => viewMenuDetail(menu)}
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Badge variant={estadoColors[menu.estado]} size="sm">{menu.estado}</Badge>
                  <span class="text-sm font-mono">{menu.id.slice(-8)}</span>
                </div>
                <span class="text-xs text-text-muted">{menu.productos_count} prod.</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Panel Content -->
  <svelte:fragment slot="panel" let:panelId>
    <!-- Credentials Panel -->
    {#if panelId === 'credentials'}
      <div class="space-y-3">
        {#if credentials.length === 0}
          <p class="text-center text-text-muted py-4">No hay credenciales</p>
        {:else}
          {#each credentials as cred (cred.id)}
            <div class="flex items-center justify-between p-3 bg-bg-hover rounded-lg">
              <div class="flex items-center gap-3">
                <span class="text-xl">🔑</span>
                <div>
                  <p class="font-medium">{cred.name}</p>
                  <p class="text-xs text-text-muted">{cred.provider} • {cred.level}</p>
                </div>
              </div>
              <div class="flex gap-1">
                <button class="p-2 hover:bg-bg-card rounded" on:click={() => editCredential(cred)}>✏️</button>
                <button class="p-2 hover:bg-bg-card rounded text-danger" on:click={() => deleteCredential(cred)}>🗑️</button>
              </div>
            </div>
          {/each}
        {/if}
      </div>

    <!-- Credential Add Panel -->
    {:else if panelId === 'credential-add'}
      <form class="space-y-4" on:submit|preventDefault={() => toast.info('TODO: Guardar credencial')}>
        <div>
          <label class="block text-sm font-medium mb-1">Nombre</label>
          <input type="text" class="w-full p-2 bg-bg-input border border-border rounded-lg" placeholder="OpenAI API Key" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Proveedor</label>
          <select class="w-full p-2 bg-bg-input border border-border rounded-lg">
            <option>OpenAI</option>
            <option>Anthropic</option>
            <option>Google</option>
            <option>Otro</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">API Key</label>
          <input type="password" class="w-full p-2 bg-bg-input border border-border rounded-lg" placeholder="sk-..." />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Nivel</label>
          <select class="w-full p-2 bg-bg-input border border-border rounded-lg">
            <option value="global">Global</option>
            <option value="project">Proyecto</option>
            <option value="client">Cliente</option>
          </select>
        </div>
        <Button variant="primary" class="w-full">Guardar</Button>
      </form>

    <!-- Credential Edit Panel -->
    {:else if panelId === 'credential-edit' && selectedCredential}
      <form class="space-y-4" on:submit|preventDefault={() => toast.info('TODO: Actualizar credencial')}>
        <div>
          <label class="block text-sm font-medium mb-1">Nombre</label>
          <input type="text" class="w-full p-2 bg-bg-input border border-border rounded-lg" value={selectedCredential.name} />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Proveedor</label>
          <input type="text" class="w-full p-2 bg-bg-input border border-border rounded-lg" value={selectedCredential.provider} disabled />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Nueva API Key (dejar vacío para mantener)</label>
          <input type="password" class="w-full p-2 bg-bg-input border border-border rounded-lg" placeholder="sk-..." />
        </div>
        <Button variant="primary" class="w-full">Actualizar</Button>
        <Button variant="danger" class="w-full" on:click={() => deleteCredential(selectedCredential)}>Eliminar</Button>
      </form>

    <!-- Menus Panel -->
    {:else if panelId === 'menus'}
      <div class="space-y-3">
        {#if menus.length === 0}
          <p class="text-center text-text-muted py-4">No hay menús generados</p>
        {:else}
          {#each menus as menu (menu.id)}
            <button
              class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors"
              on:click={() => viewMenuDetail(menu)}
            >
              <div class="flex items-center justify-between mb-2">
                <Badge variant={estadoColors[menu.estado]}>{menu.estado}</Badge>
                <span class="text-xs text-text-muted">{formatDate(menu.created_at)}</span>
              </div>
              <p class="font-mono text-sm">{menu.id}</p>
              <div class="flex gap-4 mt-2 text-xs text-text-muted">
                <span>🍽️ {menu.productos_count}</span>
                <span>📁 {menu.categorias_count}</span>
              </div>
            </button>
          {/each}
        {/if}
      </div>

    <!-- Menu Detail Panel -->
    {:else if panelId === 'menu-detail' && selectedMenu}
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <span class="text-xs text-text-muted">Estado</span>
            <p><Badge variant={estadoColors[selectedMenu.estado]}>{selectedMenu.estado}</Badge></p>
          </div>
          <div>
            <span class="text-xs text-text-muted">Productos</span>
            <p class="font-medium">{selectedMenu.productos_count}</p>
          </div>
          <div>
            <span class="text-xs text-text-muted">Categorías</span>
            <p class="font-medium">{selectedMenu.categorias_count}</p>
          </div>
          <div>
            <span class="text-xs text-text-muted">Creado</span>
            <p class="text-sm">{formatDate(selectedMenu.created_at)}</p>
          </div>
        </div>

        <div class="flex gap-2">
          {#if selectedMenu.estado === 'generado'}
            <Button variant="success" class="flex-1" on:click={() => validateMenu(selectedMenu)}>✅ Validar</Button>
          {/if}
          <Button variant="secondary" class="flex-1" on:click={() => exportMenu(selectedMenu, 'json')}>📥 JSON</Button>
          <Button variant="secondary" class="flex-1" on:click={() => exportMenu(selectedMenu, 'csv')}>📊 CSV</Button>
        </div>
      </div>

    <!-- Templates Panel -->
    {:else if panelId === 'templates'}
      <div class="space-y-3">
        {#if templates.length === 0}
          <p class="text-center text-text-muted py-4">No hay plantillas</p>
        {:else}
          {#each templates as tpl (tpl.id)}
            <button class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors">
              <div class="flex items-start gap-3">
                <span class="text-2xl">{tpl.emoji}</span>
                <div>
                  <p class="font-medium">{tpl.name}</p>
                  <p class="text-xs text-text-muted">{tpl.description}</p>
                </div>
              </div>
            </button>
          {/each}
        {/if}
      </div>

    <!-- Upload Panel -->
    {:else if panelId === 'upload'}
      <div class="space-y-4">
        <p class="text-sm text-text-muted">Sube una imagen o PDF de la carta de menú:</p>
        <FileDropZone
          accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
          maxSize={20 * 1024 * 1024}
          maxFiles={5}
          bind:files={uploadFiles}
          on:drop={handleFileDrop}
          on:error={(e) => toast.error(e.detail)}
        />
      </div>

    <!-- Conversations Panel -->
    {:else if panelId === 'conversations'}
      <div class="space-y-3">
        {#if conversations.length === 0}
          <p class="text-center text-text-muted py-4">No hay conversaciones</p>
        {:else}
          {#each conversations as conv (conv.id)}
            <button class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors">
              <div class="flex items-center justify-between mb-1">
                <span class="font-medium text-sm">{conv.title || `Conv ${conv.id.slice(-6)}`}</span>
                <Badge variant={conv.status === 'active' ? 'success' : 'default'} size="sm">{conv.messages_count}</Badge>
              </div>
              <p class="text-xs text-text-muted">{formatDate(conv.created_at)}</p>
            </button>
          {/each}
        {/if}
      </div>

    <!-- Chat Panel -->
    {:else if panelId === 'chat'}
      <div class="chat-panel">
        {#if chatMessages.length === 0}
          <div class="text-center text-text-muted py-8">
            <p class="text-2xl mb-2">💬</p>
            <p>No hay mensajes aún</p>
            <p class="text-xs mt-1">Usa el chat de abajo para empezar</p>
          </div>
        {:else}
          <div class="chat-messages space-y-3">
            {#each chatMessages as msg (msg.id)}
              <div class="chat-message chat-message--{msg.role}" class:chat-message--loading={msg.loading}>
                <div class="chat-message__bubble">
                  {#if msg.loading}
                    <div class="flex items-center gap-2">
                      <span class="animate-pulse">●</span>
                      <span class="animate-pulse delay-100">●</span>
                      <span class="animate-pulse delay-200">●</span>
                    </div>
                  {:else}
                    <p class="whitespace-pre-wrap">{msg.content}</p>
                    {#if msg.provider}
                      <p class="text-xs text-text-muted mt-1 opacity-60">{msg.provider} • {msg.model}</p>
                    {/if}
                  {/if}
                </div>
                <span class="chat-message__time text-xs text-text-muted">
                  {msg.timestamp.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            {/each}
          </div>
        {/if}

        {#if chatMessages.length > 0}
          <div class="mt-4 pt-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              class="w-full"
              on:click={() => { chatMessages = []; toast.info('Chat limpiado'); }}
            >
              🗑️ Limpiar chat
            </Button>
          </div>
        {/if}
      </div>

    <!-- Help Panel -->
    {:else if panelId === 'help'}
      <div class="space-y-4 text-sm">
        <h4 class="font-medium">Sistema de gestos</h4>
        <div class="space-y-2">
          <p><strong>👆 1 Tap:</strong> Ver/Consultar información</p>
          <p><strong>👆👆 2 Taps:</strong> Añadir/Crear nuevo</p>
          <p><strong>👇 Hold 3s:</strong> Editar/Configurar</p>
        </div>
        <h4 class="font-medium mt-4">Barras de navegación</h4>
        <p><strong>Arriba:</strong> Opciones de IA y configuración</p>
        <p><strong>Abajo:</strong> Acciones y herramientas</p>
        <p><strong>Lateral:</strong> Acceso rápido (pulgar)</p>
      </div>

    <!-- Default -->
    {:else}
      <p class="text-center text-text-muted py-4">Panel: {panelId}</p>
    {/if}
  </svelte:fragment>
</MobileWorkspaceLayout>

<style>
  .stat-mini {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 0.75rem;
    text-align: center;
  }

  .stat-mini__value {
    display: block;
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1;
  }

  .stat-mini__label {
    display: block;
    font-size: 0.625rem;
    color: var(--color-text-muted);
    margin-top: 0.25rem;
    text-transform: uppercase;
  }

  /* Chat panel styles */
  .chat-panel {
    max-height: 60vh;
    overflow-y: auto;
  }

  .chat-messages {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .chat-message {
    display: flex;
    flex-direction: column;
    max-width: 85%;
  }

  .chat-message--user {
    align-self: flex-end;
    align-items: flex-end;
  }

  .chat-message--assistant {
    align-self: flex-start;
    align-items: flex-start;
  }

  .chat-message__bubble {
    padding: 0.75rem 1rem;
    border-radius: 1rem;
    word-break: break-word;
  }

  .chat-message--user .chat-message__bubble {
    background: var(--color-primary);
    color: white;
    border-bottom-right-radius: 0.25rem;
  }

  .chat-message--assistant .chat-message__bubble {
    background: var(--color-bg-hover);
    color: var(--color-text);
    border-bottom-left-radius: 0.25rem;
  }

  .chat-message--loading .chat-message__bubble {
    background: var(--color-bg-card);
  }

  .chat-message__time {
    margin-top: 0.25rem;
    font-size: 0.625rem;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  .animate-pulse {
    animation: pulse 1s infinite;
  }

  .delay-100 {
    animation-delay: 0.1s;
  }

  .delay-200 {
    animation-delay: 0.2s;
  }
</style>
