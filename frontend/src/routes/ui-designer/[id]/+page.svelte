<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Button, Badge, Input, Select } from '$components/ui';
  import { Modal, Spinner, Alert } from '$components/feedback';
  import { toast } from '$stores/toast';
  import ComponentRenderer from '$lib/components/ui-designer/ComponentRenderer.svelte';
  import config from '$lib/config';

  // Types
  interface Component {
    id: string;
    component: string;
    label?: string;
    props: Record<string, any>;
    position: {
      section: string;
      order: number;
    };
  }

  interface Template {
    id: string;
    name: string;
    display_name: string;
    description: string;
    icon: string;
    type: string;
    category: string;
    status: string;
    layout: {
      type: string;
      config: Record<string, any>;
    };
    components: Component[];
  }

  interface ComponentDef {
    name: string;
    label: string;
    icon: string;
    category: string;
    description: string;
    defaultProps: Record<string, any>;
  }

  // State
  let template: Template | null = null;
  let loading = true;
  let saving = false;
  let error: string | null = null;

  // Components registry
  let componentRegistry: Record<string, ComponentDef> = {};
  let componentsByCategory: Record<string, ComponentDef[]> = {};

  // Editor state
  let selectedComponentId: string | null = null;
  let draggedComponent: ComponentDef | null = null;
  let isDragging = false;

  // View mode: 'canvas' | 'preview' | 'split'
  let viewMode: 'canvas' | 'preview' | 'split' = 'canvas';

  // Preview state
  let previewIframe: HTMLIFrameElement | null = null;
  let previewReady = false;
  let previewDevice: 'desktop' | 'tablet' | 'mobile' = 'desktop';

  // Export modal
  let exportModalOpen = false;
  let exportFormat: 'yaml' | 'svelte' | 'json' = 'yaml';
  let exportResult = '';
  let exporting = false;

  // Auto-save
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let hasChanges = false;

  const apiBase = `${config.apiUrl}/modules/ui-designer`;
  $: templateId = $page.params.id;

  // Device dimensions for preview
  const deviceDimensions = {
    desktop: { width: '100%', height: '100%' },
    tablet: { width: '768px', height: '1024px' },
    mobile: { width: '375px', height: '667px' }
  };

  // Fetch data
  async function fetchTemplate() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/templates/${templateId}`);
      if (!res.ok) throw new Error('Template no encontrado');
      const data = await res.json();
      template = data.template;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error';
    } finally {
      loading = false;
    }
  }

  async function fetchComponents() {
    try {
      const res = await fetch(`${apiBase}/components`);
      if (!res.ok) throw new Error('Error al cargar componentes');
      const data = await res.json();

      componentRegistry = {};
      for (const comp of data.components) {
        componentRegistry[comp.name] = comp;
      }
      componentsByCategory = data.grouped || {};
    } catch (err) {
      console.error('Error fetching components:', err);
    }
  }

  // Save template
  async function saveTemplate() {
    if (!template) return;

    saving = true;
    try {
      const res = await fetch(`${apiBase}/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: template.display_name,
          description: template.description,
          icon: template.icon,
          layout: template.layout,
          components: template.components
        })
      });

      if (!res.ok) throw new Error('Error al guardar');
      hasChanges = false;
      toast.success('Guardado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      saving = false;
    }
  }

  // Auto-save and update preview
  function scheduleAutoSave() {
    hasChanges = true;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      saveTemplate();
    }, 3000);

    // Update preview in real-time
    updatePreview();
  }

  // Send updates to preview iframe
  function updatePreview() {
    if (previewIframe?.contentWindow && previewReady && template) {
      previewIframe.contentWindow.postMessage({
        type: 'ui-designer:update',
        components: template.components
      }, '*');
    }
  }

  // Listen for preview ready message
  function handlePreviewMessage(event: MessageEvent) {
    if (event.data?.type === 'ui-designer:preview-ready') {
      previewReady = true;
      updatePreview();
    }
  }

  // Drag and drop handlers
  function handleDragStart(comp: ComponentDef) {
    draggedComponent = comp;
    isDragging = true;
  }

  function handleDragEnd() {
    draggedComponent = null;
    isDragging = false;
  }

  function handleDrop(section: string = 'main') {
    if (!draggedComponent || !template) return;

    const newComponent: Component = {
      id: `comp_${Date.now()}`,
      component: draggedComponent.name,
      label: draggedComponent.label,
      props: { ...draggedComponent.defaultProps },
      position: {
        section,
        order: template.components.filter(c => c.position.section === section).length
      }
    };

    template.components = [...template.components, newComponent];
    selectedComponentId = newComponent.id;
    scheduleAutoSave();
    handleDragEnd();
  }

  function handleCanvasDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  // Component management
  function selectComponent(id: string) {
    selectedComponentId = id;
  }

  function deleteComponent(id: string) {
    if (!template) return;
    template.components = template.components.filter(c => c.id !== id);
    if (selectedComponentId === id) selectedComponentId = null;
    scheduleAutoSave();
  }

  function moveComponent(id: string, direction: 'up' | 'down') {
    if (!template) return;
    const idx = template.components.findIndex(c => c.id === id);
    if (idx === -1) return;

    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= template.components.length) return;

    const components = [...template.components];
    [components[idx], components[newIdx]] = [components[newIdx], components[idx]];
    template.components = components;
    scheduleAutoSave();
  }

  function updateComponentProp(componentId: string, prop: string, value: any) {
    if (!template) return;
    const component = template.components.find(c => c.id === componentId);
    if (component) {
      component.props[prop] = value;
      template.components = [...template.components];
      scheduleAutoSave();
    }
  }

  // Export
  async function exportTemplate() {
    if (!template) return;
    exporting = true;
    exportResult = '';

    try {
      const res = await fetch(`${apiBase}/export/${exportFormat}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId })
      });

      if (!res.ok) throw new Error('Error al exportar');
      const data = await res.json();

      if (exportFormat === 'yaml') {
        exportResult = data.yaml;
      } else if (exportFormat === 'svelte') {
        exportResult = data.svelte;
      } else {
        exportResult = JSON.stringify(data.ui, null, 2);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      exporting = false;
    }
  }

  function copyExport() {
    navigator.clipboard.writeText(exportResult);
    toast.success('Copiado al portapapeles');
  }

  // Get selected component
  $: selectedComponent = template?.components.find(c => c.id === selectedComponentId);

  // Component categories with icons
  const categoryIcons: Record<string, string> = {
    layout: '📐',
    data: '📊',
    form: '📝',
    feedback: '💬',
    navigation: '🧭',
    action: '⚡',
    ai: '🤖',
    custom: '🧩'
  };

  onMount(() => {
    fetchTemplate();
    fetchComponents();
    window.addEventListener('message', handlePreviewMessage);
  });

  onDestroy(() => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    window.removeEventListener('message', handlePreviewMessage);
  });
</script>

<svelte:head>
  <title>{template?.display_name || 'Editor'} - UI Designer</title>
</svelte:head>

{#if loading}
  <div class="h-screen flex items-center justify-center">
    <Spinner size="lg" />
  </div>
{:else if error}
  <div class="h-screen flex items-center justify-center">
    <Alert variant="danger" title="Error">
      {error}
      <Button variant="secondary" size="sm" on:click={() => goto('/ui-designer')} class="mt-2">
        Volver
      </Button>
    </Alert>
  </div>
{:else if template}
  <div class="h-screen flex flex-col bg-bg-secondary">
    <!-- Header -->
    <header class="bg-bg-primary border-b border-border px-4 py-2 flex items-center gap-4">
      <Button variant="ghost" size="sm" on:click={() => goto('/ui-designer')}>
        ← Volver
      </Button>

      <div class="flex items-center gap-2 flex-1">
        <span class="text-xl">{template.icon}</span>
        <input
          type="text"
          bind:value={template.display_name}
          on:input={scheduleAutoSave}
          class="bg-transparent font-medium text-lg border-none focus:outline-none focus:ring-0"
        />
        <Badge variant={template.status === 'published' ? 'success' : 'warning'} size="sm">
          {template.status}
        </Badge>
        {#if hasChanges}
          <Badge variant="warning" size="sm">Sin guardar</Badge>
        {/if}
      </div>

      <!-- View Mode Toggle -->
      <div class="flex items-center gap-1 bg-bg-secondary rounded-lg p-1">
        <button
          class="px-3 py-1 rounded text-sm transition-colors"
          class:bg-bg-primary={viewMode === 'canvas'}
          class:text-primary={viewMode === 'canvas'}
          on:click={() => viewMode = 'canvas'}
        >
          📝 Editor
        </button>
        <button
          class="px-3 py-1 rounded text-sm transition-colors"
          class:bg-bg-primary={viewMode === 'split'}
          class:text-primary={viewMode === 'split'}
          on:click={() => viewMode = 'split'}
        >
          ⬛ Split
        </button>
        <button
          class="px-3 py-1 rounded text-sm transition-colors"
          class:bg-bg-primary={viewMode === 'preview'}
          class:text-primary={viewMode === 'preview'}
          on:click={() => viewMode = 'preview'}
        >
          👁️ Preview
        </button>
      </div>

      <!-- Preview Device Selector (visible in preview/split mode) -->
      {#if viewMode !== 'canvas'}
        <div class="flex items-center gap-1 bg-bg-secondary rounded-lg p-1">
          <button
            class="px-2 py-1 rounded text-sm"
            class:bg-bg-primary={previewDevice === 'desktop'}
            on:click={() => previewDevice = 'desktop'}
            title="Desktop"
          >
            🖥️
          </button>
          <button
            class="px-2 py-1 rounded text-sm"
            class:bg-bg-primary={previewDevice === 'tablet'}
            on:click={() => previewDevice = 'tablet'}
            title="Tablet"
          >
            📱
          </button>
          <button
            class="px-2 py-1 rounded text-sm"
            class:bg-bg-primary={previewDevice === 'mobile'}
            on:click={() => previewDevice = 'mobile'}
            title="Mobile"
          >
            📲
          </button>
        </div>
      {/if}

      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" on:click={() => { exportModalOpen = true; exportTemplate(); }}>
          📤 Exportar
        </Button>
        <Button variant="primary" size="sm" on:click={saveTemplate} loading={saving}>
          💾 Guardar
        </Button>
      </div>
    </header>

    <!-- Main Editor -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left Panel: Component Palette (hidden in preview mode) -->
      {#if viewMode !== 'preview'}
        <aside class="w-64 bg-bg-primary border-r border-border overflow-y-auto flex-shrink-0">
          <div class="p-3 border-b border-border">
            <h3 class="font-medium text-sm">Componentes</h3>
            <p class="text-xs text-text-muted">Arrastra al canvas</p>
          </div>

          <div class="p-2">
            {#each Object.entries(componentsByCategory) as [category, components]}
              <div class="mb-4">
                <h4 class="text-xs font-medium text-text-muted uppercase mb-2 px-2">
                  {categoryIcons[category] || '📦'} {category}
                </h4>
                <div class="space-y-1">
                  {#each components as comp}
                    <div
                      draggable="true"
                      on:dragstart={() => handleDragStart(comp)}
                      on:dragend={handleDragEnd}
                      class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-grab hover:bg-bg-hover transition-colors text-sm"
                      role="button"
                      tabindex="0"
                    >
                      <span>{comp.icon}</span>
                      <span>{comp.label}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </aside>
      {/if}

      <!-- Center: Canvas / Preview / Split -->
      <main class="flex-1 flex overflow-hidden">
        <!-- Canvas (editor mode or split mode) -->
        {#if viewMode === 'canvas' || viewMode === 'split'}
          <div class="flex-1 overflow-auto p-6 bg-bg-secondary" class:w-1/2={viewMode === 'split'}>
            <div
              class="min-h-full bg-bg-primary rounded-lg border-2 border-dashed transition-colors p-4"
              class:border-primary={isDragging}
              class:border-border={!isDragging}
              on:dragover={handleCanvasDragOver}
              on:drop={() => handleDrop('main')}
              role="region"
              aria-label="Canvas de diseño"
            >
              {#if template.components.length === 0}
                <div class="h-64 flex flex-col items-center justify-center text-text-muted">
                  <span class="text-4xl mb-3">🎨</span>
                  <p class="text-center">
                    Arrastra componentes aquí<br />
                    <span class="text-sm">o haz clic en un componente para agregarlo</span>
                  </p>
                </div>
              {:else}
                <div class="space-y-3">
                  {#each template.components as comp, index (comp.id)}
                    <div
                      class="group relative bg-bg-secondary border rounded-lg p-3 cursor-pointer transition-all"
                      class:border-primary={selectedComponentId === comp.id}
                      class:ring-2={selectedComponentId === comp.id}
                      class:ring-primary={selectedComponentId === comp.id}
                      class:border-border={selectedComponentId !== comp.id}
                      on:click={() => selectComponent(comp.id)}
                      on:keypress={(e) => e.key === 'Enter' && selectComponent(comp.id)}
                      role="button"
                      tabindex="0"
                    >
                      <!-- Component Preview -->
                      <div class="flex items-center gap-3">
                        <span class="text-xl">
                          {componentRegistry[comp.component]?.icon || '📦'}
                        </span>
                        <div class="flex-1 min-w-0">
                          <div class="font-medium text-sm">
                            {componentRegistry[comp.component]?.label || comp.component}
                          </div>
                          <div class="text-xs text-text-muted truncate">
                            {#if comp.props.label}
                              {comp.props.label}
                            {:else if comp.props.title}
                              {comp.props.title}
                            {:else}
                              {comp.component}
                            {/if}
                          </div>
                        </div>
                        <Badge variant="default" size="sm">{comp.component}</Badge>
                      </div>

                      <!-- Hover Actions -->
                      <div class="absolute top-1 right-1 hidden group-hover:flex gap-1">
                        <button
                          class="p-1 rounded bg-bg-primary hover:bg-bg-hover text-xs"
                          on:click|stopPropagation={() => moveComponent(comp.id, 'up')}
                          disabled={index === 0}
                          title="Mover arriba"
                        >
                          ↑
                        </button>
                        <button
                          class="p-1 rounded bg-bg-primary hover:bg-bg-hover text-xs"
                          on:click|stopPropagation={() => moveComponent(comp.id, 'down')}
                          disabled={index === template.components.length - 1}
                          title="Mover abajo"
                        >
                          ↓
                        </button>
                        <button
                          class="p-1 rounded bg-danger text-white hover:bg-danger/80 text-xs"
                          on:click|stopPropagation={() => deleteComponent(comp.id)}
                          title="Eliminar"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Preview Panel (preview mode or split mode) -->
        {#if viewMode === 'preview' || viewMode === 'split'}
          <div
            class="flex-1 overflow-auto bg-bg-secondary flex items-start justify-center p-6"
            class:w-1/2={viewMode === 'split'}
            class:border-l={viewMode === 'split'}
            class:border-border={viewMode === 'split'}
          >
            <div
              class="bg-bg-primary rounded-lg shadow-lg overflow-hidden transition-all duration-300"
              style="width: {deviceDimensions[previewDevice].width}; height: {deviceDimensions[previewDevice].height}; max-width: 100%; max-height: 100%;"
            >
              <!-- Preview Header -->
              <div class="bg-bg-secondary px-3 py-2 flex items-center gap-2 border-b border-border">
                <div class="flex gap-1">
                  <span class="w-3 h-3 rounded-full bg-danger"></span>
                  <span class="w-3 h-3 rounded-full bg-warning"></span>
                  <span class="w-3 h-3 rounded-full bg-success"></span>
                </div>
                <span class="text-xs text-text-muted flex-1 text-center truncate">
                  {template.display_name} - Preview ({previewDevice})
                </span>
              </div>

              <!-- Live Preview Content -->
              <div class="h-full overflow-auto p-4">
                {#if template.components.length === 0}
                  <div class="h-full flex items-center justify-center text-text-muted">
                    <div class="text-center">
                      <span class="text-3xl block mb-2">👀</span>
                      <p class="text-sm">Agrega componentes para ver el preview</p>
                    </div>
                  </div>
                {:else}
                  <div class="space-y-4">
                    {#each template.components as comp (comp.id)}
                      <ComponentRenderer component={comp} isPreview={true} />
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </main>

      <!-- Right Panel: Properties (hidden in preview mode) -->
      {#if viewMode !== 'preview'}
        <aside class="w-80 bg-bg-primary border-l border-border overflow-y-auto flex-shrink-0">
          {#if selectedComponent}
            <div class="p-3 border-b border-border">
              <div class="flex items-center gap-2">
                <span class="text-xl">
                  {componentRegistry[selectedComponent.component]?.icon || '📦'}
                </span>
                <div>
                  <h3 class="font-medium text-sm">
                    {componentRegistry[selectedComponent.component]?.label || selectedComponent.component}
                  </h3>
                  <p class="text-xs text-text-muted">{selectedComponent.id}</p>
                </div>
              </div>
            </div>

            <div class="p-4 space-y-4">
              <h4 class="text-xs font-medium text-text-muted uppercase">Propiedades</h4>

              {#each Object.entries(selectedComponent.props) as [propName, propValue]}
                <div>
                  <label class="block text-sm font-medium mb-1 capitalize">
                    {propName.replace(/_/g, ' ')}
                  </label>
                  {#if typeof propValue === 'boolean'}
                    <label class="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={propValue}
                        on:change={(e) => updateComponentProp(selectedComponent.id, propName, e.currentTarget.checked)}
                        class="rounded"
                      />
                      <span class="text-sm">{propValue ? 'Sí' : 'No'}</span>
                    </label>
                  {:else if propName === 'variant' || propName === 'size' || propName === 'color'}
                    <Select
                      value={propValue}
                      on:change={(e) => updateComponentProp(selectedComponent.id, propName, e.currentTarget.value)}
                    >
                      {#if propName === 'variant'}
                        <option value="default">default</option>
                        <option value="primary">primary</option>
                        <option value="secondary">secondary</option>
                        <option value="success">success</option>
                        <option value="warning">warning</option>
                        <option value="danger">danger</option>
                        <option value="ghost">ghost</option>
                        <option value="info">info</option>
                      {:else if propName === 'size'}
                        <option value="sm">Pequeño</option>
                        <option value="md">Mediano</option>
                        <option value="lg">Grande</option>
                      {:else if propName === 'color'}
                        <option value="primary">Primary</option>
                        <option value="success">Success</option>
                        <option value="warning">Warning</option>
                        <option value="danger">Danger</option>
                      {/if}
                    </Select>
                  {:else if typeof propValue === 'number'}
                    <Input
                      type="number"
                      value={propValue}
                      on:input={(e) => updateComponentProp(selectedComponent.id, propName, Number(e.currentTarget.value))}
                    />
                  {:else if Array.isArray(propValue)}
                    <textarea
                      value={JSON.stringify(propValue, null, 2)}
                      on:blur={(e) => {
                        try {
                          updateComponentProp(selectedComponent.id, propName, JSON.parse(e.currentTarget.value));
                        } catch (err) {
                          toast.error('JSON inválido');
                        }
                      }}
                      class="w-full h-24 px-3 py-2 bg-bg-input border border-border rounded-lg text-sm font-mono"
                    />
                  {:else}
                    <Input
                      value={propValue || ''}
                      on:input={(e) => updateComponentProp(selectedComponent.id, propName, e.currentTarget.value)}
                    />
                  {/if}
                </div>
              {/each}

              <!-- Add new prop -->
              <div class="pt-4 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  class="w-full"
                  on:click={() => {
                    const propName = prompt('Nombre de la propiedad:');
                    if (propName && selectedComponent) {
                      updateComponentProp(selectedComponent.id, propName, '');
                    }
                  }}
                >
                  + Agregar propiedad
                </Button>
              </div>
            </div>
          {:else}
            <div class="p-4 text-center text-text-muted">
              <span class="text-3xl block mb-2">👆</span>
              <p class="text-sm">Selecciona un componente para ver sus propiedades</p>
            </div>

            <!-- Template settings -->
            <div class="p-4 border-t border-border">
              <h4 class="text-xs font-medium text-text-muted uppercase mb-3">Configuración</h4>

              <div class="space-y-3">
                <div>
                  <label class="block text-sm font-medium mb-1">Layout</label>
                  <Select
                    value={template.layout?.type || 'single-column'}
                    on:change={(e) => {
                      template.layout = { ...template.layout, type: e.currentTarget.value };
                      scheduleAutoSave();
                    }}
                  >
                    <option value="single-column">Una columna</option>
                    <option value="two-column">Dos columnas</option>
                    <option value="grid">Grid</option>
                    <option value="tabs">Tabs</option>
                    <option value="sidebar">Sidebar</option>
                  </Select>
                </div>

                <div>
                  <label class="block text-sm font-medium mb-1">Descripción</label>
                  <textarea
                    bind:value={template.description}
                    on:input={scheduleAutoSave}
                    placeholder="Descripción del template..."
                    class="w-full h-20 px-3 py-2 bg-bg-input border border-border rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          {/if}
        </aside>
      {/if}
    </div>
  </div>
{/if}

<!-- Export Modal -->
<Modal
  bind:open={exportModalOpen}
  title="Exportar Template"
  size="lg"
>
  <div class="space-y-4">
    <div class="flex gap-2">
      <Button
        variant={exportFormat === 'yaml' ? 'primary' : 'ghost'}
        size="sm"
        on:click={() => { exportFormat = 'yaml'; exportTemplate(); }}
      >
        YAML Blueprint
      </Button>
      <Button
        variant={exportFormat === 'svelte' ? 'primary' : 'ghost'}
        size="sm"
        on:click={() => { exportFormat = 'svelte'; exportTemplate(); }}
      >
        Código Svelte
      </Button>
      <Button
        variant={exportFormat === 'json' ? 'primary' : 'ghost'}
        size="sm"
        on:click={() => { exportFormat = 'json'; exportTemplate(); }}
      >
        JSON (module.json)
      </Button>
    </div>

    {#if exporting}
      <div class="flex justify-center py-8">
        <Spinner size="md" />
      </div>
    {:else if exportResult}
      <pre class="bg-bg-input p-4 rounded-lg text-sm overflow-auto max-h-96 font-mono">{exportResult}</pre>
    {/if}
  </div>

  <svelte:fragment slot="footer">
    {#if exportResult}
      <Button variant="primary" on:click={copyExport}>
        📋 Copiar
      </Button>
    {/if}
    <Button variant="ghost" on:click={() => exportModalOpen = false}>
      Cerrar
    </Button>
  </svelte:fragment>
</Modal>
