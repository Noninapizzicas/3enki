<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Button from '$components/ui/Button.svelte';

  export let value = '';
  export let placeholder = 'Escribe un mensaje...';
  export let disabled = false;
  export let loading = false;
  export let maxLength = 4000;
  export let showCharCount = false;
  export let attachments: File[] = [];
  export let allowAttachments = true;

  const dispatch = createEventDispatcher<{
    submit: { message: string; attachments: File[] };
    input: string;
  }>();

  let textarea: HTMLTextAreaElement;
  let fileInput: HTMLInputElement;

  function handleSubmit() {
    if (!value.trim() || disabled || loading) return;

    dispatch('submit', {
      message: value.trim(),
      attachments: [...attachments]
    });

    value = '';
    attachments = [];
    adjustHeight();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput() {
    dispatch('input', value);
    adjustHeight();
  }

  function adjustHeight() {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }

  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      attachments = [...attachments, ...Array.from(target.files)];
    }
    target.value = '';
  }

  function removeAttachment(index: number) {
    attachments = attachments.filter((_, i) => i !== index);
  }

  function triggerFileInput() {
    fileInput?.click();
  }
</script>

<div class="bg-bg-card border border-border rounded-lg">
  <!-- Attachments preview -->
  {#if attachments.length > 0}
    <div class="flex flex-wrap gap-2 p-3 border-b border-border">
      {#each attachments as file, index}
        <div class="flex items-center gap-2 px-2 py-1 bg-bg-hover rounded text-sm">
          <span>📎</span>
          <span class="truncate max-w-[150px]">{file.name}</span>
          <button
            type="button"
            class="text-text-muted hover:text-danger"
            on:click={() => removeAttachment(index)}
          >
            ✕
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Input area -->
  <div class="flex items-end gap-2 p-3">
    {#if allowAttachments}
      <input
        bind:this={fileInput}
        type="file"
        multiple
        class="hidden"
        on:change={handleFileSelect}
      />
      <Button
        variant="ghost"
        size="sm"
        {disabled}
        on:click={triggerFileInput}
        aria-label="Adjuntar archivo"
      >
        📎
      </Button>
    {/if}

    <div class="flex-1 relative">
      <textarea
        bind:this={textarea}
        bind:value
        {placeholder}
        {disabled}
        maxlength={maxLength}
        rows="1"
        class="w-full bg-transparent border-0 resize-none focus:ring-0 focus:outline-none text-text placeholder:text-text-muted"
        style="min-height: 24px; max-height: 200px"
        on:input={handleInput}
        on:keydown={handleKeydown}
      />
    </div>

    <Button
      variant="primary"
      size="sm"
      disabled={!value.trim() || disabled}
      {loading}
      on:click={handleSubmit}
      aria-label="Enviar mensaje"
    >
      {#if loading}
        ⏳
      {:else}
        ➤
      {/if}
    </Button>
  </div>

  <!-- Character count -->
  {#if showCharCount}
    <div class="px-3 pb-2 text-xs text-text-muted text-right">
      {value.length}/{maxLength}
    </div>
  {/if}
</div>
