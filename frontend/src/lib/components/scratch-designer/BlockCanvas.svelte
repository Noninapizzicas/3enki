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
  class="h-full overflow-auto p-4 md:p-6 bg-bg-secondary transition-colors overscroll-contain {isDragOver ? 'bg-primary bg-opacity-5' : ''}"
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
  role="region"
  aria-label="Canvas de bloques"
>
  {#if blocks.length === 0}
    <!-- Empty state - mobile optimized -->
    <div class="h-full flex flex-col items-center justify-center text-text-muted px-4">
      <div class="text-center">
        <span class="text-5xl md:text-6xl block mb-4">🧩</span>
        <h3 class="text-lg font-medium mb-2">Tu diseño está vacío</h3>
        <p class="text-sm max-w-xs mx-auto">
          <span class="hidden md:inline">Arrastra bloques desde la paleta izquierda</span>
          <span class="md:hidden">Ve a <strong>Bloques</strong> y toca para añadir componentes</span>
        </p>
      </div>

      <!-- Drop zone visual -->
      <div class="mt-6 md:mt-8 w-full max-w-xs h-28 md:h-32 border-2 border-dashed border-border rounded-xl flex items-center justify-center {isDragOver ? 'border-primary bg-primary/10' : ''}">
        <span class="text-sm">{isDragOver ? 'Suelta aquí' : 'Zona de diseño'}</span>
      </div>
    </div>
  {:else}
    <!-- Blocks list - mobile optimized -->
    <div class="space-y-3 md:space-y-2 max-w-2xl mx-auto pb-4">
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

          <!-- Actions - always visible on mobile, hover on desktop -->
          <div class="absolute top-1 right-1 flex gap-1 z-10 md:hidden md:group-hover:flex
            {selectedBlockId === block.id ? 'flex' : 'hidden md:group-hover:flex'}">
            <button
              class="w-8 h-8 md:w-6 md:h-6 flex items-center justify-center bg-white/95 rounded-lg md:rounded shadow-lg text-sm md:text-xs hover:bg-white active:scale-95 transition-transform disabled:opacity-40"
              on:click|stopPropagation={() => moveBlock(block.id, 'up')}
              disabled={index === 0}
              title="Mover arriba"
            >
              ↑
            </button>
            <button
              class="w-8 h-8 md:w-6 md:h-6 flex items-center justify-center bg-white/95 rounded-lg md:rounded shadow-lg text-sm md:text-xs hover:bg-white active:scale-95 transition-transform disabled:opacity-40"
              on:click|stopPropagation={() => moveBlock(block.id, 'down')}
              disabled={index === blocks.length - 1}
              title="Mover abajo"
            >
              ↓
            </button>
            <button
              class="w-8 h-8 md:w-6 md:h-6 flex items-center justify-center bg-red-500 text-white rounded-lg md:rounded shadow-lg text-sm md:text-xs hover:bg-red-600 active:scale-95 transition-transform"
              on:click|stopPropagation={() => deleteBlock(block.id)}
              title="Eliminar"
            >
              ×
            </button>
          </div>

          <!-- Selection indicator mobile -->
          {#if selectedBlockId === block.id}
            <div class="md:hidden absolute -left-1 top-0 bottom-0 w-1 bg-primary rounded-full"></div>
          {/if}
        </div>
      {/each}

      <!-- Add more hint -->
      <div
        class="py-6 md:py-4 border-2 border-dashed border-border rounded-xl md:rounded-lg text-center text-text-muted text-sm transition-colors {isDragOver ? 'border-primary bg-primary/10' : ''}"
      >
        <span class="hidden md:inline">{isDragOver ? 'Suelta para añadir' : 'Arrastra más bloques aquí'}</span>
        <span class="md:hidden">{blocks.length} bloque{blocks.length !== 1 ? 's' : ''} en tu diseño</span>
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
