<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FloatingToolbar from './FloatingToolbar.svelte';
  import type { ToolbarIconConfig, ActionConfig } from './FloatingToolbar.svelte';

  /**
   * EcosystemToolbar - Barra lateral derecha para ecosistema
   *
   * Siguiendo CONTEXT_UI.md:
   * - Posición: Lado derecho
   * - Dominio: Sistema general, navegación global
   * - Configuración: MÁS ESTABLE (ecosistema común)
   */

  // Props - Iconos por defecto del ecosistema
  export let icons: ToolbarIconConfig[] = [
    {
      id: 'modulos',
      icon: '🧩',
      label: 'Módulos',
      actions: {
        tap: { type: 'panel', target: 'modulos-lista', size: 'medium' },
        longPress: { type: 'modal', target: 'modulos-gestionar', size: 'full' }
      }
    },
    {
      id: 'config',
      icon: '⚙️',
      label: 'Sistema',
      actions: {
        tap: { type: 'panel', target: 'config-rapido', size: 'small' },
        longPress: { type: 'modal', target: 'config-completo', size: 'full' }
      }
    },
    {
      id: 'notificaciones',
      icon: '🔔',
      label: 'Alertas',
      actions: {
        tap: { type: 'panel', target: 'notificaciones-lista', size: 'medium' }
      }
    },
    {
      id: 'usuario',
      icon: '👤',
      label: 'Perfil',
      actions: {
        tap: { type: 'panel', target: 'usuario-menu', size: 'small' },
        longPress: { type: 'modal', target: 'usuario-config', size: 'medium' }
      }
    }
  ];

  export let expanded = false;
  export let notificationCount: number = 0;
  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher<{
    action: {
      type: 'tap' | 'doubleTap' | 'longPress';
      iconId: string;
      action?: ActionConfig;
    };
    navigate: { moduleId: string };
  }>();

  // Actualizar badge de notificaciones
  $: {
    const notifIcon = icons.find(i => i.id === 'notificaciones');
    if (notifIcon && notificationCount > 0) {
      notifIcon.badge = notificationCount > 99 ? '99+' : notificationCount;
    } else if (notifIcon) {
      notifIcon.badge = undefined;
    }
  }

  // Handlers
  function handleTap(event: CustomEvent<{ iconId: string; action?: ActionConfig }>) {
    dispatch('action', {
      type: 'tap',
      iconId: event.detail.iconId,
      action: event.detail.action
    });

    // Navegación especial para módulos
    if (event.detail.iconId === 'modulos' && event.detail.action?.type === 'navigate') {
      dispatch('navigate', { moduleId: event.detail.action.target });
    }
  }

  function handleDoubleTap(event: CustomEvent<{ iconId: string; action?: ActionConfig }>) {
    dispatch('action', {
      type: 'doubleTap',
      iconId: event.detail.iconId,
      action: event.detail.action
    });
  }

  function handleLongPress(event: CustomEvent<{ iconId: string; action?: ActionConfig }>) {
    dispatch('action', {
      type: 'longPress',
      iconId: event.detail.iconId,
      action: event.detail.action
    });
  }
</script>

<FloatingToolbar
  position="right"
  {icons}
  {expanded}
  collapsible={true}
  class="ecosystem-toolbar {className}"
  on:tap={handleTap}
  on:doubleTap={handleDoubleTap}
  on:longPress={handleLongPress}
  on:expand
  on:collapse
/>

<style>
  :global(.ecosystem-toolbar) {
    /* Espacio para safe area en móviles */
    padding-right: env(safe-area-inset-right, 0);
    /* Offset desde la barra superior */
    top: 52px !important;
  }
</style>
