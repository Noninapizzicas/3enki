<script lang="ts">
  /**
   * WorkBar - Barra superior de módulos de trabajo (plegable)
   *
   * Features:
   * - Se pliega/despliega con toggle
   * - Muestra módulos del workspace activo
   * - Iconos dinámicos por módulo
   */

  import { workBarExpanded, toggleWorkBar } from '$lib/stores';
  import { workBarModules, appState, openPanel } from '$lib/ui-core';
  import { Button } from '$lib/components/base';

  function handleModuleClick(action: { type: string; panelId?: string; topic?: string; payload?: Record<string, unknown>; route?: string; handler?: () => void }) {
    if (action.type === 'panel' && action.panelId) {
      openPanel(action.panelId);
    }
    // Otros tipos de acciones se pueden manejar aquí
  }
</script>

<div class="workbar" class:collapsed={!$workBarExpanded}>
  {#if $workBarExpanded}
    <div class="modules">
      {#each $workBarModules as module (module.manifest.id)}
        {@const icon = module.getIcon ? module.getIcon($appState) : module.manifest.button.icon}
        {@const badge = module.getBadge ? module.getBadge($appState) : null}

        <Button
          {icon}
          label={module.manifest.button.label}
          {badge}
          on:click={() => handleModuleClick(module.manifest.button.action)}
          title={module.manifest.name}
        />
      {/each}

      {#if $workBarModules.length === 0}
        <span class="empty">Sin módulos de trabajo</span>
      {/if}
    </div>
  {/if}

  <button class="toggle" on:click={toggleWorkBar} title={$workBarExpanded ? 'Plegar' : 'Expandir'}>
    {$workBarExpanded ? '▲' : '▼'}
  </button>
</div>

<style>
  .workbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--color-bar-bg, rgba(0, 0, 0, 0.3));
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    min-height: 3rem;
    transition: min-height 0.2s;
  }

  .workbar.collapsed {
    min-height: 2rem;
    padding: 0.25rem 1rem;
  }

  .modules {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .empty {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    font-style: italic;
  }

  .toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-muted, #a3a3a3);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.75rem;
    transition: background-color 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .toggle:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
    color: var(--color-text, #e5e5e5);
  }
</style>
