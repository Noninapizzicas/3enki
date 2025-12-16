<script lang="ts">
  /**
   * ChatConfig - Barra de configuración del chat
   *
   * Zona: chat-config
   * Paneles: provider, prompts
   *
   * Features:
   * - Iconos desde metadata centralizada
   * - Carga lazy de componentes
   */

  import { openPanel } from '$lib/ui-core';
  import { Button } from '$lib/components/base';
  import { getPanelsByZone } from '$lib/modules/panels';

  // Obtener paneles de chat-config desde metadata
  $: configPanels = getPanelsByZone('chat-config');

  function handlePanelClick(panelId: string) {
    openPanel(panelId);
  }
</script>

<div class="chat-config">
  {#each configPanels as panel (panel.id)}
    <Button
      icon={panel.icon}
      size="sm"
      on:click={() => handlePanelClick(panel.id)}
      title={panel.title}
    />
  {/each}
</div>

<style>
  .chat-config {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    background: var(--color-bar-bg, rgba(0, 0, 0, 0.2));
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }
</style>
