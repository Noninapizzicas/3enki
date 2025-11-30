<script lang="ts">
  import { onMount } from 'svelte';
  import { Header } from '$components/layout';
  import { Card, Button, Badge, Input, Textarea } from '$components/ui';
  import { Modal, Spinner } from '$components/feedback';
  import { subscribe, events } from '$stores/mqtt';
  import { toast } from '$stores/toast';
  import config from '$lib/config';

  // Types
  interface Nota {
    id: string;
    titulo: string;
    contenido: string;
    color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'orange';
    pinned: boolean;
    created_at: string;
    updated_at: string | null;
  }

  // State
  let notas: Nota[] = [];
  let loading = true;
  let error: string | null = null;

  // Modal state
  let modalOpen = false;
  let editingNota: Nota | null = null;
  let formData = {
    titulo: '',
    contenido: '',
    color: 'yellow' as Nota['color']
  };
  let saving = false;

  // Colors
  const colores: { value: Nota['color']; label: string; bg: string }[] = [
    { value: 'yellow', label: 'Amarillo', bg: 'bg-yellow-100' },
    { value: 'green', label: 'Verde', bg: 'bg-green-100' },
    { value: 'blue', label: 'Azul', bg: 'bg-blue-100' },
    { value: 'pink', label: 'Rosa', bg: 'bg-pink-100' },
    { value: 'purple', label: 'Morado', bg: 'bg-purple-100' },
    { value: 'orange', label: 'Naranja', bg: 'bg-orange-100' }
  ];

  const colorClasses: Record<Nota['color'], string> = {
    yellow: 'bg-yellow-100 border-yellow-300 dark:bg-yellow-900 dark:border-yellow-700',
    green: 'bg-green-100 border-green-300 dark:bg-green-900 dark:border-green-700',
    blue: 'bg-blue-100 border-blue-300 dark:bg-blue-900 dark:border-blue-700',
    pink: 'bg-pink-100 border-pink-300 dark:bg-pink-900 dark:border-pink-700',
    purple: 'bg-purple-100 border-purple-300 dark:bg-purple-900 dark:border-purple-700',
    orange: 'bg-orange-100 border-orange-300 dark:bg-orange-900 dark:border-orange-700'
  };

  // API
  const apiBase = `${config.apiUrl}/modules/notas`;

  async function fetchNotas() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/notas`);
      if (!res.ok) throw new Error('Error al cargar notas');
      const data = await res.json();
      notas = data.notas || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }

  async function createNota() {
    saving = true;
    try {
      const res = await fetch(`${apiBase}/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.errors?.join(', ') || 'Error al crear nota');
      }
      closeModal();
      toast.success('Nota creada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      saving = false;
    }
  }

  async function updateNota() {
    if (!editingNota) return;
    saving = true;
    try {
      const res = await fetch(`${apiBase}/notas/${editingNota.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.errors?.join(', ') || 'Error al actualizar nota');
      }
      closeModal();
      toast.success('Nota actualizada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      saving = false;
    }
  }

  async function deleteNota(nota: Nota) {
    if (!confirm(`¿Eliminar "${nota.titulo}"?`)) return;
    try {
      const res = await fetch(`${apiBase}/notas/${nota.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Error al eliminar');
      toast.success('Nota eliminada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function togglePin(nota: Nota) {
    try {
      const res = await fetch(`${apiBase}/notas/${nota.id}/pin`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Error al fijar/desfijar');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  // Modal
  function openCreateModal() {
    editingNota = null;
    formData = { titulo: '', contenido: '', color: 'yellow' };
    modalOpen = true;
  }

  function openEditModal(nota: Nota) {
    editingNota = nota;
    formData = {
      titulo: nota.titulo,
      contenido: nota.contenido,
      color: nota.color
    };
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    editingNota = null;
  }

  function handleSubmit() {
    if (editingNota) {
      updateNota();
    } else {
      createNota();
    }
  }

  // Real-time updates via MQTT
  $: {
    const lastEvent = $events[$events.length - 1];
    if (lastEvent) {
      if (lastEvent.type === 'nota.creada') {
        fetchNotas(); // Refresh list
      } else if (lastEvent.type === 'nota.actualizada') {
        fetchNotas();
      } else if (lastEvent.type === 'nota.eliminada') {
        fetchNotas();
      }
    }
  }

  onMount(() => {
    fetchNotas();
    // Subscribe to notas events
    subscribe(['core/+/events/nota/#']);
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
  <title>Notas - Event-Core</title>
</svelte:head>

<Header title="Notas" subtitle="Gestión de notas rápidas con eventos en tiempo real" />

<div class="p-6">
  <!-- Actions Bar -->
  <div class="flex items-center justify-between mb-6">
    <div class="flex items-center gap-2">
      <Badge variant="primary">{notas.length} notas</Badge>
      <Badge variant="success">
        {notas.filter(n => n.pinned).length} fijadas
      </Badge>
    </div>
    <Button variant="primary" on:click={openCreateModal}>
      + Nueva Nota
    </Button>
  </div>

  <!-- Content -->
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <Spinner size="lg" />
    </div>
  {:else if error}
    <Card class="text-center py-8">
      <p class="text-danger mb-4">{error}</p>
      <Button variant="secondary" on:click={fetchNotas}>Reintentar</Button>
    </Card>
  {:else if notas.length === 0}
    <Card class="text-center py-12">
      <span class="text-4xl mb-4 block">📝</span>
      <p class="text-text-muted mb-4">No hay notas todavía</p>
      <Button variant="primary" on:click={openCreateModal}>Crear primera nota</Button>
    </Card>
  {:else}
    <!-- Notes Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {#each notas as nota (nota.id)}
        <div
          class="relative rounded-lg border-2 p-4 transition-all hover:shadow-lg cursor-pointer {colorClasses[nota.color]}"
          on:click={() => openEditModal(nota)}
          on:keypress={(e) => e.key === 'Enter' && openEditModal(nota)}
          role="button"
          tabindex="0"
        >
          <!-- Pin indicator -->
          {#if nota.pinned}
            <div class="absolute -top-2 -right-2 text-xl">📌</div>
          {/if}

          <!-- Title -->
          <h3 class="font-semibold text-lg mb-2 pr-6 truncate text-gray-800 dark:text-gray-100">
            {nota.titulo}
          </h3>

          <!-- Content preview -->
          <p class="text-sm text-gray-600 dark:text-gray-300 line-clamp-4 whitespace-pre-wrap mb-3">
            {nota.contenido || 'Sin contenido'}
          </p>

          <!-- Footer -->
          <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mt-auto pt-2 border-t border-gray-200 dark:border-gray-600">
            <span>{formatDate(nota.created_at)}</span>
            <div class="flex gap-1">
              <button
                class="p-1 hover:bg-white hover:bg-opacity-50 rounded transition-colors"
                on:click|stopPropagation={() => togglePin(nota)}
                title={nota.pinned ? 'Desfijar' : 'Fijar'}
              >
                {nota.pinned ? '📌' : '📍'}
              </button>
              <button
                class="p-1 hover:bg-white hover:bg-opacity-50 rounded transition-colors text-danger"
                on:click|stopPropagation={() => deleteNota(nota)}
                title="Eliminar"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create/Edit Modal -->
<Modal
  bind:open={modalOpen}
  title={editingNota ? 'Editar Nota' : 'Nueva Nota'}
  size="md"
  on:close={closeModal}
>
  <form on:submit|preventDefault={handleSubmit} class="space-y-4">
    <Input
      label="Título"
      bind:value={formData.titulo}
      placeholder="Título de la nota"
      required
    />

    <Textarea
      label="Contenido"
      bind:value={formData.contenido}
      placeholder="Escribe el contenido de tu nota..."
      rows={6}
    />

    <div>
      <label class="block text-sm font-medium mb-2">Color</label>
      <div class="flex flex-wrap gap-2">
        {#each colores as color}
          <button
            type="button"
            class="w-8 h-8 rounded-full border-2 transition-all {color.bg}"
            class:ring-2={formData.color === color.value}
            class:ring-primary={formData.color === color.value}
            class:ring-offset-2={formData.color === color.value}
            on:click={() => formData.color = color.value}
            title={color.label}
          ></button>
        {/each}
      </div>
    </div>
  </form>

  <svelte:fragment slot="footer">
    <Button variant="ghost" on:click={closeModal} disabled={saving}>
      Cancelar
    </Button>
    <Button variant="primary" on:click={handleSubmit} loading={saving}>
      {editingNota ? 'Guardar' : 'Crear'}
    </Button>
  </svelte:fragment>
</Modal>

<style>
  .line-clamp-4 {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
