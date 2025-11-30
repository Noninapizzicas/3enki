<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Badge from '$components/ui/Badge.svelte';
  import Progress from '$components/feedback/Progress.svelte';

  type UploadedFile = {
    file: File;
    id: string;
    progress: number;
    status: 'pending' | 'uploading' | 'success' | 'error';
    error?: string;
  };

  export let accept = '*';
  export let multiple = true;
  export let maxSize = 10 * 1024 * 1024; // 10MB
  export let maxFiles = 10;
  export let disabled = false;
  export let files: UploadedFile[] = [];

  const dispatch = createEventDispatcher<{
    drop: File[];
    remove: string;
    error: string;
  }>();

  let dragOver = false;
  let dragCounter = 0;

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
    if (!disabled) dragOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) dragOver = false;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    dragCounter = 0;

    if (disabled) return;

    const droppedFiles = e.dataTransfer?.files;
    if (!droppedFiles) return;

    processFiles(Array.from(droppedFiles));
  }

  function handleFileInput(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      processFiles(Array.from(target.files));
    }
    target.value = '';
  }

  function processFiles(newFiles: File[]) {
    const errors: string[] = [];
    const validFiles: File[] = [];

    for (const file of newFiles) {
      // Check max files
      if (files.length + validFiles.length >= maxFiles) {
        errors.push(`Máximo ${maxFiles} archivos permitidos`);
        break;
      }

      // Check file size
      if (file.size > maxSize) {
        errors.push(`${file.name} excede ${formatSize(maxSize)}`);
        continue;
      }

      // Check accept type
      if (accept !== '*') {
        const acceptTypes = accept.split(',').map(t => t.trim());
        const fileType = file.type || '';
        const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();

        const isAccepted = acceptTypes.some(type => {
          if (type.startsWith('.')) return fileExt === type.toLowerCase();
          if (type.endsWith('/*')) return fileType.startsWith(type.replace('/*', '/'));
          return fileType === type;
        });

        if (!isAccepted) {
          errors.push(`${file.name} no es un tipo de archivo permitido`);
          continue;
        }
      }

      validFiles.push(file);
    }

    if (errors.length > 0) {
      dispatch('error', errors.join('. '));
    }

    if (validFiles.length > 0) {
      // Add to files list
      const newUploadedFiles: UploadedFile[] = validFiles.map(file => ({
        file,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        progress: 0,
        status: 'pending'
      }));

      files = [...files, ...newUploadedFiles];
      dispatch('drop', validFiles);
    }
  }

  function removeFile(id: string) {
    files = files.filter(f => f.id !== id);
    dispatch('remove', id);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getFileIcon(file: File): string {
    const type = file.type;
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📕';
    if (type.includes('spreadsheet') || type.includes('excel')) return '📊';
    if (type.includes('document') || type.includes('word')) return '📝';
    if (type.includes('zip') || type.includes('archive')) return '📦';
    return '📄';
  }
</script>

<div class="space-y-4">
  <!-- Drop Zone -->
  <div
    class="relative border-2 border-dashed rounded-lg p-8 text-center transition-colors"
    class:border-border={!dragOver}
    class:border-primary={dragOver}
    class:bg-primary/5={dragOver}
    class:opacity-50={disabled}
    class:cursor-not-allowed={disabled}
    class:cursor-pointer={!disabled}
    on:dragenter={handleDragEnter}
    on:dragleave={handleDragLeave}
    on:dragover={handleDragOver}
    on:drop={handleDrop}
    role="button"
    tabindex={disabled ? -1 : 0}
    on:click={() => !disabled && document.getElementById('file-input')?.click()}
    on:keypress={(e) => e.key === 'Enter' && !disabled && document.getElementById('file-input')?.click()}
  >
    <input
      id="file-input"
      type="file"
      {accept}
      {multiple}
      {disabled}
      class="hidden"
      on:change={handleFileInput}
    />

    <div class="space-y-3">
      <div class="text-4xl">
        {#if dragOver}
          📥
        {:else}
          📁
        {/if}
      </div>

      <div>
        <p class="text-text">
          {#if dragOver}
            Suelta los archivos aquí
          {:else}
            Arrastra archivos aquí o <span class="text-primary font-medium">haz clic para seleccionar</span>
          {/if}
        </p>
        <p class="text-sm text-text-muted mt-1">
          Máximo {formatSize(maxSize)} por archivo
          {#if maxFiles < Infinity}
            • Hasta {maxFiles} archivos
          {/if}
        </p>
        {#if accept !== '*'}
          <p class="text-xs text-text-disabled mt-1">
            Formatos: {accept}
          </p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Files List -->
  {#if files.length > 0}
    <ul class="space-y-2">
      {#each files as uploadedFile (uploadedFile.id)}
        <li class="flex items-center gap-3 p-3 bg-bg-card border border-border rounded-lg">
          <span class="text-2xl">{getFileIcon(uploadedFile.file)}</span>

          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium truncate">{uploadedFile.file.name}</p>
              <Badge
                variant={
                  uploadedFile.status === 'success' ? 'success' :
                  uploadedFile.status === 'error' ? 'danger' :
                  uploadedFile.status === 'uploading' ? 'warning' : 'default'
                }
                size="sm"
              >
                {uploadedFile.status === 'success' ? 'Completado' :
                 uploadedFile.status === 'error' ? 'Error' :
                 uploadedFile.status === 'uploading' ? 'Subiendo...' : 'Pendiente'}
              </Badge>
            </div>

            <div class="flex items-center gap-2 mt-1">
              <span class="text-xs text-text-muted">{formatSize(uploadedFile.file.size)}</span>

              {#if uploadedFile.status === 'uploading'}
                <div class="flex-1">
                  <Progress value={uploadedFile.progress} size="sm" />
                </div>
              {/if}

              {#if uploadedFile.error}
                <span class="text-xs text-danger">{uploadedFile.error}</span>
              {/if}
            </div>
          </div>

          <button
            type="button"
            class="p-1 text-text-muted hover:text-danger transition-colors"
            on:click={() => removeFile(uploadedFile.id)}
            aria-label="Eliminar archivo"
          >
            ✕
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
