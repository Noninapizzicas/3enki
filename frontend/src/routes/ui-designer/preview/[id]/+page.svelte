<script lang="ts">
  /**
   * Preview Page - Renderiza un template del UI Designer
   * Puede usarse standalone o en un iframe dentro del editor
   */
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { Spinner } from '$components/feedback';
  import ComponentRenderer from '$lib/components/ui-designer/ComponentRenderer.svelte';
  import config from '$lib/config';

  interface Component {
    id: string;
    component: string;
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
    icon: string;
    type: string;
    layout: {
      type: string;
      config: Record<string, any>;
    };
    components: Component[];
  }

  let template: Template | null = null;
  let loading = true;
  let error: string | null = null;

  // Para recibir datos del editor padre via postMessage
  let liveComponents: Component[] | null = null;

  $: templateId = $page.params.id;
  $: displayComponents = liveComponents || template?.components || [];

  async function fetchTemplate() {
    loading = true;
    try {
      const res = await fetch(`${config.apiUrl}/modules/ui-designer/templates/${templateId}`);
      if (!res.ok) throw new Error('Template no encontrado');
      const data = await res.json();
      template = data.template;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error';
    } finally {
      loading = false;
    }
  }

  // Escuchar mensajes del editor para live preview
  function handleMessage(event: MessageEvent) {
    if (event.data?.type === 'ui-designer:update') {
      liveComponents = event.data.components;
    }
  }

  // Obtener clases de layout
  function getLayoutClasses(layout: Template['layout']): string {
    const type = layout?.type || 'single-column';
    const gap = layout?.config?.gap || 'md';

    const gapClasses: Record<string, string> = {
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
      xl: 'gap-8'
    };

    switch (type) {
      case 'two-column':
        return `grid grid-cols-1 md:grid-cols-2 ${gapClasses[gap]}`;
      case 'three-column':
        return `grid grid-cols-1 md:grid-cols-3 ${gapClasses[gap]}`;
      case 'grid':
        const cols = layout?.config?.columns || 3;
        return `grid grid-cols-1 md:grid-cols-${cols} ${gapClasses[gap]}`;
      case 'sidebar':
        return 'flex flex-col md:flex-row gap-6';
      default:
        return `flex flex-col ${gapClasses[gap]}`;
    }
  }

  // Agrupar componentes por sección
  function getComponentsBySection(components: Component[]): Record<string, Component[]> {
    const sections: Record<string, Component[]> = {
      header: [],
      main: [],
      sidebar: [],
      footer: []
    };

    for (const comp of components) {
      const section = comp.position?.section || 'main';
      if (!sections[section]) sections[section] = [];
      sections[section].push(comp);
    }

    // Ordenar por order
    for (const section of Object.keys(sections)) {
      sections[section].sort((a, b) => (a.position?.order || 0) - (b.position?.order || 0));
    }

    return sections;
  }

  $: sections = getComponentsBySection(displayComponents);
  $: layoutClasses = template ? getLayoutClasses(template.layout) : '';

  onMount(() => {
    fetchTemplate();
    window.addEventListener('message', handleMessage);

    // Notificar al padre que estamos listos
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'ui-designer:preview-ready' }, '*');
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  });
</script>

<svelte:head>
  <title>{template?.display_name || 'Preview'} - UI Designer</title>
  <style>
    body {
      background: var(--bg-primary);
    }
  </style>
</svelte:head>

{#if loading}
  <div class="min-h-screen flex items-center justify-center">
    <Spinner size="lg" />
  </div>
{:else if error}
  <div class="min-h-screen flex items-center justify-center text-danger">
    <p>{error}</p>
  </div>
{:else if template}
  <div class="min-h-screen bg-bg-primary">
    <!-- Header Section -->
    {#if sections.header.length > 0}
      <header class="border-b border-border">
        {#each sections.header as comp (comp.id)}
          <ComponentRenderer component={comp} />
        {/each}
      </header>
    {/if}

    <!-- Main Content -->
    <div class="flex flex-1">
      <!-- Sidebar (if layout type is sidebar) -->
      {#if template.layout?.type === 'sidebar' && sections.sidebar.length > 0}
        <aside class="w-64 border-r border-border p-4 space-y-4">
          {#each sections.sidebar as comp (comp.id)}
            <ComponentRenderer component={comp} />
          {/each}
        </aside>
      {/if}

      <!-- Main Section -->
      <main class="flex-1 p-6">
        {#if displayComponents.length === 0}
          <div class="flex items-center justify-center h-64 text-text-muted">
            <div class="text-center">
              <span class="text-4xl block mb-2">🎨</span>
              <p>Sin componentes</p>
            </div>
          </div>
        {:else}
          <div class={layoutClasses}>
            {#each sections.main as comp (comp.id)}
              <ComponentRenderer component={comp} />
            {/each}
          </div>
        {/if}
      </main>

      <!-- Right Sidebar (for two-column with sidebar) -->
      {#if template.layout?.type === 'two-column' && sections.sidebar.length > 0}
        <aside class="w-80 border-l border-border p-4 space-y-4">
          {#each sections.sidebar as comp (comp.id)}
            <ComponentRenderer component={comp} />
          {/each}
        </aside>
      {/if}
    </div>

    <!-- Footer Section -->
    {#if sections.footer.length > 0}
      <footer class="border-t border-border p-4">
        {#each sections.footer as comp (comp.id)}
          <ComponentRenderer component={comp} />
        {/each}
      </footer>
    {/if}
  </div>
{/if}
