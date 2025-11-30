<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Button from '$components/ui/Button.svelte';

  export let open = false;
  export let title = '';
  export let size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  export let closable = true;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl'
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

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget && closable) {
      handleClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-modal bg-black/70 flex items-center justify-center p-4 animate-fade-in"
    on:click={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-labelledby={title ? 'modal-title' : undefined}
  >
    <!-- Modal -->
    <div
      class="bg-bg-card border border-border rounded-xl w-full {sizeClasses[size]} animate-slide-in"
      on:click|stopPropagation
    >
      <!-- Header -->
      {#if title || closable}
        <div class="flex items-center justify-between px-6 py-4 border-b border-border">
          {#if title}
            <h2 id="modal-title" class="text-lg font-semibold">{title}</h2>
          {:else}
            <div />
          {/if}
          {#if closable}
            <button
              class="p-1 hover:bg-bg-hover rounded transition-colors text-text-muted hover:text-text"
              on:click={handleClose}
              aria-label="Cerrar"
            >
              ✕
            </button>
          {/if}
        </div>
      {/if}

      <!-- Body -->
      <div class="px-6 py-4">
        <slot />
      </div>

      <!-- Footer -->
      {#if $$slots.footer}
        <div class="px-6 py-4 border-t border-border flex justify-end gap-2">
          <slot name="footer" />
        </div>
      {/if}
    </div>
  </div>
{/if}
