<script lang="ts">
  import { onMount } from 'svelte';
  import { Header } from '$components/layout';
  import { Card, Button, Badge, Input, Select } from '$components/ui';
  import { Modal, Spinner, Alert } from '$components/feedback';
  import { toast } from '$stores/toast';
  import { goto } from '$app/navigation';
  import config from '$lib/config';

  // Types
  interface Template {
    id: string;
    name: string;
    display_name: string;
    description: string;
    icon: string;
    type: 'view' | 'modal' | 'form' | 'dashboard' | 'component' | 'page';
    category: string;
    status: 'draft' | 'published' | 'archived';
    components: any[];
    created_at: string;
    updated_at: string;
  }

  // State
  let templates: Template[] = [];
  let loading = true;
  let error: string | null = null;

  // Filters
  let searchQuery = '';
  let filterType = '';
  let filterStatus = '';

  // Modal state
  let createModalOpen = false;
  let newTemplate = {
    name: '',
    display_name: '',
    description: '',
    icon: '📄',
    type: 'view' as const,
    category: 'general'
  };
  let creating = false;

  // Predefined templates modal
  let predefinedModalOpen = false;
  let predefinedTemplates: any[] = [];
  let loadingPredefined = false;
  let selectedPredefined: string | null = null;

  // API
  const apiBase = `${config.apiUrl}/modules/ui-designer`;

  async function fetchTemplates() {
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (filterType) params.set('type', filterType);
      if (filterStatus) params.set('status', filterStatus);

      const url = `${apiBase}/templates${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Error al cargar templates');
      const data = await res.json();
      templates = data.templates || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }

  async function createTemplate() {
    if (!newTemplate.name || !newTemplate.type) {
      toast.error('Nombre y tipo son requeridos');
      return;
    }

    creating = true;
    try {
      const res = await fetch(`${apiBase}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTemplate)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al crear template');
      }

      const data = await res.json();
      toast.success('Template creado');
      createModalOpen = false;

      // Ir al editor
      goto(`/ui-designer/${data.template.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      creating = false;
    }
  }

  async function deleteTemplate(template: Template) {
    if (!confirm(`¿Eliminar "${template.display_name}"?`)) return;

    try {
      const res = await fetch(`${apiBase}/templates/${template.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Error al eliminar');
      toast.success('Template eliminado');
      fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function duplicateTemplate(template: Template) {
    try {
      const res = await fetch(`${apiBase}/templates/${template.id}/duplicate`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Error al duplicar');
      const data = await res.json();
      toast.success('Template duplicado');
      goto(`/ui-designer/${data.template.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  function openCreateModal() {
    newTemplate = {
      name: '',
      display_name: '',
      description: '',
      icon: '📄',
      type: 'view',
      category: 'general'
    };
    createModalOpen = true;
  }

  async function openPredefinedModal() {
    predefinedModalOpen = true;
    selectedPredefined = null;
    await fetchPredefinedTemplates();
  }

  async function fetchPredefinedTemplates() {
    loadingPredefined = true;
    try {
      const res = await fetch(`${apiBase}/predefined`);
      if (!res.ok) throw new Error('Error al cargar plantillas');
      const data = await res.json();
      predefinedTemplates = data.templates || [];
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
      predefinedTemplates = [];
    } finally {
      loadingPredefined = false;
    }
  }

  async function createFromPredefined() {
    if (!selectedPredefined) {
      toast.error('Selecciona una plantilla');
      return;
    }

    creating = true;
    try {
      const res = await fetch(`${apiBase}/predefined/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_name: selectedPredefined })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al crear template');
      }

      const data = await res.json();
      toast.success('Template creado desde plantilla');
      predefinedModalOpen = false;
      goto(`/ui-designer/${data.template.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      creating = false;
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      view: '📋',
      modal: '🪟',
      form: '📝',
      dashboard: '📊',
      component: '🧩',
      page: '📄'
    };
    return icons[type] || '📄';
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      draft: 'warning',
      published: 'success',
      archived: 'default'
    };
    return colors[status] || 'default';
  }

  // Auto-generate name from display_name
  $: if (newTemplate.display_name && !newTemplate.name) {
    newTemplate.name = newTemplate.display_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  onMount(() => {
    fetchTemplates();
  });
</script>

<svelte:head>
  <title>UI Designer - Event-Core</title>
</svelte:head>

<Header
  title="UI Designer"
  subtitle="Diseña interfaces visuales para tus módulos"
/>

<div class="p-4 md:p-6 space-y-6">
  <!-- Toolbar -->
  <div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
    <div class="flex flex-wrap gap-3 items-center">
      <Input
        placeholder="Buscar templates..."
        bind:value={searchQuery}
        on:input={() => fetchTemplates()}
        class="w-48"
      />
      <Select
        bind:value={filterType}
        on:change={() => fetchTemplates()}
        placeholder="Tipo"
        class="w-36"
      >
        <option value="">Todos los tipos</option>
        <option value="view">Vista</option>
        <option value="modal">Modal</option>
        <option value="form">Formulario</option>
        <option value="dashboard">Dashboard</option>
        <option value="component">Componente</option>
        <option value="page">Página</option>
      </Select>
      <Select
        bind:value={filterStatus}
        on:change={() => fetchTemplates()}
        placeholder="Estado"
        class="w-36"
      >
        <option value="">Todos</option>
        <option value="draft">Borrador</option>
        <option value="published">Publicado</option>
        <option value="archived">Archivado</option>
      </Select>
    </div>
    <div class="flex gap-2">
      <Button variant="ghost" on:click={openPredefinedModal}>
        📋 Desde Plantilla
      </Button>
      <Button variant="primary" on:click={openCreateModal}>
        + Nuevo Template
      </Button>
    </div>
  </div>

  <!-- Content -->
  {#if loading}
    <Card class="flex items-center justify-center py-12">
      <Spinner size="lg" />
    </Card>
  {:else if error}
    <Alert variant="danger" title="Error">
      {error}
      <Button variant="secondary" size="sm" on:click={fetchTemplates} class="mt-2">
        Reintentar
      </Button>
    </Alert>
  {:else if templates.length === 0}
    <Card class="text-center py-12">
      <span class="text-5xl mb-4 block">🎨</span>
      <h3 class="text-lg font-medium mb-2">No hay templates</h3>
      <p class="text-text-muted mb-4">
        Crea tu primer template para empezar a diseñar interfaces
      </p>
      <Button variant="primary" on:click={openCreateModal}>
        Crear Template
      </Button>
    </Card>
  {:else}
    <!-- Templates Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each templates as template (template.id)}
        <Card hover class="relative group">
          <!-- Header -->
          <div class="flex items-start gap-3 mb-3">
            <span class="text-3xl">{template.icon}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-medium truncate">{template.display_name}</h3>
              </div>
              <div class="flex items-center gap-2">
                <Badge variant="default" size="sm">
                  {getTypeIcon(template.type)} {template.type}
                </Badge>
                <Badge variant={getStatusColor(template.status)} size="sm">
                  {template.status}
                </Badge>
              </div>
            </div>
          </div>

          <!-- Description -->
          {#if template.description}
            <p class="text-sm text-text-muted mb-3 line-clamp-2">
              {template.description}
            </p>
          {/if}

          <!-- Stats -->
          <div class="flex items-center gap-4 text-xs text-text-muted mb-3">
            <span>🧩 {template.components?.length || 0} componentes</span>
            <span>{formatDate(template.updated_at || template.created_at)}</span>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 pt-3 border-t border-border">
            <Button
              variant="primary"
              size="sm"
              class="flex-1"
              on:click={() => goto(`/ui-designer/${template.id}`)}
            >
              Editar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              on:click={() => duplicateTemplate(template)}
              title="Duplicar"
            >
              📋
            </Button>
            <Button
              variant="ghost"
              size="sm"
              on:click={() => deleteTemplate(template)}
              title="Eliminar"
            >
              🗑️
            </Button>
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Modal -->
<Modal
  bind:open={createModalOpen}
  title="Nuevo Template"
  size="md"
>
  <form on:submit|preventDefault={createTemplate} class="space-y-4">
    <Input
      label="Nombre para mostrar"
      bind:value={newTemplate.display_name}
      placeholder="Mi Dashboard"
      required
    />

    <Input
      label="Nombre técnico"
      bind:value={newTemplate.name}
      placeholder="mi-dashboard"
      pattern="^[a-z][a-z0-9-]*$"
      required
    />

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Tipo</label>
        <Select bind:value={newTemplate.type} required>
          <option value="view">📋 Vista</option>
          <option value="modal">🪟 Modal</option>
          <option value="form">📝 Formulario</option>
          <option value="dashboard">📊 Dashboard</option>
          <option value="component">🧩 Componente</option>
          <option value="page">📄 Página</option>
        </Select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Icono</label>
        <Input
          bind:value={newTemplate.icon}
          placeholder="📄"
          maxlength={4}
        />
      </div>
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">Categoría</label>
      <Select bind:value={newTemplate.category}>
        <option value="general">General</option>
        <option value="admin">Administración</option>
        <option value="data">Datos</option>
        <option value="analytics">Analíticas</option>
        <option value="settings">Configuración</option>
        <option value="ai">IA</option>
        <option value="custom">Personalizado</option>
      </Select>
    </div>

    <Input
      label="Descripción"
      bind:value={newTemplate.description}
      placeholder="Descripción opcional..."
    />
  </form>

  <svelte:fragment slot="footer">
    <Button variant="ghost" on:click={() => createModalOpen = false} disabled={creating}>
      Cancelar
    </Button>
    <Button variant="primary" on:click={createTemplate} loading={creating}>
      Crear y Editar
    </Button>
  </svelte:fragment>
</Modal>

<!-- Predefined Templates Modal -->
<Modal
  bind:open={predefinedModalOpen}
  title="Crear desde Plantilla"
  size="lg"
>
  {#if loadingPredefined}
    <div class="flex justify-center py-8">
      <Spinner size="md" />
    </div>
  {:else if predefinedTemplates.length === 0}
    <Alert variant="info" title="Sin plantillas">
      No hay plantillas predefinidas disponibles.
    </Alert>
  {:else}
    <div class="grid grid-cols-2 gap-4">
      {#each predefinedTemplates as pt}
        <button
          type="button"
          class="p-4 border rounded-lg text-left transition-all hover:border-primary"
          class:border-primary={selectedPredefined === pt.name}
          class:ring-2={selectedPredefined === pt.name}
          class:ring-primary={selectedPredefined === pt.name}
          class:border-border={selectedPredefined !== pt.name}
          on:click={() => selectedPredefined = pt.name}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">{pt.icon}</span>
            <div>
              <h4 class="font-medium">{pt.display_name}</h4>
              <Badge variant="default" size="sm">{pt.type}</Badge>
            </div>
          </div>
          <p class="text-sm text-text-muted">{pt.description}</p>
          <p class="text-xs text-text-muted mt-2">
            🧩 {pt.components?.length || 0} componentes
          </p>
        </button>
      {/each}
    </div>
  {/if}

  <svelte:fragment slot="footer">
    <Button variant="ghost" on:click={() => predefinedModalOpen = false} disabled={creating}>
      Cancelar
    </Button>
    <Button
      variant="primary"
      on:click={createFromPredefined}
      loading={creating}
      disabled={!selectedPredefined}
    >
      Crear desde Plantilla
    </Button>
  </svelte:fragment>
</Modal>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
