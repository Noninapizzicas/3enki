<script lang="ts">
  import { onMount } from 'svelte';
  import { Header } from '$components/layout';
  import { Card, Button, Badge } from '$components/ui';
  import { Modal, Spinner } from '$components/feedback';
  import { StatCard, Table } from '$components/data';
  import { Tabs } from '$components/navigation';
  import { ConversationPanel, ChatInput } from '$components/ai';
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
    validated_at?: string;
    file_name?: string;
  }

  interface Conversation {
    id: string;
    title?: string;
    status: 'active' | 'completed' | 'archived';
    created_at: string;
    messages_count: number;
    menu_id?: string;
  }

  interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    status?: 'sending' | 'sent' | 'error';
  }

  interface Template {
    id: string;
    name: string;
    emoji: string;
    description: string;
    categories: string[];
  }

  // State
  let menus: Menu[] = [];
  let conversations: Conversation[] = [];
  let templates: Template[] = [];
  let loading = true;
  let error: string | null = null;

  // Tabs
  const tabItems = [
    { id: 'menus', label: 'Menús', icon: '📋' },
    { id: 'chat', label: 'Chat AI', icon: '💬' },
    { id: 'templates', label: 'Templates', icon: '📝' }
  ];
  let activeTab = 'menus';

  // Chat state
  let currentConversation: Conversation | null = null;
  let messages: Message[] = [];
  let chatLoading = false;
  let streamingContent = '';

  // Upload state
  let uploadFiles: { file: File; id: string; progress: number; status: string }[] = [];
  let uploading = false;

  // Modal state
  let menuDetailModal = false;
  let selectedMenu: Menu | null = null;
  let menuDetail: Record<string, unknown> | null = null;

  // Badge colors
  const estadoColors: Record<string, string> = {
    generando: 'warning',
    generado: 'info',
    validado: 'success',
    error: 'danger'
  };

  // API
  const apiBase = `${config.apiUrl}/modules/menu-generator`;

  async function fetchMenus() {
    try {
      const res = await fetch(`${apiBase}/menus`);
      if (!res.ok) throw new Error('Error al cargar menús');
      const data = await res.json();
      menus = data.menus || [];
    } catch (err) {
      console.error('Error fetching menus:', err);
    }
  }

  async function fetchConversations() {
    try {
      const res = await fetch(`${apiBase}/conversations`);
      if (!res.ok) throw new Error('Error al cargar conversaciones');
      const data = await res.json();
      conversations = data.conversations || [];
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  }

  async function fetchTemplates() {
    try {
      const res = await fetch(`${apiBase}/templates`);
      if (!res.ok) throw new Error('Error al cargar templates');
      const data = await res.json();
      templates = data.templates || [];
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  }

  async function loadAll() {
    loading = true;
    error = null;
    try {
      await Promise.all([fetchMenus(), fetchConversations(), fetchTemplates()]);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }

  // Upload handling
  async function handleFileDrop(event: CustomEvent<File[]>) {
    const files = event.detail;
    if (files.length === 0) return;

    uploading = true;

    for (const file of files) {
      try {
        // Convert to base64
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

        if (!res.ok) throw new Error('Error al subir archivo');

        const data = await res.json();
        toast.success(`Menú ${data.menu_id} en proceso de generación`);

        // Update file status
        uploadFiles = uploadFiles.map(f =>
          f.file === file ? { ...f, status: 'success', progress: 100 } : f
        );
      } catch (err) {
        toast.error(`Error subiendo ${file.name}`);
        uploadFiles = uploadFiles.map(f =>
          f.file === file ? { ...f, status: 'error' } : f
        );
      }
    }

    uploading = false;
    await fetchMenus();
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Remove data:...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Menu actions
  async function viewMenu(menu: Menu) {
    selectedMenu = menu;
    menuDetailModal = true;
    try {
      const res = await fetch(`${apiBase}/menus/${menu.id}`);
      if (!res.ok) throw new Error('Error al cargar detalles');
      menuDetail = await res.json();
    } catch (err) {
      toast.error('Error cargando detalles del menú');
    }
  }

  async function validateMenu(menu: Menu) {
    if (!confirm('¿Confirmar validación del menú?')) return;
    try {
      const res = await fetch(`${apiBase}/menus/${menu.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error('Error al validar');
      toast.success('Menú validado correctamente');
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

      // Download
      const blob = new Blob([data.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `menu-${menu.id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Menú exportado como ${format.toUpperCase()}`);
    } catch (err) {
      toast.error('Error exportando menú');
    }
  }

  // Chat handling
  async function createConversation(templateId?: string) {
    try {
      const res = await fetch(`${apiBase}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId })
      });
      if (!res.ok) throw new Error('Error al crear conversación');
      const data = await res.json();
      currentConversation = data.conversation;
      messages = [];
      toast.success('Conversación iniciada');
      activeTab = 'chat';
    } catch (err) {
      toast.error('Error creando conversación');
    }
  }

  async function loadConversation(conv: Conversation) {
    currentConversation = conv;
    try {
      const res = await fetch(`${apiBase}/conversations/${conv.id}/messages`);
      if (!res.ok) throw new Error('Error al cargar mensajes');
      const data = await res.json();
      messages = (data.messages || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content as string,
        timestamp: new Date(m.created_at as string).getTime(),
        status: 'sent'
      }));
    } catch (err) {
      toast.error('Error cargando mensajes');
    }
  }

  async function sendMessage(event: CustomEvent<{ message: string; attachments: File[] }>) {
    if (!currentConversation) {
      await createConversation();
    }

    const { message } = event.detail;
    if (!message.trim()) return;

    // Add user message locally
    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now(),
      status: 'sending'
    };
    messages = [...messages, userMsg];

    chatLoading = true;

    try {
      const res = await fetch(`${apiBase}/conversations/${currentConversation!.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message })
      });

      if (!res.ok) throw new Error('Error al enviar mensaje');

      const data = await res.json();

      // Update user message status
      messages = messages.map(m =>
        m.id === userMsg.id ? { ...m, status: 'sent' as const } : m
      );

      // Add assistant response
      if (data.response) {
        const assistantMsg: Message = {
          id: data.response.id || `msg_${Date.now() + 1}`,
          role: 'assistant',
          content: data.response.content,
          timestamp: Date.now(),
          status: 'sent'
        };
        messages = [...messages, assistantMsg];
      }
    } catch (err) {
      messages = messages.map(m =>
        m.id === userMsg.id ? { ...m, status: 'error' as const } : m
      );
      toast.error('Error enviando mensaje');
    } finally {
      chatLoading = false;
    }
  }

  // Table action handler
  function handleAction(event: CustomEvent<{ action: string; row: Record<string, unknown> }>) {
    const { action, row } = event.detail;
    const menu = row as unknown as Menu;

    if (action === 'view') {
      viewMenu(menu);
    } else if (action === 'validate') {
      validateMenu(menu);
    } else if (action === 'export-json') {
      exportMenu(menu, 'json');
    } else if (action === 'export-csv') {
      exportMenu(menu, 'csv');
    }
  }

  // Stats computed
  $: totalMenus = menus.length;
  $: generandoCount = menus.filter(m => m.estado === 'generando').length;
  $: pendientesCount = menus.filter(m => m.estado === 'generado').length;
  $: validadosCount = menus.filter(m => m.estado === 'validado').length;

  // Update tab badges
  $: tabItems[0].badge = menus.length;
  $: tabItems[1].badge = conversations.length;
  $: tabItems[2].badge = templates.length;

  // Real-time updates via MQTT
  $: {
    const lastEvent = $events[$events.length - 1];
    if (lastEvent) {
      if (lastEvent.type.includes('menu.generado') ||
          lastEvent.type.includes('menu.validado') ||
          lastEvent.type.includes('menu.error')) {
        fetchMenus();
      } else if (lastEvent.type.includes('conversation') ||
                 lastEvent.type.includes('message')) {
        fetchConversations();
      }
    }
  }

  // Table configuration
  const menuColumns = [
    { field: 'id', label: 'ID', sortable: true },
    { field: 'estado', label: 'Estado', type: 'badge' as const },
    { field: 'productos_count', label: 'Productos', type: 'number' as const },
    { field: 'categorias_count', label: 'Categorías', type: 'number' as const },
    { field: 'created_at', label: 'Creado', type: 'date' as const }
  ];

  const menuActions = [
    { label: '👁️', handler: 'view', variant: 'ghost' as const },
    { label: '✅', handler: 'validate', variant: 'primary' as const },
    { label: '📥', handler: 'export-json', variant: 'ghost' as const }
  ];

  onMount(() => {
    loadAll();
    subscribe([
      'core/+/events/menu/#',
      'core/+/events/menu-generator/#',
      'core/+/events/ai/#'
    ]);
  });

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<svelte:head>
  <title>Menu Generator - Event-Core</title>
</svelte:head>

<Header title="📄 Menu Generator" subtitle="Genera menús desde cartas físicas usando IA" />

<div class="p-4 md:p-6">
  {#if loading}
    <Card class="flex items-center justify-center py-12">
      <Spinner size="lg" />
    </Card>
  {:else if error}
    <Card class="text-center py-8">
      <p class="text-danger mb-4">{error}</p>
      <Button variant="secondary" on:click={loadAll}>Reintentar</Button>
    </Card>
  {:else}
    <!-- Tabs -->
    <Tabs tabs={tabItems} bind:activeTab variant="pills" fullWidth>
      <svelte:fragment slot="default" let:activeTab>
        <!-- Tab: Menús -->
        {#if activeTab === 'menus'}
          <div class="space-y-6">
            <!-- Stats Row -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <StatCard title="Total" value={totalMenus} icon="📄" />
              <StatCard title="Generando" value={generandoCount} icon="⏳" />
              <StatCard title="Pendientes" value={pendientesCount} icon="⚠️" />
              <StatCard title="Validados" value={validadosCount} icon="✅" />
            </div>

            <!-- Upload Zone -->
            <Card title="📤 Subir Carta de Menú">
              <FileDropZone
                accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
                maxSize={20 * 1024 * 1024}
                maxFiles={5}
                bind:files={uploadFiles}
                disabled={uploading}
                on:drop={handleFileDrop}
                on:error={(e) => toast.error(e.detail)}
              />
            </Card>

            <!-- Menus Table/List -->
            {#if menus.length === 0}
              <Card class="text-center py-12">
                <span class="text-4xl mb-4 block">📄</span>
                <p class="text-text-muted mb-4">No hay menús generados</p>
                <p class="text-sm text-text-muted">Sube una carta para comenzar</p>
              </Card>
            {:else}
              <!-- Mobile: Cards -->
              <div class="block md:hidden space-y-3">
                {#each menus as menu (menu.id)}
                  <Card hover on:click={() => viewMenu(menu)}>
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-2">
                          <Badge variant={estadoColors[menu.estado]}>{menu.estado}</Badge>
                          <span class="text-xs text-text-muted">{formatDate(menu.created_at)}</span>
                        </div>
                        <p class="font-mono text-sm truncate">{menu.id}</p>
                        <div class="flex gap-4 mt-2 text-sm text-text-muted">
                          <span>🍽️ {menu.productos_count} productos</span>
                          <span>📁 {menu.categorias_count} categorías</span>
                        </div>
                      </div>
                      <div class="flex flex-col gap-1">
                        {#if menu.estado === 'generado'}
                          <button
                            class="p-2 text-success hover:bg-success hover:bg-opacity-10 rounded"
                            on:click|stopPropagation={() => validateMenu(menu)}
                          >
                            ✅
                          </button>
                        {/if}
                        <button
                          class="p-2 text-primary hover:bg-primary hover:bg-opacity-10 rounded"
                          on:click|stopPropagation={() => exportMenu(menu, 'json')}
                        >
                          📥
                        </button>
                      </div>
                    </div>
                  </Card>
                {/each}
              </div>

              <!-- Desktop: Table -->
              <div class="hidden md:block">
                <Table
                  columns={menuColumns}
                  data={menus}
                  actions={menuActions}
                  idField="id"
                  on:action={handleAction}
                />
              </div>
            {/if}
          </div>
        {/if}

        <!-- Tab: Chat AI -->
        {#if activeTab === 'chat'}
          <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <!-- Conversations List -->
            <div class="lg:col-span-1 space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="font-medium">Conversaciones</h3>
                <Button variant="primary" size="sm" on:click={() => createConversation()}>
                  + Nueva
                </Button>
              </div>

              {#if conversations.length === 0}
                <Card class="text-center py-6">
                  <span class="text-2xl mb-2 block">💬</span>
                  <p class="text-sm text-text-muted">Sin conversaciones</p>
                </Card>
              {:else}
                <div class="space-y-2 max-h-[200px] md:max-h-[400px] overflow-y-auto">
                  {#each conversations as conv (conv.id)}
                    <button
                      class="w-full text-left p-3 rounded-lg border transition-colors"
                      class:border-primary={currentConversation?.id === conv.id}
                      class:bg-primary={currentConversation?.id === conv.id}
                      class:bg-opacity-10={currentConversation?.id === conv.id}
                      class:border-border={currentConversation?.id !== conv.id}
                      class:hover:bg-bg-hover={currentConversation?.id !== conv.id}
                      on:click={() => loadConversation(conv)}
                    >
                      <div class="flex items-center justify-between mb-1">
                        <span class="font-medium text-sm truncate">
                          {conv.title || `Conversación ${conv.id.slice(-6)}`}
                        </span>
                        <Badge variant={conv.status === 'active' ? 'success' : 'default'} size="sm">
                          {conv.messages_count}
                        </Badge>
                      </div>
                      <p class="text-xs text-text-muted">{formatDate(conv.created_at)}</p>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Chat Area -->
            <div class="lg:col-span-3 flex flex-col bg-bg-card border border-border rounded-lg overflow-hidden h-[60vh] md:h-[500px]">
              {#if currentConversation}
                <div class="flex-1 overflow-hidden">
                  <ConversationPanel
                    {messages}
                    loading={chatLoading}
                    {streamingContent}
                  />
                </div>
                <div class="border-t border-border">
                  <ChatInput
                    placeholder="Escribe tu mensaje sobre el menú..."
                    loading={chatLoading}
                    on:submit={sendMessage}
                  />
                </div>
              {:else}
                <div class="flex-1 flex items-center justify-center">
                  <div class="text-center">
                    <span class="text-4xl mb-4 block">🤖</span>
                    <p class="text-text-muted mb-4">Selecciona o crea una conversación</p>
                    <Button variant="primary" on:click={() => createConversation()}>
                      Iniciar Chat
                    </Button>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Tab: Templates -->
        {#if activeTab === 'templates'}
          <div class="space-y-6">
            <p class="text-text-muted">Selecciona una plantilla para iniciar una conversación con el estilo predefinido:</p>

            {#if templates.length === 0}
              <Card class="text-center py-12">
                <span class="text-4xl mb-4 block">📝</span>
                <p class="text-text-muted">No hay templates disponibles</p>
              </Card>
            {:else}
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {#each templates as tpl (tpl.id)}
                  <Card hover on:click={() => createConversation(tpl.id)}>
                    <div class="flex items-start gap-3">
                      <span class="text-3xl">{tpl.emoji}</span>
                      <div class="flex-1 min-w-0">
                        <h3 class="font-medium mb-1">{tpl.name}</h3>
                        <p class="text-sm text-text-muted mb-2">{tpl.description}</p>
                        <div class="flex flex-wrap gap-1">
                          {#each tpl.categories.slice(0, 4) as cat}
                            <Badge variant="default" size="sm">{cat}</Badge>
                          {/each}
                          {#if tpl.categories.length > 4}
                            <Badge variant="default" size="sm">+{tpl.categories.length - 4}</Badge>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </Card>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </svelte:fragment>
    </Tabs>
  {/if}
</div>

<!-- Menu Detail Modal -->
<Modal
  bind:open={menuDetailModal}
  title="Detalles del Menú"
  size="lg"
  on:close={() => { menuDetailModal = false; menuDetail = null; selectedMenu = null; }}
>
  {#if selectedMenu && menuDetail}
    <div class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        <div>
          <span class="text-sm text-text-muted">ID</span>
          <p class="font-mono text-sm truncate">{selectedMenu.id}</p>
        </div>
        <div>
          <span class="text-sm text-text-muted">Estado</span>
          <p><Badge variant={estadoColors[selectedMenu.estado]}>{selectedMenu.estado}</Badge></p>
        </div>
        <div>
          <span class="text-sm text-text-muted">Productos</span>
          <p>{selectedMenu.productos_count}</p>
        </div>
        <div>
          <span class="text-sm text-text-muted">Categorías</span>
          <p>{selectedMenu.categorias_count}</p>
        </div>
      </div>

      {#if menuDetail.productos}
        <div>
          <h4 class="font-medium mb-2">Productos</h4>
          <div class="max-h-[300px] overflow-y-auto space-y-2">
            {#each menuDetail.productos as producto}
              <div class="p-3 bg-bg-hover rounded-lg">
                <div class="flex justify-between">
                  <span class="font-medium">{producto.nombre}</span>
                  <span class="text-success">{producto.precio}€</span>
                </div>
                {#if producto.descripcion}
                  <p class="text-sm text-text-muted">{producto.descripcion}</p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="flex justify-center py-8">
      <Spinner />
    </div>
  {/if}

  <svelte:fragment slot="footer">
    {#if selectedMenu}
      {#if selectedMenu.estado === 'generado'}
        <Button variant="success" on:click={() => { validateMenu(selectedMenu); menuDetailModal = false; }}>
          ✅ Validar
        </Button>
      {/if}
      <Button variant="secondary" on:click={() => exportMenu(selectedMenu, 'json')}>
        📥 JSON
      </Button>
      <Button variant="secondary" on:click={() => exportMenu(selectedMenu, 'csv')}>
        📊 CSV
      </Button>
    {/if}
    <Button variant="ghost" on:click={() => menuDetailModal = false}>
      Cerrar
    </Button>
  </svelte:fragment>
</Modal>
