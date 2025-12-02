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

<div class="p-4 md:p-6 space-y-6">
  <!-- Toolbar -->
  <div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
    <Input
      placeholder="Buscar diseños..."
      bind:value={searchQuery}
      class="w-full md:w-64"
    />
    <Button variant="primary" on:click={openCreateModal}>
      + Nuevo Diseño
    </Button>
  </div>

  <!-- Content -->
  {#if loading}
    <Card class="flex items-center justify-center py-12">
      <Spinner size="lg" />
    </Card>
  {:else if error}
    <Alert variant="danger" title="Error">
      {error}
      <Button variant="secondary" size="sm" on:click={fetchDesigns} class="mt-2">
        Reintentar
      </Button>
    </Alert>
  {:else if filteredDesigns.length === 0}
    <Card class="text-center py-12">
      <span class="text-5xl mb-4 block">🧩</span>
      <h3 class="text-lg font-medium mb-2">No hay diseños</h3>
      <p class="text-text-muted mb-4">
        Crea tu primer diseño con bloques tipo Scratch
      </p>
      <Button variant="primary" on:click={openCreateModal}>
        Crear Diseño
      </Button>
    </Card>
  {:else}
    <!-- Designs Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {#each filteredDesigns as design (design.id)}
        <Card hover class="relative group">
          <div class="flex items-start gap-3 mb-3">
            <span class="text-3xl">{design.icono}</span>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium truncate">{design.nombre}</h3>
              <div class="flex items-center gap-2 mt-1">
                <Badge variant="default" size="sm">
                  {design.tipo}
                </Badge>
                {#if design.bloques_count}
                  <span class="text-xs text-text-muted">
                    {design.bloques_count} bloques
                  </span>
                {/if}
              </div>
            </div>
          </div>

          <div class="text-xs text-text-muted mb-3">
            Actualizado: {formatDate(design.updated_at || design.created_at)}
          </div>

          <div class="flex items-center gap-2 pt-3 border-t border-border">
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
        </Card>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Modal -->
<Modal bind:open={createModalOpen} title="Nuevo Diseño" size="sm">
  <form on:submit|preventDefault={createDesign} class="space-y-4">
    <Input
      label="Nombre"
      bind:value={newDesign.nombre}
      placeholder="Mi pantalla comandero"
      required
    />

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Tipo</label>
        <select
          bind:value={newDesign.tipo}
          class="w-full px-3 py-2 bg-bg-input border border-border rounded-lg"
        >
          <option value="mobile">📱 Mobile</option>
          <option value="tablet">📟 Tablet</option>
          <option value="desktop">🖥️ Desktop</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Icono</label>
        <Input
          bind:value={newDesign.icono}
          placeholder="📱"
          maxlength={4}
        />
      </div>
    </div>
  </form>

  <svelte:fragment slot="footer">
    <Button variant="ghost" on:click={() => createModalOpen = false} disabled={creating}>
      Cancelar
    </Button>
    <Button variant="primary" on:click={createDesign} loading={creating}>
      Crear
    </Button>
  </svelte:fragment>
</Modal>
