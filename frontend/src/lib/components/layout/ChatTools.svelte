<script lang="ts">
  /**
   * ChatTools - Barra de herramientas (SIMPLIFICADO)
   *
   * Botones directos sin sistema de módulos
   */

  import type { Writable } from 'svelte/store';
  import { attachments, removeAttachment } from '$lib/stores';
  import { Button, Chip } from '$lib/components/base';

  // Recibe el store de panel activo del padre
  export let activePanel: Writable<string | null>;

  // Botones estáticos
  const buttons = [
    { id: 'files-browser', icon: '📂', title: 'Archivos' },
    { id: 'code-editor', icon: '📄', title: 'Editor' },
    { id: 'pdf-viewer', icon: '📕', title: 'PDF' }
  ];

  function openPanel(panelId: string) {
    activePanel.set(panelId);
  }

  function handleRemoveAttachment(event: CustomEvent<{ id: string }>) {
    removeAttachment(event.detail.id);
  }
</script>

<div class="chat-tools">
  <div class="tools">
    {#each buttons as btn (btn.id)}
      <Button
        icon={btn.icon}
        size="sm"
        on:click={() => openPanel(btn.id)}
        title={btn.title}
      />
    {/each}
  </div>

  {#if $attachments.length > 0}
    <div class="attachments">
      {#each $attachments as attachment (attachment.id)}
        <Chip
          id={attachment.id}
          name={attachment.name}
          type={attachment.type}
          size={attachment.size}
          on:remove={handleRemoveAttachment}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .chat-tools {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: var(--color-bar-bg, rgba(0, 0, 0, 0.2));
    border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    min-height: 2.5rem;
    flex-wrap: wrap;
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    flex: 1;
  }
</style>
