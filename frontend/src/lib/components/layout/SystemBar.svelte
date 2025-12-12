<script lang="ts">
  /**
   * SystemBar - Barra lateral de sistema (flotante)
   *
   * Zona: system-bar
   * Módulos: config, notifications, profile, help
   *
   * Features:
   * - Flotante sobre el contenido
   * - Semi-transparente
   * - Iconos pequeños
   * - Siempre visible pero discreta
   */

  import { systemBarModules, appState, openPanel } from '$lib/ui-core';
  import { notificationCount } from '$lib/stores';
  import { Button } from '$lib/components/base';

  function handleModuleClick(action: { type: string; panelId?: string; topic?: string; payload?: Record<string, unknown>; route?: string; handler?: () => void }) {
    if (action.type === 'panel' && action.panelId) {
      openPanel(action.panelId);
    }
  }

  // Default system icons when no modules registered
  const defaultItems = [
    { icon: '⚙️', title: 'Configuración', id: 'config' },
    { icon: '🔔', title: 'Notificaciones', id: 'notifications' },
    { icon: '👤', title: 'Perfil', id: 'profile' },
    { icon: '❓', title: 'Ayuda', id: 'help' }
  ];
</script>

<div class="system-bar">
  {#if $systemBarModules.length > 0}
    {#each $systemBarModules as module (module.manifest.id)}
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
  {:else}
    {#each defaultItems as item (item.id)}
      <Button
        icon={item.icon}
        size="sm"
        badge={item.id === 'notifications' ? ($notificationCount > 0 ? $notificationCount : null) : null}
        disabled
        title={item.title}
      />
    {/each}
  {/if}
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
    z-index: 30;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .system-bar:hover {
    opacity: 1;
  }
</style>
