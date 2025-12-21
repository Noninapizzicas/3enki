<script lang="ts">
  /**
   * ChatTools - Barra de herramientas del chat
   *
   * Zona: chat-tools
   * Módulos: files (unificado: explorador + editor + pdf + imágenes)
   *
   * Features:
   * - Botones de herramientas desde panels.ts
   * - Chips de adjuntos actuales
   */

  import { openPanel } from '$lib/ui-core';
  import { attachments, removeAttachment } from '$lib/stores';
  import { Button, Chip } from '$lib/components/base';
  import { getPanelsByZone } from '$lib/modules/panels';

  // Obtener paneles de chat-tools desde metadata
  $: toolPanels = getPanelsByZone('chat-tools');

  function handlePanelClick(panelId: string) {
    openPanel(panelId);
  }

  function handleRemoveAttachment(event: CustomEvent<{ id: string }>) {
    removeAttachment(event.detail.id);
  }
</script>

<div class="chat-tools">
  <div class="tools">
    {#each toolPanels as panel (panel.id)}
      <Button
        icon={panel.icon}
        size="sm"
        on:click={() => handlePanelClick(panel.id)}
        title={panel.title}
      />
    {/each}

    {#if toolPanels.length === 0}
      <span class="empty">Sin herramientas</span>
    {/if}
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

  .empty {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    font-style: italic;
  }
</style>
