<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Button from './Button.svelte';

  export let accept = '*';
  export let multiple = false;
  export let maxSize = 10 * 1024 * 1024; // 10MB
  export let label = 'Subir archivo';
  export let disabled = false;
  export let files: File[] = [];

  const dispatch = createEventDispatcher<{
    change: File[];
    error: string;
  }>();

  let input: HTMLInputElement;
  let dragOver = false;

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;

    const newFiles: File[] = [];
    const errors: string[] = [];

    for (const file of Array.from(fileList)) {
      if (file.size > maxSize) {
        errors.push(`${file.name} excede el tamaño máximo (${formatSize(maxSize)})`);
        continue;
      }
      newFiles.push(file);
    }

    if (errors.length > 0) {
      dispatch('error', errors.join(', '));
    }

    if (newFiles.length > 0) {
      files = multiple ? [...files, ...newFiles] : newFiles;
      dispatch('change', files);
    }
  }

  function handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement;
    handleFiles(target.files);
    target.value = ''; // Reset para permitir seleccionar el mismo archivo
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (disabled) return;
    handleFiles(e.dataTransfer?.files ?? null);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (!disabled) dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function removeFile(index: number) {
    files = files.filter((_, i) => i !== index);
    dispatch('change', files);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function triggerInput() {
    input?.click();
  }
</script>

<div class="space-y-3">
  <!-- Drop Zone -->
  <div
    class="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
    class:border-border={!dragOver}
    class:border-primary={dragOver}
    class:bg-primary={dragOver}
    class:bg-opacity-5={dragOver}
    class:opacity-50={disabled}
    class:cursor-not-allowed={disabled}
    on:drop={handleDrop}
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    role="button"
    tabindex="0"
    on:click={triggerInput}
    on:keypress={(e) => e.key === 'Enter' && triggerInput()}
  >
    <input
      bind:this={input}
      type="file"
      {accept}
      {multiple}
      {disabled}
      class="hidden"
      on:change={handleInputChange}
    />

    <div class="space-y-2">
      <span class="text-3xl">📁</span>
      <p class="text-text-muted">
        Arrastra archivos aquí o
        <span class="text-primary font-medium">haz clic para seleccionar</span>
      </p>
      <p class="text-xs text-text-disabled">
        Máximo {formatSize(maxSize)} por archivo
      </p>
    </div>
  </div>

  <!-- File List -->
  {#if files.length > 0}
    <ul class="space-y-2">
      {#each files as file, index}
        <li class="flex items-center justify-between p-3 bg-bg-card rounded-lg border border-border">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-lg">📄</span>
            <div class="min-w-0">
              <p class="text-sm truncate">{file.name}</p>
              <p class="text-xs text-text-muted">{formatSize(file.size)}</p>
            </div>
          </div>
          <button
            type="button"
            class="p-1 text-text-muted hover:text-danger transition-colors"
            on:click={() => removeFile(index)}
            aria-label="Eliminar archivo"
          >
            ✕
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
