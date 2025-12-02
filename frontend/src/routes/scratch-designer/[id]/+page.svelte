<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Button, Badge } from '$components/ui';
  import { Modal, Spinner, Alert } from '$components/feedback';
  import { toast } from '$stores/toast';
  import BlockPalette from '$lib/components/scratch-designer/BlockPalette.svelte';
  import BlockCanvas from '$lib/components/scratch-designer/BlockCanvas.svelte';
  import PropertyPanel from '$lib/components/scratch-designer/PropertyPanel.svelte';
  import config from '$lib/config';

  interface Block {
    id: string;
    tipo: string;
    categoria: string;
    nombre: string;
    icono?: string;
    forma?: string;
    props?: Record<string, any>;
    eventos?: Record<string, any[]>;
    hijos?: Block[];
    position?: { x: number; y: number };
  }

  interface Design {
    id: string;
    nombre: string;
    tipo: string;
    icono: string;
    bloques: Block[];
    eventos_globales: any[];
    variables: any[];
    created_at: string;
    updated_at: string;
  }

  // State
  let design: Design | null = null;
  let loading = true;
  let saving = false;
  let error: string | null = null;

  // Editor state
  let selectedBlockId: string | null = null;
  let hasChanges = false;
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  // View
  let showJSON = false;
  let exportModalOpen = false;
  let exportedJSON = '';

  const apiBase = `${config.apiUrl}/modules/scratch-designer`;
  $: designId = $page.params.id;

  // Fetch design
  async function fetchDesign() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/designs/${designId}`);
      if (!res.ok) throw new Error('Diseño no encontrado');
      const data = await res.json();
      design = data.design;
      if (!design.bloques) design.bloques = [];
      if (!design.eventos_globales) design.eventos_globales = [];
      if (!design.variables) design.variables = [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error';
    } finally {
      loading = false;
    }
  }

  // Save design
  async function saveDesign() {
    if (!design) return;

    saving = true;
    try {
      const res = await fetch(`${apiBase}/designs/${designId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: design.nombre,
          bloques: design.bloques,
          eventos_globales: design.eventos_globales,
          variables: design.variables
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

  // Auto-save
  function scheduleAutoSave() {
    hasChanges = true;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveDesign, 5000);
  }

  // Block handlers
  function handleBlockDrop(e: CustomEvent<Block>) {
    if (!design) return;
    design.bloques = [...design.bloques, e.detail];
    selectedBlockId = e.detail.id;
    scheduleAutoSave();
  }

  function handleBlockSelect(e: CustomEvent<string>) {
    selectedBlockId = e.detail;
  }

  function handleBlockDelete(e: CustomEvent<string>) {
    if (!design) return;
    design.bloques = design.bloques.filter(b => b.id !== e.detail);
    if (selectedBlockId === e.detail) selectedBlockId = null;
    scheduleAutoSave();
  }

  function handleBlockMove(e: CustomEvent<{ id: string; direction: 'up' | 'down' }>) {
    if (!design) return;
    const { id, direction } = e.detail;
    const idx = design.bloques.findIndex(b => b.id === id);
    if (idx === -1) return;

    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= design.bloques.length) return;

    const blocks = [...design.bloques];
    [blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]];
    design.bloques = blocks;
    scheduleAutoSave();
  }

  function handlePropUpdate(e: CustomEvent<{ id: string; key: string; value: any }>) {
    if (!design) return;
    const { id, key, value } = e.detail;
    const block = design.bloques.find(b => b.id === id);
    if (block) {
      if (!block.props) block.props = {};
      block.props[key] = value;
      design.bloques = [...design.bloques];
      scheduleAutoSave();
    }
  }

  function handleAddEvent(e: CustomEvent<{ id: string; eventType: string }>) {
    if (!design) return;
    const { id, eventType } = e.detail;
    const block = design.bloques.find(b => b.id === id);
    if (block) {
      if (!block.eventos) block.eventos = {};
      if (!block.eventos[eventType]) block.eventos[eventType] = [];
      block.eventos[eventType].push({ tipo: 'accion', nombre: 'Nueva acción' });
      design.bloques = [...design.bloques];
      scheduleAutoSave();
    }
  }

  function handleRemoveEvent(e: CustomEvent<{ id: string; eventType: string; index: number }>) {
    if (!design) return;
    const { id, eventType, index } = e.detail;
    const block = design.bloques.find(b => b.id === id);
    if (block?.eventos?.[eventType]) {
      block.eventos[eventType].splice(index, 1);
      design.bloques = [...design.bloques];
      scheduleAutoSave();
    }
  }

  // Export
  async function exportDesign() {
    try {
      const res = await fetch(`${apiBase}/export/json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design_id: designId })
      });

      if (!res.ok) throw new Error('Error al exportar');
      const data = await res.json();
      exportedJSON = JSON.stringify(data.output, null, 2);
      exportModalOpen = true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  function copyJSON() {
    navigator.clipboard.writeText(exportedJSON);
    toast.success('JSON copiado');
  }

  // Selected block
  $: selectedBlock = design?.bloques.find(b => b.id === selectedBlockId) || null;

  onMount(fetchDesign);

  onDestroy(() => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
  });
</script>

<svelte:head>
  <title>{design?.nombre || 'Editor'} - Scratch Designer</title>
</svelte:head>

{#if loading}
  <div class="h-screen flex items-center justify-center">
    <Spinner size="lg" />
  </div>
{:else if error}
  <div class="h-screen flex items-center justify-center">
    <Alert variant="danger" title="Error">
      {error}
      <Button variant="secondary" size="sm" on:click={() => goto('/scratch-designer')} class="mt-2">
        Volver
      </Button>
    </Alert>
  </div>
{:else if design}
  <div class="h-screen flex flex-col bg-bg-secondary">
    <!-- Header -->
    <header class="bg-bg-primary border-b border-border px-4 py-2 flex items-center gap-4 flex-shrink-0">
      <Button variant="ghost" size="sm" on:click={() => goto('/scratch-designer')}>
        ← Volver
      </Button>

      <div class="flex items-center gap-2 flex-1">
        <span class="text-xl">{design.icono}</span>
        <input
          type="text"
          bind:value={design.nombre}
          on:input={scheduleAutoSave}
          class="bg-transparent font-medium text-lg border-none focus:outline-none focus:ring-0 max-w-xs"
        />
        <Badge variant="default" size="sm">{design.tipo}</Badge>
        {#if hasChanges}
          <Badge variant="warning" size="sm">Sin guardar</Badge>
        {/if}
      </div>

      <!-- Stats -->
      <div class="hidden md:flex items-center gap-4 text-sm text-text-muted">
        <span>🧩 {design.bloques.length} bloques</span>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          on:click={() => showJSON = !showJSON}
          class={showJSON ? 'bg-bg-secondary' : ''}
        >
          {showJSON ? '🎨 Canvas' : '📄 JSON'}
        </Button>
        <Button variant="ghost" size="sm" on:click={exportDesign}>
          📤 Exportar
        </Button>
        <Button variant="primary" size="sm" on:click={saveDesign} loading={saving}>
          💾 Guardar
        </Button>
      </div>
    </header>

    <!-- Main editor -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left: Block Palette -->
      <aside class="w-64 flex-shrink-0 hidden md:block">
        <BlockPalette
          on:dragstart
          on:select={(e) => {
            // Al hacer click en paleta, añadir directamente
            if (!design) return;
            const block = e.detail;
            const newBlock = {
              ...block,
              id: `${block.id}_${Date.now()}`,
              props: { ...block.props }
            };
            design.bloques = [...design.bloques, newBlock];
            selectedBlockId = newBlock.id;
            scheduleAutoSave();
          }}
        />
      </aside>

      <!-- Center: Canvas or JSON -->
      <main class="flex-1 overflow-hidden">
        {#if showJSON}
          <!-- JSON View -->
          <div class="h-full p-4 overflow-auto">
            <pre class="bg-bg-primary p-4 rounded-lg text-sm font-mono overflow-auto h-full border border-border">{JSON.stringify(design, null, 2)}</pre>
          </div>
        {:else}
          <!-- Canvas -->
          <BlockCanvas
            blocks={design.bloques}
            {selectedBlockId}
            on:drop={handleBlockDrop}
            on:select={handleBlockSelect}
            on:delete={handleBlockDelete}
            on:move={handleBlockMove}
          />
        {/if}
      </main>

      <!-- Right: Property Panel -->
      <aside class="w-72 flex-shrink-0 hidden lg:block">
        <PropertyPanel
          block={selectedBlock}
          on:update={handlePropUpdate}
          on:add-event={handleAddEvent}
          on:remove-event={handleRemoveEvent}
        />
      </aside>
    </div>

    <!-- Mobile: Selected block info -->
    {#if selectedBlock}
      <div class="lg:hidden border-t border-border bg-bg-primary p-2 flex items-center gap-2">
        <span>{selectedBlock.icono}</span>
        <span class="font-medium text-sm flex-1 truncate">{selectedBlock.nombre}</span>
        <Button variant="ghost" size="sm" on:click={() => selectedBlockId = null}>
          Cerrar
        </Button>
      </div>
    {/if}
  </div>
{/if}

<!-- Export Modal -->
<Modal bind:open={exportModalOpen} title="Exportar JSON" size="lg">
  <div class="space-y-4">
    <p class="text-sm text-text-muted">
      JSON generado listo para usar con ui-renderer o module.json
    </p>
    <pre class="bg-bg-input p-4 rounded-lg text-xs font-mono overflow-auto max-h-96">{exportedJSON}</pre>
  </div>

  <svelte:fragment slot="footer">
    <Button variant="primary" on:click={copyJSON}>
      📋 Copiar
    </Button>
    <Button variant="ghost" on:click={() => exportModalOpen = false}>
      Cerrar
    </Button>
  </svelte:fragment>
</Modal>
