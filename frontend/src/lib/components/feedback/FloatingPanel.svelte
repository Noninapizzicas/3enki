<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fly } from 'svelte/transition';

  export let open = false;
  export let position: 'left' | 'right' | 'top' | 'bottom' = 'right';
  export let size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  export let overlay = true;
  export let closable = true;
  export let title = '';

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  const sizeClasses = {
    sm: position === 'left' || position === 'right' ? 'w-64' : 'h-48',
    md: position === 'left' || position === 'right' ? 'w-80' : 'h-64',
    lg: position === 'left' || position === 'right' ? 'w-96' : 'h-80',
    xl: position === 'left' || position === 'right' ? 'w-[480px]' : 'h-96'
  };

  const positionClasses = {
    left: 'left-0 top-0 h-full',
    right: 'right-0 top-0 h-full',
    top: 'top-0 left-0 w-full',
    bottom: 'bottom-0 left-0 w-full'
  };

  const transitionParams = {
    left: { x: -300, duration: 200 },
    right: { x: 300, duration: 200 },
    top: { y: -200, duration: 200 },
    bottom: { y: 200, duration: 200 }
  };

  function handleClose() {
    if (closable) {
      open = false;
      dispatch('close');
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && closable) {
      handleClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- Overlay -->
  {#if overlay}
    <div
      class="fixed inset-0 bg-black/50 z-modal"
      on:click={handleClose}
      transition:fly={{ duration: 150 }}
    />
  {/if}

  <!-- Panel -->
  <div
    class="fixed z-modal bg-bg-card border-border shadow-xl {positionClasses[position]} {sizeClasses[size]}"
    class:border-l={position === 'right'}
    class:border-r={position === 'left'}
    class:border-t={position === 'bottom'}
    class:border-b={position === 'top'}
    transition:fly={transitionParams[position]}
  >
    <!-- Header -->
    {#if title || closable}
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        {#if title}
          <h2 class="font-semibold">{title}</h2>
        {:else}
          <div />
        {/if}
        {#if closable}
          <button
            class="p-1 text-text-muted hover:text-text transition-colors"
            on:click={handleClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        {/if}
      </div>
    {/if}

    <!-- Content -->
    <div class="p-4 overflow-auto" style="max-height: calc(100% - 56px)">
      <slot />
    </div>
  </div>
{/if}
