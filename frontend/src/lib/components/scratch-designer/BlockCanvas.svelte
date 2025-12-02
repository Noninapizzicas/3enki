<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ScratchBlock from './ScratchBlock.svelte';

  export let blocks: any[] = [];
  export let selectedBlockId: string | null = null;

  const dispatch = createEventDispatcher();

  let isDragOver = false;
  let canvasEl: HTMLDivElement;

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragOver = true;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;

    const data = e.dataTransfer?.getData('application/json');
    if (!data) return;

    try {
      const block = JSON.parse(data);

      // Calcular posicion relativa
      const rect = canvasEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Crear nuevo bloque con ID unico
      const newBlock = {
        ...block,
        id: `${block.id}_${Date.now()}`,
        position: { x, y },
        props: { ...block.props }
      };

      dispatch('drop', newBlock);
    } catch (err) {
      console.error('Error parsing dropped block:', err);
    }
  }

  function handleBlockClick(e: CustomEvent<any>) {
    dispatch('select', e.detail.id);
  }

  function handleBlockDragStart(e: CustomEvent<any>) {
    // Permitir reordenar dentro del canvas
    dispatch('reorder-start', e.detail);
  }

  function deleteBlock(id: string) {
    dispatch('delete', id);
  }

  function moveBlock(id: string, direction: 'up' | 'down') {
    dispatch('move', { id, direction });
  }
</script>

<div
  bind:this={canvasEl}
  class="h-full overflow-auto p-6 bg-bg-secondary transition-colors"
  class:bg-primary/5={isDragOver}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
  role="region"
  aria-label="Canvas de bloques"
>
  {#if blocks.length === 0}
    <!-- Empty state -->
    <div class="h-full flex flex-col items-center justify-center text-text-muted">
      <div class="text-center">
        <span class="text-6xl block mb-4">🧩</span>
        <h3 class="text-lg font-medium mb-2">Arrastra bloques aquí</h3>
        <p class="text-sm max-w-xs">
          Selecciona bloques de la paleta izquierda y arrástralos para construir tu pantalla
        </p>
      </div>

      <!-- Drop zone visual -->
      <div class="mt-8 w-64 h-32 border-2 border-dashed border-border rounded-lg flex items-center justify-center {isDragOver ? 'border-primary bg-primary/10' : ''}">
        <span class="text-sm">{isDragOver ? 'Suelta aquí' : 'Zona de diseño'}</span>
      </div>
    </div>
  {:else}
    <!-- Blocks list -->
    <div class="space-y-2 max-w-2xl mx-auto">
      {#each blocks as block, index (block.id)}
        <div class="group relative">
          <!-- Block -->
          <ScratchBlock
            {block}
            selected={selectedBlockId === block.id}
            draggable={true}
            on:click={handleBlockClick}
            on:dragstart={handleBlockDragStart}
          />

          <!-- Actions overlay -->
          <div class="absolute top-1 right-1 hidden group-hover:flex gap-1 z-10">
            <button
              class="w-6 h-6 flex items-center justify-center bg-white/90 rounded shadow text-xs hover:bg-white"
              on:click={() => moveBlock(block.id, 'up')}
              disabled={index === 0}
              title="Mover arriba"
            >
              ↑
            </button>
            <button
              class="w-6 h-6 flex items-center justify-center bg-white/90 rounded shadow text-xs hover:bg-white"
              on:click={() => moveBlock(block.id, 'down')}
              disabled={index === blocks.length - 1}
              title="Mover abajo"
            >
              ↓
            </button>
            <button
              class="w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded shadow text-xs hover:bg-red-600"
              on:click={() => deleteBlock(block.id)}
              title="Eliminar"
            >
              ×
            </button>
          </div>
        </div>
      {/each}

      <!-- Add more hint -->
      <div
        class="py-4 border-2 border-dashed border-border rounded-lg text-center text-text-muted text-sm transition-colors {isDragOver ? 'border-primary bg-primary/10' : ''}"
      >
        {isDragOver ? 'Suelta para añadir' : 'Arrastra más bloques aquí'}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Highlight drop zones */
  :global(.scratch-block:hover) {
    z-index: 10;
  }
</style>
