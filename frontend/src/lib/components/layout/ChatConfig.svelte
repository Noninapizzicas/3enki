<script lang="ts">
  /**
   * ChatConfig - Barra de configuración del chat
   *
   * Zona: chat-config
   * Módulos: project, provider, prompts, credentials, history
   *
   * Features:
   * - Iconos dinámicos según estado (color proyecto, icono provider, etc.)
   * - Badges para contadores/estados
   */

  import { chatConfigModules, appState, openPanel } from '$lib/ui-core';
  import { Button } from '$lib/components/base';

  function handleModuleClick(action: { type: string; panelId?: string; topic?: string; payload?: Record<string, unknown>; route?: string; handler?: () => void }) {
    if (action.type === 'panel' && action.panelId) {
      openPanel(action.panelId);
    }
  }
</script>

<div class="chat-config">
  {#each $chatConfigModules as module (module.manifest.id)}
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

  {#if $chatConfigModules.length === 0}
    <span class="placeholder">
      <Button icon="🟢" size="sm" disabled title="Proyecto" />
      <Button icon="🤖" size="sm" disabled title="Provider" />
      <Button icon="📝" size="sm" disabled title="Prompts" />
      <Button icon="🔐" size="sm" disabled title="Credenciales" />
      <Button icon="💬" size="sm" disabled title="Historial" />
    </span>
  {/if}
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

  .placeholder {
    display: contents;
  }
</style>
