<script lang="ts">
  /**
   * ChatConfig - Barra de configuración (SIMPLIFICADO)
   *
   * Botones directos sin sistema de módulos
   */

  import type { Writable } from 'svelte/store';
  import { Button } from '$lib/components/base';

  // Recibe el store de panel activo del padre
  export let activePanel: Writable<string | null>;

  // Botones estáticos - orden fijo
  const buttons = [
    { id: 'project-selector', icon: '📁', title: 'Proyecto' },
    { id: 'provider-selector', icon: '🤖', title: 'Provider' },
    { id: 'prompts-manager', icon: '📝', title: 'Prompts' },
    { id: 'credentials-manager', icon: '🔐', title: 'Credenciales' },
    { id: 'history-viewer', icon: '💬', title: 'Historial' }
  ];

  function openPanel(panelId: string) {
    activePanel.set(panelId);
  }
</script>

<div class="chat-config">
  {#each buttons as btn (btn.id)}
    <Button
      icon={btn.icon}
      size="sm"
      on:click={() => openPanel(btn.id)}
      title={btn.title}
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
