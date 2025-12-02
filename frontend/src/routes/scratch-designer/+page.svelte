<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Header } from '$components/layout';
  import { Card, Button, Badge, Input } from '$components/ui';
  import { Modal, Spinner, Alert } from '$components/feedback';
  import { toast } from '$stores/toast';
  import config from '$lib/config';

  interface Design {
    id: string;
    nombre: string;
    tipo: string;
    icono: string;
    bloques_count?: number;
    created_at: string;
    updated_at: string;
  }

  let designs: Design[] = [];
  let loading = true;
  let error: string | null = null;
  let searchQuery = '';

  // Modal crear
  let createModalOpen = false;
  let creating = false;
  let newDesign = {
    nombre: '',
    tipo: 'mobile',
    icono: '📱'
  };

  const apiBase = `${config.apiUrl}/modules/scratch-designer`;

  async function fetchDesigns() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/designs`);
      if (!res.ok) throw new Error('Error al cargar diseños');
      const data = await res.json();
      designs = data.designs || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }

  async function createDesign() {
    if (!newDesign.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    creating = true;
    try {
      const res = await fetch(`${apiBase}/designs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDesign)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al crear');
      }

      const data = await res.json();
      toast.success('Diseño creado');
      createModalOpen = false;
      goto(`/scratch-designer/${data.design.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      creating = false;
    }
  }

  async function deleteDesign(design: Design) {
    if (!confirm(`¿Eliminar "${design.nombre}"?`)) return;

    try {
      const res = await fetch(`${apiBase}/designs/${design.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Error al eliminar');
      toast.success('Diseño eliminado');
      fetchDesigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function duplicateDesign(design: Design) {
    try {
      const res = await fetch(`${apiBase}/designs/${design.id}/duplicate`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Error al duplicar');
      const data = await res.json();
      toast.success('Diseño duplicado');
      goto(`/scratch-designer/${data.design.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  function openCreateModal() {
    newDesign = { nombre: '', tipo: 'mobile', icono: '📱' };
    createModalOpen = true;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  $: filteredDesigns = designs.filter(d =>
    d.nombre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  onMount(fetchDesigns);
</script>

<svelte:head>
  <title>Scratch Designer - Event-Core</title>
</svelte:head>

<Header
  title="Scratch Designer"
  subtitle="Diseña interfaces con bloques tipo Scratch"
/>

<div class="p-3 md:p-6 space-y-4 md:space-y-6">
  <!-- Toolbar - mobile optimized -->
  <div class="flex flex-col gap-3 md:flex-row md:gap-4 md:items-center md:justify-between">
    <div class="relative flex-1 md:flex-none md:w-64">
      <Input
        placeholder="Buscar diseños..."
        bind:value={searchQuery}
        class="w-full pr-10"
      />
      {#if searchQuery}
        <button
          class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          on:click={() => searchQuery = ''}
        >
          ✕
        </button>
      {/if}
    </div>
    <Button variant="primary" on:click={openCreateModal} class="w-full md:w-auto py-3 md:py-2">
      + Nuevo Diseño
    </Button>
  </div>

  <!-- Content -->
  {#if loading}
    <Card class="flex items-center justify-center py-16 md:py-12">
      <Spinner size="lg" />
    </Card>
  {:else if error}
    <Alert variant="danger" title="Error">
      {error}
      <Button variant="secondary" size="sm" on:click={fetchDesigns} class="mt-3 md:mt-2">
        Reintentar
      </Button>
    </Alert>
  {:else if filteredDesigns.length === 0}
    <Card class="text-center py-16 md:py-12 px-4">
      <span class="text-6xl md:text-5xl mb-4 block">🧩</span>
      <h3 class="text-xl md:text-lg font-medium mb-3 md:mb-2">No hay diseños</h3>
      <p class="text-text-muted mb-6 md:mb-4 max-w-xs mx-auto">
        Crea tu primer diseño visual con bloques tipo Scratch
      </p>
      <Button variant="primary" on:click={openCreateModal} class="w-full md:w-auto">
        Crear Diseño
      </Button>
    </Card>
  {:else}
    <!-- Designs Grid - mobile optimized -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {#each filteredDesigns as design (design.id)}
        <Card hover class="relative group">
          <!-- Mobile: make entire card clickable -->
          <button
            class="md:hidden absolute inset-0 z-0"
            on:click={() => goto(`/scratch-designer/${design.id}`)}
            aria-label="Editar {design.nombre}"
          ></button>

          <div class="flex items-start gap-3 mb-3 relative z-10 pointer-events-none md:pointer-events-auto">
            <span class="text-4xl md:text-3xl">{design.icono}</span>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-lg md:text-base truncate">{design.nombre}</h3>
              <div class="flex items-center gap-2 mt-1">
                <Badge variant="default" size="sm">
                  {design.tipo}
                </Badge>
                {#if design.bloques_count}
                  <span class="text-sm md:text-xs text-text-muted">
                    {design.bloques_count} bloques
                  </span>
                {/if}
              </div>
            </div>
          </div>

          <div class="text-sm md:text-xs text-text-muted mb-3 relative z-10 pointer-events-none md:pointer-events-auto">
            {formatDate(design.updated_at || design.created_at)}
          </div>

          <!-- Desktop: action buttons -->
          <div class="hidden md:flex items-center gap-2 pt-3 border-t border-border">
            <Button
              variant="primary"
              size="sm"
              class="flex-1"
              on:click={() => goto(`/scratch-designer/${design.id}`)}
            >
              Editar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              on:click={() => duplicateDesign(design)}
              title="Duplicar"
            >
              📋
            </Button>
            <Button
              variant="ghost"
              size="sm"
              on:click={() => deleteDesign(design)}
              title="Eliminar"
            >
              🗑️
            </Button>
          </div>

          <!-- Mobile: compact action row -->
          <div class="md:hidden flex items-center gap-2 pt-3 border-t border-border relative z-10">
            <span class="flex-1 text-sm text-primary font-medium">Toca para editar →</span>
            <button
              class="w-10 h-10 flex items-center justify-center bg-bg-secondary rounded-lg active:scale-95"
              on:click|stopPropagation={() => duplicateDesign(design)}
              title="Duplicar"
            >
              📋
            </button>
            <button
              class="w-10 h-10 flex items-center justify-center bg-bg-secondary rounded-lg active:scale-95"
              on:click|stopPropagation={() => deleteDesign(design)}
              title="Eliminar"
            >
              🗑️
            </button>
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Modal - mobile optimized -->
<Modal bind:open={createModalOpen} title="Nuevo Diseño" size="sm">
  <form on:submit|preventDefault={createDesign} class="space-y-5 md:space-y-4">
    <div>
      <label class="block text-base md:text-sm font-medium mb-2 md:mb-1">Nombre</label>
      <input
        type="text"
        bind:value={newDesign.nombre}
        placeholder="Mi pantalla comandero"
        required
        class="w-full px-4 py-3 md:px-3 md:py-2 text-base md:text-sm bg-bg-input border border-border rounded-xl md:rounded-lg"
      />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-base md:text-sm font-medium mb-2 md:mb-1">Tipo</label>
        <select
          bind:value={newDesign.tipo}
          class="w-full px-3 py-3 md:py-2 text-base md:text-sm bg-bg-input border border-border rounded-xl md:rounded-lg"
        >
          <option value="mobile">📱 Mobile</option>
          <option value="tablet">📟 Tablet</option>
          <option value="desktop">🖥️ Desktop</option>
        </select>
      </div>
      <div>
        <label class="block text-base md:text-sm font-medium mb-2 md:mb-1">Icono</label>
        <input
          type="text"
          bind:value={newDesign.icono}
          placeholder="📱"
          maxlength={4}
          class="w-full px-4 py-3 md:px-3 md:py-2 text-xl md:text-sm text-center bg-bg-input border border-border rounded-xl md:rounded-lg"
        />
      </div>
    </div>
  </form>

  <svelte:fragment slot="footer">
    <Button variant="ghost" on:click={() => createModalOpen = false} disabled={creating} class="flex-1 md:flex-none py-3 md:py-2">
      Cancelar
    </Button>
    <Button variant="primary" on:click={createDesign} loading={creating} class="flex-1 md:flex-none py-3 md:py-2">
      Crear
    </Button>
  </svelte:fragment>
</Modal>
