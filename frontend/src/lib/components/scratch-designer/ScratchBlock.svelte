<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let block: {
    id: string;
    tipo: string;
    categoria: string;
    nombre: string;
    icono?: string;
    forma?: string;
    props?: Record<string, any>;
    hijos?: any[];
    eventos?: Record<string, any>;
  };
  export let selected = false;
  export let draggable = true;
  export let inPalette = false;
  export let compact = false;

  const dispatch = createEventDispatcher();

  // Colores por categoria (tipo Scratch)
  const categoryColors: Record<string, { bg: string; border: string; text: string }> = {
    pantalla:   { bg: 'bg-purple-600', border: 'border-purple-700', text: 'text-white' },
    layout:     { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-white' },
    contenedor: { bg: 'bg-cyan-500', border: 'border-cyan-600', text: 'text-white' },
    componente: { bg: 'bg-green-500', border: 'border-green-600', text: 'text-white' },
    modulo:     { bg: 'bg-amber-500', border: 'border-amber-600', text: 'text-white' },
    evento:     { bg: 'bg-red-500', border: 'border-red-600', text: 'text-white' },
    accion:     { bg: 'bg-pink-500', border: 'border-pink-600', text: 'text-white' },
    condicion:  { bg: 'bg-orange-500', border: 'border-orange-600', text: 'text-white' },
    datos:      { bg: 'bg-violet-500', border: 'border-violet-600', text: 'text-white' }
  };

  $: colors = categoryColors[block.categoria] || categoryColors.componente;
  $: isHat = block.forma === 'hat';
  $: isReporter = block.forma === 'reporter';
  $: isCBlock = block.forma === 'c-block';

  function handleDragStart(e: DragEvent) {
    if (!draggable) return;
    e.dataTransfer?.setData('application/json', JSON.stringify(block));
    dispatch('dragstart', block);
  }

  function handleClick() {
    dispatch('click', block);
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="scratch-block relative select-none transition-all duration-150
    {colors.bg} {colors.border} {colors.text}
    {isHat ? 'rounded-t-2xl' : 'rounded-xl md:rounded-lg'}
    {isReporter ? 'rounded-full px-4' : 'px-4 md:px-3'}
    {isCBlock ? 'pb-1' : ''}
    {compact ? 'py-2.5 md:py-1.5 text-sm md:text-xs' : 'py-3 md:py-2 text-base md:text-sm'}
    {selected ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800 scale-[1.02] md:scale-105' : ''}
    {draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
    {inPalette ? 'hover:scale-[1.02] md:hover:scale-105 hover:shadow-lg active:scale-100 active:brightness-95' : 'hover:brightness-110 active:brightness-95'}
    border-2 shadow-md touch-manipulation"
  draggable={draggable}
  on:dragstart={handleDragStart}
  on:click={handleClick}
  on:keypress={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex="0"
>
  <!-- Hat notch (para bloques de evento/inicio) -->
  {#if isHat}
    <div class="absolute -top-2 left-4 w-8 h-3 {colors.bg} rounded-t-lg"></div>
  {/if}

  <!-- Contenido del bloque - mobile optimized -->
  <div class="flex items-center gap-3 md:gap-2 {compact ? 'min-h-[32px] md:min-h-[24px]' : 'min-h-[40px] md:min-h-[32px]'}">
    {#if block.icono}
      <span class="{compact ? 'text-xl md:text-base' : 'text-2xl md:text-lg'}">{block.icono}</span>
    {/if}
    <span class="font-medium truncate flex-1">{block.nombre}</span>

    <!-- Props inline (para bloques en canvas) - hidden on mobile in palette -->
    {#if !inPalette && block.props}
      {#each Object.entries(block.props).slice(0, 2) as [key, value]}
        {#if value && typeof value === 'string' && value.length < 20}
          <span class="hidden md:inline px-2 py-0.5 bg-white/20 rounded text-xs truncate max-w-[100px]">
            {value}
          </span>
        {/if}
      {/each}
    {/if}

    <!-- Mobile tap indicator in palette -->
    {#if inPalette}
      <span class="md:hidden text-white/60 text-sm">+</span>
    {/if}
  </div>

  <!-- C-Block hueco para hijos -->
  {#if isCBlock && !inPalette}
    <div class="ml-4 mt-2 min-h-[40px] bg-black/20 rounded border-2 border-dashed border-white/30 p-2">
      {#if block.hijos && block.hijos.length > 0}
        {#each block.hijos as hijo}
          <svelte:self block={hijo} compact={true} draggable={false} />
        {/each}
      {:else}
        <span class="text-white/50 text-xs">Arrastra bloques aquí</span>
      {/if}
    </div>
  {/if}

  <!-- Notch inferior (para conexión) -->
  {#if !isReporter && !isHat}
    <div class="absolute -bottom-1 left-4 w-6 h-2 {colors.bg}"></div>
  {/if}
</div>

<style>
  .scratch-block {
    min-width: 120px;
    max-width: 100%;
    /* Better touch feedback */
    -webkit-tap-highlight-color: transparent;
  }

  /* Mobile: slightly larger min-width for better touch */
  @media (max-width: 767px) {
    .scratch-block {
      min-width: 140px;
    }
  }
</style>
