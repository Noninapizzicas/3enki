<script lang="ts">
  /**
   * ChatTools - Barra de herramientas del chat
   *
   * Zona: chat-tools
   * Módulos: files, editor, pdf
   *
   * Features:
   * - Botones de herramientas
   * - Chips de adjuntos actuales
   */

  import { chatToolsModules, appState, openPanel } from '$lib/ui-core';
  import { attachments, removeAttachment } from '$lib/stores';
  import { Button, Chip } from '$lib/components/base';

  function handleModuleClick(action: { type: string; panelId?: string; topic?: string; payload?: Record<string, unknown>; route?: string; handler?: () => void }) {
    if (action.type === 'panel' && action.panelId) {
      openPanel(action.panelId);
    }
  }

  function handleRemoveAttachment(event: CustomEvent<{ id: string }>) {
    removeAttachment(event.detail.id);
  }
</script>

<div class="chat-tools">
  <div class="tools">
    {#each $chatToolsModules as module (module.manifest.id)}
      {@const icon = module.getIcon ? module.getIcon($appState) : module.manifest.button.icon}
      {@const badge = module.getBadge ? module.getBadge($appState) : null}

      <Button
        {icon}
        {badge}
        size="sm"
        on:click={() => handleModuleClick(module.manifest.button.action)}
        title={module.manifest.name}
      />
    {/each}

    {#if $chatToolsModules.length === 0}
      <Button icon="📂" size="sm" disabled title="Archivos" />
      <Button icon="📄" size="sm" disabled title="Editor" />
      <Button icon="📕" size="sm" disabled title="PDF" />
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
</style>
