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

  // Mobile navigation - tabs: 'palette' | 'canvas' | 'props'
  type MobileTab = 'palette' | 'canvas' | 'props';
  let mobileTab: MobileTab = 'canvas';
  let isMobile = false;

  // Detect mobile viewport
  function checkMobile() {
    isMobile = window.innerWidth < 768;
  }

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

  // Auto-switch to props when block selected on mobile
  $: if (isMobile && selectedBlockId && mobileTab === 'canvas') {
    // Small delay to let user see the selection
    setTimeout(() => {
      if (selectedBlockId) mobileTab = 'props';
    }, 300);
  }

  onMount(() => {
    fetchDesign();
    checkMobile();
    window.addEventListener('resize', checkMobile);
  });

  onDestroy(() => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', checkMobile);
    }
  });

  // Mobile: add block from palette and switch to canvas
  function addBlockFromPalette(block: Block) {
    if (!design) return;
    const newBlock = {
      ...block,
      id: `${block.id}_${Date.now()}`,
      props: { ...block.props }
    };
    design.bloques = [...design.bloques, newBlock];
    selectedBlockId = newBlock.id;
    scheduleAutoSave();
    if (isMobile) {
      mobileTab = 'canvas';
      toast.success(`${block.icono || '🧩'} ${block.nombre} añadido`);
    }
  }
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
    <!-- Mobile Header (compact) -->
    <header class="md:hidden bg-bg-primary border-b border-border px-3 py-2 flex items-center gap-2 flex-shrink-0">
      <Button variant="ghost" size="sm" on:click={() => goto('/scratch-designer')}>
        ←
      </Button>
      <span class="text-lg">{design.icono}</span>
      <span class="font-medium text-sm flex-1 truncate">{design.nombre}</span>
      {#if hasChanges}
        <span class="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
      {/if}
      <Button variant="primary" size="sm" on:click={saveDesign} loading={saving}>
        💾
      </Button>
      <button
        class="p-2 hover:bg-bg-hover rounded-lg"
        on:click={exportDesign}
        title="Exportar"
      >
        📤
      </button>
    </header>

    <!-- Desktop Header (full) -->
    <header class="hidden md:flex bg-bg-primary border-b border-border px-4 py-2 items-center gap-4 flex-shrink-0">
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

      <div class="flex items-center gap-4 text-sm text-text-muted">
        <span>🧩 {design.bloques.length} bloques</span>
      </div>

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

    <!-- Main editor area -->
    <div class="flex-1 flex overflow-hidden relative">
      <!-- Desktop: 3-column layout -->
      <aside class="w-64 flex-shrink-0 hidden md:block">
        <BlockPalette
          on:dragstart
          on:select={(e) => addBlockFromPalette(e.detail)}
        />
      </aside>

      <main class="flex-1 overflow-hidden hidden md:block">
        {#if showJSON}
          <div class="h-full p-4 overflow-auto">
            <pre class="bg-bg-primary p-4 rounded-lg text-sm font-mono overflow-auto h-full border border-border">{JSON.stringify(design, null, 2)}</pre>
          </div>
        {:else}
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

      <aside class="w-72 flex-shrink-0 hidden lg:block">
        <PropertyPanel
          block={selectedBlock}
          on:update={handlePropUpdate}
          on:add-event={handleAddEvent}
          on:remove-event={handleRemoveEvent}
        />
      </aside>

      <!-- Mobile: Tab-based views (full screen each) -->
      <div class="md:hidden flex-1 flex flex-col overflow-hidden">
        <!-- Mobile Tab Content -->
        <div class="flex-1 overflow-hidden">
          {#if mobileTab === 'palette'}
            <BlockPalette
              on:dragstart
              on:select={(e) => addBlockFromPalette(e.detail)}
            />
          {:else if mobileTab === 'canvas'}
            {#if showJSON}
              <div class="h-full p-3 overflow-auto">
                <pre class="bg-bg-primary p-3 rounded-lg text-xs font-mono overflow-auto h-full border border-border">{JSON.stringify(design, null, 2)}</pre>
              </div>
            {:else}
              <BlockCanvas
                blocks={design.bloques}
                {selectedBlockId}
                on:drop={handleBlockDrop}
                on:select={handleBlockSelect}
                on:delete={handleBlockDelete}
                on:move={handleBlockMove}
              />
            {/if}
          {:else if mobileTab === 'props'}
            <PropertyPanel
              block={selectedBlock}
              on:update={handlePropUpdate}
              on:add-event={handleAddEvent}
              on:remove-event={handleRemoveEvent}
            />
          {/if}
        </div>

        <!-- Mobile Bottom Navigation -->
        <nav class="bg-bg-primary border-t border-border flex-shrink-0 safe-area-bottom">
          <div class="flex">
            <button
              class="flex-1 py-3 flex flex-col items-center gap-1 transition-colors
                {mobileTab === 'palette' ? 'text-primary bg-primary/10' : 'text-text-muted hover:text-text-primary'}"
              on:click={() => mobileTab = 'palette'}
            >
              <span class="text-xl">🧩</span>
              <span class="text-xs font-medium">Bloques</span>
            </button>
            <button
              class="flex-1 py-3 flex flex-col items-center gap-1 transition-colors relative
                {mobileTab === 'canvas' ? 'text-primary bg-primary/10' : 'text-text-muted hover:text-text-primary'}"
              on:click={() => mobileTab = 'canvas'}
            >
              <span class="text-xl">📱</span>
              <span class="text-xs font-medium">Canvas</span>
              {#if design.bloques.length > 0}
                <span class="absolute top-2 right-1/4 w-5 h-5 bg-primary text-white text-xs rounded-full flex items-center justify-center">
                  {design.bloques.length}
                </span>
              {/if}
            </button>
            <button
              class="flex-1 py-3 flex flex-col items-center gap-1 transition-colors relative
                {mobileTab === 'props' ? 'text-primary bg-primary/10' : 'text-text-muted hover:text-text-primary'}"
              on:click={() => mobileTab = 'props'}
              disabled={!selectedBlock}
            >
              <span class="text-xl">{selectedBlock ? '⚙️' : '👆'}</span>
              <span class="text-xs font-medium">Props</span>
              {#if selectedBlock}
                <span class="absolute top-1 right-1/4 w-2 h-2 bg-success rounded-full"></span>
              {/if}
            </button>
            <button
              class="flex-1 py-3 flex flex-col items-center gap-1 transition-colors
                {showJSON ? 'text-primary bg-primary/10' : 'text-text-muted hover:text-text-primary'}"
              on:click={() => { showJSON = !showJSON; mobileTab = 'canvas'; }}
            >
              <span class="text-xl">{showJSON ? '🎨' : '📄'}</span>
              <span class="text-xs font-medium">{showJSON ? 'Visual' : 'JSON'}</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
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
