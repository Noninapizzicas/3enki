<script lang="ts">
  /**
   * Chip - Elemento compacto para adjuntos
   *
   * Features:
   * - Icono según tipo de archivo
   * - Nombre del archivo (truncado si es largo)
   * - Botón de eliminar (✕)
   * - Tamaño del archivo opcional
   */

  import { createEventDispatcher } from 'svelte';
  import { getAttachmentIcon, formatFileSize } from '$lib/stores/attachments';

  export let id: string;
  export let name: string;
  export let type: string;
  export let size: number | undefined = undefined;
  export let removable: boolean = true;

  const dispatch = createEventDispatcher<{ remove: { id: string } }>();

  $: icon = getAttachmentIcon(type);
  $: displayName = name.length > 20 ? name.slice(0, 17) + '...' : name;
  $: displaySize = size ? formatFileSize(size) : '';

  function handleRemove() {
    dispatch('remove', { id });
  }
</script>

<div class="chip" title={name}>
  <span class="icon">{icon}</span>
  <span class="name">{displayName}</span>

  {#if displaySize}
    <span class="size">{displaySize}</span>
  {/if}

  {#if removable}
    <button class="remove" on:click|stopPropagation={handleRemove} title="Quitar">
      ✕
    </button>
  {/if}
</div>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 9999px;
    font-size: 0.75rem;
    color: var(--color-text, #e5e5e5);
    max-width: 200px;
  }

  .icon {
    font-size: 0.875rem;
    line-height: 1;
  }

  .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .size {
    color: var(--color-text-muted, #a3a3a3);
    font-size: 0.625rem;
  }

  .remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    padding: 0;
    margin-left: 0.125rem;
    border: none;
    background: transparent;
    color: var(--color-text-muted, #a3a3a3);
    border-radius: 50%;
    cursor: pointer;
    font-size: 0.625rem;
    line-height: 1;
    transition: background-color 0.15s, color 0.15s;
  }

  .remove:hover {
    background: var(--color-error, #ef4444);
    color: white;
  }
</style>
