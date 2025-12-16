<script lang="ts">
  /**
   * SystemBar - Barra lateral de sistema (flotante)
   *
   * Zona: system-bar
   * Paneles: history, credentials
   *
   * Features:
   * - Flotante sobre el contenido
   * - Semi-transparente
   * - Iconos pequeños
   * - Carga lazy de componentes
   */

  import { openPanel } from '$lib/ui-core';
  import { Button } from '$lib/components/base';
  import { getPanelsByZone } from '$lib/modules/panels';

  // Obtener paneles de system-bar desde metadata
  $: systemPanels = getPanelsByZone('system-bar');

  function handlePanelClick(panelId: string) {
    openPanel(panelId);
  }
</script>

<div class="system-bar">
  {#each systemPanels as panel (panel.id)}
    <Button
      icon={panel.icon}
      size="sm"
      on:click={() => handlePanelClick(panel.id)}
      title={panel.title}
    />
  {/each}
</div>

<style>
  .system-bar {
    position: fixed;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.375rem;
    background: var(--color-system-bar-bg, rgba(0, 0, 0, 0.6));
    border-radius: 0.5rem;
    backdrop-filter: blur(8px);
    z-index: 100;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .system-bar:hover {
    opacity: 1;
  }
</style>
